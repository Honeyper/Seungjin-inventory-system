# 승진 QR 기반 재고관리 시스템

(주)승진에서 사용할 QR 기반 재고관리 시스템입니다.

## 작업 방식

- 회사와 집에서 같은 코드를 작업하기 위해 Git으로 버전을 관리합니다.
- PRD 운영 데이터는 Google Sheets에 저장합니다.
- DEV 업무 데이터는 Supabase를 기준으로 저장하고, 매일 20시 이후 Google Sheets에 동기화합니다.
- Google Apps Script는 PRD API와 DEV 스프레드시트 사본 동기화를 담당합니다.
- 프론트엔드 화면과 Apps Script 코드는 이 저장소에서 함께 관리합니다.

## 예정 구조

```text
frontend/
  관리자 및 모바일 화면

gas/
  Google Apps Script API 코드

docs/
  기획 문서 및 화면 정리
```

## MVP 우선순위

1. 제품 관리
2. 제품 입고
3. 박스ID 및 QR 자동 생성
4. 입고 내역
5. 재고 현황
6. 작업자 모바일 QR 스캔
7. 출고 등록
