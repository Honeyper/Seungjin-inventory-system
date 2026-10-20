import test from 'node:test';
import assert from 'node:assert/strict';
import {adminSource, loadFunctions} from './helpers/frontend-runtime.mjs';

function setup() {
  const state={productionPlanJobs:[{planRowId:'a',actualProduction:8000},{planRowId:'b',actualProduction:3000}],productionPlanExpandedRows:new Set()};
  const details=new Map(),buttons=new Map(),animations=[];
  for(const id of ['a','b']) {
    const label={textContent:'세부사항 열기'},attributes={'aria-expanded':'false','aria-controls':`details-${id}`};
    buttons.set(id,{dataset:{planDetailsToggle:id},getAttribute:key=>attributes[key],setAttribute:(key,value)=>{attributes[key]=value;},querySelector:()=>label,label});
    details.set(`details-${id}`,{dataset:{planDetailsRow:id},hidden:true});
  }
  const c=loadFunctions(adminSource,['toggleProductionPlanDetails','handleProductionPlanTableClick','collapseProductionPlanDetailsOutside'],{
    state,document:{getElementById:id=>details.get(id)},
    productionPlanTableBody:{querySelectorAll:()=>[...buttons.values()].filter(button=>button.getAttribute('aria-expanded')==='true')},
    animateProductionPlanDetails:(detail,expanded)=>{detail.hidden=!expanded;animations.push([detail.dataset.planDetailsRow,expanded]);},
    selectProductionPlanJob:id=>{state.productionPlanSelectedJobId=id;},handleProductionPlanProductPickerOpen:()=>{}
  });
  function click({rowId,detailId,toggleId,control=false,popup=false}={}) {
    const row=rowId?{dataset:{planRowId:rowId},querySelector:()=>buttons.get(rowId)}:null;
    const detail=detailId?{dataset:{planDetailsRow:detailId}}:null;
    const target={closest:selector=>selector==='[data-plan-details-toggle]'?buttons.get(toggleId)||null
      :selector==='[data-plan-row-id]'?row
      :selector==='[data-plan-row-id], [data-plan-details-row]'?row||detail
      :selector==='.modal-backdrop, dialog'?popup?{}:null
      :selector==='button, input, select, textarea, a, label'?control||toggleId?{}:null:null};
    const event={target};c.handleProductionPlanTableClick(event);c.collapseProductionPlanDetailsOutside(event);
  }
  return {state,buttons,details,animations,click};
}

test('행 클릭 열기·다시 클릭 접기를 유지하며 다른 행을 누르면 이전 상세만 접는다',()=>{
 const c=setup();c.click({rowId:'a'});assert.equal(c.state.productionPlanExpandedRows.has('a'),true);
 c.click({rowId:'b'});assert.deepEqual([...c.state.productionPlanExpandedRows],['b']);
 assert.equal(c.details.get('details-a').hidden,true);assert.equal(c.details.get('details-b').hidden,false);
 assert.equal(c.buttons.get('a').getAttribute('aria-expanded'),'false');assert.equal(c.buttons.get('a').label.textContent,'세부사항 열기');
 c.click({rowId:'b'});assert.equal(c.state.productionPlanExpandedRows.size,0);
});

test('같은 행의 입력칸·상세 내부·제품 선택 팝업에서는 열린 상태와 입력값을 유지한다',()=>{
 const c=setup();c.click({rowId:'a',toggleId:'a'});
 for(const target of [{rowId:'a',control:true},{detailId:'a',control:true},{detailId:'a'},{popup:true,control:true}]) {
  c.click(target);assert.equal(c.state.productionPlanExpandedRows.has('a'),true);
 }
 assert.equal(c.state.productionPlanJobs[0].actualProduction,8000);assert.equal(c.animations.length,1);
});

test('다른 행의 선택칸을 누르면 이전 상세만 접고 새 상세를 자동으로 열지 않는다',()=>{
 const c=setup();c.click({rowId:'a'});c.click({rowId:'b',control:true});
 assert.equal(c.state.productionPlanExpandedRows.size,0);assert.equal(c.buttons.get('b').getAttribute('aria-expanded'),'false');
 assert.equal(c.state.productionPlanJobs[0].actualProduction,8000);
});

test('표 밖 클릭은 열린 상세를 접고 닫기 버튼 문구와 접근성 상태도 함께 맞춘다',()=>{
 const c=setup();c.click({rowId:'a',toggleId:'a'});c.click();
 assert.equal(c.state.productionPlanExpandedRows.size,0);assert.equal(c.details.get('details-a').hidden,true);
 assert.equal(c.buttons.get('a').getAttribute('aria-expanded'),'false');assert.equal(c.buttons.get('a').label.textContent,'세부사항 열기');
 c.click();assert.equal(c.animations.length,2);
});
