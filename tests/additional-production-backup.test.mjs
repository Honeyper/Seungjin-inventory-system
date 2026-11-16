import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadFunctions} from './helpers/frontend-runtime.mjs';
const source=fs.readFileSync(new URL('../gas/SheetBackup.js',import.meta.url),'utf8');
test('추가 생산 백업 재실행은 사출을 재차감하거나 원래 박스를 덮지 않고 같은 ID만 갱신한다',()=>{
  const headers=['박스ID','관리ID','제품ID','제품명','보관 위치','현재 수량','상태','수기 메모','Supabase 원본(JSON)','최종공정'];
  const stockHeaders=['관리 ID','제품ID','제품명','보관 위치','비고','수기 메모','Supabase 원본(JSON)'];
  const tables={boxes:{headers,rows:[['OLD','IN','P','제품','A',100,'보관','원래 메모',''],['RAW','SRC','P','제품','H',150,'사출재고','사출 메모','']]},
    stock:{headers:stockHeaders,rows:[['IN','P','제품','A','','보존',''],['SRC','P','제품','H','','보존','']]}};
  let locks=0,unlocks=0;
  const c=vm.createContext({CONFIG:{SHEETS:{}},SpreadsheetApp:{flush(){}},clearApiReadCaches_(){},
    LockService:{getScriptLock:()=>({waitLock(){locks++;},releaseLock(){unlocks++;}})},
    pickCell_(row,indexes,names){const name=names.find(name=>indexes[name.replace(/\s/g,'')]!==undefined);return name?String(row[indexes[name.replace(/\s/g,'')]]??''):'';},
    setRowValue_(row,indexes,names,value){const name=names.find(name=>indexes[name.replace(/\s/g,'')]!==undefined);if(name)row[indexes[name.replace(/\s/g,'')]]=value;},
    findHeaderIndex_(indexes,names){const key=names.find(name=>indexes[name.replace(/\s/g,'')]!==undefined);return key?indexes[key.replace(/\s/g,'')]:-1;},
    appendStyledRangeRows_(sheet,col,rows){sheet.rows.push(...rows);}
  });vm.runInContext(source,c);
  c.sheetBackupContext_=(dataset,keys)=>({definition:c.sheetBackupDefinition_(dataset),sheet:tables[dataset],keySet:new Set(keys),
    header:{headers:tables[dataset].headers,rowIndex:0},indexes:Object.fromEntries(tables[dataset].headers.map((h,i)=>[h.replace(/\s/g,''),i])),
    existing:tables[dataset].rows.map((row,i)=>({row,rowNumber:i+2})).filter(entry=>keys.includes(entry.row[dataset==='boxes'?1:0]))});
  c.writeSheetBackupChanges_=(sheet,updates)=>{for(const update of updates)sheet.rows[update.rowNumber-2]=update.row;};
  const snapshot={additionalProductionChanges:{boxes:[{boxId:'RAW',managementId:'SRC',productId:'P',productName:'제품',storage:'H',quantity:50,status:'사출재고'},
    {boxId:'NEW',managementId:'IN',productId:'P',productName:'제품',storage:'A',quantity:80,status:'보관',finalProcess:'1도',isAdditionalProduction:true,additionalProductionNumber:1}],
    stock:[{managementId:'IN',productId:'P',storage:'A',note:'추가생산 80 / 로스 20'},{managementId:'SRC',productId:'P',storage:'H',note:'사출 사용 100'}]}};
  const original=structuredClone(tables.boxes.rows[0]);c.replayAdditionalProductionChanges_(snapshot);
  assert.deepEqual(tables.boxes.rows[0],original);assert.equal(tables.boxes.rows[1][5],50);assert.equal(tables.boxes.rows[1][7],'사출 메모');
  assert.equal(tables.boxes.rows.length,3);assert.equal(JSON.parse(tables.boxes.rows[2][8]).isAdditionalProduction,true);
  assert.equal(tables.boxes.rows[2][9],'1도');
  const first=JSON.stringify(tables);c.replayAdditionalProductionChanges_(snapshot);assert.equal(JSON.stringify(tables),first);
  assert.throws(()=>c.replayAdditionalProductionChanges_({}),/백업 원본/);assert.equal(locks,unlocks);
});
test('추가 생산 outbox는 인증 후 canonical snapshot만 쓰고 완료 ID 재시도는 건너뛴다',()=>{
  const code=fs.readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');let marker='0',writes=0,verified=0;
  const c=loadFunctions(code,['applySupabaseOutbox'],{getApiRoutes_:()=>({}),CONFIG:{ENV:'dev'},SUPABASE_LAST_SYNCED_OUTBOX_PROPERTY:'last',
    clearApiReadCaches_(){},
    verifySupabaseSheetSyncToken_(token){assert.equal(token,'valid');verified++;},PropertiesService:{getScriptProperties:()=>({getProperty:()=>marker,setProperty:(key,value)=>marker=value})},
    replayAdditionalProductionChanges_(canonical){assert.equal(canonical.test,'canonical');writes++;return {};},isSupabaseReplaySupersededError_:()=>false});
  const payload={token:'valid',items:[{id:1,action:'registerAdditionalProduction',payload:{},canonical_result:{test:'canonical'}}]};
  assert.equal(c.applySupabaseOutbox(payload).results[0].ok,true);
  c.applySupabaseOutbox(payload);assert.equal(writes,1);assert.equal(verified,2);
  assert.throws(()=>c.applySupabaseOutbox({...payload,token:'invalid'}));assert.equal(writes,1);
});
