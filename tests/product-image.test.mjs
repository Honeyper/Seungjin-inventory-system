import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyMutation,
  buildInventoryDashboard
} from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../frontend/styles.css", import.meta.url), "utf8");
const gasSource = await readFile(new URL("../gas/Code.js", import.meta.url), "utf8");
const mobileHtml = await readFile(new URL("../frontend/mobile/index.html", import.meta.url), "utf8");
const mobileSource = await readFile(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");

test("product registration uploads only the selected image to Google Drive and stores its URL", () => {
  assert.match(adminHtml, /id="productImageFile"[^>]+accept="image\/\*"/);
  assert.match(adminSource, /requestApi\("uploadProductImage"/);
  assert.match(adminSource, /payload\.productImageUrl = productImageUrl/);
  assert.match(gasSource, /function uploadProductImage\(payload\)/);
  assert.match(gasSource, /getOrCreateDriveFolderPath_\(rootFolder, \[/);
  assert.match(gasSource, /'제품이미지'/);
  assert.match(gasSource, /DriveApp\.Access\.ANYONE_WITH_LINK/);
  assert.match(gasSource, /drive\.google\.com\/thumbnail\?id=/);
  assert.match(gasSource, /'제품 이미지'/);
});

test("product image empty state is hidden when a preview is available", () => {
  assert.match(adminSource, /productImagePlaceholder\.hidden = Boolean\(previewUrl\)/);
  assert.match(adminSource, /removeProductImageButton\.hidden = !previewUrl/);
  assert.match(stylesSource, /\.product-image-placeholder\[hidden\],[\s\S]*?\.product-image-remove-button\[hidden\][\s\S]*?display: none/);
});

test("product image URL survives canonical product mutation and reaches inventory rows", () => {
  const imageUrl = "https://drive.google.com/thumbnail?id=test-image&sz=w1200";
  const state = {
    products: [],
    orders: [],
    inbounds: [],
    records: [],
    boxes: []
  };
  const mutation = applyMutation("createProduct", {
    clientName: "테스트 거래처",
    productName: "테스트 제품",
    boxQuantity: 100,
    trayQuantity: 10,
    stage1Process: "실크",
    productImageUrl: imageUrl
  }, state, new Date("2026-09-04T00:00:00.000Z"));
  const product = mutation.state.products[0];
  assert.equal(product.productImageUrl, imageUrl);

  const dashboard = buildInventoryDashboard([
    {
      managementId: "IN-TEST-001",
      productId: product.productId,
      productName: product.productName,
      clientName: product.clientName,
      storage: "A",
      stockStatus: "보관"
    }
  ], [
    {
      boxId: "IN-TEST-001-B001",
      managementId: "IN-TEST-001",
      productId: product.productId,
      number: 1,
      quantity: 100,
      storage: "A",
      status: "보관",
      rawStatus: "보관"
    }
  ], mutation.state.products);
  assert.equal(dashboard.rows[0].productImageUrl, imageUrl);
});

test("mobile product cards open registered images in a large dialog", () => {
  assert.match(mobileSource, /data-product-image-open/);
  assert.match(mobileSource, /function openProductImageModal/);
  assert.match(mobileHtml, /id="productImageModal"/);
  assert.match(mobileHtml, /id="productImageModalImage"/);
});
