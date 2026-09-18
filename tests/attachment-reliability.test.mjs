import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../frontend/attachments.js", import.meta.url), "utf8");
const imageFile = { name: "사진.jpg", type: "image/jpeg", size: 10 };
const options = { label: "사진", maxSize: 10 * 1024 * 1024 };
function runtime(globals = {}) {
  const context = vm.createContext({ window: {}, setTimeout, clearTimeout, ...globals });
  vm.runInContext(source, context);
  return context.window.SeungjinAttachments;
}

for (const file of [{ ...imageFile, size: 0 }, { ...imageFile, size: options.maxSize + 1 }, { ...imageFile, type: "text/plain" }]) {
  test(`reject invalid image before reading: ${file.type}, ${file.size} bytes`, async () => {
    await assert.rejects(runtime().readImage(file, options));
  });
}

for (const event of ["error", "abort", "empty", "throw"]) test(`FileReader ${event} does not leave the save hanging`, async () => {
  class Reader {
    handlers = {};
    addEventListener(name, fn) { this.handlers[name] = fn; }
    readAsDataURL() {
      if (event === "throw") throw Error("device");
      this.result = "";
      this.handlers[event === "empty" ? "load" : event]();
    }
  }
  await assert.rejects(runtime({ FileReader: Reader }).readImage(imageFile, options), /파일을 읽지 못/);
});

test("successful FileReader result is reused for the same File, and failures are retryable", async () => {
  let reads = 0;
  class Reader {
    handlers = {};
    addEventListener(name, fn) { this.handlers[name] = fn; }
    readAsDataURL() {
      if (++reads === 1) return this.handlers.error();
      this.result = "data:image/jpeg;base64,YWJj";
      this.handlers.load();
    }
  }
  const api = runtime({ FileReader: Reader });
  await assert.rejects(api.readImage(imageFile, options));
  const payload = await api.readImage(imageFile, options);
  assert.equal(await api.readImage(imageFile, options), payload);
  assert.equal(payload.data, "YWJj");
  assert.equal(reads, 2);
});

test("parallel readers are bounded, return file order, and wait for active workers on failure", async () => {
  const api = runtime();
  let active = 0;
  let maximum = 0;
  const values = await api.mapLimit([3, 1, 2, 4], async value => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, value)); active--; return value;
  });
  assert.deepEqual(Array.from(values), [3, 1, 2, 4]);
  assert.equal(maximum, 2);
  const started = [];
  await assert.rejects(api.mapLimit([1, 2, 3, 4], async value => {
    started.push(value); active++;
    await new Promise(resolve => setTimeout(resolve, value)); active--;
    if (value === 1) throw Error("decode");
  }), /decode/);
  assert.equal(active, 0);
  assert.deepEqual(started, [1, 2]);
});

test("batch initializes one folder before allowing two simultaneous uploads", async () => {
  const api = runtime();
  let folderReady = false;
  let active = 0;
  let maximum = 0;
  const uploaded = await api.uploadBatch([0, 1, 2, 3, 4], async index => {
    if (index > 0) assert.equal(folderReady, true);
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 2));
    folderReady = true; active--;
    return index;
  });
  assert.equal(maximum, 2);
  assert.deepEqual(Array.from(uploaded), [0, 1, 2, 3, 4]);
});

test("partial upload retry reuses the completed file and does not cache the failed file", async () => {
  const api = runtime();
  const files = [{ data: "first" }, { data: "second" }];
  const calls = [];
  let fail = true;
  const upload = file => api.uploadOnce("uploadInboundDefectPhotos", { managementId: "IN1", defectFiles: [file] }, async () => {
    calls.push(file.data);
    if (file === files[1] && fail) throw Error("offline");
    return { defectPhotoUrls: "https://example.test/folder" };
  });
  await assert.rejects(api.mapLimit(files, upload, 1));
  fail = false;
  await api.mapLimit(files, upload, 1);
  assert.deepEqual(calls, ["first", "second", "second"]);
});

test("in-flight duplicate upload shares a request; another record or file does not", async () => {
  const api = runtime();
  let calls = 0;
  const file = { data: "abc" };
  const send = async () => { calls++; return { imageUrl: "https://example.test/image" }; };
  await Promise.all([1, 2].map(() => api.uploadOnce("uploadProductImage", { productId: "P1", imageFile: file }, send)));
  assert.equal(calls, 1);
  await api.uploadOnce("uploadProductImage", { productId: "P2", imageFile: file }, send);
  await api.uploadOnce("uploadProductImage", { productId: "P1", imageFile: { data: "other" } }, send);
  assert.equal(calls, 3);
});

test("missing attachment URL is not cached as success", async () => {
  const api = runtime();
  const payload = { invoiceFile: { data: "abc" } };
  await assert.rejects(api.uploadOnce("uploadInboundInvoice", payload, async () => ({})));
  assert.equal((await api.uploadOnce("uploadInboundInvoice", payload, async () => ({ invoiceFileUrl: "https://example.test/file" }))).invoiceFileUrl, "https://example.test/file");
});

test("shipping photos resume individually and preserve folder, count and file URLs", async () => {
  const api = runtime();
  const files = [{ data: "1" }, { data: "2" }, { data: "3" }];
  const payload = { managementId: "IN1", defectFiles: files };
  let fail = true;
  const calls = [];
  const send = async request => {
    assert.equal(request.defectFiles.length, 1);
    const file = request.defectFiles[0];
    calls.push(file.data);
    if (fail && file.data === "2") throw Error("offline");
    return { folderUrl: "https://example.test/folder", uploadedCount: 1, fileUrls: [`https://example.test/${file.data}`] };
  };
  await assert.rejects(api.uploadOnce("uploadShippingDefectPhotos", payload, send));
  fail = false;
  const result = await api.uploadOnce("uploadShippingDefectPhotos", payload, send);
  assert.deepEqual(calls, ["1", "2", "3", "2"]);
  assert.equal(result.folderUrl, "https://example.test/folder");
  assert.equal(result.uploadedCount, 3);
  assert.equal(result.fileUrls.length, 3);
});

test("invoice optimization keeps legibility, caches the result, and releases the bitmap", async () => {
  let decoded = 0;
  let closed = 0;
  const canvas = { getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob(resolve, type, quality) {
    assert.equal(type, "image/jpeg"); assert.equal(quality, 0.88); resolve({ size: 100 });
  } };
  const api = runtime({ document: { createElement: () => canvas }, File: class { constructor(_parts, name) { this.name = name; } },
    createImageBitmap: async () => { decoded++; return { width: 4000, height: 3000, close() { closed++; } }; } });
  const file = { ...imageFile, size: 1024 * 1024 };
  const optimized = await api.optimizeInvoice(file);
  assert.equal(await api.optimizeInvoice(file), optimized);
  assert.equal(canvas.width, 2000); assert.equal(canvas.height, 1500);
  assert.equal(decoded, 1); assert.equal(closed, 1);
});

test("unavailable image decoder preserves the original invoice", async () => {
  assert.equal(await runtime().optimizeInvoice(imageFile), imageFile);
});
