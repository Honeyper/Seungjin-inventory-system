import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
import {createProductionPlanStaffReader} from '../supabase/functions/seungjin-dev-gateway/production-plan-staff-cache.js';

const source=fs.readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function handleRequest('),source.indexOf('\nDeno.serve('));
function fixture(){
  let now=0,loads=0,fail=false,snapshot=null;const tasks=[];
  const c=vm.createContext({
    hasValidPublishableKey:req=>req.key==='valid', readRequestBody:async req=>({action:req.action||'getProductionPlanStaff',payload:{}}),
    readSession:async req=>req.session ? {name:'test'} : null,
    jsonResponse:(_req,body,status=200)=>({body,status}),
    createSheetSyncToken:async()=> 'server-only',
    fetchAppsScript:async(action,payload)=>{loads++;assert.equal(payload.token,'server-only');if(fail)throw Error('source failed');return {staff:[{name:'직원 A',type:'employee'}]};},
    readProductionPlanStaff:createProductionPlanStaffReader({clock:()=>now,loadSnapshot:async()=>snapshot,
      claimRefresh:async()=> 'lease',saveSnapshot:async row=>{snapshot=row;return true;},
      fetchSource:async()=>{loads++;if(fail)throw Error('source failed');return {staff:[{name:'직원 A',type:'employee'}]};},
      runInBackground:p=>tasks.push(p)})
  });
  vm.runInContext(stripTypeScriptTypes(handler),c);
  const read=(overrides={})=>c.handleRequest({method:'POST',key:'valid',session:true,...overrides});
  return {read,tasks,get loads(){return loads;},advance:ms=>now+=ms,setFail:value=>fail=value};
}
test('작업자 조회는 인증 후 캐시를 공유하며 1분 후 원본을 다시 읽는다',async()=>{
 const f=fixture();const responses=await Promise.all(Array.from({length:6},()=>f.read()));
 assert.equal(f.loads,1);assert.ok(responses.every(r=>r.status===200));
 await f.read();assert.equal(f.loads,1);
 assert.equal((await f.read({session:false})).status,401);
 assert.equal((await f.read({key:'wrong'})).status,401);assert.equal(f.loads,1);
 f.advance(60000);await f.read();await Promise.all(f.tasks);assert.equal(f.loads,2);
});
test('직원 시트 실패를 캐시하지 않으며 기존 참조 조회를 직원 캐시와 섞지 않는다',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(f.read(),/source failed/);
 f.setFail(false);await f.read();assert.equal(f.loads,2);
 await f.read({action:'getProductionPlanReference'});assert.equal(f.loads,3);
 await f.read();assert.equal(f.loads,3);
});
