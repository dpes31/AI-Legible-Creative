import { channelNames, objectiveNames, type Channel, type Comparison, type Project } from '../schema';
import { assessRecommendation } from './recommendations';

export const researchLimits = { competitors: 3, questions: 12, sources: 20 } as const;

export const channelRoles: Record<Channel, { purpose: string; structure: string; guard: string }> = {
  ad_copy: { purpose: '관심을 끌고 다음 행동을 제안합니다.', structure: '핵심 메시지 · 헤드라인/보조 문구/행동 유도 3안', guard: '조건을 담기 어려운 수치는 빼고 짧은 대안을 씁니다.' },
  product_page: { purpose: '구매 전에 궁금한 점을 풀어 줍니다.', structure: '첫 화면 · 고객 문제 · 선택 이유 3개 이내 · 사양/사용 조건 · FAQ 3~5개 · 구매 안내', guard: '가격·배송·반품 조건은 제공된 사실만 씁니다.' },
  press_release: { purpose: '발표할 사실과 의미를 정리합니다.', structure: '제목 · 부제 · 첫 문단 · 본문 · 회사 소개 · 출처', guard: '발표 사건·날짜·공식 발언이 없으면 발표 내용 확인 전 초안입니다.' },
  youtube_description: { purpose: '영상에서 다룰 내용을 먼저 알려 줍니다.', structure: '제목 후보 3개 · 첫 설명 문단 · 핵심 내용 · 공식 링크', guard: '영상·대본이 없으면 제작 전 초안입니다. 타임스탬프를 만들지 않습니다.' },
  blog: { purpose: '고객의 질문에 답하고 선택 기준을 설명합니다.', structure: '제목 후보 3개 · 첫 답변 · 상황별 설명/비교 · 관련 질문 · 출처', guard: '브랜드가 작성한 정보글로 씁니다. 실제 고객인 것처럼 쓰지 않습니다.' },
  review_video: { purpose: '실제 경험을 듣고 보여 줄 장면을 준비합니다.', structure: '인터뷰 질문 · 사용 장면 · 관찰 포인트 · 제공된 발언 · 마무리', guard: '실제 후기·녹취가 없으면 촬영 가이드입니다. 경험과 만족도를 만들지 않습니다.' },
};

export function comparisonAssessment(project: Project, comparison: Comparison) {
  const both = [...comparison.ownClaimIds, ...comparison.otherClaimIds];
  const hasEvidence = comparison.ownClaimIds.length > 0 && comparison.otherClaimIds.length > 0 && both.every(id => {
    const claim = project.claims.find(c => c.id === id);
    return claim?.status === 'supported' && project.sources.some(s => s.id === claim.sourceId &&
      s.origin !== 'external_response' && s.publicationAllowed && claim.quote && s.body.replace(/\s+/g, ' ').includes(claim.quote.replace(/\s+/g, ' ')));
  });
  const reviewed = hasEvidence && comparison.comparable && comparison.review?.evidenceRevision === project.evidenceRevision;
  const labels = { advantage: '조건부 차별점', common: '공통 장점', unknown: '비교 미확인', weakness: '실제 약점' };
  return { reviewed, label: reviewed ? labels[comparison.verdict] : '비교 미확인',
    reason: reviewed ? comparison.reason : '양쪽 원문과 모델·시점·가격 또는 시험 조건을 함께 확인해 주세요.' };
}

export function buildStrategy(project: Project) {
  const eligible = project.claims.filter(c => c.status === 'supported' && c.target !== 'competitor' && c.target !== 'unresolved' &&
    project.sources.some(s => s.id === c.sourceId && s.publicationAllowed && s.origin !== 'external_response'));
  const candidates = project.recommendations.map(candidate => ({ candidate, ...assessRecommendation(project, candidate) }));
  const usable = candidates.filter(c => c.usable);
  const gaps = [...project.missingEvidence];
  if (!eligible.length) gaps.push('공개 문구에 쓸 자사 사실을 원문과 대조해 주세요.');
  if (!project.comparisons.some(c => comparisonAssessment(project, c).reviewed)) gaps.push('현재 자료로는 경쟁 제품보다 나은 점을 확인하지 못했습니다.');
  if (project.claims.some(c => c.status === 'contradicted')) gaps.push('서로 맞지 않는 주장이 있습니다. 해당 주장은 작성에 사용하지 않습니다.');
  if (project.audienceUndecided) gaps.push('고객 상황은 아직 가설입니다. 실제 고객과 맞는지 확인해 주세요.');
  const focus = usable[0]?.candidate.reason || (eligible[0] ? eligible[0].statement : '확인한 사실을 더하면 우선 메시지를 정할 수 있습니다.');
  return {
    objective: objectiveNames[project.objective],
    audience: project.audienceUndecided ? (candidates[0]?.candidate.situation || '고객 상황을 조사하며 구체화합니다.') : project.audience,
    audienceLabel: project.audienceUndecided ? '조사 가설 · 사용자 미확정' : '사용자 지정',
    eligible, candidates, focus, gaps: [...new Set(gaps)],
    plans: project.selectedChannels.map(channel => ({ channel, label: channelNames[channel], ...channelRoles[channel],
      message: focus, claimIds: usable[0]?.candidate.claimIds || eligible.slice(0, 3).map(c => c.id) })),
  };
}
