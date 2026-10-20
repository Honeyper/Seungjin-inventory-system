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
  accumulatedInboundQuantity: 10700, accumulatedShippingQuantity: 0, endDate: "2026-11-30"
};

function setup() {
  const storage = new Map();
  const context = vm.createContext({
    crypto: { randomUUID },
    window: { confirm: () => true },
    state: { productionPlanDate: "2026-09-11", productionPlanFactory: "1공장", productionPlanJobs: [],
      productionPlanSelectedJobId: "", productionPlanProcessFilter: "", productionPlanActiveTab: "table",
      purchaseOrders: [order], products: [{ productCode: order.productId, productionProcess: "실크 인쇄", finalProcess: "2도", processGroups: [[1],[2]], processHourlyProductionRates: {"1도":1000,"2도":2000} }], purchaseOrdersLoaded: true },
    PRODUCTION_PLAN_STORAGE_PREFIX: "rows-test",
    ADMIN_CACHE_PREFIX: "seungjinAdminCache:v3:prod", ADMIN_LOCAL_CACHE_MAX_BYTES: 1024*1024,
    localStorage: { get length() {return storage.size;}, key: index => [...storage.keys()][index] ?? null,
      getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    productionPlanTableBody: { innerHTML: "", querySelectorAll: () => [] },
    productionPlanStatus: { textContent: "", dataset: {} },
    productionPlanRowMenu: null,
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
  vm.runInContext(source.slice(source.indexOf("function getAdminResponseCacheKeys("), source.indexOf("\n}\n", source.indexOf("function writeAdminCache(")) + 3), context);
  context.testStorage = storage;
  return context;
}

test('제품에 등록된 2도 생산량과 발주량만으로 목표가 즉시 계산된다',async()=>{
 const c=setup();const before=plain(c.state.purchaseOrders);c.state.productionPlanJobs=c.buildProductionPlanJobs();
 c.renderProductionPlan();assert.equal(c.state.productionPlanJobs.length,1);
 const job=c.state.productionPlanJobs[0];assert.equal(job.stage,2);assert.equal(job.hourlyRate,2000);
 assert.equal(job.targetQuantity,10000);assert.equal(job.hours,8);
 Object.assign(job,{cumulativeProduction:999999,cumulativeHours:1,loss:999999,actualProduction:0,workDays:0});
 c.renderProductionPlan();assert.equal(c.state.productionPlanJobs[0].targetQuantity,10000);
 await c.syncProductionPlanOrders();assert.equal(c.state.productionPlanJobs[0].targetQuantity,10000);
 assert.deepEqual(plain(c.state.purchaseOrders),before);
});

test('선택 공정별 등록 생산량을 사용하고 작업자·기계·메모를 따로 보관한다',()=>{
 const c=setup();const job=c.buildProductionPlanJobs()[0];Object.assign(job,{machine:'12호기',note:'2도 메모'});
 c.changeProductionPlanStage(job,1);c.updateProductionPlanTargets([job]);
 assert.equal(job.hourlyRate,1000);assert.equal(job.targetQuantity,8000);assert.equal(job.hours,8);
 Object.assign(job,{machine:'1호기',note:'1도 메모'});
 c.changeProductionPlanStage(job,2);c.updateProductionPlanTargets([job]);
 assert.equal(job.machine,'12호기');assert.equal(job.note,'2도 메모');assert.equal(job.targetQuantity,10000);
 assert.equal(c.changeProductionPlanStage(job,6),false);
});

test('저장·재조회·발주 새로고침 후에도 선택한 제품·공정·작업자를 유지한다',async()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();c.changeProductionPlanStage(c.state.productionPlanJobs[0],1);
 Object.assign(c.state.productionPlanJobs[0],{machine:'4호기',note:'다음날 작업'});c.saveProductionPlanDraft();c.loadProductionPlanDraft();await c.syncProductionPlanOrders();
 const job=c.state.productionPlanJobs[0];assert.equal(job.stage,1);assert.equal(job.machine,'4호기');assert.equal(job.note,'다음날 작업');
 assert.equal(job.worker,'유순희');assert.equal(job.packagingWorkerType,'outsourcing');assert.equal(job.targetQuantity,8000);
});

test('예전 두 행 계획은 2도 한 행으로 불러오며 실적과 무관하게 제품 생산량을 쓴다',()=>{
 const c=setup();const key=c.getProductionPlanLegacyStorageKey();const original=JSON.stringify({jobs:[{...order,stage:1,cumulativeProduction:9000},{...order,stage:2,cumulativeProduction:9500}]});
 c.testStorage.set(key,original);c.loadProductionPlanDraft();const job=c.state.productionPlanJobs[0];
 assert.equal(job.stage,2);assert.equal(job.hourlyRate,2000);assert.equal(job.targetQuantity,10000);c.saveProductionPlanDraft();assert.equal(c.testStorage.get(key),original);
});

test('해당 공정 생산량이 없으면 실적이나 다른 공정 생산량으로 추측하지 않는다',()=>{
 const c=setup();c.state.products[0].processHourlyProductionRates={'1도':1000};c.state.products[0].hourlyProductionRate=7000;
 const job=c.buildProductionPlanJobs()[0];Object.assign(job,{cumulativeProduction:9000,cumulativeHours:1,loss:0});c.updateProductionPlanTargets([job]);
 assert.equal(job.planMissing,true);assert.equal(job.targetQuantity,0);assert.match(job.planMessage,/2도 시간당 생산량/);
});

test('동시 공정은 묶음으로 등록한 생산량을 사용하고 개별 생산량을 합산하지 않는다',()=>{
 const c=setup();c.state.products[0].processGroups=[[1,2]];c.state.products[0].processHourlyProductionRates={'1도':1000,'2도':2000,'1도+2도':1500};
 const job=c.buildProductionPlanJobs()[0];c.updateProductionPlanTargets([job]);assert.equal(job.hourlyRate,1500);assert.equal(job.targetQuantity,10000);
 delete c.state.products[0].processHourlyProductionRates['1도+2도'];c.updateProductionPlanTargets([job]);assert.equal(job.planMissing,true);
});

test('단일 공정의 기존 제품별 시간당 평균 생산량도 사용할 수 있다',()=>{
 const c=setup();Object.assign(c.state.products[0],{finalProcess:'1도',processGroups:[[1]],processHourlyProductionRates:{},hourlyProductionRate:750});
 const job=c.buildProductionPlanJobs()[0];c.updateProductionPlanTargets([job]);assert.equal(job.stage,1);assert.equal(job.targetQuantity,6000);
});

test('자동화 기계는 1~4호기만 허용하며 자동 배정 없이 선택한 기계만 저장한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];c.changeProductionPlanPrintType(job,'자동화');job.machine='12호기';c.renderProductionPlan();
 assert.equal(c.state.productionPlanJobs[0].machine,'');assert.equal(c.state.productionPlanJobs[0].scheduledMachine,'');
 c.state.productionPlanJobs[0].machine='4호기';c.saveProductionPlanDraft();c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs[0].machine,'4호기');
});

test('발주 완료·취소와 유형이 맞지 않는 제품은 계획에 연결하지 않는다',()=>{
 const c=setup();for(const status of ['취소','임의 완료','발주완료']) {c.state.purchaseOrders=[{...order,status}];assert.equal(c.getProductionPlanOpenOrders().length,0);}
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

test('실크에서 자동화로 바꾸면 제품·공정은 유지하되 다른 유형의 실적을 재사용하지 않는다',()=>{
 const c=setup();addPrintProducts(c);const job=c.buildProductionPlanJobs()[0];
 Object.assign(job,{cumulativeProduction:7000,cumulativeHours:7,actualProduction:1000,machine:'12호기',productionReferenceId:'silk-ref'});
 assert.equal(c.changeProductionPlanPrintType(job,'자동화'),true);
 assert.equal(job.productId,order.productId);assert.equal(job.stage,2);assert.equal(job.process,'자동화');
 assert.equal(job.cumulativeProduction,undefined);assert.equal(job.cumulativeHours,undefined);assert.equal(job.productionReferenceId,undefined);
 assert.equal(job.worker,'유순희');assert.equal(job.packagingWorkerType,'outsourcing');
 assert.match(c.renderProductionPlanStaffOptions(job,'worker'),/>유순희<\/option>/);
});

test('선택 제품을 바꿀 때 이전 제품의 누적 실적과 공정별 입력을 복사하지 않는다',()=>{
 const c=setup();const products=addPrintProducts(c);c.state.productionPlanJobs=c.buildProductionPlanJobs();
 const job=c.state.productionPlanJobs[0];Object.assign(job,{cumulativeProduction:9000,stageDrafts:{1:{cumulativeProduction:5000}}});
 c.state.productionPlanPickerJobId=job.planRowId;c.selectProductionPlanProduct(products[1]);
 const next=c.state.productionPlanJobs[0];assert.equal(next.productId,'SILK');assert.equal(next.stage,2);assert.equal(c.getProductionPlanCalculations(next).hourlyRate,null);
 assert.equal(next.stageGroup.join('+'),'1+2');assert.equal(next.stageDrafts[1],undefined);
 c.selectProductionPlanProduct(products[0]);assert.equal(c.state.productionPlanJobs[0].productId,'SILK');
});

function useQuotaStorage(c, limit) {
 const store=c.testStorage;
 c.localStorage.setItem=(key,value)=>{
  const bytes=2 * ([...store].filter(([name])=>name!==key).reduce((sum,[name,data])=>sum+name.length+data.length,0)+key.length+value.length);
  if(bytes>limit) {const error=new Error('quota');error.name='QuotaExceededError';throw error;}
  store.set(key,value);
 };
}

test('저장 공간이 찼을 때 응답 캐시만 정리하고 계획과 입력값을 저장한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 const job=c.state.productionPlanJobs[0];Object.assign(job,{cumulativeProduction:11000,cumulativeHours:11,note:'진행 중 입력'});
 const protectedKeys={
  'rows-test:selected-job:1공장:2026-09-10':'지난 계획',
  'seungjinProductionPlan:v1:prod:sources':'참고 실적 선택',
  'seungjinShippingBoxDrafts':'출고 입력',
  'seungjinMobilePersistentSession':'로그인',
  'another-application':'다른 프로그램',
  'seungjinAdminCache:v3:prod:productsDraft':'편집 중 내용'
 };
 Object.entries(protectedKeys).forEach(([key,value])=>c.testStorage.set(key,value));
 c.testStorage.set('seungjinAdminCache:v3:prod:inbounds:2026-10-01:2026-10-13','x'.repeat(5000));
 c.testStorage.set('seungjinAdminCache:v2:dev:products','x'.repeat(5000));
 useQuotaStorage(c,7000);
 assert.equal(c.saveProductionPlanDraft(),true);
 assert.equal(c.productionPlanStatus.dataset.type,'success');
 const saved=JSON.parse(c.testStorage.get(c.getProductionPlanStorageKey()));assert.equal(saved.jobs[0].cumulativeProduction,11000);assert.equal(saved.jobs[0].note,'진행 중 입력');
 Object.entries(protectedKeys).forEach(([key,value])=>assert.equal(c.testStorage.get(key),value));
 assert.equal(c.testStorage.has('seungjinAdminCache:v2:dev:products'),false);
 assert.equal(c.testStorage.has('seungjinAdminCache:v3:prod:inbounds:2026-10-01:2026-10-13'),false);
 c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs[0].cumulativeHours,11);
});

test('임시 캐시가 없어 재시도도 실패하면 기존 계획과 현재 입력을 보존하고 실패를 표시한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 c.testStorage.set(c.getProductionPlanStorageKey(),'이전 저장본');c.testStorage.set('other-origin-data','x'.repeat(5000));useQuotaStorage(c,1000);
 const before=plain(c.state.productionPlanJobs);
 assert.equal(c.saveProductionPlanDraft(),false);assert.equal(c.testStorage.get(c.getProductionPlanStorageKey()),'이전 저장본');
 assert.deepEqual(plain(c.state.productionPlanJobs),before);assert.equal(c.productionPlanStatus.dataset.type,'error');assert.match(c.productionPlanStatus.textContent,/저장 공간이 부족/);
});

test('브라우저 저장 권한 차단은 캐시를 지우지 않고 권한 오류로 안내한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();c.testStorage.set('seungjinAdminCache:v3:prod:products','cached');
 c.localStorage.setItem=()=>{const error=new Error('blocked');error.name='SecurityError';throw error;};
 assert.equal(c.saveProductionPlanDraft(),false);assert.equal(c.testStorage.get('seungjinAdminCache:v3:prod:products'),'cached');
 assert.match(c.productionPlanStatus.textContent,/브라우저에서 저장을 차단/);
});

test('조회 캐시는 전체 1MB 안에서 오래된 응답만 교체하고 계획을 보존한다',()=>{
 const c=setup();c.testStorage.set('seungjinProductionPlan:v1:prod:plan','saved-plan');
 c.testStorage.set('seungjinAdminCache:v3:prod:inbounds:old',JSON.stringify({savedAt:1,data:'x'.repeat(300000)}));
 c.testStorage.set('seungjinAdminCache:v3:prod:products',JSON.stringify({savedAt:2,data:'x'.repeat(100000)}));
 c.writeAdminCache('inbounds:new',{rows:'x'.repeat(300000)});
 assert.equal(c.testStorage.has('seungjinAdminCache:v3:prod:inbounds:old'),false);
 assert.equal(c.testStorage.has('seungjinAdminCache:v3:prod:products'),true);
 assert.equal(c.testStorage.get('seungjinProductionPlan:v1:prod:plan'),'saved-plan');
 const bytes=c.getAdminResponseCacheKeys(c.localStorage).reduce((sum,key)=>sum+2*(key.length+c.localStorage.getItem(key).length),0);
 assert.ok(bytes<=1024*1024);assert.equal(JSON.parse(c.testStorage.get('seungjinAdminCache:v3:prod:inbounds:new')).data.rows.length,300000);
 c.writeAdminCache('inbounds:new',{rows:'x'.repeat(600000)});
 assert.equal(c.testStorage.has('seungjinAdminCache:v3:prod:inbounds:new'),false);
 assert.equal(c.testStorage.get('seungjinProductionPlan:v1:prod:plan'),'saved-plan');
});

test('저장값을 실제로 다시 읽을 수 없으면 저장 성공으로 표시하지 않는다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();c.localStorage.setItem=()=>{};
 assert.equal(c.saveProductionPlanDraft(),false);assert.equal(c.productionPlanStatus.dataset.type,'error');
});


test('계획표 납기는 최신 발주의 날짜 또는 일 필수 수량을 표시하고 생산량은 상세에만 둔다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,deliveryType:'daily',dailyMinimumQuantity:7000,endDate:'2020-01-01'}];
 c.state.productionPlanJobs=c.buildProductionPlanJobs();c.renderProductionPlan();
 const job=c.state.productionPlanJobs[0];
 assert.equal(c.getProductionPlanDeliveryLabel(job),'일 7,000개 이상');
 assert.equal(job.targetQuantity,10000);
 const [main]=c.productionPlanTableBody.innerHTML.split('</tr>');
 assert.match(main,/일 7,000개 이상/);assert.doesNotMatch(main,/2,000 개\/시간/);
 assert.match(c.productionPlanTableBody.innerHTML,/시간당 생산량<\/dt>.*2,000 개\/시간/s);
 c.state.purchaseOrders[0].dailyMinimumQuantity=12000;
 assert.equal(c.getProductionPlanDeliveryLabel(job),'일 12,000개 이상');
 Object.assign(c.state.purchaseOrders[0],{deliveryType:'date',endDate:'2026-10-30'});
 assert.equal(c.getProductionPlanDeliveryLabel(job),'2026-10-30');
 c.state.purchaseOrders[0].endDate='';assert.equal(c.getProductionPlanDeliveryLabel(job),'미정');
 assert.equal(c.getProductionPlanDeliveryLabel({purchaseOrderId:''}),'—');
});


test('상세 13개 항목은 기존 목표를 바꾸지 않고 공정별 입력을 저장한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,deliveryType:'daily',dailyMinimumQuantity:7000}];
 c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 Object.assign(job,{workDays:17,loss:200,lossMode:"manual",cumulativeProduction:4000,cumulativeHours:2,actualProduction:6000});
 c.updateProductionPlanTargets([job]);assert.equal(job.targetQuantity,10000);
 const values=c.getProductionPlanDetailMetrics(job);
 assert.equal(values.dailyRequired,7000);assert.equal(values.dailyTargetHours,8);assert.equal(values.totalExpectedHours,5);
 assert.ok(Math.abs(values.achievementRate-6000/7000*100)<1e-8);
 assert.equal(c.formatProductionPlanDetailValue('achievementRate',values.achievementRate),'85.7%');
 assert.equal((c.renderProductionPlanMetrics(job).match(/<dt>/g)||[]).length,13);
 c.changeProductionPlanStage(job,1);assert.equal(job.actualProduction,null);
 Object.assign(job,{workDays:5,loss:0,lossMode:"manual",cumulativeProduction:0,cumulativeHours:0,actualProduction:0});
 c.changeProductionPlanStage(job,2);assert.equal(job.actualProduction,6000);assert.equal(job.loss,200);
 assert.equal(c.saveProductionPlanDraft(),true);c.loadProductionPlanDraft();
 const saved=c.state.productionPlanJobs[0];assert.equal(saved.workDays,17);assert.equal(saved.cumulativeHours,2);assert.equal(saved.actualProduction,6000);
 c.state.purchaseOrders[0].deliveryType='date';assert.equal(c.getProductionPlanDetailMetrics(saved).dailyRequired,10000);
 saved.workDays=null;saved.actualProduction=null;c.state.products[0].processHourlyProductionRates["2도"]=null;const empty=c.getProductionPlanDetailMetrics(saved);
 assert.equal(empty.dailyRequired,null);assert.equal(empty.achievementRate,null);
 assert.equal(c.formatProductionPlanDetailValue('achievementRate',empty.achievementRate),'—');
});


test('생산 실적이 없으면 잔여 작업일은 총 소요시간을 8시간으로 나누며 기존 수기 작업일은 계산에 쓰지 않는다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,totalOrderQuantity:99100,deliveryType:'daily',dailyMinimumQuantity:7000}];
 c.state.products[0].processHourlyProductionRates['2도']=751;
 c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];job.workDays=5;
 let values=c.getProductionPlanDetailMetrics(job);
 assert.equal(values.workDays,99100/751/8);assert.equal(c.formatProductionPlanDetailValue('workDays',values.workDays),'16.5일');
 assert.equal(values.dailyRequired,7000);
 const html=c.renderProductionPlanMetrics(job);assert.match(html,/data-plan-detail-value="workDays"/);assert.doesNotMatch(html,/data-plan-field="workDays"/);
 c.state.products[0].processHourlyProductionRates['2도']=1000;
 for(const [quantity,days,label] of [[68000,8.5,'8.5일'],[65600,8.2,'8.2일'],[8000,1,'1일'],[8010,1.00125,'1.1일'],[500,.0625,'0.1일'],[0,0,'0일']]){
  c.state.purchaseOrders[0].totalOrderQuantity=quantity;values=c.getProductionPlanDetailMetrics(job);
  assert.equal(values.workDays,days);assert.equal(c.formatProductionPlanDetailValue('workDays',values.workDays),label);
 }
 c.state.products[0].processHourlyProductionRates['2도']=null;
 values=c.getProductionPlanDetailMetrics(job);assert.equal(values.workDays,null);assert.equal(c.formatProductionPlanDetailValue('workDays',values.workDays),'—');
});


test('LOSS는 발주량 5%로 시작하고 직접 수정한 값과 0개를 공정별로 저장한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,totalOrderQuantity:99100}];
 c.state.productionPlanJobs=c.buildProductionPlanJobs();let job=c.state.productionPlanJobs[0];
 assert.equal(job.loss,4955);assert.equal(job.lossMode,'auto');
 c.state.purchaseOrders[0].totalOrderQuantity=100000;c.updateProductionPlanTargets([job]);assert.equal(job.loss,5000);
 job.loss=0;job.lossMode='manual';c.state.purchaseOrders[0].totalOrderQuantity=120000;
 c.updateProductionPlanTargets([job]);assert.equal(job.loss,0);
 assert.equal(c.saveProductionPlanDraft(),true);c.loadProductionPlanDraft();job=c.state.productionPlanJobs[0];
 assert.equal(job.loss,0);assert.equal(job.lossMode,'manual');
 c.changeProductionPlanStage(job,1);c.updateProductionPlanTargets([job]);assert.equal(job.loss,6000);
 job.loss=12;job.lossMode='manual';c.changeProductionPlanStage(job,2);c.updateProductionPlanTargets([job]);assert.equal(job.loss,0);
 job.loss=null;job.lossMode='auto';c.state.purchaseOrders[0].totalOrderQuantity=20000;c.updateProductionPlanTargets([job]);assert.equal(job.loss,1000);
 job.loss=42;delete job.lossMode;c.updateProductionPlanTargets([job]);assert.equal(job.loss,42);assert.equal(job.lossMode,'manual');
});

test('지정 납기의 일일 필수 수량은 자동 작업일의 부동소수 오차로 1개 늘어나지 않는다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,totalOrderQuantity:50000,deliveryType:'date'}];
 c.state.products[0].processHourlyProductionRates['2도']=751;
 const job=c.buildProductionPlanJobs()[0];assert.equal(c.getProductionPlanDetailMetrics(job).dailyRequired,6000);
 c.state.purchaseOrders[0].totalOrderQuantity=99100;c.state.products[0].processHourlyProductionRates['2도']=1000;
 assert.equal(c.getProductionPlanDetailMetrics(job).dailyRequired,8000);
});


test('누적 생산량은 날짜별 금일 생산량을 중복 없이 합산하고 현재 수정값을 우선한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 const put=(key,jobs)=>{c.testStorage.set(key,JSON.stringify({jobs}));c.invalidateProductionPlanActualLedger();};
 const record=actual=>({...job,actualProduction:actual,stageDrafts:{}});
 put('rows-test:selected-job:1공장:2026-09-09',[record(1000)]);
 put('rows-test:1공장:2026-09-09',[record(9999)]);
 put('rows-test:selected-job:1공장:2026-09-10',[{...record(9000),stage:1,stageGroup:[1],stageDrafts:{2:{stageGroup:[2],actualProduction:2000}}},record(2500)]);
 put(c.getProductionPlanStorageKey(),[record(3000)]);
 put('rows-test:selected-job:2공장:2026-09-11',[record(700)]);
 put('rows-test:selected-job:1공장:2026-09-12',[record(9000)]);
 put('rows-test:selected-job:1공장:2026-09-08',[{...record(999),purchaseOrderId:'OTHER'}, {...record(999),process:'박 인쇄'}, {...record(999),stage:1,stageGroup:[1]}, {...record(999),stageGroup:[1,2]}]);
 put('rows-test-dev:selected-job:1공장:2026-09-07',[record(9999)]);
 put('rows-test:selected-job:1공장:2026-02-30',[record(9999)]);
 c.testStorage.set('rows-test:selected-job:1공장:2026-09-07','broken');put('rows-test:1공장:2026-09-07',[record(150)]);
 job.actualProduction=500;job.cumulativeProduction=123456;
 assert.equal(c.getProductionPlanCumulativeProduction(job),4850);
 job.actualProduction=0;assert.equal(c.getProductionPlanCumulativeProduction(job),4350);
 job.actualProduction=null;assert.equal(c.getProductionPlanCumulativeProduction(job),4350);
 job.actualProduction=600;c.saveProductionPlanDraft();assert.equal(c.getProductionPlanCumulativeProduction(job),4950);
 c.saveProductionPlanDraft();assert.equal(c.getProductionPlanCumulativeProduction(job),4950);
 const html=c.renderProductionPlanMetrics(job);assert.match(html,/data-plan-detail-value="cumulativeProduction"/);assert.doesNotMatch(html,/data-plan-field="cumulativeProduction"/);assert.match(html,/금일 생산량/);
 put('rows-test:selected-job:1공장:2026-09-09',[record(2000)]);c.invalidateProductionPlanActualLedger();assert.equal(c.getProductionPlanCumulativeProduction(job),5950);
});

test('비활성 공정에 보관한 금일 생산량도 합산하고 입력마다 저장본을 다시 읽지 않는다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 c.testStorage.set('rows-test:selected-job:1공장:2026-09-10',JSON.stringify({jobs:[{...job,stage:1,stageGroup:[1],actualProduction:9000,stageDrafts:{2:{stageGroup:[2],actualProduction:'2,000'}}}]}));
 c.invalidateProductionPlanActualLedger();
 let reads=0;const get=c.localStorage.getItem;c.localStorage.getItem=key=>{reads++;return get(key);};
 job.actualProduction=500;assert.equal(c.getProductionPlanCumulativeProduction(job),2500);const initial=reads;
 for(let i=0;i<20;i++){job.actualProduction=i;assert.equal(c.getProductionPlanCumulativeProduction(job),2000+i);}
 assert.equal(reads,initial);
 c.invalidateProductionPlanActualLedger();c.localStorage.key=()=>{throw new Error('storage denied');};assert.equal(c.getProductionPlanCumulativeProduction(job),null);
});


test('저장값 읽기가 차단되면 누적 생산량을 0으로 표시하지 않는다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 c.testStorage.set('rows-test:selected-job:1공장:2026-09-10',JSON.stringify({jobs:[{...job,actualProduction:2000}]}));
 c.invalidateProductionPlanActualLedger();c.localStorage.getItem=()=>{throw new Error('storage denied');};
 assert.equal(c.getProductionPlanCumulativeProduction(job),null);
});


test('잔여 작업일은 누적 생산량 기준이며 근무시간·LOSS와 별개로 0일 아래로 내려가지 않는다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,totalOrderQuantity:92000,deliveryType:'date'}];
 c.state.products[0].processHourlyProductionRates['2도']=1000;
 c.state.productionPlanJobs=c.buildProductionPlanJobs();let job=c.state.productionPlanJobs[0];
 const baseline=c.getProductionPlanDetailMetrics(job);
 for(const [production,label] of [[null,'11.5일'],[0,'11.5일'],[8000,'10.5일'],[16800,'9.4일'],[91990,'0.1일'],[92000,'0일'],[100000,'0일'],['','11.5일']]){
  Object.assign(job,{actualWorkHours:999,cumulativeHours:99999,actualProduction:production,cumulativeProduction:99999,loss:99999,lossMode:'manual'});
  const values=c.getProductionPlanDetailMetrics(job);
  assert.equal(c.formatProductionPlanDetailValue('workDays',values.workDays),label);
  assert.equal(values.totalExpectedHours,92);assert.equal(values.dailyRequired,baseline.dailyRequired);
  assert.equal(values.dailyTargetHours,baseline.dailyTargetHours);
 }
 job.actualProduction=8000;job.actualWorkHours=8;assert.match(c.renderProductionPlanMetrics(job),/<dt>잔여 작업일<\/dt>/);
 c.saveProductionPlanDraft();c.loadProductionPlanDraft();job=c.state.productionPlanJobs[0];
 assert.equal(c.getProductionPlanDetailMetrics(job).workDays,10.5);
 c.changeProductionPlanStage(job,1);assert.equal(job.actualWorkHours,null);
 c.changeProductionPlanStage(job,2);assert.equal(c.getProductionPlanDetailMetrics(job).workDays,10.5);
 c.state.products[0].processHourlyProductionRates['2도']=null;
 assert.equal(c.getProductionPlanDetailMetrics(job).workDays,null);
});

test('누적 시간은 일별 실 근무시간만 소수점 둘째 자리까지 중복 없이 합산한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 const row=hours=>({...job,actualWorkHours:hours,cumulativeHours:9999,stageDrafts:{}});
 const put=(key,jobs)=>{c.testStorage.set(key,JSON.stringify({jobs}));c.invalidateProductionPlanActualLedger();};
 put('rows-test:selected-job:1공장:2026-09-09',[row(2.5)]);
 put('rows-test:1공장:2026-09-09',[row(999)]);
 put('rows-test:selected-job:1공장:2026-09-10',[{...row(99),stage:1,stageGroup:[1],stageDrafts:{2:{stageGroup:[2],actualWorkHours:1.25,cumulativeHours:999}}}]);
 put('rows-test:selected-job:2공장:2026-09-11',[row(3.1)]);
 put(c.getProductionPlanStorageKey(),[row(999)]);
 put('rows-test:selected-job:1공장:2026-09-12',[row(999)]);
 put('rows-test:selected-job:1공장:2026-09-08',[{...row(999),purchaseOrderId:'OTHER'},{...row(999),stageGroup:[1,2]},{...row(999),process:'박 인쇄'},{...row(999),productId:'OTHER'}]);
 job.actualWorkHours=.2;job.cumulativeHours=123456;
 assert.equal(c.getProductionPlanCumulativeHours(job),7.05);
 job.actualWorkHours=0;assert.equal(c.getProductionPlanCumulativeHours(job),6.85);
 job.actualWorkHours=null;assert.equal(c.getProductionPlanCumulativeHours(job),6.85);
 job.actualWorkHours=.35;c.saveProductionPlanDraft();c.saveProductionPlanDraft();c.loadProductionPlanDraft();
 const loaded=c.state.productionPlanJobs[0];assert.equal(loaded.actualWorkHours,.35);assert.equal(loaded.cumulativeHours,123456);
 assert.equal(c.getProductionPlanCumulativeHours(loaded),7.2);
 const html=c.renderProductionPlanMetrics(loaded);assert.match(html,/data-plan-detail-value="cumulativeHours"/);assert.doesNotMatch(html,/data-plan-field="cumulativeHours"/);
 assert.ok(html.indexOf('<dt>실 근무시간</dt>')>html.indexOf('<dt>누적 시간</dt>'));
 put('rows-test:selected-job:1공장:2026-09-10',[{...row(99),stage:1,stageGroup:[1],stageDrafts:{2:{stageGroup:[2],actualWorkHours:1.25}}},row(4)]);
 c.invalidateProductionPlanActualLedger();assert.equal(c.getProductionPlanCumulativeHours(loaded),9.95);
 c.changeProductionPlanStage(loaded,1);assert.equal(loaded.actualWorkHours,null);
 c.changeProductionPlanStage(loaded,2);assert.equal(loaded.actualWorkHours,.35);
});

test('누적 시간은 소수 합산 오차와 저장 제한을 처리하고 수기 누적값을 일별 시간으로 쓰지 않는다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 const key='rows-test:selected-job:1공장:2026-09-10';
 c.testStorage.set(key,JSON.stringify({jobs:[{...job,actualWorkHours:.1,cumulativeHours:1000}]}));
 c.invalidateProductionPlanActualLedger();
 let reads=0;const get=c.localStorage.getItem;c.localStorage.getItem=k=>{reads++;return get(k);};
 job.actualWorkHours=.2;job.cumulativeHours=1000;assert.equal(c.getProductionPlanCumulativeHours(job),.3);
 const initial=reads;for(let i=0;i<20;i++){job.actualWorkHours=i;assert.equal(c.getProductionPlanCumulativeHours(job),i+.1);}assert.equal(reads,initial);
 c.testStorage.set(key,JSON.stringify({jobs:[{...job,actualWorkHours:.2}]}));c.invalidateProductionPlanActualLedger();job.actualWorkHours=.1;assert.equal(c.getProductionPlanCumulativeHours(job),.3);
 c.invalidateProductionPlanActualLedger();c.localStorage.getItem=()=>{throw new Error('storage denied');};
 const metrics=c.getProductionPlanDetailMetrics(job);assert.equal(metrics.cumulativeHours,null);assert.equal(metrics.workDays,null);
 assert.equal(c.formatProductionPlanDetailValue('cumulativeHours',null),'—');
});

test('목표는 전날까지의 같은 공정 실적만 빼고 오늘 입력과 반복 저장에 흔들리지 않는다',()=>{
 const c=setup();c.state.productionPlanDate='2026-10-19';c.state.purchaseOrders=[{...order,totalOrderQuantity:24000,endDate:'2026-10-21',deliveryType:'date'}];
 c.state.products[0].processHourlyProductionRates['2도']=1000;c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 const put=(key,actual)=>{c.testStorage.set(key,JSON.stringify({jobs:[{...job,actualProduction:actual,stageDrafts:{}}]}));c.invalidateProductionPlanActualLedger();};
 const past='rows-test:selected-job:2공장:2026-10-16';put(past,17000);
 put('rows-test:selected-job:2공장:2026-10-19',9000);put(c.getProductionPlanStorageKey(),9999);
 job.actualProduction=5000;c.updateProductionPlanTargets([job]);assert.equal(job.targetQuantity,7000);assert.equal(job.hours,8);
 c.saveProductionPlanDraft();c.saveProductionPlanDraft();assert.equal(c.getProductionPlanCalculations(job).targetQuantity,7000);
 put(past,18000);c.refreshProductionPlanTargets();assert.equal(job.targetQuantity,6000);assert.equal(job.actualProduction,5000);
 c.setProductionPlanDate('2026-10-20');assert.equal(c.state.productionPlanJobs[0].targetQuantity,0); // 18,000 + 9,000 + 5,000 already exceeds 24,000.
});

test('마지막 날 목표가 500개 미만이어도 정확한 잔량을 표시하고 하루 계획시간은 8시간이다',()=>{
 const c=setup();c.state.productionPlanDate='2026-10-19';c.state.purchaseOrders=[{...order,totalOrderQuantity:250,endDate:'2026-10-20'}];
 c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];c.updateProductionPlanTargets([job]);
 assert.equal(job.targetQuantity,250);assert.equal(job.hours,8);assert.equal(c.getProductionPlanDetailMetrics(job).dailyRequired,250);
 c.state.purchaseOrders[0].endDate='2028-01-01';c.updateProductionPlanTargets([job]);assert.equal(job.planMissing,true);assert.match(job.planMessage,/공휴일 자료/);
});


test('오브제 12·13·14일 8시간씩 근무해 목표 초과 생산하면 잔여 일수도 더 줄어든다',()=>{
 const c=setup();c.state.productionPlanDate='2026-10-15';c.state.purchaseOrders=[{...order,totalOrderQuantity:99100,deliveryType:'daily',dailyMinimumQuantity:7000}];
 c.state.products[0].processHourlyProductionRates['2도']=1023;c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 for(const [date,actual] of [['2026-10-12',10000],['2026-10-13',11000],['2026-10-14',12000]]) {
  c.testStorage.set(`rows-test:selected-job:1공장:${date}`,JSON.stringify({jobs:[{...job,actualProduction:actual,actualWorkHours:8,stageDrafts:{}}]}));
 }
 c.invalidateProductionPlanActualLedger();let metrics=c.getProductionPlanDetailMetrics(job);
 assert.equal(metrics.cumulativeProduction,33000);assert.equal(metrics.cumulativeHours,24);
 assert.equal(metrics.workDays,(99100-33000)/1023/8);assert.equal(c.formatProductionPlanDetailValue('workDays',metrics.workDays),'8.1일');
 assert.ok(metrics.workDays<(99100/1023-24)/8);
 job.actualWorkHours=8;assert.equal(c.getProductionPlanDetailMetrics(job).workDays,metrics.workDays);
 job.actualProduction=2000;metrics=c.getProductionPlanDetailMetrics(job);assert.equal(metrics.cumulativeProduction,35000);assert.equal(metrics.cumulativeHours,32);
 assert.equal(c.formatProductionPlanDetailValue('workDays',metrics.workDays),'7.9일');
 c.saveProductionPlanDraft();c.loadProductionPlanDraft();assert.equal(c.getProductionPlanDetailMetrics(c.state.productionPlanJobs[0]).cumulativeProduction,35000);
});


test('12·14일 실크와 13일 자동화의 같은 2도 실적을 합산한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,totalOrderQuantity:99100,deliveryType:'daily',dailyMinimumQuantity:7000}];
 c.state.products[0].processHourlyProductionRates['2도']=1023;
 for(const [date,process,total] of [['2026-10-12','실크 인쇄',8000],['2026-10-13','자동화',16000],['2026-10-14','실크 인쇄',24000]]) {
  c.state.productionPlanDate=date;c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
  c.changeProductionPlanPrintType(job,process);Object.assign(job,{actualProduction:8000,actualWorkHours:8});
  assert.equal(c.getProductionPlanCumulativeProduction(job),total);assert.equal(c.getProductionPlanCumulativeHours(job),total/1000);
  c.saveProductionPlanDraft();c.saveProductionPlanDraft();c.loadProductionPlanDraft();
  assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),total);
 }
 const job=c.state.productionPlanJobs[0];assert.equal(c.formatProductionPlanDetailValue('workDays',c.getProductionPlanDetailMetrics(job).workDays),'9.2일');
 assert.equal(c.getProductionPlanCumulativeActual(job,'actualProduction',{beforeDateOnly:true}),16000);
 c.state.productionPlanDate='2026-10-15';c.loadProductionPlanDraft();
 assert.equal(c.getProductionPlanCalculations(c.state.productionPlanJobs[0]).remainingQuantity,75100);
});


test('새 날짜는 같은 공장·발주의 마지막 저장 공정·유형·기계를 이어받고 실적은 새로 입력한다',()=>{
 const c=setup();c.state.productionPlanDate='2026-10-12';c.state.productionPlanJobs=c.buildProductionPlanJobs();
 let job=c.state.productionPlanJobs[0];c.changeProductionPlanPrintType(job,'자동화');c.changeProductionPlanStage(job,1);
 Object.assign(job,{machine:'3호기',actualProduction:8000,actualWorkHours:8,note:'전날 메모',loss:123,lossMode:'manual'});c.saveProductionPlanDraft();
 c.setProductionPlanDate('2026-10-13');job=c.state.productionPlanJobs[0];
 assert.equal(job.process,'자동화');assert.equal(job.stage,1);assert.equal(job.machine,'3호기');
 assert.equal(job.actualProduction??null,null);assert.equal(job.actualWorkHours??null,null);assert.notEqual(job.loss,123);assert.notEqual(job.note,'전날 메모');
 assert.equal(c.getProductionPlanCumulativeProduction(job),8000);c.changeProductionPlanStage(job,2);job.machine='4호기';c.saveProductionPlanDraft();
 c.setProductionPlanDate('2026-10-14');job=c.state.productionPlanJobs[0];assert.equal(job.stage,2);assert.equal(job.machine,'4호기');
 job.machine='';c.saveProductionPlanDraft();c.setProductionPlanDate('2026-10-19');assert.equal(c.state.productionPlanJobs[0].machine,'');
 c.setProductionPlanDate('2026-10-13');job=c.state.productionPlanJobs[0];assert.equal(job.stage,2);assert.equal(job.machine,'4호기');
});

test('이전 설정은 다른 공장·발주·미래 날짜에서 가져오지 않고 유효한 기계만 이어받는다',()=>{
 const c=setup();c.state.productionPlanDate='2026-10-15';const base=c.buildProductionPlanJobs()[0];
 const put=(factory,date,job)=>c.testStorage.set(`rows-test:selected-job:${factory}:${date}`,JSON.stringify({jobs:[job]}));
 put('1공장','2026-10-12',{...base,process:'자동화',machine:'3호기'});
 put('2공장','2026-10-14',{...base,process:'자동화',machine:'2호기'});
 put('1공장','2026-10-14',{...base,purchaseOrderId:'OTHER',process:'자동화',machine:'1호기'});
 put('1공장','2026-10-16',{...base,process:'자동화',machine:'4호기'});
 c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs[0].machine,'3호기');
 put('1공장','2026-10-13',{...base,process:'자동화',machine:'12호기'});
 c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs[0].machine,'');
 c.setProductionPlanDate('2026-10-11');assert.equal(c.state.productionPlanJobs[0].process,'실크 인쇄');assert.equal(c.state.productionPlanJobs[0].machine,'');
});


test('오브제 최초 등록일 이전의 미배정 자동 행과 빈 저장본은 목록에서 제외한다',async()=>{
 const c=setup();c.state.productionPlanDate='2026-10-12';c.state.productionPlanJobs=c.buildProductionPlanJobs();
 const started={...c.state.productionPlanJobs[0],machine:'3호기',actualProduction:8000,actualWorkHours:8,stageDrafts:{}};
 c.testStorage.set(c.getProductionPlanStorageKey(),JSON.stringify({jobs:[started]}));
 const oldKey='rows-test:selected-job:1공장:2026-10-10',old=JSON.stringify({jobs:[{...started,machine:'',actualProduction:null,actualWorkHours:null}]});c.testStorage.set(oldKey,old);
 for(const date of ['2026-10-10','2026-10-11']) {
  c.setProductionPlanDate(date);assert.equal(c.getProductionPlanActiveJobs().length,0);assert.equal(c.state.productionPlanJobs[0].purchaseOrderId,'');
  c.renderProductionPlan();await c.syncProductionPlanOrders();assert.equal(c.getProductionPlanActiveJobs().length,0);
 }
 assert.equal(c.testStorage.get(oldKey),old);
 c.setProductionPlanDate('2026-10-12');assert.equal(c.getProductionPlanActiveJobs().length,1);assert.equal(c.state.productionPlanJobs[0].actualProduction,8000);
 c.setProductionPlanDate('2026-10-13');assert.equal(c.state.productionPlanJobs[0].machine,'3호기');assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),8000);
});

test('기계가 없어도 저장한 실적은 등록 이력으로 인정하며 다른 공장 기록은 시작일로 쓰지 않는다',()=>{
 const c=setup();c.state.productionPlanDate='2026-10-12';const base=c.buildProductionPlanJobs()[0];
 c.testStorage.set(c.getProductionPlanStorageKey(),JSON.stringify({jobs:[{...base,actualProduction:8000,actualWorkHours:8}]}));
 c.testStorage.set('rows-test:selected-job:2공장:2026-10-09',JSON.stringify({jobs:[{...base,machine:'3호기'}]}));
 c.setProductionPlanDate('2026-10-11');assert.equal(c.getProductionPlanActiveJobs().length,0);
 c.setProductionPlanDate('2026-10-12');assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),8000);
});


test('지정 납기일까지 설정을 유지하고 납기 다음 날부터 저장 계획도 목록에서 제외한다',async()=>{
 const c=setup();c.state.purchaseOrders=[{...order,endDate:'2026-10-14'}];c.setProductionPlanDate('2026-10-12');
 Object.assign(c.state.productionPlanJobs[0],{machine:'3호기',actualProduction:8000,actualWorkHours:8});c.saveProductionPlanDraft();
 c.setProductionPlanDate('2026-10-13');assert.equal(c.state.productionPlanJobs[0].machine,'3호기');
 c.setProductionPlanDate('2026-10-14');assert.equal(c.getProductionPlanActiveJobs().length,1);assert.equal(c.state.productionPlanJobs[0].machine,'3호기');
 Object.assign(c.state.productionPlanJobs[0],{actualProduction:8000,actualWorkHours:8});c.saveProductionPlanDraft();const records=new Map(c.testStorage);
 c.setProductionPlanDate('2026-10-15');assert.equal(c.getProductionPlanActiveJobs().length,0);assert.equal(c.getProductionPlanOpenOrders().length,0);
 assert.equal(c.state.productionPlanJobs[0].productName,'');assert.equal(c.changeProductionPlanOrder(c.state.productionPlanJobs[0],order.purchaseOrderId),false);
 await c.syncProductionPlanOrders();assert.equal(c.getProductionPlanActiveJobs().length,0);assert.deepEqual([...c.testStorage],[...records]);
 c.setProductionPlanDate('2026-10-14');assert.equal(c.state.productionPlanJobs[0].actualProduction,8000);assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),16000);
});

test('최신 납기를 기준으로 숨기고 납기가 연장되면 보관한 저장 계획을 다시 보여준다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,endDate:'2026-10-14'}];c.state.productionPlanDate='2026-10-15';
 const saved={...c.createProductionPlanEmptyJob(2,'실크 인쇄',order.productId),purchaseOrderId:order.purchaseOrderId,dueDate:'2026-10-30',machine:'4호기',actualProduction:8000};
 const key=c.getProductionPlanStorageKey(),raw=JSON.stringify({jobs:[saved]});c.testStorage.set(key,raw);
 c.loadProductionPlanDraft();assert.equal(c.getProductionPlanActiveJobs().length,0);assert.equal(c.testStorage.get(key),raw);
 c.state.purchaseOrders[0].endDate='2026-10-16';c.loadProductionPlanDraft();assert.equal(c.getProductionPlanActiveJobs().length,1);assert.equal(c.state.productionPlanJobs[0].machine,'4호기');assert.equal(c.state.productionPlanJobs[0].actualProduction,8000);
 c.state.purchaseOrders=[];c.state.productionPlanDate='2026-10-31';assert.equal(c.ensureProductionPlanRows([saved])[0].purchaseOrderId,'');
});

test('시작 이력이 없는 매일 납기와 유효한 종료일이 없는 발주는 임의로 숨기지 않는다',()=>{
 const c=setup();c.state.productionPlanDate='2026-12-31';
 for(const values of [{deliveryType:'daily',endDate:'2020-01-01',dailyMinimumQuantity:7000},{deliveryType:'date',endDate:''},{deliveryType:'date',endDate:'2026-02-30'}]){
  c.state.purchaseOrders=[{...order,...values}];c.state.productionPlanJobs=c.buildProductionPlanJobs();assert.equal(c.getProductionPlanActiveJobs().length,1);
 }
});


test('잔여 수량은 선택일까지 누적 실적을 차감하고 편집·저장·재조회·공정 변경을 반영한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,totalOrderQuantity:99100}];c.setProductionPlanDate('2026-10-12');
 for(const date of ['2026-10-12','2026-10-13','2026-10-14']) {
  c.setProductionPlanDate(date);Object.assign(c.state.productionPlanJobs[0],{actualProduction:8000,actualWorkHours:8});c.saveProductionPlanDraft();
 }
 let job=c.state.productionPlanJobs[0];assert.equal(c.getProductionPlanDetailMetrics(job).remainingProduction,75100);
 const markup=c.renderProductionPlanMetrics(job);assert.ok(markup.indexOf('data-plan-detail-value="remainingProduction"')>markup.indexOf('data-plan-detail-value="cumulativeProduction"'));
 assert.equal(c.formatProductionPlanDetailValue('remainingProduction',75100),'75,100 ea');
 job.actualProduction=9000;assert.equal(c.getProductionPlanDetailMetrics(job).remainingProduction,74100);
 c.saveProductionPlanDraft();c.loadProductionPlanDraft();job=c.state.productionPlanJobs[0];assert.equal(c.getProductionPlanDetailMetrics(job).remainingProduction,74100);
 c.changeProductionPlanStage(job,1);assert.equal(c.getProductionPlanDetailMetrics(job).remainingProduction,99100);
 c.changeProductionPlanStage(job,2);assert.equal(c.getProductionPlanDetailMetrics(job).remainingProduction,74100);
 job.actualProduction=100000;assert.equal(c.getProductionPlanDetailMetrics(job).remainingProduction,0);
 c.setProductionPlanDate('2026-10-12');assert.equal(c.getProductionPlanDetailMetrics(c.state.productionPlanJobs[0]).remainingProduction,91100);
 c.state.purchaseOrders[0].totalOrderQuantity=null;assert.equal(c.getProductionPlanDetailMetrics(c.state.productionPlanJobs[0]).remainingProduction,null);
});

test('매일 납기는 12·13·14일 실적 24000개를 뺀 예상 완료일까지 표시하고 조회만으로 연장하지 않는다',async()=>{
 const c=setup();c.state.purchaseOrders=[{...order,deliveryType:'daily',dailyMinimumQuantity:7000,totalOrderQuantity:99100,endDate:''}];
 c.state.products[0].processHourlyProductionRates['2도']=1023;
 for(const date of ['2026-10-12','2026-10-13','2026-10-14']) {
  c.setProductionPlanDate(date);const job=c.state.productionPlanJobs[0];c.changeProductionPlanPrintType(job,date==='2026-10-13'?'자동화':'실크 인쇄');
  Object.assign(job,{machine:'3호기',actualProduction:8000,actualWorkHours:8});c.saveProductionPlanDraft();
 }
 const dailyOrder=c.state.purchaseOrders[0],records=new Map(c.testStorage);
 assert.equal(c.getProductionPlanDailyCompletionDate(dailyOrder),'2026-10-28');
 c.setProductionPlanDate('2026-10-28');assert.equal(c.getProductionPlanActiveJobs().length,1);assert.equal(c.state.productionPlanJobs[0].machine,'3호기');
 c.setProductionPlanDate('2026-10-29');assert.equal(c.getProductionPlanActiveJobs().length,0);assert.equal(c.getProductionPlanOpenOrders().length,0);
 c.loadProductionPlanDraft();await c.syncProductionPlanOrders();assert.equal(c.getProductionPlanActiveJobs().length,0);assert.deepEqual([...c.testStorage],[...records]);
 c.setProductionPlanDate('2026-10-14');assert.equal(c.getProductionPlanDetailMetrics(c.state.productionPlanJobs[0]).remainingProduction,75100);
 c.window.SEUNGJIN_CONFIG={PRODUCTION_PLAN_HOLIDAYS:['2026-10-15']};assert.equal(c.getProductionPlanDailyCompletionDate(dailyOrder),'2026-10-29');
});

test('매일 납기 최초 배정일은 고정하고 일일 최소량 연장근무·마지막 잔량·완료 실적을 반영한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,deliveryType:'daily',dailyMinimumQuantity:7000,totalOrderQuantity:14001,endDate:''}];
 c.state.products[0].processHourlyProductionRates['2도']=800;c.setProductionPlanDate('2026-10-12');
 c.state.productionPlanJobs[0].machine='3호기';c.saveProductionPlanDraft();assert.equal(c.getProductionPlanDailyCompletionDate(c.state.purchaseOrders[0]),'2026-10-13');
 c.setProductionPlanDate('2026-10-13');c.saveProductionPlanDraft();assert.equal(c.getProductionPlanDailyCompletionDate(c.state.purchaseOrders[0]),'2026-10-13');
 c.setProductionPlanDate('2026-10-15');assert.equal(c.getProductionPlanActiveJobs().length,0);
 c.setProductionPlanDate('2026-10-13');Object.assign(c.state.productionPlanJobs[0],{actualProduction:15000,actualWorkHours:10});c.saveProductionPlanDraft();
 assert.equal(c.getProductionPlanDailyCompletionDate(c.state.purchaseOrders[0]),'2026-10-13');
 c.setProductionPlanDate('2026-10-14');assert.equal(c.getProductionPlanActiveJobs().length,0);
});


test('오브제 44차·45차 발주 전환은 같은 공정의 당일 실적을 분리하고 입력 중인 값을 보관한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,orderRound:'44차 발주',totalOrderQuantity:99100},{...order,purchaseOrderId:'PO-45',orderRound:'45차 발주',totalOrderQuantity:45000}];
 const originals=plain(c.state.purchaseOrders);c.setProductionPlanDate('2026-10-12');let job=c.state.productionPlanJobs[0];
 Object.assign(job,{actualProduction:8000,actualWorkHours:8,machine:'3호기',note:'44 메모',loss:123,lossMode:'manual'});
 assert.equal(c.switchProductionPlanOrder(job,'PO-45'),true);assert.equal(job.stage,2);assert.equal(job.actualProduction??null,null);assert.equal(job.actualWorkHours??null,null);
 assert.equal(job.note,'');assert.equal(job.lossMode,'auto');assert.equal(c.getProductionPlanCumulativeProduction(job),0);assert.equal(c.getProductionPlanDetailMetrics(job).remainingProduction,45000);
 Object.assign(job,{actualProduction:3000,actualWorkHours:3,note:'45 메모',loss:0,lossMode:'manual'});
 assert.equal(c.switchProductionPlanOrder(job,order.purchaseOrderId),true);assert.equal(job.actualProduction,8000);assert.equal(job.actualWorkHours,8);assert.equal(job.note,'44 메모');assert.equal(job.loss,123);
 c.renderProductionPlan();assert.match(c.productionPlanTableBody.innerHTML,/data-plan-field="purchaseOrderId"/);assert.match(c.productionPlanTableBody.innerHTML,/44차 발주/);assert.match(c.productionPlanTableBody.innerHTML,/45차 발주/);
 assert.equal(c.saveProductionPlanDraft(),true);let stored=JSON.parse(c.testStorage.get(c.getProductionPlanStorageKey()));assert.equal(stored.jobs.length,2);assert.equal(stored.jobs[0].purchaseOrderId,order.purchaseOrderId);
 c.loadProductionPlanDraft();job=c.state.productionPlanJobs[0];assert.equal(c.getProductionPlanCumulativeProduction(job),8000);
 c.switchProductionPlanOrder(job,'PO-45');assert.equal(job.actualProduction,3000);assert.equal(job.actualWorkHours,3);assert.equal(job.note,'45 메모');assert.equal(job.loss,0);
 assert.equal(c.getProductionPlanDetailMetrics(job).remainingProduction,42000);c.saveProductionPlanDraft();c.saveProductionPlanDraft();c.loadProductionPlanDraft();
 assert.equal(c.state.productionPlanJobs[0].purchaseOrderId,'PO-45');assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),3000);
 c.setProductionPlanDate('2026-10-13');job=c.state.productionPlanJobs[0];assert.equal(job.purchaseOrderId,'PO-45');assert.equal(job.actualProduction??null,null);assert.equal(c.getProductionPlanCumulativeProduction(job),3000);
 c.switchProductionPlanOrder(job,order.purchaseOrderId);assert.equal(c.getProductionPlanCumulativeProduction(job),8000);assert.equal(job.actualProduction??null,null);
 assert.deepEqual(plain(c.state.purchaseOrders),originals);
});

test('다른 발주 실적·공정별 입력을 원문 그대로 보관하고 날짜·공장별 임시 편집을 섞지 않는다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,orderRound:'44차'},{...order,purchaseOrderId:'PO-45',orderRound:'45차',totalOrderQuantity:20000}];
 c.setProductionPlanDate('2026-10-12');let job=c.state.productionPlanJobs[0];Object.assign(job,{actualProduction:1000,machine:'3호기'});c.saveProductionPlanDraft();
 const archived={...job,purchaseOrderId:'PO-45',stage:1,actualProduction:500,stageGroup:[1],stageDrafts:{2:{actualProduction:700,stageGroup:[2],loss:0,lossMode:'manual'}}};
 const key=c.getProductionPlanStorageKey();const saved=JSON.parse(c.testStorage.get(key));saved.jobs.push(archived);c.testStorage.set(key,JSON.stringify(saved));c.loadProductionPlanDraft();
 job=c.state.productionPlanJobs[0];job.actualProduction=1200;c.saveProductionPlanDraft();assert.deepEqual(JSON.parse(c.testStorage.get(key)).jobs[1],plain(archived));
 c.switchProductionPlanOrder(job,'PO-45');assert.equal(job.stage,1);assert.equal(job.actualProduction,500);c.changeProductionPlanStage(job,2);assert.equal(job.actualProduction,700);
 c.switchProductionPlanOrder(job,order.purchaseOrderId);assert.equal(job.actualProduction,1200);
 c.setProductionPlanDate('2026-10-13');job=c.state.productionPlanJobs[0];c.switchProductionPlanOrder(job,'PO-45');assert.equal(job.actualProduction??null,null);
 c.state.productionPlanFactory='2공장';c.loadProductionPlanDraft();job=c.state.productionPlanJobs[0];c.switchProductionPlanOrder(job,'PO-45');assert.equal(job.actualProduction??null,null);
 assert.equal(c.getProductionPlanCumulativeProduction(job),700);
});

test('발주 선택은 다른 제품·완료·취소·잔량 0·납기 이후 발주를 제외한다',()=>{
 const c=setup();c.setProductionPlanDate('2026-10-15');c.state.purchaseOrders=[{...order,orderRound:'44차'},{...order,purchaseOrderId:'PO-45',orderRound:'45차'},
  {...order,purchaseOrderId:'CANCELED',status:'취소'}, {...order,purchaseOrderId:'COMPLETE',status:'발주완료'}, {...order,purchaseOrderId:'EMPTY',remainingShippingQuantity:0},
  {...order,purchaseOrderId:'EXPIRED',endDate:'2026-10-14'}, {...order,purchaseOrderId:'OTHER',productId:'OTHER'}];
 const job=c.state.productionPlanJobs[0];assert.deepEqual(plain(c.getProductionPlanOrderOptions(job).map(item=>item.purchaseOrderId)),[order.purchaseOrderId,'PO-45']);
 const before=plain(job);assert.equal(c.switchProductionPlanOrder(job,'EXPIRED'),false);assert.deepEqual(plain(job),before);
});


test('평일 장시간 분산은 같은 공장·작업자의 전날까지 실제 근무시간을 반영한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,totalOrderQuantity:49000,endDate:'2026-10-24',deliveryType:'date'}];c.state.products[0].processHourlyProductionRates['2도']=1000;
 for(const date of ['2026-10-19','2026-10-20']) {
  c.setProductionPlanDate(date);const job=c.state.productionPlanJobs[0];if(date==='2026-10-20')c.changeProductionPlanPrintType(job,'자동화');
  Object.assign(job,{actualProduction:10000,actualWorkHours:10,machine:'3호기'});c.saveProductionPlanDraft();
 }
 const row=c.state.productionPlanJobs[0];
 c.testStorage.set('rows-test:selected-job:2공장:2026-10-20',JSON.stringify({jobs:[{...row,actualProduction:0,actualWorkHours:10}]}));
 c.testStorage.set('rows-test:selected-job:1공장:2026-10-18',JSON.stringify({jobs:[{...row,purchaseOrderId:'OTHER',worker:'다른 작업자',actualProduction:0,actualWorkHours:10}]}));
 c.setProductionPlanDate('2026-10-21');const job=c.state.productionPlanJobs[0],before=new Map(c.testStorage);
 assert.deepEqual(plain(c.getProductionPlanPreviousWorkSchedule(job)),[{date:'2026-10-19',hours:10},{date:'2026-10-20',hours:10}]);
 let p=c.getProductionPlanCalculations(job);assert.equal(p.remainingQuantity,29000);assert.equal(p.hours,8);assert.equal(p.schedule.find(day=>day.date==='2026-10-24').hours,8);
 job.actualWorkHours=10;assert.equal(c.getProductionPlanCalculations(job).hours,8);assert.deepEqual([...c.testStorage],[...before]);
});


test('44차에서 45차로 바뀌어도 같은 작업자의 이전 10시간 근무를 주간 부담에 반영한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,totalOrderQuantity:29000,endDate:'2026-10-24',deliveryType:'date'}];c.state.products[0].processHourlyProductionRates['2도']=1000;c.setProductionPlanDate('2026-10-21');
 const job=c.state.productionPlanJobs[0],prior={...job,purchaseOrderId:'PREVIOUS-ORDER',actualProduction:10000,actualWorkHours:10,stageDrafts:{}};
 for(const date of ['2026-10-19','2026-10-20'])c.testStorage.set(`rows-test:selected-job:1공장:${date}`,JSON.stringify({jobs:[prior]}));
 c.loadProductionPlanDraft();const current=c.state.productionPlanJobs[0];
 assert.equal(c.getProductionPlanCumulativeProduction(current),0);assert.equal(c.getProductionPlanPreviousWorkSchedule(current).length,2);
 const plan=c.getProductionPlanCalculations(current);assert.equal(plan.hours,8);assert.equal(plan.schedule.find(day=>day.date==='2026-10-24').hours,8);
});


test('실 근무시간 미입력 시 기계 배정된 이전 계획을 참고하되 실제 0시간을 덮어쓰지 않는다',()=>{
 const c=setup();c.setProductionPlanDate('2026-10-21');const row=c.state.productionPlanJobs[0];
 c.testStorage.set('rows-test:selected-job:1공장:2026-10-19',JSON.stringify({jobs:[{...row,machine:'3호기',hours:10,actualWorkHours:null}]}));
 c.testStorage.set('rows-test:selected-job:1공장:2026-10-20',JSON.stringify({jobs:[{...row,machine:'3호기',hours:10,actualWorkHours:0}]}));
 c.testStorage.set('rows-test:selected-job:1공장:2026-10-18',JSON.stringify({jobs:[{...row,machine:'',hours:10,actualWorkHours:null}]}));
 c.invalidateProductionPlanActualLedger();assert.deepEqual(plain(c.getProductionPlanPreviousWorkSchedule(row)),[{date:'2026-10-19',hours:10}]);
});


function setupContinuation(){
 const c=setup();c.state.products[0].processHourlyProductionRates['2도']=1000;
 c.state.purchaseOrders=[{...order,purchaseOrderId:'PO-44',orderRound:'44차 발주',totalOrderQuantity:3000,endDate:'2026-10-17'},
  {...order,purchaseOrderId:'PO-45',orderRound:'45차 발주',totalOrderQuantity:15000,endDate:'2026-10-30'}];
 c.setProductionPlanDate('2026-10-17');return c;
}
test('44차와 45차 선택을 바꿔도 3시간·5시간 배정과 하루 합계 8시간을 함께 표시한다',()=>{
 const c=setupContinuation();let job=c.state.productionPlanJobs[0];job.machine='3호기';c.renderProductionPlan();job=c.state.productionPlanJobs[0];
 assert.equal(job.purchaseOrderId,'PO-44');assert.equal(job.targetQuantity,3000);assert.equal(job.hours,8);assert.equal(job.allocatedHours,3);
 assert.match(c.productionPlanTableBody.innerHTML,/44차 발주 3시간/);assert.match(c.productionPlanTableBody.innerHTML,/45차 발주 5시간/);
 assert.match(c.productionPlanTargetQuantity.innerHTML,/8,000/);assert.equal(c.switchProductionPlanOrder(job,'PO-45'),true);c.updateProductionPlanTargets([job]);
 assert.equal(job.targetQuantity,5000);assert.equal(job.hours,8);assert.equal(job.allocatedHours,5);
 assert.equal(c.getProductionPlanCumulativeProduction(job),0);assert.equal(job.actualProduction??null,null);
});
test('같은 날 발주별 3시간·5시간과 생산량을 저장해도 이튿날 합계는 8시간이며 실적은 분리한다',()=>{
 const c=setupContinuation();let job=c.state.productionPlanJobs[0];Object.assign(job,{machine:'3호기',actualProduction:3000,actualWorkHours:3});c.renderProductionPlan();job=c.state.productionPlanJobs[0];
 c.switchProductionPlanOrder(job,'PO-45');Object.assign(job,{machine:'3호기',actualProduction:5000,actualWorkHours:5});c.renderProductionPlan();c.saveProductionPlanDraft();
 const saved=JSON.parse(c.testStorage.get(c.getProductionPlanStorageKey()));assert.equal(saved.jobs.length,2);
 c.loadProductionPlanDraft();assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),5000);
 c.setProductionPlanDate('2026-10-19');job=c.state.productionPlanJobs[0];assert.equal(job.purchaseOrderId,'PO-45');assert.equal(job.machine,'3호기');assert.equal(job.targetQuantity,8000);
 assert.equal(c.getProductionPlanCumulativeProduction(job),5000);assert.equal(c.getProductionPlanCumulativeHours(job),5);
 assert.deepEqual(plain(c.getProductionPlanPreviousWorkSchedule(job)),[{date:'2026-10-17',hours:8}]);
});
test('연결 계획만 저장한 경우도 44차·45차의 하루 계획시간을 중복하거나 누락하지 않는다',()=>{
 const c=setupContinuation();let job=c.state.productionPlanJobs[0];job.machine='3호기';c.renderProductionPlan();c.saveProductionPlanDraft();
 c.setProductionPlanDate('2026-10-19');job=c.state.productionPlanJobs[0];
 assert.deepEqual(plain(c.getProductionPlanPreviousWorkSchedule(job)),[{date:'2026-10-17',hours:8}]);
 assert.equal(c.getProductionPlanCumulativeProduction(job),0);
});
test('다른 기계에 배정된 발주를 자동으로 이어 붙이지 않는다',()=>{
 const c=setupContinuation();let job=c.state.productionPlanJobs[0];job.machine='3호기';
 c.getProductionPlanOrderDraftCache().jobs.push({...job,purchaseOrderId:'PO-45',machine:'4호기'});c.updateProductionPlanTargets([job]);
 assert.equal(job.shiftParts.length,0);assert.equal(job.targetQuantity,3000);assert.equal(job.hours,8);
});

test('생산계획 추가는 기존 실적·상세 열림을 유지하고 빈 행을 하나씩 붙인다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 const first=c.state.productionPlanJobs[0];Object.assign(first,{machine:'5호기',actualProduction:8000,actualWorkHours:8,note:'기존 작업'});
 c.state.productionPlanExpandedRows=new Set([first.planRowId]);let opened=0;c.openInboundProductPicker=()=>{opened++;};
 for(let i=1;i<=3;i++) {
  c.addProductionPlanRow();assert.equal(c.state.productionPlanJobs.length,i+1);
  const added=c.state.productionPlanJobs.at(-1);assert.equal(added.purchaseOrderId,'');assert.equal(added.productId,'');
  assert.equal(added.productName,'');assert.equal(added.machine,'');assert.equal(added.actualProduction??null,null);
  assert.equal(added.actualWorkHours??null,null);assert.equal(added.worker,'');
  assert.equal(c.state.productionPlanSelectedJobId,added.planRowId);
 }
 assert.equal(new Set(c.state.productionPlanJobs.map(job=>job.planRowId)).size,4);
 assert.equal(c.state.productionPlanExpandedRows.has(first.planRowId),true);assert.equal(opened,0);
 assert.equal(c.state.productionPlanJobs[0].actualProduction,8000);assert.equal(c.state.productionPlanJobs[0].note,'기존 작업');
 assert.equal(c.getProductionPlanActiveJobs().length,1);
 assert.equal((c.productionPlanTableBody.innerHTML.match(/<tr class="[^"]*" data-plan-row-id=/g)||[]).length,4);
});

test('추가 행의 제품·공정 선택은 해당 행만 바꾸며 저장·날짜 복귀·발주 새로고침 후 유지된다',async()=>{
 const c=setup();const products=addPrintProducts(c);c.state.productionPlanJobs=c.buildProductionPlanJobs();
 Object.assign(c.state.productionPlanJobs[0],{machine:'5호기',actualProduction:8000,actualWorkHours:8,note:'오브제 유지'});
 c.addProductionPlanRow();const added=c.state.productionPlanJobs[1];
 c.state.productionPlanPickerJobId=added.planRowId;c.selectProductionPlanProduct(products[1]);
 assert.equal(c.state.productionPlanJobs[0].productId,'NP-0001');assert.equal(c.state.productionPlanJobs[1].productId,'SILK');
 c.changeProductionPlanPrintType(c.state.productionPlanJobs[1],'자동화');c.renderProductionPlan();
 Object.assign(c.state.productionPlanJobs[1],{machine:'3호기',actualProduction:4000,actualWorkHours:8,note:'두 번째 작업'});
 c.addProductionPlanRow();const ids=c.state.productionPlanJobs.map(job=>job.planRowId);
 assert.equal(c.getProductionPlanActiveJobs().length,2);assert.equal(c.saveProductionPlanDraft(),true);
 c.setProductionPlanDate('2026-09-12');c.setProductionPlanDate('2026-09-11');await c.syncProductionPlanOrders();
 assert.deepEqual(plain(c.state.productionPlanJobs.map(job=>job.planRowId)),plain(ids));
 const [first,second,blank]=c.state.productionPlanJobs;
 assert.equal(first.actualProduction,8000);assert.equal(first.machine,'5호기');assert.equal(first.note,'오브제 유지');
 assert.equal(second.actualProduction,4000);assert.equal(second.process,'자동화');assert.equal(second.machine,'3호기');assert.equal(second.note,'두 번째 작업');
 assert.equal(blank.purchaseOrderId,'');assert.equal(c.getProductionPlanCumulativeProduction(first),8000);
 assert.equal(c.getProductionPlanCumulativeProduction(second),4000);
});

test('추가 행에서 이미 표시된 발주를 선택해도 다른 행의 저장 실적을 복사하지 않는다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 Object.assign(c.state.productionPlanJobs[0],{actualProduction:8000,actualWorkHours:8});c.saveProductionPlanDraft();
 c.addProductionPlanRow();const added=c.state.productionPlanJobs[1];
 c.state.productionPlanPickerJobId=added.planRowId;c.selectProductionPlanProduct(c.state.products[0]);
 assert.equal(c.state.productionPlanJobs.length,2);assert.equal(c.state.productionPlanJobs[1].actualProduction??null,null);
 assert.equal(c.state.productionPlanJobs[1].actualWorkHours??null,null);
 c.changeProductionPlanStage(c.state.productionPlanJobs[1],1);
 c.state.productionPlanJobs[1].actualProduction=3000;c.saveProductionPlanDraft();c.loadProductionPlanDraft();
 assert.equal(c.state.productionPlanJobs.length,2);assert.equal(c.state.productionPlanJobs[0].stage,2);assert.equal(c.state.productionPlanJobs[1].stage,1);
 assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),8000);
 assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[1]),3000);
});

test('여러 작업 행과 선택을 바꿔 둔 발주 실적은 화면 행과 별개로 보관한다',()=>{
 const c=setup();c.state.purchaseOrders.push({...order,purchaseOrderId:'PO-45',totalOrderQuantity:20000});
 c.state.productionPlanJobs=c.buildProductionPlanJobs();const first=c.state.productionPlanJobs[0];
 first.actualProduction=8000;c.switchProductionPlanOrder(first,'PO-45');first.actualProduction=3000;
 c.addProductionPlanRow();c.saveProductionPlanDraft();c.loadProductionPlanDraft();
 assert.equal(c.state.productionPlanJobs.length,2);assert.equal(c.state.productionPlanJobs[0].purchaseOrderId,'PO-45');
 assert.equal(c.state.productionPlanJobs[1].purchaseOrderId,'');
 assert.equal(JSON.parse(c.testStorage.get(c.getProductionPlanStorageKey())).jobs.length,3);
 c.switchProductionPlanOrder(c.state.productionPlanJobs[0],order.purchaseOrderId);c.renderProductionPlan();
 assert.equal(c.state.productionPlanJobs.length,2);assert.equal(c.state.productionPlanJobs[0].actualProduction,8000);
});

test('행 복사는 바로 아래에 설정을 복제하고 모든 당일 실적과 공정별 실적은 비운다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();const original=c.state.productionPlanJobs[0];
 Object.assign(original,{machine:'5호기',note:'같은 설정',actualProduction:8000,actualWorkHours:8,loss:0,lossMode:'manual',productionReferenceId:'old',stageDrafts:{1:{machine:'3호기',actualProduction:4000,actualWorkHours:4}}});
 c.addProductionPlanRow();const otherId=c.state.productionPlanJobs[1].planRowId;
 assert.equal(c.copyProductionPlanRow(original.planRowId),true);assert.equal(c.state.productionPlanJobs.length,3);
 const [first,copy,last]=c.state.productionPlanJobs;
 assert.notEqual(copy.planRowId,first.planRowId);assert.equal(last.planRowId,otherId);
 for(const field of ['purchaseOrderId','productId','process','stage','machine','worker','packagingWorker','note','loss','lossMode']) assert.equal(copy[field],first[field]);
 assert.equal(copy.actualProduction??null,null);assert.equal(copy.actualWorkHours??null,null);assert.equal(copy.productionReferenceId,undefined);
 assert.equal(copy.stageDrafts[1],undefined);assert.equal(Object.values(copy.stageDrafts).every(draft=>!draft.actualProduction&&!draft.actualWorkHours),true);assert.equal(first.actualProduction,8000);assert.equal(first.stageDrafts[1].actualProduction,4000);
 assert.equal(c.getProductionPlanCumulativeProduction(copy),8000);assert.equal(c.saveProductionPlanDraft(),true);
 c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs.length,3);assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),8000);
 assert.equal(c.state.productionPlanJobs[1].actualProduction??null,null);
});

test('저장된 한 행만 삭제하고 다른 행과 과거 날짜 실적은 유지하며 삭제 행을 다시 불러오지 않는다',async()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 c.state.productionPlanJobs[0].actualProduction=8000;c.saveProductionPlanDraft();const pastKey=c.getProductionPlanStorageKey(),past=c.testStorage.get(pastKey);
 c.setProductionPlanDate('2026-09-12');const first=c.state.productionPlanJobs[0];Object.assign(first,{actualProduction:2000,actualWorkHours:2});
 c.copyProductionPlanRow(first.planRowId);const copy=c.state.productionPlanJobs[1];Object.assign(copy,{actualProduction:3000,actualWorkHours:3});
 c.saveProductionPlanDraft();assert.equal(c.deleteProductionPlanRow(first.planRowId),true);
 assert.equal(c.state.productionPlanJobs.length,1);assert.equal(c.state.productionPlanJobs[0].planRowId,copy.planRowId);
 assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[0]),11000);
 c.saveProductionPlanDraft();c.loadProductionPlanDraft();await c.syncProductionPlanOrders();
 assert.equal(c.state.productionPlanJobs.length,1);assert.equal(c.state.productionPlanJobs[0].planRowId,copy.planRowId);
 assert.equal(c.state.productionPlanJobs[0].actualProduction,3000);assert.equal(c.testStorage.get(pastKey),past);
});

test('마지막 행 삭제 후 빈 계획을 저장·날짜 복귀·발주 새로고침해도 삭제 행이나 비활성 발주가 나타나지 않는다',async()=>{
 const c=setup();c.state.purchaseOrders.push({...order,purchaseOrderId:'PO-45',totalOrderQuantity:20000});
 c.state.productionPlanJobs=c.buildProductionPlanJobs();let job=c.state.productionPlanJobs[0];job.actualProduction=8000;
 c.switchProductionPlanOrder(job,'PO-45');job.actualProduction=3000;c.saveProductionPlanDraft();
 assert.equal(c.deleteProductionPlanRow(job.planRowId),true);assert.equal(c.state.productionPlanJobs.length,0);
 assert.equal(c.saveProductionPlanDraft(),true);let saved=JSON.parse(c.testStorage.get(c.getProductionPlanStorageKey()));
 assert.equal(saved.rowSelectionVersion,1);assert.equal(saved.jobs.length,1);assert.equal(saved.jobs[0].purchaseOrderId,order.purchaseOrderId);assert.equal(saved.jobs[0].actualProduction,8000);
 c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs.length,0);await c.syncProductionPlanOrders();assert.equal(c.state.productionPlanJobs.length,0);
 c.setProductionPlanDate('2026-09-12');c.setProductionPlanDate('2026-09-11');assert.equal(c.state.productionPlanJobs.length,0);
 c.addProductionPlanRow();assert.equal(c.state.productionPlanJobs.length,1);assert.equal(c.state.productionPlanJobs[0].purchaseOrderId,'');
});

test('마지막 빈 행 삭제와 복사는 안전하며 없는 행에 대한 작업은 무시한다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();
 assert.equal(c.copyProductionPlanRow('missing'),false);assert.equal(c.deleteProductionPlanRow('missing'),false);
 c.deleteProductionPlanRow(c.state.productionPlanJobs[0].planRowId);c.saveProductionPlanDraft();c.loadProductionPlanDraft();
 assert.equal(c.state.productionPlanJobs.length,0);c.addProductionPlanRow();c.copyProductionPlanRow(c.state.productionPlanJobs[0].planRowId);
 assert.equal(c.state.productionPlanJobs.length,2);assert.equal(c.state.productionPlanJobs.every(job=>job.purchaseOrderId===''),true);
 for(const job of [...c.state.productionPlanJobs]) c.deleteProductionPlanRow(job.planRowId);
 c.saveProductionPlanDraft();c.loadProductionPlanDraft();assert.equal(c.state.productionPlanJobs.length,0);
});

test('행 순서만 바꾸고 실적·공정·기계·열린 세부정보를 유지하며 저장 후 같은 순서로 불러온다',async()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();const first=c.state.productionPlanJobs[0];
 Object.assign(first,{machine:'5호기',actualProduction:8000,actualWorkHours:8,note:'기존 작업'});
 c.state.productionPlanExpandedRows=new Set([first.planRowId]);c.addProductionPlanRow();c.addProductionPlanRow();
 c.state.productionPlanJobs[1].note='둘째';c.state.productionPlanJobs[2].note='셋째';
 const [a,b,d]=c.state.productionPlanJobs.map(job=>job.planRowId);
 const original=plain(c.state.productionPlanJobs);
 assert.equal(c.moveProductionPlanRow(a,d,'after'),true);
 assert.deepEqual(plain(c.state.productionPlanJobs.map(job=>job.planRowId)),[b,d,a]);
 assert.deepEqual(plain(c.state.productionPlanJobs.find(job=>job.planRowId===a)),original[0]);
 assert.equal(c.state.productionPlanExpandedRows.has(a),true);
 assert.equal(c.getProductionPlanCumulativeProduction(c.state.productionPlanJobs[2]),8000);
 assert.equal(c.saveProductionPlanDraft(),true);c.loadProductionPlanDraft();await c.syncProductionPlanOrders();
 assert.deepEqual(plain(c.state.productionPlanJobs.map(job=>job.planRowId)),[b,d,a]);
 c.setProductionPlanDate('2026-09-12');c.setProductionPlanDate('2026-09-11');
 assert.deepEqual(plain(c.state.productionPlanJobs.map(job=>job.planRowId)),[b,d,a]);
 assert.equal(c.state.productionPlanJobs[2].actualProduction,8000);assert.equal(c.state.productionPlanJobs[2].machine,'5호기');
 assert.equal(c.moveProductionPlanRow(a,b,'before'),true);assert.deepEqual(plain(c.state.productionPlanJobs.map(job=>job.planRowId)),[a,b,d]);
});

test('같은 위치·없는 행·잘못된 이동 요청은 계획을 수정하지 않는다',()=>{
 const c=setup();c.state.productionPlanJobs=c.buildProductionPlanJobs();c.addProductionPlanRow();
 const [a,b]=c.state.productionPlanJobs.map(job=>job.planRowId),before=plain(c.state.productionPlanJobs);
 for(const args of [[a,a,'before'],[a,b,'before'],[b,a,'after'],['missing',b,'before'],[a,'missing','after'],[a,b,'sideways']]) assert.equal(c.moveProductionPlanRow(...args),false);
 assert.deepEqual(plain(c.state.productionPlanJobs),before);
});
