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
      (state.actions ||= []).push(action);
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
      if (['createPurchaseOrder', 'updatePurchaseOrder'].includes(action)) {
        const engine = await import('../supabase/functions/seungjin-dev-gateway/state-engine.js');
        const mutation = engine.applyMutation(action, payload, {products: state.mockProducts || [], orders: state.mockOrders || [], records: [], boxes: [], inbounds: []}, new Date('2026-10-12T05:00:00Z'));
        state.mockOrders = mutation.state.orders;
        return route.fulfill({json: {ok:true,data:{...mutation.result,stateVersion:1}}});
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
      const data = { products: state.mockProducts || [], purchaseOrders: state.mockOrders || [], inbounds: [], rows: [], notifications: [], stateVersion: 1, source: 'test' };
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

async function verifyProductionPlanPilot(page, fixture) {
  fixture.mockProducts = [
    { productId: 'NP-0001', productCode: 'NP-0001', productName: '오브제 파운데이션 외용기', clientName: '뉴파트너스',
      processStage1: '실크', processStage2: '실크', finalProcess: '2도', processRoute: '1도 실크 → 2도 실크', processGroups: [[1],[2]], processHourlyProductionRates: {'1도':1000,'2도':2000}, boxQuantity: '567 ea', trayQuantity: '80 ea' },
    { productId: 'OTHER', productCode: 'OTHER', productName: '다른 제품', clientName: '다른 업체', finalProcess: '2도' }
  ];
  fixture.mockOrders = [
    {purchaseOrderId:'PO-OBJET-1',productId:'NP-0001',productName:'오브제 파운데이션 외용기',clientName:'뉴파트너스',
      totalOrderQuantity:10000,remainingShippingQuantity:10000,status:'작업중',endDate:'2026-10-14'},
    {purchaseOrderId:'PO-OBJET-2',productId:'NP-0001',productName:'오브제 파운데이션 외용기',totalOrderQuantity:20000,status:'작업중'},
    {purchaseOrderId:'PO-OTHER',productId:'OTHER',productName:'다른 제품',totalOrderQuantity:30000,status:'작업중'}
  ];
  await page.goto(origin + '/admin.html#production-plan');
  await page.reload();
  await page.waitForFunction(() => typeof applyProductsResult === 'function' && state.purchaseOrdersLoaded && !state.productsLoadPromise);
  const rows = page.locator('#productionPlanTableBody [data-plan-row-id]');
  assert.equal(await rows.count(), 1);
  assert.match((await rows.allTextContents()).join(' '), /실크.*오브제.*외용기/s);
  assert.equal(await page.locator('[data-plan-add-process], [data-plan-delete-row], #singleProductionPlan, #productionPlanProcessFilter').count(), 0);
  assert.match(await page.locator('#productionPlanJobCount').textContent(), /1/);
  const machine = rows.first().locator('[data-plan-field=machine]');
  assert.deepEqual(await machine.locator('option').evaluateAll(opts => opts.map(o => o.value)), ['', ...Array.from({length:12}, (_,i) => (i+1)+'호기')]);
  await machine.selectOption('1호기');
  await machine.selectOption('12호기');
  await rows.first().locator('[data-plan-field=worker]').selectOption('유순희');
  const stage = rows.first().locator('[data-plan-field=stage]');
  assert.equal(await stage.inputValue(), '2');
  assert.deepEqual(await stage.locator('option').allTextContents(), ['1도', '2도']);
  await rows.first().locator('[data-plan-product-picker]').click();
  await page.waitForFunction(() => !document.querySelector('#inboundProductPickerModal').hidden);
  assert.equal(await page.locator('#inboundProductPickerList .picker-product').count(), 2);
  assert.equal(await page.locator('#inboundProductPickerList .picker-product[data-product="NP-0001"]').getAttribute('data-product'), 'NP-0001');
  assert.equal(await page.locator('#createProductFromPickerButton').isVisible(), false);
  assert.equal(await page.locator('#inboundProductPickerList [data-copy-picker-product], #inboundProductPickerList [data-edit-picker-product]').count(), 0);
  await page.locator('#inboundProductPickerList .picker-product[data-product="NP-0001"]').click();
  assert.equal(await rows.first().locator('[data-plan-field=worker]').inputValue(), '유순희');
  assert.deepEqual(await rows.first().locator('[data-plan-field=worker] option').allTextContents(), ['미지정','유순희']);
  assert.deepEqual(await rows.first().locator('[data-plan-field=packagingWorker] option').allTextContents(), ['미지정','수쿠마 (아웃소싱)']);
  await rows.first().locator('[data-plan-field=packagingWorker]').selectOption('');
  await rows.first().locator('[data-plan-field=packagingWorker]').selectOption('수쿠마');
  const actionCount = fixture.actions.length;
  await page.locator('#saveProductionPlanButton').click();
  assert.equal(fixture.actions.slice(actionCount).some(a => /^(create|update|delete|save)/.test(a)), false);
  await page.reload();
  await page.waitForFunction(() => state.purchaseOrdersLoaded && !state.productsLoadPromise);
  assert.equal(await rows.count(), 1);
  assert.equal(await rows.first().locator('[data-plan-field=worker]').inputValue(), '유순희');
  assert.equal(await rows.first().locator('[data-plan-field=machine]').inputValue(), '12호기');
  assert.equal(await stage.inputValue(), '2');
  assert.equal(await rows.first().locator('[data-plan-field=packagingWorker]').inputValue(), '수쿠마');
  const staff = await page.evaluate(() => state.productionPlanJobs.map(row => [row.worker,row.workerType,row.packagingWorker,row.packagingWorkerType]));
  assert.deepEqual(staff,[['유순희','employee','수쿠마','outsourcing']]);
  assert.equal(await page.evaluate(() => state.productionPlanJobs[0].targetQuantity), 10000);
  await stage.selectOption('1');
  assert.equal(await rows.count(), 1);
  assert.equal(await machine.inputValue(), '');
  assert.equal(await page.evaluate(() => state.productionPlanJobs[0].targetQuantity), 8000);
  await machine.selectOption('2호기');
  await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(() => state.purchaseOrdersLoaded && !state.productsLoadPromise);
  assert.equal(await stage.inputValue(), '1');
  assert.equal(await machine.inputValue(), '2호기');
  await stage.selectOption('2');
  assert.equal(await machine.inputValue(), '12호기');
  assert.equal(await page.evaluate(() => state.productionPlanJobs[0].targetQuantity), 10000);
  await page.locator('#saveProductionPlanButton').click();
  await page.locator('#syncProductionPlanButton').click();
  await page.waitForFunction(() => !document.querySelector('#syncProductionPlanButton').disabled);
  assert.equal(await rows.count(), 1);
  assert.equal(await stage.inputValue(), '2');
  await page.screenshot({path:'/private/tmp/seungjin-selected-stage.png',fullPage:true});
  await page.evaluate(() => { selectProductionPlanProduct({productCode:'OTHER'}); });
  assert.match((await rows.allTextContents()).join(' '), /오브제.*외용기/);
  await page.evaluate(() => openInboundProductPicker('inbound'));
  assert.equal(await page.locator('#inboundProductPickerList .picker-product').count(), 2);
  assert.equal(await page.locator('#createProductFromPickerButton').isVisible(), true);
  await page.locator('#closeInboundProductPicker').click();
}

async function verifyProductionPlanPrintTypes(page, fixture) {
  fixture.mockProducts.push(
    {productCode:'FOIL',productId:'FOIL',productName:'박 인쇄 제품',clientName:'박 업체',finalProcess:'2도',processStage1:'박',processStage2:'박',processGroups:[[1],[2]]},
    {productCode:'MIXED',productId:'MIXED',productName:'혼합 공정 제품',finalProcess:'3도',processStage1:'실크',processStage2:'박',processStage3:'실크'},
    {productCode:'COATING',productId:'COATING',productName:'코팅 제품',finalProcess:'코팅',processRoute:'코팅'}
  );
  fixture.mockOrders.push({purchaseOrderId:'PO-FOIL',productId:'FOIL',productName:'박 인쇄 제품',clientName:'박 업체',totalOrderQuantity:10000,status:'작업중',endDate:'2026-10-14'},
    {purchaseOrderId:'PO-MIXED',productId:'MIXED',productName:'혼합 공정 제품',totalOrderQuantity:10000,status:'작업중',endDate:'2026-10-14'});
  await page.reload();
  await page.waitForFunction(() => state.purchaseOrdersLoaded && !state.productsLoadPromise);
  const row = page.locator('#productionPlanTableBody [data-plan-row-id]');
  const process = row.locator('[data-plan-field=process]');
  const stage = row.locator('[data-plan-field=stage]');
  assert.deepEqual(await process.locator('option').allTextContents(), ['박','실크','자동화']);
  const products = page.locator('#inboundProductPickerList .picker-product');
  const ids = () => products.evaluateAll(nodes => nodes.map(node=>node.dataset.product).sort());
  await row.locator('[data-plan-product-picker]').click();
  assert.deepEqual(await ids(), ['NP-0001','OTHER']);
  await page.locator('#closeInboundProductPicker').click();
  await process.selectOption('자동화');
  assert.equal(await stage.inputValue(), '2');
  const autoMachine = row.locator('[data-plan-field=machine]');
  assert.deepEqual(await autoMachine.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value)), ['', '1호기', '2호기', '3호기', '4호기']);
  await autoMachine.selectOption('4호기');
  await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(() => state.purchaseOrdersLoaded && !state.productsLoadPromise);
  assert.equal(await process.inputValue(), '자동화');
  assert.equal(await autoMachine.inputValue(), '4호기');
  await row.locator('[data-plan-product-picker]').click();
  assert.deepEqual(await ids(), ['NP-0001','OTHER']);
  await page.locator('#inboundProductPickerList .picker-product[data-product=OTHER]').click();
  assert.equal(await page.evaluate(() => state.productionPlanJobs[0].productId), 'OTHER');
  assert.equal(await stage.inputValue(), '1');
  await process.selectOption('박 인쇄');
  assert.equal(await page.evaluate(() => state.productionPlanJobs[0].purchaseOrderId), '');
  await row.locator('[data-plan-product-picker]').click();
  assert.deepEqual(await ids(), ['FOIL','MIXED']);
  assert.match(await page.locator('#inboundProductPickerTitle').evaluate(node=>node.nextElementSibling.textContent), /박 인쇄/);
  await page.locator('#inboundProductPickerList .picker-product[data-product=MIXED]').click();
  assert.deepEqual(await stage.locator('option').allTextContents(), ['2도']);
  await row.locator('[data-plan-product-picker]').click();
  await page.locator('#inboundProductPickerList .picker-product[data-product=FOIL]').click();
  await stage.selectOption('2');
  await row.locator('[data-plan-field=machine]').selectOption('3호기');
  await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(() => state.purchaseOrdersLoaded && !state.productsLoadPromise);
  assert.equal(await process.inputValue(), '박 인쇄');
  assert.equal(await stage.inputValue(), '2');
  assert.equal(await row.locator('[data-plan-field=machine]').inputValue(), '3호기');
  await page.locator('#syncProductionPlanButton').click();
  await page.waitForFunction(() => !document.querySelector('#syncProductionPlanButton').disabled);
  assert.equal(await page.evaluate(() => state.productionPlanJobs[0].productId), 'FOIL');
  assert.equal(await process.inputValue(), '박 인쇄');
  await page.screenshot({path:'/private/tmp/seungjin-print-types-foil.png',fullPage:true});
  await process.selectOption('실크 인쇄');
  await row.locator('[data-plan-product-picker]').click();
  assert.deepEqual(await ids(), ['NP-0001','OTHER']);
  await page.locator('#inboundProductPickerList .picker-product[data-product="NP-0001"]').click();
  assert.equal(await stage.inputValue(), '2');
  await page.locator('#saveProductionPlanButton').click();
  assert.equal(fixture.actions.includes('getProductionPlanReference'), false);
  await page.screenshot({path:'/private/tmp/seungjin-simple-planning.png',fullPage:true});
}

async function verifyProductionPlanDetails(page, fixture) {
  const rows=page.locator('#productionPlanTableBody [data-plan-row-id]');
  const buttons=rows.locator('[data-plan-details-toggle]');
  const before=await page.evaluate(()=>JSON.stringify(state.productionPlanJobs));
  const status=await page.locator('#productionPlanStatus').textContent();
  const actions=fixture.actions.length;
  assert.equal(await buttons.getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.production-plan-details-row').isVisible(),false);
  await buttons.click();
  assert.equal(await buttons.getAttribute('aria-expanded'),'true');
  assert.equal(await buttons.locator('.production-plan-details-toggle-label').textContent(),'세부사항 닫기');
  await page.locator('.production-plan-details-row').waitFor({state:'visible'});
  assert.equal(await page.locator('.production-plan-details-row').isVisible(),true);
  assert.equal(await page.locator('.production-plan-details-row td').getAttribute('colspan'),'10');
  assert.equal(await rows.evaluate(row=>row.nextElementSibling.classList.contains('production-plan-details-row')),true);
  await page.locator('.production-plan-table-wrap').screenshot({path:'/private/tmp/seungjin-plan-details-open.png'});
  await buttons.press('Enter');
  assert.equal(await buttons.getAttribute('aria-expanded'),'false');
  await buttons.press('Space');
  assert.equal(await buttons.getAttribute('aria-expanded'),'true');
  await page.evaluate(()=>renderProductionPlan());
  assert.equal(await buttons.getAttribute('aria-expanded'),'true');
  await page.evaluate(()=>{
    window.detailsOriginalJobs=state.productionPlanJobs;
    const first=state.productionPlanJobs[0];
    state.productionPlanJobs=[first,...[1,2].map(i=>({...first,planRowId:`DETAIL-ROW-${i}`}))];
    renderProductionPlanTable();
  });
  assert.equal(await buttons.count(),3);
  await buttons.nth(1).click();
  await buttons.nth(0).click();
  assert.deepEqual(await buttons.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-expanded'))),['false','true','false']);
  await page.waitForFunction(()=>document.querySelectorAll('.production-plan-details-row:not([hidden])').length===1);
  assert.equal(await page.locator('.production-plan-details-row:visible').count(),1);
  await page.evaluate(()=>renderProductionPlanTable());
  assert.deepEqual(await buttons.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-expanded'))),['false','true','false']);
  await page.evaluate(()=>{
    state.productionPlanJobs=window.detailsOriginalJobs;delete window.detailsOriginalJobs;
    state.productionPlanExpandedRows=new Set();renderProductionPlanTable();
  });
  assert.equal(await page.evaluate(()=>JSON.stringify(state.productionPlanJobs)),before);
  assert.equal(await page.locator('#productionPlanStatus').textContent(),status);
  assert.equal(fixture.actions.length,actions);
  assert.equal(await rows.count(),1);
  console.log(JSON.stringify({planDetails:true,keyboard:true,independentRows:true,planUnchanged:true}));
}

async function verifyProductionPlanDelivery(page, fixture) {
  const order=fixture.mockOrders.find(o=>o.productId==='NP-0001');
  const previous={deliveryType:order.deliveryType,dailyMinimumQuantity:order.dailyMinimumQuantity,endDate:order.endDate};
  Object.assign(order,{deliveryType:'daily',dailyMinimumQuantity:7000,endDate:'2020-01-01'});
  const target=await page.evaluate(()=>state.productionPlanJobs[0].targetQuantity);
  await page.evaluate(()=>{
    Object.assign(state.purchaseOrders.find(o=>o.purchaseOrderId===state.productionPlanJobs[0].purchaseOrderId),{deliveryType:'daily',dailyMinimumQuantity:7000,endDate:'2020-01-01'});
    renderProductionPlan();
  });
  const row=page.locator('#productionPlanTableBody [data-plan-row-id]');
  assert.equal((await page.locator('.production-plan-table th').nth(5).textContent()).trim(),'납기일');
  assert.match(await row.locator('td').nth(5).textContent(),/일 7,000개 이상/);
  assert.doesNotMatch(await row.textContent(),/2,000 개\/시간|2020-01-01/);
  assert.equal(await page.evaluate(()=>state.productionPlanJobs[0].targetQuantity),target);
  await row.locator('[data-plan-details-toggle]').click();
  assert.match(await page.locator('.production-plan-details-region').textContent(),/시간당 생산량.*2,000 개\/시간/s);
  await row.locator('[data-plan-field=stage]').selectOption('1');
  assert.match(await page.locator('.production-plan-details-region').textContent(),/1,000 개\/시간/);
  await row.locator('[data-plan-field=stage]').selectOption('2');
  await page.locator('.production-plan-table-wrap').screenshot({path:'/private/tmp/seungjin-plan-delivery-details.png'});
  await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].dailyMinimumQuantity===7000);
  assert.match(await row.locator('td').nth(5).textContent(),/일 7,000개 이상/);
  Object.assign(order,{deliveryType:'date',dailyMinimumQuantity:null,endDate:'2026-10-30'});
  await page.evaluate(()=>{
    Object.assign(state.purchaseOrders.find(o=>o.purchaseOrderId===state.productionPlanJobs[0].purchaseOrderId),{deliveryType:'date',dailyMinimumQuantity:null,endDate:'2026-10-30'});
    renderProductionPlan();
  });
  assert.equal((await row.locator('td').nth(5).textContent()).trim(),'2026-10-30');
  Object.assign(order,previous);
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].hourlyRate===2000);
  console.log(JSON.stringify({planDelivery:true,dailyMinimum7000:true,fixedDate:true,hourlyRateInDetails:true,stageChanges:true}));
}

async function verifyProductionPlanMetrics(page) {
  const row=page.locator('#productionPlanTableBody [data-plan-row-id]');
  const details=page.locator('.production-plan-details-row');
  await row.locator('[data-plan-details-toggle]').click();
  assert.equal(await details.locator('dt').count(),12);
  assert.deepEqual(await details.locator('dt').allTextContents(),['잔여 작업일','일일 목표 시간','총 소요 시간(예상)','발주량','최대 허용 LOSS','누적 생산량','누적 시간','실 근무시간','시간당 생산량','일일 필수 생산량','금일 생산량','달성률']);
  const target=await page.evaluate(()=>state.productionPlanJobs[0].targetQuantity);
  for(const [field,value] of Object.entries({loss:'200',actualWorkHours:'2',actualProduction:'800'})) {
    await details.locator(`[data-plan-field=${field}]`).fill(value);
  }
  assert.equal(await details.locator('[data-plan-detail-value=dailyRequired]').textContent(),'10,000 ea');
  assert.equal(await details.locator('[data-plan-detail-value=achievementRate]').textContent(),'8%');
  assert.equal(await page.evaluate(()=>state.productionPlanJobs[0].targetQuantity),target);
  await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].actualProduction===800);
  await row.locator('[data-plan-details-toggle]').click();
  assert.equal(await details.locator('[data-plan-detail-value=workDays]').textContent(),'0.4일');
  await row.locator('[data-plan-field=stage]').selectOption('1');
  await details.locator('[data-plan-field=actualProduction]').fill('100');
  await row.locator('[data-plan-field=stage]').selectOption('2');
  assert.equal(await details.locator('[data-plan-field=actualProduction]').inputValue(),'800');
  assert.equal(await details.locator('[data-plan-field=loss]').inputValue(),'200');
  await details.locator('[data-plan-field=actualProduction]').fill('-1');
  await page.locator('#saveProductionPlanButton').click();
  assert.match(await page.locator('#productionPlanStatus').textContent(),/입력값/);
  await details.locator('[data-plan-field=actualProduction]').fill('800');
  await page.locator('#saveProductionPlanButton').click();
  assert.match(await page.locator('#productionPlanStatus').textContent(),/저장했습니다/);
  for(const width of [1920,1280,960]) {
    await page.setViewportSize({width,height:900});
    const bounds=await page.locator('.production-plan-table-wrap').evaluate(wrap=>({width:wrap.clientWidth,scroll:wrap.scrollWidth}));
    assert.ok(bounds.scroll<=bounds.width+1);
    await page.locator('.production-plan-table-wrap').screenshot({path:`/private/tmp/seungjin-plan-metrics-${width}.png`});
  }
  await page.setViewportSize({width:1280,height:900});
  await row.locator('[data-plan-details-toggle]').click();
  console.log(JSON.stringify({planMetrics:12,inputsSaveReload:true,perStage:true,invalidInputsBlocked:true,mainTargetUnchanged:true}));
}

async function verifyProductionPlanSlide(page) {
  await page.waitForFunction(()=>document.querySelector('.production-plan-details-row').hidden);
  const before=await page.evaluate(()=>JSON.stringify(state.productionPlanJobs));
  const opening=await page.evaluate(()=>{
    const button=document.querySelector('[data-plan-details-toggle]');button.click();
    const row=document.querySelector('.production-plan-details-row');
    const wrapper=row.querySelector('.production-plan-details-collapse');
    const animation=wrapper.planDetailsAnimation;animation.pause();animation.currentTime=80;
    return {height:wrapper.getBoundingClientRect().height,full:wrapper.querySelector('.production-plan-details-space').getBoundingClientRect().height,hidden:row.hidden,inert:row.inert,expanded:button.getAttribute('aria-expanded')};
  });
  assert.ok(opening.height>0 && opening.height<opening.full,JSON.stringify(opening));
  assert.equal(opening.hidden,false);assert.equal(opening.inert,false);assert.equal(opening.expanded,'true');
  await page.evaluate(()=>document.querySelector('.production-plan-details-collapse').planDetailsAnimation.finish());
  await page.waitForFunction(()=>!document.querySelector('.production-plan-details-collapse').planDetailsAnimation);
  const closing=await page.evaluate(()=>{
    const button=document.querySelector('[data-plan-details-toggle]');button.click();
    const row=document.querySelector('.production-plan-details-row'),wrapper=row.querySelector('.production-plan-details-collapse');
    const animation=wrapper.planDetailsAnimation;animation.pause();animation.currentTime=80;
    return {height:wrapper.getBoundingClientRect().height,full:wrapper.querySelector('.production-plan-details-space').getBoundingClientRect().height,hidden:row.hidden,inert:row.inert,expanded:button.getAttribute('aria-expanded')};
  });
  assert.ok(closing.height>0 && closing.height<closing.full,JSON.stringify(closing));
  assert.equal(closing.hidden,false);assert.equal(closing.inert,true);assert.equal(closing.expanded,'false');
  await page.evaluate(()=>document.querySelector('.production-plan-details-collapse').planDetailsAnimation.finish());
  await page.waitForFunction(()=>document.querySelector('.production-plan-details-row').hidden);
  const rapid=await page.evaluate(()=>{
    const button=document.querySelector('[data-plan-details-toggle]'),wrapper=document.querySelector('.production-plan-details-collapse');
    button.click();wrapper.planDetailsAnimation.pause();wrapper.planDetailsAnimation.currentTime=80;
    const height=wrapper.getBoundingClientRect().height;
    button.click();button.click();
    const resumed=wrapper.getBoundingClientRect().height;
    const count=wrapper.getAnimations().length;wrapper.planDetailsAnimation.finish();
    return {height,resumed,count,expanded:button.getAttribute('aria-expanded')};
  });
  assert.ok(Math.abs(rapid.height-rapid.resumed)<1,JSON.stringify(rapid));assert.equal(rapid.count,1);assert.equal(rapid.expanded,'true');
  await page.waitForFunction(()=>!document.querySelector('.production-plan-details-collapse').planDetailsAnimation);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('[data-plan-details-toggle]').click();
  assert.equal(await page.locator('.production-plan-details-row').evaluate(row=>row.hidden),true);
  await page.locator('[data-plan-details-toggle]').click();
  assert.equal(await page.locator('.production-plan-details-collapse').evaluate(wrapper=>wrapper.getAnimations().length),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(state.productionPlanJobs)),before);
  await page.locator('[data-plan-details-toggle]').click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  console.log(JSON.stringify({detailsSlide:true,opening,closing,rapid,reducedMotion:true,inputsUnchanged:true}));
}

async function verifyProductionPlanAutoDays(page, fixture) {
  const product=fixture.mockProducts.find(p=>p.productCode==='NP-0001');
  const order=fixture.mockOrders.find(o=>o.productId==='NP-0001');
  const previousRate=product.processHourlyProductionRates['2도'];
  const previous={totalOrderQuantity:order.totalOrderQuantity,deliveryType:order.deliveryType,dailyMinimumQuantity:order.dailyMinimumQuantity,endDate:order.endDate};
  product.processHourlyProductionRates['2도']=751;
  Object.assign(order,{totalOrderQuantity:99100,deliveryType:'daily',dailyMinimumQuantity:7000});
  await page.evaluate(()=>{
    const job=state.productionPlanJobs[0];job.workDays=5;job.actualWorkHours=0;
    state.products.find(p=>p.productCode===job.productId).processHourlyProductionRates['2도']=751;
    Object.assign(state.purchaseOrders.find(o=>o.purchaseOrderId===job.purchaseOrderId),{totalOrderQuantity:99100,deliveryType:'daily',dailyMinimumQuantity:7000});
    renderProductionPlan();
  });
  const row=page.locator('#productionPlanTableBody [data-plan-row-id]'),details=page.locator('.production-plan-details-row');
  await row.locator('[data-plan-details-toggle]').click();
  assert.equal(await details.locator('[data-plan-field=workDays]').count(),0);
  assert.equal(await details.locator('[data-plan-detail-value=workDays]').textContent(),'16.5일');
  assert.equal(await details.locator('[data-plan-detail-value=totalExpectedHours]').textContent(),'131시간 58분');
  assert.equal(await details.locator('[data-plan-detail-value=dailyRequired]').textContent(),'7,000 ea');
  await page.locator('.production-plan-table-wrap').screenshot({path:'/private/tmp/seungjin-plan-auto-days.png'});
  await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].hourlyRate===751);
  await row.locator('[data-plan-details-toggle]').click();
  assert.equal(await details.locator('[data-plan-detail-value=workDays]').textContent(),'16.5일');
  await page.evaluate(()=>{
    const job=state.productionPlanJobs[0];
    state.products.find(p=>p.productCode===job.productId).processHourlyProductionRates['2도']=1000;
    Object.assign(state.purchaseOrders.find(o=>o.purchaseOrderId===job.purchaseOrderId),{totalOrderQuantity:68000,deliveryType:'date'});
    renderProductionPlan();
  });
  assert.equal(await details.locator('[data-plan-detail-value=workDays]').textContent(),'8.5일');
  assert.equal(await details.locator('[data-plan-detail-value=dailyRequired]').textContent(),'8,000 ea');
  product.processHourlyProductionRates['2도']=previousRate;Object.assign(order,previous);
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].hourlyRate===2000);
  console.log(JSON.stringify({autoWorkDays:true,sample:'16.5일',hours68:'8.5일',legacyManualIgnored:true,daily7000Unchanged:true,saveReload:true}));
}

async function verifyProductionPlanRemainingDays(page, fixture) {
  const product=fixture.mockProducts.find(p=>p.productCode==='NP-0001'),order=fixture.mockOrders.find(o=>o.productId==='NP-0001');
  const previousRate=product.processHourlyProductionRates['2도'],quantity=order.totalOrderQuantity;
  product.processHourlyProductionRates['2도']=1000;order.totalOrderQuantity=92000;
  await page.evaluate(()=>{
    const job=state.productionPlanJobs[0];job.actualWorkHours=null;
    state.products.find(p=>p.productCode===job.productId).processHourlyProductionRates['2도']=1000;
    state.purchaseOrders.find(o=>o.purchaseOrderId===job.purchaseOrderId).totalOrderQuantity=92000;
    renderProductionPlan();
  });
  const row=page.locator('#productionPlanTableBody [data-plan-row-id]'),details=page.locator('.production-plan-details-row');
  await row.locator('[data-plan-details-toggle]').click();
  assert.equal(await details.locator('dt').first().textContent(),'잔여 작업일');
  const input=details.locator('[data-plan-field=actualWorkHours]'),days=details.locator('[data-plan-detail-value=workDays]');
  const target=await page.evaluate(()=>state.productionPlanJobs[0].targetQuantity);
  for(const [hours,label] of [['','11.5일'],['8','10.5일'],['16.8','9.4일'],['91.99','0.1일'],['92','0일'],['100','0일'],['','11.5일']]) {
    await input.fill(hours);assert.equal(await days.textContent(),label);
    assert.equal(await details.locator('[data-plan-detail-value=totalExpectedHours]').textContent(),'92시간');
    assert.equal(await details.locator('[data-plan-detail-value=dailyRequired]').textContent(),'8,000 ea');
    assert.equal(await page.evaluate(()=>state.productionPlanJobs[0].targetQuantity),target);
  }
  await input.fill('8');await page.locator('#saveProductionPlanButton').click();await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].actualWorkHours===8);
  await row.locator('[data-plan-details-toggle]').click();assert.equal(await days.textContent(),'10.5일');
  await row.locator('[data-plan-field=stage]').selectOption('1');assert.equal(await input.inputValue(),'');
  await row.locator('[data-plan-field=stage]').selectOption('2');assert.equal(await input.inputValue(),'8');assert.equal(await days.textContent(),'10.5일');
  await page.locator('.production-plan-table-wrap').screenshot({path:'/private/tmp/seungjin-plan-remaining-days.png'});
  await input.fill('0');await page.locator('#saveProductionPlanButton').click();
  product.processHourlyProductionRates['2도']=previousRate;order.totalOrderQuantity=quantity;
  await page.reload();await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].hourlyRate===2000);
  console.log(JSON.stringify({remainingWorkDays:true,initial11_5:true,after8Hours10_5:true,immediateRefresh:true,minimumZero:true,saveReload:true,perStage:true,totalExpectedHoursUnchanged:true,dailyRequiredUnchanged:true,targetUnchanged:true}));
}

async function verifyProductionPlanLossDefault(page, fixture) {
  const row=page.locator('#productionPlanTableBody [data-plan-row-id]'),details=page.locator('.production-plan-details-row');
  const order=fixture.mockOrders.find(o=>o.productId==='NP-0001'),product=fixture.mockProducts.find(p=>p.productCode==='NP-0001');
  const quantity=order.totalOrderQuantity,rate=product.processHourlyProductionRates['2도'];
  await row.locator('[data-plan-details-toggle]').click();
  const input=details.locator('[data-plan-field=loss]');
  assert.equal(await input.inputValue(),'200');
  await input.fill('');await details.locator('dt').first().click();
  assert.equal(await input.inputValue(),'500');
  assert.equal(await page.evaluate(()=>state.productionPlanJobs[0].lossMode),'auto');
  order.totalOrderQuantity=99100;product.processHourlyProductionRates['2도']=751;
  await page.evaluate(()=>{
    const job=state.productionPlanJobs[0];
    state.purchaseOrders.find(o=>o.purchaseOrderId===job.purchaseOrderId).totalOrderQuantity=99100;
    state.products.find(p=>p.productCode===job.productId).processHourlyProductionRates['2도']=751;
    renderProductionPlan();
  });
  assert.equal(await input.inputValue(),'4955');
  assert.equal(await details.locator('[data-plan-detail-value=workDays]').textContent(),'16.5일');
  const target=await page.evaluate(()=>state.productionPlanJobs[0].targetQuantity);
  await page.locator('.production-plan-table-wrap').screenshot({path:'/private/tmp/seungjin-plan-loss-default.png'});
  await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].hourlyRate===751);
  await row.locator('[data-plan-details-toggle]').click();assert.equal(await input.inputValue(),'4955');
  await input.fill('123');await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].loss===123);
  await row.locator('[data-plan-details-toggle]').click();assert.equal(await input.inputValue(),'123');
  await input.fill('0');await page.locator('#saveProductionPlanButton').click();
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].lossMode==='manual');
  await row.locator('[data-plan-details-toggle]').click();assert.equal(await input.inputValue(),'0');
  assert.equal(await page.evaluate(()=>state.productionPlanJobs[0].targetQuantity),target);
  await page.evaluate(()=>{
    state.purchaseOrders.find(o=>o.purchaseOrderId===state.productionPlanJobs[0].purchaseOrderId).totalOrderQuantity=20000;
    renderProductionPlan();
  });
  assert.equal(await input.inputValue(),'0');
  await input.fill('');await details.locator('dt').first().click();assert.equal(await input.inputValue(),'1000');
  order.totalOrderQuantity=quantity;product.processHourlyProductionRates['2도']=rate;
  await page.reload();
  await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].hourlyRate===2000);
  await page.evaluate(()=>{
    const job=state.productionPlanJobs[0];job.loss=null;job.lossMode='auto';renderProductionPlan();
  });
  console.log(JSON.stringify({lossDefault5Percent:true,example99100:4955,manual123Preserved:true,manualZeroPreserved:true,clearResetsDefault:true,targetUnchanged:true}));
}

async function verifyProductionPlanCumulative(page) {
  const setup=await page.evaluate(()=>{
    const job=state.productionPlanJobs[0],prefix=PRODUCTION_PLAN_STORAGE_PREFIX;
    for(const key of Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)))if(key?.startsWith(prefix+':'))localStorage.removeItem(key);
    const sample=actual=>({...job,actualProduction:actual,stageDrafts:{}});
    const put=(factory,date,jobs,legacy=false)=>{
      const key=legacy?`${prefix}:${factory}:${date}`:`${prefix}:selected-job:${factory}:${date}`;
      localStorage.setItem(key,JSON.stringify({factory,date,jobs}));return key;
    };
    const priorKey=put('1공장','2026-09-16',[sample(1000)]);
    put('1공장','2026-09-16',[sample(9999)],true);
    put('1공장','2026-09-17',[{...sample(9000),stage:1,stageGroup:[1],stageDrafts:{2:{stageGroup:[2],actualProduction:2000}}}]);
    put('2공장','2026-09-18',[sample(700)]);
    put('1공장','2026-09-19',[sample(9000)]);
    put('1공장','2026-09-15',[{...sample(999),purchaseOrderId:'OTHER'},{...sample(999),process:'자동화'}]);
    put('1공장','2026-09-18',[sample(3000)]);
    Object.assign(job,{actualProduction:500,cumulativeProduction:123456});
    invalidateProductionPlanActualLedger();renderProductionPlan();
    return {priorKey,priorJob:sample(1500)};
  });
  const row=page.locator('#productionPlanTableBody [data-plan-row-id]'),details=page.locator('.production-plan-details-row');
  await row.locator('[data-plan-details-toggle]').click();
  const input=details.locator('[data-plan-field=actualProduction]'),total=details.locator('[data-plan-detail-value=cumulativeProduction]');
  assert.equal(await details.locator('[data-plan-field=cumulativeProduction]').count(),0);
  assert.match(await input.getAttribute('aria-label'),/금일 생산량/);
  assert.equal(await total.textContent(),'4,200 ea');
  await page.locator('#saveProductionPlanButton').click();await page.locator('#saveProductionPlanButton').click();
  await page.reload();await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].actualProduction===500);
  await row.locator('[data-plan-details-toggle]').click();assert.equal(await total.textContent(),'4,200 ea');
  await input.fill('600');assert.equal(await total.textContent(),'4,300 ea');
  await input.fill('');assert.equal(await total.textContent(),'3,700 ea');
  await input.fill('0');assert.equal(await total.textContent(),'3,700 ea');
  await input.fill('500');
  await page.evaluate(()=>window.productionInputBefore=document.querySelector('[data-plan-field=actualProduction]'));
  const other=await page.context().newPage();await other.goto(origin+'/storage-test.html');
  await other.evaluate(data=>localStorage.setItem(data.priorKey,JSON.stringify({jobs:[data.priorJob]})),setup);
  await page.waitForFunction(()=>document.querySelector('[data-plan-detail-value=cumulativeProduction]').textContent==='4,700 ea');
  assert.equal(await input.inputValue(),'500');
  assert.equal(await page.evaluate(()=>window.productionInputBefore===document.querySelector('[data-plan-field=actualProduction]')),true);
  await other.close();
  await page.locator('#saveProductionPlanButton').click();
  await page.locator('.production-plan-table-wrap').screenshot({path:'/private/tmp/seungjin-plan-cumulative.png'});
  await row.locator('[data-plan-details-toggle]').click();
  console.log(JSON.stringify({cumulativeProduction:true,total4700:true,currentEditImmediate:true,savesNotDuplicated:true,futureAndOtherOrdersExcluded:true,legacyDuplicatesExcluded:true,stageDraftsIncluded:true,crossTabRefresh:true,fieldLabel:'금일 생산량'}));
}

async function verifyProductionPlanCumulativeHours(page) {
  const setup=await page.evaluate(()=>{
    const job=state.productionPlanJobs[0],prefix=PRODUCTION_PLAN_STORAGE_PREFIX;
    for(const key of Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)))if(key?.startsWith(prefix+':'))localStorage.removeItem(key);
    const sample=hours=>({...job,actualWorkHours:hours,cumulativeHours:99999,stageDrafts:{}});
    const put=(factory,date,jobs,legacy=false)=>{
      const key=legacy?`${prefix}:${factory}:${date}`:`${prefix}:selected-job:${factory}:${date}`;
      localStorage.setItem(key,JSON.stringify({jobs}));return key;
    };
    const priorKey=put('1공장','2026-09-16',[sample(8)]);
    put('1공장','2026-09-16',[sample(999)],true);
    put('1공장','2026-09-17',[{...sample(99),stage:1,stageGroup:[1],stageDrafts:{2:{stageGroup:[2],actualWorkHours:4.5}}}]);
    put('2공장','2026-09-18',[sample(2.25)]);put('1공장','2026-09-19',[sample(999)]);
    put('1공장','2026-09-15',[{...sample(999),purchaseOrderId:'OTHER'},{...sample(999),process:'자동화'}]);
    put('1공장','2026-09-18',[sample(999)]);Object.assign(job,{actualWorkHours:7.25,cumulativeHours:99999});
    invalidateProductionPlanActualLedger();renderProductionPlan();return {priorKey,priorJob:sample(10)};
  });
  const row=page.locator('#productionPlanTableBody [data-plan-row-id]'),details=page.locator('.production-plan-details-row');
  await row.locator('[data-plan-details-toggle]').click();
  const input=details.locator('[data-plan-field=actualWorkHours]'),hours=details.locator('[data-plan-detail-value=cumulativeHours]');
  assert.equal(await details.locator('[data-plan-field=cumulativeHours]').count(),0);assert.equal(await input.getAttribute('step'),'0.01');
  const labels=await details.locator('dt').allTextContents();assert.equal(labels[labels.indexOf('누적 시간')+1],'실 근무시간');
  assert.equal(await hours.textContent(),'22시간');
  await page.locator('#saveProductionPlanButton').click();await page.locator('#saveProductionPlanButton').click();
  await page.reload();await page.waitForFunction(()=>state.purchaseOrdersLoaded && !state.productsLoadPromise && state.productionPlanJobs[0].actualWorkHours===7.25);
  await row.locator('[data-plan-details-toggle]').click();assert.equal(await hours.textContent(),'22시간');
  await input.fill('8.25');assert.equal(await hours.textContent(),'23시간');
  await input.fill('');assert.equal(await hours.textContent(),'14.75시간');await input.fill('0');assert.equal(await hours.textContent(),'14.75시간');
  await input.fill('-1');await page.locator('#saveProductionPlanButton').click();assert.match(await page.locator('#productionPlanStatus').textContent(),/입력값/);
  await input.fill('7.25');await input.focus();
  await page.evaluate(()=>window.hoursInputBefore=document.querySelector('[data-plan-field=actualWorkHours]'));
  const other=await page.context().newPage();await other.goto(origin+'/storage-test.html');
  await other.evaluate(data=>localStorage.setItem(data.priorKey,JSON.stringify({jobs:[data.priorJob]})),setup);
  await page.waitForFunction(()=>document.querySelector('[data-plan-detail-value=cumulativeHours]').textContent==='24시간');
  assert.equal(await input.inputValue(),'7.25');assert.equal(await page.evaluate(()=>window.hoursInputBefore===document.activeElement),true);await other.close();
  await page.locator('#saveProductionPlanButton').click();
  for(const width of [1920,1280,960]) {
    await page.setViewportSize({width,height:900});
    const bounds=await page.locator('.production-plan-details-metrics').evaluate(grid=>{
      const cells=[...grid.children],a=cells[6].getBoundingClientRect(),b=cells[7].getBoundingClientRect();
      return {width:grid.clientWidth,scroll:grid.scrollWidth,sameRow:Math.abs(a.y-b.y)<1,right:b.x>a.x};
    });
    assert.ok(bounds.scroll<=bounds.width+1);assert.ok(bounds.sameRow && bounds.right);
    await page.locator('.production-plan-table-wrap').screenshot({path:`/private/tmp/seungjin-plan-work-hours-${width}.png`});
  }
  await page.setViewportSize({width:1280,height:900});await row.locator('[data-plan-details-toggle]').click();
  console.log(JSON.stringify({cumulativeHours:true,sum24:true,legacyManualIgnored:true,savesNotDuplicated:true,stageDraftsIncluded:true,otherFactoryIncluded:true,futureExcluded:true,crossTabFocusPreserved:true,adjacentHoursFields:true}));
}

async function verifyProductionPlanStorageQuota(page) {
  const filled = await page.evaluate(() => {
    const cacheKey = 'seungjinAdminCache:v3:dev:inbounds:quota-test';
    let value = '', chunk = 512 * 1024, blocked = false;
    while (chunk >= 1) {
      try { localStorage.setItem(cacheKey, value + 'x'.repeat(chunk)); value += 'x'.repeat(chunk); }
      catch(error) { if(error.name !== 'QuotaExceededError') throw error; blocked = true; chunk = Math.floor(chunk/2); }
    }
    state.productionPlanDate = '2026-09-19';
    Object.assign(state.productionPlanJobs[0], {machine:'4호기',cumulativeProduction:11000,cumulativeHours:11,loss:0,note:'입력 내용 보존'});
    return {blocked,cacheLength:value.length,key:getProductionPlanStorageKey()};
  });
  assert.equal(filled.blocked,true);
  await page.locator('#saveProductionPlanButton').click();
  assert.match(await page.locator('#productionPlanStatus').textContent(), /저장했습니다/);
  const saved = await page.evaluate(key => ({draft:JSON.parse(localStorage.getItem(key)),cache:localStorage.getItem('seungjinAdminCache:v3:dev:inbounds:quota-test')}), filled.key);
  assert.equal(saved.cache,null);
  assert.equal(saved.draft.jobs[0].cumulativeProduction,11000);
  assert.equal(saved.draft.jobs[0].cumulativeHours,11);
  assert.equal(saved.draft.jobs[0].note,'입력 내용 보존');
  await page.reload();
  await page.waitForFunction(() => state.purchaseOrdersLoaded && !state.productsLoadPromise);
  await page.evaluate(() => setProductionPlanDate('2026-09-19'));
  const loaded = await page.evaluate(() => state.productionPlanJobs[0]);
  assert.equal(loaded.cumulativeProduction,11000);assert.equal(loaded.cumulativeHours,11);assert.equal(loaded.note,'입력 내용 보존');
  console.log(JSON.stringify({quotaRecovery:true,cacheCharacters:filled.cacheLength}));
}

async function verifyPurchaseOrderDelivery(page, fixture) {
  await page.goto(origin + '/admin.html#purchase-orders');
  await page.reload();
  await page.waitForFunction(() => state.purchaseOrdersLoaded && !state.productsLoadPromise);
  await page.locator('#newPurchaseOrderButton').click();
  assert.equal(await page.locator('#purchaseOrderDeliveryType').inputValue(), 'date');
  assert.equal(await page.locator('#purchaseOrderEndDateField').isVisible(), true);
  assert.equal(await page.locator('#purchaseOrderDailyMinimumField').isVisible(), false);
  await page.locator('#purchaseOrderProductSearchButton').click();
  await page.locator('#inboundProductPickerList .picker-product[data-product="NP-0001"]').click();
  // The picker deliberately focuses the order name on its next event turn.
  await page.waitForFunction(() => document.activeElement === document.querySelector('#purchaseOrderRound'));
  await page.locator('#purchaseOrderRound').fill('일 생산 테스트');
  await page.locator('#purchaseOrderQuantity').fill('100000');
  await page.locator('#purchaseOrderDeliveryType').selectOption('daily');
  assert.equal(await page.locator('#purchaseOrderEndDateField').isVisible(), false);
  assert.equal(await page.locator('#purchaseOrderDailyMinimumField').isVisible(), true);
  await page.locator('#purchaseOrderDailyMinimumQuantity').fill('0');
  const prepared = await page.evaluate(() => getPurchaseOrderPayload());
  assert.equal(prepared.productId, 'NP-0001');
  assert.equal(prepared.totalOrderQuantity, 100000);
  assert.match(prepared.startDate, /^\d{4}-\d{2}-\d{2}$/);
  const writes = fixture.actions.filter(a => a === 'createPurchaseOrder').length;
  await page.evaluate(() => savePurchaseOrder());
  assert.match(await page.locator('#purchaseOrderFormMessage').textContent(), /1 이상의 정수/);
  assert.equal(fixture.actions.filter(a => a === 'createPurchaseOrder').length, writes);
  await page.locator('#purchaseOrderDailyMinimumQuantity').fill('10000');
  await page.locator('#savePurchaseOrderButton').click();
  await page.waitForFunction(() => document.querySelector('#purchaseOrderModal').hidden);
  const row = fixture.mockOrders.find(o => o.orderRound === '일 생산 테스트');
  assert.equal(row.deliveryType, 'daily');
  assert.equal(row.dailyMinimumQuantity, 10000);
  assert.equal(row.endDate, '');
  assert.match(await page.locator('#purchaseOrderTableBody').textContent(), /일 10,000개 이상/);
  await page.reload();
  await page.waitForFunction(() => state.purchaseOrdersLoaded && !state.productsLoadPromise);
  await page.evaluate(id => openPurchaseOrderModal(getPurchaseOrderById(id)), row.purchaseOrderId);
  assert.equal(await page.locator('#purchaseOrderDeliveryType').inputValue(), 'daily');
  assert.equal(await page.locator('#purchaseOrderDailyMinimumQuantity').inputValue(), '10,000');
  await page.locator('#purchaseOrderDailyMinimumQuantity').fill('12000');
  await page.locator('#savePurchaseOrderButton').click();
  await page.waitForFunction(() => document.querySelector('#purchaseOrderModal').hidden);
  assert.equal(fixture.mockOrders.find(o => o.purchaseOrderId === row.purchaseOrderId).dailyMinimumQuantity, 12000);
  await page.evaluate(id => openPurchaseOrderModal(getPurchaseOrderById(id)), row.purchaseOrderId);
  await page.screenshot({path:'/private/tmp/seungjin-daily-delivery-form.png',fullPage:true});
  await page.evaluate(() => closePurchaseOrderModal());
  await page.goto(origin + '/admin.html#production-plan');
  await page.evaluate(id => {
    const job = state.productionPlanJobs[0];
    changeProductionPlanOrder(job, id);
    renderProductionPlan();
    state.productionPlanJobs.forEach(row => { row.cumulativeProduction = 20000; row.cumulativeHours = 5; row.loss = 0; });
    renderProductionPlan();
  }, row.purchaseOrderId);
  assert.equal(await page.locator('#productionPlanDetailPanel, #productionPlanBoardPanel, #generateProductionPlanButton').count(), 0);
  const scheduled = await page.evaluate(() => ({target:state.productionPlanJobs[0].targetQuantity,missing:state.productionPlanJobs[0].planMissing}));
  assert.equal(scheduled.missing, false);
  assert.equal(scheduled.target, 16000);
  await page.goto(origin + '/admin.html#purchase-orders');
  await page.evaluate(id => openPurchaseOrderModal(getPurchaseOrderById(id)), row.purchaseOrderId);
  await page.locator('#purchaseOrderDeliveryType').selectOption('date');
  assert.equal(await page.locator('#purchaseOrderDailyMinimumField').isVisible(), false);
  assert.equal(await page.locator('#purchaseOrderDailyMinimumQuantity').isDisabled(), true);
  await page.evaluate(() => purchaseOrderEndDateControl.setValue('2026-10-30'));
  await page.locator('#savePurchaseOrderButton').click();
  await page.waitForFunction(() => document.querySelector('#purchaseOrderModal').hidden);
  const dated = fixture.mockOrders.find(o => o.purchaseOrderId === row.purchaseOrderId);
  assert.equal(dated.deliveryType, 'date');
  assert.equal(dated.dailyMinimumQuantity, null);
  assert.equal(dated.endDate, '2026-10-30');
  assert.match(await page.locator('#purchaseOrderTableBody').textContent(), /납기 2026-10-30/);
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
    await verifyProductionPlanPilot(page, fixture);
    await verifyProductionPlanPrintTypes(page, fixture);
    await verifyProductionPlanDetails(page, fixture);
    await verifyProductionPlanDelivery(page, fixture);
    await verifyProductionPlanMetrics(page);
    await verifyProductionPlanSlide(page);
    await verifyProductionPlanAutoDays(page, fixture);
    await verifyProductionPlanRemainingDays(page, fixture);
    await verifyProductionPlanLossDefault(page, fixture);
    await verifyProductionPlanCumulative(page);
    await verifyProductionPlanCumulativeHours(page);
    await verifyProductionPlanStorageQuota(page);
    await verifyPurchaseOrderDelivery(page, fixture);
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
    console.log(JSON.stringify({ passed: true, purchaseOrderDelivery: true, productionPlanPilot: true, productionPlanPrintTypes: true, productionPlanQuotaRecovery: true, monthlyConfirmation: true, uploads: fixture.uploads, timing, consoleErrors: errors.length }));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
