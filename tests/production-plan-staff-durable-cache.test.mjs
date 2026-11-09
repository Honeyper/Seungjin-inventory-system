import assert from 'node:assert/strict';
import test from 'node:test';
import {createProductionPlanStaffReader,normalizeStaffSnapshot} from '../supabase/functions/seungjin-dev-gateway/production-plan-staff-cache.js';
const roster={staff:[{name:'직원 A',type:'employee'},{name:'외부 B',type:'outsourcing'},{name:'진성',type:'company'}],sourceSheet:'직원정보',sourceSheetId:1419995975};
function fixture({age=0,empty=false}={}){
 let now=1000000,row=empty?null:{payload:roster,fetched_at:new Date(1000000-age).toISOString()},lease=null,loads=0,fail=false;
 const tasks=[],errors=[];let source=async()=>{if(fail)throw Error('sheet unavailable');return roster;};
 const options={clock:()=>now,loadSnapshot:async()=>row,
  claimRefresh:async()=>{if(lease)return null;lease='L1';return lease;},
  saveSnapshot:async(next,claim)=>{if(claim!==lease)return false;row=next;lease=null;return true;},
  fetchSource:async()=>{loads++;return source();},runInBackground:p=>tasks.push(p),onError:e=>errors.push(e.message)};
 return {make:()=>createProductionPlanStaffReader(options),options,tasks,errors,get row(){return row;},get loads(){return loads;},advance:n=>now+=n,
   fail:()=>fail=true,source:fn=>source=fn,loseLease:()=>lease='newer'};
}
test('새 Edge 인스턴스도 저장된 목록만 읽고 시트를 호출하지 않는다',async()=>{
 const f=fixture();for(let i=0;i<4;i++)assert.equal((await f.make()()).staff.length,3);
 assert.equal(f.loads,0);assert.equal(f.tasks.length,0);
});
test('오래된 목록도 시트가 멈춘 동안 즉시 반환하고 갱신 후 다음 조회가 새 목록을 받는다',async()=>{
 const f=fixture({age:61000}),source=Promise.withResolvers();f.source(()=>source.promise);const read=f.make();
 const result=await read();assert.equal(result.staff.length,3);assert.equal(result.staffCache.refreshing,true);
 assert.equal(f.loads,1);source.resolve({staff:[{name:'새 담당자',type:'employee'}]});await Promise.all(f.tasks);
 assert.equal((await f.make()()).staff[0].name,'새 담당자');assert.equal(f.loads,1);
});
test('여러 인스턴스의 동시 갱신도 DB 갱신 권한을 받은 하나만 원본을 읽는다',async()=>{
 const f=fixture({age:61000}),source=Promise.withResolvers();f.source(()=>source.promise);
 const results=await Promise.all(Array.from({length:8},()=>f.make()()));assert.ok(results.every(r=>r.staff.length===3));
 source.resolve(roster);await Promise.all(f.tasks);assert.equal(f.loads,1);
});
test('시트 오류나 잘못된 응답이 마지막 정상 목록을 지우지 않는다',async()=>{
 for(const source of [async()=>{throw Error('offline');},async()=>({staff:[{name:'A',type:'unknown'}]})]){
  const f=fixture({age:61000});f.source(source);const result=await f.make()();await Promise.all(f.tasks);
  assert.equal(result.staff.length,3);assert.equal(f.row.payload,roster);assert.equal(f.errors.length,1);
 }
});
test('유효한 빈 명단도 저장하고 사번·입사일·알 수 없는 속성은 저장하지 않는다',async()=>{
 const f=fixture({empty:true});f.source(async()=>({staff:[{name:'직원 A',type:'employee',employeeId:'private',hiredAt:'private'}],raw:'private'}));
 const result=await f.make()();assert.equal(JSON.stringify(result).includes('private'),false);
 assert.deepEqual(normalizeStaffSnapshot({staff:[]}).staff,[]);
 assert.throws(()=>normalizeStaffSnapshot({rows:[]}),/직원 목록/);
});
test('권한이 만료된 늦은 시트 응답은 새 목록을 덮어쓰지 않는다',async()=>{
 const f=fixture({age:61000}),source=Promise.withResolvers();f.source(()=>source.promise);await f.make()();f.loseLease();
 source.resolve({staff:[{name:'늦은 응답',type:'employee'}]});await Promise.all(f.tasks);assert.equal(f.row.payload,roster);
});
