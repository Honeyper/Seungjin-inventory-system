import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { applyMutation } from '../supabase/functions/seungjin-dev-gateway/state-engine.js';
const admin = fs.readFileSync(new URL('../frontend/admin.js', import.meta.url), 'utf8');
const gas = fs.readFileSync(new URL('../gas/Code.js', import.meta.url), 'utf8');
function section(source, start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
const uploader = section(admin, 'async function uploadInboundDefectFiles(', 'async function getInboundDefectFilePayloads(');
const create = section(admin, 'async function saveInbound()', 'function getInboundPayload()');
const edit = section(admin, 'async function saveInboundEdit()', 'async function getInboundEditPayload()');
const photo = {name:'불량.jpg', mimeType:'image/jpeg', data:'YWJj'};
const folder = 'https://drive.google.com/drive/folders/defects';
function frontendHarness(requestApi, payload = {}) {
  const notices=[];
  const context=vm.createContext({requestApi, state:{}, getInboundPayload:()=>({...payload}), validateInboundPayload:()=>'',
    setInboundSaving:()=>{}, getInboundInvoicePayload:async()=>null, getInboundDefectFilePayloads:async()=>[photo,photo],
    refreshInboundMutationDataAfterMutation:()=>{}, refreshInboundMutationData:async()=>{}, resetInboundDefectDefaults:()=>{}, updateInboundSummary:()=>{},
    showToast:message=>notices.push(message)});
  vm.runInContext(uploader+create+edit,context);
  return {context,notices};
}
test('multiple photos upload one at a time; createInbound receives URLs without binary data',async()=>{
  const calls=[];let active=0;
  const {context,notices}=frontendHarness(async(action,payload)=>{
    calls.push({action,payload});
    if(action==='uploadInboundDefectPhotos') {
      active++;assert.equal(active,1);assert.equal(payload.defectFiles.length,1);
      await new Promise(resolve=>setTimeout(resolve,1));active--;
      return {defectPhotoUrls:folder};
    }
    assert.equal(action,'createInbound');assert.equal(payload.defectPhotoUrls,folder);
    assert.equal('defectFiles' in payload,false);return {managementId:'TEST'};
  },{productName:'제품',clientName:'업체',inboundDate:'2026-09-15'});
  await context.saveInbound();assert.equal(calls.length,3);
  assert.match(notices.at(-1),/입고 등록이 저장되었습니다/);
  assert.equal(calls[0].payload.productName,'제품');
});
test('failed second photo blocks inbound creation and preserves the form',async()=>{
  let attempts=0;let resets=0;
  const {context,notices}=frontendHarness(async action=>{
    assert.equal(action,'uploadInboundDefectPhotos');
    if(++attempts===2) throw new Error('업로드 연결 실패');
    return {defectPhotoUrls:folder};
  });
  context.resetInboundDefectDefaults=()=>resets++;
  await context.saveInbound();assert.equal(attempts,2);assert.equal(resets,0);
  assert.match(notices[0],/불량사진 2\/2 업로드 실패: 업로드 연결 실패/);
});
test('missing upload URL is a failure and cannot save an unattached inbound',async()=>{
  const {context,notices}=frontendHarness(async action=>{assert.equal(action,'uploadInboundDefectPhotos');return {};});
  await context.saveInbound();assert.match(notices[0],/사진 링크를 생성하지 못했습니다/);
});
for (const withFiles of [false,true]) test(`edit ${withFiles?'with new photos':'without new photos'} only sends attachment links`,async()=>{
  const calls=[];
  const {context}=frontendHarness(async(action,payload)=>{calls.push({action,payload});return {defectPhotoUrls:folder};});
  Object.assign(context, {state:{activeDetailInboundId:'IN-TEST'},saveInboundEditButton:{},
    getInboundEditPayload:async()=>({managementId:'IN-TEST',invoiceFile:null,defectFiles:withFiles?[photo]:[]}),
    validateInboundEditPayload:()=>'',refreshInboundMutationData:async()=>{},setInboundDetailMode:()=>{},
    getInboundByManagementId:()=>null,closeInboundDetailModal:()=>{}});
  await context.saveInboundEdit();
  assert.equal(calls.length,withFiles?2:1);
  const saved=calls.at(-1);assert.equal(saved.action,'updateInbound');
  assert.equal('defectFiles' in saved.payload,false);assert.equal('invoiceFile' in saved.payload,false);
  if(withFiles) assert.equal(saved.payload.defectPhotoUrls,folder);
  else assert.equal('defectPhotoUrls' in saved.payload,false);
});
const gasUploader=section(gas,'function uploadInboundDefectPhotos(payload)', 'function uploadInboundDefectPhotos_(payload, context)');
test('GAS validates all photos before any Drive write and returns the folder link',()=>{
  let writes=0;
  const context=vm.createContext({Utilities:{base64Decode:data=>({length:data==='too-large'?10*1024*1024+1:3}),formatDate:()=> '2026-09-15'},
    uploadInboundDefectPhotos_:()=>{writes++;return folder;}});
  vm.runInContext(gasUploader,context);
  for (const invalid of [null,{...photo,data:''},{...photo,mimeType:'text/plain'},{...photo,data:'too-large'}]) {
    assert.throws(()=>context.uploadInboundDefectPhotos({defectFiles:[photo,invalid]}));
    assert.equal(writes,0);
  }
  assert.throws(()=>context.uploadInboundDefectPhotos({defectFiles:[]}));
  const result=context.uploadInboundDefectPhotos({defectFiles:[photo]});
  assert.equal(result.defectPhotoUrls,folder);assert.equal(result.uploadedCount,1);assert.equal(writes,1);
});
test('uploaded defect photo link persists in canonical inbound and inventory',()=>{
  const payload={registrant:'테스트',inboundDate:'2026-09-15',inboundTime:'10:00',inboundType:'정상입고',productId:'TEST-0001',productName:'제품',clientName:'업체',storage:'A',boxQuantity:100,inboundBoxCount:1,inspectionQuantity:10,defectQuantity:1,defectReason:'스크레치',defectPhotoUrls:folder};
  const state={products:[{productId:'TEST-0001',productName:'제품',clientName:'업체',finalProcess:'1도',trayQuantity:'10 ea'}],orders:[],inbounds:[],records:[],boxes:[]};
  const mutation=applyMutation('createInbound',payload,state,new Date('2026-09-15T00:00:00Z'));
  assert.equal(mutation.state.inbounds[0].defectPhotoUrls,folder);
  assert.equal(mutation.state.records[0].defectPhotoUrls,folder);
  const changed=applyMutation('updateInbound',{...payload,managementId:mutation.result.managementId,defectPhotoUrls:folder+'-updated'},mutation.state,new Date('2026-09-15T00:01:00Z'));
  assert.equal(changed.state.inbounds[0].defectPhotoUrls,folder+'-updated');
  assert.equal(changed.state.records[0].defectPhotoUrls,folder+'-updated');
});
test('sheet backup preserves already uploaded photo URLs for create and edit',()=>{
  assert.match(gas,/uploadInboundDefectPhotos,\s*uploadProductImage/);
  for(const payload of ['payload','filePayload']) {
    assert.ok(gas.includes(`const defectPhotoUrls = uploadInboundDefectPhotos_(${payload}, {\n      managementId,\n      registeredDate\n    }) || String(payload.defectPhotoUrls || '').trim();`));
  }
});
