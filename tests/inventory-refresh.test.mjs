import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminHtml = readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../frontend/styles.css", import.meta.url), "utf8");

test("재고 필터 초기화 버튼을 최신 데이터 새로고침 버튼으로 교체한다", () => {
  assert.match(adminHtml, /id="refreshInventoryButton"/);
  assert.match(adminHtml, /<span>새로고침<\/span>/);
  assert.doesNotMatch(adminHtml, /inventory-reset-button/);
  assert.doesNotMatch(adminSource, /resetInventoryFilters/);
});

test("재고 새로고침은 필터를 유지하고 Supabase 재고 화면을 다시 불러온다", () => {
  assert.match(adminSource, /refreshInventoryButton\?\.addEventListener\("click", refreshInventoryDashboard\)/);
  assert.match(adminSource, /const refreshed = await loadInventoryDashboard\(false\)/);
  assert.match(adminSource, /최신 재고 데이터로 새로고침했습니다/);
  assert.match(adminSource, /isRefreshingInventory/);
  assert.match(stylesSource, /\.inventory-refresh-button\.is-loading svg/);
});

test("이미 표시 중인 재고는 새로고침 요청 동안 빈 로딩 화면으로 바꾸지 않는다", () => {
  assert.match(adminSource, /else if \(!hadLoadedData\) \{\s*renderInventoryLoading\(\);/);
  assert.match(adminSource, /return true;\s*\} catch \(error\)/);
  assert.match(adminSource, /return false;/);
});

test("재고 새로고침은 중복 요청을 합치고 버전이 같으면 전체 데이터를 다시 받지 않는다", () => {
  assert.match(adminSource, /inventoryLoadPromise: null/);
  assert.match(adminSource, /cachedResult\?\.stateVersion \?\? state\.inventoryStateVersion/);
  assert.match(adminSource, /requestApi\("getInventoryVersion"\)/);
  assert.match(adminSource, /state\.inventoryStateVersion = Number\(result\?\.stateVersion\) \|\| null/);
});

test("입고 화면의 저장 후에는 전체 재고를 백그라운드에서 다시 받지 않는다", () => {
  assert.match(adminSource, /includeInventory = \["inventory", "shipping"\]\.includes\(getCurrentView\(\)\)/);
  assert.doesNotMatch(adminSource, /includeInventory = state\.inventoryLoaded/);
});
