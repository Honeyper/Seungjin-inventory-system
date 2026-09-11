import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");

test("출고 결산 상태 건수는 조회기간에 포함된 박스 상태만 집계한다", () => {
  assert.match(adminSource, /function getShippingSettlementStatusCounts\(boxItems\)/);
  assert.match(adminSource, /const settlementBoxItems = Array\.isArray\(boxItems\) \? boxItems : getShippingSettlementBoxItems\(\)/);
  assert.match(adminSource, /const counts = getShippingSettlementStatusCounts\(settlementBoxItems\)/);
  assert.doesNotMatch(adminSource, /updateShippingSummaryCards\(getShippingSettlementItems\(\)\)/);
});

test("같은 관리 ID의 여러 박스는 상태별 한 건으로 중복 없이 센다", () => {
  assert.match(adminSource, /"출고대기": new Set\(\)/);
  assert.match(adminSource, /"보류": new Set\(\)/);
  assert.match(adminSource, /"출고완료": new Set\(\)/);
  assert.match(adminSource, /const itemKey = String\(item\.managementId \|\| ""\)\.trim\(\)/);
  assert.match(adminSource, /keys\.add\(itemKey\)/);
});

test("출고 기간 상태 집계 변경본을 캐시 없이 불러온다", () => {
  assert.match(adminHtml, /admin\.js\?v=(?:20260911-(?:production-plan-(?:width|rows)|print-page-isolation|shipping-settlement-filters|inventory-audit-search|inventory-audit-client-colors|inventory-move-persistence|production-plan-delete|shipping-settlement-quantity|production-plan-no-label|production-plan-detail-toggle)-v1|20260910-(?:inventory-attachments|update-history(?:-v2)?|notification-scroll-v3|production-plan-tabs-v1|production-plan-product-v[23]|production-plan-detail-v[1234]))-(?:dev|prd)/);
});
