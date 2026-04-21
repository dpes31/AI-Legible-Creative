/**
 * Phase 3: Before 측정용 프롬프트 생성
 * 
 * 목적: Phase 2에서 역설계한 질문을 4대 AI에 직접 투입하여
 * 현재 우리 브랜드가 언급되는지 확인.
 * 
 * 수동 모드에서는 이 프롬프트를 복사해서 각 AI에 직접 질문한다.
 * AI의 응답에서 우리 브랜드가 언급되었는지만 체크하면 된다.
 */
export function generatePhase3Prompt(
  question: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ai: string
): string {
  // Phase 3에서는 프롬프트 조작 없이 순수하게 소비자 질문만 던진다.
  // 왜: AI가 현재 알고 있는 그대로를 측정하는 것이 목적이므로,
  // 어떤 힌트도 주면 안 된다.
  return question;
}

/**
 * Phase 3 결과 분석 안내 텍스트
 * 사용자가 AI 응답을 받은 후 어떻게 체크해야 하는지 가이드
 */
export function getPhase3Guide(clientName: string): string {
  return `각 AI의 응답에서 다음을 확인하세요:

✅ 언급됨: "${clientName}" 또는 브랜드/제품명이 직접 언급됨
△ 부분 언급: 제품 특성은 언급되었으나 브랜드명은 빠짐
❌ 미언급: 경쟁사만 언급되거나 일반론만 답변

Tip: 같은 질문을 2~3번 반복해서 물어보면 더 정확합니다.
AI는 매번 다르게 답할 수 있으므로, 과반수 기준으로 판단하세요.`;
}
