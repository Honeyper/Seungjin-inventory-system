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

const stages = (overrides = {}) => [
 {...base,id:'stage1',group:'order|1',stage:1,dueDate:'2026-10-12',remaining:4000,machine:'1호기',worker:'1도 작업자'},
 {...base,id:'stage2',group:'order|2',stage:2,dueDate:'2026-10-12',remaining:4000,machine:'2호기',worker:'2도 작업자',
   upstreamGroup:'order|1',inputQuantity:0,...overrides}
];
test('2도는 다른 기계에서도 1도 배치가 끝난 뒤에 작업하고 수량을 공정별로 계산한다',()=>{
 const r=run(stages(),'2026-10-12');
 assert.equal(r.complete,true);
 const [first,second]=r.entries;
 assert.equal(first.quantity,4000);assert.equal(second.quantity,4000);
 assert.ok(second.startHour>=first.startHour+first.hours-1e-7);
 assert.equal(r.mode.hours,8);
});
test('같은 기계의 1도·2도 시간도 겹치지 않는다',()=>{
 const r=run(stages({machine:'1호기'}),'2026-10-12');
 assert.equal(r.complete,true);assert.equal(r.entries[1].startHour,4);
});
test('이미 끝난 1도 물량은 사용할 수 있지만 남은 2도 작업을 과다 배정하지 않는다',()=>{
 const jobs=stages({remaining:9000,inputQuantity:2000});jobs[0].remaining=0;
 const r=run(jobs,'2026-10-12');
 assert.equal(r.entries.length,1);assert.equal(r.entries[0].quantity,2000);
 assert.equal(r.remaining.get('order|2'),7000);assert.equal(r.complete,false);
});
test('이전 공정 실적이 없으면 2도 생산 가능량을 가정하지 않는다',()=>{
 const r=run(stages({inputQuantity:null}),'2026-10-12');
 assert.equal(r.unknown.find(row=>row.id==='stage2').reason,'이전 공정 실적 확인 필요');
 assert.ok(!r.entries.some(row=>row.id==='stage2'));
});
test('날짜가 바뀌어도 1도 생산분을 2도에 중복 사용하지 않는다',()=>{
 const jobs=stages({remaining:9000,machine:'1호기',dueDate:'2026-10-13'});
 Object.assign(jobs[0],{remaining:9000,dueDate:'2026-10-13'});
 const r=run(jobs,'2026-10-12');
 assert.equal(r.complete,true);
 for(const id of ['stage1','stage2'])assert.equal(r.entries.filter(row=>row.id===id).reduce((sum,row)=>sum+row.quantity,0),9000);
 for(const entry of r.entries.filter(row=>row.id==='stage2')) {
  const upstream=r.entries.filter(row=>row.id==='stage1' && (row.date<entry.date || row.date===entry.date && row.startHour+row.hours<=entry.startHour+1e-7)).reduce((sum,row)=>sum+row.quantity,0);
  const consumed=r.entries.filter(row=>row.id==='stage2' && (row.date<entry.date || row.date===entry.date && row.startHour<=entry.startHour)).reduce((sum,row)=>sum+row.quantity,0);
  assert.ok(consumed<=upstream);
 }
});
