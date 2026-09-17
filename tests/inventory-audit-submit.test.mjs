import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const admin=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
const code=admin.slice(admin.indexOf('async function saveRemainingInventory('),admin.indexOf('\nasync function cancelShippingWaiting('));
const remaining=[1,2,4,7,8,11,14,16,17,18,20,22,23,25,26];
const record={managementId:'IN-TEST',productId:'P1',productName:'검증제품',clientName:'검증업체',storage:'A'};
function fixture(){return {products:[],orders:[],inbounds:[],records:[record],boxes:Array.from({length:26},(_,i)=>({...record,boxId:`B${i+1}`,number:i+1,quantity:i===25?381:567,status:remaining.includes(i+1)?'일부 출고':'출고완료',shippingType:remaining.includes(i+1)?'':'정상출고',shippingDate:remaining.includes(i+1)?'':'2026-09-01'}))};}
function harness() {
  const initial=fixture(), inputs=initial.boxes.filter(b=>remaining.includes(b.number)).map(b=>({value:String(b.number),dataset:{quantity:String(b.quantity),boxId:b.boxId}}));
  const calls=[],toasts=[],events=[];let saved=null;
  const context=vm.createContext({
    state:{activeRemainingInventoryRow:record,activeRemainingInventoryMode:'audit',isSavingRemainingInventory:false},
    remainingInventoryBoxList:{querySelectorAll:()=>inputs},remainingInventoryForm:{querySelector:()=>null},
    remainingInventoryMessage:{textContent:''},saveRemainingInventoryButton:{disabled:false,textContent:''},
    window:{confirm:()=>true},signedInAdminName:'검증',formatNumber:String,parseShippingSettlementNumber:Number,getLocalDateInputValue:()=> '2026-09-17',
    closeRemainingInventoryModal:()=>{events.push("close");},closeInboundDetailModal:()=>{},loadInventoryDashboard:async()=>{events.push("refresh");return true;},refreshInventoryDashboardAfterMutation:async()=>{events.push("refresh");return true;},
    showToast:message=>toasts.push(message),
    requestApi:async(action,payload)=>{calls.push({action,payload});saved=applyMutation(action,structuredClone(payload),initial,new Date('2026-09-17T04:00:00Z'));return saved.result;}
  });
  vm.runInContext(code,context);
  return {context,initial,calls,toasts,events,getSaved:()=>saved};
}
test('actual audit submit function handles all 15 partial-shipment boxes without changing the 11 shipped boxes',async()=>{
  const h=harness();await h.context.saveRemainingInventory();
  assert.equal(h.context.remainingInventoryMessage.textContent,'');assert.equal(h.calls.length,1);
  assert.ok(h.events.indexOf('refresh') < h.events.indexOf('close'), 'refresh before reopening the overview');
  const saved=h.getSaved();assert.ok(saved);assert.equal(saved.result.updatedBoxRows,15);
  assert.deepEqual(saved.state.boxes.filter(b=>b.shippingType==='정상출고'),h.initial.boxes.filter(b=>b.shippingType==='정상출고'));
  const {action,payload}=h.calls[0];
  if(action==='adjustRemainingInventory'){
    assert.ok(Object.values(payload.boxQuantities).every(n=>n===0));
    assert.equal(Object.values(payload.expectedBoxQuantities).reduce((s,n)=>s+n,0),8319);
    assert.ok(saved.state.boxes.filter(b=>remaining.includes(b.number)).every(b=>b.quantity===0));
    const retry=applyMutation(action,structuredClone(payload),saved.state,new Date('2026-09-17T04:01:00Z'));
    assert.equal(retry.result.updatedBoxRows,0);assert.equal(retry.result.alreadyAdjustedBoxRows,15);
  } else assert.equal(action,'adjustMissingInventory');
});
test('legacy open page can submit audit zero quantities without an expected quantity field',()=>{
  const initial=fixture();
  const payload={...record,selectedBoxes:remaining,boxQuantities:Object.fromEntries(remaining.map(n=>[n,0])),protectClassifiedInventory:true};
  assert.equal(applyMutation('adjustRemainingInventory',payload,initial).result.updatedBoxRows,15);
});
test('a changed current quantity is rejected without mutating source state',()=>{
  const initial=fixture(), before=structuredClone(initial);
  const payload={...record,selectedBoxes:remaining,boxQuantities:Object.fromEntries(remaining.map(n=>[n,0])),expectedBoxQuantities:Object.fromEntries(remaining.map(n=>[n,n===26?381:567])),protectClassifiedInventory:true};
  initial.boxes[0].quantity=566;before.boxes[0].quantity=566;
  assert.throws(()=>applyMutation('adjustRemainingInventory',payload,initial),/최신 재고/);assert.deepEqual(initial,before);
});
