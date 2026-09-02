const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

const ACTION_LABELS = {
  createProduct: "제품 등록",
  updateProduct: "제품 수정",
  deleteProduct: "제품 삭제",
  createPurchaseOrder: "발주 등록",
  updatePurchaseOrder: "발주 수정",
  deletePurchaseOrder: "발주 삭제",
  createInbound: "입고 등록",
  updateInbound: "입고 수정",
  deleteInbound: "입고 삭제",
  getInboundBoxQrs: "입고 QR 생성",
  saveShippingInspection: "출고 검수 저장",
  cancelDiscardedBoxes: "폐기 취소",
  classifyRemainingInventory: "잔량 재고 분류",
  adjustRemainingInventory: "잔량 재고 정리",
  adjustMissingInventory: "재고 정리",
  updateShippingStatus: "출고 상태 변경",
  updateInventoryBoxMove: "재고 위치 변경",
  returnTransferredInventory: "이관 복귀",
  returnTakenOutInventory: "반출 재입고"
};

function getSeoulDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getItemLabel(row) {
  const primary = normalizeText(row.management_id)
    || normalizeText(row.purchase_order_id)
    || normalizeText(row.product_name)
    || normalizeText(row.legacy_product_name)
    || normalizeText(row.product_id)
    || normalizeText(row.product_code)
    || `대기열 #${row.id}`;
  const productName = normalizeText(row.product_name) || normalizeText(row.legacy_product_name);
  const productId = normalizeText(row.product_id) || normalizeText(row.product_code);
  const details = [productName, productId].filter((value) => value && value !== primary);
  return [primary, ...details].join(" · ");
}

function toIssue(row) {
  const status = normalizeText(row.status) || "pending";
  return {
    id: Number(row.id || 0),
    action: normalizeText(row.action),
    actionLabel: ACTION_LABELS[row.action] || normalizeText(row.action) || "백업 작업",
    itemLabel: getItemLabel(row),
    status,
    statusLabel: status === "failed" ? "실패" : status === "processing" ? "처리 중" : "미처리",
    message: normalizeText(row.last_error)
      || (status === "processing" ? "스프레드시트 반영을 진행하고 있습니다." : "스프레드시트에 반영되지 않았습니다.")
  };
}

function latestTimestamp(rows) {
  return rows
    .flatMap((row) => [row.synced_at, row.processing_started_at])
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

export function buildSheetBackupNotifications(rows, now = new Date()) {
  const today = getSeoulDateKey(now);
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const businessDate = normalizeText(row.business_date);
    if (!businessDate || businessDate > today) continue;
    if (!grouped.has(businessDate)) grouped.set(businessDate, []);
    grouped.get(businessDate).push(row);
  }

  const notifications = [];
  for (const [businessDate, items] of grouped.entries()) {
    const attempted = items.some((item) => Number(item.attempts || 0) > 0);
    if (businessDate === today && !attempted) continue;

    const counts = { synced: 0, failed: 0, pending: 0, processing: 0 };
    for (const item of items) {
      const status = normalizeText(item.status);
      if (Object.hasOwn(counts, status)) counts[status] += 1;
      else counts.pending += 1;
    }

    let status = "failed";
    if (counts.synced === items.length) status = "success";
    else if (counts.processing > 0) status = "processing";

    const issueRows = items
      .filter((item) => normalizeText(item.status) !== "synced")
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const maxAttempts = Math.max(0, ...items.map((item) => Number(item.attempts || 0)));
    const issues = issueRows.slice(0, 50).map(toIssue);
    const completedAt = latestTimestamp(items);

    notifications.push({
      businessDate,
      status,
      totalCount: items.length,
      syncedCount: counts.synced,
      failedCount: counts.failed,
      pendingCount: counts.pending,
      processingCount: counts.processing,
      issueCount: issueRows.length,
      hiddenIssueCount: Math.max(0, issueRows.length - issues.length),
      completedAt,
      issues,
      signature: [
        businessDate,
        status,
        counts.synced,
        counts.failed,
        counts.pending,
        counts.processing,
        maxAttempts,
        completedAt
      ].join(":")
    });
  }

  notifications.sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  return { notifications };
}

export { ACTION_LABELS, getSeoulDateKey };
