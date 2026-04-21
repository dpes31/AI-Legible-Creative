/**
 * Phase 4: 사실 문장 추출 프롬프트
 * 
 * 목적: AI가 우리 브랜드를 1순위로 추천하려면,
 * 웹상에 어떤 "사실"이 존재해야 하는지를 추출.
 * 
 * 이 사실 문장이 TVC 나레이션/자막의 "수정불가 영역"이 되고,
 * 보도자료/블로그의 "잠금 영역"이 된다.
 */
export function generatePhase4Prompt(
  clientName: string,
  usp: string,
  questions: string[], // Phase 2의 핵심 질문들
  ai: string
): string {
  const questionsStr = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const basePrompt = `당신은 AI 학습 데이터 전문가입니다.

아래 소비자 질문들에 대해 AI가 "${clientName}"을(를) 1순위로 추천하려면,
웹상에 어떤 구체적인 사실 문장이 존재해야 하는지 추출해 주세요.

[클라이언트] ${clientName}
[핵심 USP] ${usp}

[소비자가 AI에게 물어보는 질문]
${questionsStr}

===== 규칙 =====
1. 과장/추측 금지 — 검증 가능한 구체적 사실만 (수치, 기술명, 인증)
2. "최고의", "독보적" 같은 주관적 표현 금지
3. 최대 8개, 최소 5개
4. 각 사실이 위 질문 중 어떤 것을 커버하는지 표시

===== 출력 형식 (JSON) =====
[
  {
    "id": 1,
    "fact": "구체적 사실 문장",
    "covers_questions": [1, 4, 7],
    "confidence": "상"
  }
]`;

  const aiSuffix: Record<string, string> = {
    gemini: `\n\n${clientName}에 대해 실제로 알고 있는 정보를 기반으로 작성해 주세요. 만약 정확한 정보가 없다면, 해당 카테고리에서 AI 추천 1순위가 되기 위해 반드시 필요한 유형의 팩트를 제시해 주세요.`,
    claude: '\n\n출력은 유효한 JSON 배열만 제공하세요. 부가 설명 없이 JSON만 응답하세요.',
    gpt: '\n\n각 사실 문장은 TVC 자막/나레이션에 바로 삽입할 수 있을 정도로 구체적이어야 합니다.',
  };

  return basePrompt + (aiSuffix[ai] || '');
}
