import { describe, expect, it } from 'vitest';
import { convertLegacy } from '../src/data/legacy';
import { attachOriginalText, importContent, importResearch, prepareContent, prepareResearch, validateDocument, verifyClaim } from '../src/domain/workflow';
import { newProject, type ChannelDocument } from '../src/domain/schema';

function project() {
  return newProject({
    name: '검수용 가상 보온컵', kind: 'product', description: '실제 판매 상품이 아닙니다', officialUrl: '',
    objective: 'feature', audience: '', audienceUndecided: true,
    selectedChannels: ['ad_copy', 'blog'], mode: 'manual',
  });
}

describe('사실과 프로젝트의 무결성', () => {
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
    const checked = verifyClaim(attached, attached.claims[0].id);
    expect(checked.claims[0].status).toBe('supported');
    expect(checked.evidenceRevision).toBe(3);
  });

  it('근거 없는 수치와 없는 참조를 최종본으로 취급하지 않는다', () => {
    const p = project();
    const doc: ChannelDocument = {
      id: 'd', channel: 'ad_copy', blocks: [{ id: 'b', kind: 'paragraph', text: '성능 99% 입증', claimRefs: [] }],
      revision: 1, evidenceRevision: 0, validationHash: null, status: 'needs_review', warnings: [], updatedAt: new Date().toISOString(),
    };
    expect(validateDocument(p, doc).status).toBe('blocked');
    const prepared = prepareContent(p).project;
    expect(() => importContent(prepared, JSON.stringify({ contract: 'alc.content.v1', requestId: prepared.manualContentRequestId,
      documents: [{ channel: 'ad_copy', blocks: [{ kind: 'paragraph', text: '문구', claimRefs: ['missing'] }] }], unresolvedItems: [],
    }))).toThrow();
  });

  it('구버전 승인 상태를 이어받지 않고 끊어진 질문 관계를 알린다', () => {
    const migrated = convertLegacy(JSON.stringify({ state: {
      clientName: '검수용 상품', usp: '확인되지 않은 장점', phase2Questions: [],
      phase4Facts: [{ id: 7, fact: '성능 99%', coversQuestions: [40] }],
      naScript: '이전 초안', subScript: '',
    } }));
    expect(migrated.claims[0].status).toBe('unreviewed');
    expect(migrated.documents.ad_copy).toBeUndefined();
    expect(migrated.migrationNote).toContain('40');
    expect(migrated.previousDraft).toBe('이전 초안');
  });
});
