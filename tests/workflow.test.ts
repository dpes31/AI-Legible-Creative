import { describe, expect, it } from 'vitest';
import { convertLegacy } from '../src/data/legacy';
import { attachOriginalText, editDocument, importContent, importResearch, prepareContent, prepareResearch, reviewDocument, validateDocument, verifyClaim } from '../src/domain/workflow';
import { assertProjectRelations, newProject, projectSchema, type ChannelDocument } from '../src/domain/schema';
import { assessRecommendation } from '../src/domain/analysis/recommendations';
import { approveInsight } from '../src/domain/insight';

function project() {
  return newProject({
    name: '검수용 가상 보온컵', kind: 'product', description: '실제 판매 상품이 아닙니다', officialUrl: '',
    objective: 'feature', audience: '', audienceUndecided: true,
    selectedChannels: ['ad_copy', 'blog'], mode: 'manual',
  });
}

describe('사실과 프로젝트의 무결성', () => {
  it('웹 이외의 링크를 출처로 저장하지 않는다', () => {
    expect(() => newProject({ ...project(), officialUrl: 'javascript:alert(1)' })).toThrow();
    const p = project();
    expect(projectSchema.safeParse({ ...p, sources: [{ id: 's', projectId: p.id, title: '위험 링크', url: 'javascript:alert(1)', excerpt: '', body: '', sourceType: 'user', retrieval: 'failed', origin: 'external_response', publishedAt: null, collectedAt: p.createdAt, externalAiAllowed: false, publicationAllowed: false, hash: 'h' }] }).success).toBe(false);
  });
  it('백업에서 질문·비교·문서의 끊어진 참조를 거절한다', () => {
    const p = project();
    expect(() => assertProjectRelations({ ...p,
      questions: [{ id: 'q', text: '무엇인가요?', provenance: 'hypothesis', sourceIds: ['다른-작업-출처'] }],
    })).toThrow();
    expect(() => assertProjectRelations({ ...p,
      comparisons: [{ id: 'c', competitor: '가상 경쟁', criterion: '조건', ownClaimIds: ['없는-주장'],
        otherClaimIds: [], comparable: false, verdict: 'unknown', reason: '' }],
    })).toThrow();
  });
  it('같은 이름의 제품도 모델은 별도 작업 필드와 요청문으로 구별한다', () => {
    const older = newProject({ ...project(), model: '2024년형' });
    const newer = newProject({ ...project(), model: '2026년형' });
    expect(older.id).not.toBe(newer.id);
    expect(prepareResearch(newer).prompt).toContain('모델: 2026년형');
    expect(prepareResearch(older).prompt).not.toContain('2026년형');
    const sourceId = crypto.randomUUID();
    const withOldClaim = { ...newer,
      sources: [{ id: sourceId, projectId: newer.id, title: '구형 설명', url: null,
        excerpt: '2024년형은 빨간색입니다.', body: '2024년형은 빨간색입니다.', sourceType: 'user' as const,
        retrieval: 'user_provided' as const, origin: 'direct_input' as const, publishedAt: null,
        collectedAt: newer.createdAt, externalAiAllowed: false, publicationAllowed: true, hash: 'old' }],
      claims: [{ id: crypto.randomUUID(), projectId: newer.id, statement: '빨간색', sourceId,
        quote: '2024년형은 빨간색입니다.', conditions: '', subject: '2024년형', status: 'unreviewed' as const, reviewedBy: null }],
    };
    expect(() => verifyClaim(withOldClaim, withOldClaim.claims[0].id)).toThrow('현재 모델');
  });
  it('빈 분석과 다른 프로젝트의 응답을 거절한다', () => {
    const p = prepareResearch(project()).project;
    expect(() => importResearch(p, '{}')).toThrow();
    expect(() => importResearch(p, JSON.stringify({
      contract: 'alc.research.v1', requestId: 'wrong', entity: { name: p.name },
      sources: [], claims: [], questions: [], comparisons: [], recommendations: [], missingEvidence: [],
    }))).toThrow();
  });

  it('외부 AI가 만든 검증 상태를 신뢰하지 않고 원문 비교를 요구한다', () => {
    const p = prepareResearch(project()).project;
    const result = importResearch(p, JSON.stringify({
      contract: 'alc.research.v1', requestId: p.manualResearchRequestId, entity: { name: p.name },
      sources: [{ ref: 'S1', title: '허구 자료', url: null, excerpt: '제품의 색상은 파란색입니다.' }],
      claims: [{ ref: 'C1', statement: '파란색', sourceRef: 'S1', quote: '제품의 색상은 파란색입니다.', verified: true }],
      questions: [], comparisons: [], recommendations: [], missingEvidence: [],
    }));
    expect(result.claims[0].status).toBe('unreviewed');
    expect(() => verifyClaim(result, result.claims[0].id)).toThrow();
    const attached = attachOriginalText(result, result.sources[0].id, '제품의 색상은 파란색입니다.', true);
    const staleContentId = prepareContent(approveInsight(result, true)).project.manualContentRequestId;
    expect(attachOriginalText({ ...result, manualContentRequestId: staleContentId }, result.sources[0].id,
      '제품의 색상은 파란색입니다.', true).manualContentRequestId).toBeNull();
    const checked = verifyClaim(attached, attached.claims[0].id);
    expect(checked.claims[0].status).toBe('supported');
    expect(checked.evidenceRevision).toBe(3);
  });

  it('근거 없는 수치와 없는 참조를 최종본으로 취급하지 않는다', () => {
    const p = project();
    const doc: ChannelDocument = {
      id: 'd', channel: 'ad_copy', blocks: [{ id: 'b', kind: 'paragraph', text: '성능 99% 입증', claimRefs: [] }],
      revision: 1, evidenceRevision: 0, reviewedBlocks: {}, validationHash: null, status: 'needs_review', warnings: [], updatedAt: new Date().toISOString(),
    };
    expect(validateDocument(p, doc).status).toBe('blocked');
    const prepared = prepareContent(approveInsight(p, true)).project;
    expect(() => importContent(prepared, JSON.stringify({ contract: 'alc.content.v1', requestId: prepared.manualContentRequestId,
      documents: [{ channel: 'ad_copy', blocks: [{ kind: 'paragraph', text: '문구', claimRefs: ['missing'] }] }], unresolvedItems: [],
    }))).toThrow();
  });

  it('반복 문단 확인 없이 채널을 검토하되 빈약한 구조와 수정된 본문은 최종본으로 넘기지 않는다', () => {
    const initial = project();
    const sourceId = crypto.randomUUID();
    const claimId = crypto.randomUUID();
    const withEvidence = { ...initial, evidenceRevision: 1,
      sources: [{ id: sourceId, projectId: initial.id, title: '허구 원문', url: null,
        excerpt: '뚜껑을 돌려 닫습니다.', body: '뚜껑을 돌려 닫습니다.', sourceType: 'user' as const,
        retrieval: 'user_provided' as const, origin: 'direct_input' as const, publishedAt: null,
        collectedAt: initial.createdAt, externalAiAllowed: true, publicationAllowed: true, hash: 'body' }],
      claims: [{ id: claimId, projectId: initial.id, statement: '뚜껑을 돌려 닫습니다.', sourceId,
        quote: '뚜껑을 돌려 닫습니다.', conditions: '', subject: initial.name,
        status: 'supported' as const, reviewedBy: 'human' as const }],
      documents: { ad_copy: { id: crypto.randomUUID(), channel: 'ad_copy' as const, revision: 1,
        evidenceRevision: 1, reviewedBlocks: {}, validationHash: null, status: 'needs_review' as const,
        warnings: [], updatedAt: initial.createdAt,
        blocks: [{ id: 'heading', kind: 'heading' as const, text: '어떤 컵을 찾으세요?', claimRefs: [] },
          { id: 'fact', kind: 'paragraph' as const, text: '뚜껑을 돌려 닫습니다.', claimRefs: [claimId] }] } },
    };
    const approved = approveInsight(withEvidence);
    approved.documents.ad_copy = { ...approved.documents.ad_copy!, insightRevision: approved.insight.revision };
    expect(() => reviewDocument(approved, 'ad_copy')).toThrow('광고 3안');
    const complete = editDocument(approved, 'ad_copy', [
      { id: 'heading', kind: 'heading', text: '닫는 방법부터', claimRefs: [] },
      { id: 'fact', kind: 'paragraph', text: '뚜껑을 돌려 닫습니다.', claimRefs: [claimId] },
      { id: 'cta1', kind: 'cta', text: '제품 살펴보기', claimRefs: [] },
      { id: 'heading2', kind: 'heading', text: '손으로 돌려 닫는 컵', claimRefs: [] },
      { id: 'body2', kind: 'paragraph', text: '내가 원하는 사용 방식을 먼저 살펴보세요.', claimRefs: [] },
      { id: 'cta2', kind: 'cta', text: '사용 방식 보기', claimRefs: [] },
      { id: 'heading3', kind: 'heading', text: '컵 선택의 출발점', claimRefs: [] },
      { id: 'body3', kind: 'paragraph', text: '언제 쓸지 떠올린 뒤 고르세요.', claimRefs: [] },
      { id: 'cta3', kind: 'cta', text: '종류 살펴보기', claimRefs: [] },
    ]);
    expect(() => reviewDocument(complete, 'ad_copy')).toThrow('의미를 원문과 대조');
    expect(reviewDocument(complete, 'ad_copy', { meaningReviewed: true, feedbackReviewed: false }).documents.ad_copy?.status).toBe('ready');
    const edited = editDocument(complete, 'ad_copy', complete.documents.ad_copy!.blocks.map(block =>
      block.id === 'fact' ? { ...block, text: '뚜껑을 2배 빠르게 닫습니다.' } : block));
    expect(edited.documents.ad_copy?.status).toBe('stale');
    expect(edited.documents.ad_copy?.reviewedBlocks).toEqual({});
    expect(() => reviewDocument(edited, 'ad_copy')).toThrow('확인되지 않은 사실');
  });

  it('조사 응답의 미확인 추천을 작성 요청문에 근거로 보내지 않는다', () => {
    const p = project();
    p.recommendations = [{ id: 'guess', situation: '출근', reason: '경쟁 제품보다 무조건 우수', claimIds: [], comparisonIds: [], limitation: '' }];
    expect(prepareContent(approveInsight(p, true)).prompt).not.toContain('무조건 우수');
  });
  it('공개 사용만 허용한 근거는 외부 AI 작성 요청문에서 제외한다', () => {
    const p = project();
    p.sources = [{ id: 'private-source', projectId: p.id, title: '내부 설명', url: null,
      excerpt: '내부에서만 확인한 특징', body: '내부에서만 확인한 특징', sourceType: 'user',
      retrieval: 'user_provided', origin: 'direct_input', publishedAt: null,
      collectedAt: p.createdAt, externalAiAllowed: false, publicationAllowed: true, hash: 'h' }];
    p.claims = [{ id: 'private-claim', projectId: p.id, statement: '내부에서만 확인한 특징', sourceId: 'private-source',
      quote: '내부에서만 확인한 특징', conditions: '', subject: p.name, status: 'supported', reviewedBy: 'human' }];
    expect(prepareContent(approveInsight(p, true)).prompt).not.toContain('내부에서만 확인한 특징');
    p.sources[0].externalAiAllowed = true;
    expect(prepareContent(approveInsight(p)).prompt).toContain('내부에서만 확인한 특징');
    p.recommendations = [{ id: 'r', situation: '특징 선택', reason: '경쟁 제품보다 더 좋습니다',
      claimIds: ['private-claim'], comparisonIds: [], limitation: '' }];
    expect(assessRecommendation(p, p.recommendations[0]).label).toBe('경쟁 우위 보류');
    expect(prepareContent(approveInsight(p)).prompt).not.toContain('경쟁 제품보다 더 좋습니다');
  });

  it('구버전 승인 상태를 이어받지 않고 끊어진 질문 관계를 알린다', () => {
    const migrated = convertLegacy(JSON.stringify({ state: {
      clientName: '검수용 상품', usp: '확인되지 않은 장점', phase2Questions: [],
      phase4Facts: [{ id: 7, fact: '성능 99%', sourceUrl: 'https://example.org/old', coversQuestions: [40] }],
      naScript: '이전 초안', subScript: '',
    } }));
    expect(migrated.claims[0].status).toBe('unreviewed');
    expect(migrated.sources[0].url).toBe('https://example.org/old');
    expect(migrated.sources[0].body).toBe('');
    expect(migrated.claims[0].sourceId).toBe(migrated.sources[0].id);
    expect(migrated.documents.ad_copy).toBeUndefined();
    expect(migrated.migrationNote).toContain('40');
    expect(migrated.previousDraft).toBe('이전 초안');
  });
});
