import assert from 'node:assert/strict';
import test from 'node:test';
import {loadFunctions, mobileSource} from './helpers/frontend-runtime.mjs';

const names = ['getSearchShippingItems', 'getScannedBox', 'getScannedBoxKey', 'normalizeScanValue',
  'normalizeSearchText', 'normalizeText', 'isCompletedShippingItem', 'isManualShippingBoxAvailable',
  'getBoxCurrentQuantity', 'parseNumber', 'getShippingDisplayGroupKey'];
function box(managementId, number, quantity = 100, status = '출고대기') {
  return {managementId, productId: 'P1', productName: '검색 제품', clientName: '거래처', storage: 'A',
    scannedBox: {boxId: `${managementId}-B${number}`, number, quantity, currentQuantity: quantity, status}};
}
function runtime(rows, extra = {}) {
  const state = {query: '검색', filteredRows: rows, isCompletingShipping: false};
  return loadFunctions(mobileSource, names, {state, ...extra});
}

test('search shipping targets only registered matching boxes, preserving remainders and inbound identities', () => {
  const first = box('M1', 1);
  const remainder = box('M2', 1, 17);
  const app = runtime([{scannedItems: [first, {...first, storage: 'B'}, box('M1', 2, 100, '출고완료'),
    box('M1', 3, 100, '폐기'), box('M1', 4, 0)]}, {scannedItems: [remainder]}]);
  app.state.scannedShippingRows = [first, box('M1', 5), remainder];
  assert.deepEqual(Array.from(app.getSearchShippingItems()), [first, remainder]);
  app.state.query = '';
  assert.equal(app.getSearchShippingItems().length, 0);
  app.state.query = '검색';
  app.state.filteredRows = [];
  assert.equal(app.getSearchShippingItems().length, 0);
});

test('search confirmation captures exact targets and totals before the filter changes and blocks double submission', () => {
  const items = [box('M1', 1), box('M2', 1, 17)];
  const elements = Object.fromEntries(['shippingSearchInput', 'confirmModal', 'confirmTitle', 'confirmMessage',
    'confirmProductName', 'acceptConfirmButton'].map(key => [key, {value: '검색 제품'}]));
  let captured;
  let meta;
  const app = runtime([{scannedItems: items}], {elements, formatNumber: String, showToast() {},
    openConfirmModal(item, action) {captured = {item, action};}, syncClientToneClass() {},
    renderConfirmMeta(value) {meta = Array.from(value);}});
  const helper = loadFunctions(mobileSource, ['openSearchShippingConfirmModal'], app);
  helper.openSearchShippingConfirmModal();
  assert.equal(captured.action, 'complete');
  assert.deepEqual(Array.from(captured.item.scannedItems), items);
  assert.deepEqual(meta, ['1개 제품', '2박스', '117 ea']);
  app.state.filteredRows = [{scannedItems: [box('M3', 9)]}];
  assert.deepEqual(Array.from(captured.item.scannedItems), items);
  app.state.isCompletingShipping = true;
  helper.openSearchShippingConfirmModal();
  assert.deepEqual(Array.from(captured.item.scannedItems), items);
});

test('bulk writes remain sequential per inbound and partial failure leaves only failed boxes eligible for retry', async () => {
  const items = [box('M1', 1), box('M1', 2, 17), box('M2', 1)];
  const calls = [];
  let active = 0;
  let invalidated = 0;
  const app = runtime([{scannedItems: items}], {
    SHIPPING_ACTION_CONCURRENCY: 1,
    getBoxTotalQuantity: (b) => b.quantity,
    getLatestRegistrationDate: () => '',
    invalidateShippingDashboardRead() {invalidated++;},
    async completeShippingItem(group, numbers, action, ids) {
      assert.equal(active++, 0);
      calls.push({managementId: group.managementId, numbers: Array.from(numbers), ids: Array.from(ids), action});
      await Promise.resolve();
      active--;
      if (group.managementId === 'M2') throw new Error('서버 오류');
      return {updatedBoxRows: numbers.length};
    }
  });
  const batch = loadFunctions(mobileSource, ['completeShippingItems', 'groupScannedShippingRows',
    'getShippingProductGroupKey', 'getSelectedBoxNumbers', 'getSelectedBoxIds', 'getKnownBoxes',
    'mapWithConcurrency'], app);
  const result = await batch.completeShippingItems(app.getSearchShippingItems());
  assert.deepEqual(calls, [
    {managementId: 'M1', numbers: ['1', '2'], ids: ['M1-B1', 'M1-B2'], action: 'complete'},
    {managementId: 'M2', numbers: ['1'], ids: ['M2-B1'], action: 'complete'}
  ]);
  assert.equal(result.completedCount, 2);
  assert.equal(invalidated, 1);
  assert.deepEqual(Array.from(result.failedItems), [items[2]]);
  const failed = new Set(result.failedItems);
  items.filter(item => !failed.has(item)).forEach(item => {item.scannedBox.status = '출고완료';});
  assert.deepEqual(Array.from(app.getSearchShippingItems()), [items[2]]);
});
