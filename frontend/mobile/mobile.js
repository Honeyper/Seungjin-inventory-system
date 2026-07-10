const API_URL = window.SEUNGJIN_CONFIG?.API_URL || "";
const SESSION_KEY = "seungjinMobileSession";

const state = {
  user: null,
  dashboard: [],
  filteredRows: [],
  scannedShippingRows: [],
  query: "",
  selectedShippingItem: null,
  isCompletingShipping: false,
  scannerStream: null,
  scannerTimer: null,
  scannerCanvas: null,
  scannerCanvasContext: null,
  scannerLastValue: "",
  isProcessingScan: false,
  clockTimer: null,
  scannerSheetStartY: 0,
  scannerSheetDragging: false,
  scannerSheetMoved: false
};

const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  homeScreen: document.querySelector("#homeScreen"),
  shippingScreen: document.querySelector("#shippingScreen"),
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
  shippingListPanel: document.querySelector("#shippingListPanel"),
  openScannerButton: document.querySelector("#openScannerButton"),
  confirmModal: document.querySelector("#confirmModal"),
  confirmProductName: document.querySelector("#confirmProductName"),
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
  scannerDoneButton: document.querySelector("#scannerDoneButton"),
  toast: document.querySelector("#mobileToast")
};

initializeMobileApp();

function initializeMobileApp() {
  bindEvents();
  updateShippingClock();

  const savedSession = readSavedSession();
  if (savedSession) {
    state.user = savedSession;
    showHome();
    return;
  }

  showScreen("login");
}

function bindEvents() {
  elements.loginForm?.addEventListener("submit", handleAdminLogin);
  elements.togglePassword?.addEventListener("click", togglePassword);
  elements.logoutButton?.addEventListener("click", logout);
  elements.refreshShippingButton?.addEventListener("click", loadShippingDashboard);
  elements.filterShippingButton?.addEventListener("click", () => {
    showToast("상세 필터는 다음 단계에서 연결합니다.");
  });
  elements.shippingSearchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    applyShippingFilters();
  });
  elements.openScannerButton?.addEventListener("click", openScanner);
  elements.closeScannerButton?.addEventListener("click", closeScanner);
  elements.albumQrButton?.addEventListener("click", () => {
    showToast("앨범 QR 선택은 다음 단계에서 연결합니다.");
  });
  elements.manualQrButton?.addEventListener("click", handleManualQrInput);
  elements.scannerDoneButton?.addEventListener("click", handleCompleteScannedShipping);
  elements.toggleFlashButton?.addEventListener("click", () => {
    showToast("플래시는 기기 지원 여부 확인 후 연결합니다.");
  });
  elements.cancelConfirmButton?.addEventListener("click", closeConfirmModal);
  elements.acceptConfirmButton?.addEventListener("click", handleConfirmShipping);
  bindScannerSheetEvents();

  document.querySelectorAll("[data-mobile-route]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.mobileRoute));
  });

  elements.shippingListPanel?.addEventListener("click", (event) => {
    const shippingButton = event.target.closest("[data-mobile-shipping]");
    if (!shippingButton) {
      return;
    }

    const key = shippingButton.dataset.mobileShipping;
    const item = state.filteredRows.find((row) => getShippingKey(row) === key);
    if (item) {
      openConfirmModal(item);
    }
  });

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
    dragTarget.setPointerCapture?.(event.pointerId);
  });

  dragTarget.addEventListener("pointerup", (event) => {
    if (!state.scannerSheetDragging) {
      return;
    }

    const deltaY = event.clientY - state.scannerSheetStartY;
    const moved = Math.abs(deltaY) > 36;
    state.scannerSheetDragging = false;
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

  elements.adminLoginButton.disabled = true;

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
    elements.adminLoginButton.disabled = false;
  }
}

function togglePassword() {
  const shouldShow = elements.password.type === "password";
  elements.password.type = shouldShow ? "text" : "password";
  elements.togglePassword.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  state.user = null;
  state.dashboard = [];
  state.filteredRows = [];
  state.scannedShippingRows = [];
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

  showToast("아직 준비 중인 메뉴입니다.");
}

function showHome() {
  elements.mobileUserName.textContent = state.user?.name || "관리자";
  showScreen("home");
}

function showShipping() {
  showScreen("shipping");
  startShippingClock();
  applyShippingFilters();
  if (!state.dashboard.length) {
    loadShippingDashboard({ silent: true });
  }
}

function showScreen(name) {
  const screens = {
    login: elements.loginScreen,
    home: elements.homeScreen,
    shipping: elements.shippingScreen
  };

  Object.values(screens).forEach((screen) => screen?.classList.remove("active"));
  screens[name]?.classList.add("active");
  elements.bottomNav.hidden = name === "login";

  document.querySelectorAll("#bottomNav [data-mobile-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mobileRoute === name);
  });

  if (name === "home") {
    document.querySelector('#bottomNav [data-mobile-route="home"]')?.classList.add("active");
  }

  if (name !== "shipping") {
    stopShippingClock();
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

async function loadShippingDashboard(options = {}) {
  if (!options.silent && !state.scannedShippingRows.length) {
    renderShippingLoading();
  }

  try {
    const data = await requestApi("getInventoryDashboard");
    state.dashboard = Array.isArray(data?.rows) ? data.rows : [];
    applyShippingFilters();
  } catch (error) {
    if (options.silent) {
      showToast(error.message || "출고 목록을 불러오지 못했습니다.");
      return;
    }
    renderShippingError(error.message || "출고 목록을 불러오지 못했습니다.");
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

  state.filteredRows = rows;
  renderShippingList(rows);
  renderScannerScannedList();
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
            <svg viewBox="0 0 24 24">
              <path d="M4 7 12 3l8 4-8 4-8-4z"></path>
              <path d="M4 7v10l8 4 8-4V7"></path>
              <path d="M12 11v10"></path>
            </svg>
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

function renderShippingItem(item) {
  const key = getShippingKey(item);
  const scannedBox = getScannedBox(item);
  const displayBoxes = getKnownBoxes(item);
  const isProductGroup = Array.isArray(item.scannedItems);
  const boxCount = isProductGroup
    ? item.scannedBoxCount
    : scannedBox ? 1 : displayBoxes.length || parseNumber(item.currentBoxCount || item.boxTotalCount);
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
  const boxLabel = isProductGroup ? `스캔 ${formatNumber(boxCount)}박스` : getScannedBoxLabel(item);
  const processClass = /2|3/.test(process) ? "green" : "";

  return `
    <article class="shipping-item">
      <div class="shipping-item-top">
        <div>
          <div class="shipping-client">${escapeHtml(normalizeDisplay(item.clientName || "-"))}</div>
          <div class="shipping-title">
            ${escapeHtml(normalizeDisplay(item.productName || "-"))}
            <small>| ${escapeHtml(batch)}${boxLabel ? ` · ${escapeHtml(boxLabel)}` : ""}</small>
          </div>
        </div>
        <span class="process-pill ${processClass}">${escapeHtml(process)}</span>
        <button class="ship-now-button" type="button" data-mobile-shipping="${escapeHtml(key)}">출고</button>
      </div>
      <p class="item-worker"><span>작업자</span>${escapeHtml(normalizeDisplay(item.registrant || item.inspector || "-"))}</p>
      <div class="item-metrics">
        <span class="metric">
          <span>스캔 박스</span>
          <strong>${formatNumber(boxCount)}</strong>
          <small>box</small>
        </span>
        <span class="metric">
          <span>총 수량</span>
          <strong>${formatNumber(totalQuantity)}</strong>
          <small>ea</small>
        </span>
        <span class="metric">
          <span>현재 수량</span>
          <strong class="blue">${formatNumber(currentQuantity)}</strong>
          <small>ea</small>
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

function openConfirmModal(item) {
  state.selectedShippingItem = item;
  const scannedBoxLabel = getScannedBoxLabel(item);
  const boxes = getActiveBoxes(item);
  const boxText = Array.isArray(item.scannedItems)
    ? ` · ${item.scannedBoxCount}box`
    : scannedBoxLabel ? ` · ${scannedBoxLabel}` : boxes.length ? ` · ${boxes.length}box` : "";
  elements.confirmProductName.textContent = `${normalizeDisplay(item.productName)} | ${normalizeDisplay(item.batch || "-")} | ${normalizeDisplay(item.finalProcess || "-")}${boxText}`;
  elements.confirmModal.hidden = false;
}

function closeConfirmModal() {
  state.selectedShippingItem = null;
  elements.confirmModal.hidden = true;
}

async function handleConfirmShipping() {
  if (!state.selectedShippingItem || state.isCompletingShipping) {
    return;
  }

  const item = state.selectedShippingItem;
  const selectedBoxes = getSelectedBoxNumbers(item);

  if (!selectedBoxes.length) {
    showToast("출고 처리할 박스 번호가 없습니다.");
    closeConfirmModal();
    return;
  }

  state.isCompletingShipping = true;
  elements.acceptConfirmButton.disabled = true;
  elements.acceptConfirmButton.textContent = "처리 중";

  try {
    const targetItems = Array.isArray(item.scannedItems) ? item.scannedItems : [item];
    const result = await completeShippingItems(targetItems);

    closeConfirmModal();
    if (result.completedCount > 0) {
      const failedSet = new Set(result.failedItems);
      state.scannedShippingRows = state.scannedShippingRows.filter((row) => !targetItems.includes(row) || failedSet.has(row));
      applyShippingFilters();
      showToast(result.failedItems.length ? `${result.completedCount}개 박스 출고 완료, ${result.failedItems.length}건 실패` : `${result.completedCount}개 박스 출고 완료`);
    } else {
      showToast("출고 처리된 박스가 없습니다.");
    }
    await loadShippingDashboard();
  } catch (error) {
    showToast(error.message || "출고 처리 중 문제가 발생했습니다.");
  } finally {
    state.isCompletingShipping = false;
    elements.acceptConfirmButton.disabled = false;
    elements.acceptConfirmButton.textContent = "확인";
  }
}

async function handleCompleteScannedShipping() {
  if (state.isCompletingShipping) {
    return;
  }

  const items = [...state.scannedShippingRows];
  if (!items.length) {
    showToast("출고 처리할 박스를 먼저 스캔해주세요.");
    return;
  }

  state.isCompletingShipping = true;
  elements.scannerDoneButton.disabled = true;
  elements.scannerDoneButton.textContent = "처리 중";

  try {
    const { completedCount, failedItems } = await completeShippingItems(items);

    if (completedCount > 0) {
      triggerScanFeedback();
      state.scannedShippingRows = failedItems;
      applyShippingFilters();
      showToast(failedItems.length ? `${completedCount}개 박스 출고 완료, ${failedItems.length}건 실패` : `${completedCount}개 박스 출고 완료`);
      if (!failedItems.length) {
        closeScanner();
      }
      await loadShippingDashboard({ silent: true });
    } else {
      showToast("출고 처리된 박스가 없습니다.");
    }
  } finally {
    state.isCompletingShipping = false;
    elements.scannerDoneButton.disabled = false;
    elements.scannerDoneButton.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"></path></svg>
      출고
    `;
  }
}

async function completeShippingItems(items) {
  let completedCount = 0;
  const failedItems = [];

  for (const item of items) {
    const selectedBoxes = getSelectedBoxNumbers(item);
    if (!selectedBoxes.length) {
      failedItems.push(item);
      continue;
    }

    try {
      await completeShippingItem(item, selectedBoxes);
      completedCount += selectedBoxes.length;
    } catch (error) {
      failedItems.push(item);
    }
  }

  return { completedCount, failedItems };
}

async function completeShippingItem(item, selectedBoxes) {
  const now = new Date();
  const scannedBox = getScannedBox(item);
  const inspectionQuantity = parseNumber(scannedBox?.currentQuantity || scannedBox?.quantity || item.currentTotalQuantity);

  return requestApi("updateShippingStatus", {
    managementId: item.managementId,
    productId: item.productId,
    clientName: item.clientName,
    productName: item.productName,
    batch: item.batch,
    finalProcess: item.finalProcess,
    storageLocation: item.storage,
    storage: item.storage,
    status: "출고완료",
    shippingType: "정상출고",
    "출고유형": "정상출고",
    "출고 유형": "정상출고",
    shippingDate: toDateKey(now),
    shippingTime: toTimeKey(now),
    shipper: state.user?.name || "Admin",
    selectedBoxes,
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

async function openScanner() {
  elements.scannerScreen.hidden = false;
  state.scannerLastValue = "";
  setScannerSheetExpanded(false);
  renderScannerScannedList();
  setScannerHelp("QR 코드가 인식되지 않으면 수동 입력을 사용해주세요.");

  if (!navigator.mediaDevices?.getUserMedia) {
    setScannerHelp("이 브라우저에서는 카메라를 열 수 없습니다. 수동 입력으로 진행해주세요.");
    showToast("카메라 기능을 사용할 수 없어 수동 입력을 사용해주세요.");
    window.setTimeout(handleManualQrInput, 200);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    state.scannerStream = stream;
    await tuneScannerCamera(stream);
    elements.scannerVideo.srcObject = stream;
    await elements.scannerVideo.play();
    startBarcodeDetection();
  } catch (error) {
    setScannerHelp("카메라 권한이 차단되었습니다. 권한을 허용하거나 수동 입력을 사용해주세요.");
    showToast("카메라 권한을 허용하거나 수동 입력을 사용해주세요.");
  }
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

  if (!advanced.length) {
    return;
  }

  try {
    await track.applyConstraints({ advanced });
  } catch (error) {
    // 일부 모바일 브라우저는 capabilities를 알려줘도 constraint 적용을 거부합니다.
  }
}

function closeScanner() {
  if (state.scannerTimer) {
    clearInterval(state.scannerTimer);
    state.scannerTimer = null;
  }

  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }

  elements.scannerVideo.srcObject = null;
  elements.scannerScreen.hidden = true;
}

function startBarcodeDetection() {
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
    if (!elements.scannerVideo.srcObject) {
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
  }, 600);
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

  setScannerHelp("QR 코드가 화면 안에 들어오게 비춰주세요.");
  let isDetectingFrame = false;
  state.scannerTimer = window.setInterval(async () => {
    if (isDetectingFrame) {
      return;
    }

    const video = elements.scannerVideo;
    const context = state.scannerCanvasContext;

    if (!video?.srcObject || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
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

    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.floor(sourceWidth * scale));
    const height = Math.max(1, Math.floor(sourceHeight * scale));

    state.scannerCanvas.width = width;
    state.scannerCanvas.height = height;
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
  }, 180);
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
    const matched = findShippingByQrValue(value);

    if (!matched) {
      setScannerHelp("일치하는 박스를 찾지 못했습니다. QR 또는 박스 정보를 확인해주세요.");
      showToast("일치하는 박스가 없습니다.");
      return;
    }

    const key = getShippingKey(matched);
    if (state.scannedShippingRows.some((row) => getShippingKey(row) === key)) {
      setScannerHelp("이미 스캔된 박스입니다. 다른 박스를 계속 스캔할 수 있습니다.");
      showToast("이미 등록된 박스입니다.");
      return;
    }

    state.scannedShippingRows = [matched, ...state.scannedShippingRows];
    state.query = "";
    if (elements.shippingSearchInput) {
      elements.shippingSearchInput.value = "";
    }
    applyShippingFilters();
    triggerScanFeedback();
    setScannerHelp("스캔 완료. 다음 제품 박스를 계속 스캔할 수 있습니다.");
    showToast("스캔한 박스를 등록했습니다.");
  } catch (error) {
    setScannerHelp(error.message || "스캔한 제품 정보를 확인하지 못했습니다.");
    showToast(error.message || "제품 정보를 확인하지 못했습니다.");
  } finally {
    window.setTimeout(() => {
      state.scannerLastValue = "";
      state.isProcessingScan = false;
    }, 1200);
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
  if (elements.scannerScannedCount) {
    elements.scannerScannedCount.textContent = String(state.scannedShippingRows.length);
  }

  if (!elements.scannerScannedList) {
    return;
  }

  if (!state.scannedShippingRows.length) {
    elements.scannerScannedList.innerHTML = `
      <div class="scanner-empty">
        <strong>아직 스캔한 제품이 없습니다</strong>
        <span>상단 카메라에 제품 박스 QR을 맞춰주세요.</span>
      </div>
    `;
    return;
  }

  elements.scannerScannedList.innerHTML = state.scannedShippingRows.map((item, index) => {
    const scannedBox = getScannedBox(item);
    const boxLabel = getScannedBoxLabel(item) || "박스 정보 없음";
    const boxQuantity = scannedBox ? parseNumber(scannedBox.quantity || scannedBox.currentQuantity) : 0;
    const quantityText = boxQuantity ? ` · ${formatNumber(boxQuantity)}ea` : "";
    return `
      <article class="scanner-scanned-item">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(normalizeDisplay(item.productName || "-"))}</strong>
          <small>${escapeHtml(normalizeDisplay(item.clientName || "-"))} · ${escapeHtml(normalizeDisplay(item.finalProcess || "-"))} · ${escapeHtml(boxLabel)}${quantityText}</small>
        </div>
      </article>
    `;
  }).join("");
}

function startShippingClock() {
  updateShippingClock();
  if (state.clockTimer) {
    return;
  }
  state.clockTimer = window.setInterval(updateShippingClock, 1000);
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

function setLoginMessage(message, type = "error") {
  elements.loginMessage.textContent = message;
  elements.loginMessage.classList.toggle("success", type === "success");
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

function triggerScanFeedback() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(80);
  }
}

function getActiveBoxes(item) {
  const boxes = Array.isArray(item.activeShippingBoxes) ? item.activeShippingBoxes : [];
  return boxes.filter((box) => {
    const status = normalizeText(box.status);
    return status.includes("출고대기");
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
