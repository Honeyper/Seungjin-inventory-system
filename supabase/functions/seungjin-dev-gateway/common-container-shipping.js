import { ValidationError } from "./request-errors.js";

export function commonContainerInfo(product = {}) {
  const flag = product.isCommonContainer ?? product.commonContainerProduct ?? product["공용용기 제품"];
  const enabled = flag === true || ["true", "유", "예", "1"].includes(String(flag).trim().toLowerCase());
  let names = product.shippingProductNames ?? product["출고시 제품명 목록"] ?? [];
  if (typeof names === "string") {
    try { names = JSON.parse(names); } catch { names = names.split(/\n|\|/); }
  }
  return { isCommonContainer: enabled, shippingProductNames: Array.isArray(names) ? [...new Set(names.map(name => String(name).trim()).filter(Boolean))] : [] };
}

// Allocations describe contents of a physical box; they never create another stock SKU.
export function planCommonContainerShipping(products, boxes, payload, quantityMap) {
  const status = String(payload.status || "");
  const type = String(payload.shippingType || payload["출고유형"] || "정상출고");
  const normalCompletion = status === "출고완료" && type === "정상출고";
  const supplied = payload.shippingAllocations;
  if (supplied !== undefined && !Array.isArray(supplied)) throw new ValidationError("출고 제품별 수량 형식을 확인해주세요.");
  const plans = new Map();
  const entries = new Map();
  for (const entry of supplied || []) {
    const id = String(entry?.boxId || "");
    if (!id || entries.has(id) || !boxes.some(box => box.boxId === id)) throw new ValidationError("출고 제품을 지정한 박스를 다시 확인해주세요.");
    entries.set(id, entry);
  }
  for (const box of boxes) {
    const product = products.find(item => (item.productId || item.productCode) === box.productId);
    const info = commonContainerInfo(product);
    const entry = entries.get(box.boxId);
    if (!info.isCommonContainer) {
      if (entry) throw new ValidationError("공용용기 설정이 변경되었습니다. 제품 정보를 다시 확인해주세요.");
      continue;
    }
    if (!normalCompletion && !(status === "출고대기" && entry)) continue;
    if (!info.shippingProductNames.length) throw new ValidationError("제품 관리에서 공용용기의 출고 제품명을 먼저 등록해주세요.");
    const allocation = entry?.products ?? box.shippingAllocations;
    const expected = quantityMap.has(Number(box.number)) ? quantityMap.get(Number(box.number)) : Number(box.quantity);
    // A quantity edit must not silently remove the remainder of a common-container box.
    if (!Number.isSafeInteger(expected) || expected <= 0 || expected !== Number(box.quantity)) {
      throw new ValidationError(`${box.number}번 공용용기 박스의 수량이 변경되었습니다. 최신 박스 수량으로 다시 출고해주세요.`);
    }
    if (!Array.isArray(allocation) || !allocation.length) throw new ValidationError(`${box.number}번 박스의 실제 출고 제품을 선택해주세요.`);
    const seen = new Set();
    let total = 0;
    const normalized = allocation.map(item => {
      const name = String(item?.productName || "").trim();
      const quantity = Number(item?.quantity);
      if (!info.shippingProductNames.includes(name) || seen.has(name)) throw new ValidationError(`${box.number}번 박스의 출고 제품이 등록 목록과 다르거나 중복됩니다.`);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new ValidationError(`${box.number}번 박스의 제품별 수량은 1 이상의 정수여야 합니다.`);
      seen.add(name);
      total += quantity;
      return { productName: name, quantity };
    });
    if (total !== expected) throw new ValidationError(`${box.number}번 박스의 제품별 합계가 박스 수량(${expected} ea)과 다릅니다.`);
    plans.set(box.boxId, normalized);
  }
  return plans;
}

export function recordCommonContainerShipping(box, allocation, status, parts, payload) {
  if (allocation) box.shippingAllocations = allocation;
  if (!Array.isArray(box.shippingAllocations) || !box.shippingAllocations.length) return;
  if (status === "출고완료" || status === "보관") {
    box.commonContainerShippingHistory = [...(Array.isArray(box.commonContainerShippingHistory) ? box.commonContainerShippingHistory : []), {
      action: status === "출고완료" ? "출고완료" : "출고취소",
      at: parts.timestamp,
      actor: String(payload.shipper || payload.userName || "Admin"),
      shippingDate: String(payload.shippingDate || box.shippingDate || parts.date),
      products: box.shippingAllocations.map(item => ({ ...item }))
    }];
  }
  if (status === "보관") box.shippingAllocations = [];
}
