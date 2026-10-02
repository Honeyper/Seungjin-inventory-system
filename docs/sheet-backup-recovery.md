# 시트 백업 누락 복구

운영 데이터의 원본은 Supabase이며 시트는 업무용 사본이다. 시트 공정을 수기로 수정해도 프로그램에 자동으로 역반영되지 않는다. 역반영은 대상 제품·필드·충돌 기준을 확인하고 별도로 승인받은 뒤 수행한다.

행/열 끝에 도달하면 `ensureSheetWriteCapacity_`가 필요한 범위를 추가한다. 제품 추가, 공정 헤더 추가, 재고·박스 일괄 추가 전에 적용한다.

과거 실패한 outbox를 단순히 다시 pending으로 바꾸지 않는다. Apps Script의 마지막 성공 순번이 실패 항목보다 앞서 있으면 실제 누락을 `alreadySynced`로 건너뛸 수 있고, 이미 실행된 업무를 재실행하면 중복 입고나 상태 충돌이 발생할 수 있다.

복구 순서:

1. 미완료 outbox의 ID와 대상 관리 ID·제품 ID·발주 ID를 읽고, 해당 대상의 현재 원본 데이터를 일관된 DB 조회로 보존한다. JSON `data`만 내보내면 예전 박스에 식별자가 빠질 수 있으므로 실제 `box_id`, `management_id`, `product_id`, `storage`, `box_number` 컬럼도 포함한다. 모든 내보낸 행에 식별자가 있는지 먼저 검사한다.
2. 서버가 발급한 일회용 `apps_script` 토큰으로 시트의 대상 행을 읽어 복구 전 사본을 보존한다.
3. `applySheetBackupRows`로 해당 대상만 현재 원본으로 저장한다. 과거 입고·출고·자리 이동을 재실행하지 않는다. 입력 전체의 대상 ID와 중복 식별자를 검사한 다음 저장하며, 알 수 없는 수기 컬럼은 일치하는 행에서 유지한다. 현재 원본에 없는 대상 행은 비운다.
4. 원본의 모든 속성은 `Supabase 원본(JSON)` 컬럼에도 저장한다. 다시 읽어서 전체 객체와 행 개수를 비교한다. 재고 수량·박스 상태·위치·공정·첨부 URL 등은 원본과 같아야 한다.
5. 모든 대상이 검증된 경우에만 해당 outbox ID를 synced로 변경하고 복구 방식·확인 버전·일시를 `sync_result`에 기록한다. 원래 실패 오류와 재시도 횟수는 보존한다. 새로 발생한 업무 항목은 이번 복구에 포함하지 않는다.

`tools/sheet-backup-recovery.mjs`는 검토한 원본 JSON과 별도 토큰 파일을 받아 동작한다. `inspect`는 읽기 전용이고, `apply`는 쓰기와 재조회 비교를 수행한다. 토큰과 실제 업무 사본을 Git에 저장하지 않는다.

```sh
node tools/sheet-backup-recovery.mjs snapshot.json tokens.json output-directory inspect
node tools/sheet-backup-recovery.mjs snapshot.json tokens.json output-directory apply
```

실패 시 완료로 표시하지 않는다. 복구 전 사본과 검증 보고서로 누락 지점을 확인한다. 이 도구는 outbox 순번을 바꾸거나 업무 DB의 재고를 변경하지 않는다.

QR 인쇄는 현재 제품의 최종공정을 우선하며, 예전 제품에 `processGroups`가 없어도 최종공정 뒤의 미사용 칸은 `---`로 표시한다. 제품 재저장은 필요하지 않다. 기존 인쇄 치수와 폰트는 유지한다.
