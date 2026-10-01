import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFunctions, mobileSource } from './helpers/frontend-runtime.mjs';

function camera(id,label,focusModes=['continuous','single-shot']) {
 const settings={deviceId:id,focusMode:focusModes[0]}; const calls=[];
 const track={label,readyState:'live',getSettings:()=>({...settings}),getCapabilities:()=>({focusMode:focusModes}),
 getConstraints:()=>({}),applyConstraints:async c=>{calls.push(c);const mode=c.focusMode?.exact||c.advanced?.find(x=>x.focusMode)?.focusMode;if(mode)settings.focusMode=mode;},
 stop(){this.readyState='ended'},addEventListener(){}};
 return {track,calls,stream:{getVideoTracks:()=>[track],getTracks:()=>[track]}};
}
function runtime(devices=[],initialId='wide') {
 const requests=[];const streams=[];const stored=new Map();const timers=[];
 const app=loadFunctions(mobileSource,['getScannerCameraScore','requestScannerCamera','getScannerStream','getReusableScannerStream','renderScannerCameraSwitch','tuneScannerCamera','applyScannerTrackControls','applyScannerCenterFocus','scheduleScannerCameraTuning','clearScannerCameraTuning'],{
 state:{scannerInputMode:'camera',scannerCameraGeneration:0,scannerCameraDevices:[],scannerPreferredCameraId:'',scannerTuneTimers:[]},
 elements:{scannerScreen:{hidden:false}},document:{hidden:false},SCANNER_CAMERA_KEY:'camera',scannerTrackControlQueues:new WeakMap(),
 localStorage:{getItem:k=>stored.get(k)},window:{setTimeout:f=>{timers.push(f);return timers.length},clearTimeout(){}},syncScannerTorchControl(){},
 navigator:{mediaDevices:{getSupportedConstraints:()=>({focusMode:true,pointsOfInterest:true}),enumerateDevices:async()=>devices,
 getUserMedia:async constraints=>{requests.push(constraints);const id=constraints.video.deviceId?.exact||initialId;const d=devices.find(x=>x.deviceId===id)||{label:'Rear camera'};const c=camera(id,d.label);streams.push(c);return c.stream;}}}
 });return{app,requests,streams,timers};
}
const devices=[{kind:'videoinput',deviceId:'ultra',label:'Rear ultra wide camera'},{kind:'videoinput',deviceId:'wide',label:'Rear wide camera'},{kind:'videoinput',deviceId:'tele',label:'Rear telephoto camera'},{kind:'videoinput',deviceId:'front',label:'Front camera'}];

test('S21처럼 여러 렌즈가 있으면 초광각 대신 기본 광각을 선택하고 기존 스트림을 종료한다',async()=>{
 const {app,requests,streams}=runtime(devices,'ultra');const stream=await app.getScannerStream();
 assert.equal(requests[1].video.deviceId.exact,'wide');assert.equal(stream.getVideoTracks()[0].getSettings().deviceId,'wide');assert.equal(streams[0].track.readyState,'ended');
 assert.deepEqual(Array.from(app.state.scannerCameraDevices,d=>d.deviceId),['wide','tele','ultra']);
 assert.equal(requests[0].video.width.min,undefined);assert.equal(requests[0].video.width.ideal,1280);
});
test('Android camera2 후면 번호와 저장된 사용자 렌즈 선택을 구분한다',async()=>{
 const {app}=runtime();assert.ok(app.getScannerCameraScore({label:'camera2 0, facing back'})>app.getScannerCameraScore({label:'camera2 2, facing back'}));
 const saved=runtime(devices);saved.app.state.scannerPreferredCameraId='tele';await saved.app.getScannerStream();assert.equal(saved.requests[1].video.deviceId.exact,'tele');
});
test('기본 후면 카메라가 이미 선택되어 있거나 기기 목록 조회가 불가하면 다시 열지 않는다',async()=>{
 const {app,requests}=runtime(devices);await app.getScannerStream();await app.getScannerStream();assert.equal(requests.length,1);
 const other=runtime();other.app.navigator.mediaDevices.enumerateDevices=async()=>{throw Error('unsupported')};await other.app.getScannerStream();assert.equal(other.requests.length,1);
});
test('추천 렌즈를 열지 못하면 원래 동작하던 카메라로 복구한다',async()=>{
 const {app,requests,streams}=runtime(devices,'ultra');const original=app.navigator.mediaDevices.getUserMedia;
 app.navigator.mediaDevices.getUserMedia=async c=>{if(c.video.deviceId?.exact==='wide'){requests.push(c);throw Error('NotReadableError')}return original(c)};
 const stream=await app.getScannerStream();assert.equal(stream.getVideoTracks()[0].getSettings().deviceId,'ultra');assert.equal(streams[0].track.readyState,'ended');
});
test('권한 거절은 반복 요청하지 않고 종료한다',async()=>{
 const {app}=runtime();let count=0;app.navigator.mediaDevices.getUserMedia=async()=>{count++;const e=Error('Denied');e.name='NotAllowedError';throw e};
 await assert.rejects(app.getScannerStream(),/Denied/);assert.equal(count,1);
});
test('카메라 요청 중 닫으면 늦게 도착한 스트림도 종료한다',async()=>{
 const {app,streams}=runtime();const original=app.navigator.mediaDevices.getUserMedia;app.navigator.mediaDevices.getUserMedia=async c=>{const stream=await original(c);app.state.scannerCameraGeneration++;return stream};
 await assert.rejects(app.getScannerStream(),/cancelled/);assert.equal(streams[0].track.readyState,'ended');assert.equal(app.state.scannerStream,undefined);
});
test('초점 설정 메타데이터가 없어도 자동 초점을 요청하고 POI 실패가 초점을 취소하지 않는다',async()=>{
 const {app}=runtime();const {track,stream,calls}=camera('wide','Rear wide');track.getCapabilities=()=>({});
 const original=track.applyConstraints;track.applyConstraints=async c=>{if(c.advanced?.some(x=>x.pointsOfInterest))throw Error('Unsupported point');await original(c)};
 await app.tuneScannerCamera(stream);assert.equal(calls[0].focusMode.exact,'continuous');assert.equal(track.getSettings().focusMode,'continuous');
});
test('basic 초점 제약을 거절하는 브라우저는 advanced 방식으로 재시도한다',async()=>{
 const {app}=runtime();const {track,calls}=camera('wide','Rear wide');const original=track.applyConstraints;
 track.applyConstraints=async c=>{if(c.focusMode)throw Error('OverconstrainedError');await original(c)};
 assert.equal(await app.applyScannerTrackControls(track,{focusMode:'single-shot'}),true);assert.equal(calls[0].advanced[0].focusMode,'single-shot');
});
test('초점 모드를 무시한 경우 성공으로 보고하지 않고 수동 초점 거리 제약을 제거한다',async()=>{
 const {app}=runtime();const {track,calls}=camera('wide','Rear wide');track.getConstraints=()=>({focusDistance:2,advanced:[{focusDistance:2}]});
 track.getSettings=()=>({focusMode:'manual'});track.applyConstraints=async c=>{calls.push(c)};
 await assert.rejects(app.applyScannerTrackControls(track,{focusMode:'continuous'}),/ignored/);
 for(const c of calls){assert.equal(c.focusDistance,undefined);assert.ok(!c.advanced.some(x=>'focusDistance'in x));}
});
test('초점 재요청 후 continuous로 복구하고 종료된 카메라는 다시 튜닝하지 않는다',async()=>{
 const {app,timers}=runtime();const c=camera('wide','Rear wide');app.state.scannerStream=c.stream;
 assert.equal(await app.applyScannerCenterFocus(c.track),true);assert.equal(c.track.getSettings().focusMode,'single-shot');
 await timers[0]();await new Promise(setImmediate);assert.equal(c.track.getSettings().focusMode,'continuous');
 app.scheduleScannerCameraTuning(c.stream);c.track.stop();for(const f of timers.slice(1))await f();assert.equal(c.calls.length,3);
});
