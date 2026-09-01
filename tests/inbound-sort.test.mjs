import assert from "node:assert/strict";
import test from "node:test";

await import("../frontend/inbound-sort.js");

const { parseInboundTimestamp, sortInbounds } = globalThis.SeungjinInboundSort;

test("입고 목록 기본 정렬은 가장 최근 입고 일시부터 표시한다", () => {
  const inbounds = [
    { managementId: "EARLY", inboundDate: "2026-09-01", inboundTime: "12:15" },
    { managementId: "MID", inboundDate: "2026-09-01", inboundTime: "13:00" },
    { managementId: "LATEST", inboundDate: "2026-09-01", inboundTime: "15:40" },
    { managementId: "LATE", inboundDate: "2026-09-01", inboundTime: "12:17" }
  ];

  assert.deepEqual(
    sortInbounds(inbounds).map((inbound) => inbound.managementId),
    ["LATEST", "MID", "LATE", "EARLY"]
  );
});

test("날짜 구분자가 달라도 입고 일시를 정확히 비교한다", () => {
  assert.ok(
    parseInboundTimestamp({ inboundDate: "2026.09.01", inboundTime: "15:40" })
      > parseInboundTimestamp({ inboundDate: "2026-09-01", inboundTime: "13:00" })
  );
});

test("다른 열로 정렬해도 같은 값은 최근 입고 건을 먼저 표시한다", () => {
  const inbounds = [
    { managementId: "OLD", clientName: "가 업체", inboundDate: "2026-09-01", inboundTime: "09:00" },
    { managementId: "NEW", clientName: "가 업체", inboundDate: "2026-09-01", inboundTime: "15:40" },
    { managementId: "OTHER", clientName: "나 업체", inboundDate: "2026-09-01", inboundTime: "13:00" }
  ];

  assert.deepEqual(
    sortInbounds(inbounds, 2, "asc").map((inbound) => inbound.managementId),
    ["NEW", "OLD", "OTHER"]
  );
});

test("입고 정렬은 원본 배열을 변경하지 않는다", () => {
  const inbounds = [
    { managementId: "OLD", inboundDate: "2026-09-01", inboundTime: "09:00" },
    { managementId: "NEW", inboundDate: "2026-09-01", inboundTime: "15:40" }
  ];

  sortInbounds(inbounds);
  assert.deepEqual(inbounds.map((inbound) => inbound.managementId), ["OLD", "NEW"]);
});
