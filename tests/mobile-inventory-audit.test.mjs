import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileSource = fs.readFileSync(path.join(__dirname, "../frontend/mobile/mobile.js"), "utf8");

test("mobile inventory audit sends only scanned boxes for physical confirmation", () => {
  assert.match(mobileSource, /requestApi\("adjustMissingInventory", \{\s*adjustments: \[\],\s*confirmedBoxes: plan\.confirmedBoxes,\s*confirmationOnly: true,/);
  assert.match(mobileSource, /스캔하지 않은 박스는 변경하지 않습니다/);
  assert.match(mobileSource, /미스캔 .*박스 유지/);
  assert.doesNotMatch(mobileSource, /개 미확인 박스 재고조정 완료/);
});
