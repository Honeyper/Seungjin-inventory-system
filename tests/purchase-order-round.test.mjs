import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../gas/Code.js", import.meta.url), "utf8");
const context = vm.createContext({
  console,
  Utilities: {
    formatDate(date) {
      return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
    }
  }
});
vm.runInContext(source, context);

test("스프레드시트 날짜 일련번호 발주 차수를 원래 월/일 문자로 복원한다", () => {
  assert.equal(context.normalizePurchaseOrderRoundText_(46266), "09/01");
  assert.equal(context.normalizePurchaseOrderRoundText_("46266"), "09/01");
});

test("일반 발주 차수와 이미 문자로 저장된 월/일 값은 그대로 유지한다", () => {
  assert.equal(context.normalizePurchaseOrderRoundText_("09/01"), "09/01");
  assert.equal(context.normalizePurchaseOrderRoundText_("3차"), "3차");
  assert.equal(context.normalizePurchaseOrderRoundText_(3), "3");
});

test("날짜 객체로 자동 변환된 발주 차수도 월/일 문자로 복원한다", () => {
  assert.equal(
    vm.runInContext("normalizePurchaseOrderRoundText_(new Date(Date.UTC(2026, 8, 1)))", context),
    "09/01"
  );
});
