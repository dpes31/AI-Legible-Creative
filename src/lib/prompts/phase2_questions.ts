/**
 * Phase 2: 질문 역설계 프롬프트 생성
 * 
 * 핵심 원칙 (지침서 2.2):
 * "절대 금지: 프롬프트에 클라이언트명이나 USP를 긍정 조건으로 제시하지 않는다."
 * → AI가 동어반복 답변을 생성해 검증 의미가 사라지기 때문.
 * 
 * 대신 카테고리 키워드와 구매결정요인을 재료로 넣어서,
 * 소비자가 자연스럽게 AI에게 물어볼 법한 질문을 역설계한다.
 * 
 * MECE 원칙: 중복되는 의도 없이 최대 10개로 고정.
 */
export function generatePhase2Prompt(
  categoryKeywords: string[],
  purchaseFactors: string[],
  competitors: string[],
  ai: string
): string {
  const keywordsStr = categoryKeywords.join(', ');
  const factorsStr = purchaseFactors.join(', ');
  const competitorsStr = competitors.join(', ');

  const basePrompt = `당신은 한국 소비자의 AI 질문 패턴 전문가입니다.

아래 카테고리에서 한국 일반 소비자가 AI 챗봇(ChatGPT, Gemini, Perplexity 등)에 물어볼 법한 자연스러운 한국어 질문 10개를 생성해 주세요.

[카테고리 키워드]
${keywordsStr}

[소비자 구매 결정 요인]
${factorsStr}

[카테고리 내 주요 브랜드]
${competitorsStr}

===== 반드시 지켜야 할 규칙 =====

1. ❌ 특정 브랜드명을 질문에 절대 포함하지 마세요
2. ✅ 실제 소비자가 구어체로 물어볼 법한 자연스러운 말투
3. ✅ MECE 원칙: 10개 질문이 서로 중복되지 않는 고유한 의도를 가져야 함
4. ✅ 의도 분배:
   - 추천 요청: 3개 (예: "~~ 추천해줘")
   - 비교 질문: 2개 (예: "A vs B 뭐가 나아?", 단 브랜드명 대신 특징으로)
   - 기능/성능 질문: 3개 (예: "~~ 기능이 실제로 효과 있어?")
   - 가격/신뢰성: 2개 (예: "~~ 가성비 좋은 거 있어?")

===== 출력 형식 (JSON) =====
[
  { "id": 1, "question": "질문 내용", "intent": "추천" },
  { "id": 2, "question": "질문 내용", "intent": "비교" },
  ...
]`;

  const aiSuffix: Record<string, string> = {
    gemini: '\n\n네이버 지식인이나 카페에서 실제로 올라올 법한 질문 톤으로 작성해 주세요.',
    claude: '\n\n출력은 반드시 유효한 JSON 배열만 제공해 주세요. 부가 설명 없이 JSON만 응답하세요.',
    gpt: '\n\n각 질문이 AI가 답변했을 때, 특정 브랜드가 1순위로 언급될 수 있는 구체적인 기능/특징 기반의 질문이 되도록 해 주세요.',
  };

  return basePrompt + (aiSuffix[ai] || '');
}
