import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
const html = await readFile(new URL("../frontend/mobile/index.html", import.meta.url), "utf8");

test("external scanner submits completed JSON and box IDs without the idle fallback", () => {
  assert.match(source, /if \(!isJsonInputStillReceiving && isCompleteHardwareScannerValue\(bufferedValue\)\) \{\s*void submitHardwareScannerValue\(bufferedValue\);/);
  assert.match(source, /restoredValue\.startsWith\("\{"\) && restoredValue\.endsWith\("\}"\)/);
  assert.match(source, /return \/\^\[\^\\s\{\}\]\+-B\\d\{3\}\$\/i\.test\(restoredValue\);/);
});

test("external scanner starts the lookup as soon as the JSON box ID field is complete", () => {
  assert.match(source, /function extractHardwareScannerBoxId\(rawValue\)/);
  assert.match(source, /\(\?:b\|boxId\)/);
  assert.match(source, /state\.hardwareScannerEarlySubmittedValue = earlyBoxId;\s*queueHardwareScannerValue\(earlyBoxId\);/);
  assert.match(source, /if \(state\.hardwareScannerEarlySubmittedValue\) \{\s*resetHardwareScannerBuffer\(\);\s*return;/);
});

test("external scanner fallback adapts to its observed key interval and stays below half a second", () => {
  assert.match(source, /const HARDWARE_SCANNER_IDLE_SUBMIT_MIN_MS = 80;/);
  assert.match(source, /const HARDWARE_SCANNER_IDLE_SUBMIT_MAX_MS = 480;/);
  assert.match(source, /observedGap \* HARDWARE_SCANNER_IDLE_GAP_MULTIPLIER/);
  assert.match(source, /const submitDelayMs = getHardwareScannerIdleSubmitMs\(\);/);
  assert.doesNotMatch(source, /HARDWARE_SCANNER_IDLE_SUBMIT_MS = IS_LOW_POWER_SCANNER \? 1800 : 500/);
  assert.match(html, /mobile\.js\?v=20260903-hardware-scanner-fast-path-prd/);
});
