import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {compactMobileDashboard} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import {loadFunctions, mobileSource, inventoryFixture} from './helpers/frontend-runtime.mjs';
const {expandMobileDashboard} = loadFunctions(mobileSource,['expandMobileDashboard']);
const plain=value=>JSON.parse(JSON.stringify(value));
test('mobile compact transport preserves all boxes, allocations, history, status and quantities',()=>{
 const rows=inventoryFixture(3,4);
 rows[0].allShippingBoxes[0].status='출고완료';
 rows[0].shippedShippingBoxes=[rows[0].allShippingBoxes[0]];
 rows[0].activeShippingBoxes=rows[0].allShippingBoxes.slice(1);
 rows[0].allShippingBoxes[0].shippingAllocations=[{productName:'쉐딩',quantity:100}];
 rows[0].allShippingBoxes[0].commonContainerShippingHistory=[{action:'출고완료',products:[{productName:'쉐딩',quantity:100}]}];
 const snapshot=plain(rows),packed=compactMobileDashboard({rows,stateVersion:17});
 assert.equal(packed.boxTable.length,12);assert.equal(packed.stateVersion,17);
 assert.deepEqual(plain(expandMobileDashboard(plain(packed))),snapshot);
 assert.deepEqual(plain(rows),snapshot);
 assert.equal(expandMobileDashboard({rows}),rows);
 assert.throws(()=>expandMobileDashboard({format:'mobile-box-table-v1',rows:[{allShippingBoxes:[50]}],boxTable:[]}));
});
test('16,000-box transport is smaller without removing completed stock or QR data',()=>{
 const rows=inventoryFixture(1000,16);
 for(const row of rows)for(const box of row.allShippingBoxes)Object.assign(box,{productId:row.productId,managementId:row.managementId,shippingDate:'2026-09-28',shippingTime:'13:00',inspectionDate:'2026-09-28',rawStatus:'출고대기',qrData:JSON.stringify({b:box.boxId})});
 const original=JSON.stringify({rows});const packed=JSON.stringify(compactMobileDashboard({rows}));
 assert.ok(packed.length<original.length*0.6,`${packed.length}/${original.length}`);
 assert.equal(expandMobileDashboard(JSON.parse(packed)).length,1000);
});
test('mobile sync creates view models only for pending and saved scans',()=>{
 const rows=inventoryFixture(1000,16);let builds=0;
 const app=loadFunctions(mobileSource,['syncPendingShippingRowsFromDashboard','getKnownBoxes','getBoxPickerBoxKey','getShippingCompositeBoxKey','getScannedBox'],{
 state:{dashboard:rows,scannedShippingRows:[{managementId:rows[0].managementId,scannedBox:rows[0].allShippingBoxes[0]}]},
 normalizeScanValue:v=>String(v||''),normalizeText:v=>String(v||''),saveScannedShippingRows(){},
 buildScannedBoxItem:(row,box)=>{builds++;return {...row,scannedBox:box};},getEditableBoxQuantity:()=>0});
 app.syncPendingShippingRowsFromDashboard();assert.equal(builds,1);
 assert.equal(app.state.scannedShippingRows.length,1);
});
test('cached dashboard cannot overwrite newer data or another user after asynchronous restore',async()=>{
 let resolve;const state={user:{accountId:'worker'},dashboardLoadedAt:0,shippingMutationRevision:0};
 const app=loadFunctions(mobileSource,['restoreCachedDashboard','getMobileCacheUserKey','getDashboardStateVersion','expandMobileDashboard'],{
 state,DASHBOARD_CACHE_KEY:'cache:prod',DASHBOARD_CACHE_MAX_AGE_MS:43200000,
 SeungjinMobileCache:{read:()=>new Promise(r=>{resolve=r}),remove(){}},syncPendingShippingRowsFromDashboard(){},syncScannedMoveRowsFromDashboard(){},dashboardQrIndex:null});
 const pending=app.restoreCachedDashboard();state.shippingMutationRevision++;
 resolve({savedAt:Date.now(),userKey:'worker',dashboard:{rows:[{old:true}]}});
 assert.equal(await pending,false);assert.equal(state.dashboard,undefined);
});
test('browser cache failures resolve promptly instead of blocking refresh',async()=>{
 const app=vm.createContext({setTimeout,clearTimeout});
 vm.runInContext(readFileSync(new URL('../frontend/mobile/dashboard-cache.js',import.meta.url),'utf8'),app);
 assert.equal(await app.SeungjinMobileCache.read('prod:worker'),null);
 assert.equal(await app.SeungjinMobileCache.write('prod:worker',{rows:[]}),null);
});
