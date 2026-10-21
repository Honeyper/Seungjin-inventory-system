// Keep the dashboard contract intact while sending each shared box only once.
const compacted = new WeakMap();
export function compactInventoryDashboard(dashboard) {
  if (compacted.has(dashboard)) return compacted.get(dashboard);
  const boxTable = [], indexes = new Map();
  const rows = dashboard.rows.map(source => {
    const row = {...source};
    for (const field of ['allShippingBoxes', 'activeShippingBoxes', 'shippedShippingBoxes']) {
      if (!Array.isArray(source[field])) continue;
      row[field] = source[field].map(box => {
        if (!indexes.has(box)) { indexes.set(box, boxTable.length); boxTable.push(box); }
        return indexes.get(box);
      });
    }
    return row;
  });
  const result = {...dashboard, format:'inventory-box-table-v1', rows, boxTable};
  compacted.set(dashboard, result);
  return result;
}

export function createJsonResponse(request, body, status, corsHeaders) {
  const json = JSON.stringify(body);
  const headers = new Headers(corsHeaders);
  headers.set('Vary', [...new Set([...(headers.get('Vary') || '').split(',').map(s=>s.trim()).filter(Boolean), 'Accept-Encoding'])].join(', '));
  const acceptsGzip = (request.headers.get('accept-encoding') || '').split(',').some(value => {
    const [encoding, ...parameters] = value.trim().toLowerCase().split(';');
    const quality = parameters.map(s=>s.trim()).find(s=>s.startsWith('q='));
    return encoding.trim() === 'gzip' && (!quality || Number(quality.slice(2)) > 0);
  });
  if (json.length >= 32768 && acceptsGzip && typeof CompressionStream === 'function') {
    headers.set('Content-Encoding', 'gzip');
    return new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')), {status, headers});
  }
  return new Response(json, {status, headers});
}
