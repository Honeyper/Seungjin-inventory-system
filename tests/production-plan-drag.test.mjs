import test from 'node:test';
import assert from 'node:assert/strict';
import {adminSource,loadFunctions} from './helpers/frontend-runtime.mjs';

function setup() {
 const state={productionPlanJobs:[{planRowId:'a'},{planRowId:'b'}],productionPlanDragRowId:''};
 const classes=()=>{const values=new Set();return {add:(...args)=>args.forEach(a=>values.add(a)),remove:(...args)=>args.forEach(a=>values.delete(a)),contains:a=>values.has(a)};};
 const a={dataset:{planRowId:'a'},draggable:true,classList:classes(),getBoundingClientRect:()=>({left:10,top:20,bottom:60})};
 const b={dataset:{planRowId:'b'},classList:classes(),getBoundingClientRect:()=>({left:10,top:60,bottom:100})};
 const detail={dataset:{planDetailsRow:'b'},classList:classes(),hidden:false,getBoundingClientRect:()=>({top:100,bottom:180})};
 const rows=[a,b,detail],calls=[],images=[];
 const c=loadFunctions(adminSource,['prepareProductionPlanRowDrag','startProductionPlanRowDrag','getProductionPlanDropTarget','clearProductionPlanDropMarkers','finishProductionPlanRowDrag','dragOverProductionPlanRow','dropProductionPlanRow','handleProductionPlanRowMoveKeydown'],{
  state,productionPlanTableBody:{querySelectorAll:selector=>selector==='[data-plan-row-id]'?[a,b]:selector==='[data-plan-details-row]'?[detail]:selector==='.is-plan-dragging'?rows.filter(r=>r.classList.contains('is-plan-dragging')):selector.startsWith('.')?rows.filter(r=>r.classList.contains('plan-drop-before')||r.classList.contains('plan-drop-after')):rows},
  closeProductionPlanRowMenu:()=>{},moveProductionPlanRow:(...args)=>{calls.push(args);return false;}
 });
 const target={closest:selector=>selector==='[data-plan-row-id]'?a:null};
 const control={closest:selector=>selector==='[data-plan-row-id]'?a:{tagName:'INPUT'}};
 let prevented=false;const data=new Map();const transfer={setData:(k,v)=>data.set(k,v),setDragImage:(...args)=>images.push(args)};
 return {c,state,a,b,detail,rows,calls,images,target,control,transfer,data,prevent:()=>{prevented=true;},prevented:()=>prevented};
}

test('행의 빈 영역에서 드래그하며 전체 행을 잡은 위치에 맞춰 미리보기로 사용한다',()=>{
 const t=setup();t.c.prepareProductionPlanRowDrag({target:t.target});
 t.c.startProductionPlanRowDrag({target:t.target,clientX:110,clientY:35,dataTransfer:t.transfer,preventDefault:t.prevent});
 assert.equal(t.prevented(),false);assert.equal(t.state.productionPlanDragRowId,'a');assert.equal(t.transfer.effectAllowed,'move');
 assert.equal(t.data.get('text/plain'),'a');assert.deepEqual(t.images,[[t.a,100,15]]);assert.equal(t.a.classList.contains('is-plan-dragging'),true);
});

test('입력·선택 영역은 부모 행의 드래그를 막고 빈 영역을 잡으면 다시 허용한다',()=>{
 const t=setup();t.c.prepareProductionPlanRowDrag({target:t.control});assert.equal(t.a.draggable,false);
 // Native dragstart targets the draggable ancestor, so pointerdown must protect controls first.
 t.c.startProductionPlanRowDrag({target:t.target,dataTransfer:t.transfer,preventDefault:t.prevent});
 assert.equal(t.prevented(),true);assert.equal(t.state.productionPlanDragRowId,'');assert.equal(t.images.length,0);
 t.c.prepareProductionPlanRowDrag({target:t.target});assert.equal(t.a.draggable,true);
 t.c.startProductionPlanRowDrag({target:t.control,dataTransfer:t.transfer,preventDefault:t.prevent});assert.equal(t.images.length,0);
});

test('외부 요소의 드래그는 행 이동으로 처리하지 않는다',()=>{
 const t=setup();t.c.startProductionPlanRowDrag({target:{closest:()=>null},dataTransfer:t.transfer,preventDefault:t.prevent});
 assert.equal(t.prevented(),true);assert.equal(t.state.productionPlanDragRowId,'');
});

test('열린 세부정보까지 한 행으로 보아 이동 위치를 계산하고 드롭 후 표시를 정리한다',()=>{
 const t=setup();t.state.productionPlanDragRowId='a';const target={closest:()=>t.detail};
 const event={target,clientY:160,dataTransfer:t.transfer,preventDefault:t.prevent,stopPropagation:()=>{}};
 t.c.dragOverProductionPlanRow(event);assert.equal(t.prevented(),true);assert.equal(t.detail.classList.contains('plan-drop-after'),true);
 t.c.dropProductionPlanRow(event);assert.deepEqual(t.calls,[['a','b','after']]);assert.equal(t.state.productionPlanDragRowId,'');assert.equal(t.detail.classList.contains('plan-drop-after'),false);
 t.state.productionPlanDragRowId='a';assert.equal(t.c.getProductionPlanDropTarget({...event,clientY:70}).placement,'before');
});

test('외부 드롭·자기 자신 위 드롭·취소는 순서를 바꾸지 않고 표시만 정리한다',()=>{
 const t=setup();const external={target:{closest:()=>t.b},clientY:70,preventDefault:t.prevent,stopPropagation:()=>{}};
 t.c.dropProductionPlanRow(external);assert.equal(t.prevented(),false);assert.equal(t.calls.length,0);
 t.state.productionPlanDragRowId='a';t.a.classList.add('is-plan-dragging');
 t.c.dropProductionPlanRow({...external,target:{closest:()=>t.a}});assert.equal(t.calls.length,0);assert.equal(t.a.classList.contains('is-plan-dragging'),false);
 t.state.productionPlanDragRowId='a';t.detail.classList.add('plan-drop-after');t.c.finishProductionPlanRowDrag();assert.equal(t.state.productionPlanDragRowId,'');assert.equal(t.detail.classList.contains('plan-drop-after'),false);
});

test('행 포커스에서 Alt 방향키로 이동하며 선택칸의 방향키 조작은 유지한다',()=>{
 const t=setup();const base={target:t.target,key:'ArrowDown',altKey:false,preventDefault:t.prevent};
 t.c.handleProductionPlanRowMoveKeydown(base);assert.equal(t.calls.length,0);
 t.c.handleProductionPlanRowMoveKeydown({...base,altKey:true,target:t.control});assert.equal(t.calls.length,0);
 t.c.handleProductionPlanRowMoveKeydown({...base,altKey:true});assert.deepEqual(t.calls,[['a','b','after']]);assert.equal(t.prevented(),true);
});
