import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { applyMutation } from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

const mobile = fs.readFileSync(new URL("../frontend/mobile/mobile.js", import.meta.url), "utf8");
const completeShippingItem = mobile.slice(
  mobile.indexOf("async function completeShippingItem("),
  mobile.indexOf("function getInventoryAuditProductKey(")
);
const now = new Date("2026-09-08T01:00:00Z");
function fixture(status = "보관") {
  return {
    products: [], orders: [], inbounds: [],
    records: [{ recordKey: "M-QR|P-QR|A", managementId: "M-QR", productId: "P-QR", storage: "A", inboundTotalQuantity: "240 ea" }],
    boxes: [1, 2].map((number) => ({
      boxId: `M-QR-B00${number}`, managementId: "M-QR", productId: "P-QR", number,
      storage: "A", quantity: 120, status: number === 1 ? status : "보관", rawStatus: number === 1 ? status : "보관"
    }))
  };
}
const directPayload = {
  managementId: "M-QR", productId: "P-QR", selectedBoxes: [1], selectedBoxIds: ["M-QR-B001"],
  status: "출고완료", forceCompleteShipping: true, autoShippingInspection: true,
  inspectionQuantity: 20, defectQuantity: 0, defectReason: "양호", shipper: "테스트 작업자"
};

test("모바일의 실제 바로 출고 요청은 선택 박스만 검수와 출고를 함께 완료한다", async () => {
  const source = fixture();
  let mutation;
  const context = vm.createContext({
    state: { user: { name: "테스트 작업자" } },
    getSelectedBoxQuantities: () => ({}),
    parseNumber: (value) => Number.parseFloat(value) || 0,
    toDateKey: () => "2026-09-08", toTimeKey: () => "10:00",
    requestApi: async (action, payload) => {
      mutation = applyMutation(action, payload, source, now);
      return mutation.result;
    }
  });
  vm.runInContext(completeShippingItem, context);
  const result = await context.completeShippingItem({ ...directPayload, trayQuantity: "20 ea", storage: "A" }, [1], "complete", ["M-QR-B001"]);
  assert.equal(result.updatedBoxRows, 1);
  assert.equal(result.isPartialShipping, true);
  assert.equal(mutation.state.boxes[0].status, "출고완료");
  assert.equal(mutation.state.boxes[0].inspectionQuantity, 20);
  assert.equal(mutation.state.boxes[0].inspectionDate, "2026-09-08");
  assert.equal(mutation.state.boxes[0].shipper, "테스트 작업자");
  assert.deepEqual(mutation.state.boxes[1], source.boxes[1]);
  assert.equal(source.boxes[0].status, "보관");
});

test("자동 검수 플래그나 검수 수량이 없으면 미검수 바로 출고를 허용하지 않는다", () => {
  for (const override of [{ forceCompleteShipping: false }, { autoShippingInspection: false }, { inspectionQuantity: 0 }, { inspectionQuantity: -1 }]) {
    assert.throws(() => applyMutation("updateShippingStatus", { ...directPayload, ...override }, fixture(), now), /검수/);
  }
  const pending = applyMutation("updateShippingStatus", { ...directPayload, forceCompleteShipping: false, autoShippingInspection: false }, fixture("출고대기"), now);
  assert.equal(pending.result.updatedBoxRows, 1);
});

test("완료·폐기 박스가 섞이면 전체 요청을 거부하고 원본 상태를 남긴다", () => {
  for (const status of ["출고완료", "출고완료(재고조정)", "폐기"]) {
    const source = fixture(status);
    const before = structuredClone(source);
    assert.throws(() => applyMutation("updateShippingStatus", {
      ...directPayload, selectedBoxes: [2, 1], selectedBoxIds: ["M-QR-B002", "M-QR-B001"]
    }, source, now), /출고/);
    assert.deepEqual(source, before);
  }
});
