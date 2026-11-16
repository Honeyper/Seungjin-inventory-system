import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMutation,buildInventoryDashboard,getAdditionalProductionSources} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import {adminSource,loadFunctions} from './helpers/frontend-runtime.mjs';
await import('../frontend/qr-label.js');
const now=new Date('2026-11-13T03:00:00Z');
const inbound={managementId:'IN-TARGET',productId:'P1',productName:'추가 생산 시험',clientName:'시험',storage:'A',boxQuantity:'100 ea',inboundBoxCount:'10 box',inboundTotalQuantity:'1000 ea',inboundDate:'2026-11-13',inboundTime:'10:00',inboundType:'정상입고',process:'1도'};
const payload=()=>({managementId:'IN-TARGET',productId:'P1',requestId:'request-12345678',boxQuantities:[80],sourceUses:[{boxId:'RAW-1',quantity:100,expectedQuantity:150}],lossQuantity:20,productionDate:'2026-11-13',storage:'A',note:'로스 보충',userName:'시험'});
const fixture=()=>({products:[{productId:'P1',productName:'추가 생산 시험',finalProcess:'1도'}],orders:[],inbounds:[structuredClone(inbound)],
  records:[{...inbound,recordKey:'IN-TARGET|P1|A'},{...inbound,managementId:'RAW',recordKey:'RAW|P1|H',storage:'H',stockStatus:'사출재고',inboundBoxCount:'1 box',inboundTotalQuantity:'150 ea'}],
  boxes:[...Array.from({length:10},(_,i)=>({boxId:`IN-TARGET-B${String(i+1).padStart(3,'0')}`,managementId:'IN-TARGET',productId:'P1',number:i+1,quantity:100,status:'보관',rawStatus:'보관',storage:'A',qrData:'KEEP-'+i})),
    {boxId:'RAW-1',managementId:'RAW',productId:'P1',number:1,quantity:150,currentQuantity:'150 ea',status:'사출재고',rawStatus:'사출재고',storage:'H',qrData:'RAW-QR'}]});
const apply=(state,p=payload())=>applyMutation('registerAdditionalProduction',p,state,now);

test('10박스는 수량·QR 그대로 두고 새 박스만 만들며 사출 사용과 로스를 함께 보존한다',()=>{
  const before=fixture(),r=apply(before);
  assert.deepEqual(r.state.boxes.slice(0,10),before.boxes.slice(0,10));
  assert.deepEqual(r.state.inbounds,before.inbounds);assert.deepEqual(r.state.products,before.products);
  assert.equal(r.state.boxes.find(b=>b.boxId==='RAW-1').quantity,50);
  assert.equal(r.state.boxes.find(b=>b.boxId==='RAW-1').currentQuantity,'50 ea');
  assert.equal(r.state.boxes.at(-1).boxId,'IN-TARGET-B011');assert.equal(r.state.boxes.at(-1).additionalProductionNumber,1);
  assert.equal(r.state.boxes.at(-1).quantity,80);assert.equal(r.result.lossQuantity,20);
  assert.equal(r.state.boxes.reduce((n,b)=>n+b.quantity,0),before.boxes.reduce((n,b)=>n+b.quantity,0)-20);
  const dashboard=buildInventoryDashboard(r.state.records,r.state.boxes).rows;
  assert.equal(dashboard.find(row=>row.managementId==='IN-TARGET').currentBoxCount,'11 box');
  assert.equal(dashboard.find(row=>row.managementId==='IN-TARGET').currentTotalQuantity,'1,080 ea');
  assert.equal(dashboard.find(row=>row.managementId==='RAW').currentTotalQuantity,'50 ea');
  assert.equal(r.result.additionalProductionChanges.boxes.length,2);assert.equal(r.result.additionalProductionChanges.stock.length,2);
  assert.equal(r.changes.inbounds.upserts.length,0);assert.deepEqual(before,fixture());
});
test('응답 유실 후 같은 요청을 재시도해도 차감·생성하지 않으며 다른 내용 재사용은 막는다',()=>{
  const first=apply(fixture()),repeat=apply(first.state);
  assert.deepEqual(repeat.state,first.state);assert.equal(repeat.result.alreadyRegistered,true);
  assert.equal(repeat.changes.inventoryBoxes.upserts.length,0);
  assert.throws(()=>apply(first.state,{...payload(),boxQuantities:[70]}),/이미 처리/);
});
test('수량·상태·제품·대상 변경, 중복 원재고, 수량 불일치는 어떠한 재고도 바꾸지 않는다',()=>{
  const state=fixture(),before=structuredClone(state);
  for(const update of [{boxQuantities:[0]},{boxQuantities:[1.5]},{lossQuantity:-1},{lossQuantity:21},
    {sourceUses:[]},{sourceUses:[...payload().sourceUses,...payload().sourceUses]},
    {sourceUses:[{boxId:'RAW-1',quantity:100,expectedQuantity:149}]},{productId:'P2'},
    {productionDate:'2026-11-31'},{productionDate:'2026-11-14'},{requestId:''}])assert.throws(()=>apply(state,{...payload(),...update}));
  for(const status of ['출고완료','출고대기','폐기','보류','사용완료']){
    const changed=fixture();changed.boxes.at(-1).status=changed.boxes.at(-1).rawStatus=status;assert.throws(()=>apply(changed));
  }
  const other=fixture();other.boxes.at(-1).productId='P2';assert.throws(()=>apply(other));
  assert.deepEqual(state,before);
});
test('후속 생산은 번호가 겹치지 않으며 소진한 사출은 출고량으로 잡히지 않는다',()=>{
  const state=apply(fixture()).state;
  const p={...payload(),requestId:'request-23456789',boxQuantities:[20,25],lossQuantity:5,sourceUses:[{boxId:'RAW-1',quantity:50,expectedQuantity:50}]};
  const r=apply(state,p);
  assert.deepEqual(r.result.boxIds,['IN-TARGET-B012','IN-TARGET-B013']);
  assert.deepEqual(r.state.boxes.slice(-2).map(b=>b.additionalProductionNumber),[2,3]);
  assert.equal(r.state.boxes.find(b=>b.boxId==='RAW-1').rawStatus,'사용완료');
  assert.deepEqual(getAdditionalProductionSources(r.state,payload()),[]);
  assert.equal(buildInventoryDashboard(r.state.records,r.state.boxes).rows.find(row=>row.managementId==='RAW')?.shippedShippingBoxes.length || 0,0);
});
test('입고 수정·삭제로 추가 박스나 사출 차감을 되돌리지 않으며 비고 수정은 가능하다',()=>{
  const state=apply(fixture()).state;
  for(const managementId of ['IN-TARGET','RAW'])assert.throws(()=>applyMutation('deleteInbound',{managementId,productId:'P1'},state,now),/추가 생산/);
  assert.throws(()=>applyMutation('updateInbound',{...inbound,inboundBoxCount:11,boxQuantity:100},state,now),/추가 생산/);
  const r=applyMutation('updateInbound',{...inbound,boxQuantity:100,inboundBoxCount:10,note:'비고 수정'},state,now);
  assert.deepEqual(r.state.boxes,state.boxes);assert.equal(r.state.records[0].additionalProductionEvents.length,1);
});
test('추가 라벨은 추가 번호·실제 수량과 새 QR을 표시하며 원래 라벨의 박스 표기는 유지한다',()=>{
  const c=loadFunctions(adminSource,['renderInboundQrReferenceLabel','renderQrReferenceProcessRow'],{
    SeungjinQrLabel:globalThis.SeungjinQrLabel,escapeHtml:String,escapeAttribute:String,getInboundRecordRemainderQuantities:()=>[],parseShippingSettlementNumber:Number,formatNumber:String});
  const common={inbound,sequence:11,total:10,qrData:'NEW-QR',processData:{summary:'1도',processRows:[]},productName:'제품',inboundDate:'2026.11.13'};
  const html=c.renderInboundQrReferenceLabel({...common,box:{boxId:'NEW',isAdditionalProduction:true,additionalProductionNumber:1,currentQuantity:100}});
  assert.match(html,/추가 1 Box/);assert.match(html,/기준수량/);assert.doesNotMatch(html,/>잔량</);assert.match(html,/NEW-QR/);
  assert.match(c.renderInboundQrReferenceLabel({...common,sequence:1,box:{boxId:'OLD',currentQuantity:100}}),/1 \/ 10 Box/);
});
