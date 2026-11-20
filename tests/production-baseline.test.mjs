import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup() {
 const data=new Map();const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 const app=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(new URL('../frontend/production-baseline.js',import.meta.url),'utf8'),app);
 return {api:app.window.SeungjinProductionBaseline,storage,data,job:{purchaseOrderId:'PO',productId:'P',process:'실크 인쇄',stage:1,stageGroup:[1]}};
}
test('날짜별 기준을 보존하고 같은 날 수정은 누적하지 않으며 환경·공정 묶음을 분리한다',()=>{
 const {api,storage,job}=setup();api.save(storage,'prod',job,'2026-11-10',30000);api.save(storage,'prod',job,'2026-11-19',60000);
 api.save(storage,'prod',job,'2026-11-19',61000);
 assert.equal(api.read(storage,'prod',job,'2026-11-18').quantity,30000);
 assert.equal(api.read(storage,'prod',job,'2026-11-20').quantity,61000);
 assert.equal(api.read(storage,'prod',job,'2026-11-09'),null);
 assert.equal(api.read(storage,'dev',job,'2026-11-20'),null);
 assert.equal(api.read(storage,'prod',{...job,stageGroup:[1,2]},'2026-11-20'),null);
 api.remove(storage,'prod',job,'2026-11-19');assert.equal(api.read(storage,'prod',job,'2026-11-20').quantity,30000);
});
test('0은 명시적 기준으로 보존하고 잘못된 날짜·소수·초과 정수 및 저장 실패는 거부한다',()=>{
 const {api,storage,job}=setup();api.save(storage,'prod',job,'2026-11-19',0);
 assert.equal(api.read(storage,'prod',job,'2026-11-20').quantity,0);
 for(const date of ['2026-02-30','bad',''])assert.throws(()=>api.save(storage,'prod',job,date,5));
 for(const value of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>api.save(storage,'prod',job,'2026-11-19',value));
 const blocked={...storage,setItem(){throw new Error('blocked');}};
 assert.throws(()=>api.save(blocked,'prod',job,'2026-11-19',100),/blocked/);
 assert.equal(api.read(storage,'prod',job,'2026-11-20').quantity,0);
});
