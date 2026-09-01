import {
  applyMutation,
  buildInventoryDashboard,
  SUPABASE_MUTATION_ACTIONS
} from "./state-engine.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0] || "";
  } catch (_error) {
    return "";
  }
})();
const APPS_SCRIPT_URLS: Record<string, string> = {
  lponwunagtixddwqkzxx:
    "https://script.google.com/macros/s/AKfycbzSz-9IspdGb_wcAIUVhokQdQR0egaiR5M1sJ9PQVX5pjm_w7-FPU3gaj-cmLwjAvxvsg/exec",
  zicvuuzpzcfeeegwhmif:
    "https://script.google.com/macros/s/AKfycbyPiTM2wEZ5d549g0R8pqLQB2FKE0Hz-7h_GYGfA_MVUq45-F3tTyITbT4A-yJ1ZldOCA/exec"
};
const APPS_SCRIPT_URL = APPS_SCRIPT_URLS[PROJECT_REF] || "";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SNAPSHOT_TTL_MS = 30 * 1000;
const ALLOWED_ORIGINS = new Set([
  "https://honeyper.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

type JsonRecord = Record<string, unknown>;
type SnapshotDataset = "products" | "purchase_orders" | "inbounds" | "inventory_dashboard";

interface SnapshotDefinition {
  action: string;
  payload: JsonRecord;
  getRecordCount: (data: JsonRecord) => number;
}

const SNAPSHOT_DEFINITIONS: Record<SnapshotDataset, SnapshotDefinition> = {
  products: {
    action: "getProducts",
    payload: {},
    getRecordCount: (data) => Array.isArray(data.products) ? data.products.length : 0
  },
  purchase_orders: {
    action: "getPurchaseOrders",
    payload: {},
    getRecordCount: (data) => Array.isArray(data.purchaseOrders) ? data.purchaseOrders.length : 0
  },
  inbounds: {
    action: "getTodayInbounds",
    payload: { startDate: "2000-01-01", endDate: "2100-12-31" },
    getRecordCount: (data) => Array.isArray(data.inbounds) ? data.inbounds.length : 0
  },
  inventory_dashboard: {
    action: "getInventoryDashboard",
    payload: {},
    getRecordCount: (data) => Array.isArray(data.rows) ? data.rows.length : 0
  }
};

const ACTION_DATASETS: Record<string, SnapshotDataset> = {
  getProducts: "products",
  getPurchaseOrders: "purchase_orders",
  getTodayInbounds: "inbounds",
  getInventoryDashboard: "inventory_dashboard"
};

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://honeyper.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: getCorsHeaders(request)
  });
}

function getNamedKey(environmentName: string, legacyName: string) {
  const encodedKeys = Deno.env.get(environmentName);
  if (encodedKeys) {
    try {
      const keys = JSON.parse(encodedKeys) as Record<string, string>;
      return keys.default || Object.values(keys)[0] || "";
    } catch (_error) {
      return "";
    }
  }
  return Deno.env.get(legacyName) || "";
}

const SUPABASE_SECRET_KEY = getNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_PUBLISHABLE_KEY = getNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");

async function databaseRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    const error = new Error(`Database request failed (${response.status}): ${message}`) as Error & {
      status?: number;
      responseText?: string;
    };
    error.status = response.status;
    error.responseText = message;
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function databaseRows(path: string) {
  const pageSize = 1000;
  const rows: JsonRecord[] = [];
  let offset = 0;

  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const page = await databaseRequest(`${path}${separator}limit=${pageSize}&offset=${offset}`) as JsonRecord[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
    offset += pageSize;
  }
}

async function loadFullCanonicalState() {
  return await databaseRequest("rpc/read_dev_canonical_state", {
    method: "POST",
    body: "{}"
  }) as JsonRecord;
}

async function loadStateVersion() {
  // Read the version first. Any write that lands while the scoped rows are
  // loading increments this version and is rejected safely at commit time.
  const stateRows = await databaseRequest(
    "dev_state?singleton=eq.true&select=version&limit=1"
  ) as Array<{ version: number }>;
  const version = stateRows?.[0]?.version;
  if (!Number.isFinite(Number(version))) {
    throw new Error("재고 데이터 버전을 확인할 수 없습니다.");
  }
  return version;
}

function mapInventoryRecordRows(rows: JsonRecord[]) {
  return rows.map((row) => ({
    ...(row.data as JsonRecord),
    recordKey: row.record_key,
    originalStorage: row.storage
  }));
}

function mapInventoryBoxRows(rows: JsonRecord[]) {
  return rows.map((row) => ({
    ...(row.data as JsonRecord),
    boxId: row.box_id,
    managementId: row.management_id,
    productId: row.product_id,
    storage: row.storage,
    number: row.box_number
  }));
}

async function loadInboundUpdateState(payload: JsonRecord) {
  const productId = String(payload.productId || "").trim();
  if (!productId) return loadFullCanonicalState();

  const version = await loadStateVersion();
  const encodedProductId = encodeURIComponent(productId);
  const [productRows, orderRows, inboundRows, recordRows, boxRows] = await Promise.all([
    databaseRows(`dev_products?product_id=eq.${encodedProductId}&select=product_id,data`),
    databaseRows(`dev_purchase_orders?product_id=eq.${encodedProductId}&select=purchase_order_id,product_id,data`),
    databaseRows(`dev_inbounds?product_id=eq.${encodedProductId}&select=record_key,management_id,product_id,inbound_date,data`),
    databaseRows(`dev_inventory_records?product_id=eq.${encodedProductId}&select=record_key,management_id,product_id,storage,data`),
    databaseRows(`dev_inventory_boxes?product_id=eq.${encodedProductId}&select=box_id,management_id,product_id,storage,box_number,data`)
  ]);

  return {
    version,
    products: productRows.map((row) => row.data),
    orders: orderRows.map((row) => row.data),
    inbounds: inboundRows.map((row) => row.data),
    records: mapInventoryRecordRows(recordRows),
    boxes: mapInventoryBoxRows(boxRows)
  };
}

async function loadShippingMutationState(payload: JsonRecord) {
  const productId = String(payload.productId || "").trim();
  const managementId = String(payload.managementId || "").trim();
  const status = String(payload.status || "").replace(/\s+/g, "");
  const shippingType = String(payload.shippingType || payload["출고유형"] || "").replace(/\s+/g, "");
  const needsProductScope = status === "보관"
    || (status === "출고완료" && shippingType.startsWith("반출"));
  const scopeColumn = needsProductScope && productId ? "product_id" : "management_id";
  const scopeValue = scopeColumn === "product_id" ? productId : managementId;
  if (!scopeValue) return loadFullCanonicalState();

  const version = await loadStateVersion();

  const encodedScopeValue = encodeURIComponent(scopeValue);
  const productRowsPromise = needsProductScope && productId
    ? databaseRows(`dev_products?product_id=eq.${encodeURIComponent(productId)}&select=product_id,data`)
    : Promise.resolve([] as JsonRecord[]);
  const [productRows, recordRows, boxRows] = await Promise.all([
    productRowsPromise,
    databaseRows(`dev_inventory_records?${scopeColumn}=eq.${encodedScopeValue}&select=record_key,management_id,product_id,storage,data`),
    databaseRows(`dev_inventory_boxes?${scopeColumn}=eq.${encodedScopeValue}&select=box_id,management_id,product_id,storage,box_number,data`)
  ]);

  return {
    version,
    products: productRows.map((row) => row.data),
    orders: [],
    inbounds: [],
    records: mapInventoryRecordRows(recordRows),
    boxes: mapInventoryBoxRows(boxRows)
  };
}

async function loadCanonicalState(action: string, payload: JsonRecord) {
  if (action === "updateInbound") {
    return loadInboundUpdateState(payload);
  }
  if (action === "updateShippingStatus" || action === "updateInventoryBoxMove") {
    return loadShippingMutationState(payload);
  }
  return loadFullCanonicalState();
}

function isStateVersionConflict(error: unknown) {
  return error instanceof Error && error.message.includes("DEV_STATE_VERSION_CONFLICT");
}

async function commitCanonicalMutation(action: string, payload: JsonRecord) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = await loadCanonicalState(action, payload);
    const mutation = applyMutation(action, payload, state, new Date()) as {
      changes: JsonRecord;
      result: JsonRecord;
    };

    try {
      const commit = await databaseRequest("rpc/commit_dev_state_mutation", {
        method: "POST",
        body: JSON.stringify({
          p_expected_version: state.version,
          p_changes: mutation.changes,
          p_action: action,
          p_payload: payload,
          p_result: mutation.result,
          p_enqueue_sheet: true
        })
      });
      return {
        ...mutation.result,
        stateVersion: (commit as JsonRecord)?.version,
        sheetOutboxId: (commit as JsonRecord)?.outboxId
      };
    } catch (error) {
      lastError = error;
      if (!isStateVersionConflict(error)) throw error;
      if (attempt < 4) {
        const backoffMs = 60 * (2 ** attempt) + Math.floor(Math.random() * 40);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  if (isStateVersionConflict(lastError)) {
    throw new Error("동시 작업이 많아 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
  throw lastError || new Error("동시 작업 충돌로 저장하지 못했습니다. 다시 시도해주세요.");
}

async function readCanonicalAction(action: string, payload: JsonRecord) {
  if (action === "getProducts") {
    const rows = await databaseRows("dev_products?select=data&order=product_id.asc");
    return { products: rows.map((row) => row.data) };
  }
  if (action === "getPurchaseOrders") {
    const rows = await databaseRows("dev_purchase_orders?select=data&order=updated_at.desc,purchase_order_id.desc");
    return { purchaseOrders: rows.map((row) => row.data) };
  }
  if (action === "getTodayInbounds") {
    const requestedStart = String(payload.startDate || payload.date || "2000-01-01");
    const requestedEnd = String(payload.endDate || payload.date || requestedStart);
    const startDate = requestedStart <= requestedEnd ? requestedStart : requestedEnd;
    const endDate = requestedStart <= requestedEnd ? requestedEnd : requestedStart;
    const rows = await databaseRows(
      `dev_inbounds?select=data&inbound_date=gte.${encodeURIComponent(startDate)}&inbound_date=lte.${encodeURIComponent(endDate)}&order=inbound_date.desc,management_id.desc`
    );
    return {
      startDate,
      endDate,
      inbounds: rows.map((row) => row.data)
    };
  }
  if (action === "getInventoryDashboard") {
    const [state, stateRows] = await Promise.all([
      databaseRequest("rpc/read_dev_inventory_state", {
        method: "POST",
        body: "{}"
      }) as Promise<{ records?: JsonRecord[]; boxes?: JsonRecord[] }>,
      databaseRequest("dev_state?singleton=eq.true&select=version&limit=1") as Promise<Array<{ version: number }>>
    ]);
    return {
      ...(buildInventoryDashboard(state.records || [], state.boxes || []) as JsonRecord),
      stateVersion: Number(stateRows?.[0]?.version) || null
    };
  }
  if (action === "getInventoryVersion") {
    const stateRows = await databaseRequest(
      "dev_state?singleton=eq.true&select=version&limit=1"
    ) as Array<{ version: number }>;
    return { stateVersion: Number(stateRows?.[0]?.version) || null };
  }
  throw new Error(`지원하지 않는 Supabase 조회 요청입니다: ${action}`);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createOneTimeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasValidPublishableKey(request: Request) {
  const providedKey = request.headers.get("apikey") || "";
  return Boolean(SUPABASE_PUBLISHABLE_KEY) && providedKey === SUPABASE_PUBLISHABLE_KEY;
}

async function readSession(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const rows = await databaseRequest(
    `app_sessions?token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(now)}&select=user_payload,expires_at&limit=1`
  ) as Array<{ user_payload: JsonRecord; expires_at: string }>;
  return rows?.[0] || null;
}

async function fetchAppsScript(action: string, payload: JsonRecord) {
  if (!APPS_SCRIPT_URL) {
    throw new Error(`지원하지 않는 Supabase 프로젝트입니다: ${PROJECT_REF || "unknown"}`);
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload })
  });
  const result = await response.json() as { ok?: boolean; data?: JsonRecord; message?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.message || `${action} 요청에 실패했습니다.`);
  }
  return result.data || {};
}

async function consumeSheetSyncToken(token: string, purpose: "cron" | "apps_script") {
  if (!token) return false;
  return await databaseRequest("rpc/consume_dev_sheet_sync_token", {
    method: "POST",
    body: JSON.stringify({
      p_token_hash: await sha256(token),
      p_purpose: purpose
    })
  }) === true;
}

async function createSheetSyncToken(purpose: "cron" | "apps_script", lifetimeMs: number) {
  const token = createOneTimeToken();
  await databaseRequest("rpc/create_dev_sheet_sync_token", {
    method: "POST",
    body: JSON.stringify({
      p_token_hash: await sha256(token),
      p_purpose: purpose,
      p_expires_at: new Date(Date.now() + lifetimeMs).toISOString()
    })
  });
  return token;
}

async function finishSheetOutbox(results: JsonRecord[]) {
  return await databaseRequest("rpc/finish_dev_sheet_outbox", {
    method: "POST",
    body: JSON.stringify({ p_results: results })
  }) as JsonRecord;
}

async function applyInboundAttachmentResults(items: JsonRecord[], results: JsonRecord[]) {
  const itemsById = new Map(items.map((item) => [String(item.id), item]));
  for (const result of results) {
    if (result.ok !== true) continue;
    const item = itemsById.get(String(result.id));
    if (!item || !["createInbound", "updateInbound"].includes(String(item.action))) continue;
    await databaseRequest("rpc/apply_dev_sheet_attachment_result", {
      method: "POST",
      body: JSON.stringify({
        p_action: item.action,
        p_payload: item.payload || {},
        p_result: result.data || {}
      })
    });
  }
}

async function runNightlySheetSync() {
  let claimed = 0;
  let synced = 0;
  let failed = 0;

  for (let batchIndex = 0; batchIndex < 10; batchIndex += 1) {
    const items = await databaseRequest("rpc/claim_dev_sheet_outbox", {
      method: "POST",
      body: JSON.stringify({ p_limit: 10 })
    }) as JsonRecord[];
    if (!items.length) break;
    claimed += items.length;

    let results: JsonRecord[];
    try {
      const token = await createSheetSyncToken("apps_script", 10 * 60 * 1000);
      const response = await fetchAppsScript("applySupabaseOutbox", { token, items });
      results = Array.isArray(response.results) ? response.results as JsonRecord[] : [];
      const returnedIds = new Set(results.map((result) => String(result.id)));
      for (const item of items) {
        if (!returnedIds.has(String(item.id))) {
          results.push({ id: item.id, ok: false, message: "Apps Script 동기화 결과가 누락되었습니다." });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results = items.map((item) => ({ id: item.id, ok: false, message }));
    }

    await applyInboundAttachmentResults(items, results);
    const summary = await finishSheetOutbox(results);
    synced += Number(summary.synced || 0);
    failed += Number(summary.failed || 0);
    if (results.some((result) => result.ok !== true)) break;
  }

  return { claimed, synced, failed, source: "supabase-outbox" };
}

async function syncDataset(dataset: SnapshotDataset) {
  const definition = SNAPSHOT_DEFINITIONS[dataset];
  const data = await fetchAppsScript(definition.action, definition.payload);
  const now = new Date().toISOString();
  await databaseRequest("api_snapshots?on_conflict=dataset", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      dataset,
      payload: data,
      record_count: definition.getRecordCount(data),
      source_refreshed_at: now,
      updated_at: now
    })
  });
  return { dataset, recordCount: definition.getRecordCount(data), refreshedAt: now };
}

async function syncDatasets(datasets: SnapshotDataset[]) {
  return Promise.all(datasets.map((dataset) => syncDataset(dataset)));
}

async function getSnapshot(dataset: SnapshotDataset) {
  const rows = await databaseRequest(
    `api_snapshots?dataset=eq.${dataset}&select=payload,source_refreshed_at&limit=1`
  ) as Array<{ payload: JsonRecord; source_refreshed_at: string }>;
  return rows?.[0] || null;
}

function refreshStaleSnapshot(dataset: SnapshotDataset, refreshedAt: string) {
  const age = Date.now() - new Date(refreshedAt).getTime();
  if (!Number.isFinite(age) || age <= SNAPSHOT_TTL_MS) return;

  const refreshPromise = syncDataset(dataset).catch((error) => {
    console.error(`Snapshot refresh failed for ${dataset}:`, error.message);
  });
  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(refreshPromise);
}

function filterInbounds(data: JsonRecord, payload: JsonRecord) {
  const inbounds = Array.isArray(data.inbounds) ? data.inbounds as JsonRecord[] : [];
  const requestedStart = String(payload.startDate || payload.date || data.startDate || "2000-01-01");
  const requestedEnd = String(payload.endDate || payload.date || requestedStart);
  const startDate = requestedStart <= requestedEnd ? requestedStart : requestedEnd;
  const endDate = requestedStart <= requestedEnd ? requestedEnd : requestedStart;
  return {
    startDate,
    endDate,
    inbounds: inbounds.filter((item) => {
      const inboundDate = String(item.inboundDate || "");
      return inboundDate >= startDate && inboundDate <= endDate;
    })
  };
}

async function handleLogin(request: Request, payload: JsonRecord) {
  const loginData = await fetchAppsScript("login", payload);
  if (loginData.success !== true) {
    return jsonResponse(request, { ok: false, data: loginData, message: loginData.message || "로그인에 실패했습니다." }, 401);
  }

  const token = createSessionToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  await databaseRequest("app_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      token_hash: tokenHash,
      user_payload: (loginData.user as JsonRecord) || {},
      expires_at: expiresAt
    })
  });

  void databaseRequest(`app_sessions?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: "DELETE"
  }).catch(() => null);

  return jsonResponse(request, {
    ok: true,
    data: {
      ...loginData,
      supabaseSessionToken: token,
      supabaseSessionExpiresAt: expiresAt
    }
  });
}

async function handleBootstrap(request: Request) {
  const existing = await databaseRequest("api_snapshots?select=dataset&limit=1") as JsonRecord[];
  if (existing.length) {
    return jsonResponse(request, { ok: false, message: "초기 동기화가 이미 완료되었습니다." }, 409);
  }
  const synced = await syncDatasets(Object.keys(SNAPSHOT_DEFINITIONS) as SnapshotDataset[]);
  return jsonResponse(request, { ok: true, data: { synced } });
}

async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { ok: false, message: "POST 요청만 지원합니다." }, 405);
  }
  if (!hasValidPublishableKey(request)) {
    return jsonResponse(request, { ok: false, message: "유효하지 않은 애플리케이션 키입니다." }, 401);
  }

  const body = await request.json() as { action?: string; payload?: JsonRecord };
  const action = String(body.action || "");
  const payload = body.payload || {};

  if (action === "login") return handleLogin(request, payload);
  if (action === "bootstrap") return handleBootstrap(request);
  if (action === "verifySheetSyncToken") {
    const valid = await consumeSheetSyncToken(String(payload.token || ""), "apps_script");
    return jsonResponse(request, {
      ok: valid,
      data: { valid },
      message: valid ? undefined : "유효하지 않거나 만료된 동기화 토큰입니다."
    }, valid ? 200 : 401);
  }
  if (action === "runNightlySheetSync") {
    const valid = await consumeSheetSyncToken(String(payload.token || ""), "cron");
    if (!valid) {
      return jsonResponse(request, { ok: false, message: "유효하지 않거나 만료된 예약 작업 토큰입니다." }, 401);
    }
    return jsonResponse(request, { ok: true, data: await runNightlySheetSync() });
  }

  const session = await readSession(request);
  if (!session) {
    return jsonResponse(request, { ok: false, message: "로그인이 만료되었습니다. 다시 로그인해주세요." }, 401);
  }

  if (action === "refresh") {
    return jsonResponse(request, {
      ok: true,
      data: {
        synced: [],
        source: "supabase-canonical",
        message: "Supabase 원본 데이터는 별도 스프레드시트 새로고침이 필요하지 않습니다."
      }
    });
  }

  if (SUPABASE_MUTATION_ACTIONS.has(action)) {
    const result = await commitCanonicalMutation(action, payload);
    return jsonResponse(request, {
      ok: true,
      data: result,
      meta: { source: "supabase-canonical" }
    });
  }

  if (ACTION_DATASETS[action] || action === "getInventoryVersion") {
    const data = await readCanonicalAction(action, payload);
    return jsonResponse(request, {
      ok: true,
      data,
      meta: { source: "supabase-canonical" }
    });
  }

  return jsonResponse(request, { ok: false, message: `지원하지 않는 요청입니다: ${action}` }, 400);
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error("Seungjin DEV gateway error:", error instanceof Error ? error.message : String(error));
    return jsonResponse(request, {
      ok: false,
      message: "Supabase 데이터 처리 중 문제가 발생했습니다."
    }, 500);
  }
});
