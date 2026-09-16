import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {applyMutation, buildInventoryDashboard} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const source=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function confirmInventoryPhysicalBoxes('),source.indexOf('function renderInventoryAuditBoxStatus('));
const makeBoxes=()=>[1,2,3].map(number=>({boxId:`B${number}`,managementId:'IN-TEST',productId:'P1',number,quantity:100,storage:'A',status:number===2?'출고대기':'보관',rawStatus:number===2?'출고대기':'보관'}));
function harness({fail=false,refresh=true}={}) {
 const boxes=makeBoxes();
 const item={managementId:'IN-TEST',productId:'P1',productName:'제품',clientName:'업체',activeShippingBoxes:boxes,allShippingBoxes:boxes};
 const section={outerHTML:''};const message={textContent:''};const calls=[];const notices=[];
 const context=vm.createContext({state:{activeDetailInboundId:'IN-TEST',activeDetailInboundProductId:'P1',activeDetailInboundSource:'inventory'},
  inboundDetailModal:{hidden:false},inboundDetailContent:{querySelector:selector=>selector==='.inventory-audit-box-section'?section:message},
  getInventoryRecordByManagementId:()=>item,getInventoryAuditTargetBoxes:()=>boxes.filter(b=>!b.lastInventoryCheckedAt),getInventoryAuditEligibleBoxes:()=>boxes,
  updateInventoryAuditSelection:()=>{},renderInventoryAuditBoxStatus:record=>JSON.stringify(record),normalizeInboundDetailRecord:x=>x,
  signedInAdminName:'담당자',formatNumber:String,showToast:t=>notices.push(t),loadInventoryDashboard:async()=>refresh,
  requestApi:async(action,payload)=>{calls.push({action,payload});if(fail)throw new Error('연결 실패');return {confirmedBoxRows:payload.confirmedBoxes[0].selectedBoxes.length,inventoryCheckedAt:'2026-09-16 10:00:00'};}});
 vm.runInContext(code,context);return {context,boxes,calls,notices,section};
}
for(const numbers of [[2],[1,2,3]]) test(`PC confirmation saves only selected boxes ${numbers}`,async()=>{
 const h=harness();await h.context.confirmInventoryPhysicalBoxes(numbers);
 assert.equal(h.calls.length,1);const {action,payload}=h.calls[0];
 assert.equal(action,'adjustMissingInventory');assert.equal(payload.confirmationOnly,true);assert.equal(payload.adjustments.length,0);
 assert.deepEqual(Array.from(payload.confirmedBoxes[0].selectedBoxes),numbers);
 assert.deepEqual(h.boxes.filter(b=>b.lastInventoryCheckedAt).map(b=>b.number),numbers);
 assert.equal(h.boxes[1].status,'출고대기');assert.ok(h.boxes.every(b=>b.quantity===100&&b.storage==='A'));
 assert.equal(h.context.state.isSavingInventoryConfirmation,false);assert.ok(h.section.outerHTML);
});
test('failed save does not move cards and can retry',async()=>{
 const h=harness({fail:true});await h.context.confirmInventoryPhysicalBoxes([1,2]);
 assert.ok(h.boxes.every(b=>!b.lastInventoryCheckedAt));assert.equal(h.section.outerHTML,'');assert.match(h.notices.at(-1),/연결 실패/);
 assert.equal(h.context.state.isSavingInventoryConfirmation,false);
});
test('refresh failure after a successful save retains the confirmed state',async()=>{
 const h=harness({refresh:false});await h.context.confirmInventoryPhysicalBoxes([1]);
 assert.ok(h.boxes[0].lastInventoryCheckedAt);assert.match(h.notices.at(-1),/저장했습니다.*갱신/);
});
test('empty selection and double click do not send an extra mutation',async()=>{
 const h=harness();await h.context.confirmInventoryPhysicalBoxes([]);assert.equal(h.calls.length,0);
 await Promise.all([h.context.confirmInventoryPhysicalBoxes([1]),h.context.confirmInventoryPhysicalBoxes([1])]);assert.equal(h.calls.length,1);
});
test('canonical confirmation only preserves quantities and shipping status, even with adjustment data',()=>{
 const boxes=makeBoxes();const before=structuredClone(boxes);
 const state={products:[],orders:[],inbounds:[],records:[{managementId:'IN-TEST',productId:'P1',storage:'A'}],boxes};
 const mutation=applyMutation('adjustMissingInventory',{confirmationOnly:true,confirmedBoxes:[{managementId:'IN-TEST',productId:'P1',selectedBoxes:[1,2]}],adjustments:[{managementId:'IN-TEST',productId:'P1',selectedBoxes:[3]}]},state,new Date('2026-09-16T01:00:00Z'));
 assert.equal(mutation.result.confirmedBoxRows,2);assert.equal(mutation.result.updatedBoxRows,0);
 for(const box of mutation.state.boxes){const original=before.find(b=>b.boxId===box.boxId);const {lastInventoryCheckedAt,...rest}=box;assert.deepEqual(rest,original);assert.equal(Boolean(lastInventoryCheckedAt),box.number<3);}
 const dashboard=buildInventoryDashboard(mutation.state.records,mutation.state.boxes);
 assert.equal(dashboard.rows[0].inventoryConfirmedBoxCount,2);assert.equal(dashboard.rows[0].inventoryUnconfirmedBoxCount,1);
});
