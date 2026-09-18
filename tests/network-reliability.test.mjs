import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { loadFunctions } from "./helpers/frontend-runtime.mjs";

const source = readFileSync(new URL("../frontend/http-client.js", import.meta.url), "utf8");
const response = (status = 200, value = { ok: true, data: { value: 1 } }) => ({ status, ok: status < 400, json: async () => value });
function runtime(fetch, overrides = {}) {
  const context = vm.createContext({ window: {}, fetch, AbortController, setTimeout, clearTimeout, ...overrides });
  vm.runInContext(source, context);
  return context.window.SeungjinHttp;
}

test("valid API envelopes are returned without changing data", async () => {
  const value = { ok: true, data: { quantity: 123 } };
  assert.equal(await runtime(async () => response(200, value)).request("test"), value);
});

for (const status of [429, 502, 503, 504]) test(`read retries HTTP ${status} once`, async () => {
  let calls = 0;
  const http = runtime(async () => response(++calls === 1 ? status : 200));
  assert.ok((await http.request("test", { readOnly: true, retryDelayMs: 0 })).ok);
  assert.equal(calls, 2);
});

for (const status of [400, 401, 403, 409, 500]) test(`read does not retry HTTP ${status}`, async () => {
  let calls = 0;
  const http = runtime(async () => { calls++; return response(status, { ok: false, message: "원인" }); });
  await assert.rejects(http.request("test", { readOnly: true }), error => error.status === status && error.message === "원인");
  assert.equal(calls, 1);
});

for (const status of [502, 503, 504]) test(`write never retries HTTP ${status}`, async () => {
  let calls = 0;
  await assert.rejects(runtime(async () => { calls++; return response(status); }).request("test"));
  assert.equal(calls, 1);
});

test("a dropped read connection recovers; a dropped write response is ambiguous and never repeated", async () => {
  let calls = 0;
  const http = runtime(async () => { if (++calls === 1) throw new TypeError("Failed to fetch"); return response(); });
  await http.request("test", { readOnly: true, retryDelayMs: 0 });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(http.request("test"), /저장됐을 수/);
  assert.equal(calls, 1);
});

test("deadline covers a stalled response body and aborts both attempts", async () => {
  const signals = [];
  const http = runtime(async (_url, options) => {
    signals.push(options.signal);
    return { ok: true, status: 200, json: () => new Promise(() => {}) };
  });
  await assert.rejects(http.request("test", { readOnly: true, timeoutMs: 5, retryDelayMs: 0 }), error => error.code === "timeout");
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => signal.aborted));
});

test("write timeout releases the caller without another write", async () => {
  let calls = 0;
  const http = runtime(() => { calls++; return new Promise(() => {}); });
  await assert.rejects(http.request("test", { timeoutMs: 5 }), /저장됐을 수/);
  assert.equal(calls, 1);
});

test("offline requests do not contact the server", async () => {
  const http = runtime(() => assert.fail("unexpected network"), { navigator: { onLine: false } });
  await assert.rejects(http.request("test", { readOnly: true }), error => error.code === "offline");
});

for (const value of [null, [], "html", {}, { ok: false }]) test(`invalid envelope ${JSON.stringify(value)} is rejected`, async () => {
  await assert.rejects(runtime(async () => response(200, value)).request("test"));
});

test("HTML and malformed JSON are translated into a readable error", async () => {
  const http = runtime(async () => ({ ok: true, status: 200, json: async () => { throw SyntaxError("Unexpected token '<'"); } }));
  await assert.rejects(http.request("test"), error => error.code === "invalid_response" && !error.message.includes("Unexpected"));
});

test("both login forms ignore a second submission while the first is pending", async () => {
  const desktop = readFileSync(new URL("../frontend/app.js", import.meta.url), "utf8");
  const mobile = readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
  await loadFunctions(desktop, ["handleLogin"], { loginButton: { disabled: true } }).handleLogin();
  await loadFunctions(mobile, ["attemptAdminLogin"], { elements: { adminLoginButton: { disabled: true } } }).attemptAdminLogin();
});

test("corrupted administrator session redirects to login without crashing initialization", () => {
  const admin = readFileSync(new URL("../frontend/admin.js", import.meta.url), "utf8");
  for (const saved of ["{broken", "null", "[]", "123", '"invalid"']) {
    const app = loadFunctions(admin, ["readAdminSession"], { sessionStorage: { getItem: () => saved } });
    assert.equal(app.readAdminSession(), null);
  }
  const app = loadFunctions(admin, ["readAdminSession"], { sessionStorage: { getItem() { throw Error("blocked"); } } });
  assert.equal(app.readAdminSession(), null);
});

test("denied sessionStorage falls through to the available persistent session", async () => {
  const context = vm.createContext({ window: { SEUNGJIN_CONFIG: { ENV: "dev", SUPABASE_GATEWAY_URL: "test", SUPABASE_PUBLISHABLE_KEY: "test" },
    SeungjinHttp: { request: async (_url, options) => { assert.equal(options.headers.Authorization, "Bearer test-token"); return { ok: true, data: [] }; } } },
    localStorage: { getItem: () => JSON.stringify({ supabaseSessionToken: "test-token", supabaseSessionExpiresAt: "2099-01-01" }) } });
  Object.defineProperty(context, "sessionStorage", { get() { throw Error("Storage blocked"); } });
  vm.runInContext(readFileSync(new URL("../frontend/supabase-gateway.js", import.meta.url), "utf8"), context);
  await context.window.SeungjinDataGateway.requestRead("getProducts");
});
