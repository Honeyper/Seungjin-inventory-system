import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../frontend/styles.css", import.meta.url), "utf8");

test("제품 공정 요약에는 자동 적용 접두어를 표시하지 않는다", () => {
  assert.match(adminHtml, /id="productProcessSummary">공정을 선택해주세요\.<\/div>/);
  assert.doesNotMatch(stylesSource, /\.product-process-summary::before[\s\S]*?content:\s*["']자동 적용["']/);
});
