// Render the real label markup with production CSS; keep network and business data out of this check.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.QR_PRINT_OUTPUT || '/private/tmp/seungjin-qr-print-check');
const baseline = process.argv.includes('--baseline');

(async () => {
  const { adminSource, loadFunctions } = await import('../tests/helpers/frontend-runtime.mjs');
  await import('../frontend/qr-label.js');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const runtime = loadFunctions(adminSource, ['renderInboundQrReferenceLabel','renderQrReferenceProcessRow'], {
    SeungjinQrLabel: globalThis.SeungjinQrLabel, escapeHtml: escape, escapeAttribute: escape,
    parseShippingSettlementNumber: Number, getInboundRecordRemainderQuantities: () => [],
    formatNumber: value => Number(value).toLocaleString('ko-KR')
  });
  fs.mkdirSync(output, {recursive:true});
  const css = ['styles.css','qr-prd-legacy.css','qr-process-groups.css'].map(file => fs.readFileSync(path.join(root,'frontend',file),'utf8')).join('\n');
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || undefined});
  const measurements = [];
  try {
    const page = await browser.newPage({viewport:{width:1400,height:1100}});
    await page.route('**/*', route => route.abort());
    for (const columns of [2,4]) {
      const names = ['오브제 외용기','메디큐브 이지에프 엔에이디 퍼밍멀티밤 10g 박스 외용기',
        'PREQUER SKIN (SPF SILICONE SCAR STICK 16g) 백충진 외용기 - 캡',
        '에뛰드 팡팡 헤어카라 매우 긴 제품명 줄바꿈 확인용 실크 인쇄 외용기'];
      const sheets = Array.from({length:2}, (_,sheet) => `<section class="qr-sheet${columns===4?' qr-sheet-work':''}">${Array.from({length:columns*5},(_,i) => runtime.renderInboundQrReferenceLabel({
        box:{boxId:`CHECK-${sheet}-${i}`,currentQuantity:[594,2002,123456,240][i%4]}, inbound:{boxQuantity:2002},
        sequence:i+1,total:columns*5,qrData:'CHECK',productName:names[i%4],batchText:'44차',inboundDate:'2026.11.12',
        variantClass:columns===4?'box-qr-label-layout-two':'',
        processData:{summary:sheet?'6도':'3도',processRows:globalThis.SeungjinQrLabel.getProcessRows({finalProcess:sheet?'6도':'3도',processStage1:'실크',processStage2:'박'})}
      })).join('')}</section>`).join('');
      await page.setContent(`<style>${css}</style><body class="admin-body"><div id="inboundQrModal" class="modal-backdrop"><div class="qr-modal"><div class="qr-print-area">${sheets}</div></div></div></body>`);
      await page.evaluate(() => {
        const canvas=document.createElement('canvas'); canvas.width=canvas.height=29;
        const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,29,29);c.fillStyle='#000';
        for(let y=2;y<27;y++)for(let x=2;x<27;x++)if((x*y+x+y)%3===0)c.fillRect(x,y,1,1);
        const src=canvas.toDataURL(); document.querySelectorAll('.box-qr-image').forEach(img=>img.src=src);
      });
      await page.evaluate(() => Promise.all([...document.images].map(img=>img.decode())));
      for(const media of ['screen','print']) {
        await page.emulateMedia({media});
        const metrics=await page.locator('.box-qr-label-reference').evaluateAll(labels=>labels.map(label=>{
          const box=label.getBoundingClientRect(), q=label.querySelector('.box-qr-image').getBoundingClientRect();
          const main=label.querySelector('.box-qr-reference-main').getBoundingClientRect();
          const font=selector=>parseFloat(getComputedStyle(label.querySelector(selector)).fontSize);
          return {qrX:q.x-box.x,qrY:q.y-box.y,qrBottom:q.bottom-box.y,mainTop:main.top-box.y,mainBottom:main.bottom-box.y,
            title:font('.box-qr-reference-final-process'),quantity:font('.box-qr-reference-quantity-number'),
            caption:font('.box-qr-reference-quantity-label'),product:font('.box-qr-reference-product-name')};
        }));
        for(let offset=0;offset<metrics.length;offset+=columns*5){
          const sheetMetrics=metrics.slice(offset,offset+columns*5);
          if(!baseline) assert.ok(Math.max(...sheetMetrics.map(m=>m.qrY))-Math.min(...sheetMetrics.map(m=>m.qrY))<0.2,'QR must not move when a name wraps');
        }
        if(!baseline) for(const m of metrics){
          for(const key of ['quantity','caption','product']) assert.ok(Math.abs(m[key]-m.title)<0.02,`${columns}-column ${media}: ${key} must match title`);
          assert.ok(m.qrY>=m.mainTop && m.qrBottom<=m.mainBottom+0.2,'QR stays inside product row');
        }
        measurements.push({columns,media,first:metrics[0],long:metrics[2]});
        await page.screenshot({path:path.join(output,`${columns}-${media}.png`),fullPage:true});
      }
      await page.pdf({path:path.join(output,`${columns}-columns.pdf`),preferCSSPageSize:true,printBackground:true});
    }
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(measurements,null,2));
    console.log(JSON.stringify({passed:true,baseline,output,measurements}));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
