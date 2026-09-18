import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { applyMutation, buildInventoryDashboard } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const source = fs.readFileSync(new URL('../frontend/admin.js', import.meta.url), 'utf8');
function setup({ failure = '', changed = false, cancel = false, readFail = false } = {}) {
  let db = {products:[],orders:[],inbounds:[],records:['A','B'].map(managementId=>({managementId,productId:'P'})), boxes:[]};
  for (const record of db.records) for (let n=1;n<=5;n++) db.boxes.push({...record,boxId:record.managementId+n,number:n,quantity:100,status:['보관','출고대기','보류','폐기','보관'][n-1],lastInventoryCheckedAt:n===5?'2026-09-18':''});
  const dashboard = () => buildInventoryDashboard(db.records,db.boxes);
  const nodes = new Map();
  const node = id => { if(!nodes.has(id)) nodes.set(id,{}); return nodes.get(id); };
  const mutations=[];
  const app=vm.createContext({
    state:{inventoryRows:dashboard().rows,inventoryAuditSelection:new Map(),isInventoryAuditBulkSaving:false},
    document:{querySelector:node},inventoryAttentionSearchInput:{},closeInventoryAttentionModalButton:{},
    signedInAdminName:'test',INVENTORY_DASHBOARD_CACHE_KEY:'test',writeAdminCache(){},showToast(){},
    formatNumber:String,normalizeSearchText:v=>String(v||'').replace(/\s/g,''),parseShippingSettlementNumber:Number,
    window:{confirm:()=>!cancel},refreshOpenInventoryAttentionList(){},
    applyInventoryDashboardResult:result=>{app.state.inventoryRows=result.rows;},
    requestApi:async(action,payload)=>{
      if(action==='getInventoryDashboard') {
        if(readFail) throw new Error('offline');
        if(changed) db.boxes[0].lastInventoryCheckedAt='now';
        return dashboard();
      }
      mutations.push(payload);
      if(payload.managementId===failure) throw new Error('conflict');
      const result=applyMutation(action,payload,db); db=result.state; return result.result;
    }
  });
  for(const name of ['normalizeInventoryStockStatus','isProtectedInventoryAuditBox','getInventoryPhysicalConfirmationBoxes','getInventoryAuditEligibleBoxes','getInventoryAuditTargetBoxes','getInventoryAuditSelectionKey','getInventoryAuditSelectionSnapshot','renderInventoryAuditBulkControls','saveInventoryAuditBulk']) {
    const match=source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?\\n\\}`,'m')); assert.ok(match,name);vm.runInContext(match[0],app);
  }
  for(const row of app.state.inventoryRows) app.state.inventoryAuditSelection.set(app.getInventoryAuditSelectionKey(row),app.getInventoryAuditSelectionSnapshot(row));
  return {app,mutations,node,db:()=>db};
}
test('bulk removes only unconfirmed eligible boxes, includes waiting and preserves confirmed/held/discarded boxes',async()=>{
  const h=setup();await h.app.saveInventoryAuditBulk();
  assert.equal(h.mutations.length,2);
  for(const p of h.mutations){assert.deepEqual(Array.from(p.selectedBoxes),[1,2]);assert.equal(p.boxQuantities[1],0);assert.equal(p.expectedBoxQuantities[1],100);assert.equal(p.protectClassifiedInventory,true);}
  assert.equal(h.db().boxes.filter(b=>b.shippingType==='재고조정').length,4);
  assert.equal(h.db().boxes.filter(b=>b.quantity===100).length,6);
  assert.equal(h.app.state.inventoryAuditSelection.size,0);
});
test('one failed record does not replay successful records; failed selection and reason remain',async()=>{
  const h=setup({failure:'B'});await h.app.saveInventoryAuditBulk();
  assert.equal(h.app.state.inventoryAuditSelection.size,1);
  assert.match(h.node('#inventoryAuditBulkResult').textContent,/B: conflict/);
  h.mutations.length=0;await h.app.saveInventoryAuditBulk();assert.equal(h.mutations.length,1);assert.equal(h.mutations[0].managementId,'B');
});
test('new physical confirmation since selection excludes that record without affecting others',async()=>{
  const h=setup({changed:true});await h.app.saveInventoryAuditBulk();assert.equal(h.mutations.length,1);assert.equal(h.mutations[0].managementId,'B');assert.match(h.node('#inventoryAuditBulkResult').textContent,/확인 상태가 변경/);
});
test('cancel, duplicate click and failed fresh lookup never write stock',async()=>{
  for(const options of [{cancel:true},{readFail:true}]) { const h=setup(options);await h.app.saveInventoryAuditBulk();assert.equal(h.mutations.length,0); }
  const h=setup();h.app.state.isInventoryAuditBulkSaving=true;await h.app.saveInventoryAuditBulk();assert.equal(h.mutations.length,0);
});
test('search prunes hidden selections and visible select-all uses eligible box snapshots',()=>{
  const h=setup(),row=h.app.state.inventoryRows[0];h.app.renderInventoryAuditBulkControls('audit',[row]);assert.equal(h.app.state.inventoryAuditSelection.size,1);assert.match(h.node('#inventoryAuditBulkSummary').textContent,/1건 · 2 box · 200 ea/);
  h.node('#inventoryAuditSelectAll').checked=false;h.node('#inventoryAuditSelectAll').onchange();assert.equal(h.app.state.inventoryAuditSelection.size,0);
  h.node('#inventoryAuditSelectAll').checked=true;h.node('#inventoryAuditSelectAll').onchange();assert.equal(h.app.state.inventoryAuditSelection.size,1);
  h.app.renderInventoryAuditBulkControls('storage',[]);assert.equal(h.node('#inventoryAuditBulkToolbar').hidden,true);assert.equal(h.app.state.inventoryAuditSelection.size,0);
});
