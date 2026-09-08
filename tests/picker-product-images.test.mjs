import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../frontend/styles.css", import.meta.url), "utf8");
const context = vm.createContext({ MAX_PRODUCT_IMAGE_COUNT: 10 });

test("제품 미리보기와 목록의 이미지 열은 3rem으로 함께 확대된다", () => {
  assert.match(styles, /\.picker-product-icon\s*\{[^}]*width: 3rem;[^}]*height: 3rem;/);
  assert.match(styles, /grid-template-columns: 3rem minmax\(0, 1fr\) auto 6\.6rem 1\.25rem;/);
  assert.match(styles, /grid-template-columns: 3rem minmax\(0, 1fr\) 1\.25rem;/);
  assert.match(styles, /\.picker-product-icon img\s*\{[^}]*object-fit: contain;/);
});
for (const name of ["escapeHtml", "normalizeInboundSummaryProductImageUrl", "normalizeProductImageUrls", "getProductImageUrls", "renderPickerProductImage"]) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  vm.runInContext(source.slice(start, source.indexOf("\n}\n", start) + 3), context);
}

test("제품 선택 목록에는 등록된 첫 이미지 하나를 지연 로딩한다", () => {
  const html = context.renderPickerProductImage({ productImageUrls: ["https://example.com/first.png", "https://example.com/second.png"] });
  assert.match(html, /src="https:\/\/example.com\/first.png"/);
  assert.doesNotMatch(html, /second.png/);
  assert.match(html, /loading="lazy" decoding="async"/);
});

test("기존 단일 이미지와 한글 필드 및 Drive 주소를 지원한다", () => {
  assert.match(context.renderPickerProductImage({ productImageUrl: "https://example.com/old.png" }), /old.png/);
  const html = context.renderPickerProductImage({ "제품 이미지 목록": '["https://drive.google.com/file/d/abc123/view"]' });
  assert.match(html, /drive.google.com\/thumbnail\?id=abc123/);
});

test("이미지가 없거나 잘못된 URL이면 기본 아이콘을 유지하고 속성은 이스케이프한다", () => {
  for (const product of [{}, { productImageUrl: "javascript:alert(1)" }]) {
    const html = context.renderPickerProductImage(product);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /ti-package/);
  }
  assert.match(context.renderPickerProductImage({productImageUrl:'https://example.com/a"b.png'}), /a&quot;b.png/);
});
