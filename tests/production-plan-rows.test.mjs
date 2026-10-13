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
      purchaseOrders: [order], products: [{ productCode: order.productId, productionProcess: "실크 인쇄", finalProcess: "2도", processGroups: [[1],[2]], processHourlyProductionRates: {"1도":1000,"2도":2000} }], purchaseOrdersLoaded: true },
    PRODUCTION_PLAN_STORAGE_PREFIX: "rows-test",
    ADMIN_CACHE_PREFIX: "seungjinAdminCache:v3:prod", ADMIN_LOCAL_CACHE_MAX_BYTES: 1024*1024,
    localStorage: { get length() {return storage.size;}, key: index => [...storage.keys()][index] ?? null,
      getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
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
  vm.runInContext(source.slice(source.indexOf("function getAdminResponseCacheKeys("), source.indexOf("\n}\n", source.indexOf("function writeAdminCache(")) + 3), context);
  context.testStorage = storage;
  return context;
}

test('제품에 등록된 2도 생산량과 발주량만으로 목표가 즉시 계산된다',async()=>{
 const c=setup();const before=plain(c.state.purchaseOrders);c.state.productionPlanJobs=c.buildProductionPlanJobs();
 c.renderProductionPlan();assert.equal(c.state.productionPlanJobs.length,1);
 const job=c.state.productionPlanJobs[0];assert.equal(job.stage,2);assert.equal(job.hourlyRate,2000);
 assert.equal(job.targetQuantity,10000);assert.equal(job.hours,5);
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


test('상세 11개 항목은 기존 목표를 바꾸지 않고 공정별 입력을 저장한다',()=>{
 const c=setup();c.state.purchaseOrders=[{...order,deliveryType:'daily',dailyMinimumQuantity:7000}];
 c.state.productionPlanJobs=c.buildProductionPlanJobs();const job=c.state.productionPlanJobs[0];
 Object.assign(job,{workDays:17,loss:200,lossMode:"manual",cumulativeProduction:4000,cumulativeHours:2,actualProduction:6000});
 c.updateProductionPlanTargets([job]);assert.equal(job.targetQuantity,10000);
 const values=c.getProductionPlanDetailMetrics(job);
 assert.equal(values.dailyRequired,7000);assert.equal(values.dailyTargetHours,5);assert.equal(values.totalExpectedHours,5);
 assert.ok(Math.abs(values.achievementRate-6000/7000*100)<1e-8);
 assert.equal(c.formatProductionPlanDetailValue('achievementRate',values.achievementRate),'85.7%');
 assert.equal((c.renderProductionPlanMetrics(job).match(/<dt>/g)||[]).length,11);
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


test('작업일은 총 소요시간을 8시간으로 나누며 기존 수기 작업일은 계산에 쓰지 않는다',()=>{
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
 const job=c.buildProductionPlanJobs()[0];assert.equal(c.getProductionPlanDetailMetrics(job).dailyRequired,6008);
 c.state.purchaseOrders[0].totalOrderQuantity=99100;c.state.products[0].processHourlyProductionRates['2도']=1000;
 assert.equal(c.getProductionPlanDetailMetrics(job).dailyRequired,8000);
});
