const CLIENT_CODES = {
  "아이원(아이텍)": "ION",
  "(주)리치코스": "RCS",
  "(주)장업시스템": "JUS",
  "(주)ANP": "ANP",
  "(주)정훈": "JH",
  "(주)케이알": "KR",
  "(주)코스엔텍": "CNT",
  "(주)금호ENG": "KHE",
  "뉴파트너스": "NP",
  "필립텍": "PLT",
  "이루팩": "IRP",
  "(주)디엠": "DM",
  "보경": "BK",
  "CPI": "CPI",
  "더승진(2공장)": "SJ2",
  "SJ패키지": "SJP"
};

export const SUPABASE_MUTATION_ACTIONS = new Set([
  "createProduct",
  "updateProduct",
  "deleteProduct",
  "createPurchaseOrder",
  "updatePurchaseOrder",
  "deletePurchaseOrder",
  "createInbound",
  "updateInbound",
  "deleteInbound",
  "getInboundBoxQrs",
  "saveShippingInspection",
  "cancelDiscardedBoxes",
  "classifyRemainingInventory",
  "updateShippingStatus",
  "adjustMissingInventory",
  "updateInventoryBoxMove",
  "returnTransferredInventory",
  "returnTakenOutInventory"
]);

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const matched = text(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : 0;
}

function integer(value) {
  return Math.max(0, Math.trunc(number(value)));
}

function formatEa(value) {
  return `${integer(value).toLocaleString("en-US")} ea`;
}

function formatBox(value) {
  return `${integer(value).toLocaleString("en-US")} box`;
}

function dash(value) {
  return text(value) || "-";
}

function dateParts(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    shortDate: `${parts.year.slice(-2)}${parts.month}${parts.day}`,
    displayDate: `${Number(parts.year)}. ${Number(parts.month)}. ${Number(parts.day)}`,
    time: `${parts.hour}:${parts.minute}`,
    timestamp: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
    qrTimestamp: `${Number(parts.year)}. ${Number(parts.month)}. ${Number(parts.day)} ${parts.hour}:${parts.minute}`
  };
}

function normalizeStatus(value) {
  const raw = text(value);
  const compact = raw.replace(/\s+/g, "");
  const aliases = {
    "": "보관",
    "-": "보관",
    "검수완료": "출고대기",
    "출고대기(검수완료)": "출고대기",
    "출고대기": "출고대기",
    "출고완료": "출고완료",
    "일부출고": "일부 출고",
    "부분출고": "일부 출고",
    "출고보류": "보류"
  };
  return aliases[compact] || raw || "보관";
}

function normalizeRemainders(payload) {
  if (Array.isArray(payload.remainderQuantities)) {
    return payload.remainderQuantities.map(integer).filter((value) => value > 0);
  }
  const remainQuantity = integer(payload.remainQuantity);
  return remainQuantity > 0 ? [remainQuantity] : [];
}

function inventoryKey(managementId, productId, storage) {
  return [text(managementId), text(productId), text(storage) || "미지정"].join("|");
}

function inboundKey(managementId, productId) {
  return [text(managementId), text(productId)].join("|");
}

function emptyChanges() {
  return {
    products: { upserts: [], deletes: [] },
    purchaseOrders: { upserts: [], deletes: [] },
    inbounds: { upserts: [], deletes: [] },
    inventoryRecords: { upserts: [], deletes: [] },
    inventoryBoxes: { upserts: [], deletes: [] }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getProductProcess(payload, current = {}) {
  const stage1 = text(payload["1도 공정"] ?? payload.stage1Process ?? current.processStage1);
  const stage2 = text(payload["2도 공정"] ?? payload.stage2Process ?? current.processStage2);
  const stage3 = text(payload["3도 공정"] ?? payload.stage3Process ?? current.processStage3);
  if (stage3 && !stage2) throw new Error("3도 공정을 등록하려면 2도 공정을 먼저 선택해주세요.");
  if (stage2 && !stage1) throw new Error("2도 공정을 등록하려면 1도 공정을 먼저 선택해주세요.");
  const finalProcess = stage3 ? "3도" : stage2 ? "2도" : stage1 ? "1도" : text(payload["최종공정"] ?? payload.finalProcess ?? current.finalProcess);
  if (!finalProcess) throw new Error("SKU 고정 공정을 선택해주세요.");
  return { stage1, stage2, stage3, finalProcess };
}

function makeClientCode(clientName) {
  const name = text(clientName).replace(/\s+/g, "");
  if (CLIENT_CODES[name]) return CLIENT_CODES[name];
  const ascii = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
  if (ascii) return ascii.padEnd(3, "X");
  const korean = Array.from(name.replace(/\(주\)|주식회사|[()]/g, "")).slice(0, 3);
  const code = korean.map((letter) => letter.charCodeAt(0).toString(36).slice(-1).toUpperCase()).join("");
  return (code || "PRD").padEnd(3, "X").slice(0, 3);
}

function generateProductId(products, clientName) {
  const code = makeClientCode(clientName);
  const maximum = products.reduce((max, product) => {
    const matched = text(product.productCode || product.productId).match(new RegExp(`^${code}-(\\d+)$`));
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  return `${code}-${String(maximum + 1).padStart(4, "0")}`;
}

function generatePurchaseOrderId(orders, productId, now) {
  const date = dateParts(now).shortDate;
  const product = text(productId).replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) || "PRODUCT";
  const prefix = `PO-${date}-${product}-`;
  const maximum = orders.reduce((max, order) => {
    const id = text(order.purchaseOrderId);
    const sequence = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : 0;
    return Number.isInteger(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}${String(maximum + 1).padStart(3, "0")}`;
}

function generateManagementId(inbounds, records, productId, now) {
  const product = text(productId).replace(/\s+/g, "").replace(/[^0-9A-Za-z가-힣_-]/g, "").toUpperCase() || "NO-PRODUCT";
  const prefix = `IN-${dateParts(now).shortDate}-${product}-`;
  const ids = [...inbounds, ...records].map((item) => text(item.managementId));
  const maximum = ids.reduce((max, id) => {
    const sequence = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : 0;
    return Number.isInteger(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}${String(maximum + 1).padStart(3, "0")}`;
}

function purchaseOrderStatus(order, today) {
  if (text(order.status || order.storedStatus) === "취소") return "취소";
  if (number(order.totalOrderQuantity) > 0 && number(order.accumulatedInboundQuantity) >= number(order.totalOrderQuantity)) return "입고완료";
  if (text(order.startDate) && today < text(order.startDate)) return "예정";
  if (text(order.endDate) && today > text(order.endDate)) return "기간 경과";
  return "진행 중";
}

function recalculateOrders(orders, inbounds, changes, today) {
  orders.forEach((order) => {
    const accumulated = inbounds
      .filter((inbound) => text(inbound.purchaseOrderId) === text(order.purchaseOrderId))
      .reduce((sum, inbound) => sum + number(inbound.inboundTotalQuantity), 0);
    const next = {
      ...order,
      accumulatedInboundQuantity: accumulated,
      remainingQuantity: Math.max(number(order.totalOrderQuantity) - accumulated, 0),
      inboundRate: number(order.totalOrderQuantity) > 0 ? accumulated / number(order.totalOrderQuantity) : 0
    };
    next.status = purchaseOrderStatus(next, today);
    Object.assign(order, next);
    changes.purchaseOrders.upserts.push({ purchase_order_id: order.purchaseOrderId, product_id: order.productId, data: order });
  });
}

function recalculateProductInbound(products, records, boxes, changes, affectedProductIds = null) {
  const affected = affectedProductIds
    ? new Set([...affectedProductIds].map(text).filter(Boolean))
    : null;
  const totals = new Map();
  const countedRecords = new Set();

  records.forEach((record) => {
    const productId = text(record.productId);
    const managementId = text(record.managementId);
    if (affected && !affected.has(productId)) return;
    const key = inboundKey(managementId, productId);
    if (!productId || !managementId || countedRecords.has(key)) return;
    countedRecords.add(key);

    const takenOutQuantity = boxes
      .filter((box) => (
        text(box.managementId) === managementId
        && text(box.productId) === productId
        && normalizeStatus(box.rawStatus || box.status) === "출고완료"
        && text(box.shippingType).replace(/\s+/g, "").startsWith("반출")
      ))
      .reduce((sum, box) => sum + number(box.quantity), 0);
    const accumulated = Math.max(0, number(record.inboundTotalQuantity) - takenOutQuantity);
    totals.set(productId, (totals.get(productId) || 0) + accumulated);
  });

  products.forEach((product) => {
    const productId = text(product.productId || product.productCode);
    if (affected && !affected.has(productId)) return;
    const total = totals.get(productId) || 0;
    product.accumulatedInboundQuantity = formatEa(total);
    changes.products.upserts.push({ product_id: productId, data: product });
  });
}

function clearShippingInspection(box) {
  box.inspectionDate = "";
  box.inspectionTime = "";
  box.inspector = "";
  box.inspectionQuantity = 0;
  box.defectQuantity = 0;
  box.defectRate = 0;
  box.defectReason = "";
  box.defectPhotoFolderUrl = "";
  box.defectPhotoCount = 0;
}

function mergeAttachmentUrls(...values) {
  return [...new Set(values
    .flatMap((value) => text(value).split(/\s+/))
    .map(text)
    .filter((value) => value && value !== "-"))]
    .join(" ");
}

function resolveAggregateStockStatus(boxes) {
  const available = boxes.filter((box) => number(box.quantity) > 0 && !/폐기/.test(normalizeStatus(box.rawStatus || box.status)));
  const shipped = available.filter((box) => normalizeStatus(box.rawStatus || box.status) === "출고완료");
  const active = available.filter((box) => normalizeStatus(box.rawStatus || box.status) !== "출고완료");
  if (active.length && shipped.length) return "일부 출고";
  if (!active.length && shipped.length) return "출고완료";
  if (active.some((box) => normalizeStatus(box.rawStatus || box.status) === "출고대기")) return "출고대기";
  if (active.some((box) => normalizeStatus(box.rawStatus || box.status) === "보류")) return "보류";
  return "보관";
}

function getBoxSelection(payload) {
  return {
    numbers: new Set((Array.isArray(payload.selectedBoxes) ? payload.selectedBoxes : []).map(integer).filter(Boolean)),
    ids: new Set((Array.isArray(payload.selectedBoxIds) ? payload.selectedBoxIds : []).map(text).filter(Boolean))
  };
}

function getBoxQuantityMap(payload) {
  const source = payload.boxQuantities || payload.selectedBoxQuantities || {};
  return Object.entries(source).reduce((result, [key, value]) => {
    const boxNumber = integer(key);
    const quantity = number(value);
    if (boxNumber > 0 && Number.isFinite(quantity) && quantity >= 0) result.set(boxNumber, quantity);
    return result;
  }, new Map());
}

function selectBoxes(state, payload, { allowEmpty = false, requireSelection = false } = {}) {
  const managementId = text(payload.managementId);
  const productId = text(payload.productId || payload["제품ID"] || payload["제품 ID"]);
  const { numbers: selectedNumbers, ids: selectedIds } = getBoxSelection(payload);
  if (requireSelection && !selectedNumbers.size && !selectedIds.size) throw new Error("처리할 박스를 선택해주세요.");
  const matches = state.boxes.filter((box) => (
    text(box.managementId) === managementId
    && (!productId || text(box.productId) === productId)
    && ((!selectedNumbers.size && !selectedIds.size) || selectedNumbers.has(integer(box.number)) || selectedIds.has(text(box.boxId)))
  ));
  if (!allowEmpty && !matches.length) throw new Error("처리할 박스를 찾을 수 없습니다. 최신 목록을 다시 불러와주세요.");
  return matches;
}

function upsertBoxes(boxes, changes) {
  boxes.forEach((box) => changes.inventoryBoxes.upserts.push({
    box_id: box.boxId,
    management_id: box.managementId,
    product_id: box.productId,
    storage: text(box.storage) || "미지정",
    box_number: integer(box.number),
    data: box
  }));
}

function touchInventoryRecords(state, managementIds, changes) {
  const ids = new Set(managementIds.map(text));
  state.records.filter((row) => ids.has(text(row.managementId))).forEach((row) => {
    const related = state.boxes.filter((box) => text(box.managementId) === text(row.managementId) && text(box.productId) === text(row.productId));
    const active = related.filter((box) => number(box.quantity) > 0 && !/출고완료|폐기/.test(normalizeStatus(box.rawStatus || box.status)));
    const shipped = related.filter((box) => /출고완료/.test(normalizeStatus(box.rawStatus || box.status)));
    row.storage = active[0]?.storage || row.storage || "미지정";
    row.stockStatus = resolveAggregateStockStatus(related);
    row.processStatus = row.stockStatus;
    row.currentBoxCount = formatBox(active.length);
    row.boxTotalCount = formatBox(active.length);
    row.currentTotalQuantity = formatEa(active.reduce((sum, box) => sum + number(box.quantity), 0));
    row.shippingDate = shipped.map((box) => text(box.shippingDate)).sort().at(-1) || "";
    row.shippingUpdatedAt = related.map((box) => text(box.shippingUpdatedAt)).sort().at(-1) || "";
    row.inventoryAdjustmentBoxCount = shipped.filter((box) => text(box.shippingType) === "재고조정").length;
    row.inventoryAdjustmentQuantity = shipped.filter((box) => text(box.shippingType) === "재고조정").reduce((sum, box) => sum + number(box.quantity), 0);
    row.lastInventoryCheckedAt = related.map((box) => text(box.lastInventoryCheckedAt)).sort().at(-1) || row.lastInventoryCheckedAt || "";
    const oldKey = text(row.recordKey || inventoryKey(row.managementId, row.productId, row.originalStorage || row.storage));
    const nextKey = inventoryKey(row.managementId, row.productId, row.storage);
    if (oldKey !== nextKey) changes.inventoryRecords.deletes.push(oldKey);
    row.recordKey = nextKey;
    row.originalStorage = row.storage;
    changes.inventoryRecords.upserts.push({
      record_key: nextKey,
      management_id: row.managementId,
      product_id: row.productId,
      storage: row.storage,
      data: row
    });
  });
}

function createOrUpdateProduct(action, payload, state, changes, now) {
  const products = state.products;
  const requestedId = text(payload.productId || payload.productCode || payload["제품 ID"] || payload["제품ID"]);
  const current = action === "updateProduct"
    ? products.find((item) => text(item.productId || item.productCode) === requestedId)
    : null;
  if (action === "updateProduct" && !current) throw new Error("수정할 제품을 찾을 수 없습니다.");
  const clientName = text(payload["업체명"] ?? payload.clientName ?? current?.clientName);
  const productName = text(payload["제품명"] ?? payload.productName ?? current?.productName);
  const boxQuantity = payload["박스당 수량"] ?? payload.boxQuantity ?? current?.boxQuantity;
  const trayQuantity = payload["트레이 수량"] ?? payload.trayQuantity ?? current?.trayQuantity;
  if (!clientName || !productName || number(boxQuantity) <= 0 || number(trayQuantity) <= 0) throw new Error("제품 필수값과 수량을 확인해주세요.");
  const process = getProductProcess(payload, current || {});
  const productId = current?.productId || requestedId || generateProductId(products, clientName);
  const parts = dateParts(now);
  const namesValue = payload["출고시 제품명 목록"] ?? current?.shippingProductNames ?? [];
  let shippingProductNames = Array.isArray(namesValue) ? namesValue.map(text).filter(Boolean) : [];
  if (!Array.isArray(namesValue)) {
    try { shippingProductNames = JSON.parse(text(namesValue) || "[]").map(text).filter(Boolean); } catch (_error) { shippingProductNames = []; }
  }
  const isCommonContainer = [true, "유", "예", "true", "1"].includes(payload["공용용기 제품"] ?? current?.isCommonContainer ?? false);
  const product = {
    ...(current || {}),
    registeredAt: current?.registeredAt || parts.date.replaceAll("-", "."),
    registeredTime: current?.registeredTime || parts.time,
    createdBy: current?.createdBy || text(payload["등록자"] || "Admin"),
    productId,
    productCode: productId,
    clientName,
    productName,
    color: dash(payload["색상"] ?? current?.color),
    isCommonContainer,
    commonContainerProduct: isCommonContainer ? "유" : "무",
    shippingProductTypeCount: isCommonContainer ? number(payload["출고시 제품 종류 수"] ?? shippingProductNames.length) : 0,
    shippingProductNames: isCommonContainer ? shippingProductNames : [],
    dustRemovalStatus: text(payload["박가루제거 유무"] ?? current?.dustRemovalStatus) || "무",
    flameTreatmentStatus: text(payload["화염처리 유무"] ?? current?.flameTreatmentStatus) || "무",
    useStatus: text(payload["사용 여부"] ?? current?.useStatus) || "사용중",
    finalProcess: process.finalProcess,
    processStage1: process.stage1,
    processStage2: process.stage2,
    processStage3: process.stage3,
    processRoute: [process.stage1, process.stage2, process.stage3].map((value, index) => value ? `${index + 1}도 ${value}` : "").filter(Boolean).join(" → ") || process.finalProcess,
    orderQuantity: text(payload["발주량"] ?? current?.orderQuantity) || "-",
    accumulatedInboundQuantity: current?.accumulatedInboundQuantity || "0 ea",
    boxQuantity: formatEa(number(boxQuantity)),
    trayQuantity: formatEa(number(trayQuantity)),
    dueDate: dash(payload["납기일"] ?? current?.dueDate),
    note: dash(payload["비고"] ?? current?.note),
    updatedAt: parts.date.replaceAll("-", "."),
    updatedTime: parts.time
  };
  if (current) Object.assign(current, product); else products.push(product);
  changes.products.upserts.push({ product_id: productId, data: product });
  return { productId, updated: Boolean(current) };
}

function createOrUpdatePurchaseOrder(action, payload, state, changes, now) {
  const id = text(payload.purchaseOrderId);
  const current = action === "updatePurchaseOrder" ? state.orders.find((item) => text(item.purchaseOrderId) === id) : null;
  if (action === "updatePurchaseOrder" && !current) throw new Error("수정할 발주를 찾을 수 없습니다.");
  const productId = text(payload.productId || current?.productId);
  const total = integer(payload.totalOrderQuantity ?? current?.totalOrderQuantity);
  const startDate = text(payload.startDate || current?.startDate);
  const endDate = text(payload.endDate ?? current?.endDate);
  if (!productId || !text(payload.clientName || current?.clientName) || !text(payload.productName || current?.productName) || !startDate || total <= 0) throw new Error("발주 필수값을 확인해주세요.");
  if (endDate && startDate > endDate) throw new Error("납기일은 발주 시작일보다 빠를 수 없습니다.");
  if (current && total < number(current.accumulatedInboundQuantity)) throw new Error("총 발주량은 현재 누적 입고량보다 작게 변경할 수 없습니다.");
  const orderRound = text(payload.orderRound ?? current?.orderRound);
  if (orderRound && state.orders.some((item) => item !== current && text(item.productId) === productId && text(item.orderRound) === orderRound)) throw new Error("동일 제품과 발주 차수가 이미 등록되어 있습니다.");
  const parts = dateParts(now);
  const orderId = current?.purchaseOrderId || generatePurchaseOrderId(state.orders, productId, now);
  const order = {
    ...(current || {}),
    purchaseOrderId: orderId,
    productId,
    clientName: text(payload.clientName || current?.clientName),
    productName: text(payload.productName || current?.productName),
    orderRound,
    startDate,
    endDate,
    totalOrderQuantity: total,
    accumulatedInboundQuantity: number(current?.accumulatedInboundQuantity),
    remainingQuantity: Math.max(total - number(current?.accumulatedInboundQuantity), 0),
    inboundRate: total > 0 ? number(current?.accumulatedInboundQuantity) / total : 0,
    status: text(payload.status) === "취소" ? "취소" : "진행 중",
    storedStatus: text(payload.status) === "취소" ? "취소" : "진행 중",
    note: text(payload.note ?? current?.note),
    registrant: text(payload.registrant || current?.registrant || "Admin"),
    registeredAt: current?.registeredAt || parts.timestamp,
    updatedAt: parts.timestamp
  };
  order.status = purchaseOrderStatus(order, parts.date);
  if (current) Object.assign(current, order); else state.orders.push(order);
  changes.purchaseOrders.upserts.push({ purchase_order_id: orderId, product_id: productId, data: order });
  return { purchaseOrderId: orderId };
}

function makeInboundRecord(payload, managementId, product, order, now, current = {}) {
  const remainders = normalizeRemainders(payload);
  const boxQuantity = integer(payload.boxQuantity);
  const fullBoxes = integer(payload.inboundBoxCount);
  const totalBoxes = fullBoxes + remainders.length;
  const totalQuantity = boxQuantity * fullBoxes + remainders.reduce((sum, value) => sum + value, 0);
  const inspectionQuantity = integer(payload.inspectionQuantity);
  const defectQuantity = integer(payload.defectQuantity);
  if (!text(payload.inboundDate) || !text(payload.inboundTime) || !text(payload.inboundType) || !text(payload.storage) || boxQuantity <= 0 || totalBoxes <= 0) throw new Error("입고 필수값과 수량을 확인해주세요.");
  const parts = dateParts(now);
  return {
    ...current,
    status: text(payload.stockStatus || payload.status || current.status) || "보관",
    managementId,
    registeredAt: current.registeredAt || parts.displayDate,
    registrant: text(payload.registrant || current.registrant || "Admin"),
    inboundDate: text(payload.inboundDate),
    inboundTime: text(payload.inboundTime),
    inboundType: text(payload.inboundType),
    dueDate: dash(order?.endDate || payload.dueDate || current.dueDate),
    purchaseOrderId: order?.purchaseOrderId || text(payload.purchaseOrderId),
    purchaseOrderRound: order?.orderRound || "",
    clientName: text(payload.clientName || product?.clientName || current.clientName),
    productId: text(payload.productId || product?.productId || current.productId),
    productName: text(payload.productName || product?.productName || current.productName),
    batch: dash(payload.batch),
    process: text(product?.finalProcess || payload.process || current.process),
    storage: text(payload.storage),
    boxQuantity: formatEa(boxQuantity),
    trayQuantity: formatEa(number(product?.trayQuantity || payload.trayQuantity || current.trayQuantity)),
    inboundBoxCount: formatBox(fullBoxes),
    remainQuantity: formatEa(remainders.reduce((sum, value) => sum + value, 0)),
    remainderQuantities: remainders,
    boxTotalCount: formatBox(totalBoxes),
    inboundTotalQuantity: formatEa(totalQuantity),
    inspectionQuantity: formatEa(inspectionQuantity),
    defectQuantity: formatEa(defectQuantity),
    defectRate: `${inspectionQuantity > 0 ? Math.round((defectQuantity / inspectionQuantity) * 100) : 0}%`,
    defectReason: dash(payload.defectReason || "양호"),
    invoiceFileUrl: current.invoiceFileUrl || "-",
    defectPhotoUrls: current.defectPhotoUrls || "-",
    qrPrintStatus: current.qrPrintStatus || "미인쇄",
    qrGeneratedCount: number(current.qrGeneratedCount),
    note: dash(payload.note)
  };
}

function createOrUpdateInbound(action, payload, state, changes, now) {
  const parts = dateParts(now);
  const productId = text(payload.productId);
  const product = state.products.find((item) => text(item.productId || item.productCode) === productId);
  if (!product) throw new Error("선택한 제품을 찾을 수 없습니다.");
  const requestedOrderId = text(payload.purchaseOrderId);
  const order = requestedOrderId ? state.orders.find((item) => text(item.purchaseOrderId) === requestedOrderId) : null;
  if (requestedOrderId && !order) throw new Error("선택한 발주 건을 찾을 수 없습니다.");
  if (order && text(order.productId) !== productId) throw new Error("선택한 발주와 입고 제품이 일치하지 않습니다.");
  if (order?.status === "취소") throw new Error("취소된 발주에는 입고를 등록할 수 없습니다.");
  const currentManagementId = text(payload.managementId);
  const currentInbound = action === "updateInbound" ? state.inbounds.find((item) => text(item.managementId) === currentManagementId && (!productId || text(item.productId) === productId)) : null;
  const currentRecord = action === "updateInbound" ? state.records.find((item) => text(item.managementId) === currentManagementId && (!productId || text(item.productId) === productId)) : null;
  if (action === "updateInbound" && !currentRecord) throw new Error("수정할 입고 내역을 찾을 수 없습니다.");
  const managementId = currentManagementId || generateManagementId(state.inbounds, state.records, productId, now);
  const inbound = makeInboundRecord(payload, managementId, product, order, now, currentInbound || currentRecord || {});
  const previousBoxes = state.boxes.filter((box) => text(box.managementId) === managementId && text(box.productId) === productId);
  const hasProcessedBoxes = previousBoxes.some((box) => /출고완료|폐기|출고대기|보류/.test(normalizeStatus(box.rawStatus || box.status)));
  const currentRemainders = normalizeRemainders(currentRecord || {});
  const nextRemainders = normalizeRemainders(payload);
  const previousBoxesByNumber = [...previousBoxes].sort((left, right) => integer(left.number) - integer(right.number));
  const currentFullBoxCount = integer(currentRecord?.inboundBoxCount);
  const preservesProcessedBoxIdentity = action === "updateInbound"
    && hasProcessedBoxes
    && integer(payload.boxQuantity) === integer(currentRecord?.boxQuantity)
    && integer(payload.inboundBoxCount) === currentFullBoxCount
    && nextRemainders.length === currentRemainders.length
    && text(currentRecord?.storage) === text(inbound.storage)
    && previousBoxesByNumber.length === currentFullBoxCount + currentRemainders.length;
  const existingStock = text(payload.category || payload.entryCategory || payload.inboundType).replace(/\s/g, "") === "기존재고";
  if (!existingStock) {
    const oldKey = currentInbound ? inboundKey(currentInbound.managementId, currentInbound.productId) : "";
    const key = inboundKey(managementId, productId);
    if (oldKey && oldKey !== key) changes.inbounds.deletes.push(oldKey);
    if (currentInbound) Object.assign(currentInbound, inbound); else state.inbounds.push(inbound);
    changes.inbounds.upserts.push({ record_key: key, management_id: managementId, product_id: productId, inbound_date: inbound.inboundDate, data: inbound });
  }
  const record = {
    ...(currentRecord || inbound),
    ...inbound,
    finalProcess: inbound.process,
    stockStatus: inbound.status,
    processStatus: inbound.status,
    currentBoxCount: inbound.boxTotalCount,
    currentTotalQuantity: inbound.inboundTotalQuantity,
    countsAsInventory: true,
    allShippingBoxes: undefined,
    activeShippingBoxes: undefined,
    shippedShippingBoxes: undefined
  };
  const oldRecordKey = currentRecord ? text(currentRecord.recordKey || inventoryKey(currentRecord.managementId, currentRecord.productId, currentRecord.storage)) : "";
  const recordKey = inventoryKey(managementId, productId, inbound.storage);
  if (oldRecordKey && oldRecordKey !== recordKey) changes.inventoryRecords.deletes.push(oldRecordKey);
  record.recordKey = recordKey;
  record.originalStorage = inbound.storage;
  if (currentRecord) Object.assign(currentRecord, record); else state.records.push(record);

  if (action === "updateInbound" && hasProcessedBoxes) {
    if (!preservesProcessedBoxIdentity) {
      throw new Error("출고 또는 재고 처리가 시작된 입고는 박스 구성을 수정할 수 없습니다.");
    }
    const updatedRemainderBoxes = [];
    previousBoxesByNumber.slice(currentFullBoxCount).forEach((box, index) => {
      if (number(box.quantity) === nextRemainders[index]) return;
      box.quantity = nextRemainders[index];
      box.quantityAdjustedAt = parts.timestamp;
      box.quantityAdjuster = text(payload.registrant || payload.userName || "Admin");
      updatedRemainderBoxes.push(box);
    });
    upsertBoxes(updatedRemainderBoxes, changes);
    touchInventoryRecords(state, [managementId], changes);
    recalculateOrders(state.orders, state.inbounds, changes, dateParts(now).date);
    recalculateProductInbound(state.products, state.records, state.boxes, changes, new Set([productId]));
    return {
      managementId,
      boxCount: previousBoxes.length,
      boxIds: previousBoxes.map((box) => box.boxId),
      updatedBoxRows: updatedRemainderBoxes.length
    };
  }
  changes.inventoryRecords.upserts.push({ record_key: recordKey, management_id: managementId, product_id: productId, storage: inbound.storage, data: record });
  state.boxes = state.boxes.filter((box) => !previousBoxes.includes(box));
  const remainders = normalizeRemainders(payload);
  const fullBoxes = integer(payload.inboundBoxCount);
  const boxQuantity = integer(payload.boxQuantity);
  const quantities = [...Array.from({ length: fullBoxes }, () => boxQuantity), ...remainders];
  const boxes = quantities.map((quantity, index) => ({
    boxId: `${managementId}-B${String(index + 1).padStart(3, "0")}`,
    managementId,
    number: index + 1,
    productId,
    productName: inbound.productName,
    quantity,
    status: "보관",
    rawStatus: "보관",
    storage: inbound.storage,
    inspectionDate: "",
    inspectionTime: "",
    inspectionQuantity: 0,
    defectQuantity: 0,
    defectRate: 0,
    defectReason: "",
    defectPhotoFolderUrl: "",
    shippingUpdatedAt: "",
    shippingDate: "",
    shippingTime: "",
    shippingType: "",
    transferCompany: "",
    shipper: ""
  }));
  const nextBoxIds = new Set(boxes.map((box) => box.boxId));
  previousBoxes
    .filter((box) => !nextBoxIds.has(box.boxId))
    .forEach((box) => changes.inventoryBoxes.deletes.push(box.boxId));
  state.boxes.push(...boxes);
  upsertBoxes(boxes, changes);
  recalculateOrders(state.orders, state.inbounds, changes, dateParts(now).date);
  recalculateProductInbound(state.products, state.records, state.boxes, changes, new Set([productId]));
  return { managementId, boxCount: boxes.length, boxIds: boxes.map((box) => box.boxId) };
}

function mutateInventory(action, payload, state, changes, now) {
  const parts = dateParts(now);
  const clearShippingWaiting = action === "saveShippingInspection" && payload.clearShippingWaiting === true;
  let boxes = selectBoxes(state, payload, {
    requireSelection: action !== "getInboundBoxQrs" && !clearShippingWaiting
  });
  if (action === "getInboundBoxQrs") {
    const qrBoxes = boxes.map((box) => ({
      ...box,
      qrData: text(box.qrData) || JSON.stringify({
        t: "SJ_BOX",
        b: box.boxId,
        m: box.managementId,
        p: box.productId,
        n: box.number
      }),
      sequence: box.number,
      boxQuantity: formatEa(box.quantity),
      currentQuantity: formatEa(box.quantity)
    }));
    const inbounds = state.inbounds.filter((row) => (
      text(row.managementId) === text(payload.managementId)
      && (!text(payload.productId) || text(row.productId) === text(payload.productId))
    ));
    inbounds.forEach((row) => {
      row.qrGeneratedCount = boxes.length;
      row.qrPrintStatus = "QR 생성";
      changes.inbounds.upserts.push({
        record_key: inboundKey(row.managementId, row.productId),
        management_id: row.managementId,
        product_id: row.productId,
        inbound_date: row.inboundDate,
        data: row
      });
    });
    return { managementId: text(payload.managementId), generatedAt: parts.qrTimestamp, boxCount: boxes.length, boxes: qrBoxes };
  }

  if (action === "classifyRemainingInventory") {
    const category = text(payload.inventoryCategory);
    if (!["자사재고", "사출 보관재고"].includes(category)) throw new Error("재고 구분을 선택해주세요.");
    boxes.forEach((box) => {
      if (normalizeStatus(box.rawStatus || box.status) !== "보관" || number(box.quantity) <= 0) throw new Error("등록할 수 있는 남은 박스가 아닙니다.");
      box.inventoryCategory = category;
      box.inventoryClassifiedAt = parts.timestamp;
      box.inventoryClassifier = text(payload.userName || "Admin");
    });
    upsertBoxes(boxes, changes);
    return { managementId: text(payload.managementId), inventoryCategory: category, classifiedAt: parts.timestamp, classifier: text(payload.userName || "Admin"), updatedRows: boxes.length, totalQuantity: boxes.reduce((sum, box) => sum + number(box.quantity), 0) };
  }

  if (action === "cancelDiscardedBoxes") {
    boxes.forEach((box) => {
      if (!/폐기/.test(normalizeStatus(box.rawStatus || box.status))) throw new Error("폐기 상태가 아닌 박스가 포함되어 있습니다.");
      const restoredQuantity = number(box.beforeDiscardQuantity) || number(box.originalQuantity) || number(box.quantity);
      if (restoredQuantity <= 0) throw new Error(`${box.number}번 박스의 복구할 수량을 확인할 수 없습니다.`);
      box.quantity = restoredQuantity;
      box.beforeDiscardQuantity = 0;
      box.status = "보관";
      box.rawStatus = "보관";
      box.shippingDate = "";
      box.shippingTime = "";
      box.shippingType = "";
      box.transferCompany = "";
      box.shipper = "";
      clearShippingInspection(box);
      box.note = `폐기 취소 (${text(payload.userName || payload.registrant || "Admin")})`;
      box.shippingUpdatedAt = parts.timestamp;
    });
    upsertBoxes(boxes, changes);
    touchInventoryRecords(state, boxes.map((box) => box.managementId), changes);
    const related = state.boxes.filter((box) => text(box.managementId) === text(payload.managementId));
    return { managementId: text(payload.managementId), stockStatus: resolveAggregateStockStatus(related), updatedBoxRows: boxes.length, updatedRows: boxes.length, restoredQuantity: boxes.reduce((sum, box) => sum + number(box.quantity), 0) };
  }

  if (action === "saveShippingInspection") {
    const reasons = Array.isArray(payload.defectReasons) ? payload.defectReasons.map(text).filter(Boolean) : text(payload.defectReasons).split(",").map(text).filter(Boolean);
    if (!reasons.length) throw new Error("불량내역을 하나 이상 선택해주세요.");
    const clear = clearShippingWaiting;
    const discard = payload.discardRequested === true;
    const hold = payload.holdRequested === true;
    if (hold && discard) throw new Error("출고 보류와 박스 폐기는 동시에 선택할 수 없습니다.");
    if (clear) {
      boxes = boxes.filter((box) => ["출고대기", "보류"].includes(normalizeStatus(box.rawStatus || box.status)));
      if (!boxes.length) throw new Error("해제할 출고대기 박스를 찾을 수 없습니다.");
    }
    const quantityMap = getBoxQuantityMap(payload);
    boxes.sort((left, right) => integer(left.number) - integer(right.number)).forEach((box, index) => {
      const currentStatus = normalizeStatus(box.rawStatus || box.status);
      if (!clear && /출고완료|폐기/.test(currentStatus)) throw new Error(`${box.number}번 박스는 출고 검수 대상이 아닙니다.`);
      const changedQuantity = quantityMap.get(integer(box.number));
      if (!discard && changedQuantity !== undefined) box.quantity = changedQuantity;
      if (discard) {
        box.beforeDiscardQuantity = changedQuantity !== undefined ? changedQuantity : number(box.quantity);
        box.status = "폐기";
        box.rawStatus = "폐기";
        box.quantity = 0;
      } else if (clear) {
        box.status = "보관";
        box.rawStatus = "보관";
        clearShippingInspection(box);
      } else if (hold) {
        box.status = "보류";
        box.rawStatus = "보류";
      } else {
        box.status = "출고대기";
        box.rawStatus = "출고대기(검수완료)";
      }
      if (!clear) {
        box.inspectionDate = text(payload.inspectionDate || parts.date);
        box.inspectionTime = text(payload.inspectionTime || parts.time);
        box.inspector = text(payload.inspector || payload.userName || "Admin");
        box.inspectionQuantity = index === 0 ? number(payload.inspectionQuantity) : 0;
        box.defectQuantity = index === 0 ? number(payload.defectQuantity) : 0;
        box.defectRate = index === 0 && number(payload.inspectionQuantity) > 0
          ? number(payload.defectQuantity) / number(payload.inspectionQuantity) * 100
          : 0;
        box.defectReason = reasons.join(", ");
        box.defectPhotoFolderUrl = text(payload.defectPhotoFolderUrl);
        box.note = text(payload.memo || payload.note);
      }
      box.shippingUpdatedAt = parts.timestamp;
    });
    upsertBoxes(boxes, changes);
    touchInventoryRecords(state, boxes.map((box) => box.managementId), changes);
    return { managementId: text(payload.managementId), inspectionStatus: "검수 완료", anomalyStatus: reasons.includes("양호") ? "정상" : "이상", updatedBoxRows: boxes.length, defectPhotoFolderUrl: text(payload.defectPhotoFolderUrl), defectPhotoCount: number(payload.defectPhotoCount), defectQuantity: number(payload.defectQuantity), defectRate: number(payload.inspectionQuantity) > 0 ? number(payload.defectQuantity) / number(payload.inspectionQuantity) * 100 : 0, defectReason: reasons.join(", "), inspectionQuantity: number(payload.inspectionQuantity), inspectionDate: text(payload.inspectionDate || parts.date), inspectionTime: text(payload.inspectionTime || parts.time) };
  }

  if (action === "updateShippingStatus") {
    const status = normalizeStatus(payload.status);
    const rawStatus = text(payload.status) || status;
    const allowed = ["보관", "보류", "출고대기", "출고완료"];
    if (!allowed.includes(status)) throw new Error("지원하지 않는 출고 상태입니다.");
    const quantityMap = getBoxQuantityMap(payload);
    boxes.forEach((box) => {
      const currentStatus = normalizeStatus(box.rawStatus || box.status);
      if (status === "출고완료" && currentStatus !== "출고대기" && payload.allowInventoryAdjustment !== true) {
        throw new Error(`${box.number}번 박스는 출고 검수가 완료되지 않았습니다.`);
      }
      if (status === "출고대기" && /출고완료|폐기/.test(currentStatus)) {
        throw new Error(`${box.number}번 박스는 출고대기로 변경할 수 없는 상태입니다.`);
      }
      if (status === "보류" && /출고완료|폐기/.test(currentStatus)) {
        throw new Error(`${box.number}번 박스는 출고 보류로 변경할 수 없는 상태입니다.`);
      }
      if (status === "보관" && currentStatus === "출고완료" && payload.allowCancelCompleted !== true) {
        throw new Error(`${box.number}번 박스의 출고 취소 권한을 확인해주세요.`);
      }
      if (status === "보관" && /폐기/.test(currentStatus)) {
        throw new Error(`${box.number}번 박스는 보관 상태로 변경할 수 없습니다.`);
      }
      const changedQuantity = quantityMap.get(integer(box.number));
      if (["출고대기", "출고완료"].includes(status) && changedQuantity !== undefined) box.quantity = changedQuantity;
      box.status = status;
      box.rawStatus = rawStatus;
      box.shippingUpdatedAt = parts.timestamp;
      if (status === "출고완료") {
        box.shippingDate = text(payload.shippingDate || parts.date);
        box.shippingTime = text(payload.shippingTime || parts.time);
        box.shippingType = text(payload.shippingType || payload["출고유형"] || "정상출고");
        box.transferCompany = text(payload.transferCompany) || text(text(box.shippingType).match(/^이관\s*\((.+)\)$/)?.[1]);
        box.shipper = text(payload.shipper || "Admin");
        box.defectPhotoFolderUrl = mergeAttachmentUrls(box.defectPhotoFolderUrl, payload.defectPhotoFolderUrl);
        box.defectPhotoCount = number(box.defectPhotoCount) + number(payload.defectPhotoCount);
      } else if (status === "보관") {
        box.shippingDate = "";
        box.shippingTime = "";
        box.shippingType = "";
        box.transferCompany = "";
        box.shipper = "";
        clearShippingInspection(box);
      }
      if (payload.autoShippingInspection) {
        box.inspectionDate = text(payload.inspectionDate || parts.date);
        box.inspectionTime = text(payload.inspectionTime || parts.time);
        box.inspector = text(payload.inspector || payload.shipper || "Admin");
        box.inspectionQuantity = number(payload.inspectionQuantity);
        box.defectQuantity = number(payload.defectQuantity);
        box.defectRate = number(payload.defectRate);
        box.defectReason = text(payload.defectReason || "양호");
      }
    });
    upsertBoxes(boxes, changes);
    touchInventoryRecords(state, boxes.map((box) => box.managementId), changes);
    recalculateProductInbound(state.products, state.records, state.boxes, changes, new Set(boxes.map((box) => box.productId)));
    const related = state.boxes.filter((box) => text(box.managementId) === text(payload.managementId));
    const finalStatus = resolveAggregateStockStatus(related);
    const remainingActiveRows = related.filter((box) => number(box.quantity) > 0 && !/출고완료|폐기/.test(normalizeStatus(box.rawStatus || box.status))).length;
    return { managementId: text(payload.managementId), status: finalStatus, updatedBoxRows: boxes.length, remainingActiveRows, isPartialShipping: status === "출고완료" && finalStatus !== "출고완료", shippingDate: status === "출고완료" ? text(payload.shippingDate || parts.date) : "", shippingTime: status === "출고완료" ? text(payload.shippingTime || parts.time) : "", selectedBoxes: boxes.map((box) => box.number) };
  }

  if (action === "updateInventoryBoxMove") {
    const injection = text(payload.inventoryAction) === "setInjectionStock";
    const targetStorage = text(payload.targetStorage);
    if (!injection && !targetStorage) throw new Error("이동할 보관 위치를 선택해주세요.");
    boxes.forEach((box) => {
      const status = normalizeStatus(box.rawStatus || box.status);
      if (/출고완료|폐기|출고대기|보류/.test(status) || number(box.quantity) <= 0) throw new Error(`${box.number}번 박스는 현재 변경할 수 없는 상태입니다.`);
      if (injection) {
        box.status = "사출재고";
        box.rawStatus = "사출재고";
        box.inventoryCategory = "사출 보관재고";
      } else {
        box.storage = targetStorage;
      }
      box.inventoryMovedAt = parts.timestamp;
      box.inventoryMover = text(payload.userName || "Admin");
    });
    upsertBoxes(boxes, changes);
    touchInventoryRecords(state, boxes.map((box) => box.managementId), changes);
    return { managementId: text(payload.managementId), inventoryAction: injection ? "setInjectionStock" : "move", updatedBoxRows: boxes.length, targetStorage: injection ? text(payload.currentStorage || payload.storage) : targetStorage, remainingSourceActiveRows: state.boxes.filter((box) => text(box.managementId) === text(payload.managementId) && text(box.storage) === text(payload.currentStorage || payload.storage) && number(box.quantity) > 0 && !/출고완료|폐기/.test(normalizeStatus(box.rawStatus || box.status))).length };
  }

  throw new Error(`지원하지 않는 재고 작업입니다: ${action}`);
}

function adjustMissingInventory(payload, state, changes, now) {
  const parts = dateParts(now);
  const confirmations = Array.isArray(payload.confirmedBoxes) ? payload.confirmedBoxes : [];
  let confirmedBoxRows = 0;
  confirmations.forEach((group) => {
    selectBoxes(state, { ...group, productId: group.productId }, { allowEmpty: true, requireSelection: true }).forEach((box) => {
      box.lastInventoryCheckedAt = parts.timestamp;
      changes.inventoryBoxes.upserts.push({ box_id: box.boxId, management_id: box.managementId, product_id: box.productId, storage: box.storage, box_number: integer(box.number), data: box });
      confirmedBoxRows += 1;
    });
  });
  const adjustments = Array.isArray(payload.adjustments) ? payload.adjustments : [];
  const adjusted = [];
  adjustments.forEach((group) => {
    selectBoxes(state, { ...group, productId: group.productId }, { requireSelection: true }).forEach((box) => {
      if (/자사재고|사출|인쇄/.test(`${text(box.inventoryCategory)} ${text(box.rawStatus || box.status)}`)) throw new Error(`${group.productName || "제품"} ${box.number}번 박스는 재고조정 대상에서 제외됩니다.`);
      box.status = "출고완료";
      box.rawStatus = "출고완료";
      box.shippingType = "재고조정";
      box.shippingDate = parts.date;
      box.shippingTime = parts.time;
      box.shipper = text(payload.userName || "Admin");
      box.shippingUpdatedAt = parts.timestamp;
      box.lastInventoryCheckedAt = parts.timestamp;
      adjusted.push(box);
    });
  });
  upsertBoxes(adjusted, changes);
  touchInventoryRecords(state, [...adjusted.map((box) => box.managementId), ...confirmations.map((group) => group.managementId)], changes);
  return { updatedBoxRows: adjusted.length, updatedStockRows: new Set(adjusted.map((box) => box.managementId)).size, confirmedBoxRows, inventoryCheckedAt: parts.timestamp, adjustmentDate: parts.date, adjustmentTime: parts.time, results: adjustments };
}

function returnInventory(action, payload, state, changes, now) {
  const parts = dateParts(now);
  const boxes = selectBoxes(state, payload, { requireSelection: true });
  const mode = action === "returnTakenOutInventory" ? "takeout" : "transfer";
  const requiredPrefix = mode === "takeout" ? "반출" : "이관";
  const targetStatus = normalizeStatus(payload.targetStatus || payload.status);
  if (!["보관", "출고대기"].includes(targetStatus)) throw new Error("복귀 상태는 보관 또는 출고대기만 선택할 수 있습니다.");
  const storage = text(payload.storage || payload.storageLocation);
  if (!storage) throw new Error("복귀할 보관 위치를 선택해주세요.");
  boxes.forEach((box) => {
    if (normalizeStatus(box.rawStatus || box.status) !== "출고완료" || !text(box.shippingType).startsWith(requiredPrefix)) throw new Error(`${box.number}번 박스는 ${requiredPrefix} 복귀 대상이 아닙니다.`);
    const previousShippingDate = text(box.shippingDate);
    const previousShippingTime = text(box.shippingTime);
    const previousShipper = text(box.shipper);
    const previousTransferCompany = text(box.transferCompany) || text(text(box.shippingType).match(/^이관\s*\((.+)\)$/)?.[1]);
    box.status = targetStatus;
    box.rawStatus = targetStatus;
    box.storage = storage;
    box.shippingDate = "";
    box.shippingTime = "";
    box.shippingType = "";
    box.transferCompany = "";
    box.shipper = "";
    clearShippingInspection(box);
    box.shippingUpdatedAt = parts.timestamp;
    box.returner = text(payload.returner || payload.userName || "Admin");
    const actionLabel = mode === "takeout" ? "재입고" : "이관 복귀";
    const outboundAt = [previousShippingDate, previousShippingTime].filter(Boolean).join(" ") || "-";
    const audit = mode === "takeout"
      ? `[${actionLabel} ${parts.timestamp}] ${box.number}번 박스 · 반출 ${outboundAt} · 반출자 ${previousShipper || "-"} · 재입고자 ${box.returner} · ${targetStatus} · 보관위치 ${storage}`
      : `[${actionLabel} ${parts.timestamp}] ${box.number}번 박스 · 이관처 ${previousTransferCompany || "-"} · 이관 ${outboundAt} · 이관자 ${previousShipper || "-"} · 복귀자 ${box.returner} · ${targetStatus} · 보관위치 ${storage}`;
    box.note = [text(box.note) && text(box.note) !== "-" ? text(box.note) : "", audit].filter(Boolean).join("\n");
  });
  upsertBoxes(boxes, changes);
  touchInventoryRecords(state, boxes.map((box) => box.managementId), changes);
  recalculateProductInbound(state.products, state.records, state.boxes, changes, new Set(boxes.map((box) => box.productId)));
  const related = state.boxes.filter((box) => text(box.managementId) === text(payload.managementId));
  return { managementId: text(payload.managementId), status: resolveAggregateStockStatus(related), returnStatus: targetStatus, returnMode: mode, storage, returnedAt: parts.timestamp, returnedBoxes: boxes.map((box) => ({ number: box.number, quantity: number(box.quantity) })), updatedBoxRows: boxes.length };
}

export function applyMutation(action, payload, sourceState, now = new Date()) {
  const state = clone(sourceState);
  const changes = emptyChanges();
  let result;

  if (action === "createProduct" || action === "updateProduct") {
    result = createOrUpdateProduct(action, payload, state, changes, now);
  } else if (action === "deleteProduct") {
    const productId = text(payload.productId || payload.productCode);
    if (!state.products.some((item) => text(item.productId || item.productCode) === productId)) throw new Error("삭제할 제품을 찾을 수 없습니다.");
    state.products = state.products.filter((item) => text(item.productId || item.productCode) !== productId);
    changes.products.deletes.push(productId);
    result = { productId, deleted: true };
  } else if (action === "createPurchaseOrder" || action === "updatePurchaseOrder") {
    result = createOrUpdatePurchaseOrder(action, payload, state, changes, now);
  } else if (action === "deletePurchaseOrder") {
    const id = text(payload.purchaseOrderId);
    const order = state.orders.find((item) => text(item.purchaseOrderId) === id);
    if (!order) throw new Error("삭제할 발주를 찾을 수 없습니다.");
    if (number(order.accumulatedInboundQuantity) > 0) throw new Error("입고 내역이 연결된 발주는 삭제할 수 없습니다. 상태를 취소로 변경해주세요.");
    state.orders = state.orders.filter((item) => item !== order);
    changes.purchaseOrders.deletes.push(id);
    result = { purchaseOrderId: id, deleted: true };
  } else if (action === "createInbound" || action === "updateInbound") {
    result = createOrUpdateInbound(action, payload, state, changes, now);
  } else if (action === "deleteInbound") {
    const managementId = text(payload.managementId);
    const productId = text(payload.productId);
    const inbound = state.inbounds.find((item) => text(item.managementId) === managementId && (!productId || text(item.productId) === productId));
    const records = state.records.filter((item) => text(item.managementId) === managementId && (!productId || text(item.productId) === productId));
    const boxes = state.boxes.filter((item) => text(item.managementId) === managementId && (!productId || text(item.productId) === productId));
    if (!inbound && !records.length) throw new Error("삭제할 입고 내역을 찾을 수 없습니다.");
    if (inbound) changes.inbounds.deletes.push(inboundKey(inbound.managementId, inbound.productId));
    records.forEach((row) => changes.inventoryRecords.deletes.push(text(row.recordKey || inventoryKey(row.managementId, row.productId, row.storage))));
    boxes.forEach((box) => changes.inventoryBoxes.deletes.push(box.boxId));
    state.inbounds = state.inbounds.filter((item) => item !== inbound);
    state.records = state.records.filter((item) => !records.includes(item));
    state.boxes = state.boxes.filter((item) => !boxes.includes(item));
    recalculateOrders(state.orders, state.inbounds, changes, dateParts(now).date);
    const affectedProductIds = new Set([
      ...records.map((row) => row.productId),
      ...boxes.map((box) => box.productId),
      inbound?.productId
    ]);
    recalculateProductInbound(state.products, state.records, state.boxes, changes, affectedProductIds);
    result = { managementId, deletedStockRows: records.length, deletedBoxRows: boxes.length };
  } else if (["getInboundBoxQrs", "saveShippingInspection", "cancelDiscardedBoxes", "classifyRemainingInventory", "updateShippingStatus", "updateInventoryBoxMove"].includes(action)) {
    result = mutateInventory(action, payload, state, changes, now);
  } else if (action === "adjustMissingInventory") {
    result = adjustMissingInventory(payload, state, changes, now);
  } else if (action === "returnTransferredInventory" || action === "returnTakenOutInventory") {
    result = returnInventory(action, payload, state, changes, now);
  } else {
    throw new Error(`지원하지 않는 Supabase 쓰기 요청입니다: ${action}`);
  }

  return { state, changes, result };
}

export function buildInventoryDashboard(records, boxes, products = []) {
  const productsById = new Map(products.map((product) => [
    text(product.productId || product.productCode),
    product
  ]));
  const rows = records.map((source) => {
    const row = clone(source);
    const product = productsById.get(text(row.productId));
    if (product) {
      row.trayQuantity = text(product.trayQuantity) || row.trayQuantity || "";
      row.boxQuantity = text(product.boxQuantity) || row.boxQuantity || "";
    }
    const related = boxes.filter((box) => text(box.managementId) === text(row.managementId) && text(box.productId) === text(row.productId));
    const all = related.sort((left, right) => integer(left.number) - integer(right.number));
    const active = all.filter((box) => number(box.quantity) > 0 && !/출고완료|폐기/.test(normalizeStatus(box.rawStatus || box.status)));
    const shipped = all.filter((box) => /출고완료/.test(normalizeStatus(box.rawStatus || box.status)));
    const transfer = shipped.filter((box) => text(box.shippingType).startsWith("이관"));
    const counted = [...active, ...transfer];
    row.allShippingBoxes = all;
    row.activeShippingBoxes = active;
    row.shippedShippingBoxes = shipped;
    row.stockStatus = active.length && shipped.length ? "일부 출고" : !active.length && shipped.length ? "출고완료" : normalizeStatus(active[0]?.rawStatus || active[0]?.status || row.stockStatus);
    row.processStatus = row.stockStatus;
    row.storage = active[0]?.storage || transfer[0]?.storage || row.storage || "미지정";
    row.currentBoxCount = formatBox(counted.length);
    row.boxTotalCount = formatBox(counted.length);
    row.currentTotalQuantity = formatEa(counted.reduce((sum, box) => sum + number(box.quantity), 0));
    row.completedShippingType = !active.length && shipped.length ? (shipped.some((box) => text(box.shippingType).startsWith("반출")) ? "반출" : shipped.some((box) => text(box.shippingType).startsWith("이관")) ? "이관" : "") : "";
    row.countsAsInventory = counted.length > 0 && !row.completedShippingType.startsWith("반출");
    row.qrGeneratedCount = all.filter((box) => box.qrData || box.qrGeneratedAt).length || number(row.qrGeneratedCount);
    row.qrPrintStatus = all.length > 0 && row.qrGeneratedCount >= all.length ? "QR 생성" : "미인쇄";
    row.shippingInspectionCount = active.filter((box) => box.inspectionDate || number(box.inspectionQuantity) > 0).length;
    row.shippingInspectionQuantity = formatEa(active.reduce((sum, box) => sum + number(box.inspectionQuantity), 0));
    row.shippingDefectQuantity = formatEa(active.reduce((sum, box) => sum + number(box.defectQuantity), 0));
    row.defectPhotoFolderUrl = [...new Set(active.map((box) => text(box.defectPhotoFolderUrl)).filter(Boolean))].join(" ");
    row.defectPhotoCount = row.defectPhotoFolderUrl ? row.defectPhotoFolderUrl.split(/\s+/).length : 0;
    const inventoryAuditBoxes = active.filter((box) => {
      const inventoryCategory = text(box.inventoryCategory);
      const status = normalizeStatus(box.rawStatus || box.status);
      const isProtected = inventoryCategory === "자사재고"
        || /사출|인쇄/.test(`${inventoryCategory} ${status}`);
      return !isProtected;
    });
    row.inventoryAuditTargetBoxCount = inventoryAuditBoxes.length;
    row.inventoryConfirmedBoxCount = inventoryAuditBoxes.filter((box) => text(box.lastInventoryCheckedAt)).length;
    row.inventoryUnconfirmedBoxCount = inventoryAuditBoxes.length - row.inventoryConfirmedBoxCount;
    return row;
  }).filter((row) => !text(row.stockStatus).includes("폐기") && (number(row.currentTotalQuantity) > 0 || text(row.stockStatus).includes("출고완료"))).reverse();

  const activeRows = rows.filter((row) => row.countsAsInventory);
  const locations = new Map();
  boxes.forEach((box) => {
    const status = normalizeStatus(box.rawStatus || box.status);
    const shippingType = text(box.shippingType);
    const isTransfer = shippingType.startsWith("이관");
    if (number(box.quantity) <= 0 || shippingType.startsWith("반출") || /폐기/.test(status) || (!isTransfer && /출고완료/.test(status))) return;
    const storage = text(box.storage) || "미지정";
    const current = locations.get(storage) || { boxes: 0, quantity: 0 };
    current.boxes += 1;
    current.quantity += number(box.quantity);
    locations.set(storage, current);
  });
  const locationBoxStats = [...locations].map(([label, value]) => ({ label, value: value.boxes })).sort((a, b) => b.value - a.value);
  const locationQuantityStats = [...locations].map(([label, value]) => ({ label, value: value.quantity })).sort((a, b) => b.value - a.value);
  const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  return {
    summary: {
      totalItems: new Set(activeRows.map((row) => row.productId).filter(Boolean)).size || activeRows.length,
      totalBoxes: activeRows.reduce((sum, row) => sum + number(row.currentBoxCount), 0),
      totalQuantity: activeRows.reduce((sum, row) => sum + number(row.currentTotalQuantity), 0),
      dueSoonCount: activeRows.filter((row) => Number.isFinite(row.dueDays) && row.dueDays <= 3).length
    },
    filters: {
      clients: unique(rows.map((row) => row.clientName)),
      storages: unique(rows.map((row) => row.storage)),
      stockStatuses: unique(rows.map((row) => row.stockStatus)),
      processStatuses: unique(rows.map((row) => row.processStatus))
    },
    locationBoxStats,
    locationQuantityStats,
    attention: {
      physicalMissingCount: rows.reduce((sum, row) => sum + number(row.inventoryUnconfirmedBoxCount), 0),
      unspecifiedStorageCount: activeRows.filter((row) => !text(row.storage) || text(row.storage) === "미지정").length,
      holdOrDiscardCount: rows.filter((row) => /보류|폐기/.test(text(row.stockStatus))).length
    },
    rows
  };
}
