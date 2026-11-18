import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { loadFunctions } from './helpers/frontend-runtime.mjs';
import { applyMutation, buildInventoryDashboard } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';

const record = {
  managementId: 'IN-SIMPLE', productId: 'P1', productName: '추가 박스 시험', clientName: '거래처',
  boxQuantity: '100 ea', storage: 'A-1', recordKey: 'IN-SIMPLE|P1|A-1', originalStorage: 'A-1',
  inboundDate: '2026-11-16', process: '2도', purchaseOrderId: 'PO-1', purchaseOrderRound: '45차 발주'
};
const originalBox = {
  boxId: 'IN-SIMPLE-B001', managementId: record.managementId, productId: 'P1',
  number: 1, quantity: 100, status: '보관', rawStatus: '보관', storage: 'A-1', qrData: 'EXISTING-QR'
};
const original = () => ({ version: 1, products: [], orders: [], inbounds: [structuredClone(record)], records: [structuredClone(record)], boxes: [structuredClone(originalBox)] });
const payload = () => ({
  managementId: record.managementId, productId: 'P1', registrationMode: 'boxes-only',
  requestId: 'simple-request-123', boxQuantities: [80, 120], userName: '담당자'
});
const now = new Date('2026-11-18T01:00:00Z');

test('박스 수량만으로 등록해 오늘 날짜와 기존 위치를 적용하고 추가 박스 QR을 발급한다', () => {
  const before = original();
  const result = applyMutation('registerAdditionalProduction', payload(), before, now);
  assert.equal(result.result.addedBoxCount, 2);
  assert.equal(result.result.producedQuantity, 200);
  assert.equal(result.result.usedQuantity, 0);
  assert.deepEqual(result.result.boxIds, ['IN-SIMPLE-B002', 'IN-SIMPLE-B003']);
  assert.deepEqual(result.state.boxes[0], before.boxes[0]);
  assert.deepEqual(result.state.inbounds, before.inbounds);
  assert.equal(result.changes.inventoryBoxes.upserts.length, 2);
  assert.equal(result.changes.inventoryRecords.upserts.length, 1);
  for (const box of result.state.boxes.slice(1)) {
    assert.equal(box.productionDate, '2026-11-18');
    assert.equal(box.storage, record.storage);
    assert.equal(box.finalProcess, record.process);
    assert.equal(box.purchaseOrderId, record.purchaseOrderId);
    assert.equal(box.purchaseOrderRound, record.purchaseOrderRound);
    assert.deepEqual(box.productionSourceUses, []);
  }
  const row = buildInventoryDashboard(result.state.records, result.state.boxes).rows[0];
  assert.equal(row.currentBoxCount, '3 box');
  assert.equal(row.currentTotalQuantity, '300 ea');
  const qrs = applyMutation('getInboundBoxQrs', { managementId: record.managementId, productId: 'P1' }, result.state, now);
  const newQrs = qrs.result.boxes.filter(box => result.result.boxIds.includes(box.boxId));
  assert.equal(newQrs.length, 2);
  assert.ok(newQrs.every(box => box.qrData && box.isAdditionalProduction));
});

test('원재고가 있어도 수량을 차감하지 않으며 재요청은 같은 박스만 반환한다', () => {
  const state = original();
  const raw = { ...originalBox, boxId: 'RAW-B001', managementId: 'RAW', status: '사출재고', rawStatus: '사출재고' };
  state.boxes.push(raw);
  state.records.push({ ...record, managementId: 'RAW', recordKey: 'RAW|P1|A-1' });
  const first = applyMutation('registerAdditionalProduction', payload(), state, now);
  assert.deepEqual(first.state.boxes.find(box => box.boxId === raw.boxId), raw);
  const repeated = applyMutation('registerAdditionalProduction', payload(), first.state, new Date('2026-11-19T01:00:00Z'));
  assert.equal(repeated.result.alreadyRegistered, true);
  assert.deepEqual(repeated.result.boxIds, first.result.boxIds);
  assert.deepEqual(repeated.state, first.state);
  assert.equal(repeated.changes.inventoryBoxes.upserts.length, 0);
});

test('잘못된 수량과 요청 ID 재사용은 등록하지 않는다', () => {
  for (const boxQuantities of [[], [0], [-1], [1.5], Array(101).fill(1), [Number.MAX_SAFE_INTEGER, 1]]) {
    assert.throws(() => applyMutation('registerAdditionalProduction', { ...payload(), boxQuantities }, original(), now));
  }
  const first = applyMutation('registerAdditionalProduction', payload(), original(), now);
  assert.throws(() => applyMutation('registerAdditionalProduction', { ...payload(), boxQuantities: [10] }, first.state, now), /이미 처리/);
});

test('새 요청은 같은 입고 건의 다른 제품 박스 번호도 건너뛴다', () => {
  const state = original();
  state.boxes.push({ ...originalBox, boxId: 'IN-SIMPLE-B007', productId: 'P2', number: 7 });
  const result = applyMutation('registerAdditionalProduction', payload(), state, now);
  assert.deepEqual(result.result.boxIds, ['IN-SIMPLE-B008', 'IN-SIMPLE-B009']);
});

test('간단 등록 조회는 해당 입고 건만 읽고 이전 등록 방식은 사출 재고를 포함한다', async () => {
  const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts', import.meta.url), 'utf8'));
  const paths = [];
  const runtime = loadFunctions(source, ['loadAdditionalProductionState', 'mapInventoryRecordRows', 'mapInventoryBoxRows'], {
    loadStateVersion: async () => 1,
    databaseRows: async path => { paths.push(path); return []; }
  });
  await runtime.loadAdditionalProductionState(payload());
  assert.equal(paths.length, 2);
  assert.ok(paths.every(path => path.includes('management_id=eq.IN-SIMPLE')));
  paths.length = 0;
  await runtime.loadAdditionalProductionState({ managementId: record.managementId, productId: 'P1' });
  assert.ok(paths.every(path => path.includes('product_id=eq.P1')));
});
