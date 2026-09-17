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
 const c=vm.createContext({getProductProcessPayload_:()=>({finalProcess:'1도'}),getCommonContainerProductPayload_:()=>({shippingProductNames:[]}),getProductSheet_:()=>sheet,ensureProductOptionHeaders_:()=>{},findHeaderRow_:()=>({headers,rowIndex:0}),indexHeaders_:()=>Object.fromEntries(headers.map((h,i)=>[h,i])),findHeaderIndex_:(indexes,keys)=>indexes[keys[0]]??-1,setRowValue_:(r,indexes,keys,value)=>{if(indexes[keys[0]]!==undefined)r[indexes[keys[0]]]=value;},pickCell_:(r,indexes,keys)=>r[indexes[keys[0]]]||'',normalizeClientName_:v=>v,normalizeProductImageUrls_:()=>[],Utilities:{formatDate:()=>''},getHeaderWriteRange_:r=>({startColumn:1,row:r,headers}),fillBlankCells_:r=>r,clearLeadingBlankHeaderCells_:()=>{},applyProductRowTemplate_:()=>{}});
 vm.runInContext(section('parseProductHourlyProductionRate_')+section('updateProduct'),c);
 const edit=rate=>{c.updateProduct({...payload,productId:'P1',...rate});return written[headers.indexOf('시간당 평균 생산량')];};
 assert.equal(edit({}),1200);assert.equal(edit({'시간당 평균 생산량':1400.25}),1400.25);assert.equal(edit({'시간당 평균 생산량':null}),'');
});
