import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { buildOrderShippingLinks, summarizePurchaseOrderShipping, readPurchaseOrdersWithShipping } from "../supabase/functions/seungjin-dev-gateway/purchase-order-shipping.js";

const orders = [
  { purchaseOrderId: "PO1", productId: "P1", totalOrderQuantity: 1000, accumulatedInboundQuantity: 1400 },
  { purchaseOrderId: "PO2", productId: "P1", totalOrderQuantity: 1000 },
  { purchaseOrderId: "PO3", productId: "P2", totalOrderQuantity: 0 },
];
const inbounds = [
  { management_id: "IN1", product_id: "P1", purchase_order_id: "PO1" },
  { management_id: "IN2", product_id: "P1", purchase_order_id: "PO2" },
];
const box = (id, overrides = {}) => ({ box_id: id, management_id: "IN1", product_id: "P1", quantity: 100, status: "출고완료", shipping_type: "정상출고", ...overrides });

test("입고 100% 경계와 출고 우선 상태를 필터 및 요약에도 동일하게 적용한다", () => {
  const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
  const functions = source.slice(source.indexOf("function applyPurchaseOrderFilters("), source.indexOf("function getPurchaseOrderById("));
  const fixtures = [
    { totalOrderQuantity: 1000, accumulatedInboundQuantity: 0 },
    { totalOrderQuantity: 1000, accumulatedInboundQuantity: 999.9 },
    { totalOrderQuantity: 1000, accumulatedInboundQuantity: 1000 },
    { totalOrderQuantity: 1000, accumulatedInboundQuantity: 1400 },
    { totalOrderQuantity: 1000, accumulatedInboundQuantity: 500, accumulatedShippingQuantity: 1 },
    { totalOrderQuantity: 1000, accumulatedInboundQuantity: 1400, accumulatedShippingQuantity: 1400 },
    { status: "취소", totalOrderQuantity: 1000, accumulatedInboundQuantity: 1400 },
  ];
  const context = { state: { purchaseOrders: fixtures, purchaseOrderQuery: "", purchaseOrderStatusFilter: "" }, purchaseOrderTableBody: {}, purchaseOrderListStatus: null, purchaseOrderCountLabel: null, purchaseOrderTotal: {}, purchaseOrderActive: {}, purchaseOrderCompleted: {}, purchaseOrderRemaining: {}, escapeHtml: String, escapeAttribute: String };
  vm.runInNewContext(functions + "\napplyPurchaseOrderFilters();", context);
  const statuses = fixtures.map((order) => context.getPurchaseOrderDisplayStatus(order));
  assert.deepEqual(statuses, ["입고중", "입고중", "입고완료", "입고완료", "작업중", "작업중", "취소"]);
  assert.equal(context.purchaseOrderActive.innerHTML, "4 <em>건</em>");
  assert.equal(context.purchaseOrderCompleted.innerHTML, "2 <em>건</em>");
  context.state.purchaseOrderStatusFilter = "작업중";
  vm.runInNewContext("applyPurchaseOrderFilters();", context);
  assert.equal(context.state.filteredPurchaseOrders.length, 2);
  assert.match(context.purchaseOrderTableBody.innerHTML, /data-status="작업중"/);
  assert.equal(context.getPurchaseOrderDisplayStatus({ ...fixtures[4], accumulatedShippingQuantity: 0 }), "입고중");
});

test("발주 표 열 너비는 합계 100%이고 수량 및 진행률 제목과 본문을 중앙 정렬한다", () => {
  const html = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../frontend/styles.css", import.meta.url), "utf8");
  const columns = html.match(/purchase-order-table">\s*<colgroup>([\s\S]*?)<\/colgroup>/)[1];
  const widths = [...columns.matchAll(/width:([\d.]+)%/g)].map((match) => Number(match[1]));
  assert.equal(widths.length, 14);
  assert.equal(widths.reduce((a, b) => a + b, 0), 100);
  assert.match(css, /\.purchase-order-table\s*\{[^}]*table-layout: fixed/);
  assert.match(css, /\.purchase-order-table th:nth-child\(n \+ 6\),\s*\.purchase-order-table td:nth-child\(n \+ 6\)\s*\{\s*text-align: center/);
});

test("해당 발주에 연결된 정상 출고 박스만 집계하고 취소 및 특수출고는 제외한다", () => {
  const links = buildOrderShippingLinks(orders, [...inbounds, inbounds[0]]);
  const result = summarizePurchaseOrderShipping(orders, links, [
    box("B1", { quantity: "600 ea" }), box("B1"),
    box("B2", { management_id: "IN2", quantity: "1,400" }),
    box("B3", { management_id: "UNLINKED" }), box("B4", { product_id: "P2" }),
    ...["보관", "출고대기", "폐기", "출고보류"].map((status) => box(status, { status })),
    ...["반출", "이관(코팅)", "이관(2공장)", "재고조정"].map((shipping_type) => box(shipping_type, { shipping_type })),
    box("adjustment", { raw_status: "출고완료(재고조정)" }),
    box("cancelled", { raw_status: "보관" }),
  ]);
  assert.deepEqual(result.map((o) => [o.accumulatedShippingQuantity, o.shippingRate, o.remainingShippingQuantity]), [[600, 0.6, 400], [1400, 1.4, 0], [0, null, 0]]);
  assert.equal(result[0].accumulatedInboundQuantity, 1400);
  assert.equal(orders[0].accumulatedShippingQuantity, undefined);
});

test("연결 모호성, SKU 불일치, 잘못된 수량은 다른 발주에 합산하지 않는다", () => {
  const links = buildOrderShippingLinks(orders, [...inbounds, { ...inbounds[0], purchase_order_id: "PO2" }, { management_id: "IN3", product_id: "P2", purchase_order_id: "PO1" }]);
  assert.equal(summarizePurchaseOrderShipping(orders, links, [box("B1"), box("B2", { management_id: "IN3" })])[0].accumulatedShippingQuantity, 0);
  const valid = buildOrderShippingLinks(orders, inbounds);
  const result = summarizePurchaseOrderShipping(orders, valid, [box("negative", { quantity: -1 }), box("nan", { quantity: "bad" }), box("legacy", { quantity: 50, shipping_type: null })]);
  assert.equal(result[0].accumulatedShippingQuantity, 50);
});

test("발주가 없으면 추가 조회 없이 종료하고 조회 실패를 숨기지 않는다", async () => {
  let calls = 0;
  assert.deepEqual(await readPurchaseOrdersWithShipping(async () => { calls++; return []; }), { purchaseOrders: [] });
  assert.equal(calls, 1);
  await assert.rejects(readPurchaseOrdersWithShipping(async () => { throw Error("database unavailable"); }), /database unavailable/);
});

test("연결 입고 ID만 50개씩 제한 조회하며 큰 data 본문을 읽지 않는다", async () => {
  const paths = [];
  const result = await readPurchaseOrdersWithShipping(async (path) => {
    paths.push(path);
    if (path.startsWith("dev_purchase_orders?")) return orders.map((data) => ({ data }));
    if (path.startsWith("dev_inbounds?")) return Array.from({ length: 51 }, (_, i) => ({ ...inbounds[0], management_id: `IN${i}` }));
    const ids = JSON.parse(`[${decodeURIComponent(path.match(/in\.\((.*?)\)/)[1])}]`);
    assert.ok(ids.length <= 50);
    assert.match(path, /quantity:data->>quantity/);
    assert.doesNotMatch(path, /select=data(?:&|$)/);
    return ids.map((id) => box(id, { management_id: id }));
  });
  assert.equal(paths.length, 4);
  assert.equal(result.purchaseOrders[0].accumulatedShippingQuantity, 5100);
});

test("발주 표에 입고와 출고를 분리한 14칸을 표시하고 초과율은 잘리지 않는다", () => {
  const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
  const renderer = source.slice(source.indexOf("function renderPurchaseOrders("), source.indexOf("function getPurchaseOrderById("));
  const context = { state: { filteredPurchaseOrders: [{ ...orders[0], accumulatedShippingQuantity: 1400, shippingRate: 1.4, remainingShippingQuantity: 0 }] }, purchaseOrderTableBody: {}, purchaseOrderListStatus: null, purchaseOrderCountLabel: null, escapeHtml: String, escapeAttribute: String };
  vm.runInNewContext(renderer + "\nrenderPurchaseOrders();", context);
  assert.equal((context.purchaseOrderTableBody.innerHTML.match(/<td>/g) || []).length, 14);
  assert.match(context.purchaseOrderTableBody.innerHTML, /140%/);
  assert.match(context.purchaseOrderTableBody.innerHTML, /1,400 ea/);
  assert.match(context.purchaseOrderTableBody.innerHTML, /width:100%/);
  for (const label of ["누적 출고량", "출고율", "출고 잔여량"]) assert.ok(html.includes(label));
  context.state.filteredPurchaseOrders = [];
  vm.runInNewContext("renderPurchaseOrders();", context);
  assert.match(context.purchaseOrderTableBody.innerHTML, /colspan="14"/);
  context.state.filteredPurchaseOrders = [orders[0]];
  vm.runInNewContext("renderPurchaseOrders();", context);
  assert.match(context.purchaseOrderTableBody.innerHTML, /<td>-<\/td>/);
});
