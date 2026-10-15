import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const c=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../frontend/production-planner.js',import.meta.url),'utf8'),c);
const {plan,dayType}=c.SeungjinProductionPlanner;
const run=options=>plan({orderQuantity:24000,hourlyRate:1000,startDate:'2026-10-19',dueDate:'2026-10-23',...options});
const sum=p=>p.schedule.reduce((sum,day)=>sum+day.targetQuantity,0);

test('납기가 충분하면 평일 8시간으로 빠르게 끝내고 야근·휴일을 배정하지 않는다',()=>{
 const p=run({});assert.equal(p.hours,8);assert.equal(p.targetQuantity,8000);assert.equal(p.completionDate,'2026-10-21');assert.equal(sum(p),24000);
 assert.ok(p.schedule.every(d=>d.type==='weekday' && d.hours===8));
});
test('미래 평일을 다 써도 부족한 만큼만 연장하고 하루 10시간을 넘지 않는다',()=>{
 const p=run({orderQuantity:17500,dueDate:'2026-10-20'});
 assert.equal(p.targetQuantity,9500);assert.equal(p.hours,9.5);assert.equal(p.schedule[1].hours,8);assert.equal(p.mode,'overtime');assert.equal(sum(p),17500);
 const m=run({orderQuantity:16001,dueDate:'2026-10-20'});assert.equal(m.hours,8);assert.equal(m.schedule[1].hours,8+1/60);assert.equal(sum(m),16001);
});
test('평일 최대 10시간으로 충분하면 먼저 오는 주말도 쉬게 한다',()=>{
 const p=run({orderQuantity:19000,startDate:'2026-10-17',dueDate:'2026-10-20'});
 assert.equal(p.hours,0);assert.equal(p.targetQuantity,0);assert.equal(p.mode,'overtime');assert.ok(p.schedule.every(d=>d.type==='weekday'));assert.equal(sum(p),19000);
});
test('평일 연장으로 부족할 때만 주말에 필요한 시간만 배정한다',()=>{
 const p=run({orderQuantity:13000,startDate:'2026-10-16',dueDate:'2026-10-18'});
 assert.equal(p.schedule[0].hours,10);assert.equal(p.schedule[1].type,'weekend');assert.equal(p.schedule[1].hours,3);assert.equal(p.mode,'weekend');assert.equal(sum(p),13000);
 assert.equal(p.schedule.length,2);
});
test('같은 토요일이라도 지정 공휴일은 마지막 단계로 남긴다',()=>{
 const p=run({orderQuantity:13000,startDate:'2026-08-15',dueDate:'2026-08-17'});
 assert.equal(p.hours,3);assert.equal(p.mode,'holiday');assert.equal(p.schedule[0].date,'2026-08-15');assert.equal(p.schedule[0].hours,3);
 assert.equal(p.schedule[1].date,'2026-08-16');assert.equal(p.schedule[1].hours,10);
});
test('어쩔 수 없는 공휴일 작업만 배정하고 최대치로도 부족하면 숨기지 않는다',()=>{
 const p=run({orderQuantity:12000,startDate:'2026-10-09',dueDate:'2026-10-10'});
 assert.equal(p.mode,'holiday');assert.equal(p.hours,2);assert.equal(p.schedule[1].hours,10);assert.equal(sum(p),12000);
 const no=run({orderQuantity:11000,startDate:'2026-10-09',dueDate:'2026-10-09'});
 assert.equal(no.mode,'shortfall');assert.equal(no.shortfall,1000);assert.equal(no.hours,10);assert.match(no.message,/1,000개 부족/);
});
test('일반 목표는 500개 내림하고 마지막 날만 남은 수량을 정확히 끝낸다',()=>{
 const p=run({orderQuantity:99100,hourlyRate:751,dueDate:'2026-11-30'});
 assert.equal(p.targetQuantity,6000);assert.equal(p.hours,8);assert.equal(sum(p),99100);assert.equal(p.schedule.at(-1).targetQuantity,3100);
 assert.ok(p.schedule.slice(0,-1).every(d=>d.targetQuantity%500===0));
 const small=run({orderQuantity:250});assert.equal(small.targetQuantity,250);assert.equal(small.hours,8);
 const edge=run({orderQuantity:6008,hourlyRate:751});assert.equal(edge.targetQuantity,6008);assert.equal(edge.hours,8);
});
test('이미 생산한 수량을 빼고 초과 실적은 더 생산하지 않는다',()=>{
 const p=run({completedProduction:23000});assert.equal(p.remainingQuantity,1000);assert.equal(p.targetQuantity,1000);assert.equal(sum(p),1000);
 const done=run({completedProduction:25000});assert.equal(done.mode,'complete');assert.equal(done.hours,0);assert.equal(done.targetQuantity,0);
});
test('매일 납기는 근무일 8시간을 우선하고 일일 최소량 때문에만 연장한다',()=>{
 const p=run({deliveryType:'daily',dailyMinimumQuantity:9000});assert.equal(p.hours,9);assert.equal(p.targetQuantity,9000);assert.equal(p.mode,'overtime');
 const usual=run({deliveryType:'daily',dailyMinimumQuantity:7000});assert.equal(usual.hours,8);assert.equal(usual.targetQuantity,8000);
 const high=run({deliveryType:'daily',dailyMinimumQuantity:11000});assert.equal(high.hours,10);assert.equal(high.shortfall,1000);
 const last=run({orderQuantity:250,deliveryType:'daily',dailyMinimumQuantity:7000});assert.equal(last.targetQuantity,250);assert.equal(last.shortfall,0);
 const rest=run({startDate:'2026-10-17',deliveryType:'daily',dailyMinimumQuantity:7000});assert.equal(rest.hours,0);assert.equal(rest.mode,'rest');
});
test('2026·2027년 공휴일과 대체공휴일을 주말보다 먼저 분류한다',()=>{
 for(const d of ['2026-05-01','2026-07-17','2026-09-26','2026-10-05','2027-05-03','2027-07-19','2027-12-27'])assert.equal(dayType(d),'holiday',d);
 assert.equal(dayType('2027-06-07'),'weekday');assert.equal(dayType('2026-10-17'),'weekend');
 const p=run({startDate:'2026-12-31',dueDate:'2027-01-05'});assert.ok(!p.schedule.some(d=>['2027-01-01','2027-01-02','2027-01-03'].includes(d.date)));
});
test('추가 회사 휴무일과 미지원 연도·잘못된 날짜를 명확히 처리한다',()=>{
 assert.equal(run({extraHolidays:['2026-10-19']}).hours,0);
 for(const options of [{startDate:'2028-01-03'},{dueDate:'2028-01-03'},{startDate:'2026-02-30'},{dueDate:'bad'},{hourlyRate:0},{completedProduction:null},{extraHolidays:['bad']}]) {
  const p=run(options);assert.equal(p.targetQuantity,null,JSON.stringify(options));assert.ok(p.message);
 }
 const missing=run({dueDate:''});assert.equal(missing.hours,8);assert.match(missing.message,/납기일 미입력/);assert.equal(missing.completionDate,null);
 const overdue=run({dueDate:'2026-10-18'});assert.match(overdue.message,/납기 경과/);assert.equal(overdue.hours,10);assert.equal(overdue.shortfall,14000);
});
test('다양한 속도·잔량·납기에서도 초과 생산·10시간 초과·완료 거짓 표시가 없다',()=>{
 for(const rate of [50,751,1080,1200.5])for(const quantity of [250,6008,99100])for(const dueDate of ['2026-10-19','2026-10-23','2026-11-30']){
  const p=run({orderQuantity:quantity,hourlyRate:rate,dueDate});
  assert.equal(sum(p)+p.shortfall,quantity);
  assert.ok(p.schedule.every(d=>d.hours>0 && d.hours<=10 && d.targetQuantity<=rate*d.hours+1e-6));
  assert.ok(p.schedule.slice(0,-1).every(d=>d.targetQuantity%500===0));
  assert.equal(p.completionDate!==null,p.shortfall===0);
  assert.ok(p.schedule.every(d=>d.date<=dueDate));
 }
});
