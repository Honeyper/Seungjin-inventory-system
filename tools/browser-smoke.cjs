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
    page.on('pageerror', error => errors.push(error.message));
    await verifyLogin(page, fixture);
    await verifyAdminViews(page);
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
    console.log(JSON.stringify({ passed: true, uploads: fixture.uploads, timing, consoleErrors: errors.length }));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
