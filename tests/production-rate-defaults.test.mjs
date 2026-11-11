import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildProductionRateBackfill} from '../tools/production-rate-defaults.mjs';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const product=(id,methods,extra={})=>({productCode:id,finalProcess:`${methods.length}도`,...Object.fromEntries(methods.map((m,i)=>[`processStage${i+1}`,m])),...extra});
test('8시간 기준을 수동 1·2·3도, 자동, 박 1·2·3도별로 환산하고 기존 값은 보존한다',()=>{
 const rows=[product('S',['실크','실크','실크']),product('F',['박','박','박']),product('M',['박','실크']),product('GROUP',['실크','실크'],{processGroups:[[1,2]]}),
 product('OLD',['실크'],{processHourlyProductionRates:{'1도':999}}),product('LEGACY',['실크'],{hourlyProductionRate:1200}),product('UNKNOWN',['']),{productCode:'COATING',finalProcess:'코팅'}];
 const before=structuredClone(rows),p=buildProductionRateBackfill(rows);assert.deepEqual(rows,before);
 const find=id=>p.items.find(i=>i.productId===id).patch;
 assert.deepEqual(find('S'),{processHourlyProductionRates:{'1도':1250,'2도':812.5,'3도':812.5},automaticHourlyProductionRate:2250});
 assert.deepEqual(find('F'),{processHourlyProductionRates:{'1도':700,'2도':700,'3도':700}});
 assert.deepEqual(find('M'),{processHourlyProductionRates:{'1도':700,'2도':812.5},automaticHourlyProductionRate:2250});
 assert.deepEqual(find('GROUP').processHourlyProductionRates,{'1도+2도':812.5});
 assert.deepEqual(find('OLD'),{automaticHourlyProductionRate:2250});
 assert.deepEqual(find('LEGACY'),{processHourlyProductionRates:{'1도':1200},automaticHourlyProductionRate:2250});assert.equal(p.exceptions.some(e=>e.productId==='S'),false);
 assert.ok(buildProductionRateBackfill([product('FOUR',['실크','실크','실크','실크'])]).exceptions.some(e=>e.process==='4도'));
 assert.equal(p.items.some(i=>i.productId==='UNKNOWN'||i.productId==='COATING'),false);
 assert.equal(buildProductionRateBackfill(p.items.map(i=>({...rows.find(r=>r.productCode===i.productId),...i.patch}))).items.length,0);
});
test('자동 생산량은 일반 생산량과 별도로 저장·수정·비우며 생략하면 보존한다',()=>{
 const payload={'업체명':'테스트','제품명':'제품','박스당 수량':100,'트레이 수량':10,'최종공정':'1도','1도 공정':'실크',automaticHourlyProductionRate:2250,processHourlyProductionRates:{'1도':1250}};
 const state={products:[],orders:[],inbounds:[],records:[],boxes:[]},now=new Date('2026-11-10T03:00:00Z');
 const first=applyMutation('createProduct',payload,state,now);const id=first.result.productId;
 assert.equal(first.state.products[0].automaticHourlyProductionRate,2250);assert.equal(first.state.products[0].processHourlyProductionRates['1도'],1250);
 const edit=p=>applyMutation('updateProduct',{productId:id,...p},first.state,now).state.products[0];
 assert.equal(edit({'비고':'보존'}).automaticHourlyProductionRate,2250);assert.equal(edit({automaticHourlyProductionRate:null}).automaticHourlyProductionRate,null);
 assert.throws(()=>edit({automaticHourlyProductionRate:-1}),/0보다 큰/);
});
const gas=fs.readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');
const backfill=fs.readFileSync(new URL('../gas/ProductionRates.js',import.meta.url),'utf8');
function sheetFixture(rate=''){
 const headers=['제품 ID','업체명','제품명','공정별 시간당 생산량','시간당 평균 생산량','자동 인쇄 시간당 생산량'];
 const values=[headers,['P','업체','이름',rate,'',''],['OTHER','유지 업체','유지 제품','{"1도":999}',999,'']];let writes=0,reads=0;
 const sheet={getDataRange:()=>({getValues:()=>{reads++;return structuredClone(values);}}),getRange:(row,col,count)=>({setValues:items=>{writes++;for(let i=0;i<count;i++)values[row-1+i][col-1]=items[i][0];}})};
 const c=vm.createContext({LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},verifySupabaseSheetSyncToken_:token=>{if(token!=='valid')throw Error('invalid');},getProductSheet_:()=>sheet,
 ensureProductCommonContainerHeaders_(){},findHeaderRow_:()=>({headers,rowIndex:0}),indexHeaders_:()=>Object.fromEntries(headers.map((h,i)=>[h,i])),findHeaderIndex_:(i,k)=>i[k[0]]??-1,clearApiReadCaches_(){}});
 for(const name of ['parseProductHourlyProductionRate_','parseProductProcessHourlyRates_']){
 const start=gas.indexOf('function '+name+'(');vm.runInContext(gas.slice(start,gas.indexOf('\nfunction ',start+1)),c);
 }
 vm.runInContext(backfill,c);return {c,values,get writes(){return writes;},get reads(){return reads;}};
}
const items=[{productId:'P',patch:{processHourlyProductionRates:{'1도':1250},hourlyProductionRate:1250,automaticHourlyProductionRate:2250}}];
test('시트 일괄 입력은 인증 후 생산량 열만 쓰고 재시도·미리보기는 중복 변경하지 않는다',()=>{
 const f=sheetFixture();assert.throws(()=>f.c.backfillProductProductionRates({items}),/로그인/);assert.equal(f.reads,0);
 assert.throws(()=>f.c.backfillProductProductionRates({token:'bad',items}),/invalid/);assert.equal(f.reads,0);
 const before=structuredClone(f.values);const preview=f.c.backfillProductProductionRates({token:'valid',items,dryRun:true,includeSnapshot:true});assert.equal(f.writes,0);assert.deepEqual(f.values,before);assert.equal(preview.updated,1);
 assert.equal(f.c.backfillProductProductionRates({token:'valid',items}).updated,1);assert.equal(f.writes,3);assert.deepEqual(f.values[2],before[2]);assert.deepEqual(f.values[1].slice(0,3),before[1].slice(0,3));
 assert.equal(f.c.backfillProductProductionRates({token:'valid',items}).updated,0);assert.equal(f.writes,3);
});
test('기존 시트 생산량과 충돌하거나 제품이 없으면 어떤 열도 쓰지 않는다',()=>{
 for(const f of [sheetFixture('{"1도":900}'),sheetFixture()]){
  const list=f.values[1][3]?items:[{productId:'MISSING',patch:{hourlyProductionRate:1250}}];
  assert.throws(()=>f.c.backfillProductProductionRates({token:'valid',items:list}),/충돌/);assert.equal(f.writes,0);
 }
});

test('일부 입력된 제품도 빈 항목을 보완하고 기존 양수 값과 다른 항목은 유지한다',()=>{
 const legacy=product('HAIR',['실크'],{hourlyProductionRate:1115,processHourlyProductionRates:{'1도':null},automaticHourlyProductionRate:null});
 const partial=product('PARTIAL',['박','실크','실크'],{hourlyProductionRate:222,processHourlyProductionRates:{'1도':650,'2도':900,'3도':null,'추가':777},automaticHourlyProductionRate:2600,note:'유지'});
 const result=buildProductionRateBackfill([legacy,partial]);
 const first=result.items.find(i=>i.productId==='HAIR');assert.deepEqual(first.patch,{processHourlyProductionRates:{'1도':1115},automaticHourlyProductionRate:2250});
 const second=result.items.find(i=>i.productId==='PARTIAL');assert.deepEqual(second.patch,{processHourlyProductionRates:{'1도':650,'2도':900,'3도':812.5,'추가':777}});
 assert.equal(partial.note,'유지');assert.equal(partial.hourlyProductionRate,222);
 assert.equal(buildProductionRateBackfill([legacy,partial].map(p=>({...p,...result.items.find(i=>i.productId===p.productCode).patch}))).items.length,0);
});
test('묶음별 빈 값만 채우고 기존 자동 수량과 공정 구분 없는 제품을 유지한다',()=>{
 const grouped=product('G',['실크','실크','실크'],{processGroups:[[1,2],[3]],processHourlyProductionRates:{'1도+2도':970,'3도':null},automaticHourlyProductionRate:2100});
 const unknown=product('UNKNOWN',['','']);const filled=product('DONE',['박'],{hourlyProductionRate:600,processHourlyProductionRates:{'1도':600}});
 const plan=buildProductionRateBackfill([grouped,unknown,filled]);
 assert.deepEqual(plan.items.map(i=>i.patch),[{processHourlyProductionRates:{'1도+2도':970,'3도':812.5}}]);
 assert.equal(plan.exceptions.length,2);assert.ok(plan.existing.includes('DONE'));assert.equal(plan.items.some(i=>i.productId==='UNKNOWN'),false);
});
