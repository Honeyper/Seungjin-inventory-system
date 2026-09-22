import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyMutation, buildInventoryDashboard } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import { commonContainerInfo } from '../supabase/functions/seungjin-dev-gateway/common-container-shipping.js';
const now = new Date('2026-09-22T03:00:00Z');
function fixture() {
  return {
    products: [{ productId: 'P1', productName: '공용 용기', isCommonContainer: true, shippingProductNames: ['쉐딩', '블러쉬'] }],
    orders: [], inbounds: [],
    records: [{ recordKey: 'IN-1|P1|A', managementId: 'IN-1', productId: 'P1', productName: '공용 용기', storage: 'A', inboundTotalQuantity: '300 ea' }],
    boxes: [1, 2, 3].map(number => ({ boxId: `B${number}`, managementId: 'IN-1', productId: 'P1', number, quantity: 100, storage: 'A', status: '출고대기', rawStatus: '출고대기' }))
  };
}
function payload(overrides = {}) {
  return { managementId: 'IN-1', productId: 'P1', selectedBoxes: [1, 2], status: '출고완료', shippingType: '정상출고', shipper: '검증',
    shippingAllocations: [
      { boxId: 'B1', products: [{ productName: '쉐딩', quantity: 100 }] },
      { boxId: 'B2', products: [{ productName: '쉐딩', quantity: 30 }, { productName: '블러쉬', quantity: 70 }] }
    ], ...overrides };
}
test('단일·혼합 박스 출고: 원재고에서 선택 박스만 차감하고 제품별 이력이 재조회에서도 유지된다', () => {
  const input = fixture(); const result = applyMutation('updateShippingStatus', payload(), input, now);
  assert.equal(input.boxes[0].status, '출고대기');
  assert.deepEqual(result.state.boxes[2], input.boxes[2]);
  assert.deepEqual(result.state.boxes[1].shippingAllocations, payload().shippingAllocations[1].products);
  assert.equal(result.state.boxes[0].commonContainerShippingHistory[0].action, '출고완료');
  assert.equal(result.state.products[0].productName, '공용 용기');
  const restored = JSON.parse(JSON.stringify(result.state));
  const row = buildInventoryDashboard(restored.records, restored.boxes, restored.products, now).rows[0];
  assert.equal(row.currentTotalQuantity, '100 ea');
  assert.equal(row.currentBoxCount, '1 box');
  assert.equal(row.isCommonContainer, true);
  assert.deepEqual(row.shippingProductNames, ['쉐딩', '블러쉬']);
  const totals = new Map();
  row.shippedShippingBoxes.forEach(box => box.shippingAllocations.forEach(item => totals.set(item.productName, (totals.get(item.productName) || 0) + item.quantity)));
  assert.equal(totals.get('쉐딩'), 130); assert.equal(totals.get('블러쉬'), 70);
  assert.ok(result.changes.inventoryBoxes.upserts.every(row => row.data.shippingAllocations.length));
});
test('잘못된 제품·중복·음수·소수·합계·박스 위조·누락 요청은 전체 거절한다', () => {
  const bad = [
    undefined, [], {},
    [{ boxId: 'B1', products: [{ productName: '미등록', quantity: 100 }] }],
    [{ boxId: 'B1', products: [{ productName: '쉐딩', quantity: 50 }, { productName: '쉐딩', quantity: 50 }] }],
    [{ boxId: 'B1', products: [{ productName: '쉐딩', quantity: -1 }] }],
    [{ boxId: 'B1', products: [{ productName: '쉐딩', quantity: 99.5 }, { productName: '블러쉬', quantity: 0.5 }] }],
    [{ boxId: 'B1', products: [{ productName: '쉐딩', quantity: 99 }] }],
    [{ boxId: 'B3', products: [{ productName: '쉐딩', quantity: 100 }] }],
    [payload().shippingAllocations[0], payload().shippingAllocations[0]]
  ];
  for (const shippingAllocations of bad) {
    const source = fixture(), before = structuredClone(source);
    assert.throws(() => applyMutation('updateShippingStatus', payload({ shippingAllocations }), source, now));
    assert.deepEqual(source, before);
  }
});
test('변경된 최신 수량과 실제 박스보다 적은 출고 수량을 조용히 차감하지 않는다', () => {
  const source = fixture(); source.boxes[0].quantity = 120;
  assert.throws(() => applyMutation('updateShippingStatus', payload(), source, now), /합계/);
  assert.throws(() => applyMutation('updateShippingStatus', payload({ boxQuantities: { 1: 100 } }), source, now), /수량이 변경/);
  assert.throws(() => applyMutation('updateShippingStatus', payload({ boxQuantities: { 1: 50 } }), fixture(), now), /수량이 변경/);
});
test('출고 취소는 원재고 복구, 배분 초기화, 취소 전 제품명 보존 후 재출고 가능', () => {
  const completed = applyMutation('updateShippingStatus', payload(), fixture(), now).state;
  const cancelled = applyMutation('updateShippingStatus', payload({ status: '보관', allowCancelCompleted: true, shippingAllocations: undefined }), completed, now).state;
  assert.deepEqual(cancelled.boxes[0].shippingAllocations, []);
  assert.equal(cancelled.boxes[0].commonContainerShippingHistory[1].action, '출고취소');
  assert.equal(buildInventoryDashboard(cancelled.records, cancelled.boxes, cancelled.products, now).rows[0].currentTotalQuantity, '300 ea');
  assert.throws(() => applyMutation('updateShippingStatus', payload({ shippingAllocations: undefined }), cancelled, now), /제품을 선택/);
  const resent = applyMutation('updateShippingStatus', payload({ forceCompleteShipping: true, autoShippingInspection: true, inspectionQuantity: 10 }), cancelled, now).state;
  assert.equal(resent.boxes[0].commonContainerShippingHistory.length, 3);
});
test('같은 출고를 다시 요청해도 중복 저장하지 않는다', () => {
  const state = applyMutation('updateShippingStatus', payload(), fixture(), now).state;
  const before = structuredClone(state);
  assert.throws(() => applyMutation('updateShippingStatus', payload(), state, now), /이미 출고/);
  assert.deepEqual(state, before);
});
test('일반 제품과 이관·반출·재고조정은 기존 방식 유지, 공용용기 설정 변경 검증', () => {
  const ordinary = fixture(); ordinary.products[0].isCommonContainer = false;
  assert.equal(applyMutation('updateShippingStatus', payload({ shippingAllocations: undefined }), ordinary, now).result.updatedBoxRows, 2);
  assert.throws(() => applyMutation('updateShippingStatus', payload(), ordinary, now), /설정이 변경/);
  for (const shippingType of ['이관(외주)', '반출', '재고조정']) {
    assert.equal(applyMutation('updateShippingStatus', payload({ shippingType, shippingAllocations: undefined }), fixture(), now).result.updatedBoxRows, 2);
  }
  const renamed = fixture(); renamed.products[0].shippingProductNames = ['새 제품'];
  assert.throws(() => applyMutation('updateShippingStatus', payload(), renamed, now), /등록 목록/);
});
test('출고대기 배분은 완료 시 다시 검증하며, 제품명 레거시 형식도 읽는다', () => {
  const pending = applyMutation('updateShippingStatus', payload({ status: '출고대기' }), fixture(), now).state;
  assert.equal(applyMutation('updateShippingStatus', payload({ shippingAllocations: undefined }), pending, now).result.updatedBoxRows, 2);
  assert.deepEqual(commonContainerInfo({ commonContainerProduct: '유', shippingProductNames: '["A","B"]' }), { isCommonContainer: true, shippingProductNames: ['A', 'B'] });
});
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../frontend/common-container-shipping.js', import.meta.url), 'utf8'), context);
const ui = context.SeungjinCommonShipping;
test('공통 입력 검증·이력 요약은 혼합 박스에서도 중복 수량 없이 합산한다', () => {
  assert.equal(ui.allocationError({ number: 1, quantity: 100 }, [{ productName: 'A', quantity: 40 }, { productName: 'B', quantity: 60 }], ['A', 'B']), '');
  assert.match(ui.allocationError({ number: 1, quantity: 100 }, [{ productName: 'A', quantity: 90 }], ['A']), /10 ea/);
  assert.equal(ui.summary([{ shippingAllocations: [{ productName: 'A', quantity: 100 }] }, { shippingAllocations: [{ productName: 'A', quantity: 30 }, { productName: 'B', quantity: 70 }] }]), 'A · 130 ea / B · 70 ea');
});
test('일반 제품은 제품 지정 팝업 없이 기존 요청 유지; 취소·반출에는 읽기도 추가하지 않는다', async () => {
  let reads = 0;
  const request = async () => { reads++; return { product: { productId: 'P1', isCommonContainer: false } }; };
  const normal = payload({ shippingAllocations: undefined });
  assert.equal(await ui.prepare('updateShippingStatus', normal, request), normal);
  assert.equal(reads, 1);
  for (const extra of [{ status: '보관' }, { status: '출고대기' }, { shippingType: '반출' }]) {
    const value = { ...normal, ...extra };
    assert.equal(await ui.prepare('updateShippingStatus', value, request), value);
  }
  assert.equal(reads, 1);
});

test('출고 준비 조회는 QR 생성 기록을 바꾸는 API를 사용하지 않는다', () => {
  const frontend = readFileSync(new URL('../frontend/common-container-shipping.js', import.meta.url), 'utf8');
  const edge = readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts', import.meta.url), 'utf8');
  assert.ok(!frontend.includes('getInboundBoxQrs'));
  const handler = edge.slice(edge.indexOf('  if (action === "getCommonContainerShipping")'), edge.indexOf('  if (action === "getInboundBoxQrs") {\n    const result'));
  assert.ok(handler.includes('readCommonContainerShipping(payload)'));
  assert.ok(!handler.includes('scheduleInboundQrStatusUpdate'));
});

test('운영의 관리 ID 단위 조회도 실제 제품을 검증하며 제품 전체 입고 집계는 덮어쓰지 않는다', () => {
  const scoped = fixture();
  scoped.shippingProductReferences = scoped.products;
  scoped.products = [];
  const result = applyMutation('updateShippingStatus', payload(), scoped, now);
  assert.deepEqual(result.changes.products.upserts, []);
  assert.equal(result.state.boxes[0].shippingAllocations[0].productName, '쉐딩');
  assert.throws(() => applyMutation('updateShippingStatus', payload({ shippingAllocations: undefined }), scoped, now), /실제 출고 제품/);
  const edge = readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts', import.meta.url), 'utf8');
  assert.ok(edge.includes('shippingProductReferences: productRows.map((row) => row.data)'));
  assert.ok(edge.includes('const needsProductDefinition = needsProductScope || ["출고대기", "출고완료"].includes(status)'));
});
