import assert from 'node:assert/strict';
import test from 'node:test';
import {adminSource,loadFunctions} from './helpers/frontend-runtime.mjs';
await import('../frontend/qr-label.js');
const qr=globalThis.SeungjinQrLabel;
const labels=p=>qr.getProcessRows(p).map(r=>r.label);

test('라벨에 공정별로 실크·박을 표시하고 미사용 칸은 대시로 둔다',()=>{
 assert.deepEqual(labels({finalProcess:'3도',processStage1:'실크',processStage2:'박',processStage3:'실크'}),['1도 실크','2도 박','3도 실크']);
 assert.deepEqual(labels({finalProcess:'1도',processStage1:'박',processStage2:'실크'}),['1도 박','---','---']);
 assert.deepEqual(labels({finalProcess:'2도',stage1:'실크 인쇄',stage2:'박인쇄'}),['1도 실크','2도 박','---']);
});
test('동시 공정의 같은 인쇄 방식은 함께 표시하고 다른 방식은 각 도수에 연결한다',()=>{
 assert.deepEqual(labels({finalProcess:'3도',processGroups:[[1,2],[3]],processStage1:'실크',processStage2:'실크',processStage3:'박'}),['1도+2도 실크','3도 박','---']);
 assert.deepEqual(labels({finalProcess:'2도',processGroups:[[1,2]],processStage1:'실크',processStage2:'박'}),['1도 실크+2도 박','---','---']);
});
test('인쇄 방식이 없는 옛 제품은 추정하지 않고 화염·박가루와 단일 작업명을 유지한다',()=>{
 assert.deepEqual(labels({finalProcess:'2도',processStage1:'실크',processStage2:'미등록'}),['1도 실크','2도','---']);
 assert.deepEqual(labels({finalProcess:'1도',processStage1:'박',flameTreatmentStatus:'유',dustRemovalStatus:'유'}),['화염','1도 박','박가루']);
 for(const finalProcess of ['라벨','코팅'])assert.deepEqual(labels({finalProcess,processStage1:'실크',dustRemovalStatus:'유'}),[finalProcess,'---','---']);
});
test('QR 응답의 최신 방식이 제품 캐시보다 우선하며 기존 stage 별칭도 표시한다',()=>{
 const product={finalProcess:'3도',processStage1:'박',processStage2:'박',processStage3:'박'};
 const c=loadFunctions(adminSource,['getInboundQrProcessData'],{SeungjinQrLabel:qr,findInboundQrProduct:()=>product});
 assert.deepEqual(Array.from(c.getInboundQrProcessData({process:'1도'},[],{finalProcess:'2도',processStage1:'실크',processStage2:'박'}).processRows,r=>r.label),['1도 실크','2도 박','---']);
 assert.deepEqual(Array.from(c.getInboundQrProcessData({},[],{finalProcess:'2도',stage1:'실크',stage2:'박'}).processRows,r=>r.label),['1도 실크','2도 박','---']);
 assert.deepEqual(Array.from(c.getInboundQrProcessData({},[],{finalProcess:'2도',processStage1:'',processStage2:'실크'}).processRows,r=>r.label),['1도','2도 실크','---']);
 assert.deepEqual(Array.from(c.getInboundQrProcessData({},[],{finalProcess:'2도',processStage1:null,processStage2:'실크'}).processRows,r=>r.label),['1도','2도 실크','---']);
});
test('6도까지 각 공정의 방식을 QR 렌더링에 전달하고 API 정보가 없으면 제품을 사용한다',()=>{
 const product={finalProcess:'6도',processGroups:[[1],[2],[3],[4],[5],[6]],processStage1:'실크',processStage2:'박',processStage3:'실크',processStage4:'박',processStage5:'실크',processStage6:'박'};
 const c=loadFunctions(adminSource,['getInboundQrProcessData'],{SeungjinQrLabel:qr,findInboundQrProduct:()=>product});
 assert.deepEqual(Array.from(c.getInboundQrProcessData({process:'1도'}).processRows,r=>r.label),['1도 실크','2도 박','3도 실크','4도 박','5도 실크','6도 박']);
 assert.deepEqual(Array.from(c.getInboundQrProcessData({},[],{finalProcess:'1도'}).processRows,r=>r.label),['1도 실크','---','---']);
});

test('긴 동시 공정은 범위나 방식별 도수로 줄여도 각 인쇄 방식의 연결을 유지한다',()=>{
 assert.equal(labels({finalProcess:'6도',processGroups:[[1,2,3,4,5,6]],...Object.fromEntries(Array.from({length:6},(_,i)=>[`processStage${i+1}`,'실크']))})[0],'1~6도 실크');
 assert.equal(labels({finalProcess:'6도',processGroups:[[1,2,3,4,5,6]],processStage1:'실크',processStage2:'박',processStage3:'실크',processStage4:'박',processStage5:'실크',processStage6:'박'})[0],'1+3+5도 실크 / 2+4+6도 박');
});
