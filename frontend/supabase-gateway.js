(function initializeSeungjinSupabaseGateway() {
  const config = window.SEUNGJIN_CONFIG || {};
  const enabled = ["dev", "prod"].includes(config.ENV)
    && Boolean(config.SUPABASE_GATEWAY_URL)
    && Boolean(config.SUPABASE_PUBLISHABLE_KEY);
  const readActions = new Set([
    "getProductionPlanReference",
    "getProductionPlanStaff",
    "getAdditionalProductionSources",
    "getProducts",
    "getPurchaseOrders",
    "getTodayInbounds",
    "getInventoryVersion",
    "getInboundBoxQrs",
    "getCommonContainerShipping",
    "getInventoryDashboard",
    "getInventoryChunk",
    "getSheetBackupNotifications",
    "getServerUsage"
  ]);
  const mutationActions = new Set([
    "createProduct",
    "updateProduct",
    "deleteProduct",
    "createPurchaseOrder",
    "updatePurchaseOrder",
    "deletePurchaseOrder",
    "createInbound",
    "registerAdditionalProduction",
    "updateInbound",
    "deleteInbound",
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
    registerAdditionalProduction: ["getTodayInbounds", "getInventoryDashboard"],
    createProduct: ["getProducts"],
    updateProduct: ["getProducts", "getInventoryDashboard"],
    deleteProduct: ["getProducts"],
    createPurchaseOrder: ["getPurchaseOrders"],
    updatePurchaseOrder: ["getPurchaseOrders"],
    deletePurchaseOrder: ["getPurchaseOrders"],
    createInbound: ["getProducts", "getPurchaseOrders", "getTodayInbounds", "getInventoryDashboard"],
    updateInbound: ["getProducts", "getPurchaseOrders", "getTodayInbounds", "getInventoryDashboard"],
    deleteInbound: ["getProducts", "getPurchaseOrders", "getTodayInbounds", "getInventoryDashboard"],
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
  const pendingReads = new Map();

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
      [() => sessionStorage, "seungjinAdminSession"],
      [() => sessionStorage, "seungjinMobileSession"],
      [() => localStorage, "seungjinMobilePersistentSession"]
    ];

    for (const [storage, key] of storageKeys) {
      try {
        const session = JSON.parse(storage().getItem(key) || "null");
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

    return window.SeungjinHttp.request(config.SUPABASE_GATEWAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, payload }),
      readOnly: readActions.has(action),
      timeoutMs: action === "login" ? 65000 : 45000
    });
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

  function expandInventoryResponse(data) {
    if (data?.format !== "inventory-box-table-v1") return data;
    if (!Array.isArray(data.rows) || !Array.isArray(data.boxTable)) throw new GatewayError("재고 응답을 다시 확인해주세요.");
    const rows = data.rows.map(source => {
      const row = {...source};
      for (const field of ["allShippingBoxes", "activeShippingBoxes", "shippedShippingBoxes"]) {
        if (!Array.isArray(source[field])) continue;
        row[field] = source[field].map(index => {
          if (!Number.isInteger(index) || index < 0 || !data.boxTable[index]) throw new GatewayError("재고 응답을 다시 확인해주세요.");
          return data.boxTable[index];
        });
      }
      return row;
    });
    const {format, boxTable, ...dashboard} = data;
    return {...dashboard, rows};
  }

  async function requestRead(action, payload = {}) {
    const pendingRefresh = pendingRefreshes.get(action);
    if (pendingRefresh) {
      try {
        await pendingRefresh;
      } catch (error) {
        // A failed refresh must not block the next canonical read.
      }
    }

    const session = readStoredSession();
    if (!session) {
      throw new GatewayError("로그인이 만료되었습니다. 다시 로그인해주세요.", 401);
    }
    const compactInventory = action === "getInventoryDashboard" && !payload.responseFormat;
    const readPayload = compactInventory ? {...payload, responseFormat:"inventory-box-table-v1"} : payload;
    const key = JSON.stringify([session.supabaseSessionToken, action, readPayload]);
    let pendingRead = pendingReads.get(key);
    if (!pendingRead) {
      pendingRead = (async()=>{
        for(let attempt=0;attempt<3;attempt++){
          try{
            const result=await callGateway(action,readPayload,session.supabaseSessionToken);
            if(result.data?.format!=="inventory-chunks-v1")return compactInventory?expandInventoryResponse(result.data):result.data;
            const manifest=result.data;
            const chunks=new Array(manifest.pages.length);let cursor=0;
            await Promise.all(Array.from({length:Math.min(12,manifest.pages.length)},async()=>{
              while(cursor<manifest.pages.length){const index=cursor++;const page=manifest.pages[index];
                const response=await callGateway("getInventoryChunk",{...page,expectedVersion:manifest.stateVersion,productIds:manifest.productIds},session.supabaseSessionToken);
                chunks[index]=response.data.fragment;
              }
            }));
            const version=await callGateway("getInventoryVersion",{},session.supabaseSessionToken);
            if(Number(version.data.stateVersion)!==Number(manifest.stateVersion))throw new GatewayError("재고가 변경되어 다시 불러옵니다.",409);
            const serialized=chunks.join("");
            const entries=serialized?JSON.parse("["+serialized.slice(1)+"]"):[];
            const rows=entries.map(entry=>expandInventoryResponse({format:"inventory-box-table-v1",rows:[entry.row],boxTable:entry.boxTable}).rows[0]);
            const patch={rows,stateVersion:manifest.stateVersion,qrStatusVersion:manifest.qrStatusVersion,qrInbounds:manifest.qrInbounds};
            if(manifest.inventoryDelta)return {...patch,inventoryDelta:manifest.inventoryDelta};
            if(!window.SeungjinInventoryIncremental)throw new GatewayError("재고 화면을 새로 열어주세요.");
            return window.SeungjinInventoryIncremental.merge({rows:[],stateVersion:0,locationBoxStats:[],locationQuantityStats:[]},{...patch,inventoryDelta:{fromVersion:0,productIds:[]}});
          }catch(error){if(error.status!==409||attempt===2)throw error;}
        }
      })();
      pendingReads.set(key, pendingRead);
    }
    try {
      return await pendingRead;
    } finally {
      if (pendingReads.get(key) === pendingRead) pendingReads.delete(key);
    }
  }

  async function requestMutation(action, payload = {}) {
    if (!canMutate(action)) {
      throw new GatewayError(`지원하지 않는 Supabase 쓰기 요청입니다: ${action}`);
    }
    const session = readStoredSession();
    if (!session) {
      throw new GatewayError("로그인이 만료되었습니다. 다시 로그인해주세요.", 401);
    }
    pendingReads.clear();
    try {
      const result = await callGateway(action, payload, session.supabaseSessionToken);
      return result.data;
    } finally {
      // Reads started before or during a write must not be reused after it finishes.
      pendingReads.clear();
    }
  }

  function refreshForMutation(action) {
    const actions = mutationRefreshActions[action];
    if (!enabled || !actions?.length) return null;

    const session = readStoredSession();
    if (!session) return null;

    pendingReads.clear();
    const refreshPromise = callGateway(
      "refresh",
      { actions },
      session.supabaseSessionToken
    );
    actions.forEach((readAction) => pendingRefreshes.set(readAction, refreshPromise));
    const clearPendingRefresh = () => {
      pendingReads.clear();
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
