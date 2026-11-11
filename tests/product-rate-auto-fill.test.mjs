import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adminSource,loadFunctions} from './helpers/frontend-runtime.mjs';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
await import('../frontend/qr-label.js');
const plain=x=>JSON.parse(JSON.stringify(x));
function form(mode='create',product=null){
 let inputs=[],html='';const automatic={value:''};
 const container={replaceChildren(){inputs=[];html='';},querySelectorAll:()=>inputs,get innerHTML(){return html;},set innerHTML(value){html=value;inputs=[...value.matchAll(/data-process-hourly-rate="([^"]+)"[^]*?value="([^"]*)"/g)].map(m=>({dataset:{processHourlyRate:m[1]},value:m[2]}));}};
 const c=loadFunctions(adminSource,['normalizeProductProcessMethod','getProductProcessStageControls','getProductProcessFormGroups','getProductProcessRoute','readProductProcessHourlyRates','renderProductProcessHourlyRates','setProductProcessForm','syncProductProcessFields'],{
  document:{querySelector:id=>id==='#productProcessHourlyRates'?container:id==='#productAutomaticHourlyProductionRate'?automatic:null,querySelectorAll:()=>inputs},state:{productFormMode:mode},escapeHtml:String,normalizeEditableValue:v=>String(v||'').trim(),SeungjinQrLabel:globalThis.SeungjinQrLabel,productForm:{querySelector:()=>null}
 });
 for(const key of ['productProcessType','productFinalProcess','productProcessStages','productProcessSummary',...Array.from({length:6},(_,i)=>`productProcessStage${i+1}`)])c[key]={value:'',dataset:{}};
 c.productProcessJoins=Array.from({length:5},(_,i)=>({checked:false,dataset:{productProcessJoin:String(i+2)}}));
 c.setProductProcessForm(product);
 const choose=methods=>{methods.forEach((value,i)=>c[`productProcessStage${i+1}`].value=value);c.syncProductProcessFields();};
 const edit=(key,value)=>{const input=inputs.find(i=>i.dataset.processHourlyRate===key);input.value=value;c.state.productRateManualEdits.add(key);};
 return {c,automatic,choose,edit,rates:()=>plain(c.readProductProcessHourlyRates()),get html(){return html;}};
}
test('신규 박 1·2·3도는 각각 700이고 실크 1·2·3도 및 자동 값은 기준으로 자동 채운다',()=>{
 const f=form();f.choose(['박','박','박']);assert.deepEqual(f.rates(),{'1도':700,'2도':700,'3도':700});assert.equal(f.automatic.value,'');
 f.choose(['실크','실크','박']);assert.deepEqual(f.rates(),{'1도':1250,'2도':812.5,'3도':700});assert.equal(f.automatic.value,'2250');
 f.choose(['실크','실크','실크']);assert.deepEqual(f.rates(),{'1도':1250,'2도':812.5,'3도':812.5});
 f.choose(['실크','실크','실크','실크']);assert.deepEqual(f.rates(),{'1도':1250,'2도':812.5,'3도':812.5,'4도':null});assert.match(f.html,/기준 미설정/);
});
test('공정 변경 시 자동 기준만 바꾸고 직접 수정·비운 값과 자동 생산량 수정은 보존한다',()=>{
 const f=form();f.choose(['실크','실크']);f.edit('1도','900');f.edit('2도','');
 f.automatic.value='2400';f.c.state.productAutomaticRateManuallyEdited=true;
 f.choose(['박','박']);assert.deepEqual(f.rates(),{'1도':900,'2도':null});assert.equal(f.automatic.value,'2400');
 f.c.state.isSavingProduct=true;f.c.syncProductProcessFields();assert.deepEqual(f.rates(),{'1도':900,'2도':null});
 f.c.setProductProcessForm(null);f.choose(['실크','실크']);assert.deepEqual(f.rates(),{'1도':1250,'2도':812.5});assert.equal(f.automatic.value,'2250');
});
test('묶음 공정도 기준을 채우며 분리·재묶기 시 직접 입력한 그룹별 값을 유지한다',()=>{
 const f=form();f.choose(['실크','실크']);f.edit('2도','950');f.c.productProcessJoins[0].checked=true;f.c.syncProductProcessFields();assert.deepEqual(f.rates(),{'1도+2도':812.5});
 f.edit('1도+2도','1000');f.c.productProcessJoins[0].checked=false;f.c.syncProductProcessFields();assert.deepEqual(f.rates(),{'1도':1250,'2도':950});
 f.c.productProcessJoins[0].checked=true;f.c.syncProductProcessFields();assert.deepEqual(f.rates(),{'1도+2도':1000});
});
test('기존 제품 수정·복사 모두 빈 항목을 채우고 기존 입력값은 보존한다',()=>{
 const product={finalProcess:'2도',processStage1:'실크',processStage2:'실크',processHourlyProductionRates:{'1도':777.5,'2도':null},automaticHourlyProductionRate:3000};
 const edit=form('edit',product);assert.deepEqual(edit.rates(),{'1도':777.5,'2도':812.5});assert.equal(edit.automatic.value,3000);
 const copy=form('copy',product);assert.deepEqual(copy.rates(),{'1도':777.5,'2도':812.5});assert.equal(copy.automatic.value,3000);
 const f=form();f.choose(['실크']);f.c.productProcessType.value='coating';f.c.syncProductProcessFields();assert.deepEqual(f.rates(),{'코팅':null});assert.equal(f.automatic.value,'');
});
test('자동 입력된 숫자가 신규 등록 결과에 저장된다',()=>{
 const f=form();f.choose(['실크','실크','박']);
 const result=applyMutation('createProduct',{'업체명':'테스트','제품명':'자동 생산량','박스당 수량':100,'트레이 수량':10,'최종공정':'3도','1도 공정':'실크','2도 공정':'실크','3도 공정':'박',processHourlyProductionRates:f.rates(),automaticHourlyProductionRate:Number(f.automatic.value)},{products:[],orders:[],inbounds:[],records:[],boxes:[]});
 assert.deepEqual(result.state.products[0].processHourlyProductionRates,{'1도':1250,'2도':812.5,'3도':700});assert.equal(result.state.products[0].automaticHourlyProductionRate,2250);
});

test('기존 박 제품에 2도 실크를 추가하면 기존 700을 유지하며 812.5와 자동 2250을 채운다',()=>{
 const product={productCode:'JUS-0125',finalProcess:'1도',processStage1:'박',processGroups:[[1]],hourlyProductionRate:700,processHourlyProductionRates:{'1도':700}};
 const f=form('edit',product);assert.deepEqual(f.rates(),{'1도':700});assert.equal(f.automatic.value,'');
 f.choose(['박','실크']);assert.deepEqual(f.rates(),{'1도':700,'2도':812.5});assert.equal(f.automatic.value,'2250');
 const initial=applyMutation('createProduct',{'업체명':'테스트','제품명':'회귀 확인','박스당 수량':2002,'트레이 수량':91,'최종공정':'1도','1도 공정':'박',processHourlyProductionRates:{'1도':700}},{products:[],orders:[],inbounds:[],records:[],boxes:[]});
 const saved=applyMutation('updateProduct',{productId:initial.result.productId,'최종공정':'2도','1도 공정':'박','2도 공정':'실크',processGroups:[[1],[2]],processHourlyProductionRates:f.rates(),automaticHourlyProductionRate:Number(f.automatic.value)},initial.state);
 assert.deepEqual(saved.state.products[0].processHourlyProductionRates,{'1도':700,'2도':812.5});assert.equal(saved.state.products[0].automaticHourlyProductionRate,2250);
});
test('기존 수정에서 미입력 생산량을 보완하되 단일 공정 기존 평균은 그대로 이어받는다',()=>{
 const f=form('edit',{finalProcess:'2도',processStage1:'박',processStage2:'실크',processGroups:[[1],[2]],processHourlyProductionRates:{'1도':700,'2도':null},automaticHourlyProductionRate:null});
 assert.deepEqual(f.rates(),{'1도':700,'2도':812.5});assert.equal(f.automatic.value,'2250');
 const legacy=form('edit',{finalProcess:'1도',processStage1:'실크',hourlyProductionRate:1115,processHourlyProductionRates:{'1도':null}});
 assert.deepEqual(legacy.rates(),{'1도':1115});assert.equal(legacy.automatic.value,'2250');
 f.edit('2도','900');f.automatic.value='2400';f.c.state.productAutomaticRateManuallyEdited=true;f.choose(['박','실크','실크']);
 assert.deepEqual(f.rates(),{'1도':700,'2도':900,'3도':812.5});assert.equal(f.automatic.value,'2400');
});
