import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");
const gatewayClientSource = await readFile(new URL("../frontend/supabase-gateway.js", import.meta.url), "utf8");
const gatewayFunctionSource = await readFile(
  new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url),
  "utf8"
);

test("QR 목록 조회는 쓰기가 아니라 Supabase 빠른 읽기 경로를 사용한다", () => {
  const readActions = gatewayClientSource.match(/const readActions = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const mutationActions = gatewayClientSource.match(/const mutationActions = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";

  assert.match(readActions, /"getInboundBoxQrs"/);
  assert.doesNotMatch(mutationActions, /"getInboundBoxQrs"/);
  assert.match(gatewayFunctionSource, /async function readInboundBoxQrs\(payload: JsonRecord\)/);
  assert.match(gatewayFunctionSource, /dev_inventory_boxes\?\$\{query\}/);
  assert.match(gatewayFunctionSource, /meta: \{ source: "supabase-canonical-scoped" \}/);
});

test("QR 상태 기록은 전체 상태 충돌 없이 화면 응답 뒤 해당 입고만 갱신한다", () => {
  assert.match(gatewayFunctionSource, /scheduleInboundQrStatusUpdate\(payload, result\);/);
  assert.match(gatewayFunctionSource, /rpc\/mark_dev_inbound_qr_generated/);
  assert.doesNotMatch(gatewayFunctionSource, /commitCanonicalMutation\("getInboundBoxQrs"/);
  assert.match(gatewayFunctionSource, /EdgeRuntime\?: \{ waitUntil\?:/);
});

test("QR 이미지는 외부 서버별 요청 대신 브라우저에서 나누어 생성한다", () => {
  assert.match(adminHtml, /qrcode-generator@1\.4\.4\/qrcode\.min\.js/);
  assert.match(adminSource, /typeof globalThis\.qrcode === "function"/);
  assert.match(adminSource, /qr\.createDataURL\(4, 1\)/);
  assert.match(adminSource, /const INBOUND_QR_RENDER_BATCH_SIZE = 8;/);
  assert.match(adminSource, /requestAnimationFrame\(resolve\)/);
  assert.match(adminSource, /data-qr-value=/);
});

test("QR에는 외부 스캐너가 빠르게 전송할 수 있도록 박스 ID만 우선 인코딩한다", () => {
  assert.match(adminSource, /const qrData = box\.boxId \|\| box\.qrData \|\| "";/);
});
