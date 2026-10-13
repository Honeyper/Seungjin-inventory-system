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
test('작은 발주도 초과 생산하지 않고 필요한 시간만 계산한다',()=>{
 const result=planner.calculate({orderQuantity:250,hourlyRate:1000});assert.equal(result.targetQuantity,250);assert.equal(result.hours,.25);
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
 const result=planner.calculate({orderQuantity:'10,000',hourlyRate:1200.5});assert.equal(result.targetQuantity,9604);assert.equal(result.hours,8);
});
