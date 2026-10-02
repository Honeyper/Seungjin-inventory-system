import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyMutation, buildInventoryDashboard} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const source=fs.readFileSync(new URL('../frontend/mobile/mobile.js',import.meta.url),'utf8');
const extract=name=>source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?\\n\\}`,'m'))[0];
function fixture(quantity=320,status='출고완료') {
 const record={managementId:'IN-QR',productId:'P-QR',storage:'A',inboundTotalQuantity:'640 ea'};
 const box={...record,boxId:'IN-QR-B001',number:1,quantity,status,rawStatus:status,shippingDate:'2026-09-17',shippingTime:'10:00',shippingType:'정상출고',shippingUpdatedAt:'2026-09-17 10:00:00',shipper:'작업자',inspectionQuantity:20,defectQuantity:1,defectPhotoFolderUrl:'photo',note:'기존 메모'};
 return {products:[],orders:[],inbounds:[],records:[record],boxes:[box,{...box,boxId:'IN-QR-B002',number:2}]};
}
function payload(box,quantity=box.quantity){return {managementId:box.managementId,productId:box.productId,selectedBoxes:[1],selectedBoxIds:[box.boxId],status:'출고대기',allowReopenCompleted:true,userName:'테스터',boxQuantities:{1:quantity},expectedCompletedBox:{boxId:box.boxId,quantity:box.quantity,rawStatus:box.rawStatus,shippingDate:box.shippingDate,shippingUpdatedAt:box.shippingUpdatedAt,shippingType:box.shippingType}};}
test('confirmed completed QR reopens exactly one box atomically and archives the old shipment',()=>{
 const db=fixture();const req=payload(db.boxes[0]);const r=applyMutation('updateShippingStatus',req,db);
 const b=r.state.boxes[0];assert.equal(b.status,'출고대기');assert.equal(b.quantity,320);assert.equal(b.shippingDate,'');assert.equal(b.shippingType,'');assert.equal(b.inspectionQuantity,0);
 assert.deepEqual(r.state.boxes[1],db.boxes[1]);assert.equal(db.boxes[0].status,'출고완료');
 assert.equal(b.shippingReopenHistory.length,1);assert.equal(b.shippingReopenHistory[0].shippingDate,'2026-09-17');assert.equal(b.shippingReopenHistory[0].quantity,320);assert.equal(b.shippingReopenHistory[0].defectPhotoFolderUrl,'photo');assert.match(b.note,/기존 메모[\s\S]*출고대기 재등록/);
 assert.equal(buildInventoryDashboard(r.state.records,r.state.boxes).rows[0].currentTotalQuantity,'320 ea');
 const shipped=applyMutation('updateShippingStatus',{managementId:'IN-QR',productId:'P-QR',selectedBoxes:[1],status:'출고완료',shippingDate:'2026-09-18',shipper:'새 작업자'},r.state);
 assert.equal(shipped.state.boxes[0].status,'출고완료');assert.equal(shipped.state.boxes[0].shippingReopenHistory.length,1);assert.equal(shipped.state.boxes[0].shippingDate,'2026-09-18');
});
test('no explicit confirmation, stale shipment, discarded boxes and mixed selections never mutate stock',()=>{
 const db=fixture();const req=payload(db.boxes[0]);
 for(const patch of [{allowReopenCompleted:false},{expectedCompletedBox:null},{selectedBoxes:[1,2],selectedBoxIds:[]}])assert.throws(()=>applyMutation('updateShippingStatus',{...req,...patch},db));
 for(const patch of [{shippingDate:'2026-09-18'},{shippingUpdatedAt:'later'},{quantity:319},{status:'출고대기',rawStatus:'출고대기'},{status:'폐기',rawStatus:'폐기'}]){const changed=structuredClone(db);Object.assign(changed.boxes[0],patch);const before=structuredClone(changed);assert.throws(()=>applyMutation('updateShippingStatus',req,changed));assert.deepEqual(changed,before);}
});
test('zero-quantity adjustments require actual quantity; positive shipped quantities are preserved',()=>{
 const db=fixture(0,'출고완료(재고조정)');for(const q of [0,-1,1.5])assert.throws(()=>applyMutation('updateShippingStatus',payload(db.boxes[0],q),db));
 const r=applyMutation('updateShippingStatus',payload(db.boxes[0],57),db);assert.equal(r.state.boxes[0].quantity,57);assert.equal(r.state.boxes[0].shippingReopenHistory[0].quantity,0);
 const normal=fixture();assert.throws(()=>applyMutation('updateShippingStatus',payload(normal.boxes[0],640),normal));
});
function clientRuntime(answer,{quantity=320,fail=false}={}){
 let db=fixture(quantity);const item={...db.records[0],productName:'제품',scannedBox:db.boxes[0],scannedBoxId:db.boxes[0].boxId,shippedShippingBoxes:db.boxes};let requests=0;
 const h=vm.createContext({state:{user:{name:'테스터'},activeWorkflow:'shipping',hardwareScannerSession:3,dashboard:[],scannedShippingRows:[item],scannerSessionShippingKeys:[item.scannedBoxId]},getScannedBox:i=>i.scannedBox,parseNumber:Number,formatNumber:String,getKnownBoxes:r=>r.allShippingBoxes||r.shippedShippingBoxes||[],getShippingKey:i=>i.scannedBoxId,setScannerHelp(){},invalidateShippingDashboardRead(){},saveDashboardCache(){},confirmCompletedShippingScan:()=>answer,
 requestApi:async(action,p)=>{requests++;if(fail)throw Error('network');const r=applyMutation(action,JSON.parse(JSON.stringify(p)),db);db=r.state;return r.result;}});
 vm.runInContext(extract('patchReopenedShippingDashboard')+extract('reopenCompletedShippingScan'),h);return {h,item,requests:()=>requests,db:()=>db};
}
test('canceling confirmation performs no write and leaves the scanned list unchanged',async()=>{
 const h=clientRuntime(null);assert.equal(await h.h.reopenCompletedShippingScan(h.item),null);assert.equal(h.requests(),0);assert.equal(h.h.state.scannedShippingRows[0].scannedBox.status,'출고완료');
});
test('confirmation is awaited and successful pending scan replaces old completed row without stale shipped membership',async()=>{
 let resolve;const h=clientRuntime(new Promise(r=>resolve=r));const pending=h.h.reopenCompletedShippingScan(h.item);assert.equal(h.requests(),0);resolve(320);const row=await pending;
 assert.equal(h.requests(),1);assert.equal(row.scannedBox.status,'출고대기');assert.equal(row.shippedShippingBoxes.length,1);assert.equal(h.h.state.scannedShippingRows[0],row);assert.equal(h.h.state.scannerSessionShippingKeys.length,0);
});
test('failed request and changed user during confirmation do not locally reopen the box',async()=>{
 const h=clientRuntime(320,{fail:true});await assert.rejects(h.h.reopenCompletedShippingScan(h.item),/network/);assert.equal(h.h.state.scannedShippingRows[0].scannedBox.status,'출고완료');
 let resolve;const stale=clientRuntime(new Promise(r=>resolve=r));const p=stale.h.reopenCompletedShippingScan(stale.item);stale.h.state.user={name:'other'};resolve(320);assert.equal(await p,null);assert.equal(stale.requests(),0);
});
test('acknowledged reopening keeps the next scan local even if a dashboard read would remain pending',async()=>{
 const runtime=clientRuntime(320);const h=runtime.h;
 h.state.dashboard=[{...runtime.item,allShippingBoxes:runtime.db().boxes,activeShippingBoxes:[]}];
 h.state.dashboardLoadedAt=Date.now();h.state.dashboardStateVersion=100;
 h.dashboardQrIndex={rows:h.state.dashboard};
 let reads=0;h.loadShippingDashboard=()=>{reads++;return new Promise(()=>{});};
 vm.runInContext(extract('invalidateShippingDashboardRead')+extract('ensureDashboardLoaded'),h);
 const reopened=await h.reopenCompletedShippingScan(runtime.item);
 await h.ensureDashboardLoaded();
 assert.equal(reads,0);assert.ok(h.state.dashboardLoadedAt>0);assert.equal(h.state.dashboardStateVersion,null);
 assert.equal(h.state.shippingMutationRevision,1);assert.equal(h.dashboardQrIndex,null);
 const row=h.state.dashboard[0];assert.equal(row.activeShippingBoxes.length,1);assert.equal(row.shippedShippingBoxes.length,1);
 assert.equal(row.allShippingBoxes[0].status,'출고대기');assert.equal(row.allShippingBoxes[1].status,'출고완료');
 assert.equal(row.currentTotalQuantity,'320 ea');assert.equal(row.currentBoxCount,'1 box');
 assert.equal(reopened.allShippingBoxes[0].status,'출고대기');assert.equal(reopened.scannedBox.inspectionQuantity,0);
 assert.equal(reopened.scannedBox.defectPhotoFolderUrl,'');
});
test('reopening invalidates an older dashboard response and refresh still fetches unrelated server changes',async()=>{
 const runtime=clientRuntime(320);const h=runtime.h;
 h.state.dashboard=[{...runtime.item,allShippingBoxes:runtime.db().boxes,activeShippingBoxes:[]}];
 h.state.dashboardLoadedAt=Date.now();h.state.dashboardStateVersion=100;
 h.window={SeungjinDataGateway:{canRead:()=>true}};h.dashboardQrIndex=null;
 const reads=[];const mutation=h.requestApi;
 h.requestApi=(action,p)=>action==='updateShippingStatus'?mutation(action,p):new Promise(resolve=>reads.push({action,resolve}));
 h.getDashboardStateVersion=v=>Number(v);h.applyShippingFilters=()=>{};h.expandMobileDashboard=d=>d.rows;
 h.syncPendingShippingRowsFromDashboard=()=>{};h.syncScannedMoveRowsFromDashboard=()=>{};
 vm.runInContext(extract('loadShippingDashboard')+extract('invalidateShippingDashboardRead'),h);
 const old=h.loadShippingDashboard({silent:true});reads[0].resolve({stateVersion:101});
 await new Promise(setImmediate);assert.equal(reads[1].action,'getInventoryDashboard');
 await h.reopenCompletedShippingScan(runtime.item);
 reads[1].resolve({rows:[{...runtime.item,allShippingBoxes:runtime.db().boxes.map(b=>({...b,status:'출고완료'}))}]});
 assert.equal(await old,false);assert.equal(h.state.dashboard[0].allShippingBoxes[0].status,'출고대기');
 const refreshed=h.loadShippingDashboard({silent:true});reads[2].resolve({stateVersion:102});
 await new Promise(setImmediate);assert.equal(reads[3].action,'getInventoryDashboard');
 reads[3].resolve({rows:[{managementId:'OTHER',currentTotalQuantity:'999 ea'}]});
 assert.equal(await refreshed,true);assert.equal(h.state.dashboard[0].managementId,'OTHER');
});
test('same box number in another inbound stays unchanged and zero stock can reopen with actual quantity',async()=>{
 const runtime=clientRuntime(57,{quantity:0});const h=runtime.h;
 const other={...runtime.item,managementId:'OTHER',allShippingBoxes:[{...runtime.db().boxes[0],boxId:'OTHER-B001',managementId:'OTHER'}]};
 h.state.dashboard=[{...runtime.item,allShippingBoxes:runtime.db().boxes,activeShippingBoxes:[]},other];
 await h.reopenCompletedShippingScan(runtime.item);
 assert.equal(h.state.dashboard[0].currentTotalQuantity,'57 ea');assert.equal(h.state.dashboard[0].activeShippingBoxes[0].quantity,57);
 assert.equal(h.state.dashboard[1],other);assert.equal(other.allShippingBoxes[0].status,'출고완료');
});
test('changing users during the save does not patch the next user dashboard',async()=>{
 const runtime=clientRuntime(320);const h=runtime.h;
 const dashboard=[{...runtime.item,allShippingBoxes:runtime.db().boxes,activeShippingBoxes:[]}];
 h.state.dashboard=dashboard;let resolve;
 h.requestApi=()=>new Promise(r=>resolve=r);
 const pending=h.reopenCompletedShippingScan(runtime.item);await new Promise(setImmediate);
 h.state.user={name:'다른 사용자'};resolve({updatedBoxRows:1});
 assert.equal(await pending,null);assert.equal(h.state.dashboard,dashboard);
 assert.equal(h.state.dashboard[0].allShippingBoxes[0].status,'출고완료');
});
test('navigation during an acknowledged save patches inventory without appending a scan to the new workflow',async()=>{
 const runtime=clientRuntime(320);const h=runtime.h;
 h.state.dashboard=[{...runtime.item,allShippingBoxes:runtime.db().boxes,activeShippingBoxes:[]}];let resolve;
 h.requestApi=()=>new Promise(r=>resolve=r);
 const pending=h.reopenCompletedShippingScan(runtime.item);await new Promise(setImmediate);
 h.state.activeWorkflow='inventoryMove';h.state.hardwareScannerSession++;
 resolve({updatedBoxRows:1});assert.equal(await pending,null);
 assert.equal(h.state.dashboard[0].allShippingBoxes[0].status,'출고대기');
 assert.equal(h.state.scannerSessionShippingKeys.length,1);
});
test('close-button event and Escape resolve popup as cancellation, never as quantity',()=>{
 for(const closeValue of [undefined,{type:'click'},320]){
 let result='pending';const noop=()=>{};const h=vm.createContext({state:{selectedConfirmMode:'completedShippingScan',resolveCompletedShippingScan:q=>result=q},document:{querySelector:()=>({hidden:false}),body:{classList:{remove:noop}}},elements:{confirmModal:{hidden:false}},confirmDialogReturnFocus:null,renderConfirmMeta:noop,setConfirmPresentation:noop,syncClientToneClass:noop});
 vm.runInContext(extract('closeConfirmModal'),h);h.closeConfirmModal(closeValue);assert.equal(result,closeValue===320?320:null);assert.equal(h.state.resolveCompletedShippingScan,null);
 }
});
