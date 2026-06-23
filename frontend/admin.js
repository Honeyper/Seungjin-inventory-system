const API_URL = "https://script.google.com/macros/s/AKfycbyPiTM2wEZ5d549g0R8pqLQB2FKE0Hz-7h_GYGfA_MVUq45-F3tTyITbT4A-yJ1ZldOCA/exec";

const session = JSON.parse(sessionStorage.getItem("seungjinAdminSession") || "null");

if (!session || session.role !== "admin") {
  location.replace("./index.html");
}

const state = {
  products: [],
  filteredProducts: [],
  page: 1,
  pageSize: 10,
  query: ""
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

adminUserName.textContent = session?.name || "관리자";

document.querySelector("#newProductButton").addEventListener("click", () => {
  showToast("신규 제품 등록 화면은 다음 단계에서 연결됩니다.");
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

loadProducts();

async function loadProducts() {
  setStatus("제품 정보를 불러오는 중입니다.");

  try {
    const result = await requestApi("getProducts");
    state.products = Array.isArray(result.products) ? result.products : [];
    applyFilters();
  } catch (error) {
    state.products = [];
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
          <button class="row-action" type="button" data-product="${escapeHtml(product.productCode)}" aria-label="제품 관리">
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
    button.addEventListener("click", () => {
      showToast("제품 상세보기와 수정 화면은 다음 단계에서 연결됩니다.");
    });
  });

  productCountLabel.textContent = `전체 ${total.toLocaleString("ko-KR")}건`;
  setStatus(total ? "" : "등록된 제품이 없습니다.");
  renderPagination(pageCount);
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
  if (!value) {
    return "-";
  }

  return `<span class="color-chip"><i style="background:${getColorValue(value)}"></i>${escapeHtml(value)}</span>`;
}

function getColorValue(color) {
  const normalized = color.replace(/\s+/g, "");
  const map = {
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
