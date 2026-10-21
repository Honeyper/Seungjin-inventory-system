import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {compactInventoryDashboard,createJsonResponse} from '../supabase/functions/seungjin-dev-gateway/inventory-transport.js';
import {applyMutation} from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
import {readPurchaseOrdersWithShipping} from '../supabase/functions/seungjin-dev-gateway/purchase-order-shipping.js';
import {adminSource,loadFunctions} from './helpers/frontend-runtime.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
const gateway=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts',import.meta.url),'utf8'));

function dashboard(){
 const box={boxId:'B1',quantity:37,status:'보관',inventoryConfirmedAt:'2026-10-21T01:00:00Z',invoiceFileUrl:'https://example.test/invoice'};
 return {summary:{totalQuantity:37,totalBoxes:1},filters:{clients:['거래처']},attention:{physicalMissingCount:0},locationBoxStats:[{label:'A',value:1}],locationQuantityStats:[{label:'A',value:37}],stateVersion:12,
  rows:[{managementId:'IN1',allShippingBoxes:[box],activeShippingBoxes:[box],shippedShippingBoxes:[],currentTotalQuantity:'37 ea'}]};
}
function client(data){
 const requests=[];const c=vm.createContext({window:{SEUNGJIN_CONFIG:{ENV:'dev',SUPABASE_GATEWAY_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_CANONICAL_WRITES:true},SeungjinHttp:{request:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,data};}}},
  sessionStorage:{getItem:()=>JSON.stringify({supabaseSessionToken:'test',supabaseSessionExpiresAt:'2099-01-01'})},localStorage:{getItem:()=>null}});
 vm.runInContext(fs.readFileSync(new URL('../frontend/supabase-gateway.js',import.meta.url),'utf8'),c);
 return {api:c.window.SeungjinDataGateway,requests};
}
test('PC 재고 전송은 각 박스를 한 번만 보내고 집계·필터·위치·버전을 모두 보존한다',async()=>{
 const original=dashboard(),before=structuredClone(original),packed=compactInventoryDashboard(original);
 assert.equal(packed.boxTable.length,1);assert.equal(packed.rows[0].allShippingBoxes[0],0);assert.deepEqual(original,before);
 assert.equal(compactInventoryDashboard(original),packed);
 const c=client(packed),expanded=await c.api.requestRead('getInventoryDashboard',{knownStateVersion:12});
 assert.equal(c.requests[0].payload.responseFormat,'inventory-box-table-v1');assert.equal(c.requests[0].payload.knownStateVersion,12);
 assert.deepEqual(plain(expanded),original);assert.equal(expanded.rows[0].allShippingBoxes[0],expanded.rows[0].activeShippingBoxes[0]);
 const next={...original,stateVersion:13};assert.notEqual(compactInventoryDashboard(next),packed);
});
test('이전 서버 응답과 모바일 전용 응답은 그대로 처리한다',async()=>{
 const full=dashboard(),pc=client(full);assert.deepEqual(plain(await pc.api.requestRead('getInventoryDashboard')),full);
 const mobile=client({format:'mobile-box-table-v1',rows:[{allShippingBoxes:[0]}],boxTable:[{boxId:'B'}]});
 const received=await mobile.api.requestRead('getInventoryDashboard',{responseFormat:'mobile-box-table-v1'});
 assert.equal(received.rows[0].allShippingBoxes[0],0);assert.equal(mobile.requests[0].payload.responseFormat,'mobile-box-table-v1');
});
test('손상된 압축 박스 참조는 빈 재고로 표시하지 않고 조회 실패로 반환한다',async()=>{
 const invalid=compactInventoryDashboard(dashboard());const c=client({...invalid,rows:[{allShippingBoxes:[99]}]});
 await assert.rejects(c.api.requestRead('getInventoryDashboard'),/재고 응답/);
});
test('큰 JSON은 gzip으로 전송해도 한글·수량·첨부 링크를 손실 없이 복원한다',async()=>{
 const body={ok:true,data:{rows:Array.from({length:500},(_,i)=>({name:'한글 제품 '+i,quantity:i,invoice:'https://example.test/명세서',note:'재고 정보 '.repeat(30)}))}};
 const request=new Request('https://example.test',{headers:{'Accept-Encoding':'br, gzip;q=0.8'}});
 const response=createJsonResponse(request,body,200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'https://example.test',Vary:'Origin'});
 assert.equal(response.headers.get('Content-Encoding'),'gzip');assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://example.test');assert.match(response.headers.get('Vary'),/Origin, Accept-Encoding/);
 const bytes=new Uint8Array(await response.arrayBuffer());assert.ok(bytes.length<Buffer.byteLength(JSON.stringify(body))*.15);
 const restored=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();assert.deepEqual(restored,body);
});
test('gzip 미지원·거부·작은 응답은 기존 JSON과 오류 상태를 그대로 유지한다',async()=>{
 for(const encoding of ['', 'br','gzip;q=0','gzip;q=0.000']) {
  const body={text:'x'.repeat(40000)},r=createJsonResponse(new Request('https://example.test',{headers:{'accept-encoding':encoding}}),body,409,{});
  assert.equal(r.headers.get('Content-Encoding'),null);assert.equal(r.status,409);assert.deepEqual(await r.json(),body);
 }
 const r=createJsonResponse(new Request('https://example.test',{headers:{'accept-encoding':'gzip'}}),{ok:false},401,{});assert.equal(r.headers.get('Content-Encoding'),null);assert.equal(r.status,401);
});
function referenceState(){
 const product={productId:'P1',productCode:'P1',clientName:'업체',productName:'제품',finalProcess:'1도',trayQuantity:'10 ea'};
 const records=[{recordKey:'OLD|P1|A',managementId:'OLD',productId:'P1',storage:'A',inboundTotalQuantity:'300 ea'}];
 const boxes=[{boxId:'OLD-B001',managementId:'OLD',productId:'P1',storage:'A',number:1,quantity:100,status:'보관',rawStatus:'보관',inspectionDate:'2026-10-20',custom:'보존'},
  {boxId:'OLD-B002',managementId:'OLD',productId:'P1',storage:'A',number:2,quantity:100,status:'출고완료',rawStatus:'출고완료',shippingType:'반출',custom:'보존'}];
 return {version:1,products:[product],orders:[],inbounds:[{managementId:'OLD',productId:'P1',inboundTotalQuantity:300}],records,boxes};
}
async function loadReferences(creating,{orphan=false}={}){
 const state=referenceState(),paths=[];if(orphan)state.boxes.push({...state.boxes[0],boxId:'ORPHAN-B001',managementId:'ORPHAN'});
 const loader=gateway.includes('async function loadInboundUpdateState(')?'loadInboundUpdateState':'loadInboundMutationState';
 const c=loadFunctions(gateway,[loader,'mapInventoryRecordRows','mapInventoryBoxRows',...(gateway.includes('function mapInboundQrBox(')?['mapInboundQrBox']:[])],{
  loadStateVersion:async()=>1,
  databaseRows:async path=>{
   paths.push(path);const key={dev_products:'products',dev_purchase_orders:'orders',dev_inbounds:'inbounds',dev_inventory_records:'records',dev_inventory_boxes:'boxes'}[path.split('?')[0]];
   return state[key].map(data=>({...(path.endsWith(',data')||key!=='boxes'?{data}:{}),record_key:data.recordKey,box_id:data.boxId,management_id:data.managementId,product_id:data.productId,storage:data.storage,box_number:data.number,
    quantity:data.quantity,status:data.status,raw_status:data.rawStatus,shipping_type:data.shippingType}));
  }
 });
 return {loaded:plain(await c[loader]({productId:'P1'},creating)),state,paths};
}
test('신규 입고는 과거 박스의 집계 값만 읽어도 전체 상세 조회와 동일하게 저장한다',async()=>{
 const {loaded,state,paths}=await loadReferences(true);assert.ok(paths.find(p=>p.startsWith('dev_inventory_boxes')).includes('quantity:data->>quantity'));assert.equal(loaded.boxes[0].custom,undefined);
 const payload={productId:'P1',productName:'제품',clientName:'업체',inboundDate:'2026-10-21',inboundTime:'10:00',inboundType:'정상입고',storage:'A',boxQuantity:100,inboundBoxCount:2,remainderQuantities:[30],inspectionQuantity:10,defectQuantity:0,registrant:'테스트'};
 const now=new Date('2026-10-21T01:00:00Z'),full=applyMutation('createInbound',payload,structuredClone(state),now),fast=applyMutation('createInbound',payload,loaded,now);
 assert.deepEqual(fast.changes,full.changes);assert.deepEqual(fast.result,full.result);assert.equal(fast.state.products[0].accumulatedInboundQuantity,'430 ea');
 assert.ok(fast.changes.inventoryBoxes.upserts.every(row=>!row.box_id.startsWith('OLD')));
});
test('수정·삭제와 기존 입고가 없는 박스는 이전 상세 상태를 그대로 읽는다',async()=>{
 const edited=await loadReferences(false);assert.equal(edited.loaded.boxes[0].custom,'보존');
 const orphaned=await loadReferences(true,{orphan:true});assert.equal(orphaned.loaded.boxes.at(-1).custom,'보존');
 assert.equal(orphaned.paths.filter(p=>p.startsWith('dev_inventory_boxes')).length,2);
});
test('명세서와 사진을 함께 업로드하고 둘 다 끝나야 저장에 필요한 URL을 설정한다',async()=>{
 const invoice=Promise.withResolvers(),photos=Promise.withResolvers(),calls=[];
 const c=loadFunctions(adminSource,['uploadInboundAttachments'],{uploadInboundInvoiceFile:()=>{calls.push('invoice');return invoice.promise;},uploadInboundDefectFiles:()=>{calls.push('photos');return photos.promise;}});
 const payload={},pending=c.uploadInboundAttachments(payload,{},[{}]);assert.deepEqual(calls,['invoice','photos']);photos.resolve('photos-url');await Promise.resolve();assert.equal(payload.defectPhotoUrls,undefined);
 invoice.resolve('invoice-url');await pending;assert.deepEqual(payload,{invoiceFileUrl:'invoice-url',defectPhotoUrls:'photos-url'});
});
test('첨부 실패가 있어도 진행 중인 업로드가 끝날 때까지 기다린 뒤 실패를 반환한다',async()=>{
 const invoice=Promise.withResolvers(),photos=Promise.withResolvers();let ended=false;
 const c=loadFunctions(adminSource,['uploadInboundAttachments'],{uploadInboundInvoiceFile:()=>invoice.promise,uploadInboundDefectFiles:()=>photos.promise});
 const payload={},pending=c.uploadInboundAttachments(payload,{},[{}]).catch(error=>{ended=true;throw error;});const rejected=assert.rejects(pending,/사진 실패/);
 photos.reject(new Error('사진 실패'));await new Promise(resolve=>setImmediate(resolve));assert.equal(ended,false);invoice.resolve('url');await rejected;assert.deepEqual(payload,{});
});
test('발주 집계 조회는 한 번에 최대 세 묶음만 읽고 모든 출고 수량을 보존한다',async()=>{
 let active=0,max=0,batches=0;
 const result=await readPurchaseOrdersWithShipping(async path=>{
  if(path.startsWith('dev_purchase_orders'))return[{data:{purchaseOrderId:'PO1',productId:'P1',totalOrderQuantity:20000}}];
  if(path.startsWith('dev_inbounds'))return Array.from({length:160},(_,i)=>({management_id:'IN'+i,product_id:'P1',purchase_order_id:'PO1'}));
  active++;max=Math.max(max,active);batches++;await new Promise(resolve=>setImmediate(resolve));active--;
  const ids=JSON.parse(`[${decodeURIComponent(path.match(/in\.\((.*?)\)/)[1])}]`);
  return ids.map(id=>({box_id:id+'-B1',management_id:id,product_id:'P1',quantity:100,status:'출고완료',shipping_type:'정상출고'}));
 });
 assert.equal(max,3);assert.equal(batches,4);assert.equal(result.purchaseOrders[0].accumulatedShippingQuantity,16000);
});
