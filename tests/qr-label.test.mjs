import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../frontend/qr-label.js");

const { getProcessRows } = globalThis.SeungjinQrLabel;

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
});
