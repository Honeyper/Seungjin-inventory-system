import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../frontend/styles.css", import.meta.url), "utf8");
const gatewaySource = await readFile(new URL("../frontend/supabase-gateway.js", import.meta.url), "utf8");
const edgeSource = await readFile(new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url), "utf8");
const migrationSource = await readFile(
  new URL("../supabase/migrations/20260904001000_add_server_usage_metric.sql", import.meta.url),
  "utf8"
);

test("알림창에는 백업 결과와 업데이트 탭을 표시하고 저장 용량은 조회하지 않는다", () => {
  assert.match(adminHtml, /id="backupNotificationTitle">알림<\/h2>/);
  assert.match(adminHtml, /id="backupNotificationList"/);
  assert.match(adminHtml, /id="updateHistoryTabPanel"/);
  assert.doesNotMatch(adminHtml, /id="serverUsageCard"/);
  assert.doesNotMatch(stylesSource, /\.server-usage-card/);
  assert.doesNotMatch(adminSource, /getServerUsage|loadServerUsage|SERVER_USAGE_POLL_MS/);
  assert.match(adminSource, /requestApi\("getSheetBackupNotifications"\)/);
  assert.match(gatewaySource, /"getServerUsage"/);
});

test("서버 사용량 API는 현재 데이터베이스 크기와 무료 한도 비율을 반환한다", () => {
  assert.match(edgeSource, /rpc\/read_seungjin_database_usage/);
  assert.match(edgeSource, /FREE_DATABASE_LIMIT_BYTES = 500 \* 1024 \* 1024/);
  assert.match(edgeSource, /action === "getServerUsage"/);
  assert.match(edgeSource, /supabase-live-database-size/);
});

test("데이터베이스 크기 함수는 service role만 실행할 수 있다", () => {
  assert.match(migrationSource, /security invoker/);
  assert.match(migrationSource, /pg_catalog\.pg_database_size\(pg_catalog\.current_database\(\)\)/);
  assert.match(migrationSource, /revoke all on function public\.read_seungjin_database_usage\(\) from public, anon, authenticated/);
  assert.match(migrationSource, /grant execute on function public\.read_seungjin_database_usage\(\) to service_role/);
});
