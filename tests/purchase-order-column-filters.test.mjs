import test from 'node:test';
import assert from 'node:assert/strict';
import '../frontend/purchase-order-filters.js';
const {matches} = globalThis.PurchaseOrderFilters;
const order = {orderRound:'09/16 발주', productId:'KR-0024', clientName:'(주)케이알', productName:'메디큐브 용기', startDate:'2026-09-16', endDate:'2026-09-30', totalOrderQuantity:1000, accumulatedInboundQuantity:1440, remainingQuantity:0, inboundRate:1.44, accumulatedShippingQuantity:726, shippingRate:0.726, remainingShippingQuantity:274};
test('column text searches combine with numeric ranges and keep original quantities',()=>{
 const snapshot=JSON.stringify(order);
 assert.ok(matches(order,{clientName:{query:'케이알'},productName:{query:'메디 큐브'},totalOrderQuantity:{min:'900',max:'1000'},remainingQuantity:{min:'0',max:'0'}}));
 assert.ok(!matches(order,{clientName:{query:'다른 업체'},totalOrderQuantity:{min:'900'}}));
 assert.ok(matches(order,{orderRound:{query:'kr-0024'}}));
 assert.equal(JSON.stringify(order),snapshot);
});
test('rates filter displayed percentage values including over 100 percent',()=>{
 assert.ok(matches(order,{inboundRate:{min:'144',max:'144'},shippingRate:{min:'72.6',max:'72.6'}}));
 assert.ok(!matches(order,{inboundRate:{max:'100'}}));
 assert.ok(matches({...order,inboundRate:.695},{inboundRate:{min:'70',max:'70'}}));
});
test('unknown quantities are not treated as zero and endpoints are inclusive',()=>{
 assert.ok(!matches({...order,shippingRate:null},{shippingRate:{max:'0'}}));
 assert.ok(!matches({...order,remainingShippingQuantity:undefined},{remainingShippingQuantity:{min:'0'}}));
 assert.ok(matches(order,{remainingShippingQuantity:{min:'274',max:'274'}}));
});
test('order date and due date combine; undated filter excludes scheduled orders',()=>{
 const filters={dates:{startDateMin:'2026-09-16',startDateMax:'2026-09-16',endDateMin:'2026-09-30',endDateMax:'2026-09-30'}};
 assert.ok(matches(order,filters));
 assert.ok(!matches({...order,endDate:''},filters));
 assert.ok(matches({...order,endDate:''},{dates:{undated:'on',startDateMin:'2026-09-01'}}));
 assert.ok(!matches(order,{dates:{undated:'on'}}));
 assert.ok(matches(order,{}));
});
