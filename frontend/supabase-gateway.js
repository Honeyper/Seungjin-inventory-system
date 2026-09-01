(function initializeSeungjinSupabaseGateway() {
  const config = window.SEUNGJIN_CONFIG || {};
  const enabled = ["dev", "prod"].includes(config.ENV)
    && Boolean(config.SUPABASE_GATEWAY_URL)
    && Boolean(config.SUPABASE_PUBLISHABLE_KEY);
  const readActions = new Set([
    "getProducts",
    "getPurchaseOrders",
    "getTodayInbounds",
    "getInventoryDashboard"
  ]);
  const mutationActions = new Set([
    "createProduct",
    "updateProduct",
    "deleteProduct",
    "createPurchaseOrder",
    "updatePurchaseOrder",
    "deletePurchaseOrder",
    "createInbound",
    "updateInbound",
    "deleteInbound",
    "getInboundBoxQrs",
    "saveShippingInspection",
    "cancelDiscardedBoxes",
    "classifyRemainingInventory",
    "adjustRemainingInventory",
    "updateShippingStatus",
    "adjustMissingInventory",
    "updateInventoryBoxMove",
    "returnTransferredInventory",
    "returnTakenOutInventory"
  ]);
  const mutationRefreshActions = {
    createProduct: ["getProducts"],
    updateProduct: ["getProducts", "getInventoryDashboard"],
    deleteProduct: ["getProducts"],
    createPurchaseOrder: ["getPurchaseOrders"],
    updatePurchaseOrder: ["getPurchaseOrders"],
    deletePurchaseOrder: ["getPurchaseOrders"],
    createInbound: ["getProducts", "getPurchaseOrders", "getTodayInbounds", "getInventoryDashboard"],
    updateInbound: ["getProducts", "getPurchaseOrders", "getTodayInbounds", "getInventoryDashboard"],
    deleteInbound: ["getProducts", "getPurchaseOrders", "getTodayInbounds", "getInventoryDashboard"],
    getInboundBoxQrs: ["getTodayInbounds", "getInventoryDashboard"],
    saveShippingInspection: ["getProducts", "getInventoryDashboard"],
    cancelDiscardedBoxes: ["getProducts", "getInventoryDashboard"],
    classifyRemainingInventory: ["getProducts", "getInventoryDashboard"],
    adjustRemainingInventory: ["getProducts", "getInventoryDashboard"],
    adjustMissingInventory: ["getProducts", "getInventoryDashboard"],
    updateShippingStatus: ["getProducts", "getInventoryDashboard"],
    updateInventoryBoxMove: ["getInventoryDashboard"],
    returnTransferredInventory: ["getProducts", "getInventoryDashboard"],
    returnTakenOutInventory: ["getProducts", "getInventoryDashboard"]
  };
  const pendingRefreshes = new Map();

  class GatewayError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.name = "GatewayError";
      this.status = status;
    }
  }

  function hasSession(session) {
    if (!session?.supabaseSessionToken || !session?.supabaseSessionExpiresAt) {
      return false;
    }
    return new Date(session.supabaseSessionExpiresAt).getTime() > Date.now();
  }

  function readStoredSession() {
    const storageKeys = [
      [sessionStorage, "seungjinAdminSession"],
      [sessionStorage, "seungjinMobileSession"],
      [localStorage, "seungjinMobilePersistentSession"]
    ];

    for (const [storage, key] of storageKeys) {
      try {
        const session = JSON.parse(storage.getItem(key) || "null");
        if (hasSession(session)) return session;
      } catch (error) {
        // Keep checking other session stores when one is unavailable.
      }
    }
    return null;
  }

  async function callGateway(action, payload = {}, token = "") {
    if (!enabled) {
      throw new GatewayError("Supabase Gateway가 설정되지 않았습니다.");
    }

    const headers = {
      apikey: config.SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(config.SUPABASE_GATEWAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, payload })
    });
    let result = null;
    try {
      result = await response.json();
    } catch (error) {
      throw new GatewayError("Supabase 응답을 확인할 수 없습니다.", response.status);
    }
    if (!response.ok || !result?.ok) {
      throw new GatewayError(result?.message || "Supabase 요청에 실패했습니다.", response.status);
    }
    return result;
  }

  async function login(payload) {
    return callGateway("login", payload);
  }

  function canRead(action) {
    return enabled && readActions.has(action);
  }

  function canMutate(action) {
    return enabled && config.SUPABASE_CANONICAL_WRITES === true && mutationActions.has(action);
  }

  async function requestRead(action, payload = {}) {
    const pendingRefresh = pendingRefreshes.get(action);
    if (pendingRefresh) {
      try {
        await pendingRefresh;
      } catch (error) {
        // The caller can fall back to Apps Script if the refresh failed.
      }
    }

    const session = readStoredSession();
    if (!session) {
      throw new GatewayError("로그인이 만료되었습니다. 다시 로그인해주세요.", 401);
    }
    const result = await callGateway(action, payload, session.supabaseSessionToken);
    return result.data;
  }

  async function requestMutation(action, payload = {}) {
    if (!canMutate(action)) {
      throw new GatewayError(`지원하지 않는 Supabase 쓰기 요청입니다: ${action}`);
    }
    const session = readStoredSession();
    if (!session) {
      throw new GatewayError("로그인이 만료되었습니다. 다시 로그인해주세요.", 401);
    }
    const result = await callGateway(action, payload, session.supabaseSessionToken);
    return result.data;
  }

  function refreshForMutation(action) {
    const actions = mutationRefreshActions[action];
    if (!enabled || !actions?.length) return null;

    const session = readStoredSession();
    if (!session) return null;

    const refreshPromise = callGateway(
      "refresh",
      { actions },
      session.supabaseSessionToken
    );
    actions.forEach((readAction) => pendingRefreshes.set(readAction, refreshPromise));
    const clearPendingRefresh = () => {
      actions.forEach((readAction) => {
        if (pendingRefreshes.get(readAction) === refreshPromise) {
          pendingRefreshes.delete(readAction);
        }
      });
    };
    refreshPromise.then(clearPendingRefresh, clearPendingRefresh);
    return refreshPromise;
  }

  window.SeungjinDataGateway = {
    enabled,
    hasSession,
    login,
    canRead,
    canMutate,
    requestRead,
    requestMutation,
    refreshForMutation,
    GatewayError
  };
}());
