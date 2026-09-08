import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const summaryFunction = source.slice(
  source.indexOf("function updateInboundSummary()"),
  source.indexOf("function normalizeInboundSummaryProductImageUrl")
);

function createSummary() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: "", style: {}, textContent: "", innerHTML: "" });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { querySelector: element },
    inboundNumberInputs: [],
    inboundMultipleRemainders: null,
    inboundProductId: { value: "JUS-0112" },
    getInboundRemainderQuantities: () => [],
    updateInboundRemainderPanelSummary() {},
    updateInboundSummaryProductImage() {},
    getProductByCode: () => ({ productId: "JUS-0112" }),
    getInboundPurchaseOrder: () => context.order,
    escapeHtml: (text) => text,
  });
  vm.runInContext(summaryFunction, context);
  return (accumulated, incoming, total = 14890) => {
    context.order = total == null ? null : { totalOrderQuantity: total, accumulatedInboundQuantity: accumulated, orderRound: "08/20 발주" };
    element("#inboundBoxQty").value = String(incoming);
    element("#inboundBoxCount").value = "1";
    context.updateInboundSummary();
    return element("#calcOrderProgressText").innerHTML;
  };
}

test("발주 초과분의 현재 LOSS와 입고 후 예상 LOSS를 수량과 비율로 표시한다", () => {
  const render = createSummary();
  const text = render(15900, 14300);
  assert.match(text, /현재 LOSS 1,010 ea \(6\.78%\)/);
  assert.match(text, /입고 후 예상 LOSS 15,310 ea \(102\.82%\)/);
  assert.match(text, /107%/);
  assert.match(text, /203%/);
  assert.doesNotMatch(render(15900, 0), /입고 후 예상/);
});

test("1,000개 발주에 1,400개 입고하면 LOSS는 400개, 40%이다", () => {
  const render = createSummary();
  assert.match(render(1400, 0, 1000), /현재 LOSS 400 ea \(40%\)/);
  assert.match(render(1000, 400, 1000), /현재 LOSS 0 ea \(0%\).*예상 LOSS 400 ea \(40%\)/);
  assert.match(render(100001, 0, 100000), /LOSS 1 ea \(0\.01% 미만\)/);
});

test("100% 이하에는 숨기고 실제 초과량으로 판단하며 입력 변경 시 다시 제거한다", () => {
  const render = createSummary();
  assert.doesNotMatch(render(10000, 4890), /LOSS/);
  assert.match(render(14890, 1), /현재 LOSS 0 ea.*예상 LOSS 1 ea/);
  assert.doesNotMatch(render(14890, 0), /LOSS/);
  assert.doesNotMatch(render(15900, 14300, null), /LOSS/);
  assert.doesNotMatch(render(15900, 14300, 0), /LOSS/);
});
