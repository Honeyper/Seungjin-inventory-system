const CONFIG = {
  SPREADSHEET_ID: '1XkrXqPFpB2dtGrT8KiV3OyUzM6PbVAxHlZlQeDUFQAI',
  SHEETS: {
    PRODUCTS: '제품DB',
    INBOUND: '입고내역',
    INBOUND_BOXES: '입고박스내역',
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
      createProduct
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
  const values = sheet.getDataRange().getDisplayValues();
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
  const headers = headerRow.slice(startColIndex, startColIndex + 3);

  const nameOffset = headers.indexOf('이름');
  const accountOffset = headers.indexOf('계정');
  const passwordOffset = headers.indexOf('비밀번호');

  if (nameOffset < 0 || accountOffset < 0 || passwordOffset < 0) {
    throw new Error(`${blockTitle} 영역의 헤더를 확인해주세요.`);
  }

  for (let rowIndex = dataStartRowIndex; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const name = String(row[startColIndex + nameOffset] || '').trim();
    const accountId = String(row[startColIndex + accountOffset] || '').trim();
    const password = String(row[startColIndex + passwordOffset] || '').trim();

    if (!name && !accountId && !password) {
      break;
    }

    if (accountId && password) {
      accounts.push({
        name,
        accountId,
        password,
        role
      });
    }
  }
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
  const sheet = getSheet_(CONFIG.SHEETS.PRODUCTS);
  return readObjects_(sheet);
}

function createProduct(payload) {
  const required = ['업체명', '제품명', '박스당 수량'];
  required.forEach((field) => {
    if (!payload[field]) {
      throw new Error(`${field} 값이 필요합니다.`);
    }
  });

  const sheet = getSheet_(CONFIG.SHEETS.PRODUCTS);
  const now = new Date();
  const productId = payload['제품ID'] || makeId_('PRD');
  const row = [
    productId,
    payload['업체명'],
    payload['제품명'],
    payload['기본 차수'] || '1차',
    payload['최종공정'] || '1도',
    Number(payload['박스당 수량']),
    payload['사용 여부'] || '사용',
    payload['비고'] || '',
    now,
    now
  ];

  sheet.appendRow(row);
  return {
    productId
  };
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

function getOrCreateSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
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
