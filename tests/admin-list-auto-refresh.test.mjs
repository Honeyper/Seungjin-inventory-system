import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { adminSource, loadFunctions } from './helpers/frontend-runtime.mjs';

const controllerSource = readFileSync(new URL('../frontend/admin-list-refresh.js', import.meta.url), 'utf8');
class Target {
  listeners = new Map();
  addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  emit(name) { this.listeners.get(name)?.forEach(fn => fn()); }
}
function harness(refresh = async () => true) {
  let time = 0, id = 0, paused = false, view = 'inbound';
  const tasks = new Map(), calls = [], errors = [];
  const host = Object.assign(new Target(), { navigator: { onLine: true },
    setTimeout(fn, delay) { tasks.set(++id, { at: time + delay, fn }); return id; },
    clearTimeout(key) { tasks.delete(key); }
  });
  const doc = Object.assign(new Target(), { hidden: false });
  const scope = vm.createContext({ window: host });
  vm.runInContext(controllerSource, scope);
  const api = host.SeungjinAdminListRefresh.create({ window: host, document: doc,
    now: () => time, getContext: () => view ? { view } : null, isPaused: () => paused,
    refresh: async (context, guard) => { calls.push(context.view); return refresh(context, guard); },
    onError: error => errors.push(error)
  });
  api.start();
  return { api, host, doc, calls, errors, setView: value => { view = value; }, pause: value => { paused = value; },
    async tick(ms) { const end = time + ms; while (true) { const next = [...tasks].sort((a,b) => a[1].at-b[1].at)[0]; if (!next || next[1].at > end) break; time = next[1].at; tasks.delete(next[0]); await next[1].fn(); } time = end; },
    advance(ms) { time += ms; }
  };
}
const flush = async () => { for (let i=0; i<8; i++) await Promise.resolve(); };

test('only the current list polls every 30 seconds; a new view refreshes on navigation', async () => {
  const h = harness();
  await h.tick(29999); assert.equal(h.calls.length, 0);
  await h.tick(1); assert.deepEqual(h.calls, ['inbound']);
  h.setView('purchase-orders'); h.host.emit('hashchange'); await flush();
  assert.deepEqual(h.calls, ['inbound', 'purchase-orders']);
  await h.tick(30000); assert.deepEqual(h.calls, ['inbound', 'purchase-orders', 'purchase-orders']);
});

test('hidden, offline and editing tabs do not fetch; returning to a stale tab does', async () => {
  const h = harness(); h.doc.hidden = true;
  await h.tick(30000); assert.equal(h.calls.length, 0);
  h.doc.hidden = false; h.host.navigator.onLine = false; h.doc.emit('visibilitychange'); await flush();
  assert.equal(h.calls.length, 0);
  h.host.navigator.onLine = true; h.pause(true); h.host.emit('online'); await flush();
  assert.equal(h.calls.length, 0);
  h.pause(false); h.host.emit('focus'); await flush(); assert.equal(h.calls.length, 1);
  h.host.emit('focus'); await flush(); assert.equal(h.calls.length, 1);
});

test('editing that starts during a request discards the response, then retries after blur', async () => {
  let resolve, current = 'saved';
  const h = harness(async (_, guard) => { await new Promise(r => { resolve = r; }); if (!guard()) return false; current = 'fresh'; return true; });
  h.advance(30000); const pending = h.api.check('interval');
  h.doc.emit('input'); h.pause(true); resolve(); await pending;
  assert.equal(current, 'saved');
  h.pause(false); h.doc.emit('focusout'); h.advance(1500);
  const retry = h.api.check('interval'); resolve(); await retry;
  assert.equal(current, 'fresh'); assert.equal(h.calls.length, 2);
});

test('focus bursts never overlap reads and a departed view cannot apply its late response', async () => {
  let resolve, applied = 0;
  const h = harness(async (_, guard) => { await new Promise(r => { resolve = r; }); if (!guard()) return false; applied++; return true; });
  h.advance(30000); const pending = h.api.check('interval');
  h.host.emit('focus'); h.setView('shipping'); h.host.emit('hashchange');
  await h.api.check(); assert.equal(h.calls.length, 1);
  resolve(); await pending; assert.equal(applied, 0);
  const next = h.api.check(); resolve(); await next;
  assert.deepEqual(h.calls, ['inbound', 'shipping']); assert.equal(applied, 1);
});

test('failed reads retry on a later poll instead of a tight loop; stop rejects pending results', async () => {
  const h = harness(async () => { throw Error('offline'); });
  await h.tick(30000); assert.equal(h.errors.length, 1);
  await h.tick(29999); assert.equal(h.errors.length, 1);
  await h.tick(1); assert.equal(h.errors.length, 2);
  h.api.stop(); await h.tick(60000); assert.equal(h.calls.length, 2);
  let resolve, applied = false;
  const p = harness(async (_, guard) => { await new Promise(r => { resolve = r; }); applied = guard(); return applied; });
  p.advance(30000); const pending = p.api.check(); p.api.stop(); resolve(); await pending;
  assert.equal(applied, false);
});

function adapter(responses = {}) {
  const calls = [], applied = [], caches = [];
  const globals = { adminListRequestRevision: 0, INVENTORY_DASHBOARD_CACHE_KEY: 'inventory',
    state: { products: [{ productId: 'old' }], purchaseOrders: [{ purchaseOrderId: 'old' }], todayInbounds: [{ managementId: 'old' }], clientFilter: 'selected', inventoryLoaded: true, inventoryStateVersion: 5, inventoryQrStatusVersion: 'qr-1', inventoryPage: 3, shippingPage: 2 },
    applyInventoryDashboardResult: result => applied.push(result),
    writeAdminCache: (key, result) => caches.push({ key, result }),
    applyTodayInboundsResult: result => { context.state.todayInbounds = result.inbounds; applied.push(result); },
    applyPurchaseOrderFilters: () => applied.push('orders'),
    renderClientFilterOptions: () => { context.state.clientFilter = ''; },
    setSelectValue: () => {}, productClientFilter: {}, applyFilters: () => applied.push('products'),
    requestApi(action, payload) { context.adminListRequestRevision++; calls.push({ action, payload }); return typeof responses[action] === 'function' ? responses[action]() : Promise.resolve(responses[action]); }
  };
  const context = loadFunctions(adminSource, ['readAdminListRefreshSnapshot', 'refreshActiveAdminList'], globals);
  return { context, calls, applied, caches };
}

test('inventory polls only its lightweight version when unchanged; QR changes fetch the dashboard', async () => {
  const h = adapter({ getInventoryVersion: { stateVersion: 5, qrStatusVersion: 'qr-1' } });
  assert.equal(await h.context.refreshActiveAdminList({ view: 'inventory' }, () => true), true);
  assert.deepEqual(h.calls.map(c => c.action), ['getInventoryVersion']); assert.equal(h.applied.length, 0);
  const changed = adapter({ getInventoryVersion: { stateVersion: 5, qrStatusVersion: 'qr-2' }, getInventoryDashboard: { rows: [{ managementId: 'new' }] } });
  await changed.context.refreshActiveAdminList({ view: 'shipping' }, () => true);
  assert.equal(changed.applied[0].qrStatusVersion, 'qr-2');
  assert.equal(changed.context.state.inventoryPage, 3); assert.equal(changed.context.state.shippingPage, 2);
});

test('a stale background read cannot overwrite a newer manual read or mutation', async () => {
  let resolve;
  const h = adapter({ getTodayInbounds: () => new Promise(r => { resolve = r; }) });
  const pending = h.context.refreshActiveAdminList({ view: 'inbound', startDate: '2026-10-01', endDate: '2026-10-19' }, () => true);
  h.context.adminListRequestRevision++; resolve({ inbounds: [{ managementId: 'stale' }] });
  assert.equal(await pending, false); assert.equal(h.applied.length, 0); assert.equal(h.context.state.todayInbounds[0].managementId, 'old');
});

test('malformed/failed responses retain the last list, while a valid empty list is applied', async () => {
  const h = adapter({ getPurchaseOrders: {} });
  await assert.rejects(h.context.refreshActiveAdminList({ view: 'purchase-orders' }, () => true));
  assert.equal(h.context.state.purchaseOrders[0].purchaseOrderId, 'old'); assert.equal(h.applied.length, 0);
  const empty = adapter({ getPurchaseOrders: { purchaseOrders: [] } });
  await empty.context.refreshActiveAdminList({ view: 'purchase-orders' }, () => true);
  assert.equal(empty.context.state.purchaseOrders.length, 0); assert.equal(empty.applied[0], 'orders');
});

test('inbound date range and product filters survive auto refresh, with no form draft reloading', async () => {
  const h = adapter({ getTodayInbounds: { inbounds: [{ managementId: 'new' }] }, getProducts: { products: [{ productId: 'new' }] } });
  await h.context.refreshActiveAdminList({ view: 'inbound', startDate: '2026-10-12', endDate: '2026-10-19' }, () => true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].payload)), { startDate: '2026-10-12', endDate: '2026-10-19' });
  assert.equal(h.caches[0].key, 'inbounds:2026-10-12:2026-10-19');
  await h.context.refreshActiveAdminList({ view: 'products' }, () => true);
  assert.equal(h.context.state.clientFilter, 'selected'); assert.equal(h.context.state.products[0].productId, 'new');
});

test('unchanged records do not redraw a table or disturb its expanded rows', async () => {
  const h = adapter({ getPurchaseOrders: { purchaseOrders: [{ purchaseOrderId: 'old' }] } });
  await h.context.refreshActiveAdminList({ view: 'purchase-orders' }, () => true);
  assert.equal(h.applied.length, 0);
});

test('request tracking releases busy state after failure and invalidates background snapshots on writes', async () => {
  const h = loadFunctions(adminSource, ['requestApi'], { adminListPendingRequests: 0, adminListRequestRevision: 0,
    performAdminApiRequest: async () => { throw Error('failed'); } });
  await assert.rejects(h.requestApi('updateInbound', {}));
  assert.equal(h.adminListPendingRequests, 0); assert.equal(h.adminListRequestRevision, 1);
});


test('a selected inventory/shipping filter stays selected even after its final matching row disappears', () => {
  let value = 'previous client', html = '';
  const select = { get value() { return value; }, set value(next) { value = next; },
    get innerHTML() { return html; }, set innerHTML(next) { html = next; value = ''; } };
  const h = loadFunctions(adminSource, ['renderSelectOptions'], { escapeHtml: String, escapeAttribute: String });
  h.renderSelectOptions(select, ['new client']);
  assert.equal(select.value, 'previous client');
  assert.match(select.innerHTML, /previous client/);
});
