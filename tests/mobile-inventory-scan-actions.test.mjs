import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../frontend/mobile/index.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../frontend/mobile/mobile.css", import.meta.url), "utf8");

test("inventory QR scanner exposes every supported inventory action", () => {
  assert.match(html, /id="inventoryMoveActionPicker"/);
  ["move", "takeout", "transfer", "injection", "audit"].forEach((action) => {
    assert.match(html, new RegExp(`value="${action}"`));
  });
  assert.match(script, /takeout: \{ label: "반출"/);
  assert.match(script, /transfer: \{ label: "이관"/);
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
