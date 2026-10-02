import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../gas/SheetBackup.js',import.meta.url),'utf8');
function runtime(){
 const c=vm.createContext({CONFIG:{SHEETS:{PRODUCTS:'제품DB',PURCHASE_ORDERS:'발주',STOCK_DB:'재고',BOX_DB:'박스'}},
  setRowValue_(row,indexes,names,value){for(const name of names){const i=indexes[name.replace(/\s/g,'')];if(i!==undefined){row[i]=value;break;}}},
  pickCell_(row,indexes,names){for(const name of names){const i=indexes[name.replace(/\s/g,'')];if(i!==undefined)return String(row[i]??'').trim();}return '';}
 });vm.runInContext(source,c);return c;
}
test('시트 범위가 모자라면 필요한 행·열만 늘리며 충분하면 수정하지 않는다',()=>{
 const c=runtime(),changes=[];const sheet={getMaxRows:()=>100,getMaxColumns:()=>10,insertRowsAfter:(...a)=>changes.push(['rows',...a]),insertColumnsAfter:(...a)=>changes.push(['columns',...a])};
 c.ensureSheetWriteCapacity_(sheet,124,12);assert.deepEqual(changes,[['rows',100,24],['columns',10,2]]);
 changes.length=0;c.ensureSheetWriteCapacity_(sheet,100,10);assert.equal(changes.length,0);
});
test('과거 업무를 재실행하지 않고 박스 상태·수량·위치를 원본으로 복원하며 알 수 없는 컬럼은 보존한다',()=>{
 const c=runtime(),headers=['박스ID','관리ID','제품명','제품ID','현재 수량','보관 위치','상태','수기 메모','Supabase 원본(JSON)'];
 const indexes=Object.fromEntries(headers.map((h,i)=>[h.replace(/\s/g,''),i]));
 const context={definition:c.sheetBackupDefinition_('boxes'),keySet:new Set(['IN1']),indexes,header:{headers},existing:[{row:['B1','IN1','제품','P1','100 ea','A','보관','보존할 메모','']}]};
 const record={boxId:'B1',managementId:'IN1',productId:'P1',productName:'제품',quantity:60,storage:'H',status:'출고완료',lastInventoryCheckedAt:'2026-10-02 10:00'};
 const rows=c.planSheetBackupRows_(context,[record]);assert.equal(rows[0][4],60);assert.equal(rows[0][5],'H');assert.equal(rows[0][6],'출고완료');assert.equal(rows[0][7],'보존할 메모');assert.deepEqual(JSON.parse(rows[0][8]),record);
 const repeated=c.planSheetBackupRows_({...context,existing:[{row:rows[0]}]},[record]);assert.equal(JSON.stringify(rows),JSON.stringify(repeated));
});
test('대상 밖의 ID·중복 박스·식별자 누락은 쓰기 계획 단계에서 차단한다',()=>{
 const c=runtime();const context={definition:c.sheetBackupDefinition_('boxes'),keySet:new Set(['IN1']),indexes:{},header:{headers:[]},existing:[]};
 assert.throws(()=>c.planSheetBackupRows_(context,[{boxId:'B1',managementId:'IN2'}]),/대상 밖/);
 assert.throws(()=>c.planSheetBackupRows_(context,[{managementId:'IN1'}]),/식별자/);
 assert.throws(()=>c.planSheetBackupRows_(context,[{boxId:'B1',managementId:'IN1'},{boxId:'B1',managementId:'IN1'}]),/중복/);
});
test('읽기·복구 API는 일회용 서버 인증을 먼저 검증한다',()=>{
 const c=runtime();let calls=0;c.verifySupabaseSheetSyncToken_=()=>{calls++;throw new Error('invalid token');};
 assert.throws(()=>c.readSheetBackupRows({}),/invalid token/);assert.throws(()=>c.applySheetBackupRows({}),/invalid token/);assert.equal(calls,2);
});
