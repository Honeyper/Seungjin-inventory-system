import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {loadFunctions} from './helpers/frontend-runtime.mjs';
const source=fs.readFileSync(new URL('../gas/Code.js',import.meta.url),'utf8');
function runtime({statuses=[],unavailable=false}={}) {const calls=[],cache=new Map(),saved=[],native=[];let serial=0;
 const c=loadFunctions(source,['makeInboundDriveUploadRequest_','createInboundDriveFiles_'],{CONFIG:{ENV:'dev'},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},ScriptApp:{getOAuthToken:()=> 'private-test-token'},
 Utilities:{getUuid:()=>`boundary-${serial++}`,newBlob:(bytes,mimeType,name)=>({bytes,mimeType,name,getBytes:()=>[...Buffer.from(bytes)]})},
 UrlFetchApp:{fetchAll:requests=>{calls.push(requests);if(unavailable)throw Error('network response lost');return requests.map((r,i)=>{const status=statuses.length?statuses.shift():200;return {getResponseCode:()=>status,getContentText:()=>JSON.stringify(status===200?{id:'file-'+calls.length+'-'+i}:status===403?{error:{details:[{reason:'SERVICE_DISABLED'}]}}:{error:{message:'failed'}})};});}}
 });
 const folder={getId:()=> 'FOLDER',createFile:blob=>{native.push(blob);return {setDescription(){},getUrl:()=> 'https://drive.google.com/native/'+native.length};}};
 const jobs=Array.from({length:4},(_,i)=>({name:'사진 '+i+'.jpg',folder,mimeType:'image/jpeg',bytes:[0,255,128,i,13,10],description:'입고 기록',saved:r=>saved.push(r)}));return {c,calls,cache,saved,native,jobs};
}
test('파일과 메타데이터를 실제 CRLF 구분자로 구성하고 원래 바이트를 그대로 전송한다',()=>{
 const r=runtime(),job=r.jobs[0],req=r.c.makeInboundDriveUploadRequest_(job,'secret');const body=Buffer.from(req.payload),text=body.toString('utf8');
 assert.match(text,/\r\nContent-Type: application\/json/);assert.equal(text.includes('\\r\\n'),false);assert.match(text,/"parents":\["FOLDER"\]/);assert.match(text,/"description":"입고 기록"/);
 assert.ok(body.includes(Buffer.from(job.bytes)));assert.match(req.contentType,/multipart\/related/);assert.equal(req.headers.Authorization,'Bearer secret');
 assert.throws(()=>r.c.makeInboundDriveUploadRequest_({...job,mimeType:'image/jpeg\r\nInjected: yes'},'secret'),/형식/);
});
test('작은 사진 네 장은 단일 동시 저장 묶음에서 처리하고 각 완료 결과를 보존한다',()=>{
 const r=runtime(),results=r.c.createInboundDriveFiles_(r.jobs);assert.equal(r.calls.length,1);assert.equal(r.calls[0].length,4);assert.equal(results.length,4);assert.equal(r.saved.length,4);assert.equal(r.native.length,0);
 assert.ok(r.calls[0].every(req=>req.url.includes('uploadType=multipart')));
});
test('중간 실패가 있어도 같은 묶음의 다른 성공 파일을 먼저 보존하며 쓰기를 자동 재시도하지 않는다',()=>{
 const r=runtime({statuses:[200,500,200,200]});assert.throws(()=>r.c.createInboundDriveFiles_(r.jobs),/저장하지 못/);assert.equal(r.saved.length,3);assert.equal(r.calls.length,1);assert.equal(r.native.length,0);
 const lost=runtime({unavailable:true});assert.throws(()=>lost.c.createInboundDriveFiles_(lost.jobs),/network/);assert.equal(lost.calls.length,1);assert.equal(lost.native.length,0);
});
test('Drive API 비활성화 응답만 기존 저장 경로로 처리하고 이후에는 비활성 경로를 반복 호출하지 않는다',()=>{
 const r=runtime({statuses:[403]});r.c.createInboundDriveFiles_([r.jobs[0]]);assert.equal(r.calls.length,1);assert.equal(r.native.length,1);
 r.c.createInboundDriveFiles_([r.jobs[1]]);assert.equal(r.calls.length,1);assert.equal(r.native.length,2);assert.equal(r.saved.length,2);
});
test('동시 전송 총 바이트를 제한하고 5MB 초과 파일은 기존 경로로 저장한다',()=>{
 const r=runtime();r.jobs.forEach(job=>job.bytes=new Array(2*1024*1024).fill(7));r.c.createInboundDriveFiles_(r.jobs);assert.deepEqual(r.calls.map(a=>a.length),[2,2]);
 const big=runtime();big.jobs[0].bytes={length:5*1024*1024+1};big.c.createInboundDriveFiles_([big.jobs[0]]);assert.equal(big.calls.length,0);assert.equal(big.native.length,1);
});
