// Return the canonical row only after its transaction has committed.
export function savedRegistrationRecord(action, changes, result) {
  const target = action === 'createInbound' ? ['inbounds','management_id',result.managementId]
    : action === 'createProduct' ? ['products','product_id',result.productId]
    : action === 'createPurchaseOrder' ? ['purchaseOrders','purchase_order_id',result.purchaseOrderId] : null;
  return target ? changes[target[0]]?.upserts?.find(row => row[target[1]] === target[2])?.data : undefined;
}
