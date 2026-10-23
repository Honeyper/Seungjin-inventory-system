// A delta is safe only when every intervening committed version is accounted for.
export async function readInventoryDelta(payload, version, databaseRows, build) {
  const from = payload.deltaSinceVersion, to = Number(version.stateVersion);
  if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(to) || to < from || to - from > 40) return null;
  if (to === from) {
    const qrInbounds = await databaseRows('dev_inbounds?select=management_id,product_id,qr_generated_count:data->>qrGeneratedCount');
    return {...build([], [], [], qrInbounds),inventoryDelta:{fromVersion:from,productIds:[]},
      qrInbounds:qrInbounds.map(row=>({managementId:row.management_id,productId:row.product_id,qrGeneratedCount:row.qr_generated_count})),
      stateVersion:to,qrStatusVersion:version.qrStatusVersion};
  }
  const events = await databaseRows(`dev_sheet_outbox?state_version=gt.${from}&state_version=lte.${to}&select=state_version,action,product_id:payload->>productId&order=state_version.asc`);
  const supported = new Set(['createInbound','updateInbound','deleteInbound','updateShippingStatus','updateInventoryBoxMove','saveShippingInspection','cancelDiscardedBoxes','classifyRemainingInventory','adjustRemainingInventory','returnTransferredInventory','returnTakenOutInventory','updateProduct']);
  const versions = new Set(), ids = new Set();
  for (const event of events) {
    // Fast QR generation shares an existing stock version; its counts are read below.
    if (event.action === 'getInboundBoxQrs') continue;
    if (!supported.has(event.action) || !event.product_id) return null;
    versions.add(Number(event.state_version)); ids.add(String(event.product_id));
  }
  if (versions.size !== to - from || ids.size > 8) return null;
  for (let n = from + 1; n <= to; n++) if (!versions.has(n)) return null;
  const productIds = [...ids];
  const filter = `product_id=in.${encodeURIComponent('(' + productIds.map(id => JSON.stringify(id)).join(',') + ')')}`;
  const [records, boxes, products, qrInbounds] = await Promise.all([
    databaseRows(`dev_inventory_records?${filter}&select=record_key,management_id,product_id,storage,data`),
    databaseRows(`dev_inventory_boxes?${filter}&select=box_id,management_id,product_id,storage,box_number,data`),
    databaseRows(`dev_products?${filter}&select=product_id,data`),
    databaseRows('dev_inbounds?select=management_id,product_id,qr_generated_count:data->>qrGeneratedCount')
  ]);
  const inboundKeys = new Set(records.map(row => `${row.management_id}\u0000${row.product_id}`));
  if (boxes.some(row => !inboundKeys.has(`${row.management_id}\u0000${row.product_id}`))) return null;
  return {
    ...build(records, boxes, products, qrInbounds),
    inventoryDelta: {fromVersion:from, productIds},
    qrInbounds: qrInbounds.map(row => ({managementId:row.management_id,productId:row.product_id,qrGeneratedCount:row.qr_generated_count})),
    stateVersion:to, qrStatusVersion:version.qrStatusVersion
  };
}
