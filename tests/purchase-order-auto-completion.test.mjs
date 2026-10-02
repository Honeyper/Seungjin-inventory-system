import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFunctions,adminSource} from './helpers/frontend-runtime.mjs';
import {buildOrderShippingLinks,summarizePurchaseOrderShipping} from '../supabase/functions/seungjin-dev-gateway/purchase-order-shipping.js';
const order={purchaseOrderId:'PO1',productId:'P1',productName:'용기',orderRound:'10/02',totalOrderQuantity:1000,accumulatedInboundQuantity:1200,status:'입고완료',storedStatus:'진행 중'};
const links=buildOrderShippingLinks([order],[{management_id:'IN1',product_id:'P1',purchase_order_id:'PO1'}]);
const box=(quantity,status='출고완료',type='정상출고')=>({box_id:'BOX1',management_id:'IN1',product_id:'P1',quantity,status,shipping_type:type});
const read=(o,boxes)=>summarizePurchaseOrderShipping([o],links,boxes)[0];
function runtime(orders) {
 return loadFunctions(adminSource,['getPurchaseOrderDisplayStatus','applyPurchaseOrderFilters','renderPurchaseOrderSummary'],{
  state:{purchaseOrders:orders,purchaseOrderQuery:'',purchaseOrderStatusFilter:'',showCompletedPurchaseOrders:false},
  toggleCompletedPurchaseOrdersButton:{textContent:'',setAttribute(k,v){this[k]=v}},purchaseOrderColumnSort:null,
  purchaseOrderTotal:{},purchaseOrderActive:{},purchaseOrderCompleted:{},purchaseOrderRemaining:{},renderPurchaseOrders(){},
  normalizeSearchText:s=>String(s||'').toLowerCase()
 });
}
test('100% 미만, 정확히 100%, 초과 출고를 서버와 화면에서 동일하게 판정한다',()=>{
 for(const [q,completed] of [[999,false],[1000,true],[1200,true]]) {
  const result=read(order,[box(q)]);const app=runtime([result]);
  assert.equal(result.automaticallyCompleted,completed);
  assert.equal(result.status,completed?'발주완료':'입고완료');
  assert.equal(app.getPurchaseOrderDisplayStatus(result),completed?'발주완료':'작업중');
  assert.equal(result.shippingRate,q/1000);assert.equal(result.accumulatedInboundQuantity,1200);
 }
 assert.equal(order.status,'입고완료');
});
test('반올림되어 100%로 보이는 99.99%, 발주량 0, 취소 발주는 자동 마감하지 않는다',()=>{
 assert.equal(read(order,[box(999.9)]).automaticallyCompleted,false);
 assert.equal(read({...order,totalOrderQuantity:0},[box(1000)]).automaticallyCompleted,false);
 const cancelled=read({...order,status:'취소',storedStatus:'취소'},[box(1000)]);
 assert.equal(cancelled.status,'취소');assert.equal(cancelled.automaticallyCompleted,false);
});
test('수동 완료 이력은 유지하며 출고 취소는 자동 완료만 해제한다',()=>{
 const completed=read(order,[box(1000)]);
 const reverted=read(completed,[box(1000,'보관')]);
 assert.equal(reverted.automaticallyCompleted,false);assert.equal(reverted.status,'입고완료');
 assert.equal(runtime([reverted]).getPurchaseOrderDisplayStatus(reverted),'입고완료');
 const manual=read({...order,status:'임의 완료',storedStatus:'임의 완료',manualCompletedBy:'관리자'},[box(0)]);
 assert.equal(manual.status,'임의 완료');assert.equal(manual.manualCompletedBy,'관리자');
});
test('반출·이관·재고조정·출고대기는 자동 완료를 위한 정상 출고에 합산하지 않는다',()=>{
 for(const type of ['반출','이관(코팅)','이관(2공장)','재고조정'])assert.equal(read(order,[box(1000,'출고완료',type)]).automaticallyCompleted,false);
 assert.equal(read(order,[box(1000,'출고대기')]).automaticallyCompleted,false);
});
test('완료 항목은 기본 숨김이며 검색·상태 필터는 보기 전환 이후에도 유지한다',()=>{
 const automatic=read(order,[box(1000)]);
 const active={...order,purchaseOrderId:'PO2',accumulatedShippingQuantity:100};
 const manual={...order,purchaseOrderId:'PO3',status:'임의 완료'};
 const app=runtime([automatic,active,manual]);app.applyPurchaseOrderFilters();
 assert.deepEqual(Array.from(app.state.filteredPurchaseOrders,o=>o.purchaseOrderId),['PO2']);
 assert.equal(app.toggleCompletedPurchaseOrdersButton['aria-pressed'],'false');
 app.state.showCompletedPurchaseOrders=true;app.state.purchaseOrderQuery='용기';app.applyPurchaseOrderFilters();
 assert.equal(app.state.filteredPurchaseOrders.length,3);
 app.state.purchaseOrderStatusFilter='발주완료';app.applyPurchaseOrderFilters();assert.equal(app.state.filteredPurchaseOrders.length,2);
 app.state.purchaseOrderStatusFilter='작업중';app.applyPurchaseOrderFilters();assert.equal(app.state.filteredPurchaseOrders.length,1);
 app.state.showCompletedPurchaseOrders=false;app.applyPurchaseOrderFilters();assert.equal(app.state.purchaseOrderQuery,'용기');assert.equal(app.state.purchaseOrderStatusFilter,'작업중');
});
