# 운영 배포

## 접속 URL

GitHub Pages 접속 URL은 아래 주소를 사용합니다.

```text
운영: https://honeyper.github.io/Seungjin-inventory-system/
개발: https://honeyper.github.io/Seungjin-inventory-system/dev/
```

두 URL 모두 `frontend/index.html`을 로그인 화면으로 보여줍니다.

## 배포 방식

운영/개발 프론트는 GitHub Pages로 함께 배포합니다.

- 운영 배포 대상: `frontend/`를 Pages 루트로 복사
- 개발 배포 대상: `frontend/`를 Pages `dev/` 경로로 복사
- 배포 브랜치: `main`(PRD), `dev`(DEV)
- 운영 API 설정: `frontend/config.prod.js`를 `config.js`로 적용
- 개발 API 설정: `frontend/config.dev.js`를 `dev/config.js`로 적용
- 운영 API: PRD Apps Script Web App URL
- 개발 API: DEV Apps Script Web App URL

`main` 또는 `dev`의 프론트 변경을 push하면 `.github/workflows/pages.yml`이 두 브랜치를 함께 읽어 Pages에 배포합니다. 공통 배포 큐를 사용하므로 DEV 배포 완료를 확인한 후 PRD를 push합니다. CI에서 동일 검사를 실행할 설정은 `docs/ci-workflows.patch`에 있습니다. 현재 배포 토큰은 workflow 수정 권한이 없어 CI 변경은 적용하지 않았습니다. 로컬 검사를 통과한 뒤 배포해야 합니다.

## 서버별 저장소

Apps Script의 `APP_ENVIRONMENTS` 설정에서 시트와 드라이브 저장소를 분리합니다.

```text
운영 드라이브: https://drive.google.com/drive/folders/1iHb4bqT45OHkzvYZR8bfH943i071UdPV
개발 드라이브: https://drive.google.com/drive/folders/1nHvct8X2B7cX9cPHgq7F3A8x8EAlDQo3
```

사진과 첨부 파일은 실행 중인 Apps Script 환경에 맞는 드라이브 폴더 아래에 저장됩니다.

## 최초 1회 확인

GitHub 저장소 설정에서 Pages가 GitHub Actions 배포를 사용하도록 되어 있어야 합니다.

```text
Repository Settings > Pages > Build and deployment > Source: GitHub Actions
```

설정 후 `main`에 push하면 운영 URL이 열립니다.

## 변경 배포 체크

1. 현재 브랜치·원격·`git status --short`를 확인하고 `node tools/verify.mjs`를 실행합니다.
2. DEV에 변경을 반영합니다. Edge 변경이 있으면 DEV Edge를 먼저 배포하고 응답을 확인합니다.
3. DEV Pages 성공 및 브라우저 동작을 확인합니다.
4. PRD 고유 QR 스타일·캐시 경로를 보존하여 같은 변경을 PRD에 적용합니다. PRD Edge/Pages를 배포합니다.
5. 배포된 JS/CSS 내용과 캐시 버전, Pages 실행 결과를 확인합니다. 커밋 ID·Edge 버전·검사 결과를 인수인계합니다.

Edge 함수 `seungjin-dev-gateway`는 `index.ts`, `state-engine.js`, `request-errors.js`, `inventory-confirmation.js`, `backup-notifications.js`, `purchase-order-shipping.js`를 함께 배포합니다. 기존 사용자 세션 인증을 사용하므로 현재의 `verify_jwt=false` 설정을 임의로 바꾸지 않습니다. PRD/DEV의 `index.ts`, `state-engine.js`는 차이가 있으므로 통째로 덮어쓰지 않습니다.

## 복구

프론트 문제가 생기면 해당 환경의 문제 커밋을 `git revert`하여 재배포합니다. Edge 문제는 배포 전 저장한 **해당 환경**의 전체 함수 번들과 설정으로 복구합니다. 이전 번들에 없는 새 모듈의 import가 남지 않도록 확인합니다. 코드 복구만으로 업무 데이터를 되돌리거나 outbox를 삭제하지 않습니다.
