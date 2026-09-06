import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

export const mobileSource = readFileSync(new URL("../../frontend/mobile/mobile.js", import.meta.url), "utf8");
export const adminSource = readFileSync(new URL("../../frontend/admin.js", import.meta.url), "utf8");

export function loadFunctions(source, names, globals = {}) {
  const context = vm.createContext(globals);
  for (const name of names) {
    const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?\\n\\}`, "m"));
    assert.ok(match, `Missing function: ${name}`);
    vm.runInContext(match[0], context);
  }
  return context;
}

export function createMobileDashboardRuntime(requestApi, overrides = {}) {
  return loadFunctions(mobileSource, ["loadShippingDashboard", "getDashboardStateVersion", "ensureDashboardLoaded"], {
    state: { user: {}, dashboard: [], dashboardLoadedAt: 0, dashboardStateVersion: null, scannedShippingRows: [] },
    window: { SeungjinDataGateway: { canRead: () => true } },
    Date,
    requestApi,
    syncPendingShippingRowsFromDashboard() {},
    syncScannedMoveRowsFromDashboard() {},
    applyShippingFilters() {},
    saveDashboardCache() {},
    renderShippingLoading() {},
    renderShippingError() {},
    showToast() {},
    dashboardQrIndex: null,
    ...overrides
  });
}

export function createQrRuntime(rows, source = mobileSource) {
  return loadFunctions(source, [
    ...(source.includes("function getDashboardQrCandidates(") ? ["getDashboardQrCandidates"] : []),
    "parseQrValue", "normalizeScanValue", "isParsedQrIdentityConsistent", "getKnownBoxes",
    "findMatchedBox", "findShippingByQrValue", "findInventoryMoveByQrValue", "getMovableBoxes",
    "getBoxCurrentQuantity", "parseNumber", "normalizeText", "normalizeDisplay",
    "buildScannedBoxItem", "buildInventoryMoveItem"
  ], { state: { dashboard: rows }, dashboardQrIndex: null });
}

export function inventoryFixture(rowCount = 1000, boxCount = 30) {
  return Array.from({ length: rowCount }, (_, i) => {
    const managementId = `IN-260906-P${i}-001`;
    const boxes = Array.from({ length: boxCount }, (_, b) => ({
      boxId: `${managementId}-B${String(b + 1).padStart(3, "0")}`,
      number: b + 1, quantity: 100, status: "보관", storage: "A"
    }));
    return { managementId, productId: `P${i}`, productName: `Product ${i}`, allShippingBoxes: boxes, activeShippingBoxes: boxes };
  });
}
