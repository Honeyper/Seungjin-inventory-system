import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
const extract=name=>source.slice(source.indexOf(`function ${name}(`),source.indexOf('\n}',source.indexOf(`function ${name}(`))+2);
function harness(type='audit',hidden=false){
 const renders=[];
 const c=vm.createContext({state:{inventoryRows:[{managementId:'old'}]},inventoryAttentionModal:{hidden,dataset:type?{attentionType:type}:{}},inventoryAttentionList:{scrollTop:240},inventoryAttentionSearchInput:{value:'검색 유지'},
 inventoryLocationBoxBars:{},inventoryLocationQuantityBars:{},normalizeInventoryRows:x=>x,applyMasterFinalProcess:x=>x,
 buildInventoryAttentionSummary:()=>({}),buildInventoryFilterOptions:()=>({}),
 renderInventorySummary:()=>{},renderInventoryFilterOptions:()=>{},renderInventoryBars:()=>{},applyInventoryFilters:()=>{},renderShippingTable:()=>{},updateShippingSettlementSummary:()=>{},
 renderInventoryAttentionList:type=>renders.push({type,ids:c.state.inventoryRows.map(r=>r.managementId),query:c.inventoryAttentionSearchInput.value})});
 vm.runInContext(extract('refreshOpenInventoryAttentionList')+'\n'+extract('applyInventoryDashboardResult'),c);
 return {c,renders};
}
test('fresh dashboard removes old popup rows after adjustment, preserving search and scroll',()=>{
 const {c,renders}=harness();c.applyInventoryDashboardResult({stateVersion:20,rows:[{managementId:'remaining'}]});
 assert.equal(renders.length,1);assert.deepEqual(Array.from(renders[0].ids),['remaining']);assert.equal(renders[0].query,'검색 유지');assert.equal(c.inventoryAttentionList.scrollTop,240);
 c.applyInventoryDashboardResult({stateVersion:21,rows:[]});assert.equal(renders[1].ids.length,0);
});
test('hidden popup and storage popup are not redrawn as an audit list',()=>{
 for(const [type,hidden] of [['audit',true],['',false]]){const {c,renders}=harness(type,hidden);c.applyInventoryDashboardResult({rows:[]});assert.equal(renders.length,0);}
});
test('open attention type is retained and cleared on close',()=>{
 assert.match(extract('openInventoryAttentionModal'),/dataset\.attentionType = type/);
 assert.match(extract('closeInventoryAttentionModal'),/delete inventoryAttentionModal\.dataset\.attentionType/);
});
