import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../frontend/production-planner.js', import.meta.url),'utf8'), context);
const planner = context.SeungjinProductionPlanner;
const input = {orderQuantity:36000,cumulativeProduction:8000,cumulativeHours:9,loss:0,actualProduction:8000,workDays:5};
const base = { id:'one',group:'order|박 인쇄',process:'박 인쇄',machine:'1호기',worker:'작업자',remaining:16000,hourlyRate:1000,dueDate:'2026-09-14' };
const run = (jobs, startDate='2026-09-11') => planner.schedule({jobs,startDate,holidays:new Set(['2026-09-24','2026-09-25','2026-10-05']),machines:{'박 인쇄':['1호기','2호기']}});
test('원본 G9 H9 V9 W9 P9 Q9 Y9 수식을 재현한다',()=>{
 const v=planner.calculate(input);
 assert.equal(v.remaining,28000);assert.equal(v.hourlyRate,8000/9);assert.equal(v.dailyRequired,7200);
 assert.ok(Math.abs(v.formulaTarget-7288.888888889)<1e-6);assert.equal(v.dailyTargetHours,8.5);assert.equal(v.totalExpectedHours,31.5);assert.ok(Math.abs(v.achievementRate-111.11111111)<1e-6);
});
test('생산 실적 누락을 0이나 입고량으로 대체하지 않는다',()=>{
 const v=planner.calculate({...input,cumulativeProduction:null});assert.equal(v.remaining,null);assert.equal(v.formulaTarget,null);
 const r=run([{...base,hourlyRate:null}]);assert.equal(r.complete,false);assert.equal(r.entries.length,0);assert.equal(r.unknown.length,1);
});
for(const [quantity,hours,holiday] of [[16000,8,false],[18000,9,false],[20000,10,false],[24000,8,true]]) {
 test(`${quantity}개: 평일 8→9→10 이후 휴일 8시간`,()=>{
  const r=run([{...base,remaining:quantity}]);assert.equal(r.complete,true);assert.equal(r.mode.hours,hours);assert.equal(Boolean(r.mode.holidays),holiday);
  assert.equal(r.entries.reduce((sum,e)=>sum+e.quantity,0),quantity);
  assert.ok(r.entries.every(e=>e.hours<=10 && (!e.holiday || e.hours<=8)));
 });
}
test('같은 기계와 같은 작업자는 동시에 겹쳐 배정되지 않는다',()=>{
 const r=run([base,{...base,id:'two',group:'two',machine:'2호기',remaining:8000}]);
 for(const day of new Set(r.entries.map(e=>e.date))) {
  const entries=r.entries.filter(e=>e.date===day).sort((a,b)=>a.startHour-b.startHour);
  for(let i=1;i<entries.length;i++) assert.ok(entries[i].startHour>=entries[i-1].startHour+entries[i-1].hours-1e-7);
 }
});
test('동일 발주를 두 행에 넣어도 발주 잔량을 중복 생산하지 않는다',()=>{
 const r=run([base,{...base,id:'two',machine:'2호기',worker:'다른 작업자'}]);
 assert.equal(r.entries.reduce((sum,e)=>sum+e.quantity,0),16000);
});
test('공휴일과 주말을 제외해 계산하고 불가피한 휴일은 최대 8시간이다',()=>{
 const r=run([{...base,dueDate:'2026-09-28',remaining:16000}],'2026-09-23');
 assert.equal(r.complete,true);assert.deepEqual(Array.from(r.entries,e=>e.date),['2026-09-23','2026-09-28']);
 const impossible=run([{...base,dueDate:'2026-09-12',remaining:100000}]);
 assert.equal(impossible.complete,false);assert.ok(impossible.unplanned>0);
 assert.ok(impossible.entries.filter(e=>e.holiday).every(e=>e.hours<=8));
});
test('납기 경과·납기 누락·달력 미지원 연도는 가능하다고 표시하지 않는다',()=>{
 for(const dueDate of ['2026-09-10','','2027-01-10']) {
  const r=run([{...base,dueDate}]);assert.equal(r.complete,false);assert.equal(r.unknown.length,1);
 }
});
test('이미 완료한 작업과 소량 잔량은 초과 생산하지 않는다',()=>{
 assert.equal(run([{...base,remaining:0}]).entries.length,0);
 const r=run([{...base,remaining:11}]);assert.equal(r.entries[0].quantity,11);assert.ok(r.entries[0].hours<8);
});
