import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../frontend/config.dev.js',import.meta.url),'utf8');
const prod='seungjinProductionPlan:v1:prod:',dev='seungjinProductionPlan:v1:dev:';
function runtime(entries, fail) {
  const map=new Map(entries),warnings=[];
  const storage={get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,
    setItem(k,v){if(fail?.(k,v))throw Error('quota');map.set(k,String(v));},removeItem:k=>map.delete(k)};
  const c=vm.createContext({window:{localStorage:storage},console:{warn:m=>warnings.push(m)}});
  return {map,warnings,run:()=>vm.runInContext(source,c)};
}
test('날짜별 계획·선택 행을 그대로 복사하고 기존 DEV 계획을 백업한다',()=>{
  const t=runtime([[prod+'1:2026-11-06','{"actual":0,"rows":["44차","45차"]}'],[prod+'selected-job:1:2026-11-06','45차'],[dev+'old','previous'],['other','keep']]);t.run();
  assert.equal(t.map.get(dev+'1:2026-11-06'),t.map.get(prod+'1:2026-11-06'));
  assert.equal(t.map.get(dev+'selected-job:1:2026-11-06'),'45차');assert.equal(t.map.has(dev+'old'),false);assert.equal(t.map.get('other'),'keep');
  const backup=[...t.map].find(([k])=>k.endsWith(':backup'))[1];assert.deepEqual(JSON.parse(backup),[[dev+'old','previous']]);
});
test('한 번 맞춘 뒤 DEV에서 바꾼 계획을 다음 접속에 덮어쓰지 않는다',()=>{
  const t=runtime([[prod+'day','source']]);t.run();t.map.set(dev+'day','edited');t.map.set(prod+'day','new source');t.run();assert.equal(t.map.get(dev+'day'),'edited');
});
test('PRD 계획이 없는 브라우저의 기존 DEV 계획은 유지한다',()=>{
  const t=runtime([[dev+'day','keep']]);t.run();assert.equal(t.map.size,1);assert.equal(t.map.get(dev+'day'),'keep');t.map.set(prod+'day','source');t.run();assert.equal(t.map.get(dev+'day'),'source');
});
test('복사 중 저장 오류가 나면 원래 DEV 계획을 복원하고 PRD는 보존한다',()=>{
  let failed=false;const t=runtime([[prod+'day','source'],[dev+'old','keep']],k=>{if(k===dev+'day'&&!failed){failed=true;return true;}return false;});t.run();
  assert.equal(t.map.get(prod+'day'),'source');assert.equal(t.map.get(dev+'old'),'keep');assert.equal(t.map.has(dev+'day'),false);assert.equal(t.warnings.length,1);t.run();assert.equal(t.map.get(dev+'day'),'source');
});
test('백업 저장이 실패하면 DEV 계획을 지우지 않는다',()=>{
  const t=runtime([[prod+'day','source'],[dev+'day','old']],k=>k.endsWith(':backup'));t.run();assert.equal(t.map.get(dev+'day'),'old');assert.equal(t.map.get(prod+'day'),'source');
});
