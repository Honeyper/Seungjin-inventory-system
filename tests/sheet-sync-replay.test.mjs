import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../gas/Code.js", import.meta.url), "utf8");

function readFunction(name) {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} 함수를 찾을 수 없습니다.`);
  return vm.runInNewContext(`(${match[0]})`);
}

test("이미 반영되어 변경할 박스가 없는 출고 백업은 멱등 성공으로 처리한다", () => {
  const isSuperseded = readFunction("isSupabaseReplaySupersededError_");

  assert.equal(isSuperseded(
    "updateShippingStatus",
    new Error("현재 상태에서 변경할 수 있는 박스가 없습니다. 목록을 새로고침한 후 다시 확인해주세요.")
  ), true);
  assert.equal(isSuperseded(
    "updateShippingStatus",
    new Error("선택한 박스는 이미 출고완료 상태입니다. 먼저 출고 취소한 뒤 새로고침 후 다시 출고해주세요.")
  ), true);
  assert.equal(isSuperseded("updateInbound", new Error("현재 상태에서 변경할 수 있는 박스가 없습니다.")), false);
  assert.equal(isSuperseded("updateShippingStatus", new Error("박스관리 DB의 헤더를 찾을 수 없습니다.")), false);
});

test("멱등 성공한 PRD 백업은 순번을 전진시키고 다음 항목을 계속 처리한다", () => {
  assert.match(source, /if \(isSupabaseReplaySupersededError_\(action, error\)\) \{/);
  assert.match(source, /data: \{ alreadyApplied: true, superseded: true/);
  assert.match(source, /properties\.setProperty\(propertyName, String\(id\)\);/);
});
