import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../frontend/admin.js',import.meta.url),'utf8');
function setup(window){
 const c=vm.createContext({window,BACKUP_NOTIFICATION_READ_KEY:'read',state:{backupNotifications:[{signature:'day1:success',status:'success'}]},backupNotificationBadge:{},backupNotificationButton:{classList:{toggle(){}}}});
 vm.runInContext(source.slice(source.indexOf('const backupNotificationReadSignatures ='),source.indexOf('function formatBackupNotificationDate(')),c);return c;
}
const storage=()=>({value:null,getItem(){return this.value},setItem(k,v){this.value=v}});
test('opening clears the badge and only a new notification or changed result restores it',()=>{
 const window={localStorage:storage(),sessionStorage:storage()},c=setup(window);
 c.updateBackupNotificationBadge();assert.equal(c.backupNotificationBadge.hidden,false);
 c.markBackupNotificationsRead();assert.equal(c.backupNotificationBadge.hidden,true);
 const reloaded=setup(window);reloaded.updateBackupNotificationBadge();assert.equal(reloaded.backupNotificationBadge.hidden,true);
 c.state.backupNotifications.push({signature:'day2:success',status:'success'});c.updateBackupNotificationBadge();assert.equal(c.backupNotificationBadge.textContent,'1');
});
test('blocked browser storage cannot keep the read badge visible',()=>{
 const window={};for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw Error('blocked')}});
 const c=setup(window);c.markBackupNotificationsRead();c.updateBackupNotificationBadge();assert.equal(c.backupNotificationBadge.hidden,true);
});
test('missing server signatures remain read and processing is not counted',()=>{
 const c=setup({localStorage:storage(),sessionStorage:storage()});c.state.backupNotifications=[{businessDate:'2026-09-28',status:'success',totalCount:10},{status:'processing'}];c.markBackupNotificationsRead();c.updateBackupNotificationBadge();assert.equal(c.backupNotificationBadge.hidden,true);
});
