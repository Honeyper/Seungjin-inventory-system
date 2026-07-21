const API_URL = window.SEUNGJIN_CONFIG?.API_URL || "";
const SESSION_KEY = "seungjinMobileSession";
const PERSISTENT_SESSION_KEY = "seungjinMobilePersistentSession";
const LOGIN_PREFERENCES_KEY = "seungjinMobileLoginPreferences";
const ROUTE_KEY = "seungjinMobileRoute";
const SCANNED_ROWS_KEY = "seungjinMobileScannedRows";
const PERSISTENT_SCANNED_ROWS_KEY = "seungjinMobilePersistentScannedRows";
const MOVE_ROWS_KEY = "seungjinMobileMoveRows";
const SCANNER_MODE_KEY = "seungjinMobileScannerMode";
const DASHBOARD_CACHE_KEY = `seungjinMobileDashboardCache:${window.SEUNGJIN_CONFIG?.ENV || "prod"}`;
const DASHBOARD_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const DASHBOARD_BACKGROUND_REFRESH_MS = 45 * 1000;
const SCANNER_DEVICE_CORES = Number(navigator.hardwareConcurrency) || 8;
const SCANNER_DEVICE_MEMORY_GB = Number(navigator.deviceMemory) || 8;
const IS_ANDROID_SCANNER = /Android/i.test(navigator.userAgent);
const IS_LOW_POWER_SCANNER = SCANNER_DEVICE_CORES <= 4
  || SCANNER_DEVICE_MEMORY_GB <= 3
  || (IS_ANDROID_SCANNER && SCANNER_DEVICE_MEMORY_GB <= 4);
const BARCODE_DETECT_INTERVAL_MS = IS_LOW_POWER_SCANNER ? 220 : 170;
const JSQR_DETECT_INTERVAL_MS = IS_LOW_POWER_SCANNER ? 220 : 170;
const JSQR_FAST_MAX_EDGE = IS_LOW_POWER_SCANNER ? 840 : 960;
const JSQR_DETAIL_MAX_EDGE = IS_LOW_POWER_SCANNER ? 1280 : 1440;
const JSQR_DETAIL_SCAN_INTERVAL = 3;
const JSQR_CENTER_CROP_RATIO = 0.72;
const JSQR_NATIVE_FALLBACK_INTERVAL = 1;
const SLOW_NATIVE_DETECT_MS = IS_LOW_POWER_SCANNER ? 150 : 190;
const SLOW_NATIVE_DETECT_LIMIT = 3;
const SCAN_PROCESSING_LOCK_MS = 380;
const HARDWARE_SCANNER_IDLE_SUBMIT_MS = 320;
const SHIPPING_CLOCK_INTERVAL_MS = 10000;
const SCAN_SUCCESS_VIBRATION = [140, 45, 90];
const SCAN_DUPLICATE_VIBRATION = [60, 35, 60];
const SCAN_COMPLETE_VIBRATION = [180, 60, 120];
const SHIPPING_ACTION_CONCURRENCY = 3;
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
  { key: "scannedBoxes", label: "최근 스캔순" },
  { key: "quantity", label: "수량 많은 순" }
];

const state = {
  user: null,
  dashboard: [],
  dashboardLoadedAt: 0,
  dashboardLoadPromise: null,
  filteredRows: [],
  scannedShippingRows: [],
  scannerSessionShippingKeys: [],
  scannedMoveRows: [],
  query: "",
  moveQuery: "",
  shippingSortMode: "scannedBoxes",
  showCompletedShippingBoxes: false,
  activeWorkflow: "shipping",
  selectedShippingItem: null,
  selectedShippingAction: "complete",
  selectedInventoryMoveMode: "single",
  selectedConfirmMode: "item",
  isCompletingShipping: false,
  scannerStream: null,
  scannerTimer: null,
  scannerCanvas: null,
  scannerCanvasContext: null,
  scannerCameraRequestPending: false,
  scannerInputMode: "camera",
  hardwareScannerBuffer: "",
  hardwareScannerLastInputAt: 0,
  hardwareScannerSubmitTimer: null,
  hardwareScannerStatusTimer: null,
  scannerLastValue: "",
  isProcessingScan: false,
  clockTimer: null,
  scannerSheetStartY: 0,
  scannerSheetDeltaY: 0,
  scannerSheetDragging: false,
  scannerSheetMoved: false,
  boxPickerProduct: null,
  boxPickerEditingGroupKey: "",
  boxPickerTargetItems: [],
  boxPickerMode: "edit",
  boxPickerSource: "card",
  manualShippingQuery: ""
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
  saveAccount: document.querySelector("#saveMobileAccount"),
  savePassword: document.querySelector("#saveMobilePassword"),
  autoLogin: document.querySelector("#enableMobileAutoLogin"),
  loginMessage: document.querySelector("#mobileLoginMessage"),
  adminLoginButton: document.querySelector("#adminLoginButton"),
  logoutButton: document.querySelector("#mobileLogoutButton"),
  mobileUserName: document.querySelector("#mobileUserName"),
  shippingSearchInput: document.querySelector("#shippingSearchInput"),
  shippingLiveDate: document.querySelector("#shippingLiveDate"),
  shippingLiveTime: document.querySelector("#shippingLiveTime"),
  mobileShippingCount: document.querySelector("#mobileShippingCount"),
  refreshShippingButton: document.querySelector("#refreshShippingButton"),
  showCompletedShippingToggle: document.querySelector("#showCompletedShippingToggle"),
  filterShippingButton: document.querySelector("#filterShippingButton"),
  shippingFilterMenu: document.querySelector("#shippingFilterMenu"),
  shippingListPanel: document.querySelector("#shippingListPanel"),
  openScannerButton: document.querySelector("#openScannerButton"),
  openManualShippingButton: document.querySelector("#openManualShippingButton"),
  manualShippingModal: document.querySelector("#manualShippingModal"),
  closeManualShippingButton: document.querySelector("#closeManualShippingButton"),
  manualShippingSearchInput: document.querySelector("#manualShippingSearchInput"),
  manualShippingProductList: document.querySelector("#manualShippingProductList"),
  shippingBoxPickerModal: document.querySelector("#shippingBoxPickerModal"),
  shippingBoxPickerTitle: document.querySelector("#shippingBoxPickerTitle"),
  closeShippingBoxPickerButton: document.querySelector("#closeShippingBoxPickerButton"),
  cancelShippingBoxPickerButton: document.querySelector("#cancelShippingBoxPickerButton"),
  boxPickerBoxStage: document.querySelector("#boxPickerBoxStage"),
  boxPickerClientName: document.querySelector("#boxPickerClientName"),
  boxPickerProductName: document.querySelector("#boxPickerProductName"),
  boxPickerProductMeta: document.querySelector("#boxPickerProductMeta"),
  boxPickerSectionTitle: document.querySelector("#boxPickerSectionTitle"),
  boxPickerSectionDescription: document.querySelector("#boxPickerSectionDescription"),
  boxPickerSelectAll: document.querySelector("#boxPickerSelectAll"),
  boxPickerBoxList: document.querySelector("#boxPickerBoxList"),
  boxPickerSelectedCount: document.querySelector("#boxPickerSelectedCount"),
  confirmShippingBoxPickerButton: document.querySelector("#confirmShippingBoxPickerButton"),
  inventoryMoveSearchInput: document.querySelector("#inventoryMoveSearchInput"),
  inventoryMoveLiveDate: document.querySelector("#inventoryMoveLiveDate"),
  inventoryMoveLiveTime: document.querySelector("#inventoryMoveLiveTime"),
  inventoryMoveCount: document.querySelector("#inventoryMoveCount"),
  refreshInventoryMoveButton: document.querySelector("#refreshInventoryMoveButton"),
  inventoryMoveListPanel: document.querySelector("#inventoryMoveListPanel"),
  openInventoryScannerButton: document.querySelector("#openInventoryScannerButton"),
  confirmModal: document.querySelector("#confirmModal"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmProductName: document.querySelector("#confirmProductName"),
  confirmMetaList: document.querySelector("#confirmMetaList"),
  cancelConfirmButton: document.querySelector("#cancelConfirmButton"),
  acceptConfirmButton: document.querySelector("#acceptConfirmButton"),
  scannerScreen: document.querySelector("#scannerScreen"),
  scannerCamera: document.querySelector("#scannerCamera"),
  scannerTitle: document.querySelector("#scannerTitle"),
  scannerTip: document.querySelector("#scannerTip"),
  scannerVideo: document.querySelector("#scannerVideo"),
  hardwareScannerPanel: document.querySelector("#hardwareScannerPanel"),
  hardwareScannerStatus: document.querySelector("#hardwareScannerStatus"),
  scannerHelpText: document.querySelector("#scannerHelpText"),
  scannerListPanel: document.querySelector("#scannerListPanel"),
  scannerSheetHandle: document.querySelector("#scannerSheetHandle"),
  scannerScannedCount: document.querySelector("#scannerScannedCount"),
  scannerScannedList: document.querySelector("#scannerScannedList"),
  closeScannerButton: document.querySelector("#closeScannerButton"),
  toggleFlashButton: document.querySelector("#toggleFlashButton"),
  albumQrButton: document.querySelector("#albumQrButton"),
  scannerModeToggleButton: document.querySelector("#scannerModeToggleButton"),
  scannerPendingButton: document.querySelector("#scannerPendingButton"),
  scannerDoneButton: document.querySelector("#scannerDoneButton"),
  toast: document.querySelector("#mobileToast")
};

initializeMobileApp();

function initializeMobileApp() {
  renderShippingSortMenu();
  bindEvents();
  updateShippingClock();
  const loginPreferences = restoreLoginPreferences();

  const savedSession = readSavedSession(loginPreferences);
  if (savedSession) {
    state.user = savedSession;
    state.scannedShippingRows = readSavedScannedRows();
    state.scannedMoveRows = readSavedMoveRows();
    restoreCachedDashboard();
    restoreSavedRoute();
    return;
  }

  showScreen("login");
}

function bindEvents() {
  elements.loginForm?.addEventListener("submit", handleAdminLogin);
  elements.togglePassword?.addEventListener("click", togglePassword);
  elements.saveAccount?.addEventListener("change", handleLoginPreferenceChange);
  elements.savePassword?.addEventListener("change", handleLoginPreferenceChange);
  elements.autoLogin?.addEventListener("change", handleLoginPreferenceChange);
  elements.logoutButton?.addEventListener("click", logout);
  elements.refreshShippingButton?.addEventListener("click", handleRefreshShipping);
  elements.showCompletedShippingToggle?.addEventListener("click", toggleCompletedShippingBoxes);
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
  elements.openManualShippingButton?.addEventListener("click", openManualShippingPicker);
  elements.closeManualShippingButton?.addEventListener("click", closeManualShippingPicker);
  elements.manualShippingSearchInput?.addEventListener("input", (event) => {
    state.manualShippingQuery = event.target.value.trim().toLowerCase();
    renderManualShippingProducts();
  });
  elements.manualShippingProductList?.addEventListener("click", handleManualShippingProductClick);
  elements.closeShippingBoxPickerButton?.addEventListener("click", closeShippingBoxPicker);
  elements.cancelShippingBoxPickerButton?.addEventListener("click", closeShippingBoxPicker);
  elements.boxPickerBoxList?.addEventListener("change", handleBoxPickerBoxChange);
  elements.boxPickerSelectAll?.addEventListener("change", handleBoxPickerSelectAll);
  elements.confirmShippingBoxPickerButton?.addEventListener("click", updateSelectedShippingBoxes);
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
  elements.scannerModeToggleButton?.addEventListener("click", toggleScannerInputMode);
  elements.scannerScannedList?.addEventListener("click", handleScannerListClick);
  elements.scannerScannedList?.addEventListener("change", handleScannerListChange);
  elements.scannerPendingButton?.addEventListener("click", handleScannerPendingAction);
  elements.scannerDoneButton?.addEventListener("click", handleScannerDoneAction);
  elements.toggleFlashButton?.addEventListener("click", () => {
    showToast("플래시는 기기 지원 여부 확인 후 연결합니다.");
  });
  elements.cancelConfirmButton?.addEventListener("click", closeConfirmModal);
  elements.acceptConfirmButton?.addEventListener("click", handleConfirmShipping);
  bindScannerSheetEvents();
  document.addEventListener("keydown", handleHardwareScannerKeydown);
  document.addEventListener("paste", handleHardwareScannerPaste);
  document.addEventListener("visibilitychange", handlePageVisibilityChange);
  document.addEventListener("click", closeShippingSortMenu);
  window.addEventListener("pagehide", releaseScannerStream);

  document.querySelectorAll("[data-mobile-route]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.mobileRoute));
  });

  elements.shippingListPanel?.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-mobile-shipping-add]");
    if (addButton) {
      const item = state.filteredRows.find((row) => getShippingKey(row) === addButton.dataset.mobileShippingAdd);
      if (item) {
        openShippingBoxAdder(item);
      }
      return;
    }

    const editButton = event.target.closest("[data-mobile-shipping-edit]");
    if (editButton) {
      const item = state.filteredRows.find((row) => getShippingKey(row) === editButton.dataset.mobileShippingEdit);
      if (item) {
        openShippingBoxEditor(item);
      }
      return;
    }

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
      if (action === "complete") {
        openShippingCompletionPicker(item);
      } else {
        openConfirmModal(item, action);
      }
    }
  });

  elements.inventoryMoveListPanel?.addEventListener("click", handleInventoryMoveListClick);
  elements.inventoryMoveListPanel?.addEventListener("change", handleInventoryMoveListChange);

  elements.confirmModal?.addEventListener("click", (event) => {
    if (event.target === elements.confirmModal) {
      closeConfirmModal();
    }
  });
  elements.shippingBoxPickerModal?.addEventListener("click", (event) => {
    if (event.target === elements.shippingBoxPickerModal) {
      closeShippingBoxPicker();
    }
  });
  elements.manualShippingModal?.addEventListener("click", (event) => {
    if (event.target === elements.manualShippingModal) {
      closeManualShippingPicker();
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

function handleAdminLogin(event) {
  event.preventDefault();
  attemptAdminLogin();
}

async function attemptAdminLogin() {
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
    saveLoginPreferences({ accountId, password });
    saveSession(loginResult.user);
    if (!state.scannedShippingRows.length) {
      state.scannedShippingRows = readSavedScannedRows();
    }
    if (!state.scannedMoveRows.length) {
      state.scannedMoveRows = readSavedMoveRows();
    }
    restoreCachedDashboard();
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

function handleLoginPreferenceChange(event) {
  if (event.target === elements.autoLogin && elements.autoLogin.checked) {
    elements.saveAccount.checked = true;
    elements.savePassword.checked = true;
  }

  if (event.target === elements.savePassword && elements.savePassword.checked) {
    elements.saveAccount.checked = true;
  }

  if (event.target === elements.saveAccount && !elements.saveAccount.checked) {
    elements.savePassword.checked = false;
    elements.autoLogin.checked = false;
  }

  if (event.target === elements.savePassword && !elements.savePassword.checked) {
    elements.autoLogin.checked = false;
  }

  saveLoginPreferences();
}

function logout() {
  releaseScannerStream();
  sessionStorage.removeItem(SESSION_KEY);
  try {
    localStorage.removeItem(PERSISTENT_SESSION_KEY);
  } catch (error) {
    // Private browsing or device policy can block persistent storage.
  }
  sessionStorage.removeItem(ROUTE_KEY);
  sessionStorage.removeItem(SCANNED_ROWS_KEY);
  sessionStorage.removeItem(MOVE_ROWS_KEY);
  clearPersistentMobileData();
  state.user = null;
  state.dashboard = [];
  state.dashboardLoadedAt = 0;
  state.dashboardLoadPromise = null;
  state.filteredRows = [];
  state.scannedShippingRows = [];
  state.scannedMoveRows = [];
  if (elements.autoLogin) {
    elements.autoLogin.checked = false;
    saveLoginPreferences();
  }
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
  void refreshDashboardInBackground();
}

function showShipping() {
  state.activeWorkflow = "shipping";
  showScreen("shipping");
  startShippingClock();
  applyShippingFilters();
  void refreshDashboardInBackground();
}

function showInventoryMove() {
  state.activeWorkflow = "inventoryMove";
  showScreen("inventoryMove");
  startShippingClock();
  if (state.dashboard.length) {
    syncScannedMoveRowsFromDashboard();
  }
  renderInventoryMoveList();
  void refreshDashboardInBackground();
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
    stopShippingClock();
    if (!state.scannerCameraRequestPending) {
      releaseScannerStream();
    }
    return;
  }

  if (elements.shippingScreen?.classList.contains("active") || elements.inventoryMoveScreen?.classList.contains("active")) {
    startShippingClock();
  }

  if (!elements.scannerScreen?.hidden
    && state.scannerInputMode === "camera"
    && !getReusableScannerStream()) {
    void startScannerCamera();
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
  if (state.dashboardLoadPromise) {
    return state.dashboardLoadPromise;
  }

  if (!options.silent && !state.scannedShippingRows.length) {
    renderShippingLoading();
  }

  const loadPromise = (async () => {
    try {
      const data = await requestApi("getInventoryDashboard");
      state.dashboard = Array.isArray(data?.rows) ? data.rows : [];
      state.dashboardLoadedAt = Date.now();
      syncPendingShippingRowsFromDashboard();
      syncScannedMoveRowsFromDashboard();
      applyShippingFilters();
      saveDashboardCache();
      return true;
    } catch (error) {
      if (options.silent) {
        if (!options.suppressToast) {
          showToast(error.message || "출고 목록을 불러오지 못했습니다.");
        }
        return false;
      }
      renderShippingError(error.message || "출고 목록을 불러오지 못했습니다.");
      return false;
    }
  })();

  state.dashboardLoadPromise = loadPromise;
  try {
    return await loadPromise;
  } finally {
    if (state.dashboardLoadPromise === loadPromise) {
      state.dashboardLoadPromise = null;
    }
  }
}

async function refreshDashboardInBackground() {
  const cacheAge = Date.now() - state.dashboardLoadedAt;
  if (state.dashboard.length && cacheAge >= 0 && cacheAge < DASHBOARD_BACKGROUND_REFRESH_MS) {
    return true;
  }

  const shippingActive = elements.shippingScreen?.classList.contains("active");
  const inventoryMoveActive = elements.inventoryMoveScreen?.classList.contains("active");
  if (shippingActive) {
    elements.refreshShippingButton?.classList.add("is-loading");
  }
  if (inventoryMoveActive) {
    elements.refreshInventoryMoveButton?.classList.add("is-loading");
  }

  try {
    const refreshed = await loadShippingDashboard({ silent: true, suppressToast: true });
    if (inventoryMoveActive) {
      renderInventoryMoveList();
    }
    return refreshed;
  } finally {
    if (shippingActive) {
      elements.refreshShippingButton?.classList.remove("is-loading");
    }
    if (inventoryMoveActive) {
      elements.refreshInventoryMoveButton?.classList.remove("is-loading");
    }
  }
}

function applyShippingFilters() {
  const query = state.query;
  const rows = groupScannedShippingRows(state.scannedShippingRows
    .filter((row) => {
      if (!state.showCompletedShippingBoxes && isCompletedShippingItem(row)) {
        return false;
      }

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

function toggleCompletedShippingBoxes() {
  state.showCompletedShippingBoxes = !state.showCompletedShippingBoxes;
  renderCompletedShippingToggle();
  applyShippingFilters();
}

function renderCompletedShippingToggle() {
  if (!elements.showCompletedShippingToggle) {
    return;
  }

  const isActive = state.showCompletedShippingBoxes;
  elements.showCompletedShippingToggle.setAttribute("aria-pressed", String(isActive));
  elements.showCompletedShippingToggle.setAttribute("aria-label", isActive ? "출고완료 박스 숨기기" : "출고완료 박스 보기");
  elements.showCompletedShippingToggle.title = isActive ? "출고완료 박스 숨기기" : "출고완료 박스 보기";
  elements.showCompletedShippingToggle.classList.toggle("active", isActive);
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

    return parseNumber(a.scanOrder) - parseNumber(b.scanOrder);
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

  rows.forEach((row, index) => {
    const key = getShippingProductGroupKey(row);
    const registeredAt = normalizeText(row.registeredAt);
    if (!groups.has(key)) {
      groups.set(key, {
        ...row,
        registeredAt,
        productGroupKey: key,
        scannedItems: [],
        scannedBoxes: [],
        scannedBoxCount: 0,
        scannedTotalQuantity: 0,
        scannedCurrentQuantity: 0,
        scanOrder: index
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
    group.registeredAt = getLatestRegistrationDate(group.registeredAt, registeredAt);
  });

  return Array.from(groups.values());
}

function groupShippingRowsByProductFamily(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = getShippingDisplayGroupKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        clientName: row.clientName,
        productName: row.productName,
        productId: row.productId,
        finalProcess: row.finalProcess,
        items: []
      });
    }

    groups.get(key).items.push(row);
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
        targetStorage: row.targetStorageConfirmed === true ? row.targetStorage : "",
        targetStorageConfirmed: row.targetStorageConfirmed === true
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
    const hasHiddenCompletedBoxes = !state.showCompletedShippingBoxes
      && state.scannedShippingRows.some(isCompletedShippingItem);
    elements.shippingListPanel.innerHTML = `
      <div class="empty-state">
        <div>
          <span class="empty-state-icon" aria-hidden="true">
            <img src="${SHIPPING_BOX_ICON_SRC}" alt="" />
          </span>
          <h2>${hasHiddenCompletedBoxes ? "출고할 박스가 없습니다" : "등록된 제품이 없습니다"}</h2>
          <p>${hasHiddenCompletedBoxes ? "출고완료 박스는 현재 숨겨져 있습니다." : "출고할 제품을 등록해 주세요."}</p>
          <div class="empty-shipping-actions">
            ${hasHiddenCompletedBoxes
              ? '<button class="primary-action" type="button" id="emptyShowCompletedButton">완료 박스 보기</button>'
              : '<button class="primary-action" type="button" id="emptyScanButton">QR 스캔</button>'}
          </div>
        </div>
      </div>
    `;
    document.querySelector("#emptyScanButton")?.addEventListener("click", openScanner);
    document.querySelector("#emptyShowCompletedButton")?.addEventListener("click", toggleCompletedShippingBoxes);
    return;
  }

  const productGroups = groupShippingRowsByProductFamily(rows);
  elements.shippingListPanel.innerHTML = productGroups.map(renderShippingProductGroup).join("");
}

function renderShippingProductGroup(group) {
  return `
    <section class="shipping-product-group" data-shipping-product-group="${escapeHtml(group.key)}">
      <header class="shipping-product-group-header">
        <div class="shipping-product-group-copy">
          <span>${escapeHtml(normalizeDisplay(group.clientName || "-"))}</span>
          <h2>${escapeHtml(normalizeDisplay(group.productName || "-"))}</h2>
        </div>
      </header>
      <div class="shipping-product-group-items">
        ${group.items.map(renderShippingItem).join("")}
      </div>
    </section>
  `;
}

async function openShippingBoxEditor(item) {
  return openShippingBoxPicker(item, "edit");
}

async function openShippingBoxAdder(item) {
  return openShippingBoxPicker(item, "add");
}

async function openManualShippingPicker() {
  if (!elements.manualShippingModal) {
    return;
  }

  state.manualShippingQuery = "";
  elements.manualShippingSearchInput.value = "";
  elements.manualShippingModal.hidden = false;
  document.body.classList.add("modal-open");
  elements.manualShippingProductList.innerHTML = '<p class="box-picker-empty">제품 정보를 불러오는 중입니다.</p>';

  try {
    await ensureDashboardLoaded();
  } catch (error) {
    elements.manualShippingProductList.innerHTML = '<p class="box-picker-empty">제품 정보를 불러오지 못했습니다.</p>';
    return;
  }

  renderManualShippingProducts();
  window.setTimeout(() => elements.manualShippingSearchInput?.focus(), 0);
}

function closeManualShippingPicker() {
  if (!elements.manualShippingModal) {
    return;
  }

  elements.manualShippingModal.hidden = true;
  state.manualShippingQuery = "";
  document.body.classList.remove("modal-open");
}

function getManualShippingProducts() {
  return state.dashboard
    .filter(hasManualShippingBoxes)
    .filter((row) => {
      if (!state.manualShippingQuery) {
        return true;
      }
      return normalizeDisplay(row.productName || "").toLowerCase().includes(state.manualShippingQuery);
    })
    .sort((left, right) => compareShippingText(left.productName, right.productName));
}

function renderManualShippingProducts() {
  if (!elements.manualShippingProductList) {
    return;
  }

  const rows = getManualShippingProducts();
  elements.manualShippingProductList.innerHTML = rows.length ? rows.map((row) => {
    const key = getShippingProductGroupKey(row);
    const totalBoxCount = getShippingTotalBoxCount(row);
    const inboundDate = formatManualShippingInboundDate(row.inboundDate);
    return `
      <button class="box-picker-product-button manual-shipping-product-button" type="button" data-manual-shipping-product="${escapeHtml(key)}">
        <span class="manual-shipping-product-copy">
          <strong>${escapeHtml(normalizeDisplay(row.productName || "-"))}</strong>
          <small>입고일 ${escapeHtml(inboundDate)}</small>
        </span>
        <b>최초 총 ${formatNumber(totalBoxCount)}박스</b>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>
      </button>
    `;
  }).join("") : '<p class="box-picker-empty">출고 가능한 제품이 없습니다.</p>';
}

function handleManualShippingProductClick(event) {
  const button = event.target.closest("[data-manual-shipping-product]");
  if (!button) {
    return;
  }

  const item = state.dashboard.find((row) => getShippingProductGroupKey(row) === button.dataset.manualShippingProduct);
  if (!item) {
    showToast("선택한 제품 정보를 찾지 못했습니다.");
    return;
  }

  closeManualShippingPicker();
  openShippingBoxPicker(item, "add", "manual");
}

async function openShippingBoxPicker(item, mode = "edit", source = "card") {
  if (!elements.shippingBoxPickerModal) {
    return;
  }

  state.boxPickerProduct = null;
  state.boxPickerEditingGroupKey = getShippingProductGroupKey(item);
  state.boxPickerMode = mode;
  state.boxPickerSource = source;
  elements.shippingBoxPickerModal.hidden = false;
  document.body.classList.add("modal-open");
  const isAddMode = mode === "add";
  elements.shippingBoxPickerTitle.textContent = isAddMode ? "박스 추가" : "박스 수정";
  elements.boxPickerSectionTitle.textContent = isAddMode ? "추가할 박스 선택" : "이번 출고 박스";
  elements.boxPickerSectionDescription.textContent = isAddMode
    ? "보관 중인 박스를 선택해 출고 등록 목록에 추가해주세요."
    : "출고할 박스를 선택하거나 선택 해제해주세요.";
  elements.boxPickerClientName.textContent = normalizeDisplay(item.clientName || "-");
  elements.boxPickerProductName.textContent = normalizeDisplay(item.productName || "-");
  elements.boxPickerProductMeta.textContent = source === "manual"
    ? `최초 총 ${formatNumber(getShippingTotalBoxCount(item))}박스`
    : [item.finalProcess, item.batch, item.storage]
      .map(normalizeDisplay)
      .filter((value) => value !== "-")
      .join(" · ") || "-";
  elements.boxPickerBoxList.innerHTML = '<p class="box-picker-empty">박스 정보를 불러오는 중입니다.</p>';
  elements.confirmShippingBoxPickerButton.disabled = true;
  elements.confirmShippingBoxPickerButton.textContent = "불러오는 중";

  try {
    await ensureDashboardLoaded();
    const product = findBoxPickerProduct(item);
    if (!product) {
      throw new Error("수정할 제품 정보를 찾지 못했습니다.");
    }
    state.boxPickerProduct = product;
    renderBoxPickerBoxes();
  } catch (error) {
    elements.boxPickerBoxList.innerHTML = `<p class="box-picker-empty">${escapeHtml(error.message || "박스 정보를 불러오지 못했습니다.")}</p>`;
  }
}

function openShippingCompletionPicker(item) {
  if (!elements.shippingBoxPickerModal) {
    return;
  }

  const targetItems = getShippingCompletionPickerItems(item);
  if (!targetItems.length) {
    showToast("출고할 수 있는 출고대기 박스가 없습니다.");
    return;
  }

  const groupedItem = groupScannedShippingRows(targetItems)[0] || targetItems[0];
  state.boxPickerProduct = groupedItem;
  state.boxPickerEditingGroupKey = getShippingProductGroupKey(groupedItem);
  state.boxPickerTargetItems = targetItems;
  state.boxPickerMode = "complete";
  state.boxPickerSource = "shippingConfirm";

  elements.shippingBoxPickerModal.hidden = false;
  document.body.classList.add("modal-open");
  elements.shippingBoxPickerTitle.textContent = "출고 박스 확인";
  elements.boxPickerSectionTitle.textContent = "이번 출고 박스";
  elements.boxPickerSectionDescription.textContent = "출고하지 않을 박스는 체크를 해제해주세요. 선택한 박스만 출고됩니다.";
  elements.boxPickerClientName.textContent = normalizeDisplay(groupedItem.clientName || "-");
  elements.boxPickerProductName.textContent = normalizeDisplay(groupedItem.productName || "-");
  elements.boxPickerProductMeta.textContent = `출고대기 ${formatNumber(targetItems.length)}박스`;
  renderBoxPickerBoxes();
}

function getShippingCompletionPickerItems(item) {
  let items = Array.isArray(item?.scannedItems) ? item.scannedItems : [item];

  if (items.length === 1 && !getScannedBox(items[0])) {
    items = getKnownBoxes(item).map((box) => buildScannedBoxItem(item, box, {
      boxId: normalizeScanValue(box?.boxId || box?.id || box?.qrId),
      managementId: normalizeScanValue(item.managementId),
      productId: normalizeScanValue(item.productId),
      boxNumber: String(box?.number || box?.sequence || "").trim()
    }, box?.boxId || box?.number || box?.sequence || ""));
  }

  const pendingItems = items.filter(isShippingItemPending);
  return (pendingItems.length ? pendingItems : items.filter((row) => !isCompletedShippingItem(row)))
    .filter((row) => getScannedBox(row));
}

function closeShippingBoxPicker() {
  if (!elements.shippingBoxPickerModal) {
    return;
  }

  elements.shippingBoxPickerModal.hidden = true;
  state.boxPickerProduct = null;
  state.boxPickerEditingGroupKey = "";
  state.boxPickerTargetItems = [];
  state.boxPickerMode = "edit";
  state.boxPickerSource = "card";
  document.body.classList.remove("modal-open");
}

function findBoxPickerProduct(item) {
  const productKey = getShippingProductGroupKey(item);
  return state.dashboard.find((row) => getShippingProductGroupKey(row) === productKey)
    || state.dashboard.find((row) => {
      return normalizeScanValue(row.managementId) === normalizeScanValue(item.managementId)
        && normalizeScanValue(row.productId) === normalizeScanValue(item.productId);
    });
}

function getAddedShippingBoxKeys(row) {
  const productKey = getShippingProductGroupKey(row);
  return new Set(state.scannedShippingRows
    .filter((item) => getShippingProductGroupKey(item) === productKey)
    .map(getShippingCompositeBoxKey)
    .filter(Boolean));
}

function getBoxPickerBoxKey(box, row) {
  const managementKey = normalizeScanValue(row?.managementId || row?.productId || row?.productName) || "-";
  const boxKey = normalizeScanValue(box?.boxId || box?.id || box?.qrId || box?.number || box?.sequence || "");
  return boxKey ? `${managementKey}::${boxKey}` : "";
}

function getShippingCompositeBoxKey(item) {
  const box = getScannedBox(item);
  return getBoxPickerBoxKey(box, item);
}

function renderBoxPickerBoxes() {
  const row = state.boxPickerProduct;
  if (!row || !elements.boxPickerBoxList) {
    return;
  }

  const isCompletionMode = state.boxPickerMode === "complete";
  const boxes = (isCompletionMode
    ? state.boxPickerTargetItems.map(getScannedBox).filter(Boolean)
    : getKnownBoxes(row).filter((box) => (
      state.boxPickerSource !== "manual" || isManualShippingBoxAvailable(box, row)
    )))
    .sort((left, right) => parseNumber(left?.number || left?.sequence) - parseNumber(right?.number || right?.sequence));
  const addedKeys = getAddedShippingBoxKeys(row);
  const isAddMode = state.boxPickerMode === "add";

  const clientName = normalizeDisplay(row.clientName || "-");
  elements.boxPickerClientName.textContent = state.boxPickerSource === "manual"
    ? `${clientName} · 입고일 ${formatManualShippingInboundDate(row.inboundDate)}`
    : clientName;
  elements.boxPickerProductName.textContent = normalizeDisplay(row.productName || "-");
  elements.boxPickerProductMeta.textContent = isCompletionMode
    ? `출고대기 ${formatNumber(boxes.length)}박스`
    : state.boxPickerSource === "manual"
    ? `최초 총 ${formatNumber(getShippingTotalBoxCount(row))}박스`
    : [row.finalProcess, row.batch, row.storage]
      .map(normalizeDisplay)
      .filter((value) => value !== "-")
      .join(" · ") || "-";

  elements.boxPickerBoxList.innerHTML = boxes.length ? boxes.map((box) => {
    const key = getBoxPickerBoxKey(box, row);
    const number = normalizeDisplay(box?.number || box?.sequence || "-");
    const quantity = getBoxCurrentQuantity(box, row);
    const status = normalizeText(box?.rawStatus || box?.status);
    const isCompleted = /출고완료|폐기/.test(status) || quantity <= 0;
    const isAdded = addedKeys.has(key);
    const isChecked = isCompletionMode || isAdded;
    const isDisabled = isCompletionMode ? false : isCompleted || (isAddMode && isAdded);
    const statusLabel = isCompletionMode
      ? "출고 선택"
      : isAdded
      ? (isAddMode ? "등록됨" : "선택됨")
      : isCompleted ? (status.includes("폐기") ? "폐기" : "출고완료") : normalizeDisplay(box?.status || "보관");

    return `
      <label class="box-picker-check-card${isDisabled ? " disabled" : ""}">
        <input type="checkbox" data-box-picker-box="${escapeHtml(key)}" data-box-status="${escapeHtml(normalizeDisplay(box?.status || "보관"))}" ${isChecked ? "checked" : ""} ${isDisabled ? "disabled" : ""} />
        <span class="box-picker-check-copy">
          <strong>${escapeHtml(number)}번 박스</strong>
          <small>${state.boxPickerSource === "manual"
            ? `${formatNumber(quantity)} ea`
            : `${escapeHtml(normalizeDisplay(box?.storage || row.storage || "미지정"))} · ${formatNumber(quantity)} ea`}</small>
          <span class="box-picker-quantity-field">
            <input type="number" min="1" step="1" inputmode="numeric" value="${quantity}" data-box-picker-quantity="${escapeHtml(key)}" aria-label="${escapeHtml(number)}번 박스 수량" ${isCompletionMode ? "readonly" : isDisabled ? "disabled" : ""} />
            <em>ea</em>
          </span>
        </span>
        <b>${escapeHtml(statusLabel)}</b>
      </label>
    `;
  }).join("") : '<p class="box-picker-empty">등록된 박스가 없습니다.</p>';

  syncBoxPickerSelection();
}

function handleBoxPickerBoxChange(event) {
  if (!event.target.matches("[data-box-picker-box], [data-box-picker-quantity]")) {
    return;
  }
  syncBoxPickerSelection();
}

function handleBoxPickerSelectAll() {
  const checked = elements.boxPickerSelectAll.checked;
  elements.boxPickerBoxList.querySelectorAll("[data-box-picker-box]:not(:disabled)")
    .forEach((input) => {
      input.checked = checked;
    });
  syncBoxPickerSelection();
}

function syncBoxPickerSelection() {
  const checkboxes = Array.from(elements.boxPickerBoxList?.querySelectorAll("[data-box-picker-box]") || []);
  checkboxes.forEach((input) => {
    const card = input.closest(".box-picker-check-card");
    card?.classList.toggle("selected", input.checked);
    if (!input.disabled) {
      const status = card?.querySelector("b");
      if (status) {
        status.textContent = state.boxPickerMode === "complete"
          ? (input.checked ? "출고 선택" : "출고 제외")
          : input.checked ? "선택됨" : input.dataset.boxStatus || "보관";
      }
    }
  });
  const selectable = checkboxes.filter((input) => !input.disabled);
  const selected = selectable.filter((input) => input.checked);
  elements.boxPickerSelectedCount.textContent = String(selected.length);
  elements.confirmShippingBoxPickerButton.disabled = state.boxPickerMode === "complete" && selected.length === 0;
  elements.confirmShippingBoxPickerButton.textContent = state.boxPickerMode === "complete"
    ? "선택 박스 출고"
    : state.boxPickerMode === "add" ? "선택 박스 추가" : "수정 완료";
  elements.boxPickerSelectAll.disabled = selectable.length === 0;
  elements.boxPickerSelectAll.checked = selectable.length > 0 && selected.length === selectable.length;
  elements.boxPickerSelectAll.indeterminate = selected.length > 0 && selected.length < selectable.length;
}

function updateSelectedShippingBoxes() {
  const row = state.boxPickerProduct;
  if (!row) {
    return;
  }

  const selectedInputs = Array.from(elements.boxPickerBoxList.querySelectorAll("[data-box-picker-box]:checked:not(:disabled)"));
  const isAddMode = state.boxPickerMode === "add";
  const isCompletionMode = state.boxPickerMode === "complete";

  if (isCompletionMode) {
    if (!selectedInputs.length) {
      showToast("출고할 박스를 한 개 이상 선택해주세요.");
      return;
    }

    const selectedKeys = new Set(selectedInputs.map((input) => input.dataset.boxPickerBox));
    const targetItems = state.boxPickerTargetItems.filter((item) => selectedKeys.has(getShippingCompositeBoxKey(item)));
    if (!targetItems.length) {
      showToast("선택한 출고대기 박스를 찾지 못했습니다.");
      return;
    }

    const groupedItem = groupScannedShippingRows(targetItems)[0] || targetItems[0];
    closeShippingBoxPicker();
    openConfirmModal(groupedItem, "complete");
    return;
  }

  if (isAddMode && !selectedInputs.length) {
    showToast("추가할 박스를 선택해주세요.");
    return;
  }

  const invalidQuantityInput = selectedInputs
    .map((input) => findBoxPickerQuantityInput(input.dataset.boxPickerBox))
    .find((input) => !input || parseNumber(input.value) < 1);
  if (invalidQuantityInput) {
    showToast("선택한 박스의 수량을 1개 이상 입력해주세요.");
    invalidQuantityInput?.focus();
    return;
  }

  const boxes = getKnownBoxes(row);
  const selectedRows = [];
  selectedInputs.forEach((input) => {
    const key = input.dataset.boxPickerBox;
    const box = boxes.find((candidate) => getBoxPickerBoxKey(candidate, row) === key);
    if (!box) {
      return;
    }

    const number = String(box?.number || box?.sequence || "").trim();
    const boxId = normalizeScanValue(box?.boxId || box?.id || box?.qrId);
    const quantityInput = findBoxPickerQuantityInput(key);
    const quantity = parseNumber(quantityInput.value);
    const item = buildScannedBoxItem(row, { ...box }, {
      boxId,
      managementId: normalizeScanValue(row.managementId),
      productId: normalizeScanValue(row.productId),
      boxNumber: number
    }, `manual:${boxId || number}`);
    setScannedBoxQuantity(item, quantity);
    selectedRows.push(item);
  });

  if (isAddMode) {
    const existingBoxKeys = new Set(state.scannedShippingRows.map(getShippingCompositeBoxKey).filter(Boolean));
    const rowsToAdd = selectedRows.filter((item) => !existingBoxKeys.has(getShippingCompositeBoxKey(item)));
    state.scannedShippingRows = [...state.scannedShippingRows, ...rowsToAdd];
  } else {
    const editingKey = state.boxPickerEditingGroupKey || getShippingProductGroupKey(row);
    const editingRows = state.scannedShippingRows.filter((item) => getShippingProductGroupKey(item) === editingKey);
    const editingBoxKeys = new Set(editingRows.map(getShippingKey));
    const otherRows = state.scannedShippingRows.filter((item) => getShippingProductGroupKey(item) !== editingKey);
    state.scannedShippingRows = [...selectedRows, ...otherRows];
    state.scannerSessionShippingKeys = state.scannerSessionShippingKeys.filter((key) => !editingBoxKeys.has(key));
  }
  saveScannedShippingRows();
  state.query = "";
  elements.shippingSearchInput.value = "";
  applyShippingFilters();
  closeShippingBoxPicker();
  triggerScanFeedback(SCAN_SUCCESS_VIBRATION);
  showToast(isAddMode
    ? (selectedRows.length ? `${selectedRows.length}개 박스를 출고 등록 목록에 추가했습니다.` : "추가할 박스를 선택해주세요.")
    : (selectedRows.length ? `${selectedRows.length}개 박스로 수정했습니다.` : "제품을 출고 등록 목록에서 제외했습니다."));
}

function findBoxPickerQuantityInput(key) {
  return Array.from(elements.boxPickerBoxList?.querySelectorAll("[data-box-picker-quantity]") || [])
    .find((input) => input.dataset.boxPickerQuantity === key) || null;
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
          <button class="primary-action" type="button" id="emptyInventoryScanButton">QR 스캔</button>
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
  const targetStorage = item.targetStorageConfirmed === true ? item.targetStorage : "";
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
      <p class="item-worker"><span>등록자</span>${escapeHtml(normalizeDisplay(state.user?.name || item.registrant || item.inspector || "-"))}</p>
      <div class="inventory-storage-grid">
        <span class="storage-card">
          <small>현재 보관 장소</small>
          <strong>${escapeHtml(normalizeDisplay(currentStorage))}</strong>
        </span>
        <label class="storage-card storage-select-card">
          <small>이동할 장소</small>
          <select class="inventory-storage-select" data-inventory-move-storage="${escapeHtml(key)}">
            ${renderStorageOptions(targetStorage, currentStorage)}
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

function renderStorageOptions(selectedStorage, currentStorage = "") {
  const selected = normalizeDisplay(selectedStorage) === "-" ? "" : normalizeDisplay(selectedStorage);
  const current = normalizeDisplay(currentStorage);
  const availableOptions = INVENTORY_STORAGE_OPTIONS.filter((storage) => storage !== current);
  const options = !selected || availableOptions.includes(selected) ? availableOptions : [selected, ...availableOptions];
  return `
    <option value="" ${selected ? "" : "selected"} disabled>이동 장소 선택</option>
    ${options.map((storage) => `
    <option value="${escapeHtml(storage)}" ${storage === selected ? "selected" : ""}>${escapeHtml(storage)}</option>
    `).join("")}
  `;
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

  elements.scannerScannedList.querySelectorAll("[data-scanner-move-storage]").forEach((candidate) => {
    if (candidate.dataset.scannerMoveStorage === select.dataset.scannerMoveStorage) {
      candidate.value = select.value;
    }
  });
  saveScannedMoveRows();
}

async function handleInventoryMoveCardAction(item, mode = "single") {
  const currentStorage = getInventoryMoveCurrentStorage(item);
  const targetStorage = item.targetStorageConfirmed === true ? normalizeDisplay(item.targetStorage) : "-";
  const selectedBoxes = mode === "all" ? getInventoryMoveAllBoxNumbers(item) : getSelectedBoxNumbers(item);
  const actionLabel = mode === "all" ? "전량 이동" : "자리이동";

  if (!selectedBoxes.length) {
    showToast("이동할 박스 번호가 없습니다.");
    return;
  }

  if (!isInventoryMoveTargetReady(item)) {
    showToast("이동할 장소를 먼저 선택해주세요.");
    return;
  }

  const ok = window.confirm(`${normalizeDisplay(item.productName)}\n${normalizeDisplay(currentStorage)} → ${targetStorage}\n${formatNumber(selectedBoxes.length)}개 박스를 ${actionLabel} 처리하시겠습니까?`);
  if (!ok) {
    return;
  }

  try {
    const result = await completeInventoryMoveItem(item, selectedBoxes, mode);
    applyInventoryMoveResultLocally(item, selectedBoxes, targetStorage, mode, result);
    if (mode === "all") {
      removeMovedInventoryGroup(item);
    } else {
      removeScannedMoveGroup(getInventoryMoveKey(item));
    }
    renderInventoryMoveList();
    showToast(`${actionLabel}이 완료되었습니다.`);
    void loadShippingDashboard({ silent: true });
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
  const boxLabel = isProductGroup ? `${formatNumber(boxCount)}박스 등록` : getScannedBoxLabel(item);
  const isPending = isShippingItemPending(item);
  const isCompleted = isShippingItemCompleted(item);
  const metaParts = [batch, boxLabel].filter((value) => value && value !== "-");
  const processClass = /2|3/.test(process) ? "green" : "";
  const registeredAt = formatRegistrationDate(item.registeredAt);
  const productDetails = [
    ["관리 ID", normalizeDisplay(item.managementId || "-")],
    ["제품 ID", normalizeDisplay(item.productId || "-")],
    ["입고일", formatManualShippingInboundDate(item.inboundDate)],
    ["보관 장소", normalizeDisplay(item.storage || "-")],
    ["차수", batch],
    ["최종공정", process],
    ["박스당 수량", normalizeDisplay(item.boxQuantity || "-")],
    ["재고 상태", normalizeDisplay(item.stockStatus || item.processStatus || "-")]
  ];

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
            <small class="shipping-management-id">${escapeHtml(normalizeDisplay(item.managementId || item.productId || "-"))}</small>
          </div>
        </div>
        <div class="shipping-meta-stack">
          <span class="process-pill ${processClass}">${escapeHtml(process)}</span>
          ${metaParts.map((part) => `<span class="shipping-meta-pill">${escapeHtml(part)}</span>`).join("")}
          ${isCompleted
            ? '<span class="shipping-meta-pill shipping-complete-pill">출고완료</span>'
            : isPending ? '<span class="shipping-meta-pill">출고대기</span>' : ""}
        </div>
        <div class="shipping-card-actions">
          <button class="shipping-add-button" type="button" data-mobile-shipping-add="${escapeHtml(key)}" ${isCompleted ? "disabled" : ""}>박스 추가</button>
          <button class="shipping-remove-button" type="button" data-mobile-shipping-remove="${escapeHtml(key)}" ${isCompleted ? "disabled" : ""}>등록 취소</button>
          ${isCompleted
            ? `<button class="ship-pending-button" type="button" disabled>출고대기 등록</button>
              <button class="ship-now-button shipping-cancel-button" type="button" data-mobile-shipping="${escapeHtml(key)}" data-mobile-shipping-action="cancelCompleted">출고 취소</button>`
            : `
              <button class="ship-pending-button" type="button" data-mobile-shipping="${escapeHtml(key)}" data-mobile-shipping-action="${isPending ? "cancelPending" : "pending"}">${isPending ? "출고대기 취소" : "출고대기 등록"}</button>
              <button class="ship-now-button" type="button" data-mobile-shipping="${escapeHtml(key)}" data-mobile-shipping-action="complete">출고</button>
            `}
        </div>
      </div>
      <div class="item-registration-info">
        <p class="item-worker"><span>등록자</span>${escapeHtml(normalizeDisplay(item.registrant || item.inspector || "-"))}</p>
        <p class="item-registered-date"><span>등록일</span>${escapeHtml(registeredAt)}</p>
      </div>
      <div class="item-metrics">
        <span class="metric">
          <span class="metric-label">등록 박스</span>
          <span class="metric-value-row">
            <strong>${formatNumber(boxCount)}</strong>
            <small>Box</small>
          </span>
          <span class="metric-support-row">총 ${formatNumber(totalBoxCount)}박스</span>
        </span>
        <span class="metric">
          <span class="metric-label">출고 가능 수량</span>
          <span class="metric-value-row">
            <strong>${formatNumber(totalQuantity)}</strong>
            <small>ea</small>
          </span>
          <span class="metric-support-row" aria-hidden="true"></span>
        </span>
        <span class="metric">
          <span class="metric-label">현재 수량</span>
          <span class="metric-value-row">
            <strong class="blue">${formatNumber(currentQuantity)}</strong>
            <small>ea</small>
          </span>
          <span class="metric-action-row">
            ${isCompleted ? "" : `<button class="metric-quantity-button" type="button" data-mobile-shipping-quantity="${escapeHtml(key)}">수량 변경</button>`}
          </span>
        </span>
      </div>
      <details class="shipping-product-details">
        <summary>
          <span class="shipping-product-details-title">제품 상세정보</span>
          <svg class="shipping-product-details-chevron" viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4"></path>
          </svg>
        </summary>
        <div class="shipping-product-details-grid">
          ${productDetails.map(([label, value]) => `
            <div class="shipping-product-detail-item">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `).join("")}
        </div>
      </details>
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
  const isCancelPendingAction = action === "cancelPending";
  const isCancelCompletedAction = action === "cancelCompleted";
  if (elements.confirmMessage) {
    elements.confirmMessage.textContent = isCancelCompletedAction
      ? "해당 박스의 출고를 취소하고 보관 상태로 변경하시겠습니까?"
      : isCancelPendingAction
      ? "해당 박스의 출고대기를 취소하고 보관 상태로 변경하시겠습니까?"
      : isPendingAction
        ? "해당 제품을 출고대기로 등록하시겠습니까?"
        : "해당 제품을 출고 처리하시겠습니까?";
  }
  elements.acceptConfirmButton.textContent = isCancelCompletedAction ? "출고 취소" : isCancelPendingAction ? "출고대기 취소" : isPendingAction ? "출고대기 등록" : "출고";
  elements.confirmProductName.textContent = normalizeDisplay(item.productName);
  renderConfirmMeta(metaParts);
  elements.confirmModal.hidden = false;
}

function openScannedShippingConfirmModal(action = "complete") {
  if (state.isCompletingShipping) {
    return;
  }

  const items = getScannerSessionShippingRows();
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

  elements.confirmMetaList.classList.remove("inventory-move-confirm-routes");
  const values = parts
    .map((part) => normalizeDisplay(part))
    .filter((part) => part && part !== "-");

  elements.confirmMetaList.hidden = !values.length;
  elements.confirmMetaList.innerHTML = values
    .map((part) => `<span>${escapeHtml(part)}</span>`)
    .join("");
}

function closeConfirmModal() {
  const shouldResumeInventoryScanner = state.selectedConfirmMode === "inventoryMoveBatch"
    && !elements.scannerScreen?.hidden
    && state.scannerInputMode === "camera";
  state.selectedShippingItem = null;
  state.selectedShippingAction = "complete";
  state.selectedInventoryMoveMode = "single";
  state.selectedConfirmMode = "item";
  if (elements.confirmTitle) {
    elements.confirmTitle.textContent = "출고 확인";
  }
  renderConfirmMeta([]);
  elements.confirmModal.hidden = true;
  if (shouldResumeInventoryScanner) {
    window.requestAnimationFrame(() => {
      void startScannerCamera();
    });
  }
}

async function handleConfirmShipping() {
  if (state.selectedConfirmMode === "inventoryMoveBatch") {
    if (state.isCompletingShipping) {
      return;
    }

    const mode = state.selectedInventoryMoveMode || "single";
    elements.acceptConfirmButton.disabled = true;
    elements.acceptConfirmButton.textContent = "이동 중";
    try {
      await handleCompleteScannedInventoryMove(mode);
      closeConfirmModal();
    } finally {
      elements.acceptConfirmButton.disabled = false;
      elements.acceptConfirmButton.textContent = "확인";
    }
    return;
  }

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
  const groupedItems = Array.isArray(item.scannedItems) ? item.scannedItems : [item];
  const targetItems = groupedItems.filter((row) => {
    if (action === "cancelCompleted") {
      return isCompletedShippingItem(row);
    }
    if (action === "cancelPending") {
      return isShippingItemPending(row);
    }
    if (action === "pending") {
      return !isCompletedShippingItem(row) && !isShippingItemPending(row);
    }
    return !isCompletedShippingItem(row);
  });
  const selectedBoxes = targetItems.flatMap(getSelectedBoxNumbers);

  if (!selectedBoxes.length) {
    showToast(action === "cancelCompleted" ? "출고를 취소할 박스 번호가 없습니다." : action === "cancelPending" ? "출고대기를 취소할 박스 번호가 없습니다." : action === "pending" ? "출고대기로 등록할 박스 번호가 없습니다." : "출고 처리할 박스 번호가 없습니다.");
    closeConfirmModal();
    return;
  }

  state.isCompletingShipping = true;
  elements.acceptConfirmButton.disabled = true;
  elements.acceptConfirmButton.textContent = "처리 중";

  try {
    const result = await completeShippingItems(targetItems, action);
    const actionLabel = action === "cancelCompleted" ? "출고 취소" : action === "cancelPending" ? "출고대기 취소" : action === "pending" ? "출고대기 등록" : "출고";

    closeConfirmModal();
    if (result.completedCount > 0) {
      const failedSet = new Set(result.failedItems);
      if (action === "pending") {
        markShippingItemsPending(targetItems, result.failedItems);
      } else if (action === "complete") {
        markShippingItemsCompleted(targetItems, result.failedItems);
      } else if (action === "cancelCompleted") {
        markShippingItemsAvailable(targetItems, result.failedItems);
      } else {
        state.scannedShippingRows = state.scannedShippingRows.filter((row) => !targetItems.includes(row) || failedSet.has(row));
      }
      saveScannedShippingRows();
      applyShippingFilters();
      showToast(result.failedItems.length
        ? `${result.completedCount}개 박스 ${actionLabel} 완료 · ${result.errors[0] || `${result.failedItems.length}건 실패`}`
        : `${result.completedCount}개 박스 ${actionLabel} 완료`);
    } else {
      showToast(result.errors[0] || (action === "cancelCompleted" ? "출고가 취소된 박스가 없습니다." : action === "cancelPending" ? "출고대기가 취소된 박스가 없습니다." : action === "pending" ? "출고대기로 등록된 박스가 없습니다." : "출고 처리된 박스가 없습니다."));
    }
    void loadShippingDashboard({ silent: true });
  } catch (error) {
    showToast(error.message || (action === "cancelCompleted" ? "출고 취소 중 문제가 발생했습니다." : action === "cancelPending" ? "출고대기 취소 중 문제가 발생했습니다." : action === "pending" ? "출고대기 등록 중 문제가 발생했습니다." : "출고 처리 중 문제가 발생했습니다."));
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
  const items = getScannerSessionShippingRows();
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
    const { completedCount, failedItems, errors } = await completeShippingItems(items, action);

    if (completedCount > 0) {
      triggerScanFeedback(SCAN_COMPLETE_VIBRATION);
      if (isPendingAction) {
        markShippingItemsPending(items, failedItems);
      } else {
        markShippingItemsCompleted(items, failedItems);
      }
      state.scannerSessionShippingKeys = failedItems.map(getShippingKey);
      saveScannedShippingRows();
      applyShippingFilters();
      showToast(failedItems.length
        ? `${completedCount}개 박스 ${actionLabel} 완료 · ${errors[0] || `${failedItems.length}건 실패`}`
        : `${completedCount}개 박스 ${actionLabel} 완료`);
      if (!failedItems.length) {
        closeScanner();
      }
      void loadShippingDashboard({ silent: true });
    } else {
      showToast(errors[0] || (isPendingAction ? "출고대기로 등록된 박스가 없습니다." : "출고 처리된 박스가 없습니다."));
    }
  } catch (error) {
    showToast(error.message || (isPendingAction ? "출고대기 등록 중 문제가 발생했습니다." : "출고 처리 중 문제가 발생했습니다."));
  } finally {
    state.isCompletingShipping = false;
    updateScannerActionLabels();
  }
}

function handleScannerPendingAction() {
  if (state.activeWorkflow === "inventoryMove") {
    openScannedInventoryMoveConfirmModal("single");
    return;
  }

  openScannedShippingConfirmModal("pending");
}

function handleScannerDoneAction() {
  if (state.activeWorkflow === "inventoryMove") {
    openScannedInventoryMoveConfirmModal("all");
    return;
  }

  openScannedShippingConfirmModal("complete");
}

async function completeShippingItems(items, action = "complete") {
  const groups = groupScannedShippingRows(items);
  const results = await mapWithConcurrency(groups, SHIPPING_ACTION_CONCURRENCY, async (group) => {
    const selectedBoxes = getSelectedBoxNumbers(group);
    const selectedBoxIds = getSelectedBoxIds(group, selectedBoxes);
    if (!selectedBoxes.length && !selectedBoxIds.length) {
      return {
        completedCount: 0,
        failedItems: group.scannedItems,
        errors: ["처리할 박스 번호를 확인할 수 없습니다."]
      };
    }

    try {
      const result = await completeShippingItem(group, selectedBoxes, action, selectedBoxIds);
      const updatedCount = parseNumber(result?.updatedBoxRows);
      if (updatedCount <= 0) {
        throw new Error("서버에서 처리된 박스를 확인하지 못했습니다.");
      }
      return { completedCount: updatedCount, failedItems: [], errors: [] };
    } catch (error) {
      return {
        completedCount: 0,
        failedItems: group.scannedItems,
        errors: [error?.message || "출고 처리 중 문제가 발생했습니다."]
      };
    }
  });

  return results.reduce((summary, result) => {
    summary.completedCount += result.completedCount;
    summary.failedItems.push(...result.failedItems);
    summary.errors.push(...(result.errors || []));
    return summary;
  }, { completedCount: 0, failedItems: [], errors: [] });
}

function markShippingItemsPending(items, failedItems = []) {
  const failedSet = new Set(failedItems);

  items.forEach((item) => {
    if (failedSet.has(item)) {
      return;
    }

    const box = getScannedBox(item);
    if (box) {
      box.status = "출고대기";
      box.rawStatus = "출고대기";
    }
    item.stockStatus = "출고대기";
    item.processStatus = "출고대기";
  });
}

function markShippingItemsCompleted(items, failedItems = []) {
  const failedSet = new Set(failedItems);

  items.forEach((item) => {
    if (failedSet.has(item)) {
      return;
    }

    const box = getScannedBox(item);
    if (box) {
      box.status = "출고완료";
      box.rawStatus = "출고완료";
    }
    item.stockStatus = "출고완료";
    item.processStatus = "출고완료";
    item.syncedFromPending = false;
  });
}

function markShippingItemsAvailable(items, failedItems = []) {
  const failedSet = new Set(failedItems);

  items.forEach((item) => {
    if (failedSet.has(item)) {
      return;
    }

    const box = getScannedBox(item);
    if (box) {
      box.status = "보관";
      box.rawStatus = "보관";
    }
    item.stockStatus = "보관";
    item.processStatus = "보관";
  });
}

function isShippingItemCompleted(item) {
  const items = Array.isArray(item?.scannedItems) ? item.scannedItems : [item];
  return items.length > 0 && items.every(isCompletedShippingItem);
}

function isShippingItemPending(item) {
  const items = Array.isArray(item?.scannedItems) ? item.scannedItems : [item];
  return items.length > 0 && items.every((row) => {
    const box = getScannedBox(row);
    return normalizeText(box?.rawStatus || box?.status || row?.stockStatus).includes("출고대기");
  });
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function completeShippingItem(item, selectedBoxes, action = "complete", selectedBoxIds = getSelectedBoxIds(item, selectedBoxes)) {
  const now = new Date();
  const isPendingAction = action === "pending";
  const isCancelPendingAction = action === "cancelPending";
  const isCancelCompletedAction = action === "cancelCompleted";
  const boxQuantities = getSelectedBoxQuantities(item, selectedBoxes);
  const inspectionQuantity = parseNumber(item.trayQuantity);

  if (!isPendingAction && !isCancelPendingAction && !isCancelCompletedAction && inspectionQuantity <= 0) {
    throw new Error("제품의 트레이 수량을 확인할 수 없습니다. 목록을 새로고침한 후 다시 시도해주세요.");
  }

  const payload = {
    managementId: item.managementId,
    productId: item.productId,
    clientName: item.clientName,
    productName: item.productName,
    batch: item.batch,
    finalProcess: item.finalProcess,
    storageLocation: item.storage,
    storage: item.storage,
    status: isCancelPendingAction || isCancelCompletedAction ? "보관" : isPendingAction ? "출고대기" : "출고완료",
    shippingType: "정상출고",
    "출고유형": "정상출고",
    "출고 유형": "정상출고",
    shippingDate: toDateKey(now),
    shippingTime: toTimeKey(now),
    shipper: state.user?.name || "Admin",
    selectedBoxes,
    selectedBoxIds,
    boxQuantities
  };

  if (isPendingAction || isCancelPendingAction || isCancelCompletedAction) {
    if (isCancelCompletedAction) {
      payload.allowCancelCompleted = true;
    }
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

function openScannedInventoryMoveConfirmModal(mode = "single") {
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
  const missingTarget = items.find((item) => !isInventoryMoveTargetReady(item));
  if (missingTarget) {
    setScannerSheetExpanded(true);
    showToast("각 제품의 이동할 장소를 먼저 선택해주세요.");
    return;
  }

  const moveBoxCount = items.reduce((sum, item) => {
    const selectedBoxes = mode === "all" ? getInventoryMoveAllBoxNumbers(item) : getSelectedBoxNumbers(item);
    return sum + selectedBoxes.length;
  }, 0);
  state.selectedConfirmMode = "inventoryMoveBatch";
  state.selectedInventoryMoveMode = mode;
  state.selectedShippingItem = null;

  if (elements.confirmTitle) {
    elements.confirmTitle.textContent = `${actionLabel} 확인`;
  }
  if (elements.confirmMessage) {
    elements.confirmMessage.textContent = mode === "all"
      ? "현재 위치에 있는 같은 제품의 전체 박스를 이동합니다."
      : "QR로 스캔한 박스만 이동합니다.";
  }
  elements.confirmProductName.textContent = `${formatNumber(moveBoxCount)}개 박스 · ${formatNumber(items.length)}개 제품`;
  elements.acceptConfirmButton.textContent = actionLabel;
  renderInventoryMoveConfirmRoutes(items, mode);
  pauseScannerDetection();
  elements.confirmModal.hidden = false;
}

function renderInventoryMoveConfirmRoutes(items, mode) {
  if (!elements.confirmMetaList) {
    return;
  }

  elements.confirmMetaList.hidden = false;
  elements.confirmMetaList.classList.add("inventory-move-confirm-routes");
  elements.confirmMetaList.innerHTML = items.map((item) => {
    const currentStorage = getInventoryMoveCurrentStorage(item);
    const targetStorage = normalizeDisplay(item.targetStorage);
    const selectedBoxes = mode === "all" ? getInventoryMoveAllBoxNumbers(item) : getSelectedBoxNumbers(item);
    return `
      <span>
        <b>${escapeHtml(normalizeDisplay(item.productName))}</b>
        <em>${escapeHtml(currentStorage)} <i aria-hidden="true">→</i> ${escapeHtml(targetStorage)}</em>
        <small>${formatNumber(selectedBoxes.length)}박스</small>
      </span>
    `;
  }).join("");
}

async function handleCompleteScannedInventoryMove(mode = "single") {
  if (state.isCompletingShipping) {
    return;
  }

  const items = groupScannedInventoryMoveRows(state.scannedMoveRows);
  const scannedBoxCount = state.scannedMoveRows.length;
  if (!scannedBoxCount || items.some((item) => !isInventoryMoveTargetReady(item))) {
    showToast("이동할 박스와 장소를 다시 확인해주세요.");
    return;
  }

  const actionLabel = mode === "all" ? "전량 이동" : "자리이동";

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
      void loadShippingDashboard({ silent: true });
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
      const result = await completeInventoryMoveItem(item, selectedBoxes, mode);
      applyInventoryMoveResultLocally(
        item,
        selectedBoxes,
        normalizeDisplay(item.targetStorage),
        mode,
        result
      );
      completedCount += selectedBoxes.length;
    } catch (error) {
      failedItems.push(item);
    }
  }

  return { completedCount, failedItems };
}

async function completeInventoryMoveItem(item, selectedBoxes, mode = "single") {
  const currentStorage = getInventoryMoveCurrentStorage(item);
  const targetStorage = item.targetStorageConfirmed === true ? normalizeDisplay(item.targetStorage) : "-";

  if (!isInventoryMoveTargetReady(item)) {
    throw new Error("이동할 장소를 먼저 선택해주세요.");
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

function applyInventoryMoveResultLocally(item, selectedBoxes, targetStorage, mode, result = {}) {
  const managementId = normalizeScanValue(item?.managementId);
  const productId = normalizeScanValue(item?.productId);
  const selectedBoxNumbers = new Set(
    selectedBoxes.map((value) => String(value || "").trim()).filter(Boolean)
  );
  const hasRemainingCount = result?.remainingSourceActiveRows !== undefined && result?.remainingSourceActiveRows !== null;
  const movedAllSourceBoxes = mode === "all"
    || (hasRemainingCount && parseNumber(result.remainingSourceActiveRows) === 0);

  state.dashboard.forEach((row) => {
    if (normalizeScanValue(row?.managementId) !== managementId) {
      return;
    }
    if (productId && normalizeScanValue(row?.productId) !== productId) {
      return;
    }

    getKnownBoxes(row).forEach((box) => {
      const boxNumber = String(box?.number || box?.sequence || "").trim();
      if (selectedBoxNumbers.has(boxNumber)) {
        box.storage = targetStorage;
        box.storageLocation = targetStorage;
      }
    });

    if (movedAllSourceBoxes) {
      row.storage = targetStorage;
      row.storageLocation = targetStorage;
    }
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
    state.scannerSessionShippingKeys = [];
  }

  elements.scannerScreen.hidden = false;
  state.scannerLastValue = "";
  primeScanFeedback();
  setScannerSheetExpanded(false);
  updateScannerActionLabels();
  renderScannerScannedList();
  await setScannerInputMode(readSavedScannerMode(), { save: false });
}

function readSavedScannerMode() {
  try {
    return localStorage.getItem(SCANNER_MODE_KEY) === "hardware" ? "hardware" : "camera";
  } catch (error) {
    return "camera";
  }
}

async function toggleScannerInputMode() {
  const nextMode = state.scannerInputMode === "camera" ? "hardware" : "camera";
  await setScannerInputMode(nextMode);
}

async function setScannerInputMode(mode, options = {}) {
  const nextMode = mode === "hardware" ? "hardware" : "camera";
  state.scannerInputMode = nextMode;
  resetHardwareScannerBuffer();
  elements.scannerScreen?.classList.toggle("scanner-mode-hardware", nextMode === "hardware");
  elements.hardwareScannerPanel?.setAttribute("aria-hidden", String(nextMode !== "hardware"));
  if (elements.scannerTitle) {
    elements.scannerTitle.textContent = nextMode === "hardware" ? "외부 스캐너" : "QR 스캔";
  }
  if (elements.scannerTip) {
    elements.scannerTip.textContent = nextMode === "hardware"
      ? "스캐너로 제품 QR을 읽어주세요."
      : "제품 박스의 QR 코드를 카메라에 비춰주세요.";
  }

  if (elements.scannerModeToggleButton) {
    const isHardwareMode = nextMode === "hardware";
    elements.scannerModeToggleButton.classList.toggle("active", isHardwareMode);
    elements.scannerModeToggleButton.setAttribute("aria-pressed", String(isHardwareMode));
    elements.scannerModeToggleButton.setAttribute("aria-label", isHardwareMode
      ? "현재 외부 스캐너 모드. 카메라 모드로 전환"
      : "현재 카메라 모드. 외부 스캐너 모드로 전환");
    elements.scannerModeToggleButton.querySelectorAll("[data-scanner-mode]").forEach((option) => {
      option.classList.toggle("active", option.dataset.scannerMode === nextMode);
    });
  }

  renderScannerScannedList();

  if (options.save !== false) {
    try {
      localStorage.setItem(SCANNER_MODE_KEY, nextMode);
    } catch (error) {
      // Private browsing or device policy can block persistent storage.
    }
  }

  if (nextMode === "hardware") {
    stopScannerCamera();
    setHardwareScannerStatus("스캐너 입력을 기다리고 있습니다.");
    setScannerHelp(state.activeWorkflow === "inventoryMove"
      ? "외부 스캐너로 이동할 박스 QR을 읽어주세요."
      : "외부 스캐너로 제품 박스 QR을 읽으면 자동으로 등록됩니다.");
    return;
  }

  setScannerHelp(state.activeWorkflow === "inventoryMove"
    ? "이동할 박스 QR을 카메라에 비춰주세요."
    : "QR이 화면에 보이면 카메라가 자동으로 인식합니다.");
  await startScannerCamera();
}

async function startScannerCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("카메라를 사용할 수 없어 외부 스캐너 모드로 전환합니다.");
    await setScannerInputMode("hardware");
    return;
  }

  if (state.scannerCameraRequestPending) {
    return;
  }

  state.scannerCameraRequestPending = true;
  try {
    const stream = await getScannerStream();
    if (document.hidden || state.scannerInputMode !== "camera" || elements.scannerScreen?.hidden) {
      stopScannerCamera();
      return;
    }
    if (elements.scannerVideo.srcObject !== stream) {
      elements.scannerVideo.srcObject = stream;
    }
    await elements.scannerVideo.play();
    startBarcodeDetection();
  } catch (error) {
    showToast("카메라를 열지 못해 외부 스캐너 모드로 전환합니다.");
    await setScannerInputMode("hardware");
  } finally {
    state.scannerCameraRequestPending = false;
  }
}

function updateScannerActionLabels() {
  if (!elements.scannerPendingButton || !elements.scannerDoneButton) {
    return;
  }

  const scannerBottom = elements.scannerDoneButton.closest(".scanner-bottom");
  if (state.activeWorkflow === "inventoryMove") {
    const hasScannedMoveRows = state.scannedMoveRows.length > 0;
    elements.scannerPendingButton.hidden = false;
    scannerBottom?.classList.remove("single-action");
    elements.scannerPendingButton.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M8 7h12"></path><path d="M8 12h12"></path><path d="M8 17h12"></path><path d="M4 7h.01"></path><path d="M4 12h.01"></path><path d="M4 17h.01"></path></svg>
      스캔 박스 이동
    `;
    elements.scannerDoneButton.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M4 12h14"></path><path d="m13 5 7 7-7 7"></path></svg>
      현재 위치 전량
    `;
    elements.scannerPendingButton.disabled = state.isCompletingShipping || !hasScannedMoveRows;
    elements.scannerDoneButton.disabled = state.isCompletingShipping || !hasScannedMoveRows;
    return;
  }

  elements.scannerPendingButton.hidden = true;
  scannerBottom?.classList.add("single-action");
  const scannerRows = getScannerSessionShippingRows();
  elements.scannerDoneButton.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"></path></svg>
    출고
  `;
  elements.scannerDoneButton.disabled = state.isCompletingShipping || !scannerRows.length;
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
      frameRate: { ideal: 24, max: 30 }
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

function stopScannerCamera() {
  pauseScannerDetection();

  if (elements.scannerVideo) {
    elements.scannerVideo.pause();
    elements.scannerVideo.srcObject = null;
  }

  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }
}

function pauseScannerDetection() {
  if (!state.scannerTimer) {
    return;
  }

  clearInterval(state.scannerTimer);
  state.scannerTimer = null;
}

function releaseScannerStream() {
  stopScannerCamera();
  resetHardwareScannerBuffer();

  if (state.hardwareScannerStatusTimer) {
    clearTimeout(state.hardwareScannerStatusTimer);
    state.hardwareScannerStatusTimer = null;
  }

  if (elements.scannerScreen) {
    elements.scannerScreen.hidden = true;
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
    setScannerHelp("QR 인식 모듈을 불러오지 못했습니다. 스캐너 모드로 전환해 진행해주세요.");
    showToast("QR 인식 모듈 로딩에 실패했습니다. 스캐너 모드를 사용해주세요.");
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
      setScannerHelp("QR 자동 인식이 중단되었습니다. 스캐너 모드로 전환해주세요.");
      showToast("카메라 QR 인식이 중단되었습니다.");
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
    setScannerHelp("QR 인식 모듈을 불러오지 못했습니다. 스캐너 모드로 전환해 진행해주세요.");
    showToast("QR 인식 모듈 로딩에 실패했습니다.");
    return;
  }

  if (!state.scannerCanvas) {
    state.scannerCanvas = document.createElement("canvas");
    state.scannerCanvasContext = state.scannerCanvas.getContext("2d", { willReadFrequently: true });
  }

  setScannerHelp("QR이 화면에 보이면 자동 인식합니다. 박스 안에 딱 맞추지 않아도 됩니다.");
  let isDetectingFrame = false;
  let nativeMissCount = 0;
  let slowNativeDetectCount = 0;
  let jsQrScanCount = 0;
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
        const nativeDetectStartedAt = performance.now();
        const codes = await detector.detect(video);
        const nativeDetectElapsed = performance.now() - nativeDetectStartedAt;
        if (codes.length) {
          handleQrValue(codes[0].rawValue);
          isDetectingFrame = false;
          return;
        }

        nativeMissCount += 1;
        slowNativeDetectCount = nativeDetectElapsed >= SLOW_NATIVE_DETECT_MS
          ? slowNativeDetectCount + 1
          : Math.max(0, slowNativeDetectCount - 1);
        if (slowNativeDetectCount >= SLOW_NATIVE_DETECT_LIMIT) {
          detector = null;
        } else if (nativeMissCount % JSQR_NATIVE_FALLBACK_INTERVAL !== 0) {
          isDetectingFrame = false;
          return;
        }
      }
    } catch (error) {
      detector = null;
    }

    jsQrScanCount += 1;
    const isDetailScan = jsQrScanCount % JSQR_DETAIL_SCAN_INTERVAL === 0;
    const maxEdge = isDetailScan ? JSQR_DETAIL_MAX_EDGE : JSQR_FAST_MAX_EDGE;
    const cropRatio = isDetailScan ? JSQR_CENTER_CROP_RATIO : 1;
    const cropWidth = Math.max(1, Math.floor(sourceWidth * cropRatio));
    const cropHeight = Math.max(1, Math.floor(sourceHeight * cropRatio));
    const cropX = Math.floor((sourceWidth - cropWidth) / 2);
    const cropY = Math.floor((sourceHeight - cropHeight) / 2);
    const scale = Math.min(1, maxEdge / Math.max(cropWidth, cropHeight));
    const width = Math.max(1, Math.floor(cropWidth * scale));
    const height = Math.max(1, Math.floor(cropHeight * scale));

    if (state.scannerCanvas.width !== width) {
      state.scannerCanvas.width = width;
    }
    if (state.scannerCanvas.height !== height) {
      state.scannerCanvas.height = height;
    }
    context.imageSmoothingEnabled = scale < 1;
    if (scale < 1) {
      context.imageSmoothingQuality = "low";
    }
    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);

    try {
      const imageData = context.getImageData(0, 0, width, height);
      const qr = window.jsQR(imageData.data, width, height, {
        inversionAttempts: isDetailScan ? "attemptBoth" : "dontInvert"
      });
      if (qr?.data) {
        handleQrValue(qr.data);
      }
    } catch (error) {
      clearInterval(state.scannerTimer);
      state.scannerTimer = null;
      setScannerHelp("QR 인식 중 문제가 발생했습니다. 스캐너 모드로 전환해주세요.");
      showToast("카메라 QR 인식이 중단되었습니다.");
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

function resetHardwareScannerBuffer() {
  if (state.hardwareScannerSubmitTimer) {
    clearTimeout(state.hardwareScannerSubmitTimer);
    state.hardwareScannerSubmitTimer = null;
  }
  state.hardwareScannerBuffer = "";
  state.hardwareScannerLastInputAt = 0;
}

function setHardwareScannerStatus(message, tone = "waiting") {
  if (!elements.hardwareScannerStatus) {
    return;
  }

  elements.hardwareScannerStatus.classList.toggle("receiving", tone === "receiving");
  elements.hardwareScannerStatus.classList.toggle("success", tone === "success");
  const label = elements.hardwareScannerStatus.querySelector("span");
  if (label) {
    label.textContent = message;
  }
}

function handleHardwareScannerKeydown(event) {
  if (elements.scannerScreen?.hidden || state.scannerInputMode !== "hardware" || event.isComposing || event.repeat) {
    return;
  }

  const target = event.target;
  if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) {
    return;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (event.key === "Enter" || event.key === "Tab" || event.code === "NumpadEnter") {
    event.preventDefault();
    submitHardwareScannerValue(state.hardwareScannerBuffer);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    resetHardwareScannerBuffer();
    setHardwareScannerStatus("입력을 취소했습니다. 다음 QR을 스캔해주세요.");
    return;
  }

  if (event.key.length !== 1) {
    return;
  }

  const now = Date.now();
  if (state.hardwareScannerLastInputAt && now - state.hardwareScannerLastInputAt > 600) {
    state.hardwareScannerBuffer = "";
  }

  state.hardwareScannerBuffer += event.key;
  state.hardwareScannerLastInputAt = now;
  setHardwareScannerStatus(`QR 입력 감지 중… ${state.hardwareScannerBuffer.length}자`, "receiving");
  if (state.hardwareScannerSubmitTimer) {
    clearTimeout(state.hardwareScannerSubmitTimer);
  }
  state.hardwareScannerSubmitTimer = window.setTimeout(() => {
    const bufferedValue = state.hardwareScannerBuffer;
    state.hardwareScannerSubmitTimer = null;
    submitHardwareScannerValue(bufferedValue);
  }, HARDWARE_SCANNER_IDLE_SUBMIT_MS);
  event.preventDefault();
}

function handleHardwareScannerPaste(event) {
  if (elements.scannerScreen?.hidden || state.scannerInputMode !== "hardware") {
    return;
  }

  const target = event.target;
  if (target instanceof HTMLElement && (target.matches("input, textarea") || target.isContentEditable)) {
    return;
  }

  const value = event.clipboardData?.getData("text") || "";
  if (!value.trim()) {
    return;
  }

  event.preventDefault();
  submitHardwareScannerValue(value);
}

async function submitHardwareScannerValue(rawValue) {
  const value = String(rawValue || "").trim();
  resetHardwareScannerBuffer();

  if (!value) {
    setHardwareScannerStatus("QR 입력을 인식하지 못했습니다. 다시 스캔해주세요.");
    return;
  }

  if (state.hardwareScannerStatusTimer) {
    clearTimeout(state.hardwareScannerStatusTimer);
    state.hardwareScannerStatusTimer = null;
  }

  setHardwareScannerStatus("QR을 확인하고 있습니다…", "receiving");
  await handleQrValue(value);
  setHardwareScannerStatus("입력 처리 완료. 다음 QR을 스캔할 수 있습니다.", "success");
  state.hardwareScannerStatusTimer = window.setTimeout(() => {
    setHardwareScannerStatus("스캐너 입력을 기다리고 있습니다.");
    state.hardwareScannerStatusTimer = null;
  }, 1200);
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

    if (state.activeWorkflow === "shipping" && isCompletedShippingItem(matched)) {
      triggerScanFeedback(SCAN_DUPLICATE_VIBRATION);
      setScannerHelp("이미 출고된 박스입니다. 다른 박스를 스캔해주세요.");
      showToast("이미 출고된 박스입니다.");
      return;
    }

    const key = state.activeWorkflow === "inventoryMove" ? getInventoryMoveKey(matched) : getShippingKey(matched);
    const hasDuplicate = state.activeWorkflow === "inventoryMove"
      ? state.scannedMoveRows.some((row) => getInventoryMoveKey(row) === key)
      : state.scannerSessionShippingKeys.includes(key);

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
      updateScannerActionLabels();
    } else {
      await ensureScannedShippingRegistered(matched);
      const existingRow = state.scannedShippingRows.find((row) => getShippingKey(row) === key);
      if (!existingRow) {
        state.scannedShippingRows = [matched, ...state.scannedShippingRows];
      }
      state.scannerSessionShippingKeys = [key, ...state.scannerSessionShippingKeys];
      saveScannedShippingRows();
      state.query = "";
      if (elements.shippingSearchInput) {
        elements.shippingSearchInput.value = "";
      }
      applyShippingFilters();
      updateScannerActionLabels();
    }

    triggerScanFeedback(SCAN_SUCCESS_VIBRATION);
    if (state.activeWorkflow === "inventoryMove") {
      setScannerHelp("스캔 완료. 다음 제품 박스를 계속 스캔할 수 있습니다.");
      showToast("이동할 박스를 등록했습니다.");
    } else {
      setScannerHelp("출고등록 완료. 다른 휴대폰과 PC에서도 확인할 수 있습니다.");
      showToast("스캔과 동시에 출고등록을 완료했습니다.");
    }
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

async function ensureScannedShippingRegistered(item) {
  if (isShippingItemPending(item)) {
    item.syncedFromPending = true;
    return false;
  }

  const selectedBoxes = getSelectedBoxNumbers(item);
  const selectedBoxIds = getSelectedBoxIds(item, selectedBoxes);
  if (!selectedBoxes.length && !selectedBoxIds.length) {
    throw new Error("출고등록할 박스 번호를 확인할 수 없습니다.");
  }

  setScannerHelp("스캔한 박스를 서버에 출고등록하고 있습니다…");
  const result = await completeShippingItem(item, selectedBoxes, "pending", selectedBoxIds);
  if (parseNumber(result?.updatedBoxRows) <= 0) {
    throw new Error("서버에 출고등록된 박스가 없습니다.");
  }

  markShippingItemsPending([item]);
  item.syncedFromPending = true;
  item.registrant = state.user?.name || item.registrant || "Admin";
  item.registeredAt = toDateKey(new Date());
  return true;
}

async function ensureDashboardLoaded() {
  if (state.dashboard.length) {
    return;
  }
  const loaded = await loadShippingDashboard({ silent: true, suppressToast: true });
  if (!loaded) {
    throw new Error("재고 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function syncPendingShippingRowsFromDashboard() {
  const pendingRows = state.dashboard.flatMap((row) => {
    const boxes = Array.isArray(row.activeShippingBoxes) ? row.activeShippingBoxes : [];
    return boxes
      .filter((box) => normalizeText(box?.rawStatus || box?.status).includes("출고대기"))
      .map((box) => ({
        ...buildScannedBoxItem(row, box, {
          boxId: normalizeScanValue(box?.boxId),
          managementId: normalizeScanValue(row.managementId),
          productId: normalizeScanValue(row.productId),
          boxNumber: String(box?.number || box?.sequence || "").trim()
        }, box?.boxId || ""),
        syncedFromPending: true
      }));
  });
  const pendingByKey = new Map(pendingRows.map((row) => [getShippingKey(row), row]));
  const mergedRows = [];
  const mergedKeys = new Set();

  state.scannedShippingRows.forEach((row) => {
    const key = getShippingKey(row);
    const pendingRow = pendingByKey.get(key);
    if (row.syncedFromPending && !pendingRow) {
      return;
    }

    if (pendingRow) {
      Object.assign(row, pendingRow);
    }
    mergedRows.push(row);
    mergedKeys.add(key);
  });

  pendingRows.forEach((row) => {
    const key = getShippingKey(row);
    if (!mergedKeys.has(key)) {
      mergedRows.push(row);
      mergedKeys.add(key);
    }
  });

  state.scannedShippingRows = mergedRows;
  saveScannedShippingRows();
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
    targetStorage: "",
    targetStorageConfirmed: false
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
  const rows = isInventoryMove ? state.scannedMoveRows : getScannerSessionShippingRows();

  if (elements.scannerScannedCount) {
    elements.scannerScannedCount.textContent = String(rows.length);
  }

  if (!elements.scannerScannedList) {
    return;
  }

  if (!rows.length) {
    const emptyInstruction = isInventoryMove
      ? state.scannerInputMode === "hardware"
        ? "외부 스캐너로 이동할 박스 QR을 읽어주세요."
        : "이동할 박스 QR을 카메라에 맞춰주세요."
      : state.scannerInputMode === "hardware"
        ? "외부 스캐너로 제품 박스 QR을 읽어주세요."
        : "상단 카메라에 제품 박스 QR을 맞춰주세요.";
    elements.scannerScannedList.innerHTML = `
      <div class="scanner-empty">
        <strong>아직 스캔한 제품이 없습니다</strong>
        <span>${emptyInstruction}</span>
      </div>
    `;
    return;
  }

  elements.scannerScannedList.innerHTML = rows.map((item, index) => {
    const scannedBox = getScannedBox(item);
    const boxLabel = getScannedBoxLabel(item) || "박스 정보 없음";
    const boxQuantity = scannedBox ? parseNumber(scannedBox.quantity || scannedBox.currentQuantity) : 0;
    const quantityText = boxQuantity ? ` · ${formatNumber(boxQuantity)}ea` : "";
    const currentStorage = isInventoryMove ? getInventoryMoveCurrentStorage(item) : "";
    const targetStorage = isInventoryMove && item.targetStorageConfirmed === true ? item.targetStorage : "";
    const moveGroupKey = isInventoryMove ? getInventoryMoveProductGroupKey(item) : "";
    return `
      <article class="scanner-scanned-item ${isInventoryMove ? "inventory-move-scanner-item" : ""}">
        <span>${index + 1}</span>
        <div class="scanner-item-copy">
          <strong>${escapeHtml(normalizeDisplay(item.productName || "-"))}</strong>
          <small>${escapeHtml(normalizeDisplay(item.clientName || "-"))} · ${escapeHtml(normalizeDisplay(item.finalProcess || "-"))} · ${escapeHtml(boxLabel)}${quantityText}</small>
          ${isInventoryMove ? `
            <div class="scanner-move-route">
              <span class="scanner-current-storage">
                <small>현재 위치</small>
                <b>${escapeHtml(currentStorage)}</b>
              </span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"></path></svg>
              <label>
                <small>이동 위치</small>
                <select data-scanner-move-storage="${escapeHtml(moveGroupKey)}" aria-label="${escapeHtml(normalizeDisplay(item.productName))} 이동 위치">
                  ${renderStorageOptions(targetStorage, currentStorage)}
                </select>
              </label>
            </div>
          ` : ""}
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

function handleScannerListChange(event) {
  const select = event.target.closest("[data-scanner-move-storage]");
  if (!select || state.activeWorkflow !== "inventoryMove") {
    return;
  }

  const changed = updateInventoryMoveGroupStorage(select.dataset.scannerMoveStorage, select.value);
  if (!changed) {
    return;
  }

  saveScannedMoveRows();
  renderInventoryMoveList();
  updateScannerActionLabels();
  showToast(`${select.value}(으)로 이동 위치를 설정했습니다.`);
}

function openScannerQuantityEditor(index) {
  const rows = getScannerSessionShippingRows();
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    return;
  }

  editScannedBoxQuantity(rows[index]);
}

function getScannerSessionShippingRows() {
  const rowsByKey = new Map(state.scannedShippingRows.map((row) => [getShippingKey(row), row]));
  return state.scannerSessionShippingKeys
    .map((key) => rowsByKey.get(key))
    .filter(Boolean);
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
  const rows = getScannerSessionShippingRows();
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    return;
  }

  const key = getShippingKey(rows[index]);
  state.scannedShippingRows = state.scannedShippingRows.filter((row) => getShippingKey(row) !== key);
  state.scannerSessionShippingKeys = state.scannerSessionShippingKeys.filter((sessionKey) => sessionKey !== key);
  saveScannedShippingRows();
  applyShippingFilters();
  updateScannerActionLabels();
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

function readSavedSession(loginPreferences = {}) {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (session) {
      if (loginPreferences.autoLogin) {
        localStorage.setItem(PERSISTENT_SESSION_KEY, JSON.stringify(session));
      }
      return session;
    }

    if (!loginPreferences.autoLogin) {
      return null;
    }

    const persistentSession = JSON.parse(localStorage.getItem(PERSISTENT_SESSION_KEY) || "null");
    if (persistentSession) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(persistentSession));
    }
    return persistentSession;
  } catch (error) {
    return null;
  }
}

function saveSession(user) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    if (elements.autoLogin?.checked) {
      localStorage.setItem(PERSISTENT_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(PERSISTENT_SESSION_KEY);
    }
  } catch (error) {
    // Private browsing or device policy can block persistent storage.
  }
}

function readLoginPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOGIN_PREFERENCES_KEY) || "null");
    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    return {};
  }
}

function restoreLoginPreferences() {
  const saved = readLoginPreferences();
  const preferences = {
    saveAccount: saved.saveAccount === true,
    savePassword: saved.saveAccount === true && saved.savePassword === true,
    autoLogin: saved.saveAccount === true && saved.savePassword === true && saved.autoLogin === true,
    accountId: saved.saveAccount === true ? String(saved.accountId || "") : "",
    password: saved.saveAccount === true && saved.savePassword === true ? String(saved.password || "") : ""
  };

  elements.saveAccount.checked = preferences.saveAccount;
  elements.savePassword.checked = preferences.savePassword;
  elements.autoLogin.checked = preferences.autoLogin;
  elements.accountId.value = preferences.accountId;
  elements.password.value = preferences.password;
  return preferences;
}

function saveLoginPreferences(credentials = null) {
  const previous = readLoginPreferences();
  const saveAccount = elements.saveAccount?.checked === true;
  const savePassword = saveAccount && elements.savePassword?.checked === true;
  const autoLogin = savePassword && elements.autoLogin?.checked === true;
  const accountId = credentials?.accountId ?? previous.accountId ?? "";
  const password = credentials?.password ?? previous.password ?? "";

  const preferences = {
    saveAccount,
    savePassword,
    autoLogin,
    accountId: saveAccount ? accountId : "",
    password: savePassword ? password : ""
  };

  try {
    localStorage.setItem(LOGIN_PREFERENCES_KEY, JSON.stringify(preferences));
    if (!autoLogin) {
      localStorage.removeItem(PERSISTENT_SESSION_KEY);
    }
  } catch (error) {
    // Private browsing or device policy can block persistent storage.
  }
}

function getMobileCacheUserKey() {
  return String(state.user?.accountId || state.user?.name || "").trim();
}

function restoreCachedDashboard() {
  try {
    const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || "null");
    const currentUserKey = getMobileCacheUserKey();
    const savedAt = Number(cached?.savedAt) || 0;
    const isExpired = !savedAt || Date.now() - savedAt > DASHBOARD_CACHE_MAX_AGE_MS;
    const isDifferentUser = cached?.userKey && currentUserKey && cached.userKey !== currentUserKey;
    if (!Array.isArray(cached?.rows) || isExpired || isDifferentUser) {
      if (cached) {
        localStorage.removeItem(DASHBOARD_CACHE_KEY);
      }
      return false;
    }

    state.dashboard = cached.rows;
    state.dashboardLoadedAt = savedAt;
    syncPendingShippingRowsFromDashboard();
    syncScannedMoveRowsFromDashboard();
    return true;
  } catch (error) {
    return false;
  }
}

function saveDashboardCache() {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
      userKey: getMobileCacheUserKey(),
      savedAt: state.dashboardLoadedAt || Date.now(),
      rows: state.dashboard
    }));
  } catch (error) {
    // Storage limits or private browsing must not block the live dashboard.
  }
}

function clearPersistentMobileData() {
  try {
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
    localStorage.removeItem(PERSISTENT_SCANNED_ROWS_KEY);
  } catch (error) {
    // Private browsing or device policy can block persistent storage.
  }
}

function readSavedScannedRows() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(SCANNED_ROWS_KEY) || "[]");
    if (Array.isArray(rows) && rows.length) {
      const compactRows = rows.map(compactScannedBoxRow);
      sessionStorage.setItem(SCANNED_ROWS_KEY, JSON.stringify(compactRows));
      return compactRows;
    }

    const persistent = JSON.parse(localStorage.getItem(PERSISTENT_SCANNED_ROWS_KEY) || "null");
    const currentUserKey = getMobileCacheUserKey();
    if (!Array.isArray(persistent?.rows)
      || (persistent.userKey && currentUserKey && persistent.userKey !== currentUserKey)) {
      return [];
    }

    const compactRows = persistent.rows.map(compactScannedBoxRow);
    if (compactRows.length) {
      sessionStorage.setItem(SCANNED_ROWS_KEY, JSON.stringify(compactRows));
    }
    return compactRows;
  } catch (error) {
    return [];
  }
}

function saveScannedShippingRows() {
  try {
    if (!state.scannedShippingRows.length) {
      sessionStorage.removeItem(SCANNED_ROWS_KEY);
      localStorage.removeItem(PERSISTENT_SCANNED_ROWS_KEY);
      return;
    }
    const compactRows = state.scannedShippingRows.map(compactScannedBoxRow);
    sessionStorage.setItem(SCANNED_ROWS_KEY, JSON.stringify(compactRows));
    localStorage.setItem(PERSISTENT_SCANNED_ROWS_KEY, JSON.stringify({
      userKey: getMobileCacheUserKey(),
      rows: compactRows
    }));
  } catch (error) {
    console.warn("Failed to save scanned shipping rows.", error);
  }
}

function readSavedMoveRows() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(MOVE_ROWS_KEY) || "[]");
    if (!Array.isArray(rows)) {
      return [];
    }

    const compactRows = rows.map(compactInventoryMoveRow);
    if (compactRows.length) {
      sessionStorage.setItem(MOVE_ROWS_KEY, JSON.stringify(compactRows));
    }
    return compactRows;
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
    sessionStorage.setItem(MOVE_ROWS_KEY, JSON.stringify(state.scannedMoveRows.map(compactInventoryMoveRow)));
  } catch (error) {
    console.warn("Failed to save inventory move rows.", error);
  }
}

function compactInventoryMoveRow(row) {
  const compactRow = compactScannedBoxRow(row);
  const scannedBox = compactRow.scannedBox;

  return {
    ...compactRow,
    moveCurrentStorage: row?.moveCurrentStorage || scannedBox.storage || row?.storage || "미지정",
    targetStorage: row?.targetStorageConfirmed === true ? row.targetStorage : "",
    targetStorageConfirmed: row?.targetStorageConfirmed === true
  };
}

function compactScannedBoxRow(row) {
  const box = getScannedBox(row) || {};
  const scannedBox = {
    boxId: box.boxId || box.id || box.qrId || row?.scannedBoxId || "",
    number: box.number || box.sequence || row?.scannedBoxNumber || "",
    status: box.status || "",
    rawStatus: box.rawStatus || "",
    storage: box.storage || row?.moveCurrentStorage || row?.storage || "",
    currentQuantity: box.currentQuantity || "",
    quantity: box.quantity || "",
    originalQuantity: box.originalQuantity || "",
    totalQuantity: box.totalQuantity || "",
    boxQuantity: box.boxQuantity || ""
  };

  return {
    managementId: row?.managementId || "",
    productId: row?.productId || "",
    clientName: row?.clientName || "",
    productName: row?.productName || "",
    batch: row?.batch || "",
    finalProcess: row?.finalProcess || "",
    storage: row?.storage || scannedBox.storage || "",
    stockStatus: row?.stockStatus || "",
    processStatus: row?.processStatus || "",
    inboundDate: row?.inboundDate || "",
    boxQuantity: row?.boxQuantity || "",
    currentBoxCount: row?.currentBoxCount || "",
    boxTotalCount: row?.boxTotalCount || "",
    totalBoxCount: row?.totalBoxCount || "",
    currentTotalQuantity: row?.currentTotalQuantity || "",
    trayQuantity: row?.trayQuantity || "",
    registrant: row?.registrant || "",
    registeredAt: row?.registeredAt || "",
    inspector: row?.inspector || "",
    scannedBox,
    scannedBoxId: scannedBox.boxId,
    scannedBoxNumber: scannedBox.number,
    scannedQrValue: row?.scannedQrValue || "",
    syncedFromPending: row?.syncedFromPending === true
  };
}

function syncScannedMoveRowsFromDashboard() {
  if (!state.scannedMoveRows.length || !state.dashboard.length) {
    return;
  }

  state.scannedMoveRows = state.scannedMoveRows.map((savedRow) => {
    const match = findSavedMoveRowInDashboard(savedRow);
    if (!match) {
      return compactInventoryMoveRow(savedRow);
    }

    const refreshedRow = buildInventoryMoveItem(match.row, match.box, {
      boxId: normalizeScanValue(match.box?.boxId || match.box?.id || match.box?.qrId || savedRow.scannedBoxId),
      managementId: normalizeScanValue(match.row.managementId),
      productId: normalizeScanValue(match.row.productId),
      boxNumber: String(match.box?.number || match.box?.sequence || savedRow.scannedBoxNumber || "").trim()
    }, savedRow.scannedQrValue || "");
    const currentStorage = getInventoryMoveCurrentStorage(refreshedRow);
    const savedTarget = savedRow.targetStorageConfirmed === true
      ? normalizeDisplay(savedRow.targetStorage || "")
      : "-";
    refreshedRow.targetStorage = savedTarget !== "-" && savedTarget !== currentStorage ? savedTarget : "";
    refreshedRow.targetStorageConfirmed = Boolean(refreshedRow.targetStorage);
    return refreshedRow;
  });

  saveScannedMoveRows();
}

function findSavedMoveRowInDashboard(savedRow) {
  const managementId = normalizeScanValue(savedRow?.managementId);
  const productId = normalizeScanValue(savedRow?.productId);
  const productName = normalizeScanValue(savedRow?.productName);
  const clientName = normalizeScanValue(savedRow?.clientName);
  const parsed = {
    boxId: normalizeScanValue(savedRow?.scannedBoxId || savedRow?.scannedBox?.boxId),
    boxNumber: String(savedRow?.scannedBoxNumber || savedRow?.scannedBox?.number || "").trim()
  };

  const candidates = state.dashboard.filter((row) => {
    if (managementId && normalizeScanValue(row?.managementId) !== managementId) {
      return false;
    }
    if (productId && normalizeScanValue(row?.productId) !== productId) {
      return false;
    }
    if (!managementId && !productId) {
      return normalizeScanValue(row?.productName) === productName
        && (!clientName || normalizeScanValue(row?.clientName) === clientName);
    }
    return true;
  });

  for (const row of candidates) {
    const box = findMatchedBox(getKnownBoxes(row), parsed);
    if (box) {
      return { row, box };
    }
  }

  return null;
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

function getShippingDisplayGroupKey(item) {
  const productIdentity = normalizeScanValue(item?.productId)
    || normalizeScanValue(item?.productName)
    || "-";

  return [
    item?.clientName,
    productIdentity,
    item?.productName,
    item?.finalProcess
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

function isCompletedShippingItem(item) {
  const box = getScannedBox(item);
  const status = normalizeText(box?.rawStatus || box?.status || item?.stockStatus || item?.processStatus);
  if (status.includes("출고완료")) {
    return true;
  }

  const scannedBoxId = normalizeScanValue(item?.scannedBoxId || box?.boxId);
  const scannedBoxNumber = String(item?.scannedBoxNumber || box?.number || box?.sequence || "").trim();
  const shippedBoxes = Array.isArray(item?.shippedShippingBoxes) ? item.shippedShippingBoxes : [];
  return shippedBoxes.some((shippedBox) => {
    const shippedBoxId = normalizeScanValue(shippedBox?.boxId || shippedBox?.id || shippedBox?.qrId);
    const shippedBoxNumber = String(shippedBox?.number || shippedBox?.sequence || "").trim();
    return (scannedBoxId && shippedBoxId === scannedBoxId)
      || (scannedBoxNumber && shippedBoxNumber === scannedBoxNumber);
  });
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

function getSelectedBoxIds(item, selectedBoxes = []) {
  if (Array.isArray(item?.scannedItems)) {
    const seen = new Set();
    return item.scannedItems
      .flatMap((row) => getSelectedBoxIds(row, selectedBoxes))
      .filter((boxId) => {
        const normalizedBoxId = normalizeScanValue(boxId);
        if (!boxId || seen.has(normalizedBoxId)) {
          return false;
        }
        seen.add(normalizedBoxId);
        return true;
      });
  }

  const selectedSet = new Set(selectedBoxes.map((boxNumber) => String(boxNumber).trim()).filter(Boolean));
  const scannedBox = getScannedBox(item);
  const candidates = [
    scannedBox,
    ...getKnownBoxes(item)
  ].filter(Boolean);
  const seen = new Set();

  return candidates.reduce((boxIds, box) => {
    const number = String(box.number || box.sequence || item?.scannedBoxNumber || "").trim();
    if (selectedSet.size && (!number || !selectedSet.has(number))) {
      return boxIds;
    }

    const boxId = String(
      box?.boxId ||
      box?.id ||
      box?.qrId ||
      (box === scannedBox ? item?.scannedBoxId : "")
    ).trim();
    const normalizedBoxId = normalizeScanValue(boxId);
    if (!boxId || seen.has(normalizedBoxId)) {
      return boxIds;
    }

    seen.add(normalizedBoxId);
    boxIds.push(boxId);
    return boxIds;
  }, []);
}

function getSelectedBoxQuantities(item, selectedBoxes = []) {
  if (Array.isArray(item?.scannedItems)) {
    return item.scannedItems.reduce((quantities, row) => {
      return Object.assign(quantities, getSelectedBoxQuantities(row, selectedBoxes));
    }, {});
  }

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

function isManualShippingBoxAvailable(box, item) {
  const status = normalizeScanValue(box?.rawStatus || box?.status);
  return !/출고완료|폐기/.test(status) && getBoxCurrentQuantity(box, item) > 0;
}

function hasManualShippingBoxes(item) {
  const itemStatuses = [item?.stockStatus, item?.processStatus]
    .map(normalizeScanValue)
    .filter(Boolean);
  if (itemStatuses.some((status) => /출고완료|폐기/.test(status))) {
    return false;
  }

  return getKnownBoxes(item).some((box) => isManualShippingBoxAvailable(box, item));
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
    row.targetStorageConfirmed = true;
    changed = true;
  });

  return changed;
}

function getInventoryMoveCurrentStorage(item) {
  const box = getScannedBox(item);
  return normalizeDisplay(item?.moveCurrentStorage || box?.storage || item?.storage || "미지정");
}

function isInventoryMoveTargetReady(item) {
  const currentStorage = getInventoryMoveCurrentStorage(item);
  const targetStorage = item?.targetStorageConfirmed === true ? normalizeDisplay(item.targetStorage) : "-";
  return Boolean(targetStorage && targetStorage !== "-" && targetStorage !== currentStorage);
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
  updateScannerActionLabels();
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
  updateScannerActionLabels();
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

function formatManualShippingInboundDate(value) {
  const dateKey = toDateKeyFromValue(value);
  return dateKey ? dateKey.replace(/-/g, ".") : normalizeDisplay(value || "-");
}

function getLatestRegistrationDate(currentValue, candidateValue) {
  const current = normalizeText(currentValue);
  const candidate = normalizeText(candidateValue);

  if (!candidate) {
    return current;
  }

  if (!current) {
    return candidate;
  }

  const currentSortValue = getRegistrationDateSortValue(current);
  const candidateSortValue = getRegistrationDateSortValue(candidate);
  if (candidateSortValue === null) {
    return current;
  }

  return currentSortValue === null || candidateSortValue >= currentSortValue ? candidate : current;
}

function getRegistrationDateSortValue(value) {
  const text = normalizeText(value);
  const dateMatch = text.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
  if (!dateMatch) {
    return null;
  }

  const timeMatch = text.match(/(?:(오전|오후|am|pm)\s*)?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/i);
  let hour = timeMatch ? Number(timeMatch[2]) : 0;
  const meridiem = String(timeMatch?.[1] || "").toLowerCase();
  if ((meridiem === "오후" || meridiem === "pm") && hour < 12) {
    hour += 12;
  } else if ((meridiem === "오전" || meridiem === "am") && hour === 12) {
    hour = 0;
  }

  return Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hour,
    timeMatch ? Number(timeMatch[3]) : 0,
    timeMatch ? Number(timeMatch[4] || 0) : 0
  );
}

function formatRegistrationDate(value) {
  const dateKey = toDateKeyFromValue(value);
  return dateKey ? dateKey.replace(/-/g, ".") : normalizeDisplay(value || "-");
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
