import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const today = "2026-09-11";
const yesterday = "2026-09-10";
const ready = "출고대기(검수완료)";

function box(status, quantity = 1089, date = today, extra = {}) {
  return { status, quantity, inspectionDate: date, inspectionQuantity: 50,
    defectQuantity: 2, defectRate: 4, ...(status === "출고완료" ? { shippingDate: date } : {}), ...extra };
}

function row(managementId, boxes, extra = {}) {
  const activeShippingBoxes = boxes.filter(item => item.status !== "출고완료");
  const shippedShippingBoxes = boxes.filter(item => item.status === "출고완료");
  return {
    managementId, productId: managementId, productName: "닥터멜락신 멀티밤 10g <핑크>",
    clientName: "(주)케이알", storage: "현장", stockStatus: "보관", inboundDate: yesterday,
    currentTotalQuantity: activeShippingBoxes.reduce((sum, item) => sum + item.quantity, 0),
    currentBoxCount: activeShippingBoxes.length, activeShippingBoxes, shippedShippingBoxes,
    allShippingBoxes: boxes, ...extra
  };
}

function runtime(rows = [
  row("PINK-STOCK", [box("보관")]),
  row("PINK-PARTIAL", [box("출고대기"), box("출고완료"), box("출고완료"), box("출고완료", 500, yesterday)]),
  row("OTHER-COMPLETE", [box("출고완료", 9000)], { productName: "다른 제품", clientName: "다른 거래처", storage: "창고" }),
  row("OTHER-HOLD", [box("보류")], { productName: "다른 제품", clientName: "다른 거래처", storage: "창고" })
]) {
  const context = vm.createContext({
    state: { inventoryRows: rows, products: [], shippingFilters: {}, shippingListPeriodOnly: false,
      shippingSort: { key: "inboundDate", direction: "desc" }, shippingPage: 1, shippingPageSize: 10 },
    SHIPPING_READY_STATUS_LABEL: ready, SHIPPING_BOX_DRAFTS_STORAGE_KEY: "test",
    sessionStorage: { getItem: () => null },
    shippingSearchInput: { value: "" }, shippingClientFilter: { value: "" },
    shippingStorageFilter: { value: "" }, shippingInspectionFilter: { value: "" },
    shippingStatusFilter: { value: "" }, shippingPeriodListOnly: { checked: false },
    shippingSortKey: null, shippingSortDirection: null,
    shippingSettlementStartDate: { value: today }, shippingSettlementEndDate: { value: today },
    shippingSettlementFields: Object.fromEntries(["totalQuantity", "totalBoxes", "inspectedQuantity",
      "defectQuantity", "defectRate"].map(key => [key, { textContent: "" }])),
    shippingSummaryCards: Array.from({ length: 3 }, () => {
      const strong = { innerHTML: "" };
      return { strong, querySelector: () => strong };
    })
  });
  // Execute the real frontend functions without application startup or API requests.
  const names = ["getShippingSourceRows", "getShippingRows", "syncShippingFilterState", "getShippingFilterValue",
    "getEffectiveShippingStatus", "isShippingInspected", "getShippingInspectionFilterValue", "getShippingStatusFilterValue",
    "getCompletedShippingTypeLabel", "renderPlainShippingStatus", "normalizeInventoryStockStatus", "normalizeSearchText",
    "readShippingBoxDrafts", "compareShippingRows", "getShippingDateTimeTimestamp", "toDateInputValue", "toTimeInputValue",
    "normalizeEditableValue", "getShippingSettlementSourceRows", "getShippingSettlementItems", "getShippingSettlementBoxItems",
    "getShippingSettlementItemDate", "getShippingSettlementInspectionDate", "getShippingSettlementFallbackDate",
    "getShippingSettlementBoxDate", "getShippingSettlementItemDates", "getShippingSettlementDateRange",
    "isShippingSettlementDateMatch", "isShippingSettlementDateInRange", "getShippingSettlementInspectionKey",
    "getShippingSettlementBoxQuantity", "getShippingSettlementQuantity", "getShippingSettlementBoxCount",
    "getShippingInspectionTrayQuantityFromItem", "findShippingInspectionTrayQuantity", "getQuantityNumberFromText", "extractQuantityNumber",
    "parseShippingSettlementNumber", "formatShippingSettlementNumber", "formatShippingSettlementPercent",
    "getShippingSettlementStatusCounts", "updateShippingSummaryCards", "updateShippingSettlementSummary", "setShippingSettlementText",
    "resetShippingFilters", "syncShippingSortControls",
    ...["getShippingWorkflowActiveBoxes", "isClassifiedRemainingInventoryBox", "hasPendingShippingBoxes"]
      .filter(name => source.includes(`function ${name}(`))];
  const functions = names.map(name => {
    const match = source.match(new RegExp(`^function ${name}\\([^]*?\\n\\}`, "m"));
    assert.ok(match, `Missing function: ${name}`);
    return match[0];
  });
  vm.runInContext(functions.join("\n"), context);
  return context;
}

function summary(app) {
  app.updateShippingSettlementSummary();
  app.updateShippingSummaryCards();
  return Object.fromEntries(Object.entries(app.shippingSettlementFields).map(([key, element]) => [key, element.textContent]));
}

function ids(rows) {
  return Array.from(rows, item => item.managementId).sort();
}

test("제품 검색 시 해당 제품의 기간 내 출고 박스와 검사·불량 값만 집계한다", () => {
  const app = runtime();
  app.shippingSearchInput.value = "닥터멜락신멀티밤 10g";
  assert.deepEqual(summary(app), { totalQuantity: "2,178", totalBoxes: "2", inspectedQuantity: "50", defectQuantity: "2", defectRate: "4" });
  assert.deepEqual(Array.from(app.getShippingSettlementStatusCounts(app.getShippingSettlementBoxItems())), [1, 0, 1]);
  assert.equal(app.shippingSummaryCards[2].strong.innerHTML, "1 <em>건</em>");
});

for (const [control, value, expected] of [
  ["shippingClientFilter", "(주)케이알", ["PINK-PARTIAL", "PINK-STOCK"]],
  ["shippingStorageFilter", "창고", ["OTHER-COMPLETE", "OTHER-HOLD"]],
  ["shippingInspectionFilter", "검수 전", ["PINK-STOCK"]],
  ["shippingInspectionFilter", ready, ["OTHER-COMPLETE", "OTHER-HOLD", "PINK-PARTIAL"]],
  ["shippingStatusFilter", "일부 출고", ["PINK-PARTIAL"]],
  ["shippingStatusFilter", "출고 완료", ["OTHER-COMPLETE"]],
  ["shippingStatusFilter", "출고 보류", ["OTHER-HOLD"]]
]) {
  test(`${control}: ${value} 필터를 목록과 결산에 동일하게 적용한다`, () => {
    const app = runtime();
    app[control].value = value;
    assert.deepEqual(ids(app.getShippingRows()), expected);
    assert.deepEqual(ids(app.getShippingSettlementSourceRows()), expected);
  });
}

test("여러 필터를 함께 적용하고 결과가 없으면 모든 결산을 0으로 표시한다", () => {
  const app = runtime();
  app.shippingSearchInput.value = "멀티밤";
  app.shippingClientFilter.value = "(주)케이알";
  app.shippingStatusFilter.value = "일부 출고";
  assert.deepEqual(ids(app.getShippingSettlementSourceRows()), ["PINK-PARTIAL"]);
  app.shippingStorageFilter.value = "창고";
  assert.deepEqual(summary(app), { totalQuantity: "0", totalBoxes: "0", inspectedQuantity: "0", defectQuantity: "0", defectRate: "0" });
  assert.deepEqual(Array.from(app.getShippingSettlementStatusCounts(app.getShippingSettlementBoxItems())), [0, 0, 0]);
});

test("기간 변경 및 기간만 조회 선택에서도 검색을 유지하고 해당 날짜의 박스만 집계한다", () => {
  const app = runtime();
  app.shippingSearchInput.value = "멀티밤";
  app.shippingSettlementStartDate.value = yesterday;
  app.shippingSettlementEndDate.value = yesterday;
  for (const periodOnly of [false, true]) {
    app.state.shippingListPeriodOnly = periodOnly;
    assert.equal(summary(app).totalQuantity, "500");
    assert.deepEqual(Array.from(app.getShippingSettlementStatusCounts(app.getShippingSettlementBoxItems())), [0, 0, 1]);
  }
  app.shippingSettlementEndDate.value = today;
  assert.equal(summary(app).totalQuantity, "2,678");
  app.resetShippingFilters();
  assert.equal(summary(app).totalQuantity, "11,678");
});

test("페이지·정렬을 바꿔도 필터에 맞는 전체 항목의 합계는 유지한다", () => {
  const app = runtime(Array.from({ length: 35 }, (_, index) => row(`PINK-${index}`, [box("출고완료", 100)])));
  app.shippingSearchInput.value = "멀티밤";
  for (const page of [1, 2, 4]) {
    app.state.shippingPage = page;
    app.state.shippingPageSize = page === 2 ? 20 : 10;
    app.state.shippingSort.direction = page === 2 ? "asc" : "desc";
    assert.equal(summary(app).totalQuantity, "3,500");
    assert.equal(summary(app).totalBoxes, "35");
    assert.equal(app.getShippingSettlementSourceRows().length, 35);
  }
});
