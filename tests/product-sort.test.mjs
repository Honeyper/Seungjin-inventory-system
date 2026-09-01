import assert from "node:assert/strict";
import test from "node:test";

await import("../frontend/product-sort.js");

const { parseRegisteredTimestamp, parseQuantity, sortProducts } = globalThis.SeungjinProductSort;

test("등록순은 등록일과 등록시간을 기준으로 오래된 제품부터 정렬한다", () => {
  const products = [
    { productCode: "NEW", registeredAt: "2026.07.08", registeredTime: "09:00" },
    { productCode: "OLD-2", registeredAt: "2026.07.07", registeredTime: "오전 9:25" },
    { productCode: "OLD-1", registeredAt: "2026.07.07", registeredTime: "오전 9:18" }
  ];

  assert.deepEqual(
    sortProducts(products, "registered").map((product) => product.productCode),
    ["OLD-1", "OLD-2", "NEW"]
  );
  assert.ok(
    parseRegisteredTimestamp({ registeredAt: "2026.07.07", registeredTime: "오후 1:00" })
      > parseRegisteredTimestamp({ registeredAt: "2026.07.07", registeredTime: "오전 11:00" })
  );
});

test("이름순은 한글과 숫자를 자연스럽게 정렬한다", () => {
  const products = [
    { productCode: "P3", productName: "제품 10" },
    { productCode: "P1", productName: "가나다" },
    { productCode: "P2", productName: "제품 2" }
  ];

  assert.deepEqual(
    sortProducts(products, "name").map((product) => product.productCode),
    ["P1", "P2", "P3"]
  );
});

test("누적 입고량순은 EA 표기 수량을 숫자로 비교해 큰 수량부터 정렬한다", () => {
  const products = [
    { productCode: "LOW", registeredAt: "2026.07.07", accumulatedInboundQuantity: "900 ea" },
    { productCode: "HIGH", registeredAt: "2026.07.08", accumulatedInboundQuantity: "12,000 ea" },
    { productCode: "ZERO", registeredAt: "2026.07.09", accumulatedInboundQuantity: "-" }
  ];

  assert.equal(parseQuantity("12,000 ea"), 12000);
  assert.deepEqual(
    sortProducts(products, "inboundQuantity").map((product) => product.productCode),
    ["HIGH", "LOW", "ZERO"]
  );
});

test("정렬 함수는 원본 제품 배열을 변경하지 않는다", () => {
  const products = [
    { productCode: "B", productName: "나" },
    { productCode: "A", productName: "가" }
  ];

  sortProducts(products, "name");
  assert.deepEqual(products.map((product) => product.productCode), ["B", "A"]);
});
