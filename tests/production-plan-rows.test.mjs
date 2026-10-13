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
      purchaseOrders: [order], products: [{ productCode: order.productId, productionProcess: "실크 인쇄", finalProcess: "2도", processGroups: [[1],[2]] }], purchaseOrdersLoaded: true },
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
  vm.runInContext(fs.readFileSync(new URL("../frontend/qr-label.js", import.meta.url), "utf8"), context);
  context.window.SeungjinQrLabel = context.SeungjinQrLabel;
  vm.runInContext(fs.readFileSync(new URL("../frontend/production-planner.js", import.meta.url), "utf8"), context);
  vm.runInContext(source.slice(source.indexOf("const PRODUCTION_PROCESS_ORDER"), source.indexOf("const SYSTEM_UPDATE_HISTORY")), context);
  vm.runInContext(source.slice(source.indexOf("function getProductionPlanLegacyStorageKey()"), source.indexOf("function getCurrentView()")), context);
  context.testStorage = storage;
  return context;
}

test('오브제 기본 계획은 2도 한 행이며 자동 생성과 동기화 후에도 한 행이다',async()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 assert.equal(c.state.productionPlanJobs.length,1);assert.equal(c.state.productionPlanJobs[0].stage,2);
 await c.syncProductionPlanOrders();await c.generateProductionPlanDraft();
 assert.equal(c.state.productionPlanJobs.length,1);assert.equal(c.state.productionPlanJobs[0].stage,2);
 assert.equal((c.productionPlanTableBody.innerHTML.match(/data-plan-row-id=/g)||[]).length,1);
 assert.match(c.productionPlanTableBody.innerHTML,/data-plan-field="stage"/);
});

test('공정 선택은 제품의 등록 공정을 사용하고 동시 공정도 하나의 선택지로 제공한다',()=>{
 const c=setup();
 assert.deepEqual(plain(c.getProductionPlanStageOptions().map(option=>[option.stage,option.label])),[[1,'1도'],[2,'2도']]);
 c.state.products.push({productCode:'MULTI',finalProcess:'6도',processGroups:[[1,2],[3],[4,5,6]]});
 assert.deepEqual(plain(c.getProductionPlanStageOptions('MULTI').map(option=>[option.stage,option.label,option.ordinal])),
  [[2,'1도+2도',1],[3,'3도',2],[6,'4도+5도+6도',3]]);
 assert.equal(c.getProductionPlanStageOptions('UNKNOWN').length,0);
});

test('공정 변경 시 실적이 섞이지 않고 이전 공정으로 돌아가면 입력을 복원한다',()=>{
 const c=setup();const job=c.buildProductionPlanJobs()[0];
 Object.assign(job,{machine:'12호기',cumulativeProduction:5000,cumulativeHours:5,loss:0,note:'2도 메모'});
 assert.equal(c.changeProductionPlanStage(job,1),true);assert.equal(job.cumulativeProduction,null);
 Object.assign(job,{machine:'1호기',cumulativeProduction:8000,cumulativeHours:4,loss:0,note:'1도 메모'});
 assert.equal(c.changeProductionPlanStage(job,2),true);
 assert.equal(job.cumulativeProduction,5000);assert.equal(job.machine,'12호기');assert.equal(job.note,'2도 메모');
 assert.equal(c.changeProductionPlanStage(job,1),true);
 assert.equal(job.cumulativeProduction,8000);assert.equal(job.machine,'1호기');assert.equal(job.note,'1도 메모');
 const before=plain(job);assert.equal(c.changeProductionPlanStage(job,6),false);assert.deepEqual(plain(job),before);
});

test('선택한 1도는 저장·재조회·발주 동기화·자동 생성 후에도 1도로 유지한다',async()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 c.changeProductionPlanStage(c.state.productionPlanJobs[0],1);
 c.saveProductionPlanDraft();c.loadProductionPlanDraft();
 await c.syncProductionPlanOrders();await c.generateProductionPlanDraft();
 assert.equal(c.state.productionPlanJobs.length,1);assert.equal(c.state.productionPlanJobs[0].stage,1);
});

test('예전 두 행 저장본은 2도를 선택해서 불러오며 원본을 덮어쓰지 않는다',()=>{
 const c=setup();
 const original=JSON.stringify({jobs:[{...order,stage:1,productionMetricsVersion:2,cumulativeProduction:8000,cumulativeHours:4,machine:'1호기'},
  {...order,stage:2,productionMetricsVersion:2,cumulativeProduction:5000,cumulativeHours:5,machine:'12호기'}]});
 const oldKey=c.getProductionPlanLegacyStorageKey();c.testStorage.set(oldKey,original);
 c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs.length,1);
 assert.equal(c.state.productionPlanJobs[0].stage,2);assert.equal(c.state.productionPlanJobs[0].cumulativeProduction,5000);
 c.saveProductionPlanDraft();assert.equal(c.testStorage.get(oldKey),original);
 assert.ok(c.testStorage.has(c.getProductionPlanStorageKey()));
 c.changeProductionPlanStage(c.state.productionPlanJobs[0],1);
 assert.equal(c.state.productionPlanJobs[0].cumulativeProduction,8000);
});

test('1도 자료만 있던 예전 계획을 2도 실적으로 잘못 사용하지 않는다',()=>{
 const c=setup();const old={...order,stage:1,productionMetricsVersion:2,cumulativeProduction:9000,cumulativeHours:9};
 const rows=c.ensureProductionPlanRows([old]);
 assert.equal(rows.length,1);assert.equal(rows[0].stage,2);
 assert.equal(c.getProductionPlanCalculations(rows[0]).cumulativeProduction,null);
 assert.equal(old.cumulativeProduction,9000);
});

test('2도만 선택한 계획은 1도 작업이나 실적 없이도 2도 목표를 계산한다',()=>{
 const c=setup();const before=plain(c.state.purchaseOrders);c.state.productionPlanJobs=c.buildProductionPlanJobs();
 Object.assign(c.state.productionPlanJobs[0],{cumulativeProduction:9700,cumulativeHours:9.7,loss:0,machine:'1호기'});
 c.renderProductionPlan();assert.equal(c.state.productionPlanSchedule.unknown.length,0);
 assert.equal(c.state.productionPlanJobs[0].targetQuantity,300);assert.equal(c.productionPlanTargetQuantity.innerHTML,'300 <em>ea</em>');
 c.changeProductionPlanStage(c.state.productionPlanJobs[0],1);
 Object.assign(c.state.productionPlanJobs[0],{cumulativeProduction:9000,cumulativeHours:9,loss:0});
 c.renderProductionPlan();assert.equal(c.productionPlanTargetQuantity.innerHTML,'1,000 <em>ea</em>');
 assert.deepEqual(plain(c.state.purchaseOrders),before);
});

test('완료·취소 또는 다른 제품은 샘플 계획에 연결하지 않는다',()=>{
 const c=setup();
 for(const status of ['취소','임의 완료','발주완료']) {
  c.state.purchaseOrders=[{...order,status}];assert.equal(c.getProductionPlanOpenOrders().length,0);
  assert.equal(c.ensureProductionPlanRows([order])[0].purchaseOrderId,'');
 }
 c.state.purchaseOrders=[order,{...order,productId:'OTHER',purchaseOrderId:'PO-OTHER'}];
 const job=c.buildProductionPlanJobs()[0];const before=plain(job);
 assert.equal(c.changeProductionPlanOrder(job,'PO-OTHER'),false);assert.deepEqual(plain(job),before);
});

test('공정이 표시되지 않은 참고 실적은 선택한 공정의 누적 생산량으로 자동 복사하지 않는다',()=>{
 const c=setup();c.state.productionPlanReferenceRows=[{id:'unlabelled',productName:order.productName,process:'실크 인쇄',
  sourceDate:'2026-09-11',orderQuantity:order.totalOrderQuantity,dueDate:order.endDate,cumulativeProduction:9000,cumulativeHours:9}];
 const job=c.buildProductionPlanJobs()[0];assert.equal(c.getProductionPlanReference(job),null);
 assert.equal(c.getProductionPlanCalculations(job).cumulativeProduction,null);
});

test('공정 선택을 바꾸어도 직원·아웃소싱 구분과 이름 표시를 유지한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 c.changeProductionPlanStage(c.state.productionPlanJobs[0],1);c.saveProductionPlanDraft();c.loadProductionPlanDraft();
 const job=c.state.productionPlanJobs[0];
 assert.deepEqual([job.worker,job.workerType,job.packagingWorker,job.packagingWorkerType],['유순희','employee','수쿠마','outsourcing']);
 assert.match(c.renderProductionPlanStaffOptions(job,'worker'),/>유순희<\/option>/);
 assert.doesNotMatch(c.renderProductionPlanStaffOptions(job,'worker'),/\(직원\)/);
 assert.match(c.renderProductionPlanStaffOptions(job,'packagingWorker'),/수쿠마.*아웃소싱/);
});
