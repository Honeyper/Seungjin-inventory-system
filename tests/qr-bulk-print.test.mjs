import test from 'node:test';
import assert from 'node:assert/strict';
import { adminSource, loadFunctions } from './helpers/frontend-runtime.mjs';

const row = (id, productId = id) => ({ managementId: id, productId, productName: `Product ${productId}` });
function loader(rows, requestApi) {
  const app = loadFunctions(adminSource, ['getInboundQrSelectionKey', 'updateInboundQrSelection', 'openSelectedInboundQrModal', 'escapeHtml'], {
    state: { inboundQrSelection: new Set(rows.map(r => JSON.stringify([r.managementId, r.productId]))) },
    getFilteredInbounds: () => rows, inboundQrLoadToken: 0, requestApi,
    inboundQrModal: { hidden: true }, inboundQrSheet: { innerHTML: '' }, inboundQrTitle: {}, inboundQrSubtitle: {},
    printInboundQrButton: {}, selectAllInboundQrs: {}, inboundQrSelectionCount: {},
    clearInboundQrSelectionButton: {}, printSelectedInboundQrsButton: {},
    document: { body: { classList: { add() {} } } }, updateInboundQrLayoutButtons() {}, resetModalScrollPosition() {},
    setInboundQrPrintLoading(value) { app.disabled = value; },
    markInboundQrGenerated(id, product, count) { app.marked.push([id, product, count]); },
    renderInboundQrGroups(groups) { app.rendered = groups; }, marked: []
  });
  return app;
}

test('batch loads each inbound/product once with at most two requests, keeps selection order and all box data', async () => {
  let active = 0, peak = 0;
  const rows = [row('A'), row('A', 'A2'), row('B'), row('B')];
  const app = loader(rows, async (action, payload) => {
    assert.equal(action, 'getInboundBoxQrs'); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, payload.managementId === 'A' ? 5 : 1)); active--;
    return { boxes: [{ boxId: payload.productId, sequence: 1 }], productProcessInfo: { id: payload.productId } };
  });
  await app.openSelectedInboundQrModal();
  assert.equal(peak, 2);
  assert.deepEqual(Array.from(app.rendered, g => g.inbound.productId), ['A', 'A2', 'B']);
  assert.equal(app.rendered[1].boxes[0].boxId, 'A2');
  assert.equal(app.rendered[1].productProcessInfo.id, 'A2');
  assert.equal(app.state.isLoadingInboundQrs, false);
  assert.equal(app.marked.length, 3);
});

test('one failed or empty inbound blocks partial printing and preserves selection for retry', async () => {
  for (const empty of [false, true]) {
    const app = loader([row('A'), row('B')], async (_, payload) => {
      if (payload.managementId === 'B') {
        if (empty) return { boxes: [] };
        throw new Error('offline');
      }
      return { boxes: [{ boxId: 'A-1' }] };
    });
    await app.openSelectedInboundQrModal();
    assert.equal(app.rendered, undefined);
    assert.equal(app.disabled, true);
    assert.equal(app.state.inboundQrSelection.size, 2);
    assert.ok(app.inboundQrSheet.innerHTML.includes('Product B'));
    assert.equal(app.state.isLoadingInboundQrs, false);
  }
});

test('closing an in-flight batch prevents stale results from changing a later dialog', async () => {
  let resolve;
  const app = loader([row('A')], () => new Promise(r => { resolve = r; }));
  const pending = app.openSelectedInboundQrModal();
  app.inboundQrLoadToken++;
  app.state.activeQrGroups = ['new-dialog'];
  resolve({ boxes: [{ boxId: 'old' }] });
  await pending;
  assert.equal(app.rendered, undefined);
  assert.equal(app.marked.length, 0);
  assert.deepEqual(app.state.activeQrGroups, ['new-dialog']);
});

test('search changes remove hidden selections, while pagination retains filtered selections', () => {
  const rows = [row('A'), row('B')], app = loader(rows, async () => ({}));
  app.updateInboundQrSelection(rows);
  assert.equal(app.selectAllInboundQrs.checked, true);
  assert.equal(app.state.inboundQrSelection.size, 2);
  app.updateInboundQrSelection([rows[1]]);
  assert.equal(app.state.inboundQrSelection.size, 1);
  app.updateInboundQrSelection([]);
  assert.equal(app.printSelectedInboundQrsButton.disabled, true);
  assert.equal(app.selectAllInboundQrs.disabled, true);
});

test('mixed product labels are contiguous and keep original per-inbound totals, process, date and QR payload', () => {
  const labels = [], classList = { toggle() {} };
  const app = loadFunctions(adminSource, ['renderInboundQrSheet', 'renderInboundQrGroups'], {
    state: { inboundQrLayout: 'standard', activeQrGroups: [true] }, inboundQrSheet: { classList }, inboundQrSubtitle: {},
    document: { documentElement: { classList }, body: { classList } }, inboundQrRenderToken: 0,
    getInboundQrProcessData: (inbound, boxes, info) => info, formatInboundQrBatch: v => v, formatInboundQrDate: v => v,
    renderInboundQrReferenceLabel: data => { labels.push(data); return `[${data.productName}:${data.sequence}]`; },
    setInboundQrPrintLoading() {}, hydrateInboundQrImages() {}, SeungjinQrPayload: { create: id => `qr:${id}` }
  });
  const groups = [3, 4, 3].map((count, index) => ({ inbound: { ...row(String(index)), inboundDate: `date${index}`, batch: `batch${index}` },
    boxes: Array.from({ length: count }, (_, i) => ({ boxId: `${index}-${i}`, sequence: i + 1 })), productProcessInfo: { final: index + 1 } }));
  app.renderInboundQrGroups(groups);
  assert.equal(labels.length, 10);
  assert.equal(labels[3].sequence, 1); assert.equal(labels[3].total, 4);
  assert.equal(labels[3].processData.final, 2); assert.equal(labels[3].inboundDate, 'date1');
  assert.equal(labels[3].qrData, 'qr:1-0');
  assert.equal(app.inboundQrSubtitle.textContent, '3건 · QR 10개 · A4 1장');
  assert.ok(!app.inboundQrSheet.innerHTML.includes('page-break'));
  labels.length = 0; app.state.inboundQrLayout = 'work'; app.renderInboundQrGroups(groups);
  assert.equal(labels[0].variantClass, 'box-qr-label-layout-two');
  app.state.activeQrGroups = []; app.renderInboundQrSheet(groups[0].inbound, groups[0].boxes, groups[0].productProcessInfo);
  assert.equal(labels.at(-1).total, 3);
});

test('failed QR images cannot enable printing of blank labels', async () => {
  const image = { complete: true, naturalWidth: 0, dataset: { qrValue: 'A' } };
  const app = loadFunctions(adminSource, ['hydrateInboundQrImages', 'waitForQrImage'], {
    inboundQrSheet: { querySelectorAll: () => [image] }, inboundQrRenderToken: 1, INBOUND_QR_RENDER_BATCH_SIZE: 24,
    getQrImageUrl: () => 'broken', inboundQrSubtitle: {}, printInboundQrButton: {},
    setInboundQrPrintLoading: value => { app.disabled = value; }
  });
  await app.hydrateInboundQrImages(1);
  assert.equal(app.disabled, true);
  assert.equal(app.printInboundQrButton.textContent, '인쇄 불가');
});
