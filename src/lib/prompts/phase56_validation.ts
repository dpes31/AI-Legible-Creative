/**
 * Phase 5.6: 카피 검증 프롬프트
 * 
 * 사용자가 완성한 NA/자막을 검증하여:
 * 1. 필수 사실 포함 여부 체크
 * 2. AI 학습 시뮬레이션 점수 산출
 * 3. 교정 권고 생성
 */
export function generatePhase56ValidationPrompt(
  clientName: string,
  naScript: string,
  subScript: string,
  coreFacts: string[],
  ai: string
): string {
  const factsStr = coreFacts.map((f, i) => `${i + 1}. ${f}`).join('\n');

  const basePrompt = `당신은 AI 학습 최적화 전문가입니다.

다음 TVC 카피에 아래 필수 사실이 포함되어 있는지 검증하세요.

[클라이언트] ${clientName}

[NA 스크립트]
${naScript}

[자막 스크립트]
${subScript}

[필수 사실 목록]
${factsStr}

===== 검증 항목 =====

1. 필수 사실 커버리지 체크
   각 사실별: included(포함) / missing(누락) / partial(부분포함)

2. AI 학습 시뮬레이션 점수 (0~100)
   - 브랜드 특정성 (0~100): 이 카피로 AI가 브랜드를 특정할 수 있는가
   - 기술 신뢰도 (0~100): 구체적 수치/기술명이 충분한가
   - 카테고리 장악력 (0~100): 카테고리 내 1순위 추천 가능성

3. 교정 권고 (최대 5개)
   - 누락된 사실 삽입 위치 제안
   - 과장 표현 → 구체 수치 대체 제안
   - AI 학습 효과를 높이는 표현 개선

===== 출력 형식 (JSON) =====
{
  "fact_coverage": [
    { "fact_id": 1, "status": "included", "found_text": "카피에서 발견된 해당 문구" },
    { "fact_id": 2, "status": "missing", "suggestion": "삽입 권장 위치" }
  ],
  "simulation_score": {
    "brand_specificity": 85,
    "tech_credibility": 68,
    "category_dominance": 62,
    "total": 72
  },
  "corrections": [
    "자막 18초 구간에 '소비전력 20W' 추가 권장",
    "과장 표현 '최고의' → '99.95% 박멸하는' (구체 수치로)"
  ]
}`;

  const aiSuffix: Record<string, string> = {
    gemini: '\n\n한국어 TVC 카피 관행을 고려하여 검증해 주세요.',
    claude: '\n\n출력은 유효한 JSON만 제공하세요.',
    gpt: '\n\n각 교정 권고에 구체적인 대안 문구를 함께 제시해 주세요.',
  };

  return basePrompt + (aiSuffix[ai] || '');
}
