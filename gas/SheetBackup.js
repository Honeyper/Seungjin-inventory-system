// Operator recovery uses current canonical rows rather than replaying old business actions.
// Every request requires an existing, one-use Supabase sheet-sync token.
function ensureSheetWriteCapacity_(sheet, lastRow, lastColumn) {
  const rows = sheet.getMaxRows();
  const columns = sheet.getMaxColumns();
  if (lastRow > rows) sheet.insertRowsAfter(rows, lastRow - rows);
  if (lastColumn > columns) sheet.insertColumnsAfter(columns, lastColumn - columns);
}

function sheetBackupDefinition_(dataset) {
  const common = {
    productId: ['제품 ID', '제품ID'], productName: ['제품명'], clientName: ['업체명', '거래처명'],
    note: ['비고'], storage: ['보관위치', '보관 위치', '보관 장소'], status: ['상태', '재고 상태'],
    managementId: ['관리 ID', '관리ID'], purchaseOrderId: ['발주ID', '발주 ID']
  };
  const definitions = {
    products: { sheet: CONFIG.SHEETS.PRODUCTS, scope: 'productId', identity: ['productId'], required: ['제품 ID', '업체명', '제품명'], fields: {
      ...common, registeredAt: ['등록일'], registeredTime: ['등록시간'], createdBy: ['등록자'],
      color: ['색상'], useStatus: ['사용 여부'], finalProcess: ['최종공정'],
      dustRemovalStatus: ['박가루제거 유무'], flameTreatmentStatus: ['화염처리 유무'],
      commonContainerProduct: ['공용용기 제품'], shippingProductTypeCount: ['출고시 제품 종류 수'],
      shippingProductNames: ['출고시 제품명 목록'], productImageUrl: ['제품 이미지', '제품 이미지 URL'],
      productImageUrls: ['제품 이미지 목록'], boxQuantity: ['박스당 수량'], trayQuantity: ['트레이 수량'],
      orderQuantity: ['발주량', '주문량'], dueDate: ['납기일'], hourlyProductionRate: ['시간당 평균 생산량'],
      processHourlyProductionRates: ['공정별 시간당 생산량'], updatedAt: ['최종 수정일', '수정일'], updatedTime: ['최종 수정시간', '수정시간'],
      ...Object.fromEntries([1,2,3,4,5,6].map(n => [`processStage${n}`, [`${n}도 공정`]]))
    } },
    orders: { sheet: CONFIG.SHEETS.PURCHASE_ORDERS, scope: 'purchaseOrderId', identity: ['purchaseOrderId'], required: ['발주ID', '제품ID', '제품명'], fields: {
      ...common, orderRound: ['발주 차수'], startDate: ['발주 시작일'], endDate: ['납기일', '발주 종료일'],
      totalOrderQuantity: ['총 발주량'], accumulatedInboundQuantity: ['누적 입고량'], remainingQuantity: ['미입고 수량'],
      inboundRate: ['입고율'], registrant: ['등록자'], registeredAt: ['등록일시'], updatedAt: ['수정일시']
    } },
    stock: { sheet: CONFIG.SHEETS.STOCK_DB, scope: 'managementId', identity: ['managementId', 'productId', 'storage'], required: ['관리 ID', '입고일', '제품명'], fields: {
      ...common, registrant: ['등록자'], registeredAt: ['등록 일시', '등록일시'], inboundDate: ['입고일'],
      inboundTime: ['입고 시간'], inboundType: ['입고 유형'], dueDate: ['납기일'], purchaseOrderRound: ['발주 차수'],
      batch: ['차수'], process: ['최종공정'], boxQuantity: ['박스당 수량'], inboundBoxCount: ['입고 박스 수'],
      remainQuantity: ['잔량 수량'], remainderQuantities: ['잔량 상세'], boxTotalCount: ['박스 총 수량'],
      inboundTotalQuantity: ['입고 총 수량'], inspectionQuantity: ['검수 수량', '검사 수량'],
      defectQuantity: ['불량 수량'], defectRate: ['불량률'], defectReason: ['불량 사유'],
      invoiceFileUrl: ['거래명세표', '거래명세서'], defectPhotoUrls: ['불량 사진', '불량사진 URL'],
      lastInventoryCheckedAt: ['최종 재고 확인일시', '최종 재고 확인 일시']
    } },
    boxes: { sheet: CONFIG.SHEETS.BOX_DB, scope: 'managementId', identity: ['boxId'], required: ['박스ID', '관리ID', '제품명'], fields: {
      ...common, boxId: ['박스ID'], number: ['박스순번', '박스 순번', '박스 번호'],
      quantity: ['현재 수량'], boxQuantity: ['박스당 수량'], registeredAt: ['등록 일시', '등록일시'],
      qrGenerated: ['QR 생성 여부', 'QR 출력 여부'], qrGeneratedAt: ['QR 생성 일시'], qrData: ['QR 데이터'],
      worker: ['작업자'], shippingType: ['출고유형', '출고 유형'], shippingDate: ['출고일'],
      shippingTime: ['출고시간'], shipper: ['출고자'], inspectionDate: ['검수일', '출고 검수일'],
      inspectionTime: ['검수시간', '출고 검수시간'], inspector: ['검수자', '출고 검수자'],
      inspectionQuantity: ['검수수량', '출고 검수 수량'], defectQuantity: ['불량수량', '불량 수량'],
      defectRate: ['불량률'], defectReason: ['불량사유', '불량 사유'], defectPhotoFolderUrl: ['불량사진 폴더', '불량 사진 폴더'],
      inventoryCategory: ['재고 구분'], inventoryClassifiedAt: ['재고 분류일시', '재고 구분일시'],
      inventoryClassifier: ['재고 분류자', '재고 구분자'], lastInventoryCheckedAt: ['최종 재고 확인일시', '최종 재고 확인 일시']
    } }
  };
  if (!definitions[dataset]) throw new Error('지원하지 않는 백업 데이터입니다.');
  return definitions[dataset];
}

function sheetBackupContext_(dataset, keys) {
  const definition = sheetBackupDefinition_(dataset);
  if (!Array.isArray(keys) || !keys.length || keys.length > 200 || keys.some(k => typeof k !== 'string' || !k.trim())) {
    throw new Error('백업 대상 ID를 확인해주세요.');
  }
  const sheet = getSheet_(definition.sheet);
  const values = sheet.getDataRange().getDisplayValues();
  const header = findHeaderRow_(values, definition.required);
  if (!header) throw new Error(`${definition.sheet} 백업 헤더를 찾을 수 없습니다.`);
  const indexes = indexHeaders_(header.headers);
  const scopeIndex = findHeaderIndex_(indexes, definition.fields[definition.scope]);
  if (scopeIndex < 0) throw new Error('백업 대상 ID 컬럼이 없습니다.');
  const keySet = new Set(keys);
  const existing = values.slice(header.rowIndex + 1).flatMap((row, offset) => keySet.has(String(row[scopeIndex] || '').trim())
    ? [{ row, rowNumber: header.rowIndex + offset + 2 }] : []);
  return { definition, sheet, header, indexes, existing, keySet };
}

function readSheetBackupRows(payload) {
  verifySupabaseSheetSyncToken_(String(payload.token || ''));
  const context = sheetBackupContext_(payload.dataset, payload.keys);
  return { dataset: payload.dataset, headers: context.header.headers, rows: context.existing,
    maxRows: context.sheet.getMaxRows(), maxColumns: context.sheet.getMaxColumns() };
}

function planSheetBackupRows_(context, records) {
  if (!Array.isArray(records) || records.length > 1500) throw new Error('백업 행 수를 확인해주세요.');
  const { definition, keySet, indexes, existing, header } = context;
  const identities = new Set();
  const recordIdentity = r => definition.identity.map(k => String(r[k] ?? '').trim()).join('|');
  const rowIdentity = r => definition.identity.map(k => pickCell_(r, indexes, definition.fields[k])).join('|');
  const existingById = new Map(existing.map(entry => [rowIdentity(entry.row), entry.row]));
  const rows = records.map(record => {
    if (!record || !keySet.has(String(record[definition.scope] || '').trim())) throw new Error('백업 대상 밖의 행은 저장할 수 없습니다.');
    if (definition.identity.some(k => !String(record[k] || '').trim())) throw new Error('백업 행의 식별자가 누락되었습니다.');
    const identity = recordIdentity(record);
    if (identities.has(identity)) throw new Error('중복된 백업 행입니다.');
    identities.add(identity);
    const row = [...(existingById.get(identity) || new Array(header.headers.length).fill(''))];
    for (const [field, names] of Object.entries(definition.fields)) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
      const value = record[field];
      setRowValue_(row, indexes, names, value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value);
    }
    setRowValue_(row, indexes, ['Supabase 원본(JSON)'], JSON.stringify(record));
    return row;
  });
  return rows;
}

function applySheetBackupRows(payload) {
  verifySupabaseSheetSyncToken_(String(payload.token || ''));
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let context = sheetBackupContext_(payload.dataset, payload.keys);
    // Validate every row before changing the sheet, including before adding metadata columns.
    planSheetBackupRows_(context, payload.records);
    if (findHeaderIndex_(context.indexes, ['Supabase 원본(JSON)']) < 0) {
      const column = context.header.headers.length + 1;
      ensureSheetWriteCapacity_(context.sheet, context.header.rowIndex + 1, column);
      context.sheet.getRange(context.header.rowIndex + 1, column).setValue('Supabase 원본(JSON)');
      context = sheetBackupContext_(payload.dataset, payload.keys);
    }
    const rows = planSheetBackupRows_(context, payload.records);
    const count = context.existing.length;
    const changes = context.existing.map((entry, i) => ({ rowNumber: entry.rowNumber,
      row: rows[i] || new Array(context.header.headers.length).fill('') }));
    writeSheetBackupChanges_(context.sheet, changes);
    const additional = rows.slice(count);
    if (additional.length) appendStyledRangeRows_(context.sheet, 1, additional, context.header.rowIndex + 2);
    SpreadsheetApp.flush();
    clearApiReadCaches_();
    return { dataset: payload.dataset, written: rows.length, removed: Math.max(0, count - rows.length), keys: payload.keys };
  } finally {
    lock.releaseLock();
  }
}

function writeSheetBackupChanges_(sheet, changes) {
  const sorted = [...changes].sort((a, b) => a.rowNumber - b.rowNumber);
  let offset = 0;
  while (offset < sorted.length) {
    let end = offset + 1;
    while (end < sorted.length && sorted[end].rowNumber === sorted[end - 1].rowNumber + 1) end++;
    const group = sorted.slice(offset, end);
    sheet.getRange(group[0].rowNumber, 1, group.length, group[0].row.length).setValues(group.map(item => item.row));
    offset = end;
  }
}
