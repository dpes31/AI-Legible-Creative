import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newProject, type Project } from '../src/domain/schema';
import { addConsumerExcerpt, importConsumerExcerptCorpus, linkConsumerObservation, reviewConsumerRowPermissions } from '../src/domain/consumer-evidence';
import { discoveryEvidenceAssessment, discoveryRowCheck, importQuestionDiscovery, prepareQuestionDiscovery, reviewDiscoveryCandidate } from '../src/domain/analysis/question-discovery';
import { discoveryRunReasons, isAcceptedDiscoveryCandidate, revalidateDiscovery } from '../src/domain/analysis/discovery-integrity';
import { saveProject, loadProject, importBackup } from '../src/data/repository';
import { snapshotHash } from '../src/domain/analysis/evidence-hash';

// All analysis responses in this file are authored test inputs, never real AI discovery.
function setup(text = '가상 의자를 조용한 시간에 사용할 수 있나요?', allowed = true) {
  let p = newProject({ name: '넣지 말아야 할 제품명', kind: 'product', description: '정답 질문과 USP를 넣지 마세요',
    officialUrl: '', objective: 'feature', audience: '사람이 정한 니즈', audienceUndecided: false, selectedChannels: ['blog'], mode: 'manual' });
  p = add(p, text, allowed);
  return p;
}
function add(p: Project, text: string, allowed = true, url = 'https://example.test/posts/1') {
  return addConsumerExcerpt(p, { title: '허구 소비자 자료', url, text, publishedAt: null,
    locator: '허구 시험의 전체 입력', interest: '허구 기능시험', brand: '가상 브랜드', independence: 'unknown', independenceNote: '',
    privacyReviewed: true, privacyNote: '식별정보 없는 허구 기능시험 원문입니다.', externalAiAllowed: allowed, publicationAllowed: false });
}
function prepare(p: Project) {
  return prepareQuestionDiscovery(p, { rowIds: p.consumerObservations.map(r => r.id), provider: '허구 시험 서비스', model: 'synthetic-test-model' });
}
function response(p: Project) {
  const run = p.questionDiscoveryRuns.at(-1)!;
  const row = run.manifest[0];
  const unknown = { text: '', basis: 'unknown' as const, evidenceIndexes: [] };
  return { contract: 'alc.question-discovery.v1', runId: run.id, inputHash: run.inputHash,
    questions: [{ ref: 'Q1', text: row?.text || '허구 탐색 가설', provenance: 'observed',
      evidence: row ? [{ rowId: row.rowId, quote: row.text, start: 0, end: row.text.length, role: 'support' }] : [],
      reason: '이 허구 입력의 문구 존재만 확인합니다.', alternativeInterpretations: ['실제 구매 의도가 아닐 수 있습니다.'],
      context: { situation: unknown, task: unknown, barrier: unknown, expectedOutcome: unknown },
      unmetNeed: 'unknown', decisionImpact: 'unknown', impactReason: '판단할 자료가 부족합니다.' }],
    rowDispositions: run.manifest.map(r => ({ rowId: r.rowId, status: r === row ? 'linked' : 'no_candidate',
      questionRefs: r === row ? ['Q1'] : [], reason: '허구 입력 행의 처리 이유입니다.' })) };
}
const note = '질문 표현과 원문 구간을 대조했습니다. 하나의 허구 사례이며 대표 수요로 해석하지 않습니다.';
function accepted(p = prepare(setup())) {
  const run = p.questionDiscoveryRuns.at(-1)!;
  p = importQuestionDiscovery(p, run.id, JSON.stringify(response(p)));
  return reviewDiscoveryCandidate(p, p.questionCandidates[0].id, 'accepted', note);
}

describe('소비자 전용 발견과 실행 기록', () => {
  it('허구 발췌 12건은 질문 결론 없이 가져오며 한 행 동의가 다른 행에 퍼지지 않는다', async () => {
    const raw = readFileSync('tests/fixtures/poc/synthetic-consumers.json', 'utf8');
    const empty = newProject({ name: '검수용 프로젝트', kind: 'product', description: '', officialUrl: '', objective: 'feature',
      audience: '', audienceUndecided: true, selectedChannels: ['blog'], mode: 'manual' });
    let p = importConsumerExcerptCorpus(empty, raw);
    expect(p.sources).toHaveLength(12); expect(p.consumerObservations).toHaveLength(12);
    expect(p.questionCandidates).toHaveLength(0); expect(p.questions).toHaveLength(0);
    expect(importConsumerExcerptCorpus(p, raw).sources).toHaveLength(12);
    expect(p.consumerObservations.every(r => !discoveryRowCheck(p, r.id).manifest)).toBe(true);
    const row = p.consumerObservations[0];
    p = reviewConsumerRowPermissions(p, row.id, { externalAiAllowed: true, publicationAllowed: false,
      privacyReviewed: true, privacyNote: '사용자 동작 시뮬레이션이며 실제 법적 이용 동의가 아닙니다.',
      independence: 'unknown', independenceNote: '', brand: '' });
    expect(discoveryRowCheck(p, row.id).manifest?.text).toBe(row.text);
    expect(p.consumerObservations.slice(1).every(r => !discoveryRowCheck(p, r.id).manifest)).toBe(true);
    p = prepare(p);
    const run = p.questionDiscoveryRuns[0];
    expect(run.manifest).toHaveLength(1); expect(run.excluded).toHaveLength(11);
    expect(run.manifest[0].audit).toContain('permissionReview');
    const saved = await saveProject(p, null), opened = (await loadProject(saved.id))!;
    expect(discoveryRunReasons(opened, opened.questionDiscoveryRuns[0])).toEqual([]);
    // Corpus assertions test ingestion and rights, never AI-derived consumer insight.
  });
  it('원본에서 범위를 넘는 입력은 자르지 않고 거절한다', () => {
    let p = setup('가'.repeat(5000));
    for (let i = 1; i < 10; i++) p = add(p, '나'.repeat(5000), true, `https://example.test/posts/${i + 1}`);
    expect(() => prepare(p)).toThrow('45,000');
  });
  it('제품·목적·사전 질문·사람 니즈를 입력하지 않고 행과 모델·요청문을 동결한다', () => {
    const p = prepare(setup()); const run = p.questionDiscoveryRuns[0];
    expect(run.prompt).not.toContain(p.name); expect(run.prompt).not.toContain(p.description); expect(run.prompt).not.toContain(p.audience);
    expect(run.inputHash).toBe(snapshotHash(run.input)); expect(run.promptHash).toBe(snapshotHash(run.prompt));
    expect(discoveryRunReasons(p, run)).toEqual([]);
  });
  it('권한 미확인 원문과 rawRecord 식별 열을 외부 입력에 넣지 않는다', () => {
    let p = setup('비공개 허구 원문', false); p = add(p, '공개 허구 질문?', true, 'https://example.test/posts/2');
    p.consumerObservations[1].rawRecord.secret = '전송하면 안 되는 별도 열';
    const row = p.consumerObservations[1]; p = linkConsumerObservation(p, row.id, row.evidenceLink!.sourceId, row.evidenceLink!);
    p = prepare(p); const run = p.questionDiscoveryRuns[0];
    expect(run.input).not.toContain('비공개 허구'); expect(run.prompt).not.toContain('전송하면 안');
    expect(run.manifest).toHaveLength(1); expect(run.excluded).toHaveLength(1);
  });
  it('모든 자료가 제외돼도 실행과 사유를 보존하며 가설을 승인하지 못한다', () => {
    let p = prepare(setup('비공개', false)); const run = p.questionDiscoveryRuns[0];
    expect(run.status).toBe('held'); expect(run.prompt).toBe('');
    const raw = response(p); raw.questions[0].provenance = 'hypothesis';
    p = importQuestionDiscovery(p, run.id, JSON.stringify(raw));
    expect(p.questionCandidates).toHaveLength(0); expect(p.questionDiscoveryRuns[0].attempts[0].errors.join()).toContain('소비자 원문');
  });
  it('빈 응답·오류·중단·거절 원본은 재열기에도 보존하며 중복 반영하지 않는다', async () => {
    let p = prepare(setup()); const id = p.questionDiscoveryRuns[0].id;
    const originals = ['', '중단된 {', '{"알수없음":true}', '허구 서비스 거절: INPUT_DECLINED'];
    for (const raw of originals) p = importQuestionDiscovery(p, id, raw);
    expect(p.questionDiscoveryRuns[0].attempts.map(a => a.raw)).toEqual(originals); expect(p.questionCandidates).toHaveLength(0);
    p = importQuestionDiscovery(p, id, '중단된 {'); expect(p.questionDiscoveryRuns[0].attempts).toHaveLength(4);
    const saved = await saveProject(p, null), reopened = (await loadProject(saved.id))!;
    expect(reopened.questionDiscoveryRuns[0].attempts.map(a => a.raw)).toEqual(originals);
  });
  for (const problem of ['offset', 'unknown_row', 'observed_rewrite', 'unmet', 'context', 'conflict'] as const) {
    it(problem + ': 출처 ID만으로 질문 해석을 승인하지 않는다', () => {
      let p = prepare(setup()); const raw = response(p), q = raw.questions[0];
      if (problem === 'offset') q.evidence[0].start = 1;
      if (problem === 'unknown_row') q.evidence[0].rowId = 'not-provided';
      if (problem === 'observed_rewrite') q.text = '사람이 다시 쓴 다른 질문?';
      if (problem === 'unmet') q.unmetNeed = 'explicit_barrier';
      if (problem === 'context') q.context.task = { text: '없는 과업을 확정', basis: 'unknown', evidenceIndexes: [] };
      if (problem === 'conflict') q.unmetNeed = 'conflicting';
      p = importQuestionDiscovery(p, raw.runId, JSON.stringify(raw));
      expect(() => reviewDiscoveryCandidate(p, p.questionCandidates[0]?.id || '', 'accepted', note)).toThrow();
      expect(p.questionCandidates.every(c => !isAcceptedDiscoveryCandidate(p, c))).toBe(true);
    });
  }
  for (const problem of ['missing_disposition', 'wrong_ref', 'wrong_run', 'wrong_hash', 'duplicate_ref'] as const) {
    it(problem + ': 누락·다른 실행 응답을 보존하고 결과 반영은 막는다', () => {
      let p = prepare(setup()); const raw = response(p), id = raw.runId;
      if (problem === 'missing_disposition') raw.rowDispositions = [];
      if (problem === 'wrong_ref') raw.rowDispositions[0].questionRefs = ['Q2'];
      if (problem === 'wrong_run') raw.runId = 'wrong-run';
      if (problem === 'wrong_hash') raw.inputHash = snapshotHash('wrong');
      if (problem === 'duplicate_ref') raw.questions.push(raw.questions[0]);
      p = importQuestionDiscovery(p, id, JSON.stringify(raw));
      expect(p.questionCandidates).toHaveLength(0); expect(p.questionDiscoveryRuns[0].attempts[0].raw).toBe(JSON.stringify(raw));
    });
  }
  it('관심 원문은 재구성·대안 해석으로 다루고 빈 질문 결과도 허용한다', () => {
    let p = prepare(setup('가상 의자에서 잠깐 쉬고 싶어요.')); const raw = response(p);
    raw.questions[0].provenance = 'reconstructed'; raw.questions[0].text = '휴식 때 사용할 수 있을까요?';
    p = importQuestionDiscovery(p, raw.runId, JSON.stringify(raw));
    expect(p.questionCandidates[0].status).toBe('review_required');
    const none = { ...raw, questions: [], rowDispositions: raw.rowDispositions.map(r => ({ ...r, status: 'no_candidate', questionRefs: [], reason: '질문을 만들 맥락이 부족합니다.' })) };
    p = importQuestionDiscovery(p, raw.runId, JSON.stringify(none));
    expect(p.questionDiscoveryRuns[0].attempts[1].status).toBe('review_required');
    expect(p.researchInsights.unmetNeeds).toHaveLength(0);
  });
  it('서로 다른 URL의 동일 발췌와 같은 스레드를 독립 사건으로 합산하지 않는다', () => {
    let p = setup(); p = add(p, p.consumerObservations[0].text!, true, 'https://example.test/posts/2');
    p = prepare(p); const raw = response(p); raw.questions[0].evidence.push({ rowId: p.questionDiscoveryRuns[0].manifest[1].rowId,
      quote: p.consumerObservations[1].text!, start: 0, end: p.consumerObservations[1].text!.length, role: 'support' });
    raw.rowDispositions[1] = { ...raw.rowDispositions[1], status: 'linked', questionRefs: ['Q1'] };
    p = importQuestionDiscovery(p, raw.runId, JSON.stringify(raw));
    expect(discoveryEvidenceAssessment(p, p.questionCandidates[0]).incidentCount).toBe(1);
  });
  for (const mutation of ['sourceType', 'publisher', 'rights', 'row', 'snapshot', 'prompt', 'model', 'manifest', 'response', 'candidate', 'duplicate_row', 'duplicate_source'] as const) {
    it(mutation + ': 수용 후 변경은 분석 사용·저장·재열기에서 보류하고 원본을 남긴다', async () => {
      const p = accepted(); const run = p.questionDiscoveryRuns[0], c = p.questionCandidates[0];
      expect(isAcceptedDiscoveryCandidate(p, c)).toBe(true);
      if (mutation === 'sourceType') p.sources[0].sourceType = 'official';
      if (mutation === 'publisher') p.sources[0].publisher = '다른 발행자';
      if (mutation === 'rights') p.consumerDatasets[0].externalAiAllowed = false;
      if (mutation === 'row') p.consumerObservations[0].text += ' 변경';
      if (mutation === 'snapshot') p.sources[0].snapshots![0].locator = '다른 구간';
      if (mutation === 'prompt') run.prompt += ' 변경';
      if (mutation === 'model') run.model = '바뀐 모델';
      if (mutation === 'manifest') run.manifest[0].independence = 'declared';
      if (mutation === 'response') run.attempts[0].raw += ' 변경';
      if (mutation === 'candidate') c.reason = '변경한 해석';
      if (mutation === 'duplicate_row') p.consumerObservations.push(p.consumerObservations[0]);
      if (mutation === 'duplicate_source') p.sources.push(p.sources[0]);
      expect(isAcceptedDiscoveryCandidate(p, c)).toBe(false);
      if (mutation === 'duplicate_row' || mutation === 'duplicate_source') {
        expect(revalidateDiscovery(p).questionCandidates[0].status).toBe('stale');
        await expect(saveProject(p, null)).rejects.toThrow('중복');
        return;
      }
      const saved = await saveProject(p, null), opened = (await loadProject(saved.id))!;
      expect(opened.questionCandidates[0].status).toBe('stale');
      expect(opened.questionDiscoveryRuns[0].attempts[0].raw).toBe(run.attempts[0].raw);
      expect(opened.questionCandidates[0].review?.note).toBe(note);
      expect(() => reviewDiscoveryCandidate(opened, c.id, 'accepted', note)).toThrow();
    });
  }
  it('기각 기록은 상태값만 accepted로 바꿔도 수용 기록이 되지 않는다', () => {
    let p = accepted(); p = reviewDiscoveryCandidate(p, p.questionCandidates[0].id, 'rejected', note);
    expect(p.questionCandidates[0].reviewHistory[0].decision).toBe('accepted');
    p.questionCandidates[0].status = 'accepted';
    expect(isAcceptedDiscoveryCandidate(p, p.questionCandidates[0])).toBe(false);
    expect(revalidateDiscovery(p).questionCandidates[0].status).toBe('stale');
  });
  it('다른 프로젝트 행과 중복 행은 도메인에서 외부 입력을 만들지 않는다', () => {
    const p = setup(); p.consumerObservations[0].projectId = 'foreign';
    expect(prepare(p).questionDiscoveryRuns[0].manifest).toHaveLength(0);
    const q = setup(); q.consumerObservations.push(q.consumerObservations[0]);
    expect(discoveryRowCheck(q, q.consumerObservations[0].id).reasons.join()).toContain('중복');
  });
  it('정상 수용은 저장·새 백업 복원에 유지하고 작성 질문 배열로 자동 전달하지 않는다', async () => {
    const p = accepted(), saved = await saveProject(p, null), opened = (await loadProject(saved.id))!;
    expect(isAcceptedDiscoveryCandidate(opened, opened.questionCandidates[0])).toBe(true);
    const copy = structuredClone(saved); copy.id = crypto.randomUUID();
    copy.sources.forEach(s => { s.projectId = copy.id; }); copy.consumerDatasets.forEach(d => { d.projectId = copy.id; }); copy.consumerObservations.forEach(r => { r.projectId = copy.id; });
    // A different project cannot retain another project's accepted discovery runs.
    const restored = await importBackup(JSON.stringify(copy));
    expect(restored.questionCandidates[0].status).toBe('stale');
    expect(opened.questions).toHaveLength(0); expect(opened.questionDiscoveryRuns[0].attempts).toHaveLength(1);
  });
  it('역순·해시 순서 기록은 후보에 자동 최우선 순위를 만들지 않는다', () => {
    for (const order of ['forward', 'reverse', 'hash_order'] as const) {
      let p = setup(); p = add(p, '다른 허구 질문?', true, 'https://example.test/posts/2');
      p = prepareQuestionDiscovery(p, { rowIds: p.consumerObservations.map(r => r.id), provider: 'test', model: 'test', order });
      p = accepted(p);
      expect(discoveryEvidenceAssessment(p, p.questionCandidates[0]).priority).toBe('우선순위 보류');
      expect(p.questionDiscoveryRuns[0].order).toBe(order);
    }
  });
  it('의심 개인정보·공식 자료·모델 미확인·수치 초과를 보류한다', () => {
    const p = setup('연락은 010-1234-5678로 주세요');
    expect(discoveryRowCheck(p, p.consumerObservations[0].id).reasons.join()).toContain('식별정보');
    const q = setup(); q.sources[0].sourceType = 'official';
    expect(discoveryRowCheck(q, q.consumerObservations[0].id).reasons.join()).toContain('공식');
    let a = setup(); a = prepareQuestionDiscovery(a, { rowIds: [a.consumerObservations[0].id], provider: '', model: '' });
    const raw = response(a); a = importQuestionDiscovery(a, raw.runId, JSON.stringify(raw));
    expect(a.questionCandidates[0].holdReasons.join()).toContain('모델');
    expect(() => prepareQuestionDiscovery(p, { rowIds: Array(101).fill('x'), provider: '', model: '' })).toThrow();
  });
});
