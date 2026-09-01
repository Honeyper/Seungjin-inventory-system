const DEV_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzSz-9IspdGb_wcAIUVhokQdQR0egaiR5M1sJ9PQVX5pjm_w7-FPU3gaj-cmLwjAvxvsg/exec";
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
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
    throw new Error(`Database request failed (${response.status}): ${message}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
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
  const response = await fetch(DEV_APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload })
  });
  const result = await response.json() as { ok?: boolean; data?: JsonRecord; message?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.message || `${action} 요청에 실패했습니다.`);
  }
  return result.data || {};
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

  const session = await readSession(request);
  if (!session) {
    return jsonResponse(request, { ok: false, message: "로그인이 만료되었습니다. 다시 로그인해주세요." }, 401);
  }

  if (action === "refresh") {
    const requestedActions = Array.isArray(payload.actions) ? payload.actions.map(String) : [];
    const datasets = Array.from(new Set(
      requestedActions
        .map((requestedAction) => ACTION_DATASETS[requestedAction])
        .filter((dataset): dataset is SnapshotDataset => Boolean(dataset))
    ));
    const synced = await syncDatasets(datasets.length ? datasets : Object.keys(SNAPSHOT_DEFINITIONS) as SnapshotDataset[]);
    return jsonResponse(request, { ok: true, data: { synced } });
  }

  const dataset = ACTION_DATASETS[action];
  if (!dataset) {
    return jsonResponse(request, { ok: false, message: `지원하지 않는 조회 요청입니다: ${action}` }, 400);
  }

  let snapshot = await getSnapshot(dataset);
  if (!snapshot) {
    await syncDataset(dataset);
    snapshot = await getSnapshot(dataset);
  }
  if (!snapshot) {
    return jsonResponse(request, { ok: false, message: "동기화된 데이터를 찾을 수 없습니다." }, 503);
  }

  refreshStaleSnapshot(dataset, snapshot.source_refreshed_at);
  const data = action === "getTodayInbounds"
    ? filterInbounds(snapshot.payload, payload)
    : snapshot.payload;
  return jsonResponse(request, {
    ok: true,
    data,
    meta: {
      source: "supabase-snapshot",
      refreshedAt: snapshot.source_refreshed_at
    }
  });
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error("Seungjin DEV gateway error:", error instanceof Error ? error.message : String(error));
    return jsonResponse(request, {
      ok: false,
      message: "Supabase DEV 데이터 처리 중 문제가 발생했습니다."
    }, 500);
  }
});
