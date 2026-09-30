import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMutation, buildInventoryDashboard } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import { adminSource, loadFunctions } from './helpers/frontend-runtime.mjs';

const policy = globalThis.SeungjinInventoryConfirmation;
const now = new Date('2026-09-29T04:00:00Z');
const payload = { productId: 'P1', productName: '입고 확인', inboundDate: '2026-09-29', inboundTime: '12:00',
  inboundType: '정상입고', storage: 'A', boxQuantity: 100, inboundBoxCount: 2, remainderQuantities: [30] };
const initial = () => ({ products: [{ productId: 'P1', productName: '입고 확인', finalProcess: '1도' }],
  orders: [], inbounds: [], records: [], boxes: [] });

test('new inbound persists initial physical confirmation for full and remainder boxes', () => {
  const result = applyMutation('createInbound', payload, initial(), now);
  assert.equal(result.changes.inventoryBoxes.upserts.length, 3);
  for (const { data } of result.changes.inventoryBoxes.upserts) {
    assert.equal(data.lastInventoryCheckedAt, '2026-09-29 12:00');
    assert.equal(data.inventoryConfirmationSource, 'inbound');
    assert.equal(policy.isConfirmed(data, now), true);
  }
  const dashboard = at => buildInventoryDashboard(result.state.records, result.state.boxes, [], at);
  assert.equal(dashboard(now).attention.physicalMissingCount, 0);
  assert.equal(dashboard(new Date('2026-09-29T14:59:59Z')).attention.physicalMissingCount, 0);
  assert.equal(dashboard(new Date('2026-09-29T15:00:00Z')).attention.physicalMissingCount, 3);
});

test('backdated inbound and month-end expiry use inbound time, not the day of registration', () => {
  const result = applyMutation('createInbound', { ...payload, inboundDate: '2026-08-31' }, initial(), now);
  assert.equal(policy.expiresAt(result.state.boxes[0].lastInventoryCheckedAt), Date.parse('2026-09-29T15:00:00Z'));
  assert.equal(buildInventoryDashboard(result.state.records, result.state.boxes, [], new Date('2026-09-29T15:00:00Z')).attention.physicalMissingCount, 3);
});

test('inbound edits preserve later manual checks and do not restart the confirmation month', () => {
  let state = applyMutation('createInbound', payload, initial(), now).state;
  state.boxes[0].lastInventoryCheckedAt = '2026-09-29 12:30:00';
  state.boxes[0].inventoryConfirmationSource = 'manual';
  const id = state.records[0].managementId;
  state = applyMutation('updateInbound', { ...payload, managementId: id, note: '비고 수정' }, state, now).state;
  assert.equal(state.boxes[0].lastInventoryCheckedAt, '2026-09-29 12:30:00');
  assert.equal(state.boxes[0].inventoryConfirmationSource, 'manual');
  assert.equal(state.boxes[1].lastInventoryCheckedAt, '2026-09-29 12:00');
  state = applyMutation('updateInbound', { ...payload, managementId: id, storage: 'B' }, state, now).state;
  assert.equal(state.boxes[0].lastInventoryCheckedAt, '2026-09-29 12:30:00');
});

test('existing recent inbounds resolve without changing stored boxes, and later checks take precedence', () => {
  const row = { ...payload, managementId: 'OLD' };
  const boxes = [1, 2, 3, 4].map(number => ({ boxId: `B${number}`, managementId: 'OLD', productId: 'P1', number, quantity: 100, status: '보관' }));
  boxes[1].lastInventoryCheckedAt = '2026-09-29 12:30:00';
  boxes[2].status = '출고대기';
  boxes[3].status = '출고완료';
  const before = structuredClone(boxes);
  const current = buildInventoryDashboard([row], boxes, [], now).rows[0];
  assert.equal(current.inventoryConfirmedBoxCount, 2);
  assert.equal(current.inventoryUnconfirmedBoxCount, 0);
  assert.equal(current.lastInventoryCheckedAt, '2026-09-29 12:30:00');
  const due = buildInventoryDashboard([row], boxes, [], new Date('2026-09-29T15:00:00Z')).rows[0];
  assert.equal(due.inventoryUnconfirmedBoxCount, 2);
  assert.equal(due.inventoryConfirmedBoxCount, 0);
  assert.deepEqual(boxes, before);
});

test('old PC cache uses the same inbound rule and does not need a stock mutation to refresh counts', () => {
  const box = { number: 1, quantity: 100, status: '보관' };
  const row = { ...payload, activeShippingBoxes: [box], allShippingBoxes: [box], inventoryUnconfirmedBoxCount: 1 };
  const app = loadFunctions(adminSource, ['normalizeInventoryRows'], {
    window: { SeungjinInventoryConfirmation: policy }, normalizeInventoryStockStatus: value => value,
    normalizeInventoryProcessStatus: value => value, mergeShippingBoxDraft: value => value,
    getInventoryPhysicalConfirmationBoxes: item => item.activeShippingBoxes.filter(policy.isEligible),
    getInventoryAuditEligibleBoxes: item => item.activeShippingBoxes,
    isInventoryBoxConfirmed: policy.isConfirmed
  });
  const normalized = app.normalizeInventoryRows([row], now)[0];
  assert.equal(normalized.inventoryUnconfirmedBoxCount, 0);
  assert.equal(normalized.lastInventoryCheckedAt, '2026-09-29 12:00');
  assert.equal(box.lastInventoryCheckedAt, undefined);
});

test('invalid inbound dates never fabricate a confirmation; future inbounds stay unconfirmed', () => {
  const box = { quantity: 10, status: '보관' };
  for (const inbound of [{}, { inboundDate: '2026-02-30' }, { inboundDate: '2026-09-29', inboundTime: '25:00' }]) {
    assert.equal(policy.withInboundConfirmation(box, inbound), box);
  }
  assert.equal(policy.isConfirmed(policy.withInboundConfirmation(box, { ...payload, inboundDate: '2026-10-01' }), now), false);
});
