const API_URL = window.SEUNGJIN_CONFIG?.API_URL || "";
const SESSION_KEY = "seungjinMobileSession";

const state = {
  user: null,
  dashboard: [],
  filteredRows: [],
  selectedDate: toDateKey(new Date()),
  query: "",
  selectedShippingItem: null,
  isCompletingShipping: false,
  scannerStream: null,
  scannerTimer: null,
  scannerCanvas: null,
  scannerContext: null
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
  dateChipRow: document.querySelector("#dateChipRow"),
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
  closeScannerButton: document.querySelector("#closeScannerButton"),
  toggleFlashButton: document.querySelector("#toggleFlashButton"),
  albumQrButton: document.querySelector("#albumQrButton"),
  manualQrButton: document.querySelector("#manualQrButton"),
  toast: document.querySelector("#mobileToast")
};

initializeMobileApp();

function initializeMobileApp() {
  bindEvents();
  renderDateChips();

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
  if (!state.dashboard.length) {
    loadShippingDashboard();
  } else {
    applyShippingFilters();
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

  window.scrollTo({ top: 0, behavior: "auto" });
}

async function loadShippingDashboard() {
  renderShippingLoading();

  try {
    const data = await requestApi("getInventoryDashboard");
    state.dashboard = Array.isArray(data?.rows) ? data.rows : [];
    applyShippingFilters();
  } catch (error) {
    renderShippingError(error.message || "출고 목록을 불러오지 못했습니다.");
  }
}

function applyShippingFilters() {
  const query = state.query;
  const rows = state.dashboard
    .filter(isMobileShippingCandidate)
    .filter((row) => matchesSelectedDate(row))
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

function matchesSelectedDate(row) {
  const rowDates = [
    row.shippingInspectionDate,
    row.shippingDate,
    row.inboundDate
  ].map(toDateKeyFromValue).filter(Boolean);

  if (!rowDates.length) {
    return true;
  }

  return rowDates.includes(state.selectedDate);
}

function renderShippingList(rows) {
  elements.mobileShippingCount.textContent = String(rows.length);

  if (!rows.length) {
    elements.shippingListPanel.innerHTML = `
      <div class="empty-state">
        <div>
          <span class="empty-state-icon" aria-hidden="true">
            <img src="../assets/mobile-empty-box.svg" alt="" />
          </span>
          <h2>등록된 제품이 없습니다</h2>
          <p>출고할 제품을 등록해 주세요.</p>
          <button class="primary-action" type="button" id="emptyRefreshButton">새로고침</button>
        </div>
      </div>
    `;
    document.querySelector("#emptyRefreshButton")?.addEventListener("click", loadShippingDashboard);
    return;
  }

  elements.shippingListPanel.innerHTML = rows.map(renderShippingItem).join("");
}

function renderShippingItem(item) {
  const key = getShippingKey(item);
  const activeBoxes = getActiveBoxes(item);
  const boxCount = activeBoxes.length || parseNumber(item.currentBoxCount || item.boxTotalCount);
  const totalQuantity = sumBoxQuantity(activeBoxes) || parseNumber(item.currentTotalQuantity);
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
            <img src="../assets/mobile-empty-box.svg" alt="" />
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
            <img src="../assets/mobile-empty-box.svg" alt="" />
          </span>
          <h2>목록을 불러오지 못했습니다</h2>
        <p>${escapeHtml(message)}</p>
        <button class="primary-action" type="button" id="retryShippingButton">다시 시도</button>
      </div>
    </div>
  `;
  document.querySelector("#retryShippingButton")?.addEventListener("click", loadShippingDashboard);
}

function renderDateChips() {
  const dates = Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return date;
  });

  elements.dateChipRow.innerHTML = [
    ...dates.map((date) => {
      const key = toDateKey(date);
      return `<button type="button" data-mobile-date="${key}" class="${key === state.selectedDate ? "active" : ""}">${formatShortDate(date)}</button>`;
    }),
    `<button type="button" data-mobile-date-calendar aria-label="날짜 선택">▣</button>`
  ].join("");

  elements.dateChipRow.querySelectorAll("[data-mobile-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.mobileDate;
      renderDateChips();
      applyShippingFilters();
    });
  });

  elements.dateChipRow.querySelector("[data-mobile-date-calendar]")?.addEventListener("click", () => {
    showToast("달력 선택은 다음 단계에서 연결합니다.");
  });
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
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("이 브라우저에서는 카메라 촬영을 지원하지 않습니다. 수동 입력을 사용해주세요.");
    return;
  }

  elements.scannerScreen.hidden = false;

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
    closeScanner();
    showToast("카메라 권한을 허용하거나 수동 입력을 사용해주세요.");
  }
}

function closeScanner() {
  stopScannerTimer();

  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }

  elements.scannerVideo.srcObject = null;
  elements.scannerScreen.hidden = true;
}

function startBarcodeDetection() {
  stopScannerTimer();

  if ("BarcodeDetector" in window) {
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      state.scannerTimer = setInterval(() => detectWithBarcodeDetector(detector), 450);
      return;
    } catch (error) {
      // Fall through to jsQR for browsers with partial BarcodeDetector support.
    }
  }

  if (typeof window.jsQR === "function") {
    prepareScannerCanvas();
    state.scannerTimer = setInterval(detectWithJsQr, 250);
    return;
  }

  showToast("QR 인식 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.");
}

function stopScannerTimer() {
  if (state.scannerTimer) {
    clearInterval(state.scannerTimer);
    state.scannerTimer = null;
  }
}

async function detectWithBarcodeDetector(detector) {
  if (!isScannerVideoReady()) {
    return;
  }

  try {
    const codes = await detector.detect(elements.scannerVideo);
    if (codes.length) {
      handleQrValue(codes[0].rawValue);
    }
  } catch (error) {
    // Ignore transient frame-read errors while the camera is warming up.
  }
}

function detectWithJsQr() {
  if (!isScannerVideoReady()) {
    return;
  }

  const video = elements.scannerVideo;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    return;
  }

  prepareScannerCanvas();
  state.scannerCanvas.width = width;
  state.scannerCanvas.height = height;
  state.scannerContext.drawImage(video, 0, 0, width, height);

  const imageData = state.scannerContext.getImageData(0, 0, width, height);
  const code = window.jsQR(imageData.data, width, height, {
    inversionAttempts: "attemptBoth"
  });
  if (code?.data) {
    handleQrValue(code.data);
  }
}

function prepareScannerCanvas() {
  if (!state.scannerCanvas) {
    state.scannerCanvas = document.createElement("canvas");
  }
  if (!state.scannerContext) {
    state.scannerContext = state.scannerCanvas.getContext("2d", {
      willReadFrequently: true
    });
  }
}

function isScannerVideoReady() {
  return Boolean(
    elements.scannerVideo?.srcObject &&
      elements.scannerVideo.readyState >= 2 &&
      elements.scannerVideo.videoWidth &&
      elements.scannerVideo.videoHeight
  );
}

function handleManualQrInput() {
  const value = window.prompt("QR 또는 관리ID를 입력해주세요.");
  if (value) {
    handleQrValue(value);
  }
}

function handleQrValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return;
  }

  closeScanner();
  elements.shippingSearchInput.value = value;
  state.query = value.toLowerCase();
  applyShippingFilters();
  showToast("스캔한 값으로 목록을 검색했습니다.");
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
