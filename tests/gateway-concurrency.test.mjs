import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createGateway() {
  const requests = [];
  let token = "test-session";
  const context = vm.createContext({
    AbortController, setTimeout, clearTimeout,
    window: { SEUNGJIN_CONFIG: {
      ENV: "dev", SUPABASE_GATEWAY_URL: "https://example.test/gateway",
      SUPABASE_PUBLISHABLE_KEY: "public-test-key", SUPABASE_CANONICAL_WRITES: true
    } },
    sessionStorage: { getItem: () => JSON.stringify({ supabaseSessionToken: token, supabaseSessionExpiresAt: "2099-01-01" }) },
    localStorage: { getItem: () => null },
    fetch(_url, options) {
      const pending = Promise.withResolvers();
      requests.push({ ...JSON.parse(options.body), resolve: (data) => pending.resolve({ ok: true, json: async () => ({ ok: true, data }) }), reject: () => pending.resolve({ ok: false, status: 400, json: async () => ({ ok: false, message: "invalid" }) }) });
      return pending.promise;
    }
  });
  vm.runInContext(readFileSync(new URL("../frontend/http-client.js", import.meta.url), "utf8"), context);
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

