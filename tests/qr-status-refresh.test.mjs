import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildInventoryDashboard } from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

const now = new Date("2026-09-21T01:00:00Z");
function fixture(total = 20, shipped = 0) {
  const record = { managementId: "IN-A", productId: "P1", storage: "A", qrPrintStatus: "미인쇄", qrGeneratedCount: 0 };
  const boxes = Array.from({ length: total }, (_, index) => ({
    managementId: "IN-A", productId: "P1", boxId: `BOX-${index + 1}`, number: index + 1,
    storage: "A", quantity: 100, status: index < shipped ? "출고완료" : "보관"
  }));
  const inbound = { managementId: "IN-A", productId: "P1", qrGeneratedCount: total };
  return { record, boxes, inbound };
}

test("QR 생성 기록이 입고에만 저장돼 있어도 재고 재조회에서 생성 완료로 표시한다", () => {
  for (const [total, shipped] of [[20, 0], [28, 6]]) {
    const { record, boxes, inbound } = fixture(total, shipped);
    const row = buildInventoryDashboard([record], boxes, [], now, [inbound]).rows[0];
    assert.equal(row.qrPrintStatus, "QR 생성");
    assert.equal(row.qrGeneratedCount, total);
    assert.equal(row.currentBoxCount, `${total - shipped} box`);
    assert.equal(record.qrGeneratedCount, 0, "읽기는 저장된 재고를 변경하지 않는다");
  }
});

test("일부 박스의 QR 정보가 남아 있어도 전체 입고의 생성 기록을 줄이지 않는다", () => {
  const { record, boxes, inbound } = fixture();
  boxes[0].qrData = "existing";
  assert.equal(buildInventoryDashboard([record], boxes, [], now, [inbound]).rows[0].qrGeneratedCount, 20);
});

test("새 박스 추가와 다른 입고·제품의 QR 기록을 생성 완료로 오인하지 않는다", () => {
  const { record, boxes, inbound } = fixture();
  for (const qrInbounds of [[], [{ ...inbound, managementId: "IN-B" }], [{ ...inbound, productId: "P2" }], [{ ...inbound, qrGeneratedCount: 19 }]]) {
    assert.equal(buildInventoryDashboard([record], boxes, [], now, qrInbounds).rows[0].qrPrintStatus, "미인쇄");
  }
});

test("입고 QR 기록이 없는 기존 재고는 박스별 생성 기록을 유지한다", () => {
  const { record, boxes } = fixture();
  boxes.forEach(box => { box.qrGeneratedAt = "2026-09-18"; });
  assert.equal(buildInventoryDashboard([record], boxes, [], now).rows[0].qrPrintStatus, "QR 생성");
});

const admin = readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const start = admin.indexOf("async function loadInventoryDashboardRequest(");
const end = admin.indexOf("\nfunction ", start);
const loadSource = admin.slice(start, end);

async function refresh(cachedQrVersion, serverQrVersion) {
  const requests = [];
  const state = { inventoryLoaded: true, inventoryStateVersion: 5, inventoryQrStatusVersion: cachedQrVersion };
  const context = vm.createContext({
    state, window: { SeungjinDataGateway: { canRead: () => true } },
    refreshInventoryConfirmationStatus() {}, showToast() {}, writeAdminLargeCache() {},
    applyInventoryDashboardResult(result) { state.result = result; },
    async requestApi(action) {
      requests.push(action);
      return action === "getInventoryVersion"
        ? { stateVersion: 5, qrStatusVersion: serverQrVersion }
        : { rows: [], qrStatusVersion: "later-concurrent-write" };
    }
  });
  vm.runInContext(loadSource, context);
  assert.equal(await context.loadInventoryDashboardRequest(false), true);
  return { requests, state };
}

test("재고 버전이 같아도 QR 기록이 바뀌거나 이전 캐시에 없으면 재조회한다", async () => {
  for (const cached of [null, "old"]) {
    const { requests, state } = await refresh(cached, "new");
    assert.deepEqual(requests, ["getInventoryVersion", "getInventoryDashboard"]);
    assert.equal(state.result.qrStatusVersion, "new", "조회 도중 변경을 놓치지 않도록 조회 전 버전을 저장한다");
  }
});

test("재고와 QR 기록이 모두 같으면 기존 빠른 캐시 경로를 유지한다", async () => {
  assert.deepEqual((await refresh("same", "same")).requests, ["getInventoryVersion"]);
});
