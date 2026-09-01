import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mobileSource = fs.readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
const gatewaySource = fs.readFileSync(
  new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url),
  "utf8"
);

test("모바일 출고 일괄 등록은 전역 상태 버전 충돌을 피하도록 순차 저장한다", () => {
  assert.match(mobileSource, /const SHIPPING_ACTION_CONCURRENCY = 1;/);
});

test("출고대기 저장은 전체 재고 대신 해당 관리 ID 데이터만 불러온다", () => {
  assert.match(gatewaySource, /action === "updateShippingStatus"/);
  assert.match(gatewaySource, /scopeColumn = needsProductScope && productId \? "product_id" : "management_id"/);
  assert.match(gatewaySource, /dev_inventory_records\?\$\{scopeColumn\}=eq\.\$\{encodedScopeValue\}/);
  assert.match(gatewaySource, /dev_inventory_boxes\?\$\{scopeColumn\}=eq\.\$\{encodedScopeValue\}/);
});

test("외부 동시 작업 충돌은 지수형 대기 후 재시도한다", () => {
  assert.match(gatewaySource, /attempt < 5/);
  assert.match(gatewaySource, /60 \* \(2 \*\* attempt\)/);
  assert.match(gatewaySource, /setTimeout\(resolve, backoffMs\)/);
});
