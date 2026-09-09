import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf("function formatPurchaseOrderQuantityInput("), source.indexOf("function formatPurchaseOrderQuantity(value)"));
const app = {};
vm.runInNewContext(code, app);

test("발주량 입력과 수정 시 천 단위 쉼표를 표시하고 저장값은 숫자로 변환한다", () => {
  for (const [raw, formatted] of [["", ""], ["40720", "40,720"], ["1000", "1,000"], ["1234567", "1,234,567"], ["40,720", "40,720"]]) {
    assert.equal(app.formatPurchaseOrderQuantityInput(raw), formatted);
    if (raw) assert.equal(app.parsePurchaseOrderQuantityInput(formatted), Number(raw.replace(/,/g, "")));
  }
  for (const invalid of ["", "-1", "1.5", "abc", "1e3"]) assert.ok(Number.isNaN(app.parsePurchaseOrderQuantityInput(invalid)));
  assert.match(source, /purchaseOrderQuantity.value = formatPurchaseOrderQuantityInput/);
  assert.match(source, /totalOrderQuantity: parsePurchaseOrderQuantityInput\(purchaseOrderQuantity.value\)/);
  assert.match(source, /!Number.isSafeInteger\(payload.totalOrderQuantity\)/);
});

test("숫자 중간 수정 시 커서가 끝으로 이동하지 않는다", () => {
  const input = { value: "412,345", selectionStart: 2, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
  app.formatPurchaseOrderQuantityField(input);
  assert.equal(input.selectionStart, 2);
  input.value = "40720";
  input.selectionStart = 5;
  app.formatPurchaseOrderQuantityField(input);
  assert.equal(input.value, "40,720");
  assert.equal(input.selectionStart, 6);
  input.value = "4123,456";
  input.selectionStart = 2;
  app.formatPurchaseOrderQuantityField(input);
  assert.equal(input.value, "4,123,456");
  assert.equal(input.selectionStart, 3);
});
