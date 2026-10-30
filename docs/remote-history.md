# GitHub 연결 복구와 커밋 이력

2026-10-20 Contents 쓰기 권한 복구를 실제 브랜치 생성·tree 작성·commit 작성·ref 갱신으로 확인했다. CLI의 git push 인증은 별도로 없으므로 GitHub 연결 도구로 반영했다.

단계별 커밋 메시지와 순서를 보존했다. 연결 도구가 새 커밋 메타데이터를 작성하므로 SHA는 달라지지만 **각 단계의 tree SHA(전체 파일 내용·경로·모드)는 원래 로컬 커밋과 동일함을 검사했다.** 커밋 메시지의 Original-Local-Commit에도 원래 SHA를 남겼다. 기존 로컬 이력은 `checkpoint/evidence-v2-local-20261020`에 보존하고, 작업 브랜치는 실제 원격 이력을 따라가도록 전환했다. main과 원격 기존 브랜치에 force push하지 않았다.

| 원래 로컬 커밋 | GitHub 커밋 | 파일 tree 검증 |
|---|---|---|
+| `1f6c9db9454bcc62cce7657cc2425630613b0b94` | `f84d9f0af5b372535d6f4047bd6e5df871a99fa1` | 동일 |
| `c7336cb345ebf2514a6d3283269a87062b9de849` | `59238637bec111f418bebbc437d6131949edc56e` | 동일 |
| `9ad39801e3ec87c3eb5fa4fbdb04956cc65a198d` | `c1cd557dfa9b3e5a4dfc906887c4a1aec3eec9a1` | 동일 |
| `57a0c5ddc9e6fc0f9e5e933d4a006e2651ba8035` | `a51499820c45d69f485d29d865ff8a4a36d24c3e` | 동일 |
| `706b036df6be0523e1c9c9f0dd66e4549321008d` | `ad4c808f91780a2c9d12a268c1efc1ad7443cd4e` | 동일 |
| `2aa81a0f1e486b9681cf2e2fc58f132c5664b24e` | `115aca8b1ebcb48be2aec0976ea687b4faeee193` | 동일 |
| `187dfa9e08a0cf864d8ca34dd2e915b3cc071c56` | `e27ac183e0f704c281977dd7dbaf6e4d406ff167` | 동일 |
| `8b29c0314d4e8fd3564052426f022a643a1b1037` | `44d1af6df798b5d91de5b835273560fa5fb177ff` | 동일 |
| `3c95840a257e9e76cfd82c29dfcc4274a86f91ea` | `ea18038be1e30ba843161f25f50c000cfb9d99e5` | 동일 |
| `904b69a4069100bb12d02d2ab6374a9ff5788ca6` | `0c3d93b64697f1d831c1859116b3c6d76739ee60` | 동일 |
| `2c09cd144dcfab9e0409f01717f50fad467f0e42` | `ecf197d9e4ff834327d21ed24fda611158d85851` | 동일 |
| `af5d1d1b82c7e6d8010717d36a8b2d901ff0b438` | `daa9653f2341fad877633c80ae88058f98661832` | 동일 |
| `64b9cc9a7375bf1fcf6c8588a988403a08bbd78a` | `c2187f499d1fd8e269b65a13334a745cc9726482` | 동일 |
| `68ddeaa72a11e4b1202fbf2ac827594a504bb26b` | `6b9afcb29cfc9f39ff92ef075eb1a702bfd83c04` | 동일 |
| `05ec5623b686cd1ba93025ee604da33c5835c2be` | `d3b8d8f5a3f6bfea77a9e60562674811b10024b9` | 동일 |
| `c10e5b71ad3262bc2faa041f2e26428f2d378f97` | `a877062b4f4d5c51f4b7c6d017fb340178af6c58` | 동일 |
| `686245d348856250a7be357b283fac6b4eb7b3ea` | `5f50e743d67e2090a02030b64b418450e927b899` | 동일 |
| `8f2991c579f80c1425ab9c5b7fb01dad69afd859` | `e9ebafa0fbabdc1d1375b2273d738b3167625a37` | 동일 |

이 표 이후의 변경은 GitHub 테스트 브랜치의 현재 HEAD를 부모로 하는 새 커밋으로 추가한다. 반환된 tree SHA를 로컬 index tree와 대조하고 원격 HEAD 예상값 검사를 거친다. 업로드 중 다른 변경이 발견되면 중단하고 그 변경을 먼저 읽는다.
