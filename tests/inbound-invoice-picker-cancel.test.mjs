import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const adminHtml = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../frontend/styles.css", import.meta.url), "utf8");

test("거래명세서 선택창을 다시 열면 기존 임시 파일과 미리보기를 먼저 초기화한다", () => {
  assert.match(
    adminSource,
    /inboundInvoiceUploadButton\?\.addEventListener\("click", openInboundInvoicePicker\)/
  );
  assert.match(
    adminSource,
    /function openInboundInvoicePicker\(\) \{[\s\S]*?clearInboundInvoiceSelection\(\);[\s\S]*?inboundInvoiceFile\.click\(\);[\s\S]*?\}/
  );
  assert.match(adminSource, /function clearInboundInvoiceSelection\(\) \{[\s\S]*?inboundInvoiceFile\.value = "";[\s\S]*?clearButton: inboundInvoiceClearButton[\s\S]*?\}/);
});

test("거래명세서 미리보기 우측 상단의 X 버튼으로 선택을 취소한다", () => {
  assert.match(adminHtml, /id="inboundInvoiceClearButton"[^>]+aria-label="거래명세서 선택 취소"[^>]+hidden/);
  assert.match(adminSource, /inboundInvoiceClearButton\?\.addEventListener\("click", clearInboundInvoiceSelection\)/);
  assert.match(adminSource, /clearButton\.hidden = false/);
  assert.match(styles, /\.upload-preview-clear \{[\s\S]*?position: absolute;[\s\S]*?top: 0\.42rem;[\s\S]*?right: 0\.42rem;[\s\S]*?z-index: 3;/);
});
