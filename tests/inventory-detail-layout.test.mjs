import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
const extract=name=>source.match(new RegExp('^function '+name+'\\([^]*?\\n}', 'm'))[0];
const c=vm.createContext({Intl,Date,Number,formatNumber:v=>Number(v).toLocaleString('ko-KR')});
for(const name of ['normalizeEditableValue','toDateInputValue','formatInventoryStorageDays']) vm.runInContext(extract(name),c);
test('storage duration uses Korea calendar days, validates dates, and does not invent missing dates',()=>{
 const now=new Date('2026-09-17T15:30:00Z');
 assert.equal(c.formatInventoryStorageDays('2026-09-17',now),'1일');
 assert.equal(c.formatInventoryStorageDays('2026.09.18',now),'0일');
 for(const date of ['',null,'-', '2026-02-30','2026-09-19'])assert.equal(c.formatInventoryStorageDays(date,now),'-');
});
test('inventory detail routing keeps audit, attachments, image handlers, and all original data',()=>{
 const imageButton={dataset:{inventoryDetailProductImage:'0'},addEventListener:(event,fn)=>{imageButton.click=fn;}};
 const app=vm.createContext({state:{activeDetailInboundSource:'inventory'},inboundDetailContent:{innerHTML:'',querySelectorAll:()=>[imageButton]},
 findInboundQrProduct:()=>({}),getProductImageUrls:()=>['https://example.com/product.png'],normalizeProductImageUrls:urls=>[...new Set(urls)],normalizeInboundSummaryProductImageUrl:x=>x,
 getInboundRecordRemainderQuantities:()=>[30,45],formatInventoryStorageDays:()=> '1일',formatDetailMetric:(v,u)=>`${v} ${u}`,
 renderInventoryAuditBoxStatus:()=>'<section data-inventory-audit-drop>실물 확인</section>',renderInboundAttachmentDetail:()=>'<a href="https://example.com/invoice">거래명세서</a>',
 openProductImageGallery:(urls,name,index)=>{app.opened={urls,name,index};}});
 for(const name of ['escapeHtml','escapeAttribute','normalizeDisplayValue','renderInventoryDetailLayout','renderInboundDetail'])vm.runInContext(extract(name),app);
 const data={managementId:'IN-1',productId:'P-1',productName:'<긴 제품명>',clientName:'거래처',process:'3도',stockStatus:'출고대기',inboundDate:'2026-09-17',dueDate:'2026-09-25',currentTotalQuantity:75,currentBoxCount:2,storage:'A',inboundType:'정상입고',inboundTime:'17:19',purchaseOrderRound:'09/17 발주',purchaseOrderId:'PO-1',batch:'2차',inboundTotalQuantity:1000,boxQuantity:500,inboundBoxCount:1,remainQuantity:75,boxTotalCount:3,inspectionQuantity:10,defectQuantity:2,defectRate:'0.2%',defectReason:'스크래치',registrant:'담당자',lastInventoryCheckedAt:'2026-09-18 08:47:01',note:'메모'};
 app.renderInboundDetail(data);
 const html=app.inboundDetailContent.innerHTML;
 for(const text of ['inventory-detail-layout','입고일','보관기간 (입고일 기준)','출고대기','PO-1','2차','0.2%','스크래치','2026-09-18 08:47:01','1번 30 ea, 2번 45 ea','data-inventory-audit-drop','https://example.com/invoice','메모'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('&lt;긴 제품명&gt;'));assert.ok(!html.includes('<긴 제품명>'));
 imageButton.click();assert.equal(app.opened.index,0);assert.equal(app.opened.name,data.productName);
});
