const APP_ENVIRONMENTS = {
  prod: {
    label: 'PRD',
    scriptId: '1Fk0-HC_EFMXUbu-DcKoKXy2jkuFc1_rI7boX838uRjnntaXC7HYjik1U',
    spreadsheetId: '1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI',
    driveRootFolderId: '1iHb4bqT45OHkzvYZR8bfH943i071UdPV',
    defectPhotoRootFolderId: '1iHb4bqT45OHkzvYZR8bfH943i071UdPV'
  },
  dev: {
    label: 'DEV',
    scriptId: '1_hEv8hS-RslSbT4J1hYHMvdHwoHgRvs2vLsNBdXrbyxZFiUgbfT_5c4T',
    spreadsheetId: '1__av_Ww7cuUeVrqPgtDRwGsbI0gmfqppxcULpI4WIhg',
    driveRootFolderId: '1nHvct8X2B7cX9cPHgq7F3A8x8EAlDQo3',
    defectPhotoRootFolderId: '1nHvct8X2B7cX9cPHgq7F3A8x8EAlDQo3'
  }
};

const CONFIG = buildRuntimeConfig_();
const API_READ_CACHE_TTL_SECONDS = 45;
const API_READ_CACHE_MAX_LENGTH = 95000;

function buildRuntimeConfig_() {
  const env = getAppEnvironment_();
  const environment = APP_ENVIRONMENTS[env] || APP_ENVIRONMENTS.prod;

  return {
    ENV: env,
    ENV_LABEL: environment.label,
    SPREADSHEET_ID: environment.spreadsheetId,
    DRIVE_ROOT_FOLDER_ID: environment.driveRootFolderId,
    DEFECT_PHOTO_ROOT_FOLDER_ID: environment.defectPhotoRootFolderId,
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
}

function getAppEnvironment_() {
  try {
    const env = PropertiesService.getScriptProperties().getProperty('APP_ENV');
    const normalized = String(env || '').trim().toLowerCase();
    if (normalized && APP_ENVIRONMENTS[normalized]) {
      return normalized;
    }
  } catch (error) {
    // Ignore property access errors and fall back to script id detection.
  }

  try {
    const scriptId = ScriptApp.getScriptId();
    const matchedEnv = Object.keys(APP_ENVIRONMENTS).find((env) => APP_ENVIRONMENTS[env].scriptId === scriptId);
    return matchedEnv || 'prod';
  } catch (error) {
    return 'prod';
  }
}

function setAppEnvironmentDev() {
  return setAppEnvironment_('dev');
}

function setAppEnvironmentProd() {
  return setAppEnvironment_('prod');
}

function setAppEnvironment_(env) {
  const normalized = String(env || '').trim().toLowerCase();

  if (!APP_ENVIRONMENTS[normalized]) {
    throw new Error(`지원하지 않는 환경입니다: ${env}`);
  }

  PropertiesService.getScriptProperties().setProperty('APP_ENV', normalized);
  return {
    env: normalized,
    label: APP_ENVIRONMENTS[normalized].label,
    spreadsheetId: APP_ENVIRONMENTS[normalized].spreadsheetId
  };
}

function doGet() {
  return jsonResponse({
    ok: true,
    service: 'seungjin-inventory-api',
    env: CONFIG.ENV,
    envLabel: CONFIG.ENV_LABEL,
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
      getProducts: getProductsCached_,
      getTodayInbounds,
      getInventoryDashboard: getInventoryDashboardCached_,
      getInboundBoxQrs,
      uploadShippingDefectPhotos,
      saveShippingInspection,
      updateShippingStatus,
      updateInventoryBoxMove,
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

    const data = routes[action](payload);
    if (isApiMutationAction_(action)) {
      clearApiReadCaches_();
    }

    return jsonResponse({
      ok: true,
      data
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.name || 'ERROR',
      message: error.message
    });
  }
}

function getProductsCached_() {
  return getCachedApiData_('products', getProducts);
}

function getInventoryDashboardCached_() {
  return getCachedApiData_('inventory-dashboard', getInventoryDashboard);
}

function getCachedApiData_(key, loader) {
  const cached = readChunkedApiCache_(key);
  if (cached !== null) {
    return cached;
  }

  const data = loader();
  writeChunkedApiCache_(key, data);
  return data;
}

function getApiCacheKey_(key) {
  return `sj-${CONFIG.ENV}-${key}`;
}

function readChunkedApiCache_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(getApiCacheKey_(key));
    if (!cached) {
      return null;
    }
    const compressed = Utilities.base64Decode(cached);
    const serialized = Utilities.ungzip(Utilities.newBlob(compressed)).getDataAsString('UTF-8');
    return JSON.parse(serialized);
  } catch (error) {
    return null;
  }
}

function writeChunkedApiCache_(key, data) {
  try {
    const cache = CacheService.getScriptCache();
    const serialized = JSON.stringify(data);
    const compressed = Utilities.gzip(Utilities.newBlob(serialized, 'application/json')).getBytes();
    const encoded = Utilities.base64Encode(compressed);
    if (encoded.length > API_READ_CACHE_MAX_LENGTH) {
      return;
    }
    cache.put(getApiCacheKey_(key), encoded, API_READ_CACHE_TTL_SECONDS);
  } catch (error) {
    // Cache failures must not block normal API responses.
  }
}

function clearChunkedApiCache_(key) {
  try {
    CacheService.getScriptCache().remove(getApiCacheKey_(key));
  } catch (error) {
    // Cache cleanup is best effort.
  }
}

function clearApiReadCaches_() {
  clearChunkedApiCache_('products');
  clearChunkedApiCache_('inventory-dashboard');
}

function isApiMutationAction_(action) {
  return [
    'createProduct',
    'updateProduct',
    'deleteProduct',
    'createInbound',
    'updateInbound',
    'deleteInbound',
    'getInboundBoxQrs',
    'saveShippingInspection',
    'updateShippingStatus',
    'updateInventoryBoxMove',
    'formatProductRows'
  ].includes(action);
}

function healthCheck() {
  const ss = getSpreadsheet_();
  const invoiceFolder = DriveApp.getFolderById(CONFIG.DRIVE_ROOT_FOLDER_ID);
  const defectPhotoFolder = DriveApp.getFolderById(CONFIG.DEFECT_PHOTO_ROOT_FOLDER_ID);
  const invoiceDriveWriteCheck = verifyDriveWriteAccess_(invoiceFolder);
  const defectPhotoDriveWriteCheck = verifyDriveWriteAccess_(defectPhotoFolder);

  return {
    env: CONFIG.ENV,
    envLabel: CONFIG.ENV_LABEL,
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
    env: CONFIG.ENV,
    envLabel: CONFIG.ENV_LABEL,
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
      '박가루제거 유무',
      '화염처리 유무',
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
      '출고유형',
      '출고일',
      '출고시간',
      '출고자',
      '검수일',
      '검수시간',
      '검수자',
      '검수수량',
      '불량 수량',
      '불량 사유',
      '불량률',
      '불량 사진',
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
        clientName: normalizeClientName_(pickCell_(row, indexes, ['업체명', '거래처명'])),
        productName: pickCell_(row, indexes, ['제품명']),
        color: pickCell_(row, indexes, ['색상']),
        dustRemovalStatus: pickCell_(row, indexes, ['박가루제거 유무', '박가루 제거 유무']) || '무',
        flameTreatmentStatus: pickCell_(row, indexes, ['화염처리 유무', '화염 처리 유무']) || '무',
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

function getProductProcessInfo_(productId, productName) {
  const targetProductId = String(productId || '').trim();
  const targetProductName = String(productName || '').trim();
  const emptyInfo = { finalProcess: '', dustRemovalStatus: '무', flameTreatmentStatus: '무' };

  if (!targetProductId && !targetProductName) {
    return emptyInfo;
  }

  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['제품 ID', '업체명', '제품명']);

  if (!headerInfo) {
    return emptyInfo;
  }

  const indexes = indexHeaders_(headerInfo.headers);
  let nameMatchedInfo = null;

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const rowProductId = String(pickCell_(row, indexes, ['제품 ID', '제품ID']) || '').trim();
    const rowProductName = String(pickCell_(row, indexes, ['제품명']) || '').trim();
    const processInfo = {
      finalProcess: String(pickCell_(row, indexes, ['최종공정', '최종 공정']) || '').trim(),
      dustRemovalStatus: String(pickCell_(row, indexes, ['박가루제거 유무', '박가루 제거 유무']) || '무').trim(),
      flameTreatmentStatus: String(pickCell_(row, indexes, ['화염처리 유무', '화염 처리 유무']) || '무').trim()
    };

    if (targetProductId && rowProductId === targetProductId) {
      return processInfo;
    }

    if (!nameMatchedInfo && targetProductName && rowProductName === targetProductName) {
      nameMatchedInfo = processInfo;
    }
  }

  return nameMatchedInfo || emptyInfo;
}

function formatProductProcess_(process, productInfo) {
  const baseProcess = String(process || productInfo.finalProcess || '')
    .split('|')[0]
    .trim();
  const labels = [baseProcess];

  if (String(productInfo.flameTreatmentStatus || '').trim() === '유') {
    labels.push('화염처리');
  }

  if (String(productInfo.dustRemovalStatus || '').trim() === '유') {
    labels.push('박가루제거');
  }

  return labels.filter(Boolean).join(' | ');
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
  ensureBoxDbShippingInspectionHeaders_(boxSheet);
  const stockInfo = readDisplayRowsByHeaders_(stockSheet, ['관리 ID', '입고일', '제품명']);
  const boxInfo = readDisplayRowsByHeaders_(boxSheet, ['박스ID', '관리ID', '제품명']);
  const productInfo = readDisplayRowsByHeaders_(productSheet, ['제품 ID', '업체명', '제품명']);
  const productMap = buildInventoryProductMap_(productInfo.rows);
  const boxSummaryMap = buildInventoryBoxSummaryMap_(boxInfo.rows);
  syncStockStatusesFromBoxSummary_(stockSheet, boxSummaryMap);
  const todayKey = normalizeDateKey_(Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'));

  const rows = stockInfo.rows.map((stockRow) => {
    const managementId = getObjectCell_(stockRow, ['관리 ID', '관리ID']);
    const productId = getObjectCell_(stockRow, ['제품ID', '제품 ID']);
    const product = productMap[productId] || {};
    const clientName = normalizeClientName_(getObjectCell_(stockRow, ['업체명', '거래처명']) || product.clientName);
    const productName = getObjectCell_(stockRow, ['제품명']) || product.productName;
    const stockStorage = getObjectCell_(stockRow, ['보관위치', '보관 위치']) || '미지정';
    const boxSummary = boxSummaryMap[getInventoryIdentityKey_(managementId, productId, productName, stockStorage)] || {};
    const hasBoxSummary = Boolean(boxSummary.managementId);
    const dueDate = getObjectCell_(stockRow, ['납기일']) || product.dueDate || '';
    const dueStatus = getDueStatus_(dueDate, todayKey);
    const boxTotalCount = hasBoxSummary ? boxSummary.boxCount : displayQuantityToNumber_(getObjectCell_(stockRow, ['박스 총 수량', '박스총수량']));
    const currentTotalQuantity = hasBoxSummary ? boxSummary.currentQuantity : displayQuantityToNumber_(getObjectCell_(stockRow, ['입고 총 수량', '입고총수량']));
    const rawStockStatus = normalizeStockStatusText_(getObjectCell_(stockRow, ['상태']) || boxSummary.status || '보관');
    const hasPartialShipping = (boxSummary.activeShippingBoxes || []).length > 0
      && (boxSummary.shippedShippingBoxes || []).length > 0;
    const hasOnlyShippedBoxes = hasBoxSummary
      && !(boxSummary.activeShippingBoxes || []).length
      && (boxSummary.shippedShippingBoxes || []).length > 0;
    const stockStatus = hasPartialShipping
      ? '일부 출고'
      : hasOnlyShippedBoxes
        ? '출고완료'
        : rawStockStatus;
    const qrGeneratedCount = boxSummary.qrGeneratedCount || 0;
    const qrPrintStatus = boxTotalCount > 0 && qrGeneratedCount >= boxTotalCount ? 'QR 생성' : '미인쇄';
    const processStatus = stockStatus || '보관';

    return {
      managementId,
      productId,
      clientName,
      productName,
      stockStatus,
      registrant: getObjectCell_(stockRow, ['등록자']),
      registeredAt: getObjectCell_(stockRow, ['등록 일시', '등록일시']),
      inboundDate: getObjectCell_(stockRow, ['입고일']),
      inboundTime: getObjectCell_(stockRow, ['입고 시간', '입고시간']),
      inboundType: getObjectCell_(stockRow, ['입고 유형', '입고유형']),
      batch: getObjectCell_(stockRow, ['차수']),
      finalProcess: getObjectCell_(stockRow, ['최종공정', '최종 공정']),
      storage: boxSummary.primaryStorage || stockStorage,
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
      shippingInspectionCount: boxSummary.shippingInspectionCount || 0,
      shippingInspectionQuantity: boxSummary.shippingInspectionQuantity ? formatEa_(boxSummary.shippingInspectionQuantity) : '',
      shippingDefectQuantity: boxSummary.shippingDefectQuantity ? formatEa_(boxSummary.shippingDefectQuantity) : '',
      shippingDefectRate: boxSummary.shippingDefectRate ? `${formatPercentNumber_(boxSummary.shippingDefectRate)}%` : '',
      shippingDefectReason: boxSummary.shippingDefectReason || '',
      defectPhotoFolderUrl: boxSummary.defectPhotoFolderUrl || '',
      defectPhotoCount: boxSummary.defectPhotoCount || 0,
      shippingInspectionDate: boxSummary.shippingInspectionDate || '',
      shippingDate: boxSummary.shippingDate || getObjectCell_(stockRow, ['출고일']),
      activeShippingBoxes: boxSummary.activeShippingBoxes || [],
      shippedShippingBoxes: boxSummary.shippedShippingBoxes || [],
      note: getObjectCell_(stockRow, ['비고']),
      dueDate,
      dueLabel: dueStatus.label,
      dueDays: dueStatus.days,
      processStatus,
      qrPrintStatus,
      qrGeneratedCount
    };
  }).filter((row) => row.managementId);

  const visibleRows = rows.filter((row) => {
    const status = normalizeStockStatusText_(row.stockStatus);
    const quantity = displayQuantityToNumber_(row.currentTotalQuantity);
    return !status.includes('폐기')
      && (quantity > 0 || ['출고대기', '보류', '일부 출고', '출고완료'].includes(status));
  });
  const activeRows = visibleRows.filter((row) => {
    const status = String(row.stockStatus || '');
    return !status.includes('출고완료') && displayQuantityToNumber_(row.currentTotalQuantity) > 0;
  });
  const locationBoxStats = buildInventoryLocationStats_(boxSummaryMap, 'box');
  const locationQuantityStats = buildInventoryLocationStats_(boxSummaryMap, 'quantity');
  const uniqueProductIds = new Set(visibleRows
    .map((row) => String(row.productId || row.productName || '').trim())
    .filter(Boolean));
  const totalBoxes = activeRows.reduce((sum, row) => sum + displayQuantityToNumber_(row.currentBoxCount), 0);
  const totalQuantity = activeRows.reduce((sum, row) => sum + displayQuantityToNumber_(row.currentTotalQuantity), 0);
  const dueSoonCount = activeRows.filter((row) => Number.isFinite(row.dueDays) && row.dueDays <= 3).length;
  const printWaitingBoxes = activeRows
    .filter((row) => !String(row.processStatus || row.stockStatus || '').includes('작업중'))
    .reduce((sum, row) => sum + displayQuantityToNumber_(row.currentBoxCount), 0);
  const unspecifiedStorageCount = activeRows.filter((row) => isUnspecifiedStorage_(row.storage)).length;
  const holdOrDiscardCount = rows.filter((row) => /보류|폐기/.test(String(row.stockStatus || ''))).length;

  return {
    summary: {
      totalItems: uniqueProductIds.size || visibleRows.length,
      totalBoxes,
      totalQuantity,
      dueSoonCount
    },
    filters: {
      clients: uniqueSorted_(visibleRows.map((row) => row.clientName)),
      storages: uniqueSorted_(visibleRows.map((row) => row.storage)),
      stockStatuses: uniqueSorted_(visibleRows.map((row) => row.stockStatus)),
      processStatuses: uniqueSorted_(visibleRows.map((row) => row.processStatus))
    },
    locationBoxStats,
    locationQuantityStats,
    attention: {
      printWaitingBoxes,
      unspecifiedStorageCount,
      holdOrDiscardCount
    },
    rows: visibleRows.reverse()
  };
}

function getStockStatusFromBoxSummary_(summary) {
  if (!summary || !summary.managementId) {
    return '';
  }

  const shippedCount = Array.isArray(summary.shippedShippingBoxes) ? summary.shippedShippingBoxes.length : 0;
  const activeCount = Array.isArray(summary.activeShippingBoxes) ? summary.activeShippingBoxes.length : 0;

  if (shippedCount > 0 && activeCount > 0) {
    return '일부 출고';
  }

  if (shippedCount > 0 && activeCount === 0) {
    return '출고완료';
  }

  return '';
}

function syncStockStatusesFromBoxSummary_(sheet, boxSummaryMap) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '상태']) || findHeaderRow_(values, ['관리ID', '상태']);

  if (!headerInfo) {
    return 0;
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const statusIndex = findHeaderIndex_(indexes, ['상태']);

  if (statusIndex < 0) {
    return 0;
  }

  let updatedRows = 0;

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const managementId = pickCell_(row, indexes, ['관리 ID', '관리ID']);

    if (!managementId) {
      continue;
    }

    const summaryKey = getRowInventoryIdentityKey_(row, indexes, ['관리 ID', '관리ID']);
    const derivedStatus = getStockStatusFromBoxSummary_(boxSummaryMap[summaryKey]);
    const currentStatus = normalizeStockStatusText_(row[statusIndex]);

    if (derivedStatus && currentStatus !== derivedStatus) {
      sheet.getRange(rowIndex + 1, statusIndex + 1).setValue(derivedStatus);
      updatedRows += 1;
    }
  }

  return updatedRows;
}

function createProduct(payload) {
  const required = ['업체명', '제품명', '최종공정', '박스당 수량', '트레이 수량'];
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
  const clientName = normalizeClientName_(payload['업체명']);
  const productId = payload['제품 ID'] || payload['제품ID'] || makeClientProductId_(clientName, values, indexes);
  const row = new Array(headers.length).fill('');

  setRowValue_(row, indexes, ['등록일'], Utilities.formatDate(now, timezone, 'yyyy.MM.dd'));
  setRowValue_(row, indexes, ['등록시간'], Utilities.formatDate(now, timezone, 'HH:mm'));
  setRowValue_(row, indexes, ['등록자'], payload['등록자'] || 'Admin');
  setRowValue_(row, indexes, ['제품 ID', '제품ID'], productId);
  setRowValue_(row, indexes, ['업체명', '거래처명'], clientName);
  setRowValue_(row, indexes, ['제품명'], payload['제품명']);
  setRowValue_(row, indexes, ['색상'], payload['색상'] || '');
  setRowValue_(row, indexes, ['박가루제거 유무', '박가루 제거 유무'], payload['박가루제거 유무'] || payload['박가루 제거 유무'] || '무');
  setRowValue_(row, indexes, ['화염처리 유무', '화염 처리 유무'], payload['화염처리 유무'] || payload['화염 처리 유무'] || '무');
  setRowValue_(row, indexes, ['사용 여부', '사용여부'], payload['사용 여부'] || payload['사용여부'] || '사용중');
  setRowValue_(row, indexes, ['최종공정', '최종 공정'], payload['최종공정'] || payload['최종 공정'] || '');
  setRowValue_(row, indexes, ['발주량', '주문량'], payload['발주량'] || payload['주문량'] || '');
  setRowValue_(row, indexes, ['박스당 수량', '박스당수량'], payload['박스당 수량'] || payload['박스당수량'] || '');
  setRowValue_(row, indexes, ['트레이 수량', '트레이수량'], payload['트레이 수량'] || payload['트레이수량'] || '');
  setRowValue_(row, indexes, ['납기일'], payload['납기일'] || '');
  setRowValue_(row, indexes, ['최종 수정일', '수정일'], Utilities.formatDate(now, timezone, 'yyyy.MM.dd'));
  setRowValue_(row, indexes, ['최종 수정시간', '수정시간'], Utilities.formatDate(now, timezone, 'HH:mm'));
  setRowValue_(row, indexes, ['비고'], payload['비고'] || '');

  const writeRange = getHeaderWriteRange_(row, headers);
  const targetRowNumber = Math.max(sheet.getLastRow() + 1, headerRowIndex + 2);

  applyProductRowTemplate_(sheet, headerRowIndex + 2, targetRowNumber, headers.length);
  sheet.getRange(targetRowNumber, writeRange.startColumn, 1, writeRange.row.length)
    .setValues([fillBlankCells_(writeRange.row, writeRange.headers)]);
  clearLeadingBlankHeaderCells_(sheet, targetRowNumber, headers);

  return {
    productId
  };
}

function getTodayInbounds(payload) {
  const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
  const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
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
  const boxInfo = readDisplayRowsByHeaders_(boxSheet, ['박스ID', '관리ID', '제품명']);
  const boxSummaryMap = buildInventoryBoxSummaryMap_(boxInfo.rows);
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
    .filter(({ row }) => !isExistingStockInboundType_(pickCell_(row, indexes, ['입고 유형', '입고유형'])))
    .map(({ row, richRow }) => {
      const productId = pickCell_(row, indexes, ['제품ID', '제품 ID']);

      const managementId = pickCell_(row, indexes, ['관리 ID', '관리ID']);
      const productName = pickCell_(row, indexes, ['제품명']);
      const storage = pickCell_(row, indexes, ['보관위치', '보관 위치']) || '미지정';
      const boxSummary = boxSummaryMap[getInventoryIdentityKey_(managementId, productId, productName, storage)] || {};
      const boxTotalCount = displayQuantityToNumber_(pickCell_(row, indexes, ['박스 총 수량', '박스총수량']));
      const qrGeneratedCount = boxSummary.qrGeneratedCount || 0;
      const qrPrintStatus = boxTotalCount > 0 && qrGeneratedCount >= boxTotalCount ? 'QR 생성' : '미인쇄';

      return {
        managementId,
        status: pickCell_(row, indexes, ['상태']),
        registeredAt: pickCell_(row, indexes, ['등록 일시', '등록일시']),
        inboundDate: pickCell_(row, indexes, ['입고일']),
        inboundTime: pickCell_(row, indexes, ['입고 시간', '입고시간']),
        dueDate: pickCell_(row, indexes, ['납기일']) || productDueDateMap[productId] || '',
        clientName: normalizeClientName_(pickCell_(row, indexes, ['업체명', '거래처명'])),
        inboundType: pickCell_(row, indexes, ['입고 유형', '입고유형']),
        productId,
        productName,
        batch: pickCell_(row, indexes, ['차수']),
        process: pickCell_(row, indexes, ['최종공정', '최종 공정']),
        storage: pickCell_(row, indexes, ['보관위치', '보관 위치']),
        boxQuantity: pickCell_(row, indexes, ['박스당 수량', '박스당수량']),
        inboundBoxCount: pickCell_(row, indexes, ['입고 박스 수', '입고박스수']),
        remainQuantity: pickCell_(row, indexes, ['잔량 수량', '잔량']),
        inboundTotalQuantity: pickCell_(row, indexes, ['입고 총 수량', '입고총수량']),
        boxTotalCount: pickCell_(row, indexes, ['박스 총 수량', '박스총수량']),
        qrPrintStatus,
        qrGeneratedCount,
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
  const productIdFilter = String(payload?.productId || payload?.productCode || payload?.['제품ID'] || payload?.['제품 ID'] || '').trim();

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

    if (productIdFilter) {
      const rowProductId = String(pickCell_(sourceRow, indexes, ['제품ID', '제품 ID']) || '').trim();

      if (rowProductId !== productIdFilter) {
        continue;
      }
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
  const required = ['업체명', '제품명', '최종공정', '박스당 수량', '트레이 수량'];

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

      setRowValue_(row, indexes, ['업체명', '거래처명'], normalizeClientName_(payload['업체명']));
      setRowValue_(row, indexes, ['제품명'], payload['제품명']);
      setRowValue_(row, indexes, ['색상'], payload['색상'] || '');
      setRowValue_(row, indexes, ['최종공정', '최종 공정'], payload['최종공정'] || payload['최종 공정'] || '');
      setRowValue_(row, indexes, ['박가루제거 유무', '박가루 제거 유무'], payload['박가루제거 유무'] || payload['박가루 제거 유무'] || '무');
      setRowValue_(row, indexes, ['화염처리 유무', '화염 처리 유무'], payload['화염처리 유무'] || payload['화염 처리 유무'] || '무');
      setRowValue_(row, indexes, ['사용 여부', '사용여부'], payload['사용 여부'] || payload['사용여부'] || '사용중');
      setRowValue_(row, indexes, ['발주량', '주문량'], payload['발주량'] || payload['주문량'] || '');
      setRowValue_(row, indexes, ['박스당 수량', '박스당수량'], payload['박스당 수량'] || payload['박스당수량'] || '');
      setRowValue_(row, indexes, ['트레이 수량', '트레이수량'], payload['트레이 수량'] || payload['트레이수량'] || '');
      setRowValue_(row, indexes, ['납기일'], payload['납기일'] || '');
      setRowValue_(row, indexes, ['최종 수정일', '수정일'], Utilities.formatDate(now, timezone, 'yyyy.MM.dd'));
      setRowValue_(row, indexes, ['최종 수정시간', '수정시간'], Utilities.formatDate(now, timezone, 'HH:mm'));
      setRowValue_(row, indexes, ['비고'], payload['비고'] || '');

      const writeRange = getHeaderWriteRange_(row, headers);

      sheet.getRange(rowIndex + 1, writeRange.startColumn, 1, writeRange.row.length)
        .setValues([fillBlankCells_(writeRange.row, writeRange.headers)]);
      clearLeadingBlankHeaderCells_(sheet, rowIndex + 1, headers);
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
  const productId = String(payload.productId || payload.productCode || payload['제품ID'] || payload['제품 ID'] || '').trim();

  if (!managementId) {
    throw new Error('삭제할 입고 관리 ID가 필요합니다.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
    const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
    const deletedStockRows = deleteRowsByHeaderValueAndIdentity_(
      stockSheet,
      ['관리 ID', '관리ID'],
      managementId,
      { productId },
      ['관리 ID', '입고일', '제품명']
    );
    const deletedBoxRows = deleteRowsByHeaderValueAndIdentity_(
      boxSheet,
      ['관리ID', '관리 ID'],
      managementId,
      { productId },
      ['박스ID', '관리ID', '제품명']
    );

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

function normalizeInboundCategory_(payload) {
  const rawValues = [
    payload.category,
    payload.entryCategory,
    payload.inboundType
  ];
  const isExistingStock = rawValues.some((value) => (
    String(value || '').replace(/\s/g, '') === '기존재고'
  ));

  return isExistingStock ? '기존재고' : '신규입고';
}

function isExistingStockInboundType_(value) {
  return String(value || '').replace(/\s/g, '') === '기존재고';
}

function createInbound(payload) {
  payload.productId = String(payload.productId || payload.productCode || payload['제품ID'] || payload['제품 ID'] || '').trim();
  payload.productName = String(payload.productName || payload['제품명'] || '').trim();
  payload.clientName = String(payload.clientName || payload['업체명'] || payload['거래처명'] || '').trim();
  const productProcessInfo = getProductProcessInfo_(payload.productId, payload.productName);
  payload.process = formatProductProcess_(
    String(payload.process || payload['최종공정'] || payload['최종 공정'] || '').trim(),
    productProcessInfo
  );
  payload.storage = String(payload.storage || payload.storageLocation || payload['보관위치'] || payload['보관 위치'] || '').trim();

  const category = normalizeInboundCategory_(payload);
  const isExistingStock = category === '기존재고';
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
    const managementId = generateInboundManagementId_(stockSheet, boxSheet, managementDate, payload.productId);
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
  const payloadProductId = String(payload.productId || payload.productCode || payload['제품ID'] || payload['제품 ID'] || '').trim();

  if (!managementId) {
    throw new Error('수정할 입고 관리 ID가 필요합니다.');
  }

  const inboundDate = String(payload.inboundDate || payload['입고일'] || '').trim();
  const inboundTime = String(payload.inboundTime || payload['입고 시간'] || payload['입고시간'] || '').trim();
  const inboundType = String(payload.inboundType || payload['입고 유형'] || payload['입고유형'] || '').trim();
  const productProcessInfo = getProductProcessInfo_(payloadProductId, payload.productName || payload['제품명']);
  const process = formatProductProcess_(
    String(payload.process || payload['최종공정'] || '').trim(),
    productProcessInfo
  );
  const storage = String(payload.storage || payload['보관위치'] || '').trim();
  const stockStatus = String(payload.stockStatus || payload.status || payload['상태'] || payload['재고 상태'] || '보관').trim();
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

  if (!stockStatus) {
    throw new Error('상태 값이 필요합니다.');
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
    const identityData = {
      productId: payloadProductId,
      productName: payload.productName || payload['제품명'],
      clientName: payload.clientName || payload['업체명'] || payload['거래처명']
    };
    const rowInfo = findStockRowForInboundUpdate_(stockSheet, managementId, identityData);

    if (!rowInfo) {
      throw new Error('수정할 입고 내역을 찾을 수 없습니다.');
    }

    const row = rowInfo.rowValues.slice();
    const totalBoxCount = inboundBoxCount + (remainQuantity > 0 ? 1 : 0);
    const totalQuantity = boxQuantity * inboundBoxCount + remainQuantity;
    const defectRate = inspectionQuantity > 0 ? Math.round((defectQuantity / inspectionQuantity) * 100) : 0;
    const productId = dash_(payloadProductId || pickCell_(row, rowInfo.indexes, ['제품ID', '제품 ID']));
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
    setRowValue_(row, rowInfo.indexes, ['제품ID', '제품 ID'], productId);
    setRowValue_(row, rowInfo.indexes, ['차수'], dash_(payload.batch));
    setRowValue_(row, rowInfo.indexes, ['최종공정'], process);
    setRowValue_(row, rowInfo.indexes, ['보관위치'], storage);
    setRowValue_(row, rowInfo.indexes, ['상태', '재고 상태'], stockStatus);
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

    const boxRecords = [];

    for (let index = 1; index <= totalBoxCount; index += 1) {
      const isRemainderBox = remainQuantity > 0 && index === totalBoxCount;
      const currentQuantity = isRemainderBox ? remainQuantity : boxQuantity;
      const boxIdBase = productId && !String(managementId).includes(productId)
        ? `${managementId}-${productId}`
        : managementId;
      const boxId = `${boxIdBase}-B${String(index).padStart(3, '0')}`;

      boxRecords.push({
        boxId,
        managementId,
        sequence: index,
        productId,
        productName,
        boxQuantity: formatEa_(boxQuantity),
        currentQuantity: formatEa_(currentQuantity),
        storage,
        status: stockStatus,
        registeredDate
      });
    }

    const boxSync = syncInboundBoxManagementRows_(boxSheet, managementId, boxRecords);

    return {
      managementId,
      updated: true,
      stockRow: rowInfo.rowNumber,
      boxStartRow: boxSync.firstRowNumber,
      boxCount: boxRecords.length,
      boxIds: boxRecords.map((record) => record.boxId),
      boxUpdatedRows: boxSync.updatedRows,
      boxDeletedRows: boxSync.deletedRows,
      boxInsertedRows: boxSync.insertedRows
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

  const targetStartRow = Math.max(sheet.getLastRow() + 1, templateRowNumber);
  const columnCount = rows[0].length;
  const templateRange = sheet.getRange(templateRowNumber, startColumn, 1, columnCount);
  const targetRange = sheet.getRange(targetStartRow, startColumn, rows.length, columnCount);
  const targetEndRow = targetStartRow + rows.length - 1;

  templateRange.copyFormatToRange(
    sheet.getSheetId(),
    startColumn,
    startColumn + columnCount - 1,
    targetStartRow,
    targetEndRow
  );
  const templateValidations = templateRange.getDataValidations()[0];
  targetRange.setDataValidations(rows.map(() => templateValidations.slice()));
  sheet.setRowHeights(targetStartRow, rows.length, sheet.getRowHeight(templateRowNumber));
  targetRange.setValues(rows);
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

function ensureBoxDbShippingInspectionHeaders_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['박스ID', '관리ID', '제품명']);

  if (!headerInfo) {
    return;
  }

  const requiredHeaders = ['불량 수량', '불량 사유', '불량 사진'];
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

function syncInboundBoxManagementRows_(sheet, managementId, boxRecords) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['박스ID', '관리ID', '제품명']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const managementIdIndex = findHeaderIndex_(indexes, ['관리ID', '관리 ID']);

  if (managementIdIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 컬럼을 찾을 수 없습니다.`);
  }

  const identityRows = [];
  const managementRows = [];
  const identityData = boxRecords.length
    ? {
      productId: boxRecords[0].productId,
      productName: boxRecords[0].productName
    }
    : {};

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const rowManagementId = String(values[rowIndex][managementIdIndex] || '').trim();

    if (rowManagementId !== managementId) {
      continue;
    }

    const rowInfo = {
      rowNumber: rowIndex + 1,
      rowValues: values[rowIndex],
      sequence: getBoxSequenceFromRow_(values[rowIndex], indexes)
    };

    managementRows.push(rowInfo);

    if (isMatchingInventoryRow_(values[rowIndex], indexes, ['관리ID', '관리 ID'], managementId, identityData)) {
      identityRows.push(rowInfo);
    }
  }

  const existingRows = identityRows.length ? identityRows : managementRows;
  const targetSequenceSet = new Set(boxRecords.map((record) => Number(record.sequence)));
  const rowsBySequence = new Map();
  const extraRows = [];

  existingRows.forEach((rowInfo) => {
    if (
      Number.isFinite(rowInfo.sequence)
      && targetSequenceSet.has(rowInfo.sequence)
      && !rowsBySequence.has(rowInfo.sequence)
    ) {
      rowsBySequence.set(rowInfo.sequence, rowInfo);
      return;
    }

    extraRows.push(rowInfo);
  });

  let updatedRows = 0;
  let retiredRows = 0;
  const recordsToAppend = [];

  boxRecords.forEach((record) => {
    const existingRow = rowsBySequence.get(Number(record.sequence));

    if (!existingRow) {
      recordsToAppend.push(record);
      return;
    }

    updatedRows += updateInboundBoxRowCells_(sheet, existingRow.rowNumber, existingRow.rowValues, indexes, record);
  });

  extraRows.forEach((rowInfo) => {
    retiredRows += retireInboundBoxRow_(sheet, rowInfo.rowNumber, rowInfo.rowValues, indexes);
  });

  const appendedStartRow = appendBoxManagementRows_(sheet, recordsToAppend);
  const firstExistingRow = existingRows.length
    ? Math.min.apply(null, existingRows.map((rowInfo) => rowInfo.rowNumber))
    : 0;

  return {
    firstRowNumber: firstExistingRow || appendedStartRow || 0,
    updatedRows,
    deletedRows: 0,
    retiredRows,
    insertedRows: recordsToAppend.length
  };
}

function getBoxSequenceFromRow_(row, indexes) {
  const sequence = displayQuantityToNumber_(pickCell_(row, indexes, ['박스순번', '박스 순번', '박스 번호']));

  return Number.isFinite(sequence) && sequence > 0 ? sequence : 0;
}

function isMutableInboundBoxRow_(row, indexes) {
  const status = normalizeHeaderValue_(pickCell_(row, indexes, ['상태', '재고 상태']));

  if (status && status !== '-' && status !== '보관') {
    return false;
  }

  const historyHeaders = [
    'QR 생성 여부',
    'QR 출력 여부',
    'QR 생성 일시',
    'QR 데이터',
    '작업자',
    '출고유형',
    '출고 유형',
    '출고일',
    '출고시간',
    '출고자',
    '출고 검수일',
    '출고검수일',
    '출고 검수시간',
    '출고검수시간',
    '출고 검수자',
    '출고검수자',
    '출고 검수 수량',
    '출고검수수량',
    '검수일',
    '검수시간',
    '검수자',
    '검수수량',
    '불량률',
    '불량 수량',
    '불량수량',
    '불량 사유',
    '불량사유',
    '불량 사진',
    '불량사진'
  ];

  return !historyHeaders.some((header) => {
    const value = normalizeHeaderValue_(pickCell_(row, indexes, [header]));
    return value && value !== '-';
  });
}

function hasBoxQrHistory_(row, indexes) {
  return [
    'QR 생성 여부',
    'QR 출력 여부',
    'QR 생성 일시',
    'QR 데이터'
  ].some((header) => {
    const value = normalizeHeaderValue_(pickCell_(row, indexes, [header]));
    return value && value !== '-';
  });
}

function hasBoxOperationalHistory_(row, indexes) {
  const status = normalizeHeaderValue_(pickCell_(row, indexes, ['상태', '재고 상태']));

  if (status && !['-', '보관', '폐기'].includes(status)) {
    return true;
  }

  return [
    '작업자',
    '출고유형',
    '출고 유형',
    '출고일',
    '출고시간',
    '출고자',
    '출고 검수일',
    '출고검수일',
    '출고 검수시간',
    '출고검수시간',
    '출고 검수자',
    '출고검수자',
    '출고 검수 수량',
    '출고검수수량',
    '검수일',
    '검수시간',
    '검수자',
    '검수수량',
    '불량률',
    '불량 수량',
    '불량수량',
    '불량 사유',
    '불량사유',
    '불량 사진',
    '불량사진'
  ].some((header) => {
    const value = normalizeHeaderValue_(pickCell_(row, indexes, [header]));
    return value && value !== '-';
  });
}

function retireInboundBoxRow_(sheet, rowNumber, row, indexes) {
  if (hasBoxOperationalHistory_(row, indexes)) {
    return 0;
  }

  const changes = [
    [['현재 수량', '현재수량'], formatEa_(0)],
    [['상태', '재고 상태'], '폐기'],
    [['비고'], '재고 수정으로 제외']
  ];
  const updatedRow = row.slice();
  let updated = 0;

  changes.forEach(([headers, value]) => {
    const index = findHeaderIndex_(indexes, headers);

    if (index < 0 || String(row[index] ?? '') === String(value ?? '')) {
      return;
    }

    updatedRow[index] = value;
    updated += 1;
  });

  if (updated) {
    sheet.getRange(rowNumber, 1, 1, updatedRow.length).setValues([updatedRow]);
  }
  return updated ? 1 : 0;
}

function normalizeHeaderValue_(value) {
  return String(value || '').trim();
}

function updateInboundBoxRowCells_(sheet, rowNumber, row, indexes, record) {
  const hasQrHistory = hasBoxQrHistory_(row, indexes);
  const hasOperationalHistory = hasBoxOperationalHistory_(row, indexes);
  const changes = [
    [['관리ID', '관리 ID'], record.managementId],
    [['박스순번', '박스 순번', '박스 번호'], record.sequence],
    [['제품ID', '제품 ID'], record.productId],
    [['제품명'], record.productName],
    [['보관 위치', '보관위치', '보관 장소'], record.storage]
  ];

  if (!hasQrHistory) {
    changes.unshift([['박스ID'], record.boxId]);
  }

  if (!hasOperationalHistory) {
    changes.push(
      [['박스당 수량', '박스당수량'], record.boxQuantity],
      [['현재 수량', '현재수량'], record.currentQuantity],
      [['상태', '재고 상태'], record.status || '보관'],
      [['등록 일시', '등록일시'], record.registeredDate]
    );
  }

  const updatedRow = row.slice();
  let updated = 0;

  changes.forEach(([headers, value]) => {
    const index = findHeaderIndex_(indexes, headers);

    if (index < 0) {
      return;
    }

    const normalizedValue = String(value ?? '');
    if (String(row[index] ?? '') === normalizedValue) {
      return;
    }

    updatedRow[index] = value;
    updated += 1;
  });

  if (updated) {
    sheet.getRange(rowNumber, 1, 1, updatedRow.length).setValues([updatedRow]);
  }
  return updated ? 1 : 0;
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

function deleteRowsByHeaderValueAndIdentity_(sheet, headerNames, targetValue, identityData, requiredHeaders) {
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
    const row = values[rowIndex];
    const value = String(row[targetIndex] || '').trim();

    if (value === targetValue && isMatchingInventoryRow_(row, indexes, headerNames, targetValue, identityData || {})) {
      rowNumbers.push(rowIndex + 1);
    }
  }

  rowNumbers.reverse().forEach((rowNumber) => {
    sheet.deleteRow(rowNumber);
  });

  return rowNumbers.length;
}

function findRowByHeaderValueAndIdentity_(sheet, headerNames, targetValue, identityData, requiredHeaders) {
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

  const matches = [];

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const value = String(row[targetIndex] || '').trim();

    if (value !== targetValue) {
      continue;
    }

    matches.push({
      rowNumber: rowIndex + 1,
      rowValues: row,
      richRowValues: richValues[rowIndex] || [],
      headerRowIndex: headerInfo.rowIndex,
      headers: headerInfo.headers,
      indexes
    });
  }

  if (!matches.length) {
    return null;
  }

  const identityMatches = matches.filter((match) => (
    isMatchingInventoryRow_(match.rowValues, indexes, headerNames, targetValue, identityData || {})
  ));

  if (identityMatches.length) {
    return identityMatches[0];
  }

  return matches.length === 1 ? matches[0] : null;
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

function findStockRowForInboundUpdate_(sheet, managementId, data = {}) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getDisplayValues();
  const richValues = dataRange.getRichTextValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '입고일', '제품명'])
    || findHeaderRow_(values, ['관리ID', '입고일', '제품명']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const managementIndex = findHeaderIndex_(indexes, ['관리 ID', '관리ID']);

  if (managementIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 컬럼을 찾을 수 없습니다.`);
  }

  const candidates = [];

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const rowManagementId = String(values[rowIndex][managementIndex] || '').trim();

    if (rowManagementId !== managementId) {
      continue;
    }

    candidates.push({
      rowNumber: rowIndex + 1,
      rowValues: values[rowIndex],
      richRowValues: richValues[rowIndex] || [],
      headerRowIndex: headerInfo.rowIndex,
      headers: headerInfo.headers,
      indexes
    });
  }

  if (!candidates.length) {
    return null;
  }

  const identityMatches = candidates.filter((candidate) => (
    isMatchingInventoryRow_(candidate.rowValues, indexes, ['관리 ID', '관리ID'], managementId, data)
  ));

  if (identityMatches.length) {
    return identityMatches[0];
  }

  return candidates.length === 1 ? candidates[0] : null;
}

function fillBlankCells_(row, headers = []) {
  return row.map((value, index) => {
    if (!String(headers[index] || '').trim()) {
      return '';
    }
    return String(value || '').trim() ? value : '-';
  });
}

function getFirstFilledHeaderIndex_(headers = []) {
  const headerIndex = headers.findIndex((header) => String(header || '').trim());
  return headerIndex >= 0 ? headerIndex : 0;
}

function getHeaderWriteRange_(row, headers = []) {
  const firstHeaderIndex = getFirstFilledHeaderIndex_(headers);

  return {
    startColumn: firstHeaderIndex + 1,
    row: row.slice(firstHeaderIndex),
    headers: headers.slice(firstHeaderIndex)
  };
}

function clearLeadingBlankHeaderCells_(sheet, rowNumber, headers = []) {
  const firstHeaderIndex = getFirstFilledHeaderIndex_(headers);

  if (firstHeaderIndex > 0) {
    sheet.getRange(rowNumber, 1, 1, firstHeaderIndex).clearContent();
  }
}

function buildBoxQuantityMap_(value) {
  if (!value) {
    return {};
  }

  if (Array.isArray(value)) {
    return value.reduce((map, item) => {
      const number = Number(item?.number ?? item?.boxNumber ?? item?.sequence);
      const quantity = displayQuantityToNumber_(item?.quantity ?? item?.currentQuantity ?? item?.value);

      if (Number.isFinite(number) && number > 0 && Number.isFinite(quantity) && quantity >= 0) {
        map[number] = quantity;
      }
      return map;
    }, {});
  }

  if (typeof value === 'object') {
    return Object.keys(value).reduce((map, key) => {
      const number = Number(key);
      const quantity = displayQuantityToNumber_(value[key]);

      if (Number.isFinite(number) && number > 0 && Number.isFinite(quantity) && quantity >= 0) {
        map[number] = quantity;
      }
      return map;
    }, {});
  }

  return {};
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

function uploadShippingDefectPhotos(payload) {
  const files = Array.isArray(payload.defectFiles) ? payload.defectFiles : [];

  if (!files.length) {
    return {
      folderUrl: '',
      uploadedCount: 0,
      fileUrls: []
    };
  }

  const productName = dash_(payload.productName);
  const clientName = dash_(payload.clientName);
  const dateFolderName = sanitizeDriveName_(dash_(payload.inspectionDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd')));
  const rootFolder = DriveApp.getFolderById(CONFIG.DRIVE_ROOT_FOLDER_ID);
  const targetFolder = getOrCreateDriveFolderPath_(rootFolder, [
    '불량사진',
    '출고',
    dateFolderName,
    sanitizeDriveName_(clientName),
    sanitizeDriveName_(productName)
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

    createdFile.setDescription(`관리ID: ${dash_(payload.managementId)}, 출고 불량사진 ${index + 1}`);
    return createdFile.getUrl();
  }).filter(Boolean);

  return {
    folderUrl: uploadedUrls.length ? targetFolder.getUrl() : '',
    uploadedCount: uploadedUrls.length,
    fileUrls: uploadedUrls
  };
}

function saveShippingInspection(payload) {
  const managementId = String(payload.managementId || '').trim();

  if (!managementId) {
    throw new Error('관리 ID가 없습니다.');
  }

  const defectReasons = normalizeDefectReasons_(payload.defectReasons);

  if (!defectReasons.length) {
    throw new Error('불량내역을 하나 이상 선택해주세요.');
  }

  const timezone = Session.getScriptTimeZone() || 'Asia/Seoul';
  const now = new Date();
  const inspectionDate = dash_(payload.inspectionDate || Utilities.formatDate(now, timezone, 'yyyy-MM-dd'));
  const inspectionTime = dash_(payload.inspectionTime || Utilities.formatDate(now, timezone, 'HH:mm'));
  const inspector = dash_(payload.inspector || payload.inspectionUser || payload.userName || 'Admin');
  const hasGoodReason = defectReasons.includes('양호');
  const anomalyStatus = hasGoodReason ? '정상' : '이상';
  const holdRequested = payload.holdRequested === true || String(payload.holdRequested || '').toLowerCase() === 'true';
  const discardRequested = payload.discardRequested === true || String(payload.discardRequested || '').toLowerCase() === 'true';

  if (holdRequested && discardRequested) {
    throw new Error('출고 보류와 박스 폐기는 동시에 선택할 수 없습니다.');
  }

  const stockStatus = discardRequested ? '폐기' : holdRequested ? '보류' : '출고대기(검수완료)';
  const inspectionQuantity = toNumber_(payload.inspectionQuantity);
  const defectQuantity = toNumber_(payload.defectQuantity);

  if (inspectionQuantity < 0) {
    throw new Error('검수 수량은 0 이상의 숫자로 입력해주세요.');
  }

  if (defectQuantity < 0) {
    throw new Error('불량 갯수는 0 이상의 숫자로 입력해주세요.');
  }

  const defectRateNumber = inspectionQuantity > 0 ? (defectQuantity / inspectionQuantity) * 100 : 0;
  const defectRate = `${formatPercentNumber_(defectRateNumber)}%`;
  const defectReason = defectReasons.join(', ');
  const defectPhotoFolderUrl = String(payload.defectPhotoFolderUrl || '').trim();
  const memo = String(payload.memo || payload.note || '').trim();

  const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
  const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
  ensureBoxDbShippingInspectionHeaders_(boxSheet);
  const clearShippingWaiting = payload.clearShippingWaiting === true
    || String(payload.clearShippingWaiting || '').toLowerCase() === 'true';
  const boxUpdateResult = updateShippingInspectionBoxRows_(boxSheet, managementId, {
    productId: payload.productId || payload['제품ID'] || payload['제품 ID'],
    productName: payload.productName || payload['제품명'],
    clientName: payload.clientName || payload['업체명'] || payload['거래처명'],
    batch: payload.batch || payload['차수'],
    finalProcess: payload.finalProcess || payload['최종공정'] || payload['최종 공정'],
    storage: payload.storage || payload.storageLocation || payload['보관위치'] || payload['보관 위치'],
    inspectionDate,
    inspectionTime,
    inspector,
    inspectionQuantity: formatEa_(inspectionQuantity),
    defectQuantity: formatEa_(defectQuantity),
    defectRate,
    defectReason,
    defectPhotoFolderUrl,
    defectPhotoCount: toNumber_(payload.defectPhotoCount),
    status: stockStatus,
    clearShippingWaiting,
    selectedBoxes: Array.isArray(payload.selectedBoxes) ? payload.selectedBoxes : [],
    boxQuantities: payload.boxQuantities || payload.selectedBoxQuantities || {},
    note: memo || '-'
  });
  const resolvedStockStatus = boxUpdateResult.remainingShippedRows > 0
    ? boxUpdateResult.remainingActiveRows > 0 ? '일부 출고' : '출고완료'
    : clearShippingWaiting
      ? '보관'
      : discardRequested
        ? boxUpdateResult.remainingActiveRows > 0
          ? boxUpdateResult.remainingStatusCounts['출고대기'] || boxUpdateResult.remainingStatusCounts['출고대기(검수완료)'] || boxUpdateResult.remainingStatusCounts['검수완료']
            ? '출고대기'
            : boxUpdateResult.remainingStatusCounts['보류']
              ? '보류'
              : '보관'
          : '폐기'
        : stockStatus;
  const updatedStockRows = updateStockStatusRows_(stockSheet, managementId, resolvedStockStatus, payload);

  return {
    managementId,
    inspectionStatus: '검수 완료',
    anomalyStatus,
    stockStatus: resolvedStockStatus,
    updatedBoxRows: boxUpdateResult.updatedRows,
    updatedStockRows,
    defectPhotoFolderUrl,
    defectPhotoCount: toNumber_(payload.defectPhotoCount),
    defectQuantity,
    defectRate: defectRateNumber,
    defectReason,
    inspectionQuantity,
    inspectionDate,
    inspectionTime
  };
}

function normalizeDefectReasons_(value) {
  if (Array.isArray(value)) {
    return value.map((reason) => String(reason || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((reason) => reason.trim())
    .filter(Boolean);
}

function normalizeStockStatusText_(value) {
  const normalized = String(value || '').trim();

  if (!normalized || normalized === '-') {
    return '보관';
  }

  const compact = normalized.replace(/\s+/g, '');
  const aliases = {
    '검수완료': '출고대기',
    '출고대기': '출고대기',
    '출고대기(검수완료)': '출고대기',
    '출고완료': '출고완료',
    '일부출고': '일부 출고',
    '출고보류': '보류'
  };

  return aliases[compact] || normalized;
}

function normalizeClientName_(value) {
  const normalized = String(value || '').trim();
  const aliases = {
    '필림텍': '필립텍'
  };

  return aliases[normalized] || normalized;
}

function normalizeInventoryIdentityPart_(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function getInventoryIdentityKey_(managementId, productId, productName, storage) {
  const id = String(managementId || '').trim();
  const productIdKey = normalizeInventoryIdentityPart_(productId);
  const productNameKey = normalizeInventoryIdentityPart_(productName);
  const storageKey = normalizeInventoryIdentityPart_(storage);

  if (productIdKey) {
    return `${id}|pid:${productIdKey}|storage:${storageKey}`;
  }

  return `${id}|pname:${productNameKey}|storage:${storageKey}`;
}

function getRowInventoryIdentityKey_(row, indexes, managementIdNames) {
  return getInventoryIdentityKey_(
    pickCell_(row, indexes, managementIdNames),
    pickCell_(row, indexes, ['제품ID', '제품 ID']),
    pickCell_(row, indexes, ['제품명']),
    pickCell_(row, indexes, ['보관위치', '보관 위치', '보관 장소'])
  );
}

function isMatchingInventoryRow_(row, indexes, managementIdNames, managementId, data) {
  if (String(pickCell_(row, indexes, managementIdNames) || '').trim() !== managementId) {
    return false;
  }

  const productId = normalizeInventoryIdentityPart_(data.productId || data['제품ID'] || data['제품 ID']);
  const productName = normalizeInventoryIdentityPart_(data.productName || data['제품명']);
  const storage = normalizeInventoryIdentityPart_(data.storage || data.storageLocation || data['보관위치'] || data['보관 위치'] || data['보관 장소']);
  const clientName = normalizeInventoryIdentityPart_(data.clientName || data['업체명'] || data['거래처명']);
  const batch = normalizeInventoryIdentityPart_(data.batch || data['차수']);
  const finalProcess = normalizeInventoryIdentityPart_(data.finalProcess || data['최종공정'] || data['최종 공정']);

  if (!productId && !productName && !storage && !clientName && !batch && !finalProcess) {
    return true;
  }

  const rowProductId = normalizeInventoryIdentityPart_(pickCell_(row, indexes, ['제품ID', '제품 ID']));
  const rowProductName = normalizeInventoryIdentityPart_(pickCell_(row, indexes, ['제품명']));
  const rowStorage = normalizeInventoryIdentityPart_(pickCell_(row, indexes, ['보관위치', '보관 위치', '보관 장소']));
  const rowClientName = normalizeInventoryIdentityPart_(pickCell_(row, indexes, ['업체명', '거래처명']));
  const rowBatch = normalizeInventoryIdentityPart_(pickCell_(row, indexes, ['차수']));
  const rowFinalProcess = normalizeInventoryIdentityPart_(pickCell_(row, indexes, ['최종공정', '최종 공정']));

  if (data.ignoreStorage !== true && storage && rowStorage && rowStorage !== storage) {
    return false;
  }

  if (clientName && rowClientName && rowClientName !== clientName) {
    return false;
  }

  if (batch && rowBatch && rowBatch !== batch) {
    return false;
  }

  if (finalProcess && rowFinalProcess && rowFinalProcess !== finalProcess) {
    return false;
  }

  if (productId && rowProductId) {
    return rowProductId === productId;
  }

  if (productName && rowProductName) {
    return rowProductName === productName;
  }

  return false;
}

function updateShippingInspectionBoxRows_(sheet, managementId, data) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리ID', '제품명']) || findHeaderRow_(values, ['관리 ID', '제품명']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const managementIndex = findHeaderIndex_(indexes, ['관리ID', '관리 ID']);
  const statusIndex = findHeaderIndex_(indexes, ['상태', '재고 상태']);
  const currentQuantityIndex = findHeaderIndex_(indexes, ['현재 수량', '현재수량']);
  const sequenceIndex = findHeaderIndex_(indexes, ['박스순번', '박스 순번', '박스 번호']);
  const selectedBoxNumbers = new Set(
    (data.selectedBoxes || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  );
  const selectedBoxQuantityMap = buildBoxQuantityMap_(data.boxQuantities || data.selectedBoxQuantities);
  const requiresSelectedBoxes = ['출고대기', '출고대기(검수완료)', '검수완료', '출고완료', '폐기'].includes(data.status);
  const clearShippingWaiting = data.clearShippingWaiting === true;

  if (managementIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 컬럼을 찾을 수 없습니다.`);
  }

  if (requiresSelectedBoxes && !selectedBoxNumbers.size && !clearShippingWaiting) {
    throw new Error('처리할 박스가 없습니다. 박스관리 DB의 박스별 상태를 확인해주세요.');
  }

  let updatedRows = 0;
  let matchedBoxNumber = 0;
  let wroteInspectionMetric = false;

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex].slice(0, headerInfo.headers.length);
    if (!isMatchingInventoryRow_(row, indexes, ['관리ID', '관리 ID'], managementId, data)) {
      continue;
    }

    matchedBoxNumber += 1;
    const sequence = sequenceIndex >= 0 ? displayQuantityToNumber_(row[sequenceIndex]) : matchedBoxNumber;
    const currentStatus = statusIndex >= 0 ? normalizeStockStatusText_(row[statusIndex]) : '보관';
    if (clearShippingWaiting || (selectedBoxNumbers.size && !selectedBoxNumbers.has(sequence))) {
      if (['출고대기', '보류'].includes(currentStatus)) {
        setRowValue_(row, indexes, ['출고 검수일', '검수일'], '-');
        setRowValue_(row, indexes, ['출고 검수시간', '검수시간'], '-');
        setRowValue_(row, indexes, ['출고 검수자', '검수자'], '-');
        setRowValue_(row, indexes, ['출고 검수 수량', '출고검수수량', '검수수량'], '-');
        setRowValue_(row, indexes, ['불량 수량', '불량수량'], '-');
        setRowValue_(row, indexes, ['불량 사유', '불량사유', '불량내역'], '-');
        setRowValue_(row, indexes, ['불량률'], '-');
        setRowValue_(row, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL'], '-');
        setRowValue_(row, indexes, ['상태', '재고 상태'], '보관');
        sheet.getRange(rowIndex + 1, 1, 1, headerInfo.headers.length).setValues([row]);
        values[rowIndex] = row;
        updatedRows += 1;
      }
      continue;
    }

    const changedQuantity = selectedBoxQuantityMap[sequence];
    if (currentQuantityIndex >= 0) {
      if (data.status === '폐기') {
        row[currentQuantityIndex] = formatEa_(0);
      } else if (Number.isFinite(changedQuantity) && changedQuantity >= 0) {
        row[currentQuantityIndex] = formatEa_(changedQuantity);
      }
    }

    const currentQuantity = Number.isFinite(changedQuantity) && changedQuantity >= 0
      ? formatEa_(changedQuantity)
      : currentQuantityIndex >= 0 ? dash_(row[currentQuantityIndex]) : '-';
    const inspectionQuantity = !wroteInspectionMetric ? (data.inspectionQuantity || currentQuantity) : '';
    const defectQuantity = !wroteInspectionMetric ? data.defectQuantity : '';
    const defectRate = !wroteInspectionMetric ? data.defectRate : '';

    setRowValue_(row, indexes, ['출고 검수일', '검수일'], data.inspectionDate);
    setRowValue_(row, indexes, ['출고 검수시간', '검수시간'], data.inspectionTime);
    setRowValue_(row, indexes, ['출고 검수자', '검수자'], data.inspector);
    setRowValue_(row, indexes, ['출고 검수 수량', '출고검수수량', '검수수량'], inspectionQuantity);
    setRowValue_(row, indexes, ['불량 수량', '불량수량'], defectQuantity);
    setRowValue_(row, indexes, ['불량 사유', '불량사유', '불량내역'], data.defectReason);
    setRowValue_(row, indexes, ['불량률'], defectRate);
    setRowValue_(row, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL'], data.defectPhotoFolderUrl || '-');
    setRowValue_(row, indexes, ['상태', '재고 상태'], data.status);
    setRowValue_(row, indexes, ['비고'], data.note);
    sheet.getRange(rowIndex + 1, 1, 1, headerInfo.headers.length).setValues([row]);
    values[rowIndex] = row;
    updatedRows += 1;
    wroteInspectionMetric = true;
  }

  if (!updatedRows) {
    throw new Error(`박스관리 DB에서 관리 ID ${managementId}를 찾을 수 없습니다.`);
  }

  const statusSummary = summarizeShippingInspectionBoxRows_(sheet, managementId, data, values, headerInfo);
  return {
    updatedRows,
    remainingActiveRows: statusSummary.remainingActiveRows,
    remainingShippedRows: statusSummary.remainingShippedRows,
    remainingStatusCounts: statusSummary.remainingStatusCounts
  };
}

function summarizeShippingInspectionBoxRows_(sheet, managementId, data, sourceValues, sourceHeaderInfo) {
  const values = sourceValues || sheet.getDataRange().getDisplayValues();
  const headerInfo = sourceHeaderInfo
    || findHeaderRow_(values, ['관리ID', '제품명'])
    || findHeaderRow_(values, ['관리 ID', '제품명']);

  if (!headerInfo) {
    return { remainingActiveRows: 0, remainingShippedRows: 0, remainingStatusCounts: {} };
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const statusIndex = findHeaderIndex_(indexes, ['상태', '재고 상태']);
  const quantityIndex = findHeaderIndex_(indexes, ['현재 수량', '현재수량']);
  let remainingActiveRows = 0;
  let remainingShippedRows = 0;
  const remainingStatusCounts = {};

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (!isMatchingInventoryRow_(row, indexes, ['관리ID', '관리 ID'], managementId, data)) {
      continue;
    }

    const status = statusIndex >= 0 ? normalizeStockStatusText_(row[statusIndex]) : '보관';
    const quantity = quantityIndex >= 0 ? displayQuantityToNumber_(row[quantityIndex]) : 0;
    if (/출고완료/.test(status)) {
      remainingShippedRows += 1;
    } else if (!/폐기/.test(status) && (quantity > 0 || ['출고대기', '검수완료', '보류'].includes(status))) {
      remainingActiveRows += 1;
      remainingStatusCounts[status] = (remainingStatusCounts[status] || 0) + 1;
    }
  }

  return { remainingActiveRows, remainingShippedRows, remainingStatusCounts };
}

function updateShippingStatus(payload) {
  const managementId = String(payload.managementId || '').trim();
  const status = String(payload.status || '').trim();
  const allowedStatuses = ['보관', '검수완료', '보류', '출고대기', '출고대기(검수완료)', '출고완료'];

  if (!managementId) {
    throw new Error('관리 ID가 없습니다.');
  }

  if (!allowedStatuses.includes(status)) {
    throw new Error('변경할 수 없는 출고 상태입니다.');
  }

  const timezone = Session.getScriptTimeZone() || 'Asia/Seoul';
  const now = new Date();
  const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
  const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
  const shippingDate = dash_(payload.shippingDate || Utilities.formatDate(now, timezone, 'yyyy-MM-dd'));
  const shippingTime = dash_(payload.shippingTime || Utilities.formatDate(now, timezone, 'HH:mm'));
  const shippingType = dash_(payload.shippingType || payload['출고유형'] || payload['출고 유형'] || '정상출고');
  const shipper = dash_(payload.shipper || payload.userName || 'Admin');
  const autoShippingInspection = payload.autoShippingInspection === true || String(payload.autoShippingInspection || '').toLowerCase() === 'true';
  const inspectionDate = dash_(payload.inspectionDate || shippingDate);
  const inspectionTime = dash_(payload.inspectionTime || shippingTime);
  const inspector = dash_(payload.inspector || shipper);
  const selectedBoxes = Array.isArray(payload.selectedBoxes) ? payload.selectedBoxes : [];
  const selectedBoxIds = Array.isArray(payload.selectedBoxIds) ? payload.selectedBoxIds : [];
  const boxUpdateResult = updateShippingStatusBoxRows_(boxSheet, managementId, {
    productId: payload.productId || payload['제품ID'] || payload['제품 ID'],
    productName: payload.productName || payload['제품명'],
    clientName: payload.clientName || payload['업체명'] || payload['거래처명'],
    batch: payload.batch || payload['차수'],
    finalProcess: payload.finalProcess || payload['최종공정'] || payload['최종 공정'],
    storage: payload.storage || payload.storageLocation || payload['보관위치'] || payload['보관 위치'],
    status,
    shippingType,
    shippingDate,
    shippingTime,
    shipper,
    selectedBoxes,
    selectedBoxIds,
    allowCancelCompleted: payload.allowCancelCompleted === true || String(payload.allowCancelCompleted || '').toLowerCase() === 'true',
    forceCompleteShipping: payload.forceCompleteShipping === true || String(payload.forceCompleteShipping || '').toLowerCase() === 'true',
    autoShippingInspection,
    inspectionDate,
    inspectionTime,
    inspector,
    inspectionQuantity: payload.inspectionQuantity,
    defectQuantity: payload.defectQuantity,
    defectRate: payload.defectRate || '0%',
    defectReason: payload.defectReason || '양호',
    defectPhotoFolderUrl: payload.defectPhotoFolderUrl || '-',
    ignoreStorage: true
  });
  let finalStatus = status === '출고완료' && boxUpdateResult.remainingActiveRows > 0
    ? '일부 출고'
    : status;
  if (status === '보관') {
    const remainingCounts = boxUpdateResult.remainingStatusCounts || {};
    finalStatus = boxUpdateResult.remainingShippedRows > 0 && boxUpdateResult.remainingActiveRows > 0
      ? '일부 출고'
      : remainingCounts['출고대기'] || remainingCounts['출고대기(검수완료)'] || remainingCounts['검수완료']
        ? '출고대기'
        : remainingCounts['보류']
          ? '보류'
          : '보관';
  }
  const updatedStockRows = updateStockStatusRows_(stockSheet, managementId, finalStatus, {
    ...payload,
    ignoreStorage: true
  });
  SpreadsheetApp.flush();

  return {
    managementId,
    status: finalStatus,
    updatedStockRows,
    updatedBoxRows: boxUpdateResult.updatedRows,
    remainingActiveRows: boxUpdateResult.remainingActiveRows,
    isPartialShipping: status === '출고완료' && finalStatus !== '출고완료',
    shippingDate: status === '출고완료' ? shippingDate : '',
    shippingTime: status === '출고완료' ? shippingTime : ''
  };
}

function updateInventoryBoxMove(payload) {
  const managementId = String(payload.managementId || '').trim();
  const currentStorage = String(payload.currentStorage || payload.storage || payload.storageLocation || payload['보관위치'] || payload['보관 위치'] || '').trim();
  const targetStorage = String(payload.targetStorage || payload.targetStorageLocation || payload['이동 보관위치'] || payload['이동 보관 위치'] || '').trim();
  const selectedBoxes = Array.isArray(payload.selectedBoxes) ? payload.selectedBoxes : [];
  const moveAllBoxes = payload.moveAllBoxes === true || String(payload.moveAllBoxes || '').toLowerCase() === 'true';

  if (!managementId) {
    throw new Error('관리 ID가 없습니다.');
  }

  if (!currentStorage) {
    throw new Error('현재 보관 장소가 없습니다.');
  }

  if (!targetStorage) {
    throw new Error('이동할 보관 장소를 선택해주세요.');
  }

  if (normalizeInventoryIdentityPart_(currentStorage) === normalizeInventoryIdentityPart_(targetStorage)) {
    throw new Error('이동할 장소는 현재 보관 장소와 달라야 합니다.');
  }

  if (!selectedBoxes.length) {
    throw new Error('이동할 박스가 없습니다.');
  }

  const boxSheet = getSheetByNameOrId_(CONFIG.SHEETS.BOX_DB, CONFIG.SHEET_IDS.BOX_DB, '박스관리 DB');
  const stockSheet = getSheetByNameOrId_(CONFIG.SHEETS.STOCK_DB, CONFIG.SHEET_IDS.STOCK_DB, '재고 DB');
  const data = {
    productId: payload.productId || payload['제품ID'] || payload['제품 ID'],
    productName: payload.productName || payload['제품명'],
    clientName: payload.clientName || payload['업체명'] || payload['거래처명'],
    batch: payload.batch || payload['차수'],
    finalProcess: payload.finalProcess || payload['최종공정'] || payload['최종 공정'],
    storage: currentStorage,
    targetStorage,
    status: payload.status || '보관',
    userName: payload.userName || payload.worker || 'Admin',
    selectedBoxes,
    moveAllBoxes
  };
  const boxUpdateResult = updateInventoryBoxMoveRows_(boxSheet, managementId, data);
  const shouldMoveStockRow = moveAllBoxes || boxUpdateResult.remainingSourceActiveRows === 0;
  const updatedStockRows = shouldMoveStockRow
    ? updateInventoryMoveStockRows_(stockSheet, managementId, data)
    : 0;

  SpreadsheetApp.flush();

  return {
    managementId,
    currentStorage,
    targetStorage,
    updatedBoxRows: boxUpdateResult.updatedRows,
    remainingSourceActiveRows: boxUpdateResult.remainingSourceActiveRows,
    updatedStockRows
  };
}

function updateInventoryBoxMoveRows_(sheet, managementId, data) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리ID', '제품명']) || findHeaderRow_(values, ['관리 ID', '제품명']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const managementIndex = findHeaderIndex_(indexes, ['관리ID', '관리 ID']);
  const sequenceIndex = findHeaderIndex_(indexes, ['박스순번', '박스 순번', '박스 번호']);
  const statusIndex = findHeaderIndex_(indexes, ['상태', '재고 상태']);
  const quantityIndex = findHeaderIndex_(indexes, ['현재 수량', '현재수량']);
  const selectedBoxNumbers = new Set(
    (data.selectedBoxes || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  );

  if (managementIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 컬럼을 찾을 수 없습니다.`);
  }

  if (!selectedBoxNumbers.size) {
    throw new Error('이동할 박스 번호가 없습니다.');
  }

  let updatedRows = 0;
  let matchedBoxNumber = 0;
  let remainingSourceActiveRows = 0;

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (!isMatchingInventoryRow_(row, indexes, ['관리ID', '관리 ID'], managementId, data)) {
      continue;
    }

    matchedBoxNumber += 1;
    const sequence = sequenceIndex >= 0 ? displayQuantityToNumber_(row[sequenceIndex]) : matchedBoxNumber;
    const rowStatus = statusIndex >= 0 ? normalizeStockStatusText_(row[statusIndex]) : '보관';
    const currentQuantity = quantityIndex >= 0 ? displayQuantityToNumber_(row[quantityIndex]) : 0;
    const isActive = currentQuantity > 0 && !/출고완료|폐기/.test(rowStatus);
    const isSelectedBox = selectedBoxNumbers.has(sequence);

    if (!isActive) {
      continue;
    }

    if (isSelectedBox) {
      setSheetCellByHeader_(sheet, rowIndex, indexes, ['보관 위치', '보관위치', '보관 장소'], data.targetStorage);
      setSheetCellByHeader_(sheet, rowIndex, indexes, ['상태', '재고 상태'], data.status || '보관');
      setSheetCellByHeader_(sheet, rowIndex, indexes, ['비고', '메모', '참고'], `재고 이동: ${data.storage} → ${data.targetStorage} (${data.userName || 'Admin'})`);
      updatedRows += 1;
      continue;
    }

    remainingSourceActiveRows += 1;
  }

  if (!updatedRows) {
    throw new Error(`박스관리 DB에서 이동할 박스를 찾을 수 없습니다.`);
  }

  return {
    updatedRows,
    remainingSourceActiveRows
  };
}

function updateInventoryMoveStockRows_(sheet, managementId, data = {}) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '상태']) || findHeaderRow_(values, ['관리ID', '상태']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const managementIndex = findHeaderIndex_(indexes, ['관리 ID', '관리ID']);

  if (managementIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 컬럼을 찾을 수 없습니다.`);
  }

  let updatedRows = 0;

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    if (!isMatchingInventoryRow_(values[rowIndex], indexes, ['관리 ID', '관리ID'], managementId, data)) {
      continue;
    }

    setSheetCellByHeader_(sheet, rowIndex, indexes, ['보관위치', '보관 위치', '보관 장소'], data.targetStorage);
    setSheetCellByHeader_(sheet, rowIndex, indexes, ['상태'], data.status || '보관');
    updatedRows += 1;
  }

  return updatedRows;
}

function updateShippingStatusBoxRows_(sheet, managementId, data) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리ID', '제품명']) || findHeaderRow_(values, ['관리 ID', '제품명']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const managementIndex = findHeaderIndex_(indexes, ['관리ID', '관리 ID']);
  const statusIndex = findHeaderIndex_(indexes, ['상태', '재고 상태']);
  const currentQuantityIndex = findHeaderIndex_(indexes, ['현재 수량', '현재수량']);
  const sequenceIndex = findHeaderIndex_(indexes, ['박스순번', '박스 순번', '박스 번호']);
  const boxIdIndex = findHeaderIndex_(indexes, ['박스ID', '박스 ID']);
  const shippingTypeIndex = findShippingTypeHeaderIndex_(indexes);
  const selectedBoxNumbers = new Set(
    (data.selectedBoxes || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  );
  const selectedBoxIds = new Set(
    (data.selectedBoxIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
  const requiresSelectedBoxes = ['보관', '출고대기', '출고대기(검수완료)', '검수완료', '출고완료'].includes(data.status);

  if (managementIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 컬럼을 찾을 수 없습니다.`);
  }

  if (requiresSelectedBoxes && !selectedBoxNumbers.size && !selectedBoxIds.size) {
    throw new Error('처리할 박스가 없습니다. 박스관리 DB의 박스별 상태를 확인해주세요.');
  }

  if (data.status === '출고완료' && shippingTypeIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 출고유형 컬럼을 찾을 수 없습니다.`);
  }

  let updatedRows = 0;
  let remainingActiveRows = 0;
  let remainingShippedRows = 0;
  const remainingStatusCounts = {};
  let matchedBoxNumber = 0;

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex].slice(0, headerInfo.headers.length);
    const rowBoxId = boxIdIndex >= 0 ? String(row[boxIdIndex] || '').trim() : '';
    const isDirectBoxIdMatch = Boolean(rowBoxId && selectedBoxIds.has(rowBoxId));
    const rowManagementId = String(pickCell_(row, indexes, ['관리ID', '관리 ID']) || '').trim();
    const isSameManagementId = rowManagementId === managementId;
    const isIdentityMatch = isMatchingInventoryRow_(row, indexes, ['관리ID', '관리 ID'], managementId, data);
    const canUseBoxIdScope = selectedBoxIds.size > 0 && (isSameManagementId || isDirectBoxIdMatch);

    if (!isIdentityMatch && !canUseBoxIdScope) {
      continue;
    }

    matchedBoxNumber += 1;
    const sequence = sequenceIndex >= 0 ? displayQuantityToNumber_(row[sequenceIndex]) : matchedBoxNumber;
    const rawRowStatus = statusIndex >= 0 ? String(row[statusIndex] || '').trim() : '';
    let rowStatus = statusIndex >= 0 ? normalizeStockStatusText_(row[statusIndex]) : '보관';
    const isAlreadyShipped = /출고완료/.test(rowStatus);
    const isSelectedBox = isDirectBoxIdMatch || selectedBoxNumbers.has(sequence);
    const forceCompleteShipping = data.forceCompleteShipping === true;
    const canCancelCompleted = data.status === '보관'
      && data.allowCancelCompleted === true
      && isSelectedBox
      && isAlreadyShipped;
    const canCompleteShipping = data.status === '출고완료'
      && isSelectedBox
      && (
        forceCompleteShipping
          ? !isAlreadyShipped && !/폐기/.test(rowStatus)
          : isShippingCompletionReadyBoxRow_(row, indexes, rawRowStatus)
      );
    const shouldUpdate = data.status === '출고완료'
      ? canCompleteShipping
      : isSelectedBox && (!isAlreadyShipped || canCancelCompleted);
    const currentQuantity = currentQuantityIndex >= 0 ? displayQuantityToNumber_(row[currentQuantityIndex]) : 0;

    if (shouldUpdate) {
      rowStatus = data.status;
      setRowValue_(row, indexes, ['상태', '재고 상태'], data.status);

      if (data.status === '출고완료') {
        row[shippingTypeIndex] = data.shippingType;
        setRowValue_(row, indexes, ['출고일'], data.shippingDate);
        setRowValue_(row, indexes, ['출고시간'], data.shippingTime);
        setRowValue_(row, indexes, ['출고자'], data.shipper);

        if (data.autoShippingInspection === true) {
          const payloadInspectionQuantity = displayQuantityToNumber_(data.inspectionQuantity);
          const inspectionQuantity = payloadInspectionQuantity > 0
            ? formatEa_(payloadInspectionQuantity)
            : currentQuantity > 0 ? formatEa_(currentQuantity) : '-';
          setRowValue_(row, indexes, ['출고 검수일', '검수일'], data.inspectionDate);
          setRowValue_(row, indexes, ['출고 검수시간', '검수시간'], data.inspectionTime);
          setRowValue_(row, indexes, ['출고 검수자', '검수자'], data.inspector);
          setRowValue_(row, indexes, ['출고 검수 수량', '출고검수수량', '검수수량'], inspectionQuantity);
          setRowValue_(row, indexes, ['불량 수량', '불량수량'], formatEa_(displayQuantityToNumber_(data.defectQuantity)));
          setRowValue_(row, indexes, ['불량 사유', '불량사유', '불량내역'], data.defectReason || '양호');
          setRowValue_(row, indexes, ['불량률'], data.defectRate || '0%');
          setRowValue_(row, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL'], data.defectPhotoFolderUrl || '-');
        }
      } else if (data.status === '검수완료' || data.status === '보관') {
        if (shippingTypeIndex >= 0) {
          row[shippingTypeIndex] = '';
        }
        setRowValue_(row, indexes, ['출고일'], '');
        setRowValue_(row, indexes, ['출고시간'], '');
        setRowValue_(row, indexes, ['출고자'], '');
        if (data.status === '보관') {
          setRowValue_(row, indexes, ['출고 검수일', '검수일'], '');
          setRowValue_(row, indexes, ['출고 검수시간', '검수시간'], '');
          setRowValue_(row, indexes, ['출고 검수자', '검수자'], '');
          setRowValue_(row, indexes, ['출고 검수 수량', '출고검수수량', '검수수량'], '');
          setRowValue_(row, indexes, ['불량 수량', '불량수량'], '');
          setRowValue_(row, indexes, ['불량 사유', '불량사유', '불량내역'], '');
          setRowValue_(row, indexes, ['불량률'], '');
          setRowValue_(row, indexes, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL'], '');
        }
      }

      sheet.getRange(rowIndex + 1, 1, 1, headerInfo.headers.length).setValues([row]);
      updatedRows += 1;
    }

    if (!/출고완료|폐기/.test(rowStatus)
      && (currentQuantity > 0 || ['출고대기', '검수완료', '보류'].includes(rowStatus))) {
      remainingActiveRows += 1;
      const normalizedStatus = rowStatus || '보관';
      remainingStatusCounts[normalizedStatus] = (remainingStatusCounts[normalizedStatus] || 0) + 1;
    }
    if (/출고완료/.test(rowStatus)) {
      remainingShippedRows += 1;
    }
  }

  if (!updatedRows) {
    throw new Error(`박스관리 DB에서 관리 ID ${managementId}를 찾을 수 없습니다.`);
  }

  return {
    updatedRows,
    remainingActiveRows,
    remainingShippedRows,
    remainingStatusCounts
  };
}

function isShippingCompletionReadyBoxRow_(row, indexes, rawStatus) {
  const statusText = String(rawStatus || '').replace(/\s+/g, '');
  const hasShippingReadyStatus = statusText.includes('출고대기');
  const inspectionDate = pickCell_(row, indexes, ['출고 검수일', '검수일']);
  const inspectionTime = pickCell_(row, indexes, ['출고 검수시간', '검수시간']);
  const inspector = pickCell_(row, indexes, ['출고 검수자', '검수자']);
  const inspectionQuantity = displayQuantityToNumber_(pickCell_(row, indexes, ['출고 검수 수량', '출고검수수량', '검수수량']));
  const hasShippingInspection = Boolean(
    (inspectionDate && inspectionDate !== '-')
    || (inspectionTime && inspectionTime !== '-')
    || (inspector && inspector !== '-')
    || inspectionQuantity > 0
  );

  return hasShippingReadyStatus && hasShippingInspection;
}

function findShippingTypeHeaderIndex_(indexes) {
  const directIndex = findHeaderIndex_(indexes, ['출고유형', '출고 유형', '출고타입', '출고 타입', '출고구분', '출고 구분']);

  if (directIndex >= 0) {
    return directIndex;
  }

  const workerIndex = findHeaderIndex_(indexes, ['작업자']);
  const shippingDateIndex = findHeaderIndex_(indexes, ['출고일']);

  if (workerIndex >= 0 && shippingDateIndex === workerIndex + 2) {
    return workerIndex + 1;
  }

  if (shippingDateIndex > 0) {
    return shippingDateIndex - 1;
  }

  return -1;
}

function extractTransferCompanyFromNote_(note) {
  const text = String(note || '').trim();
  const match = text.match(/이관\s*업체\s*:\s*([^,\n]+)/);
  return match ? match[1].trim() : '';
}

function extractTransferCompanyFromShippingType_(shippingType) {
  const text = String(shippingType || '').trim();
  const match = text.match(/^이관\s*\(([^)]+)\)$/);
  return match ? match[1].trim() : '';
}

function updateStockStatusRows_(sheet, managementId, status, data = {}) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID', '상태']) || findHeaderRow_(values, ['관리ID', '상태']);

  if (!headerInfo) {
    throw new Error(`${sheet.getName()} 시트의 헤더를 찾을 수 없습니다.`);
  }

  const indexes = indexHeaders_(headerInfo.headers);
  const managementIndex = findHeaderIndex_(indexes, ['관리 ID', '관리ID']);
  const statusIndex = findHeaderIndex_(indexes, ['상태']);

  if (managementIndex < 0 || statusIndex < 0) {
    throw new Error(`${sheet.getName()} 시트에서 관리 ID 또는 상태 컬럼을 찾을 수 없습니다.`);
  }

  let updatedRows = 0;

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    if (!isMatchingInventoryRow_(values[rowIndex], indexes, ['관리 ID', '관리ID'], managementId, data)) {
      continue;
    }

    sheet.getRange(rowIndex + 1, statusIndex + 1).setValue(status);
    updatedRows += 1;
  }

  return updatedRows;
}

function setSheetCellByHeader_(sheet, rowIndex, indexes, names, value) {
  const columnIndex = findHeaderIndex_(indexes, names);

  if (columnIndex >= 0) {
    sheet.getRange(rowIndex + 1, columnIndex + 1).setValue(value);
  }
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
      indexes[normalizeHeaderKey_(normalized)] = index;
    }
    return indexes;
  }, {});
}

function normalizeHeaderKey_(value) {
  return String(value || '')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .trim();
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
    const normalizedName = normalizeHeaderKey_(names[i]);
    if (Object.prototype.hasOwnProperty.call(indexes, normalizedName)) {
      return indexes[normalizedName];
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
    '필립텍': 'PLT',
    '이루팩': 'IRP',
    '(주)디엠': 'DM',
    '보경': 'BK',
    'CPI': 'CPI',
    '더승진(2공장)': 'SJ2',
    'SJ패키지': 'SJP',
    '명신코스텍': 'MSK'
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

    const productId = getObjectCell_(row, ['제품ID', '제품 ID']);
    const productName = getObjectCell_(row, ['제품명']);
    const rawStatus = getObjectCell_(row, ['상태', '재고 상태']);
    const status = normalizeStockStatusText_(rawStatus);
    const currentQuantityCell = getObjectCell_(row, ['현재 수량', '현재수량']);
    const currentQuantity = displayQuantityToNumber_(currentQuantityCell);
    const originalQuantity = displayQuantityToNumber_(getObjectCell_(row, ['박스당 수량', '박스당수량', '입고 수량', '입고수량']));
    const hasShippingWorkflowStatus = ['출고대기', '검수완료', '보류'].includes(status);
    const isActiveBox = (currentQuantity > 0 || hasShippingWorkflowStatus) && !/출고완료|폐기/.test(status);
    const storage = getObjectCell_(row, ['보관 위치', '보관위치', '보관 장소']) || '미지정';
    const summaryKey = getInventoryIdentityKey_(managementId, productId, productName, storage);
    const qrState = getObjectCell_(row, ['QR 생성 여부', 'QR 출력 여부']);

    if (!map[summaryKey]) {
      map[summaryKey] = {
        managementId,
        productId,
        productName,
        boxCount: 0,
        currentQuantity: 0,
        qrGeneratedCount: 0,
        shippingInspectionCount: 0,
        shippingInspectionQuantity: 0,
        shippingDefectQuantity: 0,
        shippingDefectRateTotal: 0,
        shippingDefectRateCount: 0,
        shippingDefectReasonCounts: {},
        defectPhotoUrlCounts: {},
        shippingInspectionDateCounts: {},
        shippingDateCounts: {},
        statusCounts: {},
        storageCounts: {},
        allShippingBoxes: [],
        activeShippingBoxes: [],
        shippedShippingBoxes: [],
        boxes: []
      };
    }
    const summary = map[summaryKey];

    const shippingInspectionQuantity = displayQuantityToNumber_(getObjectCell_(row, ['출고 검수 수량', '출고검수수량', '검수수량']));
    const shippingDefectQuantity = displayQuantityToNumber_(getObjectCell_(row, ['불량 수량', '불량수량']));
    const shippingDefectRateText = getObjectCell_(row, ['불량률']);
    const shippingDefectRate = displayQuantityToNumber_(shippingDefectRateText);
    const shippingDefectReason = getObjectCell_(row, ['불량 사유', '불량사유', '불량내역']);
    const defectPhotoFolderUrl = getObjectCell_(row, ['불량 사진', '불량사진', '불량 사진 URL', '불량사진 URL']);
    const sequence = displayQuantityToNumber_(getObjectCell_(row, ['박스순번', '박스 순번', '박스 번호']));
    const shippingInspectionDate = normalizeDateKey_(getObjectCell_(row, ['출고 검수일', '검수일']));
    const shippingInspectionTime = getObjectCell_(row, ['출고 검수시간', '검수시간']);
    const shippingDate = normalizeDateKey_(getObjectCell_(row, ['출고일']));
    const shippingType = getObjectCell_(row, ['출고유형', '출고 유형', '출고타입', '출고 타입', '출고구분', '출고 구분']);
    const boxNote = getObjectCell_(row, ['비고', '메모', '참고']);
    const transferCompanyCell = getObjectCell_(row, ['이관업체', '이관 업체', '출고 이관 업체', '출고이관업체']);
    const transferCompany = transferCompanyCell || extractTransferCompanyFromShippingType_(shippingType) || extractTransferCompanyFromNote_(boxNote);
    const boxInfo = {
      number: sequence || summary.boxes.length + 1,
      boxId: getObjectCell_(row, ['박스ID', '박스 ID']),
      quantity: currentQuantityCell && currentQuantityCell !== '-'
        ? currentQuantity
        : originalQuantity || shippingInspectionQuantity,
      status,
      storage
    };
    if (rawStatus && rawStatus !== status) boxInfo.rawStatus = rawStatus;
    if (shippingInspectionDate) boxInfo.inspectionDate = shippingInspectionDate;
    if (shippingInspectionTime && shippingInspectionTime !== '-') boxInfo.inspectionTime = shippingInspectionTime;
    if (shippingInspectionQuantity > 0) boxInfo.inspectionQuantity = shippingInspectionQuantity;
    if (shippingDefectQuantity > 0) boxInfo.defectQuantity = shippingDefectQuantity;
    if (shippingDefectRateText && shippingDefectRateText !== '-') boxInfo.defectRate = shippingDefectRate;
    if (shippingDefectReason && shippingDefectReason !== '-') boxInfo.defectReason = shippingDefectReason;
    if (defectPhotoFolderUrl && defectPhotoFolderUrl !== '-') boxInfo.defectPhotoFolderUrl = defectPhotoFolderUrl;
    if (shippingDate) boxInfo.shippingDate = getObjectCell_(row, ['출고일']);
    const shippingTime = getObjectCell_(row, ['출고시간']);
    if (shippingTime && shippingTime !== '-') boxInfo.shippingTime = shippingTime;
    if (shippingType && shippingType !== '-') boxInfo.shippingType = shippingType;
    if (transferCompany) boxInfo.transferCompany = transferCompany;
    const shipper = getObjectCell_(row, ['출고자']);
    if (shipper && shipper !== '-') boxInfo.shipper = shipper;
    const hasShippingInspection = Boolean(
      (shippingInspectionDate && shippingInspectionDate !== '-')
      || shippingInspectionQuantity > 0
      || (shippingDefectRateText && shippingDefectRateText !== '-')
    );

    summary.allShippingBoxes.push(boxInfo);

    if (!/폐기/.test(status)) {
      summary.storageCounts[storage] = (summary.storageCounts[storage] || 0) + 1;
    }

    if (isActiveBox) {
      summary.boxCount += 1;
      summary.currentQuantity += currentQuantity;
      summary.statusCounts[status] = (summary.statusCounts[status] || 0) + 1;
      summary.activeShippingBoxes.push(boxInfo);

      if (hasShippingInspection) {
        summary.shippingInspectionCount += 1;
        summary.shippingInspectionQuantity += shippingInspectionQuantity || currentQuantity;
        summary.shippingDefectQuantity += shippingDefectQuantity;

        if (shippingDefectRateText && shippingDefectRateText !== '-') {
          summary.shippingDefectRateTotal += shippingDefectRate;
          summary.shippingDefectRateCount += 1;
        }

        if (shippingDefectReason && shippingDefectReason !== '-') {
          summary.shippingDefectReasonCounts[shippingDefectReason] = (summary.shippingDefectReasonCounts[shippingDefectReason] || 0) + 1;
        }

        if (defectPhotoFolderUrl && defectPhotoFolderUrl !== '-') {
          summary.defectPhotoUrlCounts[defectPhotoFolderUrl] = (summary.defectPhotoUrlCounts[defectPhotoFolderUrl] || 0) + 1;
        }

        if (shippingInspectionDate) {
          summary.shippingInspectionDateCounts[shippingInspectionDate] = (summary.shippingInspectionDateCounts[shippingInspectionDate] || 0) + 1;
        }
      }
    } else if (/출고완료/.test(status)) {
      summary.shippedShippingBoxes.push(boxInfo);
    }

    if (qrState && qrState !== '-') {
      summary.qrGeneratedCount += 1;
    }

    if (shippingDate) {
      summary.shippingDateCounts[shippingDate] = (summary.shippingDateCounts[shippingDate] || 0) + 1;
    }

    summary.boxes.push(boxInfo);
  });

  Object.keys(map).forEach((managementId) => {
    const summary = map[managementId];
    summary.primaryStorage = pickTopKey_(summary.storageCounts) || '미지정';
    summary.status = pickTopKey_(summary.statusCounts) || '보관';
    summary.shippingDefectRate = summary.shippingDefectRateCount
      ? summary.shippingDefectRateTotal / summary.shippingDefectRateCount
      : 0;
    summary.shippingDefectReason = pickTopKey_(summary.shippingDefectReasonCounts) || '';
    summary.defectPhotoFolderUrl = Object.keys(summary.defectPhotoUrlCounts).join(' ');
    summary.defectPhotoCount = Object.keys(summary.defectPhotoUrlCounts).length;
    summary.shippingInspectionDate = pickTopKey_(summary.shippingInspectionDateCounts) || '';
    summary.shippingDate = pickTopKey_(summary.shippingDateCounts) || '';
    summary.allShippingBoxes.sort((left, right) => left.number - right.number);
    summary.activeShippingBoxes.sort((left, right) => left.number - right.number);
    summary.shippedShippingBoxes.sort((left, right) => left.number - right.number);
  });

  return map;
}

function buildInventoryLocationStats_(boxSummaryMap, mode) {
  const totals = {};

  Object.keys(boxSummaryMap).forEach((summaryKey) => {
    const summary = boxSummaryMap[summaryKey];

    summary.boxes.forEach((box) => {
      const status = normalizeStockStatusText_(box.status);
      const currentQuantity = displayQuantityToNumber_(box.quantity);

      if (currentQuantity <= 0 || /출고완료|폐기/.test(status)) {
        return;
      }

      const storage = box.storage || '미지정';
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

function normalizeManagementIdProductPart_(productId) {
  return String(productId || 'NO-PRODUCT')
    .replace(/\s+/g, '')
    .replace(/[^0-9A-Za-z가-힣_-]/g, '')
    .toUpperCase() || 'NO-PRODUCT';
}

function getMaxManagementSequenceFromSheet_(sheet, prefix) {
  const values = sheet.getDataRange().getDisplayValues();
  const headerInfo = findHeaderRow_(values, ['관리 ID']) || findHeaderRow_(values, ['관리ID']);
  let maxSequence = 0;

  if (headerInfo) {
    const indexes = indexHeaders_(headerInfo.headers);
    const managementIndex = findHeaderIndex_(indexes, ['관리 ID', '관리ID']);

    if (managementIndex >= 0) {
      values.slice(headerInfo.rowIndex + 1).forEach((row) => {
        const id = String(row[managementIndex] || '').trim();

        if (id.startsWith(prefix)) {
          const sequence = Number(id.slice(prefix.length));
          if (!Number.isNaN(sequence)) {
            maxSequence = Math.max(maxSequence, sequence);
          }
        }
      });
    }
  }

  return maxSequence;
}

function generateInboundManagementId_(stockSheet, boxSheet, datePart, productId) {
  const productPart = normalizeManagementIdProductPart_(productId);
  const prefix = `IN-${datePart}-${productPart}-`;
  const maxSequence = Math.max(
    getMaxManagementSequenceFromSheet_(stockSheet, prefix),
    boxSheet ? getMaxManagementSequenceFromSheet_(boxSheet, prefix) : 0
  );

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

function formatPercentNumber_(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return Math.abs(number - Math.round(number)) < 0.05 ? String(Math.round(number)) : number.toFixed(1);
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
