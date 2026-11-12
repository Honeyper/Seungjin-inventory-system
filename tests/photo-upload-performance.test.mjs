import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFunctions} from './helpers/frontend-runtime.mjs';
const source=fs.readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');
function server(){
 const cache=new Map(),stored=new Map(),requests=[],shared=[],paths=[],trashed=[];let serial=0,failName='',denySharing=false;
 const fileObject=id=>({getId:()=>id,getUrl:()=>`https://drive.google.com/file/d/${id}/view`,getResourceKey:()=>`key-${id}`,setDescription:d=>{stored.get(id).description=d;},setSharing:(a,b)=>{if(denySharing)throw Error('permission denied');shared.push([id,a,b]);},setTrashed:v=>{if(v)trashed.push(id);}});
 const folder={getId:()=> 'FOLDER',getUrl:()=> 'https://drive.google.com/drive/folders/FOLDER',createFile:blob=>{const id='N'+serial++;stored.set(id,blob);return fileObject(id);}};
 const c=loadFunctions(source,['inboundUploadCacheKey_','readInboundUploadCache_','rememberInboundUpload_','makeInboundDriveUploadRequest_','createInboundDriveFiles_','preparePhotoUploadEntries_','uploadShippingDefectPhotos','uploadProductImage','sanitizeDriveName_','getFileExtension_'],{
  CONFIG:{ENV:'dev',DRIVE_ROOT_FOLDER_ID:'ROOT'},console:{info(){}},dash_:v=>String(v||'-'),Session:{getScriptTimeZone:()=> 'Asia/Seoul'},ScriptApp:{getOAuthToken:()=> 'private-token'},
  getOrCreateDriveFolderPath_:(_,names)=>{paths.push(names);return folder;},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
  DriveApp:{getFolderById:()=>folder,getFileById:fileObject,Access:{ANYONE_WITH_LINK:'anyone'},Permission:{VIEW:'view'}},
  Utilities:{DigestAlgorithm:{SHA_256:'sha'},getUuid:()=> 'boundary-'+serial++,computeDigest:(_,s)=>[...createHash('sha256').update(s).digest()],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),base64Decode:s=>[...Buffer.from(s,'base64')],formatDate:()=> '20261112_1800',newBlob:(bytes,mimeType,name)=>({bytes,mimeType,name,getBytes:()=>[...Buffer.from(bytes)]})},
  UrlFetchApp:{fetchAll:reqs=>{requests.push(reqs);return reqs.map(req=>{
   const bytes=Buffer.from(req.payload),start=bytes.indexOf('\r\n\r\n')+4,end=bytes.indexOf('\r\n--',start),meta=JSON.parse(bytes.subarray(start,end)),dataStart=bytes.indexOf('\r\n\r\n',end)+4,dataEnd=bytes.lastIndexOf('\r\n--');
   if(failName&&meta.name.includes(failName)){failName='';return {getResponseCode:()=>500,getContentText:()=>'{"error":"failed"}'};}
   const id='F'+serial++;stored.set(id,{bytes:bytes.subarray(dataStart,dataEnd),name:meta.name,description:meta.description,mimeType:'image/png'});
   return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({id,resourceKey:'key-'+id,webViewLink:`https://drive.google.com/file/d/${id}/view`})};
  });}}
 });
 return {c,stored,requests,shared,paths,trashed,fail:name=>{failName=name;},denySharing:value=>{denySharing=value;}};
}
const photo=(i)=>({name:`photo-${i}.png`,mimeType:'image/png',uploadId:`photo-id-${i}`,data:Buffer.from([0,255,i,128,13,10]).toString('base64')});
const context={managementId:'IN-1',clientName:'업체',productName:'제품',productId:'P1',shippingDate:'2026-11-12'};
test('제품 사진 묶음은 원본·설명·링크 공유를 보존하고 성공 파일은 재전송하지 않는다',()=>{
 const s=server(),files=[photo(1),photo(2),photo(3)];s.fail('_2.png');
 assert.throws(()=>s.c.uploadProductImage({...context,imageFiles:files}),/저장하지 못/);assert.equal(s.stored.size,2);assert.equal(s.shared.length,2);assert.equal(s.requests.length,1);
 const saved=s.c.uploadProductImage({...context,imageFiles:files});assert.equal(saved.imageUrls.length,3);assert.equal(s.stored.size,3);assert.equal(s.shared.length,3);assert.deepEqual(s.requests.map(r=>r.length),[3,1]);
 assert.ok(saved.imageUrl.includes('resourcekey='));assert.ok([...s.stored.values()].every(f=>f.description.includes('제품 이미지')));
 for(const [i,url] of Array.from(saved.imageUrls).entries()){const id=new URL(url).searchParams.get('id');assert.deepEqual([...s.stored.get(id).bytes],[0,255,i+1,128,13,10]);}
 s.c.uploadProductImage({...context,imageFiles:files});assert.equal(s.requests.length,2);
});
test('출고 사진도 한 번에 저장하고 실패한 파일만 복구하며 공유 권한은 바꾸지 않는다',()=>{
 const s=server(),files=[photo(1),photo(2),photo(3)];s.fail('_2.png');
 assert.throws(()=>s.c.uploadShippingDefectPhotos({...context,defectFiles:files}));
 const result=s.c.uploadShippingDefectPhotos({...context,defectFiles:files});assert.equal(result.uploadedCount,3);assert.equal(result.fileUrls.length,3);assert.deepEqual(s.requests.map(r=>r.length),[3,1]);assert.equal(s.shared.length,0);
 assert.ok([...s.stored.values()].every(f=>f.description.includes('출고 불량사진')));
 s.c.uploadShippingDefectPhotos({...context,shippingDate:'2026-11-13',defectFiles:files});assert.equal(s.stored.size,6);
});
test('단일 제품 이미지 요청은 이전 응답 필드와 호환되고 다른 제품으로 캐시를 섞지 않는다',()=>{
 const s=server(),p={...context,imageFile:photo(1)};const result=s.c.uploadProductImage(p);assert.ok(result.fileId);assert.ok(result.imageUrl);assert.equal(result.imageUrls,undefined);
 s.c.uploadProductImage({...p,productId:'P2'});assert.equal(s.stored.size,2);
});
test('묶음 안에 잘못된 사진이 있으면 폴더나 파일을 만들기 전에 거절한다',()=>{
 const s=server();assert.throws(()=>s.c.uploadProductImage({...context,imageFiles:[photo(1),{...photo(2),mimeType:'text/plain'}]}));assert.equal(s.paths.length,0);assert.equal(s.stored.size,0);
});

test('제품 이미지 공유 설정이 실패하면 새 파일을 폐기하고 완료 링크로 캐시하지 않는다',()=>{
 const s=server(),payload={...context,imageFile:photo(1)};s.denySharing(true);
 assert.throws(()=>s.c.uploadProductImage(payload),/공유 권한/);assert.equal(s.trashed.length,1);
 s.denySharing(false);const saved=s.c.uploadProductImage(payload);assert.ok(saved.imageUrl);assert.equal(s.requests.length,2);assert.equal(s.shared.length,1);
});
