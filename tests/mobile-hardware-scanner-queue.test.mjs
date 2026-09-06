import assert from "node:assert/strict";
import test from "node:test";
import { createQrRuntime, inventoryFixture, loadFunctions, mobileSource } from "./helpers/frontend-runtime.mjs";
import "../frontend/qr-payload.js";

function scannerRuntime(t, workflow = "shipping") {
  const fixture = inventoryFixture(3, 30);
  const qr = createQrRuntime(fixture);
  qr.SeungjinQrPayload = globalThis.SeungjinQrPayload;
  const state = Object.assign(qr.state, {
    user: {}, activeWorkflow: workflow, scannerInputMode: "hardware",
    hardwareScannerBuffer: "", hardwareScannerBufferRevision: 0,
    hardwareScannerLastInputAt: 0, hardwareScannerMaxInputGapMs: 0,
    hardwareScannerLastStatusAt: 0, hardwareScannerQueue: [],
    hardwareScannerQueueProcessing: false, hardwareScannerQueuePromise: null,
    hardwareScannerSession: 0, hardwareScannerResults: { added: 0, duplicate: 0, failed: 0 },
    scannedShippingRows: [], scannedMoveRows: [], scannerSessionShippingKeys: [],
    isProcessingScan: false, scannerLastValue: ""
  });
  const calls = { matched: [], rendered: [], saved: [], delays: [], status: [], messages: [], actions: [] };
  const timers = new Set();
  const schedule = (fn, delay) => {
    calls.delays.push(delay);
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay);
    timers.add(timer);
    return timer;
  };
  t.after(() => timers.forEach(clearTimeout));
  const rows = () => workflow === "inventoryMove" ? state.scannedMoveRows : state.scannedShippingRows;
  const snapshot = () => rows().map((row) => row.scannedBoxId);
  const app = loadFunctions(mobileSource, [
    "resetHardwareScannerBuffer", "clearHardwareScannerStatusTimer", "getHardwareScannerIdleSubmitMs",
    "scheduleHardwareScannerSubmit", "appendHardwareScannerInput", "isHardwareScannerEditableTarget", "handleHardwareScannerKeydown",
    "handleHardwareScannerPaste", "handleHardwareScannerCompositionEnd", "isCompleteHardwareScannerValue",
    "shouldSubmitHardwareScannerValueImmediately", "submitHardwareScannerValue", "queueHardwareScannerValue",
    "isHardwareScannerBusy", "renderHardwareScannerProgress", "finishHardwareScannerInput",
    "scheduleHardwareScannerView", "flushHardwareScannerView", "waitForScannerProcessingToFinish",
    "processHardwareScannerQueue", "drainHardwareScannerQueue", "handleQrValue", "closeScanner",
    "releaseScannerStream", "handleScannerPendingAction", "handleScannerDoneAction"
  ], {
    state, elements: { scannerScreen: { hidden: false } },
    window: { setTimeout: schedule, clearTimeout }, clearTimeout, HTMLElement: class {},
    HARDWARE_SCANNER_IDLE_SUBMIT_MIN_MS: 80, HARDWARE_SCANNER_IDLE_SUBMIT_MAX_MS: 480,
    HARDWARE_SCANNER_IDLE_GAP_MULTIPLIER: 4, HARDWARE_SCANNER_FAST_SUBMIT_MIN_LENGTH: 10,
    HARDWARE_SCANNER_SHORT_INPUT_SUBMIT_MS: 900, HARDWARE_SCANNER_INTER_KEY_RESET_MS: 1400,
    HARDWARE_SCANNER_STATUS_UPDATE_MS: 70, HARDWARE_SCANNER_RENDER_INTERVAL_MS: 100,
    HARDWARE_SCANNER_BATCH_SIZE: 8, SCAN_PROCESSING_LOCK_MS: 380,
    SCAN_SUCCESS_VIBRATION: [], SCAN_DUPLICATE_VIBRATION: [],
    INVENTORY_MOVE_SCAN_ACTIONS: { move: { label: "move" } },
    SeungjinQrPayload: globalThis.SeungjinQrPayload,
    restoreHardwareScannerQrValue: (value) => String(value).trim(),
    parseQrValue: qr.parseQrValue, isParsedQrIdentityConsistent: qr.isParsedQrIdentityConsistent,
    ensureDashboardLoaded: async () => {}, loadShippingDashboard: async () => true,
    findShippingByQrValue(value) { calls.matched.push(value); return qr.findShippingByQrValue(value); },
    findInventoryMoveByQrValue(value) { calls.matched.push(value); return qr.findInventoryMoveByQrValue(value); },
    getShippingKey: (row) => row.scannedBoxId, getInventoryMoveKey: (row) => row.scannedBoxId,
    getInventoryMoveScanAction: () => "move", isCompletedShippingItem: () => false,
    renderScannerScannedList: () => calls.rendered.push(snapshot()),
    saveScannedShippingRows: () => calls.saved.push(snapshot()),
    saveScannedMoveRows: () => calls.saved.push(snapshot()),
    setHardwareScannerStatus: (message) => calls.status.push(message),
    showToast: (message) => calls.messages.push(message), setScannerHelp() {}, triggerScanFeedback() {},
    updateScannerActionLabels() {}, stopScannerCamera() {}, flushScannerViewUpdates() {},
    openScannedShippingConfirmModal: (action) => calls.actions.push(action),
    openScannedInventoryMoveConfirmModal: (action) => calls.actions.push(action)
  });
  const ids = fixture.flatMap((row) => row.allShippingBoxes.map((box) => box.boxId));
  const key = (value, options = {}) => app.handleHardwareScannerKeydown({ key: value, preventDefault() {}, ...options });
  const scan = (value, terminator = "Enter") => {
    for (const character of value) key(character);
    if (terminator) key(terminator);
  };
  return { app, state, calls, ids, scan, key, snapshot };
}

for (const workflow of ["shipping", "inventoryMove"]) {
  test(`${workflow}: 60 scans queue during a slow first lookup and register in FIFO order`, async (t) => {
    const { app, state, calls, ids, scan, snapshot } = scannerRuntime(t, workflow);
    const gate = Promise.withResolvers();
    const started = Promise.withResolvers();
    app.ensureDashboardLoaded = () => { started.resolve(); return gate.promise; };
    const payloads = ids.slice(0, 60).map(globalThis.SeungjinQrPayload.create);
    scan(payloads[0]);
    await started.promise;
    payloads.slice(1).forEach((value, index) => scan(value, index % 2 ? "Tab" : "Enter"));
    assert.equal(app.isHardwareScannerBusy(), true);
    assert.equal(state.hardwareScannerBuffer, "");
    assert.equal(state.hardwareScannerQueue.length, 59);
    app.handleScannerPendingAction();
    app.handleScannerDoneAction();
    assert.deepEqual(calls.actions, []);
    gate.resolve();
    await app.processHardwareScannerQueue();
    assert.deepEqual(calls.matched, payloads);
    assert.deepEqual(Array.from(snapshot()).reverse(), ids.slice(0, 60));
    assert.equal(state.hardwareScannerResults.added, 60);
    assert.equal(state.hardwareScannerResults.failed, 0);
    assert.equal(app.isHardwareScannerBusy(), false);
    assert.ok(calls.rendered.length < 10, `unexpected render count ${calls.rendered.length}`);
    assert.equal(calls.saved.at(-1).length, 60);
    assert.ok(!calls.delays.includes(40), "hardware processing must not use a per-item cooldown");
    assert.deepEqual(calls.messages, [], "success toasts should not interrupt a burst");
    assert.match(calls.status.at(-1), /등록 60/);
    assert.doesNotMatch(calls.status.at(-1), /대기/);
    app.handleScannerPendingAction();
    assert.equal(calls.actions.length, 1);
  });
}

test("duplicate and malformed scans do not block later valid scans", async (t) => {
  const { app, state, ids, scan, snapshot } = scannerRuntime(t);
  const first = globalThis.SeungjinQrPayload.create(ids[0]);
  const bad = `${ids[1]}~${globalThis.SeungjinQrPayload.getChecksum(ids[1]) === "000000" ? "FFFFFF" : "000000"}`;
  scan(first, "");
  scan(bad, "");
  scan(first, "");
  scan(globalThis.SeungjinQrPayload.create(ids[2]), "");
  await app.processHardwareScannerQueue();
  assert.deepEqual(Array.from(snapshot()).reverse(), [ids[0], ids[2]]);
  assert.equal(state.hardwareScannerResults.added, 2);
  assert.equal(state.hardwareScannerResults.duplicate, 1);
  assert.equal(state.hardwareScannerResults.failed, 1);
});

test("CR/LF/Tab paste bursts and complete JSON frames are split without merging codes", async (t) => {
  const { app, ids, snapshot } = scannerRuntime(t);
  const json = JSON.stringify({ b: ids[2], m: ids[2].replace(/-B\d+$/, "") });
  app.handleHardwareScannerPaste({
    clipboardData: { getData: () => `${ids[0]}\r\n${ids[1]}\t${json}\n${ids[3]}` }, preventDefault() {}
  });
  await app.processHardwareScannerQueue();
  assert.deepEqual(Array.from(snapshot()).reverse(), ids.slice(0, 4));
});

test("a plain ID waits for its checksum suffix, and repeated scanner characters are retained", async (t) => {
  const { app, state, ids, key, snapshot } = scannerRuntime(t);
  let previous = "";
  for (const character of ids[0]) {
    key(character, { repeat: character === previous });
    previous = character;
  }
  assert.equal(state.hardwareScannerBuffer, ids[0]);
  assert.equal(state.hardwareScannerQueue.length, 0);
  for (const character of `~${globalThis.SeungjinQrPayload.getChecksum(ids[0])}`) key(character);
  await app.processHardwareScannerQueue();
  assert.deepEqual(Array.from(snapshot()), [ids[0]]);
});

test("a closing brace inside a JSON field cannot truncate a scan", async (t) => {
  const { app, ids, scan, snapshot } = scannerRuntime(t);
  const json = JSON.stringify({ b: ids[0], m: ids[0].replace(/-B\d+$/, ""), metadata: { note: "brace } inside" } });
  scan(json);
  await app.processHardwareScannerQueue();
  assert.deepEqual(Array.from(snapshot()), [ids[0]]);
  assert.equal(app.state.hardwareScannerResults.failed, 0);
});

test("a delayed idle timer cannot discard the previous complete scan", async (t) => {
  const { app, state, ids, snapshot } = scannerRuntime(t);
  state.hardwareScannerBuffer = ids[0];
  state.hardwareScannerLastInputAt = Date.now() - 5000;
  app.appendHardwareScannerInput(globalThis.SeungjinQrPayload.create(ids[1]));
  await app.processHardwareScannerQueue();
  assert.deepEqual(Array.from(snapshot()).reverse(), ids.slice(0, 2));
});

test("a failed lookup does not stop or lock the queue", async (t) => {
  const { app, state, ids, scan, snapshot } = scannerRuntime(t);
  let attempts = 0;
  app.ensureDashboardLoaded = async () => { if (++attempts === 1) throw new Error("temporary failure"); };
  ids.slice(0, 3).forEach((id) => scan(id));
  await app.processHardwareScannerQueue();
  assert.deepEqual(Array.from(snapshot()).reverse(), ids.slice(1, 3));
  assert.equal(state.hardwareScannerResults.failed, 1);
  assert.equal(state.isProcessingScan, false);
  scan(ids[0]);
  await app.processHardwareScannerQueue();
  assert.equal(snapshot().length, 3);
});

test("focused action radios accept scanner input while editable fields keep their own input", async (t) => {
  const { app, ids, key, snapshot } = scannerRuntime(t);
  const target = new app.HTMLElement();
  target.type = "radio";
  target.matches = (selector) => selector === "input";
  for (const character of ids[0]) key(character, { target });
  key("Enter", { target });
  await app.processHardwareScannerQueue();
  assert.deepEqual(Array.from(snapshot()), [ids[0]]);
  for (const type of ["text", "password", "number", "search"]) {
    target.type = type;
    for (const character of ids[1]) key(character, { target });
    key("Enter", { target });
  }
  assert.equal(app.state.hardwareScannerBuffer, "");
  assert.equal(snapshot().length, 1);
});

test("closing the scanner drains accepted scans and flushes their saved list first", async (t) => {
  const { app, state, ids, scan, calls } = scannerRuntime(t);
  const gate = Promise.withResolvers();
  app.ensureDashboardLoaded = () => gate.promise;
  scan(ids[0]);
  scan(ids[1], "");
  const closing = app.closeScanner();
  assert.equal(app.elements.scannerScreen.hidden, false);
  gate.resolve();
  await closing;
  assert.equal(app.elements.scannerScreen.hidden, true);
  assert.equal(calls.saved.at(-1).length, 2);
  assert.equal(state.hardwareScannerBuffer, "");
});

test("logout or navigation invalidates an in-flight lookup before it can append stale rows", async (t) => {
  const { app, state, ids, scan, snapshot } = scannerRuntime(t);
  const gate = Promise.withResolvers();
  const started = Promise.withResolvers();
  app.ensureDashboardLoaded = () => { started.resolve(); return gate.promise; };
  scan(ids[0]);
  scan(ids[1]);
  const draining = app.processHardwareScannerQueue();
  await started.promise;
  app.releaseScannerStream();
  state.user = null;
  state.activeWorkflow = "inventoryMove";
  gate.resolve();
  await draining;
  assert.equal(snapshot().length, 0);
  assert.equal(state.scannedMoveRows.length, 0);
  assert.equal(state.hardwareScannerQueue.length, 0);
});

test("camera mode keeps its existing cooldown and immediate list persistence", async (t) => {
  const { app, state, ids, calls } = scannerRuntime(t);
  state.scannerInputMode = "camera";
  assert.equal(await app.handleQrValue(ids[0]), "added");
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.rendered.length, 1);
  assert.equal(state.isProcessingScan, true);
  assert.ok(calls.delays.includes(380));
});
