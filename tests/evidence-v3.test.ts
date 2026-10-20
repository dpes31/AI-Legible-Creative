import { describe, expect, it } from 'vitest';
import { newProject, type ChannelDocument, type Project } from '../src/domain/schema';
import { applyDocumentProposal, importContent, importResearch, prepareContent, prepareResearch, updateDocumentText, validateDocument } from '../src/domain/workflow';
import { quantities } from '../src/domain/validation/document';
import { buildStrategy, comparisonAssessment } from '../src/domain/analysis/strategy';

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
    p = prepareContent(p, ['ad_copy']).project;
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
    const p = prepareContent(base(), ['ad_copy']).project;
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
