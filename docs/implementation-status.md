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
| W2 3화면·수동 경로 | 일부 완료 | 두 번의 구조화 응답으로 6채널 fixture 단위 검수. 실제 브라우저 흐름 미실행 |
| W3 분석·검증 | 일부 완료 | 원문 인용 대조·문장별 사람 확인·비교 제안 분리. 의미 판단·조건별 경쟁 검증 미완료 |
| W4 자동 경로 | 진행 중 | 인증·RLS SQL, 기능 검사·모의 공급자·단계 예약 코드. UI 동기화·비용 정산·실연결 미완료. 모든 환경변수를 채워도 유료 실행 차단, 호출 0회 |
| W5 6종 결과 | 일부 완료 | 독립 편집·복사·TXT·ZIP·백업 코드. 실제 브라우저 다운로드 검증 미실행 |
| W6 품질 검수 | 진행 중 | lint/typecheck/test/build 성공. Playwright 브라우저 다운로드 실패, 실기기 미실행 |
| W7 검수 제출 | 진행 중 | 로컬 실행 안내 작성. Preview·Draft PR 미작성 |

최근 로컬 검증: 구현 SHA `904b69a4069100bb12d02d2ab6374a9ff5788ca6`에서 `npm ci`, `npm run test` 20개 통과, `npm run lint`, `npm run typecheck`, `npm run build` 통과. 같은 셸의 로컬 서버에서 `/` HTML 응답과 `/api/capabilities` 미설정 503을 확인. `npm run test:e2e -- --project=chromium`은 실행했으나 브라우저 바이너리가 없어 2개 실패. `npx playwright install chromium`은 배포 CDN에서 압축 파일을 받지 못해 실패. Turbopack 캐시 오류 후 캐시를 별도 위치로 옮겨 빌드를 재실행해 통과. 실제 화면·실기기 통과로 계산하지 않음. `npm audit --omit=dev`: 운영 의존성 0건. 전체 개발 의존성 감사: 9건(중간 1, 높음 8), `concurrently` 제거로 critical 0건. 영향과 대체 버전 검토 없이 강제 업그레이드하지 않음.

원격 제출 차단: `git push`는 GitHub 인증이 없어 실패했고, 연결된 GitHub 도구의 브랜치 생성·blob 쓰기는 각각 `Resource not accessible by integration`(403)으로 거절됨. 로컬 커밋은 유지. GitHub 앱에 해당 저장소의 Contents 쓰기 권한이 복구될 때까지 원격 브랜치·Draft PR·Preview를 제출했다고 주장하지 않음.

다음 작업: 로컬 커밋 후 GitHub 쓰기 권한 연결을 회복하면 원격 브랜치·Draft PR·CI/Preview에서 E2E 확인·수정. 서버 실행 결과의 검증된 프로젝트 반영과 비용 정산·인증 UI, 실제 사례 품질 검수. 해당 작업 없이 W4/W6 전체 완료로 표시하지 않음.
