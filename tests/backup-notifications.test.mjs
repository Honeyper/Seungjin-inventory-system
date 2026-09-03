import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildSheetBackupNotifications,
  getSeoulDateKey
} from "../supabase/functions/seungjin-dev-gateway/backup-notifications.js";

const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const adminHtml = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
const gatewaySource = fs.readFileSync(new URL("../frontend/supabase-gateway.js", import.meta.url), "utf8");
const edgeSource = fs.readFileSync(new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url), "utf8");
const boundedSyncMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260903030000_bound_sheet_sync_batches.sql", import.meta.url),
  "utf8"
);
const singleItemSyncMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260903031500_drain_sheet_sync_one_item_at_a_time.sql", import.meta.url),
  "utf8"
);

test("서울 날짜를 기준으로 아직 실행하지 않은 당일 백업은 알림에서 제외한다", () => {
  const result = buildSheetBackupNotifications([
    { id: 1, business_date: "2026-09-01", action: "createInbound", status: "synced", attempts: 1, synced_at: "2026-09-01T11:12:00Z" },
    { id: 2, business_date: "2026-09-02", action: "createInbound", status: "pending", attempts: 0 }
  ], new Date("2026-09-02T04:00:00Z"));

  assert.equal(getSeoulDateKey("2026-09-01T15:30:00Z"), "2026-09-02");
  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].businessDate, "2026-09-01");
  assert.equal(result.notifications[0].status, "success");
});

test("실패 백업은 작업 종류와 대상, 오류 원인을 항목별로 제공한다", () => {
  const result = buildSheetBackupNotifications([
    { id: 10, business_date: "2026-09-01", action: "createInbound", status: "synced", attempts: 1, synced_at: "2026-09-01T11:10:00Z" },
    {
      id: 11,
      business_date: "2026-09-01",
      action: "updateShippingStatus",
      status: "failed",
      attempts: 2,
      management_id: "IN-260901-ANP-0001-001",
      product_name: "테스트 제품",
      product_id: "ANP-0001",
      last_error: "이미 출고완료 상태입니다."
    }
  ], new Date("2026-09-02T04:00:00Z"));

  const notification = result.notifications[0];
  assert.equal(notification.status, "failed");
  assert.equal(notification.syncedCount, 1);
  assert.equal(notification.issueCount, 1);
  assert.deepEqual(notification.issues[0], {
    id: 11,
    action: "updateShippingStatus",
    actionLabel: "출고 상태 변경",
    itemLabel: "IN-260901-ANP-0001-001 · 테스트 제품 · ANP-0001",
    status: "failed",
    statusLabel: "실패",
    message: "이미 출고완료 상태입니다."
  });
});

test("재시도 결과가 바뀌면 알림 서명도 바뀐다", () => {
  const failed = buildSheetBackupNotifications([
    { id: 1, business_date: "2026-09-01", action: "createInbound", status: "failed", attempts: 1, last_error: "실패" }
  ], new Date("2026-09-02T04:00:00Z")).notifications[0];
  const synced = buildSheetBackupNotifications([
    { id: 1, business_date: "2026-09-01", action: "createInbound", status: "synced", attempts: 2, synced_at: "2026-09-02T04:10:00Z" }
  ], new Date("2026-09-02T04:20:00Z")).notifications[0];

  assert.equal(failed.status, "failed");
  assert.equal(synced.status, "success");
  assert.notEqual(failed.signature, synced.signature);
});

test("관리자 알림 버튼은 백업 결과 API, 읽음 표시, 실패 상세를 연결한다", () => {
  assert.match(adminHtml, /id="backupNotificationButton"/);
  assert.match(adminHtml, /id="backupNotificationBadge"/);
  assert.match(adminHtml, /id="backupNotificationPanel"/);
  assert.match(adminHtml, /styles\.css\?v=20260902-inventory-refresh-dev/);
  assert.match(gatewaySource, /"getSheetBackupNotifications"/);
  assert.match(adminSource, /requestApi\("getSheetBackupNotifications"\)/);
  assert.match(adminSource, /BACKUP_NOTIFICATION_READ_KEY/);
  assert.match(adminSource, /실패·미반영 항목/);
  assert.match(adminSource, /BACKUP_NOTIFICATION_POLL_MS = 60 \* 1000/);
});

test("야간 백업은 요청 제한 시간을 넘지 않도록 한 건씩 나누어 반복 실행한다", () => {
  assert.match(edgeSource, /const maxBatches = 1;/);
  assert.match(edgeSource, /p_limit: 1/);
  assert.match(boundedSyncMigration, /'10-59\/5 11 \* \* \*'/);
  assert.match(singleItemSyncMigration, /'10-58\/2 11 \* \* \*'/);
  assert.match(singleItemSyncMigration, /'\*\/2 12-20 \* \* \*'/);
  assert.match(singleItemSyncMigration, /'0 21 \* \* \*'/);
});
