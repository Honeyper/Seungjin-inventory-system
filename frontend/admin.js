const API_URL = "https://script.google.com/macros/s/AKfycbyPiTM2wEZ5d549g0R8pqLQB2FKE0Hz-7h_GYGfA_MVUq45-F3tTyITbT4A-yJ1ZldOCA/exec";

const DEFAULT_CLIENTS = [
  "아이원(아이텍)",
  "(주)리치코스",
  "(주)장업시스템",
  "(주)ANP",
  "(주)정훈",
  "(주)케이알",
  "(주)코스엔텍",
  "(주)금호ENG",
  "뉴파트너스",
  "필림텍",
  "이루팩",
  "(주)디엠",
  "보경",
  "CPI",
  "더승진(2공장)"
];

const session = JSON.parse(sessionStorage.getItem("seungjinAdminSession") || "null");

if (!session || session.role !== "admin") {
  location.replace("./index.html");
}

const state = {
  products: [],
  filteredProducts: [],
  page: 1,
  pageSize: 10,
  query: "",
  isSavingProduct: false,
  isDeletingProduct: false,
  activeMenuProductCode: "",
  activeMenuButton: null
};

const adminUserName = document.querySelector("#adminUserName");
const productTotal = document.querySelector("#productTotal");
const clientTotal = document.querySelector("#clientTotal");
const recentDate = document.querySelector("#recentDate");
const productSearch = document.querySelector("#productSearch");
const productTableBody = document.querySelector("#productTableBody");
const productCountLabel = document.querySelector("#productCountLabel");
const pagination = document.querySelector("#pagination");
const pageSizeSelect = document.querySelector("#pageSizeSelect");
const tableStatus = document.querySelector("#tableStatus");
const toast = document.querySelector("#toast");
const productModal = document.querySelector("#productModal");
const productForm = document.querySelector("#productForm");
const productCodePreview = document.querySelector("#productCodePreview");
const productClientName = document.querySelector("#productClientName");
const productNameInput = document.querySelector("#productNameInput");
const productColor = document.querySelector("#productColor");
const productBoxQuantity = document.querySelector("#productBoxQuantity");
const productTrayQuantity = document.querySelector("#productTrayQuantity");
const productNote = document.querySelector("#productNote");
const productFormMessage = document.querySelector("#productFormMessage");
const saveProductButton = document.querySelector("#saveProductButton");
const rowActionMenu = document.querySelector("#rowActionMenu");
const productDetailModal = document.querySelector("#productDetailModal");
const productDetailContent = document.querySelector("#productDetailContent");

adminUserName.textContent = session?.name || "관리자";

document.querySelector("#newProductButton").addEventListener("click", () => {
  openProductModal();
});

document.querySelector("#filterButton").addEventListener("click", () => {
  showToast("상세 검색 필터는 다음 단계에서 연결됩니다.");
});

productSearch.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  state.page = 1;
  applyFilters();
});

pageSizeSelect.addEventListener("change", (event) => {
  state.pageSize = Number(event.target.value);
  state.page = 1;
  renderProducts();
});

document.querySelector("#closeProductModal").addEventListener("click", closeProductModal);
document.querySelector("#cancelProductModal").addEventListener("click", closeProductModal);
document.querySelector("#closeProductDetailModal").addEventListener("click", closeProductDetailModal);
document.querySelector("#closeProductDetailButton").addEventListener("click", closeProductDetailModal);

document.addEventListener("click", (event) => {
  if (rowActionMenu.hidden) {
    return;
  }

  const clickedActionButton = event.target.closest(".row-action");
  if (!rowActionMenu.contains(event.target) && !clickedActionButton) {
    closeRowActionMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!rowActionMenu.hidden) {
    closeRowActionMenu();
    return;
  }

  if (!productDetailModal.hidden) {
    closeProductDetailModal();
    return;
  }

  if (!productModal.hidden) {
    closeProductModal();
  }
});

productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveProduct();
});

rowActionMenu.querySelector('[data-menu-action="delete"]').addEventListener("click", (event) => {
  event.stopPropagation();
  deleteActiveProduct();
});

rowActionMenu.querySelector('[data-menu-action="view"]').addEventListener("click", (event) => {
  event.stopPropagation();
  openActiveProductDetail();
});

window.addEventListener("resize", closeRowActionMenu);
window.addEventListener("scroll", closeRowActionMenu, true);

loadProducts();

async function loadProducts() {
  setStatus("제품 정보를 불러오는 중입니다.");

  try {
    const result = await requestApi("getProducts");
    state.products = Array.isArray(result.products) ? result.products : [];
    renderClientOptions();
    applyFilters();
  } catch (error) {
    state.products = [];
    renderClientOptions();
    applyFilters();
    setStatus("제품 DB를 불러오지 못했습니다. Apps Script 배포 권한을 확인해주세요.", "error");
  }
}

async function requestApi(action, payload = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload })
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "API 요청에 실패했습니다.");
  }

  return result.data;
}

function applyFilters() {
  const query = state.query;

  state.filteredProducts = state.products.filter((product) => {
    if (!query) {
      return true;
    }

    return [
      product.clientName,
      product.productCode,
      product.productName,
      product.color,
      product.note
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });

  renderSummary();
  renderProducts();
}

function renderSummary() {
  const uniqueClients = new Set(state.products.map((item) => item.clientName).filter(Boolean));
  const dates = state.products.map((item) => item.registeredAt).filter(Boolean).sort().reverse();

  productTotal.textContent = state.products.length.toLocaleString("ko-KR");
  clientTotal.textContent = uniqueClients.size.toLocaleString("ko-KR");
  recentDate.textContent = dates[0] || "-";
}

function renderProducts() {
  closeRowActionMenu();

  const total = state.filteredProducts.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  state.page = Math.min(state.page, pageCount);

  const start = (state.page - 1) * state.pageSize;
  const products = state.filteredProducts.slice(start, start + state.pageSize);

  productTableBody.innerHTML = products.map((product, index) => {
    const sequence = start + index + 1;

    return `
      <tr>
        <td>${sequence}</td>
        <td>${escapeHtml(product.clientName)}</td>
        <td><strong>${escapeHtml(product.productCode)}</strong></td>
        <td>${escapeHtml(product.productName)}</td>
        <td>${renderColor(product.color)}</td>
        <td>${escapeHtml(product.boxQuantity)}</td>
        <td>${escapeHtml(product.trayQuantity)}</td>
        <td>${escapeHtml(product.registeredAt)}</td>
        <td class="note-cell">${escapeHtml(product.note)}</td>
        <td>
          <button class="row-action" type="button" data-product="${escapeHtml(product.productCode)}" aria-label="제품 관리" aria-haspopup="menu" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  productTableBody.querySelectorAll(".row-action").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleRowActionMenu(button);
    });
  });

  productCountLabel.textContent = `전체 ${total.toLocaleString("ko-KR")}건`;
  setStatus(total ? "" : "등록된 제품이 없습니다.");
  renderPagination(pageCount);
}

function toggleRowActionMenu(button) {
  const productCode = button.dataset.product || "";
  const isSameButton = state.activeMenuButton === button && !rowActionMenu.hidden;

  closeRowActionMenu();

  if (isSameButton || !productCode) {
    return;
  }

  state.activeMenuProductCode = productCode;
  state.activeMenuButton = button;
  button.setAttribute("aria-expanded", "true");
  rowActionMenu.hidden = false;
  rowActionMenu.style.visibility = "hidden";

  const buttonRect = button.getBoundingClientRect();
  const menuRect = rowActionMenu.getBoundingClientRect();
  const margin = 12;
  const preferredLeft = buttonRect.right - menuRect.width + 10;
  const left = Math.min(
    window.innerWidth - menuRect.width - margin,
    Math.max(margin, preferredLeft)
  );
  const belowTop = buttonRect.bottom + 9;
  const aboveTop = buttonRect.top - menuRect.height - 9;
  const top = belowTop + menuRect.height > window.innerHeight - margin
    ? Math.max(margin, aboveTop)
    : belowTop;

  rowActionMenu.style.left = `${left}px`;
  rowActionMenu.style.top = `${top}px`;
  rowActionMenu.style.visibility = "";
}

function closeRowActionMenu() {
  if (state.activeMenuButton) {
    state.activeMenuButton.setAttribute("aria-expanded", "false");
  }

  state.activeMenuProductCode = "";
  state.activeMenuButton = null;

  if (rowActionMenu) {
    rowActionMenu.hidden = true;
    rowActionMenu.style.left = "";
    rowActionMenu.style.top = "";
    rowActionMenu.style.visibility = "";
  }
}

async function deleteActiveProduct() {
  if (state.isDeletingProduct || !state.activeMenuProductCode) {
    return;
  }

  const productCode = state.activeMenuProductCode;
  const product = state.products.find((item) => item.productCode === productCode);
  const productLabel = product?.productName
    ? `${product.productName} (${productCode})`
    : productCode;

  if (!window.confirm(`${productLabel} 제품을 삭제하시겠습니까?\n삭제하면 Google Sheet에서도 같이 삭제됩니다.`)) {
    return;
  }

  state.isDeletingProduct = true;
  closeRowActionMenu();
  setStatus("제품을 삭제하는 중입니다.");

  try {
    await requestApi("deleteProduct", { productId: productCode });
    await loadProducts();
    showToast("제품이 삭제되었습니다.");
  } catch (error) {
    setStatus("");
    showToast(error.message || "제품 삭제에 실패했습니다.");
  } finally {
    state.isDeletingProduct = false;
  }
}

function openActiveProductDetail() {
  if (!state.activeMenuProductCode) {
    return;
  }

  const product = state.products.find((item) => item.productCode === state.activeMenuProductCode);

  if (!product) {
    showToast("제품 정보를 찾을 수 없습니다.");
    closeRowActionMenu();
    return;
  }

  closeRowActionMenu();
  renderProductDetail(product);
  productDetailModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#closeProductDetailButton").focus(), 0);
}

function closeProductDetailModal() {
  productDetailModal.hidden = true;
  productDetailContent.innerHTML = "";

  if (productModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function renderProductDetail(product) {
  productDetailContent.innerHTML = `
    <section class="detail-section" aria-labelledby="detailBaseTitle">
      <h3 id="detailBaseTitle">제품 기본 정보</h3>
      <div class="detail-grid">
        ${detailItem("제품코드", product.productCode)}
        ${detailItem("거래처명", product.clientName)}
        ${detailItem("제품명", product.productName)}
        ${detailItem("색상", renderColor(product.color), true)}
        ${detailItem("사용 여부", renderUsageStatus(product.useStatus), true, "full-span")}
      </div>
    </section>

    <section class="detail-section" aria-labelledby="detailStandardTitle">
      <h3 id="detailStandardTitle">제품 기준 정보</h3>
      <div class="detail-grid">
        ${detailItem("박스당 수량", product.boxQuantity)}
        ${detailItem("트레이 수량", product.trayQuantity)}
        ${detailItem("비고", product.note, false, "full-span")}
      </div>
    </section>

    <section class="detail-section" aria-labelledby="detailRegisterTitle">
      <h3 id="detailRegisterTitle">등록 정보</h3>
      <div class="detail-grid">
        ${detailItem("등록일", product.registeredAt)}
        ${detailItem("수정일", product.updatedAt)}
        ${detailItem("등록자", product.createdBy, false, "full-span")}
      </div>
    </section>
  `;
}

function detailItem(label, value, isHtml = false, className = "") {
  const displayValue = normalizeDisplayValue(value);
  const content = isHtml ? displayValue : escapeHtml(displayValue);

  return `
    <div class="detail-item ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${content}</strong>
    </div>
  `;
}

function renderUsageStatus(status) {
  const value = normalizeDisplayValue(status);
  const isInactive = value.includes("미사용");
  const className = isInactive ? "inactive" : "active";

  return `<span class="status-pill ${className}">${escapeHtml(value)}</span>`;
}

function renderPagination(pageCount) {
  const pages = getPageNumbers(pageCount, state.page);
  const controls = [
    pageButton("처음", 1, state.page === 1, "double-left"),
    pageButton("이전", Math.max(1, state.page - 1), state.page === 1, "left"),
    ...pages.map((page) => pageButton(String(page), page, false, null, page === state.page)),
    pageButton("다음", Math.min(pageCount, state.page + 1), state.page === pageCount, "right"),
    pageButton("끝", pageCount, state.page === pageCount, "double-right")
  ];

  pagination.innerHTML = controls.join("");
  pagination.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.page = Number(button.dataset.page);
      renderProducts();
    });
  });
}

function openProductModal() {
  productForm.reset();
  productFormMessage.textContent = "";
  productFormMessage.classList.remove("success");
  renderClientOptions();
  setProductSaving(false);
  productModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => productClientName.focus(), 0);
}

function closeProductModal() {
  if (state.isSavingProduct) {
    return;
  }

  productModal.hidden = true;
  document.body.classList.remove("modal-open");
  productFormMessage.textContent = "";
  productFormMessage.classList.remove("success");
}

function renderClientOptions() {
  const clients = [...new Set([
    ...state.products.map((product) => product.clientName).filter(Boolean),
    ...DEFAULT_CLIENTS
  ])].sort((left, right) => left.localeCompare(right, "ko-KR"));

  const currentValue = productClientName.value;
  productClientName.innerHTML = [
    '<option value="">거래처를 선택하세요.</option>',
    ...clients.map((client) => `<option value="${escapeHtml(client)}">${escapeHtml(client)}</option>`)
  ].join("");

  if (clients.includes(currentValue)) {
    productClientName.value = currentValue;
  }
}

async function saveProduct() {
  if (state.isSavingProduct) {
    return;
  }

  const payload = getProductFormPayload();
  const validationMessage = validateProductPayload(payload);

  if (validationMessage) {
    setFormMessage(validationMessage);
    return;
  }

  setProductSaving(true);
  setFormMessage("");

  try {
    const result = await requestApi("createProduct", payload);
    const productId = result?.productId ? ` (${result.productId})` : "";

    setFormMessage("제품이 저장되었습니다.", "success");
    await loadProducts();
    setProductSaving(false);
    closeProductModal();
    showToast(`신규 제품이 등록되었습니다.${productId}`);
  } catch (error) {
    setFormMessage(error.message || "제품 저장에 실패했습니다.");
  } finally {
    setProductSaving(false);
  }
}

function getProductFormPayload() {
  const boxQuantity = productBoxQuantity.value.trim();
  const trayQuantity = productTrayQuantity.value.trim();
  const usage = productForm.querySelector('input[name="productUsage"]:checked')?.value || "사용중";

  return {
    "등록자": session?.name || "Admin",
    "업체명": productClientName.value.trim(),
    "제품명": productNameInput.value.trim(),
    "색상": productColor.value.trim(),
    "사용 여부": usage,
    "박스당 수량": boxQuantity ? `${Number(boxQuantity).toLocaleString("ko-KR")} ea` : "",
    "트레이 수량": trayQuantity ? `${Number(trayQuantity).toLocaleString("ko-KR")} ea` : "",
    "비고": productNote.value.trim()
  };
}

function validateProductPayload(payload) {
  const requiredFields = [
    ["업체명", "거래처명을 선택해주세요."],
    ["제품명", "제품명을 입력해주세요."],
    ["사용 여부", "사용 여부를 선택해주세요."],
    ["박스당 수량", "박스당 수량을 입력해주세요."],
    ["트레이 수량", "트레이 수량을 입력해주세요."]
  ];

  const missing = requiredFields.find(([field]) => !payload[field]);
  if (missing) {
    return missing[1];
  }

  if (Number(productBoxQuantity.value) <= 0 || Number(productTrayQuantity.value) <= 0) {
    return "수량은 1 이상의 숫자로 입력해주세요.";
  }

  return "";
}

function setProductSaving(isSaving) {
  state.isSavingProduct = isSaving;
  saveProductButton.disabled = isSaving;
  saveProductButton.textContent = isSaving ? "저장 중" : "저장";
  productForm.querySelectorAll("input, select, textarea, button").forEach((element) => {
    if (element.id === "productCodePreview") {
      element.disabled = true;
      return;
    }

    if (element.id !== "saveProductButton") {
      element.disabled = isSaving;
    }
  });
  productCodePreview.disabled = true;
}

function setFormMessage(message, type = "error") {
  productFormMessage.textContent = message;
  productFormMessage.classList.toggle("success", type === "success");
}

function pageButton(label, page, disabled, icon, active = false) {
  const iconMarkup = {
    left: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>',
    "double-left": '<svg viewBox="0 0 24 24"><path d="m11 18-6-6 6-6M19 18l-6-6 6-6" /></svg>',
    "double-right": '<svg viewBox="0 0 24 24"><path d="m13 18 6-6-6-6M5 18l6-6-6-6" /></svg>'
  }[icon];

  return `
    <button type="button" class="${active ? "active" : ""}" data-page="${page}" ${disabled ? "disabled" : ""} aria-label="${label}">
      ${iconMarkup || label}
    </button>
  `;
}

function getPageNumbers(pageCount, currentPage) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(pageCount, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function renderColor(color) {
  const value = String(color || "").trim();
  if (!value || value === "-") {
    return "-";
  }

  return `<span class="color-chip"><i style="background:${getColorValue(value)}"></i>${escapeHtml(value)}</span>`;
}

function normalizeDisplayValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

function getColorValue(color) {
  const normalized = color.replace(/\s+/g, "");
  const map = {
    투명: "linear-gradient(135deg, #ffffff 0 45%, #dbe4ef 45% 55%, #ffffff 55% 100%)",
    아이보리: "#eee6cf",
    화이트: "#ffffff",
    흰색: "#ffffff",
    블랙: "#111111",
    검정: "#111111",
    베이지: "#ead9b4",
    연두: "#a6d68b",
    크라프트: "#c99254",
    네이비: "#082a62",
    레드: "#c91818",
    빨강: "#c91818"
  };

  return map[normalized] || "#d8e1ee";
}

function setStatus(message, type = "info") {
  tableStatus.textContent = message;
  tableStatus.dataset.type = type;
  tableStatus.hidden = !message;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
