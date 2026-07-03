# 운영/개발 환경 분리

## 환경

| 환경 | 용도 | Google Sheet ID |
| --- | --- | --- |
| PRD | 실제 운영 데이터 | `1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI` |
| DEV | 개발/테스트 데이터 | `1__av_Ww7cuUeVrqPgtDRwGsbI0gmfqppxcULpI4WIhg` |

## Apps Script

| 환경 | Script ID | Web App URL |
| --- | --- | --- |
| PRD | `1Fk0-HC_EFMXUbu-DcKoKXy2jkuFc1_rI7boX838uRjnntaXC7HYjik1U` | `https://script.google.com/macros/s/AKfycbyPiTM2wEZ5d549g0R8pqLQB2FKE0Hz-7h_GYGfA_MVUq45-F3tTyITbT4A-yJ1ZldOCA/exec` |
| DEV | `1_hEv8hS-RslSbT4J1hYHMvdHwoHgRvs2vLsNBdXrbyxZFiUgbfT_5c4T` | `https://script.google.com/macros/s/AKfycbzSz-9IspdGb_wcAIUVhokQdQR0egaiR5M1sJ9PQVX5pjm_w7-FPU3gaj-cmLwjAvxvsg/exec` |

## Apps Script 환경 선택

Apps Script의 Script Property `APP_ENV` 값으로 사용할 시트를 선택합니다.

- PRD: `APP_ENV=prod`
- DEV: `APP_ENV=dev`

Apps Script 편집기에서 아래 함수를 한 번 실행해도 됩니다.

```js
setAppEnvironmentProd();
setAppEnvironmentDev();
```

환경 설정 후 `healthCheck` 또는 웹앱 `GET` 응답에서 `env`, `envLabel`, `spreadsheetName`을 확인합니다.

## 프론트 API URL

프론트는 `frontend/config.js`의 `API_URL`을 우선 사용합니다.

```js
window.SEUNGJIN_CONFIG = {
  ENV: "prod",
  API_URL: "운영 또는 개발 Apps Script Web App URL"
};
```

DEV용 Apps Script Web App URL이 생기면 `ENV`를 `"dev"`로 바꾸고 `API_URL`을 DEV URL로 바꿔서 사용합니다.

환경별 프론트 설정 파일은 아래처럼 관리합니다.

```text
frontend/config.prod.js  운영 API URL
frontend/config.dev.js   개발 API URL
frontend/config.js       실제 화면에서 읽는 설정
```

운영 화면은 `config.prod.js` 내용을 `config.js`로, 개발 화면은 `config.dev.js` 내용을 `config.js`로 사용합니다.

## 배포 도구

Apps Script 배포 정보는 `tools/apps-script-env.json`에 저장합니다.

```bash
node tools/apps-script-deploy.cjs . deploy prod
node tools/apps-script-deploy.cjs . deploy dev
node tools/apps-script-deploy.cjs . list dev
```

새 DEV Apps Script 프로젝트는 이미 생성되어 있습니다. Google에서 새 스크립트 권한 승인이 필요하다고 막는 경우 Apps Script 편집기에서 DEV 프로젝트를 열고 `healthCheck` 또는 `setAppEnvironmentDev`를 한 번 실행해 권한을 승인합니다.

## 아직 분리 필요

현재 Drive 폴더 ID는 PRD/DEV가 같은 값을 사용합니다. 운영 파일과 테스트 파일을 완전히 분리하려면 아래 폴더도 DEV용으로 새로 만들고 `APP_ENVIRONMENTS.dev`에 반영해야 합니다.

- 거래명세표 저장 폴더
- 출고/입고 불량사진 저장 폴더
