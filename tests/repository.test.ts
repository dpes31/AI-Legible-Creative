import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { newProject } from '../src/domain/schema';
import { listConflictDrafts, importBackup, importLegacyBackup, loadBriefDraft, loadProject, saveBriefDraft, saveProject } from '../src/data/repository';

describe('브라우저 프로젝트 보존', () => {
  it('입력 초안을 프로젝트와 별도로 저장하고 다른 탭의 오래된 값을 거절한다', async () => {
    const input = { name: '허구 의자', kind: 'product' as const, model: 'A', description: '', officialUrl: '',
      objective: 'feature' as const, audience: '', audienceUndecided: true,
      selectedChannels: ['blog' as const], mode: 'manual' as const };
    const saved = await saveBriefDraft({ key: 'new', draftId: crypto.randomUUID(), projectId: null,
      revision: 0, updatedAt: new Date().toISOString(), input }, null);
    const changed = await saveBriefDraft({ ...saved, input: { ...input, description: '새 입력' } }, saved.revision);
    await expect(saveBriefDraft({ ...saved, input: { ...input, description: '오래된 창' } }, saved.revision)).rejects.toThrow('다른 창');
    expect((await loadBriefDraft('new'))?.input.description).toBe('새 입력');
    expect(changed.revision).toBe(saved.revision + 1);
  });
  it('동일 프로젝트를 두 탭에서 수정하면 오래된 revision을 거절하고 저장본을 보존한다', async () => {
    const original = newProject({ name: '가상 브랜드 A', kind: 'brand', description: '', officialUrl: '', objective: 'trust', audience: '', audienceUndecided: true, selectedChannels: ['blog'], mode: 'manual' });
    const saved = await saveProject(original, null);
    const changed = await saveProject({ ...saved, description: '첫 번째 수정' }, saved.revision);
    await expect(saveProject({ ...saved, description: '두 번째 수정' }, saved.revision)).rejects.toThrow('다른 창');
    const conflicts = await listConflictDrafts();
    expect(conflicts.find(draft => draft.project.id === saved.id)?.project.description).toBe('두 번째 수정');
    expect((await loadProject(saved.id))?.description).toBe('첫 번째 수정');
    expect(changed.revision).toBe(2);
    await expect(importBackup(JSON.stringify(changed))).rejects.toThrow();
  });
  it('같은 구버전 원본은 다시 가져오지 않고 원본 자료는 변형하지 않는다', async () => {
    const old = JSON.stringify({ state: { clientName: '허구 시험 원본', phase2Questions: [{ id: 17, question: '질문' }], phase4Facts: [{ id: 21, fact: '사실 미확인', coversQuestions: [17, 999] }] } });
    const imported = await importLegacyBackup(old);
    expect(imported.claims[0].status).toBe('unreviewed');
    expect(imported.migrationNote).toContain('999');
    await expect(importLegacyBackup(old)).rejects.toThrow('이미 가져왔습니다');
    expect(JSON.parse(old).state.clientName).toBe('허구 시험 원본');
  });
});
