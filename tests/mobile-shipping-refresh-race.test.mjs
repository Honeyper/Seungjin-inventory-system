import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
const loader = source.slice(source.indexOf("async function loadShippingDashboard("), source.indexOf("async function refreshDashboardInBackground("));
const updates = source.slice(source.indexOf("function invalidateShippingDashboardRead("), source.indexOf("function isShippingItemCompleted("));
const item = (id, status = "출고대기") => ({ id, scannedBox: { boxId: id, status, rawStatus: status }, stockStatus: status, syncedFromPending: true });
function setup() {
  const reads = [];
  const app = { state: { user: {}, scannedShippingRows: [item("A")], dashboard: [], dashboardLoadPromise: null }, window: {}, dashboardQrIndex: null, requestApi: () => new Promise((resolve, reject) => reads.push({ resolve, reject })), syncPendingShippingRowsFromDashboard() { app.syncs++; }, syncScannedMoveRowsFromDashboard() {}, applyShippingFilters() {}, saveDashboardCache() {}, showToast() { app.toasts++; }, renderShippingError() { app.toasts++; }, renderShippingLoading() {}, syncs: 0, toasts: 0, getShippingKey: row => row.id, getScannedBox: row => row.scannedBox };
  vm.runInNewContext(loader + updates, app);
  return { app, reads };
}

test("출고 전 조회가 늦게 완료돼도 출고 후 새 조회 결과를 덮어쓰지 않는다", async () => {
  const { app, reads } = setup();
  const oldLoad = app.loadShippingDashboard({ silent: true });
  app.invalidateShippingDashboardRead();
  app.markShippingItemsCompleted(app.state.scannedShippingRows);
  const newLoad = app.loadShippingDashboard({ silent: true });
  assert.equal(reads.length, 2);
  reads[1].resolve({ rows: [{ status: "출고완료" }] });
  assert.equal(await newLoad, true);
  reads[0].resolve({ rows: [{ status: "출고대기" }] });
  assert.equal(await oldLoad, false);
  assert.equal(app.state.dashboard[0].status, "출고완료");
  assert.equal(app.state.scannedShippingRows[0].stockStatus, "출고완료");
  assert.equal(app.syncs, 1);
  assert.equal(app.state.dashboardLoadPromise, null);
});

test("이전 조회 오류는 최신 목록을 지우거나 오류 알림을 띄우지 않는다", async () => {
  const { app, reads } = setup();
  const oldLoad = app.loadShippingDashboard();
  app.invalidateShippingDashboardRead();
  const newLoad = app.loadShippingDashboard();
  const currentPromise = app.state.dashboardLoadPromise;
  reads[0].reject(Error("old timeout"));
  assert.equal(await oldLoad, false);
  assert.equal(app.state.dashboardLoadPromise, currentPromise);
  assert.equal(app.toasts, 0);
  reads[1].resolve({ rows: [] });
  assert.equal(await newLoad, true);
});

test("조회로 객체가 교체돼도 같은 박스만 갱신하고 실패한 박스는 남긴다", () => {
  const { app } = setup();
  const targets = [item("A"), item("B")];
  app.state.scannedShippingRows = [item("A"), item("B"), item("C")];
  app.markShippingItemsCompleted(targets, [item("B")]);
  assert.deepEqual(app.state.scannedShippingRows.map(row => row.stockStatus), ["출고완료", "출고대기", "출고대기"]);
  assert.equal(app.state.scannedShippingRows[0].syncedFromPending, false);
  app.markShippingItemsAvailable([targets[0]]);
  assert.equal(app.state.scannedShippingRows[0].scannedBox.rawStatus, "보관");
});
