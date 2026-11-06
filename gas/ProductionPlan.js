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

function getProductionPlanStaff(payload) {
  if (!payload || !payload.token) throw new Error('로그인 확인이 필요합니다.');
  verifySupabaseSheetSyncToken_(payload.token);
  const source = SpreadsheetApp.openById('1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI');
  const sheet = source.getSheetById(1419995975);
  if (!sheet) throw new Error('직원 목록 시트를 찾을 수 없습니다.');
  return { sourceSheet: sheet.getName(), sourceSheetId: sheet.getSheetId(),
    staff: parseProductionPlanStaff_(sheet.getDataRange().getValues()), fetchedAt: new Date().toISOString() };
}

function parseProductionPlanStaff_(values) {
  const text = value => String(value == null ? '' : value).trim();
  const groups = { '정직원': ['employee', '직원'], '직원': ['employee', '직원'],
    '아웃소싱': ['outsourcing', '아웃소싱'], '아웃소싱 직원': ['outsourcing', '아웃소싱'], '타업체': ['company', '타업체'] };
  const blocks = [];
  values.forEach((row, rowIndex) => row.forEach((value, column) => {
    const group = groups[text(value)];
    if (group) blocks.push({row:rowIndex,column,type:group[0],label:group[1]});
  }));
  if (!blocks.some(b => b.type === 'employee') || !blocks.some(b => b.type === 'outsourcing')) {
    throw new Error('직원정보 시트의 직원·아웃소싱 구분을 확인해주세요.');
  }
  const active = value => value === true || value === 1 || /^(true|1|y|yes|활성|사용|재직)$/i.test(text(value));
  const staff = [], seen = new Set();
  blocks.forEach(block => {
    const next = blocks.filter(b => b.row === block.row && b.column > block.column).sort((a,b) => a.column-b.column)[0];
    let headerRow = -1, nameColumn = -1, activeColumn = -1;
    for (let r = block.row + 1; r < Math.min(values.length, block.row + 4); r++) {
      const end = next ? next.column : values[r].length;
      for (let c = block.column; c < end; c++) {
        const label = text(values[r][c]).replace(/\s/g, '');
        if (label === (block.type === 'company' ? '업체명' : '이름')) nameColumn = c;
        if (label === '활성화여부') activeColumn = c;
      }
      if (nameColumn >= 0 && activeColumn >= 0) { headerRow = r; break; }
    }
    if (headerRow < 0) throw new Error('직원정보 시트의 이름·활성화 여부 열을 확인해주세요.');
    for (let r = headerRow + 1; r < values.length; r++) {
      const name = text(values[r][nameColumn]);
      if (!name || !active(values[r][activeColumn])) continue;
      const key = block.type + ':' + name;
      if (seen.has(key)) continue;
      seen.add(key);
      staff.push({name,type:block.type,label:block.label});
    }
  });
  return staff;
}
