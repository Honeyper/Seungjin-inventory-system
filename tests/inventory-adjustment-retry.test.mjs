import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMutation } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';

const managementId = 'IN-260730-KHE-0001-001';
const productId = 'KHE-0001';
const payload = {managementId, productId, selectedBoxes:[3,23], boxQuantities:{3:480,23:480}, adjustmentDate:'2026-09-14', userName:'검증'};
function fixture() {
  return {products:[],orders:[],inbounds:[],records:[{recordKey:`${managementId}|${productId}|B-1`,managementId,productId,storage:'B-1'}],boxes:[3,23].map(number=>({boxId:`${managementId}-B${String(number).padStart(3,'0')}`,managementId,productId,number,quantity:480,status:'보관',rawStatus:'보관',storage:'B-1'}))};
}
const firstTime = new Date('2026-09-14T02:03:17Z');
const retryTime = new Date('2026-09-14T02:04:10Z');
test('동일한 3·23번 재고조정 재요청은 기존 이력과 수량을 유지하고 쓰기를 만들지 않는다',()=>{
  const first=applyMutation('adjustRemainingInventory',payload,fixture(),firstTime);
  const retry=applyMutation('adjustRemainingInventory',payload,first.state,retryTime);
  assert.equal(first.result.updatedBoxRows,2);
  assert.equal(retry.result.updatedBoxRows,0);
  assert.equal(retry.result.alreadyAdjustedBoxRows,2);
  assert.deepEqual(retry.state,first.state);
  assert.ok(Object.values(retry.changes).every(c=>c.upserts.length===0&&c.deletes.length===0));
});
test('일부만 이미 조정된 요청은 나머지 박스만 저장한다',()=>{
  const first=applyMutation('adjustRemainingInventory',{...payload,selectedBoxes:[3]},fixture(),firstTime);
  const retry=applyMutation('adjustRemainingInventory',payload,first.state,retryTime);
  assert.equal(retry.result.updatedBoxRows,1);
  assert.equal(retry.result.alreadyAdjustedBoxRows,1);
  assert.deepEqual(retry.state.boxes[0],first.state.boxes[0]);
  assert.deepEqual(retry.changes.inventoryBoxes.upserts.map(r=>r.box_number),[23]);
  assert.equal(retry.state.records[0].currentTotalQuantity,'0 ea');
});
test('이미 처리된 박스에 다른 수량이나 다른 조정일을 보내면 조용히 덮어쓰지 않는다',()=>{
  const first=applyMutation('adjustRemainingInventory',payload,fixture(),firstTime);
  for (const changed of [{boxQuantities:{3:0,23:480}},{adjustmentDate:'2026-09-15'}]) {
    assert.throws(()=>applyMutation('adjustRemainingInventory',{...payload,...changed},first.state,retryTime),/최신 재고를 확인/);
  }
});
test('정상 출고된 박스는 재고조정 재요청으로 취급하지 않는다',()=>{
  const state=fixture();Object.assign(state.boxes[0],{status:'출고완료',rawStatus:'출고완료',shippingType:'정상출고',shippingDate:'2026-09-14'});
  assert.throws(()=>applyMutation('adjustRemainingInventory',payload,state,retryTime),/최신 재고를 확인/);
});
