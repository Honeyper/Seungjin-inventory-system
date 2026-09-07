import assert from "node:assert/strict";
import test from "node:test";
import { loadFunctions, mobileSource } from "./helpers/frontend-runtime.mjs";

function torchRuntime(options = {}) {
  let constraints = { width: { ideal: 1920 }, frameRate: { ideal: 30, max: 30 }, advanced: [{ focusMode: "continuous" }] };
  const calls = [];
  const messages = [];
  const attributes = {};
  const text = { textContent: "OFF" };
  const button = { disabled: false, setAttribute: (key, value) => { attributes[key] = value; }, classList: { toggle() {} }, querySelector: () => text };
  const track = {
    readyState: "live",
    getCapabilities: options.getCapabilities || (() => ({})),
    getSettings: options.getSettings || (() => ({})),
    getConstraints: () => structuredClone(constraints),
    async applyConstraints(value) {
      calls.push(structuredClone(value));
      if (options.rejectAdvancedTorch && value.advanced?.some((entry) => typeof entry.torch === "boolean")) {
        throw new Error("OverconstrainedError");
      }
      constraints = value;
    },
    stop() { this.readyState = "ended"; }
  };
  if (options.noApplyConstraints) delete track.applyConstraints;
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const app = loadFunctions(mobileSource, [
    "syncScannerTorchControl", "renderScannerTorchButton", "toggleScannerTorch",
    "applyScannerTrackControls", "getReusableScannerStream", "stopScannerCamera"
  ], {
    state: { scannerStream: stream, scannerInputMode: "camera", scannerTorchTrack: null, scannerCameraRequestPending: false },
    scannerTrackControlQueues: new WeakMap(),
    elements: { toggleFlashButton: button, scannerScreen: { hidden: false } },
    document: { hidden: false },
    window: { clearTimeout },
    pauseScannerDetection() {}, clearScannerCameraTuning() {},
    showToast: (message) => messages.push(message)
  });
  app.syncScannerTorchControl();
  return { app, track, calls, messages, attributes, text, button };
}

test("a live rear-camera track can probe torch even without capability metadata", async () => {
  const { app, calls, attributes, text } = torchRuntime();
  await app.toggleScannerTorch();
  assert.equal(calls[0].advanced.at(-1).torch, true);
  assert.equal(attributes["aria-pressed"], "true");
  assert.equal(text.textContent, "ON");
  await app.toggleScannerTorch();
  assert.equal(calls[1].advanced.at(-1).torch, false);
  assert.equal(attributes["aria-pressed"], "false");
  assert.equal(text.textContent, "OFF");
});

test("torch retries with a basic constraint when an Android browser rejects advanced", async () => {
  const { app, calls, text } = torchRuntime({ rejectAdvancedTorch: true });
  await app.toggleScannerTorch();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].advanced.at(-1).torch, true);
  assert.equal(calls[1].torch, true);
  assert.equal(calls[1].advanced.some((entry) => "torch" in entry), false);
  assert.equal(text.textContent, "ON");
});

test("a track without constraint control remains unavailable", async () => {
  const { app, calls, messages, attributes } = torchRuntime({ noApplyConstraints: true });
  await app.toggleScannerTorch();
  assert.equal(calls.length, 0);
  assert.equal(attributes["aria-pressed"], "false");
  assert.equal(attributes["aria-disabled"], "true");
  assert.match(messages[0], /사용할 수 없습니다/);
});

test("focus and exposure adjustments preserve the enabled torch and original video settings", async () => {
  const { app, track, calls } = torchRuntime();
  await app.toggleScannerTorch();
  await app.applyScannerTrackControls(track, { focusMode: "single-shot", pointsOfInterest: [{ x: 0.5, y: 0.5 }] });
  const focus = calls.at(-1);
  assert.equal(focus.advanced.some((entry) => entry.torch === true), true);
  assert.equal(focus.width.ideal, 1920);
  assert.equal(focus.frameRate.max, 30);
  assert.equal(focus.advanced.some((entry) => entry.focusMode === "continuous"), false);
  await app.toggleScannerTorch();
  const off = calls.at(-1);
  assert.equal(off.advanced.some((entry) => entry.torch === false), true);
  assert.equal(off.advanced.some((entry) => entry.torch === true), false);
  assert.equal(off.advanced.some((entry) => entry.focusMode === "single-shot"), true);
  for (let i = 0; i < 10; i += 1) {
    await app.applyScannerTrackControls(track, { focusMode: "continuous" });
  }
  assert.equal(calls.at(-1).advanced.filter((entry) => "torch" in entry).length, 1);
});

test("rapid taps coalesce and a simultaneous focus adjustment waits for the torch change", async () => {
  const { app, track, calls, button } = torchRuntime();
  const pending = Promise.withResolvers();
  const started = Promise.withResolvers();
  const apply = track.applyConstraints;
  track.applyConstraints = async (constraints) => {
    if (!calls.length) {
      await apply(constraints);
      started.resolve();
      await pending.promise;
    } else await apply(constraints);
  };
  const toggle = app.toggleScannerTorch();
  await started.promise;
  assert.equal(button.disabled, true);
  await app.toggleScannerTorch();
  const focus = app.applyScannerTrackControls(track, { focusMode: "single-shot" });
  assert.equal(calls.length, 1);
  pending.resolve();
  await Promise.all([toggle, focus]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].advanced.some((entry) => entry.torch === true), true);
  assert.equal(button.disabled, false);
});

test("constraint errors preserve the previous state and allow another attempt", async () => {
  const { app, track, messages, text, button } = torchRuntime();
  const apply = track.applyConstraints;
  track.applyConstraints = async () => { throw new Error("NotReadableError"); };
  await app.toggleScannerTorch();
  assert.equal(text.textContent, "OFF");
  assert.equal(button.disabled, false);
  assert.match(messages[0], /켤 수 없습니다/);
  track.applyConstraints = apply;
  await app.toggleScannerTorch();
  assert.equal(text.textContent, "ON");
});

test("closing the camera stops its track and resets the flashlight control", async () => {
  const { app, track, attributes, text, button } = torchRuntime();
  await app.toggleScannerTorch();
  app.stopScannerCamera();
  assert.equal(track.readyState, "ended");
  assert.equal(app.state.scannerStream, null);
  assert.equal(attributes["aria-pressed"], "false");
  assert.equal(text.textContent, "OFF");
  assert.equal(button.disabled, true);
});

test("a pending torch change cannot turn the button back on after closing the camera", async () => {
  const { app, track, text } = torchRuntime();
  const pending = Promise.withResolvers();
  const started = Promise.withResolvers();
  track.applyConstraints = async () => { started.resolve(); await pending.promise; };
  const toggle = app.toggleScannerTorch();
  await started.promise;
  app.stopScannerCamera();
  pending.resolve();
  await toggle;
  assert.equal(text.textContent, "OFF");
  assert.equal(app.state.scannerTorchEnabled, false);
});
