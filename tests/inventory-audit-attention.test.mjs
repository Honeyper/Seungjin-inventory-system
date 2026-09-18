import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const adminHtml = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../frontend/styles.css", import.meta.url), "utf8");

test("실물 미확인 카드는 미확인 박스 합계를 box 단위로 표시한다", () => {
  assert.match(adminSource, /physicalMissingCount: rows\.reduce\(\(sum, row\) => sum \+ Number\(row\.inventoryUnconfirmedBoxCount \|\| 0\), 0\)/);
  assert.match(adminHtml, /id="inventoryPhysicalMissing">-<\/span> <em>box<\/em>/);
});

test("실물 확인 상세는 미확인 박스와 확인 완료 박스를 구분한다", () => {
  assert.match(adminSource, /미확인 박스가 남아 있는 재고만 표시합니다/);
  assert.match(adminSource, /미확인 .*inventoryUnconfirmedBoxCount/);
  assert.match(adminSource, /확인 완료 .*inventoryConfirmedBoxCount/);
  assert.match(adminSource, /Number\(item\?\.inventoryAuditTargetBoxCount \|\| 0\) > 0/);
  assert.doesNotMatch(adminSource, /metric: \(item\) => `\$\{formatNumber\(item\.inventoryAdjustmentBoxCount\)\} box`/);
});

test("재고 상세는 박스별 확인 상태를 나누고 미확인 박스를 바로 정리한다", () => {
  assert.match(adminSource, /실물 확인 박스 현황/);
  assert.match(adminSource, /실물 미확인/);
  assert.match(adminSource, /실물 확인 완료/);
  assert.match(adminSource, /data-inventory-audit-box=/);
  assert.match(adminSource, /getInventoryAuditEligibleBoxes\(item\)\s*\.filter\(\(box\) => !String\(box\.lastInventoryCheckedAt/);
  assert.match(adminSource, /inventoryAuditBoxConfirmModal\.hidden = false/);
  assert.match(adminSource, /requestApi\("adjustMissingInventory"/);
  assert.match(adminSource, /selectedBoxes: \[currentBox\.number\]/);
  assert.doesNotMatch(adminSource, /openRemainingInventoryModal\(item, "audit", \[boxNumber\]\)/);
  assert.match(stylesSource, /\.inventory-audit-box-groups/);
  assert.match(stylesSource, /\.inventory-audit-box-confirm-modal/);
});

test("새 박스 상태 필드를 받도록 이전 재고 캐시를 무효화한다", () => {
  assert.match(adminSource, /seungjinAdminCache:v3/);
  assert.match(adminHtml, /admin\.js\?v=(?:20260915-production-work-labels-v1|20260918-inventory-detail-layout-v1|20260918-audit-unconfirmed-list-v1|20260918-audit-list-refresh-v1|20260917-login-server-recovery-v1|20260917-audit-zero-quantity-v1|20260917-audit-partial-stock-v1|20260917-audit-eligible-status-v1|20260917-inventory-list-sort-v1|20260917-product-list-sort-v1|20260917-product-detail-layout-v1|20260917-product-hourly-rate-v1|20260917-audit-card-drag-v1|20260916-audit-confirm-all-v1|20260916-order-column-sort-v1|20260916-order-column-filters-v1|20260916-order-complete-label-v1|20260916-product-column-widths-v1|20260916-label-treatment-visibility-v1|20260916-myeongsin-client-v1|20260916-label-process-v1|20260916-pc-inventory-confirm-v1|20260915-inbound-defect-upload-v1|20260915-production-print-fix-v1|20260915-order-actions-menu-v1|20260914-(?:shipping-status-sync|order-manual-completion|inventory-adjustment-retry)-v1|20260911-(?:production-plan-(?:width|rows)|print-page-isolation|shipping-settlement-filters|inventory-audit-search|inventory-audit-client-colors|inventory-move-persistence|production-plan-delete|shipping-settlement-quantity|production-plan-no-label|production-plan-detail-toggle|production-capacity|production-inputs|remainder-save)-v1|20260910-(?:inventory-attachments|update-history(?:-v2)?|notification-scroll-v3|production-plan-tabs-v1|production-plan-product-v[23]|production-plan-detail-v[1234]))-(?:dev|prd)/);
});
