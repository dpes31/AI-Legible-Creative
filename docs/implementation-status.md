# 개발 진행 기록

- 작업 브랜치: `refactor/evidence-workflow-v2`
- 감사 기준 main: `62bb391a8b60a348006ccd09d74da0c6010039a9`
- 작업 시작 시 원격 main: `62bb391a8b60a348006ccd09d74da0c6010039a9`
- 운영 배포·메인 변경: 없음
- 기존 사용자 브라우저의 자료: 접근하지 않았음. 새 버전의 설정에서 원본 백업·파일 이전 지원. 운영 주소의 실제 자료 이전은 미실행.

| 단계 | 상태 | 확인할 사항 |
|---|---|---|
| W0 기준 보존 | 완료 | `1f6c9db`, main 불변, 이전 원본 형식 fixture |
| W1 기반·도메인 | 일부 완료 | `c7336cb` 기반 업그레이드, `9ad3980` 로컬 프로젝트·revision·이전 자료. 서버와 동일 도메인 검증은 미완료 |
| W2 3화면·수동 경로 | 일부 완료 | 두 번의 구조화 응답으로 6채널 fixture 단위 검수. 자유 형식은 지정 채널의 검토용 초안으로 보존. 실제 브라우저 흐름 미실행 |
| W3 분석·검증 | 일부 완료 | 원문 인용 대조·문장별 사람 확인·근거 없는 경쟁 우위 보류. 의미 판단·조건별 경쟁 검증 미완료 |
| W4 자동 경로 | 진행 중 | 인증·RLS SQL, 기능 검사·모의 공급자·단계 예약 코드. UI 동기화·비용 정산·실연결 미완료. 모든 환경변수를 채워도 유료 실행 차단, 호출 0회 |
| W5 6종 결과 | 일부 완료 | 독립 편집·복사·TXT·ZIP·백업 코드. 실제 브라우저 다운로드 검증 미실행 |
| W6 품질 검수 | 진행 중 | lint/typecheck/test/build 성공. CI Chromium·WebKit 실행 시작. 상세 결과는 검수표. 실기기 미실행 |
| W7 검수 제출 | 진행 중 | 원격 브랜치·Draft PR #2·보호된 Preview 생성. 전체 구현 완료·병합 요청 아님 |

최근 로컬 검증: 구현 SHA `c10e5b71ad3262bc2faa041f2e26428f2d378f97`에서 `npm ci`, `npm run test` 22개 통과, `npm run lint`, `npm run typecheck`, `npm run build` 통과. 같은 셸의 로컬 서버에서 `/` HTML 응답과 `/api/capabilities` 미설정 503을 확인. `npm run test:e2e -- --project=chromium`은 실행했으나 브라우저 바이너리가 없어 2개 실패. `npx playwright install chromium`은 배포 CDN에서 압축 파일을 받지 못해 실패. Turbopack 캐시 오류 후 캐시를 별도 위치로 옮겨 빌드를 재실행해 통과. 실제 화면·실기기 통과로 계산하지 않음. `npm audit --omit=dev`: 운영 의존성 0건. 전체 개발 의존성 감사: 9건(중간 1, 높음 8), `concurrently` 제거로 critical 0건. 영향과 대체 버전 검토 없이 강제 업그레이드하지 않음.

## 2026-10-20 연결 복구·디자인 병행

- Contents 쓰기 권한: 실제 테스트 브랜치 생성·18개 단계별 commit/tree 작성·ref 갱신 성공. 원래 로컬 이력과 원격 이력의 모든 tree가 같다. SHA 대응은 [이력 기록](remote-history.md).
- [Draft PR #2](https://github.com/dpes31/AI-Legible-Creative/pull/2): draft, main 미병합.
- 첫 디자인 포함 구현 SHA: `e9ebafa0fbabdc1d1375b2273d738b3167625a37`. 로컬 `8f2991c579f80c1425ab9c5b7fb01dad69afd859`와 파일 내용 동일.
- 해당 SHA의 [Preview](https://ai-legible-creative-aaq07vhtm-dpes31s-projects.vercel.app/): Vercel READY, target=preview(null). 기존 보호 설정 유지. 운영 도메인·환경변수·DB 변경 없음.
- Preview 화면 접근은 정상 Vercel 로그인이 필요하다. 임시 인증 우회 링크 생성 방식은 자동 승인 검토에서 접근 범위 확대 사유로 거절됐다. 우회 링크를 만들거나 보호를 해제하지 않았다. 일반 접속에서 로그인 화면까지 확인했다.
- 디자인: `DESIGN.md`, `docs/design-plan.md`. 첫 입력 화면의 세 묶음, 공통 토큰·헤더·접근성·선택 상태·reduced motion을 반영. 분석/결과의 상세 디자인 D2~D4는 미완료.
- CI 최초 실행(run 39420580012): 설치·lint·typecheck·22개 단위·브라우저 설치 통과. 320px 가로 넘침 Chromium/WebKit 2개 통과. 수동 경로 2개는 중복 텍스트 locator 오류로 실패, build 단계는 미실행.
- 실패 원인에 맞춰 편집 입력값을 직접 검사하도록 수정하고, 채널 선택을 URL에 보존하는 코드를 추가했다. 6개 화면 폭·모드 변경과 CI 스크린샷 보관을 추가했다. 수정 후 실행 결과는 검수표에 이어 기록한다.

다음 작업: 수정한 E2E의 CI 결과 확인 → 실제 화면 확인·수정 → D2 분석 요약·비교 조건과 D3 결과 근거 패널 연결. 서버 실행 결과의 검증된 프로젝트 반영과 비용 정산·인증 UI, 실제 사례 품질 검수도 남아 있다. 해당 작업 없이 W4/W6 전체 완료로 표시하지 않는다.
