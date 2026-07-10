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
  clockTimer: null
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
  elements.scannerDoneButton?.addEventListener("click", closeScanner);
  elements.toggleFlashButton?.addEventListener("click", () => {
    showToast("플래시는 기기 지원 여부 확인 후 연결합니다.");
  });
  elements.cancelConfirmButton?.addEventListener("click", closeConfirmModal);
  elements.acceptConfirmButton?.addEventListener("click", handleConfirmShipping);

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
  const rows = state.scannedShippingRows
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
        row.storage
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });

  state.filteredRows = rows;
  renderShippingList(rows);
  renderScannerScannedList();
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
  const displayBoxes = getKnownBoxes(item);
  const boxCount = displayBoxes.length || parseNumber(item.currentBoxCount || item.boxTotalCount);
  const totalQuantity = sumBoxQuantity(displayBoxes) || parseNumber(item.currentTotalQuantity);
  const remainingQuantity = parseNumber(item.currentTotalQuantity);
  const process = normalizeDisplay(item.finalProcess || "-");
  const batch = normalizeDisplay(item.batch || "-");
  const processClass = /2|3/.test(process) ? "green" : "";

  return `
    <article class="shipping-item">
      <div class="shipping-item-top">
        <div>
          <div class="shipping-client">${escapeHtml(normalizeDisplay(item.clientName || "-"))}</div>
          <div class="shipping-title">
            ${escapeHtml(normalizeDisplay(item.productName || "-"))}
            <small>| ${escapeHtml(batch)}</small>
          </div>
        </div>
        <span class="process-pill ${processClass}">${escapeHtml(process)}</span>
        <button class="ship-now-button" type="button" data-mobile-shipping="${escapeHtml(key)}">출고</button>
      </div>
      <p class="item-worker"><span>작업자</span>${escapeHtml(normalizeDisplay(item.registrant || item.inspector || "-"))}</p>
      <div class="item-metrics">
        <span class="metric">
          <span>총 수량</span>
          <strong>${formatNumber(totalQuantity)}</strong>
          <small>ea</small>
        </span>
        <span class="metric">
          <span>잔량</span>
          <strong class="blue">${formatNumber(remainingQuantity)}</strong>
          <small>ea</small>
        </span>
        <span class="metric">
          <span>박스 수</span>
          <strong>${formatNumber(boxCount)}</strong>
          <small>box</small>
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
  const boxes = getActiveBoxes(item);
  const boxText = boxes.length ? ` · ${boxes.length}box` : "";
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
  const selectedBoxes = getActiveBoxes(item).map((box) => box.number).filter(Boolean);

  if (!selectedBoxes.length) {
    showToast("출고대기 등록된 박스가 없습니다.");
    closeConfirmModal();
    return;
  }

  state.isCompletingShipping = true;
  elements.acceptConfirmButton.disabled = true;
  elements.acceptConfirmButton.textContent = "처리 중";

  try {
    const now = new Date();
    const result = await requestApi("updateShippingStatus", {
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
      selectedBoxes
    });

    closeConfirmModal();
    showToast(result?.isPartialShipping ? "선택 박스를 출고 완료 처리했습니다." : "출고 완료 처리했습니다.");
    await loadShippingDashboard();
  } catch (error) {
    showToast(error.message || "출고 처리 중 문제가 발생했습니다.");
  } finally {
    state.isCompletingShipping = false;
    elements.acceptConfirmButton.disabled = false;
    elements.acceptConfirmButton.textContent = "확인";
  }
}

async function openScanner() {
  elements.scannerScreen.hidden = false;
  state.scannerLastValue = "";
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
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    state.scannerStream = stream;
    elements.scannerVideo.srcObject = stream;
    await elements.scannerVideo.play();
    startBarcodeDetection();
  } catch (error) {
    setScannerHelp("카메라 권한이 차단되었습니다. 권한을 허용하거나 수동 입력을 사용해주세요.");
    showToast("카메라 권한을 허용하거나 수동 입력을 사용해주세요.");
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
  if (typeof window.jsQR === "function") {
    startJsQrDetection();
    return;
  }

  if (!("BarcodeDetector" in window)) {
    setScannerHelp("QR 인식 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하거나 수동 입력을 사용해주세요.");
    showToast("QR 인식 모듈 로딩에 실패했습니다.");
    return;
  }

  let detector;
  try {
    detector = new BarcodeDetector({ formats: ["qr_code"] });
  } catch (error) {
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

function startJsQrDetection() {
  if (typeof window.jsQR !== "function") {
    setScannerHelp("QR 인식 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하거나 수동 입력을 사용해주세요.");
    showToast("QR 인식 모듈 로딩에 실패했습니다.");
    return;
  }

  if (!state.scannerCanvas) {
    state.scannerCanvas = document.createElement("canvas");
    state.scannerCanvasContext = state.scannerCanvas.getContext("2d", { willReadFrequently: true });
  }

  setScannerHelp("QR 코드를 화면 중앙에 맞춰주세요.");
  state.scannerTimer = window.setInterval(() => {
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

    const scale = Math.min(1, 900 / Math.max(sourceWidth, sourceHeight));
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
    }
  }, 250);
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
      setScannerHelp("일치하는 제품을 찾지 못했습니다. QR 또는 제품 정보를 확인해주세요.");
      showToast("일치하는 제품이 없습니다.");
      return;
    }

    const key = getShippingKey(matched);
    if (state.scannedShippingRows.some((row) => getShippingKey(row) === key)) {
      setScannerHelp("이미 스캔된 제품입니다. 다른 박스를 계속 스캔할 수 있습니다.");
      showToast("이미 등록된 제품입니다.");
      return;
    }

    state.scannedShippingRows = [matched, ...state.scannedShippingRows];
    state.query = "";
    if (elements.shippingSearchInput) {
      elements.shippingSearchInput.value = "";
    }
    applyShippingFilters();
    setScannerHelp("스캔 완료. 다음 제품 박스를 계속 스캔할 수 있습니다.");
    showToast("스캔한 제품을 등록했습니다.");
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

  return state.dashboard
    .find((row) => {
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
        return false;
      }

      if (parsed.productId && normalizeScanValue(row.productId) !== parsed.productId) {
        return false;
      }

      if (parsed.boxId) {
        const hasBox = boxes.some((box) => normalizeScanValue(box.boxId) === parsed.boxId);
        if (hasBox) {
          return true;
        }
        if (parsed.managementId || parsed.productId) {
          return true;
        }
      }

      if (parsed.boxNumber && boxes.some((box) => String(box.number || "") === parsed.boxNumber)) {
        return true;
      }

      return rowValues.some((value) => value && value.includes(text));
    });
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
    const displayBoxes = getKnownBoxes(item);
    const boxCount = displayBoxes.length || parseNumber(item.currentBoxCount || item.boxTotalCount);
    return `
      <article class="scanner-scanned-item">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(normalizeDisplay(item.productName || "-"))}</strong>
          <small>${escapeHtml(normalizeDisplay(item.clientName || "-"))} · ${escapeHtml(normalizeDisplay(item.finalProcess || "-"))} · ${formatNumber(boxCount)}box</small>
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
  return [
    item.managementId,
    item.productId,
    item.storage,
    item.productName
  ].map((value) => String(value || "").replace(/\s+/g, "_")).join("__");
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
