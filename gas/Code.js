const CONFIG = {
  SPREADSHEET_ID: '1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI',
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
      login,
      setupSheets,
      getProducts,
      getTodayInbounds,
      createProduct,
      updateProduct,
      deleteProduct,
      createInbound,
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
  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    checkedAt: new Date().toISOString()
  };
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
        boxQuantity: pickCell_(row, indexes, ['박스당 수량', '박스당수량']),
        trayQuantity: pickCell_(row, indexes, ['트레이 수량', '트레이수량']),
        updatedAt: pickCell_(row, indexes, ['최종 수정일', '수정일']),
        updatedTime: pickCell_(row, indexes, ['최종 수정시간', '수정시간']),
        note: pickCell_(row, indexes, ['비고'])
      };
    });

  return {
    products
  };
}

function createProduct(payload) {
  const required = ['업체명', '제품명', '박스당 수량', '트레이 수량'];
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
  setRowValue_(row, indexes, ['박스당 수량', '박스당수량'], payload['박스당 수량'] || payload['박스당수량'] || '');
  setRowValue_(row, indexes, ['트레이 수량', '트레이수량'], payload['트레이 수량'] || payload['트레이수량'] || '');
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
  const values = stockSheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '입고일', '제품명']);

  if (!headerInfo) {
    return {
      inbounds: []
    };
  }

  const { headers, rowIndex: headerRowIndex } = headerInfo;
  const indexes = indexHeaders_(headers);
  const timezone = 'Asia/Seoul';
  const targetDate = normalizeDateKey_(payload?.date || Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd'));
  const inbounds = values.slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .filter((row) => normalizeDateKey_(pickCell_(row, indexes, ['입고일'])) === targetDate)
    .map((row) => ({
      managementId: pickCell_(row, indexes, ['관리 ID', '관리ID']),
      inboundDate: pickCell_(row, indexes, ['입고일']),
      inboundTime: pickCell_(row, indexes, ['입고 시간', '입고시간']),
      clientName: pickCell_(row, indexes, ['업체명', '거래처명']),
      inboundType: pickCell_(row, indexes, ['입고 유형', '입고유형']),
      productName: pickCell_(row, indexes, ['제품명']),
      batch: pickCell_(row, indexes, ['차수']),
      process: pickCell_(row, indexes, ['최종공정', '최종 공정']),
      boxQuantity: pickCell_(row, indexes, ['박스당 수량', '박스당수량']),
      inboundBoxCount: pickCell_(row, indexes, ['입고 박스 수', '입고박스수']),
      remainQuantity: pickCell_(row, indexes, ['잔량 수량', '잔량']),
      inboundTotalQuantity: pickCell_(row, indexes, ['입고 총 수량', '입고총수량']),
      boxTotalCount: pickCell_(row, indexes, ['박스 총 수량', '박스총수량']),
      inspectionQuantity: pickCell_(row, indexes, ['검수 수량', '검수수량']),
      defectQuantity: pickCell_(row, indexes, ['불량 수량', '불량수량']),
      defectRate: pickCell_(row, indexes, ['불량률']),
      registrant: pickCell_(row, indexes, ['등록자'])
    }))
    .reverse();

  return {
    date: targetDate,
    inbounds
  };
}

function updateProduct(payload) {
  const productId = String(payload.productId || payload.productCode || payload['제품 ID'] || payload['제품ID'] || '').trim();
  const required = ['업체명', '제품명', '박스당 수량', '트레이 수량'];

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
      setRowValue_(row, indexes, ['박스당 수량', '박스당수량'], payload['박스당 수량'] || payload['박스당수량'] || '');
      setRowValue_(row, indexes, ['트레이 수량', '트레이수량'], payload['트레이 수량'] || payload['트레이수량'] || '');
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

  required.forEach(([key, label]) => {
    if (!String(payload[key] || '').trim()) {
      throw new Error(`${label} 값이 필요합니다.`);
    }
  });

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
    const now = new Date();
    const timezone = 'Asia/Seoul';
    const registeredDate = Utilities.formatDate(now, timezone, 'yyyy. M. d');
    const managementDate = Utilities.formatDate(now, timezone, 'yyMMdd');
    const managementId = generateInboundManagementId_(stockSheet, managementDate);
    const totalBoxCount = inboundBoxCount + (remainQuantity > 0 ? 1 : 0);
    const totalQuantity = boxQuantity * inboundBoxCount + remainQuantity;
    const defectRate = inspectionQuantity > 0 ? Math.round((defectQuantity / inspectionQuantity) * 100) : 0;
    const note = dash_(payload.note);

    const stockValues = [
      '신규입고',
      '보관',
      managementId,
      dash_(payload.clientName),
      dash_(payload.registrant || 'Admin'),
      registeredDate,
      dash_(payload.inboundDate),
      dash_(payload.inboundTime),
      dash_(payload.inboundType),
      dash_(payload.dueDate),
      dash_(payload.productId),
      dash_(payload.productName),
      dash_(payload.batch),
      dash_(payload.process),
      dash_(payload.storage),
      formatEa_(boxQuantity),
      formatBox_(inboundBoxCount),
      formatEa_(remainQuantity),
      formatBox_(totalBoxCount),
      formatEa_(totalQuantity),
      formatEa_(inspectionQuantity),
      formatEa_(defectQuantity),
      `${defectRate}%`,
      dash_(payload.defectReason),
      note
    ];

    const stockRow = appendStyledRangeRow_(stockSheet, 2, stockValues, 6);
    const boxRows = [];

    for (let index = 1; index <= totalBoxCount; index += 1) {
      const isRemainderBox = remainQuantity > 0 && index === totalBoxCount;
      const currentQuantity = isRemainderBox ? remainQuantity : boxQuantity;
      const boxId = `${managementId}-B${String(index).padStart(3, '0')}`;

      boxRows.push([
        boxId,
        managementId,
        index,
        dash_(payload.productId),
        dash_(payload.productName),
        formatEa_(boxQuantity),
        formatEa_(currentQuantity),
        dash_(payload.storage),
        '보관',
        registeredDate,
        '',
        '',
        '',
        '',
        note
      ]);
    }

    const boxStartRow = appendStyledRangeRows_(boxSheet, 2, boxRows, 6);

    return {
      managementId,
      stockRow,
      boxStartRow,
      boxCount: boxRows.length,
      boxIds: boxRows.map((row) => row[0])
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

function setRowValue_(row, indexes, names, value) {
  const index = findHeaderIndex_(indexes, names);
  if (index >= 0) {
    row[index] = value;
  }
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
