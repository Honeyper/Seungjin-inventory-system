const API_URL = "https://script.google.com/macros/s/AKfycbyPiTM2wEZ5d549g0R8pqLQB2FKE0Hz-7h_GYGfA_MVUq45-F3tTyITbT4A-yJ1ZldOCA/exec";
const MAX_INVOICE_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DEFECT_PHOTO_FILE_SIZE = 10 * 1024 * 1024;

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

const DEFECT_REASON_TONES = {
  "미검수": "dark",
  "양호": "good",
  "스크레치": "pink",
  "흑점": "coral",
  "돌돌이": "red",
  "미상의 얼룩": "red",
  "오목/볼록": "light",
  "가스 불량": "gray"
};

const INVENTORY_STOCK_STATUSES = ["보관", "작업중", "검수완료", "보류", "폐기", "출고대기", "출고완료"];

const session = JSON.parse(sessionStorage.getItem("seungjinAdminSession") || "null");

if (!session || session.role !== "admin") {
  location.replace("./index.html");
}

const state = {
  products: [],
  filteredProducts: [],
  todayInbounds: [],
  inventoryRows: [],
  filteredInventoryRows: [],
  inventoryLocationBoxStats: [],
  inventoryLocationQuantityStats: [],
  inventoryPage: 1,
  inventoryPageSize: 10,
  inventoryLoaded: false,
  inventoryFilters: {
    query: "",
    client: "",
    storage: "",
    stock: "",
    process: ""
  },
  page: 1,
  pageSize: 10,
  inboundPageSize: 10,
  query: "",
  clientFilter: "",
  inboundListQuery: "",
  isSavingProduct: false,
  isSavingInbound: false,
  isSavingExistingStock: false,
  isSavingInboundEdit: false,
  isRefreshingInbounds: false,
  isDeletingProduct: false,
  isDeletingInbound: false,
  isLoadingInboundQrs: false,
  productFormMode: "create",
  editingProductCode: "",
  activeDetailProductCode: "",
  activeDetailInboundId: "",
  activeQrInboundId: "",
  activeMenuProductCode: "",
  activeMenuButton: null,
  activeInboundMenuRecord: "",
  activeInboundMenuButton: null,
  activeShippingInspectionRow: null,
  inboundProductPickerQuery: "",
  inboundProductPickerTarget: "inbound",
  inboundPreviewUrls: {
    invoice: "",
    defect: ""
  },
  selectedDefectReasons: [],
  inboundEditDefectReasons: [],
  inboundSort: {
    column: null,
    direction: "asc"
  }
};

const adminUserName = document.querySelector("#adminUserName");
const productTotal = document.querySelector("#productTotal");
const clientTotal = document.querySelector("#clientTotal");
const recentDate = document.querySelector("#recentDate");
const productSearch = document.querySelector("#productSearch");
const productClientFilter = document.querySelector("#productClientFilter");
const productTableBody = document.querySelector("#productTableBody");
const productCountLabel = document.querySelector("#productCountLabel");
const pagination = document.querySelector("#pagination");
const pageSizeSelect = document.querySelector("#pageSizeSelect");
const tableStatus = document.querySelector("#tableStatus");
const toast = document.querySelector("#toast");
const productModal = document.querySelector("#productModal");
const productModalTitle = document.querySelector("#productModalTitle");
const productModalDescription = document.querySelector("#productModalDescription");
const productForm = document.querySelector("#productForm");
const productCodePreview = document.querySelector("#productCodePreview");
const productClientName = document.querySelector("#productClientName");
const productNameInput = document.querySelector("#productNameInput");
const productColor = document.querySelector("#productColor");
const productOrderQuantity = document.querySelector("#productOrderQuantity");
const productDueDate = document.querySelector("#productDueDate");
const productBoxQuantity = document.querySelector("#productBoxQuantity");
const productTrayQuantity = document.querySelector("#productTrayQuantity");
const productNote = document.querySelector("#productNote");
const productFormMessage = document.querySelector("#productFormMessage");
const saveProductButton = document.querySelector("#saveProductButton");
const rowActionMenu = document.querySelector("#rowActionMenu");
const inboundRowActionMenu = document.querySelector("#inboundRowActionMenu");
const productDetailModal = document.querySelector("#productDetailModal");
const productDetailContent = document.querySelector("#productDetailContent");
const inboundDetailModal = document.querySelector("#inboundDetailModal");
const inboundDetailContent = document.querySelector("#inboundDetailContent");
const inboundDetailTitle = document.querySelector("#inboundDetailTitle");
const inboundDetailDescription = document.querySelector("#inboundDetailTitle")?.nextElementSibling;
const closeInboundDetailButton = document.querySelector("#closeInboundDetailButton");
const editInboundFromDetailButton = document.querySelector("#editInboundFromDetailButton");
const saveInboundEditButton = document.querySelector("#saveInboundEditButton");
const inboundQrModal = document.querySelector("#inboundQrModal");
const inboundQrTitle = document.querySelector("#inboundQrTitle");
const inboundQrSubtitle = document.querySelector("#inboundQrSubtitle");
const inboundQrSheet = document.querySelector("#inboundQrSheet");
const closeInboundQrModalButton = document.querySelector("#closeInboundQrModal");
const closeInboundQrButton = document.querySelector("#closeInboundQrButton");
const printInboundQrButton = document.querySelector("#printInboundQrButton");
const inboundTime = document.querySelector("#inboundTime");
const inboundDate = document.querySelector("#inboundDate");
const inboundType = document.querySelector("#inboundType");
const inboundDueDate = document.querySelector("#inboundDueDate");
const inboundClient = document.querySelector("#inboundClient");
const editInboundClientButton = document.querySelector("#editInboundClientButton");
const inboundBoxQty = document.querySelector("#inboundBoxQty");
const editInboundBoxQtyButton = document.querySelector("#editInboundBoxQtyButton");
const inboundTrayQty = document.querySelector("#inboundTrayQty");
const editInboundTrayQtyButton = document.querySelector("#editInboundTrayQtyButton");
const inboundNote = document.querySelector("#inboundNote");
const editInboundNoteButton = document.querySelector("#editInboundNoteButton");
const inboundProductName = document.querySelector("#inboundProductName");
const inboundProductId = document.querySelector("#inboundProductId");
const inboundRegistrant = document.querySelector("#inboundRegistrant");
const inboundBatch = document.querySelector("#inboundBatch");
const inboundProcess = document.querySelector("#inboundProcess");
const inboundStorage = document.querySelector("#inboundStorage");
const inboundBoxCount = document.querySelector("#inboundBoxCount");
const inboundRemainQty = document.querySelector("#inboundRemainQty");
const inboundDefectQty = document.querySelector("#inboundDefectQty");
const inboundSubmitButton = document.querySelector("#inboundSubmitButton");
const inboundTableBody = document.querySelector("#inboundTableBody");
const inboundCountLabel = document.querySelector("#inboundCountLabel");
const inboundPagination = document.querySelector("#inboundPagination");
const inboundPageSizeSelect = document.querySelector("#inboundPageSizeSelect");
const refreshInboundListButton = document.querySelector("#refreshInboundListButton");
const inboundListSearch = document.querySelector("#inboundListSearch");
const inboundListStartDate = document.querySelector("#inboundListStartDate");
const inboundListEndDate = document.querySelector("#inboundListEndDate");
const inboundProductSearchTrigger = document.querySelector("#inboundProductSearchTrigger");
const inboundProductPickerModal = document.querySelector("#inboundProductPickerModal");
const inboundProductPickerSearch = document.querySelector("#inboundProductPickerSearch");
const inboundProductPickerList = document.querySelector("#inboundProductPickerList");
const inboundProductPickerEmpty = document.querySelector("#inboundProductPickerEmpty");
const inboundInvoiceFile = document.querySelector("#inboundInvoiceFile");
const inboundInvoiceUploadButton = document.querySelector("#inboundInvoiceUploadButton");
const inboundInvoicePreview = document.querySelector("#inboundInvoicePreview");
const inboundDefectFiles = document.querySelector("#inboundDefectFiles");
const inboundDefectUploadButton = document.querySelector("#inboundDefectUploadButton");
const inboundDefectPreview = document.querySelector("#inboundDefectPreview");
const inboundDefectCount = document.querySelector("#inboundDefectCount");
const inboundDefectReasonSelect = document.querySelector("#inboundDefectReasonSelect");
const inboundDefectReasonButton = document.querySelector("#inboundDefectReasonButton");
const inboundDefectReasonPanel = document.querySelector("#inboundDefectReasonPanel");
const inboundDefectReasonValue = document.querySelector("#inboundDefectReasonValue");
const inboundDefectReasonInput = document.querySelector("#inboundDefectReason");
const viewLinks = document.querySelectorAll("[data-view-link]");
const pageViews = document.querySelectorAll("[data-view]");
const inventoryTotalItems = document.querySelector("#inventoryTotalItems");
const inventoryTotalBoxes = document.querySelector("#inventoryTotalBoxes");
const inventoryTotalQuantity = document.querySelector("#inventoryTotalQuantity");
const inventoryDueSoonCount = document.querySelector("#inventoryDueSoonCount");
const inventoryPrintWaiting = document.querySelector("#inventoryPrintWaiting");
const inventoryUnspecifiedStorage = document.querySelector("#inventoryUnspecifiedStorage");
const inventoryLongStorage = document.querySelector("#inventoryLongStorage");
const inventoryHoldDiscard = document.querySelector("#inventoryHoldDiscard");
const inventorySearch = document.querySelector("#inventorySearch");
const inventoryClientFilter = document.querySelector("#inventoryClientFilter");
const inventoryStorageFilter = document.querySelector("#inventoryStorageFilter");
const inventoryStockFilter = document.querySelector("#inventoryStockFilter");
const inventoryProcessFilter = document.querySelector("#inventoryProcessFilter");
const inventoryTableBody = document.querySelector("#inventoryTableBody");
const inventoryCountLabel = document.querySelector("#inventoryCountLabel");
const inventoryPagination = document.querySelector("#inventoryPagination");
const inventoryPageSizeSelect = document.querySelector("#inventoryPageSizeSelect");
const inventoryLocationBoxBars = document.querySelector("#inventoryLocationBoxBars");
const inventoryLocationQuantityBars = document.querySelector("#inventoryLocationQuantityBars");
const inventoryLocationViewButtons = document.querySelectorAll("[data-inventory-location-view]");
const inventorySearchButtons = document.querySelectorAll(".inventory-search-button");
const inventoryResetButtons = document.querySelectorAll(".inventory-reset-button");
const inventoryAttentionButtons = document.querySelectorAll("[data-inventory-attention]");
const inventoryAttentionModal = document.querySelector("#inventoryAttentionModal");
const inventoryAttentionTitle = document.querySelector("#inventoryAttentionTitle");
const inventoryAttentionDescription = document.querySelector("#inventoryAttentionDescription");
const inventoryAttentionList = document.querySelector("#inventoryAttentionList");
const inventoryAttentionEmpty = document.querySelector("#inventoryAttentionEmpty");
const closeInventoryAttentionModalButton = document.querySelector("#closeInventoryAttentionModal");
const shippingInspectionModal = document.querySelector("#shippingInspectionModal");
const shippingInspectionForm = document.querySelector("#shippingInspectionForm");
const shippingInspectionMessage = document.querySelector("#shippingInspectionMessage");
const shippingInspectorName = document.querySelector("#shippingInspectorName");
const shippingInspectionDate = document.querySelector("#shippingInspectionDate");
const shippingInspectionRecordId = document.querySelector("#shippingInspectionRecordId");
const shippingInspectionClient = document.querySelector("#shippingInspectionClient");
const shippingInspectionProduct = document.querySelector("#shippingInspectionProduct");
const shippingInspectionStorage = document.querySelector("#shippingInspectionStorage");
const openExistingStockModalButton = document.querySelector("#openExistingStockModalButton");
const existingStockModal = document.querySelector("#existingStockModal");
const existingStockForm = document.querySelector("#existingStockForm");
const existingStockProductName = document.querySelector("#existingStockProductName");
const existingStockClientName = document.querySelector("#existingStockClientName");
const existingStockProductId = document.querySelector("#existingStockProductId");
const existingStockRegistrant = document.querySelector("#existingStockRegistrant");
const existingStockDate = document.querySelector("#existingStockDate");
const existingStockBatch = document.querySelector("#existingStockBatch");
const existingStockProcess = document.querySelector("#existingStockProcess");
const existingStockStorage = document.querySelector("#existingStockStorage");
const existingStockBoxQuantity = document.querySelector("#existingStockBoxQuantity");
const existingStockBoxCount = document.querySelector("#existingStockBoxCount");
const existingStockRemainQuantity = document.querySelector("#existingStockRemainQuantity");
const existingStockNote = document.querySelector("#existingStockNote");
const existingStockFormMessage = document.querySelector("#existingStockFormMessage");
const saveExistingStockButton = document.querySelector("#saveExistingStockButton");
const existingStockProductSearchButton = document.querySelector("#existingStockProductSearchButton");
const inboundSortButtons = document.querySelectorAll("[data-inbound-sort]");
const inboundNumberInputs = [
  ["#inboundBoxQty", "#calcBoxQty"],
  ["#inboundBoxCount", "#calcBoxCount"],
  ["#inboundTrayQty", "#calcTrayQty"],
  ["#inboundRemainQty", "#calcRemainQty"],
  ["#inboundDefectQty", "#calcDefectQty"]
].map(([inputSelector, outputSelector]) => ({
  input: document.querySelector(inputSelector),
  output: document.querySelector(outputSelector)
}));

adminUserName.textContent = session?.name || "관리자";
inboundRegistrant.value = session?.name || "Admin";
if (existingStockRegistrant) {
  existingStockRegistrant.value = session?.name || "Admin";
}

document.querySelector("#newProductButton").addEventListener("click", () => {
  openProductModal();
});

viewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const view = link.dataset.viewLink;

    if (!view) {
      return;
    }

    event.preventDefault();
    location.hash = view;
    setActiveView(view);
  });
});

window.addEventListener("hashchange", () => {
  setActiveView(getCurrentView());
});

inboundNumberInputs.forEach(({ input }) => {
  input?.addEventListener("input", updateInboundSummary);
});

inboundSortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sortInboundRows(Number(button.dataset.inboundSort), button);
  });
});

inboundDefectReasonButton?.addEventListener("click", () => {
  const isOpen = inboundDefectReasonButton.getAttribute("aria-expanded") === "true";
  setInboundDefectReasonOpen(!isOpen);
});

inboundDefectReasonPanel?.querySelectorAll("[data-defect-reason]").forEach((button) => {
  button.addEventListener("click", () => {
    toggleInboundDefectReason(button.dataset.defectReason);
  });
});

inboundSubmitButton?.addEventListener("click", saveInbound);
refreshInboundListButton?.addEventListener("click", refreshTodayInbounds);
inboundListSearch?.addEventListener("input", (event) => {
  state.inboundListQuery = event.target.value.trim().toLowerCase();
  renderTodayInbounds();
});
inboundPageSizeSelect?.addEventListener("change", (event) => {
  state.inboundPageSize = Number(event.target.value) || 10;
  renderTodayInbounds();
});
inboundListStartDate?.addEventListener("change", () => {
  normalizeInboundListDateRange("start");
  refreshTodayInbounds();
});
inboundListEndDate?.addEventListener("change", () => {
  normalizeInboundListDateRange("end");
  refreshTodayInbounds();
});
inventorySearch?.addEventListener("input", (event) => {
  state.inventoryFilters.query = event.target.value.trim().toLowerCase();
  state.inventoryPage = 1;
  applyInventoryFilters();
});
[inventoryClientFilter, inventoryStorageFilter, inventoryStockFilter, inventoryProcessFilter].forEach((select) => {
  select?.addEventListener("change", () => {
    syncInventoryFilterState();
    state.inventoryPage = 1;
    applyInventoryFilters();
  });
});
inventorySearchButtons.forEach((button) => {
  button.addEventListener("click", () => loadInventoryDashboard());
});
inventoryResetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    resetInventoryFilters();
    applyInventoryFilters();
  });
});
inventoryAttentionButtons.forEach((button) => {
  button.addEventListener("click", () => openInventoryAttentionModal(button.dataset.inventoryAttention));
});
inventoryLocationViewButtons.forEach((button) => {
  button.addEventListener("click", () => openInventoryLocationModal(button.dataset.inventoryLocationView));
});
closeInventoryAttentionModalButton?.addEventListener("click", closeInventoryAttentionModal);
document.querySelector("#closeShippingInspectionModal")?.addEventListener("click", closeShippingInspectionModal);
document.querySelector("#cancelShippingInspectionModal")?.addEventListener("click", closeShippingInspectionModal);
shippingInspectionForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveShippingInspection();
});
document.querySelectorAll('[data-shipping-action="inspect"]').forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.shippingAction !== "inspect") {
      return;
    }

    openShippingInspectionModal(button.closest("tr"));
  });
});

openExistingStockModalButton?.addEventListener("click", openExistingStockModal);
document.querySelector("#closeExistingStockModal")?.addEventListener("click", closeExistingStockModal);
document.querySelector("#cancelExistingStockModal")?.addEventListener("click", closeExistingStockModal);
existingStockProductSearchButton?.addEventListener("click", () => openInboundProductPicker("existingStock"));
existingStockForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveExistingStock();
});
inventoryPageSizeSelect?.addEventListener("change", (event) => {
  state.inventoryPageSize = Number(event.target.value) || 10;
  state.inventoryPage = 1;
  renderInventoryTable();
});

inboundInvoiceUploadButton?.addEventListener("click", () => inboundInvoiceFile?.click());
inboundDefectUploadButton?.addEventListener("click", () => inboundDefectFiles?.click());
inboundInvoiceFile?.addEventListener("change", () => {
  renderInboundFilePreview({
    input: inboundInvoiceFile,
    preview: inboundInvoicePreview,
    tile: inboundInvoiceUploadButton,
    key: "invoice"
  });
});
inboundDefectFiles?.addEventListener("change", () => {
  renderInboundFilePreview({
    input: inboundDefectFiles,
    preview: inboundDefectPreview,
    tile: inboundDefectUploadButton,
    key: "defect",
    badge: inboundDefectCount
  });
});

editInboundClientButton.addEventListener("click", () => {
  setInboundClientEditable(inboundClient.disabled);
});
editInboundBoxQtyButton.addEventListener("click", () => {
  setInboundLockedFieldEditable(inboundBoxQty, editInboundBoxQtyButton, inboundBoxQty.disabled);
});
editInboundTrayQtyButton.addEventListener("click", () => {
  setInboundLockedFieldEditable(inboundTrayQty, editInboundTrayQtyButton, inboundTrayQty.disabled);
});
editInboundNoteButton.addEventListener("click", () => {
  setInboundLockedFieldEditable(inboundNote, editInboundNoteButton, inboundNote.disabled);
});

inboundProductSearchTrigger.addEventListener("click", openInboundProductPicker);
inboundProductName.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openInboundProductPicker();
  }
});

document.querySelector("#closeInboundProductPicker").addEventListener("click", closeInboundProductPicker);

inboundProductPickerSearch.addEventListener("input", (event) => {
  state.inboundProductPickerQuery = event.target.value.trim().toLowerCase();
  renderInboundProductPicker();
});

productSearch.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  state.page = 1;
  applyFilters();
});

productClientFilter.addEventListener("change", (event) => {
  state.clientFilter = event.target.value;
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
document.querySelector("#editProductFromDetailButton").addEventListener("click", openDetailProductEdit);
document.querySelector("#closeInboundDetailModal").addEventListener("click", closeInboundDetailModal);
closeInboundDetailButton?.addEventListener("click", closeInboundDetailModal);
editInboundFromDetailButton?.addEventListener("click", openDetailInboundEdit);
saveInboundEditButton?.addEventListener("click", saveInboundEdit);
closeInboundQrModalButton?.addEventListener("click", closeInboundQrModal);
closeInboundQrButton?.addEventListener("click", closeInboundQrModal);
printInboundQrButton?.addEventListener("click", () => window.print());

document.addEventListener("click", (event) => {
  if (
    inboundDefectReasonSelect &&
    inboundDefectReasonButton?.getAttribute("aria-expanded") === "true" &&
    !inboundDefectReasonSelect.contains(event.target)
  ) {
    setInboundDefectReasonOpen(false);
  }
});

document.addEventListener("click", (event) => {
  const editReasonSelect = document.querySelector("#inboundEditDefectReasonSelect");
  const editReasonButton = document.querySelector("#inboundEditDefectReasonButton");

  if (
    editReasonSelect &&
    editReasonButton?.getAttribute("aria-expanded") === "true" &&
    !editReasonSelect.contains(event.target)
  ) {
    setInboundEditDefectReasonOpen(false);
  }
});

document.addEventListener("click", (event) => {
  if (rowActionMenu.hidden) {
    return;
  }

  const clickedActionButton = event.target.closest("[data-product]");
  if (!rowActionMenu.contains(event.target) && !clickedActionButton) {
    closeRowActionMenu();
  }
});

document.addEventListener("click", (event) => {
  if (inboundRowActionMenu.hidden) {
    return;
  }

  const clickedActionButton = event.target.closest("[data-inbound-record]");
  if (!inboundRowActionMenu.contains(event.target) && !clickedActionButton) {
    closeInboundRowActionMenu();
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

  if (!inboundRowActionMenu.hidden) {
    closeInboundRowActionMenu();
    return;
  }

  if (inboundDefectReasonButton?.getAttribute("aria-expanded") === "true") {
    setInboundDefectReasonOpen(false);
    return;
  }

  if (!productDetailModal.hidden) {
    closeProductDetailModal();
    return;
  }

  if (document.querySelector("#inboundEditDefectReasonButton")?.getAttribute("aria-expanded") === "true") {
    setInboundEditDefectReasonOpen(false);
    return;
  }

  if (!inboundDetailModal.hidden) {
    closeInboundDetailModal();
    return;
  }

  if (!inboundProductPickerModal.hidden) {
    closeInboundProductPicker();
    return;
  }

  if (inventoryAttentionModal && !inventoryAttentionModal.hidden) {
    closeInventoryAttentionModal();
    return;
  }

  if (shippingInspectionModal && !shippingInspectionModal.hidden) {
    closeShippingInspectionModal();
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

rowActionMenu.querySelector('[data-menu-action="edit"]').addEventListener("click", (event) => {
  event.stopPropagation();
  openActiveProductEdit();
});

inboundRowActionMenu.querySelectorAll("[data-inbound-menu-action]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const action = button.dataset.inboundMenuAction;

    if (action === "delete") {
      deleteActiveInbound();
      return;
    }

    if (action === "view") {
      openActiveInboundDetail();
      return;
    }

    if (action === "edit") {
      openActiveInboundEdit();
      return;
    }

    closeInboundRowActionMenu();
  });
});

window.addEventListener("resize", () => {
  closeRowActionMenu();
  closeInboundRowActionMenu();
});
window.addEventListener("scroll", () => {
  closeRowActionMenu();
  closeInboundRowActionMenu();
}, true);

setCurrentInboundDate();
setCurrentInboundListDateRange();
loadProducts();
loadTodayInbounds();
setCurrentInboundTime();
setActiveView(getCurrentView());
updateInboundSummary();
renderInboundDefectReasons();

function getCurrentView() {
  const view = location.hash.replace("#", "");
  return ["inbound", "inventory", "shipping", "products"].includes(view) ? view : "inbound";
}

function setActiveView(view) {
  pageViews.forEach((pageView) => {
    pageView.hidden = pageView.dataset.view !== view;
  });

  viewLinks.forEach((link) => {
    const isActive = link.dataset.viewLink === view;
    link.classList.toggle("active", isActive);
    link.toggleAttribute("aria-current", isActive);
  });

  closeRowActionMenu();
  closeInboundRowActionMenu();

  if (view === "inventory" && !state.inventoryLoaded) {
    loadInventoryDashboard();
  }
}

function openShippingInspectionModal(row) {
  if (!row || !shippingInspectionModal) {
    return;
  }

  state.activeShippingInspectionRow = row;
  shippingInspectionRecordId.textContent = row.children[1]?.textContent.trim() || "-";
  shippingInspectionClient.textContent = row.children[2]?.textContent.trim() || "-";
  shippingInspectionProduct.textContent = row.children[3]?.textContent.trim() || "-";
  shippingInspectionStorage.textContent = row.children[6]?.textContent.trim() || "-";

  shippingInspectionForm?.reset();
  const goodReasonInput = shippingInspectionForm?.querySelector('input[name="shippingDefectReason"][value="양호"]');
  if (goodReasonInput) {
    goodReasonInput.checked = true;
  }

  if (shippingInspectorName) {
    shippingInspectorName.value = session?.name || "Admin";
  }

  if (shippingInspectionDate) {
    shippingInspectionDate.value = getLocalDateInputValue();
  }

  if (shippingInspectionMessage) {
    shippingInspectionMessage.textContent = "";
  }

  shippingInspectionModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeShippingInspectionModal() {
  if (!shippingInspectionModal) {
    return;
  }

  shippingInspectionModal.hidden = true;
  state.activeShippingInspectionRow = null;
  document.body.classList.remove("modal-open");
}

function saveShippingInspection() {
  const row = state.activeShippingInspectionRow;
  const selectedReasons = Array.from(
    shippingInspectionForm?.querySelectorAll('input[name="shippingDefectReason"]:checked') || []
  ).map((input) => input.value);

  if (!row) {
    return;
  }

  if (!selectedReasons.length) {
    if (shippingInspectionMessage) {
      shippingInspectionMessage.textContent = "불량내역을 하나 이상 선택해주세요.";
    }
    return;
  }

  const hasGoodReason = selectedReasons.includes("양호");
  const inspectionCell = row.children[9];
  const anomalyCell = row.children[10];
  const statusCell = row.children[12];
  const actionCell = row.children[13];

  inspectionCell.innerHTML = '<span class="shipping-badge done">검수 완료</span>';
  anomalyCell.textContent = hasGoodReason ? "정상" : "이상";
  statusCell.innerHTML = hasGoodReason
    ? '<span class="shipping-badge ready">검수 완료</span>'
    : '<span class="shipping-badge hold">출고 보류</span>';

  const actionButton = actionCell.querySelector("button");
  if (actionButton) {
    actionButton.removeAttribute("data-shipping-action");
    actionButton.classList.toggle("primary", hasGoodReason);
    actionButton.textContent = hasGoodReason ? "출고 처리" : "사진 보기";
  }

  closeShippingInspectionModal();
}

function updateInboundSummary() {
  inboundNumberInputs.forEach(({ input, output }) => {
    if (!input || !output) {
      return;
    }

    const rawValue = input.value.trim();
    output.textContent = rawValue ? Number(rawValue).toLocaleString("ko-KR") : "-";
  });

  const totalOutput = document.querySelector("#calcTotalQty");
  const totalBoxOutput = document.querySelector("#calcTotalBoxCount");
  const orderQuantityOutput = document.querySelector("#calcOrderQty");
  const accumulatedOrderQuantityOutput = document.querySelector("#calcAccumulatedOrderQty");
  const currentInboundQuantityOutput = document.querySelector("#calcCurrentInboundQty");
  const orderProgressBar = document.querySelector("#calcOrderProgressBar");
  const orderProgressAddBar = document.querySelector("#calcOrderProgressAddBar");
  const orderProgressText = document.querySelector("#calcOrderProgressText");
  const boxQuantityInput = document.querySelector("#inboundBoxQty");
  const boxCountInput = document.querySelector("#inboundBoxCount");
  const remainQuantityInput = document.querySelector("#inboundRemainQty");
  const hasQuantityValue = [boxQuantityInput, boxCountInput, remainQuantityInput].some((input) => input?.value.trim());
  const boxQuantity = Number(boxQuantityInput?.value || 0);
  const boxCount = Number(boxCountInput?.value || 0);
  const remainQuantity = Number(remainQuantityInput?.value || 0);
  const totalBoxCount = boxCount + (remainQuantity > 0 ? 1 : 0);
  const currentInboundQuantity = boxQuantity * boxCount + remainQuantity;

  if (totalOutput) {
    totalOutput.textContent = hasQuantityValue ? currentInboundQuantity.toLocaleString("ko-KR") : "-";
  }

  if (totalBoxOutput) {
    totalBoxOutput.textContent = hasQuantityValue ? totalBoxCount.toLocaleString("ko-KR") : "-";
  }

  const selectedProduct = getProductByCode(inboundProductId?.value.trim());
  const orderQuantity = selectedProduct ? getQuantityNumberFromText(selectedProduct.orderQuantity) : 0;
  const accumulatedQuantity = selectedProduct ? getQuantityNumberFromText(selectedProduct.accumulatedInboundQuantity) : 0;
  const progressRate = orderQuantity > 0 ? Math.round((accumulatedQuantity / orderQuantity) * 100) : 0;
  const incomingQuantity = selectedProduct && hasQuantityValue ? currentInboundQuantity : 0;
  const nextAccumulatedQuantity = accumulatedQuantity + incomingQuantity;
  const nextProgressRate = orderQuantity > 0 ? Math.round((nextAccumulatedQuantity / orderQuantity) * 100) : 0;
  const progressWidth = Math.max(0, Math.min(progressRate, 100));
  const nextProgressWidth = Math.max(0, Math.min(nextProgressRate, 100));
  const incomingProgressWidth = Math.max(0, nextProgressWidth - progressWidth);

  if (orderQuantityOutput) {
    orderQuantityOutput.textContent = orderQuantity > 0 ? orderQuantity.toLocaleString("ko-KR") : "-";
  }

  if (accumulatedOrderQuantityOutput) {
    accumulatedOrderQuantityOutput.textContent = selectedProduct ? accumulatedQuantity.toLocaleString("ko-KR") : "-";
  }

  if (currentInboundQuantityOutput) {
    currentInboundQuantityOutput.textContent = incomingQuantity > 0 ? incomingQuantity.toLocaleString("ko-KR") : "-";
  }

  if (orderProgressBar) {
    orderProgressBar.style.width = `${progressWidth}%`;
  }

  if (orderProgressAddBar) {
    orderProgressAddBar.style.left = `${progressWidth}%`;
    orderProgressAddBar.style.width = `${incomingProgressWidth}%`;
  }

  if (orderProgressText) {
    orderProgressText.innerHTML = selectedProduct
      ? `입고량 대비 <span class="summary-progress-rate">${progressRate.toLocaleString("ko-KR")}%</span>${incomingQuantity > 0 ? ` → <span class="summary-progress-rate summary-progress-rate-next">${nextProgressRate.toLocaleString("ko-KR")}%</span>` : ""} 진행`
      : "제품을 선택해주세요.";
  }
}

async function saveInbound() {
  if (state.isSavingInbound) {
    return;
  }

  const payload = getInboundPayload();
  const validationMessage = validateInboundPayload(payload);

  if (validationMessage) {
    showToast(validationMessage);
    return;
  }

  setInboundSaving(true);

  try {
    payload.invoiceFile = await getInboundInvoicePayload();
    payload.defectFiles = await getInboundDefectFilePayloads();
    const result = await requestApi("createInbound", payload);
    const managementId = result?.managementId ? ` (${result.managementId})` : "";
    await loadProducts();
    await loadTodayInbounds();
    if (state.inventoryLoaded) {
      await loadInventoryDashboard(false);
    }
    updateInboundSummary();
    showToast(`입고 등록이 저장되었습니다.${managementId}`);
  } catch (error) {
    showToast(error.message || "입고 등록 저장에 실패했습니다.");
  } finally {
    setInboundSaving(false);
  }
}

function getInboundPayload() {
  const boxQuantity = getNumberValue(inboundBoxQty);
  const inboundBoxValue = getNumberValue(inboundBoxCount);
  const remainQuantity = getNumberValue(inboundRemainQty);
  const inspectionQuantity = getNumberValue(inboundTrayQty);
  const defectQuantity = getNumberValue(inboundDefectQty);
  const totalBoxCount = inboundBoxValue + (remainQuantity > 0 ? 1 : 0);
  const totalQuantity = boxQuantity * inboundBoxValue + remainQuantity;

  return {
    registrant: inboundRegistrant.value.trim() || session?.name || "Admin",
    inboundDate: inboundDate.value.trim(),
    inboundTime: inboundTime.value.trim(),
    inboundType: inboundType.value.trim(),
    dueDate: inboundDueDate.value.trim(),
    productName: inboundProductName.value.trim(),
    productId: inboundProductId.value.trim(),
    clientName: inboundClient.value.trim(),
    batch: inboundBatch.value.trim(),
    process: inboundProcess.value.trim(),
    storage: inboundStorage.value.trim(),
    note: inboundNote.value.trim(),
    boxQuantity,
    inboundBoxCount: inboundBoxValue,
    remainQuantity,
    boxTotalCount: totalBoxCount,
    inboundTotalQuantity: totalQuantity,
    inspectionQuantity,
    defectQuantity,
    defectReason: inboundDefectReasonInput.value.trim()
  };
}

async function getInboundInvoicePayload() {
  return getFilePayloadFromInput(inboundInvoiceFile, {
    label: "거래명세서",
    maxSize: MAX_INVOICE_FILE_SIZE
  });
}

async function getInboundDefectFilePayloads() {
  return getFilePayloadsFromInput(inboundDefectFiles, {
    label: "불량사진",
    maxSize: MAX_DEFECT_PHOTO_FILE_SIZE
  });
}

async function getFilePayloadFromInput(input, { label, maxSize }) {
  const file = input?.files?.[0];

  if (!file) {
    return null;
  }

  return getFilePayload(file, { label, maxSize });
}

async function getFilePayloadsFromInput(input, { label, maxSize }) {
  const files = Array.from(input?.files || []);

  if (!files.length) {
    return [];
  }

  return Promise.all(files.map((file) => getFilePayload(file, { label, maxSize })));
}

async function getFilePayload(file, { label, maxSize }) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${label}는 이미지 파일만 업로드할 수 있습니다.`);
  }

  if (file.size > maxSize) {
    throw new Error(`${label} 파일은 개별 10MB 이하로 등록해주세요.`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const base64Data = dataUrl.split(",")[1] || "";

  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data: base64Data
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("파일을 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

function validateInboundPayload(payload) {
  const requiredFields = [
    ["inboundDate", "입고일을 입력해주세요."],
    ["inboundTime", "입고 시간을 입력해주세요."],
    ["inboundType", "입고 유형을 선택해주세요."],
    ["productName", "제품을 선택해주세요."],
    ["productId", "제품 ID를 확인해주세요."],
    ["clientName", "거래처명을 입력해주세요."],
    ["process", "최종공정을 선택해주세요."],
    ["storage", "보관위치를 선택해주세요."],
    ["defectReason", "불량 사유를 선택해주세요."]
  ];

  const missing = requiredFields.find(([field]) => !payload[field]);
  if (missing) {
    return missing[1];
  }

  const positiveNumberFields = [
    ["boxQuantity", "박스당 수량"],
    ["inboundBoxCount", "입고 박스 수"],
    ["inspectionQuantity", "검수 수량"]
  ];

  const invalidPositive = positiveNumberFields.find(([field]) => !Number.isFinite(payload[field]) || payload[field] <= 0);
  if (invalidPositive) {
    return `${invalidPositive[1]}은 1 이상의 숫자로 입력해주세요.`;
  }

  const zeroNumberFields = [
    ["remainQuantity", "잔량"],
    ["defectQuantity", "불량 수량"]
  ];

  const invalidZero = zeroNumberFields.find(([field]) => !Number.isFinite(payload[field]) || payload[field] < 0);
  if (invalidZero) {
    return `${invalidZero[1]}은 0 이상의 숫자로 입력해주세요.`;
  }

  return "";
}

function setInboundSaving(isSaving) {
  state.isSavingInbound = isSaving;

  if (inboundSubmitButton) {
    inboundSubmitButton.disabled = isSaving;
    inboundSubmitButton.textContent = isSaving ? "등록 중" : "등록";
  }
}

function getNumberValue(input) {
  return Number(String(input?.value || 0).replaceAll(",", ""));
}

function setInboundDefectReasonOpen(isOpen) {
  if (!inboundDefectReasonButton || !inboundDefectReasonPanel) {
    return;
  }

  inboundDefectReasonButton.setAttribute("aria-expanded", String(isOpen));
  inboundDefectReasonPanel.hidden = !isOpen;
}

function toggleInboundDefectReason(reason) {
  if (!reason) {
    return;
  }

  const selectedReasons = new Set(state.selectedDefectReasons);

  if (selectedReasons.has(reason)) {
    selectedReasons.delete(reason);
  } else {
    selectedReasons.add(reason);
  }

  state.selectedDefectReasons = Array.from(selectedReasons);
  renderInboundDefectReasons();
}

function renderInboundDefectReasons() {
  if (!inboundDefectReasonValue || !inboundDefectReasonInput || !inboundDefectReasonPanel) {
    return;
  }

  inboundDefectReasonInput.value = state.selectedDefectReasons.join(", ");
  inboundDefectReasonValue.innerHTML = state.selectedDefectReasons.length
    ? state.selectedDefectReasons.map(renderDefectReasonPill).join("")
    : '<span class="multi-select-placeholder">선택하세요</span>';

  inboundDefectReasonPanel.querySelectorAll("[data-defect-reason]").forEach((button) => {
    const isSelected = state.selectedDefectReasons.includes(button.dataset.defectReason);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function renderDefectReasonPill(reason) {
  const tone = DEFECT_REASON_TONES[reason] || "gray";
  return `<span class="defect-pill defect-pill-${tone}">${escapeHtml(reason)}</span>`;
}

function getFilteredInbounds() {
  const query = state.inboundListQuery;

  if (!query) {
    return state.todayInbounds;
  }

  return state.todayInbounds.filter((item) => [
    item.managementId,
    item.clientName,
    item.inboundType,
    item.productId,
    item.productName,
    item.batch,
    item.process,
    item.storage,
    item.registrant,
    item.defectReason,
    item.note
  ].some((value) => String(value || "").toLowerCase().includes(query)));
}

function renderTodayInbounds(message = "") {
  if (!inboundTableBody || !inboundCountLabel) {
    return;
  }

  closeInboundRowActionMenu();

  const sourceCount = state.todayInbounds.length;
  const inbounds = getFilteredInbounds();
  const visibleInbounds = inbounds.slice(0, state.inboundPageSize);

  if (!sourceCount) {
    inboundTableBody.innerHTML = `
      <tr>
        <td colspan="17" class="empty-cell">${escapeHtml(message || "입고 내역이 없습니다.")}</td>
      </tr>
    `;
  } else if (!inbounds.length) {
    inboundTableBody.innerHTML = `
      <tr>
        <td colspan="17" class="empty-cell">검색 결과가 없습니다.</td>
      </tr>
    `;
  } else {
    inboundTableBody.innerHTML = visibleInbounds.map((item) => `
      <tr>
        <td>
          <button class="qr-action" type="button" data-qr-inbound="${escapeAttribute(item.managementId)}" aria-label="입고 QR 보기">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
              <path d="M14 14h2v2h-2zM18 14h2v6h-2zM14 18h2v2h-2z" />
            </svg>
          </button>
        </td>
        <td>${escapeHtml(formatInboundDateTime(item.inboundDate, item.inboundTime))}</td>
        <td>${escapeHtml(item.clientName)}</td>
        <td>${escapeHtml(item.inboundType)}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td>${escapeHtml(item.batch)}</td>
        <td>${escapeHtml(item.process)}</td>
        <td>${escapeHtml(item.boxQuantity)}</td>
        <td>${escapeHtml(item.inboundBoxCount)}</td>
        <td>${escapeHtml(item.remainQuantity)}</td>
        <td>${escapeHtml(item.inboundTotalQuantity)}</td>
        <td>${escapeHtml(item.boxTotalCount)}</td>
        <td>${escapeHtml(item.inspectionQuantity)}</td>
        <td>${escapeHtml(item.defectQuantity)}</td>
        <td>${escapeHtml(item.defectRate)}</td>
        <td>${escapeHtml(item.registrant)}</td>
        <td>
          <button class="row-action inbound-row-action" type="button" data-inbound-record="${escapeHtml(item.managementId)}" aria-label="입고 관리" aria-haspopup="menu" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
        </td>
      </tr>
    `).join("");
  }

  inboundTableBody.querySelectorAll("[data-inbound-record]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleInboundRowActionMenu(button);
    });
  });

  inboundTableBody.querySelectorAll("[data-qr-inbound]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openInboundQrModal(button.dataset.qrInbound);
    });
  });

  inboundCountLabel.textContent = state.inboundListQuery
    ? `검색 ${inbounds.length.toLocaleString("ko-KR")}건 / 전체 ${sourceCount.toLocaleString("ko-KR")}건`
    : `전체 ${sourceCount.toLocaleString("ko-KR")}건`;

  if (inboundPagination) {
    inboundPagination.innerHTML = `
      <button type="button" disabled aria-label="이전">
        <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <button type="button" class="active">1</button>
      <button type="button" disabled aria-label="다음">
        <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    `;
  }
}

function formatInboundDateTime(date, time) {
  const dateText = normalizeDisplayValue(date);
  const timeText = normalizeDisplayValue(time);
  return timeText === "-" ? dateText : `${dateText} ${timeText}`;
}

function sortInboundRows(columnIndex, activeButton) {
  const table = activeButton.closest("table");
  const tbody = table?.querySelector("tbody");

  if (!tbody || Number.isNaN(columnIndex)) {
    return;
  }

  const direction = state.inboundSort.column === columnIndex && state.inboundSort.direction === "asc"
    ? "desc"
    : "asc";
  const rows = Array.from(tbody.querySelectorAll("tr"));

  rows.sort((leftRow, rightRow) => {
    const leftValue = getInboundSortValue(leftRow.children[columnIndex]?.textContent || "");
    const rightValue = getInboundSortValue(rightRow.children[columnIndex]?.textContent || "");
    const result = compareInboundSortValues(leftValue, rightValue);
    return direction === "asc" ? result : -result;
  });

  rows.forEach((row) => tbody.appendChild(row));
  state.inboundSort = { column: columnIndex, direction };
  updateInboundSortButtons(activeButton, direction);
}

function getInboundSortValue(value) {
  const normalized = String(value || "").trim();
  const dateValue = normalized.match(/^\d{4}[-.]\d{1,2}[-.]\d{1,2}/)
    ? Date.parse(normalized.replace(/\./g, "-").replace(" ", "T"))
    : Number.NaN;

  if (!Number.isNaN(dateValue)) {
    return dateValue;
  }

  const numericValue = Number(normalized.replace(/,/g, "").match(/-?\d+(\.\d+)?/)?.[0]);

  if (!Number.isNaN(numericValue)) {
    return numericValue;
  }

  return normalized;
}

function compareInboundSortValues(leftValue, rightValue) {
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  return String(leftValue).localeCompare(String(rightValue), "ko-KR", {
    numeric: true,
    sensitivity: "base"
  });
}

function updateInboundSortButtons(activeButton, direction) {
  inboundSortButtons.forEach((button) => {
    const isActive = button === activeButton;
    const th = button.closest("th");
    const label = button.textContent.trim();

    button.dataset.direction = isActive ? direction : "";
    button.setAttribute(
      "aria-label",
      isActive ? `${label} ${direction === "asc" ? "오름차순" : "내림차순"} 정렬` : `${label} 정렬`
    );

    if (th) {
      th.setAttribute("aria-sort", isActive ? (direction === "asc" ? "ascending" : "descending") : "none");
    }
  });
}

function renderInboundFilePreview({ input, preview, tile, key, badge = null }) {
  const files = Array.from(input?.files || []);
  const file = files[0];

  if (state.inboundPreviewUrls[key]) {
    URL.revokeObjectURL(state.inboundPreviewUrls[key]);
    state.inboundPreviewUrls[key] = "";
  }

  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    tile.classList.remove("has-preview");
    if (badge) {
      badge.hidden = true;
      badge.textContent = "대표";
    }
    return;
  }

  if (!file.type.startsWith("image/")) {
    input.value = "";
    preview.hidden = true;
    preview.removeAttribute("src");
    tile.classList.remove("has-preview");
    showToast("이미지 파일만 미리보기할 수 있습니다.");
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  state.inboundPreviewUrls[key] = previewUrl;
  preview.src = previewUrl;
  preview.hidden = false;
  tile.classList.add("has-preview");

  if (badge) {
    badge.hidden = false;
    badge.textContent = files.length > 1 ? `대표 1/${files.length}` : "대표";
  }
}

function setInboundClientEditable(isEditable) {
  setInboundLockedFieldEditable(inboundClient, editInboundClientButton, isEditable);
}

function setInboundLockedFieldEditable(input, button, isEditable) {
  input.disabled = !isEditable;
  const actionLabel = isEditable ? "잠금" : "수정";
  const fieldLabel = button.getAttribute("aria-label")?.replace(/\s?(수정|잠금)$/, "") || "입력값";
  button.setAttribute("aria-label", `${fieldLabel} ${actionLabel}`);
  button.title = actionLabel;
  button.setAttribute("aria-pressed", String(isEditable));

  if (isEditable) {
    input.focus();
    input.select();
  }
}

function openInboundProductPicker(target = "inbound") {
  state.inboundProductPickerTarget = target;
  state.inboundProductPickerQuery = "";
  inboundProductPickerSearch.value = "";
  const isExistingStockTarget = target === "existingStock";
  document.querySelector("#inboundProductPickerTitle").textContent = "제품 선택";
  document.querySelector("#inboundProductPickerTitle").nextElementSibling.textContent = isExistingStockTarget
    ? "제품관리에 등록된 제품 목록에서 기존 재고 제품을 선택하세요."
    : "제품관리에 등록된 제품 목록에서 입고할 제품을 선택하세요.";
  renderInboundProductPicker();
  inboundProductPickerModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => inboundProductPickerSearch.focus(), 0);
}

function closeInboundProductPicker() {
  inboundProductPickerModal.hidden = true;
  if (productModal.hidden && productDetailModal.hidden && existingStockModal?.hidden !== false) {
    document.body.classList.remove("modal-open");
  }
}

function renderInboundProductPicker() {
  const query = state.inboundProductPickerQuery;
  const products = state.products.filter((product) => {
    if (!query) {
      return true;
    }

    return [
      product.productName,
      product.productCode,
      product.clientName,
      product.color
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });

  inboundProductPickerList.innerHTML = products.map((product) => `
    <button class="picker-product" type="button" data-product="${escapeHtml(product.productCode)}">
      <span class="picker-product-main">
        <strong>${escapeHtml(product.productName)}</strong>
        <em>${escapeHtml(product.productCode)}</em>
      </span>
      <span class="picker-product-meta">
        <span>${escapeHtml(product.clientName)}</span>
        <span>${renderColor(product.color)}</span>
        <span>박스당 ${escapeHtml(product.boxQuantity || "-")}</span>
        <span>트레이 ${escapeHtml(product.trayQuantity || "-")}</span>
      </span>
    </button>
  `).join("");

  inboundProductPickerEmpty.hidden = products.length > 0;

  inboundProductPickerList.querySelectorAll(".picker-product").forEach((button) => {
    button.addEventListener("click", () => {
      const product = getProductByCode(button.dataset.product);
      if (product) {
        if (state.inboundProductPickerTarget === "existingStock") {
          selectExistingStockProduct(product);
        } else {
          selectInboundProduct(product);
        }
      }
    });
  });
}

function selectInboundProduct(product) {
  inboundProductName.value = normalizeDisplayValue(product.productName);
  inboundProductId.value = normalizeDisplayValue(product.productCode);
  inboundClient.value = normalizeDisplayValue(product.clientName);
  setInboundClientEditable(false);

  const boxQuantity = extractQuantityNumber(product.boxQuantity);
  const trayQuantity = extractQuantityNumber(product.trayQuantity);

  if (boxQuantity) {
    inboundBoxQty.value = boxQuantity;
  }

  if (trayQuantity) {
    inboundTrayQty.value = trayQuantity;
  }

  inboundDueDate.value = toDateInputValue(product.dueDate);

  setInboundLockedFieldEditable(inboundBoxQty, editInboundBoxQtyButton, false);
  setInboundLockedFieldEditable(inboundTrayQty, editInboundTrayQtyButton, false);
  updateInboundSummary();
  closeInboundProductPicker();
}

function openExistingStockModal() {
  resetExistingStockForm();
  existingStockModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeExistingStockModal() {
  existingStockModal.hidden = true;
  if (productModal.hidden && productDetailModal.hidden && inboundProductPickerModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function resetExistingStockForm() {
  existingStockForm?.reset();
  existingStockProductName.value = "";
  existingStockClientName.value = "";
  existingStockProductId.value = "";
  existingStockRegistrant.value = session?.name || "Admin";
  existingStockDate.value = getLocalDateInputValue();
  existingStockRemainQuantity.value = "0";
  existingStockFormMessage.textContent = "";
  state.inboundProductPickerTarget = "inbound";
}

function selectExistingStockProduct(product) {
  existingStockProductName.value = normalizeDisplayValue(product.productName);
  existingStockProductId.value = normalizeDisplayValue(product.productCode);
  existingStockClientName.value = normalizeDisplayValue(product.clientName);

  const boxQuantity = extractQuantityNumber(product.boxQuantity);

  if (boxQuantity) {
    existingStockBoxQuantity.value = boxQuantity;
  }

  closeInboundProductPicker();
}

function getExistingStockPayload() {
  const boxQuantity = getNumberValue(existingStockBoxQuantity);
  const inboundBoxCount = getNumberValue(existingStockBoxCount);
  const remainQuantity = getNumberValue(existingStockRemainQuantity);
  const totalBoxCount = inboundBoxCount + (remainQuantity > 0 ? 1 : 0);
  const totalQuantity = boxQuantity * inboundBoxCount + remainQuantity;

  return {
    entryCategory: "기존재고",
    registrant: existingStockRegistrant.value.trim() || session?.name || "Admin",
    inboundDate: existingStockDate.value.trim(),
    inboundTime: "00:00",
    inboundType: "기존 재고",
    dueDate: "",
    productName: existingStockProductName.value.trim(),
    productId: existingStockProductId.value.trim(),
    clientName: existingStockClientName.value.trim(),
    batch: existingStockBatch.value.trim(),
    process: existingStockProcess.value.trim(),
    storage: existingStockStorage.value.trim(),
    note: existingStockNote.value.trim(),
    boxQuantity,
    inboundBoxCount,
    remainQuantity,
    boxTotalCount: totalBoxCount,
    inboundTotalQuantity: totalQuantity,
    inspectionQuantity: boxQuantity,
    defectQuantity: 0,
    defectReason: "-"
  };
}

function validateExistingStockPayload(payload) {
  const requiredFields = [
    ["inboundDate", "등록일을 입력해주세요."],
    ["productName", "제품을 선택해주세요."],
    ["productId", "제품 ID를 확인해주세요."],
    ["clientName", "거래처명을 확인해주세요."],
    ["process", "최종공정을 선택해주세요."],
    ["storage", "보관위치를 선택해주세요."]
  ];
  const missing = requiredFields.find(([field]) => !payload[field]);

  if (missing) {
    return missing[1];
  }

  const positiveNumberFields = [
    ["boxQuantity", "박스당 수량"],
    ["inboundBoxCount", "현재 박스 수"]
  ];
  const invalidPositive = positiveNumberFields.find(([field]) => !Number.isFinite(payload[field]) || payload[field] <= 0);

  if (invalidPositive) {
    return `${invalidPositive[1]}은 1 이상의 숫자로 입력해주세요.`;
  }

  if (!Number.isFinite(payload.remainQuantity) || payload.remainQuantity < 0) {
    return "잔량은 0 이상의 숫자로 입력해주세요.";
  }

  return "";
}

function setExistingStockSaving(isSaving) {
  state.isSavingExistingStock = isSaving;

  if (saveExistingStockButton) {
    saveExistingStockButton.disabled = isSaving;
    saveExistingStockButton.textContent = isSaving ? "저장 중..." : "저장";
  }
}

async function saveExistingStock() {
  if (state.isSavingExistingStock) {
    return;
  }

  const payload = getExistingStockPayload();
  const validationMessage = validateExistingStockPayload(payload);

  if (validationMessage) {
    existingStockFormMessage.textContent = validationMessage;
    showToast(validationMessage);
    return;
  }

  setExistingStockSaving(true);
  existingStockFormMessage.textContent = "";

  try {
    const result = await requestApi("createInbound", payload);
    const managementId = result?.managementId ? ` (${result.managementId})` : "";
    await loadProducts();
    await loadTodayInbounds();
    await loadInventoryDashboard(false);
    closeExistingStockModal();
    showToast(`기존 재고가 저장되었습니다.${managementId}`);
  } catch (error) {
    existingStockFormMessage.textContent = error.message || "기존 재고 저장에 실패했습니다.";
    showToast(error.message || "기존 재고 저장에 실패했습니다.");
  } finally {
    setExistingStockSaving(false);
  }
}

function setCurrentInboundTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  inboundTime.value = `${hours}:${minutes}`;
}

function setCurrentInboundDate() {
  if (!inboundDate || inboundDate.value) {
    return;
  }

  inboundDate.value = getLocalDateInputValue();
}

function setCurrentInboundListDateRange() {
  const today = getLocalDateInputValue();

  if (inboundListStartDate && !inboundListStartDate.value) {
    inboundListStartDate.value = today;
  }

  if (inboundListEndDate && !inboundListEndDate.value) {
    inboundListEndDate.value = inboundListStartDate?.value || today;
  }
}

function getLocalDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeInboundListDateRange(changedField = "") {
  if (!inboundListStartDate || !inboundListEndDate) {
    return;
  }

  if (!inboundListStartDate.value && !inboundListEndDate.value) {
    setCurrentInboundListDateRange();
    return;
  }

  if (!inboundListStartDate.value) {
    inboundListStartDate.value = inboundListEndDate.value;
  }

  if (!inboundListEndDate.value) {
    inboundListEndDate.value = inboundListStartDate.value;
  }

  if (inboundListStartDate.value > inboundListEndDate.value) {
    if (changedField === "start") {
      inboundListEndDate.value = inboundListStartDate.value;
    } else {
      inboundListStartDate.value = inboundListEndDate.value;
    }
  }
}

function getInboundListDatePayload() {
  normalizeInboundListDateRange();

  return {
    startDate: inboundListStartDate?.value || getLocalDateInputValue(),
    endDate: inboundListEndDate?.value || inboundListStartDate?.value || getLocalDateInputValue()
  };
}

async function loadProducts() {
  setStatus("제품 정보를 불러오는 중입니다.");

  try {
    const result = await requestApi("getProducts");
    state.products = Array.isArray(result.products) ? result.products : [];
    renderClientOptions();
    renderClientFilterOptions();
    renderInboundProductPicker();
    applyFilters();
  } catch (error) {
    state.products = [];
    renderClientOptions();
    renderClientFilterOptions();
    renderInboundProductPicker();
    applyFilters();
    setStatus("제품 DB를 불러오지 못했습니다. Apps Script 배포 권한을 확인해주세요.", "error");
  }
}

async function loadTodayInbounds() {
  try {
    const result = await requestApi("getTodayInbounds", getInboundListDatePayload());
    state.todayInbounds = Array.isArray(result.inbounds) ? result.inbounds : [];
    renderTodayInbounds();
    return true;
  } catch (error) {
    state.todayInbounds = [];
    renderTodayInbounds("입고 목록을 불러오지 못했습니다.");
    return false;
  }
}

async function refreshTodayInbounds() {
  if (state.isRefreshingInbounds) {
    return;
  }

  state.isRefreshingInbounds = true;
  setInboundRefreshButtonLoading(true);

  try {
    const refreshed = await loadTodayInbounds();
    showToast(refreshed ? "입고 목록을 새로고침했습니다." : "입고 목록을 불러오지 못했습니다.");
  } finally {
    state.isRefreshingInbounds = false;
    setInboundRefreshButtonLoading(false);
  }
}

async function loadInventoryDashboard(showLoadingToast = true) {
  renderInventoryLoading();

  try {
    const result = await requestApi("getInventoryDashboard");
    state.inventoryLoaded = true;
    state.inventoryRows = normalizeInventoryRows(Array.isArray(result.rows) ? result.rows : []);
    state.inventoryLocationBoxStats = Array.isArray(result.locationBoxStats) ? result.locationBoxStats : [];
    state.inventoryLocationQuantityStats = Array.isArray(result.locationQuantityStats) ? result.locationQuantityStats : [];
    renderInventorySummary(result.summary || {}, buildInventoryAttentionSummary(state.inventoryRows, result.attention || {}));
    renderInventoryFilterOptions(buildInventoryFilterOptions(state.inventoryRows, result.filters || {}));
    renderInventoryBars(inventoryLocationBoxBars, state.inventoryLocationBoxStats, "box");
    renderInventoryBars(inventoryLocationQuantityBars, state.inventoryLocationQuantityStats, "ea");
    applyInventoryFilters();

    if (showLoadingToast) {
      showToast("재고 정보를 불러왔습니다.");
    }
  } catch (error) {
    state.inventoryRows = [];
    state.filteredInventoryRows = [];
    state.inventoryLocationBoxStats = [];
    state.inventoryLocationQuantityStats = [];
    renderInventorySummary({}, {});
    renderInventoryBars(inventoryLocationBoxBars, [], "box");
    renderInventoryBars(inventoryLocationQuantityBars, [], "ea");
    renderInventoryTable("재고 정보를 불러오지 못했습니다.");
    showToast(error.message || "재고 정보를 불러오지 못했습니다.");
  }
}

function renderInventoryLoading() {
  if (!inventoryTableBody) {
    return;
  }

  inventoryTableBody.innerHTML = `
    <tr>
      <td colspan="13" class="empty-cell">재고 정보를 불러오는 중입니다.</td>
    </tr>
  `;
}

function renderInventorySummary(summary, attention) {
  if (inventoryTotalItems) {
    inventoryTotalItems.textContent = formatNumber(summary.totalItems);
  }

  if (inventoryTotalBoxes) {
    inventoryTotalBoxes.textContent = formatNumber(summary.totalBoxes);
  }

  if (inventoryTotalQuantity) {
    inventoryTotalQuantity.textContent = formatNumber(summary.totalQuantity);
  }

  if (inventoryDueSoonCount) {
    inventoryDueSoonCount.textContent = formatNumber(summary.dueSoonCount);
  }

  if (inventoryPrintWaiting) {
    inventoryPrintWaiting.textContent = formatNumber(getInventoryBoxCountTotal(getInventoryAttentionRows("print")));
  }

  if (inventoryUnspecifiedStorage) {
    inventoryUnspecifiedStorage.textContent = formatNumber(attention.unspecifiedStorageCount);
  }

  if (inventoryLongStorage) {
    inventoryLongStorage.textContent = formatNumber(attention.longStorageCount);
  }

  if (inventoryHoldDiscard) {
    inventoryHoldDiscard.textContent = formatNumber(attention.holdOrDiscardCount);
  }
}

function normalizeInventoryRows(rows) {
  return rows.map((item) => {
    const stockStatus = normalizeInventoryStockStatus(item.stockStatus);
    return {
      ...item,
      stockStatus,
      processStatus: normalizeInventoryProcessStatus(item.processStatus, stockStatus)
    };
  });
}

function normalizeInventoryStockStatus(value) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "-" ? normalized : "보관";
}

function normalizeInventoryProcessStatus(value, fallback = "보관") {
  const normalized = String(value ?? "").trim();
  const qrStatuses = new Set(["QR 생성", "QR생성", "미인쇄", "생성", "미생성", "인쇄대기"]);

  if (!normalized || normalized === "-" || qrStatuses.has(normalized)) {
    return normalizeInventoryStockStatus(fallback);
  }

  return normalized;
}

function buildInventoryFilterOptions(rows, fallback = {}) {
  return {
    clients: fallback.clients || uniqueValuesFromRows(rows, "clientName"),
    storages: fallback.storages || uniqueValuesFromRows(rows, "storage"),
    stockStatuses: uniqueValuesFromRows(rows, "stockStatus"),
    processStatuses: uniqueValuesFromRows(rows, "processStatus")
  };
}

function buildInventoryAttentionSummary(rows, fallback = {}) {
  return {
    ...fallback,
    printWaitingBoxes: getInventoryBoxCountTotal(rows.filter(isInventoryPrintWaiting)),
    unspecifiedStorageCount: rows.filter((row) => isUnspecifiedInventoryStorage(row.storage)).length,
    longStorageCount: rows.filter(isLongStoredInventory).length,
    holdOrDiscardCount: rows.filter((row) => /보류|폐기/.test(String(row.stockStatus || ""))).length
  };
}

function uniqueValuesFromRows(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "ko"));
}

function openInventoryAttentionModal(type) {
  if (!inventoryAttentionModal || !inventoryAttentionList || !inventoryAttentionEmpty) {
    return;
  }

  if (!state.inventoryLoaded) {
    showToast("재고 정보를 먼저 불러와주세요.");
    return;
  }

  const config = getInventoryAttentionConfig(type);
  const rows = getInventoryAttentionRows(type, config);

  inventoryAttentionTitle.textContent = config.title;
  inventoryAttentionDescription.textContent = getInventoryAttentionDescription(type, rows, config);
  inventoryAttentionList.innerHTML = rows.map((item) => renderInventoryAttentionRow(item, config)).join("");
  inventoryAttentionEmpty.hidden = Boolean(rows.length);

  inventoryAttentionList.querySelectorAll("[data-inventory-attention-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      const inbound = state.todayInbounds.find((item) => item.managementId === button.dataset.inventoryAttentionDetail)
        || state.inventoryRows.find((item) => item.managementId === button.dataset.inventoryAttentionDetail);

      if (!inbound) {
        showToast("재고 상세 정보를 찾을 수 없습니다.");
        return;
      }

      closeInventoryAttentionModal();
      openInventoryInboundDetail(inbound);
    });
  });

  inventoryAttentionModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => closeInventoryAttentionModalButton?.focus(), 0);
}

function closeInventoryAttentionModal() {
  if (!inventoryAttentionModal) {
    return;
  }

  inventoryAttentionModal.hidden = true;
  if (inventoryAttentionList) {
    inventoryAttentionList.innerHTML = "";
  }
  document.body.classList.remove("modal-open");
}

function openInventoryLocationModal(type) {
  if (!inventoryAttentionModal || !inventoryAttentionList || !inventoryAttentionEmpty) {
    return;
  }

  if (!state.inventoryLoaded) {
    showToast("재고 정보를 먼저 불러와주세요.");
    return;
  }

  const isQuantityMode = type === "quantity";
  const stats = isQuantityMode ? state.inventoryLocationQuantityStats : state.inventoryLocationBoxStats;
  const unit = isQuantityMode ? "ea" : "box";
  const titleUnit = isQuantityMode ? "총 수량" : "박스 수";
  const tone = isQuantityMode ? "green" : "blue";
  const totalValue = stats.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const maxValue = Math.max(...stats.map((item) => Number(item.value || 0)), 1);

  inventoryAttentionTitle.textContent = `전체 보관장소 현황 (${titleUnit})`;
  inventoryAttentionDescription.textContent = `보관장소별 ${titleUnit} 전체 목록입니다. 총 ${formatNumber(stats.length)}곳입니다.`;
  inventoryAttentionList.innerHTML = stats.map((item) => renderInventoryLocationRow(item, {
    unit,
    tone,
    totalValue,
    maxValue
  })).join("");
  inventoryAttentionEmpty.hidden = Boolean(stats.length);

  inventoryAttentionList.querySelectorAll("[data-inventory-location-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const storage = button.dataset.inventoryLocationFilter || "";

      if (inventoryStorageFilter) {
        inventoryStorageFilter.value = storage;
      }

      syncInventoryFilterState();
      state.inventoryPage = 1;
      applyInventoryFilters();
      closeInventoryAttentionModal();
      inventoryTableBody?.closest(".inventory-list-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  inventoryAttentionModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => closeInventoryAttentionModalButton?.focus(), 0);
}

function renderInventoryLocationRow(item, config) {
  const label = normalizeDisplayValue(item.label);
  const value = Number(item.value || 0);
  const percent = config.totalValue > 0 ? Math.round((value / config.totalValue) * 1000) / 10 : 0;
  const width = Math.max(4, Math.round((value / config.maxValue) * 100));

  return `
    <article class="inventory-attention-row inventory-location-row ${config.tone}">
      <div class="inventory-attention-row-main">
        <strong>${escapeHtml(label)}</strong>
        <span>보관장소</span>
      </div>
      <div class="inventory-attention-row-meta">
        <span>${config.unit === "box" ? "박스 수" : "총 수량"} <b>${formatNumber(value)} ${config.unit}</b></span>
        <span>비율 <b>${formatNumber(percent)}%</b></span>
      </div>
      <div class="inventory-location-meter" aria-hidden="true"><i style="--value: ${width}%"></i></div>
      <button type="button" data-inventory-location-filter="${escapeAttribute(label)}">
        목록보기
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </article>
  `;
}

function getInventoryAttentionConfig(type) {
  const configs = {
    print: {
      title: "인쇄 대기 재고",
      description: "작업이 아직 진행되지 않은 재고 목록입니다.",
      tone: "purple",
      metricLabel: "대기 박스",
      metric: (item) => normalizeDisplayValue(item.currentBoxCount),
      filter: isInventoryPrintWaiting
    },
    storage: {
      title: "미지정 보관 재고",
      description: "보관 위치가 아직 지정되지 않은 재고 목록입니다.",
      tone: "orange",
      metricLabel: "보관 위치",
      metric: (item) => normalizeDisplayValue(item.storage),
      filter: (item) => isUnspecifiedInventoryStorage(item.storage)
    },
    aging: {
      title: "장기 보관 재고",
      description: "입고일 기준 1개월 이상 보관 중인 재고 목록입니다.",
      tone: "teal",
      metricLabel: "입고일",
      metric: (item) => normalizeDisplayValue(item.inboundDate),
      filter: isLongStoredInventory
    },
    hold: {
      title: "보류 / 폐기 재고",
      description: "상태가 보류 또는 폐기인 재고 목록입니다.",
      tone: "red",
      metricLabel: "상태",
      metric: (item) => normalizeDisplayValue(item.stockStatus),
      filter: (item) => /보류|폐기/.test(String(item.stockStatus || ""))
    }
  };

  return configs[type] || configs.print;
}

function getInventoryAttentionRows(type, config = getInventoryAttentionConfig(type)) {
  if (!Array.isArray(state.inventoryRows)) {
    return [];
  }

  return state.inventoryRows.filter(config.filter);
}

function getInventoryAttentionDescription(type, rows, config) {
  if (type === "print") {
    return `${config.description} 총 ${formatNumber(getInventoryBoxCountTotal(rows))} box입니다.`;
  }

  return config.description;
}

function getInventoryBoxCountTotal(rows) {
  return rows.reduce((sum, row) => sum + getQuantityNumberFromText(row.currentBoxCount || row.boxTotalCount), 0);
}

function isInventoryPrintWaiting(item) {
  const boxCount = getQuantityNumberFromText(item.currentBoxCount || item.boxTotalCount);

  if (boxCount <= 0) {
    return false;
  }

  const processStatus = normalizeDisplayValue(item.processStatus || item.stockStatus);
  return !processStatus.includes("작업중");
}

function isLongStoredInventory(item) {
  const inboundDate = parseInventoryDateValue(item.inboundDate);

  if (!inboundDate) {
    return false;
  }

  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setMonth(threshold.getMonth() - 1);
  return inboundDate <= threshold;
}

function parseInventoryDateValue(value) {
  const normalized = toDateInputValue(value);

  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function renderInventoryAttentionRow(item, config) {
  return `
    <article class="inventory-attention-row ${config.tone}">
      <div class="inventory-attention-row-main">
        <strong>${escapeHtml(normalizeDisplayValue(item.productName))}</strong>
        <span>${escapeHtml(normalizeDisplayValue(item.managementId))}</span>
      </div>
      <div class="inventory-attention-row-meta">
        <span>거래처 <b>${escapeHtml(normalizeDisplayValue(item.clientName))}</b></span>
        <span>입고일 <b>${escapeHtml(normalizeDisplayValue(item.inboundDate))}</b></span>
        <span>현재 수량 <b>${escapeHtml(normalizeDisplayValue(item.currentTotalQuantity))}</b></span>
        <span>${escapeHtml(config.metricLabel)} <b>${escapeHtml(config.metric(item))}</b></span>
      </div>
      <button type="button" data-inventory-attention-detail="${escapeAttribute(item.managementId)}">
        상세보기
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </article>
  `;
}

function isUnspecifiedInventoryStorage(value) {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "-" || normalized === "미지정";
}

function renderInventoryFilterOptions(filters) {
  renderSelectOptions(inventoryClientFilter, filters.clients, "전체");
  renderSelectOptions(inventoryStorageFilter, filters.storages, "전체");
  renderSelectOptions(inventoryStockFilter, filters.stockStatuses, "전체");
  renderSelectOptions(inventoryProcessFilter, filters.processStatuses, "전체");
}

function renderSelectOptions(select, values = [], defaultLabel = "전체") {
  if (!select) {
    return;
  }

  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">${escapeHtml(defaultLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`)
  ].join("");

  if (values.includes(currentValue)) {
    select.value = currentValue;
  }
}

function renderInventoryBars(container, stats, unit) {
  if (!container) {
    return;
  }

  if (!stats.length) {
    container.innerHTML = '<div class="empty-cell">집계할 재고 데이터가 없습니다.</div>';
    return;
  }

  const hasOther = stats.length > 8;
  const topLimit = hasOther ? 7 : 8;
  const topStats = stats.slice(0, topLimit);
  const otherValue = stats.slice(topLimit).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const displayStats = otherValue > 0
    ? [...topStats, { label: "기타", value: otherValue, muted: true }]
    : topStats;
  const maxValue = Math.max(...displayStats.map((item) => Number(item.value || 0)), 1);
  const axisMax = getNiceInventoryAxisMax(maxValue);
  const axisValues = Array.from({ length: 5 }, (_, index) => Math.round((axisMax / 4) * index));

  const rowsMarkup = displayStats.map((item) => {
    const value = Number(item.value || 0);
    const width = Math.max(4, Math.round((value / maxValue) * 100));
    const className = item.muted ? "inventory-bar-row muted" : "inventory-bar-row";

    return `
      <div class="${className}">
        <span>${escapeHtml(item.label)}</span>
        <i style="--value: ${width}%"></i>
        <strong>${formatNumber(value)}${unit === "box" ? "" : ""}</strong>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    ${rowsMarkup}
    <div class="inventory-bar-axis" aria-hidden="true">
      ${axisValues.map((value) => `<span>${formatNumber(value)}</span>`).join("")}
    </div>
  `;
}

function getNiceInventoryAxisMax(value) {
  const numericValue = Number(value || 0);

  if (numericValue <= 0) {
    return 4;
  }

  const magnitude = Math.pow(10, Math.floor(Math.log10(numericValue)));
  const normalized = numericValue / magnitude;
  const niceMultiplier = normalized <= 1
    ? 1
    : normalized <= 2
      ? 2
      : normalized <= 4
        ? 4
        : normalized <= 5
          ? 5
          : 10;

  return niceMultiplier * magnitude;
}

function syncInventoryFilterState() {
  state.inventoryFilters = {
    query: inventorySearch?.value.trim().toLowerCase() || "",
    client: inventoryClientFilter?.value || "",
    storage: inventoryStorageFilter?.value || "",
    stock: inventoryStockFilter?.value || "",
    process: inventoryProcessFilter?.value || ""
  };
}

function resetInventoryFilters() {
  if (inventorySearch) {
    inventorySearch.value = "";
  }

  [inventoryClientFilter, inventoryStorageFilter, inventoryStockFilter, inventoryProcessFilter].forEach((select) => {
    if (select) {
      select.value = "";
    }
  });

  state.inventoryPage = 1;
  syncInventoryFilterState();
}

function applyInventoryFilters() {
  syncInventoryFilterState();
  const filters = state.inventoryFilters;

  state.filteredInventoryRows = state.inventoryRows.filter((item) => {
    if (filters.client && item.clientName !== filters.client) {
      return false;
    }

    if (filters.storage && item.storage !== filters.storage) {
      return false;
    }

    if (filters.stock && item.stockStatus !== filters.stock) {
      return false;
    }

    if (filters.process && item.processStatus !== filters.process) {
      return false;
    }

    if (!filters.query) {
      return true;
    }

    return [
      item.managementId,
      item.productId,
      item.productName,
      item.clientName,
      item.batch,
      item.finalProcess,
      item.storage,
      item.stockStatus,
      item.processStatus
    ].some((value) => String(value || "").toLowerCase().includes(filters.query));
  });

  renderInventoryTable();
}

function renderInventoryTable(message = "") {
  if (!inventoryTableBody || !inventoryCountLabel) {
    return;
  }

  const total = state.filteredInventoryRows.length;
  const pageCount = Math.max(1, Math.ceil(total / state.inventoryPageSize));
  state.inventoryPage = Math.min(state.inventoryPage, pageCount);
  const start = (state.inventoryPage - 1) * state.inventoryPageSize;
  const rows = state.filteredInventoryRows.slice(start, start + state.inventoryPageSize);

  if (message || !rows.length) {
    inventoryTableBody.innerHTML = `
      <tr>
        <td colspan="13" class="empty-cell">${escapeHtml(message || "재고 목록이 없습니다.")}</td>
      </tr>
    `;
  } else {
    inventoryTableBody.innerHTML = rows.map((item) => `
      <tr>
        <td>
          <button class="inventory-qr-button qr-action" type="button" data-inventory-qr="${escapeAttribute(item.managementId)}" aria-label="재고 QR 보기">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
              <path d="M14 14h2v2h-2zM18 14h2v6h-2zM14 18h2v2h-2z" />
            </svg>
          </button>
        </td>
        <td>${escapeHtml(item.inboundDate)}</td>
        <td><strong>${escapeHtml(item.managementId)}</strong></td>
        <td>${escapeHtml(item.clientName)}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td>${escapeHtml(item.batch)}</td>
        <td>${escapeHtml(item.finalProcess)}</td>
        <td>${escapeHtml(item.currentBoxCount)}</td>
        <td>${escapeHtml(item.currentTotalQuantity)}</td>
        <td>${escapeHtml(item.storage)}</td>
        <td>${renderInventoryProcessBadge(item.processStatus)}</td>
        <td>${renderInventoryDueBadge(item)}</td>
        <td>
          <div class="inventory-action-group">
            <button class="inventory-detail-button" type="button" data-inventory-detail="${escapeAttribute(item.managementId)}">상세</button>
            <button class="inventory-detail-button danger" type="button" data-inventory-delete="${escapeAttribute(item.managementId)}">삭제</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  inventoryTableBody.querySelectorAll("[data-inventory-qr]").forEach((button) => {
    button.addEventListener("click", () => openInboundQrModal(button.dataset.inventoryQr));
  });

  inventoryTableBody.querySelectorAll("[data-inventory-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      const inbound = state.todayInbounds.find((item) => item.managementId === button.dataset.inventoryDetail)
        || state.inventoryRows.find((item) => item.managementId === button.dataset.inventoryDetail);

      if (!inbound) {
        showToast("입고 상세 정보를 찾을 수 없습니다.");
        return;
      }

      openInventoryInboundDetail(inbound);
    });
  });

  inventoryTableBody.querySelectorAll("[data-inventory-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteActiveInbound(button.dataset.inventoryDelete));
  });

  inventoryCountLabel.textContent = state.inventoryFilters.query || state.inventoryFilters.client || state.inventoryFilters.storage || state.inventoryFilters.stock || state.inventoryFilters.process
    ? `검색 ${total.toLocaleString("ko-KR")}건 / 전체 ${state.inventoryRows.length.toLocaleString("ko-KR")}건`
    : `전체 ${state.inventoryRows.length.toLocaleString("ko-KR")}건`;

  renderInventoryPagination(pageCount);
}

function renderInventoryPagination(pageCount) {
  if (!inventoryPagination) {
    return;
  }

  const pages = getPageNumbers(pageCount, state.inventoryPage);
  const controls = [
    inventoryPageButton("처음", 1, state.inventoryPage === 1, "double-left"),
    inventoryPageButton("이전", Math.max(1, state.inventoryPage - 1), state.inventoryPage === 1, "left"),
    ...pages.map((page) => inventoryPageButton(String(page), page, false, null, page === state.inventoryPage)),
    inventoryPageButton("다음", Math.min(pageCount, state.inventoryPage + 1), state.inventoryPage === pageCount, "right"),
    inventoryPageButton("끝", pageCount, state.inventoryPage === pageCount, "double-right")
  ];

  inventoryPagination.innerHTML = controls.join("");
  inventoryPagination.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.inventoryPage = Number(button.dataset.page) || 1;
      renderInventoryTable();
    });
  });
}

function inventoryPageButton(label, page, disabled = false, icon = null, active = false) {
  const iconMarkup = {
    left: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>',
    "double-left": '<svg viewBox="0 0 24 24"><path d="M11 18 5 12l6-6M19 18l-6-6 6-6" /></svg>',
    "double-right": '<svg viewBox="0 0 24 24"><path d="m13 18 6-6-6-6M5 18l6-6-6-6" /></svg>'
  }[icon];

  return `
    <button type="button" class="${active ? "active" : ""}" data-page="${page}" ${disabled ? "disabled" : ""} aria-label="${escapeAttribute(label)}">
      ${iconMarkup || escapeHtml(label)}
    </button>
  `;
}

function renderInventoryBadge(value, tone = "gray") {
  return `<span class="inventory-badge ${tone}">${escapeHtml(normalizeDisplayValue(value))}</span>`;
}

function renderInventoryProcessBadge(value) {
  const normalized = normalizeDisplayValue(value);
  const toneMap = {
    보관: "blue",
    작업중: "amber",
    작업완료: "green",
    검수완료: "green",
    출고완료: "gray"
  };
  const tone = toneMap[normalized] || "gray";
  return renderInventoryBadge(normalized, tone);
}

function renderInventoryDueBadge(item) {
  const label = normalizeDisplayValue(item.dueLabel);
  let tone = "gray";

  if (Number.isFinite(Number(item.dueDays))) {
    if (Number(item.dueDays) <= 1) {
      tone = "red";
    } else if (Number(item.dueDays) <= 5) {
      tone = "amber";
    }
  }

  return renderInventoryBadge(label, tone);
}

function openInventoryInboundDetail(inbound) {
  state.activeDetailInboundId = inbound.managementId;
  setInboundDetailMode("view");
  renderInboundDetail(inbound);
  inboundDetailModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#closeInboundDetailButton")?.focus(), 0);
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("ko-KR") : "-";
}

function setInboundRefreshButtonLoading(isLoading) {
  if (!refreshInboundListButton) {
    return;
  }

  refreshInboundListButton.disabled = isLoading;
  const label = refreshInboundListButton.querySelector("span:last-child");
  if (label) {
    label.textContent = isLoading ? "새로고침 중" : "새로고침";
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
  const clientFilter = state.clientFilter;

  state.filteredProducts = state.products.filter((product) => {
    if (clientFilter && product.clientName !== clientFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      product.productCode,
      product.productName
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });

  renderSummary();
  renderProducts();
}

function renderSummary() {
  const uniqueClients = new Set(state.products.map((item) => item.clientName).filter(Boolean));
  const dates = state.products.map((item) => item.registeredAt).filter(Boolean).sort().reverse();

  productTotal.textContent = `${state.products.length.toLocaleString("ko-KR")} Sku`;
  clientTotal.textContent = `${uniqueClients.size.toLocaleString("ko-KR")} 거래처`;
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
  closeInboundRowActionMenu();

  if (isSameButton || !productCode) {
    return;
  }

  state.activeMenuProductCode = productCode;
  state.activeMenuButton = button;
  button.setAttribute("aria-expanded", "true");
  rowActionMenu.hidden = false;
  rowActionMenu.style.visibility = "hidden";
  positionActionMenu(rowActionMenu, button);
}

function toggleInboundRowActionMenu(button) {
  const recordId = button.dataset.inboundRecord || "";
  const isSameButton = state.activeInboundMenuButton === button && !inboundRowActionMenu.hidden;

  closeInboundRowActionMenu();
  closeRowActionMenu();

  if (isSameButton || !recordId) {
    return;
  }

  state.activeInboundMenuRecord = recordId;
  state.activeInboundMenuButton = button;
  button.setAttribute("aria-expanded", "true");
  inboundRowActionMenu.hidden = false;
  inboundRowActionMenu.style.visibility = "hidden";
  positionActionMenu(inboundRowActionMenu, button);
}

function positionActionMenu(menu, button) {
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
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

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "";
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

function closeInboundRowActionMenu() {
  if (state.activeInboundMenuButton) {
    state.activeInboundMenuButton.setAttribute("aria-expanded", "false");
  }

  state.activeInboundMenuRecord = "";
  state.activeInboundMenuButton = null;

  if (inboundRowActionMenu) {
    inboundRowActionMenu.hidden = true;
    inboundRowActionMenu.style.left = "";
    inboundRowActionMenu.style.top = "";
    inboundRowActionMenu.style.visibility = "";
  }
}

function getInboundMenuActionLabel(action) {
  if (action === "view") {
    return "입고 상세보기";
  }

  if (action === "edit") {
    return "입고 수정";
  }

  if (action === "delete") {
    return "입고 삭제";
  }

  return "입고 관리";
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

async function deleteActiveInbound(managementId = state.activeInboundMenuRecord) {
  if (state.isDeletingInbound || !managementId) {
    return;
  }

  const inbound = state.todayInbounds.find((item) => item.managementId === managementId)
    || state.inventoryRows.find((item) => item.managementId === managementId);
  const inboundLabel = inbound?.productName
    ? `${inbound.productName} (${managementId})`
    : managementId;

  if (!window.confirm(`${inboundLabel} 입고 내역을 삭제하시겠습니까?\n재고 DB와 박스관리 DB에서도 같이 삭제됩니다.`)) {
    return;
  }

  state.isDeletingInbound = true;
  if (managementId === state.activeInboundMenuRecord) {
    closeInboundRowActionMenu();
  }

  try {
    const result = await requestApi("deleteInbound", { managementId });
    await loadTodayInbounds();
    if (state.inventoryLoaded) {
      await loadInventoryDashboard(false);
    }
    const deletedBoxes = Number(result?.deletedBoxRows || 0);
    showToast(`입고 내역이 삭제되었습니다. 박스 ${deletedBoxes.toLocaleString("ko-KR")}건 삭제`);
  } catch (error) {
    showToast(error.message || "입고 내역 삭제에 실패했습니다.");
  } finally {
    state.isDeletingInbound = false;
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
  state.activeDetailProductCode = product.productCode;
  renderProductDetail(product);
  productDetailModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#closeProductDetailButton").focus(), 0);
}

function closeProductDetailModal() {
  productDetailModal.hidden = true;
  productDetailContent.innerHTML = "";
  state.activeDetailProductCode = "";

  if (productModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function openActiveInboundDetail() {
  if (!state.activeInboundMenuRecord) {
    return;
  }

  const inbound = state.todayInbounds.find((item) => item.managementId === state.activeInboundMenuRecord);

  if (!inbound) {
    showToast("입고 정보를 찾을 수 없습니다.");
    closeInboundRowActionMenu();
    return;
  }

  closeInboundRowActionMenu();
  state.activeDetailInboundId = inbound.managementId;
  setInboundDetailMode("view");
  renderInboundDetail(inbound);
  inboundDetailModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#closeInboundDetailButton").focus(), 0);
}

function closeInboundDetailModal() {
  inboundDetailModal.hidden = true;
  inboundDetailContent.innerHTML = "";
  state.activeDetailInboundId = "";
  state.inboundEditDefectReasons = [];
  setInboundDetailMode("view");

  if (productModal.hidden && productDetailModal.hidden && inboundProductPickerModal.hidden && inboundQrModal?.hidden !== false) {
    document.body.classList.remove("modal-open");
  }
}

async function openInboundQrModal(managementId) {
  if (!managementId || !inboundQrModal || state.isLoadingInboundQrs) {
    return;
  }

  const inbound = state.todayInbounds.find((item) => item.managementId === managementId);

  if (!inbound) {
    showToast("QR을 만들 입고 정보를 찾을 수 없습니다.");
    return;
  }

  state.activeQrInboundId = managementId;
  state.isLoadingInboundQrs = true;
  closeInboundRowActionMenu();
  inboundQrTitle.textContent = `${inbound.productName || "입고"} 박스 QR`;
  inboundQrSubtitle.textContent = `${managementId} · ${inbound.process || "-"} · ${inbound.inboundDate || "-"} · QR 데이터를 준비 중입니다.`;
  inboundQrSheet.innerHTML = '<p class="qr-loading">박스 QR 데이터를 불러오는 중입니다.</p>';
  inboundQrModal.hidden = false;
  document.body.classList.add("modal-open");

  try {
    const result = await requestApi("getInboundBoxQrs", { managementId });
    const boxes = Array.isArray(result.boxes) ? result.boxes : [];
    inboundQrSubtitle.textContent = `${managementId} · ${inbound.process || "-"} · ${inbound.inboundDate || "-"} · ${boxes.length.toLocaleString("ko-KR")}개`;
    renderInboundQrSheet(inbound, boxes);
  } catch (error) {
    inboundQrSheet.innerHTML = `<p class="qr-loading qr-error">${escapeHtml(error.message || "QR 데이터를 불러오지 못했습니다.")}</p>`;
    showToast(error.message || "QR 데이터를 불러오지 못했습니다.");
  } finally {
    state.isLoadingInboundQrs = false;
  }
}

function closeInboundQrModal() {
  if (!inboundQrModal) {
    return;
  }

  inboundQrModal.hidden = true;
  inboundQrSheet.innerHTML = "";
  state.activeQrInboundId = "";

  if (productModal.hidden && productDetailModal.hidden && inboundDetailModal.hidden && inboundProductPickerModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function renderInboundQrSheet(inbound, boxes) {
  if (!inboundQrSheet) {
    return;
  }

  if (!boxes.length) {
    inboundQrSheet.innerHTML = '<p class="qr-loading">출력할 박스 QR이 없습니다.</p>';
    return;
  }

  const total = boxes.length;
  const processText = inbound.process || "-";
  const productName = inbound.productName || boxes[0]?.productName || "-";

  inboundQrSheet.innerHTML = boxes.map((box) => {
    const sequence = Number(box.sequence) || 0;
    const qrData = box.qrData || box.boxId || "";

    return `
      <article class="box-qr-label">
        <div class="box-qr-process">최종공정 ${escapeHtml(processText)}</div>
        <div class="box-qr-main">
          <img class="box-qr-image" src="${escapeAttribute(getQrImageUrl(qrData))}" alt="${escapeAttribute(box.boxId)} QR" />
          <div class="box-qr-checks" aria-label="공정 체크">
            ${renderQrProcessCheck("1도")}
            ${renderQrProcessCheck("2도")}
            ${renderQrProcessCheck("3도")}
          </div>
        </div>
        <dl class="box-qr-meta">
          <div>
            <dt>제품명</dt>
            <dd>${escapeHtml(productName)}</dd>
          </div>
          <div>
            <dt>박스 정보</dt>
            <dd>${sequence.toLocaleString("ko-KR")} / ${total.toLocaleString("ko-KR")} 박스</dd>
          </div>
        </dl>
      </article>
    `;
  }).join("");
}

function renderQrProcessCheck(label) {
  return `
    <span>
      ${escapeHtml(label)}
      <i aria-hidden="true"></i>
    </span>
  `;
}

function getQrImageUrl(value) {
  const data = String(value || "-");
  return `https://api.qrserver.com/v1/create-qr-code/?size=128x128&margin=1&data=${encodeURIComponent(data)}`;
}

function openActiveInboundEdit() {
  if (!state.activeInboundMenuRecord) {
    return;
  }

  const inbound = state.todayInbounds.find((item) => item.managementId === state.activeInboundMenuRecord);

  if (!inbound) {
    showToast("수정할 입고 정보를 찾을 수 없습니다.");
    closeInboundRowActionMenu();
    return;
  }

  closeInboundRowActionMenu();
  state.activeDetailInboundId = inbound.managementId;
  setInboundDetailMode("edit");
  renderInboundEditForm(inbound);
  inboundDetailModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#inboundEditBatch")?.focus(), 0);
}

function openDetailInboundEdit() {
  const inbound = getInboundByManagementId(state.activeDetailInboundId);

  if (!inbound) {
    showToast("수정할 입고 정보를 찾을 수 없습니다.");
    closeInboundDetailModal();
    return;
  }

  setInboundDetailMode("edit");
  renderInboundEditForm(inbound);
  window.setTimeout(() => document.querySelector("#inboundEditBatch")?.focus(), 0);
}

function getInboundByManagementId(managementId) {
  return state.todayInbounds.find((item) => item.managementId === managementId);
}

function setInboundDetailMode(mode) {
  const isEdit = mode === "edit";

  if (inboundDetailTitle) {
    inboundDetailTitle.textContent = isEdit ? "입고 수정" : "입고 상세보기";
  }

  if (inboundDetailDescription) {
    inboundDetailDescription.textContent = isEdit
      ? "수정 가능한 입고 정보와 수량 정보를 변경할 수 있습니다."
      : "등록된 입고 정보와 수량 정보를 확인할 수 있습니다.";
  }

  if (closeInboundDetailButton) {
    closeInboundDetailButton.textContent = isEdit ? "취소" : "닫기";
  }

  if (editInboundFromDetailButton) {
    editInboundFromDetailButton.hidden = isEdit;
  }

  if (saveInboundEditButton) {
    saveInboundEditButton.hidden = !isEdit;
    saveInboundEditButton.disabled = false;
    saveInboundEditButton.textContent = "저장";
  }
}

function openActiveProductEdit() {
  const product = getProductByCode(state.activeMenuProductCode);

  if (!product) {
    showToast("수정할 제품 정보를 찾을 수 없습니다.");
    closeRowActionMenu();
    return;
  }

  closeRowActionMenu();
  openProductModal("edit", product);
}

function openDetailProductEdit() {
  const product = getProductByCode(state.activeDetailProductCode);

  if (!product) {
    showToast("수정할 제품 정보를 찾을 수 없습니다.");
    closeProductDetailModal();
    return;
  }

  closeProductDetailModal();
  openProductModal("edit", product);
}

function getProductByCode(productCode) {
  return state.products.find((item) => item.productCode === productCode);
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
        ${detailItem("발주량", product.orderQuantity)}
        ${detailItem("납기일", product.dueDate)}
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

function renderInboundDetail(inbound) {
  inboundDetailContent.innerHTML = `
    <section class="detail-section" aria-labelledby="inboundDetailBaseTitle">
      <h3 id="inboundDetailBaseTitle">입고 기본 정보</h3>
      <div class="detail-grid">
        ${detailItem("관리 ID", inbound.managementId)}
        ${detailItem("입고 유형", inbound.inboundType)}
        ${detailItem("입고일", inbound.inboundDate)}
        ${detailItem("입고 시간", inbound.inboundTime)}
        ${detailItem("납기일", inbound.dueDate)}
        ${detailItem("등록자", inbound.registrant)}
      </div>
    </section>

    <section class="detail-section" aria-labelledby="inboundDetailProductTitle">
      <h3 id="inboundDetailProductTitle">제품 정보</h3>
      <div class="detail-grid">
        ${detailItem("제품 ID", inbound.productId)}
        ${detailItem("거래처명", inbound.clientName)}
        ${detailItem("제품명", inbound.productName, false, "full-span")}
        ${detailItem("차수", inbound.batch)}
        ${detailItem("최종공정", inbound.process)}
        ${detailItem("보관위치", inbound.storage)}
      </div>
    </section>

    <section class="detail-section" aria-labelledby="inboundDetailQuantityTitle">
      <h3 id="inboundDetailQuantityTitle">수량 정보</h3>
      <div class="detail-grid">
        ${detailItem("박스당 수량", inbound.boxQuantity)}
        ${detailItem("입고 박스 수", inbound.inboundBoxCount)}
        ${detailItem("잔량", inbound.remainQuantity)}
        ${detailItem("박스 총 수량", inbound.boxTotalCount)}
        ${detailItem("입고 총 수량", inbound.inboundTotalQuantity)}
        ${detailItem("검수 수량", inbound.inspectionQuantity)}
        ${detailItem("불량 수량", inbound.defectQuantity)}
        ${detailItem("불량률", inbound.defectRate)}
        ${detailItem("불량 사유", inbound.defectReason, false, "full-span")}
        ${detailItem("비고", inbound.note, false, "full-span")}
      </div>
    </section>

    ${renderInboundAttachmentDetail(inbound)}
  `;
}

function renderInboundAttachmentDetail(inbound) {
  return `
    <section class="detail-section inbound-attachment-section" aria-labelledby="inboundDetailAttachmentTitle">
      <h3 id="inboundDetailAttachmentTitle">첨부 정보</h3>
      <div class="inbound-attachment-grid">
        ${renderAttachmentViewCard("거래명세서", inbound.invoiceFileUrl, "등록된 거래명세서가 없습니다.")}
        ${renderAttachmentViewCard("불량사진", inbound.defectPhotoUrls, "등록된 불량사진이 없습니다.")}
      </div>
    </section>
  `;
}

function renderInboundAttachmentEdit(inbound) {
  return `
    <section class="detail-section inbound-edit-section inbound-attachment-section" aria-labelledby="inboundEditAttachmentTitle">
      <h3 id="inboundEditAttachmentTitle">첨부 정보</h3>
      <div class="inbound-attachment-grid">
        ${renderAttachmentEditCard({
          title: "거래명세서",
          urls: inbound.invoiceFileUrl,
          inputId: "inboundEditInvoiceFile",
          buttonId: "inboundEditInvoiceUploadButton",
          fileNameId: "inboundEditInvoiceFileName",
          multiple: false,
          emptyText: "등록된 거래명세서가 없습니다.",
          buttonText: "거래명세서 변경"
        })}
        ${renderAttachmentEditCard({
          title: "불량사진",
          urls: inbound.defectPhotoUrls,
          inputId: "inboundEditDefectFiles",
          buttonId: "inboundEditDefectUploadButton",
          fileNameId: "inboundEditDefectFileName",
          multiple: true,
          emptyText: "등록된 불량사진이 없습니다.",
          buttonText: "불량사진 변경"
        })}
      </div>
    </section>
  `;
}

function renderAttachmentViewCard(title, urls, emptyText) {
  return `
    <div class="attachment-card">
      <div class="attachment-card-header">
        <strong>${escapeHtml(title)}</strong>
      </div>
      ${renderAttachmentLinks(urls, emptyText)}
    </div>
  `;
}

function renderAttachmentEditCard({ title, urls, inputId, buttonId, fileNameId, multiple, emptyText, buttonText }) {
  return `
    <div class="attachment-card attachment-edit-card">
      <div class="attachment-card-header">
        <strong>${escapeHtml(title)}</strong>
      </div>
      ${renderAttachmentLinks(urls, emptyText)}
      <input class="visually-hidden" id="${escapeAttribute(inputId)}" type="file" accept="image/*" ${multiple ? "multiple" : ""} />
      <button class="attachment-upload-button" id="${escapeAttribute(buttonId)}" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M5 20h14" />
        </svg>
        <span>${escapeHtml(buttonText)}</span>
      </button>
      <p class="attachment-file-name" id="${escapeAttribute(fileNameId)}">새 파일을 선택하지 않으면 기존 파일이 유지됩니다.</p>
    </div>
  `;
}

function renderAttachmentLinks(urls, emptyText) {
  const links = parseAttachmentUrls(urls);

  if (!links.length) {
    return `<p class="attachment-empty">${escapeHtml(emptyText)}</p>`;
  }

  return `
    <div class="attachment-link-list">
      ${links.map((url, index) => `
        <a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">
          ${links.length > 1 ? `파일 ${index + 1}` : "파일 보기"}
        </a>
      `).join("")}
    </div>
  `;
}

function parseAttachmentUrls(value) {
  return String(value || "")
    .split(/\s+/)
    .map((url) => url.trim())
    .filter((url) => url && url !== "-");
}

function renderInboundEditForm(inbound) {
  state.inboundEditDefectReasons = parseDefectReasonList(inbound.defectReason);

  inboundDetailContent.innerHTML = `
    <section class="detail-section inbound-edit-section" aria-labelledby="inboundEditReadonlyTitle">
      <h3 id="inboundEditReadonlyTitle">입고 기본 정보</h3>
      <div class="detail-grid">
        ${detailItem("관리 ID", inbound.managementId)}
        ${detailItem("등록자", inbound.registrant)}
        ${detailItem("제품 ID", inbound.productId)}
        ${detailItem("거래처명", inbound.clientName)}
        ${detailItem("제품명", inbound.productName, false, "full-span")}
      </div>
    </section>

    <section class="detail-section inbound-edit-section" aria-labelledby="inboundEditProductTitle">
      <h3 id="inboundEditProductTitle">수정 정보</h3>
      <div class="inbound-edit-grid">
        <label class="form-field">
          <span>입고일 <b>*</b></span>
          <input id="inboundEditDate" type="date" value="${escapeAttribute(toDateInputValue(inbound.inboundDate))}" />
        </label>
        <label class="form-field">
          <span>입고 시간 <b>*</b></span>
          <input id="inboundEditTime" type="time" value="${escapeAttribute(toTimeInputValue(inbound.inboundTime))}" />
        </label>
        <label class="form-field">
          <span>입고 유형 <b>*</b></span>
          <select id="inboundEditType">
            ${renderOptionList(["", "정상입고", "반품입고", "이관", "외주"], normalizeEditableValue(inbound.inboundType), "선택하세요.")}
          </select>
        </label>
        <label class="form-field">
          <span>납기일</span>
          <input id="inboundEditDueDate" type="date" value="${escapeAttribute(toDateInputValue(inbound.dueDate))}" disabled />
        </label>
        <label class="form-field">
          <span>차수</span>
          <input id="inboundEditBatch" type="text" value="${escapeAttribute(normalizeEditableValue(inbound.batch))}" placeholder="차수를 입력하세요." />
        </label>
        <label class="form-field">
          <span>최종공정 <b>*</b></span>
          <select id="inboundEditProcess">
            ${renderOptionList(["", "1도", "2도", "3도", "코팅"], normalizeEditableValue(inbound.process), "선택하세요.")}
          </select>
        </label>
        <label class="form-field">
          <span>보관위치 <b>*</b></span>
          <select id="inboundEditStorage">
            ${renderOptionList(["", "미지정", "현장", "A", "B-1", "B-2", "C-1", "C-2", "D-1", "D-2", "E-1", "E-2", "F-1", "F-2", "G-1", "G[출고대기]", "H-1", "I"], normalizeEditableValue(inbound.storage), "선택하세요.")}
          </select>
        </label>
        <label class="form-field">
          <span>상태 <b>*</b></span>
          <select id="inboundEditStockStatus">
            ${renderOptionList(["", ...INVENTORY_STOCK_STATUSES], normalizeEditableValue(inbound.stockStatus || inbound.status || "보관"), "선택하세요.")}
          </select>
        </label>
      </div>
    </section>

    <section class="detail-section inbound-edit-section" aria-labelledby="inboundEditQuantityTitle">
      <h3 id="inboundEditQuantityTitle">수량 정보</h3>
      <div class="inbound-edit-grid">
        <label class="form-field">
          <span>박스당 수량 (EA) <b>*</b></span>
          ${renderEditableUnitInput("inboundEditBoxQty", "박스당 수량 수정", extractQuantityNumber(inbound.boxQuantity), "ea", true)}
        </label>
        <label class="form-field">
          <span>입고 박스 수 (BOX) <b>*</b></span>
          ${renderUnitInput("inboundEditBoxCount", extractQuantityNumber(inbound.inboundBoxCount), "box")}
        </label>
        <label class="form-field">
          <span>잔량 (EA) <b>*</b></span>
          ${renderUnitInput("inboundEditRemainQty", extractQuantityNumber(inbound.remainQuantity), "ea")}
        </label>
        <label class="form-field">
          <span>검수 수량 (EA) <b>*</b></span>
          ${renderEditableUnitInput("inboundEditInspectionQty", "검수 수량 수정", extractQuantityNumber(inbound.inspectionQuantity), "ea", true)}
        </label>
        <label class="form-field">
          <span>불량 수량 (EA) <b>*</b></span>
          ${renderUnitInput("inboundEditDefectQty", extractQuantityNumber(inbound.defectQuantity), "ea")}
        </label>
        <label class="form-field">
          <span>불량 사유 <b>*</b></span>
          <div class="multi-select" id="inboundEditDefectReasonSelect">
            <button class="multi-select-trigger" id="inboundEditDefectReasonButton" type="button" aria-haspopup="listbox" aria-expanded="false">
              <span class="multi-select-value" id="inboundEditDefectReasonValue"></span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div class="multi-select-panel" id="inboundEditDefectReasonPanel" role="listbox" aria-label="불량 사유 선택" hidden>
              ${Object.keys(DEFECT_REASON_TONES).map((reason) => `
                <button class="multi-select-option" type="button" data-edit-defect-reason="${escapeAttribute(reason)}" aria-pressed="false">
                  ${renderDefectReasonPill(reason)}
                  <span class="option-check" aria-hidden="true">✓</span>
                </button>
              `).join("")}
            </div>
            <input id="inboundEditDefectReason" type="hidden" value="" />
          </div>
        </label>
      </div>
    </section>

    ${renderInboundAttachmentEdit(inbound)}
  `;

  bindInboundEditFormEvents();
  renderInboundEditDefectReasons();
}

function bindInboundEditFormEvents() {
  inboundDetailContent.querySelectorAll("[data-edit-lock-target]").forEach((button) => {
    const input = inboundDetailContent.querySelector(`#${button.dataset.editLockTarget}`);

    button.addEventListener("click", () => {
      setInboundLockedFieldEditable(input, button, input?.disabled);
    });
  });

  inboundDetailContent.querySelector("#inboundEditDefectReasonButton")?.addEventListener("click", () => {
    const button = inboundDetailContent.querySelector("#inboundEditDefectReasonButton");
    const isOpen = button?.getAttribute("aria-expanded") === "true";
    setInboundEditDefectReasonOpen(!isOpen);
  });

  inboundDetailContent.querySelectorAll("[data-edit-defect-reason]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleInboundEditDefectReason(button.dataset.editDefectReason);
    });
  });

  bindInboundEditFilePicker("inboundEditInvoiceFile", "inboundEditInvoiceUploadButton", "inboundEditInvoiceFileName");
  bindInboundEditFilePicker("inboundEditDefectFiles", "inboundEditDefectUploadButton", "inboundEditDefectFileName");
}

function bindInboundEditFilePicker(inputId, buttonId, fileNameId) {
  const input = inboundDetailContent.querySelector(`#${inputId}`);
  const button = inboundDetailContent.querySelector(`#${buttonId}`);
  const fileName = inboundDetailContent.querySelector(`#${fileNameId}`);

  if (!input || !button || !fileName) {
    return;
  }

  button.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);

    if (!files.length) {
      fileName.textContent = "새 파일을 선택하지 않으면 기존 파일이 유지됩니다.";
      return;
    }

    fileName.textContent = files.length === 1 ? files[0].name : `${files[0].name} 외 ${files.length - 1}개`;
  });
}

function renderUnitInput(id, value, unit) {
  return `
    <span class="unit-input">
      <input id="${escapeAttribute(id)}" type="number" value="${escapeAttribute(value)}" min="0" />
      <i>${escapeHtml(unit)}</i>
    </span>
  `;
}

function renderEditableUnitInput(id, label, value, unit, isLocked) {
  return `
    <span class="unit-input editable-lock-input editable-unit-input">
      <input id="${escapeAttribute(id)}" type="number" value="${escapeAttribute(value)}" min="0" ${isLocked ? "disabled" : ""} />
      <i>${escapeHtml(unit)}</i>
      <button type="button" aria-label="${escapeAttribute(label)}" title="${isLocked ? "수정" : "잠금"}" aria-pressed="${isLocked ? "false" : "true"}" data-edit-lock-target="${escapeAttribute(id)}">
        ${renderEditLockIcons()}
      </button>
    </span>
  `;
}

function renderEditLockIcons() {
  return `
    <svg class="edit-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z" />
      <path d="m13.5 7.5 3 3" />
    </svg>
    <svg class="lock-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  `;
}

function renderOptionList(options, currentValue, placeholder) {
  const normalizedCurrent = normalizeEditableValue(currentValue);
  const values = options.includes(normalizedCurrent) || !normalizedCurrent
    ? options
    : [...options, normalizedCurrent];

  return values.map((option) => {
    const value = String(option || "");
    const label = value || placeholder;
    const selected = value === normalizedCurrent ? " selected" : "";
    const disabled = value ? "" : " disabled";
    return `<option value="${escapeAttribute(value)}"${selected}${disabled}>${escapeHtml(label)}</option>`;
  }).join("");
}

function setInboundEditDefectReasonOpen(isOpen) {
  const button = inboundDetailContent.querySelector("#inboundEditDefectReasonButton");
  const panel = inboundDetailContent.querySelector("#inboundEditDefectReasonPanel");

  if (!button || !panel) {
    return;
  }

  button.setAttribute("aria-expanded", String(isOpen));
  panel.hidden = !isOpen;
}

function toggleInboundEditDefectReason(reason) {
  if (!reason) {
    return;
  }

  const selectedReasons = new Set(state.inboundEditDefectReasons);

  if (selectedReasons.has(reason)) {
    selectedReasons.delete(reason);
  } else {
    selectedReasons.add(reason);
  }

  state.inboundEditDefectReasons = Array.from(selectedReasons);
  renderInboundEditDefectReasons();
}

function renderInboundEditDefectReasons() {
  const value = inboundDetailContent.querySelector("#inboundEditDefectReasonValue");
  const input = inboundDetailContent.querySelector("#inboundEditDefectReason");
  const panel = inboundDetailContent.querySelector("#inboundEditDefectReasonPanel");

  if (!value || !input || !panel) {
    return;
  }

  input.value = state.inboundEditDefectReasons.join(", ");
  value.innerHTML = state.inboundEditDefectReasons.length
    ? state.inboundEditDefectReasons.map(renderDefectReasonPill).join("")
    : '<span class="multi-select-placeholder">선택하세요</span>';

  panel.querySelectorAll("[data-edit-defect-reason]").forEach((button) => {
    const isSelected = state.inboundEditDefectReasons.includes(button.dataset.editDefectReason);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

async function saveInboundEdit() {
  if (state.isSavingInboundEdit || !state.activeDetailInboundId) {
    return;
  }

  state.isSavingInboundEdit = true;

  if (saveInboundEditButton) {
    saveInboundEditButton.disabled = true;
    saveInboundEditButton.textContent = "저장 중";
  }

  try {
    const payload = await getInboundEditPayload();
    const validationMessage = validateInboundEditPayload(payload);

    if (validationMessage) {
      showToast(validationMessage);
      return;
    }

    await requestApi("updateInbound", payload);
    await loadTodayInbounds();
    if (state.inventoryLoaded) {
      await loadInventoryDashboard(false);
    }
    state.activeDetailInboundId = payload.managementId;
    setInboundDetailMode("view");

    const detailInbound = getInboundByManagementId(payload.managementId);
    if (detailInbound) {
      renderInboundDetail(detailInbound);
    } else {
      closeInboundDetailModal();
    }

    showToast("입고 내역이 수정되었습니다.");
  } catch (error) {
    showToast(error.message || "입고 내역 수정에 실패했습니다.");
  } finally {
    state.isSavingInboundEdit = false;

    if (saveInboundEditButton) {
      saveInboundEditButton.disabled = false;
      saveInboundEditButton.textContent = "저장";
    }
  }
}

async function getInboundEditPayload() {
  const payload = {
    managementId: state.activeDetailInboundId,
    inboundDate: inboundDetailContent.querySelector("#inboundEditDate")?.value.trim() || "",
    inboundTime: inboundDetailContent.querySelector("#inboundEditTime")?.value.trim() || "",
    inboundType: inboundDetailContent.querySelector("#inboundEditType")?.value.trim() || "",
    dueDate: inboundDetailContent.querySelector("#inboundEditDueDate")?.value.trim() || "",
    batch: inboundDetailContent.querySelector("#inboundEditBatch")?.value.trim() || "",
    process: inboundDetailContent.querySelector("#inboundEditProcess")?.value.trim() || "",
    storage: inboundDetailContent.querySelector("#inboundEditStorage")?.value.trim() || "",
    stockStatus: inboundDetailContent.querySelector("#inboundEditStockStatus")?.value.trim() || "",
    boxQuantity: getNumberValue(inboundDetailContent.querySelector("#inboundEditBoxQty")),
    inboundBoxCount: getNumberValue(inboundDetailContent.querySelector("#inboundEditBoxCount")),
    remainQuantity: getNumberValue(inboundDetailContent.querySelector("#inboundEditRemainQty")),
    inspectionQuantity: getNumberValue(inboundDetailContent.querySelector("#inboundEditInspectionQty")),
    defectQuantity: getNumberValue(inboundDetailContent.querySelector("#inboundEditDefectQty")),
    defectReason: inboundDetailContent.querySelector("#inboundEditDefectReason")?.value.trim() || ""
  };

  payload.invoiceFile = await getFilePayloadFromInput(inboundDetailContent.querySelector("#inboundEditInvoiceFile"), {
    label: "거래명세서",
    maxSize: MAX_INVOICE_FILE_SIZE
  });
  payload.defectFiles = await getFilePayloadsFromInput(inboundDetailContent.querySelector("#inboundEditDefectFiles"), {
    label: "불량사진",
    maxSize: MAX_DEFECT_PHOTO_FILE_SIZE
  });

  return payload;
}

function validateInboundEditPayload(payload) {
  if (!payload.managementId) {
    return "수정할 입고 관리 ID가 필요합니다.";
  }

  if (!payload.inboundDate) {
    return "입고일을 입력해주세요.";
  }

  if (!payload.inboundTime) {
    return "입고 시간을 입력해주세요.";
  }

  if (!payload.inboundType) {
    return "입고 유형을 선택해주세요.";
  }

  if (!payload.process) {
    return "최종공정을 선택해주세요.";
  }

  if (!payload.storage) {
    return "보관위치를 선택해주세요.";
  }

  if (!payload.stockStatus) {
    return "상태를 선택해주세요.";
  }

  if (!payload.defectReason) {
    return "불량 사유를 선택해주세요.";
  }

  const positiveNumberFields = [
    ["boxQuantity", "박스당 수량"],
    ["inboundBoxCount", "입고 박스 수"],
    ["inspectionQuantity", "검수 수량"]
  ];

  const invalidPositive = positiveNumberFields.find(([field]) => !Number.isFinite(payload[field]) || payload[field] <= 0);
  if (invalidPositive) {
    return `${invalidPositive[1]}은 1 이상의 숫자로 입력해주세요.`;
  }

  const zeroNumberFields = [
    ["remainQuantity", "잔량"],
    ["defectQuantity", "불량 수량"]
  ];

  const invalidZero = zeroNumberFields.find(([field]) => !Number.isFinite(payload[field]) || payload[field] < 0);
  if (invalidZero) {
    return `${invalidZero[1]}은 0 이상의 숫자로 입력해주세요.`;
  }

  return "";
}

function toDateInputValue(value) {
  const normalized = normalizeEditableValue(value);
  const matched = normalized.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);

  if (!matched) {
    return "";
  }

  const [, year, month, day] = matched;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function toTimeInputValue(value) {
  const source = normalizeEditableValue(value);
  const isPm = source.startsWith("오후");
  const isAm = source.startsWith("오전");
  const normalized = source.replace(/^오전\s*/, "").replace(/^오후\s*/, "");
  const matched = normalized.match(/(\d{1,2}):(\d{2})/);

  if (!matched) {
    return "";
  }

  let hour = Number(matched[1]);

  if (isPm && hour < 12) {
    hour += 12;
  }

  if (isAm && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${matched[2]}`;
}

function parseDefectReasonList(value) {
  return String(value || "")
    .split(",")
    .map((reason) => reason.trim())
    .filter((reason) => reason && reason !== "-");
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
  const value = normalizeUsageStatus(status);
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

function openProductModal(mode = "create", product = null) {
  state.productFormMode = mode;
  state.editingProductCode = mode === "edit" ? product?.productCode || "" : "";

  productForm.reset();
  productFormMessage.textContent = "";
  productFormMessage.classList.remove("success");
  productModalTitle.textContent = mode === "edit" ? "제품 정보 수정" : "신규 제품 등록";
  productModalDescription.textContent = mode === "edit"
    ? "제품코드를 제외한 제품 정보를 수정할 수 있습니다."
    : "신규 제품 정보를 입력해주세요. * 표시는 필수 입력입니다.";
  saveProductButton.textContent = mode === "edit" ? "수정 저장" : "저장";
  productCodePreview.placeholder = mode === "edit" ? "제품코드는 수정할 수 없습니다." : "자동 생성됩니다.";
  renderClientOptions();

  if (mode === "edit" && product) {
    productCodePreview.value = product.productCode || "";
    setSelectValue(productClientName, product.clientName);
    productNameInput.value = normalizeEditableValue(product.productName);
    setSelectValue(productColor, normalizeEditableValue(product.color));
    productForm.querySelector(`input[name="productUsage"][value="${normalizeUsageStatus(product.useStatus)}"]`)?.click();
    productOrderQuantity.value = extractQuantityNumber(product.orderQuantity);
    productDueDate.value = toDateInputValue(product.dueDate);
    productBoxQuantity.value = extractQuantityNumber(product.boxQuantity);
    productTrayQuantity.value = extractQuantityNumber(product.trayQuantity);
    productNote.value = normalizeEditableValue(product.note);
  }

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
  state.productFormMode = "create";
  state.editingProductCode = "";
  productModalTitle.textContent = "신규 제품 등록";
  productModalDescription.textContent = "신규 제품 정보를 입력해주세요. * 표시는 필수 입력입니다.";
  saveProductButton.textContent = "저장";
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

function renderClientFilterOptions() {
  const clients = [...new Set(state.products.map((product) => product.clientName).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "ko-KR"));
  const currentValue = state.clientFilter;

  productClientFilter.innerHTML = [
    '<option value="">전체 업체</option>',
    ...clients.map((client) => `<option value="${escapeHtml(client)}">${escapeHtml(client)}</option>`)
  ].join("");

  if (clients.includes(currentValue)) {
    productClientFilter.value = currentValue;
    return;
  }

  state.clientFilter = "";
  productClientFilter.value = "";
}

function setSelectValue(select, value) {
  const normalized = normalizeEditableValue(value);

  if (!normalized) {
    select.value = "";
    return;
  }

  const hasOption = Array.from(select.options).some((option) => option.value === normalized);

  if (!hasOption) {
    select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(normalized)}">${escapeHtml(normalized)}</option>`);
  }

  select.value = normalized;
}

function normalizeEditableValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized === "-" ? "" : normalized;
}

function extractQuantityNumber(value) {
  const matched = String(value ?? "").match(/\d[\d,]*/);
  return matched ? matched[0].replaceAll(",", "") : "";
}

function getQuantityNumberFromText(value) {
  const quantity = extractQuantityNumber(value);
  return quantity ? Number(quantity) : 0;
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
    const isEdit = state.productFormMode === "edit";
    const result = await requestApi(
      isEdit ? "updateProduct" : "createProduct",
      isEdit ? { ...payload, productId: state.editingProductCode } : payload
    );
    const productId = result?.productId ? ` (${result.productId})` : "";

    setFormMessage(isEdit ? "제품이 수정되었습니다." : "제품이 저장되었습니다.", "success");
    await loadProducts();
    setProductSaving(false);
    closeProductModal();
    showToast(isEdit ? `제품 정보가 수정되었습니다.${productId}` : `신규 제품이 등록되었습니다.${productId}`);
  } catch (error) {
    setFormMessage(error.message || "제품 저장에 실패했습니다.");
  } finally {
    setProductSaving(false);
  }
}

function getProductFormPayload() {
  const orderQuantity = productOrderQuantity.value.trim();
  const boxQuantity = productBoxQuantity.value.trim();
  const trayQuantity = productTrayQuantity.value.trim();
  const usage = productForm.querySelector('input[name="productUsage"]:checked')?.value || "사용중";

  return {
    "등록자": session?.name || "Admin",
    "업체명": productClientName.value.trim(),
    "제품명": productNameInput.value.trim(),
    "색상": productColor.value.trim(),
    "사용 여부": usage,
    "발주량": orderQuantity ? `${Number(orderQuantity).toLocaleString("ko-KR")} ea` : "",
    "납기일": productDueDate.value.trim(),
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
    ["발주량", "발주량을 입력해주세요."],
    ["납기일", "납기일을 선택해주세요."],
    ["박스당 수량", "박스당 수량을 입력해주세요."],
    ["트레이 수량", "트레이 수량을 입력해주세요."]
  ];

  const missing = requiredFields.find(([field]) => !payload[field]);
  if (missing) {
    return missing[1];
  }

  if (Number(productOrderQuantity.value) <= 0 || Number(productBoxQuantity.value) <= 0 || Number(productTrayQuantity.value) <= 0) {
    return "수량은 1 이상의 숫자로 입력해주세요.";
  }

  return "";
}

function setProductSaving(isSaving) {
  state.isSavingProduct = isSaving;
  saveProductButton.disabled = isSaving;
  saveProductButton.textContent = isSaving
    ? "저장 중"
    : state.productFormMode === "edit" ? "수정 저장" : "저장";
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

function normalizeUsageStatus(value) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "-" ? normalized : "사용중";
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

function escapeAttribute(value) {
  return escapeHtml(value);
}
