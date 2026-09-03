import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gatewayFunctionSource = await readFile(
  new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url),
  "utf8"
);
const stateEngineSource = await readFile(
  new URL("../supabase/functions/seungjin-dev-gateway/state-engine.js", import.meta.url),
  "utf8"
);
const migrationSource = await readFile(
  new URL("../supabase/migrations/20260903090000_optimize_inventory_reads.sql", import.meta.url),
  "utf8"
);

test("인증된 반복 요청은 짧은 서버 메모리 캐시로 세션 DB 조회를 줄인다", () => {
  assert.match(gatewayFunctionSource, /const SESSION_CACHE_TTL_MS = 60 \* 1000/);
  assert.match(gatewayFunctionSource, /const sessionCache = new Map/);
  assert.match(gatewayFunctionSource, /cached\.validUntil > Date\.now\(\)/);
});

test("재고 RPC는 정렬과 대형 JSON 병합 없이 원본 행 묶음을 반환한다", () => {
  assert.match(migrationSource, /'recordRows'/);
  assert.match(migrationSource, /'boxRows'/);
  assert.doesNotMatch(migrationSource, /order by management_id/);
  assert.doesNotMatch(migrationSource, /data \|\| jsonb_build_object/);
  assert.match(gatewayFunctionSource, /mapInventoryRecordRows\(state\.recordRows\)/);
  assert.match(gatewayFunctionSource, /mapInventoryBoxRows\(state\.boxRows\)/);
});

test("재고 대시보드는 박스 전체를 입고마다 반복 검색하지 않는다", () => {
  assert.match(stateEngineSource, /const boxesByInbound = new Map\(\)/);
  assert.match(stateEngineSource, /boxesByInbound\.get\(relatedKey\) \|\| \[\]/);
  assert.doesNotMatch(stateEngineSource, /const related = boxes\.filter/);
});
