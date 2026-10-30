import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { loadFunctions, mobileSource } from './helpers/frontend-runtime.mjs';
import { applyMutation } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';

const gateway = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts', import.meta.url), 'utf8'));
const now = new Date('2026-10-30T08:00:00Z');
function fixture() {
  const box = (m, p, n, quantity, status = '보관', storage = 'A') => ({
    boxId: `${m}-${p}-B${n}`, managementId: m, productId: p, number: n,
    quantity, status, rawStatus: status, storage
  });
  const record = (m, p) => ({ managementId: m, productId: p, storage: 'A', originalStorage: 'A', recordKey: `${m}|${p}|A` });
  return {
    version: 12, products: [{ productId: 'P1', accumulatedInboundQuantity: '800 ea' }], orders: [], inbounds: [],
    records: [record('M1', 'P1'), record('M1', 'P2'), record('M2', 'P1')],
    boxes: [box('M1', 'P1', 1, 100), box('M1', 'P1', 2, 60, '출고대기', 'B'),
      box('M1', 'P1', 3, 90, '출고완료'), box('M1', 'P1', 4, 0, '폐기'),
      { ...box('M1', 'P1', 5, 30), commonContainerSource: true, currentQuantity: '30 ea' },
      box('M1', 'P2', 1, 200), box('M2', 'P1', 1, 400)]
  };
}
function loader(state) {
  const paths = [], version = Promise.withResolvers();
  const c = loadFunctions(gateway, ['loadCanonicalState', 'loadShippingMutationState', 'mapInventoryRecordRows', 'mapInventoryBoxRows'], {
    loadStateVersion: () => version.promise,
    loadFullCanonicalState: () => { throw new Error('전체 재고 조회 금지'); },
    databaseRows: async path => {
      paths.push(path);
      assert.match(path, /management_id=eq\.M1/);
      const rows = path.startsWith('dev_inventory_records?') ? state.records : state.boxes;
      return rows.filter(row => row.managementId === 'M1').map(data => ({
        data, management_id: data.managementId, product_id: data.productId, storage: data.storage,
        record_key: data.recordKey, box_id: data.boxId, box_number: data.number
      }));
    }
  });
  return { c, paths, version };
}
const base = { managementId: 'M1', productId: 'P1', defectReasons: ['박스 폐기'], discardRequested: true,
  inspectionQuantity: 100, defectQuantity: 100, selectedBoxes: [1], selectedBoxIds: ['M1-P1-B1'], boxQuantities: { 1: 100 } };

for (const [label, overrides] of [
  ['선택 박스 폐기', {}],
  ['다른 위치 박스까지 폐기', { selectedBoxes: [1, 2], selectedBoxIds: [], boxQuantities: { 1: 100, 2: 60 } }],
  ['공용용기 잔량 폐기', { selectedBoxes: [5], selectedBoxIds: ['M1-P1-B5'], boxQuantities: { 5: 30 } }],
  ['일반 출고 검수', { discardRequested: false, defectReasons: ['양호'], defectQuantity: 0 }],
  ['출고 보류', { discardRequested: false, holdRequested: true }],
  ['출고대기 해제', { discardRequested: false, clearShippingWaiting: true, selectedBoxes: [], selectedBoxIds: [] }],
  ['제품 ID 없는 기존 검수 요청', { productId: '', selectedBoxIds: [] }]
]) {
  test(`${label}: 해당 입고 건만 읽어도 전체 조회와 저장 결과가 같다`, async () => {
    const state = fixture(), t = loader(state), payload = { ...base, ...overrides };
    const pending = t.c.loadCanonicalState('saveShippingInspection', payload);
    assert.equal(t.paths.length, 0, '동시 수정 감지를 위해 버전을 먼저 확인한다');
    t.version.resolve(state.version);
    const scoped = JSON.parse(JSON.stringify(await pending));
    assert.equal(t.paths.length, 2);
    assert.equal(scoped.version, 12);
    assert.equal(scoped.boxes.length, 6, '같은 입고의 다른 제품과 미선택 박스도 집계를 위해 유지한다');
    const full = applyMutation('saveShippingInspection', payload, state, now);
    const result = applyMutation('saveShippingInspection', payload, scoped, now);
    assert.deepEqual(result.result, full.result);
    assert.deepEqual(result.changes, full.changes);
    if (payload.discardRequested) {
      for (const row of result.changes.inventoryBoxes.upserts) {
        assert.equal(row.data.quantity, 0);
        assert.equal(row.data.status, '폐기');
      }
    }
  });
}

test('검수 요청에 출고 상태가 섞여도 조회 범위가 제품 전체로 넓어지지 않는다', async () => {
  const t = loader(fixture()); t.version.resolve(12);
  await t.c.loadCanonicalState('saveShippingInspection', { ...base, status: '보관', shippingType: '반출' });
  assert.equal(t.paths.length, 2);
});

test('출고완료 박스 폐기 거부도 전체 조회와 동일하며 저장 결과를 만들지 않는다', async () => {
  const state = fixture(), t = loader(state); t.version.resolve(12);
  const payload = { ...base, selectedBoxes: [3], selectedBoxIds: [] };
  const scoped = JSON.parse(JSON.stringify(await t.c.loadCanonicalState('saveShippingInspection', payload)));
  assert.throws(() => applyMutation('saveShippingInspection', payload, scoped, now), /검수 대상/);
  assert.equal(state.boxes[2].status, '출고완료');
});

test('모바일 폐기 실패 시 스캔 항목을 유지하고 성공한 박스만 화면에 반영한다', async () => {
  const calls = [], applied = [], items = [{ managementId: 'M1', productId: 'P1' }, { managementId: 'M2', productId: 'P1' }];
  const c = loadFunctions(mobileSource, ['completeInventoryDiscardItems'], {
    state: { user: { name: '테스트' } },
    getSelectedBoxNumbers: () => [1], getSelectedBoxQuantities: () => ({ 1: 100 }),
    getSelectedBoxIds: item => [`${item.managementId}-P1-B1`], getInventoryMoveCurrentStorage: () => 'A',
    toDateKey: () => '2026-10-30', toTimeKey: () => '17:00', parseNumber: Number,
    requestApi: async (action, payload) => {
      calls.push({ action, payload });
      if (payload.managementId === 'M2') throw new Error('서버 처리 실패');
      return { updatedBoxRows: 1 };
    },
    applyInventoryDiscardResultLocally: item => applied.push(item.managementId)
  });
  const result = await c.completeInventoryDiscardItems(items);
  assert.equal(result.completedCount, 1);
  assert.equal(result.failedItems[0], items[1]);
  assert.deepEqual(applied, ['M1']);
  assert.equal(calls.length, 2, '실패 요청을 자동 재전송하지 않는다');
  assert.equal(calls[0].action, 'saveShippingInspection');
  assert.equal(calls[0].payload.discardRequested, true);
});
