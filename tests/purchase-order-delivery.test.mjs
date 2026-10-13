import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyMutation } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';

const now = new Date('2026-10-12T05:00:00Z');
const base = { purchaseOrderId: 'PO-DELIVERY', productId: 'P', productName: '제품', clientName: '업체',
  startDate: '2026-10-01', endDate: '2026-10-20', totalOrderQuantity: 100000,
  accumulatedInboundQuantity: 0, status: '진행 중' };
const state = { products: [], orders: [base], records: [], boxes: [], inbounds: [] };
const update = (payload, input = state) => applyMutation('updatePurchaseOrder', { purchaseOrderId: base.purchaseOrderId, ...payload }, input, now);
const source = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function functionSource(text, name) {
  const start = text.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  const next = text.slice(start + 1).search(/\n(?:async )?function /);
  return text.slice(start, next < 0 ? undefined : start + 1 + next);
}

test('날짜 납기 기존 발주를 수정해도 날짜와 수량을 유지한다', () => {
  const row = update({ note: '메모만 수정' }).state.orders[0];
  assert.equal(row.deliveryType, 'date');
  assert.equal(row.endDate, base.endDate);
  assert.equal(row.dailyMinimumQuantity, null);
  assert.equal(row.totalOrderQuantity, base.totalOrderQuantity);
});

test('매일 생산 발주를 생성하고 오래된 납기일 때문에 기간 경과로 분류하지 않는다', () => {
  const result = applyMutation('createPurchaseOrder', { ...base, purchaseOrderId: '', deliveryType: 'daily',
    dailyMinimumQuantity: 10000, endDate: '2026-10-02' }, { ...state, orders: [] }, now);
  const row = result.state.orders[0];
  assert.equal(row.endDate, '');
  assert.equal(row.deliveryType, 'daily');
  assert.equal(row.dailyMinimumQuantity, 10000);
  assert.equal(row.status, '진행 중');
  assert.equal(result.changes.purchaseOrders.upserts[0].data.dailyMinimumQuantity, 10000);
});

test('매일 생산 발주는 메모 수정과 수동 완료 후에도 최소 생산량을 유지한다', () => {
  const daily = update({ deliveryType: 'daily', dailyMinimumQuantity: 12345 });
  const edited = update({ note: '최소량 유지' }, daily.state);
  const completed = update({ completionAction: 'complete' }, edited.state);
  assert.equal(completed.state.orders[0].dailyMinimumQuantity, 12345);
  assert.equal(completed.state.orders[0].deliveryType, 'daily');
  assert.equal(completed.state.orders[0].endDate, '');
});

test('날짜 납기로 다시 바꾸면 최소 생산량을 지우고 지정일을 저장한다', () => {
  const daily = update({ deliveryType: 'daily', dailyMinimumQuantity: 20000 });
  const row = update({ deliveryType: 'date', endDate: '2026-10-30' }, daily.state).state.orders[0];
  assert.equal(row.dailyMinimumQuantity, null);
  assert.equal(row.endDate, '2026-10-30');
});

test('매일 생산의 누락·0·음수·소수·문자·안전 범위 초과 수량을 거부한다', () => {
  for (const minimum of [undefined, null, '', 0, -1, 1.5, '잘못된 값', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => update({ deliveryType: 'daily', dailyMinimumQuantity: minimum }), /일 최소 생산량/);
  }
  assert.throws(() => update({ deliveryType: 'weekly', dailyMinimumQuantity: 10 }), /납기 방식/);
});

test('납기 방식 변경으로 기존 날짜·누적 입고량 제한을 우회할 수 없다', () => {
  assert.throws(() => update({ endDate: '2026-09-30' }), /발주 시작일/);
  assert.throws(() => update({ deliveryType: 'daily', dailyMinimumQuantity: 10, totalOrderQuantity: 100 },
    { ...state, orders: [{ ...base, accumulatedInboundQuantity: 500 }] }), /누적 입고량/);
});

function gasContext(names) {
  const context = vm.createContext({
    normalizeDateKey_: v => v || '', displayQuantityToNumber_: v => Number(String(v || '').replace(/,/g, '')),
    indexHeaders_: headers => Object.fromEntries(headers.map((h, i) => [h, i])),
    findHeaderIndex_: (indexes, names) => names.map(n => indexes[n]).find(i => i !== undefined) ?? -1,
    pickCell_: (row, indexes, names) => row[names.map(n => indexes[n]).find(i => i !== undefined)] ?? '',
    setRowValue_: (row, indexes, names, value) => { const index = names.map(n => indexes[n]).find(i => i !== undefined); if (index !== undefined) row[index] = value; },
    findHeaderRow_: values => ({ rowIndex: 0, headers: values[0] }),
    buildPurchaseOrderInboundQuantityMap_: () => ({}),
    Utilities: { formatDate: () => '2026-10-12' }
  });
  vm.runInContext(names.map(name => functionSource(source('gas/Code.js'), name)).join('\n'), context);
  return context;
}

test('시트의 사용자 컬럼·JSON 뒤에 납기 정보를 추가하고 재실행 시 중복하지 않는다', () => {
  const c = gasContext(['getPurchaseOrderHeaders_', 'ensurePurchaseOrderDeliveryHeaders_']);
  const headers = [...c.getPurchaseOrderHeaders_(), '사용자 메모', 'Supabase 원본(JSON)'];
  let columns = headers.length;
  const sheet = { getDataRange: () => ({ getDisplayValues: () => [[...headers]] }), getMaxColumns: () => columns,
    insertColumnsAfter: (_, count) => { columns += count; }, getRange: (_, col) => ({ setValue: v => { headers[col - 1] = v; } }) };
  c.ensurePurchaseOrderDeliveryHeaders_(sheet);
  c.ensurePurchaseOrderDeliveryHeaders_(sheet);
  assert.deepEqual(headers.slice(16), ['사용자 메모', 'Supabase 원본(JSON)', '납기유형', '일 최소 생산량']);
  assert.equal(columns, 20);
});

test('시트 등록·읽기 왕복에서 날짜와 매일 생산을 구별하고 잘못된 일 수량을 거부한다', () => {
  const c = gasContext(['getPurchaseOrderHeaders_', 'normalizePurchaseOrderPayload_', 'validatePurchaseOrderPayload_',
    'buildPurchaseOrderRow_', 'readPurchaseOrders_', 'resolvePurchaseOrderStatus_']);
  const headers = [...c.getPurchaseOrderHeaders_(), '납기유형', '일 최소 생산량'];
  const data = c.normalizePurchaseOrderPayload_({ ...base, deliveryType: 'daily', dailyMinimumQuantity: '12,345' });
  c.validatePurchaseOrderPayload_(data);
  const row = c.buildPurchaseOrderRow_(headers, { ...data, purchaseOrderId: base.purchaseOrderId });
  const result = c.readPurchaseOrders_({ getDataRange: () => ({ getDisplayValues: () => [headers, row] }) }, {}, false).orders[0];
  assert.equal(result.dailyMinimumQuantity, 12345);
  assert.equal(result.deliveryType, 'daily');
  assert.equal(result.endDate, '');
  assert.equal(result.status, '진행 중');
  assert.equal(c.normalizePurchaseOrderPayload_(base).deliveryType, 'date');
  assert.throws(() => c.validatePurchaseOrderPayload_({ ...data, dailyMinimumQuantity: 1.5 }), /일 최소 생산량/);
});

test('시트 백업에 납기 방식과 일 최소 생산량도 저장한다', () => {
  const c = vm.createContext({ CONFIG: { SHEETS: {} } });
  vm.runInContext(functionSource(source('gas/SheetBackup.js'), 'sheetBackupDefinition_'), c);
  const fields = c.sheetBackupDefinition_('orders').fields;
  assert.deepEqual(Array.from(fields.deliveryType), ['납기유형']);
  assert.deepEqual(Array.from(fields.dailyMinimumQuantity), ['일 최소 생산량']);
});

test('단순 생산계획은 발주의 일 최소량 입력 없이 등록 생산량을 기준으로 계산한다', () => {
  const c = vm.createContext({window:{}});
  vm.runInContext(source('frontend/production-planner.js'), c);
  const result = c.window.SeungjinProductionPlanner.calculate({orderQuantity:100000,hourlyRate:2000,dailyMinimumQuantity:10000});
  assert.equal(result.targetQuantity,16000);assert.equal(result.hours,8);
});
