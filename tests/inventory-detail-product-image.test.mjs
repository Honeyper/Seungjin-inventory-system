import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");

test("재고 상세보기는 재고와 제품DB의 여러 제품 이미지를 함께 확인한다", () => {
  assert.match(adminSource, /const inventoryProduct = isInventoryDetail \? findInboundQrProduct\(inbound\) : null/);
  assert.match(adminSource, /\.\.\.getProductImageUrls\(inbound\),\s*\.\.\.getProductImageUrls\(inventoryProduct\)/);
  assert.match(adminSource, /id="inventoryDetailProductImageTitle">제품 이미지/);
  assert.match(adminSource, /data-inventory-detail-product-image="\$\{index\}"/);
});

test("재고 상세 이미지 선택 시 기존 다중 이미지 확대보기를 연다", () => {
  assert.match(adminSource, /querySelectorAll\("\[data-inventory-detail-product-image\]"\)/);
  assert.match(adminSource, /openProductImageGallery\(\s*productImageUrls,\s*inbound\.productName,/);
  assert.match(adminHtml, /admin\.js\?v=20260910-(?:inventory-attachments|update-history(?:-v2)?|notification-scroll-v3|production-plan-tabs-v1|production-plan-product-v[23]|production-plan-detail-v1)-(?:dev|prd)/);
});
