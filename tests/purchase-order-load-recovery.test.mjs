import assert from 'node:assert/strict';
import test from 'node:test';
import {adminSource, loadFunctions} from './helpers/frontend-runtime.mjs';

function runtime(requestApi) {
  const orders = [{purchaseOrderId:'PO-1'}];
  const app = loadFunctions(adminSource, ['loadPurchaseOrdersRequest'], {
    state:{purchaseOrders:orders,filteredPurchaseOrders:orders,purchaseOrdersLoaded:true},
    purchaseOrderListStatus:{textContent:'',dataset:{}}, inboundProductId:null,
    requestApi, populateInboundPurchaseOrders(){},getCurrentView(){return 'purchase-orders';},
    renderPurchaseOrders(message){app.message=message;},
    applyPurchaseOrderFilters(){app.state.filteredPurchaseOrders=app.state.purchaseOrders;},
  });
  return app;
}

test('malformed purchase response is an error and retains the last successful list',async()=>{
  const app=runtime(async()=>({}));
  assert.equal(await app.loadPurchaseOrdersRequest(),false);
  assert.equal(app.state.purchaseOrders.length,1);
  assert.equal(app.state.filteredPurchaseOrders.length,1);
  assert.equal(app.state.purchaseOrdersLoaded,true);
  assert.match(app.message,/발주 조회 응답/);
});

test('network failure retains the last successful purchase list',async()=>{
  const app=runtime(async()=>{throw new Error('조회 실패');});
  assert.equal(await app.loadPurchaseOrdersRequest(),false);
  assert.equal(app.state.purchaseOrders.length,1);
  assert.equal(app.message,'조회 실패');
});

test('a confirmed empty purchase list still replaces previous data',async()=>{
  const app=runtime(async()=>({purchaseOrders:[]}));
  assert.equal(await app.loadPurchaseOrdersRequest(),true);
  assert.equal(app.state.purchaseOrders.length,0);
  assert.equal(app.state.filteredPurchaseOrders.length,0);
});

test('an invalid first response remains a load error rather than a confirmed empty list',async()=>{
  const app=runtime(async()=>({purchaseOrders:null}));
  app.state.purchaseOrders=[];
  app.state.filteredPurchaseOrders=[];
  app.state.purchaseOrdersLoaded=false;
  assert.equal(await app.loadPurchaseOrdersRequest(),false);
  assert.equal(app.state.purchaseOrdersLoaded,false);
  assert.match(app.message,/발주 조회 응답/);
});
