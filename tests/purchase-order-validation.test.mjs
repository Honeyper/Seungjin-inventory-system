import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const gatewaySource = fs.readFileSync(
  new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url),
  "utf8"
);

test("신규 발주 화면은 서버 요청 전에 동일 제품과 발주명을 안내한다", () => {
  assert.match(adminSource, /function findDuplicatePurchaseOrder\(payload\)/);
  assert.match(adminSource, /기존 발주를 수정하거나 다른 발주명을 입력해주세요/);
});

test("Supabase 함수도 중복 발주 검증 문구를 안전하게 반환한다", () => {
  assert.match(gatewaySource, /CLIENT_SAFE_ERROR_MESSAGES/);
  assert.match(gatewaySource, /clientMessage \? 409 : 500/);
  assert.match(gatewaySource, /기존 발주를 수정하거나 다른 발주 차수를 입력해주세요/);
});
