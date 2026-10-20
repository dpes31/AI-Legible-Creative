import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { newProject } from '../src/domain/schema';
import { importBackup, importLegacyBackup, loadProject, saveProject } from '../src/data/repository';

describe('브라우저 프로젝트 보존', () => {
  it('동일 프로젝트를 두 탭에서 수정하면 오래된 revision을 거절하고 저장본을 보존한다', async () => {
    const original = newProject({ name: '가상 브랜드 A', kind: 'brand', description: '', officialUrl: '', objective: 'trust', audience: '', audienceUndecided: true, selectedChannels: ['blog'], mode: 'manual' });
    const saved = await saveProject(original, null);
    const changed = await saveProject({ ...saved, description: '첫 번째 수정' }, saved.revision);
    await expect(saveProject({ ...saved, description: '두 번째 수정' }, saved.revision)).rejects.toThrow('다른 창');
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
