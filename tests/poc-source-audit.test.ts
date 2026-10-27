import { addEvidenceClaim, storeEvidenceSource } from '../src/domain/analysis/evidence-intake';
import { saveQuestionAnswer } from '../src/domain/assets';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { captureSource, inspectClaim, inspectSource, isVerifiedClaim, revalidateEvidence, snapshotHash } from '../src/domain/analysis/source-audit';
import { fingerprint } from '../src/domain/text';
import { newProject, type Source } from '../src/domain/schema';
import { verifyClaim } from '../src/domain/workflow';
import { buildStrategy } from '../src/domain/analysis/strategy';
import { hasUsableEvidence } from '../src/domain/insight';
import { loadProject, saveProject } from '../src/data/repository';
import 'fake-indexeddb/auto';

// Synthetic test data, not a consumer observation or product-performance proof.
export function evidenceProject() {
  const p = newProject({ name: '가상 의자 A', kind: 'product', model: 'A-1', description: '', officialUrl: '',
    objective: 'feature', audience: '', audienceUndecided: true, selectedChannels: ['blog'], mode: 'manual' });
  const body = '가상 의자 A A-1은 기존 무빙형 대비 부피를 9% 줄였다.';
  const raw: Source = { id: 's', projectId: p.id, title: '허구 원문', url: 'https://example.test/evidence?prdno=1&optno=9',
    body, excerpt: body, hash: fingerprint(body), origin: 'direct_input', retrieval: 'partial', sourceType: 'user',
    collectedAt: p.createdAt, publishedAt: null, publicationAllowed: true, externalAiAllowed: true };
  const source = captureSource(raw, { method: 'manual_excerpt', locator: '첫 단락. 나머지 미수집', coverage: 'excerpt',
    modelScope: ['가상 의자 A A-1'], conditionScope: ['기존 무빙형 대비 부피'], interest: '허구 시험' });
  return { ...p, sources: [source], claims: [{ id: 'c', projectId: p.id, sourceId: 's',
    statement: '가상 의자 A A-1 부피 9% 감소', quote: body, subject: '가상 의자 A A-1', conditions: '기존 무빙형 대비 부피',
    status: 'unreviewed' as const, target: 'own' as const, reviewedBy: null }] };
}
const note = '원문이 부피 9% 감소 발표를 지지합니다. 바닥 면적·착좌 품질·독립 시험 결과로 확대하지 않습니다.';

describe('PoC 1단계 승인 경로', () => {
  it('SHA-256을 WebCrypto 및 Node 기준값과 대조한다', async () => {
    for (const text of ['', 'abc', '한글\n원문 9%']) {
      expect(snapshotHash(text)).toBe('sha256:' + createHash('sha256').update(text).digest('hex'));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      expect(snapshotHash(text)).toBe('sha256:' + Buffer.from(digest).toString('hex'));
    }
  });
  it('자동 대조 일치만으로 승인하지 않고 별도 의미 검토를 요구한다', () => {
    const p = evidenceProject();
    expect(inspectClaim(p, p.claims[0]).state).toBe('needs_semantic_review');
    expect(() => verifyClaim(p, 'c')).toThrow('의미');
    expect(isVerifiedClaim(verifyClaim(p, 'c', note), verifyClaim(p, 'c', note).claims[0])).toBe(true);
  });
  for (const failure of ['fnv', 'snapshot', 'failed', 'number', 'unit', 'model', 'conditions', 'legacy'] as const) {
    it(failure + ': 승인·확정 근거·분석·재열기 경로에서 차단한다', async () => {
      const p = evidenceProject();
      if (failure === 'fnv') p.sources[0].hash = 'fnv1a:changed';
      if (failure === 'snapshot') { p.sources[0].body += ' 변조'; p.sources[0].hash = fingerprint(p.sources[0].body); }
      if (failure === 'failed') p.sources[0].retrieval = 'failed';
      if (failure === 'number') p.claims[0].statement = '가상 의자 A A-1 부피 19% 감소';
      if (failure === 'unit') p.claims[0].statement = '가상 의자 A A-1 높이 9cm 감소';
      if (failure === 'model') p.claims[0].subject = '가상 의자 A A-2';
      if (failure === 'conditions') p.claims[0].conditions = '';
      if (failure === 'legacy') p.sources[0].snapshots = undefined;
      expect(() => verifyClaim(p, 'c', note)).toThrow();
      // A forged/stale status must not bypass the gate, including without a repository read.
      const stale = { ...p, claims: [{ ...p.claims[0], status: 'supported' as const }] };
      expect(buildStrategy(stale).eligible).toHaveLength(0);
      expect(hasUsableEvidence(stale)).toBe(false);
      stale.questions = [{ id: 'q', text: '시험 질문', provenance: 'hypothesis', sourceIds: ['s'] }];
      expect(() => saveQuestionAnswer(stale, 'q', '확정 답변으로 사용 시도', ['c'])).toThrow('근거');
      const saved = await saveProject(stale, null);
      const reopened = (await loadProject(saved.id))!;
      expect(reopened.claims[0].status).toBe('insufficient');
      expect(reopened.claims[0].evidenceHold?.reasons.length).toBeGreaterThan(0);
      expect(reopened.sources[0].body).toBe(p.sources[0].body);
      expect(buildStrategy(reopened).eligible).toHaveLength(0);
      expect(() => verifyClaim(reopened, 'c', note)).toThrow();
    });
  }
  it('정상 승인 후 저장·복원과 원문·주장 변경 시 무효화를 검증한다', async () => {
    const p = verifyClaim(evidenceProject(), 'c', note);
    const saved = await saveProject(p, null); const opened = (await loadProject(saved.id))!;
    expect(isVerifiedClaim(opened, opened.claims[0])).toBe(true);
    expect(opened.sources[0].snapshots).toEqual(p.sources[0].snapshots);
    const changed = { ...opened, claims: [{ ...opened.claims[0], statement: '가상 의자 A A-1 부피 19% 감소' }] };
    expect(revalidateEvidence(changed).claims[0].status).toBe('insufficient');
    expect(inspectSource({ ...opened.sources[0], origin: 'external_response' }, p.claims[0].quote).state).toBe('hold');
  });
  it('단위 생략·미지원 단위·모델 접두어와 스냅샷 메타데이터 변경을 보류한다', () => {
    for (const statement of ['가상 의자 A A-1 부피 9 감소', '가상 의자 A A-1 높이 9m 감소', '가상 의자 A A-1 부피 9퍼센트 감소']) {
      const p = evidenceProject(); p.claims[0].statement = statement;
      expect(() => verifyClaim(p, 'c', note)).toThrow();
    }
    const noLocalModel = evidenceProject();
    noLocalModel.claims[0].quote = '기존 무빙형 대비 부피를 9% 줄였다.';
    expect(() => verifyClaim(noLocalModel, 'c', note)).toThrow('인용 구간');
    const p = verifyClaim(evidenceProject(), 'c', note);
    p.sources[0].snapshots![0].locator = '바뀐 범위';
    expect(isVerifiedClaim(p, p.claims[0])).toBe(false);
    const q = evidenceProject(); q.claims[0].subject = '가상 의자 A A-10';
    q.sources[0].body += ' 가상 의자 A A-10'; q.sources[0].hash = fingerprint(q.sources[0].body);
    q.sources[0] = captureSource(q.sources[0], { ...q.sources[0].snapshots![0], modelScope: [q.claims[0].subject] });
    expect(() => verifyClaim(q, 'c', note)).toThrow('현재 모델');
  });
  it('외부 AI 후보는 원문·보류 사유와 미검증 상태를 유지한다', () => {
    const p = evidenceProject(); p.sources[0].origin = 'external_response';
    const q = revalidateEvidence(p);
    expect(q.claims[0].status).toBe('unreviewed');
    expect(q.claims[0].evidenceHold?.reasons.length).toBeGreaterThan(0);
    expect(buildStrategy(q).eligible).toHaveLength(0);
  });
  it('이미 보류된 근거에 연결된 과거 답변 승인도 재검증한다', () => {
    const p = evidenceProject(); p.claims[0].status = 'unreviewed'; p.sources[0].retrieval = 'failed';
    p.questions = [{ id: 'q', text: '허구 질문', provenance: 'hypothesis', sourceIds: ['s'] }];
    const raw = { ...p, answerPlans: [{ id: 'a', questionId: 'q', directAnswer: '잘못된 확정 답변', applicableModel: 'A-1',
      alternatives: [], selectionReason: '', limitations: '', contentGap: '', claimIds: ['c'], comparisonIds: [], channels: [], reviewStatus: 'reviewed' as const }] };
    expect(revalidateEvidence(raw).answerPlans[0].reviewStatus).toBe('proposed');
  });
  it('수집 경로는 권한과 이전 스냅샷을 보존하고 다른 제품 주장은 범위 미확정으로 둔다', () => {
    const p = evidenceProject();
    const source = p.sources[0];
    const saved = storeEvidenceSource(p, source, source.snapshots![0]);
    expect(saved.sources[0].snapshots).toHaveLength(2);
    expect(saved.sources[0].publicationAllowed).toBe(source.publicationAllowed);
    expect(saved.sources[0].externalAiAllowed).toBe(source.externalAiAllowed);
    const proposed = addEvidenceClaim(saved, source.id, { statement: '다른 제품 주장', quote: source.body, subject: '다른 제품', conditions: '' });
    expect(proposed.claims.at(-1)?.target).toBe('unresolved');
    expect(proposed.claims.at(-1)?.evidenceHold?.reasons).toContain('이 주장의 제품 범위를 아직 확정하지 않았습니다.');
  });
  it('새 스냅샷이 이전 기록을 보존하고 이전 승인을 무효화한다', () => {
    const p = verifyClaim(evidenceProject(), 'c', note);
    p.sources[0] = captureSource(p.sources[0], p.sources[0].snapshots![0]);
    expect(p.sources[0].snapshots).toHaveLength(2);
    expect(isVerifiedClaim(p, p.claims[0])).toBe(false);
  });
  for (const field of ['sourceType', 'publisher', 'title', 'origin', 'fileName', 'duplicateGroupId'] as const) {
    it(field + ': 본문이 같아도 출처 신뢰도 메타데이터 변경은 승인·분석·재열기에서 보류한다', async () => {
      const p = verifyClaim(evidenceProject(), 'c', note);
      const source = p.sources[0];
      const originalSnapshot = structuredClone(source.snapshots![0]);
      if (field === 'sourceType') source.sourceType = 'official';
      if (field === 'publisher') source.publisher = '변경된 발행자';
      if (field === 'title') source.title = '변경된 자료 이름';
      if (field === 'origin') source.origin = 'fetched';
      if (field === 'fileName') source.fileName = 'different-file.txt';
      if (field === 'duplicateGroupId') source.duplicateGroupId = 'changed-group';
      expect(source.hash).toBe(fingerprint(source.body));
      expect(snapshotHash(source.body)).toBe(originalSnapshot.sha256);
      expect(inspectSource(source, p.claims[0].quote).reasons).toContain('출처 분류·발행자 등 메타데이터가 수집 기록과 다릅니다. 원출처와 재대조해 주세요.');
      expect(isVerifiedClaim(p, p.claims[0])).toBe(false);
      expect(() => verifyClaim(p, 'c', note)).toThrow('메타데이터');
      expect(buildStrategy(p).eligible).toHaveLength(0);
      expect(hasUsableEvidence(p)).toBe(false);
      p.questions = [{ id: 'q', text: '허구 질문', provenance: 'hypothesis', sourceIds: ['s'] }];
      expect(() => saveQuestionAnswer(p, 'q', '확정 답변으로 사용 시도', ['c'])).toThrow('근거');
      const opened = (await loadProject((await saveProject(p, null)).id))!;
      expect(opened.claims[0].status).toBe('insufficient');
      expect(opened.claims[0].evidenceHold?.previousStatus).toBe('supported');
      expect(opened.sources[0].snapshots![0]).toEqual(originalSnapshot);
      expect(opened.claims[0].review).toEqual(p.claims[0].review);
      expect(() => verifyClaim(opened, 'c', note)).toThrow('메타데이터');
    });
  }
  it('발행자 기록 동시 변경도 이전 의미 검토를 재사용하지 못하며 새 수집·검토가 필요하다', async () => {
    const p = verifyClaim(evidenceProject(), 'c', note);
    p.sources[0].publisher = '다른 발행자';
    p.sources[0].snapshots![0].sourceMetadata!.publisher = '다른 발행자';
    expect(inspectClaim(p, p.claims[0]).state).toBe('needs_semantic_review');
    expect(isVerifiedClaim(p, p.claims[0])).toBe(false);
    const held = revalidateEvidence(p);
    expect(held.claims[0].status).toBe('insufficient');
    // Explicit source reinspection creates a new snapshot; no automatic approval.
    held.sources[0] = captureSource(held.sources[0], held.sources[0].snapshots![0]);
    expect(held.sources[0].snapshots).toHaveLength(2);
    expect(isVerifiedClaim(held, held.claims[0])).toBe(false);
    const verified = verifyClaim(held, 'c', note);
    const opened = (await loadProject((await saveProject(verified, null)).id))!;
    expect(isVerifiedClaim(opened, opened.claims[0])).toBe(true);
  });
  it('출처 메타데이터 없는 이전 백업은 삭제·자동 보정하지 않고 재대조 전까지 보류한다', async () => {
    const p = verifyClaim(evidenceProject(), 'c', note);
    delete p.sources[0].snapshots![0].sourceMetadata;
    expect(() => verifyClaim(p, 'c', note)).toThrow('발행자 수집 기록');
    const opened = (await loadProject((await saveProject(p, null)).id))!;
    expect(opened.claims[0].status).toBe('insufficient');
    expect(opened.sources[0].body).toBe(p.sources[0].body);
    expect(opened.sources[0].snapshots![0].sourceMetadata).toBeUndefined();
    expect(buildStrategy(opened).eligible).toHaveLength(0);
  });
});
