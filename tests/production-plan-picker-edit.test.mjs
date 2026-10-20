import test from 'node:test';
import assert from 'node:assert/strict';
import {adminSource,loadFunctions} from './helpers/frontend-runtime.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));

test('생산계획 제품 선택에는 수정 버튼을 표시하고 기존 공정 필터와 선택 버튼을 유지한다',()=>{
 const list={innerHTML:'',querySelectorAll:()=>[]};
 const c=loadFunctions(adminSource,['renderInboundProductPicker'],{
  state:{inboundProductPickerTarget:'productionPlan',inboundProductPickerQuery:'오브제',products:[
   {productCode:'NP-0001',productName:'오브제 외용기',clientName:'뉴파트너스'},
   {productCode:'FOIL',productName:'오브제 박 제품',clientName:'업체',foil:true}]},
  window:{},getProductionPlanPickerProcess:()=> '실크 인쇄',isProductionPlanProductAllowed:p=>!p.foil,getProductionPlanStageOptions:()=>[1],
  normalizeSearchText:value=>String(value||'').toLowerCase(),escapeHtml:String,renderPickerProductImage:()=>'',renderColor:()=>'',
  inboundProductPickerCount:{},inboundProductPickerList:list,inboundProductPickerEmpty:{}
 });
 c.renderInboundProductPicker();assert.match(list.innerHTML,/data-edit-picker-product="NP-0001"/);
 assert.match(list.innerHTML,/data-product="NP-0001"/);assert.doesNotMatch(list.innerHTML,/FOIL|data-copy-picker-product/);
});

test('수정 버튼은 기존 제품 수정창만 열고 검색·정렬·스크롤 복귀 정보를 보관한다',()=>{
 const product={productCode:'NP-0001',productName:'오브제'},calls=[];
 const c=loadFunctions(adminSource,['editProductFromPicker','resumeInboundProductPicker'],{
  state:{inboundProductPickerTarget:'productionPlan',inboundProductPickerQuery:'오브제',inboundProductPickerSort:'name',inboundProductPickerSortDirection:'asc'},
  inboundProductPickerSearch:{value:'오브제'},inboundProductPickerList:{scrollTop:240},inboundProductPickerModal:{hidden:false},
  getProductByCode:code=>code===product.productCode?product:null,showToast:message=>calls.push(message),
  openProductModal:(...args)=>calls.push(args),openInboundProductPicker:(...args)=>calls.push(args)
 });
 c.editProductFromPicker('NP-0001');assert.equal(c.inboundProductPickerModal.hidden,true);assert.equal(c.state.productFormReturnTarget,'productionPlan');
 assert.deepEqual(calls[0],['edit',product]);const context=plain(c.state.productPickerReturnState);
 c.resumeInboundProductPicker('productionPlan');assert.equal(c.state.productPickerReturnState,null);
 assert.deepEqual(plain(calls[1]),['productionPlan',{restore:context}]);
 c.editProductFromPicker('missing');assert.equal(calls.length,3);assert.equal(c.state.productPickerReturnState,null);
});

test('복귀 시 검색어·정렬·목록 스크롤을 복원하며 새로 열 때는 검색을 초기화한다',()=>{
 let resets=0;const title={nextElementSibling:{}};
 const c=loadFunctions(adminSource,['openInboundProductPicker'],{
  state:{inboundProductPickerSort:'registered',inboundProductPickerSortDirection:'desc'},
  inboundProductPickerSearch:{value:'',focus(){}},inboundProductPickerSort:{},inboundProductPickerSortDirection:{},
  inboundProductPickerList:{scrollTop:0},inboundProductPickerHint:{},createProductFromPickerButton:{},inboundProductPickerModal:{hidden:true},
  getProductionPlanPickerProcess:()=> '실크 인쇄',renderInboundProductPicker(){},resetModalScrollPosition(){resets++;},
  document:{querySelector:()=>title,body:{classList:{add(){}}}},window:{setTimeout(){}}
 });
 c.openInboundProductPicker('productionPlan',{restore:{query:'오브제',searchText:'오브제',sort:'name',direction:'asc',scrollTop:240}});
 assert.equal(c.state.inboundProductPickerQuery,'오브제');assert.equal(c.inboundProductPickerSearch.value,'오브제');
 assert.equal(c.inboundProductPickerSort.value,'name');assert.equal(c.inboundProductPickerSortDirection.value,'asc');assert.equal(c.inboundProductPickerList.scrollTop,240);assert.equal(resets,0);
 c.openInboundProductPicker('productionPlan');assert.equal(c.state.inboundProductPickerQuery,'');assert.equal(resets,1);
});

test('제품 수정 저장은 기존 제품 ID를 갱신하고 생산계획을 보존한 뒤 선택 목록으로 복귀한다',async()=>{
 for(const failure of [false,true]) {
  const calls=[];const c=loadFunctions(adminSource,['saveProduct'],{
   state:{productFormMode:'edit',editingProductCode:'NP-0001',productFormReturnTarget:'productionPlan',products:[],isSavingProduct:false},
   getProductFormPayload:()=>({'제품명':'수정 제품','업체명':'뉴파트너스'}),validateProductPayload:()=>'',setProductSaving(){},setFormMessage(){},
   resolveProductImageUrls:async()=>[],requestApi:async(action,payload)=>{calls.push([action,payload.productId]);if(failure)throw Error('실패');return {productId:'NP-0001'};},
   loadProducts:async options=>calls.push(['load',plain(options)]),closeProductModal:()=>calls.push(['close']),resumeInboundProductPicker:target=>calls.push(['resume',target]),showToast(){}
  });
  await c.saveProduct();assert.deepEqual(calls[0],['updateProduct','NP-0001']);
  assert.deepEqual(calls.slice(1),failure?[]:[['load',{preserveProductionPlan:true}],['close'],['resume','productionPlan']]);
  if(failure)assert.equal(c.state.productFormReturnTarget,'productionPlan');
 }
});

test('제품 정보 갱신은 작성 중인 행·순서·실적·삭제 기록을 다시 불러오지 않고 유지한다',()=>{
 const jobs=[{planRowId:'b',actualProduction:3000},{planRowId:'a',actualProduction:8000}],deleted=new Set(['deleted']);let loads=0,refreshes=0,renders=0;
 const c=loadFunctions(adminSource,['applyProductsResult'],{
  state:{productionPlanJobs:jobs,productionPlanDeletedRowKeys:deleted},renderClientOptions(){},renderClientFilterOptions(){},renderInboundProductPicker(){},applyFilters(){},syncRegisteredFinalProcessesFromProducts(){},
  getCurrentView:()=> 'production-plan',loadProductionPlanDraft:()=>{loads++;},refreshProductionPlanTargets:()=>{refreshes++;},renderProductionPlanTable:()=>{renders++;}
 });
 c.applyProductsResult({products:[{productCode:'NP-0001',productName:'수정 제품'}]},{preserveProductionPlan:true});
 assert.equal(c.state.productionPlanJobs,jobs);assert.equal(c.state.productionPlanDeletedRowKeys,deleted);assert.equal(jobs[1].actualProduction,8000);
 assert.equal(loads,0);assert.equal(refreshes,1);assert.equal(renders,1);
 c.applyProductsResult({products:[]});assert.equal(loads,1);
});

test('수정 후 재조회가 실패해도 기존 제품 목록과 작성 중인 계획을 비우지 않는다',async()=>{
 let cleared=0;const products=[{productCode:'NP-0001'}];
 const c=loadFunctions(adminSource,['loadProducts'],{state:{products},readAdminCache:()=>null,setStatus(){},requestApi:async()=>{throw Error('연결 실패');},
  applyProductsResult:()=>{cleared++;},writeAdminCache(){}});
 await c.loadProducts({preserveProductionPlan:true});assert.equal(cleared,0);assert.equal(c.state.products,products);
});
