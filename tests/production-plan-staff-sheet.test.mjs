import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {loadFunctions,adminSource} from './helpers/frontend-runtime.mjs';
const gas=fs.readFileSync(new URL('../gas/ProductionPlan.js',import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function sheetRows(){return [
  ['', '직원정보'],
  ['', '정직원','','','','','아웃소싱','','','','','타업체'],
  ['', '이름','사번','입사일','활성화 여부','','이름','사번','입사일','활성화 여부','','업체명','활성화 여부'],
  ['', '직원 A','private-id','private-date',true,'','아웃소싱 B','private-id','private-date','TRUE','','진성',true],
  ['', '퇴사 C','','',false,'','비활성 D','','','FALSE','','제외 업체',false],
  ['', '직원 A','','',true,'','추가 E','','',1,'','',false]
];}
test('시트의 활성화된 직원·아웃소싱·업체만 읽고 사번·입사일은 반환하지 않는다',()=>{
  const c=vm.createContext({});vm.runInContext(gas,c);
  assert.deepEqual(plain(c.parseProductionPlanStaff_(sheetRows())),[
    {name:'직원 A',type:'employee',label:'직원'},
    {name:'아웃소싱 B',type:'outsourcing',label:'아웃소싱'},
    {name:'추가 E',type:'outsourcing',label:'아웃소싱'},
    {name:'진성',type:'company',label:'타업체'}
  ]);
});
test('직원 헤더나 활성화 여부가 잘못되면 빈 정상 목록으로 처리하지 않는다',()=>{
  const c=vm.createContext({});vm.runInContext(gas,c);assert.throws(()=>c.parseProductionPlanStaff_([['이름']]),/구분/);
  const rows=sheetRows();rows[2][4]='';assert.throws(()=>c.parseProductionPlanStaff_(rows),/열/);
});
test('서버 토큰을 검증한 뒤 지정한 원본 직원 탭만 읽는다',()=>{
  let reads=0;const c=vm.createContext({verifySupabaseSheetSyncToken_:token=>{if(token!=='valid')throw Error('invalid');},
    SpreadsheetApp:{openById:id=>{reads++;assert.equal(id,'1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI');return {getSheetById:gid=>{assert.equal(gid,1419995975);return {getName:()=> '직원정보',getSheetId:()=>gid,getDataRange:()=>({getValues:sheetRows})};}};}}});
  vm.runInContext(gas,c);assert.throws(()=>c.getProductionPlanStaff({}),/로그인/);assert.throws(()=>c.getProductionPlanStaff({token:'wrong'}),/invalid/);assert.equal(reads,0);
  const result=c.getProductionPlanStaff({token:'valid'});assert.equal(result.staff.length,4);assert.equal(result.sourceSheet,'직원정보');assert.equal('values' in result,false);
});
function client(requestApi){
  const jobs=[{planRowId:'R1',worker:'저장된 담당자',workerType:'employee',packagingWorker:'진성',packagingWorkerType:'company',machine:'5호기',actualProduction:8000,note:'입력 유지'}];
  const c=loadFunctions(adminSource,['loadProductionPlanStaff','getProductionPlanStaffAssignments','getProductionPlanStaffLabel','renderProductionPlanStaffOptions','refreshProductionPlanStaffControls','normalizeProductionPlanStaff','restoreProductionPlanStaffCache','renderProductionPlanStaffPicker','getProductionPlanStaffPickerGroups','selectProductionPlanStaff'],{
    window:{SeungjinDataGateway:{canRead:()=>true}},PRODUCTION_PLAN_STAFF:{worker:[],packagingWorker:[]},
    productionPlanStaffPromise:null,productionPlanStaffLoadedAt:0,productionPlanTableBody:null,
    productionPlanStaffHasRoster:false,productionPlanStaffCacheChecked:false,productionPlanStaffError:false,productionPlanStaffPicker:null,
    session:{name:'test'},ADMIN_CACHE_MAX_AGE_MS:12*60*60*1000,readAdminCache:()=>null,writeAdminCache(){},
    state:{productionPlanJobs:jobs},requestApi,console:{warn(){}},showToast(){},escapeHtml:x=>String(x).replaceAll('<','&lt;'),escapeAttribute:x=>String(x).replaceAll('"','&quot;')
  });return {c,jobs};
}
const people=[{name:'직원 A',type:'employee'},{name:'아웃소싱 B',type:'outsourcing'},{name:'진성',type:'company'}];
test('양쪽 작업자 선택에 같은 시트 목록을 적용하고 진성은 업체명만 표시한다',async()=>{
  const {c,jobs}=client(async()=>({staff:people}));const before=structuredClone(jobs);assert.equal(await c.loadProductionPlanStaff(),true);
  for(const role of ['worker','packagingWorker']){const html=c.renderProductionPlanStaffOptions({[role]:'진성'},role);assert.match(html,/>진성<\/option>/);assert.doesNotMatch(html,/진성 \(/);assert.match(html,/아웃소싱 B \(아웃소싱\)/);}
  assert.deepEqual(jobs,before);assert.equal(c.getProductionPlanStaffAssignments(jobs[0]).packagingWorkerType,'company');
  assert.match(c.renderProductionPlanStaffOptions(jobs[0],'worker'),/selected disabled>기존 입력: 저장된 담당자/);
  assert.equal(c.getProductionPlanStaffAssignments(jobs[0]).workerType,'employee');
});
test('중복 조회를 합치고 1분 캐시 뒤 강제 새로고침으로 시트 변경을 반영한다',async()=>{
  const pending=Promise.withResolvers();let calls=0;const {c}=client(async()=>{calls++;return pending.promise;});
  const a=c.loadProductionPlanStaff(),b=c.loadProductionPlanStaff();assert.equal(calls,1);pending.resolve({staff:people});await Promise.all([a,b]);await c.loadProductionPlanStaff();assert.equal(calls,1);
  c.requestApi=async()=>{calls++;return {staff:[]};};await c.loadProductionPlanStaff({force:true});assert.equal(calls,2);assert.equal(c.PRODUCTION_PLAN_STAFF.worker.length,0);
});
test('목록 갱신 실패·잘못된 응답은 기존 선택 목록과 작성 내용을 유지한다',async()=>{
  const {c,jobs}=client(async()=>({staff:people}));await c.loadProductionPlanStaff();const before=plain(c.PRODUCTION_PLAN_STAFF),saved=structuredClone(jobs);
  for(const request of [async()=>{throw Error('network');},async()=>({rows:[]}),async()=>({staff:[{name:'A',type:'unknown'}]})]){
    c.requestApi=request;assert.equal(await c.loadProductionPlanStaff({force:true}),false);assert.deepEqual(plain(c.PRODUCTION_PLAN_STAFF),before);assert.deepEqual(jobs,saved);
  }
});

test('이전 접속의 목록을 요청 완료 전에 표시하며 새 응답으로 교체한다',async()=>{
  const pending=Promise.withResolvers();const {c}=client(()=>pending.promise);
  c.readAdminCache=()=>({staff:people,loadedAt:Date.now()-120000});
  const request=c.loadProductionPlanStaff();
  assert.equal(c.productionPlanStaffHasRoster,true);assert.equal(c.PRODUCTION_PLAN_STAFF.worker.length,3);
  assert.ok(c.productionPlanStaffLoadedAt<Date.now()-60000);
  pending.resolve({staff:[{name:'새 직원',type:'employee'}]});await request;
  assert.equal(c.PRODUCTION_PLAN_STAFF.worker[0].name,'새 직원');
});
test('새로고침 후 유효한 1분 목록은 추가 서버 요청 없이 사용한다',async()=>{
  let calls=0;const {c}=client(async()=>{calls++;return {staff:people};});
  c.readAdminCache=()=>({staff:people,loadedAt:Date.now()-1000});
  assert.equal(await c.loadProductionPlanStaff(),true);assert.equal(calls,0);
  assert.equal(c.PRODUCTION_PLAN_STAFF.worker.length,3);
});
test('잘못된 캐시는 무시하며 갱신 실패 때 최근 목록을 유지한다',async()=>{
  const {c}=client(async()=>{throw Error('offline');});
  c.readAdminCache=()=>({staff:[{name:'오류',type:'unknown'}],loadedAt:Date.now()});
  assert.equal(await c.loadProductionPlanStaff(),false);assert.equal(c.productionPlanStaffHasRoster,false);
  c.productionPlanStaffCacheChecked=false;c.readAdminCache=()=>({staff:people,loadedAt:Date.now()-120000});
  await c.loadProductionPlanStaff();assert.equal(c.productionPlanStaffHasRoster,true);
  assert.equal(c.productionPlanStaffError,true);assert.equal(c.PRODUCTION_PLAN_STAFF.worker.length,3);
});
test('검색어와 직원 구분을 함께 적용하고 타업체는 회사명만 보여준다',async()=>{
  const {c}=client(async()=>({staff:people}));await c.loadProductionPlanStaff();
  c.productionPlanStaffPicker={query:'직원 a',filter:'all'};
  assert.deepEqual(plain(c.getProductionPlanStaffPickerGroups()).map(g=>g.type),['employee']);
  c.productionPlanStaffPicker={query:'',filter:'outsourcing'};
  assert.equal(c.getProductionPlanStaffPickerGroups()[0].people[0].name,'아웃소싱 B');
  c.productionPlanStaffPicker={query:'진 성',filter:'company'};
  assert.deepEqual(plain(c.getProductionPlanStaffPickerGroups())[0].people,[{name:'진성',type:'company',label:'타업체'}]);
  c.productionPlanStaffPicker={query:'없음',filter:'all'};assert.equal(c.getProductionPlanStaffPickerGroups().length,0);
});
test('팝업 선택은 해당 역할만 수정하고 날짜 변경·삭제된 행·제외된 사람의 선택은 막는다',async()=>{
  const {c,jobs}=client(async()=>({staff:people}));await c.loadProductionPlanStaff();
  c.getProductionPlanStorageKey=()=> 'today';c.renderProductionPlan=()=>{};
  c.closeProductionPlanStaffPicker=()=>{c.productionPlanStaffPicker=null;};c.productionPlanStatus={dataset:{}};
  const original=structuredClone(jobs[0]);
  c.productionPlanStaffPicker={planRowId:'R1',role:'worker',storageKey:'yesterday'};
  c.selectProductionPlanStaff('진성');assert.deepEqual(jobs[0],original);
  c.productionPlanStaffPicker={planRowId:'missing',role:'worker',storageKey:'today'};
  c.selectProductionPlanStaff('진성');assert.deepEqual(jobs[0],original);
  c.productionPlanStaffPicker={planRowId:'R1',role:'worker',storageKey:'today'};
  c.selectProductionPlanStaff('제외된 사람');assert.deepEqual(jobs[0],original);
  c.selectProductionPlanStaff('진성');assert.equal(jobs[0].worker,'진성');assert.equal(jobs[0].workerType,'company');
  assert.equal(jobs[0].note,original.note);assert.equal(jobs[0].actualProduction,original.actualProduction);
  c.productionPlanStaffPicker={planRowId:'R1',role:'worker',storageKey:'today'};
  c.selectProductionPlanStaff('');assert.equal(jobs[0].worker,'');assert.equal(jobs[0].workerType,'');
});

test('박 공정에서 한 번 선택·해제하면 작업자와 포장자 이름·구분을 함께 반영한다',async()=>{
 const {c,jobs}=client(async()=>({staff:people}));await c.loadProductionPlanStaff();const job=jobs[0];job.process='박 인쇄';
 c.getProductionPlanStorageKey=()=> 'today';c.renderProductionPlan=()=>{};c.closeProductionPlanStaffPicker=()=>{c.productionPlanStaffPicker=null;};c.productionPlanStatus={dataset:{}};
 c.productionPlanStaffPicker={planRowId:'R1',role:'worker',storageKey:'today'};c.selectProductionPlanStaff('진성');
 assert.equal(job.worker,'진성');assert.equal(job.packagingWorker,'진성');assert.equal(job.workerType,'company');assert.equal(job.packagingWorkerType,'company');
 c.productionPlanStaffPicker={planRowId:'R1',role:'worker',storageKey:'today'};c.selectProductionPlanStaff('');assert.equal(job.worker,'');assert.equal(job.packagingWorker,'');
 const inherited=c.getProductionPlanStaffAssignments({process:'박 인쇄',worker:'',workerType:'',packagingWorker:'외부 담당',packagingWorkerType:'outsourcing'});
 assert.equal(inherited.worker,'외부 담당');assert.equal(inherited.workerType,'outsourcing');assert.equal(inherited.packagingWorkerType,'outsourcing');
});
