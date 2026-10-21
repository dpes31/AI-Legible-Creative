import { openDB, type IDBPDatabase } from 'idb';
import { assertProjectRelations, projectSchema, type Project } from '@/domain/schema';
import { convertLegacy } from './legacy';

const DB_NAME = 'alc-projects-v2';
const LEGACY_KEY = 'origin-mvp-store';
let dbPromise: Promise<IDBPDatabase> | null = null;

function database(): Promise<IDBPDatabase> {
  if (!dbPromise) dbPromise = openDB(DB_NAME, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('metadata');
      }
      if (oldVersion < 2) db.createObjectStore('briefDrafts', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

export type BriefDraft = {
  key: string; draftId: string; projectId: string | null; revision: number; updatedAt: string;
  input: Pick<Project, 'name' | 'kind' | 'model' | 'description' | 'officialUrl' | 'objective' | 'audience' | 'audienceUndecided' | 'selectedChannels' | 'mode'>;
};

export async function loadBriefDraft(key: string): Promise<BriefDraft | null> {
  return (await (await database()).get('briefDrafts', key)) || null;
}

export async function saveBriefDraft(draft: BriefDraft, expectedRevision: number | null): Promise<BriefDraft> {
  const tx = (await database()).transaction(['briefDrafts', 'metadata'], 'readwrite');
  const current = await tx.objectStore('briefDrafts').get(draft.key) as BriefDraft | undefined;
  if ((current?.revision ?? null) !== expectedRevision) {
    const recoveryId = crypto.randomUUID();
    await tx.objectStore('metadata').put({ id: recoveryId, at: new Date().toISOString(), briefDraft: draft }, `brief-conflict:${recoveryId}`);
    await tx.done;
    throw new RevisionConflict(recoveryId);
  }
  const saved = { ...draft, revision: (current?.revision ?? 0) + 1, updatedAt: new Date().toISOString() };
  await tx.objectStore('briefDrafts').put(saved);
  await tx.done;
  return saved;
}

export async function moveBriefDraft(from: string, to: string, projectId: string): Promise<void> {
  const tx = (await database()).transaction('briefDrafts', 'readwrite');
  const draft = await tx.store.get(from) as BriefDraft | undefined;
  if (draft) {
    if (from !== to) await tx.store.delete(from);
    await tx.store.put({ ...draft, key: to, projectId });
  }
  await tx.done;
}

export class RevisionConflict extends Error {
  constructor(readonly recoveryId?: string) { super(recoveryId ? '다른 창에서 수정한 내용과 겹쳤습니다. 이 창의 초안도 별도 보관했습니다. 설정에서 충돌 초안을 확인해 주세요.' : '같은 작업이 이미 있습니다. 기존 작업을 덮어쓰지 않았습니다.'); }
}

export async function listProjects(): Promise<Project[]> {
  const db = await database();
  return (await db.getAll('projects')).map(value => projectSchema.parse(value))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadProject(id: string): Promise<Project | null> {
  const value = await (await database()).get('projects', id);
  return value ? projectSchema.parse(value) : null;
}

export async function saveProject(project: Project, expectedRevision: number | null): Promise<Project> {
  const valid = projectSchema.parse(project);
  assertProjectRelations(valid);
  const db = await database();
  const tx = db.transaction(['projects', 'metadata'], 'readwrite');
  const current = await tx.objectStore('projects').get(valid.id) as Project | undefined;
  if ((current?.revision ?? null) !== expectedRevision) {
    const recoveryId = crypto.randomUUID();
    await tx.objectStore('metadata').put({ id: recoveryId, at: new Date().toISOString(), project: valid }, `conflict:${recoveryId}`);
    await tx.done;
    throw new RevisionConflict(recoveryId);
  }
  const next = projectSchema.parse({ ...valid, revision: (current?.revision ?? 0) + 1, updatedAt: new Date().toISOString() });
  await tx.objectStore('projects').put(next);
  await tx.done;
  return next;
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

export async function migrateLegacy(): Promise<{ status: 'none' | 'already' | 'migrated' | 'needs_backup'; project?: Project }> {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return { status: 'none' };
  const key = `legacy:${await sha256(raw)}`;
  const db = await database();
  if (await db.get('metadata', key)) return { status: 'already' };
  const backupKey = `${LEGACY_KEY}-backup-v2`;
  if (localStorage.getItem(backupKey) !== raw) {
    try { localStorage.setItem(backupKey, raw); }
    catch { return { status: 'needs_backup' }; }
  }
  const project = convertLegacy(raw);
  const tx = db.transaction(['projects', 'metadata'], 'readwrite');
  await tx.objectStore('projects').add({ ...project, revision: 1 });
  await tx.objectStore('metadata').put(project.id, key);
  await tx.done;
  return { status: 'migrated', project: { ...project, revision: 1 } };
}

export async function importBackup(text: string): Promise<Project> {
  const value = projectSchema.parse(JSON.parse(text));
  assertProjectRelations(value);
  const db = await database();
  const existing = await db.get('projects', value.id);
  if (existing) throw new RevisionConflict();
  return saveProject({ ...value, revision: 0 }, null);
}

export async function importLegacyBackup(text: string): Promise<Project> {
  const db = await database();
  const key = `legacy:${await sha256(text)}`;
  if (await db.get('metadata', key)) throw new Error('같은 이전 자료를 이미 가져왔습니다.');
  const project = convertLegacy(text);
  const tx = db.transaction(['projects', 'metadata'], 'readwrite');
  const saved = { ...project, revision: 1 };
  await tx.objectStore('projects').add(saved);
  await tx.objectStore('metadata').put(saved.id, key);
  await tx.done;
  return saved;
}


export type ConflictDraft = { id: string; at: string; project: Project };
export async function listConflictDrafts(): Promise<ConflictDraft[]> {
  const db = await database();
  const tx = db.transaction('metadata');
  const keys = await tx.store.getAllKeys();
  const drafts = await Promise.all(keys.filter(key => String(key).startsWith('conflict:')).map(key => tx.store.get(key) as Promise<ConflictDraft>));
  await tx.done;
  return drafts.sort((a, b) => b.at.localeCompare(a.at));
}
export async function preserveConflictDraft(id: string, project: Project): Promise<void> {
  const valid = projectSchema.parse(project); assertProjectRelations(valid);
  await (await database()).put('metadata', { id, at: new Date().toISOString(), project: valid }, `conflict:${id}`);
}
