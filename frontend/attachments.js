(function initializeAttachments() {
  const preparedFiles = new WeakMap();
  const optimizedInvoices = new WeakMap();
  const fileIds = new WeakMap();
  const uploads = new Map();
  const uploadFields = {
    uploadInboundInvoice: "invoiceFileUrl",
    uploadInboundDefectPhotos: "defectPhotoUrls",
    uploadProductImage: "imageUrl",
    uploadShippingDefectPhotos: "folderUrl"
  };
  let nextFileId = 0;

  function validateImage(file, { label, maxSize }) {
    if (!file?.type?.startsWith("image/")) throw new Error(`${label}는 이미지 파일만 업로드할 수 있습니다.`);
    if (!file.size) throw new Error(`${label} 파일이 비어 있습니다.`);
    if (file.size > maxSize) throw new Error(`${label} 파일은 개별 ${Math.round(maxSize / 1024 / 1024)}MB 이하로 등록해주세요.`);
  }

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const timer = setTimeout(() => {
        reject(new Error("파일 읽기 시간이 초과되었습니다. 파일을 다시 선택해주세요."));
        reader.abort();
      }, 30000);
      const fail = () => { clearTimeout(timer); reject(new Error("파일을 읽지 못했습니다. 파일을 다시 선택해주세요.")); };
      reader.addEventListener("load", () => {
        clearTimeout(timer);
        const value = String(reader.result || "");
        if (!/^data:image\/[^;,]+;base64,.+$/s.test(value)) return fail();
        resolve(value);
      });
      reader.addEventListener("error", fail);
      reader.addEventListener("abort", fail);
      try { reader.readAsDataURL(file); } catch (_error) { fail(); }
    });
  }

  // Keep the decoded payload per File, so a failed save need not decode it again.
  async function readImage(file, options) {
    validateImage(file, options);
    let prepared = preparedFiles.get(file);
    if (!prepared) {
      prepared = readDataUrl(file).then(dataUrl => ({
        name: file.name, mimeType: file.type, data: dataUrl.slice(dataUrl.indexOf(",") + 1)
      }));
      preparedFiles.set(file, prepared);
    }
    try { return await prepared; } catch (error) {
      if (preparedFiles.get(file) === prepared) preparedFiles.delete(file);
      throw error;
    }
  }

  async function optimizeInvoice(file) {
    if (!optimizedInvoices.has(file)) optimizedInvoices.set(file, resizeInvoice(file));
    return optimizedInvoices.get(file);
  }

  async function resizeInvoice(file) {
    if (file.size < 512 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      || typeof createImageBitmap !== "function") return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return file;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "거래명세서"}.jpg`, {
        type: "image/jpeg", lastModified: file.lastModified
      });
    } catch (_error) {
      // Unsupported/corrupt decoders must not prevent the original file upload.
      return file;
    } finally {
      bitmap?.close?.();
    }
  }

  // Wait for active workers before rejecting, so a retry cannot race an old upload.
  async function mapLimit(items, worker, limit = 2) {
    const results = new Array(items.length);
    let next = 0;
    let failure;
    await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, limit)) }, async () => {
      while (!failure && next < items.length) {
        const index = next++;
        try { results[index] = await worker(items[index], index); } catch (error) { failure ||= error; }
      }
    }));
    if (failure) throw failure;
    return results;
  }

  async function uploadBatch(items, worker) {
    if (!items.length) return [];
    // The first upload creates the Drive folder. Parallel workers only start
    // after that succeeds, avoiding competing folder creation within this batch.
    const first = await worker(items[0], 0);
    return [first, ...await mapLimit(items.slice(1), (item, index) => worker(item, index + 1))];
  }

  function uploadOnce(action, payload, send) {
    const resultField = uploadFields[action];
    if (!resultField) return send(payload);
    if (action === "uploadShippingDefectPhotos" && payload.defectFiles?.length > 1) {
      return uploadBatch(payload.defectFiles, file => uploadOnce(action, { ...payload, defectFiles: [file] }, send))
        .then(results => ({
          folderUrl: [...new Set(results.map(result => result.folderUrl))].join(" "),
          uploadedCount: results.reduce((total, result) => total + Number(result.uploadedCount || 0), 0),
          fileUrls: [...new Set(results.flatMap(result => result.fileUrls || []))]
        }));
    }
    const metadata = { ...payload };
    const ids = [];
    for (const field of ["invoiceFile", "imageFile", "defectFiles"]) {
      const files = Array.isArray(metadata[field]) ? metadata[field] : [metadata[field]].filter(Boolean);
      for (const file of files) {
        if (!fileIds.has(file)) fileIds.set(file, ++nextFileId);
        ids.push(fileIds.get(file));
      }
      delete metadata[field];
    }
    if (!ids.length) return send(payload);
    const key = JSON.stringify([action, metadata, ids]);
    const now = Date.now();
    for (const [oldKey, entry] of uploads) {
      if (entry.completedAt && now - entry.completedAt > 30 * 60 * 1000) uploads.delete(oldKey);
    }
    const existing = uploads.get(key);
    if (existing) return existing.promise;
    const entry = { promise: null, completedAt: 0 };
    entry.promise = Promise.resolve().then(() => send(payload)).then(result => {
      if (!String(result?.[resultField] || "").trim()) throw new Error("첨부 파일 링크를 생성하지 못했습니다.");
      entry.completedAt = Date.now();
      // Retain only URLs/results, never a serialized file, and bound the page cache.
      if (uploads.size > 100) {
        for (const [oldKey, oldEntry] of uploads) {
          if (oldKey !== key && oldEntry.completedAt) { uploads.delete(oldKey); break; }
        }
      }
      return result;
    }).catch(error => { uploads.delete(key); throw error; });
    uploads.set(key, entry);
    return entry.promise;
  }

  window.SeungjinAttachments = { validateImage, readDataUrl, readImage, optimizeInvoice, mapLimit, uploadBatch, uploadOnce };
})();
