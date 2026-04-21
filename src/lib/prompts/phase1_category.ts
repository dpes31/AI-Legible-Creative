/**
 * Phase 1: 카테고리 추론 프롬프트 생성
 * 
 * 왜 AI별로 프롬프트가 다른가:
 * - Gemini: 한국어 웹 데이터에 강함 → 경쟁사 정보 정확도 높음
 * - Claude: 구조화된 JSON 출력에 강함 → 분류 체계 안정적
 * - GPT: 범용 지식 폭이 넓음 → 카테고리 키워드 다양성
 */
export function generatePhase1Prompt(
  clientName: string,
  usp: string,
  ai: string
): string {
  const basePrompt = `다음 한국 브랜드와 핵심 소구포인트(USP)를 보고 카테고리 정보를 JSON으로 추론해 주세요.

브랜드/제품: ${clientName}
USP: ${usp}

반드시 아래 JSON 형식으로 출력해 주세요:
{
  "industry": "해당 산업/카테고리 (예: 창호/환기 시스템)",
  "category_keywords": ["카테고리 관련 핵심 검색 키워드 5~10개"],
  "competitors": ["국내 주요 경쟁 브랜드 3~5개"],
  "purchase_decision_factors": ["소비자 구매 결정 요인 5~7개"],
  "target_customer": "핵심 타깃 고객 프로필 한 문장"
}

조건:
- 한국 시장 기준으로 답변
- 경쟁사는 실제 존재하는 브랜드만 기재
- 카테고리 키워드는 소비자가 실제로 검색할 법한 자연어`;

  // AI별 미세 조정
  const aiSuffix: Record<string, string> = {
    gemini: '\n\n참고: 네이버 검색 트렌드 기반으로 한국 소비자의 실제 검색 패턴을 반영해 주세요.',
    claude: '\n\n출력은 반드시 유효한 JSON만 제공해 주세요. 부가 설명 없이 JSON 블록만 응답하세요.',
    gpt: '\n\n가능한 한 다양한 키워드와 경쟁사를 포함해 주세요. 글로벌 브랜드가 국내에도 진출한 경우 포함합니다.',
  };

  return basePrompt + (aiSuffix[ai] || '');
}
