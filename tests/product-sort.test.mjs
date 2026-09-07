import assert from "node:assert/strict";
import test from "node:test";

await import("../frontend/product-sort.js");

const { parseRegisteredTimestamp, parseQuantity, sortProducts } = globalThis.SeungjinProductSort;

test("등록순 내림차순은 최근 등록 제품부터 정렬한다", () => {
  const products = [
    { productCode: "NEW", registeredAt: "2026.07.08", registeredTime: "09:00" },
    { productCode: "OLD-2", registeredAt: "2026.07.07", registeredTime: "오전 9:25" },
    { productCode: "OLD-1", registeredAt: "2026.07.07", registeredTime: "오전 9:18" }
  ];

  assert.deepEqual(
    sortProducts(products, "registered", "desc").map((product) => product.productCode),
    ["NEW", "OLD-2", "OLD-1"]
  );
  assert.ok(
    parseRegisteredTimestamp({ registeredAt: "2026.07.07", registeredTime: "오후 1:00" })
      > parseRegisteredTimestamp({ registeredAt: "2026.07.07", registeredTime: "오전 11:00" })
  );
});

test("등록순 오름차순은 오래된 제품부터 정렬한다", () => {
  const products = [
    { productCode: "NEW", registeredAt: "2026.07.08", registeredTime: "09:00" },
    { productCode: "OLD", registeredAt: "2026.07.07", registeredTime: "09:00" }
  ];

  assert.deepEqual(
    sortProducts(products, "registered", "asc").map((product) => product.productCode),
    ["OLD", "NEW"]
  );
});

test("이름순은 한글과 숫자를 자연스럽게 정렬한다", () => {
  const products = [
    { productCode: "P3", productName: "제품 10" },
    { productCode: "P1", productName: "가나다" },
    { productCode: "P2", productName: "제품 2" }
  ];

  assert.deepEqual(
    sortProducts(products, "name", "asc").map((product) => product.productCode),
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
    sortProducts(products, "inboundQuantity", "desc").map((product) => product.productCode),
    ["HIGH", "LOW", "ZERO"]
  );
});

test("이름순과 누적 입고량순도 오름차순과 내림차순을 선택할 수 있다", () => {
  const products = [
    { productCode: "A", productName: "가", accumulatedInboundQuantity: "100 ea" },
    { productCode: "B", productName: "나", accumulatedInboundQuantity: "200 ea" }
  ];

  assert.deepEqual(
    sortProducts(products, "name", "desc").map((product) => product.productCode),
    ["B", "A"]
  );
  assert.deepEqual(
    sortProducts(products, "inboundQuantity", "asc").map((product) => product.productCode),
    ["A", "B"]
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
