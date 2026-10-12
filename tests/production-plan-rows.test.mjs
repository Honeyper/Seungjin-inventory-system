import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const order = {
  purchaseOrderId: "PO-ROW-CHECK", productId: "NP-0001", productName: "오브제 파운데이션 외용기",
  clientName: "뉴파트너스", orderRound: "08/03", totalOrderQuantity: 10000,
  accumulatedInboundQuantity: 10700, accumulatedShippingQuantity: 0, endDate: "2026-09-30"
};

function setup() {
  const storage = new Map();
  const context = vm.createContext({
    crypto: { randomUUID },
    window: { confirm: () => true },
    state: { productionPlanDate: "2026-09-11", productionPlanFactory: "1공장", productionPlanJobs: [],
      productionPlanSelectedJobId: "", productionPlanProcessFilter: "", productionPlanActiveTab: "table",
      purchaseOrders: [order], products: [{ productCode: order.productId, productionProcess: "실크 인쇄" }], purchaseOrdersLoaded: true },
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
    ensureProductsLoaded: async () => {}, loadPurchaseOrders: async () => {}, requestApi: async () => ({ rows: [] })
  });
  vm.runInContext(fs.readFileSync(new URL("../frontend/production-planner.js", import.meta.url), "utf8"), context);
  vm.runInContext(source.slice(source.indexOf("const PRODUCTION_PROCESS_ORDER"), source.indexOf("const SYSTEM_UPDATE_HISTORY")), context);
  vm.runInContext(source.slice(source.indexOf("function getProductionPlanStorageKey()"), source.indexOf("function getCurrentView()")), context);
  context.testStorage = storage;
  return context;
}

test("빈 계획도 실크 인쇄·오브제 외용기 두 공정만 표시하고 반복 보정에 입력을 유지한다", () => {
  const c = setup(), rows = c.ensureProductionPlanRows([]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].process, "실크 인쇄");
  assert.equal(rows[0].productId, "NP-0001");
  rows[0].worker = "입력 유지";
  assert.deepEqual(plain(c.ensureProductionPlanRows(rows)), plain(rows));
  c.state.productionPlanJobs = rows;
  c.renderProductionPlanTable();
  assert.equal((c.productionPlanTableBody.innerHTML.match(/data-plan-row-id=/g) || []).length, 2);
  assert.doesNotMatch(c.productionPlanTableBody.innerHTML, /data-plan-add-process|data-plan-delete-row|박 인쇄|자동화/);
});

test("다른 제품과 중복 오브제 외용기 행을 제외해도 전달받은 원본은 변경하지 않는다", () => {
  const c = setup();
  const jobs = [{productId:"OTHER",process:"박 인쇄",worker:"다른 제품"},
    {productId:"NP-0001",purchaseOrderId:order.purchaseOrderId,process:"박 인쇄",worker:"유지"},
    {productId:"NP-0001",process:"실크 인쇄",worker:"중복"}];
  const original = plain(jobs), rows = c.ensureProductionPlanRows(jobs);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].worker, "유지");
  assert.equal(rows[0].process, "실크 인쇄");
  assert.deepEqual(plain(jobs), original);
});

test("오브제 외용기 발주가 여러 개라도 선택한 발주 두 공정만 동기화한다", async () => {
  const c = setup();
  c.state.purchaseOrders.push({...order,purchaseOrderId:"PO-OBJET-2"}, {...order,productId:"OTHER",purchaseOrderId:"PO-OTHER"});
  const selected = {...c.buildProductionPlanJobs()[0],purchaseOrderId:"PO-OBJET-2",worker:"선택 작업자",note:"입력 메모"};
  c.state.productionPlanJobs = [selected];
  await c.syncProductionPlanOrders();
  await c.generateProductionPlanDraft();
  assert.equal(c.state.productionPlanJobs.length, 2);
  assert.equal(c.state.productionPlanJobs[0].purchaseOrderId, "PO-OBJET-2");
  assert.equal(c.state.productionPlanJobs[0].worker, "선택 작업자");
  assert.equal(c.state.productionPlanJobs[0].note, "입력 메모");
  assert.equal(c.getProductionPlanOpenOrders().length, 2);
});

test("선택 함수를 직접 호출해도 다른 제품이나 발주로 바꿀 수 없다", () => {
  const c = setup();
  c.state.purchaseOrders.push({...order,productId:"OTHER",purchaseOrderId:"PO-OTHER"});
  c.state.productionPlanJobs = c.buildProductionPlanJobs();
  const job = c.state.productionPlanJobs[0], before = plain(job);
  c.state.productionPlanPickerJobId = job.planRowId;
  c.selectProductionPlanProduct({productCode:"OTHER"});
  assert.equal(c.changeProductionPlanOrder(job,"PO-OTHER"), false);
  assert.deepEqual(plain(job), before);
});

test("같은 오브제 외용기를 재선택해도 입력한 작업자와 생산실적을 초기화하지 않는다", () => {
  const c = setup();
  c.state.productionPlanJobs = c.buildProductionPlanJobs();
  const job = c.state.productionPlanJobs[0];
  Object.assign(job,{worker:"유지 작업자",cumulativeProduction:1000,cumulativeHours:1,loss:0});
  c.state.productionPlanPickerJobId = job.planRowId;
  c.selectProductionPlanProduct({productCode:"NP-0001"});
  assert.equal(c.state.productionPlanJobs.length, 2);
  assert.equal(c.state.productionPlanJobs[0].worker, "유지 작업자");
  assert.equal(c.state.productionPlanJobs[0].cumulativeProduction, 1000);
});

test("기존 전체 계획 저장본은 그대로 두고 오브제 외용기만 별도 범위로 저장한다", () => {
  const c = setup();
  const legacyKey = "rows-test:1공장:2026-09-11";
  const legacy = JSON.stringify({jobs:[{productId:"OTHER",process:"박 인쇄"},
    {...c.buildProductionPlanJobs()[0],worker:"예전 오브제 외용기 입력"}]});
  c.testStorage.set(legacyKey, legacy);
  c.loadProductionPlanDraft();
  assert.equal(c.state.productionPlanJobs.length, 2);
  assert.equal(c.state.productionPlanJobs[0].worker,"예전 오브제 외용기 입력");
  c.saveProductionPlanDraft();
  assert.equal(c.testStorage.get(legacyKey), legacy);
  assert.ok(c.testStorage.has("rows-test:product:NP-0001:1공장:2026-09-11"));
  c.state.productionPlanDate = "2026-09-12";
  assert.equal(c.readProductionPlanDraft(), null);
  c.state.productionPlanDate = "2026-09-11";
  c.state.productionPlanFactory = "2공장";
  assert.equal(c.readProductionPlanDraft(), null);
});

test("완료되거나 취소된 발주는 두 공정 계획에 연결하지 않는다", () => {
  const c = setup();
  for (const status of ["취소","임의 완료","발주완료"]) {
    c.state.purchaseOrders = [{...order,status}];
    const rows = c.ensureProductionPlanRows([{...order,process:"실크 인쇄"}]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].purchaseOrderId, "");
    assert.equal(c.getProductionPlanOpenOrders().length, 0);
  }
});

test("참고 실적도 오브제 외용기만 선택하고 다른 오브제 외용기 제품은 제외한다", () => {
  const c = setup();
  c.state.productionPlanReferenceRows = [{productName:"오브제 외용기"},{productName:"오브제 파운데이션 외용기"},
    {productName:"투쿨포스쿨"},{productName:"오브제 파운데이션 오버캡"}];
  assert.equal(c.getProductionPlanReferenceCandidates().length, 2);
});

test("두 공정 목표와 합계는 생산 잔량을 초과하지 않고 원본 발주는 유지한다", () => {
  const c = setup(), before = plain(c.state.purchaseOrders);
  c.state.productionPlanJobs = c.buildProductionPlanJobs();
  Object.assign(c.state.productionPlanJobs[0],{cumulativeProduction:9700,cumulativeHours:9.7,loss:0,worker:"작업자"});
  Object.assign(c.state.productionPlanJobs[1],{cumulativeProduction:9700,cumulativeHours:9.7,loss:0,worker:"2도 작업자"});
  c.renderProductionPlan();
  assert.equal(c.getProductionPlanActiveJobs().length, 2);
  assert.equal(c.state.productionPlanJobs[0].targetQuantity, 300);
  assert.equal(c.productionPlanTargetQuantity.innerHTML,"300 <em>ea</em>");
  assert.deepEqual(plain(c.state.purchaseOrders), before);
});

test("1도·2도의 기계와 실적은 독립 저장되고 메디큐브 저장본은 보존한다", () => {
  const c = setup();
  const previousKey = "rows-test:product:KR-0024:1공장:2026-09-11";
  const oldPlan = JSON.stringify({jobs:[{productId:"KR-0024",worker:"이전 계획"}]});
  c.testStorage.set(previousKey,oldPlan);
  c.state.productionPlanJobs = c.buildProductionPlanJobs();
  Object.assign(c.state.productionPlanJobs[0],{machine:"1호기",worker:"1도 작업자",cumulativeProduction:8000,cumulativeHours:4,loss:0});
  Object.assign(c.state.productionPlanJobs[1],{machine:"12호기",worker:"2도 작업자",cumulativeProduction:5000,cumulativeHours:5,loss:0});
  c.saveProductionPlanDraft();
  c.loadProductionPlanDraft();
  assert.deepEqual(plain(c.state.productionPlanJobs.map(row=>[row.stage,row.machine,row.worker,row.cumulativeProduction])),
    [[1,"1호기","1도 작업자",8000],[2,"12호기","2도 작업자",5000]]);
  assert.equal(c.testStorage.get(previousKey),oldPlan);
  assert.equal(new Set(c.state.productionPlanJobs.map(row=>row.planRowId)).size,2);
});

test("공정이 표시되지 않은 실적은 두 공정의 누적 생산량으로 자동 복사하지 않는다", () => {
  const c = setup();
  c.state.productionPlanReferenceRows = [{id:"unlabelled",productName:order.productName,process:"실크 인쇄",sourceDate:"2026-09-11",
    dueDate:order.endDate,orderQuantity:order.totalOrderQuantity,cumulativeProduction:9000,cumulativeHours:9}];
  const jobs = c.buildProductionPlanJobs();
  for(const job of jobs) {
    assert.equal(c.getProductionPlanReference(job),null);
    assert.equal(c.getProductionPlanCalculations(job).cumulativeProduction,null);
  }
});

test("공정 구분이 없던 예전 계획의 실적을 1도 생산분으로 가정하지 않는다", () => {
  const c = setup();
  const previous = {...order,productionMetricsVersion:2,process:"실크 인쇄",worker:"기존 작업자",
    cumulativeProduction:9000,cumulativeHours:9,actualProduction:1000};
  for(const rows of [c.ensureProductionPlanRows([previous]),c.buildProductionPlanJobs({preserve:[previous]})]) {
    assert.equal(rows[0].worker,"기존 작업자");
    assert.equal(rows[0].cumulativeProduction,null);
    assert.equal(rows[0].actualProduction,null);
    assert.equal(c.getProductionPlanCalculations(rows[1]).cumulativeProduction,null);
  }
  assert.equal(previous.cumulativeProduction,9000);
});
