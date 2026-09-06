import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { adminSource, mobileSource, loadFunctions, createMobileDashboardRuntime, createQrRuntime, inventoryFixture } from "./helpers/frontend-runtime.mjs";

test("unchanged mobile inventory only requests its version, including an empty inventory", async () => {
  for (const rows of [[], inventoryFixture(1, 1)]) {
    const calls = [];
    const app = createMobileDashboardRuntime(async (action) => {
      calls.push(action);
      return { stateVersion: 7 };
    });
    app.state.dashboard = rows;
    app.state.dashboardStateVersion = 7;
    assert.equal(await app.loadShippingDashboard(), true);
    assert.deepEqual(calls, ["getInventoryVersion"]);
    assert.equal(app.state.dashboard, rows);
    await app.ensureDashboardLoaded();
    assert.equal(calls.length, 1);
  }
});

test("changed inventory reloads rows and retains the pre-read version during a concurrent write", async () => {
  const calls = [];
  let latestVersion = 8;
  const rows = inventoryFixture(1, 1);
  const app = createMobileDashboardRuntime(async (action, payload) => {
    calls.push(action);
    if (action === "getInventoryVersion") return { stateVersion: latestVersion };
    assert.equal(payload.knownStateVersion, latestVersion);
    return { rows, stateVersion: 9 };
  });
  app.state.dashboardStateVersion = 7;
  assert.equal(await app.loadShippingDashboard(), true);
  assert.equal(app.state.dashboardStateVersion, 8);
  latestVersion = 9;
  assert.equal(await app.loadShippingDashboard(), true);
  assert.equal(calls.filter((action) => action === "getInventoryDashboard").length, 2);
});

test("missing or invalid version never suppresses a full inventory load", async () => {
  for (const version of [null, undefined, "", "invalid"]) {
    let fullLoads = 0;
    const app = createMobileDashboardRuntime(async (action) => {
      if (action === "getInventoryVersion") return { stateVersion: version };
      fullLoads += 1;
      return { rows: [] };
    });
    assert.equal(await app.loadShippingDashboard(), true);
    assert.equal(fullLoads, 1);
  }
});

test("failed mobile refresh retains the existing rows and can be retried", async () => {
  const rows = inventoryFixture(1, 1);
  let fail = true;
  const app = createMobileDashboardRuntime(async () => {
    if (fail) throw new Error("offline");
    return { stateVersion: 7 };
  });
  app.state.dashboard = rows;
  app.state.dashboardStateVersion = 7;
  assert.equal(await app.loadShippingDashboard({ silent: true }), false);
  assert.equal(app.state.dashboard, rows);
  assert.equal(app.state.dashboardLoadPromise, null);
  fail = false;
  assert.equal(await app.loadShippingDashboard(), true);
});

test("a mobile refresh finishing after logout cannot restore the previous account's rows", async () => {
  const pending = Promise.withResolvers();
  const app = createMobileDashboardRuntime(() => pending.promise);
  const load = app.loadShippingDashboard();
  app.state.user = null;
  pending.resolve({ stateVersion: 7 });
  assert.equal(await load, false);
  assert.equal(app.state.dashboard.length, 0);
});

test("QR lookup only merges the matching inbound's boxes among 1000 products", () => {
  const rows = inventoryFixture();
  const app = createQrRuntime(rows);
  const merge = app.getKnownBoxes;
  let mergedRows = 0;
  app.getKnownBoxes = (row) => { mergedRows += 1; return merge(row); };
  const target = rows.at(-1).allShippingBoxes.at(-1);
  assert.equal(app.findShippingByQrValue(target.boxId).scannedBoxId, target.boxId);
  assert.equal(mergedRows, 1);
  assert.equal(app.findInventoryMoveByQrValue(target.boxId).scannedBoxId, target.boxId);
  assert.equal(mergedRows, 2);
  app.state.dashboard = [];
  assert.equal(app.findShippingByQrValue(target.boxId), null);
});

test("QR lookup preserves legacy aliases, product scope, and live box status changes", () => {
  const rows = inventoryFixture(2, 1);
  const app = createQrRuntime(rows);
  const target = rows[1].allShippingBoxes[0];
  target.qrId = "legacy-alias";
  assert.equal(app.findShippingByQrValue("legacy-alias").scannedBoxId, target.boxId);
  assert.equal(app.findShippingByQrValue(JSON.stringify({ p: "P1", n: 1 })).scannedBoxId, target.boxId);
  assert.equal(app.findShippingByQrValue(JSON.stringify({ p: "P0", b: target.boxId })), null);
  target.status = "출고완료";
  assert.equal(app.findInventoryMoveByQrValue(target.boxId), null);
  assert.equal(app.findShippingByQrValue(target.boxId).scannedBox.status, "출고완료");
});

test("a missing exact box ID cannot fall back to another box with the same number", () => {
  const app = createQrRuntime(inventoryFixture(2, 1));
  assert.equal(app.findShippingByQrValue(JSON.stringify({ b: "missing-B001", n: 1 })), null);
});

test("administrator inventory also tags fetched rows with the version checked before the read", async () => {
  let applied;
  const app = loadFunctions(adminSource, ["loadInventoryDashboardRequest"], {
    state: { inventoryLoaded: true, inventoryStateVersion: 1 },
    window: { SeungjinDataGateway: { canRead: () => true } },
    requestApi: async (action) => action === "getInventoryVersion" ? { stateVersion: 2 } : { rows: [], stateVersion: 3 },
    applyInventoryDashboardResult(result) { applied = result; },
    writeAdminLargeCache() {}, showToast() {}
  });
  assert.equal(await app.loadInventoryDashboardRequest(false), true);
  assert.equal(applied.stateVersion, 2);
  assert.equal(applied.versionCheckedBeforeRead, true);
});

test("old administrator caches are displayed but their unverified version cannot skip a refresh", async () => {
  for (const verified of [false, true]) {
    let fullReads = 0;
    const app = loadFunctions(adminSource, ["loadInventoryDashboardRequest"], {
      state: { inventoryLoaded: false, inventoryStateVersion: null },
      window: { SeungjinDataGateway: { canRead: () => true } },
      readAdminLargeCache: async () => ({ rows: [], stateVersion: 2, versionCheckedBeforeRead: verified }),
      requestApi: async (action) => {
        if (action === "getInventoryVersion") return { stateVersion: 2 };
        fullReads += 1;
        return { rows: [], stateVersion: 2 };
      },
      applyInventoryDashboardResult() {}, writeAdminLargeCache() {}, showToast() {}
    });
    assert.equal(await app.loadInventoryDashboardRequest(false), true);
    assert.equal(fullReads, verified ? 0 : 1);
  }
});

function createGateway() {
  const requests = [];
  let token = "test-session";
  const context = vm.createContext({
    window: { SEUNGJIN_CONFIG: {
      ENV: "prod", SUPABASE_GATEWAY_URL: "https://example.test/gateway",
      SUPABASE_PUBLISHABLE_KEY: "public-test-key", SUPABASE_CANONICAL_WRITES: true
    } },
    sessionStorage: { getItem: () => JSON.stringify({ supabaseSessionToken: token, supabaseSessionExpiresAt: "2099-01-01" }) },
    localStorage: { getItem: () => null },
    fetch(_url, options) {
      const pending = Promise.withResolvers();
      requests.push({ ...JSON.parse(options.body), resolve: (data) => pending.resolve({ ok: true, json: async () => ({ ok: true, data }) }), reject: pending.reject });
      return pending.promise;
    }
  });
  vm.runInContext(readFileSync(new URL("../frontend/supabase-gateway.js", import.meta.url), "utf8"), context);
  return { api: context.window.SeungjinDataGateway, requests, setToken: (value) => { token = value; } };
}

test("identical in-flight reads share one request but different payloads and sessions remain separate", async () => {
  const { api, requests, setToken } = createGateway();
  const reads = [api.requestRead("getProducts"), api.requestRead("getProducts")];
  assert.equal(requests.length, 1);
  reads.push(api.requestRead("getInventoryDashboard", { knownStateVersion: 1 }));
  reads.push(api.requestRead("getInventoryDashboard", { knownStateVersion: 2 }));
  setToken("another-session");
  reads.push(api.requestRead("getProducts"));
  assert.equal(requests.length, 4);
  requests.forEach((request) => request.resolve({ rows: [] }));
  await Promise.all(reads);
  const fresh = api.requestRead("getProducts");
  assert.equal(requests.length, 5);
  requests[4].resolve({ rows: [] });
  await fresh;
});

test("a completed write prevents reuse of an older in-flight read", async () => {
  const { api, requests } = createGateway();
  const oldRead = api.requestRead("getProducts");
  const write = api.requestMutation("updateProduct", { productId: "P1" });
  requests[1].resolve({ saved: true });
  await write;
  const newRead = api.requestRead("getProducts");
  requests[0].resolve({ version: 1 });
  await oldRead;
  const sharedRead = api.requestRead("getProducts");
  assert.equal(requests.length, 3);
  requests[2].resolve({ version: 2 });
  assert.equal((await newRead).version, 2);
  assert.equal((await sharedRead).version, 2);
});

test("failed coalesced requests are released so the next read retries", async () => {
  const { api, requests } = createGateway();
  const reads = [api.requestRead("getProducts"), api.requestRead("getProducts")];
  requests[0].reject(new Error("offline"));
  const failures = await Promise.allSettled(reads);
  assert.ok(failures.every((result) => result.status === "rejected"));
  const retry = api.requestRead("getProducts");
  assert.equal(requests.length, 2);
  requests[1].resolve({ products: [] });
  await retry;
});

test("QR decoder loads once on demand and retries after a network failure", async () => {
  const scripts = [];
  const window = { setTimeout, clearTimeout };
  const app = loadFunctions(mobileSource, ["ensureQrDecoderLoaded"], {
    window, qrDecoderLoadPromise: null,
    document: { createElement: () => ({ remove() {} }), head: { append: (script) => scripts.push(script) } }
  });
  const first = app.ensureQrDecoderLoaded();
  assert.equal(first, app.ensureQrDecoderLoaded());
  scripts[0].onerror();
  await assert.rejects(first, /QR/);
  const retry = app.ensureQrDecoderLoaded();
  window.jsQR = () => null;
  scripts[1].onload();
  await retry;
  await app.ensureQrDecoderLoaded();
  assert.equal(scripts.length, 2);
  const html = readFileSync(new URL("../frontend/mobile/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<script[^>]+jsQR/);
});
