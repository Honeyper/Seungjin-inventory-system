import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { loadFunctions } from './helpers/frontend-runtime.mjs';
import { applyMutation } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import { ValidationError } from '../supabase/functions/seungjin-dev-gateway/request-errors.js';

const gateway = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts', import.meta.url), 'utf8'));
const now = new Date('2026-11-17T01:20:00Z');
const record = (managementId, productId) => ({
  managementId, productId, storage: 'A-1', originalStorage: 'A-1', recordKey: `${managementId}|${productId}|A-1`
});
const box = (managementId, productId, number, status = '보관') => ({
  managementId, productId, number, status, rawStatus: status,
  boxId: `${managementId}-${productId}-${number}`, quantity: 100, storage: 'A-1'
});
const state = {
  version: 12, products: [], orders: [], inbounds: [],
  records: [record('M1', 'P1'), record('M1', 'P2'), record('M2', 'P1'), record('OTHER', 'P3')],
  boxes: [
    box('M1', 'P1', 1), box('M1', 'P1', 2, '출고대기'), box('M1', 'P2', 1),
    box('M2', 'P1', 1), box('M2', 'P1', 2), box('OTHER', 'P3', 1)
  ]
};

function createLoader() {
  const paths = [];
  const version = Promise.withResolvers();
  const app = loadFunctions(gateway, [
    'loadCanonicalState', 'loadInventoryAuditMutationState', 'mapInventoryRecordRows', 'mapInventoryBoxRows'
  ], {
    ValidationError,
    loadStateVersion: () => version.promise,
    loadFullCanonicalState: () => { throw new Error('unexpected full snapshot'); },
    databaseRows: async path => {
      const url = new URL(path, 'https://fixture.test/');
      const filter = url.searchParams.get('management_id');
      assert.match(filter, /^in\.\(.+\)$/);
      const ids = JSON.parse(`[${filter.slice(4, -1)}]`);
      paths.push({ ids, path });
      const rows = url.pathname === '/dev_inventory_records' ? state.records : state.boxes;
      return rows.filter(row => ids.includes(row.managementId)).map(data => ({
        data, management_id: data.managementId, product_id: data.productId, storage: data.storage,
        record_key: data.recordKey, box_id: data.boxId, box_number: data.number
      }));
    }
  });
  return { app, version, paths };
}

const first = { managementId: 'M1', productId: 'P1', selectedBoxes: [1] };
const second = { managementId: 'M2', productId: 'P1', selectedBoxIds: ['M2-P1-2'] };

for (const [name, payload, ids] of [
  ['PC 선택 확인', { confirmationOnly: true, confirmedBoxes: [first], adjustments: [second] }, ['M1']],
  ['모바일 여러 입고 건 확인 및 위치 이동', { confirmationOnly: true, confirmedBoxes: [first, second], targetStorage: 'B-1' }, ['M1', 'M2']],
  ['재고 정리와 실물 확인', { confirmedBoxes: [first], adjustments: [second] }, ['M1', 'M2']],
  ['PC 재고 정리', { adjustments: [first] }, ['M1']]
]) {
  test(`${name}: 입고 건만 조회해도 전체 조회와 저장 결과가 같다`, async () => {
    const { app, version, paths } = createLoader();
    const loading = app.loadCanonicalState('adjustMissingInventory', payload);
    assert.equal(paths.length, 0, '읽기 시작 전에 동시 수정 감지용 버전을 확보한다');
    version.resolve(state.version);
    const scoped = await loading;
    assert.equal(scoped.version, state.version);
    assert.deepEqual(paths.map(call => call.ids), [ids, ids]);
    assert.equal(scoped.boxes.length, state.boxes.filter(box => ids.includes(box.managementId)).length);
    const expected = applyMutation('adjustMissingInventory', payload, state, now);
    const actual = applyMutation('adjustMissingInventory', payload, scoped, now);
    assert.deepEqual(actual.result, expected.result);
    assert.deepEqual(actual.changes, expected.changes);
  });
}

test('실물 확인은 출고대기 박스를 거부하며 저장 데이터를 만들지 않는다', async () => {
  const { app, version } = createLoader();
  version.resolve(state.version);
  const payload = { confirmationOnly: true, confirmedBoxes: [{ ...first, selectedBoxes: [2] }] };
  const scoped = await app.loadCanonicalState('adjustMissingInventory', payload);
  assert.throws(() => applyMutation('adjustMissingInventory', payload, scoped, now), /실물 확인 대상이 아닙니다/);
  assert.equal(state.boxes[1].lastInventoryCheckedAt, undefined);
});

test('큰 요청은 입고 ID 중복을 제거하고 나누어 조회한다', async () => {
  const { app, version, paths } = createLoader();
  version.resolve(state.version);
  const ids = Array.from({ length: 51 }, (_, index) => `M-${index}`);
  ids[0] = 'M,(1)"\\';
  const confirmedBoxes = [...ids, ids[0]].map(managementId => ({ managementId, selectedBoxes: [1] }));
  await app.loadCanonicalState('adjustMissingInventory', { confirmationOnly: true, confirmedBoxes });
  assert.deepEqual(paths.map(call => call.ids), [ids.slice(0, 50), ids.slice(0, 50), ids.slice(50), ids.slice(50)]);
});

test('입고 ID가 빠진 요청은 전체 조회 없이 거부한다', async () => {
  const { app, paths } = createLoader();
  await assert.rejects(app.loadCanonicalState('adjustMissingInventory', {
    confirmedBoxes: [first, { selectedBoxes: [1] }]
  }), /입고 건을 선택/);
  assert.deepEqual(paths, []);
});
