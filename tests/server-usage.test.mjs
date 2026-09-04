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

test("알림 팝업은 일반 알림 제목과 실시간 서버 사용량을 표시한다", () => {
  assert.match(adminHtml, /id="backupNotificationTitle">알림<\/h2>/);
  assert.doesNotMatch(adminHtml, /id="backupNotificationTitle">백업 알림<\/h2>/);
  assert.match(adminHtml, /id="serverUsageCard"/);
  assert.match(adminHtml, /id="serverUsageProgressBar"/);
  assert.match(stylesSource, /\.server-usage-card/);
});

test("알림을 열거나 새로고침하면 서버 사용량을 읽고 열린 동안 30초마다 갱신한다", () => {
  assert.match(gatewaySource, /"getServerUsage"/);
  assert.match(adminSource, /requestApi\("getServerUsage"\)/);
  assert.match(adminSource, /SERVER_USAGE_POLL_MS = 30 \* 1000/);
  assert.match(adminSource, /if \(!backupNotificationPanel\?\.hidden\) loadServerUsage\(\)/);
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
