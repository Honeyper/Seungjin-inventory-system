# Supabase 데이터 구조

## 적용 범위

DEV와 PRD는 서로 분리된 Supabase 프로젝트를 사용합니다. 두 환경 모두 제품, 발주, 입고, 재고, 박스 데이터를 Supabase PostgreSQL의 기준 데이터로 사용합니다. 등록·수정·입고·출고·재고 이동은 Edge Function에서 트랜잭션으로 처리하며 화면은 Supabase의 최신 데이터를 바로 조회합니다.

기존 Google Sheets는 실시간 저장소가 아니라 환경별 업무용 사본으로 유지합니다. Supabase 쓰기 성공 시 작업 내용이 `dev_sheet_outbox`에 함께 기록되고, 매일 아래 시간에 순서대로 해당 환경의 스프레드시트에 반영됩니다. `dev_` 접두사는 최초 DEV 구현에서 정한 내부 테이블명이며, PRD에서는 별도의 Supabase 프로젝트 안에 동일한 구조로 격리됩니다.

- 20:10 KST: 본 동기화 시작
- 20:10~21:55 KST: 5분마다 최대 10건씩 순차 반영하며 실패 항목도 자동 재시도

PC 관리자 화면의 우측 상단 알림 버튼은 최근 35일의 백업 결과를 일자별로 표시합니다. 정상 완료 시 전체 반영 건수를, 실패 시 작업 종류·관리 ID·제품 정보·오류 사유를 확인할 수 있습니다. 화면이 열려 있으면 1분마다 새 결과를 확인하며, 확인한 알림은 같은 브라우저에서 읽음 처리됩니다.

입고 거래명세표와 불량 사진은 야간 동기화 시 해당 환경의 Drive에 업로드되며, 생성된 링크는 Supabase 입고 데이터에도 다시 반영됩니다. 출고 검수 사진 업로드는 해당 환경의 Apps Script API를 계속 사용합니다.

## 데이터와 동시성

- `dev_state`: 전체 데이터 버전과 동시 쓰기 충돌 제어
- `dev_products`: 제품
- `dev_purchase_orders`: 발주
- `dev_inbounds`: 입고
- `dev_inventory_records`: 관리 ID·제품·보관 위치 단위 재고
- `dev_inventory_boxes`: 박스 단위 상태와 수량
- `dev_sheet_outbox`: 스프레드시트 반영 대기열
- `dev_sheet_sync_tokens`: 예약 작업과 Apps Script 사이의 일회용 인증 토큰

모든 업무 쓰기는 `commit_dev_state_mutation` RPC 한 트랜잭션에서 데이터 변경과 대기열 기록을 같이 처리합니다. 화면 두 곳에서 동시에 저장해 버전이 달라지면 Gateway가 최신 상태를 다시 읽어 최대 세 번 재시도합니다.

## 보안 구조

- 업무 테이블과 세션·동기화 테이블은 RLS를 강제 적용합니다.
- `anon`과 `authenticated` 역할에는 테이블 및 RPC 권한이 없습니다.
- 브라우저는 PostgreSQL을 직접 조회하거나 수정할 수 없습니다.
- 로그인 성공 후 Gateway가 30일 만료형 불투명 세션 토큰을 발급합니다.
- secret/service-role 키는 프론트와 저장소에 포함하지 않습니다.
- Gateway는 publishable key와 애플리케이션 세션을 모두 확인합니다.
- 예약 동기화와 Apps Script 요청은 짧게 만료되고 한 번만 쓸 수 있는 토큰으로 상호 확인합니다.

계정 검증은 각 환경의 Apps Script가 `계정정보` 시트를 사용합니다. 로그인 이후 업무 데이터 읽기·쓰기는 해당 환경의 Supabase를 사용합니다.

## 소스 위치

- 스키마와 예약 작업: `supabase/migrations/`
- Edge Function: `supabase/functions/seungjin-dev-gateway/`
- 상태 변경 로직: `supabase/functions/seungjin-dev-gateway/state-engine.js`
- 프론트 Gateway: `frontend/supabase-gateway.js`
- DEV 설정: `frontend/config.dev.js`
- PRD 설정: `frontend/config.prod.js`
- Sheets 반영 API: `gas/Code.js`의 `applySupabaseOutbox`

## 장애 시 동작

- Supabase 쓰기 실패 시 Sheets로 우회 저장하지 않습니다. 화면에 실패를 표시해 두 저장소가 서로 다른 상태가 되는 것을 막습니다.
- Supabase 업무 데이터 조회 실패 시에도 당일 변경이 반영되지 않은 Sheets로 우회하지 않습니다.
- 야간 Sheets 반영 실패 항목은 `failed` 상태와 오류 내용을 남기고 다음 예약 실행에서 순번대로 재시도합니다.
- Apps Script는 마지막으로 성공한 대기열 번호를 보관해 동일 항목 재전송 시 중복 등록을 방지합니다.
- 인증 만료 응답은 우회하지 않고 로그인 화면으로 이동합니다.
