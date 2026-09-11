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
const mobileCss = await readFile(new URL("../frontend/mobile/mobile.css", import.meta.url), "utf8");
const gatewaySource = await readFile(new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url), "utf8");
const stateEngineSource = await readFile(new URL("../supabase/functions/seungjin-dev-gateway/state-engine.js", import.meta.url), "utf8");

test("product registration uploads multiple selected images to Google Drive and stores compatible fields", () => {
  assert.match(adminHtml, /id="productImageFile"[^>]+accept="image\/\*"[^>]+multiple/);
  assert.match(adminSource, /requestApi\("uploadProductImage"/);
  assert.match(adminSource, /async function resolveProductImageUrls/);
  assert.match(adminSource, /payload\.productImageUrls = productImageUrls/);
  assert.match(adminSource, /payload\.productImageUrl = productImageUrls\[0\] \|\| ""/);
  assert.match(gasSource, /function uploadProductImage\(payload\)/);
  assert.match(gasSource, /getOrCreateDriveFolderPath_\(rootFolder, \[/);
  assert.match(gasSource, /'제품이미지'/);
  assert.match(gasSource, /DriveApp\.Access\.ANYONE_WITH_LINK/);
  assert.match(gasSource, /drive\.google\.com\/thumbnail\?id=/);
  assert.match(gasSource, /'제품 이미지'/);
  assert.match(gasSource, /'제품 이미지 목록'/);
});

test("product image empty state is hidden when a preview is available", () => {
  assert.match(adminSource, /productImagePlaceholder\.hidden = previewUrls\.length > 0/);
  assert.match(adminSource, /removeProductImageButton\.hidden = previewUrls\.length === 0/);
  assert.match(stylesSource, /\.product-image-placeholder\[hidden\],[\s\S]*?\.product-image-remove-button\[hidden\][\s\S]*?display: none/);
});

test("product image URL is preserved in products and reaches PRD inventory rows", () => {
  assert.match(gasSource, /productImageUrl:\s*pickCell_\(row, indexes, \['제품 이미지', '제품 이미지 URL'\]\)/);
  assert.match(gasSource, /productImageUrl:\s*product\.productImageUrl \|\| ''/);
  assert.match(gasSource, /productImageUrl:\s*getObjectCell_\(row, \['제품 이미지', '제품 이미지 URL'\]\)/);
  assert.match(gasSource, /hasProductImageValue[\s\S]*?pickCell_\(row, indexes, \['제품 이미지', '제품 이미지 URL'\]\)/);
  assert.match(stateEngineSource, /const productImageUrls = stringList/);
  assert.match(stateEngineSource, /productImageUrl:\s*productImageUrls\[0\] \|\| ""/);
  assert.match(stateEngineSource, /row\.productImageUrl = text\(product\.productImageUrl\)/);
  assert.match(stateEngineSource, /row\.productImageUrls = stringList/);
  assert.match(gatewaySource, /product_image_url:data->>productImageUrl/);

  const imageUrl = "https://drive.google.com/thumbnail?id=test-image&sz=w1200";
  const secondImageUrl = "https://drive.google.com/thumbnail?id=test-image-2&sz=w1200";
  const sourceState = {
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
    productImageUrl: imageUrl,
    productImageUrls: [imageUrl, secondImageUrl]
  }, sourceState, new Date("2026-09-04T00:00:00.000Z"));
  const product = mutation.state.products[0];
  assert.equal(product.productImageUrl, imageUrl);
  assert.deepEqual(product.productImageUrls, [imageUrl, secondImageUrl]);

  const dashboard = buildInventoryDashboard([{
    managementId: "IN-TEST-001",
    productId: product.productId,
    productName: product.productName,
    clientName: product.clientName,
    storage: "A",
    stockStatus: "보관"
  }], [{
    boxId: "IN-TEST-001-B001",
    managementId: "IN-TEST-001",
    productId: product.productId,
    number: 1,
    quantity: 100,
    storage: "A",
    status: "보관",
    rawStatus: "보관"
  }], mutation.state.products);
  assert.equal(dashboard.rows[0].productImageUrl, imageUrl);
  assert.deepEqual(dashboard.rows[0].productImageUrls, [imageUrl, secondImageUrl]);
  assert.match(gatewaySource, /product_image_urls:data->productImageUrls/);
  assert.match(gatewaySource, /productImageUrls: Array\.isArray\(row\.product_image_urls\)/);
});

test("PC and mobile product images open as navigable multi-image galleries", () => {
  assert.match(adminHtml, /id="productImageGalleryModal"/);
  assert.match(adminSource, /function openProductImageGallery/);
  assert.match(adminSource, /data-detail-product-image/);
  assert.match(mobileSource, /data-product-image-open/);
  assert.match(mobileSource, /function openProductImageModal/);
  assert.match(mobileSource, /function moveProductImageModal/);
  assert.match(mobileHtml, /id="productImageModal"/);
  assert.match(mobileHtml, /id="productImageModalTrack"/);
  assert.match(mobileHtml, /id="productImageModalThumbnails"/);
});

test("모바일 제품 이미지는 화살표 없이 좌우 스와이프로 전환한다", () => {
  assert.match(mobileHtml, /id="productImageModalStage"/);
  assert.doesNotMatch(mobileHtml, /product-image-lightbox-nav/);
  assert.doesNotMatch(mobileHtml, /previousProductImageModalButton|nextProductImageModalButton/);
  assert.match(mobileSource, /productImageModalStage\?\.addEventListener\("pointerdown", startProductImageSwipe\)/);
  assert.match(mobileSource, /Math\.abs\(deltaX\) >= PRODUCT_IMAGE_SWIPE_MIN_DISTANCE/);
  assert.match(mobileSource, /moveProductImageModal\(deltaX < 0 \? 1 : -1\)/);
  assert.match(mobileSource, /positionProductImageTrack\(state\.productImageSwipeDeltaX\)/);
  assert.match(mobileCss, /\.product-image-lightbox-track\s*\{[\s\S]*?display:\s*flex;[\s\S]*?transition:\s*transform 280ms/);
  assert.match(mobileCss, /\.product-image-lightbox-slide\s*\{[\s\S]*?flex:\s*0 0 100%;/);
  assert.match(mobileCss, /\.product-image-lightbox-stage\s*\{[\s\S]*?touch-action:\s*pan-y;[\s\S]*?user-select:\s*none;/);
});

test("모바일 제품 이미지는 하단 썸네일 영역을 침범하지 않는다", () => {
  assert.match(mobileCss, /\.product-image-lightbox-stage\s*\{[\s\S]*?min-height:\s*260px;[\s\S]*?overflow:\s*hidden;/);
  assert.match(mobileCss, /\.product-image-lightbox-slide img\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?max-height:\s*100%;/);
  assert.doesNotMatch(mobileCss, /\.product-image-lightbox-slide img\s*\{[\s\S]*?max-height:\s*calc\(88dvh - 118px\);/);
  assert.match(mobileHtml, /mobile\.css\?v=20260910-product-image-track-(?:dev|prd)/);
});

test("긴 모바일 제품명은 글꼴 로딩 뒤에도 실제 폭에 맞춰 축소하고 필요하면 줄바꿈한다", () => {
  assert.match(mobileCss, /\.product-image-lightbox header\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;/);
  assert.match(mobileCss, /\.product-image-lightbox header > div\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow:\s*hidden;/);
  assert.match(mobileCss, /\.product-image-lightbox h2\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/);
  assert.match(mobileCss, /\.product-image-lightbox h2\.is-multiline\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/);
  assert.match(mobileSource, /function fitProductImageModalTitle\(\)[\s\S]*?while \(title\.scrollWidth > availableWidth \+ 1 && fittedSize > 13\)/);
  assert.match(mobileSource, /title\.classList\.add\("is-multiline"\)/);
  assert.match(mobileSource, /document\.fonts\?\.ready\.then/);
  assert.match(mobileSource, /elements\.productImageModalTitle\.textContent = state\.activeProductImageName;\s*fitProductImageModalTitle\(\);/);
  assert.match(mobileHtml, /mobile\.js\?v=(?:20260910-product-image-track|20260911-inventory-move-persistence-v1)-(?:dev|prd)/);
});

test("제품 이미지 삭제 버튼은 고정 SVG X 아이콘으로 가운데 정렬한다", () => {
  assert.match(adminSource, /class="product-image-preview-remove"[\s\S]*?<svg viewBox="0 0 20 20"/);
  assert.doesNotMatch(adminSource, /class="product-image-preview-remove"[\s\S]*?<i class="ti ti-x"/);
  assert.match(stylesSource, /\.product-image-preview-remove\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?padding:\s*0;/);
  assert.match(stylesSource, /\.product-image-preview-remove svg\s*\{[\s\S]*?stroke:\s*currentColor;[\s\S]*?stroke-linecap:\s*round;/);
});

test("PC 제품 이미지와 하단 썸네일 영역 사이에 여백을 유지한다", () => {
  assert.match(stylesSource, /\.product-image-gallery-stage\s*\{[\s\S]*?padding:\s*1\.5rem 4\.5rem 2\.5rem;[\s\S]*?overflow:\s*hidden;/);
  assert.match(stylesSource, /\.product-image-gallery-stage > img\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?max-height:\s*100%;/);
  assert.match(adminHtml, /styles\.css\?v=(?:20260911-(?:production-plan-(?:width|rows)|print-page-isolation|inventory-audit-search|production-plan-delete)-v1|20260910-(?:invoice-preview-clear|update-history|notification-scroll-v3|production-plan-tabs-v1|production-plan-product-v[23]|production-plan-detail-v[1234]))-(?:dev|prd)/);
});
