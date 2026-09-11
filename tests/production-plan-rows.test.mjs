import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const processes = ["박 인쇄", "실크 인쇄", "자동화"];
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
    window: { confirm: () => true },
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
  assert.equal(rows.length, 15);
  for (const process of processes) assert.equal(rows.filter((row) => row.process === process).length, 5);
  assert.equal(new Set(rows.map((row) => row.planRowId)).size, 15);
  assert.deepEqual(plain(c.ensureProductionPlanRows(rows)), plain(rows));
  const legacy = { planRowId: "old-label", purchaseOrderId: "LABEL-ORDER", process: "라벨", machine: "라벨 1호기", targetQuantity: 500 };
  assert.deepEqual(plain(c.ensureProductionPlanRows([...rows, legacy])), plain(rows));
  c.state.products = [{ productCode: order.productId, productionProcess: "라벨" }];
  assert.equal(c.buildProductionPlanJobs().some((job) => job.purchaseOrderId), false);
  c.state.products = [{ productCode: order.productId, processRoute: "라벨" }];
  assert.equal(c.buildProductionPlanJobs().some((job) => job.purchaseOrderId), false);
});

test("이미 5행을 넘는 공정의 계획과 구버전 저장 데이터는 손실 없이 유지한다", () => {
  const c = setup();
  const jobs = Array.from({ length: 7 }, (_, i) => ({ purchaseOrderId: `PO-${i}`, process: "실크 인쇄", targetQuantity: i + 1, worker: `작업자${i}` }));
  const original = plain(jobs);
  const rows = c.ensureProductionPlanRows(jobs);
  assert.equal(rows.length, 17);
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
  assert.equal((c.productionPlanTableBody.innerHTML.match(/data-plan-add-process=/g) || []).length, 3);
  c.addProductionPlanRow("없는 공정");
  assert.equal(c.state.productionPlanJobs.length, 16);
});

test("공정 필터에도 빈 행과 해당 + 버튼이 표시되고 합계와 보드에서는 빈 행을 제외한다", () => {
  const c = setup();
  c.state.productionPlanJobs = c.ensureProductionPlanRows([]);
  c.state.productionPlanJobs[0].machine = "1호기";
  c.state.productionPlanJobs[0].targetQuantity = 500;
  c.state.productionPlanProcessFilter = "실크 인쇄";
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
  c.addProductionPlanRow("실크 인쇄");
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
  c.addProductionPlanRow("실크 인쇄");
  await c.syncProductionPlanOrders();
  assert.equal(c.getProductionPlanActiveJobs().length, 2);
  assert.equal(c.state.productionPlanJobs.find((job) => job.planRowId === id).process, "자동화");
  assert.equal(c.state.productionPlanJobs.filter((job) => job.process === "실크 인쇄").length, 6);
  await c.generateProductionPlanDraft();
  assert.equal(c.getProductionPlanActiveJobs().length, 2);
  assert.equal(c.state.productionPlanJobs.filter((job) => job.process === "실크 인쇄").length, 6);
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

test("삭제는 같은 발주의 다른 계획을 보존하고 합계·스케줄·선택 상태를 갱신한다", () => {
  const c = setup();
  c.state.productionPlanJobs = c.buildProductionPlanJobs();
  const first = c.getProductionPlanActiveJobs()[0];
  first.machine = "1호기";
  first.worker = "삭제 대상 작업자";
  c.state.productionPlanJobs.push({ ...first, planRowId: "keep-row", machine: "2호기", targetQuantity: 300, worker: "유지 작업자" });
  const preserved = plain(c.state.productionPlanJobs.find((job) => job.planRowId === "keep-row"));
  const orders = plain(c.state.purchaseOrders);
  c.state.productionPlanSelectedJobId = first.planRowId;
  c.state.productionPlanPickerJobId = first.planRowId;
  c.state.productionPlanDetailOpen = true;
  c.state.productionPlanActiveTab = "board";
  c.machineScheduleBoard = {};
  c.handleProductionPlanTableClick({ target: { closest: selector => selector === "[data-plan-delete-row]" ? { dataset: { planDeleteRow: first.planRowId } } : null } });
  assert.equal(c.getProductionPlanActiveJobs().length, 1);
  assert.deepEqual(plain(c.getProductionPlanActiveJobs()[0]), preserved);
  assert.deepEqual(plain(c.state.purchaseOrders), orders);
  assert.equal(c.state.productionPlanSelectedJobId, "");
  assert.equal(c.state.productionPlanPickerJobId, "");
  assert.equal(c.state.productionPlanDetailOpen, false);
  assert.equal(c.productionPlanTargetQuantity.innerHTML, "300 <em>ea</em>");
  assert.doesNotMatch(c.machineScheduleBoard.innerHTML, /삭제 대상 작업자/);
  assert.match(c.machineScheduleBoard.innerHTML, /유지 작업자/);
  c.saveProductionPlanDraft();
  c.loadProductionPlanDraft();
  assert.equal(c.state.productionPlanJobs.some((job) => job.planRowId === first.planRowId), false);
  assert.deepEqual(plain(c.getProductionPlanActiveJobs()[0]), preserved);
});

test("삭제 취소와 존재하지 않는 행 삭제는 계획과 저장본을 변경하지 않는다", () => {
  const c = setup();
  c.state.productionPlanJobs = c.buildProductionPlanJobs();
  c.saveProductionPlanDraft();
  const previous = plain(c.state.productionPlanJobs);
  c.window.confirm = () => false;
  c.deleteProductionPlanRow(c.getProductionPlanActiveJobs()[0].planRowId);
  c.deleteProductionPlanRow("missing");
  assert.deepEqual(plain(c.state.productionPlanJobs), previous);
  assert.deepEqual(plain(c.readProductionPlanDraft()), previous);
});

test("추가한 빈 행은 삭제하고 기본 5행 이하로는 줄이지 않는다", () => {
  const c = setup();
  c.state.productionPlanJobs = c.ensureProductionPlanRows([]);
  c.addProductionPlanRow("실크 인쇄");
  c.deleteProductionPlanRow(c.state.productionPlanJobs.at(-1).planRowId);
  assert.equal(c.state.productionPlanJobs.length, 15);
  const id = c.state.productionPlanJobs.find((job) => job.process === "실크 인쇄").planRowId;
  c.deleteProductionPlanRow(id);
  assert.equal(c.state.productionPlanJobs.length, 15);
  assert.equal(c.state.productionPlanJobs.some((job) => job.planRowId === id), false);
  for (const process of processes) assert.equal(c.state.productionPlanJobs.filter((job) => job.process === process).length, 5);
  c.state.productionPlanProcessFilter = "실크 인쇄";
  c.renderProductionPlanTable();
  assert.equal((c.productionPlanTableBody.innerHTML.match(/data-plan-delete-row=/g) || []).length, 5);
  assert.match(c.productionPlanTableBody.innerHTML, /rowspan="6"><span>실크 인쇄/);
});
