import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {stripTypeScriptTypes} from 'node:module';
import {buildInventoryDashboard,applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import {readInventoryDelta} from '../supabase/functions/seungjin-dev-gateway/inventory-incremental.js';
import {loadFunctions,adminSource} from './helpers/frontend-runtime.mjs';
const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(new URL('../frontend/inventory-incremental.js',import.meta.url),'utf8'),context);
const merge=context.window.SeungjinInventoryIncremental.merge;
const plain=value=>JSON.parse(JSON.stringify(value));
const now=new Date('2026-10-23T01:00:00Z');
const products=['P1','P2','P3'].map(productId=>({productId,productName:productId,finalProcess:'1도',trayQuantity:'10 ea'}));
function source(){
 const records=products.map((p,i)=>({...p,recordKey:`IN${i}|${p.productId}|미지정`,managementId:`IN${i}`,storage:'미지정',originalStorage:'미지정',inboundDate:'2026-10-22',inboundTime:'08:00',inboundType:'정상입고',boxQuantity:'100 ea',inboundBoxCount:'2 box',remainderQuantities:[],inboundTotalQuantity:'200 ea'}));
 const boxes=records.flatMap((r,i)=>[1,2].map(number=>({managementId:r.managementId,productId:r.productId,boxId:`${r.managementId}-B${number}`,number,quantity:100,storage:'미지정',status:i===2?'출고완료':'보관',rawStatus:i===2?'출고완료':'보관',shippingType:i===2?(number===1?'이관':'반출'):'',custom:'preserve'})));
 return {version:10,products:structuredClone(products),orders:[],inbounds:structuredClone(records),records,boxes};
}
function dashboard(state,version=state.version){return {...buildInventoryDashboard(state.records,state.boxes,state.products,now,state.inbounds),stateVersion:version,qrStatusVersion:'qr-old'};}
function sorted(value){const copy=plain(value);copy.rows.sort((a,b)=>a.productId.localeCompare(b.productId));return copy;}
function db(state,events,paths){return async path=>{paths.push(path);if(path.startsWith('dev_sheet_outbox?')) return events;
 if(path.startsWith('dev_inbounds?')) return state.inbounds.map(data=>({management_id:data.managementId,product_id:data.productId,qr_generated_count:data.qrGeneratedCount||0}));
 const table=path.split('?')[0],field={dev_products:'products',dev_inventory_records:'records',dev_inventory_boxes:'boxes'}[table];
 const ids=JSON.parse('['+decodeURIComponent(path.match(/product_id=in\.([^&]+)/)[1]).slice(1,-1)+']');
 return state[field].filter(row=>ids.includes(row.productId)).map(data=>({data,record_key:data.recordKey,management_id:data.managementId,product_id:data.productId,box_id:data.boxId,box_number:data.number,storage:data.storage}));};}
const build=(records,boxes,products,qr)=>buildInventoryDashboard(records.map(r=>({...r.data,recordKey:r.record_key,originalStorage:r.storage})),boxes.map(r=>({...r.data,boxId:r.box_id,storage:r.storage})),products.map(r=>r.data),now,qr.map(r=>({managementId:r.management_id,productId:r.product_id,qrGeneratedCount:r.qr_generated_count})));
test('변경된 제품만 읽어 전체 재조회와 동일한 박스·합계·위치·필터를 만든다',async()=>{
 const old=source(),latest=structuredClone(old),paths=[];
 latest.boxes.filter(b=>b.productId==='P1').forEach(b=>{b.storage='B-1';b.quantity=b.number===1?37:100;});latest.inbounds[1].qrGeneratedCount=2;
 const delta=await readInventoryDelta({deltaSinceVersion:10},{stateVersion:11,qrStatusVersion:'qr-new'},db(latest,[{state_version:11,action:'updateInventoryBoxMove',product_id:'P1'}],paths),build);
 assert.equal(paths.length,5);assert.ok(paths.filter(p=>!p.startsWith('dev_inbounds')&&!p.startsWith('dev_sheet_outbox')).every(p=>p.includes('product_id=in.')));
 const expected=dashboard(latest,11);expected.qrStatusVersion='qr-new';
 assert.deepEqual(sorted(merge(dashboard(old),delta)),sorted(expected));
 assert.equal(dashboard(old).rows.find(r=>r.productId==='P1').storage,'미지정');
});
test('삭제·새 입고·다른 제품 변경과 이관·반출 수량을 함께 보존한다',async()=>{
 const old=source(),latest=structuredClone(old);latest.records=latest.records.filter(r=>r.productId!=='P1');latest.boxes=latest.boxes.filter(b=>b.productId!=='P1');latest.boxes[0].storage='C-1';
 const events=[{state_version:11,action:'deleteInbound',product_id:'P1'},{state_version:12,action:'updateInbound',product_id:'P2'},{state_version:12,action:'getInboundBoxQrs'}];
 const delta=await readInventoryDelta({deltaSinceVersion:10},{stateVersion:12,qrStatusVersion:'qr-old'},db(latest,events,[]),build);
 assert.deepEqual(sorted(merge(dashboard(old),delta)),sorted(dashboard(latest,12)));
 assert.equal(merge(dashboard(old),delta).summary.totalBoxes,2);
});
test('버전 이력 누락·과도한 변경·알 수 없는 작업·누락된 제품은 전체 조회로 복귀한다',async()=>{
 for(const [version,events] of [[12,[{state_version:12,action:'updateInbound',product_id:'P1'}]],[11,[{state_version:11,action:'unknown',product_id:'P1'}]],[11,[{state_version:11,action:'updateInbound'}]],[51,[]]]) {
  assert.equal(await readInventoryDelta({deltaSinceVersion:10},{stateVersion:version},db(source(),events,[]),build),null);
 }
 assert.equal(await readInventoryDelta({deltaSinceVersion:null},{stateVersion:11},db(source(),[],[]),build),null);
});
test('고아 박스가 있으면 전체 조회로 복귀하고 다른 기준의 변경분은 적용하지 않는다',async()=>{
 const s=source();s.boxes.push({...s.boxes[0],boxId:'orphan',managementId:'absent'});
 assert.equal(await readInventoryDelta({deltaSinceVersion:10},{stateVersion:11},db(s,[{state_version:11,action:'updateInbound',product_id:'P1'}],[]),build),null);
 assert.throws(()=>merge(dashboard(source()),{inventoryDelta:{fromVersion:9,productIds:[]},rows:[]}),/기준/);
});
test('정보 수정은 현재 입고의 상세만 읽고 과거 박스는 집계 값으로도 같은 저장 결과를 만든다',async()=>{
 const original=source();
 const history={...original.records[0],managementId:'HISTORY',recordKey:'HISTORY|P1|C',storage:'C'};original.records.push(history);original.inbounds.push(history);original.boxes.push({...original.boxes[0],managementId:'HISTORY',boxId:'HISTORY-B1',quantity:599,status:'출고완료',rawStatus:'출고완료',shippingType:'반출',note:'오래된 상세 내용'});
 original.boxes[0].quantity=37;original.boxes[0].status='일부 출고';original.boxes[0].rawStatus='일부 출고';const paths=[];
 const gateway=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts',import.meta.url),'utf8'));
 const c=loadFunctions(gateway,['loadInboundUpdateState','mapInventoryRecordRows','mapInventoryBoxRows'],{loadStateVersion:async()=>10,databaseRows:async path=>{
  paths.push(path);const table=path.split('?')[0],field={dev_products:'products',dev_purchase_orders:'orders',dev_inbounds:'inbounds',dev_inventory_records:'records',dev_inventory_boxes:'boxes'}[table];
  return original[field].filter(r=>r.productId==='P1'&&(!path.includes('management_id=eq.')||r.managementId==='IN0')).map(data=>({...(field!=='boxes'||path.includes(',data')?{data}:{}),quantity:data.quantity,status:data.status,raw_status:data.rawStatus,shipping_type:data.shippingType,box_id:data.boxId,management_id:data.managementId,product_id:data.productId,record_key:data.recordKey,storage:data.storage,box_number:data.number}));
 }});
 const payload={...original.records[0],managementId:'IN0',productId:'P1',storage:'A',boxQuantity:100,inboundBoxCount:2,inspectionQuantity:10,defectQuantity:0};
 const loaded=plain(await c.loadInboundUpdateState(payload,false,true));const fast=applyMutation('updateInbound',payload,loaded,now),full=applyMutation('updateInbound',payload,original,now);
 assert.deepEqual(fast.changes,full.changes);assert.equal(fast.state.boxes.find(b=>b.boxId==='IN0-B1').quantity,37);assert.ok(paths.filter(p=>p.startsWith('dev_inventory_boxes')).every(p=>p.includes('quantity:')||p.includes('management_id=eq.IN0')));
});
test('확인된 저장은 후속 전체 조회를 기다리지 않고 편집을 종료하고 갱신 실패와 구분한다',async()=>{
 const pending=Promise.withResolvers(),notices=[];const state={activeDetailInboundId:'IN0',activeDetailInboundProductId:'P1',activeDetailInboundSource:'inventory'};
 const c=loadFunctions(adminSource,['saveInboundEdit'],{state,saveInboundEditButton:{},getInboundEditPayload:async()=>({managementId:'IN0',productId:'P1'}),validateInboundEditPayload:()=>'',uploadInboundAttachments:async()=>{},requestApi:async()=>({stateVersion:11}),window:{},refreshInboundMutationDataAfterMutation:()=>pending.promise,setInboundDetailMode:mode=>state.mode=mode,normalizeInboundDetailRecord:r=>r,getInventoryRecordByManagementId:()=>({managementId:'IN0'}),getInboundByManagementId:()=>null,renderInboundDetail(){},showToast:t=>notices.push(t)});
 await c.saveInboundEdit();assert.equal(state.isSavingInboundEdit,false);assert.equal(state.mode,'view');assert.equal(notices.at(-1),'입고 내역이 수정되었습니다.');pending.reject(new Error('목록 실패'));await new Promise(r=>setImmediate(r));assert.match(notices.at(-1),/수정은 저장됐습니다/);
});

test('서버 저장 완료 전에는 확정 행을 반환하지 않고 완료 후 실제 박스 수량을 반환한다',async()=>{
 const original=source(),commit=Promise.withResolvers(),gateway=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts',import.meta.url),'utf8'));
 const payload={...original.records[0],storage:'B-1',boxQuantity:100,inboundBoxCount:2,inspectionQuantity:10,defectQuantity:0,returnInventoryRows:true};
 const c=loadFunctions(gateway,['commitCanonicalMutation'],{loadCanonicalState:async()=>original,applyMutation,buildInventoryDashboard,databaseRequest:()=>commit.promise});
 let finished=false;const pending=c.commitCanonicalMutation('updateInbound',payload).then(r=>{finished=true;return r;});await new Promise(r=>setImmediate(r));assert.equal(finished,false);commit.resolve({version:11,outboxId:1});const result=await pending;
 assert.equal(result.stateVersion,11);assert.equal(result.savedInventoryRows.length,1);assert.equal(result.savedInventoryRows[0].activeShippingBoxes[0].storage,'B-1');assert.equal(result.savedInventoryRows[0].currentTotalQuantity,'200 ea');
});

test('QR 인쇄 상태만 바뀌면 박스 전체를 다시 읽지 않고 QR 집계만 갱신한다',async()=>{
 const before=source(),latest=structuredClone(before),paths=[];latest.inbounds[1].qrGeneratedCount=2;
 const delta=await readInventoryDelta({deltaSinceVersion:10},{stateVersion:10,qrStatusVersion:'qr-new'},db(latest,[],paths),build);
 assert.equal(paths.length,1);assert.match(paths[0],/^dev_inbounds/);const expected=dashboard(latest);expected.qrStatusVersion='qr-new';assert.deepEqual(sorted(merge(dashboard(before),delta)),sorted(expected));
});

test('위치 저장 전에 시작된 느린 조회가 나중에 도착해도 확정한 화면을 되돌리지 않는다',async()=>{
 const pending=Promise.withResolvers(),state={inventoryLoaded:true,inventoryStateVersion:1},applied=[];
 const c=loadFunctions(adminSource,['loadInventoryDashboardRequest'],{state,refreshInventoryConfirmationStatus(){},window:{SeungjinDataGateway:{canRead:()=>true}},requestApi:async action=>action==='getInventoryVersion'?{stateVersion:2,qrStatusVersion:'qr2'}:pending.promise,applyInventoryDashboardResult:r=>applied.push(r),showToast(){},writeAdminLargeCache(){}});
 const load=c.loadInventoryDashboardRequest(false);await new Promise(r=>setImmediate(r));state.inventoryMutationRevision=1;pending.resolve({rows:[],stateVersion:2});assert.equal(await load,false);assert.equal(applied.length,0);
});
