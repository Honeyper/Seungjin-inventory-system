# 운영 배포

## 운영 URL

GitHub Pages 운영 URL은 아래 주소를 사용합니다.

```text
https://honeyper.github.io/Seungjin-inventory-system/
```

이 URL은 `frontend/index.html`을 로그인 화면으로 보여줍니다.

## 배포 방식

운영 프론트는 GitHub Pages로 배포합니다.

- 배포 대상: `frontend/`
- 배포 브랜치: `main`
- API 설정: `frontend/config.js`
- 운영 API: PRD Apps Script Web App URL

`main` 브랜치에 push되면 `.github/workflows/pages.yml`이 실행되고 GitHub Pages에 자동 배포됩니다.

## 최초 1회 확인

GitHub 저장소 설정에서 Pages가 GitHub Actions 배포를 사용하도록 되어 있어야 합니다.

```text
Repository Settings > Pages > Build and deployment > Source: GitHub Actions
```

설정 후 `main`에 push하면 운영 URL이 열립니다.
