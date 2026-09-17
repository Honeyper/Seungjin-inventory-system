import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../gas',import.meta.url));
const script=fs.readFileSync(new URL('../tools/apps-script-deploy.cjs',import.meta.url),'utf8');
const fn=script.slice(script.indexOf('function readProjectFiles()'),script.indexOf('\nfunction getEnvConfig'));
function files(){const context=vm.createContext({fs,path,ROOT_DIR:root});vm.runInContext(fn,context);return context.readProjectFiles();}
function runtime(projectFiles){const c=vm.createContext({});for(const f of projectFiles.filter(f=>f.type==='SERVER_JS'))vm.runInContext(f.source,c);c.jsonResponse=x=>x;return c;}
test('deployment includes every server script and the manifest',()=>{
  const result=files();
  assert.ok(result.some(f=>f.name==='ProductionPlan'&&f.type==='SERVER_JS'));
  assert.ok(result.some(f=>f.name==='appsscript'&&f.type==='JSON'));
  assert.equal(result.filter(f=>f.type==='SERVER_JS').length,fs.readdirSync(root).filter(n=>/\.(js|gs)$/.test(n)).length);
});
test('deployed bundle registers all routes and login accepts valid and rejects invalid fixture credentials',()=>{
  const c=runtime(files());
  c.getLoginAccounts_=()=>[{accountId:'test-admin',password:'fixture-password',isActive:true,role:'admin',name:'검증'}];
  assert.equal(typeof c.getApiRoutes_().getProductionPlanReference,'function');
  const request=password=>c.doPost({postData:{contents:JSON.stringify({action:'login',payload:{accountId:'test-admin',password}})}});
  assert.equal(request('fixture-password').data.success,true);
  assert.equal(request('wrong-password').data.code,'INVALID_CREDENTIALS');
});
test('missing production reference script reproduces the previous login outage',()=>{
  const c=runtime(files().filter(f=>f.name!=='ProductionPlan'));
  const r=c.doPost({postData:{contents:JSON.stringify({action:'login',payload:{}})}});
  assert.equal(r.ok,false);assert.match(r.message,/getProductionPlanReference is not defined/);
});
