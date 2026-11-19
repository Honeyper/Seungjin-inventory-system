import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInventoryDashboard} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import {compactInventoryDashboard} from '../supabase/functions/seungjin-dev-gateway/inventory-transport.js';

test('전량 폐기 기록도 조회되지만 폐기 수량은 재고 합계에 포함되지 않는다',()=>{
 const records=['ALL','MIXED','SHIPPED'].map(managementId=>({managementId,productId:'P',stockStatus:'보관'}));
 const boxes=[
  {managementId:'ALL',boxId:'D1',productId:'P',number:1,quantity:0,status:'폐기',beforeDiscardQuantity:100,note:'폐기 사유: 박스병합'},
  {managementId:'MIXED',boxId:'A1',productId:'P',number:1,quantity:80,status:'보관'},
  {managementId:'MIXED',boxId:'D2',productId:'P',number:2,quantity:0,status:'폐기',beforeDiscardQuantity:40},
  {managementId:'SHIPPED',boxId:'S1',productId:'P',number:1,quantity:50,status:'출고완료'}
 ];
 const dashboard=buildInventoryDashboard(records,boxes);
 assert.equal(dashboard.rows.length,3);
 const all=dashboard.rows.find(row=>row.managementId==='ALL');
 assert.equal(all.stockStatus,'폐기');assert.equal(all.countsAsInventory,false);
 assert.equal(all.currentBoxCount,'0 box');assert.equal(all.currentTotalQuantity,'0 ea');
 assert.equal(dashboard.summary.totalBoxes,1);assert.equal(dashboard.summary.totalQuantity,80);
 const transported=compactInventoryDashboard(dashboard);
 const serialized=transported.rows.find(row=>row.managementId==='ALL');
 const box=transported.boxTable[serialized.allShippingBoxes[0]];
 assert.equal(box.beforeDiscardQuantity,100);assert.equal(box.note,'폐기 사유: 박스병합');
});
