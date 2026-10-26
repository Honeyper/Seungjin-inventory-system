import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {stripTypeScriptTypes} from 'node:module';
import {savedRegistrationRecord} from '../supabase/functions/seungjin-dev-gateway/registration-result.js';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import {loadFunctions,adminSource} from './helpers/frontend-runtime.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
const gas=fs.readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');
function folderRuntime({cached=false,broken=false,cacheFails=false}={}) {
 const calls=[],cache=new Map(),folders=new Map();let id=0;
 function folder(name,parent){const f={id:'folder'+id++,getId(){return this.id;},getName:()=>name,isTrashed:()=>false,getFoldersByName:n=>{calls.push(['search',f.id,n]);const found=[...folders.values()].find(c=>c.parent===f&&c.name===n);return {hasNext:()=>!!found,next:()=>found};},createFolder:n=>{calls.push(['create',f.id,n]);return folder(n,f);},name,parent};folders.set(f.id,f);return f;}
 const root=folder('root'),other=folder('otherRoot');let last;
 for(const n of ['거래명세서','입고','2026-10-26','업체'])last=folder(n,last||root);
 const c=loadFunctions(gas,['getOrCreateDriveFolderPath_','sanitizeDriveName_'],{Utilities:{DigestAlgorithm:{SHA_256:1},computeDigest:(_,s)=>s,base64EncodeWebSafe:s=>s},CacheService:{getScriptCache:()=>{if(cacheFails)throw Error('unavailable');return {get:k=>cache.get(k),put:(k,v,ttl)=>{assert.equal(ttl,120);cache.set(k,v);},remove:k=>cache.delete(k)};}},DriveApp:{getFolderById:id=>{calls.push(['id',id]);if(broken)throw Error('deleted');return folders.get(id);}}});
 return {c,root,other,last,calls,cache};
}
test('첨부 경로는 처음에 찾고 반복 업로드는 같은 폴더 ID를 재사용한다',()=>{
 const t=folderRuntime(),names=['거래명세서','입고','2026-10-26','업체'];const first=t.c.getOrCreateDriveFolderPath_(t.root,names);assert.equal(t.calls.filter(c=>c[0]==='search').length,4);t.calls.length=0;
 assert.equal(t.c.getOrCreateDriveFolderPath_(t.root,names),first);assert.deepEqual(t.calls,[['id',first.id]]);
 const second=t.c.getOrCreateDriveFolderPath_(t.other,names);assert.notEqual(second,first);assert.ok(t.calls.some(c=>c[0]==='search'));
});
test('삭제·이름 변경·캐시 장애는 기존 경로 탐색으로 안전하게 돌아간다',()=>{
 for(const mode of ['deleted','renamed','trashed','cache-failed']){const t=folderRuntime({broken:mode==='deleted',cacheFails:mode==='cache-failed'}),names=['거래명세서','입고','2026-10-26','업체'];t.c.getOrCreateDriveFolderPath_(t.root,names);t.calls.length=0;
 if(mode==='renamed')t.last.getName=()=> '다른 이름';if(mode==='trashed')t.last.isTrashed=()=>true;
 const f=t.c.getOrCreateDriveFolderPath_(t.root,names);assert.equal(f,t.last);assert.equal(t.calls.filter(c=>c[0]==='search').length,4);}
});
test('서버 응답은 실제 커밋된 행을 반환하며 저장 완료 전에는 등록 완료를 표시하지 않는다',async()=>{
 const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts',import.meta.url),'utf8'));
 const record={managementId:'IN-1',productId:'P1',inboundDate:'2026-10-26',invoiceFileUrl:'https://example.test/invoice'};
 const pending=Promise.withResolvers();let ended=false;
 const c=loadFunctions(source,['commitCanonicalMutation'],{loadCanonicalState:async()=>({version:1}),applyMutation:()=>({changes:{inbounds:{upserts:[{management_id:'IN-1',data:record}]}},result:{managementId:'IN-1'}}),databaseRequest:()=>pending.promise,savedRegistrationRecord});
 const promise=c.commitCanonicalMutation('createInbound',{returnSavedRecord:true}).then(r=>{ended=true;return r;});await new Promise(r=>setImmediate(r));assert.equal(ended,false);pending.resolve({version:2});const result=await promise;assert.deepEqual(plain(result.savedRecord),record);
 assert.equal(savedRegistrationRecord('deleteInbound',{inbounds:{upserts:[]}},{}),undefined);
});
test('입고 확정 행은 조회 기간을 지키고 중복 없이 즉시 표시한다',()=>{
 const state={todayInbounds:[{managementId:'OTHER',productId:'P1'}]},renders=[],dates={startDate:'2026-10-26',endDate:'2026-10-26'};
 const c=loadFunctions(adminSource,['applyConfirmedInboundRegistration'],{state,getInboundListDatePayload:()=>dates,applyMasterFinalProcess:r=>r,getAdminResponseCacheKeys:()=>[],localStorage:{},ADMIN_CACHE_PREFIX:'qa',writeAdminCache(){},renderTodayInbounds:()=>renders.push(plain(state.todayInbounds))});
 const record={managementId:'IN-1',productId:'P1',inboundDate:'2026-10-26'};c.applyConfirmedInboundRegistration(record);c.applyConfirmedInboundRegistration(record);assert.equal(state.todayInbounds.length,2);assert.equal(renders.length,2);assert.equal(state.todayInbounds[0].managementId,'IN-1');
 c.applyConfirmedInboundRegistration({...record,managementId:'OLD',inboundDate:'2026-10-25'});assert.equal(state.todayInbounds.length,2);
});
test('입고 저장은 느린 재조회를 기다리지 않고 확정 행과 저장 단계를 표시한다',async()=>{
 const stages=[],notices=[],painted=[],refresh=Promise.withResolvers(),write=Promise.withResolvers(),state={};
 const c=loadFunctions(adminSource,['saveInbound'],{state,getInboundPayload:()=>({productId:'P1'}),validateInboundPayload:()=>'',setInboundSaving:v=>state.isSavingInbound=v,getInboundInvoicePayload:async()=>null,getInboundDefectFilePayloads:async()=>[],setInboundSaveStage:s=>stages.push(s),uploadInboundAttachments:async()=>{},requestApi:()=>write.promise,applyConfirmedInboundRegistration:r=>painted.push(r),refreshInboundMutationDataAfterMutation:()=>refresh.promise,resetInboundDefectDefaults(){},updateInboundSummary(){},showToast:s=>notices.push(s)});
 const promise=c.saveInbound();await new Promise(r=>setImmediate(r));assert.equal(painted.length,0);write.resolve({managementId:'IN-1',savedRecord:{managementId:'IN-1',productId:'P1'}});await promise;assert.equal(state.isSavingInbound,false);assert.equal(painted.length,1);assert.ok(stages.includes('등록 저장 중'));assert.match(notices.at(-1),/저장되었습니다/);refresh.reject(Error('조회 실패'));await new Promise(r=>setImmediate(r));assert.match(notices.at(-1),/입고는 등록됐습니다/);
});
test('신규 발주는 확정된 행을 표시하고 후속 전체 조회와 독립적으로 창을 닫는다',async()=>{
 const refresh=Promise.withResolvers(),state={purchaseOrderFormMode:'create',purchaseOrders:[]},notices=[];let closed=false;
 const c=loadFunctions(adminSource,['savePurchaseOrder'],{state,getPurchaseOrderPayload:()=>({productId:'P1',startDate:'2026-10-26',totalOrderQuantity:1000,deliveryType:'date'}),findDuplicatePurchaseOrder:()=>null,purchaseOrderFormMessage:{},savePurchaseOrderButton:{},requestApi:async()=>({savedRecord:{purchaseOrderId:'PO-1',productId:'P1'}}),applyPurchaseOrderFilters(){},populateInboundPurchaseOrders(){},inboundProductId:null,loadPurchaseOrders:()=>refresh.promise,closePurchaseOrderModal:()=>closed=true,showToast:s=>notices.push(s)});
 await c.savePurchaseOrder();assert.equal(closed,true);assert.equal(state.isSavingPurchaseOrder,false);assert.equal(state.purchaseOrders[0].purchaseOrderId,'PO-1');refresh.resolve(true);
});
test('등록 전에 시작한 제품·발주 조회는 새로 등록한 행을 제거하지 않는다',async()=>{
 for(const kind of ['product','order']){const pending=Promise.withResolvers(),state={products:[{productCode:'NEW'}],purchaseOrders:[{purchaseOrderId:'NEW'}],purchaseOrdersLoaded:true},applied=[];
 const names=kind==='product'?['loadProducts']:['loadPurchaseOrdersRequest'];const c=loadFunctions(adminSource,names,{state,readAdminCache:()=>null,setStatus(){},requestApi:()=>pending.promise,applyProductsResult:r=>applied.push(r),writeAdminCache(){},purchaseOrderListStatus:null,populateInboundPurchaseOrders(){},inboundProductId:null,renderPurchaseOrders(){},applyPurchaseOrderFilters(){},getCurrentView:()=> 'products'});
 const p=c[names[0]]();if(kind==='product')state.productMutationRevision=1;else state.purchaseOrderMutationRevision=1;pending.resolve(kind==='product'?{products:[]}:{purchaseOrders:[]});await p;assert.equal(applied.length,0);assert.equal(state.products[0].productCode,'NEW');assert.equal(state.purchaseOrders[0].purchaseOrderId,'NEW');}
});
