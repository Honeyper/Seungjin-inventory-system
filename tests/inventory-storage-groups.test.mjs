import test from 'node:test';
import assert from 'node:assert/strict';
import { adminSource, loadFunctions } from './helpers/frontend-runtime.mjs';

const runtime = () => loadFunctions(adminSource, ['getInventoryStorageGroups', 'renderInventoryStorageDetails',
  'escapeHtml', 'normalizeDisplayValue', 'buildInventoryFilterOptions', 'uniqueValuesFromRows'], { formatNumber: String });
const box = (number, storage, quantity = 10, status = '보관') => ({ number, storage, quantity, status });

test('representative storage follows box count instead of first box or EA and never moves stock', () => {
  const row = { storage: 'A-1', allShippingBoxes: [box(1, 'A-1', 9000), box(2, 'H-1'), box(3, 'H-1')] };
  const original = structuredClone(row);
  const groups = runtime().getInventoryStorageGroups(row);
  assert.equal(groups[0].storage, 'H-1');
  assert.equal(groups[0].boxes.length, 2);
  assert.equal(groups[0].quantity, 20);
  assert.deepEqual(row, original);
});

test('equal counts have stable natural location ordering regardless of box order', () => {
  const boxes = [box(1, 'H-1'), box(2, 'A-10'), box(3, 'A-2')];
  const app = runtime();
  for (const input of [boxes, [...boxes].reverse()]) {
    assert.deepEqual(Array.from(app.getInventoryStorageGroups({ allShippingBoxes: input }), g => g.storage), ['A-2', 'A-10', 'H-1']);
  }
});

test('locations include waiting and held stock, omit shipped/discarded/empty, and retain unspecified', () => {
  const app = runtime();
  const groups = app.getInventoryStorageGroups({ allShippingBoxes: [
    box(1, 'A', 10, '출고 대기'), box(2, 'A', 10, '보류'), box(3, 'Z', 10, '출고완료'),
    box(4, 'Z', 10, '폐기'), box(5, 'Z', 0), box(6, ''), box(7, '-')
  ] });
  assert.equal(groups.reduce((n, g) => n + g.boxes.length, 0), 4);
  assert.equal(groups.find(g => g.storage === '미지정').boxes.length, 2);
  assert.ok(!groups.some(g => g.storage === 'Z'));
  assert.equal(app.getInventoryStorageGroups({ activeShippingBoxes: [box(1, 'A')] })[0].storage, 'A');
  assert.equal(app.getInventoryStorageGroups({ storage: 'A' }).length, 0);
});

test('box location disclosure escapes content and all locations are available to filters', () => {
  const app = runtime();
  const groups = app.getInventoryStorageGroups({ allShippingBoxes: [box(2, '<A>'), box(1, 'H'), box(3, 'H')] });
  const html = app.renderInventoryStorageDetails(groups);
  assert.ok(html.includes('<details'));
  assert.ok(html.includes('1번 박스'));
  assert.ok(html.includes('3번 박스'));
  assert.ok(html.includes('&lt;A&gt;'));
  assert.ok(!html.includes('<A>'));
  const filters = app.buildInventoryFilterOptions([{ storage: 'H', storageGroups: groups }], { storages: ['H'] });
  assert.deepEqual(new Set(filters.storages), new Set(['<A>', 'H']));
});
