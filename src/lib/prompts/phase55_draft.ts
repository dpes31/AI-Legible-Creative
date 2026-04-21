/**
 * Phase 5.5: TVC 초안 생성 프롬프트
 * 
 * 핵심: 수정불가 영역(사실 문장)을 명시적으로 포함한 TVC 스크립트 생성.
 * 카피라이터는 감성 카피만 수정 가능하고, 사실 문장은 원문 그대로 유지해야 함.
 */
export function generatePhase55Prompt(
  clientName: string,
  usp: string,
  coreFacts: string[], // Phase 4에서 확정된 핵심 사실들
  ai: string
): string {
  const factsStr = coreFacts.map((f, i) => `${i + 1}. ${f}`).join('\n');

  const basePrompt = `당신은 TVC 카피라이터입니다.

다음 사실을 반드시 포함하는 TVC 30초 카피 초안을 3개 시안으로 작성하세요.

[클라이언트] ${clientName}
[USP] ${usp}

[필수 포함 사실 — 원문 그대로 유지]
${factsStr}

===== 출력 형식 =====

각 시안별로 아래 형식:

[시안 A: (톤 설명)]

(NA 1~5초) "후킹 카피"
  └ 수정 가능 (감성 후킹)

(자막 6~12초) "${clientName} ${usp}"
  └ 수정 불가 (브랜드명)

(NA 6~18초) "[필수 사실 #1 원문 그대로]"
  └ 수정 불가 (필수 사실)

(NA 19~24초) "[필수 사실 #2 원문 그대로]"
  └ 수정 불가 (필수 사실)

(자막 25~30초) "클로징 카피"
  └ 수정 가능 (클로징)

[필수 사실 커버리지 체크]
✓ 포함된 사실
✗ 미포함 사실 → 블로그/보도자료에서 보완 권장

===== 조건 =====
- 3개 시안의 톤을 다르게 (신뢰형 / 감성형 / 도전형)
- 필수 사실은 절대 의역하지 않고 원문 그대로
- 15초 축약 버전도 각 시안별 추가`;

  const aiSuffix: Record<string, string> = {
    gemini: '\n\n한국 TVC 관행에 맞는 자연스러운 어투로 작성해 주세요.',
    claude: '\n\n각 시안의 구조를 위 형식대로 정확히 따라 주세요.',
    gpt: '\n\n감성 후킹과 사실 문장의 자연스러운 연결에 집중해 주세요.',
  };

  return basePrompt + (aiSuffix[ai] || '');
}
