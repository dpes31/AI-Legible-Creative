# 근거 있는 브랜드 문구 — 검수 브랜치

사용자는 **정보 입력 → 분석 확인 → 결과 받기**로 진행합니다. 수동 방식은 API 키 없이 조사 요청문을 외부 AI에 보내고 응답을 붙여넣은 다음, 원문을 확인해 채널별 작성 요청문을 보냅니다. 여섯 결과물은 독립 문서로 저장됩니다. 이 브랜치의 예시는 실제 상품이나 실적이 아닌 허구 자료입니다.

```bash
npm ci
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 입력과 결과는 **그 브라우저의 IndexedDB**에 남습니다. 설정에서 현재 프로젝트 JSON 백업, 예전 앱의 원본 백업 및 다른 주소에서 받은 파일 가져오기를 이용할 수 있습니다. 다른 기기와 자동 동기화하지 않습니다.

```bash
npm run lint
npm run typecheck
npm run test
npx playwright install chromium webkit
npm run test:e2e
npm run build
```

자동 분석용 서버 코드는 비용 차단이 기본입니다. 실제 계정·가격·예산·서버 저장이 연결되지 않은 상태에서 키만 넣어도 실사용 준비가 되었다고 표시하지 않습니다. 서버 자동 실행 결과를 로컬 3단계 화면과 안전하게 동기화하는 작업과 실제 유료 연결 검수는 아직 남았습니다. [설정 안내](docs/setup.md), [구조와 한계](docs/architecture.md), [검수 기록](docs/review-checklist.md)을 보세요.

이 브랜치는 운영 환경을 바꾸지 않습니다. 메인 병합과 운영 배포는 별도 승인 이후입니다.
