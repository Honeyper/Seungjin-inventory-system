import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMutation, buildInventoryDashboard } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const policy=globalThis.SeungjinInventoryConfirmation;
const now=new Date('2026-09-30T01:00:00Z');
const record={managementId:'IN-A',productId:'P1',productName:'조사 제품',storage:'A-1',inboundDate:'2026-09-29',inboundTime:'12:00'};
const box=(number,extra={})=>({...record,boxId:`IN-A-B${number}`,number,quantity:100,status:'보관',lastInventoryCheckedAt:'2026-09-29 12:00',inventoryConfirmationSource:'inbound',...extra});
const initial=()=>({products:[],orders:[],inbounds:[],records:[record],boxes:[box(1),box(2),box(3)]});
const payload={managementId:'IN-A',productId:'P1',selectedBoxes:['1'],currentStorage:'A-1',targetStorage:'B-1',inventorySurveyId:'survey-test-one',surveyRegisteredBoxes:['1'],userName:'조사자'};
const move=(state,p=payload)=>applyMutation('updateInventoryBoxMove',p,state,now);

test('이동 박스는 확인 완료, 같은 입고 미등록 박스는 미확인 및 위치 미지정으로 저장한다',()=>{
 const result=move(initial()); const [a,b,c]=result.state.boxes;
 assert.equal(a.storage,'B-1'); assert.equal(policy.isConfirmed(a,now),true);
 for(const x of [b,c]) {assert.equal(x.storage,'미지정'); assert.equal(x.inventoryLastKnownStorage,'A-1'); assert.equal(policy.isConfirmed(x,now),false); assert.equal(x.lastInventoryCheckedAt,'2026-09-29 12:00');}
 assert.equal(result.changes.inventoryBoxes.upserts.length,3);
 const dash=buildInventoryDashboard(result.state.records,result.state.boxes,[],now);
 assert.equal(dash.attention.physicalMissingCount,2);
 assert.equal(dash.locationBoxStats.find(x=>x.label==='B-1').value,1);
 assert.equal(dash.locationBoxStats.find(x=>x.label==='미지정').value,2);
 assert.equal(dash.attention.unspecifiedStorageCount,1);
 assert.equal(dash.rows[0].currentTotalQuantity,'300 ea');
});
test('새로고침과 입고 자동 확인은 명시적 미확인을 되돌리지 않는다',()=>{
 const b=move(initial()).state.boxes[1];
 assert.equal(policy.withInboundConfirmation({...b,lastInventoryCheckedAt:''},record).lastInventoryCheckedAt,'');
 assert.equal(policy.isConfirmed(policy.withInboundConfirmation(b,record),now),false);
});
test('같은 조사에서 나누어 처리한 박스와 이미 등록된 박스는 초기화하지 않는다',()=>{
 let state=move(initial(),{...payload,surveyRegisteredBoxes:['1','2']}).state;
 assert.equal(state.boxes[1].storage,'A-1');
 state=move(state,{...payload,selectedBoxes:['2'],surveyRegisteredBoxes:['2'],targetStorage:'C-1'}).state;
 assert.equal(state.boxes[0].storage,'B-1'); assert.equal(policy.isConfirmed(state.boxes[0],now),true);
 assert.equal(state.boxes[1].storage,'C-1'); assert.equal(state.boxes[2].storage,'미지정');
 // A separate investigation can deliberately mark the previous boxes missing.
 state=move(state,{...payload,inventorySurveyId:'survey-test-two',selectedBoxes:['2'],surveyRegisteredBoxes:['2']}).state;
 assert.equal(state.boxes[0].storage,'미지정');
});
test('다른 입고 건, 출고대기, 출고완료, 보류, 폐기는 변경하지 않는다',()=>{
 const state=initial();
 state.boxes.push(box(4,{status:'출고대기'}),box(5,{status:'출고완료'}),box(6,{status:'보류'}),box(7,{status:'폐기'}),box(1,{boxId:'OTHER-B1',managementId:'IN-OTHER'}));
 const before=structuredClone(state.boxes.slice(3));
 assert.deepEqual(move(state).state.boxes.slice(3),before);
});
test('이동 검증 실패 시 미등록 박스의 위치와 확인 상태도 바뀌지 않는다',()=>{
 const state=initial();state.boxes[0].status='출고대기';const before=structuredClone(state);
 assert.throws(()=>move(state),/변경할 수 없는 상태/);assert.deepEqual(state,before);
});
test('기존 이동 및 전량 이동 요청에는 조사 초기화를 적용하지 않는다',()=>{
 const {inventorySurveyId,surveyRegisteredBoxes,...legacy}=payload;
 const result=move(initial(),{...legacy,moveAllBoxes:true});
 assert.equal(result.state.boxes[1].storage,'A-1');assert.equal(policy.isConfirmed(result.state.boxes[1],now),true);
});
