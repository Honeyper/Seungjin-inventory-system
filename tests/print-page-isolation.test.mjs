import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const css = fs.readFileSync(new URL("../frontend/styles.css", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");

test("default QR paper remains A4 portrait with the original 5mm margins", () => {
  const defaults = [...css.matchAll(/@page\s*\{([^}]+)\}/g)];
  assert.equal(defaults.length, 1, "unscoped page rules must not override QR orientation");
  assert.match(defaults[0][1], /size:\s*A4 portrait;/);
  assert.match(defaults[0][1], /margin:\s*5mm;/);
});

test("landscape paper is named and assigned only while printing the production plan", () => {
  const landscapePages = [...css.matchAll(/@page\s*([^{}]*)\{([^}]*landscape[^}]*)\}/g)];
  assert.equal(landscapePages.length, 1);
  assert.equal(landscapePages[0][1].trim(), "production-plan");
  assert.match(landscapePages[0][2], /margin:\s*8mm;/);
  assert.match(css, /body\.printing-production-plan\s*\{\s*page:\s*production-plan;/);
  assert.equal((css.match(/page:\s*production-plan;/g) || []).length, 1);
});

test("QR printing clears a leftover production-plan mode without changing label content", () => {
  let handler;
  const classes = new Set(["printing-production-plan", "admin-body"]);
  let printed = 0;
  const button = { disabled: false, addEventListener: (event, callback) => { handler = callback; } };
  const context = vm.createContext({
    printInboundQrButton: button,
    document: { body: { classList: { remove: (name) => classes.delete(name) } } },
    window: { print: () => { assert.equal(classes.has("printing-production-plan"), false); printed += 1; } }
  });
  const start = source.indexOf('printInboundQrButton?.addEventListener("click"');
  const end = source.indexOf("inboundQrLayoutButtons.forEach", start);
  vm.runInContext(source.slice(start, end), context);
  handler();
  assert.equal(printed, 1);
  assert.equal(classes.has("admin-body"), true);
  button.disabled = true;
  handler();
  assert.equal(printed, 1);
  assert.match(source, /afterprint[\s\S]{0,100}classList\.remove\("printing-production-plan"\)/);
});
