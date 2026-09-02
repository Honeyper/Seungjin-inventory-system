import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../frontend/qr-label.js");

const { getBoxQuantityData, getProcessRows, getProcessSummary } = globalThis.SeungjinQrLabel;

test("QR 기준수량은 박스 실제 수량을 사용하고 잔량 박스를 구분한다", () => {
  assert.deepEqual(getBoxQuantityData({
    currentQuantity: "240 ea",
    boxQuantity: "240 ea",
    referenceQuantity: "1,000 ea"
  }), { quantity: 240, isRemainder: true });

  assert.deepEqual(getBoxQuantityData({
    currentQuantity: "1,000 ea",
    boxQuantity: "1,000 ea",
    referenceQuantity: "1,000 ea"
  }), { quantity: 1000, isRemainder: false });

  assert.deepEqual(getBoxQuantityData({
    currentQuantity: "242 ea",
    boxQuantity: "242 ea",
    referenceQuantity: "242 ea",
    sequence: 31,
    fullBoxCount: "30 box",
    totalBoxCount: 31,
    remainderCount: 1
  }), { quantity: 242, isRemainder: true });
});

test("기본 공정은 1도, 2도, 3도 순서를 유지한다", () => {
  assert.deepEqual(getProcessRows({ finalProcess: "2도" }), [
    { label: "1도", disabled: false, treatment: false },
    { label: "2도", disabled: false, treatment: false },
    { label: "3도", disabled: true, treatment: false }
  ]);
});

test("화염은 첫 칸에 놓고 1도와 2도를 뒤로 이동한다", () => {
  assert.deepEqual(getProcessRows({ finalProcess: "1도", flameTreatmentStatus: "유" }), [
    { label: "화염", disabled: false, treatment: true },
    { label: "1도", disabled: false, treatment: false },
    { label: "2도", disabled: true, treatment: false }
  ]);
});

test("박가루는 세 번째 공정 칸에 놓는다", () => {
  assert.deepEqual(getProcessRows({ finalProcess: "2도", dustRemovalStatus: "유" }), [
    { label: "1도", disabled: false, treatment: false },
    { label: "2도", disabled: false, treatment: false },
    { label: "박가루", disabled: false, treatment: true }
  ]);
});

test("화염과 박가루가 모두 있으면 첫 칸과 세 번째 칸에 배치한다", () => {
  assert.deepEqual(getProcessRows({
    finalProcess: "1도",
    flameTreatmentStatus: "유",
    dustRemovalStatus: "유"
  }).map((row) => row.label), ["화염", "1도", "박가루"]);
});

test("특수 공정은 최종공정 뒤에 박가루와 화염 순서로 표시한다", () => {
  assert.equal(
    getProcessSummary({ finalProcess: "1도", dustRemovalStatus: "유" }),
    "1도 / 박가루"
  );
  assert.equal(
    getProcessSummary({ finalProcess: "2도", flameTreatmentStatus: "유" }),
    "2도 / 화염"
  );
  assert.equal(
    getProcessSummary({ finalProcess: "1도", dustRemovalStatus: "유", flameTreatmentStatus: "유" }),
    "1도 / 박가루 / 화염"
  );
});

test("인쇄 시 비활성 공정은 흰 배경과 회색 글자로 출력한다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");
  const printRules = css.slice(css.indexOf("@media print"));

  assert.match(printRules, /\.box-qr-reference-row\.is-disabled\s*\{[\s\S]*?color:\s*#9aa3af\s*!important;/);
  assert.match(printRules, /\.box-qr-reference-row\.is-disabled\s*\{[\s\S]*?background:\s*#fff\s*!important;/);
  assert.doesNotMatch(printRules, /\.box-qr-reference-row\.is-disabled\s*\{[\s\S]*?background:\s*#050505\s*!important;/);
});

test("ea는 연하게 표시하고 월과 일은 각 칸 오른쪽에 정렬한다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");

  assert.match(css, /\.box-qr-reference-quantity\s*\{[\s\S]*?color:\s*#9aa3af;/);
  assert.match(
    css,
    /\.box-qr-reference-month,\s*\.box-qr-reference-day\s*\{[\s\S]*?justify-content:\s*flex-end;/
  );
});

test("QR 외곽선은 내부 선보다 위에 그려져 왼쪽 선을 일자로 유지한다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");

  assert.match(css, /\.box-qr-label-reference\s*\{[\s\S]*?position:\s*relative;[\s\S]*?border:\s*0;/);
  assert.match(
    css,
    /\.box-qr-label-reference::after\s*\{[\s\S]*?inset:\s*0;[\s\S]*?border:\s*0\.5pt solid #050505;/
  );
  assert.match(
    css,
    /\.box-qr-reference-title,[\s\S]*?\.box-qr-reference-row\s*\{[\s\S]*?clip-path:\s*inset\(0 0\.5pt\);/
  );
});

test("제품명 영역은 왼쪽에 충분한 여백을 둔다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.box-qr-reference-product\s*\{[\s\S]*?padding:\s*1\.6mm 0\.9mm 1\.8mm 1\.8mm;/
  );
});

test("제품명 라벨은 제거하고 실제 제품명만 제품 영역 가운데에 배치한다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");
  const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");

  assert.doesNotMatch(adminSource, /<span>제품명<\/span>/);
  assert.doesNotMatch(css, /\.box-qr-reference-product-heading/);
  assert.match(css, /\.box-qr-reference-product\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\);/);
  assert.match(
    css,
    /\.box-qr-reference-product-name\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?text-align:\s*center;/
  );
});

test("실제 제품명 크기는 유지한다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");

  assert.match(css, /\.box-qr-reference-product-name\s*\{[\s\S]*?font-size:\s*10\.8pt;/);
  assert.match(css, /\.qr-sheet-work \.box-qr-reference-product-name\s*\{[\s\S]*?font-size:\s*9\.2pt;/);
});

test("QR 왼쪽 세로선은 다른 행과 같은 왼쪽 테두리 좌표를 사용한다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");
  const productRule = css.match(/\.box-qr-reference-product\s*\{([\s\S]*?)\}/)?.[1] || "";
  const mediaRule = css.match(/\.box-qr-reference-media\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.doesNotMatch(productRule, /border-right/);
  assert.match(mediaRule, /border-left:\s*0\.4pt solid #050505;/);
});

test("DEV 기본 QR은 A4 한 장에 2열 5행으로 출력한다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");
  const printRules = css.slice(css.indexOf("@media print"));

  assert.match(css, /\.qr-sheet\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, 1fr\);[\s\S]*?grid-auto-rows:\s*59\.4mm;/);
  assert.match(printRules, /\.qr-sheet\s*\{[\s\S]*?grid-auto-rows:\s*57\.4mm;/);
  assert.match(printRules, /\.box-qr-label-reference\s*\{[\s\S]*?height:\s*57\.4mm;/);
  assert.match(css, /grid-template-rows:\s*5\.4mm 5\.4mm 16\.4mm 5\.8mm repeat\(3, 6\.4mm\) 7\.2mm;/);
  assert.match(css, /\.box-qr-reference-table-head\s*\{[\s\S]*?font-size:\s*8\.5pt;/);
  assert.match(css, /\.box-qr-reference-row strong\s*\{[\s\S]*?font-size:\s*9pt;/);
  assert.match(css, /\.qr-sheet\.qr-sheet-work\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, 1fr\);/);
});

test("잔량 박스는 라벨을 잔량으로 바꾸고 라벨과 수량 칸을 노란색으로 표시한다", async () => {
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");
  const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");

  assert.match(adminSource, /quantityData\.isRemainder \? "잔량" : "기준수량"/);
  assert.match(adminSource, /box-qr-reference-quantity-label\$\{quantityData\.isRemainder \? " is-remainder" : ""\}/);
  assert.match(adminSource, /box-qr-reference-quantity-value\$\{quantityData\.isRemainder \? " is-remainder" : ""\}/);
  assert.match(css, /\.box-qr-reference-summary \.box-qr-reference-quantity-label\.is-remainder,\s*\.box-qr-reference-summary \.box-qr-reference-quantity-value\.is-remainder\s*\{[\s\S]*?background:\s*#ffe98a;/);
});

test("차수는 상단 요약행에 표시하고 값이 없으면 하이픈을 사용한다", async () => {
  const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../frontend/qr-dev-label.css", import.meta.url), "utf8");

  assert.match(adminSource, /box-qr-reference-batch-value\$\{batchText \? " has-value" : ""\}[^>]*>\$\{escapeHtml\(batchText \|\| "-"\)\}<\/strong>/);
  assert.match(css, /\.box-qr-reference-summary \.box-qr-reference-batch-value\.has-value\s*\{[\s\S]*?background:\s*#ffe98a;/);
  assert.doesNotMatch(adminSource, /<b>&lt;\$\{escapeHtml\(batchText\)\}&gt;<\/b>/);
  assert.match(adminSource, /<strong>입고일<\/strong>\s*<span class="box-qr-reference-date-value">/);
});
