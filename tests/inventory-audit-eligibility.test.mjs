import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { buildInventoryDashboard, applyMutation } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const admin = fs.readFileSync(new URL('../frontend/admin.js', import.meta.url), 'utf8');
const mobile = fs.readFileSync(new URL('../frontend/mobile/mobile.js', import.meta.url), 'utf8');
const extract = (source, name) => source.slice(source.indexOf(`function ${name}(`), source.indexOf('\n}', source.indexOf(`function ${name}(`)) + 2);
const normalize = value => String(value ?? '').replace(/\s+/g, '').toLowerCase();
function ui() {
  const context = vm.createContext({ normalizeSearchText: normalize, normalizeScanValue: normalize,
    parseShippingSettlementNumber: Number, mergeShippingBoxDraft: x => x, normalizeInventoryProcessStatus: x => x });
  for (const name of ['normalizeInventoryStockStatus', 'isProtectedInventoryAuditBox', 'getInventoryPhysicalConfirmationBoxes','getInventoryAuditEligibleBoxes', 'getInventoryAuditTargetBoxes', 'normalizeInventoryRows']) vm.runInContext(extract(admin, name), context);
  vm.runInContext(extract(mobile, 'isProtectedInventoryAdjustmentBox'), context);
  return context;
}
const record = {managementId:'IN-TEST',productId:'P1',storage:'A'};
const fixture = () => Array.from({length:8}, (_, i) => ({...record, boxId:`B${i+1}`, number:i+1, quantity:616, status:[2,3,7].includes(i+1)?'보류':'보관'}));
test('mixed eight-box record exposes five audit boxes while retaining all stock', () => {
  const boxes=fixture(), h=ui();
  const dashboard=buildInventoryDashboard([record], boxes);
  const row=dashboard.rows[0];
  assert.equal(row.inventoryUnconfirmedBoxCount,5);
  assert.equal(row.inventoryAuditTargetBoxCount,5);
  assert.equal(row.currentBoxCount,'8 box');
  assert.equal(row.currentTotalQuantity,'4,928 ea');
  const selected=Array.from(h.getInventoryAuditTargetBoxes(row), b=>b.number);
  assert.deepEqual(selected,[1,4,5,6,8]);
  const result=applyMutation('adjustRemainingInventory',{...record,selectedBoxes:selected,boxQuantities:Object.fromEntries(selected.map(n=>[n,616])),protectClassifiedInventory:true}, {products:[],orders:[],inbounds:[],records:[record],boxes});
  assert.equal(result.result.updatedBoxRows,5);
  assert.equal(result.state.boxes.filter(b=>b.status==='보류').length,3);
  assert.equal(result.state.boxes.filter(b=>b.status==='보류').reduce((s,b)=>s+b.quantity,0),1848);
});
test('PC and mobile exclude hold aliases, discard, shipped and protected stock; waiting remains eligible', () => {
  const h=ui();
  const boxes=['보관','출고대기','보류','출고 보류','폐기','출고완료'].map((status,i)=>({...record,number:i+1,quantity:100,status}));
  boxes.push({...record,number:7,quantity:100,status:'보관',inventoryCategory:'자사재고'});
  boxes.push({...record,number:8,quantity:100,status:'사출재고'});
  const row=buildInventoryDashboard([record],boxes).rows[0];
  assert.deepEqual(Array.from(h.getInventoryAuditEligibleBoxes(row),b=>b.number),[1,2]);
  assert.equal(row.inventoryAuditTargetBoxCount,2);
  assert.deepEqual(boxes.filter(b=>!h.isProtectedInventoryAdjustmentBox(record,b)).map(b=>b.number),[1,2]);
});
test('cached counters are recalculated and confirmed hold/discard boxes are excluded on both sides', () => {
  const h=ui(), boxes=fixture();
  for(const n of [1,2,3,7]) boxes[n-1].lastInventoryCheckedAt='2026-09-17 12:00:00';
  boxes.push({...record,number:9,quantity:100,status:'폐기',lastInventoryCheckedAt:'2026-09-17 12:00:00'});
  const cached={...record,activeShippingBoxes:boxes,inventoryAuditTargetBoxCount:9,inventoryConfirmedBoxCount:5,inventoryUnconfirmedBoxCount:4};
  const [row]=h.normalizeInventoryRows([cached]);
  assert.equal(row.inventoryAuditTargetBoxCount,5);
  assert.equal(row.inventoryConfirmedBoxCount,1);
  assert.equal(row.inventoryUnconfirmedBoxCount,4);
  const server=buildInventoryDashboard([record],boxes).rows[0];
  assert.equal(server.inventoryConfirmedBoxCount,1);
  assert.equal(server.inventoryUnconfirmedBoxCount,4);
  assert.equal(cached.inventoryAuditTargetBoxCount,9);
});

test('eight own-stock boxes remain physically confirmable while inventory adjustment stays blocked', () => {
  const h = ui();
  const boxes = Array.from({length: 8}, (_, index) => ({ ...record, boxId: `B${index+1}`, number: index+1,
    quantity: 320, status: '보관', inventoryCategory: '자사재고' }));
  boxes.push({ ...record, boxId: 'B9', number: 9, quantity: 0, status: '출고완료' });
  const state = {products: [], orders: [], inbounds: [], records: [record], boxes};
  const row = h.normalizeInventoryRows(buildInventoryDashboard([record], boxes).rows)[0];
  assert.equal(row.inventoryUnconfirmedBoxCount, 8);
  assert.equal(row.inventoryConfirmedBoxCount, 0);
  assert.equal(row.inventoryAuditTargetBoxCount, 0);
  assert.equal(h.getInventoryAuditTargetBoxes(row).length, 0);
  Object.assign(h, {state: {}, formatNumber: String, escapeHtml: String, normalizeDisplayValue: String});
  vm.runInContext(extract(admin, 'renderInventoryAuditBoxStatus'), h);
  const html = h.renderInventoryAuditBoxStatus(row);
  assert.equal((html.match(/data-inventory-audit-confirm="/g) || []).length, 8);
  assert.doesNotMatch(html, /data-inventory-audit-box=/);
  const result = applyMutation('adjustMissingInventory', {confirmationOnly: true, confirmedBoxes: [{...record, selectedBoxes: [1,2,3,4,5,6,7,8]}]}, state);
  assert.equal(result.result.confirmedBoxRows, 8);
  assert.equal(result.result.updatedBoxRows, 0);
  const confirmed = buildInventoryDashboard(result.state.records, result.state.boxes).rows[0];
  assert.equal(confirmed.inventoryConfirmedBoxCount, 8);
  assert.equal(confirmed.inventoryUnconfirmedBoxCount, 0);
  assert.equal(confirmed.inventoryAuditTargetBoxCount, 0);
  assert.equal(confirmed.currentTotalQuantity, '2,560 ea');
  assert.deepEqual(result.state.boxes.map(b => [b.quantity, b.status, b.inventoryCategory]), boxes.map(b => [b.quantity, b.status, b.inventoryCategory]));
});

test('physical confirmation includes injection, printing and waiting stock but excludes hold/discard/shipped', () => {
  const h = ui();
  const boxes = ['사출재고', '인쇄재고', '출고대기', '보류', '폐기', '출고완료'].map((status,index) => ({...record, boxId:`B${index+1}`, number:index+1,quantity:100,status}));
  const dashboard = buildInventoryDashboard([record], boxes);
  const row = h.normalizeInventoryRows(dashboard.rows)[0];
  assert.deepEqual(Array.from(h.getInventoryPhysicalConfirmationBoxes(row), b => b.number), [1,2,3]);
  assert.deepEqual(Array.from(h.getInventoryAuditTargetBoxes(row), b => b.number), [3]);
  assert.equal(dashboard.attention.physicalMissingCount, 3);
  assert.equal(row.inventoryUnconfirmedBoxCount, 3);
});
