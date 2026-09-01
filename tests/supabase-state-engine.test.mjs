import assert from "node:assert/strict";
import {
  applyMutation,
  buildInventoryDashboard
} from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

const fixedNow = new Date("2026-09-01T04:00:00.000Z");
let state = {
  products: [{
    productId: "ION-0001",
    productCode: "ION-0001",
    clientName: "아이원(아이텍)",
    productName: "테스트 제품",
    finalProcess: "1도",
    processStage1: "실크",
    boxQuantity: "100 ea",
    trayQuantity: "10 ea"
  }],
  orders: [],
  inbounds: [],
  records: [],
  boxes: []
};

function mutate(action, payload) {
  const mutation = applyMutation(action, payload, state, fixedNow);
  state = mutation.state;
  return mutation;
}

const order = mutate("createPurchaseOrder", {
  productId: "ION-0001",
  clientName: "아이원(아이텍)",
  productName: "테스트 제품",
  orderRound: "DEV 테스트",
  startDate: "2026-09-01",
  endDate: "2026-09-10",
  totalOrderQuantity: 1000,
  registrant: "테스터"
});
assert.match(order.result.purchaseOrderId, /^PO-260901-ION-0001-001$/);

const inbound = mutate("createInbound", {
  registrant: "테스터",
  inboundDate: "2026-09-01",
  inboundTime: "13:00",
  inboundType: "정상입고",
  productId: "ION-0001",
  productName: "테스트 제품",
  clientName: "아이원(아이텍)",
  purchaseOrderId: order.result.purchaseOrderId,
  batch: "DEV-1",
  process: "1도",
  storage: "A",
  boxQuantity: 100,
  inboundBoxCount: 2,
  remainderQuantities: [30],
  inspectionQuantity: 10,
  defectQuantity: 0,
  defectReason: "양호"
});
assert.equal(inbound.result.boxCount, 3);
assert.equal(state.boxes.at(-1).quantity, 30);
assert.equal(state.orders[0].accumulatedInboundQuantity, 230);

const managementId = inbound.result.managementId;
const qr = mutate("getInboundBoxQrs", { managementId, productId: "ION-0001" });
assert.equal(qr.result.boxCount, 3);
assert.ok(state.boxes.find((box) => box.managementId === managementId).qrData);

mutate("saveShippingInspection", {
  managementId,
  productId: "ION-0001",
  selectedBoxes: [1],
  inspectionDate: "2026-09-01",
  inspectionTime: "13:10",
  inspectionQuantity: 10,
  defectQuantity: 0,
  defectReasons: ["양호"]
});
assert.equal(state.boxes.find((box) => box.managementId === managementId && box.number === 1).status, "출고대기");

mutate("updateShippingStatus", {
  managementId,
  productId: "ION-0001",
  selectedBoxes: [1],
  status: "출고완료",
  shippingType: "이관",
  transferCompany: "테스트 업체",
  shippingDate: "2026-09-01",
  shippingTime: "13:20",
  shipper: "테스터"
});
assert.equal(state.boxes.find((box) => box.managementId === managementId && box.number === 1).shippingType, "이관");

mutate("returnTransferredInventory", {
  managementId,
  productId: "ION-0001",
  selectedBoxes: [1],
  targetStatus: "보관",
  storage: "B",
  returner: "테스터"
});
assert.equal(state.boxes.find((box) => box.managementId === managementId && box.number === 1).storage, "B");

mutate("updateInventoryBoxMove", {
  managementId,
  productId: "ION-0001",
  selectedBoxes: [2],
  inventoryAction: "move",
  currentStorage: "A",
  targetStorage: "C",
  userName: "테스터"
});
assert.equal(state.boxes.find((box) => box.managementId === managementId && box.number === 2).storage, "C");

mutate("adjustMissingInventory", {
  adjustments: [{
    managementId,
    productId: "ION-0001",
    productName: "테스트 제품",
    selectedBoxes: [3]
  }],
  confirmedBoxes: [{
    managementId,
    productId: "ION-0001",
    selectedBoxes: [1, 2]
  }],
  userName: "테스터"
});
assert.equal(state.boxes.find((box) => box.managementId === managementId && box.number === 3).shippingType, "재고조정");

const dashboard = buildInventoryDashboard(state.records, state.boxes);
assert.equal(dashboard.rows.length, 1);
assert.equal(dashboard.summary.totalBoxes, 2);
assert.equal(dashboard.summary.totalQuantity, 200);

console.log("supabase-state-engine-test=passed");
