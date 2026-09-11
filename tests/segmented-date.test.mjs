import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

await import("../frontend/segmented-date.js");

const {
  composeDateValue,
  createController,
  parsePastedDate,
  sanitizeDatePart,
  splitDateValue
} = globalThis.SeungjinSegmentedDate;
const adminHtml = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
const adminSource = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../frontend/styles.css", import.meta.url), "utf8");

function createFakeInput() {
  const listeners = new Map();
  return {
    value: "",
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, extra = {}) {
      (listeners.get(type) || []).forEach((listener) => listener({
        key: "",
        preventDefault() {},
        ...extra
      }));
    },
    focus() {
      this.focused = true;
    },
    select() {}
  };
}

test("날짜 입력은 연도 4자리와 월일 2자리로 제한한다", () => {
  assert.equal(sanitizeDatePart("20269", "year"), "2026");
  assert.equal(sanitizeDatePart("0a9", "month"), "09");
  assert.equal(sanitizeDatePart("007", "day"), "00");
});

test("유효한 날짜만 YYYY-MM-DD 형식으로 조합한다", () => {
  assert.equal(composeDateValue({ year: "2026", month: "09", day: "09" }), "2026-09-09");
  assert.equal(composeDateValue({ year: "2026", month: "02", day: "30" }), "");
  assert.equal(composeDateValue({ year: "2026", month: "9", day: "09" }), "");
});

test("저장된 날짜와 붙여넣은 날짜를 각 입력 칸으로 분리한다", () => {
  assert.deepEqual(splitDateValue("2026-09-09"), { year: "2026", month: "09", day: "09" });
  assert.deepEqual(parsePastedDate("2026. 09. 09."), { year: "2026", month: "09", day: "09" });
  assert.equal(parsePastedDate("2026-02-30"), null);
});

test("연도 4자리와 월 2자리를 입력하면 다음 칸으로 자동 이동한다", () => {
  const fields = {
    year: createFakeInput(),
    month: createFakeInput(),
    day: createFakeInput()
  };
  const nativeInput = createFakeInput();
  const root = {
    classList: { remove() {}, toggle() {} },
    querySelector(selector) {
      return fields[selector.match(/data-date-part="(\w+)"/)?.[1]];
    }
  };
  createController(root, nativeInput);

  fields.year.value = "2026";
  fields.year.dispatch("input");
  assert.equal(fields.month.focused, true);

  fields.month.value = "09";
  fields.month.dispatch("input");
  assert.equal(fields.day.focused, true);

  fields.day.value = "09";
  fields.day.dispatch("input");
  assert.equal(nativeInput.value, "2026-09-09");
});

test("발주 시작일과 납기일은 분리 입력과 기존 달력 선택을 함께 제공한다", () => {
  assert.match(adminHtml, /data-segmented-date="purchaseOrderStartDate"/);
  assert.match(adminHtml, /data-segmented-date="purchaseOrderEndDate"/);
  assert.match(adminHtml, /id="purchaseOrderStartDate" type="date"/);
  assert.ok(adminHtml.indexOf("segmented-date.js") < adminHtml.indexOf("admin.js?v="));
  assert.match(adminSource, /purchaseOrderStartDateControl\?\.setValue/);
  assert.match(adminSource, /purchaseOrderEndDateControl\?\.setValue/);
  assert.match(stylesSource, /\.purchase-order-form \.segmented-date-control/);
});

test("날짜의 연월일 입력칸은 두 자리 숫자가 잘리지 않도록 고정 열로 배치한다", () => {
  assert.match(stylesSource, /\.purchase-order-form \.segmented-date-fields\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*4\.25rem 0\.45rem 2\.6rem 0\.45rem 2\.6rem 0\.45rem;/);
  assert.match(stylesSource, /\.purchase-order-form \.form-field \.segmented-date-part\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/);
  assert.match(adminHtml, /styles\.css\?v=(?:20260911-(?:production-plan-(?:width|rows)|print-page-isolation|inventory-audit-search|production-plan-delete|production-capacity|production-inputs|remainder-save)-v1|20260910-(?:invoice-preview-clear|update-history|notification-scroll-v3|production-plan-tabs-v1|production-plan-product-v[23]|production-plan-detail-v[1234]))-(?:dev|prd)/);
});
