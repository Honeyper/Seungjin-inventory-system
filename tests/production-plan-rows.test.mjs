import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const processes = ["박 인쇄", "실크 인쇄", "자동화", "라벨"];
const plain = (value) => JSON.parse(JSON.stringify(value));
const order = {
  purchaseOrderId: "PO-ROW-CHECK", productId: "RCS-0014", productName: "LL006 아이브로우펜슬 용기",
  clientName: "(주)리치코스", orderRound: "08/03", totalOrderQuantity: 10000,
  accumulatedInboundQuantity: 10700, accumulatedShippingQuantity: 0, endDate: "2026-09-30"
};

function setup() {
  const storage = new Map();
  const context = vm.createContext({
    crypto: { randomUUID },
    state: { productionPlanDate: "2026-09-11", productionPlanFactory: "1공장", productionPlanJobs: [],
      productionPlanSelectedJobId: "", productionPlanProcessFilter: "", productionPlanActiveTab: "table",
      purchaseOrders: [order], products: [{ productCode: order.productId, productionProcess: "박 인쇄" }], purchaseOrdersLoaded: true },
    PRODUCTION_PLAN_STORAGE_PREFIX: "rows-test",
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    productionPlanTableBody: { innerHTML: "", querySelectorAll: () => [] },
    productionPlanStatus: { textContent: "", dataset: {} },
    productionPlanWorkspace: null, productionPlanDetailPanel: null, productionPlanDetailToggle: null,
    productionPlanDetailBody: null, machineScheduleBoard: null, machineScheduleStatus: null,
    productionPlanJobCount: {}, productionPlanTargetQuantity: {}, productionPlanDueSoonCount: {}, productionPlanUnassignedCount: {},
    syncProductionPlanButton: null, generateProductionPlanButton: null,
    productionPlanDate: null,
    document: { querySelector: () => null },
    formatNumber: (value) => Number(value || 0).toLocaleString("ko-KR"),
    escapeHtml: (value) => String(value ?? ""), escapeAttribute: (value) => String(value ?? ""),
    getLocalDateInputValue: () => "2026-09-11",
    showToast: () => {}, closeInboundProductPicker: () => {}, openInboundProductPicker: () => {},
    ensureProductsLoaded: async () => {}, loadPurchaseOrders: async () => {}
  });
  vm.runInContext(source.slice(source.indexOf("const PRODUCTION_PROCESS_ORDER"), source.indexOf("const SYSTEM_UPDATE_HISTORY")), context);
  vm.runInContext(source.slice(source.indexOf("function getProductionPlanStorageKey()"), source.indexOf("function getCurrentView()")), context);
  return context;
}

test("빈 계획은 공정별 최소 5행이며 반복 보정에도 행 ID와 개수가 유지된다", () => {
  const c = setup();
  const rows = c.ensureProductionPlanRows([]);
  assert.equal(rows.length, 20);
  for (const process of processes) assert.equal(rows.filter((row) => row.process === process).length, 5);
  assert.equal(new Set(rows.map((row) => row.planRowId)).size, 20);
  assert.deepEqual(plain(c.ensureProductionPlanRows(rows)), plain(rows));
});

test("이미 5행을 넘는 공정의 계획과 구버전 저장 데이터는 손실 없이 유지한다", () => {
  const c = setup();
  const jobs = Array.from({ length: 7 }, (_, i) => ({ purchaseOrderId: `PO-${i}`, process: "실크 인쇄", targetQuantity: i + 1, worker: `작업자${i}` }));
  const original = plain(jobs);
  const rows = c.ensureProductionPlanRows(jobs);
  assert.equal(rows.length, 22);
  assert.equal(rows.filter((row) => row.process === "실크 인쇄").length, 7);
  assert.deepEqual(jobs, original);
  jobs.forEach((job, i) => assert.deepEqual({ ...plain(rows[i]), planRowId: undefined }, { ...job, planRowId: undefined }));
});

test("공정별 + 버튼은 해당 공정에만 한 행을 추가하고 병합 셀 범위를 늘린다", () => {
  const c = setup();
  c.state.productionPlanJobs = c.ensureProductionPlanRows([]);
  c.handleProductionPlanTableClick({ target: { closest: (selector) => selector === "[data-plan-add-process]" ? { dataset: { planAddProcess: "자동화" } } : null } });
  assert.equal(c.state.productionPlanJobs.filter((job) => job.process === "자동화").length, 6);
  assert.equal(c.state.productionPlanJobs.filter((job) => job.process === "박 인쇄").length, 5);
  assert.match(c.productionPlanTableBody.innerHTML, /rowspan="7"><span>자동화/);
  assert.equal((c.productionPlanTableBody.innerHTML.match(/data-plan-add-process=/g) || []).length, 4);
  c.addProductionPlanRow("없는 공정");
  assert.equal(c.state.productionPlanJobs.length, 21);
});

test("공정 필터에도 빈 행과 해당 + 버튼이 표시되고 합계와 보드에서는 빈 행을 제외한다", () => {
  const c = setup();
  c.state.productionPlanJobs = c.ensureProductionPlanRows([]);
  c.state.productionPlanJobs[0].machine = "1호기";
  c.state.productionPlanJobs[0].targetQuantity = 500;
  c.state.productionPlanProcessFilter = "라벨";
  c.renderProductionPlanTable();
  assert.equal((c.productionPlanTableBody.innerHTML.match(/data-plan-row-id=/g) || []).length, 5);
  assert.equal((c.productionPlanTableBody.innerHTML.match(/data-plan-add-process=/g) || []).length, 1);
  c.renderProductionPlanSummary();
  assert.equal(c.productionPlanJobCount.innerHTML, "0 <em>건</em>");
  assert.equal(c.productionPlanTargetQuantity.innerHTML, "0 <em>ea</em>");
  assert.equal(c.productionPlanUnassignedCount.innerHTML, "0 <em>건</em>");
  c.machineScheduleBoard = {};
  c.renderMachineScheduleBoard();
  assert.match(c.machineScheduleBoard.innerHTML, /기계가 배정된 작업이 없습니다/);
});

test("늘린 행과 입력값은 저장·재조회 및 날짜·공장 전환 후에도 구분되어 유지된다", () => {
  const c = setup();
  c.state.productionPlanJobs = c.ensureProductionPlanRows([]);
  c.addProductionPlanRow("라벨");
  c.state.productionPlanJobs.at(-1).worker = "입력 유지";
  const saved = plain(c.state.productionPlanJobs);
  c.saveProductionPlanDraft();
  c.state.productionPlanDate = "2026-09-12";
  assert.equal(c.readProductionPlanDraft(), null);
  c.state.productionPlanDate = "2026-09-11";
  c.state.productionPlanFactory = "2공장";
  assert.equal(c.readProductionPlanDraft(), null);
  c.state.productionPlanFactory = "1공장";
  c.loadProductionPlanDraft();
  assert.deepEqual(plain(c.state.productionPlanJobs), saved);
});

test("빈 행에서 같은 발주를 선택해도 기존 계획을 덮어쓰지 않고 행별 입력을 구분한다", async () => {
  const c = setup();
  c.state.productionPlanJobs = c.buildProductionPlanJobs();
  const original = plain(c.getProductionPlanActiveJobs()[0]);
  const added = c.state.productionPlanJobs.find((job) => !job.purchaseOrderId && job.process === "박 인쇄");
  const id = added.planRowId;
  const row = { dataset: { planRowId: id } };
  await c.handleProductionPlanProductPickerOpen({ target: { closest: () => ({ closest: () => row }) } });
  c.selectProductionPlanProduct({ productCode: order.productId });
  const selected = c.state.productionPlanJobs.find((job) => job.planRowId === id);
  assert.equal(selected.purchaseOrderId, order.purchaseOrderId);
  assert.equal(selected.targetQuantity, 0);
  assert.equal(c.getProductionPlanActiveJobs().length, 2);
  assert.deepEqual(plain(c.state.productionPlanJobs.find((job) => job.planRowId === original.planRowId)), original);
  c.handleProductionPlanFieldChange({ target: { closest: (selector) => selector === "[data-plan-field]" ? { dataset: { planField: "worker" }, value: "추가 작업자" } : row } });
  assert.equal(selected.worker, "추가 작업자");
  assert.equal(c.state.productionPlanJobs.find((job) => job.planRowId === original.planRowId).worker, "");
  c.handleProductionPlanDetailChange({ target: { closest: () => ({ dataset: { planRowId: id, planDetailField: "cumulativeHours" }, value: "8" }) } });
  assert.equal(selected.cumulativeHours, 8);
  assert.equal(c.state.productionPlanJobs.find((job) => job.planRowId === original.planRowId).cumulativeHours, 0);
});

test("발주 동기화와 자동 생성은 추가 행과 같은 발주의 개별 계획을 유지한다", async () => {
  const c = setup();
  c.state.productionPlanJobs = c.buildProductionPlanJobs();
  c.addProductionPlanRow("자동화");
  const id = c.state.productionPlanJobs.at(-1).planRowId;
  c.state.productionPlanPickerJobId = id;
  c.selectProductionPlanProduct({ productCode: order.productId });
  c.addProductionPlanRow("라벨");
  await c.syncProductionPlanOrders();
  assert.equal(c.getProductionPlanActiveJobs().length, 2);
  assert.equal(c.state.productionPlanJobs.find((job) => job.planRowId === id).process, "자동화");
  assert.equal(c.state.productionPlanJobs.filter((job) => job.process === "라벨").length, 6);
  await c.generateProductionPlanDraft();
  assert.equal(c.getProductionPlanActiveJobs().length, 2);
  assert.equal(c.state.productionPlanJobs.filter((job) => job.process === "라벨").length, 6);
  assert.ok(c.state.productionPlanJobs.filter((job) => !job.purchaseOrderId).every((job) => !job.machine));
});

test("같은 공정의 중복 발주 자동 목표는 잔량을 초과하지 않으며 빈 행은 계산하지 않는다", () => {
  const c = setup();
  const job = c.buildProductionPlanJobs().find((row) => row.purchaseOrderId);
  const rows = c.applyProductionPlanRules([{ ...job, targetQuantity: 6000 }, { ...job, planRowId: "second", targetQuantity: 6000 }, c.createProductionPlanEmptyJob("박 인쇄")]);
  assert.equal(rows[0].targetQuantity + rows[1].targetQuantity, 10000);
  assert.equal(rows[2].targetQuantity, 0);
  assert.equal(rows[2].machine, "");
});
