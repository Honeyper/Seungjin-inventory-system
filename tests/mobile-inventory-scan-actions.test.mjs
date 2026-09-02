import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../frontend/mobile/index.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../frontend/mobile/mobile.css", import.meta.url), "utf8");

test("inventory QR scanner exposes every supported inventory action", () => {
  assert.match(html, /id="inventoryMoveActionPicker"/);
  ["move", "takeout", "transfer", "injection", "audit", "discard"].forEach((action) => {
    assert.match(html, new RegExp(`value="${action}"`));
  });
  assert.match(script, /takeout: \{ label: "반출"/);
  assert.match(script, /transfer: \{ label: "이관"/);
  assert.match(script, /discard: \{ label: "박스 폐기", target: "폐기" \}/);
});

test("box discard uses the existing guarded Supabase inspection mutation", () => {
  assert.match(script, /const requiresTargetStorage = !isInjectionAction && !isInventoryShippingAction && !isInventoryDiscardAction/);
  assert.match(script, /tone: isInventoryDiscardAction \? "danger" : "move"/);
  assert.match(script, /requestApi\("saveShippingInspection"/);
  assert.match(script, /discardRequested: true/);
  assert.match(script, /defectReasons: \["박스 폐기"\]/);
  assert.match(script, /box\.beforeDiscardQuantity = getBoxCurrentQuantity/);
  assert.match(script, /box\.status = "폐기"/);
  assert.match(script, /box\.quantity = 0/);
});

test("direct takeout and transfer use the guarded inventory adjustment API", () => {
  assert.match(script, /requestApi\("updateShippingStatus"/);
  assert.match(script, /allowInventoryAdjustment: true/);
  assert.match(script, /status: "출고완료"/);
  assert.match(script, /isInventoryShippingScanAction/);
});

test("storage route only appears for the move action", () => {
  assert.match(script, /const isMoveAction = isInventoryMove && getInventoryMoveScanAction\(\) === "move"/);
  assert.match(script, /\$\{isMoveAction \? `/);
  assert.match(css, /\.inventory-move-action-picker/);
  assert.match(css, /input:checked \+ b/);
});

test("scanner action bar stays fixed while only the scanned list scrolls", () => {
  assert.match(html, /mobile\.css\?v=20260902-inventory-box-discard-dev/);
  assert.match(
    css,
    /\.scanner-list-panel\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*20px auto auto minmax\(0, 1fr\) auto;[\s\S]*?overflow:\s*hidden;/
  );
  assert.match(
    css,
    /\.scanner-list-panel \.scanner-scanned-list\s*\{[\s\S]*?grid-row:\s*4;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/
  );
  assert.match(
    css,
    /\.scanner-list-panel \.scanner-bottom\s*\{[\s\S]*?grid-row:\s*5;[\s\S]*?align-self:\s*end;[\s\S]*?width:\s*100%;/
  );
  assert.match(css, /\.scanner-list-panel \.inventory-move-action-picker\s*\{[\s\S]*?grid-row:\s*3;/);
});
