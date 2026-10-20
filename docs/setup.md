# 검수판 실행과 자료 옮기기

1. 저장소의 `refactor/evidence-workflow-v2` 브랜치를 받습니다.
2. Node.js 22 환경에서 `npm ci`, `npm run dev`를 실행합니다.
3. `http://localhost:3000`을 열고 가상 브랜드라도 이름·목적·고객 상황을 넣습니다. 직접 방식이 기본입니다.
4. 분석 확인에서 조사 요청문을 복사해 외부 AI에 보내고 JSON 응답을 붙여넣습니다. 출처는 AI가 제시한 문장만으로 검증되지 않습니다. 실제 원문을 읽고 붙여넣은 뒤 해당 주장을 확인합니다.
5. 결과 받기에서 작성 요청문을 복사해 다시 보내고 채널별 응답을 붙여넣습니다. 각 문서를 수정·복사·다운로드할 수 있습니다. `검토용 초안` 표시는 공개 전 확인이 필요하다는 뜻입니다.
6. 설정에서 현재 작업의 JSON 백업을 받습니다. 다른 주소의 검수판에서는 해당 파일을 가져옵니다. 운영 주소의 localStorage는 다른 Preview 주소에서 직접 읽을 수 없습니다. 예전 운영 앱에는 새 설정 화면이 없으므로 Preview에서 예전 원본을 자동으로 읽거나 내려받을 수 없습니다. 운영 주소에 새 버전을 배포한 **뒤**에는 같은 주소에서 원본을 백업하고 자동 이전할 수 있습니다. 운영 전 자료를 Preview로 옮기는 방법은 원본 파일을 먼저 확보한 경우에만 이용합니다.

개인 인증·클라우드 저장을 실제로 연결할 때는 별도의 Supabase 검수 프로젝트를 준비하고 `supabase/migrations/202610200001_evidence_v2.sql`을 검토 후 적용합니다. 공개 회원가입을 끄고 소유자 계정만 허용합니다. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_OWNER_EMAIL`은 해당 검수 프로젝트 값으로 **배포 환경**에 설정합니다. 세 값 중 하나라도 빠지면 서버 개인 작업이 열리지 않습니다. 실제 값을 Git·채팅·프로젝트 입력란에 붙여넣지 않습니다. 이 브랜치 UI는 아직 서버 프로젝트 동기화와 로그인 흐름이 완성되지 않았습니다.

OpenAI 연결 후보는 `OPENAI_API_KEY`, `OPENAI_RESEARCH_MODEL`, `OPENAI_WRITE_MODEL`, `OPENAI_VALIDATE_MODEL`을 서버 환경에 설정합니다. `PAID_EXECUTION_ENABLED=false`가 기본이며 계정·예산 D2 승인 전 변경하지 않습니다. 가격표 검토 날짜 `OPENAI_PRICE_CONFIRMED_AT`, 실행 예약액 `RUN_RESERVE_USD`, 전체 승인 총액 `APPROVED_TOTAL_USD`와 DB의 개인 예산 행까지 준비해야 합니다. 현재 비용 정산·결과 반영이 끝나지 않아 모든 값을 넣어도 실제 유료 호출은 코드에서 차단됩니다. 이 항목들을 활성화 대상으로 간주하지 마세요.

Preview는 Vercel Deployment Protection 등 실제 접근 제어를 확인하고 공유합니다. `noindex`는 검색 제외 요청일 뿐 접근 제어가 아닙니다. 운영 도메인·운영 DB·운영 환경변수는 변경하지 않습니다.
