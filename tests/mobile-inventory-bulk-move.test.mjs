import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../frontend/mobile/mobile.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const box = (number, storage = 'A-1', status = '보관') => ({ number, storage, status, quantity: 100 });
const lot = (managementId, boxes) => ({ managementId, productId: 'P1', productName: '같은 용기', clientName: '거래처', allShippingBoxes: boxes });
function runtime() {
  const requests = [];
  const app = vm.createContext({
    crypto: {randomUUID:()=> 'survey-test-runtime'},
    state: { inventoryMoveDestinationMode: 'bulk', inventoryMoveBulkStorage: 'C-1', scannedMoveRows: [], dashboard: [], user: {name:'테스트'} },
    requestApi: async (action, payload) => { requests.push(plain(payload)); return { updatedBoxRows: payload.selectedBoxes.length }; },
    applyInventoryMoveResultLocally() {}, applyInventoryStockResultLocally() {},
    renderInventoryMoveList() {}, renderScannerScannedList() {}, closeScanner() {},
    updateScannerActionLabels() {}, saveScannedMoveRows() {}, triggerScanFeedback() {},
    loadShippingDashboard() {}, showToast() {}, elements: {}, SCAN_COMPLETE_VIBRATION: []
  });
  for (const name of ['applyInventoryMoveBulkStorage','getInventoryMoveBatchItems','groupScannedInventoryMoveRows',
    'buildInventoryMoveItem','buildScannedBoxItem','getInventoryMoveCurrentStorage','getInventoryMoveProductGroupKey',
    'getKnownBoxes','getMovableBoxes','getBoxCurrentQuantity','getScannedBox','getSelectedBoxNumbers',
    'normalizeScanValue','normalizeDisplay','normalizeText','parseNumber','isInventoryMoveTargetReady',
    'getInventoryMoveAllBoxNumbers','getInventoryMoveSurveyPayload','completeInventoryMoveItem','completeInventoryMoveItems','handleCompleteScannedInventoryMove']) {
    const fn = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?\\n\\}`, 'm'));
    assert.ok(fn, name);
    vm.runInContext(fn[0], app);
  }
  return { app, requests };
}
function scan(app, record, number) {
  const row = app.buildInventoryMoveItem(record, record.allShippingBoxes.find(b => b.number === number), {}, 'QR');
  app.state.scannedMoveRows.push(row);
  return row;
}

test('선택 이동은 스캔 박스만 포함하고 새 스캔에도 공통 목적지를 적용한다', async () => {
  const {app, requests} = runtime();
  const a = lot('IN-1', [box(1),box(2)]);
  const b = lot('IN-2', [box(1,'B-1'),box(2,'B-1')]);
  app.state.dashboard = [a,b];
  scan(app,a,1);
  app.applyInventoryMoveBulkStorage();
  scan(app,b,2);
  const items = app.getInventoryMoveBatchItems('single');
  await app.completeInventoryMoveItems(items,'single');
  assert.deepEqual(requests.map(p => [p.managementId,p.selectedBoxes,p.targetStorage,p.moveAllBoxes]), [
    ['IN-1',['1'],'C-1',false],['IN-2',['2'],'C-1',false]
  ]);
});

test('전량 이동은 같은 입고 관리 ID의 다른 위치도 포함하며 중복 스캔을 한 번만 처리한다', async () => {
  const {app,requests} = runtime();
  const a=lot('IN-1',[box(1),box(2),box(3,'B-1')]);
  app.state.dashboard=[a,lot('IN-OTHER',[box(1)])];
  scan(app,a,1); scan(app,a,2);
  const items=app.getInventoryMoveBatchItems('all');
  await app.completeInventoryMoveItems(items,'all');
  assert.deepEqual(requests.map(p=>[p.managementId,p.currentStorage,p.selectedBoxes,p.moveAllBoxes]),[
    ['IN-1','A-1',['1','2'],false],['IN-1','B-1',['3'],false]
  ]);
});

test('전량 이동에서 이미 목적지에 있는 박스와 변경 불가 상태는 제외한다', () => {
  const {app}=runtime();
  const a=lot('IN-1',[box(1),box(2,'C-1'),box(3,'A-1','출고완료'),box(4,'A-1','폐기'),box(5,'A-1','출고대기'),box(6,'A-1','보류')]);
  app.state.dashboard=[a]; scan(app,a,1);
  assert.deepEqual(plain(app.getInventoryMoveBatchItems('all').flatMap(app.getSelectedBoxNumbers)),['1']);
});

test('목적지 미선택은 제출을 막고 개별 모드 목적지는 공통 값으로 덮어쓰지 않는다', async () => {
  const {app,requests}=runtime();
  const a=lot('IN-1',[box(1)]); const row=scan(app,a,1);
  app.state.inventoryMoveBulkStorage='';
  const items=app.getInventoryMoveBatchItems('single');
  await assert.rejects(app.completeInventoryMoveItem(items[0],['1'],'single'),/장소/);
  assert.equal(requests.length,0);
  app.state.inventoryMoveDestinationMode='individual';
  row.targetStorage='B-1'; row.targetStorageConfirmed=true;
  app.state.inventoryMoveBulkStorage='C-1';
  app.applyInventoryMoveBulkStorage();
  assert.equal(app.getInventoryMoveBatchItems('single')[0].targetStorage,'B-1');
});

test('확인창에서 검토한 박스만 제출하고 부분 실패한 다른 위치의 박스도 재시도 목록에 남긴다', async () => {
  const {app,requests}=runtime();
  const a=lot('IN-1',[box(1),box(2,'B-1')]);
  app.state.dashboard=[a]; scan(app,a,1);
  app.state.confirmedInventoryMoveItems=app.getInventoryMoveBatchItems('all');
  a.allShippingBoxes.push(box(3)); // Not part of the confirmation.
  app.requestApi=async (_action,payload)=>{
    requests.push(plain(payload));
    if(payload.currentStorage==='B-1') throw Error('network');
    return {updatedBoxRows:payload.selectedBoxes.length};
  };
  await app.handleCompleteScannedInventoryMove('all');
  assert.deepEqual(requests.map(p=>p.selectedBoxes),[['1'],['2']]);
  assert.deepEqual(plain(app.state.scannedMoveRows.map(row=>row.scannedBox.number)),[2]);
});

test('같은 위치 지정은 선택 박스 조사에 포함하고 전량 이동에서는 제외한다', async () => {
  const {app,requests}=runtime();
  const a=lot('IN-1',[box(1,'C-1')]); app.state.dashboard=[a]; scan(app,a,1);
  const items=app.getInventoryMoveBatchItems('single');
  assert.equal(items.length,1);
  await app.completeInventoryMoveItems(items,'single');
  assert.equal(requests[0].targetStorage,'C-1');
  assert.equal(requests[0].currentStorage,'C-1');
  assert.ok(requests[0].inventorySurveyId);
  assert.equal(app.getInventoryMoveBatchItems('all').length,0);
});
