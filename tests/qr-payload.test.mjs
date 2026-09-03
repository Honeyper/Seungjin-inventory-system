import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../frontend/qr-payload.js");

const { create, parse } = globalThis.SeungjinQrPayload;

test("새 QR은 박스 ID 뒤에 6자리 검증코드를 붙인다", () => {
  const value = create("IN-260902-ION-0001-001-B001");

  assert.match(value, /^IN-260902-ION-0001-001-B001~[0-9A-F]{6}$/);
  assert.deepEqual(parse(value), {
    boxId: "IN-260902-ION-0001-001-B001",
    hasChecksum: true,
    isValid: true
  });
});

test("QR 문자가 하나라도 바뀌면 검증에 실패한다", () => {
  const value = create("IN-260902-ION-0001-001-B001");
  const corrupted = value.replace("B001", "B002");

  assert.equal(parse(corrupted).isValid, false);
});

test("현장에 출력된 기존 박스 ID QR도 계속 허용한다", () => {
  assert.deepEqual(parse("IN-260902-ION-0001-001-B001"), {
    boxId: "IN-260902-ION-0001-001-B001",
    hasChecksum: false,
    isValid: true
  });
});

test("관리자와 모바일은 동일한 QR 검증 모듈을 버전 고정해 불러온다", async () => {
  const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
  const mobileHtml = await readFile(new URL("../frontend/mobile/index.html", import.meta.url), "utf8");

  assert.match(adminHtml, /qr-payload\.js\?v=20260904-box-checksum-prd/);
  assert.match(mobileHtml, /qr-payload\.js\?v=20260904-box-checksum-prd/);
});
