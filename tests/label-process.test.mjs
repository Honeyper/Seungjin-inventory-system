import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
await import('../frontend/qr-label.js');
const {getProcessRows,getProcessSummary}=globalThis.SeungjinQrLabel;
const admin=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
function section(a,b){return admin.slice(admin.indexOf(a),admin.indexOf(b,admin.indexOf(a)));}
function form(){
 const c=vm.createContext({state:{},normalizeEditableValue:v=>String(v||'').trim(),getCommonContainerProductNameValues:()=>[],session:{name:'테스트'},productForm:{querySelector:()=>null}});
 for(const name of ['productProcessType','productProcessStage1','productProcessStage2','productProcessStage3','productProcessStages','productProcessSummary','productFinalProcess','productOrderQuantity','productBoxQuantity','productTrayQuantity','productHourlyProductionRate','productCommonContainer','productShippingProductCount','productClientName','productNameInput','productColor','productDueDate','productNote']) c[name]={value:'',dataset:{}};
 c.state.productImageUrls=[];
 vm.runInContext(section('function normalizeProductProcessMethod(', 'function openProductModal(')+section('function getProductFormPayload()', 'function validateProductPayload('),c);return c;
}
for (const [type,label] of [['coating','코팅'],['label','라벨']]) {
 test(`${label} QR uses named first row and disables second/third for all treatment settings`,()=>{
  for(const flame of ['무','유']) for(const dust of ['무','유']) {
   const data={finalProcess:label,flameTreatmentStatus:flame,dustRemovalStatus:dust};
   assert.deepEqual(getProcessRows(data),[{label,disabled:false,treatment:false},{label:'2도',disabled:true,treatment:false},{label:'3도',disabled:true,treatment:false}]);
   assert.equal(getProcessSummary(data),label);
  }
 });
 test(`${label} can be selected, saved and reopened without print stages`,()=>{
  const c=form();c.productProcessType.value=type;c.productProcessStage1.value='박';c.productProcessStage2.value='실크';c.productProcessStage3.value='박';c.syncProductProcessFields();
  assert.equal(c.productFinalProcess.value,label);assert.equal(c.productProcessStage2.disabled,true);assert.equal(c.productProcessStage3.disabled,true);
  const payload=c.getProductFormPayload();assert.equal(payload['최종공정'],label);
  for(const stage of ['1도 공정','2도 공정','3도 공정'])assert.equal(payload[stage],'');
  c.setProductProcessForm({finalProcess:label});assert.equal(c.productProcessType.value,type);assert.equal(c.productProcessSummary.textContent,label);
  c.productProcessType.value='print';c.productProcessStage1.value='실크';c.productProcessStage2.value='박';c.syncProductProcessFields();assert.equal(c.productFinalProcess.value,'2도');assert.equal(c.productProcessStage2.disabled,false);
 });
 test(`${label} product create and update keep the final process in canonical data`,()=>{
  const state={products:[],orders:[],inbounds:[],records:[],boxes:[]};
  const created=applyMutation('createProduct',{'업체명':'테스트','제품명':'공정 제품','박스당 수량':100,'트레이 수량':10,'최종공정':'2도','1도 공정':'실크','2도 공정':'박'},state,new Date('2026-09-16T00:00:00Z'));
  const updated=applyMutation('updateProduct',{productCode:created.result.productId,'업체명':'테스트','제품명':'공정 제품','최종공정':label,'1도 공정':'','2도 공정':'','3도 공정':''},created.state,new Date('2026-09-16T00:00:00Z'));
  assert.equal(updated.state.products[0].finalProcess,label);assert.equal(updated.state.products[0].processStage1,'');assert.equal(updated.state.products[0].processStage2,'');
 });
}
test('label is selectable and QR assets have a new cache version',()=>{
 const html=fs.readFileSync(new URL('../frontend/admin.html',import.meta.url),'utf8');
 assert.match(html,/<option value="label">라벨<\/option>/);
 assert.match(html,/qr-label\.js\?v=20260916-label-process-v1/);
});
