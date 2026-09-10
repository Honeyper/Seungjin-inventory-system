import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyMutation } from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

const adminHtml = await readFile(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../frontend/admin.js", import.meta.url), "utf8");
const gasSource = await readFile(new URL("../gas/Code.js", import.meta.url), "utf8");

test("거래명세서는 입고 저장 전에 Google Drive에 즉시 업로드한다", () => {
  assert.match(adminSource, /requestApi\("uploadInboundInvoice"/);
  assert.match(adminSource, /payload\.invoiceFileUrl = await uploadInboundInvoiceFile\(payload, invoiceFile\)/);
  assert.doesNotMatch(adminSource, /payload\.invoiceFile = await getInboundInvoicePayload\(\)/);
  assert.match(gasSource, /function uploadInboundInvoice\(payload\)/);
  assert.match(gasSource, /return \{ invoiceFileUrl \}/);
  assert.match(gasSource, /uploadInboundInvoice_\(payload,[\s\S]*?\) \|\| String\(payload\.invoiceFileUrl \|\| ''\)\.trim\(\)/);
  assert.match(adminHtml, /admin\.js\?v=20260910-invoice-picker-cancel-(?:dev|prd)/);
});

test("즉시 업로드된 거래명세서 URL은 Supabase 입고와 재고 레코드에 보존된다", () => {
  const invoiceFileUrl = "https://drive.google.com/file/d/test-invoice/view";
  const mutation = applyMutation("createInbound", {
    registrant: "테스터",
    inboundDate: "2026-09-09",
    inboundTime: "15:50",
    inboundType: "정상입고",
    productId: "TEST-0001",
    productName: "테스트 제품",
    clientName: "테스트 업체",
    storage: "A",
    boxQuantity: 100,
    inboundBoxCount: 1,
    inspectionQuantity: 10,
    defectQuantity: 0,
    defectReason: "양호",
    invoiceFileUrl
  }, {
    products: [{
      productId: "TEST-0001",
      productName: "테스트 제품",
      clientName: "테스트 업체",
      finalProcess: "1도",
      trayQuantity: "10 ea"
    }],
    orders: [],
    inbounds: [],
    records: [],
    boxes: []
  }, new Date("2026-09-09T06:50:00.000Z"));

  assert.equal(mutation.state.inbounds[0].invoiceFileUrl, invoiceFileUrl);
  assert.equal(mutation.state.records[0].invoiceFileUrl, invoiceFileUrl);
  assert.equal(mutation.changes.inbounds.upserts[0].data.invoiceFileUrl, invoiceFileUrl);
  assert.equal(mutation.changes.inventoryRecords.upserts[0].data.invoiceFileUrl, invoiceFileUrl);
});
