import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
await import('../frontend/qr-label.js');
const qr=globalThis.SeungjinQrLabel;
const source=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
const empty=()=>({products:[],orders:[],inbounds:[],records:[],boxes:[]});
const payload=(count,groups)=>({'업체명':'테스트','제품명':'복수 공정 검증','박스당 수량':100,'트레이 수량':10,'최종공정':`${count}도`,...Object.fromEntries(Array.from({length:6},(_,i)=>[`${i+1}도 공정`,i<count?'실크':''])),...(groups===undefined?{}:{processGroups:groups})});
const create=(count,groups)=>applyMutation('createProduct',payload(count,groups),empty());
const extract=name=>source.match(new RegExp(`^function ${name}\\([^]*?\\n}`,'m'))[0];
function form(){
  const c=vm.createContext({document:{querySelector:()=>({replaceChildren(){},querySelectorAll:()=>[]}),querySelectorAll:()=>[]},escapeHtml:String,state:{},SeungjinQrLabel:qr,normalizeEditableValue:v=>String(v||'').trim(),productForm:{querySelector:()=>null}});
  for(const key of ['productProcessType','productFinalProcess','productProcessStages','productProcessSummary',...Array.from({length:6},(_,i)=>`productProcessStage${i+1}`)])c[key]={value:'',dataset:{}};
  c.productProcessJoins=Array.from({length:5},(_,i)=>({checked:false,dataset:{productProcessJoin:String(i+2)}}));
  for(const name of ['normalizeProductProcessMethod','getProductProcessStageControls','getProductProcessFormGroups','getProductProcessRoute','renderProductProcessHourlyRates','setProductProcessForm','syncProductProcessFields'])vm.runInContext(extract(name),c);
  return c;
}
test('1+2 simultaneous then 3 saves the final degree and prints one group per QR row',()=>{
  const result=create(3,[[1,2],[3]]),p=result.state.products[0];
  assert.equal(p.finalProcess,'3도');
  assert.equal(p.processRoute,'1도+2도 실크 → 3도 실크');
  assert.deepEqual(p.processGroups,[[1,2],[3]]);
  assert.deepEqual(qr.getProcessRows(p).map(r=>r.label),['1도+2도','3도','---']);
  assert.equal(qr.getProcessRows(p)[2].disabled,true);
  assert.equal(qr.getProcessSummary(p),'3도');
  const context=form();context.setProductProcessForm(p);
  assert.equal(context.productProcessJoins[0].checked,true);
  assert.equal(context.productProcessJoins[1].checked,false);
  assert.equal(context.productFinalProcess.value,'3도');
  assert.equal(context.productProcessSummary.textContent,p.processRoute);
  assert.equal(JSON.stringify(context.getProductProcessFormGroups()),JSON.stringify(p.processGroups));
});
test('every consecutive grouping of six degrees preserves all steps through storage and QR',()=>{
  for(let mask=0;mask<32;mask++){
    const groups=[[1]];
    for(let step=2;step<=6;step++)if(mask&(1<<(step-2)))groups[groups.length-1].push(step);else groups.push([step]);
    const created=create(6,groups),p=created.state.products[0];
    assert.equal(p.finalProcess,'6도');assert.equal(p.processStage6,'실크');
    assert.deepEqual(p.processGroups,groups);
    const rows=qr.getProcessRows(p).filter(r=>!r.disabled);
    assert.deepEqual(rows.map(r=>r.label),groups.map(g=>g.map(n=>`${n}도`).join('+')));
    const c=form();c.setProductProcessForm(p);assert.equal(JSON.stringify(c.getProductProcessFormGroups()),JSON.stringify(groups));
    const updated=applyMutation('updateProduct',{productCode:p.productCode,'제품명':'이름만 변경'},created.state);
    assert.deepEqual(updated.state.products[0].processGroups,groups);
    assert.equal(updated.state.products[0].processStage6,'실크');
  }
});
test('gaps, repeated/out-of-order degrees, invalid methods and more than six degrees cannot be saved',()=>{
  for(const groups of [[[1,2],[2,3]],[[1],[3]],[[2,1],[3]],[[1,2,3,4]],[[1],[],[2,3]],null,[[1,'2'],[3]]])assert.throws(()=>create(3,groups),/동시 공정/);
  assert.throws(()=>applyMutation('createProduct',{...payload(3),'2도 공정':''},empty()),/2도 공정/);
  assert.throws(()=>applyMutation('createProduct',{...payload(3),'3도 공정':'알수없음'},empty()),/실크 또는 박/);
  assert.throws(()=>applyMutation('createProduct',{...payload(0),'최종공정':'7도'},empty()),/1도부터 6도/);
});
test('old products default to separate passes and a single process clears all six print degrees',()=>{
  assert.deepEqual(create(3).state.products[0].processGroups,[[1],[2],[3]]);
  const created=create(6,[[1,2,3,4,5,6]]),p=created.state.products[0];
  const changed=applyMutation('updateProduct',{productCode:p.productCode,'최종공정':'라벨'},created.state).state.products[0];
  assert.equal(changed.finalProcess,'라벨');assert.deepEqual(changed.processGroups,[]);
  for(let step=1;step<=6;step++)assert.equal(changed[`processStage${step}`],'');
  const c=form();c.setProductProcessForm(p);c.productProcessStage3.value='none';c.syncProductProcessFields();
  assert.equal(c.productFinalProcess.value,'2도');assert.equal(c.productProcessStage6.value,'none');assert.equal(c.productProcessStage6.disabled,true);
  assert.equal(JSON.stringify(c.getProductProcessFormGroups()),'[[1,2]]');
});
test('treatment rows do not overwrite grouped print passes',()=>{
  const p=create(6,[[1,2],[3,4],[5,6]]).state.products[0];
  const rows=qr.getProcessRows({...p,flameTreatmentStatus:'유',dustRemovalStatus:'유'});
  assert.deepEqual(rows.map(r=>r.label),['화염','1도+2도','3도+4도','5도+6도','박가루']);
});
test('QR uses the current saved SKU groups and final degree instead of an older inbound degree',()=>{
  const p=create(6,[[1,2],[3,4],[5,6]]).state.products[0];
  const c=vm.createContext({SeungjinQrLabel:qr,findInboundQrProduct:()=>p});
  vm.runInContext(extract('getInboundQrProcessData'),c);
  const result=c.getInboundQrProcessData({process:'3도'},[],p);
  assert.equal(result.finalProcess,'6도');assert.equal(result.summary,'6도');
  assert.deepEqual(Array.from(result.processRows,r=>r.label),['1도+2도','3도+4도','5도+6도']);
});
