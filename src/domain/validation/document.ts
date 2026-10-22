import type { ChannelDocument, Project } from '../schema';
import { fingerprint, normalize } from '../text';

export const validationRulesVersion = 'alc.validation.5';
const elevated = /(?:\d[\d,.]*\s*(?:%|퍼센트|원|만원|시간|분|년|개월|배|건|위|kg|g|ml|l|㎏|㎖|그램|리터|킬로그램|mm|cm|m|㎜|㎝|°|도)|1\s*위|유일|최고|인증|효능|치료|완치|특허|입증|더\s*(?:뛰어|좋|우수)|보장|누수\s*없|효과가\s*있|(?:통증|질환|증상|피로|자세).{0,24}(?:사라지|사라집|낫|완화|개선|교정|회복))/i;
const experience = /(?:써\s*보니|사용해\s*보니|사용한\s*후|제가\s*직접|저는\s*직접|만족했|만족스러웠|체감했|효과를\s*봤)/;
const factual = /(?:가능합니다|입니다[.!]?$|갖추고|제공합니다|지원합니다|유지합니다|줄여\s*줍니다|개선합니다|만들었습니다|탑재|함유|없습니다)/;

// Only explicit, dimension-safe conversions. Duration/year, purchase/rental and
// currencies are deliberately not interchangeable here.
export function quantities(text: string): string[] {
  const units: Record<string, [string, number]> = {
    kg: ['g', 1000], '㎏': ['g', 1000], '킬로그램': ['g', 1000], g: ['g', 1], '그램': ['g', 1],
    l: ['ml', 1000], '리터': ['ml', 1000], ml: ['ml', 1], '㎖': ['ml', 1],
    mm: ['mm', 1], '㎜': ['mm', 1], cm: ['mm', 10], '㎝': ['mm', 10], m: ['mm', 1000],
    '°': ['degrees', 1], '도': ['degrees', 1],
    '시간': ['minutes', 60], '분': ['minutes', 1], '%': ['percent', 1], '퍼센트': ['percent', 1],
    '만원': ['KRW', 10000], '원': ['KRW', 1],
  };
  return [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(킬로그램|그램|kg|g|리터|ml|㎖|l|㎏|mm|cm|㎜|㎝|m|°|도|시간|분|퍼센트|%|만원|원|개월|년|배|건|위)/gi)]
    .map(([, amount, rawUnit]) => { const unit = rawUnit.toLowerCase(); const [dimension, multiplier] = units[unit] || [unit, 1];
      return `${dimension}:${Number((Number(amount.replaceAll(',', '')) * multiplier).toFixed(8))}`; });
}

export function channelCompleteness(project: Project, document: ChannelDocument): { complete: boolean; missing: string[] } {
  const publicBlocks = document.blocks.filter(b => b.kind !== 'note' && !!b.text.trim());
  const text = publicBlocks.map(b => b.text.trim()).join('\n');
  const headings = publicBlocks.filter(b => b.kind === 'heading');
  const body = publicBlocks.filter(b => b.kind === 'paragraph' || b.kind === 'bullet');
  const substantive = body.filter(b => !/(?:작성해\s*주세요|넣어\s*주세요|추가해\s*주세요|확인해\s*보세요|내용\s*확인|추후\s*작성)/.test(b.text));
  const missing: string[] = [];
  if (!substantive.length) missing.push('제품과 고객 질문에 답하는 본문이 없습니다. 작성 지시와 확인 요청 대신 실제 설명을 써 주세요.');
  const grounded = substantive.filter(block => block.claimRefs.some(ref => project.claims.some(claim => claim.id === ref && claim.status === 'supported' &&
    claim.target !== 'competitor' && project.sources.some(source => source.id === claim.sourceId && source.publicationAllowed && source.origin !== 'external_response'))));
  if (!grounded.length) missing.push('제품의 확인된 세부 기능·조건을 설명하는 본문이 없습니다. 일반적인 선택 안내만으로는 완성 원고가 아닙니다.');
  if (['product_page', 'blog', 'youtube_description'].includes(document.channel) && project.questions.length &&
      !substantive.some(block => block.questionRefs?.some(ref => project.questions.some(question => question.id === ref))))
    missing.push('어떤 고객 질문에 답하는지 본문 구간을 연결해 주세요. 질문 목록만 나열하지 마세요.');
  // If the strategy assigns questions to channels, an unassigned channel
  // cannot become a finished asset merely by meeting its format checklist.
  const hasChannelPlan = project.answerPlans.some(plan => plan.channels.length);
  if (hasChannelPlan && ['ad_copy', 'press_release', 'product_page', 'blog', 'youtube_description'].includes(document.channel)) {
    const assigned = project.answerPlans.filter(plan => plan.channels.some(direction => direction.channel === document.channel));
    if (!assigned.length) missing.push('이 채널이 맡을 고객 질문과 작성 방향을 인사이트에서 정해 주세요.');
    else if (!substantive.some(block => block.questionRefs?.some(ref => assigned.some(plan => plan.questionId === ref))))
      missing.push('고객 질문에 답하는 본문 구간을 해당 채널의 작성 방향과 연결해 주세요.');
  }
  // The research response assigns questions to channels. A heading or a copied
  // questionRef alone cannot certify that the model-specific answer survived.
  if (['product_page', 'blog', 'youtube_description'].includes(document.channel)) {
    const assigned = project.answerPlans.filter(item => item.channels.some(direction => direction.channel === document.channel));
    if (project.questions.length && !assigned.length)
      missing.push('이 채널이 답할 고객 질문과 모델별 답변 방향을 인사이트에서 정해 주세요.');
    for (const plan of assigned) {
      const question = project.questions.find(item => item.id === plan.questionId);
      const answers = substantive.filter(block => block.questionRefs?.includes(plan.questionId));
      if (!answers.length) {
        missing.push(`고객 질문 “${question?.text || '확인할 질문'}”에 답하는 본문이 없습니다.`);
        continue;
      }
      const modelCodes = [...plan.applicableModel.matchAll(/\b[A-Z]{2,}[\w-]*\d[\w-]*\b/g)].map(match => match[0]);
      const model = modelCodes.length ? modelCodes : plan.applicableModel && !/미확인|미지정|조건 확인/.test(plan.applicableModel) ? [plan.applicableModel] : [];
      if (model.length && !model.some(value => answers.some(block => normalize(block.text).includes(normalize(value)))))
        missing.push(`고객 질문 “${question?.text || '확인할 질문'}”의 적용 모델 ${model.join(' 또는 ')}을(를) 답변 본문에 밝혀 주세요.`);
      const required = plan.claimIds.filter(id => project.claims.some(claim => claim.id === id && claim.status !== 'supported'));
      if (required.length && plan.directAnswer.trim())
        missing.push(`고객 질문 “${question?.text || '확인할 질문'}”의 핵심 근거가 아직 확인되지 않았습니다. 검토용 초안으로 보관해 주세요.`);
    }
  }
  switch (document.channel) {
    case 'ad_copy':
      if (headings.length < 3 || publicBlocks.filter(b => b.kind === 'cta').length < 3)
        missing.push('역할이 다른 광고 3안의 헤드라인·보조 문구·행동 안내를 각각 작성해 주세요.');
      if (new Set(headings.map(b => normalize(b.text))).size !== headings.length) missing.push('광고 제목이 반복됩니다.');
      break;
    case 'product_page':
      if (headings.length < 3 || substantive.length < 3) missing.push('상세페이지의 첫 화면·고객 문제·선택 이유·기능과 조건을 본문까지 써 주세요.');
      if (!/\?|FAQ|자주\s*묻|궁금/.test(text) || !/(?:구매|문의|신청|공식몰)/.test(text))
        missing.push('답이 있는 FAQ와 확인된 구매 안내를 보완해 주세요. 없는 가격·배송 조건은 만들지 마세요.');
      break;
    case 'blog':
      if (headings.length < 3 || substantive.length < 3) missing.push('제목 후보와 고객 질문의 첫 답·상황별 설명·선택 기준을 본문으로 풀어 주세요.');
      if (!project.questions.length) missing.push('이 글이 답할 고객 질문을 분석에서 먼저 정해 주세요.');
      break;
    case 'press_release':
      if (headings.length < 2 || substantive.length < 3) missing.push('보도자료의 제목·부제·첫 문단·전개된 본문·회사 소개를 작성해 주세요.');
      if (!project.sources.some(s => s.publicationAllowed && s.origin !== 'external_response' && /발표|출시|공식\s*소식/.test(s.title)))
        missing.push('발표 사건과 일자를 확인할 자료가 없습니다. 발표 내용 확인 전 초안으로만 제공해 주세요.');
      break;
    case 'youtube_description': {
      const titles = headings.filter(b => b.section?.includes('제목') || b.text.startsWith('['));
      if (!project.youtubePrefix) missing.push('브랜드와 제품군을 정해 유튜브 제목의 COWAY 또는 COWAY BEREX 표기를 확인해 주세요.');
      if (titles.length < 3) missing.push('제품명·영상 설명·핵심 기능을 담은 제목 후보 3안을 써 주세요.');
      for (const title of titles) {
        if (project.youtubePrefix && (!title.text.startsWith(`${project.youtubePrefix} ${project.name}`) || !title.text.includes(' | ')))
          missing.push('제목은 브랜드 표기와 공식 제품명 뒤에 영상 설명·핵심 기능을 이으세요.');
        if (title.text.length > 100) missing.push('유튜브 제목은 접두어와 편명을 포함해 100자를 넘지 않도록 고쳐 주세요.');
      }
      const description = body.map(b => b.text).join('\n');
      if (description.length > 5000) missing.push('유튜브 설명은 5,000자 이내로 정리해 주세요.');
      if (project.officialUrl && !description.includes(project.officialUrl)) missing.push('공식 제품 링크의 전체 주소를 본문 앞부분에 넣어 주세요.');
      if (substantive.length < 3 || !/(?:\?|FAQ|자주\s*묻)/.test(description)) missing.push('실제 영상 내용·모델별 기능과 조건·답이 있는 관련 질문을 본문에 정리해 주세요.');
      if (!project.sources.some(s => s.publicationAllowed && s.origin !== 'external_response' && /대본|영상/.test(s.title)))
        missing.push('영상·대본이 없어 영상 제작 전 초안입니다. 본 것처럼 쓰거나 타임스탬프를 만들지 마세요.');
      break;
    }
    case 'review_video':
      if (!project.sources.some(s => s.publicationAllowed && s.origin !== 'external_response' && s.sourceType === 'review'))
        missing.push('실제 후기·녹취가 없어 후기 촬영 가이드로만 제공합니다.');
      if (headings.length < 2 || substantive.length < 2) missing.push('인터뷰 질문·사용 장면·관찰 포인트를 구체적으로 작성해 주세요.');
      break;
  }
  return { complete: missing.length === 0, missing: [...new Set(missing)] };
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
      if (claim?.status === 'unreviewed' && claim.target === 'own' && source?.externalAiAllowed && source.excerpt) {
        add(block.id, '외부 조사에서 가져온 제품 사실입니다. 원문과 의미를 확인하기 전까지 검토용 초안입니다.', 'review');
        if (!/조사 응답 기반|원문.{0,5}확인 전|미확인.{0,5}초안/.test(block.text))
          add(block.id, '미확인 사실을 사용한 문단에 검토용 표기를 넣어 주세요.');
        if (claim.conditions && !normalize(block.text).includes(normalize(claim.conditions)))
          add(block.id, `적용 조건이 문구에서 빠졌습니다: ${claim.conditions}`);
      } else if (!claim || claim.status !== 'supported' || claim.target === 'unresolved') add(block.id, '확인되지 않은 주장이 문구에 연결되어 있습니다.');
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
  const completeness = channelCompleteness(project, document);
  warnings.push(...completeness.missing);
  const status = issues.some(i => i.severity === 'block') ? 'blocked' :
    project.insight.approval === 'outline' || (!project.claims.some(c => c.status === 'supported') &&
      !document.blocks.some(b => b.claimRefs.some(ref => project.claims.some(c => c.id === ref && c.status === 'unreviewed')))) ? 'outline' : 'needs_review';
  return { ...document, status, warnings: [...new Set(warnings)], validationHash: null,
    validation: { hash: fingerprint(JSON.stringify(document.blocks) + project.evidenceRevision), rulesVersion: validationRulesVersion,
      checkedAt: new Date().toISOString(), semanticMethod: 'not_run', issues } };
}
