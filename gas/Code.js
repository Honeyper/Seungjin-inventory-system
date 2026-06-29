const CONFIG = {
  SPREADSHEET_ID: '1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI',
  DRIVE_ROOT_FOLDER_ID: '1qxRR-t6_msWtfnXTd3PCMqsut7uYXRt1',
  DEFECT_PHOTO_ROOT_FOLDER_ID: '1vE9xIY3OA2dCoCWgnPZDWfuBgd_oo34U',
  SHEET_IDS: {
    STOCK_DB: 425625267,
    BOX_DB: 523859013
  },
  SHEETS: {
    PRODUCTS: '제품DB',
    INBOUND: '입고내역',
    INBOUND_BOXES: '입고박스내역',
    STOCK_DB: '재고 DB',
    BOX_DB: '박스관리 DB',
    INVENTORY: '재고목록',
    INVENTORY_HISTORY: '재고변경이력',
    OUTBOUND: '출고내역',
    WORKS: '작업관리',
    WORK_SCANS: '작업스캔내역',
    USERS: '사용자관리',
    ACCOUNTS: '계정정보'
  }
};

function doGet() {
  return jsonResponse({
    ok: true,
    service: 'seungjin-inventory-api',
    message: 'Apps Script API is running.'
  });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const action = body.action;
    const payload = body.payload || {};

    const routes = {
      healthCheck,
      authorizeDrive,
      normalizeStockAttachmentLinks,
      login,
      setupSheets,
      getProducts,
      getTodayInbounds,
      getInventoryDashboard,
      getInboundBoxQrs,
      createProduct,
      updateProduct,
      deleteProduct,
      createInbound,
      updateInbound,
      deleteInbound,
      formatProductRows
    };

    if (!routes[action]) {
      return jsonResponse({
        ok: false,
        error: 'UNKNOWN_ACTION',
        message: `Unknown action: ${action}`
      });
    }

    return jsonResponse({
      ok: true,
      data: routes[action](payload)
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.name || 'ERROR',
      message: error.message
    });
  }
}

function healthCheck() {
  const ss = getSpreadsheet_();
  const invoiceFolder = DriveApp.getFolderById(CONFIG.DRIVE_ROOT_FOLDER_ID);
  const defectPhotoFolder = DriveApp.getFolderById(CONFIG.DEFECT_PHOTO_ROOT_FOLDER_ID);
  const invoiceDriveWriteCheck = verifyDriveWriteAccess_(invoiceFolder);
  const defectPhotoDriveWriteCheck = verifyDriveWriteAccess_(defectPhotoFolder);

  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    invoiceDriveFolderId: invoiceFolder.getId(),
    invoiceDriveFolderName: invoiceFolder.getName(),
    invoiceDriveWriteCheck,
    defectPhotoDriveFolderId: defectPhotoFolder.getId(),
    defectPhotoDriveFolderName: defectPhotoFolder.getName(),
    defectPhotoDriveWriteCheck,
    checkedAt: new Date().toISOString()
  };
}

function authorizeDrive() {
  const ss = getSpreadsheet_();
  const invoiceFolder = DriveApp.getFolderById(CONFIG.DRIVE_ROOT_FOLDER_ID);
  const defectPhotoFolder = DriveApp.getFolderById(CONFIG.DEFECT_PHOTO_ROOT_FOLDER_ID);
  const invoiceDriveWriteCheck = verifyDriveWriteAccess_(invoiceFolder);
  const defectPhotoDriveWriteCheck = verifyDriveWriteAccess_(defectPhotoFolder);

  return {
    spreadsheetName: ss.getName(),
    invoiceDriveFolderId: invoiceFolder.getId(),
    invoiceDriveFolderName: invoiceFolder.getName(),
    invoiceDriveWriteCheck,
    defectPhotoDriveFolderId: defectPhotoFolder.getId(),
    defectPhotoDriveFolderName: defectPhotoFolder.getName(),
    defectPhotoDriveWriteCheck,
    checkedAt: new Date().toISOString()
  };
}

function normalizeStockAttachmentLinks() {
  const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
  const dataRange = stockSheet.getDataRange();
  const values = dataRange.getDisplayValues();
  const richValues = dataRange.getRichTextValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '입고일', '제품명']);

  if (!headerInfo) {
    throw new Error('재고 DB 시트의 헤더를 찾을 수 없습니다.');
  }

  const indexes = indexHeaders_(headerInfo.headers);
  let updatedCount = 0;

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const richRow = richValues[rowIndex] || [];

    if (!row.some((cell) => String(cell || '').trim())) {
      continue;
    }

    const invoiceUrl = pickCellLinkOrValue_(row, richRow, indexes, ['거래명세표', '거래명세서']);
    const defectValue = pickCellLinkOrValue_(row, richRow, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL']);
    const defectFolderUrl = getDriveFolderUrlFromLinks_(defectValue);

    if (invoiceUrl && invoiceUrl !== '-') {
      setLinkedCell_(stockSheet, rowIndex + 1, indexes, ['거래명세표', '거래명세서'], invoiceUrl, '📁 링크');
      updatedCount += 1;
    }

    if (defectFolderUrl && defectFolderUrl !== '-') {
      setLinkedCell_(stockSheet, rowIndex + 1, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL'], defectFolderUrl, '📁 링크');
      updatedCount += 1;
    }
  }

  return {
    updatedCount
  };
}

function verifyDriveWriteAccess_(folder) {
  const tempFolderName = `_permission_check_${Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss')}`;
  const tempFolder = folder.createFolder(tempFolderName);
  const result = {
    tempFolderId: tempFolder.getId(),
    tempFolderName
  };

  tempFolder.setTrashed(true);
  return result;
}

function login(payload) {
  const accountId = String(payload.accountId || '').trim();
  const password = String(payload.password || '').trim();

  if (!accountId || !password) {
    return {
      success: false,
      code: 'MISSING_CREDENTIALS',
      message: '계정ID와 비밀번호를 입력해주세요.'
    };
  }

  const accounts = getLoginAccounts_();
  const account = accounts.find((item) => item.accountId === accountId && item.password === password);

  if (!account) {
    return {
      success: false,
      code: 'INVALID_CREDENTIALS',
      message: '계정ID 또는 비밀번호가 올바르지 않습니다.'
    };
  }

  if (!account.isActive) {
    return {
      success: false,
      code: 'ACCOUNT_DISABLED',
      message: '비활성화된 계정입니다. 관리자에게 문의해주세요.'
    };
  }

  if (account.role !== 'admin') {
    return {
      success: false,
      code: 'ACCESS_DENIED',
      message: '접근 권한이 없습니다. 작업자 계정은 모바일 작업자 화면에서만 사용할 수 있습니다.'
    };
  }

  return {
    success: true,
    user: {
      name: account.name,
      accountId: account.accountId,
      role: account.role
    },
    message: `${account.name}님, 환영합니다.`
  };
}

function getLoginAccounts_() {
  const sheet = getSheet_(CONFIG.SHEETS.ACCOUNTS);
  const values = sheet.getDataRange().getValues();
  const accounts = [];

  collectAccountsFromBlock_(values, '관리자 계정', 'admin', accounts);
  collectAccountsFromBlock_(values, '작업자 계정', 'worker', accounts);

  return accounts;
}

function collectAccountsFromBlock_(values, blockTitle, role, accounts) {
  const position = findCell_(values, blockTitle);
  if (!position) {
    return;
  }

  const headerRowIndex = position.row + 1;
  const dataStartRowIndex = position.row + 2;
  const startColIndex = position.col;
  const headerRow = values[headerRowIndex] || [];
  const headers = headerRow.slice(startColIndex, startColIndex + 4).map((header) => String(header || '').trim());

  const nameOffset = headers.indexOf('이름');
  const accountOffset = headers.indexOf('계정');
  const passwordOffset = headers.indexOf('비밀번호');
  const activeOffset = headers.indexOf('활성화 여부');

  if (nameOffset < 0 || accountOffset < 0 || passwordOffset < 0 || activeOffset < 0) {
    throw new Error(`${blockTitle} 영역의 헤더를 확인해주세요.`);
  }

  for (let rowIndex = dataStartRowIndex; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const name = String(row[startColIndex + nameOffset] || '').trim();
    const accountId = String(row[startColIndex + accountOffset] || '').trim();
    const password = String(row[startColIndex + passwordOffset] || '').trim();
    const isActive = isChecked_(row[startColIndex + activeOffset]);

    if (!name && !accountId && !password && !isActive) {
      break;
    }

    if (accountId && password) {
      accounts.push({
        name,
        accountId,
        password,
        isActive,
        role
      });
    }
  }
}

function isChecked_(value) {
  if (value === true) {
    return true;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on', 'checked', '활성', '사용', '사용함', '예', 'o', '✓', '✔'].includes(normalized);
}

function findCell_(values, target) {
  for (let row = 0; row < values.length; row += 1) {
    for (let col = 0; col < values[row].length; col += 1) {
      if (String(values[row][col] || '').trim() === target) {
        return { row, col };
      }
    }
  }
  return null;
}

function setupSheets() {
  const headers = {
    [CONFIG.SHEETS.PRODUCTS]: [
      '제품ID',
      '업체명',
      '제품명',
      '기본 차수',
      '최종공정',
      '박스당 수량',
      '사용 여부',
      '비고',
      '등록일',
      '수정일'
    ],
    [CONFIG.SHEETS.INBOUND]: [
      '관리ID',
      '입고일',
      '입고시간',
      '입고처',
      '입고 담당자',
      '입고 타입',
      '업체명',
      '제품ID',
      '제품명',
      '차수',
      '최종공정',
      '박스당 수량',
      '입고 박스 수',
      '잔량 수량',
      '실 박스 수',
      '입고 총 수량',
      '검사 수량',
      '불량 수량',
      '불량률',
      '불량 사유',
      '보관 장소',
      '거래명세표',
      '불량 사진',
      'QR 출력 여부',
      '비고',
      '등록일시',
      '수정일시'
    ],
    [CONFIG.SHEETS.INBOUND_BOXES]: [
      '박스ID',
      '관리ID',
      '제품ID',
      '업체명',
      '제품명',
      '차수',
      '최종공정',
      '박스 번호',
      '전체 박스 수',
      '박스당 수량',
      '현재 수량',
      '보관 장소',
      'QR 데이터',
      'QR 출력 여부',
      '재고 상태',
      '공정 상태',
      '잔량 여부',
      '입고일',
      '등록일시',
      '수정일시'
    ],
    [CONFIG.SHEETS.BOX_DB]: [
      '박스ID',
      '관리ID',
      '박스순번',
      '제품ID',
      '제품명',
      '박스당 수량',
      '현재 수량',
      '보관 위치',
      '상태',
      '등록 일시',
      'QR 생성 여부',
      'QR 생성 일시',
      'QR 데이터',
      '작업자',
      '출고일',
      '출고시간',
      '출고자',
      '검수일',
      '검수시간',
      '검수자',
      '검수수량',
      '불량률',
      '비고'
    ],
    [CONFIG.SHEETS.INVENTORY]: [
      '관리ID',
      '업체명',
      '제품ID',
      '제품명',
      '차수',
      '최종공정',
      '대표 박스',
      '총 박스 수',
      '현재 박스 수',
      '잔량 박스 수',
      '박스당 수량',
      '현재 총 수량',
      '보관 장소',
      '재고 상태',
      '공정 상태',
      '잔량 여부',
      '입고일',
      'QR 출력 여부',
      '수정일',
      '작업'
    ],
    [CONFIG.SHEETS.INVENTORY_HISTORY]: [
      '이력ID',
      '변경일시',
      '작업자',
      '관리ID',
      '박스ID',
      '제품ID',
      '제품명',
      '변경 유형',
      '변경 전 수량',
      '변경 후 수량',
      '변경 전 보관 장소',
      '변경 후 보관 장소',
      '변경 전 재고 상태',
      '변경 후 재고 상태',
      '변경 전 공정 상태',
      '변경 후 공정 상태',
      '변경 사유',
      '비고'
    ],
    [CONFIG.SHEETS.OUTBOUND]: [
      '출고ID',
      '출고일',
      '출고시간',
      '출고 담당자',
      '관리ID',
      '업체명',
      '제품ID',
      '제품명',
      '차수',
      '최종공정',
      '출고 박스 수',
      '잔량 수량',
      '총 출고 수량',
      '보관 장소',
      '검수 여부',
      '검수자',
      '검수일시',
      '이상 사진',
      '출고 상태',
      '비고',
      '등록일시'
    ],
    [CONFIG.SHEETS.WORKS]: [
      '작업ID',
      '제품ID',
      '업체명',
      '제품명',
      '차수',
      '생산유형',
      '목표 수량',
      '완료 수량',
      '작업자',
      '파트너',
      '상태',
      '작업 시작일',
      '예상 완료일',
      '보관장소',
      '메모',
      '등록일시',
      '수정일시'
    ],
    [CONFIG.SHEETS.WORK_SCANS]: [
      '스캔ID',
      '작업ID',
      '박스ID',
      '작업자',
      '제품ID',
      '제품명',
      '차수',
      '박스당 수량',
      '잔량',
      '총 작업 수량',
      '스캔일시',
      '상태'
    ],
    [CONFIG.SHEETS.USERS]: [
      '사용자ID',
      '이름',
      '역할',
      '직원번호',
      '사용 여부',
      '등록일',
      '수정일'
    ]
  };

  const ss = getSpreadsheet_();
  Object.keys(headers).forEach((sheetName) => {
    const sheet = getOrCreateSheet_(ss, sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers[sheetName]);
      sheet.setFrozenRows(1);
    }
  });

  return {
    createdOrCheckedSheets: Object.keys(headers)
  };
}

function getProducts() {
  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['제품 ID', '업체명', '제품명']);

  if (!headerInfo) {
    return {
      products: []
    };
  }

  const { headers, rowIndex: headerRowIndex } = headerInfo;
  const indexes = indexHeaders_(headers);
  const accumulatedInboundQuantityMap = getProductInboundQuantityMap_();
  const products = values.slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row) => {
      const productCode = pickCell_(row, indexes, ['제품 ID', '제품ID']);
      const registeredAt = pickCell_(row, indexes, ['등록일']);

      return {
        registeredAt,
        registeredTime: pickCell_(row, indexes, ['등록시간']),
        createdBy: pickCell_(row, indexes, ['등록자']),
        productId: productCode,
        productCode,
        clientName: pickCell_(row, indexes, ['업체명', '거래처명']),
        productName: pickCell_(row, indexes, ['제품명']),
        color: pickCell_(row, indexes, ['색상']),
        useStatus: pickCell_(row, indexes, ['사용 여부', '사용여부']),
        finalProcess: pickCell_(row, indexes, ['최종공정', '최종 공정']),
        orderQuantity: pickCell_(row, indexes, ['발주량', '주문량']),
        accumulatedInboundQuantity: formatEa_(accumulatedInboundQuantityMap[productCode] || 0),
        boxQuantity: pickCell_(row, indexes, ['박스당 수량', '박스당수량']),
        trayQuantity: pickCell_(row, indexes, ['트레이 수량', '트레이수량']),
        dueDate: pickCell_(row, indexes, ['납기일']),
        updatedAt: pickCell_(row, indexes, ['최종 수정일', '수정일']),
        updatedTime: pickCell_(row, indexes, ['최종 수정시간', '수정시간']),
        note: pickCell_(row, indexes, ['비고'])
      };
    });

  return {
    products
  };
}

function getProductDueDateMap_() {
  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['제품 ID', '업체명', '제품명']);

  if (!headerInfo) {
    return {};
  }

  const indexes = indexHeaders_(headerInfo.headers);
  return values.slice(headerInfo.rowIndex + 1).reduce((map, row) => {
    const productId = pickCell_(row, indexes, ['제품 ID', '제품ID']);

    if (productId) {
      map[productId] = pickCell_(row, indexes, ['납기일']);
    }

    return map;
  }, {});
}

function getProductInboundQuantityMap_() {
  const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
  const values = stockSheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['제품ID', '입고 총 수량'])
    || findHeaderRow_(values, ['제품 ID', '입고 총 수량']);

  if (!headerInfo) {
    return {};
  }

  const indexes = indexHeaders_(headerInfo.headers);
  return values.slice(headerInfo.rowIndex + 1).reduce((map, row) => {
    const productId = pickCell_(row, indexes, ['제품ID', '제품 ID']);

    if (productId) {
      map[productId] = (map[productId] || 0) + displayQuantityToNumber_(pickCell_(row, indexes, ['입고 총 수량', '입고총수량']));
    }

    return map;
  }, {});
}

function getInventoryDashboard() {
  const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
  const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
  const productSheet = getProductSheet_();
  const stockInfo = readDisplayRowsByHeaders_(stockSheet, ['관리 ID', '입고일', '제품명']);
  const boxInfo = readDisplayRowsByHeaders_(boxSheet, ['박스ID', '관리ID', '제품명']);
  const productInfo = readDisplayRowsByHeaders_(productSheet, ['제품 ID', '업체명', '제품명']);
  const productMap = buildInventoryProductMap_(productInfo.rows);
  const boxSummaryMap = buildInventoryBoxSummaryMap_(boxInfo.rows);
  const todayKey = normalizeDateKey_(Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'));

  const rows = stockInfo.rows.map((stockRow) => {
    const managementId = getObjectCell_(stockRow, ['관리 ID', '관리ID']);
    const productId = getObjectCell_(stockRow, ['제품ID', '제품 ID']);
    const product = productMap[productId] || {};
    const boxSummary = boxSummaryMap[managementId] || {};
    const hasBoxSummary = Boolean(boxSummary.managementId);
    const dueDate = getObjectCell_(stockRow, ['납기일']) || product.dueDate || '';
    const dueStatus = getDueStatus_(dueDate, todayKey);
    const boxTotalCount = hasBoxSummary ? boxSummary.boxCount : displayQuantityToNumber_(getObjectCell_(stockRow, ['박스 총 수량', '박스총수량']));
    const currentTotalQuantity = hasBoxSummary ? boxSummary.currentQuantity : displayQuantityToNumber_(getObjectCell_(stockRow, ['입고 총 수량', '입고총수량']));
    const stockStatus = getObjectCell_(stockRow, ['상태']) || boxSummary.status || '보관';
    const qrGeneratedCount = boxSummary.qrGeneratedCount || 0;
    const qrPrintStatus = boxTotalCount > 0 && qrGeneratedCount >= boxTotalCount ? 'QR 생성' : '미인쇄';
    const processStatus = stockStatus || '보관';

    return {
      managementId,
      productId,
      clientName: getObjectCell_(stockRow, ['업체명', '거래처명']) || product.clientName,
      productName: getObjectCell_(stockRow, ['제품명']) || product.productName,
      category: getObjectCell_(stockRow, ['구분']),
      stockStatus,
      registrant: getObjectCell_(stockRow, ['등록자']),
      registeredAt: getObjectCell_(stockRow, ['등록 일시', '등록일시']),
      inboundDate: getObjectCell_(stockRow, ['입고일']),
      inboundTime: getObjectCell_(stockRow, ['입고 시간', '입고시간']),
      inboundType: getObjectCell_(stockRow, ['입고 유형', '입고유형']),
      batch: getObjectCell_(stockRow, ['차수']),
      finalProcess: getObjectCell_(stockRow, ['최종공정', '최종 공정']),
      storage: boxSummary.primaryStorage || getObjectCell_(stockRow, ['보관위치', '보관 위치']) || '미지정',
      boxQuantity: getObjectCell_(stockRow, ['박스당 수량', '박스당수량']),
      inboundBoxCount: getObjectCell_(stockRow, ['입고 박스 수', '입고박스수']),
      remainQuantity: getObjectCell_(stockRow, ['잔량 수량', '잔량수량', '잔량']),
      boxTotalCount: formatBox_(boxTotalCount),
      currentBoxCount: formatBox_(boxTotalCount),
      inboundTotalQuantity: getObjectCell_(stockRow, ['입고 총 수량', '입고총수량']),
      currentTotalQuantity: formatEa_(currentTotalQuantity),
      inspectionQuantity: getObjectCell_(stockRow, ['검수 수량', '검수수량']),
      defectQuantity: getObjectCell_(stockRow, ['불량 수량', '불량수량']),
      defectRate: getObjectCell_(stockRow, ['불량률']),
      defectReason: getObjectCell_(stockRow, ['불량 사유', '불량사유']),
      note: getObjectCell_(stockRow, ['비고']),
      dueDate,
      dueLabel: dueStatus.label,
      dueDays: dueStatus.days,
      processStatus,
      qrPrintStatus,
      qrGeneratedCount
    };
  }).filter((row) => row.managementId);

  const activeRows = rows.filter((row) => {
    const status = String(row.stockStatus || '');
    return !status.includes('폐기') && displayQuantityToNumber_(row.currentTotalQuantity) > 0;
  });
  const locationBoxStats = buildInventoryLocationStats_(boxSummaryMap, 'box');
  const locationQuantityStats = buildInventoryLocationStats_(boxSummaryMap, 'quantity');
  const uniqueProductIds = new Set(activeRows.map((row) => row.productId).filter(Boolean));
  const totalBoxes = activeRows.reduce((sum, row) => sum + displayQuantityToNumber_(row.currentBoxCount), 0);
  const totalQuantity = activeRows.reduce((sum, row) => sum + displayQuantityToNumber_(row.currentTotalQuantity), 0);
  const dueSoonCount = activeRows.filter((row) => Number.isFinite(row.dueDays) && row.dueDays <= 3).length;
  const printWaitingBoxes = activeRows
    .filter((row) => row.qrPrintStatus === '미인쇄')
    .reduce((sum, row) => sum + displayQuantityToNumber_(row.currentBoxCount), 0);
  const unspecifiedStorageCount = activeRows.filter((row) => isUnspecifiedStorage_(row.storage)).length;
  const holdOrDiscardCount = rows.filter((row) => /보류|폐기/.test(String(row.stockStatus || ''))).length;

  return {
    summary: {
      totalItems: uniqueProductIds.size || activeRows.length,
      totalBoxes,
      totalQuantity,
      dueSoonCount
    },
    filters: {
      clients: uniqueSorted_(activeRows.map((row) => row.clientName)),
      storages: uniqueSorted_(activeRows.map((row) => row.storage)),
      stockStatuses: uniqueSorted_(activeRows.map((row) => row.stockStatus)),
      processStatuses: uniqueSorted_(activeRows.map((row) => row.processStatus))
    },
    locationBoxStats,
    locationQuantityStats,
    attention: {
      printWaitingBoxes,
      unspecifiedStorageCount,
      holdOrDiscardCount
    },
    rows: activeRows.reverse()
  };
}

function createProduct(payload) {
  const required = ['업체명', '제품명', '발주량', '납기일', '박스당 수량', '트레이 수량'];
  required.forEach((field) => {
    if (!payload[field]) {
      throw new Error(`${field} 값이 필요합니다.`);
    }
  });

  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['제품 ID', '업체명', '제품명']);

  if (!headerInfo) {
    throw new Error('제품 DB 헤더를 찾을 수 없습니다.');
  }

  const { headers, rowIndex: headerRowIndex } = headerInfo;
  const indexes = indexHeaders_(headers);
  const now = new Date();
  const timezone = 'Asia/Seoul';
  const clientName = String(payload['업체명'] || '').trim();
  const productId = payload['제품 ID'] || payload['제품ID'] || makeClientProductId_(clientName, values, indexes);
  const row = new Array(headers.length).fill('');

  setRowValue_(row, indexes, ['등록일'], Utilities.formatDate(now, timezone, 'yyyy.MM.dd'));
  setRowValue_(row, indexes, ['등록시간'], Utilities.formatDate(now, timezone, 'HH:mm'));
  setRowValue_(row, indexes, ['등록자'], payload['등록자'] || 'Admin');
  setRowValue_(row, indexes, ['제품 ID', '제품ID'], productId);
  setRowValue_(row, indexes, ['업체명', '거래처명'], clientName);
  setRowValue_(row, indexes, ['제품명'], payload['제품명']);
  setRowValue_(row, indexes, ['색상'], payload['색상'] || '');
  setRowValue_(row, indexes, ['사용 여부', '사용여부'], payload['사용 여부'] || payload['사용여부'] || '사용중');
  setRowValue_(row, indexes, ['최종공정', '최종 공정'], payload['최종공정'] || payload['최종 공정'] || '');
  setRowValue_(row, indexes, ['발주량', '주문량'], payload['발주량'] || payload['주문량'] || '');
  setRowValue_(row, indexes, ['박스당 수량', '박스당수량'], payload['박스당 수량'] || payload['박스당수량'] || '');
  setRowValue_(row, indexes, ['트레이 수량', '트레이수량'], payload['트레이 수량'] || payload['트레이수량'] || '');
  setRowValue_(row, indexes, ['납기일'], payload['납기일'] || '');
  setRowValue_(row, indexes, ['최종 수정일', '수정일'], Utilities.formatDate(now, timezone, 'yyyy.MM.dd'));
  setRowValue_(row, indexes, ['최종 수정시간', '수정시간'], Utilities.formatDate(now, timezone, 'HH:mm'));
  setRowValue_(row, indexes, ['비고'], payload['비고'] || '');

  sheet.appendRow(fillBlankCells_(row));
  applyProductRowTemplate_(sheet, headerRowIndex + 2, sheet.getLastRow(), headers.length);

  return {
    productId
  };
}

function getTodayInbounds(payload) {
  const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
  const dataRange = stockSheet.getDataRange();
  const values = dataRange.getDisplayValues();
  const richValues = dataRange.getRichTextValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '입고일', '제품명']);

  if (!headerInfo) {
    return {
      inbounds: []
    };
  }

  const { headers, rowIndex: headerRowIndex } = headerInfo;
  const indexes = indexHeaders_(headers);
  const timezone = 'Asia/Seoul';
  const defaultDate = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const requestedStartDate = normalizeDateKey_(payload?.startDate || payload?.date || defaultDate);
  const requestedEndDate = normalizeDateKey_(payload?.endDate || payload?.date || requestedStartDate);
  const startDate = requestedStartDate <= requestedEndDate ? requestedStartDate : requestedEndDate;
  const endDate = requestedStartDate <= requestedEndDate ? requestedEndDate : requestedStartDate;
  const productDueDateMap = getProductDueDateMap_();
  const inbounds = values.slice(headerRowIndex + 1)
    .map((row, offset) => ({
      row,
      richRow: richValues[headerRowIndex + 1 + offset] || []
    }))
    .filter(({ row }) => row.some((cell) => String(cell || '').trim()))
    .filter(({ row }) => {
      const inboundDate = normalizeDateKey_(pickCell_(row, indexes, ['입고일']));
      return inboundDate >= startDate && inboundDate <= endDate;
    })
    .map(({ row, richRow }) => {
      const productId = pickCell_(row, indexes, ['제품ID', '제품 ID']);

      return {
        managementId: pickCell_(row, indexes, ['관리 ID', '관리ID']),
        category: pickCell_(row, indexes, ['구분']),
        status: pickCell_(row, indexes, ['상태']),
        registeredAt: pickCell_(row, indexes, ['등록 일시', '등록일시']),
        inboundDate: pickCell_(row, indexes, ['입고일']),
        inboundTime: pickCell_(row, indexes, ['입고 시간', '입고시간']),
        dueDate: pickCell_(row, indexes, ['납기일']) || productDueDateMap[productId] || '',
        clientName: pickCell_(row, indexes, ['업체명', '거래처명']),
        inboundType: pickCell_(row, indexes, ['입고 유형', '입고유형']),
        productId,
        productName: pickCell_(row, indexes, ['제품명']),
        batch: pickCell_(row, indexes, ['차수']),
        process: pickCell_(row, indexes, ['최종공정', '최종 공정']),
        storage: pickCell_(row, indexes, ['보관위치', '보관 위치']),
        boxQuantity: pickCell_(row, indexes, ['박스당 수량', '박스당수량']),
        inboundBoxCount: pickCell_(row, indexes, ['입고 박스 수', '입고박스수']),
        remainQuantity: pickCell_(row, indexes, ['잔량 수량', '잔량']),
        inboundTotalQuantity: pickCell_(row, indexes, ['입고 총 수량', '입고총수량']),
        boxTotalCount: pickCell_(row, indexes, ['박스 총 수량', '박스총수량']),
        inspectionQuantity: pickCell_(row, indexes, ['검수 수량', '검수수량']),
        defectQuantity: pickCell_(row, indexes, ['불량 수량', '불량수량']),
        defectRate: pickCell_(row, indexes, ['불량률']),
        defectReason: pickCell_(row, indexes, ['불량 사유', '불량사유']),
        invoiceFileUrl: pickCellLinkOrValue_(row, richRow, indexes, ['거래명세표', '거래명세서']),
        defectPhotoUrls: pickCellLinkOrValue_(row, richRow, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL']),
        note: pickCell_(row, indexes, ['비고']),
        registrant: pickCell_(row, indexes, ['등록자'])
      };
    })
    .reverse();

  return {
    startDate,
    endDate,
    inbounds
  };
}

function getInboundBoxQrs(payload) {
  const managementId = String(payload?.managementId || payload?.['관리ID'] || payload?.['관리 ID'] || '').trim();

  if (!managementId) {
    throw new Error('입고 관리 ID가 필요합니다.');
  }

  const sheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['박스ID', '관리ID', '제품명']);

  if (!headerInfo) {
    throw new Error('박스관리 DB 헤더를 찾을 수 없습니다.');
  }

  const { headers, rowIndex: headerRowIndex } = headerInfo;
  const indexes = indexHeaders_(headers);
  const managementIndex = findHeaderIndex_(indexes, ['관리ID', '관리 ID']);

  if (managementIndex < 0) {
    throw new Error('박스관리 DB의 관리ID 컬럼을 찾을 수 없습니다.');
  }

  const generatedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy. M. d HH:mm');
  const boxes = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const sourceRow = values[rowIndex];

    if (!sourceRow.some((cell) => String(cell || '').trim())) {
      continue;
    }

    if (String(sourceRow[managementIndex] || '').trim() !== managementId) {
      continue;
    }

    const row = sourceRow.slice(0, headers.length);
    const boxId = pickCell_(row, indexes, ['박스ID']);
    const sequenceText = pickCell_(row, indexes, ['박스순번', '박스 순번', '박스 번호']);
    const sequence = Number(sequenceText) || boxes.length + 1;
    const productId = pickCell_(row, indexes, ['제품ID', '제품 ID']);
    const productName = pickCell_(row, indexes, ['제품명']);
    const boxQuantity = pickCell_(row, indexes, ['박스당 수량', '박스당수량']);
    const currentQuantity = pickCell_(row, indexes, ['현재 수량', '현재수량']);
    const storage = pickCell_(row, indexes, ['보관 위치', '보관위치', '보관 장소']);
    const status = pickCell_(row, indexes, ['상태', '재고 상태']);
    let qrData = pickCell_(row, indexes, ['QR 데이터']);

    if (!qrData || qrData === '-') {
      qrData = buildBoxQrData_({
        boxId,
        managementId,
        sequence,
        productId,
        productName
      });
    }

    setRowValue_(row, indexes, ['QR 생성 여부', 'QR 출력 여부'], '생성');
    setRowValue_(row, indexes, ['QR 생성 일시'], pickCell_(row, indexes, ['QR 생성 일시']) || generatedAt);
    setRowValue_(row, indexes, ['QR 데이터'], qrData);
    sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([row]);

    boxes.push({
      boxId,
      managementId,
      sequence,
      productId,
      productName,
      boxQuantity,
      currentQuantity,
      storage,
      status,
      qrData
    });
  }

  if (!boxes.length) {
    throw new Error('해당 입고 내역의 박스 QR 데이터를 찾을 수 없습니다.');
  }

  boxes.sort((left, right) => Number(left.sequence) - Number(right.sequence));

  return {
    managementId,
    generatedAt,
    boxCount: boxes.length,
    boxes
  };
}

function updateProduct(payload) {
  const productId = String(payload.productId || payload.productCode || payload['제품 ID'] || payload['제품ID'] || '').trim();
  const required = ['업체명', '제품명', '발주량', '납기일', '박스당 수량', '트레이 수량'];

  if (!productId) {
    throw new Error('수정할 제품 ID가 필요합니다.');
  }

  required.forEach((field) => {
    if (!payload[field]) {
      throw new Error(`${field} 값이 필요합니다.`);
    }
  });

  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['제품 ID', '업체명', '제품명']);

  if (!headerInfo) {
    throw new Error('제품 DB 헤더를 찾을 수 없습니다.');
  }

  const { headers, rowIndex: headerRowIndex } = headerInfo;
  const indexes = indexHeaders_(headers);
  const productIdIndex = findHeaderIndex_(indexes, ['제품 ID', '제품ID']);

  if (productIdIndex < 0) {
    throw new Error('제품 ID 컬럼을 찾을 수 없습니다.');
  }

  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const rowProductId = String(values[rowIndex][productIdIndex] || '').trim();

    if (rowProductId === productId) {
      const now = new Date();
      const timezone = 'Asia/Seoul';
      const row = headers.map((_, columnIndex) => values[rowIndex][columnIndex] || '');

      setRowValue_(row, indexes, ['업체명', '거래처명'], payload['업체명']);
      setRowValue_(row, indexes, ['제품명'], payload['제품명']);
      setRowValue_(row, indexes, ['색상'], payload['색상'] || '');
      setRowValue_(row, indexes, ['사용 여부', '사용여부'], payload['사용 여부'] || payload['사용여부'] || '사용중');
      setRowValue_(row, indexes, ['발주량', '주문량'], payload['발주량'] || payload['주문량'] || '');
      setRowValue_(row, indexes, ['박스당 수량', '박스당수량'], payload['박스당 수량'] || payload['박스당수량'] || '');
      setRowValue_(row, indexes, ['트레이 수량', '트레이수량'], payload['트레이 수량'] || payload['트레이수량'] || '');
      setRowValue_(row, indexes, ['납기일'], payload['납기일'] || '');
      setRowValue_(row, indexes, ['최종 수정일', '수정일'], Utilities.formatDate(now, timezone, 'yyyy.MM.dd'));
      setRowValue_(row, indexes, ['최종 수정시간', '수정시간'], Utilities.formatDate(now, timezone, 'HH:mm'));
      setRowValue_(row, indexes, ['비고'], payload['비고'] || '');

      sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([fillBlankCells_(row)]);
      applyProductRowTemplate_(sheet, headerRowIndex + 2, rowIndex + 1, headers.length);

      return {
        productId,
        updated: true
      };
    }
  }

  throw new Error('수정할 제품을 찾을 수 없습니다.');
}

function deleteProduct(payload) {
  const productId = String(payload.productId || payload.productCode || payload['제품 ID'] || payload['제품ID'] || '').trim();

  if (!productId) {
    throw new Error('삭제할 제품 ID가 필요합니다.');
  }

  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['제품 ID', '업체명', '제품명']);

  if (!headerInfo) {
    throw new Error('제품 DB 헤더를 찾을 수 없습니다.');
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const productIdIndex = findHeaderIndex_(indexes, ['제품 ID', '제품ID']);

  if (productIdIndex < 0) {
    throw new Error('제품 ID 컬럼을 찾을 수 없습니다.');
  }

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const rowProductId = String(values[rowIndex][productIdIndex] || '').trim();

    if (rowProductId === productId) {
      sheet.deleteRow(rowIndex + 1);
      return {
        productId,
        deleted: true
      };
    }
  }

  throw new Error('삭제할 제품을 찾을 수 없습니다.');
}

function deleteInbound(payload) {
  const managementId = String(payload.managementId || payload['관리 ID'] || payload['관리ID'] || '').trim();

  if (!managementId) {
    throw new Error('삭제할 입고 관리 ID가 필요합니다.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
    const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
    const deletedStockRows = deleteRowsByHeaderValue_(stockSheet, ['관리 ID', '관리ID'], managementId, ['관리 ID', '입고일', '제품명']);
    const deletedBoxRows = deleteRowsByHeaderValue_(boxSheet, ['관리ID', '관리 ID'], managementId, ['박스ID', '관리ID', '제품명']);

    if (!deletedStockRows) {
      throw new Error('삭제할 입고 내역을 찾을 수 없습니다.');
    }

    return {
      managementId,
      deletedStockRows,
      deletedBoxRows
    };
  } finally {
    lock.releaseLock();
  }
}

function formatProductRows() {
  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['제품 ID', '업체명', '제품명']);

  if (!headerInfo) {
    throw new Error('제품 DB 헤더를 찾을 수 없습니다.');
  }

  const templateRowNumber = headerInfo.rowIndex + 2;
  const lastRow = sheet.getLastRow();
  let formattedRows = 0;

  for (let rowNumber = templateRowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    const rowValues = sheet.getRange(rowNumber, 1, 1, headerInfo.headers.length).getDisplayValues()[0];
    const hasContent = rowValues.some((value) => String(value || '').trim());

    if (hasContent) {
      applyProductRowTemplate_(sheet, templateRowNumber, rowNumber, headerInfo.headers.length);
      formattedRows += 1;
    }
  }

  return {
    formattedRows
  };
}

function createInbound(payload) {
  const category = String(payload.category || payload.entryCategory || '').trim() === '기존 재고'
    ? '기존 재고'
    : '신규입고';
  const isExistingStock = category === '기존 재고';
  const required = [
    ['productId', '제품 ID'],
    ['productName', '제품명'],
    ['clientName', '거래처명'],
    ['inboundDate', '입고일'],
    ['inboundTime', '입고 시간'],
    ['inboundType', '입고 유형'],
    ['process', '최종공정'],
    ['storage', '보관위치']
  ];

  if (!isExistingStock) {
    required.push(['defectReason', '불량 사유']);
  }

  required.forEach(([key, label]) => {
    if (!String(payload[key] || '').trim()) {
      throw new Error(`${label} 값이 필요합니다.`);
    }
  });

  const boxQuantity = toPositiveNumber_(payload.boxQuantity, '박스당 수량');
  const inboundBoxCount = toPositiveNumber_(payload.inboundBoxCount, '입고 박스 수');
  const remainQuantity = toNumber_(payload.remainQuantity);
  const inspectionQuantity = isExistingStock
    ? toNumber_(payload.inspectionQuantity || boxQuantity)
    : toPositiveNumber_(payload.inspectionQuantity, '검수 수량');
  const defectQuantity = toNumber_(payload.defectQuantity);

  if (remainQuantity < 0 || defectQuantity < 0) {
    throw new Error('수량은 0 이상의 숫자로 입력해주세요.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
    const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
    ensureStockDbAttachmentHeaders_(stockSheet);
    const now = new Date();
    const timezone = 'Asia/Seoul';
    const registeredDate = Utilities.formatDate(now, timezone, 'yyyy. M. d');
    const managementDate = Utilities.formatDate(now, timezone, 'yyMMdd');
    const managementId = generateInboundManagementId_(stockSheet, managementDate);
    const totalBoxCount = inboundBoxCount + (remainQuantity > 0 ? 1 : 0);
    const totalQuantity = boxQuantity * inboundBoxCount + remainQuantity;
    const defectRate = inspectionQuantity > 0 ? Math.round((defectQuantity / inspectionQuantity) * 100) : 0;
    const note = dash_(payload.note);
    const invoiceFileUrl = uploadInboundInvoice_(payload, {
      managementId,
      registeredDate
    });
    const defectPhotoUrls = uploadInboundDefectPhotos_(payload, {
      managementId,
      registeredDate
    });
    const stockRecord = {
      category,
      status: '보관',
      managementId,
      clientName: dash_(payload.clientName),
      registrant: dash_(payload.registrant || 'Admin'),
      registeredDate,
      inboundDate: dash_(payload.inboundDate),
      inboundTime: dash_(payload.inboundTime),
      inboundType: dash_(isExistingStock ? '기존 재고' : payload.inboundType),
      dueDate: dash_(payload.dueDate),
      productId: dash_(payload.productId),
      productName: dash_(payload.productName),
      batch: dash_(payload.batch),
      process: dash_(payload.process),
      storage: dash_(payload.storage),
      boxQuantity: formatEa_(boxQuantity),
      inboundBoxCount: formatBox_(inboundBoxCount),
      remainQuantity: formatEa_(remainQuantity),
      boxTotalCount: formatBox_(totalBoxCount),
      inboundTotalQuantity: formatEa_(totalQuantity),
      inspectionQuantity: formatEa_(inspectionQuantity),
      defectQuantity: formatEa_(defectQuantity),
      defectRate: `${defectRate}%`,
      defectReason: dash_(isExistingStock ? '-' : payload.defectReason),
      invoiceFileUrl,
      defectPhotoUrls,
      note
    };

    const stockRow = appendStockDbRow_(stockSheet, stockRecord);
    const boxRecords = [];

    for (let index = 1; index <= totalBoxCount; index += 1) {
      const isRemainderBox = remainQuantity > 0 && index === totalBoxCount;
      const currentQuantity = isRemainderBox ? remainQuantity : boxQuantity;
      const boxId = `${managementId}-B${String(index).padStart(3, '0')}`;

      boxRecords.push({
        boxId,
        managementId,
        sequence: index,
        productId: dash_(payload.productId),
        productName: dash_(payload.productName),
        boxQuantity: formatEa_(boxQuantity),
        currentQuantity: formatEa_(currentQuantity),
        storage: dash_(payload.storage),
        status: '보관',
        registeredDate
      });
    }

    const boxStartRow = appendBoxManagementRows_(boxSheet, boxRecords);

    return {
      managementId,
      stockRow,
      boxStartRow,
      boxCount: boxRecords.length,
      boxIds: boxRecords.map((record) => record.boxId)
    };
  } finally {
    lock.releaseLock();
  }
}

function updateInbound(payload) {
  const managementId = String(payload.managementId || payload['관리 ID'] || payload['관리ID'] || '').trim();

  if (!managementId) {
    throw new Error('수정할 입고 관리 ID가 필요합니다.');
  }

  const inboundDate = String(payload.inboundDate || payload['입고일'] || '').trim();
  const inboundTime = String(payload.inboundTime || payload['입고 시간'] || payload['입고시간'] || '').trim();
  const inboundType = String(payload.inboundType || payload['입고 유형'] || payload['입고유형'] || '').trim();
  const process = String(payload.process || payload['최종공정'] || '').trim();
  const storage = String(payload.storage || payload['보관위치'] || '').trim();
  const defectReason = String(payload.defectReason || payload['불량 사유'] || payload['불량사유'] || '').trim();

  if (!inboundDate) {
    throw new Error('입고일 값이 필요합니다.');
  }

  if (!inboundTime) {
    throw new Error('입고 시간 값이 필요합니다.');
  }

  if (!inboundType) {
    throw new Error('입고 유형 값이 필요합니다.');
  }

  if (!process) {
    throw new Error('최종공정 값이 필요합니다.');
  }

  if (!storage) {
    throw new Error('보관위치 값이 필요합니다.');
  }

  if (!defectReason) {
    throw new Error('불량 사유 값이 필요합니다.');
  }

  const boxQuantity = toPositiveNumber_(payload.boxQuantity, '박스당 수량');
  const inboundBoxCount = toPositiveNumber_(payload.inboundBoxCount, '입고 박스 수');
  const remainQuantity = toNumber_(payload.remainQuantity);
  const inspectionQuantity = toPositiveNumber_(payload.inspectionQuantity, '검수 수량');
  const defectQuantity = toNumber_(payload.defectQuantity);

  if (remainQuantity < 0 || defectQuantity < 0) {
    throw new Error('수량은 0 이상의 숫자로 입력해주세요.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
    const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
    ensureStockDbAttachmentHeaders_(stockSheet);
    const rowInfo = findRowByHeaderValue_(stockSheet, ['관리 ID', '관리ID'], managementId, ['관리 ID', '입고일', '제품명']);

    if (!rowInfo) {
      throw new Error('수정할 입고 내역을 찾을 수 없습니다.');
    }

    const row = rowInfo.rowValues.slice();
    const totalBoxCount = inboundBoxCount + (remainQuantity > 0 ? 1 : 0);
    const totalQuantity = boxQuantity * inboundBoxCount + remainQuantity;
    const defectRate = inspectionQuantity > 0 ? Math.round((defectQuantity / inspectionQuantity) * 100) : 0;
    const productId = dash_(pickCell_(row, rowInfo.indexes, ['제품ID', '제품 ID']));
    const productName = dash_(pickCell_(row, rowInfo.indexes, ['제품명']));
    const clientName = dash_(pickCell_(row, rowInfo.indexes, ['업체명', '거래처명']));
    const registeredDate = dash_(pickCell_(row, rowInfo.indexes, ['등록 일시', '등록일시']));
    const filePayload = Object.assign({}, payload, {
      productName,
      clientName,
      inboundDate
    });
    const invoiceFileUrl = uploadInboundInvoice_(filePayload, {
      managementId,
      registeredDate
    });
    const defectPhotoUrls = uploadInboundDefectPhotos_(filePayload, {
      managementId,
      registeredDate
    });
    const finalInvoiceFileUrl = invoiceFileUrl || pickCellLinkOrValue_(
      row,
      rowInfo.richRowValues,
      rowInfo.indexes,
      ['거래명세표', '거래명세서']
    );
    const finalDefectPhotoUrls = defectPhotoUrls || pickCellLinkOrValue_(
      row,
      rowInfo.richRowValues,
      rowInfo.indexes,
      ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL']
    );

    setRowValue_(row, rowInfo.indexes, ['입고일'], inboundDate);
    setRowValue_(row, rowInfo.indexes, ['입고 시간', '입고시간'], inboundTime);
    setRowValue_(row, rowInfo.indexes, ['입고 유형', '입고유형'], inboundType);
    setRowValue_(row, rowInfo.indexes, ['납기일'], dash_(payload.dueDate));
    setRowValue_(row, rowInfo.indexes, ['차수'], dash_(payload.batch));
    setRowValue_(row, rowInfo.indexes, ['최종공정'], process);
    setRowValue_(row, rowInfo.indexes, ['보관위치'], storage);
    setRowValue_(row, rowInfo.indexes, ['박스당 수량', '박스당수량'], formatEa_(boxQuantity));
    setRowValue_(row, rowInfo.indexes, ['입고 박스 수', '입고박스수'], formatBox_(inboundBoxCount));
    setRowValue_(row, rowInfo.indexes, ['잔량 수량', '잔량수량'], formatEa_(remainQuantity));
    setRowValue_(row, rowInfo.indexes, ['박스 총 수량', '박스총수량'], formatBox_(totalBoxCount));
    setRowValue_(row, rowInfo.indexes, ['입고 총 수량', '입고총수량'], formatEa_(totalQuantity));
    setRowValue_(row, rowInfo.indexes, ['검수 수량', '검수수량'], formatEa_(inspectionQuantity));
    setRowValue_(row, rowInfo.indexes, ['불량 수량', '불량수량'], formatEa_(defectQuantity));
    setRowValue_(row, rowInfo.indexes, ['불량률'], `${defectRate}%`);
    setRowValue_(row, rowInfo.indexes, ['불량 사유', '불량사유'], dash_(defectReason));
    if (invoiceFileUrl) {
      setRowValue_(row, rowInfo.indexes, ['거래명세표', '거래명세서'], invoiceFileUrl);
    }
    if (defectPhotoUrls) {
      setRowValue_(row, rowInfo.indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL'], defectPhotoUrls);
    }

    stockSheet.getRange(rowInfo.rowNumber, 1, 1, rowInfo.headers.length).setValues([row]);
    applyProductRowTemplate_(stockSheet, rowInfo.headerRowIndex + 2, rowInfo.rowNumber, rowInfo.headers.length);
    setStockDbAttachmentLinks_(stockSheet, rowInfo.rowNumber, rowInfo.indexes, {
      invoiceFileUrl: finalInvoiceFileUrl,
      defectPhotoUrls: finalDefectPhotoUrls
    });

    deleteRowsByHeaderValue_(boxSheet, ['관리ID', '관리 ID'], managementId, ['박스ID', '관리ID', '제품명']);

    const boxRecords = [];

    for (let index = 1; index <= totalBoxCount; index += 1) {
      const isRemainderBox = remainQuantity > 0 && index === totalBoxCount;
      const currentQuantity = isRemainderBox ? remainQuantity : boxQuantity;
      const boxId = `${managementId}-B${String(index).padStart(3, '0')}`;

      boxRecords.push({
        boxId,
        managementId,
        sequence: index,
        productId,
        productName,
        boxQuantity: formatEa_(boxQuantity),
        currentQuantity: formatEa_(currentQuantity),
        storage,
        status: '보관',
        registeredDate
      });
    }

    const boxStartRow = appendBoxManagementRows_(boxSheet, boxRecords);

    return {
      managementId,
      updated: true,
      stockRow: rowInfo.rowNumber,
      boxStartRow,
      boxCount: boxRecords.length,
      boxIds: boxRecords.map((record) => record.boxId)
    };
  } finally {
    lock.releaseLock();
  }
}

function applyProductRowTemplate_(sheet, templateRowNumber, targetRowNumber, columnCount) {
  if (targetRowNumber === templateRowNumber || templateRowNumber > sheet.getLastRow()) {
    return;
  }

  const sourceRange = sheet.getRange(templateRowNumber, 1, 1, columnCount);
  const targetRange = sheet.getRange(targetRowNumber, 1, 1, columnCount);

  sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
  sheet.setRowHeight(targetRowNumber, sheet.getRowHeight(templateRowNumber));
}

function appendStyledRangeRow_(sheet, startColumn, rowValues, templateRowNumber) {
  return appendStyledRangeRows_(sheet, startColumn, [rowValues], templateRowNumber);
}

function appendStyledRangeRows_(sheet, startColumn, rows, templateRowNumber) {
  if (!rows.length) {
    return 0;
  }

  const targetStartRow = Math.max(sheet.getLastRow() + 1, templateRowNumber + 1);
  const columnCount = rows[0].length;
  const templateRange = sheet.getRange(templateRowNumber, startColumn, 1, columnCount);

  rows.forEach((row, index) => {
    const targetRowNumber = targetStartRow + index;
    const targetRange = sheet.getRange(targetRowNumber, startColumn, 1, columnCount);

    templateRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    templateRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    sheet.setRowHeight(targetRowNumber, sheet.getRowHeight(templateRowNumber));
  });

  sheet.getRange(targetStartRow, startColumn, rows.length, columnCount).setValues(rows);
  return targetStartRow;
}

function appendStockDbRow_(sheet, record) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '입고일', '제품명']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const startColumn = 2;
  const templateRowNumber = headerInfo.rowIndex + 2;
  const indexes = indexHeaders_(headerInfo.headers);
  const row = new Array(headerInfo.headers.length).fill('');

  setRowValue_(row, indexes, ['구분'], record.category);
  setRowValue_(row, indexes, ['상태'], record.status);
  setRowValue_(row, indexes, ['관리 ID', '관리ID'], record.managementId);
  setRowValue_(row, indexes, ['업체명'], record.clientName);
  setRowValue_(row, indexes, ['등록자'], record.registrant);
  setRowValue_(row, indexes, ['등록 일시', '등록일시'], record.registeredDate);
  setRowValue_(row, indexes, ['입고일'], record.inboundDate);
  setRowValue_(row, indexes, ['입고 시간', '입고시간'], record.inboundTime);
  setRowValue_(row, indexes, ['입고 유형', '입고유형'], record.inboundType);
  setRowValue_(row, indexes, ['납기일'], record.dueDate);
  setRowValue_(row, indexes, ['제품ID', '제품 ID'], record.productId);
  setRowValue_(row, indexes, ['제품명'], record.productName);
  setRowValue_(row, indexes, ['차수'], record.batch);
  setRowValue_(row, indexes, ['최종공정'], record.process);
  setRowValue_(row, indexes, ['보관위치', '보관 위치'], record.storage);
  setRowValue_(row, indexes, ['박스당 수량', '박스당수량'], record.boxQuantity);
  setRowValue_(row, indexes, ['입고 박스 수', '입고박스수'], record.inboundBoxCount);
  setRowValue_(row, indexes, ['잔량 수량', '잔량수량'], record.remainQuantity);
  setRowValue_(row, indexes, ['박스 총 수량', '박스총수량'], record.boxTotalCount);
  setRowValue_(row, indexes, ['입고 총 수량', '입고총수량'], record.inboundTotalQuantity);
  setRowValue_(row, indexes, ['검수 수량', '검수수량', '검사 수량'], record.inspectionQuantity);
  setRowValue_(row, indexes, ['불량 수량', '불량수량'], record.defectQuantity);
  setRowValue_(row, indexes, ['불량률'], record.defectRate);
  setRowValue_(row, indexes, ['불량 사유', '불량사유'], record.defectReason);
  setRowValue_(row, indexes, ['거래명세표', '거래명세서'], record.invoiceFileUrl || '-');
  setRowValue_(row, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL'], record.defectPhotoUrls || '-');
  setRowValue_(row, indexes, ['비고'], record.note);

  const rowNumber = appendStyledRangeRows_(sheet, startColumn, [row.slice(startColumn - 1)], templateRowNumber);
  setStockDbAttachmentLinks_(sheet, rowNumber, indexes, record);
  return rowNumber;
}

function ensureStockDbAttachmentHeaders_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '입고일', '제품명']);

  if (!headerInfo) {
    return;
  }

  const requiredHeaders = ['거래명세표', '불량 사진'];
  const existingHeaders = headerInfo.headers.map((header) => String(header || '').trim());
  let nextColumn = existingHeaders.length + 1;

  requiredHeaders.forEach((header) => {
    if (existingHeaders.includes(header)) {
      return;
    }

    sheet.getRange(headerInfo.rowIndex + 1, nextColumn).setValue(header);
    existingHeaders.push(header);
    nextColumn += 1;
  });
}

function appendBoxManagementRows_(sheet, boxRecords) {
  if (!boxRecords.length) {
    return 0;
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['박스ID', '관리ID', '제품명']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const startColumn = 2;
  const templateRowNumber = headerInfo.rowIndex + 2;
  const indexes = indexHeaders_(headerInfo.headers);
  const rows = boxRecords.map((record) => {
    const row = new Array(headerInfo.headers.length).fill('');

    setRowValue_(row, indexes, ['박스ID'], record.boxId);
    setRowValue_(row, indexes, ['관리ID', '관리 ID'], record.managementId);
    setRowValue_(row, indexes, ['박스순번', '박스 순번', '박스 번호'], record.sequence);
    setRowValue_(row, indexes, ['제품ID', '제품 ID'], record.productId);
    setRowValue_(row, indexes, ['제품명'], record.productName);
    setRowValue_(row, indexes, ['박스당 수량', '박스당수량'], record.boxQuantity);
    setRowValue_(row, indexes, ['현재 수량', '현재수량'], record.currentQuantity);
    setRowValue_(row, indexes, ['보관 위치', '보관위치', '보관 장소'], record.storage);
    setRowValue_(row, indexes, ['상태', '재고 상태'], record.status || '보관');
    setRowValue_(row, indexes, ['등록 일시', '등록일시'], record.registeredDate);
    setRowValue_(row, indexes, ['QR 생성 여부', 'QR 출력 여부'], '');
    setRowValue_(row, indexes, ['QR 생성 일시'], '');
    setRowValue_(row, indexes, ['QR 데이터'], '');
    setRowValue_(row, indexes, ['작업자'], '');
    setRowValue_(row, indexes, ['출고일'], '');
    setRowValue_(row, indexes, ['출고시간'], '');
    setRowValue_(row, indexes, ['출고자'], '');
    setRowValue_(row, indexes, ['검수일'], '');
    setRowValue_(row, indexes, ['검수시간'], '');
    setRowValue_(row, indexes, ['검수자'], '');
    setRowValue_(row, indexes, ['검수수량'], '');
    setRowValue_(row, indexes, ['불량률'], '');
    setRowValue_(row, indexes, ['비고'], '-');

    return row.slice(startColumn - 1);
  });

  return appendStyledRangeRows_(sheet, startColumn, rows, templateRowNumber);
}

function buildBoxQrData_(record) {
  return JSON.stringify({
    t: 'SJ_BOX',
    b: record.boxId,
    m: record.managementId,
    p: record.productId,
    n: record.sequence
  });
}

function deleteRowsByHeaderValue_(sheet, headerNames, targetValue, requiredHeaders) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, requiredHeaders);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const targetIndex = findHeaderIndex_(indexes, headerNames);

  if (targetIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 컬럼을 찾을 수 없습니다.`);
  }

  const rowNumbers = [];

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const value = String(values[rowIndex][targetIndex] || '').trim();

    if (value === targetValue) {
      rowNumbers.push(rowIndex + 1);
    }
  }

  rowNumbers.reverse().forEach((rowNumber) => {
    sheet.deleteRow(rowNumber);
  });

  return rowNumbers.length;
}

function findRowByHeaderValue_(sheet, headerNames, targetValue, requiredHeaders) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getDisplayValues();
  const richValues = dataRange.getRichTextValues();
  const headerInfo = findHeaderRow_(values, requiredHeaders);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const targetIndex = findHeaderIndex_(indexes, headerNames);

  if (targetIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 컬럼을 찾을 수 없습니다.`);
  }

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const value = String(values[rowIndex][targetIndex] || '').trim();

    if (value === targetValue) {
      return {
        rowNumber: rowIndex + 1,
        rowValues: values[rowIndex],
        richRowValues: richValues[rowIndex] || [],
        headerRowIndex: headerInfo.rowIndex,
        headers: headerInfo.headers,
        indexes
      };
    }
  }

  return null;
}

function fillBlankCells_(row) {
  return row.map((value) => String(value || '').trim() ? value : '-');
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  return JSON.parse(e.postData.contents);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`${sheetName} 시트를 찾을 수 없습니다. setupSheets를 먼저 실행하세요.`);
  }
  return sheet;
}

function getSheetByNameOrId_(sheetName, sheetId, displayName) {
  const ss = getSpreadsheet_();
  const byName = ss.getSheetByName(sheetName);

  if (byName) {
    return byName;
  }

  const byId = ss.getSheets().find((sheet) => sheet.getSheetId() === sheetId);

  if (byId) {
    return byId;
  }

  throw new Error(`${displayName || sheetName} 시트를 찾을 수 없습니다. 시트 탭 이름 또는 gid를 확인해주세요.`);
}

function getProductSheet_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.PRODUCTS) || ss.getSheetByName('제품 DB');
  if (!sheet) {
    throw new Error('제품DB 시트를 찾을 수 없습니다.');
  }
  return sheet;
}

function uploadInboundInvoice_(payload, context) {
  const file = payload.invoiceFile;

  if (!file || !String(file.data || '').trim()) {
    return '';
  }

  const productName = dash_(payload.productName);
  const clientName = dash_(payload.clientName);
  const dateFolderName = sanitizeDriveName_(dash_(payload.inboundDate || context.registeredDate));
  const extension = getFileExtension_(file.name, file.mimeType);
  const fileName = `${sanitizeDriveName_(productName)}${extension}`;
  const bytes = Utilities.base64Decode(String(file.data).trim());
  const mimeType = String(file.mimeType || 'application/octet-stream').trim();
  const rootFolder = DriveApp.getFolderById(CONFIG.DRIVE_ROOT_FOLDER_ID);
  const targetFolder = getOrCreateDriveFolderPath_(rootFolder, [
    '거래명세서',
    '입고',
    dateFolderName,
    sanitizeDriveName_(clientName)
  ]);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const createdFile = targetFolder.createFile(blob);

  createdFile.setDescription(`관리ID: ${context.managementId}`);
  return createdFile.getUrl();
}

function uploadInboundDefectPhotos_(payload, context) {
  const files = Array.isArray(payload.defectFiles) ? payload.defectFiles : [];

  if (!files.length) {
    return '';
  }

  const productName = dash_(payload.productName);
  const clientName = dash_(payload.clientName);
  const dateFolderName = sanitizeDriveName_(dash_(payload.inboundDate || context.registeredDate));
  const rootFolder = DriveApp.getFolderById(CONFIG.DEFECT_PHOTO_ROOT_FOLDER_ID);
  const targetFolder = getOrCreateDriveFolderPath_(rootFolder, [
    '입고',
    dateFolderName,
    sanitizeDriveName_(clientName)
  ]);
  const baseFileName = sanitizeDriveName_(productName);

  const uploadedUrls = files.map((file, index) => {
    if (!file || !String(file.data || '').trim()) {
      return '';
    }

    const extension = getFileExtension_(file.name, file.mimeType);
    const fileName = `${baseFileName}_${index + 1}${extension}`;
    const bytes = Utilities.base64Decode(String(file.data).trim());
    const mimeType = String(file.mimeType || 'application/octet-stream').trim();
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const createdFile = targetFolder.createFile(blob);

    createdFile.setDescription(`관리ID: ${context.managementId}, 불량사진 ${index + 1}`);
    return createdFile.getUrl();
  }).filter(Boolean);

  return uploadedUrls.length ? targetFolder.getUrl() : '';
}

function getOrCreateDriveFolderPath_(rootFolder, folderNames) {
  return folderNames.reduce((parentFolder, folderName) => {
    const safeName = sanitizeDriveName_(folderName);
    const folders = parentFolder.getFoldersByName(safeName);
    return folders.hasNext() ? folders.next() : parentFolder.createFolder(safeName);
  }, rootFolder);
}

function sanitizeDriveName_(value) {
  const name = String(value || '').trim().replace(/[\\/:*?"<>|#{}\[\]]/g, ' ').replace(/\s+/g, ' ');
  return name || '-';
}

function getFileExtension_(fileName, mimeType) {
  const name = String(fileName || '').trim();
  const match = name.match(/(\.[A-Za-z0-9]{1,8})$/);

  if (match) {
    return match[1].toLowerCase();
  }

  const extensionByMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif'
  };

  return extensionByMime[String(mimeType || '').toLowerCase()] || '';
}

function getOrCreateSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function findHeaderRow_(values, requiredHeaders) {
  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const headers = values[rowIndex].map((cell) => String(cell || '').trim());
    const hasAllHeaders = requiredHeaders.every((header) => headers.includes(header));

    if (hasAllHeaders) {
      return {
        rowIndex,
        headers
      };
    }
  }

  return null;
}

function indexHeaders_(headers) {
  return headers.reduce((indexes, header, index) => {
    const normalized = String(header || '').trim();
    if (normalized) {
      indexes[normalized] = index;
    }
    return indexes;
  }, {});
}

function pickCell_(row, indexes, names) {
  const index = findHeaderIndex_(indexes, names);
  return index >= 0 ? String(row[index] || '').trim() : '';
}

function pickCellLinkOrValue_(row, richRow, indexes, names) {
  const index = findHeaderIndex_(indexes, names);

  if (index < 0) {
    return '';
  }

  const linkUrl = getRichTextLinkUrl_(richRow[index]);
  if (linkUrl) {
    return linkUrl;
  }

  return String(row[index] || '').trim();
}

function setRowValue_(row, indexes, names, value) {
  const index = findHeaderIndex_(indexes, names);
  if (index >= 0) {
    row[index] = value;
  }
}

function setStockDbAttachmentLinks_(sheet, rowNumber, indexes, record) {
  setLinkedCell_(sheet, rowNumber, indexes, ['거래명세표', '거래명세서'], record.invoiceFileUrl, '📁 링크');
  setLinkedCell_(sheet, rowNumber, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL'], record.defectPhotoUrls, '📁 링크');
}

function setLinkedCell_(sheet, rowNumber, indexes, names, url, label) {
  const index = findHeaderIndex_(indexes, names);

  if (index < 0) {
    return;
  }

  const range = sheet.getRange(rowNumber, index + 1);
  const normalizedUrl = String(url || '').trim();

  if (!normalizedUrl || normalizedUrl === '-') {
    range.setValue('-');
    return;
  }

  const richText = SpreadsheetApp.newRichTextValue()
    .setText(label || '링크')
    .setLinkUrl(normalizedUrl)
    .build();

  range.setRichTextValue(richText);
}

function getRichTextLinkUrl_(richTextValue) {
  if (!richTextValue) {
    return '';
  }

  const directUrl = richTextValue.getLinkUrl && richTextValue.getLinkUrl();
  if (directUrl) {
    return directUrl;
  }

  const runs = richTextValue.getRuns ? richTextValue.getRuns() : [];
  for (let i = 0; i < runs.length; i += 1) {
    const url = runs[i].getLinkUrl && runs[i].getLinkUrl();
    if (url) {
      return url;
    }
  }

  return '';
}

function getDriveFolderUrlFromLinks_(value) {
  const text = String(value || '').trim();

  if (!text || text === '-') {
    return '';
  }

  const folderMatch = text.match(/https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+/);
  if (folderMatch) {
    return folderMatch[0];
  }

  const fileIds = [];
  const filePathRegex = /\/file\/d\/([A-Za-z0-9_-]+)/g;
  const queryIdRegex = /[?&]id=([A-Za-z0-9_-]+)/g;
  let match;

  while ((match = filePathRegex.exec(text)) !== null) {
    fileIds.push(match[1]);
  }

  while ((match = queryIdRegex.exec(text)) !== null) {
    fileIds.push(match[1]);
  }

  if (!fileIds.length && /^https?:\/\//.test(text)) {
    return text.split(/\s+/)[0];
  }

  for (let i = 0; i < fileIds.length; i += 1) {
    try {
      const parents = DriveApp.getFileById(fileIds[i]).getParents();
      if (parents.hasNext()) {
        return parents.next().getUrl();
      }
    } catch (error) {
      // Keep trying the next URL when a stale or inaccessible file link exists.
    }
  }

  return '';
}

function findHeaderIndex_(indexes, names) {
  for (let i = 0; i < names.length; i += 1) {
    if (Object.prototype.hasOwnProperty.call(indexes, names[i])) {
      return indexes[names[i]];
    }
  }
  return -1;
}

function makeClientProductId_(clientName, values, indexes) {
  const clientCode = makeClientCode_(clientName);
  const productIdIndex = findHeaderIndex_(indexes, ['제품 ID', '제품ID']);
  let maxSequence = 0;

  if (productIdIndex >= 0) {
    values.forEach((row) => {
      const productId = String(row[productIdIndex] || '').trim();
      const match = productId.match(new RegExp(`^${clientCode}-(\\d+)$`));
      if (match) {
        maxSequence = Math.max(maxSequence, Number(match[1]));
      }
    });
  }

  return `${clientCode}-${String(maxSequence + 1).padStart(4, '0')}`;
}

function makeClientCode_(clientName) {
  const name = String(clientName || '').replace(/\s+/g, '');
  const knownCodes = {
    '아이원(아이텍)': 'ION',
    '(주)리치코스': 'RCS',
    '(주)장업시스템': 'JUS',
    '(주)ANP': 'ANP',
    '(주)정훈': 'JH',
    '(주)케이알': 'KR',
    '(주)코스엔텍': 'CNT',
    '(주)금호ENG': 'KHE',
    '뉴파트너스': 'NP',
    '필림텍': 'PLT',
    '이루팩': 'IRP',
    '(주)디엠': 'DM',
    '보경': 'BK',
    'CPI': 'CPI',
    '더승진(2공장)': 'SJ2'
  };

  if (knownCodes[name]) {
    return knownCodes[name];
  }

  const asciiCode = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
  if (asciiCode) {
    return asciiCode.padEnd(3, 'X');
  }

  const koreanSeed = Array.from(name.replace(/\(주\)|주식회사|[()]/g, '')).slice(0, 3);
  const numericCode = koreanSeed
    .map((letter) => letter.charCodeAt(0).toString(36).slice(-1).toUpperCase())
    .join('');

  return (numericCode || 'PRD').padEnd(3, 'X').slice(0, 3);
}

function readDisplayRowsByHeaders_(sheet, requiredHeaders) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, requiredHeaders);

  if (!headerInfo) {
    return {
      headers: [],
      rows: []
    };
  }

  const rows = values.slice(headerInfo.rowIndex + 1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row) => {
      return headerInfo.headers.reduce((item, header, index) => {
        const normalizedHeader = String(header || '').trim();

        if (normalizedHeader) {
          item[normalizedHeader] = String(row[index] || '').trim();
        }

        return item;
      }, {});
    });

  return {
    headers: headerInfo.headers,
    rows
  };
}

function buildInventoryProductMap_(productRows) {
  return productRows.reduce((map, row) => {
    const productId = getObjectCell_(row, ['제품 ID', '제품ID']);

    if (productId) {
      map[productId] = {
        productId,
        clientName: getObjectCell_(row, ['업체명', '거래처명']),
        productName: getObjectCell_(row, ['제품명']),
        orderQuantity: getObjectCell_(row, ['발주량', '주문량']),
        dueDate: getObjectCell_(row, ['납기일'])
      };
    }

    return map;
  }, {});
}

function buildInventoryBoxSummaryMap_(boxRows) {
  const map = {};

  boxRows.forEach((row) => {
    const managementId = getObjectCell_(row, ['관리ID', '관리 ID']);

    if (!managementId) {
      return;
    }

    const status = getObjectCell_(row, ['상태', '재고 상태']) || '보관';
    const currentQuantity = displayQuantityToNumber_(getObjectCell_(row, ['현재 수량', '현재수량']));
    const isActiveBox = currentQuantity > 0 && !/출고|폐기/.test(status);
    const storage = getObjectCell_(row, ['보관 위치', '보관위치', '보관 장소']) || '미지정';
    const qrState = getObjectCell_(row, ['QR 생성 여부', 'QR 출력 여부']);

    if (!map[managementId]) {
      map[managementId] = {
        managementId,
        boxCount: 0,
        currentQuantity: 0,
        qrGeneratedCount: 0,
        statusCounts: {},
        storageCounts: {},
        boxes: []
      };
    }

    if (isActiveBox) {
      map[managementId].boxCount += 1;
      map[managementId].currentQuantity += currentQuantity;
      map[managementId].storageCounts[storage] = (map[managementId].storageCounts[storage] || 0) + 1;
      map[managementId].statusCounts[status] = (map[managementId].statusCounts[status] || 0) + 1;
    }

    if (qrState && qrState !== '-') {
      map[managementId].qrGeneratedCount += 1;
    }

    map[managementId].boxes.push(row);
  });

  Object.keys(map).forEach((managementId) => {
    const summary = map[managementId];
    summary.primaryStorage = pickTopKey_(summary.storageCounts) || '미지정';
    summary.status = pickTopKey_(summary.statusCounts) || '보관';
  });

  return map;
}

function buildInventoryLocationStats_(boxSummaryMap, mode) {
  const totals = {};

  Object.keys(boxSummaryMap).forEach((managementId) => {
    const summary = boxSummaryMap[managementId];

    summary.boxes.forEach((boxRow) => {
      const status = getObjectCell_(boxRow, ['상태', '재고 상태']) || '보관';
      const currentQuantity = displayQuantityToNumber_(getObjectCell_(boxRow, ['현재 수량', '현재수량']));

      if (currentQuantity <= 0 || /출고|폐기/.test(status)) {
        return;
      }

      const storage = getObjectCell_(boxRow, ['보관 위치', '보관위치', '보관 장소']) || '미지정';
      const increment = mode === 'quantity' ? currentQuantity : 1;
      totals[storage] = (totals[storage] || 0) + increment;
    });
  });

  return Object.keys(totals)
    .map((label) => ({
      label,
      value: totals[label]
    }))
    .sort((left, right) => right.value - left.value);
}

function getObjectCell_(row, names) {
  for (let i = 0; i < names.length; i += 1) {
    const value = row[names[i]];

    if (value !== undefined && String(value || '').trim()) {
      return String(value || '').trim();
    }
  }

  return '';
}

function pickTopKey_(counts) {
  return Object.keys(counts || {}).sort((left, right) => counts[right] - counts[left])[0] || '';
}

function uniqueSorted_(values) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).sort();
}

function isUnspecifiedStorage_(value) {
  const normalized = String(value || '').trim();
  return !normalized || normalized === '-' || normalized === '미지정';
}

function getDueStatus_(dueDate, todayKey) {
  const dueKey = normalizeDateKey_(dueDate);

  if (!dueKey || dueKey === '-') {
    return {
      label: '-',
      days: null
    };
  }

  const dueTime = new Date(`${dueKey}T00:00:00+09:00`).getTime();
  const todayTime = new Date(`${todayKey}T00:00:00+09:00`).getTime();

  if (!Number.isFinite(dueTime) || !Number.isFinite(todayTime)) {
    return {
      label: dueDate,
      days: null
    };
  }

  const days = Math.round((dueTime - todayTime) / (24 * 60 * 60 * 1000));

  return {
    label: days === 0 ? '오늘' : `D${days > 0 ? '-' : '+'}${Math.abs(days)}`,
    days
  };
}

function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  return values.slice(1).filter((row) => row.some(Boolean)).map((row) => {
    return headers.reduce((item, header, index) => {
      item[header] = row[index];
      return item;
    }, {});
  });
}

function makeId_(prefix) {
  const date = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMdd');
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `${prefix}-${date}-${random}`;
}

function generateInboundManagementId_(sheet, datePart) {
  const lastRow = sheet.getLastRow();
  const prefix = `IN-${datePart}-`;
  let maxSequence = 0;

  if (lastRow >= 6) {
    const ids = sheet.getRange(6, 4, lastRow - 5, 1).getDisplayValues().flat();
    ids.forEach((value) => {
      const id = String(value || '').trim();

      if (id.startsWith(prefix)) {
        const sequence = Number(id.slice(prefix.length));
        if (!Number.isNaN(sequence)) {
          maxSequence = Math.max(maxSequence, sequence);
        }
      }
    });
  }

  return `${prefix}${String(maxSequence + 1).padStart(3, '0')}`;
}

function toNumber_(value) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const number = Number(normalized || 0);

  if (!Number.isFinite(number)) {
    throw new Error('수량은 숫자로 입력해주세요.');
  }

  return number;
}

function displayQuantityToNumber_(value) {
  const matched = String(value ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return matched ? Number(matched[0]) : 0;
}

function toPositiveNumber_(value, label) {
  const number = toNumber_(value);

  if (number <= 0) {
    throw new Error(`${label}은 1 이상의 숫자로 입력해주세요.`);
  }

  return number;
}

function dash_(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '-';
}

function formatEa_(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')} ea`;
}

function formatBox_(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')} box`;
}

function normalizeDateKey_(value) {
  const normalized = String(value || '').trim();
  const matched = normalized.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);

  if (!matched) {
    return normalized;
  }

  return [
    matched[1],
    String(matched[2]).padStart(2, '0'),
    String(matched[3]).padStart(2, '0')
  ].join('-');
}
