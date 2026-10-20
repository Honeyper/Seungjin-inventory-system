import test from 'node:test';
import assert from 'node:assert/strict';
import {adminSource,loadFunctions} from './helpers/frontend-runtime.mjs';

function setup() {
 const state={productionPlanJobs:[{planRowId:'a'},{planRowId:'b'}],productionPlanDragRowId:''};
 const classes=()=>{const values=new Set();return {add:(...args)=>args.forEach(a=>values.add(a)),remove:(...args)=>args.forEach(a=>values.delete(a)),contains:a=>values.has(a)};};
 const a={dataset:{planRowId:'a'},classList:classes(),getBoundingClientRect:()=>({top:0,bottom:40})};
 const b={dataset:{planRowId:'b'},classList:classes(),getBoundingClientRect:()=>({top:40,bottom:80})};
 const detail={dataset:{planDetailsRow:'b'},classList:classes(),hidden:false,getBoundingClientRect:()=>({top:80,bottom:180})};
 const rows=[a,b,detail],calls=[];
 const c=loadFunctions(adminSource,['startProductionPlanRowDrag','getProductionPlanDropTarget','clearProductionPlanDropMarkers','finishProductionPlanRowDrag','dragOverProductionPlanRow','dropProductionPlanRow','handleProductionPlanRowMoveKeydown'],{
  state,productionPlanTableBody:{querySelectorAll:selector=>selector==='[data-plan-row-id]'?[a,b]:selector==='[data-plan-details-row]'?[detail]:selector==='.is-plan-dragging'?rows.filter(r=>r.classList.contains('is-plan-dragging')):selector.startsWith('.')?rows.filter(r=>r.classList.contains('plan-drop-before')||r.classList.contains('plan-drop-after')):rows},
  closeProductionPlanRowMenu:()=>{},moveProductionPlanRow:(...args)=>{calls.push(args);return false;}
 });
 const handle={closest:()=>a};
 const target={closest:selector=>selector==='[data-plan-drag-handle]'?handle:a};
 let prevented=false;const data=new Map();const transfer={setData:(k,v)=>data.set(k,v)};
 return {c,state,a,b,detail,rows,calls,target,transfer,data,prevent:()=>{prevented=true;},prevented:()=>prevented};
}

test('전용 손잡이로만 내부 드래그를 시작하고 외부·입력칸 드래그는 무시한다',()=>{
 const t=setup();t.c.startProductionPlanRowDrag({target:{closest:()=>null},dataTransfer:t.transfer,preventDefault:t.prevent});
 assert.equal(t.prevented(),true);assert.equal(t.state.productionPlanDragRowId,'');
 t.c.startProductionPlanRowDrag({target:t.target,dataTransfer:t.transfer,preventDefault:t.prevent});
 assert.equal(t.state.productionPlanDragRowId,'a');assert.equal(t.transfer.effectAllowed,'move');assert.equal(t.data.get('text/plain'),'a');assert.equal(t.a.classList.contains('is-plan-dragging'),true);
});

test('열린 세부정보까지 한 행으로 보아 이동 위치를 계산하고 드롭 후 표시를 정리한다',()=>{
 const t=setup();t.state.productionPlanDragRowId='a';const target={closest:()=>t.detail};
 const event={target,clientY:160,dataTransfer:t.transfer,preventDefault:t.prevent,stopPropagation:()=>{}};
 t.c.dragOverProductionPlanRow(event);assert.equal(t.prevented(),true);assert.equal(t.detail.classList.contains('plan-drop-after'),true);
 t.c.dropProductionPlanRow(event);assert.deepEqual(t.calls,[['a','b','after']]);assert.equal(t.state.productionPlanDragRowId,'');assert.equal(t.detail.classList.contains('plan-drop-after'),false);
 t.state.productionPlanDragRowId='a';assert.equal(t.c.getProductionPlanDropTarget({...event,clientY:60}).placement,'before');
});

test('외부 드롭·자기 자신 위 드롭·취소는 순서를 바꾸지 않고 표시만 정리한다',()=>{
 const t=setup();const external={target:{closest:()=>t.b},clientY:60,preventDefault:t.prevent,stopPropagation:()=>{}};
 t.c.dropProductionPlanRow(external);assert.equal(t.prevented(),false);assert.equal(t.calls.length,0);
 t.state.productionPlanDragRowId='a';t.a.classList.add('is-plan-dragging');
 t.c.dropProductionPlanRow({...external,target:{closest:()=>t.a}});assert.equal(t.calls.length,0);assert.equal(t.a.classList.contains('is-plan-dragging'),false);
 t.state.productionPlanDragRowId='a';t.detail.classList.add('plan-drop-after');t.c.finishProductionPlanRowDrag();assert.equal(t.state.productionPlanDragRowId,'');assert.equal(t.detail.classList.contains('plan-drop-after'),false);
});

test('손잡이의 Alt 방향키로만 이동하며 선택칸의 방향키 조작은 유지한다',()=>{
 const t=setup();const base={target:t.target,key:'ArrowDown',altKey:false,preventDefault:t.prevent};
 t.c.handleProductionPlanRowMoveKeydown(base);assert.equal(t.calls.length,0);
 t.c.handleProductionPlanRowMoveKeydown({...base,altKey:true,target:{closest:()=>null}});assert.equal(t.calls.length,0);
 t.c.handleProductionPlanRowMoveKeydown({...base,altKey:true});assert.deepEqual(t.calls,[['a','b','after']]);assert.equal(t.prevented(),true);
});
