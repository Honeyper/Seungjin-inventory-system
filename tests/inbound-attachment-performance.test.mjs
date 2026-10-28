import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {loadFunctions} from './helpers/frontend-runtime.mjs';
const gas=fs.readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');
const attachments=fs.readFileSync(new URL('../frontend/attachments.js',import.meta.url),'utf8');
function client() {const c=vm.createContext({window:{},setTimeout,clearTimeout});vm.runInContext(attachments,c);return c.window.SeungjinAttachments;}
function runtime({cacheUnavailable=false}={}) {
 const cache=new Map(),folders=new Map(),writes=[],searches=[],decodes=[];let serial=0,fail='';
 function folder(name,parent,id='folder-'+serial++) {
  const value={name,parent,id,isTrashed:()=>false,getId:()=>id,getName:()=>name,getUrl:()=>`https://drive.google.com/drive/folders/${id}`,
   getFoldersByName:n=>{searches.push(n);const found=[...folders.values()].find(x=>x.parent===value&&x.name===n);return {hasNext:()=>Boolean(found),next:()=>found};},createFolder:n=>folder(n,value),
   createFile:blob=>{const bytes=Buffer.from(blob.bytes),content=bytes.toString();if(content===fail)throw Error('Drive interrupted');const fileId='file-'+writes.length;writes.push({bytes,name:blob.name,mimeType:blob.mimeType});return {setDescription:value=>{writes.at(-1).description=value;},getUrl:()=>`https://drive.google.com/file/d/${fileId}/view`};}
  };folders.set(id,value);return value;
 }
 folder('root',null,'root');
 const c=loadFunctions(gas,['inboundUploadCacheKey_','readInboundUploadCache_','rememberInboundUpload_','uploadInboundInvoice_','uploadInboundInvoice','uploadInboundDefectPhotos','uploadInboundDefectPhotos_','getOrCreateDriveFolderPath_','sanitizeDriveName_','getFileExtension_'],{
  CONFIG:{ENV:'dev',DRIVE_ROOT_FOLDER_ID:'root',DEFECT_PHOTO_ROOT_FOLDER_ID:'root'},Session:{getScriptTimeZone:()=> 'Asia/Seoul'},console:{info(){}},
  dash_:value=>String(value||'-'),Utilities:{DigestAlgorithm:{SHA_256:1},computeDigest:(_,s)=>[...createHash('sha256').update(s).digest()],base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'),
   base64Decode:data=>{decodes.push(data);return [...Buffer.from(data,'base64')];},newBlob:(bytes,mimeType,name)=>({bytes,mimeType,name}),formatDate:()=> '2026-10-28'},
  CacheService:{getScriptCache:()=>{if(cacheUnavailable)throw Error('cache down');return {get:key=>cache.get(key),getAll:keys=>Object.fromEntries(keys.map(k=>[k,cache.get(k)])),put:(k,v,ttl)=>{assert.equal(ttl,21600);cache.set(k,v);},putAll:(values,ttl)=>{assert.equal(ttl,21600);Object.entries(values).forEach(([k,v])=>cache.set(k,v));},remove:k=>cache.delete(k)};}},
  DriveApp:{getFolderById:id=>{const f=folders.get(id);if(!f)throw Error('missing folder');return f;}}
 });return {c,writes,searches,decodes,cache,setFail:value=>{fail=value;}};
}
const file=(content,id=content)=>({name:`${id}.jpg`,mimeType:'image/jpeg',data:Buffer.from(content).toString('base64'),uploadId:`upload-id-${id}`});
const payload={productName:'누니 테스트',clientName:'업체 A',inboundDate:'2026-10-28',managementId:''};
test('명세서는 데이터 해독 한 번으로 원본 바이트·형식·설명을 보존한다',()=>{
 const r=runtime(),f=file('invoice');const result=r.c.uploadInboundInvoice({...payload,invoiceFile:f});
 assert.equal(r.decodes.length,1);assert.equal(r.writes.length,1);assert.equal(r.writes[0].bytes.toString(),'invoice');assert.equal(r.writes[0].mimeType,'image/jpeg');assert.match(r.writes[0].description,/관리ID/);assert.match(result.invoiceFileUrl,/file-0/);assert.ok(Number.isFinite(result.timingMs.total));
 r.searches.length=0;const retry=r.c.uploadInboundInvoice({...payload,invoiceFile:f});assert.equal(r.writes.length,1);assert.equal(r.searches.length,0);assert.equal(retry.invoiceFileUrl,result.invoiceFileUrl);
});
test('같은 날짜의 다른 거래처는 공통 경로를 다시 찾지 않고 거래처 폴더만 찾는다',()=>{
 const r=runtime();r.c.uploadInboundInvoice({...payload,invoiceFile:file('invoice-a')});assert.equal(r.searches.length,4);r.searches.length=0;
 r.c.uploadInboundInvoice({...payload,clientName:'업체 B',invoiceFile:file('invoice-b')});assert.deepEqual(r.searches,['업체 B']);assert.equal(r.writes.length,2);
});
test('불량사진 네 장을 한 요청에서 검증하고 해독·폴더 탐색을 파일마다 반복하지 않는다',()=>{
 const r=runtime(),files=['one','two','three','four'].map(s=>file(s)),result=r.c.uploadInboundDefectPhotos({...payload,defectFiles:files});
 assert.equal(result.uploadedCount,4);assert.equal(r.decodes.length,4);assert.equal(r.searches.length,3);assert.equal(r.writes.length,4);assert.deepEqual(r.writes.map(w=>w.bytes.toString()),['one','two','three','four']);assert.match(result.defectPhotoUrls,/folders/);
});
test('묶음 중간 실패와 응답 유실 뒤 재시도는 완료 파일을 다시 만들지 않는다',()=>{
 const r=runtime(),files=[file('first'),file('second'),file('third')],p={...payload,defectFiles:files};r.setFail('second');
 assert.throws(()=>r.c.uploadInboundDefectPhotos(p),/interrupted/);assert.deepEqual(r.writes.map(w=>w.bytes.toString()),['first']);
 r.setFail('');const saved=r.c.uploadInboundDefectPhotos(p);assert.equal(r.writes.length,3);assert.equal(saved.uploadedCount,3);
 const retry=r.c.uploadInboundDefectPhotos(p);assert.equal(r.writes.length,3);assert.equal(saved.defectPhotoUrls,retry.defectPhotoUrls);
});
test('파일 데이터나 거래처가 다르면 완료 캐시를 잘못 재사용하지 않는다',()=>{
 const r=runtime(),f=file('first','same-id');r.c.uploadInboundInvoice({...payload,invoiceFile:f});
 r.c.uploadInboundInvoice({...payload,invoiceFile:{...f,data:Buffer.from('other').toString('base64')}});
 r.c.uploadInboundInvoice({...payload,clientName:'업체 B',invoiceFile:f});assert.equal(r.writes.length,3);
});
test('캐시 장애가 있어도 정상 경로와 파일로 업로드하며 잘못된 파일은 먼저 거절한다',()=>{
 const r=runtime({cacheUnavailable:true}),files=[file('first'),file('second')];assert.equal(r.c.uploadInboundDefectPhotos({...payload,defectFiles:files}).uploadedCount,2);
 const before=r.writes.length;assert.throws(()=>r.c.uploadInboundDefectPhotos({...payload,defectFiles:[files[0],{...files[1],mimeType:'text/plain'}]}));assert.equal(r.writes.length,before);
});
test('사진 여덟 장은 두 번의 서버 요청으로 전송하고 큰 파일은 별도 묶음에 둔다',async()=>{
 const api=client(),files=Array.from({length:8},(_,i)=>file('photo-'+i)),groups=api.groupUploadFiles(files);assert.equal(groups.length,2);
 let requests=0;const uploaded=await api.uploadBatch(groups,group=>{requests++;return Promise.resolve(group.length);});assert.equal(requests,2);assert.deepEqual(Array.from(uploaded),[4,4]);
 const large={data:'x'.repeat(5*1024*1024)};assert.deepEqual(Array.from(api.groupUploadFiles([large,large,file('small')]),g=>g.length),[1,2]);
});
