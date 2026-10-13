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

test('완료·취소 또는 미등록 제품은 계획에 연결하지 않는다',()=>{
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

function addPrintProducts(c) {
 const products=[
  {productCode:'FOIL',productName:'박 제품',clientName:'박 업체',finalProcess:'2도',processStage1:'박',processStage2:'박',processGroups:[[1],[2]]},
  {productCode:'SILK',productName:'실크 제품',finalProcess:'3도',processStage1:'실크',processStage2:'실크',processStage3:'실크',processGroups:[[1,2],[3]]},
  {productCode:'MIXED',productName:'혼합 제품',finalProcess:'3도',processStage1:'실크',processStage2:'박',processStage3:'실크'},
  {productCode:'COATING',productName:'코팅 제품',finalProcess:'코팅',processRoute:'코팅'}
 ];
 c.state.products.push(...products);
 c.state.purchaseOrders.push(...products.map(product=>({...order,productId:product.productCode,productName:product.productName,purchaseOrderId:'PO-'+product.productCode})));
 return products;
}

test('박은 박 공정 제품만, 실크·자동화는 박 공정이 없는 인쇄 제품만 허용한다',()=>{
 const c=setup();const [foil,silk,mixed,coating]=addPrintProducts(c);
 for(const process of ['실크 인쇄','자동화']) {
  assert.equal(c.isProductionPlanProductAllowed(foil,process),false);
  assert.equal(c.isProductionPlanProductAllowed(mixed,process),false);
  assert.equal(c.isProductionPlanProductAllowed(silk,process),true);
  assert.equal(c.isProductionPlanProductAllowed(coating,process),false);
 }
 assert.equal(c.isProductionPlanProductAllowed(foil,'박 인쇄'),true);
 assert.equal(c.isProductionPlanProductAllowed(mixed,'박 인쇄'),true);
 assert.equal(c.isProductionPlanProductAllowed(silk,'박 인쇄'),false);
 assert.deepEqual(plain(c.getProductionPlanStageOptions('MIXED','박 인쇄').map(option=>option.label)),['2도']);
 assert.deepEqual(plain(c.getProductionPlanStageOptions('SILK','자동화').map(option=>option.label)),['1도+2도','3도']);
});

test('예전 공정 경로와 공정 이름도 박 제품 제한에 반영한다',()=>{
 const c=setup();
 const legacy={productCode:'LEGACY',finalProcess:'3도',processRoute:'1도+2도 박 → 3도 실크',processGroups:[[1,2],[3]]};
 c.state.products.push(legacy);
 assert.equal(c.isProductionPlanProductAllowed(legacy,'박 인쇄'),true);
 assert.equal(c.isProductionPlanProductAllowed(legacy,'자동화'),false);
 assert.deepEqual(plain(c.getProductionPlanStageOptions('LEGACY','박 인쇄').map(option=>option.label)),['1도+2도']);
 assert.equal(c.isProductionPlanProductAllowed({finalProcess:'1도',processStage1:'박 인쇄'},'실크 인쇄'),false);
 assert.equal(c.isProductionPlanProductAllowed({finalProcess:'1도',productionProcess:'박 인쇄'},'박 인쇄'),true);
});

test('박으로 바꾸면 실크 제품 연결과 기존 실적을 해제하고 직접 잘못 연결하는 것도 차단한다',()=>{
 const c=setup();addPrintProducts(c);c.state.productionPlanJobs=c.buildProductionPlanJobs();
 const job=c.state.productionPlanJobs[0];Object.assign(job,{cumulativeProduction:7000,machine:'12호기',stageDrafts:{1:{cumulativeProduction:9000}}});
 const id=job.planRowId;assert.equal(c.changeProductionPlanPrintType(job,'박 인쇄'),true);
 assert.equal(job.planRowId,id);assert.equal(job.productId,'');assert.equal(job.purchaseOrderId,'');
 assert.equal(job.cumulativeProduction,undefined);assert.deepEqual(plain(job.stageDrafts),{});
 assert.equal(c.changeProductionPlanOrder(job,order.purchaseOrderId),false);
 assert.equal(c.changeProductionPlanOrder(job,'PO-FOIL'),true);assert.equal(job.productId,'FOIL');assert.equal(job.stage,1);
 assert.equal(c.changeProductionPlanStage(job,2),true);
 const before=plain(job);assert.equal(c.changeProductionPlanPrintType(job,'코팅'),false);assert.deepEqual(plain(job),before);
});

test('실크에서 자동화로 바꾸면 제품·공정은 유지하되 다른 유형의 실적을 재사용하지 않는다',()=>{
 const c=setup();addPrintProducts(c);const job=c.buildProductionPlanJobs()[0];
 Object.assign(job,{cumulativeProduction:7000,cumulativeHours:7,actualProduction:1000,machine:'12호기',productionReferenceId:'silk-ref'});
 assert.equal(c.changeProductionPlanPrintType(job,'자동화'),true);
 assert.equal(job.productId,order.productId);assert.equal(job.stage,2);assert.equal(job.process,'자동화');
 assert.equal(job.cumulativeProduction,null);assert.equal(job.cumulativeHours,null);assert.equal(job.productionReferenceId,'');
 assert.equal(job.worker,'유순희');assert.equal(job.packagingWorkerType,'outsourcing');
 assert.match(c.renderProductionPlanStaffOptions(job,'worker'),/>유순희<\/option>/);
});

test('박 제품 선택·공정·실적은 저장, 동기화와 자동 생성 후에도 유지된다',async()=>{
 const c=setup();addPrintProducts(c);c.state.productionPlanJobs=c.buildProductionPlanJobs();
 const job=c.state.productionPlanJobs[0];c.changeProductionPlanPrintType(job,'박 인쇄');c.changeProductionPlanOrder(job,'PO-FOIL');c.changeProductionPlanStage(job,2);
 Object.assign(job,{cumulativeProduction:9000,cumulativeHours:9,loss:0,machine:'3호기'});
 c.saveProductionPlanDraft();c.loadProductionPlanDraft();await c.syncProductionPlanOrders();await c.generateProductionPlanDraft();
 const saved=c.state.productionPlanJobs[0];
 assert.equal(saved.productId,'FOIL');assert.equal(saved.process,'박 인쇄');assert.equal(saved.stage,2);assert.equal(saved.cumulativeProduction,9000);
 assert.equal(c.state.productionPlanJobs.length,1);
 assert.match(c.productionPlanTableBody.innerHTML,/data-plan-field="process"/);
 assert.equal(c.getProductionPlanActiveJobs().length,1);
});

test('새 저장키는 기존 오브제 공정 선택 저장본을 읽고 원본을 보존한다',()=>{
 const c=setup();const oldKey=c.getProductionPlanLegacyStorageKey()+':stage-selection';
 const old=JSON.stringify({jobs:[{...order,process:'실크 인쇄',stage:1,stageSelectionVersion:1,productionMetricsVersion:2,cumulativeProduction:5000,cumulativeHours:5}]});
 c.testStorage.set(oldKey,old);c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs[0].stage,1);
 c.saveProductionPlanDraft();assert.equal(c.testStorage.get(oldKey),old);assert.ok(c.testStorage.has(c.getProductionPlanStorageKey()));
});

test('선택 제품을 바꿀 때 이전 제품의 누적 실적과 공정별 입력을 복사하지 않는다',()=>{
 const c=setup();const products=addPrintProducts(c);c.state.productionPlanJobs=c.buildProductionPlanJobs();
 const job=c.state.productionPlanJobs[0];Object.assign(job,{cumulativeProduction:9000,stageDrafts:{1:{cumulativeProduction:5000}}});
 c.state.productionPlanPickerJobId=job.planRowId;c.selectProductionPlanProduct(products[1]);
 const next=c.state.productionPlanJobs[0];assert.equal(next.productId,'SILK');assert.equal(next.stage,2);assert.equal(next.cumulativeProduction,null);
 assert.equal(next.stageGroup.join('+'),'1+2');assert.equal(next.stageDrafts[1],undefined);
 c.selectProductionPlanProduct(products[0]);assert.equal(c.state.productionPlanJobs[0].productId,'SILK');
});

test('동시 작업 공정은 단독 공정 실적이나 다른 제품의 실적을 자동 참조하지 않는다',()=>{
 const c=setup();addPrintProducts(c);const job=c.createProductionPlanEmptyJob(2,'실크 인쇄','SILK');
 c.changeProductionPlanOrder(job,'PO-SILK');
 c.state.productionPlanReferenceRows=[{id:'single',productName:'실크 제품 2도',process:'실크 인쇄',sourceDate:'2026-09-10',stage:2},
 {id:'wrong',productName:'다른 제품 1도+2도',process:'실크 인쇄',sourceDate:'2026-09-10',stage:2},
 {id:'wrong-client',productName:'실크 제품 1도+2도',clientName:'다른 업체',process:'실크 인쇄',sourceDate:'2026-09-10',stage:2},
 {id:'combined',productName:'실크 제품 1도+2도',process:'실크 인쇄',sourceDate:'2026-09-10',stage:2}];
 assert.equal(c.getProductionPlanReference(job).id,'combined');
 job.productionReferenceId='wrong';assert.equal(c.getProductionPlanReference(job),null);
});

test('자동화의 기존 5호기 이상 배정은 해제하고 자동 배정도 1~4호기만 사용한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 const job=c.state.productionPlanJobs[0];c.changeProductionPlanPrintType(job,'자동화');
 Object.assign(job,{machine:'12호기',cumulativeProduction:9000,cumulativeHours:9,loss:0});
 c.saveProductionPlanDraft();c.loadProductionPlanDraft();
 let row=c.state.productionPlanJobs[0];assert.equal(row.machine,'');
 assert.equal(row.cumulativeProduction,9000);
 assert.ok(c.state.productionPlanSchedule.entries.length>0);
 assert.ok(c.state.productionPlanSchedule.entries.every(entry=>['1호기','2호기','3호기','4호기'].includes(entry.machine)));
 row.machine='4호기';c.renderProductionPlan();row=c.state.productionPlanJobs[0];assert.equal(row.machine,'4호기');
 assert.ok(c.state.productionPlanSchedule.entries.every(entry=>entry.machine==='4호기'));
 c.changeProductionPlanPrintType(row,'실크 인쇄');Object.assign(row,{machine:'12호기',cumulativeProduction:9000,cumulativeHours:9,loss:0});
 c.renderProductionPlan();assert.equal(c.state.productionPlanJobs[0].machine,'12호기');
 assert.ok(c.state.productionPlanSchedule.entries.every(entry=>entry.machine==='12호기'));
});
