import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
const html = await readFile(new URL("../frontend/mobile/index.html", import.meta.url), "utf8");

test("external scanner submits completed JSON and box IDs without the idle fallback", () => {
  assert.match(source, /if \(!isJsonInputStillReceiving && shouldSubmitHardwareScannerValueImmediately\(bufferedValue\)\) \{\s*void submitHardwareScannerValue\(bufferedValue\);/);
  assert.match(source, /restoredValue\.startsWith\("\{"\) && restoredValue\.endsWith\("\}"\)/);
  assert.match(source, /return \/\^\[\^\\s\{\}\]\+-B\\d\{3\}\$\/i\.test\(restoredValue\);/);
  assert.match(source, /qrPayload\.isValid && \/\^\[\^\\s\{\}\]\+-B\\d\{3\}\$\/i\.test\(qrPayload\.boxId\)/);
  assert.match(source, /SeungjinQrPayload\?\.parse\?\.\(restoredValue\)\?\.hasChecksum/);
});

test("external scanner never submits a partial JSON payload", () => {
  assert.doesNotMatch(source, /hardwareScannerEarlySubmittedValue|extractHardwareScannerBoxId/);
  assert.match(source, /const isJsonInputStillReceiving = bufferedValue\.startsWith\("\{"\) && !bufferedValue\.endsWith\("\}"\);/);
  assert.match(source, /if \(!isJsonInputStillReceiving && shouldSubmitHardwareScannerValueImmediately\(bufferedValue\)\)/);
  assert.doesNotMatch(source, /if \(!isJsonInputStillReceiving && isCompleteHardwareScannerValue\(bufferedValue\)\)/);
});

test("box QR matching requires the exact box instead of substituting another box", () => {
  assert.match(source, /const hasExactBoxIdentity = Boolean\(parsed\.boxId \|\| parsed\.boxNumber\);/);
  assert.match(source, /if \(!hasExactBoxIdentity\) \{\s*return null;\s*\}/);
  assert.doesNotMatch(source, /createParsedBox|buildInventoryMoveItem\(row, boxes\[0\]/);
  assert.match(source, /function isParsedQrIdentityConsistent\(parsed\)/);
  assert.match(source, /Number\(boxIdNumber\) !== Number\(boxNumber\)/);
  assert.match(source, /parsed\?\.qrChecksumPresent && !parsed\.qrChecksumValid/);
});

test("external scanner fallback adapts to its observed key interval and stays below half a second", () => {
  assert.match(source, /const HARDWARE_SCANNER_IDLE_SUBMIT_MIN_MS = 80;/);
  assert.match(source, /const HARDWARE_SCANNER_IDLE_SUBMIT_MAX_MS = 480;/);
  assert.match(source, /observedGap \* HARDWARE_SCANNER_IDLE_GAP_MULTIPLIER/);
  assert.match(source, /const submitDelayMs = getHardwareScannerIdleSubmitMs\(\);/);
  assert.doesNotMatch(source, /HARDWARE_SCANNER_IDLE_SUBMIT_MS = IS_LOW_POWER_SCANNER \? 1800 : 500/);
  assert.match(html, /mobile\.js\?v=20260904-product-image-prd/);
});
