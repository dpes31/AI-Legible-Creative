import { describe, expect, it } from 'vitest';
import { newProject, type Project } from '../src/domain/schema';
import { attachOriginalText, prepareContent } from '../src/domain/workflow';
import { validateDocument } from '../src/domain/validation/document';
import { approveInsight } from '../src/domain/insight';

function project(): Project {
  return newProject({ name: '허구 코웨이형 의자', kind: 'product', model: 'A-1', description: '책상과 휴식 겸용이라는 사용자 설명',
    officialUrl: 'https://example.org/official', objective: 'feature', audience: '작은 서재에서 일하는 사람',
    audienceUndecided: false, selectedChannels: ['product_page', 'youtube_description'], mode: 'manual' });
}

describe('GEO 핵심 회귀 재현', () => {
  it('조사에서 작성으로 넘어갈 때 질문·공식 링크·미확인 비교·사용자 설명을 보존한다', () => {
    const p = project();
    p.questions = [{ id: 'q1', text: '어느 모델이 작은 서재에 맞나요?', provenance: 'hypothesis', sourceIds: [] }];
    p.comparisons = [{ id: 'k1', competitor: '가상 경쟁 의자', criterion: '설치 공간', ownClaimIds: [], otherClaimIds: [], comparable: false,
      verdict: 'unknown', reason: '같은 조건의 자료 없음' }];
    const prompt = prepareContent(approveInsight(p, true)).prompt;
    expect(prompt).toContain('https://example.org/official');
    expect(prompt).toContain('어느 모델이 작은 서재에 맞나요?');
    expect(prompt).toContain('가상 경쟁 의자');
    expect(prompt).toContain('책상과 휴식 겸용이라는 사용자 설명');
  });

  it('한 출처에서 한 인용문이 일치하지 않아도 원문과 다른 주장을 남긴다', () => {
    const p = project(); const sourceId = 's1';
    p.sources = [{ id: sourceId, projectId: p.id, title: '가상 설명서', url: null, excerpt: '', body: '',
      sourceType: 'official', retrieval: 'user_provided', origin: 'external_response', publishedAt: null,
      collectedAt: new Date().toISOString(), externalAiAllowed: true, publicationAllowed: false, hash: 'old' }];
    p.claims = [
      { id: 'c1', projectId: p.id, statement: '가로 680mm', sourceId, quote: '가로 680mm', conditions: '', subject: p.name, status: 'unreviewed', reviewedBy: null },
      { id: 'c2', projectId: p.id, statement: '높이 150mm', sourceId, quote: '높이 150mm', conditions: '', subject: p.name, status: 'unreviewed', reviewedBy: null },
    ];
    const next = attachOriginalText(p, sourceId, '가로 680mm. 높이 120mm.', true);
    expect(next.sources[0].body).toContain('가로 680mm');
    expect(next.claims[0].status).toBe('unreviewed');
    expect(next.claims[1].status).toBe('insufficient');
    expect(next.missingEvidence.join(' ')).toContain('높이 150mm');
  });

  it('본문 없는 구성·확인 요청은 완료 원고로 볼 수 없다', () => {
    const p = project();
    const doc = { id: 'd', channel: 'product_page' as const, blocks: [
      { id: 'b1', kind: 'heading' as const, text: '제품 특징', claimRefs: [] },
      { id: 'b2', kind: 'paragraph' as const, text: '제품의 핵심 기능을 설명해 주세요. 자세한 내용은 확인해 보세요.', claimRefs: [] },
    ], revision: 1, evidenceRevision: p.evidenceRevision, reviewedBlocks: {}, validationHash: null, status: 'needs_review' as const,
      warnings: [], updatedAt: new Date().toISOString() };
    const checked = validateDocument(p, doc);
    expect(checked.status).toBe('outline');
    expect(checked.warnings.join(' ')).toContain('본문');
  });
});
