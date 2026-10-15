import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../frontend/admin.html", import.meta.url), "utf8");
const routes = ["inbound", "purchase-orders", "inventory", "shipping", "products", "production-plan", "work-status"];

function navigation() {
  const pages = routes.map((view) => ({ dataset: { view }, hidden: true }));
  const links = [...html.matchAll(/<a\b[^>]*data-view-link="([^"]+)"[^>]*>/g)].map(([tag, viewLink]) => ({
    dataset: { viewLink, viewGroup: tag.includes('data-view-group="work"') ? "work" : undefined },
    classList: { toggle(name, value) { this[name] = value; } },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
  }));
  const context = vm.createContext({
    workMenuButton: { classList: { toggle(name, value) { this[name] = value; } }, setAttribute(name, value) { this[name] = value; } },
    workSubmenu: { hidden: true },
    location: { hash: "" }, pageViews: pages, viewLinks: links,
    closeRowActionMenu() {}, closeInboundRowActionMenu() {},
    document: { querySelector: () => ({ scrollTo() {} }) },
    state: {},
    loadInventoryDashboard() { throw new Error("Work pages must not load inventory"); },
    loadPurchaseOrders() { throw new Error("Work pages must not load orders"); },
  });
  const routeStart = source.indexOf("function getCurrentView()");
  vm.runInContext(source.slice(routeStart, source.indexOf("\n}\n", routeStart) + 3), context);
  const start = source.indexOf("function setActiveView(view)");
  const menuStart = source.indexOf("function setWorkMenuExpanded(expanded)");
  vm.runInContext(source.slice(menuStart, source.indexOf("\n}\n", menuStart) + 3), context);
  vm.runInContext(source.slice(start, source.indexOf("\n}\n", start) + 3), context);
  return { context, pages, links };
}

test("작업 메뉴는 활성화되고 생산계획과 작업현황은 별도 페이지로 연결된다", () => {
  assert.match(html, /id="workMenuButton" type="button" aria-expanded="false" aria-controls="workSubmenu"/);
  assert.match(html, /<span>작업관리 /);
  assert.match(html, /id="workSubmenu" hidden/);
  assert.doesNotMatch(html, /work-page-nav/);
  for (const route of ["production-plan", "work-status"]) {
    assert.match(html, new RegExp(`data-view="${route}" hidden`));
    assert.match(html, new RegExp(`href="#${route}" data-view-link="${route}"`));
  }
});

test("직접 주소와 새로고침에서 두 작업 경로를 유지하고 알 수 없는 경로는 입고로 보낸다", () => {
  const { context } = navigation();
  for (const route of routes) {
    context.location.hash = `#${route}`;
    assert.equal(context.getCurrentView(), route);
  }
  context.location.hash = "#unknown";
  assert.equal(context.getCurrentView(), "inbound");
});

test("작업 페이지 전환 시 하나만 표시하고 부모 메뉴와 현재 페이지 표시를 유지한다", () => {
  const { context, pages, links } = navigation();
  for (const route of ["production-plan", "work-status", "production-plan", "products"]) {
    context.setActiveView(route);
    assert.equal(context.workMenuButton.classList.active, route !== "products");
    assert.equal(context.workSubmenu.hidden, route === "products");
    assert.deepEqual(pages.filter((page) => !page.hidden).map((page) => page.dataset.view), [route]);
    for (const link of links) {
      const active = link.dataset.viewGroup === "work" ? route !== "products" : link.dataset.viewLink === route;
      assert.equal(link.classList.active, active);
      assert.equal(link["aria-current"], active ? (link.dataset.viewGroup ? "location" : "page") : undefined);
    }
  }
});

test("부모 메뉴를 펼치거나 접어도 현재 페이지는 변경하지 않는다", () => {
  const { context, pages } = navigation();
  context.setActiveView("work-status");
  context.setWorkMenuExpanded(false);
  assert.equal(context.workSubmenu.hidden, true);
  assert.equal(context.workMenuButton["aria-expanded"], "false");
  assert.equal(pages.find((page) => page.dataset.view === "work-status").hidden, false);
  context.setWorkMenuExpanded(true);
  assert.equal(context.workSubmenu.hidden, false);
  assert.equal(context.workMenuButton["aria-expanded"], "true");
});

test("생산계획은 발주량과 제품별 시간당 생산량을 보여주는 한 표로 구성한다", () => {
  assert.match(html, /id="productionPlanTablePanel"/);
  assert.match(html, /<th>발주량<\/th>[\s\S]*<th>납기<\/th>[\s\S]*<th>하루 목표 생산량<\/th>/);
  assert.doesNotMatch(html, /id="productionPlanDetailPanel"|id="productionPlanBoardPanel"|id="generateProductionPlanButton"/);
});

test("발주 새로고침·계획 저장·인쇄는 유지한다", () => {
  assert.match(html, /id="syncProductionPlanButton"/);
  assert.match(html, /id="saveProductionPlanButton"/);
  assert.match(html, /id="printProductionPlanButton"/);
  const save = source.slice(source.indexOf("function saveProductionPlanDraft()"), source.indexOf("function printProductionPlan()"));
  assert.match(save, /const key = getProductionPlanStorageKey\(\)/);
  assert.match(save, /localStorage\.setItem\(key, serialized\)/);
});

test("생산계획 제품 변경 시 연결된 발주 정보도 함께 갱신한다", () => {
  assert.match(source, /data-plan-product-picker/);
  assert.match(source, /openInboundProductPicker\("productionPlan"\)/);
  assert.match(source, /function selectProductionPlanProduct\(product\)/);
  assert.match(source, /function changeProductionPlanOrder\(job, purchaseOrderId\)/);
  assert.match(source, /job\.clientName = order\.clientName/);
  assert.match(source, /job\.balance = balance/);
  assert.match(source, /job\.dueDate = order\.endDate/);
  assert.match(source, /function replaceProductionPlanJobOrder\(job, purchaseOrderId\)/);
  assert.match(source, /selectProductionPlanProduct\(product\)/);
});

test("참고 실적·다중 계획 화면 없이 한 표에서 근무시간과 목표를 계산한다", () => {
  assert.doesNotMatch(source, /function renderProductionPlanDetail|function loadProductionPlanReferenceRows|function renderMachineScheduleBoard/);
  assert.doesNotMatch(source, /data-plan-detail-field|data-plan-reference/);
  assert.match(source, /product\?\.processHourlyProductionRates/);
  assert.match(source, /const PRODUCTION_STANDARD_WORK_HOURS = 8/);
});
