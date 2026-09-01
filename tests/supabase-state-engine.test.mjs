import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMutation,
  buildInventoryDashboard
} from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

const fixedNow = new Date("2026-09-01T04:00:00.000Z");

function product(productId, productName = productId) {
  return {
    productId,
    productCode: productId,
    clientName: "아이원(아이텍)",
    productName,
    finalProcess: "1도",
    processStage1: "실크",
    boxQuantity: "100 ea",
    trayQuantity: "10 ea",
    accumulatedInboundQuantity: "0 ea"
  };
}

function inventoryRecord(managementId, productId, quantity, storage = "A") {
  return {
    recordKey: `${managementId}|${productId}|${storage}`,
    managementId,
    productId,
    productName: productId,
    storage,
    inboundTotalQuantity: `${quantity} ea`,
    currentTotalQuantity: `${quantity} ea`,
    currentBoxCount: "1 box",
    boxTotalCount: "1 box",
    stockStatus: "보관"
  };
}

function inventoryBox(managementId, productId, number, quantity, options = {}) {
  const storage = options.storage || "A";
  const status = options.status || "보관";
  return {
    boxId: `${managementId}-B${String(number).padStart(3, "0")}`,
    managementId,
    productId,
    productName: productId,
    number,
    quantity,
    storage,
    status,
    rawStatus: options.rawStatus || status,
    shippingType: options.shippingType || "",
    shippingDate: options.shippingDate || "",
    shippingTime: options.shippingTime || "",
    shipper: options.shipper || "",
    inventoryCategory: options.inventoryCategory || "",
    inspectionDate: options.inspectionDate || "",
    inspectionTime: options.inspectionTime || "",
    inspectionQuantity: options.inspectionQuantity || 0,
    defectQuantity: options.defectQuantity || 0,
    defectRate: options.defectRate || 0,
    defectReason: options.defectReason || ""
  };
}

function mutate(holder, action, payload) {
  const mutation = applyMutation(action, payload, holder.state, fixedNow);
  holder.state = mutation.state;
  return mutation;
}

test("product, purchase-order, and inbound CRUD preserves historical product totals", () => {
  const holder = {
    state: {
      products: [
        { ...product("ION-0001", "제품 A"), accumulatedInboundQuantity: "500 ea" },
        { ...product("ION-0002", "제품 B"), accumulatedInboundQuantity: "900 ea" }
      ],
      orders: [],
      inbounds: [],
      records: [
        inventoryRecord("OLD-A", "ION-0001", 500),
        inventoryRecord("OLD-B", "ION-0002", 900)
      ],
      boxes: [
        inventoryBox("OLD-A", "ION-0001", 1, 500),
        inventoryBox("OLD-B", "ION-0002", 1, 900)
      ]
    }
  };

  const createdProduct = mutate(holder, "createProduct", {
    clientName: "아이원(아이텍)",
    productName: "신규 제품",
    boxQuantity: 120,
    trayQuantity: 12,
    stage1Process: "실크"
  });
  const createdProductId = createdProduct.result.productId;
  assert.equal(holder.state.products.find((item) => item.productId === createdProductId).accumulatedInboundQuantity, "0 ea");

  mutate(holder, "updateProduct", {
    productId: createdProductId,
    clientName: "아이원(아이텍)",
    productName: "수정 제품",
    boxQuantity: 120,
    trayQuantity: 12,
    stage1Process: "실크"
  });
  assert.equal(holder.state.products.find((item) => item.productId === createdProductId).productName, "수정 제품");
  mutate(holder, "deleteProduct", { productId: createdProductId });
  assert.equal(holder.state.products.some((item) => item.productId === createdProductId), false);

  const order = mutate(holder, "createPurchaseOrder", {
    productId: "ION-0001",
    clientName: "아이원(아이텍)",
    productName: "제품 A",
    orderRound: "DEV 테스트",
    startDate: "2026-09-01",
    endDate: "2026-09-10",
    totalOrderQuantity: 1000,
    registrant: "테스터"
  });
  assert.match(order.result.purchaseOrderId, /^PO-260901-ION-0001-001$/);

  const inbound = mutate(holder, "createInbound", {
    registrant: "테스터",
    inboundDate: "2026-09-01",
    inboundTime: "13:00",
    inboundType: "정상입고",
    productId: "ION-0001",
    productName: "제품 A",
    clientName: "아이원(아이텍)",
    purchaseOrderId: order.result.purchaseOrderId,
    batch: "DEV-1",
    storage: "A",
    boxQuantity: 100,
    inboundBoxCount: 1,
    inspectionQuantity: 10,
    defectQuantity: 0,
    defectReason: "양호"
  });
  const managementId = inbound.result.managementId;
  assert.equal(holder.state.products.find((item) => item.productId === "ION-0001").accumulatedInboundQuantity, "600 ea");
  assert.equal(holder.state.products.find((item) => item.productId === "ION-0002").accumulatedInboundQuantity, "900 ea");
  assert.deepEqual(inbound.changes.products.upserts.map((item) => item.product_id), ["ION-0001"]);
  assert.equal(holder.state.orders[0].accumulatedInboundQuantity, 100);

  const updatedInbound = mutate(holder, "updateInbound", {
    managementId,
    registrant: "테스터",
    inboundDate: "2026-09-01",
    inboundTime: "13:05",
    inboundType: "정상입고",
    productId: "ION-0001",
    productName: "제품 A",
    clientName: "아이원(아이텍)",
    purchaseOrderId: order.result.purchaseOrderId,
    batch: "DEV-2",
    storage: "A",
    boxQuantity: 100,
    inboundBoxCount: 2,
    remainderQuantities: [30],
    inspectionQuantity: 10,
    defectQuantity: 0,
    defectReason: "양호"
  });
  assert.deepEqual(updatedInbound.changes.inventoryBoxes.deletes, []);
  assert.deepEqual(
    updatedInbound.changes.inventoryBoxes.upserts.map((item) => item.box_id),
    [`${managementId}-B001`, `${managementId}-B002`, `${managementId}-B003`]
  );
  assert.equal(holder.state.boxes.filter((box) => box.managementId === managementId).length, 3);
  assert.equal(holder.state.products.find((item) => item.productId === "ION-0001").accumulatedInboundQuantity, "730 ea");
  assert.equal(holder.state.orders[0].accumulatedInboundQuantity, 230);

  mutate(holder, "deleteInbound", { managementId, productId: "ION-0001" });
  assert.equal(holder.state.records.some((row) => row.managementId === managementId), false);
  assert.equal(holder.state.boxes.some((box) => box.managementId === managementId), false);
  assert.equal(holder.state.products.find((item) => item.productId === "ION-0001").accumulatedInboundQuantity, "500 ea");
  assert.equal(holder.state.orders[0].accumulatedInboundQuantity, 0);

  mutate(holder, "updatePurchaseOrder", {
    purchaseOrderId: order.result.purchaseOrderId,
    productId: "ION-0001",
    clientName: "아이원(아이텍)",
    productName: "제품 A",
    orderRound: "DEV 수정",
    startDate: "2026-09-01",
    endDate: "2026-09-15",
    totalOrderQuantity: 1200
  });
  assert.equal(holder.state.orders[0].totalOrderQuantity, 1200);
  mutate(holder, "deletePurchaseOrder", { purchaseOrderId: order.result.purchaseOrderId });
  assert.equal(holder.state.orders.length, 0);
});

test("shipping inspection applies quantities once and clears only waiting boxes", () => {
  const holder = {
    state: {
      products: [product("ION-0001")],
      orders: [],
      inbounds: [],
      records: [inventoryRecord("M-1", "ION-0001", 300)],
      boxes: [
        inventoryBox("M-1", "ION-0001", 1, 100),
        inventoryBox("M-1", "ION-0001", 2, 100),
        inventoryBox("M-1", "ION-0001", 3, 100, { status: "출고완료", shippingType: "정상출고" })
      ]
    }
  };

  assert.throws(() => mutate(holder, "saveShippingInspection", {
    managementId: "M-1",
    productId: "ION-0001",
    defectReasons: ["양호"]
  }), /선택/);

  mutate(holder, "saveShippingInspection", {
    managementId: "M-1",
    productId: "ION-0001",
    selectedBoxes: [1, 2],
    boxQuantities: { 1: 40, 2: 60 },
    inspectionQuantity: 50,
    defectQuantity: 5,
    defectReasons: ["스크래치"]
  });
  const inspected = holder.state.boxes.filter((box) => [1, 2].includes(box.number));
  assert.deepEqual(inspected.map((box) => box.quantity), [40, 60]);
  assert.equal(inspected.reduce((sum, box) => sum + box.inspectionQuantity, 0), 50);
  assert.equal(inspected.reduce((sum, box) => sum + box.defectQuantity, 0), 5);

  assert.throws(() => mutate(holder, "saveShippingInspection", {
    managementId: "M-1",
    productId: "ION-0001",
    selectedBoxes: [3],
    defectReasons: ["양호"]
  }), /검수 대상/);

  mutate(holder, "saveShippingInspection", {
    managementId: "M-1",
    productId: "ION-0001",
    defectReasons: ["양호"],
    clearShippingWaiting: true
  });
  assert.deepEqual(holder.state.boxes.map((box) => box.status), ["보관", "보관", "출고완료"]);
  assert.equal(holder.state.boxes[2].shippingType, "정상출고");

  mutate(holder, "saveShippingInspection", {
    managementId: "M-1",
    productId: "ION-0001",
    selectedBoxes: [1],
    boxQuantities: { 1: 35 },
    inspectionQuantity: 35,
    defectQuantity: 1,
    defectReasons: ["파손"],
    discardRequested: true
  });
  assert.equal(holder.state.boxes[0].quantity, 0);
  assert.equal(holder.state.boxes[0].beforeDiscardQuantity, 35);
  mutate(holder, "cancelDiscardedBoxes", {
    managementId: "M-1",
    productId: "ION-0001",
    selectedBoxes: [1]
  });
  assert.equal(holder.state.boxes[0].quantity, 35);
  assert.equal(holder.state.boxes[0].status, "보관");
  assert.equal(holder.state.boxes[0].beforeDiscardQuantity, 0);
  assert.equal(holder.state.boxes[0].inspectionDate, "");
  assert.match(holder.state.boxes[0].note, /폐기 취소/);

  assert.throws(() => mutate(holder, "classifyRemainingInventory", {
    managementId: "M-1",
    productId: "ION-0001",
    inventoryCategory: "자사재고"
  }), /선택/);
  mutate(holder, "classifyRemainingInventory", {
    managementId: "M-1",
    productId: "ION-0001",
    inventoryCategory: "자사재고",
    selectedBoxes: [1]
  });
  assert.equal(holder.state.boxes[0].inventoryCategory, "자사재고");
});

test("shipping, returns, inventory moves, QR, and inventory audit enforce selections", () => {
  const holder = {
    state: {
      products: [{ ...product("ION-0001"), accumulatedInboundQuantity: "200 ea" }],
      orders: [],
      inbounds: [{
        managementId: "M-2",
        productId: "ION-0001",
        inboundDate: "2026-09-01",
        qrPrintStatus: "미인쇄",
        qrGeneratedCount: 0
      }],
      records: [inventoryRecord("M-2", "ION-0001", 200)],
      boxes: [
        inventoryBox("M-2", "ION-0001", 1, 100, {
          status: "출고대기",
          rawStatus: "출고대기(검수완료)",
          inspectionDate: "2026-09-01",
          inspectionQuantity: 10
        }),
        inventoryBox("M-2", "ION-0001", 2, 100)
      ]
    }
  };

  const qr = mutate(holder, "getInboundBoxQrs", { managementId: "M-2", productId: "ION-0001" });
  assert.equal(qr.result.boxCount, 2);
  assert.equal(holder.state.inbounds[0].qrPrintStatus, "QR 생성");
  assert.equal(holder.state.inbounds[0].qrGeneratedCount, 2);
  assert.equal(qr.changes.inbounds.upserts.length, 1);
  assert.deepEqual(JSON.parse(holder.state.boxes[0].qrData), {
    t: "SJ_BOX",
    b: "M-2-B001",
    m: "M-2",
    p: "ION-0001",
    n: 1
  });
  assert.equal(holder.state.boxes[0].qrData.includes("productName"), false);

  assert.throws(() => mutate(holder, "updateShippingStatus", {
    managementId: "M-2",
    productId: "ION-0001",
    status: "출고완료"
  }), /선택/);
  assert.throws(() => mutate(holder, "updateShippingStatus", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [2],
    status: "출고완료"
  }), /검수/);

  const partialShipping = mutate(holder, "updateShippingStatus", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [1],
    boxQuantities: { 1: 80 },
    status: "출고완료",
    shippingType: "반출",
    shippingDate: "2026-09-01",
    shippingTime: "13:20",
    shipper: "테스터",
    defectPhotoFolderUrl: "https://example.com/defect-a",
    defectPhotoCount: 1
  });
  assert.equal(holder.state.boxes[0].quantity, 80);
  assert.equal(holder.state.products[0].accumulatedInboundQuantity, "120 ea");
  assert.equal(partialShipping.result.isPartialShipping, true);
  assert.equal(partialShipping.result.status, "일부 출고");
  assert.equal(holder.state.boxes[0].defectPhotoFolderUrl, "https://example.com/defect-a");

  assert.throws(() => mutate(holder, "returnTakenOutInventory", {
    managementId: "M-2",
    productId: "ION-0001",
    targetStatus: "보관",
    storage: "B"
  }), /선택/);
  mutate(holder, "returnTakenOutInventory", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [1],
    targetStatus: "보관",
    storage: "B",
    returner: "테스터"
  });
  assert.equal(holder.state.products[0].accumulatedInboundQuantity, "200 ea");
  assert.equal(holder.state.boxes[0].inspectionDate, "");
  assert.match(holder.state.boxes[0].note, /재입고/);

  mutate(holder, "updateShippingStatus", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [1],
    status: "출고대기"
  });
  mutate(holder, "updateShippingStatus", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [1],
    status: "출고완료",
    shippingType: "이관",
    shippingDate: "2026-09-01",
    shippingTime: "13:30",
    shipper: "테스터"
  });
  const transferReturn = mutate(holder, "returnTransferredInventory", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [1],
    targetStatus: "보관",
    storage: "C",
    returner: "테스터"
  });
  assert.equal(holder.state.boxes[0].storage, "C");
  assert.equal(transferReturn.result.returnedBoxes[0].number, 1);
  assert.match(holder.state.boxes[0].note, /이관 복귀/);

  mutate(holder, "updateShippingStatus", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [1],
    status: "보류"
  });
  assert.equal(holder.state.boxes[0].status, "보류");

  holder.state.boxes[0].inspectionDate = "2026-09-01";
  holder.state.boxes[0].inspectionQuantity = 10;
  mutate(holder, "updateShippingStatus", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [1],
    status: "보관"
  });
  assert.equal(holder.state.boxes[0].inspectionDate, "");
  assert.equal(holder.state.boxes[0].inspectionQuantity, 0);

  assert.throws(() => mutate(holder, "updateInventoryBoxMove", {
    managementId: "M-2",
    productId: "ION-0001",
    inventoryAction: "move",
    currentStorage: "A",
    targetStorage: "D"
  }), /선택/);
  mutate(holder, "updateInventoryBoxMove", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [2],
    inventoryAction: "setInjectionStock",
    currentStorage: "A",
    userName: "테스터"
  });
  assert.equal(holder.state.boxes[1].status, "사출재고");

  assert.throws(() => mutate(holder, "adjustMissingInventory", {
    adjustments: [{ managementId: "M-2", productId: "ION-0001", productName: "제품", selectedBoxes: [] }]
  }), /선택/);

  const auditHolder = {
    state: {
      products: [product("ION-0002")],
      orders: [],
      inbounds: [],
      records: [inventoryRecord("M-3", "ION-0002", 100)],
      boxes: [inventoryBox("M-3", "ION-0002", 1, 100)]
    }
  };
  mutate(auditHolder, "adjustMissingInventory", {
    adjustments: [{ managementId: "M-3", productId: "ION-0002", productName: "제품", selectedBoxes: [1] }],
    userName: "테스터"
  });
  assert.equal(auditHolder.state.boxes[0].shippingType, "재고조정");

  const dashboard = buildInventoryDashboard(holder.state.records, holder.state.boxes);
  assert.equal(dashboard.rows.length, 1);
  assert.ok(dashboard.summary.totalQuantity > 0);
});

test("remaining inventory adjustment uses canonical writes and protects classified boxes", () => {
  const holder = {
    state: {
      products: [{ ...product("ION-0001"), accumulatedInboundQuantity: "200 ea" }],
      orders: [],
      inbounds: [],
      records: [inventoryRecord("M-4", "ION-0001", 200)],
      boxes: [
        inventoryBox("M-4", "ION-0001", 1, 100),
        inventoryBox("M-4", "ION-0001", 2, 100, { inventoryCategory: "자사재고" })
      ]
    }
  };

  assert.throws(() => mutate(holder, "adjustRemainingInventory", {
    managementId: "M-4",
    productId: "ION-0001",
    selectedBoxes: [1],
    boxQuantities: {}
  }), /조정 수량/);
  assert.throws(() => mutate(holder, "adjustRemainingInventory", {
    managementId: "M-4",
    productId: "ION-0001",
    selectedBoxes: [2],
    boxQuantities: { 2: 50 },
    protectClassifiedInventory: true
  }), /재고조정 대상/);

  const adjustment = mutate(holder, "adjustRemainingInventory", {
    managementId: "M-4",
    productId: "ION-0001",
    selectedBoxes: [1],
    selectedBoxIds: ["M-4-B001"],
    boxQuantities: { 1: 35 },
    adjustmentDate: "2026-09-01",
    note: "실물 수량 반영",
    userName: "테스터"
  });

  assert.equal(holder.state.boxes[0].quantity, 35);
  assert.equal(holder.state.boxes[0].status, "출고완료");
  assert.equal(holder.state.boxes[0].rawStatus, "출고완료(재고조정)");
  assert.equal(holder.state.boxes[0].shippingType, "재고조정");
  assert.equal(holder.state.boxes[0].shippingDate, "(조정일)2026-09-01");
  assert.match(holder.state.boxes[0].note, /실물 수량 반영/);
  assert.equal(holder.state.records[0].currentTotalQuantity, "100 ea");
  assert.equal(holder.state.products[0].accumulatedInboundQuantity, "200 ea");
  assert.equal(adjustment.result.status, "일부 출고");
  assert.equal(adjustment.result.updatedBoxRows, 1);
  assert.equal(adjustment.result.remainingActiveRows, 1);

  const zeroHolder = {
    state: {
      products: [product("ION-0002")],
      orders: [],
      inbounds: [],
      records: [inventoryRecord("M-5", "ION-0002", 50)],
      boxes: [inventoryBox("M-5", "ION-0002", 1, 50)]
    }
  };
  const zeroAdjustment = mutate(zeroHolder, "adjustRemainingInventory", {
    managementId: "M-5",
    productId: "ION-0002",
    selectedBoxes: [1],
    boxQuantities: { 1: 0 },
    adjustmentDate: "2026-09-01",
    userName: "테스터"
  });
  assert.equal(zeroHolder.state.records[0].stockStatus, "출고완료");
  assert.equal(zeroHolder.state.records[0].currentTotalQuantity, "0 ea");
  assert.equal(zeroAdjustment.result.status, "출고완료(재고조정)");
});

console.log("supabase-state-engine-test=passed");
