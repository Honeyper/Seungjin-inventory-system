import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { loadFunctions, adminSource } from './helpers/frontend-runtime.mjs';
import { applyMutation } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const gateway=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts',import.meta.url),'utf8'));

function fixture(){
 const inbounds=[{managementId:'IN-1',productId:'P1',purchaseOrderId:'PO-1',inboundTotalQuantity:100},
  {managementId:'IN-2',productId:'P1',purchaseOrderId:'PO-1',inboundTotalQuantity:200},
  {managementId:'IN-1',productId:'P2',purchaseOrderId:'PO-2',inboundTotalQuantity:300}];
 return {version:7,products:['P1','P2'].map(productId=>({productId,productCode:productId,accumulatedInboundQuantity:300})),
  orders:['P1','P2'].map((productId,i)=>({productId,purchaseOrderId:'PO-'+(i+1),totalOrderQuantity:1000,accumulatedInboundQuantity:300})),
  inbounds,records:inbounds.map(row=>({...row,recordKey:`${row.managementId}|${row.productId}|A`,storage:'A'})),
  boxes:inbounds.map((row,i)=>({...row,boxId:`B${i}`,number:i+1,quantity:row.inboundTotalQuantity,storage:'A',status:'보관'}))};
}

test('입고 삭제는 전체 상태 RPC를 호출하지 않고 해당 제품의 집계 자료만 읽는다',async()=>{
 const state=fixture(),requests=[],version=Promise.withResolvers();
 const loader=gateway.includes('async function loadInboundUpdateState(')?'loadInboundUpdateState':'loadInboundMutationState';
 const c=loadFunctions(gateway,['loadCanonicalState',loader,'mapInventoryRecordRows','mapInventoryBoxRows',...(gateway.includes('function mapInboundQrBox(')?['mapInboundQrBox']:[])],{
  loadStateVersion:()=>version.promise,loadFullCanonicalState:()=>{throw new Error('전체 상태 조회 금지');},
  databaseRows:async path=>{
   requests.push(path);assert.match(path,/product_id=eq\.P1/);
   const table=path.split('?')[0],key={dev_products:'products',dev_purchase_orders:'orders',dev_inbounds:'inbounds',dev_inventory_records:'records',dev_inventory_boxes:'boxes'}[table];
   return state[key].filter(r=>r.productId==='P1').map(data=>({data,product_id:data.productId,record_key:data.recordKey,box_id:data.boxId,management_id:data.managementId,storage:data.storage,box_number:data.number}));
  }
 });
 const loading=c.loadCanonicalState('deleteInbound',{managementId:'IN-1',productId:'P1'});
 assert.equal(requests.length,0,'버전을 확인하기 전에 제품 자료를 읽으면 안 된다');version.resolve(state.version);const scoped=await loading;
 assert.equal(requests.length,5);assert.equal(scoped.version,7);assert.equal(scoped.inbounds.length,2);
 const now=new Date('2026-10-21T00:00:00Z');
 const fullResult=applyMutation('deleteInbound',{managementId:'IN-1',productId:'P1'},structuredClone(state),now);
 const scopedResult=applyMutation('deleteInbound',{managementId:'IN-1',productId:'P1'},JSON.parse(JSON.stringify(scoped)),now);
 assert.deepEqual(scopedResult.result,fullResult.result);
 for(const key of ['products','purchaseOrders','inbounds','inventoryRecords','inventoryBoxes']){
  assert.deepEqual(scopedResult.changes[key].deletes,fullResult.changes[key].deletes);
  const full=fullResult.changes[key].upserts.filter(r=>r.product_id==='P1');
  assert.deepEqual(scopedResult.changes[key].upserts,full);
 }
 assert.equal(scopedResult.state.products[0].accumulatedInboundQuantity,'200 ea');
 assert.equal(scopedResult.state.orders[0].accumulatedInboundQuantity,200);
 assert.equal(scopedResult.state.boxes.length,1);assert.equal(scopedResult.state.records.length,1);
 assert.equal(fullResult.state.inbounds.find(r=>r.productId==='P2').managementId,'IN-1');
});

function frontend(){
 const notices=[],writes=[],renders=[],cache=new Map([['cache:prod:inbounds:old','old'],['cache:dev:inbounds:old','keep'],['cache:prod:products','keep']]);
 const write=Promise.withResolvers(),refresh=Promise.withResolvers();
 const state={todayInbounds:[{managementId:'IN-1',productId:'P1',productName:'대상'}, {managementId:'IN-1',productId:'P2'}, {managementId:'IN-2',productId:'P1'}],isDeletingInbound:false};
 const c=loadFunctions(adminSource,['deleteActiveInbound','applyConfirmedInboundDeletion'],{
  state,window:{confirm:()=>true},getInboundByManagementId:()=>state.todayInbounds[0],showToast:m=>notices.push(m),
  requestApi:(action,payload)=>{writes.push({action,payload});return write.promise;},closeInboundRowActionMenu(){},
  refreshInboundMutationData:options=>{assert.equal(options.freshInbounds,true);return refresh.promise;},
  getAdminResponseCacheKeys:()=>[...cache.keys()],localStorage:{removeItem:key=>cache.delete(key)},ADMIN_CACHE_PREFIX:'cache:prod',
  getInboundListDatePayload:()=>({startDate:'2026-10-01',endDate:'2026-10-21'}),
  writeAdminCache:(key,data)=>cache.set('cache:prod:'+key,structuredClone(data)),renderTodayInbounds:()=>renders.push(structuredClone(state.todayInbounds))
 });
 return {c,state,notices,writes,renders,cache,write,refresh};
}

test('서버 확인 전에는 행을 유지하고 확인 직후 후속 조회를 기다리지 않고 삭제를 표시한다',async()=>{
 const t=frontend();const pending=t.c.deleteActiveInbound('IN-1');
 assert.equal(t.writes[0].payload.productId,'P1');assert.equal(t.state.todayInbounds.length,3);assert.equal(t.state.isDeletingInbound,true);
 await t.c.deleteActiveInbound('IN-1','P1');assert.equal(t.writes.length,1);
 t.write.resolve({deletedBoxRows:5});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(t.state.todayInbounds.length,2);assert.equal(t.state.todayInbounds[0].productId,'P2');
 assert.match(t.notices.at(-1),/삭제되었습니다.*5건/);assert.equal(t.renders.length,1);
 assert.equal(t.cache.has('cache:prod:inbounds:old'),false);assert.equal(t.cache.has('cache:dev:inbounds:old'),true);assert.equal(t.cache.has('cache:prod:products'),true);
 t.refresh.resolve([true,true]);await pending;assert.equal(t.state.isDeletingInbound,false);
});

test('서버 삭제 실패는 행을 보존하고 자동으로 재전송하지 않는다',async()=>{
 const t=frontend(),pending=t.c.deleteActiveInbound('IN-1','P1');t.write.reject(new Error('서버 처리 실패'));await pending;
 assert.equal(t.state.todayInbounds.length,3);assert.equal(t.writes.length,1);assert.equal(t.renders.length,0);
 assert.equal(t.notices.at(-1),'서버 처리 실패');assert.equal(t.state.isDeletingInbound,false);
});

test('삭제 후 목록 갱신 오류는 삭제 실패로 표시하지 않는다',async()=>{
 const t=frontend(),pending=t.c.deleteActiveInbound('IN-1','P1');t.write.resolve({deletedBoxRows:1});
 await new Promise(resolve=>setImmediate(resolve));t.refresh.reject(new Error('조회 실패'));await pending;
 assert.match(t.notices.at(-1),/삭제는 완료됐지만 목록 갱신/);assert.equal(t.state.todayInbounds.length,2);assert.equal(t.state.isDeletingInbound,false);
});

test('취소 또는 제품을 식별할 수 없는 삭제는 서버로 보내지 않는다',async()=>{
 const t=frontend();t.c.window.confirm=()=>false;await t.c.deleteActiveInbound('IN-1','P1');assert.equal(t.writes.length,0);
 t.c.getInboundByManagementId=()=>null;await t.c.deleteActiveInbound('IN-1');assert.equal(t.writes.length,0);assert.match(t.notices.at(-1),/제품 정보를 확인/);
});

test('삭제 이전에 시작한 목록 조회 응답과 캐시는 삭제된 행을 되살리지 않는다',async()=>{
 const state={todayInbounds:[{managementId:'KEEP'}]},pending=Promise.withResolvers();let rendered=0,cached=0;
 const dates={startDate:'2026-10-01',endDate:'2026-10-21'};
 const c=loadFunctions(adminSource,['loadTodayInbounds'],{state,getInboundListDatePayload:()=>dates,readAdminCache:()=>null,
  requestApi:()=>pending.promise,applyTodayInboundsResult:()=>rendered++,writeAdminCache:()=>cached++});
 const load=c.loadTodayInbounds();state.inboundMutationRevision=1;pending.resolve({inbounds:[{managementId:'DELETED'}]});assert.equal(await load,false);
 assert.equal(rendered,0);assert.equal(cached,0);
 c.readAdminCache=()=>{throw new Error('삭제 후 이전 캐시 사용 금지');};c.requestApi=async()=>{throw new Error('연결 실패');};
 assert.equal(await c.loadTodayInbounds({useCache:false}),false);assert.equal(rendered,0);assert.equal(state.todayInbounds.length,1);
});
