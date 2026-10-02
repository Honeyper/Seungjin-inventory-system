import assert from "node:assert/strict";
import test from "node:test";
import { adminSource, loadFunctions } from "./helpers/frontend-runtime.mjs";

test("실제 너비에 맞춰 긴 제품명만 축소하고 칸이 넓어지면 기본 크기로 복구한다", () => {
  const text = { style: { fontSize: "" }, getBoundingClientRect: () => ({ width: 400 }) };
  let width = 200;
  let visible = true;
  const container = {
    get clientWidth() { return width; }, getClientRects: () => visible ? [{}] : [],
    getBoundingClientRect: () => ({ width }), querySelector: () => text
  };
  const app = loadFunctions(adminSource, ["fitTableProductNames"], {
    document: { querySelectorAll: () => [container] },
    window: { getComputedStyle: () => ({ fontSize: "16px" }) }
  });
  app.fitTableProductNames();
  assert.equal(text.style.fontSize, "8px");
  width = 320;
  app.fitTableProductNames();
  assert.equal(text.style.fontSize, "12.8px");
  width = 500;
  app.fitTableProductNames();
  assert.equal(text.style.fontSize, "");
  visible = false;
  width = 0;
  app.fitTableProductNames();
  assert.equal(text.style.fontSize, "");
  visible = true;
  width = 200;
  app.fitTableProductNames();
  assert.equal(text.style.fontSize, "8px");
});

test("렌더링·창 크기 변경이 겹쳐도 한 프레임에 한 번만 제품명 크기를 맞춘다", () => {
  const callbacks = [];
  let fits = 0;
  const app = loadFunctions(adminSource, ["scheduleTableProductNameFit"], {
    tableProductNameFitFrame: null, fitTableProductNames: () => fits++,
    window: { requestAnimationFrame: callback => { callbacks.push(callback); return callbacks.length; } }
  });
  app.scheduleTableProductNameFit();
  app.scheduleTableProductNameFit();
  assert.equal(callbacks.length, 1);
  assert.equal(fits, 0);
  callbacks[0]();
  assert.equal(fits, 1);
  app.scheduleTableProductNameFit();
  assert.equal(callbacks.length, 2);
});
