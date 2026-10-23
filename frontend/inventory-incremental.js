(function(root) {
  const text = value => String(value ?? '').trim();
  const num = value => Number(text(value).replace(/[^0-9.-]/g,'')) || 0;
  const key = row => `${row.managementId}\u0000${row.productId}`;
  function merge(base, patch) {
    if (!patch.inventoryDelta) return patch;
    if (!base || Number(base.stateVersion) !== patch.inventoryDelta.fromVersion) throw new Error('재고 변경 기준이 달라 다시 조회해야 합니다.');
    const ids = new Set(patch.inventoryDelta.productIds || []), keys = new Set(patch.inventoryDelta.managementKeys || []);
    const replaces = row => ids.has(row.productId) || keys.has(key(row));
    const previous = base.rows.filter(replaces);
    const rows = [...base.rows.filter(row => !replaces(row)), ...patch.rows];
    const qr = new Map((patch.qrInbounds || []).map(row => [key(row), num(row.qrGeneratedCount)]));
    const uniqueBoxes = values => [...new Map(values.flatMap(row => row.allShippingBoxes || []).map(box => [box.boxId || `${key(box)}|${box.number}`,box])).values()];
    const boxStats = new Map((base.locationBoxStats || []).map(row => [row.label,num(row.value)]));
    const quantityStats = new Map((base.locationQuantityStats || []).map(row => [row.label,num(row.value)]));
    for (const [values,sign] of [[previous,-1],[patch.rows,1]]) for (const box of uniqueBoxes(values)) {
      const status = text(box.rawStatus || box.status).replace(/\s/g,''), type = text(box.shippingType);
      if (num(box.quantity) <= 0 || type.startsWith('반출') || /폐기/.test(status) || (!type.startsWith('이관') && /출고완료/.test(status))) continue;
      const storage = text(box.storage) || '미지정';
      boxStats.set(storage,(boxStats.get(storage)||0)+sign);
      quantityStats.set(storage,(quantityStats.get(storage)||0)+sign*num(box.quantity));
    }
    const merged = rows.map(row => {
      const all = row.allShippingBoxes || [];
      const count = Math.max(qr.get(key(row)) || 0, num(row.qrGeneratedCount), all.filter(box => box.qrData || box.qrGeneratedAt).length);
      return {...row,qrGeneratedCount:count,qrPrintStatus:all.length && count >= all.length ? 'QR 생성':'미인쇄'};
    });
    const active = merged.filter(row => row.countsAsInventory);
    const unique = values => [...new Set(values.map(text).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
    const stats = values => [...values].filter(([,value])=>value>0).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
    return {...base,stateVersion:patch.stateVersion,qrStatusVersion:patch.qrStatusVersion,rows:merged,
      summary:{totalItems:new Set(active.map(row=>row.productId).filter(Boolean)).size || active.length,totalBoxes:active.reduce((n,row)=>n+num(row.currentBoxCount),0),totalQuantity:active.reduce((n,row)=>n+num(row.currentTotalQuantity),0),dueSoonCount:active.filter(row=>Number.isFinite(row.dueDays)&&row.dueDays<=3).length},
      filters:{clients:unique(merged.map(row=>row.clientName)),storages:unique(merged.map(row=>row.storage)),stockStatuses:unique(merged.map(row=>row.stockStatus)),processStatuses:unique(merged.map(row=>row.processStatus))},
      locationBoxStats:stats(boxStats),locationQuantityStats:stats(quantityStats),
      attention:{physicalMissingCount:merged.reduce((n,row)=>n+num(row.inventoryUnconfirmedBoxCount),0),unspecifiedStorageCount:active.filter(row=>(row.activeShippingBoxes||[]).some(box=>!text(box.storage)||text(box.storage)==='미지정')).length,holdOrDiscardCount:merged.filter(row=>/보류|폐기/.test(text(row.stockStatus))).length}
    };
  }
  root.SeungjinInventoryIncremental = {merge};
})(typeof window === 'undefined' ? globalThis : window);
