import { reviewSyntheticEvidence } from './helpers/synthetic-evidence';
import { describe, expect, it } from 'vitest';
import { newProject } from '../src/domain/schema';
import { approveInsight, hasUsableEvidence, insightCurrent, reviseInsight } from '../src/domain/insight';
import { buildContentBrief } from '../src/domain/content-brief';
import { prepareContent } from '../src/domain/workflow';

function specimen() {
  const p = newProject({ name: '허구 미니 의자', kind: 'product', model: 'A-1', brandName: '코웨이', category: 'berex',
    youtubePrefix: '[COWAY BEREX]', description: '사용자가 강조한 업무와 휴식', officialUrl: 'https://example.org/item',
    objective: 'feature', audience: '서재를 쓰는 사람', audienceUndecided: false,
    selectedChannels: ['youtube_description', 'product_page'], mode: 'manual' });
  p.questions = [{ id: 'q', text: '작은 서재에 놓을 수 있나요?', provenance: 'hypothesis', sourceIds: [],
    situation: '좁은 서재', need: '공간', painPoint: '큰 의자', decisionCriteria: ['실측 크기'] }];
  p.comparisons = [{ id: 'cmp', competitor: '허구 경쟁 의자', criterion: '설치 폭', ownClaimIds: [], otherClaimIds: [],
    comparable: false, verdict: 'unknown', reason: '한쪽 자료가 없습니다.' }];
  p.sources = [{ id: 's', projectId: p.id, title: '허구 설명서', url: 'https://example.org/source', excerpt: '가로 폭 68cm.',
    body: '가로 폭 68cm.', sourceType: 'official', retrieval: 'user_provided', origin: 'direct_input', publishedAt: null,
    collectedAt: p.createdAt, externalAiAllowed: true, publicationAllowed: true, hash: 'h' }];
  p.claims = [{ id: 'c', projectId: p.id, statement: '가로 폭 68cm', sourceId: 's', quote: '가로 폭 68cm.',
    conditions: '세웠을 때', subject: '허구 미니 의자 A-1', status: 'supported', reviewedBy: 'human' }];
  return reviewSyntheticEvidence(p);
}

describe('작성 공통 자료와 인사이트 검수', () => {
  it('사용자 방향 수정과 질문·원문·조건·링크·비교 미확인을 같은 계약에 보존한다', () => {
    const p = approveInsight(reviseInsight(specimen(), '실측 크기를 먼저 설명해 주세요. 더 작다고 단정하지 마세요.'));
    const brief = buildContentBrief(p, 'request-1', p.selectedChannels);
    expect(brief.questions[0].painPoint).toBe('큰 의자');
    expect(brief.allowedClaims[0]).toMatchObject({ conditions: '세웠을 때', quote: '세웠을 때 가로 폭 68cm.', sourceUrl: 'https://example.org/source' });
    expect(brief.comparisons[0].state).toBe('비교 미확인');
    expect(brief.entity).toMatchObject({ youtubePrefix: '[COWAY BEREX]', officialUrl: 'https://example.org/item' });
    expect(prepareContent(p).prompt).toContain('실측 크기를 먼저 설명해 주세요.');
    expect(prepareContent(p).prompt).toContain('alc.content.v2');
  });
  it('근거 버전이 달라지면 이전 인사이트 승인을 현재 작성에 사용할 수 없다', () => {
    const p = approveInsight(specimen());
    expect(insightCurrent(p)).toBe(true);
    const changed = { ...p, evidenceRevision: p.evidenceRevision + 1 };
    expect(insightCurrent(changed)).toBe(false);
    expect(() => prepareContent(changed)).toThrow('인사이트');
  });
  it('새 성능을 방향 의견에 써도 허용 주장으로 승격하지 않는다', () => {
    const p = approveInsight(reviseInsight(specimen(), '경쟁사보다 20% 더 좋다고 넣어 주세요.'));
    const brief = buildContentBrief(p, 'req', p.selectedChannels);
    expect(brief.feedback.state).toBe('direction_only');
    expect(brief.allowedClaims).toHaveLength(1);
    expect(brief.allowedClaims[0].statement).not.toContain('20%');
    expect(prepareContent(p).prompt).toContain('새로운 기능·수치·비교 우위');
  });
  it('외부 AI 응답만으로 원문을 확인한 것처럼 작성 경로를 열지 않는다', () => {
    const p = specimen();
    p.sources[0].origin = 'external_response';
    expect(hasUsableEvidence(p)).toBe(false);
    expect(() => approveInsight(p)).toThrow('공개할 수 있는 사실');
    const outline = approveInsight(p, true);
    const prepared = prepareContent(outline, outline.selectedChannels);
    expect(prepared.project.manualContentRequestId).toBeTruthy();
    expect(buildContentBrief(outline, prepared.project.manualContentRequestId!, outline.selectedChannels).allowedClaims).toHaveLength(0);
  });
});
