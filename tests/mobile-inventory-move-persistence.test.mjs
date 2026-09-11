import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const scan = (id = "IN-1") => ({ managementId: id, productId: "P1", productName: "테스트 용기", clientName: "(주)케이알",
  scannedBox: { boxId: `${id}-B001`, number: 1, status: "보관", quantity: 1089, storage: "현장" },
  scannedQrValue: `${id}-B001`, targetStorage: "A", targetStorageConfirmed: true });

function runtime(localStorage = storage(), sessionStorage = storage(), user = "worker", env = "prod") {
  const app = vm.createContext({ localStorage, sessionStorage, console: { warn() {} },
    window: { SEUNGJIN_CONFIG: { ENV: env } }, state: { user: { accountId: user }, scannedMoveRows: [], dashboard: [] },
    document: { hidden: true }, elements: { scannerScreen: { hidden: false }, autoLogin: null },
    dashboardQrIndex: null, SCAN_DUPLICATE_VIBRATION: [], releaseScannerStream() {}, stopShippingClock() {},
    showScreen() {}, renderScannerScannedList() {}, updateScannerActionLabels() {}, triggerScanFeedback() {}, showToast() {}
  });
  for (const name of ["MOVE_ROWS_KEY", "PERSISTENT_MOVE_ROWS_KEY", "DASHBOARD_CACHE_KEY", "PERSISTENT_SCANNED_ROWS_KEY",
    "SESSION_KEY", "PERSISTENT_SESSION_KEY", "ROUTE_KEY", "SCANNED_ROWS_KEY"]) {
    const match = source.match(new RegExp(`^const ${name} = [^]*?;`, "m"));
    assert.ok(match, name);
    vm.runInContext(match[0], app);
  }
  for (const name of ["readSavedMoveRows", "saveScannedMoveRows", "compactInventoryMoveRow", "compactScannedBoxRow", "getScannedBox",
    "getMobileCacheUserKey", "handleMobilePageHide", "handlePageVisibilityChange", "clearPersistentMobileData", "logout",
    "removeScannedMoveRow", "removeMovedInventoryGroup", "getInventoryMoveCurrentStorage", "normalizeScanValue", "normalizeDisplay", "normalizeText"]) {
    const match = source.match(new RegExp(`^function ${name}\\([^]*?\\n\\}`, "m"));
    assert.ok(match, name);
    vm.runInContext(match[0], app);
  }
  return app;
}
const snapshot = value => JSON.parse(JSON.stringify(value));

test("새 탭/앱 재실행 후 박스·수량·QR·확정 이동장소를 복원한다", () => {
  const local = storage();
  const app = runtime(local);
  app.state.scannedMoveRows = [scan()];
  app.saveScannedMoveRows();
  const restored = runtime(local).readSavedMoveRows();
  assert.deepEqual(snapshot(restored), snapshot(app.state.scannedMoveRows.map(app.compactInventoryMoveRow)));
  assert.equal(restored[0].targetStorage, "A");
  assert.equal(restored[0].scannedBox.quantity, 1089);
});

test("기존 버전이 탭에만 저장한 스캔도 읽는 즉시 영구 저장으로 이전한다", () => {
  const local = storage();
  const session = storage();
  session.setItem("seungjinMobileMoveRows", JSON.stringify([scan()]));
  assert.equal(runtime(local, session).readSavedMoveRows().length, 1);
  assert.equal(runtime(local).readSavedMoveRows()[0].scannedBox.boxId, "IN-1-B001");
});

test("뒤로가기와 앱 백그라운드 전환 시 마지막 목록 변경을 저장한다", () => {
  const local = storage();
  const app = runtime(local);
  app.state.scannedMoveRows = [scan()];
  app.handleMobilePageHide();
  assert.equal(runtime(local).readSavedMoveRows().length, 1);
  app.state.scannedMoveRows.push(scan("IN-2"));
  app.handlePageVisibilityChange();
  assert.equal(runtime(local).readSavedMoveRows().length, 2);
});

test("처리 성공한 그룹과 사용자가 삭제한 박스는 재실행 후 되살아나지 않는다", () => {
  const local = storage();
  const app = runtime(local);
  app.state.scannedMoveRows = [scan(), scan("IN-2")];
  app.saveScannedMoveRows();
  app.removeMovedInventoryGroup(app.state.scannedMoveRows[0]);
  assert.deepEqual(Array.from(runtime(local).readSavedMoveRows(), row => row.managementId), ["IN-2"]);
  app.removeScannedMoveRow(0);
  assert.equal(runtime(local).readSavedMoveRows().length, 0);
  assert.equal(app.sessionStorage.getItem("seungjinMobileMoveRows"), null);
});

test("일부 처리 실패 시 남긴 항목만 복원한다", () => {
  const local = storage();
  const app = runtime(local);
  app.state.scannedMoveRows = [scan(), scan("IN-2")];
  app.saveScannedMoveRows();
  app.state.scannedMoveRows = app.state.scannedMoveRows.filter(row => row.managementId === "IN-2");
  app.saveScannedMoveRows();
  assert.deepEqual(Array.from(runtime(local).readSavedMoveRows(), row => row.managementId), ["IN-2"]);
});

test("다른 사용자와 DEV/PRD의 저장 목록은 섞이지 않고 로그아웃 시 삭제한다", () => {
  const local = storage();
  const app = runtime(local);
  app.state.scannedMoveRows = [scan()];
  app.saveScannedMoveRows();
  assert.equal(runtime(local, storage(), "other").readSavedMoveRows().length, 0);
  assert.equal(runtime(local, storage(), "worker", "dev").readSavedMoveRows().length, 0);
  app.logout();
  assert.equal(runtime(local).readSavedMoveRows().length, 0);
  assert.equal(app.sessionStorage.getItem("seungjinMobileMoveRows"), null);
});

test("탭 저장소가 차단되거나 손상되어도 정상 영구 저장본을 복원한다", () => {
  const local = storage();
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
  const app = runtime(local, blocked);
  app.state.scannedMoveRows = [scan()];
  app.saveScannedMoveRows();
  assert.equal(runtime(local, blocked).readSavedMoveRows().length, 1);
  const broken = storage();
  broken.setItem("seungjinMobileMoveRows", "broken JSON");
  assert.equal(runtime(local, broken).readSavedMoveRows().length, 1);
});

test("영구 저장소가 차단되면 기존 탭 저장 기능은 유지한다", () => {
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
  const session = storage();
  const app = runtime(blocked, session);
  app.state.scannedMoveRows = [scan()];
  assert.doesNotThrow(() => app.saveScannedMoveRows());
  assert.equal(runtime(blocked, session).readSavedMoveRows().length, 1);
});
