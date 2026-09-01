import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const adminHtml = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");

test("실물 미확인 카드는 미확인 박스 합계를 box 단위로 표시한다", () => {
  assert.match(adminSource, /physicalMissingCount: rows\.reduce\(\(sum, row\) => sum \+ Number\(row\.inventoryUnconfirmedBoxCount \|\| 0\), 0\)/);
  assert.match(adminHtml, /id="inventoryPhysicalMissing">-<\/span> <em>box<\/em>/);
});

test("실물 미확인 상세는 모바일 재고조사 미확인 박스만 사용한다", () => {
  assert.match(adminSource, /모바일 재고 조사에서 아직 실물 확인되지 않은 박스 목록/);
  assert.match(adminSource, /Number\(item\?\.inventoryUnconfirmedBoxCount \|\| 0\) > 0/);
  assert.doesNotMatch(adminSource, /metric: \(item\) => `\$\{formatNumber\(item\.inventoryAdjustmentBoxCount\)\} box`/);
});
