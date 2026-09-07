import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../frontend/styles.css", import.meta.url), "utf8");

test("입고 요약 왼쪽에 선택한 제품 이미지 칸을 표시한다", () => {
  assert.match(html, /id="inboundSummaryProductVisual"/);
  assert.match(html, /id="inboundSummaryProductImage"/);
  assert.match(source, /updateInboundSummaryProductImage\(selectedProduct\)/);
  assert.match(source, /product\?\.productImageUrl/);
  assert.match(source, /drive\.google\.com\/thumbnail/);
  assert.match(source, /inboundSummaryProductImage\?\.addEventListener\("error"/);
});

test("제품 이미지 칸을 추가하면서 기존 수량 영역 폭을 줄인다", () => {
  assert.match(css, /grid-template-columns:\s*7rem minmax\(14rem, 0\.9fr\)/);
  assert.match(css, /\.inbound-summary-product-image\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?grid-row:\s*2;/);
  assert.match(css, /\.inbound-summary-card dl\s*\{[\s\S]*?grid-column:\s*2;/);
});

test("제품 이미지가 없을 때 빈 상태를 유지한다", () => {
  assert.match(html, /id="inboundSummaryProductPlaceholder"/);
  assert.match(source, /product \? "이미지 없음" : "제품 이미지"/);
  assert.match(css, /\.inbound-summary-product-placeholder\[hidden\]/);
});
