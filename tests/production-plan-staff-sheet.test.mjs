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
  const c=loadFunctions(adminSource,['loadProductionPlanStaff','getProductionPlanStaffAssignments','getProductionPlanStaffLabel','renderProductionPlanStaffOptions','refreshProductionPlanStaffControls'],{
    window:{SeungjinDataGateway:{canRead:()=>true}},PRODUCTION_PLAN_STAFF:{worker:[],packagingWorker:[]},
    productionPlanStaffPromise:null,productionPlanStaffLoadedAt:0,productionPlanTableBody:null,
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
