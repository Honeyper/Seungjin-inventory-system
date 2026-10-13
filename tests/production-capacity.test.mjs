import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../frontend/production-planner.js',import.meta.url),'utf8'),context);
const planner=context.SeungjinProductionPlanner;
test('하루 목표는 발주량과 시간당 생산량의 8시간 수량 중 작은 값이다',()=>{
 let result=planner.calculate({orderQuantity:10000,hourlyRate:1000});assert.equal(result.targetQuantity,8000);assert.equal(result.hours,8);assert.equal(result.totalHours,10);
 result=planner.calculate({orderQuantity:7000,hourlyRate:1000});assert.equal(result.targetQuantity,7000);assert.equal(result.hours,7);
});
test('500개 미만 발주도 예외 없이 내림하여 0개로 계산한다',()=>{
 const result=planner.calculate({orderQuantity:250,hourlyRate:1000});assert.equal(result.targetQuantity,0);assert.equal(result.hours,0);
});
test('입력 누락과 잘못된 생산량은 0이나 다른 실적으로 대체하지 않는다',()=>{
 for(const hourlyRate of [null,'',0,-1,Infinity,'bad']) assert.equal(planner.calculate({orderQuantity:10000,hourlyRate}).targetQuantity,null);
 assert.equal(planner.calculate({orderQuantity:null,hourlyRate:1000}).targetQuantity,null);
});
test('일일 납기·누적 실적·손실량·작업일수·납기일은 단순 목표 계산에 영향을 주지 않는다',()=>{
 const result=planner.calculate({orderQuantity:20000,hourlyRate:1000,cumulativeProduction:19000,cumulativeHours:1,loss:3000,workDays:1,dailyMinimumQuantity:7000});
 assert.equal(result.targetQuantity,8000);assert.equal(result.totalHours,20);
});
test('쉼표가 있는 입력과 소수 생산량도 정확히 계산한다',()=>{
 const result=planner.calculate({orderQuantity:'10,000',hourlyRate:1200.5});assert.equal(result.targetQuantity,9500);assert.equal(result.hours,9500/1200.5);
});

test('목표는 500개 경계에서 항상 내림하고 발주량과 8시간 생산량을 넘지 않는다',()=>{
 const cases=[
  {orderQuantity:99100,hourlyRate:751,target:6000},
  {orderQuantity:99100,hourlyRate:750,target:6000},
  {orderQuantity:99100,hourlyRate:749.999,target:5500},
  {orderQuantity:6750,hourlyRate:1000,target:6500},
  {orderQuantity:500,hourlyRate:1000,target:500},
  {orderQuantity:499.999,hourlyRate:1000,target:0},
  {orderQuantity:0,hourlyRate:1000,target:0},
  {orderQuantity:10000,hourlyRate:50,target:0}
 ];
 for(const value of cases){
  const result=planner.calculate(value);
  assert.equal(result.targetQuantity,value.target);
  assert.equal(result.targetQuantity%500,0);
  assert.ok(result.targetQuantity<=Math.min(value.orderQuantity,value.hourlyRate*8));
  assert.equal(result.hours,value.target/value.hourlyRate);
 }
});
