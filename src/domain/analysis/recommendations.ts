import type { Project, Recommendation } from '../schema';
import { isVerifiedClaim } from './source-audit';

export type RecommendationAssessment = { usable: boolean; label: string; reason: string };
const comparative = /(?:보다\s*(?:더|나은|좋은|우수)|경쟁(?:사|제품)?\s*(?:대비|와\s*달리|과\s*달리)|업계\s*(?:최고|유일)|1\s*위|최고|유일|압도)/;

export function assessRecommendation(project: Project, candidate: Recommendation): RecommendationAssessment {
  if (!candidate.claimIds.length || candidate.claimIds.some(id => {
    const claim = project.claims.find(item => item.id === id);
    return !claim || claim.target === 'competitor' || claim.target === 'unresolved' || !isVerifiedClaim(project, claim) || !project.sources.some(source =>
      source.id === claim.sourceId && source.publicationAllowed && source.origin !== 'external_response');
  })) return { usable: false, label: '자사 근거 보완', reason: '공개 사용이 허용된 자사 원문을 직접 대조해 주세요.' };

  const comparisons = candidate.comparisonIds.map(id => project.comparisons.find(item => item.id === id));
  if (comparisons.some(item => !item || !item.comparable || item.verdict === 'unknown' ||
      item.review?.evidenceRevision !== project.evidenceRevision || !item.ownClaimIds.length || !item.otherClaimIds.length ||
      [...item.ownClaimIds, ...item.otherClaimIds].some(id => !project.claims.some(c => c.id === id && isVerifiedClaim(project, c))))) {
    return { usable: false, label: '비교 조건 확인', reason: '양쪽의 모델·시점·시험 조건을 같은 기준으로 확인하지 못했습니다.' };
  }
  if (comparative.test(candidate.reason) && !comparisons.some(item => item?.verdict === 'advantage')) {
    return { usable: false, label: '경쟁 우위 보류', reason: '우위를 말하려면 같은 조건에서 자사가 앞선다는 양쪽 근거가 필요합니다.' };
  }
  if (comparisons.some(item => item?.verdict === 'weakness')) {
    return { usable: false, label: '약점 확인', reason: '불리한 조건을 문구로 감추지 말고 제품 조건이나 고객 대상을 다시 살펴봐야 합니다.' };
  }
  if (comparisons.some(item => item?.verdict === 'common')) {
    return { usable: true, label: '공통 장점', reason: '경쟁 제품에도 해당합니다. 자사만의 차이라고 말하지 마세요.' };
  }
  return { usable: true, label: '선택 이유 후보', reason: '자사 원문을 대조했습니다. 고객에게 적합한지와 한계는 사람이 확인해야 합니다.' };
}
