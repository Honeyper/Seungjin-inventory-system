import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const gatewayClientSource = fs.readFileSync(new URL("../frontend/supabase-gateway.js", import.meta.url), "utf8");
const gatewayFunctionSource = fs.readFileSync(
  new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url),
  "utf8"
);

test("5MB를 넘는 재고 화면 캐시는 IndexedDB에 저장한다", () => {
  assert.match(adminSource, /window\.indexedDB\.open\(ADMIN_LARGE_CACHE_DB_NAME, 1\)/);
  assert.match(adminSource, /await readAdminLargeCache\("inventory-dashboard"\)/);
  assert.match(adminSource, /writeAdminLargeCache\("inventory-dashboard", result\)/);
});

test("캐시가 있으면 버전만 확인하고 같은 데이터의 전체 재전송을 생략한다", () => {
  assert.match(gatewayClientSource, /"getInventoryVersion"/);
  assert.match(gatewayFunctionSource, /action === "getInventoryVersion"/);
  assert.match(adminSource, /Number\(versionResult\?\.stateVersion\) === Number\(cachedResult\.stateVersion\)/);
});

test("다른 화면을 보는 동안 재고 데이터를 미리 준비한다", () => {
  assert.match(adminSource, /scheduleInventoryDashboardWarmup\(\)/);
  assert.match(adminSource, /window\.requestIdleCallback\(warmup, \{ timeout: 1500 \}\)/);
});
