import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const rows = [
  { managementId: "CONFIRMED", productName: "헤라 센슈얼 샤인 틴트 66호", clientName: "(주)장업시스템", inventoryAuditTargetBoxCount: 1, inventoryUnconfirmedBoxCount: 0, inventoryConfirmedBoxCount: 1 },
  { managementId: "IN-260910-KR-001", productName: "메디큐브 PDRN 용기", clientName: "(주)케이알", inventoryAuditTargetBoxCount: 10, inventoryUnconfirmedBoxCount: 7, inventoryConfirmedBoxCount: 3 },
  { managementId: "IN-260911-NP-001", productName: "비디비치 뉴 오더 토너", clientName: "뉴파트너스", inventoryAuditTargetBoxCount: 6, inventoryUnconfirmedBoxCount: 1, inventoryConfirmedBoxCount: 5 },
  { managementId: "SHIPPED", productName: "메디큐브 PDRN 용기", clientName: "(주)케이알", inventoryAuditTargetBoxCount: 0, inventoryUnconfirmedBoxCount: 0, inventoryConfirmedBoxCount: 0 }
];

function runtime() {
  const app = vm.createContext({
    state: { inventoryRows: rows, inventoryLoaded: true },
    inventoryAttentionModal: { hidden: true, dataset: {} }, inventoryAttentionList: { innerHTML: "", querySelectorAll: () => [] },
    inventoryAttentionEmpty: {}, inventoryAttentionTitle: {}, inventoryAttentionDescription: {},
    inventoryAttentionSearch: { hidden: true }, inventoryAttentionSearchInput: { value: "" }, inventoryAttentionSearchCount: {},
    closeInventoryAttentionModalButton: null, document: { querySelector: () => null, body: { classList: { add() {} } } },
    window: { setTimeout() {} }, resetModalScrollPosition() {},
    isInventoryUnspecifiedStorageTarget: () => true, isLongStoredInventory: () => false,
    renderInventoryAuditBulkControls() {}, refreshInventoryConfirmationStatus() {},
    renderInventoryAttentionRow: item => item.managementId,
    formatNumber: value => Number(value || 0).toLocaleString("ko-KR")
  });
  for (const name of ["getInventoryAttentionRows", "getInventoryAttentionConfig", "getInventoryAttentionDescription",
    "isInventoryPhysicalMissing", "normalizeSearchText", "renderInventoryAttentionList", "openInventoryAttentionModal"]) {
    const match = source.match(new RegExp(`^function ${name}\\([^]*?\\n\\}`, "m"));
    assert.ok(match, name);
    vm.runInContext(match[0], app);
  }
  return app;
}

test("장기 보관 검색은 확인 완료된 재고도 검색하고 현재 목록 유형을 유지한다", () => {
  const app = runtime();
  app.isLongStoredInventory = () => true;
  app.openInventoryAttentionModal("aging");
  assert.equal(app.inventoryAttentionSearch.hidden, false);
  assert.equal(app.getInventoryAttentionConfig("aging").canCleanup, true);
  assert.deepEqual(Array.from(app.getInventoryAttentionRows("aging", undefined, "CONFIRMED"), row => row.managementId), ["CONFIRMED"]);
  let listener;
  let renderedType;
  const handler = source.match(/inventoryAttentionSearchInput\?\.addEventListener\("input", \(\) => \{[\s\S]*?\n\}\);/)[0];
  vm.runInNewContext(handler, {inventoryAttentionSearchInput:{addEventListener:(_,fn)=>{listener=fn;}}, inventoryAttentionModal:{dataset:{attentionType:'aging'}}, inventoryAttentionList:{scrollTop:100}, renderInventoryAttentionList:type=>{renderedType=type;}});
  listener();
  assert.equal(renderedType,'aging');
});

test("제품명·거래처·관리 ID를 부분 검색하고 띄어쓰기와 대소문자를 무시한다", () => {
  const app = runtime();
  for (const query of ["메디큐브pdrn", "케이알", "in-260910-kr"]) {
    assert.deepEqual(Array.from(app.getInventoryAttentionRows("audit", undefined, query), row => row.managementId), ["IN-260910-KR-001"]);
  }
  assert.equal(app.getInventoryAttentionRows("audit", undefined, "뉴 오더")[0].managementId, "IN-260911-NP-001");
});

test("검색 결과만 박스 합계에 반영하고 빈 검색 결과는 0건·0박스로 표시한다", () => {
  const app = runtime();
  app.openInventoryAttentionModal("audit");
  app.inventoryAttentionSearchInput.value = "뉴파트너스";
  app.renderInventoryAttentionList("audit");
  assert.equal(app.inventoryAttentionList.innerHTML, "IN-260911-NP-001");
  assert.equal(app.inventoryAttentionSearchCount.textContent, "검색 결과 1건");
  assert.match(app.inventoryAttentionDescription.textContent, /미확인 1 box, 확인 완료 5 box/);
  app.inventoryAttentionSearchInput.value = "없는제품";
  app.renderInventoryAttentionList("audit");
  assert.equal(app.inventoryAttentionSearchCount.textContent, "검색 결과 0건");
  assert.equal(app.inventoryAttentionEmpty.hidden, false);
  assert.match(app.inventoryAttentionDescription.textContent, /미확인 0 box, 확인 완료 0 box/);
  app.inventoryAttentionSearchInput.value = "  ";
  app.renderInventoryAttentionList("audit");
  assert.equal(app.inventoryAttentionSearchCount.textContent, "전체 2건");
  assert.equal(app.inventoryAttentionEmpty.hidden, true);
  assert.match(app.inventoryAttentionDescription.textContent, /미확인 8 box, 확인 완료 8 box/);
});

test("상세에서 돌아오면 검색을 유지하고 새로 열거나 다른 현황으로 이동하면 초기화한다", () => {
  const app = runtime();
  app.inventoryAttentionSearchInput.value = "토너";
  app.openInventoryAttentionModal("audit", { preserveSearch: true });
  assert.equal(app.inventoryAttentionSearchInput.value, "토너");
  assert.equal(app.inventoryAttentionSearchCount.textContent, "검색 결과 1건");
  app.openInventoryAttentionModal("audit");
  assert.equal(app.inventoryAttentionSearchInput.value, "");
  assert.equal(app.inventoryAttentionSearchCount.textContent, "전체 2건");
  assert.equal(app.inventoryAttentionSearch.hidden, false);
  app.inventoryAttentionSearchInput.value = "없는제품";
  app.openInventoryAttentionModal("storage");
  assert.equal(app.inventoryAttentionSearch.hidden, true);
  assert.equal(app.getInventoryAttentionRows("storage", undefined, "없는제품").length, 4);
});


test("확인 완료 박스만 있는 재고는 검색해도 미확인 목록에 표시하지 않는다", () => {
  const app = runtime();
  assert.equal(app.getInventoryAttentionRows("audit", undefined, "헤라").length, 0);
  assert.deepEqual(Array.from(app.getInventoryAttentionRows("audit"), row => row.managementId), ["IN-260910-KR-001", "IN-260911-NP-001"]);
});

test("마지막 미확인 박스 확인 후 목록과 합계가 함께 줄어든다", () => {
  const app = runtime();
  app.state.inventoryRows = rows.map(row => ({ ...row }));
  app.state.inventoryRows[1].inventoryUnconfirmedBoxCount = 0;
  app.state.inventoryRows[1].inventoryConfirmedBoxCount = 10;
  app.renderInventoryAttentionList("audit");
  assert.equal(app.inventoryAttentionSearchCount.textContent, "전체 1건");
  assert.equal(app.inventoryAttentionList.innerHTML, "IN-260911-NP-001");
  assert.match(app.inventoryAttentionDescription.textContent, /미확인 1 box, 확인 완료 5 box/);
  app.state.inventoryRows[2].inventoryUnconfirmedBoxCount = 0;
  app.renderInventoryAttentionList("audit");
  assert.equal(app.inventoryAttentionSearchCount.textContent, "전체 0건");
  assert.equal(app.inventoryAttentionEmpty.hidden, false);
});
