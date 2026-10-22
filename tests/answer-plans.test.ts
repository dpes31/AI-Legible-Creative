import { describe, expect, it } from 'vitest';
import { buildContentBrief } from '../src/domain/content-brief';
import { approveInsight } from '../src/domain/insight';
import { importResearch, prepareResearch, attachOriginalText, prepareContent, importContent, reviewDocument } from '../src/domain/workflow';
import { newProject } from '../src/domain/schema';

function started() {
  return prepareResearch(newProject({ name: '가상 트리플체어', kind: 'product', model: '',
    description: '', officialUrl: 'https://example.org/product', objective: 'feature',
    audience: '', audienceUndecided: true, selectedChannels: ['product_page', 'blog'], mode: 'manual' })).project;
}

function response(requestId: string | null, contract: 'alc.research.v2' | 'alc.research.v3') {
  return JSON.stringify({ contract, requestId, entity: { name: '가상 트리플체어' },
    sources: [
      { ref: 'S1', title: '가상 공식 제품', url: 'https://example.org/product', excerpt: '일반형 A는 등 안마를 제공합니다.', sourceType: 'official' },
      { ref: 'S2', title: '같은 페이지 다른 구간', url: 'https://example.org/product', excerpt: '허리형 B는 목 안마를 제공합니다.', sourceType: 'official' },
    ],
    claims: [
      { ref: 'C1', statement: '일반형 A는 등 안마', sourceRef: 'S1', quote: '일반형 A는 등 안마를 제공합니다.', conditions: '일반형 A', subject: '가상 트리플체어 일반형 A' },
      { ref: 'C2', statement: '허리형 B는 목 안마', sourceRef: 'S2', quote: '허리형 B는 목 안마를 제공합니다.', conditions: '허리형 B', subject: '가상 트리플체어 허리형 B' },
    ], questions: [{ ref: 'Q1', text: '등 안마는 어느 모델인가요?', provenance: 'reconstructed', sourceRefs: ['S1'],
      situation: '두 모델 선택', need: '정확한 안마 범위', painPoint: '모델 혼동', decisionCriteria: ['안마 부위'] }],
    comparisons: [], recommendations: [], missingEvidence: [],
    answerPlans: [{ questionRef: 'Q1', directAnswer: '일반형 A의 등 안마는 확인 후보입니다.',
      applicableModel: '일반형 A', alternatives: ['허리형 B'], selectionReason: '등 안마 범위를 우선',
      limitations: '허리형 B에 동일 기능이 있다고 해석하지 않음', contentGap: '모델 선택표 부재',
      claimRefs: ['C1'], comparisonRefs: [], channels: [
        { channel: 'product_page', angle: '모델 비교표', depth: '두 모델의 안마 부위와 조건' },
        { channel: 'blog', angle: '선택 질문', depth: '질문에 먼저 답하고 한계 설명' },
      ] }],
  });
}

describe('질문별 답변 설계와 출처 단위 확인', () => {
  it('v3 응답의 모델·질문·근거·채널 방향과 미확인 상태를 작성 계약까지 보존한다', () => {
    const p = started();
    const imported = importResearch(p, response(p.manualResearchRequestId, 'alc.research.v3'));
    const approved = approveInsight(imported);
    const brief = buildContentBrief(approved, 'write-1', approved.selectedChannels);
    expect(brief.answerPlans[0]).toMatchObject({ questionId: imported.questions[0].id,
      applicableModel: '일반형 A', directAnswer: '일반형 A의 등 안마는 확인 후보입니다.',
      claimIds: [imported.claims[0].id], reviewStatus: 'proposed' });
    expect(brief.draftClaims).toHaveLength(2);
    expect(brief.allowedClaims).toHaveLength(0);
    expect(brief.outline).toBe(false);
    expect(brief.channels[0].directions[0].angle).toBe('모델 비교표');
    expect(prepareContent(approved).prompt).toContain('모델 비교표');
  });

  it('과거 v2 응답의 없는 답을 만들어 내지 않고 질문별 계획을 보류한다', () => {
    const p = started();
    const imported = importResearch(p, response(p.manualResearchRequestId, 'alc.research.v2'));
    expect(imported.answerPlans[0]).toMatchObject({ directAnswer: '', claimIds: [], reviewStatus: 'needs_analysis' });
  });

  it('같은 URL의 두 발췌를 한 원문으로 연결해 각 주장의 일치 여부를 검사하고 승인하지 않는다', () => {
    const p = started();
    const imported = importResearch(p, response(p.manualResearchRequestId, 'alc.research.v3'));
    const connected = attachOriginalText(imported, imported.sources[0].id, '일반형 A는 등 안마를 제공합니다.', true);
    expect(connected.sources.map(s => s.origin)).toEqual(['direct_input', 'direct_input']);
    expect(connected.claims.map(c => c.status)).toEqual(['unreviewed', 'insufficient']);
    expect(connected.sources[1].excerpt).toBe('허리형 B는 목 안마를 제공합니다.');
    expect(connected.claims.every(c => c.status !== 'supported')).toBe(true);
  });

  it('없는 질문·주장 참조가 있는 v3 응답은 관계를 추측하지 않는다', () => {
    const p = started(); const raw = JSON.parse(response(p.manualResearchRequestId, 'alc.research.v3'));
    raw.answerPlans[0].questionRef = 'Q99'; raw.answerPlans[0].claimRefs = ['C99'];
    expect(() => importResearch(p, JSON.stringify(raw))).toThrow(/Q99.*C99/);
  });

  it('미확인 모델 사실을 검토용 본문에만 사용하며 조건 누락과 가짜 최종 승인을 막는다', () => {
    const p = started();
    const imported = importResearch(p, response(p.manualResearchRequestId, 'alc.research.v3'));
    const prepared = prepareContent(approveInsight(imported), ['product_page']);
    const content = (text: string) => JSON.stringify({ contract: 'alc.content.v2', requestId: prepared.project.manualContentRequestId,
      inputRevision: prepared.project.inputRevision, evidenceRevision: prepared.project.evidenceRevision,
      insightRevision: prepared.project.insight.revision,
      documents: [{ channel: 'product_page', blocks: [{ kind: 'paragraph', section: '모델 선택', text,
        claimRefs: [imported.claims[0].id], questionRefs: [imported.questions[0].id] }] }], unresolvedItems: [] });
    const safe = importContent(prepared.project, content('조사 응답 기반 · 원문/의미 확인 전. 일반형 A는 등 안마를 제공합니다.'));
    expect(safe.documents.product_page?.status).toBe('needs_review');
    expect(() => reviewDocument(safe, 'product_page')).toThrow();
    const missingCondition = importContent(prepared.project, content('조사 응답 기반 · 원문/의미 확인 전. 등 안마를 제공합니다.'));
    expect(missingCondition.documents.product_page?.status).toBe('blocked');
  });
});
