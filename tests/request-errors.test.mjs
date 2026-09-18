import assert from "node:assert/strict";
import test from "node:test";
import { ValidationError, readRequestBody, publicError } from "../supabase/functions/seungjin-dev-gateway/request-errors.js";
import { applyMutation, ShippingStateConflict, INVENTORY_ADJUSTMENT_CONFLICT } from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

for (const value of [null, [], {}, { action: 1 }, { action: " " }, { action: "getProducts", payload: [] }, { action: "getProducts", payload: null }]) {
  test(`invalid server request ${JSON.stringify(value)} returns validation error`, async () => {
    await assert.rejects(readRequestBody({ json: async () => value }), ValidationError);
  });
}
test("malformed JSON is a client error, not an internal server error", async () => {
  await assert.rejects(readRequestBody({ json: async () => { throw SyntaxError("bad JSON"); } }), ValidationError);
});
test("valid action has a default empty payload", async () => {
  assert.deepEqual(await readRequestBody({ json: async () => ({ action: "getProducts" }) }), { action: "getProducts", payload: {} });
});
test("domain validation is visible, concurrency conflict stays 409, and internal errors stay private", () => {
  const conflicts = new Map([[INVENTORY_ADJUSTMENT_CONFLICT, INVENTORY_ADJUSTMENT_CONFLICT]]);
  const classify = error => publicError(error, conflicts, ShippingStateConflict);
  assert.deepEqual(classify(new ValidationError("수량을 입력해주세요.")), { status: 400, message: "수량을 입력해주세요." });
  assert.equal(classify(new ShippingStateConflict("동시 변경")).status, 409);
  assert.equal(classify(new ValidationError(INVENTORY_ADJUSTMENT_CONFLICT)).status, 409);
  const internal = classify(new Error("Database request failed: secret query"));
  assert.equal(internal.status, 500); assert.doesNotMatch(internal.message, /secret|query/);
});
test("actual product validation reaches the client as actionable input feedback", () => {
  assert.throws(() => applyMutation("createProduct", {}, { products: [], orders: [], inbounds: [], records: [], boxes: [] }), ValidationError);
});
