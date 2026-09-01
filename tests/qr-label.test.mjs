import assert from "node:assert/strict";
import test from "node:test";

await import("../frontend/qr-label.js");

const { getProcessRows } = globalThis.SeungjinQrLabel;

test("기본 공정은 1도, 2도, 3도 순서를 유지한다", () => {
  assert.deepEqual(getProcessRows({ finalProcess: "2도" }), [
    { label: "1도", disabled: false, treatment: false },
    { label: "2도", disabled: false, treatment: false },
    { label: "3도", disabled: true, treatment: false }
  ]);
});

test("화염처리는 첫 칸에 놓고 1도와 2도를 뒤로 이동한다", () => {
  assert.deepEqual(getProcessRows({ finalProcess: "1도", flameTreatmentStatus: "유" }), [
    { label: "화염처리", disabled: false, treatment: true },
    { label: "1도", disabled: false, treatment: false },
    { label: "2도", disabled: true, treatment: false }
  ]);
});

test("박가루 제거는 세 번째 공정 칸에 놓는다", () => {
  assert.deepEqual(getProcessRows({ finalProcess: "2도", dustRemovalStatus: "유" }), [
    { label: "1도", disabled: false, treatment: false },
    { label: "2도", disabled: false, treatment: false },
    { label: "박가루 제거", disabled: false, treatment: true }
  ]);
});

test("화염처리와 박가루 제거가 모두 있으면 첫 칸과 세 번째 칸에 배치한다", () => {
  assert.deepEqual(getProcessRows({
    finalProcess: "1도",
    flameTreatmentStatus: "유",
    dustRemovalStatus: "유"
  }).map((row) => row.label), ["화염처리", "1도", "박가루 제거"]);
});
