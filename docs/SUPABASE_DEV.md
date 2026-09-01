# Supabase DEV 조회 가속

## 적용 범위

Supabase 연결은 DEV에만 적용합니다. PRD의 데이터 저장소와 API 설정은 변경하지 않습니다.

첫 단계에서는 기존 Apps Script와 스프레드시트를 원본 데이터로 유지하고, 다음 읽기 응답을 Supabase에 동기화합니다.

- 제품 목록
- 발주 목록
- 입고 목록
- 재고·출고 대시보드

입고·출고·재고 변경은 기존 Apps Script가 처리합니다. 변경이 성공하면 프론트가 Supabase Gateway에 후속 동기화를 요청하고, 화면 목록은 동기화된 스냅샷으로 갱신합니다.

## 보안 구조

- `api_snapshots`와 `app_sessions`는 RLS가 활성화되어 있습니다.
- `anon`과 `authenticated` 역할에는 테이블 권한이 없습니다.
- 브라우저에서 테이블을 직접 조회할 수 없습니다.
- 로그인 정보는 기존 DEV Apps Script에서 검증합니다.
- 로그인 성공 후 Edge Function이 30일 만료형 불투명 세션 토큰을 발급합니다.
- Supabase secret/service-role 키는 프론트와 저장소에 포함하지 않습니다.
- `seungjin-dev-gateway`는 `verify_jwt = false`이지만 함수 내부에서 publishable key와 애플리케이션 세션을 모두 검증합니다.

## 소스 위치

- 스키마: `supabase/migrations/`
- Edge Function: `supabase/functions/seungjin-dev-gateway/index.ts`
- 프론트 Gateway: `frontend/supabase-gateway.js`
- DEV 설정: `frontend/config.dev.js`

## 장애 시 동작

Supabase 스냅샷 조회가 네트워크 또는 서버 오류로 실패하면 프론트는 기존 Apps Script 읽기 API로 재시도합니다. 인증 만료 응답은 우회하지 않고 로그인 화면으로 이동합니다.

## 다음 단계

조회 가속이 안정화된 후 제품, 발주, 입고, 재고, 박스 데이터를 정규화된 PostgreSQL 테이블로 이전하고 입고·출고 처리를 트랜잭션 함수로 전환합니다.
