import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
import {loadFunctions} from './helpers/frontend-runtime.mjs';
const gateway=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts',import.meta.url),'utf8'));

test('원문 재고 응답을 한글·공용용기·미등록 필드 손실 없이 해석한다',async()=>{
  const snapshot={recordRows:[{record_key:'입고|제품|미지정',data:{productName:'누니 립오일',note:'따옴표 " · 줄바꿈\n보관'}}],
    boxRows:[{box_id:'B1',box_number:1,data:{quantity:585,commonContainerSource:true,sourceBoxId:null,unknown:['추가',0,false]}}]};
  let request;
  const c=loadFunctions(gateway,['databaseRequest'],{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SECRET_KEY:'server-only',
    fetch:async(url,options)=>{request={url,options};return new Response(new TextEncoder().encode(JSON.stringify(snapshot)),{headers:{'Content-Type':'application/vnd.seungjin.inventory+json'}});}});
  const result=await c.databaseRequest('rpc/read_dev_inventory_snapshot_bytes',{method:'POST',body:'{}',headers:{Accept:'application/vnd.seungjin.inventory+json'}});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),snapshot);
  assert.equal(request.options.headers.Accept,'application/vnd.seungjin.inventory+json');
  assert.equal(request.options.headers.apikey,'server-only');
});

test('원문 조회 실패를 빈 재고로 바꾸거나 다른 조회로 중복 전송하지 않는다',async()=>{
  let calls=0;
  const c=loadFunctions(gateway,['databaseRequest'],{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SECRET_KEY:'server-only',
    fetch:async()=>{calls++;return new Response('{"code":"57014","message":"statement timeout"}',{status:500});}});
  await assert.rejects(c.databaseRequest('rpc/read_dev_inventory_snapshot_bytes',{method:'POST',headers:{Accept:'application/vnd.seungjin.inventory+json'}}),/statement timeout/);
  assert.equal(calls,1);
});
