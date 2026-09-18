import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyMutation, buildInventoryDashboard } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import { loadFunctions, adminSource, mobileSource } from './helpers/frontend-runtime.mjs';

const policy = globalThis.SeungjinInventoryConfirmation;
const at = value => new Date(value);
const record = { managementId: 'MONTHLY', productId: 'P1', productName: '월간 확인', storage: 'A' };
const box = (number, overrides = {}) => ({ ...record, boxId: `B${number}`, number, quantity: 100, status: '보관', lastInventoryCheckedAt: '2026-08-18 14:20:30', ...overrides });
const expiry = at('2026-09-18T05:20:30Z');
const runtime = (overrides = {}) => loadFunctions(adminSource, [
  'normalizeInventoryStockStatus', 'getInventoryAuditEligibleBoxes', 'getInventoryPhysicalConfirmationBoxes',
  'getInventoryAuditTargetBoxes', 'isInventoryBoxConfirmed', 'normalizeInventoryRows', 'refreshInventoryConfirmationStatus'
], { window: { SeungjinInventoryConfirmation: policy }, normalizeSearchText: value => String(value).replace(/\s/g, ''),
  parseShippingSettlementNumber: Number, mergeShippingBoxDraft: value => value, normalizeInventoryProcessStatus: value => value, ...overrides });

test('browser and Edge use identical monthly rules and load them before the application', () => {
  assert.equal(fs.readFileSync(new URL('../frontend/inventory-confirmation.js', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/inventory-confirmation.js', import.meta.url), 'utf8'));
  for (const [file, app] of [['admin.html', './admin.js'], ['mobile/index.html', './mobile.js']]) {
    const html = fs.readFileSync(new URL(`../frontend/${file}`, import.meta.url), 'utf8');
    assert.ok(html.indexOf('inventory-confirmation.js') > 0);
    assert.ok(html.indexOf('inventory-confirmation.js') < html.indexOf(app));
  }
});

for (const [checked, expected] of [
  ['2026-08-18 14:20:30', '2026-09-18T05:20:30Z'],
  ['2026-01-31 23:59:59', '2026-02-28T14:59:59Z'],
  ['2028-01-31 00:00:00', '2028-02-28T15:00:00Z'],
  ['2026-12-31', '2027-01-30T15:00:00Z'],
  ['2026-08-17T15:30:00Z', '2026-09-17T15:30:00Z'],
  ['2026-08-18T00:30:00+09:00', '2026-09-17T15:30:00Z']
]) test(`Korean calendar month, including month end: ${checked}`, () => {
  assert.equal(policy.expiresAt(checked), at(expected).getTime());
  const item = box(1, { lastInventoryCheckedAt: checked });
  assert.equal(policy.isConfirmed(item, at(expected).getTime() - 1), true);
  assert.equal(policy.isConfirmed(item, at(expected)), false);
});

test('missing, invalid and future confirmations remain unconfirmed', () => {
  for (const value of ['', '-', 'invalid', '2026-02-30 10:00:00', '2026-09-18 25:00:00', '2026-10-18 14:20:30']) {
    assert.equal(policy.isConfirmed(box(1, { lastInventoryCheckedAt: value }), expiry), false, value);
  }
});

test('expiry is per box: a newer sibling or row timestamp cannot hide an overdue box', () => {
  const boxes = [box(1), box(2, { lastInventoryCheckedAt: '2026-09-17 14:20:30' }), box(3, { lastInventoryCheckedAt: '' })];
  const source = { ...record, lastInventoryCheckedAt: '2026-09-17 14:20:30' };
  const before = structuredClone(boxes);
  const early = buildInventoryDashboard([source], boxes, [], new Date(+expiry - 1));
  const due = buildInventoryDashboard([source], boxes, [], expiry);
  assert.equal(early.attention.physicalMissingCount, 1);
  assert.equal(due.attention.physicalMissingCount, 2);
  assert.equal(due.rows[0].inventoryConfirmedBoxCount, 1);
  const cached = runtime().normalizeInventoryRows(early.rows, expiry)[0];
  assert.equal(cached.inventoryUnconfirmedBoxCount, 2);
  assert.equal(cached.inventoryConfirmedBoxCount, 1);
  assert.deepEqual(boxes, before); // The check does not erase history or change stock.
});

test('PC and server exclude waiting, shipped, held and discarded boxes; cleanup still allows waiting', () => {
  const boxes = ['보관', '출고 대기', '출고완료', '보류', '폐기', '사출재고', '인쇄재고'].map((status, index) => box(index + 1, { status }));
  boxes.push(box(8, { inventoryCategory: '자사재고' }), box(9, { quantity: 0 }));
  const row = buildInventoryDashboard([record], boxes, [], expiry).rows[0];
  assert.equal(row.inventoryUnconfirmedBoxCount, 4);
  const ui = runtime();
  assert.deepEqual(Array.from(ui.getInventoryPhysicalConfirmationBoxes(row), item => item.number), [1, 6, 7, 8]);
  assert.deepEqual(Array.from(ui.getInventoryAuditTargetBoxes(row), item => item.number), [1, 2, 6, 7, 8]);
  assert.equal(policy.isEligible(box(10, { status: '보관', rawStatus: '출고대기' })), false);
});

test('reconfirmation starts another month and rejects concurrently shipped boxes atomically', () => {
  const boxes = [box(1), box(2, { status: '출고대기' }), box(3, { status: '출고완료' }), box(4, { status: '보류' }), box(5, { status: '폐기' })];
  const original = structuredClone(boxes);
  const state = { products: [], orders: [], inbounds: [], records: [record], boxes };
  assert.throws(() => applyMutation('adjustMissingInventory', { confirmationOnly: true,
    confirmedBoxes: [{ ...record, selectedBoxes: [1, 2, 3, 4, 5] }] }, state, expiry), /실물 확인 대상이 아닙니다/);
  assert.deepEqual(boxes, original);
  const result = applyMutation('adjustMissingInventory', { confirmationOnly: true,
    confirmedBoxes: [{ ...record, selectedBoxes: [1] }] }, state, expiry);
  assert.equal(result.result.confirmedBoxRows, 1);
  assert.equal(result.result.updatedBoxRows, 0);
  assert.equal(result.state.boxes[0].lastInventoryCheckedAt, '2026-09-18 14:20:30');
  assert.deepEqual(result.state.boxes.slice(1), original.slice(1));
  assert.equal(buildInventoryDashboard(result.state.records, result.state.boxes, [], expiry).attention.physicalMissingCount, 0);
  assert.equal(buildInventoryDashboard(result.state.records, result.state.boxes, [], at('2026-10-18T05:20:30Z')).attention.physicalMissingCount, 1);
  assert.deepEqual(boxes, original);
});

test('open counters and detail refresh when time expires without downloading or changing data version', async () => {
  const rows = buildInventoryDashboard([record], [box(1)], [], new Date(+expiry - 1)).rows;
  const section = { outerHTML: '' }, count = { textContent: '0' };
  let listRefreshes = 0;
  const ui = runtime({ state: { inventoryLoaded: true, inventoryStateVersion: 7, inventoryRows: rows,
    activeDetailInboundId: record.managementId, activeDetailInboundProductId: record.productId, activeDetailInboundSource: 'inventory' },
    inventoryPhysicalMissing: count, formatNumber: String, refreshOpenInventoryAttentionList() { listRefreshes++; },
    inboundDetailModal: { hidden: false }, inboundDetailContent: { querySelector: () => section },
    getInventoryRecordByManagementId: () => rows[0], renderInventoryAuditBoxStatus: row => `${row.inventoryUnconfirmedBoxCount} 미확인` });
  ui.refreshInventoryConfirmationStatus(expiry);
  assert.equal(count.textContent, '1');
  assert.equal(section.outerHTML, '1 미확인');
  assert.equal(listRefreshes, 1);
  assert.equal(ui.state.inventoryStateVersion, 7);
  ui.refreshInventoryConfirmationStatus(expiry);
  assert.equal(listRefreshes, 1);
  const calls = [];
  const loader = loadFunctions(adminSource, ['loadInventoryDashboardRequest'], { state: ui.state,
    refreshInventoryConfirmationStatus: () => ui.refreshInventoryConfirmationStatus(expiry),
    window: { SeungjinDataGateway: { canRead: () => true } },
    requestApi: async action => { calls.push(action); return { stateVersion: 7 }; } });
  assert.equal(await loader.loadInventoryDashboardRequest(false), true);
  assert.deepEqual(calls, ['getInventoryVersion']);
});

test('mobile confirmations use the same exclusion rules', () => {
  const mobile = loadFunctions(mobileSource, ['isExcludedFromInventoryConfirmation'], { window: { SeungjinInventoryConfirmation: policy } });
  for (const status of ['출고대기', '출고완료', '보류', '폐기']) assert.equal(mobile.isExcludedFromInventoryConfirmation(box(1, { status })), true);
  assert.equal(mobile.isExcludedFromInventoryConfirmation(box(1)), false);
});

test('mobile mixed scans confirm only eligible boxes and retain excluded scans', () => {
  const boxes = [box(1), box(2, { status: '출고대기' }), box(3, { status: '출고완료' }), box(4, { status: '인쇄재고' })];
  const scanned = boxes.map(scannedBox => ({ ...record, scannedBox }));
  const mobile = loadFunctions(mobileSource, ['buildMissingInventoryAdjustmentPlan', 'isExcludedFromInventoryConfirmation',
    'normalizeInventoryAuditScope', 'getInventoryAuditAnchorItem', 'isInventoryAuditItemInScope',
    'getInventoryAuditProductKey', 'getInventoryAuditBoxKey', 'getScannedBox', 'normalizeScanValue'], {
    window: { SeungjinInventoryConfirmation: policy }, state: { scannedMoveRows: scanned, dashboard: [{ ...record, boxes }] },
    INVENTORY_AUDIT_SCOPE_DEFINITIONS: [{ value: 'management', label: '현재 입고 건만' }],
    normalizeDisplay: String, getMovableBoxes: row => row.boxes, getBoxCurrentQuantity: item => item.quantity
  });
  const plan = mobile.buildMissingInventoryAdjustmentPlan();
  assert.deepEqual(Array.from(plan.confirmedBoxes[0].selectedBoxes), [1, 4]);
  assert.equal(plan.confirmedBoxCount, 2);
  assert.equal(plan.protectedBoxCount, 2);
  assert.deepEqual(Array.from(plan.scannedBoxKeys), ['monthly|1', 'monthly|4']);
});
