// Read-only source; never modify the user's planning workbook.
function getProductionPlanReference(payload) {
  if (!payload || !payload.token) throw new Error('로그인 확인이 필요합니다.');
  verifySupabaseSheetSyncToken_(payload.token);
  const sheet = SpreadsheetApp.openById('1tL2AHGkOylx2sOOgVMOzhEbet9HGsn68WWctUTXh1NI').getSheetByName('생산계획');
  const values = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), 1009), 25).getValues();
  const sourceDate = productionReferenceDate_(values[1][9]);
  let process = '';
  const rows = [];
  for (let index = 5; index < values.length; index++) {
    const row = values[index];
    if (row[1]) process = String(row[1]).trim();
    if (!['박 인쇄', '실크 인쇄', '자동화'].includes(process) || !row[4] || row[4] === '-') continue;
    const numeric = (value) => typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;
    rows.push({ id: [process, row[3], row[4], row[2]].join('|'), process, sourceDate,
      productName: String(row[4]).trim(), clientName: String(row[3] || '').trim(),
      machine: String(row[2] || '').replace(/호기$/, '') + '호기', worker: String(row[9] || ''),
      dueDate: productionReferenceDate_(row[8]), workDays: numeric(row[14]),
      orderQuantity: numeric(row[17]), loss: numeric(row[18]), cumulativeProduction: numeric(row[19]),
      cumulativeHours: numeric(row[20]), actualProduction: numeric(row[23]) });
  }
  return { sourceDate, rows, fetchedAt: new Date().toISOString() };
}
function productionReferenceDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  const match = String(value || '').match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  return match ? match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2) : '';
}
