import { channelNames, objectiveNames, type Channel, type Comparison, type Project } from '../schema';
import { assessRecommendation } from './recommendations';
import { isVerifiedClaim } from './source-audit';

export const researchLimits = { batchCompetitors: 3, batchQuestions: 12, batchSources: 20, maxCompetitors: 20, maxQuestions: 100, maxSources: 200 } as const;

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
    return !!claim && isVerifiedClaim(project, claim) && project.sources.some(s => s.id === claim.sourceId &&
      s.origin !== 'external_response' && s.publicationAllowed && claim.quote && s.body.replace(/\s+/g, ' ').includes(claim.quote.replace(/\s+/g, ' ')));
  });
  const reviewed = hasEvidence && comparison.comparable && comparison.review?.evidenceRevision === project.evidenceRevision;
  const labels = { advantage: '조건부 차별점', common: '공통 장점', unknown: '비교 미확인', weakness: '실제 약점' };
  return { reviewed, label: reviewed ? labels[comparison.verdict] : '비교 미확인',
    reason: reviewed ? comparison.reason : '양쪽 원문과 모델·시점·가격 또는 시험 조건을 함께 확인해 주세요.' };
}

export function buildStrategy(project: Project) {
  const eligible = project.claims.filter(c => isVerifiedClaim(project, c) && c.target !== 'competitor' && c.target !== 'unresolved' &&
    project.sources.some(s => s.id === c.sourceId && s.publicationAllowed && s.origin !== 'external_response'))
    .sort((a, b) => a.statement.localeCompare(b.statement, 'ko'));
  const candidates = project.recommendations.map(candidate => ({ candidate, ...assessRecommendation(project, candidate) }))
    .sort((a, b) => a.candidate.situation.localeCompare(b.candidate.situation, 'ko') || a.candidate.reason.localeCompare(b.candidate.reason, 'ko'));
  const acceptedObservations = project.consumerObservations.filter(row => row.importStatus === 'accepted');
  const linkedQuestions = project.questions.filter(question => question.observationIds?.length &&
    question.observationIds.every(id => acceptedObservations.some(row => row.id === id)));
  const reviewedAnswer = project.answerPlans.find(plan => plan.reviewStatus === 'reviewed' &&
    linkedQuestions.some(question => question.id === plan.questionId) && plan.directAnswer.trim() &&
    plan.claimIds.length > 0 && plan.claimIds.every(id => project.claims.some(c => c.id === id && isVerifiedClaim(project, c))));
  const gaps = [...project.missingEvidence];
  if (!eligible.length) gaps.push('공개 문구에 쓸 자사 사실을 원문과 대조해 주세요.');
  if (!project.comparisons.some(c => comparisonAssessment(project, c).reviewed)) gaps.push('현재 자료로는 경쟁 제품보다 나은 점을 확인하지 못했습니다.');
  if (project.claims.some(c => c.status === 'contradicted')) gaps.push('서로 맞지 않는 주장이 있습니다. 해당 주장은 작성에 사용하지 않습니다.');
  if (project.audienceUndecided) gaps.push('고객 상황은 아직 가설입니다. 실제 고객과 맞는지 확인해 주세요.');
  if (!acceptedObservations.length) gaps.push('실제 소비자 데이터가 없습니다. 질문 우선순위는 가설이며 시장 수요로 해석하지 않습니다.');
  else if (!linkedQuestions.length) gaps.push('소비자 자료는 가져왔지만 질문과 원본 관찰 행이 연결되지 않았습니다.');
  else if (!reviewedAnswer) gaps.push('관찰된 질문과 제품 적합성의 연결은 검수 전입니다. 우선순위를 확정하지 않았습니다.');
  const focus = reviewedAnswer?.directAnswer || (linkedQuestions.length
    ? '소비자 관찰 자료와 질문은 연결됐습니다. 질문별 제품 적합성 검수 후 우선순위를 정합니다.'
    : acceptedObservations.length
      ? '소비자 자료를 가져왔습니다. 관찰 범위와 질문 연결을 확인하기 전까지 우선순위를 정하지 않습니다.'
      : '실제 소비자 관찰 자료가 없어 질문별 우선순위를 정하지 않았습니다. 현재 질문은 조사 가설입니다.');
  return {
    objective: objectiveNames[project.objective],
    audience: project.audienceUndecided ? '실제 고객 상황은 아직 확정되지 않았습니다. 관찰 자료와 질문별 근거를 확인해 구체화합니다.' : project.audience,
    audienceLabel: project.audienceUndecided ? '조사 가설 · 사용자 미확정' : '사용자 지정',
    eligible, candidates, focus, gaps: [...new Set(gaps)],
    plans: project.selectedChannels.map(channel => ({ channel, label: channelNames[channel], ...channelRoles[channel],
      message: focus, claimIds: eligible.map(c => c.id) })),
  };
}
