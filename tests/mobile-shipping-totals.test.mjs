import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../frontend/mobile/index.html", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("function getShippingDisplayMetrics("), source.indexOf("function renderShippingItem("));
function context() {
  const ctx = { elements: { mobileShippingBoxTotal: {}, mobileShippingQuantityTotal: {} }, parseNumber: v => Number(String(v || 0).replace(/,/g, "")) || 0, formatNumber: v => Number(v).toLocaleString("ko-KR"), getScannedBox: row => row.scannedBox, getKnownBoxes: row => row.boxes || [], getBoxTotalQuantity: box => box.quantity, sumBoxQuantity: boxes => boxes.reduce((sum, box) => sum + box.quantity, 0) };
  vm.runInNewContext(helpers, ctx);
  return ctx;
}

test("상단 합계는 카드와 동일한 등록 박스 및 출고 수량을 합산한다", () => {
  const ctx = context();
  const rows = [
    { scannedItems: [{}, {}, {}, {}, {}], scannedBoxCount: 5, scannedTotalQuantity: 2400 },
    { scannedItems: [{}, {}], scannedBoxCount: 2, scannedTotalQuantity: 960 },
    { scannedBox: { quantity: 30 }, currentBoxCount: 99, currentTotalQuantity: 99999 },
    { boxes: [{ quantity: 100 }, { quantity: 20 }] },
    { currentBoxCount: 3, currentTotalQuantity: 300 }
  ];
  ctx.renderShippingListTotals(rows);
  assert.equal(ctx.elements.mobileShippingBoxTotal.textContent, "13");
  assert.equal(ctx.elements.mobileShippingQuantityTotal.textContent, "3,810");
  ctx.renderShippingListTotals(rows.slice(0, 2));
  assert.equal(ctx.elements.mobileShippingBoxTotal.textContent, "7");
  assert.equal(ctx.elements.mobileShippingQuantityTotal.textContent, "3,360");
  ctx.renderShippingListTotals([]);
  assert.equal(ctx.elements.mobileShippingBoxTotal.textContent, "0");
  assert.equal(ctx.elements.mobileShippingQuantityTotal.textContent, "0");
});

test("필터된 목록 렌더링마다 합계를 갱신하고 오류에서는 지난 합계를 표시하지 않는다", () => {
  assert.match(source, /function renderShippingList\(rows\)\s*\{[\s\S]*?renderShippingListTotals\(rows\)/);
  assert.match(source, /const \{ boxCount, totalQuantity \} = getShippingDisplayMetrics\(item\)/);
  assert.match(source, /<span class="metric-label">출고 수량<\/span>/);
  assert.doesNotMatch(source, /<span class="metric-label">출고 가능 수량<\/span>/);
  assert.ok(html.indexOf('id="mobileShippingBoxTotal"') < html.indexOf('id="mobileShippingCount"'));
  for (const name of ["renderShippingLoading", "renderShippingError"]) {
    const body = source.slice(source.indexOf(`function ${name}(`)).split("\nfunction ")[0];
    assert.match(body, /mobileShippingBoxTotal.textContent = "-"/);
    assert.match(body, /mobileShippingQuantityTotal.textContent = "-"/);
  }
});
