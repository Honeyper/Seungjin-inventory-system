# 승진 재고관리 시스템

제품·발주·입고·박스 재고·검수·출고·생산계획을 관리하는 PC 및 모바일 웹 프로그램입니다. 별도 프론트 빌드 없이 GitHub Pages에서 실행됩니다.

## 처음 시작하기

1. Node.js 22.18 이상을 준비합니다.
2. `node tools/verify.mjs`로 문법·회귀 테스트·diff 검사를 실행합니다. 기본 검사는 외부 서비스 연결이나 추가 패키지가 필요 없습니다.
3. 로컬 화면은 DEV 설정으로 복사한 임시 디렉터리에서 실행합니다.

```sh
preview_dir="$(mktemp -d)"
cp -R frontend/. "$preview_dir/"
cp frontend/config.dev.js "$preview_dir/config.js"
python3 -m http.server 8000 --directory "$preview_dir"
```

PC는 `http://127.0.0.1:8000/`, 모바일은 `/mobile/`입니다. DEV 로그인에도 실제 개발 계정이 필요합니다. 업무 데이터 없이 화면과 오류 복구를 검사하려면 아래 브라우저 검사를 사용합니다.

## 코드 구조

| 위치 | 책임 |
| --- | --- |
| `frontend/admin.js` | PC 화면 상태, 폼, 업무 흐름 |
| `frontend/mobile/mobile.js` | 모바일 QR 스캔, 검수·출고·위치 이동 |
| `frontend/http-client.js` | 공통 통신, 제한 시간, 조회 재시도, 응답 오류 |
| `frontend/supabase-gateway.js` | 세션, API 경로 선택, 동시 조회 중복 제거 |
| `frontend/attachments.js` | 파일 검증·읽기, 명세서 최적화, 업로드 결과 재사용, 전송 동시성 |
| `frontend/qr-*.js`, `qr-*.css` | 박스 QR 데이터, 라벨·인쇄 레이아웃 |
| `frontend/*-sort.js`, `production-planner.js` | 정렬·생산계획 계산 모듈 |
| `supabase/functions/seungjin-dev-gateway/` | 인증, 데이터 조회, 업무 검증, 원자적 변경, Sheets 동기화 |
| `supabase/migrations/` | 데이터베이스 스키마·RPC 변경 이력 |
| `gas/Code.js` | 계정 확인, Drive 첨부, Google Sheets 사본 처리 |
| `tests/` | Node 기본 테스트 러너를 사용하는 자동 검사 |
| `tools/` | 검증, 브라우저 검사, 배포 보조 도구 |

## 데이터와 환경

Supabase가 업무 데이터 원본입니다. Google Sheets는 매일 20:10에 동기화하고 실패 건은 21:10에 재시도하는 사본입니다. Drive에는 사진·거래명세서를 저장합니다. PRD와 DEV는 Supabase·Sheets·Drive가 분리되어 있습니다.

- [구조와 유지보수 규칙](docs/MAINTENANCE.md)
- [환경 식별자와 설정](docs/ENVIRONMENT.md)
- [배포 및 복구](docs/DEPLOYMENT.md)
- [이번 코드·데이터 점검 결과](docs/RELIABILITY_REVIEW_2026-09-18.md)
- [데이터 무결성 조회 SQL](tools/audit-data.sql)

## 브라우저 검사

`tools/browser-smoke.cjs`는 외부 요청을 차단한 독립 브라우저에서 실제 HTML/JS를 읽고 가짜 API 응답으로 검사합니다. 운영 계정이나 업무 데이터를 사용하지 않습니다.

Playwright가 설치된 개발 환경에서:

```sh
node tools/browser-smoke.cjs
```

별도 런타임의 Playwright를 사용할 때는 `PLAYWRIGHT_MODULE`에 모듈 경로, 설치된 Chrome을 사용할 때는 `CHROME_BIN`에 실행 파일 경로를 지정할 수 있습니다. 검증 항목은 PC·모바일 중복 로그인, 오류 후 버튼 복구, 손상된 세션, 관리자 7개 화면, 사진 일부 실패 후 재시도, 콘솔 오류 및 모의 업로드 시간입니다.

## 변경 원칙

업무 규칙은 서버의 `state-engine.js`를 기준으로 확인합니다. UI와 서버의 재고 대상·수량·상태 조건을 함께 검증하고, 새로운 오류를 수정하면 해당 실패 상황을 자동 테스트로 남깁니다. 제품명·입고 이력이 중복처럼 보여도 박스·출고 이력이 연결될 수 있으므로 업무 데이터를 코드 정리의 일부로 삭제하지 않습니다.
