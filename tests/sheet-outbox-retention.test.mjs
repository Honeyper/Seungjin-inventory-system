import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSource = await readFile(
  new URL("../supabase/migrations/20260904003000_trim_synced_sheet_outbox_attachments.sql", import.meta.url),
  "utf8"
);

test("완료된 스프레드시트 백업은 거래명세서 원본만 제거한다", () => {
  assert.match(migrationSource, /when item_succeeded then payload #- '\{invoiceFile,data\}'/);
  assert.match(migrationSource, /else payload/);
  assert.match(migrationSource, /where id = \(item ->> 'id'\)::bigint/);
  assert.match(migrationSource, /and status = 'processing'/);
});

test("기존 완료 건을 정리하되 대기 및 실패 건은 유지한다", () => {
  assert.match(migrationSource, /update public\.dev_sheet_outbox\s+set payload = payload #- '\{invoiceFile,data\}'/s);
  assert.match(migrationSource, /where status = 'synced'/);
  assert.doesNotMatch(migrationSource, /where status in \('pending', 'failed'\)/);
});

test("백업 완료 기록과 결과는 그대로 유지한다", () => {
  assert.match(migrationSource, /sync_result = coalesce\(item -> 'data', '\{\}'::jsonb\)/);
  assert.match(migrationSource, /return jsonb_build_object\('synced', synced_count, 'failed', failed_count\)/);
  assert.match(migrationSource, /security invoker/);
  assert.match(migrationSource, /set search_path = ''/);
});
