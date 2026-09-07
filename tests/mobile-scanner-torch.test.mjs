import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const mobileSource = readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");

function loadFunctions(source, names, globals = {}) {
  const context = vm.createContext(globals);
  for (const name of names) {
    const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?\\n\\}`, "m"));
    assert.ok(match, `Missing function: ${name}`);
    vm.runInContext(match[0], context);
  }
  return context;
}

function torchRuntime(options = {}) {
  let constraints = {
    width: { ideal: 1920 },
    frameRate: { ideal: 30, max: 30 },
    advanced: [{ focusMode: "continuous" }]
  };
  const calls = [];
  const messages = [];
  const attributes = {};
  const text = { textContent: "OFF" };
  const button = {
    disabled: false,
    setAttribute: (key, value) => { attributes[key] = value; },
    classList: { toggle() {} },
    querySelector: () => text
  };
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
    state: {
      scannerStream: stream,
      scannerInputMode: "camera",
      scannerTorchTrack: null,
      scannerCameraRequestPending: false
    },
    scannerTrackControlQueues: new WeakMap(),
    elements: { toggleFlashButton: button, scannerScreen: { hidden: false } },
    document: { hidden: false },
    window: { clearTimeout },
    pauseScannerDetection() {},
    clearScannerCameraTuning() {},
    showToast: (message) => messages.push(message)
  });
  app.syncScannerTorchControl();
  return { app, track, calls, messages, attributes, text, button };
}

test("a live rear-camera track can probe torch even without capability metadata", async () => {
  const { app, calls, attributes, text } = torchRuntime();
  assert.equal(app.state.scannerTorchSupported, true);
  await app.toggleScannerTorch();
  assert.equal(calls[0].advanced.at(-1).torch, true);
  assert.equal(attributes["aria-pressed"], "true");
  assert.equal(text.textContent, "ON");
  await app.toggleScannerTorch();
  assert.equal(calls[1].advanced.at(-1).torch, false);
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
  assert.equal(attributes["aria-disabled"], "true");
  assert.match(messages[0], /사용할 수 없습니다/);
});

test("focus adjustments preserve the enabled torch and original video settings", async () => {
  const { app, track, calls } = torchRuntime();
  await app.toggleScannerTorch();
  await app.applyScannerTrackControls(track, { focusMode: "single-shot", pointsOfInterest: [{ x: 0.5, y: 0.5 }] });
  const focus = calls.at(-1);
  assert.equal(focus.advanced.some((entry) => entry.torch === true), true);
  assert.equal(focus.width.ideal, 1920);
  assert.equal(focus.frameRate.max, 30);
  assert.equal(focus.advanced.some((entry) => entry.focusMode === "continuous"), false);
});

test("constraint errors keep the previous torch state and allow another attempt", async () => {
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

test("closing the camera resets the flashlight state", async () => {
  const { app, track, attributes, text, button } = torchRuntime();
  await app.toggleScannerTorch();
  app.stopScannerCamera();
  assert.equal(track.readyState, "ended");
  assert.equal(app.state.scannerStream, null);
  assert.equal(attributes["aria-pressed"], "false");
  assert.equal(text.textContent, "OFF");
  assert.equal(button.disabled, true);
});
