import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");

test("발주 화면과 연결 정보의 사용자 표시 명칭을 발주명으로 통일한다", () => {
  assert.match(adminHtml, /<span>발주명<\/span>\s*<input id="purchaseOrderRound"/);
  assert.match(adminHtml, /placeholder="제품명, 제품 ID, 거래처명, 발주명 검색"/);
  assert.match(adminHtml, /data-inbound-sort="6" aria-label="발주명 정렬">\s*발주명/);
  assert.match(adminSource, /detailItem\("발주명", inbound\.purchaseOrderRound\)/);
  assert.match(adminSource, /동일한 발주명이 이미 등록되어 있습니다/);
  assert.doesNotMatch(adminHtml, />발주 차수</);
});

test("내부 호환 필드 orderRound는 변경하지 않는다", () => {
  assert.match(adminHtml, /id="purchaseOrderRound"/);
  assert.match(adminSource, /orderRound: purchaseOrderRound\.value\.trim\(\)/);
});
