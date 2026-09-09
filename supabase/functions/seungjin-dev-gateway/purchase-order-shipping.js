// Read-only, order-scoped shipping totals. Never infer a link from SKU alone.
const keyFor = (managementId, productId) => JSON.stringify([managementId, productId]);
const normalized = (value) => String(value || "").replace(/\s/g, "");
const quantity = (value) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, "").replace(/\s*ea\s*$/i, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export function buildOrderShippingLinks(orders, inbounds) {
  const byId = new Map(orders.map((order) => [order.purchaseOrderId, order]));
  const links = new Map();
  for (const inbound of inbounds) {
    const order = byId.get(inbound.purchase_order_id);
    if (!order || !inbound.management_id || order.productId !== inbound.product_id) continue;
    const key = keyFor(inbound.management_id, inbound.product_id);
    if (links.has(key) && links.get(key) !== order.purchaseOrderId) links.set(key, null);
    else if (!links.has(key)) links.set(key, order.purchaseOrderId);
  }
  return links;
}

export function summarizePurchaseOrderShipping(orders, links, boxes) {
  const totals = new Map();
  const seen = new Set();
  for (const box of boxes) {
    const orderId = links.get(keyFor(box.management_id, box.product_id));
    if (!orderId || !box.box_id || seen.has(box.box_id)) continue;
    seen.add(box.box_id);
    if (normalized(box.raw_status || box.status) !== "출고완료") continue;
    const shippingType = normalized(box.shipping_type);
    if (shippingType && shippingType !== "정상출고") continue;
    totals.set(orderId, (totals.get(orderId) || 0) + quantity(box.quantity));
  }
  return orders.map((order) => {
    const shipped = totals.get(order.purchaseOrderId) || 0;
    const total = quantity(order.totalOrderQuantity);
    return {
      ...order,
      accumulatedShippingQuantity: shipped,
      shippingRate: total > 0 ? shipped / total : null,
      remainingShippingQuantity: Math.max(0, total - shipped),
    };
  });
}

export async function readPurchaseOrdersWithShipping(databaseRows) {
  const rows = await databaseRows("dev_purchase_orders?select=data&order=updated_at.desc,purchase_order_id.desc");
  const orders = rows.map((row) => row.data);
  if (!orders.length) return { purchaseOrders: [] };
  const inbounds = await databaseRows("dev_inbounds?select=management_id,product_id,purchase_order_id:data->>purchaseOrderId&data->>purchaseOrderId=not.is.null&order=record_key.asc");
  const links = buildOrderShippingLinks(orders, inbounds);
  const managementIds = [...new Set([...links].filter(([, id]) => id).map(([key]) => JSON.parse(key)[0]))];
  const boxes = [];
  // Fetch only the linked boxes and small scalar fields; databaseRows handles pagination.
  for (let offset = 0; offset < managementIds.length; offset += 50) {
    const ids = managementIds.slice(offset, offset + 50).map((id) => `"${String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
    boxes.push(...await databaseRows(`dev_inventory_boxes?management_id=in.(${encodeURIComponent(ids)})&select=box_id,management_id,product_id,quantity:data->>quantity,status:data->>status,raw_status:data->>rawStatus,shipping_type:data->>shippingType&order=box_id.asc`));
  }
  return { purchaseOrders: summarizePurchaseOrderShipping(orders, links, boxes) };
}
