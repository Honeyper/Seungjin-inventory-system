import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../frontend/inventory-list-sort.js';
const {sort}=globalThis.InventoryListSort;
const rows=[
 {managementId:'IN-2',productId:'P',inboundDate:'2026-09-16',productName:'용기 10',currentBoxCount:'13 box',currentTotalQuantity:'6,240 ea',dueDate:'2026-10-01'},
 {managementId:'IN-10',productId:'P',inboundDate:'2026-09-15',productName:'용기 2',currentBoxCount:'5 box',currentTotalQuantity:'2,400 ea',dueDate:''},
 {managementId:'IN-3',productId:'P',inboundDate:'2026.9.17',productName:'용기 3',currentBoxCount:'12 box',currentTotalQuantity:'5,760 ea',dueDate:'2026-09-30'},
 {managementId:'IN-1',productId:'P',inboundDate:'2026-09-14',productName:'용기 1',currentBoxCount:'2 box',currentTotalQuantity:'960 ea',dueDate:'-'}
];
const ids=items=>items.map(item=>item.managementId);
test('default inventory order is newest inbound first, independent of response order',()=>{
 assert.deepEqual(ids(sort(rows)),['IN-3','IN-2','IN-10','IN-1']);
 assert.deepEqual(ids(sort([...rows].reverse())),ids(sort(rows)));
 assert.deepEqual(ids(rows),['IN-2','IN-10','IN-3','IN-1']);
});
test('display quantities sort numerically, including zero and missing',()=>{
 const extra=[...rows,{managementId:'ZERO',currentBoxCount:0},{managementId:'EMPTY',currentBoxCount:'-'}];
 assert.deepEqual(ids(sort(extra,'currentBoxCount','asc')),['ZERO','IN-1','IN-10','IN-3','IN-2','EMPTY']);
 assert.deepEqual(ids(sort(extra,'currentBoxCount','desc')),['IN-2','IN-3','IN-10','IN-1','ZERO','EMPTY']);
 assert.deepEqual(ids(sort(rows,'currentTotalQuantity','asc')),['IN-1','IN-10','IN-3','IN-2']);
});
test('dates support mixed formats and missing or invalid dates always follow actual dates',()=>{
 const extra=[...rows,{managementId:'INVALID',dueDate:'2026-02-30'}];
 assert.deepEqual(ids(sort(extra,'dueDate','asc')),['IN-3','IN-2','IN-1','IN-10','INVALID']);
 assert.deepEqual(ids(sort(extra,'dueDate','desc')),['IN-2','IN-3','IN-1','IN-10','INVALID']);
});
test('names use natural sorting and ties use management ID then product ID',()=>{
 assert.deepEqual(ids(sort(rows,'productName','asc')),['IN-1','IN-10','IN-3','IN-2']);
 const ties=[{managementId:'IN-10',productId:'2',inboundDate:'2026-09-17'},
 {managementId:'IN-2',productId:'2',inboundDate:'2026-09-17'},
 {managementId:'IN-2',productId:'1',inboundDate:'2026-09-17'}];
 assert.deepEqual(sort(ties).map(x=>x.managementId+'/'+x.productId),['IN-2/1','IN-2/2','IN-10/2']);
});
test('actual renderer sorts all filtered records before paging and keeps totals separate',()=>{
 const source=readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
 const fn=source.match(/^function renderInventoryTable\([\s\S]*?^}/m)[0];
 const state={filteredInventoryRows:[...rows],inventoryPage:2,inventoryPageSize:2,inventoryFilters:{},inventoryRows:rows};
 const body={innerHTML:'',querySelectorAll:()=>[]};let totals;
 const ctx=vm.createContext({state,inventoryTableBody:body,inventoryCountLabel:{},inventoryColumnSort:{sort},
 renderInventoryListTotals:r=>totals=r,renderInventoryAggregateRow:()=>'<tr>SUM</tr>',
 renderQrActionButton:()=>'',escapeHtml:String,escapeAttribute:String,renderInventoryProcessBadge:()=>'',renderInventoryDueBadge:()=>'',renderInventoryPagination:()=>{}});
 vm.runInContext(fn,ctx);ctx.renderInventoryTable();
 assert.equal(totals.length,4);
 assert.match(body.innerHTML,/^<tr>SUM<\/tr>/);
 assert.ok(body.innerHTML.indexOf('<strong>IN-10</strong>') < body.innerHTML.indexOf('<strong>IN-1</strong>'));
 assert.ok(!body.innerHTML.includes('<strong>IN-3</strong>'));
});
