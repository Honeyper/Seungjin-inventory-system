import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  applyMutation,
  buildInventoryDashboard,
  INBOUND_BOX_CONFIGURATION_CONFLICT
} from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

const fixedNow = new Date("2026-09-01T04:00:00.000Z");

test("박스 구성 충돌은 일반 서버 오류 대신 구체적인 안내로 반환한다", () => {
  const gateway = fs.readFileSync(new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url), "utf8");
  assert.match(gateway, /CLIENT_SAFE_ERROR_MESSAGES[\s\S]*INBOUND_BOX_CONFIGURATION_CONFLICT/);
});

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
  assert.equal(holder.state.records.find((item) => item.managementId === inbound.result.managementId).trayQuantity, "10 ea");
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

test("existing inventory can move from unspecified storage through inbound edit", () => {
  const holder = {
    state: {
      products: [product("ION-0099", "미지정 재고")],
      orders: [],
      inbounds: [],
      records: [{
        ...inventoryRecord("OLD-UNASSIGNED", "ION-0099", 200, "미지정"),
        boxQuantity: "100 ea",
        inboundBoxCount: "2 box",
        boxTotalCount: "2 box",
        currentBoxCount: "1 box",
        currentTotalQuantity: "100 ea",
        inboundType: "기존재고"
      }],
      boxes: [
        inventoryBox("OLD-UNASSIGNED", "ION-0099", 1, 100, { storage: "미지정" }),
        inventoryBox("OLD-UNASSIGNED", "ION-0099", 2, 100, { storage: "미지정", status: "출고완료" })
      ]
    }
  };

  const updated = mutate(holder, "updateInbound", {
    managementId: "OLD-UNASSIGNED",
    inboundDate: "2026-09-01",
    inboundTime: "13:00",
    inboundType: "기존재고",
    productId: "ION-0099",
    productName: "미지정 재고",
    clientName: "아이원(아이텍)",
    storage: "B-1",
    stockStatus: "보관",
    boxQuantity: 100,
    inboundBoxCount: 2,
    inspectionQuantity: 0,
    defectQuantity: 0,
    defectReason: "양호"
  });

  assert.deepEqual(updated.changes.inventoryRecords.deletes, ["OLD-UNASSIGNED|ION-0099|미지정"]);
  assert.equal(updated.changes.inventoryRecords.upserts[0].storage, "B-1");
  assert.equal(updated.changes.inventoryBoxes.upserts.length, 1);
  assert.equal(updated.changes.inventoryBoxes.upserts[0].box_id, "OLD-UNASSIGNED-B001");
  assert.equal(updated.changes.inventoryBoxes.upserts[0].storage, "B-1");
  assert.equal(holder.state.records[0].storage, "B-1");
  assert.equal(holder.state.boxes[0].storage, "B-1");
  assert.equal(holder.state.boxes[1].storage, "미지정");
  assert.equal(holder.state.boxes[1].status, "출고완료");
  assert.equal(holder.state.records[0].currentBoxCount, "1 box");
  assert.equal(holder.state.records[0].currentTotalQuantity, "100 ea");
});

test("같은 제품과 발주 차수는 중복 등록하지 않는다", () => {
  const holder = {
    state: {
      products: [product("JUS-0112", "테스트 제품")],
      orders: [{
        purchaseOrderId: "PO-260907-JUS-0112-001",
        productId: "JUS-0112",
        clientName: "(주)장업시스템",
        productName: "테스트 제품",
        orderRound: "08/20 발주",
        startDate: "2026-08-20",
        endDate: "",
        totalOrderQuantity: 7890,
        accumulatedInboundQuantity: 0
      }],
      inbounds: [],
      records: [],
      boxes: []
    }
  };

  assert.throws(
    () => mutate(holder, "createPurchaseOrder", {
      productId: "JUS-0112",
      clientName: "(주)장업시스템",
      productName: "테스트 제품",
      orderRound: "08/20 발주",
      startDate: "2026-08-20",
      endDate: "2026-10-11",
      totalOrderQuantity: 14890
    }),
    /동일 제품과 발주 차수가 이미 등록되어 있습니다/
  );
});

test("발주량을 달성하거나 초과한 발주에도 추가 입고를 연결할 수 있다", () => {
  const purchaseOrderId = "PO-260908-ION-0001-001";
  const holder = {
    state: {
      products: [product("ION-0001", "제품 A")],
      orders: [{
        purchaseOrderId,
        productId: "ION-0001",
        clientName: "아이원(아이텍)",
        productName: "제품 A",
        orderRound: "1차",
        startDate: "2026-09-08",
        totalOrderQuantity: 100,
        accumulatedInboundQuantity: 100,
        remainingQuantity: 0,
        achievementRate: "100%",
        status: "입고완료"
      }],
      inbounds: [{
        managementId: "OLD-PO",
        productId: "ION-0001",
        purchaseOrderId,
        inboundTotalQuantity: "100 ea"
      }],
      records: [{
        ...inventoryRecord("OLD-PO", "ION-0001", 100),
        purchaseOrderId
      }],
      boxes: [inventoryBox("OLD-PO", "ION-0001", 1, 100)]
    }
  };

  mutate(holder, "createInbound", {
    registrant: "테스터",
    inboundDate: "2026-09-08",
    inboundTime: "13:00",
    inboundType: "정상입고",
    productId: "ION-0001",
    productName: "제품 A",
    clientName: "아이원(아이텍)",
    purchaseOrderId,
    batch: "추가입고",
    storage: "A",
    boxQuantity: 25,
    inboundBoxCount: 1,
    inspectionQuantity: 0,
    defectQuantity: 0,
    defectReason: "양호"
  });

  assert.equal(holder.state.orders[0].accumulatedInboundQuantity, 125);
  assert.equal(holder.state.orders[0].remainingQuantity, 0);
  assert.equal(holder.state.orders[0].inboundRate, 1.25);
  assert.equal(holder.state.orders[0].status, "입고완료");
});

test("처리된 박스를 유지할 수 있으면 미처리 박스 수만 안전하게 변경한다", () => {
  const managementId = "IN-260909-TEST-0001-001";
  const productId = "TEST-0001";
  const inbound = {
    ...inventoryRecord(managementId, productId, 550, "H-1"),
    inboundDate: "2026-09-09",
    inboundTime: "12:45",
    inboundType: "정상입고",
    productName: "박스 수 변경 테스트",
    boxQuantity: "100 ea",
    inboundBoxCount: "5 box",
    remainQuantity: "50 ea",
    remainderQuantities: [50],
    boxTotalCount: "6 box",
    inspectionQuantity: "20 ea",
    defectQuantity: "0 ea",
    defectReason: "양호"
  };
  const makeHolder = () => ({
    state: {
      products: [{ ...product(productId, inbound.productName), boxQuantity: "100 ea" }],
      orders: [],
      inbounds: [{ ...inbound }],
      records: [{ ...inbound }],
      boxes: Array.from({ length: 6 }, (_, index) => inventoryBox(
        managementId,
        productId,
        index + 1,
        index === 5 ? 50 : 100,
        index === 0 ? { storage: "H-1", status: "출고완료", shippingType: "정상출고" } : { storage: "H-1" }
      ))
    }
  });
  const payload = {
    managementId,
    inboundDate: inbound.inboundDate,
    inboundTime: inbound.inboundTime,
    inboundType: inbound.inboundType,
    productId,
    productName: inbound.productName,
    clientName: "아이원(아이텍)",
    storage: "H-1",
    stockStatus: "보관",
    boxQuantity: 100,
    inboundBoxCount: 3,
    remainQuantity: 50,
    remainderQuantities: [50],
    inspectionQuantity: 20,
    defectQuantity: 0,
    defectReason: "양호"
  };

  const holder = makeHolder();
  const updated = mutate(holder, "updateInbound", payload);
  assert.equal(holder.state.boxes.length, 4);
  assert.equal(holder.state.boxes[0].status, "출고완료");
  assert.equal(holder.state.boxes[0].shippingType, "정상출고");
  assert.equal(holder.state.boxes[3].quantity, 50);
  assert.deepEqual(updated.changes.inventoryBoxes.deletes, [`${managementId}-B005`, `${managementId}-B006`]);
  assert.deepEqual(updated.changes.inventoryBoxes.upserts.map((item) => item.box_id), [`${managementId}-B004`]);
  assert.equal(updated.result.boxCount, 4);

  const blocked = makeHolder();
  blocked.state.boxes[5].status = "출고대기";
  blocked.state.boxes[5].rawStatus = "출고대기";
  assert.throws(() => mutate(blocked, "updateInbound", payload), new RegExp(INBOUND_BOX_CONFIGURATION_CONFLICT));
});

test("17완박스와 잔량 1박스를 19완박스와 잔량 1박스로 늘릴 때 처리 이력을 보존한다", () => {
  const managementId = "IN-BOX-COUNT-INCREASE";
  const productId = "BOX-COUNT-PRODUCT";
  const processedNumbers = new Set([1, 3, 6, 7, 8, 10, 13, 16, 17]);
  const inbound = {
    ...inventoryRecord(managementId, productId, 25000, "H-1"),
    inboundDate: "2026-09-09",
    inboundTime: "12:45",
    inboundType: "정상입고",
    productName: "박스 수 증가 테스트",
    boxQuantity: "1,440 ea",
    inboundBoxCount: "17 box",
    remainQuantity: "520 ea",
    remainderQuantities: [520],
    boxTotalCount: "18 box",
    inspectionQuantity: "200 ea",
    defectQuantity: "0 ea",
    defectReason: "양호"
  };
  const holder = {
    state: {
      products: [{ ...product(productId, inbound.productName), boxQuantity: "1,440 ea" }],
      orders: [],
      inbounds: [{ ...inbound }],
      records: [{ ...inbound }],
      boxes: Array.from({ length: 18 }, (_, index) => inventoryBox(
        managementId,
        productId,
        index + 1,
        index === 17 ? 520 : 1440,
        processedNumbers.has(index + 1)
          ? { storage: "H-1", status: index % 2 ? "출고완료" : "출고대기", shippingType: index % 2 ? "정상출고" : "" }
          : { storage: "H-1" }
      ))
    }
  };

  const updated = mutate(holder, "updateInbound", {
    managementId,
    inboundDate: inbound.inboundDate,
    inboundTime: inbound.inboundTime,
    inboundType: inbound.inboundType,
    productId,
    productName: inbound.productName,
    clientName: "뉴파트너스",
    storage: "H-1",
    stockStatus: "보관",
    boxQuantity: 1440,
    inboundBoxCount: 19,
    remainQuantity: 520,
    remainderQuantities: [520],
    inspectionQuantity: 200,
    defectQuantity: 0,
    defectReason: "양호"
  });

  assert.equal(holder.state.boxes.length, 20);
  assert.equal(holder.state.boxes[17].quantity, 1440);
  assert.equal(holder.state.boxes[18].quantity, 1440);
  assert.equal(holder.state.boxes[19].quantity, 520);
  assert.equal(holder.state.boxes[16].status, "출고대기");
  assert.deepEqual(updated.changes.inventoryBoxes.upserts.map((item) => item.box_id), [
    `${managementId}-B018`,
    `${managementId}-B019`,
    `${managementId}-B020`
  ]);
  assert.deepEqual(updated.changes.inventoryBoxes.deletes, []);
  assert.equal(updated.result.boxCount, 20);
});

test("processed legacy inbound can link a purchase order without rebuilding boxes", () => {
  const managementId = "IN-260708-IRP-0002-001";
  const productId = "IRP-0002";
  const purchaseOrderId = "PO-260902-IRP-0002-001";
  const inbound = {
    ...inventoryRecord(managementId, productId, 34385, "현장"),
    inboundDate: "2026-07-08",
    inboundTime: "10:30",
    inboundType: "정상입고",
    clientName: "이루팩",
    productName: "라카 매직립픽서 용기",
    purchaseOrderId: "",
    boxQuantity: "480 ea",
    inboundBoxCount: "71 box",
    remainQuantity: "305 ea",
    remainderQuantities: [305],
    stockStatus: "출고완료"
  };
  const holder = {
    state: {
      products: [{ ...product(productId, inbound.productName), boxQuantity: "480 ea" }],
      orders: [{
        purchaseOrderId,
        productId,
        productName: inbound.productName,
        clientName: inbound.clientName,
        orderRound: "06/04 발주",
        startDate: "2026-06-04",
        totalOrderQuantity: 384500,
        accumulatedInboundQuantity: 0,
        status: "진행 중"
      }],
      inbounds: [{ ...inbound }],
      records: [{ ...inbound }],
      boxes: Array.from({ length: 72 }, (_, index) => inventoryBox(
        managementId,
        productId,
        index + 1,
        index === 71 ? 305 : 480,
        { storage: "현장", status: "출고완료", shippingType: "정상출고" }
      ))
    }
  };

  const updated = mutate(holder, "updateInbound", {
    managementId,
    inboundDate: inbound.inboundDate,
    inboundTime: inbound.inboundTime,
    inboundType: inbound.inboundType,
    productId,
    productName: inbound.productName,
    clientName: inbound.clientName,
    purchaseOrderId,
    storage: "현장",
    stockStatus: "출고완료",
    boxQuantity: 480,
    inboundBoxCount: 71,
    remainQuantity: 305,
    remainderQuantities: [305],
    inspectionQuantity: 80,
    defectQuantity: 0,
    defectReason: "양호"
  });

  assert.equal(holder.state.inbounds[0].purchaseOrderId, purchaseOrderId);
  assert.equal(holder.state.records[0].purchaseOrderId, purchaseOrderId);
  assert.equal(holder.state.orders[0].accumulatedInboundQuantity, 34385);
  assert.equal(holder.state.boxes.length, 72);
  assert.equal(holder.state.boxes.every((box) => box.status === "출고완료"), true);
  assert.deepEqual(updated.changes.inventoryBoxes, { upserts: [], deletes: [] });

  const correctedRemainder = mutate(holder, "updateInbound", {
    managementId,
    inboundDate: inbound.inboundDate,
    inboundTime: inbound.inboundTime,
    inboundType: inbound.inboundType,
    productId,
    productName: inbound.productName,
    clientName: inbound.clientName,
    purchaseOrderId,
    storage: "현장",
    stockStatus: "출고완료",
    boxQuantity: 480,
    inboundBoxCount: 71,
    remainQuantity: 125,
    remainderQuantities: [125],
    registrant: "테스터"
  });

  assert.equal(holder.state.inbounds[0].remainQuantity, "125 ea");
  assert.deepEqual(holder.state.inbounds[0].remainderQuantities, [125]);
  assert.equal(holder.state.records[0].remainQuantity, "125 ea");
  assert.equal(holder.state.boxes.at(-1).boxId, `${managementId}-B072`);
  assert.equal(holder.state.boxes.at(-1).quantity, 125);
  assert.equal(holder.state.boxes.at(-1).status, "출고완료");
  assert.equal(holder.state.boxes.at(-1).shippingType, "정상출고");
  assert.deepEqual(correctedRemainder.changes.inventoryBoxes.deletes, []);
  assert.deepEqual(correctedRemainder.changes.inventoryBoxes.upserts.map((item) => item.box_id), [`${managementId}-B072`]);
  assert.equal(correctedRemainder.result.updatedBoxRows, 1);
  assert.equal(holder.state.orders[0].accumulatedInboundQuantity, 34205);

  assert.throws(() => applyMutation("updateInbound", {
    managementId,
    inboundDate: inbound.inboundDate,
    inboundTime: inbound.inboundTime,
    inboundType: inbound.inboundType,
    productId,
    productName: inbound.productName,
    clientName: inbound.clientName,
    purchaseOrderId,
    storage: "현장",
    stockStatus: "출고완료",
    boxQuantity: 480,
    inboundBoxCount: 70,
    remainQuantity: 125,
    remainderQuantities: [125]
  }, holder.state, fixedNow), new RegExp(INBOUND_BOX_CONFIGURATION_CONFLICT));
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
  assert.equal(qr.changes.inventoryBoxes.upserts.length, 0);
  assert.equal(qr.changes.inventoryRecords.upserts.length, 0);
  assert.equal(holder.state.boxes[0].qrData, undefined);
  assert.deepEqual(JSON.parse(qr.result.boxes[0].qrData), {
    t: "SJ_BOX",
    b: "M-2-B001",
    m: "M-2",
    p: "ION-0001",
    n: 1
  });
  assert.equal(qr.result.boxes[0].qrData.includes("productName"), false);

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

  const directTransfer = mutate(holder, "updateShippingStatus", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [2],
    status: "출고완료",
    shippingType: "이관",
    shippingDate: "2026-09-01",
    shippingTime: "13:10",
    shipper: "테스터",
    allowInventoryAdjustment: true
  });
  assert.equal(directTransfer.result.updatedBoxRows, 1);
  assert.equal(holder.state.boxes[1].status, "출고완료");
  assert.equal(holder.state.boxes[1].shippingType, "이관");
  mutate(holder, "returnTransferredInventory", {
    managementId: "M-2",
    productId: "ION-0001",
    selectedBoxes: [2],
    targetStatus: "보관",
    storage: "A",
    returner: "테스터"
  });

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

  const dashboard = buildInventoryDashboard(holder.state.records, holder.state.boxes, [{
    productId: "ION-0001",
    trayQuantity: "25 ea",
    boxQuantity: "120 ea"
  }]);
  assert.equal(dashboard.rows.length, 1);
  assert.ok(dashboard.summary.totalQuantity > 0);
  assert.equal(dashboard.rows[0].trayQuantity, "25 ea");
  assert.equal(dashboard.rows[0].boxQuantity, "120 ea");
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

test("physical unconfirmed inventory counts unchecked mobile-audit boxes and decreases after confirmation", () => {
  const holder = {
    state: {
      products: [product("ION-0100")],
      orders: [],
      inbounds: [],
      records: [inventoryRecord("AUDIT-1", "ION-0100", 400)],
      boxes: [
        inventoryBox("AUDIT-1", "ION-0100", 1, 100),
        { ...inventoryBox("AUDIT-1", "ION-0100", 2, 100), lastInventoryCheckedAt: "2026-08-31 18:00:00" },
        inventoryBox("AUDIT-1", "ION-0100", 3, 100, { status: "출고완료" }),
        { ...inventoryBox("AUDIT-1", "ION-0100", 4, 100), inventoryCategory: "자사재고" }
      ]
    }
  };

  const before = buildInventoryDashboard(holder.state.records, holder.state.boxes);
  assert.equal(before.attention.physicalMissingCount, 1);
  assert.equal(before.rows[0].inventoryAuditTargetBoxCount, 2);
  assert.equal(before.rows[0].inventoryConfirmedBoxCount, 1);
  assert.equal(before.rows[0].inventoryUnconfirmedBoxCount, 1);

  mutate(holder, "adjustMissingInventory", {
    confirmedBoxes: [{ managementId: "AUDIT-1", productId: "ION-0100", selectedBoxes: [1] }],
    adjustments: [],
    userName: "테스터"
  });

  const after = buildInventoryDashboard(holder.state.records, holder.state.boxes);
  assert.equal(after.attention.physicalMissingCount, 0);
  assert.equal(after.rows[0].inventoryAuditTargetBoxCount, 2);
  assert.equal(after.rows[0].inventoryConfirmedBoxCount, 2);
  assert.equal(after.rows[0].inventoryUnconfirmedBoxCount, 0);
});

test("mobile inventory audit confirmation only updates scanned boxes", () => {
  const holder = {
    state: {
      products: [product("ION-0101")],
      orders: [],
      inbounds: [],
      records: [inventoryRecord("AUDIT-2", "ION-0101", 200)],
      boxes: [
        inventoryBox("AUDIT-2", "ION-0101", 1, 100),
        inventoryBox("AUDIT-2", "ION-0101", 2, 100)
      ]
    }
  };

  const result = mutate(holder, "adjustMissingInventory", {
    confirmationOnly: true,
    confirmedBoxes: [{ managementId: "AUDIT-2", productId: "ION-0101", selectedBoxes: [1] }],
    adjustments: [{ managementId: "AUDIT-2", productId: "ION-0101", productName: "제품", selectedBoxes: [2] }],
    userName: "테스터"
  });

  assert.equal(result.result.confirmedBoxRows, 1);
  assert.equal(result.result.updatedBoxRows, 0);
  assert.ok(holder.state.boxes[0].lastInventoryCheckedAt);
  assert.equal(holder.state.boxes[1].lastInventoryCheckedAt, undefined);
  assert.equal(holder.state.boxes[1].status, "보관");
  assert.equal(holder.state.boxes[1].quantity, 100);
});

console.log("supabase-state-engine-test=passed");
