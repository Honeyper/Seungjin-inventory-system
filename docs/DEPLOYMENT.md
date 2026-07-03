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
- 배포 브랜치: `main`
- 운영 API 설정: `frontend/config.prod.js`를 `config.js`로 적용
- 개발 API 설정: `frontend/config.dev.js`를 `dev/config.js`로 적용
- 운영 API: PRD Apps Script Web App URL
- 개발 API: DEV Apps Script Web App URL

`main` 브랜치에 push되면 `.github/workflows/pages.yml`이 실행되고 GitHub Pages에 자동 배포됩니다.

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
