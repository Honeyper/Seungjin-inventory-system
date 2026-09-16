import test from 'node:test';
import assert from 'node:assert/strict';
import '../frontend/purchase-order-sort.js';
const {sort}=globalThis.PurchaseOrderSort;
const rows=[
 {id:'a',productName:'제품 10',totalOrderQuantity:1000,inboundRate:1.44,startDate:'2026-09-16',endDate:'',status:'임의 완료'},
 {id:'b',productName:'제품 2',totalOrderQuantity:200,inboundRate:.72,startDate:'2026-09-14',endDate:'2026-09-30',status:'작업중'},
 {id:'c',productName:'제품 1',totalOrderQuantity:20,inboundRate:0,startDate:'2026-09-15',endDate:'2026-09-20',status:'입고중'},
 {id:'d',productName:'제품 1',totalOrderQuantity:null,inboundRate:null,startDate:'2026-09-15',endDate:null,status:'작업완료'}
];
const ids=items=>items.map(item=>item.id);
test('numeric columns sort numerically in both directions, zero before missing',()=>{
 assert.deepEqual(ids(sort(rows,'totalOrderQuantity','asc')),['c','b','a','d']);
 assert.deepEqual(ids(sort(rows,'totalOrderQuantity','desc')),['a','b','c','d']);
 assert.deepEqual(ids(sort(rows,'inboundRate','asc')),['c','b','a','d']);
 assert.deepEqual(ids(sort(rows,'inboundRate','desc')),['a','b','c','d']);
});
test('natural text ordering and equal values keep stable source order',()=>{
 assert.deepEqual(ids(sort(rows,'productName','asc')),['c','d','b','a']);
 assert.deepEqual(ids(sort(rows,'productName','desc')),['a','b','c','d']);
 assert.deepEqual(ids(rows),['a','b','c','d']);
});
test('order date and due date sort independently; undated remains last',()=>{
 assert.deepEqual(ids(sort(rows,'startDate','asc')),['b','c','d','a']);
 assert.deepEqual(ids(sort(rows,'endDate','asc')),['c','b','a','d']);
 assert.deepEqual(ids(sort(rows,'endDate','desc')),['b','c','a','d']);
});
test('status uses rendered status with manual completion label and reset returns source order',()=>{
 const statuses={a:'임의 완료',b:'작업중',c:'입고중',d:'작업완료'};
 assert.deepEqual(ids(sort(rows,'status','asc',r=>statuses[r.id])),['a','c','d','b']);
 assert.deepEqual(ids(sort(rows,'', 'desc')),['a','b','c','d']);
 assert.deepEqual(ids(sort([rows[2],rows[0]],'totalOrderQuantity','desc')),['a','c']);
});
