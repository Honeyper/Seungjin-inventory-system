import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {loadFunctions,adminSource} from './helpers/frontend-runtime.mjs';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
function runtime(names){
 let inputs=names.map(value=>({value,focus(){this.focused=true;}})),html='';
 const container={get innerHTML(){return html;},set innerHTML(value){html=value;inputs=[...value.matchAll(/value="([^"]*)"/g)].map(match=>({value:match[1],focus(){this.focused=true;}}));},querySelectorAll:selector=>selector==='input'?inputs:[]};
 const c=loadFunctions(adminSource,['getCommonContainerProductNameValues','renderCommonContainerProductNameFields','addCommonContainerProductName','removeCommonContainerProductName','syncCommonContainerFields'],{productShippingProductNames:container,productCommonContainer:{checked:true},productCommonContainerFields:{hidden:false},productShippingProductTotal:{textContent:''},addProductShippingName:{},state:{isSavingProduct:false},escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;')});
 return {c,inputs:()=>inputs,container};
}
test('20개에서 추가해도 기존 이름을 보존하고 마지막 입력칸으로 이동한다',()=>{
 const names=Array.from({length:25},(_,i)=>'제품 '+(i+1)),t=runtime(names);t.c.addCommonContainerProductName();assert.equal(t.inputs().length,26);assert.deepEqual(t.inputs().slice(0,25).map(i=>i.value),names);assert.equal(t.inputs()[25].focused,true);assert.equal(t.c.productShippingProductTotal.textContent,'26종');
 t.c.removeCommonContainerProductName(3);assert.equal(t.inputs().length,25);assert.equal(t.inputs()[3].value,'제품 5');assert.equal(t.inputs()[3].focused,true);assert.match(t.container.innerHTML,/출고 시 제품명 25/);
});
test('기존 이름이 저장된 개수보다 많아도 자르지 않고, 마지막 칸과 저장 중인 칸은 삭제하지 않는다',()=>{
 const t=runtime([]);t.c.renderCommonContainerProductNameFields(20,Array.from({length:23},(_,i)=>'제품 '+i));assert.equal(t.inputs().length,23);
 t.c.state.isSavingProduct=true;t.c.addCommonContainerProductName();t.c.removeCommonContainerProductName(1);assert.equal(t.inputs().length,23);
 t.c.state.isSavingProduct=false;t.c.renderCommonContainerProductNameFields(1,[]);t.c.removeCommonContainerProductName(0);assert.equal(t.inputs().length,1);
});
test('25개 출고 제품명을 제품 저장과 재조회 자료에 그대로 보존한다',()=>{
 const names=Array.from({length:25},(_,i)=>'출고 제품 '+i);
 const source={products:[],orders:[],inbounds:[],records:[],boxes:[]};
 const result=applyMutation('createProduct',{'제품명':'공용 용기','1도 공정':'실크','업체명':'테스트','박스당 수량':100,'트레이 수량':10,'공용용기 제품':'유','출고시 제품 종류 수':names.length,'출고시 제품명 목록':JSON.stringify(names)},source);
 assert.equal(result.changes.products.upserts[0].data.shippingProductTypeCount,25);assert.deepEqual(result.changes.products.upserts[0].data.shippingProductNames,names);
 const gas=readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');const c=loadFunctions(gas,['getCommonContainerProductPayload_','normalizeCommonContainerProductNames_','isCommonContainerProduct_']);
 const mirrored=c.getCommonContainerProductPayload_({'공용용기 제품':'유','출고시 제품 종류 수':25,'출고시 제품명 목록':JSON.stringify(names)});assert.equal(mirrored.shippingProductTypeCount,25);assert.deepEqual(JSON.parse(JSON.stringify(mirrored.shippingProductNames)),names);
});
