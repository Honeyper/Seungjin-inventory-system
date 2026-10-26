import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {applyMutation, buildInventoryDashboard} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const now = new Date('2026-10-26T06:00:00Z');
const names = ['애프리콧','그레이프','시나몬'];
function fixture() {return {products:[{productId:'P',productName:'누니 공용용기',isCommonContainer:true,shippingProductNames:names}],orders:[],inbounds:[],records:[{recordKey:'IN|P|D-2',managementId:'IN',productId:'P',storage:'D-2',inboundTotalQuantity:'6,240 ea'}],boxes:[1,2].map(number=>({boxId:`B${number}`,number,managementId:'IN',productId:'P',quantity:3120,currentQuantity:'3,120 ea',status:'출고대기',rawStatus:'출고대기',storage:'D-2',qrData:`original-qr-${number}`,qrGeneratedAt:'2026-10-20'}))};}
function ship(state, products, options={}) {
 const source=state.boxes.find(box=>box.boxId==='B1');
 const quantity=products.reduce((s,p)=>s+p.quantity,0);
 return {managementId:'IN',productId:'P',selectedBoxIds:['B1'],selectedBoxes:[1],status:'출고완료',shipper:'작업자',shippingType:'정상출고',commonContainerPartialShipment:true,commonContainerShipmentId:options.id||'shipment-0001',boxQuantities:{1:quantity},shippingAllocations:[{boxId:'B1',expectedQuantity:source.quantity,expectedShippingUpdatedAt:source.shippingUpdatedAt||'',products}],...options};
}
function apply(state,payload) {return applyMutation('updateShippingStatus',payload,state,now);}
function quantity(state) {return state.boxes.reduce((sum,box)=>sum+box.quantity,0);}
function row(state) {return buildInventoryDashboard(state.records,state.boxes,state.products,now).rows[0];}
test('3120개 원래 박스에서 1200개 출고하면 원래 QR에 1920개가 남고 제품별 이력을 저장한다',()=>{
 const state=fixture(),before=structuredClone(state),p=ship(state,[{productName:'애프리콧',quantity:1200}]);
 const saved=apply(state,p),source=saved.state.boxes.find(b=>b.boxId==='B1'),shipment=saved.result.shippedBoxes[0];
 assert.equal(source.quantity,1920);assert.equal(source.qrData,'original-qr-1');assert.equal(source.status,'출고대기');
 assert.equal(shipment.quantity,1200);assert.equal(shipment.sourceBoxId,'B1');assert.equal(shipment.sourceBoxNumber,1);assert.equal(shipment.qrData,'');assert.equal(shipment.status,'출고완료');assert.deepEqual(shipment.shippingAllocations,[{productName:'애프리콧',quantity:1200}]);
 assert.equal(row(saved.state).currentTotalQuantity,'5,040 ea');assert.equal(row(saved.state).currentBoxCount,'2 box');assert.equal(row(saved.state).shippedShippingBoxes.length,1);assert.equal(row(saved.state).qrPrintStatus,'QR 생성');
 assert.equal(quantity(saved.state),6240);assert.deepEqual(state,before);
 assert.equal(saved.result.remainingBoxes[0].quantity,1920);assert.equal(saved.result.commonContainerBoxChanges.upserts.length,2);
});
test('같은 박스에서 여러 제품 출고 후 잔량을 재출고해도 재고와 제품별 합계가 보존된다',()=>{
 let state=fixture();state=apply(state,ship(state,[{productName:'애프리콧',quantity:1200},{productName:'그레이프',quantity:585}])).state;
 assert.equal(state.boxes[0].quantity,1335);
 state=apply(state,ship(state,[{productName:'시나몬',quantity:1335}],{commonContainerShipmentId:'shipment-0002'})).state;
 assert.equal(state.boxes[0].quantity,0);assert.equal(quantity(state),6240);assert.equal(row(state).currentBoxCount,'1 box');assert.equal(row(state).currentTotalQuantity,'3,120 ea');
 assert.equal(row(state).shippedShippingBoxes.reduce((s,b)=>s+b.quantity,0),3120);
 assert.throws(()=>apply(state,ship(state,[{productName:'애프리콧',quantity:1}],{commonContainerShipmentId:'shipment-0003'})));
 // Cancel either earlier or final shipment in any order, without reviving already shipped quantities.
 for(const shipment of [...state.boxes.filter(b=>b.sourceBoxId)].reverse()) {
  const result=apply(state,{managementId:'IN',productId:'P',selectedBoxIds:[shipment.boxId],status:'보관',allowCancelCompleted:true});
  assert.deepEqual(result.changes.inventoryBoxes.deletes,[shipment.boxId]);state=result.state;assert.equal(quantity(state),6240);
 }
 assert.equal(state.boxes[0].quantity,3120);assert.equal(row(state).currentTotalQuantity,'6,240 ea');assert.equal(state.boxes.length,2);
 assert.equal(state.boxes[0].commonContainerShippingHistory.filter(h=>h.action==='출고취소').length,2);
});
test('재시도·오래된 잔량·상태 변경·초과 수량·위조 제품을 전체 거절한다',()=>{
 const state=fixture(),p=ship(state,[{productName:'애프리콧',quantity:1200}]),saved=apply(state,p).state,before=structuredClone(saved);
 assert.throws(()=>apply(saved,p),/변경|이미/);assert.deepEqual(saved,before);
 const stale=ship(saved,[{productName:'애프리콧',quantity:1200}]);stale.shippingAllocations[0].expectedShippingUpdatedAt='old';assert.throws(()=>apply(saved,stale),/변경/);
 for(const products of [[{productName:'애프리콧',quantity:4000}],[{productName:'없는 제품',quantity:100}],[{productName:'애프리콧',quantity:0}],[{productName:'애프리콧',quantity:1.5}],[{productName:'애프리콧',quantity:1},{productName:'애프리콧',quantity:2}]]) assert.throws(()=>apply(state,ship(state,products)));
 const ordinary=fixture();ordinary.products[0].isCommonContainer=false;assert.throws(()=>apply(ordinary,p),/설정/);
 for(const status of ['출고완료','폐기','보류']) {const locked=fixture();locked.boxes[0].status=status;locked.boxes[0].rawStatus=status;assert.throws(()=>apply(locked,ship(locked,[{productName:'애프리콧',quantity:100}])));}
 const noInspection=fixture();noInspection.boxes[0].status=noInspection.boxes[0].rawStatus='보관';assert.throws(()=>apply(noInspection,ship(noInspection,[{productName:'애프리콧',quantity:100}])),/검수/);
 assert.equal(apply(noInspection,ship(noInspection,[{productName:'애프리콧',quantity:100}],{forceCompleteShipping:true,autoShippingInspection:true,inspectionQuantity:63})).result.shippedBoxes[0].inspectionQuantity,63);
});
test('여러 원래 박스 출고는 한 트랜잭션으로 저장하고 실패하면 원본을 바꾸지 않는다',()=>{
 const state=fixture(),p=ship(state,[{productName:'애프리콧',quantity:1080}]);p.selectedBoxes=[1,2];p.selectedBoxIds=['B1','B2'];p.boxQuantities[2]=1710;p.shippingAllocations.push({boxId:'B2',expectedQuantity:3120,expectedShippingUpdatedAt:'',products:[{productName:'그레이프',quantity:1710}]});
 const result=apply(state,p);assert.deepEqual(result.result.remainingBoxes.map(b=>b.quantity),[2040,1410]);assert.equal(new Set(result.state.boxes.map(b=>b.number)).size,4);assert.equal(quantity(result.state),6240);
 p.shippingAllocations[1].products[0].quantity=9999;const before=structuredClone(state);assert.throws(()=>apply(state,p));assert.deepEqual(state,before);
});
test('부분출고 취소 재시도는 원래 박스 수량을 두 번 늘리지 않는다',()=>{
 const state=fixture(),saved=apply(state,ship(state,[{productName:'애프리콧',quantity:1200}])).state,shipment=saved.boxes.find(b=>b.sourceBoxId);
 const p={managementId:'IN',productId:'P',selectedBoxIds:[shipment.boxId],status:'보관',allowCancelCompleted:true};
 const cancelled=apply(saved,p).state;assert.equal(cancelled.boxes[0].quantity,3120);assert.throws(()=>apply(cancelled,p));assert.equal(cancelled.boxes[0].quantity,3120);
});
test('구형 수량 편집이나 출고대기 등록으로 공용용기 잔량을 유실시키지 않는다',()=>{
 const state=fixture();for(const status of ['출고대기','출고완료']) assert.throws(()=>apply(state,{managementId:'IN',productId:'P',selectedBoxes:[1],status,boxQuantities:{1:1200}}),/수량이 변경/);
});
test('모바일은 출고 후 원래 박스를 완료 처리하지 않고 서버가 반환한 잔량을 즉시 반영한다',()=>{
 const js=readFileSync(new URL('../frontend/mobile/mobile.js',import.meta.url),'utf8'),start=js.indexOf('function markShippingItemsCompleted('),code=js.slice(start,js.indexOf('\n}',start)+2);
 const item={scannedBox:{boxId:'B1',quantity:3120,status:'출고대기'}};
 const ctx=vm.createContext({getSuccessfulShippingRows:items=>items,getScannedBox:item=>item.scannedBox,setScannedBoxQuantity:(item,q)=>{item.scannedBox.quantity=q;item.currentTotalQuantity=q;}});vm.runInContext(code,ctx);
 ctx.markShippingItemsCompleted([item],[],[{boxId:'B1',quantity:1920,status:'출고대기',rawStatus:'출고대기'}]);assert.equal(item.scannedBox.quantity,1920);assert.equal(item.stockStatus,'출고대기');assert.equal(item.scannedQuantityEdited,false);
});

test('시트 재실행은 확정된 잔량과 출고 기록을 중복 없이 반영하고 취소하면 복구한다',()=>{
 const src=readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8'),start=src.indexOf('function replayCommonContainerBoxChanges_('),code=src.slice(start,src.indexOf('\n}',start)+2);
 const headers=['박스ID','관리ID','제품명','제품ID','박스순번','현재 수량','상태','출고유형','출고일','출고시간','출고자','출고 수정일시','출고 검수일','출고 검수시간','출고 검수자','출고 검수 수량','불량 수량','불량 사유','불량률','박스당 수량','QR 데이터','QR 생성 여부','QR 생성 일시','비고'];
 const rowFor=(id,n)=>headers.map(h=>({'박스ID':id,'관리ID':'IN','제품명':'누니 공용용기','제품ID':'P','박스순번':n,'현재 수량':'3,120 ea','상태':'출고대기','QR 데이터':`original-qr-${n}`}[h]||''));
 let rows=[headers.slice(),rowFor('B1',1),rowFor('B2',2)],status='';
 const sheet={getDataRange:()=>({getDisplayValues:()=>rows.map(row=>[...row])}),getLastRow:()=>rows.length,deleteRow:n=>rows.splice(n-1,1),getRange:(r,c,n=1,w=1)=>({setValue:v=>{rows[r-1]??=[];rows[r-1][c-1]=v;},setValues:values=>{values.forEach((row,i)=>{rows[r-1+i]??=[];row.forEach((v,j)=>rows[r-1+i][c-1+j]=v);});}})};
 const ctx=vm.createContext({CONFIG:{SHEETS:{BOX_DB:'boxes',STOCK_DB:'stock'},SHEET_IDS:{}},getSheetByNameOrId_:()=>sheet,
 findHeaderRow_:values=>({rowIndex:0,headers:values[0]}),indexHeaders_:headers=>headers,
 findHeaderIndex_:(headers,names)=>headers.findIndex(h=>names.includes(h)),findShippingTypeHeaderIndex_:headers=>headers.indexOf('출고유형'),
 setRowValue_:(row,headers,names,value)=>{const i=headers.findIndex(h=>names.includes(h));if(i>=0)row[i]=value;},ensureSheetWriteCapacity_:()=>{},formatEa_:n=>`${n.toLocaleString('en-US')} ea`,updateStockStatusRows_:(s,id,value)=>{status=value;},SpreadsheetApp:{flush:()=>{}}});
 vm.runInContext(code,ctx);
 const initial=fixture(),saved=apply(initial,ship(initial,[{productName:'애프리콧',quantity:1200}]));
 ctx.replayCommonContainerBoxChanges_({managementId:'IN'},saved.result);ctx.replayCommonContainerBoxChanges_({managementId:'IN'},saved.result);
 assert.equal(rows.length,4);const ci=h=>rows[0].indexOf(h);assert.equal(rows[1][ci('현재 수량')],'1,920 ea');assert.equal(rows[3][ci('현재 수량')],'1,200 ea');assert.equal(rows[1][ci('QR 데이터')],'original-qr-1');assert.equal(rows[3][ci('QR 데이터')],'');assert.equal(status,'일부 출고');
 const shipment=saved.result.shippedBoxes[0],cancelled=apply(saved.state,{managementId:'IN',productId:'P',selectedBoxIds:[shipment.boxId],status:'보관',allowCancelCompleted:true});
 ctx.replayCommonContainerBoxChanges_({managementId:'IN'},cancelled.result);ctx.replayCommonContainerBoxChanges_({managementId:'IN'},cancelled.result);
 assert.equal(rows.length,3);assert.equal(rows[1][ci('현재 수량')],'3,120 ea');assert.equal(status,'출고대기');
 assert.equal(JSON.parse(rows[1][ci('공용용기 출고 정보')]).commonContainerShippingHistory.at(-1).action,'출고취소');
});
