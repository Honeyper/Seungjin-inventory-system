const API_URL = window.SEUNGJIN_CONFIG?.API_URL || "";
const SESSION_KEY = "seungjinMobileSession";
const ROUTE_KEY = "seungjinMobileRoute";
const SCANNED_ROWS_KEY = "seungjinMobileScannedRows";
const MOVE_ROWS_KEY = "seungjinMobileMoveRows";
const BARCODE_DETECT_INTERVAL_MS = 260;
const JSQR_DETECT_INTERVAL_MS = 260;
const JSQR_MAX_EDGE = 1120;
const SCAN_PROCESSING_LOCK_MS = 380;
const SHIPPING_CLOCK_INTERVAL_MS = 10000;
const SCAN_SUCCESS_VIBRATION = [140, 45, 90];
const SCAN_DUPLICATE_VIBRATION = [60, 35, 60];
const SCAN_COMPLETE_VIBRATION = [180, 60, 120];
const SHIPPING_BOX_ICON_SRC = "../assets/mobile-shipping-box-icon-2d.png?v=20260712-shipping-box-icon";
const INVENTORY_STORAGE_OPTIONS = [
  "미지정",
  "현장",
  "A",
  "B-1",
  "B-2",
  "C-1",
  "C-2",
  "D-1",
  "D-2",
  "E-1",
  "E-2",
  "F-1",
  "F-2",
  "G-1",
  "G[출고대기]",
  "H-1",
  "I"
];
const SHIPPING_SORT_OPTIONS = [
  { key: "productName", label: "이름순" },
  { key: "clientName", label: "거래처명순" },
  { key: "boxQuantity", label: "박스당 수량 많은 순" },
  { key: "scannedBoxes", label: "스캔박스순" },
  { key: "quantity", label: "수량 많은 순" }
];

const state = {
  user: null,
  dashboard: [],
  filteredRows: [],
  scannedShippingRows: [],
  scannedMoveRows: [],
  query: "",
  moveQuery: "",
  shippingSortMode: "scannedBoxes",
  activeWorkflow: "shipping",
  selectedShippingItem: null,
  selectedShippingAction: "complete",
  selectedConfirmMode: "item",
  isCompletingShipping: false,
  scannerStream: null,
  scannerTimer: null,
  scannerCanvas: null,
  scannerCanvasContext: null,
  scannerLastValue: "",
  isProcessingScan: false,
  clockTimer: null,
  scannerSheetStartY: 0,
  scannerSheetDeltaY: 0,
  scannerSheetDragging: false,
  scannerSheetMoved: false
};

const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  homeScreen: document.querySelector("#homeScreen"),
  shippingScreen: document.querySelector("#shippingScreen"),
  inventoryMoveScreen: document.querySelector("#inventoryMoveScreen"),
  bottomNav: document.querySelector("#bottomNav"),
  loginForm: document.querySelector("#mobileLoginForm"),
  accountId: document.querySelector("#mobileAccountId"),
  password: document.querySelector("#mobilePassword"),
  togglePassword: document.querySelector("#toggleMobilePassword"),
  loginMessage: document.querySelector("#mobileLoginMessage"),
  adminLoginButton: document.querySelector("#adminLoginButton"),
  logoutButton: document.querySelector("#mobileLogoutButton"),
  mobileUserName: document.querySelector("#mobileUserName"),
  shippingSearchInput: document.querySelector("#shippingSearchInput"),
  shippingLiveDate: document.querySelector("#shippingLiveDate"),
  shippingLiveTime: document.querySelector("#shippingLiveTime"),
  mobileShippingCount: document.querySelector("#mobileShippingCount"),
  refreshShippingButton: document.querySelector("#refreshShippingButton"),
  filterShippingButton: document.querySelector("#filterShippingButton"),
  shippingFilterMenu: document.querySelector("#shippingFilterMenu"),
  shippingListPanel: document.querySelector("#shippingListPanel"),
  openScannerButton: document.querySelector("#openScannerButton"),
  inventoryMoveSearchInput: document.querySelector("#inventoryMoveSearchInput"),
  inventoryMoveLiveDate: document.querySelector("#inventoryMoveLiveDate"),
  inventoryMoveLiveTime: document.querySelector("#inventoryMoveLiveTime"),
  inventoryMoveCount: document.querySelector("#inventoryMoveCount"),
  refreshInventoryMoveButton: document.querySelector("#refreshInventoryMoveButton"),
  inventoryMoveListPanel: document.querySelector("#inventoryMoveListPanel"),
  openInventoryScannerButton: document.querySelector("#openInventoryScannerButton"),
  confirmModal: document.querySelector("#confirmModal"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmProductName: document.querySelector("#confirmProductName"),
  confirmMetaList: document.querySelector("#confirmMetaList"),
  cancelConfirmButton: document.querySelector("#cancelConfirmButton"),
  acceptConfirmButton: document.querySelector("#acceptConfirmButton"),
  scannerScreen: document.querySelector("#scannerScreen"),
  scannerVideo: document.querySelector("#scannerVideo"),
  scannerHelpText: document.querySelector("#scannerHelpText"),
  scannerListPanel: document.querySelector("#scannerListPanel"),
  scannerSheetHandle: document.querySelector("#scannerSheetHandle"),
  scannerScannedCount: document.querySelector("#scannerScannedCount"),
  scannerScannedList: document.querySelector("#scannerScannedList"),
  closeScannerButton: document.querySelector("#closeScannerButton"),
  toggleFlashButton: document.querySelector("#toggleFlashButton"),
  albumQrButton: document.querySelector("#albumQrButton"),
  manualQrButton: document.querySelector("#manualQrButton"),
  scannerPendingButton: document.querySelector("#scannerPendingButton"),
  scannerDoneButton: document.querySelector("#scannerDoneButton"),
  toast: document.querySelector("#mobileToast")
};

initializeMobileApp();

function initializeMobileApp() {
  renderShippingSortMenu();
  bindEvents();
  updateShippingClock();

  const savedSession = readSavedSession();
  if (savedSession) {
    state.user = savedSession;
    state.scannedShippingRows = readSavedScannedRows();
    state.scannedMoveRows = readSavedMoveRows();
    restoreSavedRoute();
    return;
  }

  showScreen("login");
}

function bindEvents() {
  elements.loginForm?.addEventListener("submit", handleAdminLogin);
  elements.togglePassword?.addEventListener("click", togglePassword);
  elements.logoutButton?.addEventListener("click", logout);
  elements.refreshShippingButton?.addEventListener("click", handleRefreshShipping);
  elements.filterShippingButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleShippingSortMenu();
  });
  elements.shippingFilterMenu?.addEventListener("click", handleShippingSortMenuClick);
  elements.shippingSearchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    applyShippingFilters();
  });
  elements.openScannerButton?.addEventListener("click", openScanner);
  elements.openInventoryScannerButton?.addEventListener("click", openInventoryMoveScanner);
  elements.refreshInventoryMoveButton?.addEventListener("click", handleRefreshInventoryMove);
  elements.inventoryMoveSearchInput?.addEventListener("input", (event) => {
    state.moveQuery = event.target.value.trim().toLowerCase();
    renderInventoryMoveList();
  });
  elements.closeScannerButton?.addEventListener("click", closeScanner);
  elements.albumQrButton?.addEventListener("click", () => {
    showToast("앨범 QR 선택은 다음 단계에서 연결합니다.");
  });
  elements.manualQrButton?.addEventListener("click", handleManualQrInput);
  elements.scannerScannedList?.addEventListener("click", handleScannerListClick);
  elements.scannerPendingButton?.addEventListener("click", handleScannerPendingAction);
  elements.scannerDoneButton?.addEventListener("click", handleScannerDoneAction);
  elements.toggleFlashButton?.addEventListener("click", () => {
    showToast("플래시는 기기 지원 여부 확인 후 연결합니다.");
  });
  elements.cancelConfirmButton?.addEventListener("click", closeConfirmModal);
  elements.acceptConfirmButton?.addEventListener("click", handleConfirmShipping);
  bindScannerSheetEvents();
  document.addEventListener("visibilitychange", handlePageVisibilityChange);
  document.addEventListener("click", closeShippingSortMenu);
  window.addEventListener("pagehide", releaseScannerStream);

  document.querySelectorAll("[data-mobile-route]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.mobileRoute));
  });

  elements.shippingListPanel?.addEventListener("click", (event) => {
    const quantityButton = event.target.closest("[data-mobile-shipping-quantity]");
    if (quantityButton) {
      openShippingQuantityEditor(quantityButton.dataset.mobileShippingQuantity);
      return;
    }

    const removeButton = event.target.closest("[data-mobile-shipping-remove]");
    if (removeButton) {
      confirmRemoveScannedShippingGroup(removeButton.dataset.mobileShippingRemove);
      return;
    }

    const shippingButton = event.target.closest("[data-mobile-shipping]");
    if (!shippingButton) {
      return;
    }

    const key = shippingButton.dataset.mobileShipping;
    const action = shippingButton.dataset.mobileShippingAction || "complete";
    const item = state.filteredRows.find((row) => getShippingKey(row) === key);
    if (item) {
      openConfirmModal(item, action);
    }
  });

  elements.inventoryMoveListPanel?.addEventListener("click", handleInventoryMoveListClick);
  elements.inventoryMoveListPanel?.addEventListener("change", handleInventoryMoveListChange);

  elements.confirmModal?.addEventListener("click", (event) => {
    if (event.target === elements.confirmModal) {
      closeConfirmModal();
    }
  });
}

function bindScannerSheetEvents() {
  const dragTarget = elements.scannerSheetHandle || elements.scannerListPanel;
  if (!dragTarget || !elements.scannerListPanel) {
    return;
  }

  dragTarget.addEventListener("click", () => {
    if (state.scannerSheetMoved) {
      state.scannerSheetMoved = false;
      return;
    }
    toggleScannerSheet();
  });

  dragTarget.addEventListener("pointerdown", (event) => {
    state.scannerSheetDragging = true;
    state.scannerSheetStartY = event.clientY;
    state.scannerSheetDeltaY = 0;
    elements.scannerListPanel.classList.add("is-dragging");
    dragTarget.setPointerCapture?.(event.pointerId);
  });

  dragTarget.addEventListener("pointermove", (event) => {
    if (!state.scannerSheetDragging) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const deltaY = event.clientY - state.scannerSheetStartY;
    const isExpanded = elements.scannerListPanel.classList.contains("expanded");
    const dragLimit = isExpanded ? 120 : 84;
    const previewOffset = isExpanded
      ? Math.max(0, Math.min(deltaY, dragLimit))
      : Math.min(0, Math.max(deltaY, -dragLimit));

    state.scannerSheetDeltaY = deltaY;
    elements.scannerListPanel.style.transform = `translate3d(0, ${previewOffset}px, 0)`;
  });

  dragTarget.addEventListener("pointerup", (event) => {
    if (!state.scannerSheetDragging) {
      return;
    }

    const deltaY = state.scannerSheetDeltaY || event.clientY - state.scannerSheetStartY;
    const moved = Math.abs(deltaY) > 36;
    state.scannerSheetDragging = false;
    state.scannerSheetDeltaY = 0;
    elements.scannerListPanel.classList.remove("is-dragging");
    elements.scannerListPanel.style.transform = "";
    dragTarget.releasePointerCapture?.(event.pointerId);

    if (deltaY < -36) {
      state.scannerSheetMoved = true;
      setScannerSheetExpanded(true);
    } else if (deltaY > 36) {
      state.scannerSheetMoved = true;
      setScannerSheetExpanded(false);
    }

    if (!moved) {
      state.scannerSheetMoved = false;
    }
  });

  dragTarget.addEventListener("pointercancel", () => {
    state.scannerSheetDragging = false;
    state.scannerSheetDeltaY = 0;
    elements.scannerListPanel.classList.remove("is-dragging");
    elements.scannerListPanel.style.transform = "";
  });
}

function toggleScannerSheet() {
  setScannerSheetExpanded(!elements.scannerListPanel?.classList.contains("expanded"));
}

function setScannerSheetExpanded(expanded) {
  elements.scannerListPanel?.classList.toggle("expanded", expanded);
  if (elements.scannerSheetHandle) {
    elements.scannerSheetHandle.setAttribute("aria-label", expanded ? "스캔 목록 접기" : "스캔 목록 펼치기");
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const accountId = elements.accountId.value.trim();
  const password = elements.password.value.trim();
  setLoginMessage("");

  if (!accountId || !password) {
    setLoginMessage("직원번호와 비밀번호를 입력해주세요.");
    return;
  }

  if (!API_URL) {
    setLoginMessage("API 주소가 설정되지 않았습니다.");
    return;
  }

  setAdminLoginLoading(true);
  setLoginMessage("관리자 계정 확인 중입니다.", "info");

  try {
    const result = await requestApi("login", { accountId, password }, { unwrap: false });
    const loginResult = result.data || result;

    if (!result.ok || !loginResult.success) {
      setLoginMessage(loginResult.message || result.message || "로그인에 실패했습니다.");
      return;
    }

    state.user = loginResult.user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(loginResult.user));
    showHome();
  } catch (error) {
    setLoginMessage(error.message || "로그인 서버에 연결할 수 없습니다.");
  } finally {
    setAdminLoginLoading(false);
  }
}

function setAdminLoginLoading(isLoading) {
  if (!elements.adminLoginButton) {
    return;
  }

  elements.adminLoginButton.disabled = isLoading;
  elements.adminLoginButton.classList.toggle("is-loading", isLoading);
  elements.adminLoginButton.setAttribute("aria-busy", String(isLoading));

  const labelNode = Array.from(elements.adminLoginButton.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
  );

  if (!elements.adminLoginButton.dataset.defaultLabel && labelNode) {
    elements.adminLoginButton.dataset.defaultLabel = labelNode.textContent.trim();
  }

  if (labelNode) {
    const label = isLoading ? "로그인 중..." : elements.adminLoginButton.dataset.defaultLabel;
    labelNode.textContent = ` ${label}`;
  }
}

function togglePassword() {
  const shouldShow = elements.password.type === "password";
  elements.password.type = shouldShow ? "text" : "password";
  elements.togglePassword.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
}

function logout() {
  releaseScannerStream();
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ROUTE_KEY);
  sessionStorage.removeItem(SCANNED_ROWS_KEY);
  sessionStorage.removeItem(MOVE_ROWS_KEY);
  state.user = null;
  state.dashboard = [];
  state.filteredRows = [];
  state.scannedShippingRows = [];
  state.scannedMoveRows = [];
  showScreen("login");
}

function navigate(route) {
  if (route === "home") {
    showHome();
    return;
  }

  if (route === "shipping") {
    showShipping();
    return;
  }

  if (route === "inventoryMove") {
    showInventoryMove();
    return;
  }

  showToast("아직 준비 중인 메뉴입니다.");
}

function showHome() {
  elements.mobileUserName.textContent = state.user?.name || "관리자";
  showScreen("home");
}

function showShipping() {
  state.activeWorkflow = "shipping";
  showScreen("shipping");
  startShippingClock();
  applyShippingFilters();
  if (!state.dashboard.length) {
    loadShippingDashboard({ silent: true });
  }
}

function showInventoryMove() {
  state.activeWorkflow = "inventoryMove";
  showScreen("inventoryMove");
  startShippingClock();
  renderInventoryMoveList();
  if (!state.dashboard.length) {
    loadShippingDashboard({ silent: true }).then(renderInventoryMoveList).catch(() => {});
  }
}

function showScreen(name) {
  const screens = {
    login: elements.loginScreen,
    home: elements.homeScreen,
    shipping: elements.shippingScreen,
    inventoryMove: elements.inventoryMoveScreen
  };

  Object.values(screens).forEach((screen) => screen?.classList.remove("active"));
  screens[name]?.classList.add("active");
  elements.bottomNav.hidden = name === "login";
  saveCurrentRoute(name);

  document.querySelectorAll("#bottomNav [data-mobile-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mobileRoute === name);
  });

  if (name === "home") {
    document.querySelector('#bottomNav [data-mobile-route="home"]')?.classList.add("active");
  }

  if (name !== "shipping" && name !== "inventoryMove") {
    stopShippingClock();
    releaseScannerStream();
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function handlePageVisibilityChange() {
  if (document.hidden) {
    releaseScannerStream();
    stopShippingClock();
    return;
  }

  if (elements.shippingScreen?.classList.contains("active") || elements.inventoryMoveScreen?.classList.contains("active")) {
    startShippingClock();
  }
}

function restoreSavedRoute() {
  const route = sessionStorage.getItem(ROUTE_KEY);
  if (route === "shipping") {
    showShipping();
    return;
  }

  if (route === "inventoryMove") {
    showInventoryMove();
    return;
  }

  showHome();
}

function saveCurrentRoute(name) {
  if (name === "home" || name === "shipping" || name === "inventoryMove") {
    sessionStorage.setItem(ROUTE_KEY, name);
    return;
  }

  sessionStorage.removeItem(ROUTE_KEY);
}

async function loadShippingDashboard(options = {}) {
  if (!options.silent && !state.scannedShippingRows.length) {
    renderShippingLoading();
  }

  try {
    const data = await requestApi("getInventoryDashboard");
    state.dashboard = Array.isArray(data?.rows) ? data.rows : [];
    applyShippingFilters();
    return true;
  } catch (error) {
    if (options.silent) {
      showToast(error.message || "출고 목록을 불러오지 못했습니다.");
      return false;
    }
    renderShippingError(error.message || "출고 목록을 불러오지 못했습니다.");
    return false;
  }
}

function applyShippingFilters() {
  const query = state.query;
  const rows = groupScannedShippingRows(state.scannedShippingRows
    .filter((row) => {
      if (!query) {
        return true;
      }

      return [
        row.managementId,
        row.productId,
        row.clientName,
        row.productName,
        row.batch,
        row.finalProcess,
        row.storage,
        row.scannedBoxId,
        row.scannedBoxNumber,
        row.scannedBox?.boxId,
        row.scannedBox?.number,
        row.scannedBox?.status
      ].some((value) => String(value || "").toLowerCase().includes(query));
    }));

  const sortedRows = sortShippingRows(rows);
  state.filteredRows = sortedRows;
  renderShippingList(sortedRows);
  renderScannerScannedList();
}

async function handleRefreshShipping() {
  if (elements.refreshShippingButton?.disabled) {
    return;
  }

  closeShippingSortMenu();
  elements.refreshShippingButton.disabled = true;
  elements.refreshShippingButton.classList.add("is-loading");

  try {
    const didRefresh = await loadShippingDashboard({ silent: true });
    if (didRefresh) {
      showToast("출고 목록을 새로고침했습니다.");
    }
  } finally {
    elements.refreshShippingButton.disabled = false;
    elements.refreshShippingButton.classList.remove("is-loading");
  }
}

async function handleRefreshInventoryMove() {
  if (elements.refreshInventoryMoveButton?.disabled) {
    return;
  }

  elements.refreshInventoryMoveButton.disabled = true;
  elements.refreshInventoryMoveButton.classList.add("is-loading");

  try {
    const didRefresh = await loadShippingDashboard({ silent: true });
    renderInventoryMoveList();
    if (didRefresh) {
      showToast("재고 수정 목록을 새로고침했습니다.");
    }
  } finally {
    elements.refreshInventoryMoveButton.disabled = false;
    elements.refreshInventoryMoveButton.classList.remove("is-loading");
  }
}

function renderShippingSortMenu() {
  if (!elements.shippingFilterMenu) {
    return;
  }

  elements.shippingFilterMenu.innerHTML = SHIPPING_SORT_OPTIONS.map((option) => `
    <button type="button" role="menuitem" data-shipping-sort="${escapeHtml(option.key)}" aria-pressed="${option.key === state.shippingSortMode ? "true" : "false"}">
      ${escapeHtml(option.label)}
    </button>
  `).join("");
}

function toggleShippingSortMenu() {
  if (!elements.shippingFilterMenu) {
    return;
  }

  renderShippingSortMenu();
  const willOpen = elements.shippingFilterMenu.hidden;
  elements.shippingFilterMenu.hidden = !willOpen;
  elements.filterShippingButton?.setAttribute("aria-expanded", String(willOpen));
}

function closeShippingSortMenu() {
  if (!elements.shippingFilterMenu || elements.shippingFilterMenu.hidden) {
    return;
  }

  elements.shippingFilterMenu.hidden = true;
  elements.filterShippingButton?.setAttribute("aria-expanded", "false");
}

function handleShippingSortMenuClick(event) {
  const button = event.target.closest("[data-shipping-sort]");
  if (!button) {
    return;
  }

  event.stopPropagation();
  state.shippingSortMode = button.dataset.shippingSort || "scannedBoxes";
  applyShippingFilters();
  closeShippingSortMenu();
  const option = SHIPPING_SORT_OPTIONS.find((entry) => entry.key === state.shippingSortMode);
  showToast(`${option?.label || "필터"}으로 정렬했습니다.`);
}

function sortShippingRows(rows) {
  const sortedRows = [...rows];
  const mode = state.shippingSortMode;

  sortedRows.sort((a, b) => {
    if (mode === "productName") {
      return compareShippingText(a.productName, b.productName) || compareShippingText(a.clientName, b.clientName);
    }

    if (mode === "clientName") {
      return compareShippingText(a.clientName, b.clientName) || compareShippingText(a.productName, b.productName);
    }

    if (mode === "boxQuantity") {
      return getShippingBoxUnitQuantity(b) - getShippingBoxUnitQuantity(a) || compareShippingText(a.productName, b.productName);
    }

    if (mode === "quantity") {
      return getShippingAvailableQuantity(b) - getShippingAvailableQuantity(a) || compareShippingText(a.productName, b.productName);
    }

    return getShippingBoxCount(b) - getShippingBoxCount(a) || compareShippingText(a.productName, b.productName);
  });

  return sortedRows;
}

function compareShippingText(a, b) {
  return normalizeDisplay(a || "").localeCompare(normalizeDisplay(b || ""), "ko");
}

function getShippingBoxCount(item) {
  if (Array.isArray(item?.scannedItems)) {
    return parseNumber(item.scannedBoxCount) || item.scannedItems.length;
  }

  const scannedBox = getScannedBox(item);
  if (scannedBox) {
    return 1;
  }

  return getKnownBoxes(item).length || parseNumber(item?.currentBoxCount || item?.boxTotalCount);
}

function getShippingTotalBoxCount(item, fallbackCount = 0) {
  const fallback = parseNumber(fallbackCount);

  if (Array.isArray(item?.scannedItems)) {
    const totalCounts = item.scannedItems.map((row) => getShippingTotalBoxCount(row, 1));
    return Math.max(fallback, ...totalCounts);
  }

  return Math.max(
    fallback,
    getKnownBoxes(item).length,
    parseNumber(item?.boxTotalCount || item?.totalBoxCount || item?.currentBoxCount)
  );
}

function getShippingAvailableQuantity(item) {
  if (Array.isArray(item?.scannedItems)) {
    return item.scannedItems.reduce((sum, row) => sum + getShippingAvailableQuantity(row), 0);
  }

  const scannedBox = getScannedBox(item);
  if (scannedBox) {
    return getBoxTotalQuantity(scannedBox, item);
  }

  return sumBoxQuantity(getKnownBoxes(item)) || parseNumber(item?.currentTotalQuantity);
}

function getShippingBoxUnitQuantity(item) {
  if (Array.isArray(item?.scannedItems)) {
    return item.scannedItems.reduce((maxQuantity, row) => Math.max(maxQuantity, getShippingBoxUnitQuantity(row)), 0);
  }

  const scannedBox = getScannedBox(item);
  if (scannedBox) {
    return getBoxTotalQuantity(scannedBox, item) || getBoxCurrentQuantity(scannedBox, item);
  }

  const quantities = getKnownBoxes(item)
    .map((box) => getBoxTotalQuantity(box, item) || getBoxCurrentQuantity(box, item))
    .filter(Boolean);

  if (quantities.length) {
    return Math.max(...quantities);
  }

  const boxCount = getShippingBoxCount(item);
  const availableQuantity = getShippingAvailableQuantity(item);
  return boxCount > 1 ? Math.round(availableQuantity / boxCount) : availableQuantity;
}

function groupScannedShippingRows(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = getShippingProductGroupKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        ...row,
        productGroupKey: key,
        scannedItems: [],
        scannedBoxes: [],
        scannedBoxCount: 0,
        scannedTotalQuantity: 0,
        scannedCurrentQuantity: 0
      });
    }

    const group = groups.get(key);
    const scannedBox = getScannedBox(row);
    const totalQuantity = getBoxTotalQuantity(scannedBox, row);
    const currentQuantity = getBoxCurrentQuantity(scannedBox, row);

    group.scannedItems.push(row);
    if (scannedBox) {
      group.scannedBoxes.push(scannedBox);
    }
    group.scannedBoxCount += 1;
    group.scannedTotalQuantity += totalQuantity;
    group.scannedCurrentQuantity += currentQuantity;
  });

  return Array.from(groups.values());
}

function groupScannedInventoryMoveRows(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = getInventoryMoveProductGroupKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        ...row,
        productGroupKey: key,
        scannedItems: [],
        scannedBoxes: [],
        scannedBoxCount: 0,
        scannedCurrentQuantity: 0,
        moveCurrentStorage: getInventoryMoveCurrentStorage(row),
        targetStorage: row.targetStorage || getDefaultTargetStorage(getInventoryMoveCurrentStorage(row))
      });
    }

    const group = groups.get(key);
    const scannedBox = getScannedBox(row);
    const currentQuantity = getBoxCurrentQuantity(scannedBox, row);

    group.scannedItems.push(row);
    if (scannedBox) {
      group.scannedBoxes.push(scannedBox);
    }
    group.scannedBoxCount += 1;
    group.scannedCurrentQuantity += currentQuantity;
  });

  return Array.from(groups.values());
}

function isMobileShippingCandidate(row) {
  const status = normalizeText(row.stockStatus || row.processStatus);
  const activeBoxes = Array.isArray(row.activeShippingBoxes) ? row.activeShippingBoxes : [];
  const hasActiveShippingBox = activeBoxes.some((box) => {
    const boxStatus = normalizeText(box.status);
    return boxStatus.includes("출고대기");
  });

  return hasActiveShippingBox || (status.includes("출고대기") && activeBoxes.length > 0);
}

function renderShippingList(rows) {
  elements.mobileShippingCount.textContent = String(rows.length);

  if (!rows.length) {
    elements.shippingListPanel.innerHTML = `
      <div class="empty-state">
        <div>
          <span class="empty-state-icon" aria-hidden="true">
            <img src="${SHIPPING_BOX_ICON_SRC}" alt="" />
          </span>
          <h2>등록된 제품이 없습니다</h2>
          <p>출고할 제품을 등록해 주세요.</p>
          <button class="primary-action" type="button" id="emptyScanButton">제품 등록하기</button>
        </div>
      </div>
    `;
    document.querySelector("#emptyScanButton")?.addEventListener("click", openScanner);
    return;
  }

  elements.shippingListPanel.innerHTML = rows.map(renderShippingItem).join("");
}

function renderInventoryMoveList() {
  if (!elements.inventoryMoveListPanel) {
    return;
  }

  const query = state.moveQuery;
  const matchedRows = state.scannedMoveRows.filter((row) => {
    if (!query) {
      return true;
    }

    return [
      row.managementId,
      row.productId,
      row.clientName,
      row.productName,
      row.batch,
      row.finalProcess,
      getInventoryMoveCurrentStorage(row),
      row.targetStorage,
      row.scannedBoxId,
      row.scannedBoxNumber
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
  const rows = groupScannedInventoryMoveRows(matchedRows);

  if (elements.inventoryMoveCount) {
    elements.inventoryMoveCount.textContent = String(rows.length);
  }

  if (!rows.length) {
    elements.inventoryMoveListPanel.innerHTML = `
      <div class="empty-state">
        <div>
          <span class="empty-state-icon" aria-hidden="true">
            <img src="${SHIPPING_BOX_ICON_SRC}" alt="" />
          </span>
          <h2>이동할 박스가 없습니다</h2>
          <p>QR 스캔으로 재고 위치를 수정할 박스를 등록해주세요.</p>
          <button class="primary-action" type="button" id="emptyInventoryScanButton">박스 스캔하기</button>
        </div>
      </div>
    `;
    document.querySelector("#emptyInventoryScanButton")?.addEventListener("click", openInventoryMoveScanner);
    return;
  }

  elements.inventoryMoveListPanel.innerHTML = rows.map(renderInventoryMoveItem).join("");
}

function renderInventoryMoveItem(item) {
  const key = getInventoryMoveKey(item);
  const currentStorage = getInventoryMoveCurrentStorage(item);
  const targetStorage = item.targetStorage || getDefaultTargetStorage(currentStorage);
  const process = normalizeDisplay(item.finalProcess || "-");
  const batch = normalizeDisplay(item.batch || "-");
  const scannedBoxCount = parseNumber(item.scannedBoxCount) || getSelectedBoxNumbers(item).length || 1;
  const totalBoxCount = getInventoryMoveAllBoxNumbers(item).length || parseNumber(item.currentBoxCount || item.boxTotalCount) || scannedBoxCount;
  const quantity = parseNumber(item.scannedCurrentQuantity) || getSelectedBoxNumbers(item)
    .reduce((sum, boxNumber) => {
      const box = item.scannedBoxes?.find((candidate) => {
        return String(candidate?.number || candidate?.sequence || "").trim() === String(boxNumber || "").trim();
      });
      return sum + getBoxCurrentQuantity(box, item);
    }, 0);

  return `
    <article class="shipping-item inventory-move-item" data-inventory-move-item="${escapeHtml(key)}">
      <div class="shipping-item-top">
        <span class="shipping-box-art" aria-hidden="true">
          <img src="${SHIPPING_BOX_ICON_SRC}" alt="" loading="lazy" />
        </span>
        <div class="shipping-item-copy">
          <div class="shipping-client">${escapeHtml(normalizeDisplay(item.clientName || "-"))}</div>
          <div class="shipping-title">
            <span class="shipping-product-name">${escapeHtml(normalizeDisplay(item.productName || "-"))}</span>
          </div>
        </div>
        <div class="shipping-meta-stack">
          <span class="process-pill">${escapeHtml(process)}</span>
          <span class="shipping-meta-pill">${escapeHtml(batch)}</span>
          <span class="shipping-meta-pill">${formatNumber(scannedBoxCount)}박스 스캔</span>
        </div>
        <div class="shipping-card-actions">
          <button class="shipping-remove-button" type="button" data-inventory-move-remove="${escapeHtml(key)}">삭제</button>
          <button class="ship-pending-button" type="button" data-inventory-move-action="single" data-inventory-move-key="${escapeHtml(key)}">자리이동</button>
          <button class="ship-now-button" type="button" data-inventory-move-action="all" data-inventory-move-key="${escapeHtml(key)}">전량 이동</button>
        </div>
      </div>
      <p class="item-worker"><span>작업자</span>${escapeHtml(normalizeDisplay(state.user?.name || item.registrant || item.inspector || "-"))}</p>
      <div class="inventory-storage-grid">
        <span class="storage-card">
          <small>현재 보관 장소</small>
          <strong>${escapeHtml(normalizeDisplay(currentStorage))}</strong>
        </span>
        <label class="storage-card storage-select-card">
          <small>이동할 장소</small>
          <select class="inventory-storage-select" data-inventory-move-storage="${escapeHtml(key)}">
            ${renderStorageOptions(targetStorage)}
          </select>
        </label>
      </div>
      <div class="item-metrics inventory-move-metrics">
        <span class="metric">
          <span>스캔 박스</span>
          <span class="metric-value-row">
            <strong>${formatNumber(scannedBoxCount)}</strong>
            <small>Box</small>
          </span>
        </span>
        <span class="metric">
          <span>전체 박스</span>
          <span class="metric-value-row">
            <strong>${formatNumber(totalBoxCount)}</strong>
            <small>Box</small>
          </span>
        </span>
        <span class="metric">
          <span>현재 수량</span>
          <span class="metric-value-row">
            <strong class="blue">${formatNumber(quantity)}</strong>
            <small>ea</small>
          </span>
        </span>
      </div>
    </article>
  `;
}

function renderStorageOptions(selectedStorage) {
  const selected = normalizeDisplay(selectedStorage);
  const options = INVENTORY_STORAGE_OPTIONS.includes(selected) ? INVENTORY_STORAGE_OPTIONS : [selected, ...INVENTORY_STORAGE_OPTIONS];
  return options.map((storage) => `
    <option value="${escapeHtml(storage)}" ${storage === selected ? "selected" : ""}>${escapeHtml(storage)}</option>
  `).join("");
}

function handleInventoryMoveListClick(event) {
  const removeButton = event.target.closest("[data-inventory-move-remove]");
  if (removeButton) {
    confirmRemoveScannedMoveGroup(removeButton.dataset.inventoryMoveRemove);
    return;
  }

  const actionButton = event.target.closest("[data-inventory-move-action]");
  if (!actionButton) {
    return;
  }

  const key = actionButton.dataset.inventoryMoveKey;
  const mode = actionButton.dataset.inventoryMoveAction || "single";
  const item = findInventoryMoveGroupByKey(key);
  if (!item) {
    showToast("이동할 박스를 찾지 못했습니다.");
    return;
  }

  handleInventoryMoveCardAction(item, mode);
}

function handleInventoryMoveListChange(event) {
  const select = event.target.closest("[data-inventory-move-storage]");
  if (!select) {
    return;
  }

  const key = select.dataset.inventoryMoveStorage;
  const changed = updateInventoryMoveGroupStorage(key, select.value);
  if (!changed) {
    return;
  }

  saveScannedMoveRows();
}

async function handleInventoryMoveCardAction(item, mode = "single") {
  const currentStorage = getInventoryMoveCurrentStorage(item);
  const targetStorage = normalizeDisplay(item.targetStorage || getDefaultTargetStorage(currentStorage));
  const selectedBoxes = mode === "all" ? getInventoryMoveAllBoxNumbers(item) : getSelectedBoxNumbers(item);
  const actionLabel = mode === "all" ? "전량 이동" : "자리이동";

  if (!selectedBoxes.length) {
    showToast("이동할 박스 번호가 없습니다.");
    return;
  }

  if (!targetStorage || targetStorage === "-" || targetStorage === currentStorage) {
    showToast("이동할 장소를 현재 보관 장소와 다르게 선택해주세요.");
    return;
  }

  const ok = window.confirm(`${normalizeDisplay(item.productName)}\n${normalizeDisplay(currentStorage)} → ${targetStorage}\n${formatNumber(selectedBoxes.length)}개 박스를 ${actionLabel} 처리하시겠습니까?`);
  if (!ok) {
    return;
  }

  try {
    await completeInventoryMoveItem(item, selectedBoxes, mode);
    if (mode === "all") {
      removeMovedInventoryGroup(item);
    } else {
      removeScannedMoveGroup(getInventoryMoveKey(item));
    }
    await loadShippingDashboard({ silent: true });
    renderInventoryMoveList();
    showToast(`${actionLabel}이 완료되었습니다.`);
  } catch (error) {
    showToast(error.message || `${actionLabel} 중 문제가 발생했습니다.`);
  }
}

function renderShippingItem(item) {
  const key = getShippingKey(item);
  const scannedBox = getScannedBox(item);
  const displayBoxes = getKnownBoxes(item);
  const isProductGroup = Array.isArray(item.scannedItems);
  const boxCount = isProductGroup
    ? item.scannedBoxCount
    : scannedBox ? 1 : displayBoxes.length || parseNumber(item.currentBoxCount || item.boxTotalCount);
  const totalBoxCount = getShippingTotalBoxCount(item, boxCount);
  const totalQuantity = isProductGroup
    ? item.scannedTotalQuantity
    : scannedBox
      ? getBoxTotalQuantity(scannedBox, item)
      : sumBoxQuantity(displayBoxes) || parseNumber(item.currentTotalQuantity);
  const currentQuantity = isProductGroup
    ? item.scannedCurrentQuantity
    : scannedBox
      ? getBoxCurrentQuantity(scannedBox, item)
      : parseNumber(item.currentTotalQuantity);
  const process = normalizeDisplay(item.finalProcess || "-");
  const batch = normalizeDisplay(item.batch || "-");
  const boxLabel = isProductGroup ? `${formatNumber(boxCount)}박스 스캔` : getScannedBoxLabel(item);
  const metaParts = [batch, boxLabel].filter((value) => value && value !== "-");
  const processClass = /2|3/.test(process) ? "green" : "";

  return `
    <article class="shipping-item">
      <div class="shipping-item-top">
        <span class="shipping-box-art" aria-hidden="true">
          <img src="${SHIPPING_BOX_ICON_SRC}" alt="" loading="lazy" />
        </span>
        <div class="shipping-item-copy">
          <div class="shipping-client">${escapeHtml(normalizeDisplay(item.clientName || "-"))}</div>
          <div class="shipping-title">
            <span class="shipping-product-name">${escapeHtml(normalizeDisplay(item.productName || "-"))}</span>
          </div>
        </div>
        <div class="shipping-meta-stack">
          <span class="process-pill ${processClass}">${escapeHtml(process)}</span>
          ${metaParts.map((part) => `<span class="shipping-meta-pill">${escapeHtml(part)}</span>`).join("")}
        </div>
        <div class="shipping-card-actions">
          <button class="shipping-remove-button" type="button" data-mobile-shipping-remove="${escapeHtml(key)}">삭제</button>
          <button class="ship-pending-button" type="button" data-mobile-shipping="${escapeHtml(key)}" data-mobile-shipping-action="pending">출고대기 등록</button>
          <button class="ship-now-button" type="button" data-mobile-shipping="${escapeHtml(key)}" data-mobile-shipping-action="complete">출고</button>
        </div>
      </div>
      <p class="item-worker"><span>작업자</span>${escapeHtml(normalizeDisplay(item.registrant || item.inspector || "-"))}</p>
      <div class="item-metrics">
        <span class="metric">
          <span>스캔 박스</span>
          <span class="metric-count-row">
            <span class="metric-value-row">
              <strong>${formatNumber(boxCount)}</strong>
              <small>Box</small>
            </span>
            <small>총 ${formatNumber(totalBoxCount)}박스</small>
          </span>
        </span>
        <span class="metric">
          <span>출고 가능 수량</span>
          <span class="metric-value-row">
            <strong>${formatNumber(totalQuantity)}</strong>
            <small>ea</small>
          </span>
        </span>
        <span class="metric">
          <span>현재 수량</span>
          <span class="metric-value-row">
            <strong class="blue">${formatNumber(currentQuantity)}</strong>
            <small>ea</small>
          </span>
          <span class="metric-action-row">
            <button class="metric-quantity-button" type="button" data-mobile-shipping-quantity="${escapeHtml(key)}">수량 변경</button>
          </span>
        </span>
      </div>
    </article>
  `;
}

function renderShippingLoading() {
  elements.mobileShippingCount.textContent = "0";
  elements.shippingListPanel.innerHTML = `
    <div class="empty-state">
      <div>
        <span class="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path></svg>
        </span>
        <h2>불러오는 중입니다</h2>
        <p>출고 목록을 확인하고 있습니다.</p>
      </div>
    </div>
  `;
}

function renderShippingError(message) {
  elements.mobileShippingCount.textContent = "0";
  elements.shippingListPanel.innerHTML = `
    <div class="empty-state">
      <div>
        <span class="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg>
        </span>
        <h2>목록을 불러오지 못했습니다</h2>
        <p>${escapeHtml(message)}</p>
        <button class="primary-action" type="button" id="retryShippingButton">다시 시도</button>
      </div>
    </div>
  `;
  document.querySelector("#retryShippingButton")?.addEventListener("click", loadShippingDashboard);
}

function openConfirmModal(item, action = "complete") {
  state.selectedConfirmMode = "item";
  state.selectedShippingItem = item;
  state.selectedShippingAction = action;
  const scannedBoxLabel = getScannedBoxLabel(item);
  const boxes = getActiveBoxes(item);
  const boxText = Array.isArray(item.scannedItems)
    ? `${formatNumber(item.scannedBoxCount)}box`
    : scannedBoxLabel || (boxes.length ? `${formatNumber(boxes.length)}box` : "");
  const metaParts = [
    normalizeDisplay(item.batch || "-"),
    normalizeDisplay(item.finalProcess || "-"),
    boxText
  ].filter((value) => value && value !== "-");
  const isPendingAction = action === "pending";
  if (elements.confirmMessage) {
    elements.confirmMessage.textContent = isPendingAction
      ? "해당 제품을 출고대기로 등록하시겠습니까?"
      : "해당 제품을 출고 처리하시겠습니까?";
  }
  elements.acceptConfirmButton.textContent = isPendingAction ? "출고대기 등록" : "출고";
  elements.confirmProductName.textContent = normalizeDisplay(item.productName);
  renderConfirmMeta(metaParts);
  elements.confirmModal.hidden = false;
}

function openScannedShippingConfirmModal(action = "complete") {
  if (state.isCompletingShipping) {
    return;
  }

  const items = [...state.scannedShippingRows];
  const isPendingAction = action === "pending";
  if (!items.length) {
    showToast(isPendingAction ? "출고대기로 등록할 박스를 먼저 스캔해주세요." : "출고 처리할 박스를 먼저 스캔해주세요.");
    return;
  }

  const boxCount = items.length;
  const totalQuantity = items.reduce((sum, item) => sum + getBoxCurrentQuantity(getScannedBox(item), item), 0);
  const actionLabel = isPendingAction ? "출고대기 등록" : "출고";
  state.selectedConfirmMode = "scannerBatch";
  state.selectedShippingItem = null;
  state.selectedShippingAction = action;

  if (elements.confirmMessage) {
    elements.confirmMessage.textContent = `스캔한 ${formatNumber(boxCount)}개 박스를 ${actionLabel} 처리하시겠습니까?`;
  }
  elements.acceptConfirmButton.textContent = actionLabel;
  elements.confirmProductName.textContent = "스캔한 박스";
  renderConfirmMeta(totalQuantity
    ? [`총 ${formatNumber(boxCount)}box`, `${formatNumber(totalQuantity)}ea`]
    : [`총 ${formatNumber(boxCount)}box`]);
  elements.confirmModal.hidden = false;
}

function renderConfirmMeta(parts = []) {
  if (!elements.confirmMetaList) {
    return;
  }

  const values = parts
    .map((part) => normalizeDisplay(part))
    .filter((part) => part && part !== "-");

  elements.confirmMetaList.hidden = !values.length;
  elements.confirmMetaList.innerHTML = values
    .map((part) => `<span>${escapeHtml(part)}</span>`)
    .join("");
}

function closeConfirmModal() {
  state.selectedShippingItem = null;
  state.selectedShippingAction = "complete";
  state.selectedConfirmMode = "item";
  renderConfirmMeta([]);
  elements.confirmModal.hidden = true;
}

async function handleConfirmShipping() {
  if (state.selectedConfirmMode === "scannerBatch") {
    if (state.isCompletingShipping) {
      return;
    }

    elements.acceptConfirmButton.disabled = true;
    elements.acceptConfirmButton.textContent = "처리 중";
    try {
      await handleCompleteScannedShipping(state.selectedShippingAction || "complete");
      closeConfirmModal();
    } finally {
      elements.acceptConfirmButton.disabled = false;
      elements.acceptConfirmButton.textContent = "확인";
    }
    return;
  }

  if (!state.selectedShippingItem || state.isCompletingShipping) {
    return;
  }

  const item = state.selectedShippingItem;
  const action = state.selectedShippingAction || "complete";
  const selectedBoxes = getSelectedBoxNumbers(item);

  if (!selectedBoxes.length) {
    showToast(action === "pending" ? "출고대기로 등록할 박스 번호가 없습니다." : "출고 처리할 박스 번호가 없습니다.");
    closeConfirmModal();
    return;
  }

  state.isCompletingShipping = true;
  elements.acceptConfirmButton.disabled = true;
  elements.acceptConfirmButton.textContent = "처리 중";

  try {
    const targetItems = Array.isArray(item.scannedItems) ? item.scannedItems : [item];
    const result = await completeShippingItems(targetItems, action);
    const actionLabel = action === "pending" ? "출고대기 등록" : "출고";

    closeConfirmModal();
    if (result.completedCount > 0) {
      const failedSet = new Set(result.failedItems);
      state.scannedShippingRows = state.scannedShippingRows.filter((row) => !targetItems.includes(row) || failedSet.has(row));
      saveScannedShippingRows();
      applyShippingFilters();
      showToast(result.failedItems.length ? `${result.completedCount}개 박스 ${actionLabel} 완료, ${result.failedItems.length}건 실패` : `${result.completedCount}개 박스 ${actionLabel} 완료`);
    } else {
      showToast(action === "pending" ? "출고대기로 등록된 박스가 없습니다." : "출고 처리된 박스가 없습니다.");
    }
    await loadShippingDashboard();
  } catch (error) {
    showToast(error.message || (action === "pending" ? "출고대기 등록 중 문제가 발생했습니다." : "출고 처리 중 문제가 발생했습니다."));
  } finally {
    state.isCompletingShipping = false;
    elements.acceptConfirmButton.disabled = false;
    elements.acceptConfirmButton.textContent = "확인";
  }
}

async function handleCompleteScannedShipping(action = "complete") {
  if (state.isCompletingShipping) {
    return;
  }

  const isPendingAction = action === "pending";
  const actionLabel = isPendingAction ? "출고대기 등록" : "출고";
  const items = [...state.scannedShippingRows];
  if (!items.length) {
    showToast(isPendingAction ? "출고대기로 등록할 박스를 먼저 스캔해주세요." : "출고 처리할 박스를 먼저 스캔해주세요.");
    return;
  }

  state.isCompletingShipping = true;
  if (elements.scannerPendingButton) {
    elements.scannerPendingButton.disabled = true;
  }
  elements.scannerDoneButton.disabled = true;
  const activeButton = isPendingAction ? elements.scannerPendingButton : elements.scannerDoneButton;
  if (activeButton) {
    activeButton.textContent = "처리 중";
  }

  try {
    const { completedCount, failedItems } = await completeShippingItems(items, action);

    if (completedCount > 0) {
      triggerScanFeedback(SCAN_COMPLETE_VIBRATION);
      state.scannedShippingRows = failedItems;
      saveScannedShippingRows();
      applyShippingFilters();
      showToast(failedItems.length ? `${completedCount}개 박스 ${actionLabel} 완료, ${failedItems.length}건 실패` : `${completedCount}개 박스 ${actionLabel} 완료`);
      if (!failedItems.length) {
        closeScanner();
      }
      await loadShippingDashboard({ silent: true });
    } else {
      showToast(isPendingAction ? "출고대기로 등록된 박스가 없습니다." : "출고 처리된 박스가 없습니다.");
    }
  } finally {
    state.isCompletingShipping = false;
    if (elements.scannerPendingButton) {
      elements.scannerPendingButton.disabled = false;
      elements.scannerPendingButton.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M4 12h16"></path><path d="M12 4v16"></path></svg>
        출고대기 등록
      `;
    }
    elements.scannerDoneButton.disabled = false;
    elements.scannerDoneButton.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"></path></svg>
      출고
    `;
  }
}

function handleScannerPendingAction() {
  if (state.activeWorkflow === "inventoryMove") {
    handleCompleteScannedInventoryMove("single");
    return;
  }

  openScannedShippingConfirmModal("pending");
}

function handleScannerDoneAction() {
  if (state.activeWorkflow === "inventoryMove") {
    handleCompleteScannedInventoryMove("all");
    return;
  }

  openScannedShippingConfirmModal("complete");
}

async function completeShippingItems(items, action = "complete") {
  let completedCount = 0;
  const failedItems = [];

  for (const item of items) {
    const selectedBoxes = getSelectedBoxNumbers(item);
    if (!selectedBoxes.length) {
      failedItems.push(item);
      continue;
    }

    try {
      await completeShippingItem(item, selectedBoxes, action);
      completedCount += selectedBoxes.length;
    } catch (error) {
      failedItems.push(item);
    }
  }

  return { completedCount, failedItems };
}

async function completeShippingItem(item, selectedBoxes, action = "complete") {
  const now = new Date();
  const scannedBox = getScannedBox(item);
  const inspectionQuantity = parseNumber(scannedBox?.currentQuantity || scannedBox?.quantity || item.currentTotalQuantity);
  const isPendingAction = action === "pending";
  const boxQuantities = getSelectedBoxQuantities(item, selectedBoxes);

  const payload = {
    managementId: item.managementId,
    productId: item.productId,
    clientName: item.clientName,
    productName: item.productName,
    batch: item.batch,
    finalProcess: item.finalProcess,
    storageLocation: item.storage,
    storage: item.storage,
    status: isPendingAction ? "출고대기" : "출고완료",
    shippingType: "정상출고",
    "출고유형": "정상출고",
    "출고 유형": "정상출고",
    shippingDate: toDateKey(now),
    shippingTime: toTimeKey(now),
    shipper: state.user?.name || "Admin",
    selectedBoxes,
    boxQuantities
  };

  if (isPendingAction) {
    return requestApi("updateShippingStatus", payload);
  }

  return requestApi("updateShippingStatus", {
    ...payload,
    forceCompleteShipping: true,
    autoShippingInspection: true,
    inspectionDate: toDateKey(now),
    inspectionTime: toTimeKey(now),
    inspector: state.user?.name || "Admin",
    inspectionQuantity: inspectionQuantity || "",
    defectQuantity: 0,
    defectRate: "0%",
    defectReason: "양호"
  });
}

async function handleCompleteScannedInventoryMove(mode = "single") {
  if (state.isCompletingShipping) {
    return;
  }

  const items = groupScannedInventoryMoveRows(state.scannedMoveRows);
  const scannedBoxCount = state.scannedMoveRows.length;
  if (!scannedBoxCount) {
    showToast("이동할 박스를 먼저 스캔해주세요.");
    return;
  }

  const actionLabel = mode === "all" ? "전량 이동" : "자리이동";
  const ok = window.confirm(`스캔한 ${formatNumber(scannedBoxCount)}개 박스 (${formatNumber(items.length)}개 제품)을 ${actionLabel} 처리하시겠습니까?`);
  if (!ok) {
    return;
  }

  state.isCompletingShipping = true;
  if (elements.scannerPendingButton) {
    elements.scannerPendingButton.disabled = true;
  }
  if (elements.scannerDoneButton) {
    elements.scannerDoneButton.disabled = true;
  }
  const activeButton = mode === "single" ? elements.scannerPendingButton : elements.scannerDoneButton;
  if (activeButton) {
    activeButton.textContent = "이동 중";
  }

  try {
    const { completedCount, failedItems } = await completeInventoryMoveItems(items, mode);
    if (completedCount > 0) {
      triggerScanFeedback(SCAN_COMPLETE_VIBRATION);
      const failedKeys = new Set(failedItems.map((item) => getInventoryMoveKey(item)));
      state.scannedMoveRows = state.scannedMoveRows.filter((row) => failedKeys.has(getInventoryMoveProductGroupKey(row)));
      saveScannedMoveRows();
      renderInventoryMoveList();
      renderScannerScannedList();
      showToast(failedItems.length ? `${completedCount}개 박스 이동 완료, ${failedItems.length}건 실패` : `${completedCount}개 박스 이동 완료`);
      if (!failedItems.length) {
        closeScanner();
      }
      await loadShippingDashboard({ silent: true });
      renderInventoryMoveList();
    } else {
      showToast("이동 처리할 박스가 없습니다.");
    }
  } finally {
    state.isCompletingShipping = false;
    if (elements.scannerPendingButton) {
      elements.scannerPendingButton.disabled = false;
    }
    if (elements.scannerDoneButton) {
      elements.scannerDoneButton.disabled = false;
    }
    updateScannerActionLabels();
  }
}

async function completeInventoryMoveItems(items, mode = "single") {
  let completedCount = 0;
  const failedItems = [];

  for (const item of items) {
    try {
      const selectedBoxes = mode === "all" ? getInventoryMoveAllBoxNumbers(item) : getSelectedBoxNumbers(item);
      if (!selectedBoxes.length) {
        failedItems.push(item);
        continue;
      }
      await completeInventoryMoveItem(item, selectedBoxes, mode);
      completedCount += selectedBoxes.length;
    } catch (error) {
      failedItems.push(item);
    }
  }

  return { completedCount, failedItems };
}

async function completeInventoryMoveItem(item, selectedBoxes, mode = "single") {
  const currentStorage = getInventoryMoveCurrentStorage(item);
  const targetStorage = normalizeDisplay(item.targetStorage || getDefaultTargetStorage(currentStorage));

  if (!targetStorage || targetStorage === "-" || targetStorage === currentStorage) {
    throw new Error("이동할 장소를 현재 보관 장소와 다르게 선택해주세요.");
  }

  return requestApi("updateInventoryBoxMove", {
    managementId: item.managementId,
    productId: item.productId,
    clientName: item.clientName,
    productName: item.productName,
    batch: item.batch,
    finalProcess: item.finalProcess,
    storage: currentStorage,
    currentStorage,
    targetStorage,
    status: "보관",
    userName: state.user?.name || "Admin",
    selectedBoxes,
    moveAllBoxes: mode === "all"
  });
}

function openInventoryMoveScanner() {
  state.activeWorkflow = "inventoryMove";
  openScanner();
}

async function openScanner() {
  if (elements.inventoryMoveScreen?.classList.contains("active")) {
    state.activeWorkflow = "inventoryMove";
  } else {
    state.activeWorkflow = "shipping";
  }

  elements.scannerScreen.hidden = false;
  state.scannerLastValue = "";
  primeScanFeedback();
  setScannerSheetExpanded(false);
  updateScannerActionLabels();
  renderScannerScannedList();
  setScannerHelp(state.activeWorkflow === "inventoryMove"
    ? "이동할 박스 QR을 스캔하세요. 선택 박스만 자리이동하거나 같은 보관장소의 전량 박스를 이동할 수 있습니다."
    : "QR 코드가 인식되지 않으면 수동 입력을 사용해주세요.");

  if (!navigator.mediaDevices?.getUserMedia) {
    setScannerHelp("이 브라우저에서는 카메라를 열 수 없습니다. 수동 입력으로 진행해주세요.");
    showToast("카메라 기능을 사용할 수 없어 수동 입력을 사용해주세요.");
    window.setTimeout(handleManualQrInput, 200);
    return;
  }

  try {
    const stream = await getScannerStream();
    if (elements.scannerVideo.srcObject !== stream) {
      elements.scannerVideo.srcObject = stream;
    }
    await elements.scannerVideo.play();
    startBarcodeDetection();
  } catch (error) {
    setScannerHelp("카메라 권한이 차단되었습니다. 권한을 허용하거나 수동 입력을 사용해주세요.");
    showToast("카메라 권한을 허용하거나 수동 입력을 사용해주세요.");
  }
}

function updateScannerActionLabels() {
  if (!elements.scannerPendingButton || !elements.scannerDoneButton) {
    return;
  }

  if (state.activeWorkflow === "inventoryMove") {
    elements.scannerPendingButton.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M8 7h12"></path><path d="M8 12h12"></path><path d="M8 17h12"></path><path d="M4 7h.01"></path><path d="M4 12h.01"></path><path d="M4 17h.01"></path></svg>
      자리이동
    `;
    elements.scannerDoneButton.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M4 12h14"></path><path d="m13 5 7 7-7 7"></path></svg>
      전량 이동
    `;
    return;
  }

  elements.scannerPendingButton.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M4 12h16"></path><path d="M12 4v16"></path></svg>
    출고대기 등록
  `;
  elements.scannerDoneButton.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"></path></svg>
    출고
  `;
}

async function getScannerStream() {
  const reusableStream = getReusableScannerStream();
  if (reusableStream) {
    return reusableStream;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 },
      resizeMode: { ideal: "none" }
    },
    audio: false
  });

  state.scannerStream = stream;
  stream.getTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      if (state.scannerStream === stream && !getReusableScannerStream()) {
        state.scannerStream = null;
        if (elements.scannerVideo?.srcObject === stream) {
          elements.scannerVideo.srcObject = null;
        }
      }
    });
  });
  await tuneScannerCamera(stream);
  return stream;
}

function getReusableScannerStream() {
  const stream = state.scannerStream;
  if (!stream) {
    return null;
  }

  return stream.getVideoTracks().some((track) => track.readyState === "live") ? stream : null;
}

async function tuneScannerCamera(stream) {
  const [track] = stream.getVideoTracks();
  if (!track?.getCapabilities || !track.applyConstraints) {
    return;
  }

  const capabilities = track.getCapabilities();
  const advanced = [];

  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }

  if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes("continuous")) {
    advanced.push({ exposureMode: "continuous" });
  }

  if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes("continuous")) {
    advanced.push({ whiteBalanceMode: "continuous" });
  }

  if (advanced.length) {
    try {
      await track.applyConstraints({ advanced });
    } catch (error) {
      // 일부 모바일 브라우저는 capabilities를 알려줘도 constraint 적용을 거부합니다.
    }
  }

  const zoom = capabilities.zoom;
  if (!zoom || typeof zoom.max !== "number" || zoom.max <= 1 || !track.applyConstraints) {
    return;
  }

  const minZoom = typeof zoom.min === "number" ? zoom.min : 1;
  const targetZoom = Math.min(zoom.max, Math.max(minZoom, 1.18));
  if (targetZoom <= minZoom) {
    return;
  }

  try {
    await track.applyConstraints({ advanced: [{ zoom: targetZoom }] });
  } catch (error) {
    // 줌 제어가 막힌 브라우저에서는 기본 화각 그대로 사용합니다.
  }
}

function closeScanner() {
  releaseScannerStream();
}

function releaseScannerStream() {
  if (state.scannerTimer) {
    clearInterval(state.scannerTimer);
    state.scannerTimer = null;
  }

  if (elements.scannerScreen) {
    elements.scannerScreen.hidden = true;
  }

  if (elements.scannerVideo) {
    elements.scannerVideo.pause();
    elements.scannerVideo.srcObject = null;
  }

  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }
}

function startBarcodeDetection() {
  if (state.scannerTimer) {
    clearInterval(state.scannerTimer);
    state.scannerTimer = null;
  }

  const detector = createBarcodeDetector();
  if (typeof window.jsQR === "function") {
    startJsQrDetection(detector);
    return;
  }

  if (!detector) {
    setScannerHelp("QR 인식 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하거나 수동 입력을 사용해주세요.");
    showToast("QR 인식 모듈 로딩에 실패했습니다.");
    return;
  }
  state.scannerTimer = setInterval(async () => {
    if (document.hidden || elements.scannerScreen.hidden || !elements.scannerVideo.srcObject) {
      return;
    }

    try {
      const codes = await detector.detect(elements.scannerVideo);
      if (codes.length) {
        handleQrValue(codes[0].rawValue);
      }
    } catch (error) {
      clearInterval(state.scannerTimer);
      state.scannerTimer = null;
      setScannerHelp("QR 자동 인식이 중단되었습니다. 수동 입력으로 진행해주세요.");
      showToast("QR 자동 인식이 중단되었습니다.");
    }
  }, BARCODE_DETECT_INTERVAL_MS);
}

function createBarcodeDetector() {
  if (!("BarcodeDetector" in window)) {
    return null;
  }

  try {
    return new BarcodeDetector({ formats: ["qr_code"] });
  } catch (error) {
    return null;
  }
}

function startJsQrDetection(detector = null) {
  if (typeof window.jsQR !== "function") {
    setScannerHelp("QR 인식 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하거나 수동 입력을 사용해주세요.");
    showToast("QR 인식 모듈 로딩에 실패했습니다.");
    return;
  }

  if (!state.scannerCanvas) {
    state.scannerCanvas = document.createElement("canvas");
    state.scannerCanvasContext = state.scannerCanvas.getContext("2d", { willReadFrequently: true });
  }

  setScannerHelp("QR이 화면에 보이면 자동 인식합니다. 박스 안에 딱 맞추지 않아도 됩니다.");
  let isDetectingFrame = false;
  state.scannerTimer = window.setInterval(async () => {
    if (isDetectingFrame) {
      return;
    }

    const video = elements.scannerVideo;
    const context = state.scannerCanvasContext;

    if (document.hidden || elements.scannerScreen.hidden || !video?.srcObject || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
      return;
    }

    isDetectingFrame = true;

    try {
      if (detector) {
        const codes = await detector.detect(video);
        if (codes.length) {
          handleQrValue(codes[0].rawValue);
          isDetectingFrame = false;
          return;
        }
      }
    } catch (error) {
      detector = null;
    }

    const scale = Math.min(1, JSQR_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.floor(sourceWidth * scale));
    const height = Math.max(1, Math.floor(sourceHeight * scale));

    if (state.scannerCanvas.width !== width) {
      state.scannerCanvas.width = width;
    }
    if (state.scannerCanvas.height !== height) {
      state.scannerCanvas.height = height;
    }
    context.drawImage(video, 0, 0, width, height);

    try {
      const imageData = context.getImageData(0, 0, width, height);
      const qr = window.jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
      if (qr?.data) {
        handleQrValue(qr.data);
      }
    } catch (error) {
      clearInterval(state.scannerTimer);
      state.scannerTimer = null;
      setScannerHelp("QR 인식 중 문제가 발생했습니다. 수동 입력으로 진행해주세요.");
      showToast("QR 인식이 중단되었습니다.");
    } finally {
      isDetectingFrame = false;
    }
  }, JSQR_DETECT_INTERVAL_MS);
}

function setScannerHelp(message) {
  if (elements.scannerHelpText) {
    elements.scannerHelpText.textContent = message;
  }
}

function handleManualQrInput() {
  const value = window.prompt("QR 또는 관리ID를 입력해주세요.");
  if (value) {
    handleQrValue(value);
  }
}

async function handleQrValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return;
  }

  if (state.isProcessingScan || state.scannerLastValue === value) {
    return;
  }

  state.isProcessingScan = true;
  state.scannerLastValue = value;

  try {
    await ensureDashboardLoaded();
    const matched = state.activeWorkflow === "inventoryMove"
      ? findInventoryMoveByQrValue(value)
      : findShippingByQrValue(value);

    if (!matched) {
      setScannerHelp(state.activeWorkflow === "inventoryMove" ? "이동할 박스를 찾지 못했습니다. QR 또는 보관 상태를 확인해주세요." : "일치하는 박스를 찾지 못했습니다. QR 또는 박스 정보를 확인해주세요.");
      showToast(state.activeWorkflow === "inventoryMove" ? "이동할 박스가 없습니다." : "일치하는 박스가 없습니다.");
      return;
    }

    const key = state.activeWorkflow === "inventoryMove" ? getInventoryMoveKey(matched) : getShippingKey(matched);
    const scannedRows = state.activeWorkflow === "inventoryMove" ? state.scannedMoveRows : state.scannedShippingRows;
    const hasDuplicate = scannedRows.some((row) => {
      return state.activeWorkflow === "inventoryMove"
        ? getInventoryMoveKey(row) === key
        : getShippingKey(row) === key;
    });

    if (hasDuplicate) {
      triggerScanFeedback(SCAN_DUPLICATE_VIBRATION);
      setScannerHelp("이미 스캔된 박스입니다. 다른 박스를 계속 스캔할 수 있습니다.");
      showToast("이미 등록된 박스입니다.");
      return;
    }

    if (state.activeWorkflow === "inventoryMove") {
      state.scannedMoveRows = [matched, ...state.scannedMoveRows];
      saveScannedMoveRows();
      state.moveQuery = "";
      if (elements.inventoryMoveSearchInput) {
        elements.inventoryMoveSearchInput.value = "";
      }
      renderInventoryMoveList();
      renderScannerScannedList();
    } else {
      state.scannedShippingRows = [matched, ...state.scannedShippingRows];
      saveScannedShippingRows();
      state.query = "";
      if (elements.shippingSearchInput) {
        elements.shippingSearchInput.value = "";
      }
      applyShippingFilters();
    }

    triggerScanFeedback(SCAN_SUCCESS_VIBRATION);
    revealScannerScannedList();
    setScannerHelp("스캔 완료. 다음 제품 박스를 계속 스캔할 수 있습니다.");
    showToast("스캔한 박스를 등록했습니다.");
  } catch (error) {
    setScannerHelp(error.message || "스캔한 제품 정보를 확인하지 못했습니다.");
    showToast(error.message || "제품 정보를 확인하지 못했습니다.");
  } finally {
    window.setTimeout(() => {
      state.scannerLastValue = "";
      state.isProcessingScan = false;
    }, SCAN_PROCESSING_LOCK_MS);
  }
}

async function ensureDashboardLoaded() {
  if (state.dashboard.length) {
    return;
  }
  const data = await requestApi("getInventoryDashboard");
  state.dashboard = Array.isArray(data?.rows) ? data.rows : [];
}

function findShippingByQrValue(rawValue) {
  const parsed = parseQrValue(rawValue);
  const text = normalizeScanValue(rawValue);

  for (const row of state.dashboard) {
    const boxes = getKnownBoxes(row);
    const rowValues = [
      row.managementId,
      row.productId,
      row.clientName,
      row.productName,
      row.batch,
      row.finalProcess,
      row.storage
    ].map(normalizeScanValue);

    if (parsed.managementId && normalizeScanValue(row.managementId) !== parsed.managementId) {
      continue;
    }

    if (parsed.productId && normalizeScanValue(row.productId) !== parsed.productId) {
      continue;
    }

    const matchedBox = findMatchedBox(boxes, parsed);
    if (matchedBox) {
      return buildScannedBoxItem(row, matchedBox, parsed, rawValue);
    }

    if (parsed.managementId || parsed.productId) {
      return buildScannedBoxItem(row, createParsedBox(parsed), parsed, rawValue);
    }

    if (text && rowValues.some((value) => value && value.includes(text))) {
      return buildScannedBoxItem(row, boxes[0] || createParsedBox(parsed), parsed, rawValue);
    }
  }

  return null;
}

function findInventoryMoveByQrValue(rawValue) {
  const parsed = parseQrValue(rawValue);
  const text = normalizeScanValue(rawValue);

  for (const row of state.dashboard) {
    const boxes = getMovableBoxes(row);
    const rowValues = [
      row.managementId,
      row.productId,
      row.clientName,
      row.productName,
      row.batch,
      row.finalProcess,
      row.storage
    ].map(normalizeScanValue);

    if (parsed.managementId && normalizeScanValue(row.managementId) !== parsed.managementId) {
      continue;
    }

    if (parsed.productId && normalizeScanValue(row.productId) !== parsed.productId) {
      continue;
    }

    const matchedBox = findMatchedBox(boxes, parsed);
    if (matchedBox) {
      return buildInventoryMoveItem(row, matchedBox, parsed, rawValue);
    }

    if ((parsed.managementId || parsed.productId) && boxes.length) {
      return buildInventoryMoveItem(row, boxes[0], parsed, rawValue);
    }

    if (text && rowValues.some((value) => value && value.includes(text)) && boxes.length) {
      return buildInventoryMoveItem(row, boxes[0], parsed, rawValue);
    }
  }

  return null;
}

function buildInventoryMoveItem(row, box, parsed, rawValue) {
  const item = buildScannedBoxItem(row, box, parsed, rawValue);
  const currentStorage = normalizeDisplay(box?.storage || row.storage || "미지정");
  return {
    ...item,
    moveCurrentStorage: currentStorage,
    targetStorage: getDefaultTargetStorage(currentStorage)
  };
}

function findMatchedBox(boxes, parsed) {
  if (!Array.isArray(boxes) || !boxes.length) {
    return null;
  }

  if (parsed.boxId) {
    const matchedById = boxes.find((box) => {
      return [box?.boxId, box?.id, box?.qrId].some((value) => normalizeScanValue(value) === parsed.boxId);
    });
    if (matchedById) {
      return matchedById;
    }
  }

  if (parsed.boxNumber) {
    const matchedByNumber = boxes.find((box) => {
      return String(box?.number || box?.sequence || "").trim() === parsed.boxNumber;
    });
    if (matchedByNumber) {
      return matchedByNumber;
    }
  }

  return null;
}

function buildScannedBoxItem(row, box, parsed, rawValue) {
  const scannedBox = {
    ...(box || {}),
    boxId: box?.boxId || parsed.boxId || "",
    number: box?.number || box?.sequence || parsed.boxNumber || ""
  };

  return {
    ...row,
    scannedBox,
    scannedBoxId: scannedBox.boxId,
    scannedBoxNumber: scannedBox.number,
    scannedQrValue: rawValue
  };
}

function createParsedBox(parsed) {
  return {
    boxId: parsed.boxId || "",
    number: parsed.boxNumber || "",
    status: "",
    quantity: ""
  };
}

function parseQrValue(rawValue) {
  const text = String(rawValue || "").trim();
  try {
    const parsed = JSON.parse(text);
    return {
      boxId: normalizeScanValue(parsed.b || parsed.boxId),
      managementId: normalizeScanValue(parsed.m || parsed.managementId),
      productId: normalizeScanValue(parsed.p || parsed.productId),
      boxNumber: String(parsed.n || parsed.number || "").trim()
    };
  } catch (error) {
    return {
      boxId: normalizeScanValue(text),
      managementId: "",
      productId: "",
      boxNumber: ""
    };
  }
}

function renderScannerScannedList() {
  const isInventoryMove = state.activeWorkflow === "inventoryMove";
  const rows = isInventoryMove ? state.scannedMoveRows : state.scannedShippingRows;

  if (elements.scannerScannedCount) {
    elements.scannerScannedCount.textContent = String(rows.length);
  }

  if (!elements.scannerScannedList) {
    return;
  }

  if (!rows.length) {
    elements.scannerScannedList.innerHTML = `
      <div class="scanner-empty">
        <strong>아직 스캔한 제품이 없습니다</strong>
        <span>${isInventoryMove ? "위치를 이동할 박스 QR을 카메라에 맞춰주세요." : "상단 카메라에 제품 박스 QR을 맞춰주세요."}</span>
      </div>
    `;
    return;
  }

  elements.scannerScannedList.innerHTML = rows.map((item, index) => {
    const scannedBox = getScannedBox(item);
    const boxLabel = getScannedBoxLabel(item) || "박스 정보 없음";
    const boxQuantity = scannedBox ? parseNumber(scannedBox.quantity || scannedBox.currentQuantity) : 0;
    const quantityText = boxQuantity ? ` · ${formatNumber(boxQuantity)}ea` : "";
    const storageText = isInventoryMove ? ` · ${normalizeDisplay(getInventoryMoveCurrentStorage(item))}` : "";
    return `
      <article class="scanner-scanned-item">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(normalizeDisplay(item.productName || "-"))}</strong>
          <small>${escapeHtml(normalizeDisplay(item.clientName || "-"))} · ${escapeHtml(normalizeDisplay(item.finalProcess || "-"))} · ${escapeHtml(boxLabel)}${quantityText}${escapeHtml(storageText)}</small>
        </div>
        ${isInventoryMove ? "" : `<button class="scanner-quantity-button" type="button" data-scanner-quantity="${index}">수량</button>`}
        <button class="scanner-remove-button" type="button" data-scanner-remove="${index}" aria-label="스캔 항목 삭제">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        </button>
      </article>
    `;
  }).join("");
}

function revealScannerScannedList() {
  if (!elements.scannerScreen || elements.scannerScreen.hidden) {
    return;
  }

  setScannerSheetExpanded(true);
  window.requestAnimationFrame(() => {
    elements.scannerScannedList?.scrollTo({ top: 0 });
  });
}

function handleScannerListClick(event) {
  const quantityButton = event.target.closest("[data-scanner-quantity]");
  if (quantityButton) {
    if (state.activeWorkflow === "inventoryMove") {
      return;
    }
    openScannerQuantityEditor(Number(quantityButton.dataset.scannerQuantity));
    return;
  }

  const removeButton = event.target.closest("[data-scanner-remove]");
  if (!removeButton) {
    return;
  }

  const index = Number(removeButton.dataset.scannerRemove);
  if (state.activeWorkflow === "inventoryMove") {
    removeScannedMoveRow(index);
    return;
  }

  removeScannedShippingRow(index);
}

function openScannerQuantityEditor(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.scannedShippingRows.length) {
    return;
  }

  editScannedBoxQuantity(state.scannedShippingRows[index]);
}

function openShippingQuantityEditor(key) {
  const items = getShippingQuantityItems(key);
  if (!items.length) {
    showToast("수량을 변경할 스캔 항목을 찾지 못했습니다.");
    return;
  }

  if (items.length === 1) {
    editScannedBoxQuantity(items[0]);
    return;
  }

  const list = items.map((item, index) => {
    const label = getScannedBoxLabel(item) || `${index + 1}번 박스`;
    return `${index + 1}. ${label} - ${formatNumber(getEditableBoxQuantity(item))}ea`;
  }).join("\n");
  const selected = window.prompt(`수량을 변경할 박스를 선택하세요.\n\n${list}`, "1");
  if (selected === null) {
    return;
  }

  const selectedIndex = Number.parseInt(selected, 10) - 1;
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= items.length) {
    showToast("박스 번호를 다시 확인해주세요.");
    return;
  }

  editScannedBoxQuantity(items[selectedIndex]);
}

function getShippingQuantityItems(key) {
  if (!key) {
    return [];
  }

  const visibleItem = state.filteredRows.find((row) => getShippingKey(row) === key);
  if (Array.isArray(visibleItem?.scannedItems)) {
    return visibleItem.scannedItems;
  }

  if (visibleItem) {
    return [visibleItem];
  }

  return state.scannedShippingRows.filter((row) => getShippingProductGroupKey(row) === key);
}

function editScannedBoxQuantity(item) {
  const currentQuantity = getEditableBoxQuantity(item);
  const label = getScannedBoxLabel(item) || "선택한 박스";
  const input = window.prompt(`${label} 수량을 입력하세요.`, currentQuantity ? String(currentQuantity) : "");
  if (input === null) {
    return;
  }

  const nextQuantity = parseNumber(input);
  if (!nextQuantity || nextQuantity < 1) {
    showToast("수량은 1 이상으로 입력해주세요.");
    return;
  }

  setScannedBoxQuantity(item, nextQuantity);
  saveScannedShippingRows();
  applyShippingFilters();
  showToast(`${label} 수량을 ${formatNumber(nextQuantity)}ea로 변경했습니다.`);
}

function getEditableBoxQuantity(item) {
  const box = getScannedBox(item);
  return parseNumber(
    box?.currentQuantity ||
    box?.quantity ||
    box?.boxQuantity ||
    box?.totalQuantity ||
    item?.currentTotalQuantity
  );
}

function setScannedBoxQuantity(item, quantity) {
  if (!item) {
    return;
  }

  const box = getScannedBox(item) || {};
  item.scannedBox = box;
  box.quantity = quantity;
  box.currentQuantity = quantity;
  box.boxQuantity = quantity;
  box.totalQuantity = quantity;
  box.originalQuantity = quantity;
  item.currentTotalQuantity = quantity;
  item.scannedQuantityEdited = true;
}

function removeScannedShippingRow(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.scannedShippingRows.length) {
    return;
  }

  state.scannedShippingRows.splice(index, 1);
  saveScannedShippingRows();
  applyShippingFilters();
  triggerScanFeedback(SCAN_DUPLICATE_VIBRATION);
  showToast("스캔 목록에서 삭제했습니다.");
}

function confirmRemoveScannedShippingGroup(key) {
  if (!key) {
    return;
  }

  const items = state.scannedShippingRows.filter((row) => getShippingProductGroupKey(row) === key);
  if (!items.length) {
    return;
  }

  const representative = items[0];
  const ok = window.confirm(`${normalizeDisplay(representative.productName)}\n스캔한 ${formatNumber(items.length)}개 박스를 출고 등록 목록에서 삭제하시겠습니까?`);
  if (!ok) {
    return;
  }

  removeScannedShippingGroup(key);
}

function removeScannedShippingGroup(key) {
  if (!key) {
    return;
  }

  const previousCount = state.scannedShippingRows.length;
  state.scannedShippingRows = state.scannedShippingRows.filter((row) => getShippingProductGroupKey(row) !== key);
  if (state.scannedShippingRows.length === previousCount) {
    return;
  }

  saveScannedShippingRows();
  applyShippingFilters();
  triggerScanFeedback(SCAN_DUPLICATE_VIBRATION);
  showToast("출고 등록 목록에서 삭제했습니다.");
}

function startShippingClock() {
  updateShippingClock();
  if (state.clockTimer) {
    return;
  }
  state.clockTimer = window.setInterval(updateShippingClock, SHIPPING_CLOCK_INTERVAL_MS);
}

function stopShippingClock() {
  if (!state.clockTimer) {
    return;
  }
  window.clearInterval(state.clockTimer);
  state.clockTimer = null;
}

function updateShippingClock() {
  const now = new Date();
  if (elements.shippingLiveDate) {
    elements.shippingLiveDate.textContent = formatLongDate(now);
  }
  if (elements.shippingLiveTime) {
    elements.shippingLiveTime.textContent = toTimeKeyWithSeconds(now);
    elements.shippingLiveTime.dateTime = now.toISOString();
  }
  if (elements.inventoryMoveLiveDate) {
    elements.inventoryMoveLiveDate.textContent = formatLongDate(now);
  }
  if (elements.inventoryMoveLiveTime) {
    elements.inventoryMoveLiveTime.textContent = toTimeKeyWithSeconds(now);
    elements.inventoryMoveLiveTime.dateTime = now.toISOString();
  }
}

async function requestApi(action, payload = {}, options = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload })
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "API 요청에 실패했습니다.");
  }

  return options.unwrap === false ? result : result.data;
}

function readSavedSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function readSavedScannedRows() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(SCANNED_ROWS_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

function saveScannedShippingRows() {
  try {
    if (!state.scannedShippingRows.length) {
      sessionStorage.removeItem(SCANNED_ROWS_KEY);
      return;
    }
    sessionStorage.setItem(SCANNED_ROWS_KEY, JSON.stringify(state.scannedShippingRows));
  } catch (error) {
    console.warn("Failed to save scanned shipping rows.", error);
  }
}

function readSavedMoveRows() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(MOVE_ROWS_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

function saveScannedMoveRows() {
  try {
    if (!state.scannedMoveRows.length) {
      sessionStorage.removeItem(MOVE_ROWS_KEY);
      return;
    }
    sessionStorage.setItem(MOVE_ROWS_KEY, JSON.stringify(state.scannedMoveRows));
  } catch (error) {
    console.warn("Failed to save inventory move rows.", error);
  }
}

function setLoginMessage(message, type = "error") {
  elements.loginMessage.textContent = message;
  elements.loginMessage.classList.toggle("success", type === "success");
  elements.loginMessage.classList.toggle("info", type === "info");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2400);
}

function getShippingKey(item) {
  if (item?.productGroupKey) {
    return item.productGroupKey;
  }

  const boxKey = getScannedBoxKey(item);
  return [
    item.managementId,
    item.productId,
    item.storage,
    item.productName,
    boxKey
  ].map((value) => String(value || "").replace(/\s+/g, "_")).join("__");
}

function getShippingProductGroupKey(item) {
  return [
    item.managementId,
    item.productId,
    item.storage,
    item.productName,
    item.batch,
    item.finalProcess
  ].map((value) => normalizeScanValue(value) || "-").join("__");
}

function getScannedBox(item) {
  if (item?.scannedBox) {
    return item.scannedBox;
  }

  if (item?.scannedBoxId || item?.scannedBoxNumber) {
    return {
      boxId: item.scannedBoxId || "",
      number: item.scannedBoxNumber || "",
      status: ""
    };
  }

  return null;
}

function getScannedBoxKey(item) {
  const box = getScannedBox(item);
  return normalizeScanValue(
    item?.scannedBoxId ||
    box?.boxId ||
    item?.scannedBoxNumber ||
    box?.number ||
    item?.scannedQrValue ||
    ""
  );
}

function getScannedBoxLabel(item) {
  const box = getScannedBox(item);
  const boxNumber = normalizeDisplay(item?.scannedBoxNumber || box?.number || box?.sequence || "");
  if (boxNumber !== "-") {
    return `${boxNumber}번 박스`;
  }

  const boxId = normalizeDisplay(item?.scannedBoxId || box?.boxId || "");
  return boxId !== "-" ? `박스 ${boxId}` : "";
}

function getSelectedBoxNumbers(item) {
  if (Array.isArray(item?.scannedItems)) {
    return item.scannedItems
      .flatMap((row) => getSelectedBoxNumbers(row))
      .filter(Boolean);
  }

  const scannedBox = getScannedBox(item);
  if (scannedBox) {
    const boxNumber = String(scannedBox.number || scannedBox.sequence || item?.scannedBoxNumber || "").trim();
    return boxNumber ? [boxNumber] : [];
  }

  return getKnownBoxes(item)
    .filter((box) => !normalizeText(box.status).includes("출고완료"))
    .map((box) => String(box.number || box.sequence || "").trim())
    .filter(Boolean);
}

function getSelectedBoxQuantities(item, selectedBoxes = []) {
  const quantities = {};
  const selectedSet = new Set(selectedBoxes.map((boxNumber) => String(boxNumber).trim()).filter(Boolean));
  const scannedBox = getScannedBox(item);
  const candidates = [
    scannedBox,
    ...getKnownBoxes(item)
  ].filter(Boolean);

  candidates.forEach((box) => {
    const number = String(box.number || box.sequence || item?.scannedBoxNumber || "").trim();
    if (!number || !selectedSet.has(number)) {
      return;
    }

    const quantity = getBoxCurrentQuantity(box, item);
    if (quantity) {
      quantities[number] = quantity;
    }
  });

  if (scannedBox && !Object.keys(quantities).length && selectedBoxes.length === 1) {
    const quantity = getBoxCurrentQuantity(scannedBox, item);
    if (quantity) {
      quantities[selectedBoxes[0]] = quantity;
    }
  }

  return quantities;
}

function getBoxTotalQuantity(box, item) {
  return parseNumber(
    box?.originalQuantity ||
    box?.totalQuantity ||
    box?.boxQuantity ||
    box?.quantity ||
    item?.currentTotalQuantity
  );
}

function getBoxCurrentQuantity(box, item) {
  return parseNumber(
    box?.currentQuantity ||
    box?.quantity ||
    item?.currentTotalQuantity
  );
}

function canUseVibration() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function primeScanFeedback() {
  triggerScanFeedback(1, { visual: false });
}

function triggerScanFeedback(pattern = SCAN_SUCCESS_VIBRATION, options = {}) {
  if (options.visual !== false) {
    pulseScannerFeedback();
  }

  if (!canUseVibration()) {
    return false;
  }

  try {
    return navigator.vibrate(pattern) === true;
  } catch (error) {
    return false;
  }
}

function pulseScannerFeedback() {
  if (!elements.scannerScreen || elements.scannerScreen.hidden) {
    return;
  }

  elements.scannerScreen.classList.remove("is-scan-feedback");
  void elements.scannerScreen.offsetWidth;
  elements.scannerScreen.classList.add("is-scan-feedback");
  window.clearTimeout(pulseScannerFeedback.timer);
  pulseScannerFeedback.timer = window.setTimeout(() => {
    elements.scannerScreen?.classList.remove("is-scan-feedback");
  }, 420);
}

function getActiveBoxes(item) {
  const boxes = Array.isArray(item.activeShippingBoxes) ? item.activeShippingBoxes : [];
  return boxes.filter((box) => {
    const status = normalizeText(box.status);
    return status.includes("출고대기");
  });
}

function getMovableBoxes(item) {
  return getKnownBoxes(item).filter((box) => {
    const status = normalizeText(box?.status);
    const quantity = getBoxCurrentQuantity(box, item);
    return quantity > 0 && !/출고완료|폐기/.test(status);
  });
}

function getKnownBoxes(item) {
  const sources = [
    item?.activeShippingBoxes,
    item?.allShippingBoxes,
    item?.shippedShippingBoxes,
    item?.boxes
  ];
  const seen = new Set();
  const merged = [];

  sources.forEach((boxes) => {
    if (!Array.isArray(boxes)) {
      return;
    }

    boxes.forEach((box) => {
      const key = [
        box?.boxId,
        box?.number,
        box?.sequence,
        box?.status,
        box?.quantity
      ].map((value) => String(value || "")).join("|");

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      merged.push(box);
    });
  });

  return merged;
}

function getInventoryMoveKey(item) {
  if (item?.productGroupKey) {
    return item.productGroupKey;
  }

  return [
    item?.managementId,
    item?.productId,
    getInventoryMoveCurrentStorage(item),
    item?.productName,
    getScannedBoxKey(item)
  ].map((value) => String(value || "").replace(/\s+/g, "_")).join("__");
}

function getInventoryMoveProductGroupKey(item) {
  return [
    item?.managementId,
    item?.productId,
    item?.clientName,
    item?.productName,
    item?.batch,
    item?.finalProcess,
    getInventoryMoveCurrentStorage(item)
  ].map((value) => normalizeScanValue(value) || "-").join("__");
}

function findInventoryMoveGroupByKey(key) {
  return groupScannedInventoryMoveRows(state.scannedMoveRows)
    .find((group) => getInventoryMoveKey(group) === key);
}

function updateInventoryMoveGroupStorage(key, targetStorage) {
  let changed = false;
  state.scannedMoveRows.forEach((row) => {
    if (getInventoryMoveProductGroupKey(row) !== key && getInventoryMoveKey(row) !== key) {
      return;
    }

    row.targetStorage = targetStorage;
    changed = true;
  });

  return changed;
}

function getInventoryMoveCurrentStorage(item) {
  const box = getScannedBox(item);
  return normalizeDisplay(item?.moveCurrentStorage || box?.storage || item?.storage || "미지정");
}

function getDefaultTargetStorage(currentStorage) {
  const current = normalizeDisplay(currentStorage);
  const fallback = INVENTORY_STORAGE_OPTIONS.find((storage) => storage !== current);
  return fallback || "미지정";
}

function getInventoryMoveAllBoxNumbers(item) {
  const currentStorage = normalizeScanValue(getInventoryMoveCurrentStorage(item));
  return getMovableBoxes(item)
    .filter((box) => normalizeScanValue(box?.storage || item?.storage || "미지정") === currentStorage)
    .map((box) => String(box?.number || box?.sequence || "").trim())
    .filter(Boolean);
}

function removeScannedMoveRow(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.scannedMoveRows.length) {
    return;
  }

  state.scannedMoveRows.splice(index, 1);
  saveScannedMoveRows();
  renderInventoryMoveList();
  renderScannerScannedList();
  triggerScanFeedback(SCAN_DUPLICATE_VIBRATION);
  showToast("스캔 목록에서 삭제했습니다.");
}

function confirmRemoveScannedMoveGroup(key) {
  if (!key) {
    return;
  }

  const item = findInventoryMoveGroupByKey(key) || state.scannedMoveRows.find((row) => getInventoryMoveKey(row) === key);
  if (!item) {
    return;
  }

  const scannedBoxCount = parseNumber(item.scannedBoxCount) || getSelectedBoxNumbers(item).length || 1;
  const ok = window.confirm(`${normalizeDisplay(item.productName)}\n스캔한 ${formatNumber(scannedBoxCount)}개 박스를 재고 수정 목록에서 삭제하시겠습니까?`);
  if (!ok) {
    return;
  }

  removeScannedMoveGroup(key);
}

function removeScannedMoveGroup(key) {
  if (!key) {
    return;
  }

  const previousCount = state.scannedMoveRows.length;
  state.scannedMoveRows = state.scannedMoveRows.filter((row) => {
    return getInventoryMoveProductGroupKey(row) !== key && getInventoryMoveKey(row) !== key;
  });
  if (state.scannedMoveRows.length === previousCount) {
    return;
  }

  saveScannedMoveRows();
  renderInventoryMoveList();
  renderScannerScannedList();
  triggerScanFeedback(SCAN_DUPLICATE_VIBRATION);
  showToast("재고 수정 목록에서 삭제했습니다.");
}

function removeMovedInventoryGroup(item) {
  const managementId = normalizeScanValue(item?.managementId);
  const productId = normalizeScanValue(item?.productId);
  const productName = normalizeScanValue(item?.productName);
  const storage = normalizeScanValue(getInventoryMoveCurrentStorage(item));

  state.scannedMoveRows = state.scannedMoveRows.filter((row) => {
    return !(
      normalizeScanValue(row.managementId) === managementId
      && normalizeScanValue(row.productId) === productId
      && normalizeScanValue(row.productName) === productName
      && normalizeScanValue(getInventoryMoveCurrentStorage(row)) === storage
    );
  });
  saveScannedMoveRows();
}

function sumBoxQuantity(boxes) {
  return boxes.reduce((sum, box) => sum + parseNumber(box.quantity), 0);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDisplay(value) {
  const text = normalizeText(value);
  return text && text !== "-" ? text : "-";
}

function parseNumber(value) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return parseNumber(value).toLocaleString("ko-KR");
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeKey(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toTimeKeyWithSeconds(date) {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join(":");
}

function toDateKeyFromValue(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") {
    return "";
  }

  const matched = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (!matched) {
    return "";
  }

  return [
    matched[1],
    matched[2].padStart(2, "0"),
    matched[3].padStart(2, "0")
  ].join("-");
}

function formatShortDate(date) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getMonth() + 1}.${date.getDate()} (${weekdays[date.getDay()]})`;
}

function formatLongDate(date) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} (${weekdays[date.getDay()]})`;
}

function normalizeScanValue(value) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
