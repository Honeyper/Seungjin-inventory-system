import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { createInventoryReadCache } from "../supabase/functions/seungjin-dev-gateway/inventory-read-cache.js";
import { compactMobileDashboard } from "../supabase/functions/seungjin-dev-gateway/state-engine.js";

test("simultaneous readers share one load, and cached reads expire", async () => {
  let now = 0, loads = 0;
  const read = createInventoryReadCache({ clock: () => now, maxAgeMs: 100 });
  const pending = Promise.withResolvers();
  const load = () => { loads++; return pending.promise; };
  const requests = Array.from({ length: 10 }, () => read("v1", load));
  pending.resolve({ rows: [1] });
  const results = await Promise.all(requests);
  assert.equal(loads, 1);
  assert.ok(results.every(value => value === results[0]));
  now = 99;
  assert.equal(await read("v1", load), results[0]);
  assert.equal(loads, 1);
  now = 100;
  await read("v1", load);
  assert.equal(loads, 2);
});

test("changed stock bypasses an in-flight older read without older completion evicting it", async () => {
  const read = createInventoryReadCache();
  const old = Promise.withResolvers();
  const oldRead = read("v1", () => old.promise);
  const latest = { rows: [2] };
  assert.equal(await read("v2", () => latest), latest);
  old.resolve({ rows: [1] });
  assert.deepEqual(await oldRead, { rows: [1] });
  assert.equal(await read("v2", () => assert.fail("latest cache evicted")), latest);
});

test("failed reads are not cached and a retry can succeed", async () => {
  const read = createInventoryReadCache();
  const failure = () => { throw new Error("database unavailable"); };
  const results = await Promise.allSettled([read("v1", failure), read("v1", failure)]);
  assert.ok(results.every(result => result.status === "rejected"));
  assert.equal(await read("v1", () => "recovered"), "recovered");
});

test("gateway invalidates by stock, QR updates and Korean date; mobile and PC share a snapshot", async () => {
  const source = readFileSync(new URL("../supabase/functions/seungjin-dev-gateway/index.ts", import.meta.url), "utf8");
  const actionSource = source.slice(source.indexOf("async function readCanonicalAction("), source.indexOf("async function readSheetBackupNotifications("));
  let version = 1, qrVersion = "qr1", now = Date.parse("2026-09-28T14:59:59Z"), loads = 0;
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const box = { boxId: "B1", status: "보관", quantity: 20 };
  const rows = [{ allShippingBoxes: [box], activeShippingBoxes: [box], shippedShippingBoxes: [] }];
  const context = vm.createContext({
    Date: TestDate,
    readInventorySnapshotCached: createInventoryReadCache({ clock: () => now }),
    databaseRequest: async (path) => {
      if (path.startsWith("dev_state?")) return [{ version }];
      if (path.startsWith("dev_inbounds?")) return [{ updated_at: qrVersion }];
      assert.equal(path, "rpc/read_dev_inventory_snapshot");
      loads++;
      return { recordRows: [{ record_key: "R1", data: {} }], boxRows: [{ box_id: "B1", data: box }] };
    },
    databaseRows: async () => [],
    mapInventoryRecordRows: values => values.map(row => row.data),
    mapInventoryBoxRows: values => values.map(row => row.data),
    buildInventoryDashboard: () => ({ rows }),
    compactMobileDashboard
  });
  vm.runInContext(stripTypeScriptTypes(actionSource), context);
  const read = payload => context.readCanonicalAction("getInventoryDashboard", payload || {});
  const [pc, mobile] = await Promise.all([read(), read({ responseFormat: "mobile-box-table-v1" })]);
  assert.equal(loads, 1);
  assert.equal(pc.rows, rows);
  assert.equal(mobile.boxTable[0], box);
  assert.equal(mobile.rows[0].allShippingBoxes[0], 0);
  assert.equal(rows[0].allShippingBoxes[0], box);
  version++;
  assert.equal((await read()).stateVersion, 2);
  assert.equal(loads, 2);
  qrVersion = "qr2";
  await read();
  assert.equal(loads, 3);
  now += 2000; // Seoul midnight, before cache expiry.
  await read();
  assert.equal(loads, 4);
});
