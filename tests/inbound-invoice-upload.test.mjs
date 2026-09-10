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
  assert.match(adminHtml, /admin\.js\?v=20260910-(?:inventory-attachments|update-history(?:-v2)?|notification-scroll-v3|production-plan-tabs-v1|production-plan-product-v[23]|production-plan-detail-v1)-(?:dev|prd)/);
});

test("재고 상세 조회에도 거래명세서와 불량사진 링크를 포함한다", () => {
  assert.match(gasSource, /includeSheetRowNumber: true/);
  assert.match(gasSource, /invoiceFileUrl: invoiceLinksByRow\[stockRow\.__sheetRowNumber\]/);
  assert.match(gasSource, /defectPhotoUrls: defectPhotoLinksByRow\[stockRow\.__sheetRowNumber\]/);
  assert.match(adminSource, /readAdminLargeCache\("inventory-dashboard:v2"\)/);
  assert.match(adminSource, /function mergeInboundAttachmentDetails\(preferred, candidates = \[\]\)/);
  assert.match(adminSource, /const detailInbound = normalizeInboundDetailRecord\(mergeInboundAttachmentDetails\(/);
});

test("거래명세서 원본은 문서 가독성을 유지하는 크기로 줄여 전송한다", () => {
  assert.match(adminSource, /const INVOICE_IMAGE_MAX_EDGE = 2000/);
  assert.match(adminSource, /const INVOICE_IMAGE_JPEG_QUALITY = 0\.88/);
  assert.match(adminSource, /async function optimizeInboundInvoiceImage\(file\)/);
  assert.match(adminSource, /await createImageBitmap\(file\)/);
  assert.match(adminSource, /canvas\.toBlob\(resolve, "image\/jpeg", INVOICE_IMAGE_JPEG_QUALITY\)/);
  assert.match(adminSource, /optimizedBlob\.size >= file\.size/);
  assert.match(adminSource, /const uploadFile = await optimizeInboundInvoiceImage\(file\)/);
});

test("거래명세서 최적화와 불량사진 읽기를 병렬로 준비한다", () => {
  assert.match(adminSource, /const \[invoiceFile, defectFiles\] = await Promise\.all\(\[[\s\S]*?getInboundInvoicePayload\(\),[\s\S]*?getInboundDefectFilePayloads\(\)[\s\S]*?\]\)/);
  assert.match(adminSource, /payload\.defectFiles = defectFiles/);
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
