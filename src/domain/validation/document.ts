import type { ChannelDocument, Project } from '../schema';
import { fingerprint, normalize } from '../text';

export const validationRulesVersion = 'alc.validation.3';
const elevated = /(?:\d[\d,.]*\s*(?:%|퍼센트|원|만원|시간|분|년|개월|배|건|위|kg|g|ml|l|㎏|㎖|그램|리터|킬로그램)|1\s*위|유일|최고|인증|효능|치료|완치|특허|입증|더\s*(?:뛰어|좋|우수)|보장|누수\s*없|효과가\s*있)/i;
const experience = /(?:써\s*보니|사용해\s*보니|사용한\s*후|제가\s*직접|저는\s*직접|만족했|만족스러웠|체감했|효과를\s*봤)/;
const factual = /(?:가능합니다|입니다[.!]?$|갖추고|제공합니다|지원합니다|유지합니다|줄여\s*줍니다|개선합니다|만들었습니다|탑재|함유|없습니다)/;

// Only explicit, dimension-safe conversions. Duration/year, purchase/rental and
// currencies are deliberately not interchangeable here.
export function quantities(text: string): string[] {
  const units: Record<string, [string, number]> = {
    kg: ['g', 1000], '㎏': ['g', 1000], '킬로그램': ['g', 1000], g: ['g', 1], '그램': ['g', 1],
    l: ['ml', 1000], '리터': ['ml', 1000], ml: ['ml', 1], '㎖': ['ml', 1],
    '시간': ['minutes', 60], '분': ['minutes', 1], '%': ['percent', 1], '퍼센트': ['percent', 1],
    '만원': ['KRW', 10000], '원': ['KRW', 1],
  };
  return [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(킬로그램|그램|kg|g|리터|ml|㎖|l|㎏|시간|분|퍼센트|%|만원|원|개월|년|배|건|위)/gi)]
    .map(([, amount, rawUnit]) => { const unit = rawUnit.toLowerCase(); const [dimension, multiplier] = units[unit] || [unit, 1];
      return `${dimension}:${Number((Number(amount.replaceAll(',', '')) * multiplier).toFixed(8))}`; });
}

export function validateDocument(project: Project, document: ChannelDocument): ChannelDocument {
  const issues: NonNullable<ChannelDocument['validation']>['issues'] = [];
  const warnings: string[] = [];
  const add = (blockId: string, message: string, severity: 'block' | 'review' = 'block') => { issues.push({ blockId, message, severity }); warnings.push(message); };
  const hasReview = project.sources.some(s => s.sourceType === 'review' && s.origin !== 'external_response' && s.publicationAllowed);
  for (const block of document.blocks) {
    if (block.kind === 'note') continue;
    if (!block.text.trim()) { add(block.id, '빈 문단이 있습니다.', 'block'); continue; }
    const refs = block.claimRefs.map(id => project.claims.find(c => c.id === id));
    for (const claim of refs) {
      const source = project.sources.find(s => s.id === claim?.sourceId);
      if (!claim || claim.status !== 'supported' || claim.target === 'unresolved') add(block.id, '확인되지 않은 주장이 문구에 연결되어 있습니다.');
      else if (!source?.publicationAllowed || source.origin === 'external_response' || !claim.quote || !normalize(source.body).includes(normalize(claim.quote))) {
        add(block.id, '공개 사용이나 원문 대조가 확인되지 않은 근거가 있습니다.');
      } else if (claim.review && claim.review.sourceHash !== source.hash) add(block.id, '원문이 바뀌어 주장을 다시 확인해야 합니다.');
      else if (claim.conditions && !normalize(block.text).includes(normalize(claim.conditions))) add(block.id, `적용 조건이 문구에서 빠졌습니다: ${claim.conditions}`);
    }
    if (elevated.test(block.text) && !block.claimRefs.length) add(block.id, '수치·인증·효능·우위를 말하는 문구에 근거가 없습니다.');
    // Inspect the text again, independently of generator-supplied claimRefs.
    const allowedNumbers = new Set(refs.flatMap(c => c ? quantities(`${c.statement} ${c.quote} ${c.conditions}`) : []));
    if (block.claimRefs.length && quantities(block.text).some(value => !allowedNumbers.has(value))) add(block.id, '본문의 수치·단위가 연결한 근거와 다릅니다.');
    const evidenceText = refs.map(c => c ? `${c.statement} ${c.quote}` : '').join(' ');
    if (block.claimRefs.length && ['인증', '특허', '유일', '최고', '완치', '치료', '효능', '입증'].some(word => block.text.includes(word) && !evidenceText.includes(word))) add(block.id, '연결된 근거에 없는 인증·효능·우위 표현이 추가됐습니다.');
    if (factual.test(block.text) && !block.claimRefs.length) add(block.id, '사실을 설명하는 문장인지 확인하고, 사실이라면 근거를 연결해 주세요.', 'review');
    if (experience.test(block.text) && !hasReview) add(block.id, '실제 경험 자료가 없는 체험담은 사용할 수 없습니다.');
    if (document.channel === 'press_release') {
      const quotes = [...block.text.matchAll(/[“「]([^”」]+)[”」]/g)].map(m => m[1]);
      if (quotes.some(q => !project.sources.some(s => s.publicationAllowed && s.origin !== 'external_response' && normalize(s.body).includes(normalize(q))))) {
        add(block.id, '관계자의 발언을 확인할 원문이 없습니다.');
      }
    }
    if (document.channel === 'youtube_description' && /\b\d{1,2}:\d{2}\b/.test(block.text) && !project.sources.some(s => s.publicationAllowed && s.origin !== 'external_response' && /대본|영상/.test(s.title))) {
      add(block.id, '영상·대본을 확인하지 않은 타임스탬프입니다.');
    }
    if (/\[[^\]]*(?:날짜|발언|입력|확인)[^\]]*\]/.test(block.text)) add(block.id, '확인하지 않은 자리표시자가 남아 있습니다.');
    if (/혁신적\s*솔루션|일상을\s*재정의|경험을\s*선사|이\(가\)|을\(를\)/.test(block.text)) add(block.id, '막연한 칭찬이나 번역투를 구체적인 한국어로 다듬어 주세요.', 'review');
  }
  if (!document.blocks.some(b => b.kind !== 'note' && b.text.trim())) add('document', '복사할 공개 본문이 없습니다.');
  if (document.channel === 'review_video' && !hasReview) warnings.push('실제 후기가 없어 촬영 가이드로만 사용할 수 있습니다.');
  if (document.channel === 'youtube_description' && !project.sources.some(s => s.origin !== 'external_response' && /대본|영상/.test(s.title))) warnings.push('실제 영상·대본을 확인하지 않은 제작 전 초안입니다.');
  if (document.channel === 'press_release') warnings.push('발표일·발표 내용과 인용문을 게시 전에 확인해 주세요.');
  const status = issues.some(i => i.severity === 'block') ? 'blocked' : project.claims.some(c => c.status === 'supported') ? 'needs_review' : 'outline';
  return { ...document, status, warnings: [...new Set(warnings)], validationHash: null,
    validation: { hash: fingerprint(JSON.stringify(document.blocks) + project.evidenceRevision), rulesVersion: validationRulesVersion,
      checkedAt: new Date().toISOString(), semanticMethod: 'not_run', issues } };
}
