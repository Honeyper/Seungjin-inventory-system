import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = fs.readFileSync(new URL('../gas/Code.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0);
  return source.slice(start, end < 0 ? undefined : end);
}
test('location replay only writes active box storage, without adding, retiring or restoring quantities', () => {
  const headers = ['박스ID', '관리ID', '제품명', '제품ID', '박스순번', '현재 수량', '상태', '보관 위치'];
  const rows = [headers,
    ['B001', 'IN-MOVE', 'P', 'P', '1', '100 ea', '출고완료', 'A'],
    ['B002', 'IN-MOVE', 'P', 'P', '2', '30 ea', '일부 출고', 'A'],
    ['B003', 'IN-MOVE', 'P', 'P', '3', '0 ea', '출고완료', 'A'],
    ['B007', 'IN-MOVE', 'P', 'P', '7', '20 ea', '출고대기', 'A'],
    ['B009', 'IN-MOVE', 'P', 'P', '9', '10 ea', '폐기', 'A']];
  const writes = [];
  const sheet = { getDataRange: () => ({ getDisplayValues: () => rows }), getRange: (row, col) => ({ setValue: value => writes.push([row, col, value]) }) };
  const context = vm.createContext({
    findHeaderRow_: () => ({ headers, rowIndex: 0 }),
    indexHeaders_: () => headers,
    findHeaderIndex_: (indexes, names) => indexes.findIndex(h => names.includes(h)),
    pickCell_: (row, indexes, names) => row[indexes.findIndex(h => names.includes(h))],
    displayQuantityToNumber_: value => Number(String(value).replace(/[^0-9.]/g, '')),
    normalizeHeaderValue_: value => String(value || '').trim(),
    isMatchingInventoryRow_: (row, indexes, names, id, identity) => row[1] === id && row[3] === identity.productId
  });
  vm.runInContext(extract('getBoxSequenceFromRow_') + '\n' + extract('syncInboundBoxManagementRows_'), context);
  const result = context.syncInboundBoxManagementRows_(sheet, 'IN-MOVE', [{ productId: 'P', productName: 'P', storage: 'B-1', sequence: 1 }], { preserveBoxQuantities: true });
  assert.deepEqual(writes, [[3, 8, 'B-1'], [5, 8, 'B-1']]);
  assert.equal(result.insertedRows, 0);
  assert.equal(result.retiredRows, 0);
  assert.equal(result.deletedRows, 0);
});
