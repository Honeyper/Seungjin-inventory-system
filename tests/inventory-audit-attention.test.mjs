import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const adminHtml = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");

test("실물 미확인 카드는 미확인 박스 합계를 box 단위로 표시한다", () => {
  assert.match(adminSource, /physicalMissingCount: rows\.reduce\(\(sum, row\) => sum \+ Number\(row\.inventoryUnconfirmedBoxCount \|\| 0\), 0\)/);
  assert.match(adminHtml, /id="inventoryPhysicalMissing">-<\/span> <em>box<\/em>/);
});

test("실물 확인 상세는 미확인 박스와 확인 완료 박스를 구분한다", () => {
  assert.match(adminSource, /모바일 재고조사 대상 박스를 확인 상태별로 구분합니다/);
  assert.match(adminSource, /미확인 .*inventoryUnconfirmedBoxCount/);
  assert.match(adminSource, /확인 완료 .*inventoryConfirmedBoxCount/);
  assert.match(adminSource, /Number\(item\?\.inventoryAuditTargetBoxCount \|\| 0\) > 0/);
  assert.doesNotMatch(adminSource, /metric: \(item\) => `\$\{formatNumber\(item\.inventoryAdjustmentBoxCount\)\} box`/);
});
