import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { adminSource, loadFunctions } from "./helpers/frontend-runtime.mjs";

test("최근 작업순 정렬은 입고 건별 날짜를 한 번 계산하고 다음 조회의 변경을 반영한다", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ managementId: `IN-${i}`, time: i % 7 }));
  let calculations = 0;
  const app = loadFunctions(adminSource, ["getShippingRows", "compareShippingRows"], {
    state: { shippingFilters: {}, shippingSort: { key: "recent", direction: "desc" } },
    syncShippingFilterState() {}, normalizeSearchText: value => String(value || ""),
    readShippingBoxDrafts: () => ({}),
    getShippingRecentActivityTimestamp: row => { calculations++; return row.time; }
  });
  const expected = [...rows].sort((a, b) => (b.time - a.time)
    || b.managementId.localeCompare(a.managementId, "ko-KR", { numeric: true, sensitivity: "base" }));
  assert.deepEqual(Array.from(app.getShippingRows(rows)), expected);
  assert.equal(calculations, rows.length);
  rows[0].time = 99;
  assert.equal(app.getShippingRows(rows)[0], rows[0]);
  assert.equal(calculations, rows.length * 2);
  app.state.shippingSort.direction = "asc";
  assert.equal(app.getShippingRows(rows).at(-1), rows[0]);
});

test("박스별 결산의 제품 트레이 조회는 박스 수와 무관하게 입고 건당 한 번 실행한다", () => {
  let lookups = 0;
  const app = loadFunctions(adminSource, ["getShippingSettlementBoxItems"], {
    getShippingInspectionTrayQuantityFromItem: () => { lookups++; return 24; },
    parseShippingSettlementNumber: value => Number(value) || 0,
    isShippingSettlementInventoryAdjustment: box => box.shippingType === "재고조정",
    normalizeInventoryStockStatus: value => value,
    getShippingSettlementBoxDate: () => "2026-10-02",
    getShippingSettlementBoxQuantity: box => box.quantity,
    getShippingSettlementInspectionKey: () => "group",
    isShippingSettlementDateInRange: () => true
  });
  const item = { managementId: "IN-1", activeShippingBoxes: [], shippedShippingBoxes:
    Array.from({ length: 100 }, (_, i) => ({ status: "출고완료", quantity: 10,
      inspectionQuantity: i === 0 ? 12 : 0, shippingType: i === 99 ? "재고조정" : "정상출고" })) };
  const boxes = app.getShippingSettlementBoxItems([item]);
  assert.equal(lookups, 1);
  assert.equal(boxes.length, 99);
  assert.equal(boxes[0].inspectionQuantity, 12);
  assert.equal(boxes[1].inspectionQuantity, 24);
  assert.equal(boxes.reduce((sum, box) => sum + box.quantity, 0), 990);
});

function renderRuntime(rows) {
  const calls = { source: 0, filter: 0, boxes: 0 };
  const boxItems = [{ status: "출고완료", quantity: 100 }];
  const app = loadFunctions(adminSource, ["renderShippingTable", "scheduleShippingSearchRender"], {
    window: { clearTimeout() {} }, shippingSearchRenderTimer: null,
    shippingTableBody: { innerHTML: "" }, shippingCountLabel: { textContent: "" },
    shippingPageSizeSelect: { value: "10" }, state: { shippingPage: 1 },
    getShippingSourceRows: () => { calls.source++; return rows; },
    getShippingRows: source => { calls.filter++; assert.equal(source, rows); return rows; },
    getShippingSettlementBoxItems: source => { calls.boxes++; assert.equal(source, rows); return boxItems; },
    updateShippingSummaryCards: boxes => assert.equal(boxes, boxItems),
    updateShippingSettlementSummary: (source, boxes) => { assert.equal(source, rows); assert.equal(boxes, boxItems); },
    renderShippingFilterOptions() {}, renderShippingPagination() {},
    getShippingWorkflowActiveBoxes: () => [], getShippedShippingBoxes: () => [],
    parseShippingSettlementNumber: value => Number(value) || 0,
    escapeHtml: value => value || "", escapeAttribute: value => value || "",
    toDateInputValue: () => "", formatNumber: value => String(value),
    renderShippingInspectionBadge: () => "", renderShippingAnomalyText: () => "",
    renderInventoryDueBadge: () => "", renderShippingStatusBadge: () => "", renderShippingRowAction: () => ""
  });
  return { app, calls };
}

for (const rows of [[], [{ managementId: "IN-1", productId: "P1" }]]) {
  test(`목록과 두 요약은 필터·박스 집계를 한 번만 공유한다 (${rows.length}건)`, () => {
    const { app, calls } = renderRuntime(rows);
    app.renderShippingTable();
    assert.deepEqual(calls, { source: 1, filter: 1, boxes: 1 });
  });
}

test("검색 입력은 즉시 계산하지 않고 마지막 입력만 처리하며 한글 조합 중 계산을 멈춘다", () => {
  const handlers = new Map();
  const timers = new Map();
  let nextTimer = 0;
  const searches = [];
  const input = { value: "", addEventListener: (name, handler) => handlers.set(name, handler) };
  const app = loadFunctions(adminSource, ["scheduleShippingSearchRender"], {
    shippingSearchInput: input, shippingSearchRenderTimer: null, shippingSearchComposing: false,
    state: { shippingPage: 3 }, renderShippingTable: () => searches.push(input.value),
    window: { clearTimeout: id => timers.delete(id), setTimeout: callback => {
      timers.set(++nextTimer, callback); return nextTimer;
    } }
  });
  const start = adminSource.indexOf('shippingSearchInput?.addEventListener("compositionstart"');
  const end = adminSource.indexOf("[shippingClientFilter, shippingStorageFilter", start);
  vm.runInContext(adminSource.slice(start, end), app);
  for (const value of ["a", "ab", "abc"]) {
    input.value = value;
    handlers.get("input")({ isComposing: false });
  }
  assert.equal(timers.size, 1);
  assert.equal(searches.length, 0);
  const flush = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(cb => cb()); };
  flush();
  assert.deepEqual(searches, ["abc"]);
  assert.equal(app.state.shippingPage, 1);
  handlers.get("input")({ isComposing: false });
  handlers.get("compositionstart")();
  input.value = "ㅎ";
  handlers.get("input")({ isComposing: true });
  assert.equal(timers.size, 0);
  input.value = "헤라";
  handlers.get("compositionend")();
  handlers.get("input")({ isComposing: false });
  assert.equal(timers.size, 1);
  flush();
  assert.deepEqual(searches, ["abc", "헤라"]);
});

test("동일 필터 옵션은 DOM을 교체하지 않고 변경 시 선택 값을 유지한다", () => {
  const app = loadFunctions(adminSource, ["renderSelectOptions"], {
    escapeHtml: value => value, escapeAttribute: value => value
  });
  let html = "";
  let writes = 0;
  const select = { value: "A", get innerHTML() { return html; },
    set innerHTML(value) { html = value; writes++; this.value = ""; } };
  app.renderSelectOptions(select, ["A", "B"]);
  app.renderSelectOptions(select, ["A", "B"]);
  assert.equal(writes, 1);
  assert.equal(select.value, "A");
  app.renderSelectOptions(select, ["A", "C"]);
  assert.equal(writes, 2);
  assert.equal(select.value, "A");
});
