import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newProject, type ChannelDocument, type Project } from '../src/domain/schema';
import { EntityMismatch, applyDocumentProposal, importContent, importResearch, prepareContent, prepareResearch, updateDocumentText, validateDocument, verifyClaim } from '../src/domain/workflow';
import { quantities } from '../src/domain/validation/document';
import { buildStrategy, comparisonAssessment } from '../src/domain/analysis/strategy';
import { approveInsight } from '../src/domain/insight';

function base(): Project { return newProject({ name: '허구 검수컵', kind: 'product', description: '시험용 가상 자료', officialUrl: '', objective: 'sales', audience: '', audienceUndecided: true, selectedChannels: ['ad_copy', 'blog'], mode: 'manual' }); }
function grounded() {
  const p = base();
  p.sources = [{ id: 's', projectId: p.id, title: '허구 시험 문서', url: null, excerpt: '실내 시험에서 용량 1L입니다.', body: '실내 시험에서 용량 1L입니다.', sourceType: 'test', retrieval: 'user_provided', origin: 'direct_input', publishedAt: null, collectedAt: p.createdAt, externalAiAllowed: true, publicationAllowed: true, hash: 'h' }];
  p.claims = [{ id: 'c', projectId: p.id, statement: '용량 1L', quote: '실내 시험에서 용량 1L입니다.', conditions: '실내 시험', subject: p.name, sourceId: 's', status: 'supported', reviewedBy: 'human' }];
  return p;
}
function doc(p: Project, text: string, refs = ['c']): ChannelDocument { return { id: 'd', channel: 'ad_copy', revision: 1, evidenceRevision: p.evidenceRevision, status: 'needs_review', reviewedBlocks: {}, validationHash: null, warnings: [], updatedAt: p.createdAt, blocks: [{ id: 'b', kind: 'paragraph', text, claimRefs: refs }] }; }

describe('근거와 결과의 변경 안전성', () => {
  it('허용한 단위 변환만 같게 보고 다른 수치와 조건 생략을 막는다', () => {
    const p = grounded();
    expect(quantities('1L 1,000ml 1kg 1,000g 1시간 60분')).toEqual(['ml:1000','ml:1000','g:1000','g:1000','minutes:60','minutes:60']);
    expect(validateDocument(p, doc(p, '실내 시험에서 용량 1,000ml입니다.')).status).toBe('needs_review');
    expect(validateDocument(p, doc(p, '실내 시험에서 용량 2L입니다.')).status).toBe('blocked');
    expect(validateDocument(p, doc(p, '용량 1L입니다.')).status).toBe('blocked');
  });
  it('있는 근거 번호를 붙여도 새 인증과 가짜 경험은 통과하지 않는다', () => {
    const p = grounded();
    expect(validateDocument(p, doc(p, '실내 시험에서 공식 인증을 받은 용량 1L입니다.')).status).toBe('blocked');
    expect(validateDocument(p, doc(p, '제가 직접 써 보니 만족했어요.', [])).status).toBe('blocked');
    const video = { ...doc(p, '00:30 실제 사용 장면', []), channel: 'youtube_description' as const };
    expect(validateDocument(p, video).status).toBe('blocked');
    const release = { ...doc(p, '대표는 “매출이 크게 늘었습니다”라고 밝혔습니다.', []), channel: 'press_release' as const };
    expect(validateDocument(p, release).status).toBe('blocked');
  });
  it('재작성 결과는 제안으로 보관하고 중간에 수정한 본문을 덮어쓰지 않는다', () => {
    let p = grounded(); p.documents.ad_copy = doc(p, '기존 문구', []);
    p = prepareContent(approveInsight(p), ['ad_copy']).project;
    const response = JSON.stringify({ contract: 'alc.content.v1', requestId: p.manualContentRequestId, documents: [{ channel: 'ad_copy', blocks: [{ kind: 'heading', text: '다시 쓴 문구', claimRefs: [] }] }], unresolvedItems: [] });
    p = importContent(p, response);
    expect(p.documents.ad_copy?.blocks[0].text).toBe('기존 문구');
    expect(p.documentProposals.ad_copy?.blocks[0].text).toBe('다시 쓴 문구');
    expect(importContent(p, response)).toBe(p);
    const edited = updateDocumentText(p, 'ad_copy', 'b', '도착 뒤 수정한 문구');
    expect(() => applyDocumentProposal(edited, 'ad_copy')).toThrow('기존 본문');
    const applied = applyDocumentProposal(edited, 'ad_copy', true);
    expect(applied.documentHistory.ad_copy?.at(-1)?.blocks[0].text).toBe('도착 뒤 수정한 문구');
    expect(applied.documents.ad_copy?.blocks[0].text).toBe('다시 쓴 문구');
    expect(() => applyDocumentProposal({ ...p, evidenceRevision: 99 }, 'ad_copy')).toThrow('근거가 바뀐');
  });
  it('다시 쓸 채널만 요청하고 다른 채널의 응답을 가져오지 않는다', () => {
    const p = prepareContent(approveInsight(base(), true), ['ad_copy']).project;
    expect(p.contentRequestChannels).toEqual(['ad_copy']);
    expect(() => importContent(p, JSON.stringify({ contract: 'alc.content.v1', requestId: p.manualContentRequestId, documents: [{ channel: 'blog', blocks: [{ kind: 'paragraph', text: '선택하지 않은 채널', claimRefs: [] }] }], unresolvedItems: [] }))).toThrow();
  });
  it('근거가 없으면 고객과 경쟁 차이를 가설·미확인으로 남긴다', () => {
    const p = base(); const strategy = buildStrategy(p);
    expect(strategy.audienceLabel).toContain('미확정');
    expect(strategy.eligible).toHaveLength(0);
    expect(strategy.plans).toHaveLength(2);
    expect(strategy.gaps.join(' ')).toContain('경쟁 제품보다');
    const c = { id: 'x', competitor: '가상 경쟁사', criterion: '용량', ownClaimIds: [], otherClaimIds: [], comparable: true, verdict: 'advantage' as const, reason: '외부 AI가 우위라고 주장' };
    expect(comparisonAssessment(p, c).label).toBe('비교 미확인');
  });
  it('중복 조사는 새 UUID를 만들지 않고 발행일 불명을 수집일로 채우지 않는다', () => {
    const p = prepareResearch(base()).project;
    const raw = JSON.stringify({ contract: 'alc.research.v1', requestId: p.manualResearchRequestId, entity: { name: p.name }, sources: [{ ref: 's', title: '허구', url: null, excerpt: '원문', publisher: null, publishedAt: null }], claims: [], questions: [], comparisons: [], recommendations: [], missingEvidence: ['자료 부족'] });
    const result = importResearch(p, raw);
    expect(importResearch(result, raw)).toBe(result);
    expect(result.sources[0].publishedAt).toBeNull();
    expect(result.missingEvidence).toEqual(['자료 부족']);
  });
});


it('다른 대상의 주장을 자사 근거로 확인할 수 없다', () => {
  const p = grounded(); p.claims[0].subject = '다른 회사 제품';
  expect(() => verifyClaim(p, 'c')).toThrow();
});
it('Markdown 조사에서 조건과 질문 출처를 보존하고 모호한 구분 기호를 거절한다', () => {
  const p = prepareResearch(base()).project;
  const raw = `# alc.research.v1
requestId: ${p.manualResearchRequestId}
entity: ${p.name}
## sources
- S1 | 허구 시험 |  | 실내 시험 용량 1L | test | 가상 기관 | 
## claims
- C1 | 용량 1L | S1 | 실내 시험 용량 1L | 실내 시험 | ${p.name}
## questions
- Q1 | 용량은 얼마인가요? | hypothesis | S1
## recommendations
- R1 | 출근길 | 용량 확인 | C1 |  | 실내 시험 조건
## missingEvidence
- 경쟁 자료 필요`;
  const result = importResearch(p, raw);
  expect(result.claims[0].conditions).toBe('실내 시험');
  expect(result.questions[0].sourceIds).toEqual([result.sources[0].id]);
  expect(result.recommendations[0].limitation).toBe('실내 시험 조건');
  expect(() => importResearch(p, raw.replace('용량 확인 | C1', '용량 | 확인 | C1'))).toThrow();
});

it('실제 수동 응답처럼 제품명에 별칭이 빠지고 우위 표기가 달라도 명시적 확인 후 미검증으로 가져온다', () => {
  const started = prepareResearch(newProject({ name: '코웨이 비렉스 트리플체어2 슬림', kind: 'product', description: '', officialUrl: '', objective: 'feature', audience: '', audienceUndecided: true, selectedChannels: ['ad_copy'], mode: 'manual' })).project;
  const response = JSON.stringify({
    contract: 'alc.research.v1', requestId: started.manualResearchRequestId,
    entity: { name: '코웨이 트리플체어2 슬림' },
    sources: [
      { ref: 'S1', title: '사용자 제공 공식몰 문구', url: 'https://example.org/own', excerpt: '가로 폭 680mm (세웠을 때 기준)', sourceType: 'official' },
      { ref: 'S2', title: '사용자 제공 경쟁 제품 문구', url: 'https://example.org/other', excerpt: '가로 폭 780mm (세웠을 때 기준)', sourceType: 'official' },
    ],
    claims: [
      { ref: 'C1', statement: '가로 폭 680mm', sourceRef: 'S1', quote: '가로 폭 680mm', conditions: '세웠을 때', subject: '코웨이 트리플체어2 슬림' },
      { ref: 'C2', statement: '가로 폭 780mm', sourceRef: 'S2', quote: '가로 폭 780cm', conditions: '세웠을 때', subject: '경쟁 제품' },
    ], questions: [],
    comparisons: [
      { ref: 'K1', competitor: '경쟁 제품', criterion: '폭', ownClaimRefs: ['C1'], otherClaimRefs: ['C2'], comparable: true, verdict: 'own_advantage', reason: '외부 AI의 비교 제안' },
      { ref: 'K2', competitor: '경쟁 제품', criterion: '다른 기능', ownClaimRefs: ['C1'], otherClaimRefs: ['C2'], comparable: true, verdict: 'competitor_advantage', reason: '외부 AI의 비교 제안' },
    ], recommendations: [], missingEvidence: ['원문 확인 필요'],
  });
  expect(() => importResearch(started, response)).toThrow(EntityMismatch);
  const imported = importResearch(started, response, true);
  expect(imported.sources).toHaveLength(2);
  expect(imported.claims.map(c => c.status)).toEqual(['unreviewed', 'unreviewed']);
  expect(imported.comparisons.every(c => !c.comparable && c.verdict === 'unknown')).toBe(true);
  expect(imported.migrationNote).toContain('같은 대상으로 확인한 조사 이름');
  expect(imported.missingEvidence.join(' ')).toContain('인용문이 일치하지 않음: C2');
  expect(imported.manualDrafts.research).toBe(started.manualDrafts.research);
});

it('제조사 발표만 있는 v2 비교를 자료와 함께 가져오되 경쟁 우위로 승인하지 않는다', () => {
  const started = prepareResearch(base()).project;
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/research.manufacturer-claim-only.json'), 'utf8'));
  fixture.requestId = started.manualResearchRequestId;
  const raw = JSON.stringify(fixture);
  const imported = importResearch(started, raw);
  expect(imported.sources).toHaveLength(2);
  expect(imported.claims).toHaveLength(2);
  expect(imported.questions).toHaveLength(1);
  expect(imported.researchInsights.questionClusters[0].questionIds).toEqual([imported.questions[0].id]);
  expect(imported.researchInsights.unmetNeeds[0].sourceIds).toEqual([imported.sources[0].id]);
  expect(imported.comparisons).toHaveLength(2);
  expect(imported.comparisons.every(c => !c.comparable && c.verdict === 'unknown')).toBe(true);
  expect(imported.comparisons[0].reason).toContain('제조사 발표만');
  expect(imported.comparisons[1].reason).toContain('옵션 선택에 따라');
  expect(imported.researchInsights.productCandidates[1].model).toBeNull();
  expect(imported.sources[0].duplicateGroupId).toBe(imported.sources[1].duplicateGroupId);
  expect(imported.recommendations[0].claimIds).toEqual([imported.claims[0].id]);
  expect(imported.recommendations[0].comparisonIds).toEqual(imported.comparisons.map(c => c.id));
  expect(imported.claims.every(c => c.status === 'unreviewed')).toBe(true);
  expect(imported.claims[1].target).toBe('own');
  expect(imported.sources.every(s => s.origin === 'external_response' && !s.publicationAllowed)).toBe(true);
  expect(imported.missingEvidence.join(' ')).toContain('인용문이 일치하지 않음: C2');
  expect(importResearch(imported, raw)).toBe(imported);
});

it('새 비교 판단 표기는 내용을 버리지 않고 보류하며 잘못된 필드 여러 개를 한꺼번에 안내한다', () => {
  const started = prepareResearch(base()).project;
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/research.manufacturer-claim-only.json'), 'utf8'));
  fixture.requestId = started.manualResearchRequestId;
  fixture.comparisons[0].verdict = 'unrecognized_label';
  const imported = importResearch(started, JSON.stringify(fixture));
  expect(imported.comparisons[0].verdict).toBe('unknown');
  expect(imported.missingEvidence.join(' ')).toContain('경쟁 비교 K1의 판단 표기');
  fixture.comparisons[0].verdict = 123;
  fixture.productCandidates[0].model = { text: 'A' };
  expect(() => importResearch(started, JSON.stringify(fixture))).toThrow(/경쟁 비교 1번의 판단 표기 · 제품 후보 1번의 모델명|제품 후보 1번의 모델명 · 경쟁 비교 1번의 판단 표기/);
  expect(started.sources).toHaveLength(0);
});

it('서로 다른 섹션의 잘못된 연결 번호를 모아 안내하고 아무 자료도 반영하지 않는다', () => {
  const started = prepareResearch(base()).project;
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/manual/research.manufacturer-claim-only.json'), 'utf8'));
  fixture.requestId = started.manualResearchRequestId;
  fixture.claims[0].sourceRef = 'S99';
  fixture.questionClusters[0].questionRefs = ['Q99'];
  fixture.recommendations[0].comparisonRefs = ['K99'];
  try {
    importResearch(started, JSON.stringify(fixture));
    throw new Error('잘못된 번호를 가져와서는 안 됩니다.');
  } catch (error) {
    expect((error as Error).message).toContain('S99');
    expect((error as Error).message).toContain('Q99');
    expect((error as Error).message).toContain('K99');
  }
  expect(started.sources).toHaveLength(0);
});
