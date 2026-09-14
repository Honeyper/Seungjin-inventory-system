import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const mobileSource = readFileSync(new URL('../frontend/mobile/mobile.js', import.meta.url), 'utf8');
function loadFunctions(source, names, globals) {
 const context = vm.createContext(globals);
 for (const name of names) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
 }
 return context;
}
import { applyMutation, ShippingStateConflict } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const managementId = 'IN-260911-KHE-0001-001';
const box = (number,status='보관') => ({boxId:`${managementId}-B00${number}`,managementId,productId:'KHE-0001',number,quantity:480,status,rawStatus:status,storage:'현장',shippingDate:status==='출고완료'?'2026-09-14':''});
function runtime() {
 const saved = [1,2,3,4].map(n=>({managementId,productId:'KHE-0001',scannedBox:box(n),scannedBoxId:box(n).boxId}));
 const app=loadFunctions(mobileSource,['syncPendingShippingRowsFromDashboard','getKnownBoxes','buildScannedBoxItem','getScannedBox','getShippingCompositeBoxKey','getBoxPickerBoxKey'],{
  state:{scannedShippingRows:saved,dashboard:[{managementId,productId:'KHE-0001',allShippingBoxes:[box(1,'출고완료'),box(2),box(3,'출고대기')],activeShippingBoxes:[box(2),box(3,'출고대기')]}]},
  getShippingKey:r=>r.scannedBoxId,normalizeScanValue:v=>String(v||'').trim(),normalizeText:v=>String(v||''),
  getEditableBoxQuantity:r=>r.scannedBox.quantity,setScannedBoxQuantity:(r,q)=>{r.scannedBox.quantity=q;r.scannedQuantityEdited=true;},saveScannedShippingRows:()=>{}
 });return app;
}
test('재시작 후 일반 스캔도 서버의 출고완료 상태와 수량으로 갱신한다',()=>{
 const app=runtime();const saved=app.state.scannedShippingRows[0];saved.scannedQuantityEdited=true;saved.scannedBox.quantity=300;
 app.syncPendingShippingRowsFromDashboard();assert.equal(saved.scannedBox.status,'출고완료');assert.equal(saved.scannedBox.quantity,480);assert.equal(saved.scannedQuantityEdited,false);
 assert.equal(app.state.scannedShippingRows.length,4);
});
test('미처리 박스의 수기 수량과 조회에서 찾지 못한 스캔은 보존한다',()=>{
 const app=runtime();const saved=app.state.scannedShippingRows[1];saved.scannedQuantityEdited=true;saved.scannedBox.quantity=320;
 app.state.scannedShippingRows[3].syncedFromPending=true;
 app.syncPendingShippingRowsFromDashboard();assert.equal(saved.scannedBox.quantity,320);assert.equal(saved.scannedQuantityEdited,true);
 assert.equal(app.state.scannedShippingRows.length,4);assert.equal(app.state.scannedShippingRows[2].scannedBox.status,'출고대기');
 app.syncPendingShippingRowsFromDashboard();assert.equal(app.state.scannedShippingRows.length,4);
});
test('다른 기기에서 완료된 출고대기 스캔도 삭제하지 않고 완료 상태를 반영한다',()=>{
 const app=runtime();app.state.scannedShippingRows[0].syncedFromPending=true;
 app.syncPendingShippingRowsFromDashboard();assert.equal(app.state.scannedShippingRows[0].scannedBox.status,'출고완료');assert.equal(app.state.scannedShippingRows[0].syncedFromPending,false);
});
test('완료 박스가 섞인 출고대기 요청은 전체를 보호하고 구체적인 상태 오류를 반환한다',()=>{
 const state={products:[],orders:[],inbounds:[],records:[],boxes:[box(1),box(2,'출고완료')]};const original=structuredClone(state);
 assert.throws(()=>applyMutation('updateShippingStatus',{managementId,productId:'KHE-0001',selectedBoxes:[1,2],status:'출고대기'},state),error=> error instanceof ShippingStateConflict && /2번 박스.*출고완료.*2026-09-14/.test(error.message));
 assert.deepEqual(state,original);
});
test('보관 박스의 출고대기 등록과 동일 요청 재시도는 정상 처리된다',()=>{
 const state={products:[],orders:[],inbounds:[],records:[],boxes:[box(1)]};const payload={managementId,productId:'KHE-0001',selectedBoxes:[1],status:'출고대기'};
 const first=applyMutation('updateShippingStatus',payload,state);const retry=applyMutation('updateShippingStatus',payload,first.state);
 assert.equal(first.result.updatedBoxRows,1);assert.equal(retry.result.updatedBoxRows,1);assert.equal(retry.state.boxes[0].quantity,480);
});
