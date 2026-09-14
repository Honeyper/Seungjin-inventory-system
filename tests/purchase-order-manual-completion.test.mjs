import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const order={purchaseOrderId:'PO-OLD',productId:'P',productName:'지난 발주',clientName:'업체',startDate:'2026-07-24',totalOrderQuantity:1000,accumulatedInboundQuantity:690,remainingQuantity:310,inboundRate:.69,status:'진행 중',storedStatus:'진행 중',note:'기존 메모'};
const state={products:[],orders:[order],inbounds:[],records:[],boxes:[]};
const now=new Date('2026-09-14T09:00:00Z');
function mutate(s,p){return applyMutation('updatePurchaseOrder',{purchaseOrderId:'PO-OLD',...p},s,now);}
test('69% 발주 임의 완료와 취소는 입고량·미입고량·비율을 변경하지 않는다',()=>{
 const closed=mutate(state,{completionAction:'complete',userName:'검증'});
 const row=closed.state.orders[0];
 assert.equal(row.status,'임의 완료');assert.equal(row.manualCompletedBy,'검증');
 for(const key of ['totalOrderQuantity','accumulatedInboundQuantity','remainingQuantity','inboundRate','note'])assert.equal(row[key],order[key]);
 assert.equal(closed.changes.inventoryBoxes.upserts.length,0);
 assert.equal(closed.changes.inbounds.upserts.length,0);
 const reopened=mutate(closed.state,{completionAction:'reopen'}).state.orders[0];
 assert.equal(reopened.status,'진행 중');assert.equal(reopened.inboundRate,.69);
});
test('기존 편집창에서 자동 상태를 보내도 임의 완료를 해제하지 않는다',()=>{
 const closed=mutate(state,{completionAction:'complete'});
 const edited=mutate(closed.state,{status:'',note:'메모 수정'}).state.orders[0];
 assert.equal(edited.status,'임의 완료');assert.equal(edited.inboundRate,.69);
});
test('입고 재집계 후에도 임의 완료 상태와 실제 수량을 유지한다',()=>{
 const closed=mutate(state,{completionAction:'complete'});
 closed.state.products=[{productId:'P',productCode:'P',productName:'지난 발주',clientName:'업체'}];
 const result=applyMutation('createInbound',{productId:'P',purchaseOrderId:'PO-OLD',boxQuantity:100,inboundBoxCount:2,remainderQuantities:[30],inboundDate:'2026-09-14',inboundTime:'09:00',inboundType:'정상입고',storage:'현장'},closed.state,now);
 assert.equal(result.state.orders[0].status,'임의 완료');assert.equal(result.state.orders[0].accumulatedInboundQuantity,230);assert.equal(result.state.orders[0].inboundRate,.23);
});
function functionSource(source,name){const a=source.indexOf(`function ${name}(`);const b=source.indexOf('\nfunction ',a+1);return source.slice(a,b<0?undefined:b);}
test('화면 상태와 생산계획 대상은 임의 완료를 일반 입고완료와 구분한다',()=>{
 const s=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
 const c=vm.createContext({state:{purchaseOrders:[{...order,status:'임의 완료'}, {...order,purchaseOrderId:'PO-ACTIVE'}]},getProductionPlanBalance:o=>o.remainingQuantity});
 vm.runInContext(functionSource(s,'getPurchaseOrderDisplayStatus')+'\n'+functionSource(s,'getProductionPlanOpenOrders'),c);
 assert.equal(c.getPurchaseOrderDisplayStatus({...order,status:'임의 완료'}),'임의 완료');
 assert.equal(c.getProductionPlanOpenOrders().length,1);assert.equal(c.getProductionPlanOpenOrders()[0].purchaseOrderId,'PO-ACTIVE');
});
test('시트 수식 재계산도 임의 완료 상태를 보존한다',()=>{
 const s=fs.readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');
 const c=vm.createContext({Utilities:{formatDate:()=> '2026-09-14'}});vm.runInContext(functionSource(s,'resolvePurchaseOrderStatus_'),c);
 assert.equal(c.resolvePurchaseOrderStatus_({...order,storedStatus:'임의 완료'},690),'임의 완료');
 assert.equal(c.resolvePurchaseOrderStatus_(order,1000),'입고완료');
});
