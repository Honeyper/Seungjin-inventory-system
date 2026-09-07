import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");

test("입고 등록과 수정에서 입고완료 발주를 제외하지 않는다", () => {
  assert.doesNotMatch(adminSource, /\["취소",\s*"입고완료"\]\.includes\(order\.status\)/);
  assert.match(adminSource, /order\.productId === productId\s*&& order\.status !== "취소"/);
  assert.match(
    adminSource,
    /order\.purchaseOrderId === currentPurchaseOrderId \|\| order\.status !== "취소"/
  );
});
