import { openDB, type IDBPDatabase } from 'idb';
import { assertProjectRelations, projectSchema, type Project } from '@/domain/schema';
import { convertLegacy } from './legacy';

const DB_NAME = 'alc-projects-v2';
const LEGACY_KEY = 'origin-mvp-store';
let dbPromise: Promise<IDBPDatabase> | null = null;

function database(): Promise<IDBPDatabase> {
  if (!dbPromise) dbPromise = openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('metadata');
    },
  });
  return dbPromise;
}

export class RevisionConflict extends Error {
  constructor() { super('다른 창에서 이 작업을 수정했습니다. 새로고침 전에 현재 내용을 복사해 보관해 주세요.'); }
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
  const tx = db.transaction('projects', 'readwrite');
  const current = await tx.store.get(valid.id) as Project | undefined;
  if ((current?.revision ?? null) !== expectedRevision) {
    tx.abort();
    void tx.done.catch(() => undefined);
    throw new RevisionConflict();
  }
  const next = projectSchema.parse({ ...valid, revision: (current?.revision ?? 0) + 1, updatedAt: new Date().toISOString() });
  await tx.store.put(next);
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
