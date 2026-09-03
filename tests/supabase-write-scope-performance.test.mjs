import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const gatewaySource = fs.readFileSync(
  new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url),
  "utf8"
);

test("입고 등록과 수정은 해당 제품 범위만 읽는다", () => {
  assert.match(gatewaySource, /return loadInbound(?:Mutation|Update)State\(payload\)/);
  assert.match(gatewaySource, /dev_inventory_boxes\?product_id=eq\.\$\{encodedProductId\}/);
});

test("제품과 발주 저장은 재고 박스를 읽지 않는 전용 상태를 사용한다", () => {
  assert.match(gatewaySource, /return loadProductMutationState\(\)/);
  assert.match(gatewaySource, /return loadPurchaseOrderMutationState\(\)/);
});
