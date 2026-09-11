import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../gas/ProductionPlan.js',import.meta.url),'utf8');
test('생산 원본은 토큰을 확인한 뒤 읽고 수식 결과 대신 원시 실적을 반환한다',()=>{
 let authorized=false,reads=0;
 const rows=Array.from({length:7},()=>Array(25).fill(''));
 rows[1][9]='2026.9.8.';
 Object.assign(rows[5],{1:'박 인쇄',2:7,3:'업체',4:'제품',8:'2026.9.11.',14:5,17:36000,18:0,19:8000,20:9,23:8000});
 Object.assign(rows[6],{2:1,3:'다른 업체',4:'다른 제품',17:100,18:0,19:0,20:0,23:'-'});
 const c=vm.createContext({verifySupabaseSheetSyncToken_:token=>{if(token!=='valid')throw Error('invalid');authorized=true;},
  SpreadsheetApp:{openById:()=>{assert.ok(authorized);reads++;return {getSheetByName:()=>({getLastRow:()=>7,getRange:()=>({getValues:()=>rows})})};}}});
 vm.runInContext(source,c);
 assert.throws(()=>c.getProductionPlanReference({}),/로그인/);
 assert.throws(()=>c.getProductionPlanReference({token:'wrong'}),/invalid/);assert.equal(reads,0);
 const data=c.getProductionPlanReference({token:'valid'});
 assert.equal(data.rows[0].cumulativeProduction,8000);assert.equal(data.rows[0].cumulativeHours,9);assert.equal(data.rows[0].dueDate,'2026-09-11');
 assert.equal(data.rows[1].cumulativeProduction,0);assert.equal(data.rows[1].actualProduction,null);
 assert.equal(data.rows[0].id,'박 인쇄|업체|제품|7');
});
