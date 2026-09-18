const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const frontend = path.resolve(__dirname, '../frontend');
const origin = 'https://seungjin.test';
const contentTypes = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};

async function installFixtures(context, state) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    // No request, including fonts or images, reaches an external service.
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      const { action, payload } = route.request().postDataJSON();
      if (state.inventory && ['getInventoryDashboard', 'getInventoryVersion', 'adjustMissingInventory'].includes(action)) {
        const engine = await import('../supabase/functions/seungjin-dev-gateway/state-engine.js');
        let data;
        if (action === 'adjustMissingInventory') {
          state.confirmations.push(payload);
          const mutation = engine.applyMutation(action, payload, state.inventory, state.now);
          state.inventory = mutation.state;
          state.version++;
          data = mutation.result;
        } else if (action === 'getInventoryDashboard') {
          state.inventoryReads++;
          data = engine.buildInventoryDashboard(state.inventory.records, state.inventory.boxes, [], state.now);
        } else data = {};
        return route.fulfill({ json: { ok: true, data: { ...data, stateVersion: state.version } } });
      }
      if (action === 'login') {
        state.loginCalls++;
        await new Promise(resolve => setTimeout(resolve, 30));
        return route.fulfill({ status: 401, json: { ok: false, message: '계정 정보가 일치하지 않습니다.' } });
      }
      if (action === 'uploadProductImage') {
        state.uploads.push(payload.imageFile.name);
        await new Promise(resolve => setTimeout(resolve, 20));
        if (state.failPhoto && payload.imageFile.name === '2.png') {
          return route.fulfill({ status: 503, json: { ok: false, message: '사진 업로드 실패' } });
        }
        return route.fulfill({ json: { ok: true, data: { imageUrl: `${origin}/image/${payload.imageFile.name}` } } });
      }
      const data = { products: [], purchaseOrders: [], inbounds: [], rows: [], notifications: [], stateVersion: 1, source: 'test' };
      return route.fulfill({ json: { ok: true, data } });
    }
    if (url.pathname.endsWith('/config.js')) {
      const config = {
        ENV: 'dev', API_URL: `${origin}/api/gas`, SUPABASE_GATEWAY_URL: `${origin}/api/gateway`,
        SUPABASE_PUBLISHABLE_KEY: 'fixture', SUPABASE_CANONICAL_WRITES: true
      };
      return route.fulfill({ contentType: 'application/javascript', body: `window.SEUNGJIN_CONFIG=${JSON.stringify(config)};` });
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
    const file = path.resolve(frontend, relative);
    if (!file.startsWith(`${frontend}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, body: 'missing' });
    }
    return route.fulfill({ contentType: contentTypes[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
}

async function verifyLogin(page, state) {
  await page.goto(`${origin}/index.html`);
  await page.locator('#accountId').fill('fixture');
  await page.locator('#password').fill('fixture');
  await page.evaluate(() => { handleLogin(); handleLogin(); });
  await page.waitForFunction(() => document.querySelector('#loginMessage').textContent.includes('일치하지'));
  assert.equal(state.loginCalls, 1);
  assert.equal(await page.locator('.login-button').isEnabled(), true);

  await page.evaluate(() => sessionStorage.setItem('seungjinAdminSession', '{broken'));
  await page.goto(`${origin}/admin.html`);
  await page.waitForURL('**/index.html');
  await page.evaluate(() => sessionStorage.setItem('seungjinAdminSession', JSON.stringify({
    name: 'Fixture', role: 'admin', supabaseSessionToken: 'fixture', supabaseSessionExpiresAt: '2099-01-01'
  })));
}

async function verifyAdminViews(page) {
  const views = { inbound: 'inboundView', products: 'productView', 'purchase-orders': 'purchaseOrderView',
    inventory: 'inventoryView', shipping: 'shippingView', 'production-plan': 'productionPlanView', 'work-status': 'workStatusView' };
  for (const [view, elementId] of Object.entries(views)) {
    await page.goto(`${origin}/admin.html#${view}`);
    await page.waitForFunction(() => typeof requestApi === 'function');
    await page.waitForTimeout(120);
    assert.equal(await page.locator(`#${elementId}`).isVisible(), true, `${view} visible`);
  }
}

async function verifyPartialUpload(page, fixture) {
  // Actual FileReader, image preparation, requestApi and product upload helper.
  const firstError = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 10;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    state.editingProductCode = 'TEST';
    state.productImageUrls = [];
    state.productImagePendingFiles = [1, 2, 3].map(index => {
      const file = new File([blob], `${index}.png`, { type: 'image/png' });
      return { file, previewUrl: URL.createObjectURL(file) };
    });
    try {
      await resolveProductImageUrls({ '업체명': 'Fixture', '제품명': '테스트' });
      return '';
    } catch (error) {
      return error.message;
    }
  });
  assert.equal(firstError, '사진 업로드 실패');
  assert.deepEqual(fixture.uploads.slice().sort(), ['1.png', '2.png', '3.png']);
  fixture.failPhoto = false;
  const urls = await page.evaluate(() => resolveProductImageUrls({ '업체명': 'Fixture', '제품명': '테스트' }));
  assert.equal(urls.length, 3);
  assert.deepEqual(fixture.uploads, ['1.png', '2.png', '3.png', '2.png']);
}

async function verifyMonthlyConfirmation(page, fixture) {
  const record = { managementId: 'MONTHLY-UI', productId: 'P1', productName: '월간 확인 테스트', clientName: 'Fixture', storage: 'A', inboundDate: '2026-08-18' };
  fixture.inventory = { products: [], orders: [], inbounds: [], records: [record], boxes: [
    { ...record, boxId: 'B1', number: 1, quantity: 100, status: '보관', lastInventoryCheckedAt: '2026-08-18 14:20:30' },
    { ...record, boxId: 'B2', number: 2, quantity: 100, status: '출고대기' },
    { ...record, boxId: 'B3', number: 3, quantity: 100, status: '출고완료' }
  ] };
  fixture.now = new Date('2026-09-18T05:20:29Z');
  fixture.version = 12;
  fixture.inventoryReads = 0;
  fixture.confirmations = [];
  await page.clock.setSystemTime(fixture.now);
  await page.goto(`${origin}/admin.html#inventory`);
  await page.waitForFunction(() => state.inventoryRows.some(row => row.managementId === 'MONTHLY-UI'));
  assert.equal((await page.locator('#inventoryPhysicalMissing').textContent()).trim(), '0');
  await page.locator('[data-inventory-detail="MONTHLY-UI"]').click();
  assert.equal(await page.locator('.inventory-audit-box-card.confirmed').count(), 1);
  assert.equal(await page.locator('.inventory-audit-box-card.unconfirmed').count(), 0);
  fixture.now = new Date('2026-09-18T05:21:31Z');
  const reads = fixture.inventoryReads;
  await page.clock.runFor(62000);
  assert.equal((await page.locator('#inventoryPhysicalMissing').textContent()).trim(), '1');
  assert.equal(await page.locator('.inventory-audit-box-card.unconfirmed').count(), 1);
  assert.equal(await page.locator('.inventory-audit-box-card.confirmed').count(), 0);
  assert.equal(fixture.inventoryReads, reads); // Expiry works without a data version change or full read.
  await page.locator('[data-inventory-audit-confirm-all]').click();
  await page.waitForFunction(() => !state.isSavingInventoryConfirmation && document.querySelectorAll('.inventory-audit-box-card.confirmed').length === 1);
  assert.equal((await page.locator('#inventoryPhysicalMissing').textContent()).trim(), '0');
  assert.deepEqual(fixture.confirmations[0].confirmedBoxes[0].selectedBoxes, [1]);
  assert.deepEqual(fixture.inventory.boxes.map(box => [box.status, box.quantity]), [['보관', 100], ['출고대기', 100], ['출고완료', 100]]);
}

async function measureBatch(page) {
  return page.evaluate(async () => {
    const items = Array.from({ length: 10 }, (_, index) => index);
    const work = () => new Promise(resolve => setTimeout(resolve, 20));
    let started = performance.now();
    for (const item of items) await work(item);
    const serialMs = Math.round(performance.now() - started);
    started = performance.now();
    await SeungjinAttachments.uploadBatch(items, work);
    return { serialMs, batchMs: Math.round(performance.now() - started) };
  });
}

async function main() {
  const browser = await chromium.launch({
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), headless: true
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const fixture = { uploads: [], failPhoto: true, loginCalls: 0 };
    const errors = [];
    await installFixtures(context, fixture);
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-09-18T05:20:20Z') });
    page.on('pageerror', error => errors.push(error.message));
    await verifyLogin(page, fixture);
    await verifyAdminViews(page);
    await verifyMonthlyConfirmation(page, fixture);
    await verifyPartialUpload(page, fixture);
    const timing = await measureBatch(page);

    await page.goto(`${origin}/mobile/index.html`);
    await page.waitForFunction(() => typeof attemptAdminLogin === 'function');
    await page.evaluate(() => {
      elements.accountId.value = elements.password.value = 'fixture';
      attemptAdminLogin(); attemptAdminLogin();
    });
    await page.waitForFunction(() => !elements.adminLoginButton.disabled);
    assert.equal(fixture.loginCalls, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, monthlyConfirmation: true, uploads: fixture.uploads, timing, consoleErrors: errors.length }));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
