import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../frontend/styles.css", import.meta.url), "utf8");

test("거래명세서, 불량 사진, 제품 이미지에 드래그앤드롭 영역을 연결한다", () => {
  assert.match(adminHtml, /id="inboundInvoiceUploadButton"[^>]+data-drop-input="inboundInvoiceFile"/);
  assert.match(adminHtml, /id="inboundDefectUploadButton"[^>]+data-drop-input="inboundDefectFiles"/);
  assert.match(adminHtml, /class="product-image-field full-span"[^>]+data-drop-input="productImageFile"/);
  assert.match(adminSource, /bindFileDropZone\(inboundInvoiceUploadButton, inboundInvoiceFile\)/);
  assert.match(adminSource, /bindFileDropZone\(inboundDefectUploadButton, inboundDefectFiles\)/);
  assert.match(adminSource, /bindFileDropZone\(productImageDropZone, productImageFile\)/);
});

test("드롭한 파일을 기존 입력과 검증 흐름으로 전달한다", () => {
  assert.match(adminSource, /const transfer = new DataTransfer\(\)/);
  assert.match(adminSource, /input\.files = transfer\.files/);
  assert.match(adminSource, /input\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(adminSource, /selectedFiles\.some\(\(file\) => !file\.type\.startsWith\("image\/"\)\)/);
});

test("드래그 중인 영역을 기존 네이비와 골드 계열로 강조하고 보조 문구는 표시하지 않는다", () => {
  assert.match(stylesSource, /\.upload-tile\.is-dragging/);
  assert.match(stylesSource, /\.product-image-field\.is-dragging/);
  assert.doesNotMatch(adminHtml, /class="upload-drop-hint"/);
});
