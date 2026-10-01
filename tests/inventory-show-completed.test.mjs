import test from 'node:test';
import assert from 'node:assert/strict';
import {adminSource,loadFunctions} from './helpers/frontend-runtime.mjs';
const makeRuntime=()=> {
 const rows=[
  {managementId:'ACTIVE',productName:'Arti 용기',clientName:'A',stockStatus:'보관',countsAsInventory:true,currentBoxCount:31,currentTotalQuantity:21762},
  {managementId:'SHIPPED',productName:'Arti 용기',clientName:'A',stockStatus:'출고완료',countsAsInventory:false,currentBoxCount:0,currentTotalQuantity:0,shippedShippingBoxes:[{number:1,status:'출고완료',quantity:100}]},
  {managementId:'OTHER',productName:'다른 용기',clientName:'B',stockStatus:'출고완료',countsAsInventory:false,currentBoxCount:0,currentTotalQuantity:0},
  {managementId:'DISCARD',productName:'Arti 용기',clientName:'A',stockStatus:'폐기',countsAsInventory:false,currentBoxCount:0,currentTotalQuantity:0}
 ];
 return loadFunctions(adminSource,['applyInventoryFilters','toggleInventoryCompleted','isCompletedInventoryRow','buildInventoryAggregateStats','countInventoryDistinct'],{
  state:{inventoryRows:rows,inventoryFilters:{},inventoryPage:3,showCompletedInventory:false},
  toggleInventoryCompletedButton:{setAttribute(){}},INVENTORY_CATEGORY_FILTERS:[],syncInventoryFilterState(){},
  normalizeInventoryCategory:v=>v,normalizeInventoryStockStatus:v=>String(v||''),normalizeSearchText:v=>String(v||'').toLowerCase(),
  matchesInventoryStockFilter:(item,stock)=>!stock||item.stockStatus===stock,
  isInventoryCompletedWithoutStorage:item=>item.stockStatus==='출고완료',renderInventoryTable(){},parseShippingSettlementNumber:v=>Number(v)||0
 });
};
test('출고완료 보기 토글로 완료 건만 추가되고 폐기는 추가되지 않으며 다시 끌 수 있다',()=>{
 const app=makeRuntime();app.applyInventoryFilters();
 assert.deepEqual(Array.from(app.state.filteredInventoryRows,x=>x.managementId),['ACTIVE']);
 app.toggleInventoryCompleted();assert.equal(app.state.inventoryPage,1);
 assert.deepEqual(Array.from(app.state.filteredInventoryRows,x=>x.managementId),['ACTIVE','SHIPPED','OTHER']);
 assert.equal(app.state.filteredInventoryRows[1].shippedShippingBoxes.length,1);
 app.toggleInventoryCompleted();assert.deepEqual(Array.from(app.state.filteredInventoryRows,x=>x.managementId),['ACTIVE']);
});
test('출고완료 항목에도 현재 검색어와 거래처·상태 필터를 적용한다',()=>{
 const app=makeRuntime();app.state.inventoryFilters={query:'arti',client:'A'};app.toggleInventoryCompleted();
 assert.deepEqual(Array.from(app.state.filteredInventoryRows,x=>x.managementId),['ACTIVE','SHIPPED']);
 app.state.inventoryFilters.stock='출고완료';app.applyInventoryFilters();
 assert.deepEqual(Array.from(app.state.filteredInventoryRows,x=>x.managementId),['SHIPPED']);
});
test('완료 건을 표시해도 현재 박스 수와 수량 합계에 출고 수량을 더하지 않는다',()=>{
 const app=makeRuntime();app.applyInventoryFilters();const before=app.buildInventoryAggregateStats(app.state.filteredInventoryRows);
 app.toggleInventoryCompleted();const after=app.buildInventoryAggregateStats(app.state.filteredInventoryRows);
 assert.equal(after.totalRows,3);assert.equal(after.totalBoxes,before.totalBoxes);assert.equal(after.totalQuantity,before.totalQuantity);
});
test('대표 위치가 아닌 개별 박스 위치로도 재고를 찾을 수 있다',()=>{
 const app=makeRuntime();
 app.state.inventoryRows[0].storage='H-1';
 app.state.inventoryRows[0].storageGroups=[{storage:'H-1'},{storage:'A-1'}];
 app.state.inventoryFilters.storage='A-1';
 app.applyInventoryFilters();
 assert.deepEqual(Array.from(app.state.filteredInventoryRows,x=>x.managementId),['ACTIVE']);
});
