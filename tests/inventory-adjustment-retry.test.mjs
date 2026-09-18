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

test('부분출고 26박스 중 남은 15박스 8319개만 정리하고 정상 출고 이력을 보존한다',()=>{
  const state=fixture();
  const remaining=[1,2,4,7,8,11,14,16,17,18,20,22,23,25,26];
  state.boxes=Array.from({length:26},(_,i)=>({boxId:`B${i+1}`,managementId,productId,storage:'B-1',number:i+1,quantity:i===25?381:567,status:remaining.includes(i+1)?'일부 출고':'출고완료',shippingType:remaining.includes(i+1)?'':'정상출고',shippingDate:remaining.includes(i+1)?'':'2026-09-01'}));
  const shipped=structuredClone(state.boxes.filter(b=>b.status==='출고완료'));
  const request={...payload,protectClassifiedInventory:true,selectedBoxes:remaining,boxQuantities:Object.fromEntries(state.boxes.filter(b=>remaining.includes(b.number)).map(b=>[b.number,b.quantity]))};
  const first=applyMutation('adjustRemainingInventory',request,state,firstTime);
  assert.equal(first.result.updatedBoxRows,15);
  assert.equal(first.result.remainingActiveRows,0);
  assert.equal(first.changes.inventoryBoxes.upserts.reduce((s,b)=>s+b.data.quantity,0),8319);
  assert.deepEqual(first.state.boxes.filter(b=>b.shippingType==='정상출고'),shipped);
  assert.deepEqual(state.boxes.filter(b=>b.status==='출고완료'),shipped);
  const retry=applyMutation('adjustRemainingInventory',request,first.state,retryTime);
  assert.equal(retry.result.updatedBoxRows,0);
  assert.equal(retry.result.alreadyAdjustedBoxRows,15);
});
test('실물 정리는 화면에서 허용한 보관·부분출고·작업중·검수완료·출고대기 상태와 일치한다',()=>{
  for(const status of ['보관','일부 출고','일부출고','부분출고','부분 출고','작업중','검수완료','출고대기','출고대기(검수완료)']) {
    const state=fixture();state.boxes.forEach(b=>{b.status=status;b.rawStatus=status;});
    assert.equal(applyMutation('adjustRemainingInventory',{...payload,protectClassifiedInventory:true},state,firstTime).result.updatedBoxRows,2,status);
  }
});
test('보류·폐기·정상 출고완료·분류재고·빈 박스·미지원 상태는 계속 보호한다',()=>{
  for(const status of ['보류','출고 보류','폐기','출고완료','출고완료(정상출고)','알수없음','사출재고','인쇄재고']) {
    const state=fixture();state.boxes[0].status=status;state.boxes[0].rawStatus=status;
    assert.throws(()=>applyMutation('adjustRemainingInventory',{...payload,protectClassifiedInventory:true,expectedBoxQuantities:{3:480,23:480}},state,firstTime),/최신 재고를 확인/,status);
  }
  for(const patch of [{inventoryCategory:'사출 보관재고'},{quantity:0},{quantity:479}]) {
    const state=fixture();Object.assign(state.boxes[0],patch);
    assert.throws(()=>applyMutation('adjustRemainingInventory',{...payload,protectClassifiedInventory:true,expectedBoxQuantities:{3:480,23:480}},state,firstTime),/최신 재고를 확인/);
  }
});
test('일반 수량 조정은 보관·부분출고만 허용하고 작업중·출고대기는 실물 정리에서만 허용한다',()=>{
  for(const status of ['작업중','출고대기']) {
    const state=fixture();state.boxes.forEach(b=>{b.status=status;b.rawStatus=status;});
    assert.throws(()=>applyMutation('adjustRemainingInventory',payload,state,firstTime),/최신 재고를 확인/);
  }
  const state=fixture();state.boxes.forEach(b=>{b.status='일부 출고';b.rawStatus='일부 출고';});
  assert.equal(applyMutation('adjustRemainingInventory',payload,state,firstTime).result.updatedBoxRows,2);
});
