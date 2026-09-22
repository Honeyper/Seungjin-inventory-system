import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const initial=()=>({products:[],orders:[],inbounds:[],records:[],boxes:[]});
const payload={'업체명':'테스트','제품명':'생산량 검증 제품','박스당 수량':100,'트레이 수량':10,'최종공정':'2도','1도 공정':'실크','2도 공정':'박'};
const now=new Date('2026-09-17T01:00:00Z');
const create=rate=>applyMutation('createProduct',{...payload,...rate},initial(),now);
test('optional hourly rate is numeric in product DB change and supports decimals',()=>{
 const m=create({'시간당 평균 생산량':1277.58});
 assert.equal(m.state.products[0].hourlyProductionRate,1277.58);
 assert.equal(m.changes.products.upserts[0].data.hourlyProductionRate,1277.58);
 assert.equal(m.state.products[0].processStage2,'박');
 assert.equal(create({}).state.products[0].hourlyProductionRate,null);
});
test('editing preserves omitted rate, updates numeric rate and allows explicitly clearing it',()=>{
 const first=create({'시간당 평균 생산량':1200});const id=first.result.productId;
 const edit=p=>applyMutation('updateProduct',{productId:id,...p},first.state,now).state.products[0];
 assert.equal(edit({'비고':'메모'}).hourlyProductionRate,1200);
 assert.equal(edit({'시간당 평균 생산량':1500.5}).hourlyProductionRate,1500.5);
 assert.equal(edit({'시간당 평균 생산량':null}).hourlyProductionRate,null);
 assert.equal(edit({'시간당 평균 생산량':''}).hourlyProductionRate,null);
 assert.equal(edit({hourlyProductionRate:800}).hourlyProductionRate,800);
});
test('invalid hourly rates fail without accepting zero, negative, or nonfinite values',()=>{
 for(const value of [0,-1,'NaN','abc',Infinity,'Infinity',Number.MAX_SAFE_INTEGER+1]) {
  assert.throws(()=>create({'시간당 평균 생산량':value}),/시간당 평균 생산량/);
 }
});
const gas=fs.readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');
const section=name=>{const start=gas.indexOf('function '+name+'(');return gas.slice(start,gas.indexOf('\nfunction ',start+1));};
test('sheet parser mirrors canonical numeric and empty values',()=>{
 const c=vm.createContext({});vm.runInContext(section('parseProductHourlyProductionRate_'),c);
 for(const v of [null,undefined,'','-'])assert.equal(c.parseProductHourlyProductionRate_(v),null);
 assert.equal(c.parseProductHourlyProductionRate_('1,277.58'),1277.58);
 for(const v of [0,-2,'abc',Infinity])assert.throws(()=>c.parseProductHourlyProductionRate_(v),/시간당 평균 생산량/);
});
test('sheet backup updates the rate only when supplied and preserves other product fields',()=>{
 const row={'제품 ID':'P1','업체명':'테스트','제품명':'제품','시간당 평균 생산량':1200};
 let written;const headers=Object.keys(row);
 const sheet={getDataRange:()=>({getDisplayValues:()=>[headers,headers.map(h=>row[h])]}),getRange:()=>({setValues:values=>{written=values[0];}})};
 const c=vm.createContext({getProductProcessPayload_:()=>({finalProcess:'1도'}),getCommonContainerProductPayload_:()=>({shippingProductNames:[]}),getProductSheet_:()=>sheet,ensureProductCommonContainerHeaders_:()=>{},findHeaderRow_:()=>({headers,rowIndex:0}),indexHeaders_:()=>Object.fromEntries(headers.map((h,i)=>[h,i])),findHeaderIndex_:(indexes,keys)=>indexes[keys[0]]??-1,setRowValue_:(r,indexes,keys,value)=>{if(indexes[keys[0]]!==undefined)r[indexes[keys[0]]]=value;},pickCell_:(r,indexes,keys)=>r[indexes[keys[0]]]||'',normalizeClientName_:v=>v,normalizeProductImageUrls_:()=>[],Utilities:{formatDate:()=>''},getHeaderWriteRange_:r=>({startColumn:1,row:r,headers}),fillBlankCells_:r=>r,clearLeadingBlankHeaderCells_:()=>{},applyProductRowTemplate_:()=>{}});
 vm.runInContext(section('parseProductHourlyProductionRate_')+section('updateProduct'),c);
 const edit=rate=>{c.updateProduct({...payload,productId:'P1',...rate});return written[headers.indexOf('시간당 평균 생산량')];};
 assert.equal(edit({}),1200);assert.equal(edit({'시간당 평균 생산량':1400.25}),1400.25);assert.equal(edit({'시간당 평균 생산량':null}),'');
});
test('process rates persist independently and round trip with unrelated edits',()=>{
 const first=create({processHourlyProductionRates:{'1도':1200,'2도':600}});
 assert.deepEqual(first.state.products[0].processHourlyProductionRates,{'1도':1200,'2도':600});
 const next=applyMutation('updateProduct',{productId:first.result.productId,'비고':'유지'},first.state,now);
 assert.deepEqual(next.state.products[0].processHourlyProductionRates,{'1도':1200,'2도':600});
});
test('joined processes have one independent rate and never inherit an individual stage rate',()=>{
 const first=create({processHourlyProductionRates:{'1도':1200,'2도':600}});
 const edit=p=>applyMutation('updateProduct',{productId:first.result.productId,processGroups:[[1,2]],...p},first.state,now).state.products[0];
 assert.deepEqual(edit({}).processHourlyProductionRates,{'1도+2도':null});
 assert.deepEqual(edit({processHourlyProductionRates:{'1도+2도':850}}).processHourlyProductionRates,{'1도+2도':850});
 assert.throws(()=>edit({processHourlyProductionRates:{'1도':1200}}),/공정 구성/);
});
test('per-process values reject invalid numbers and support clearing and single processes',()=>{
 for(const value of [0,-1,'abc',Infinity]) assert.throws(()=>create({processHourlyProductionRates:{'1도':value}}),/생산량/);
 assert.throws(()=>create({processHourlyProductionRates:[]}),/생산량/);
 assert.deepEqual(create({processHourlyProductionRates:{'1도':null,'2도':12.5}}).state.products[0].processHourlyProductionRates,{'1도':null,'2도':12.5});
 const coating=applyMutation('createProduct',{...payload,'최종공정':'코팅',processHourlyProductionRates:{'코팅':300}},initial(),now);
 assert.deepEqual(coating.state.products[0].processHourlyProductionRates,{'코팅':300});
});
test('editor keeps separate drafts per process group and resets them for another product',()=>{
 const source=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
 const extract=name=>source.match(new RegExp(`^function ${name}\\([^]*?\\n}`,'m'))[0];
 let inputs=[];
 const container={replaceChildren(){inputs=[];},querySelectorAll:()=>inputs,set innerHTML(html){inputs=[...html.matchAll(/data-process-hourly-rate="([^"]+)"[^]*?value="([^"]*)"/g)].map(m=>({dataset:{processHourlyRate:m[1]},value:m[2]}));}};
 const c=vm.createContext({document:{querySelector:()=>container,querySelectorAll:()=>inputs},state:{},escapeHtml:String,normalizeEditableValue:v=>String(v||'').trim(),SeungjinQrLabel:{getProcessGroups:p=>p.processGroups||[]},productForm:{querySelector:()=>null}});
 for(const key of ['productProcessType','productFinalProcess','productProcessStages','productProcessSummary',...Array.from({length:6},(_,i)=>`productProcessStage${i+1}`)])c[key]={value:'',dataset:{}};
 c.productProcessJoins=Array.from({length:5},(_,i)=>({checked:false,dataset:{productProcessJoin:String(i+2)}}));
 vm.runInContext('let productProcessRateDraft = {};'+['normalizeProductProcessMethod','getProductProcessStageControls','getProductProcessFormGroups','getProductProcessRoute','readProductProcessHourlyRates','renderProductProcessHourlyRates','setProductProcessForm','syncProductProcessFields'].map(extract).join('\n'),c);
 const product={finalProcess:'2도',processStage1:'실크',processStage2:'박',processGroups:[[1],[2]],processHourlyProductionRates:{'1도':1200,'2도':600}};
 c.setProductProcessForm(product);
 assert.equal(JSON.stringify(c.readProductProcessHourlyRates()),JSON.stringify({'1도':1200,'2도':600}));
 inputs[0].value='1500';c.productProcessJoins[0].checked=true;c.syncProductProcessFields();
 assert.equal(inputs.length,1);assert.equal(inputs[0].value,'');inputs[0].value='900';
 c.productProcessJoins[0].checked=false;c.syncProductProcessFields();assert.equal(inputs[0].value,'1500');
 c.productProcessJoins[0].checked=true;c.syncProductProcessFields();assert.equal(inputs[0].value,'900');
 c.setProductProcessForm({...product,processHourlyProductionRates:{}});assert.ok(inputs.every(i=>i.value===''));
});
