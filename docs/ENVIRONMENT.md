# 운영/개발 환경 분리

## 환경

| 환경 | 용도 | Google Sheet ID |
| --- | --- | --- |
| PRD | 실제 운영 데이터 | `1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI` |
| DEV | 개발/테스트 데이터 | `1__av_Ww7cuUeVrqPgtDRwGsbI0gmfqppxcULpI4WIhg` |

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

## 아직 분리 필요

현재 Drive 폴더 ID는 PRD/DEV가 같은 값을 사용합니다. 운영 파일과 테스트 파일을 완전히 분리하려면 아래 폴더도 DEV용으로 새로 만들고 `APP_ENVIRONMENTS.dev`에 반영해야 합니다.

- 거래명세표 저장 폴더
- 출고/입고 불량사진 저장 폴더
