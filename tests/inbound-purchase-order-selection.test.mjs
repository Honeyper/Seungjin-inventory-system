import assert from "node:assert/strict";
import test from "node:test";
import { adminSource, loadFunctions } from "./helpers/frontend-runtime.mjs";

test("입고 등록은 같은 제품의 발주 중 실제 누적 입고량이 발주량 미만인 발주만 보여준다", () => {
  const base = { productId: "P1", totalOrderQuantity: 10000, endDate: "2026-11-30" };
  const orders = [
    { ...base, purchaseOrderId: "below", accumulatedInboundQuantity: 9999, inboundRate: 1, accumulatedShippingQuantity: 9000 },
    { ...base, purchaseOrderId: "exact", accumulatedInboundQuantity: 10000 },
    { ...base, purchaseOrderId: "over", accumulatedInboundQuantity: 10500, accumulatedShippingQuantity: 9800 },
    { ...base, purchaseOrderId: "rate-only", inboundRate: 1 },
    { ...base, purchaseOrderId: "cancelled", accumulatedInboundQuantity: 0, status: "취소" },
    { ...base, purchaseOrderId: "manual-close", accumulatedInboundQuantity: 0, storedStatus: "임의 완료" },
    { ...base, purchaseOrderId: "shipped", accumulatedInboundQuantity: 9999, accumulatedShippingQuantity: 10000 },
    { ...base, purchaseOrderId: "other", accumulatedInboundQuantity: 100, productId: "P2" }
  ];
  const inboundPurchaseOrder = { value: "", disabled: true };
  const inboundDueDate = { value: "" };
  const app = loadFunctions(adminSource, [
    "isPurchaseOrderInboundComplete", "getPurchaseOrderDisplayStatus", "getPurchaseOrderById",
    "getInboundPurchaseOrder", "getInboundPurchaseOrderLabel", "populateInboundPurchaseOrders",
    "applySelectedInboundPurchaseOrder"
  ], {
    state: { purchaseOrders: orders }, inboundPurchaseOrder, inboundDueDate,
    escapeAttribute: String, escapeHtml: String, updateInboundSummary() {}
  });

  app.populateInboundPurchaseOrders("P1", "below");
  assert.deepEqual([...inboundPurchaseOrder.innerHTML.matchAll(/<option value="([^"]*)"/g)].map(match => match[1]), ["", "below"]);
  assert.equal(inboundPurchaseOrder.value, "below");
  assert.equal(inboundDueDate.value, base.endDate);

  orders[0].accumulatedInboundQuantity = 10000;
  app.populateInboundPurchaseOrders("P1");
  // A disabled select containing only an empty-value option submits no order.
  assert.match(inboundPurchaseOrder.innerHTML, /^<option value="">연결 가능한 발주 없음/);
  assert.equal(inboundPurchaseOrder.disabled, true);
});

test("기존 입고 내역을 수정할 때는 연결된 발주를 계속 표시한다", () => {
  assert.match(adminSource, /order\.purchaseOrderId === currentPurchaseOrderId \|\| !\["취소", "임의 완료", "발주완료"\]\.includes\(getPurchaseOrderDisplayStatus\(order\)\)/);
});
