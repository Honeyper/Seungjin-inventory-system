/* Shared by PC and mobile. Product names are shipment snapshots, never stock IDs. */
(function (root) {
  "use strict";
  const text = value => String(value ?? "").trim();
  const escape = value => text(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const format = value => Number(value || 0).toLocaleString("ko-KR");
  let queue = Promise.resolve();
  let cancelRevision = 0;

  function info(product = {}) {
    const flag = product.isCommonContainer ?? product.commonContainerProduct ?? product["공용용기 제품"];
    let names = product.shippingProductNames ?? product["출고시 제품명 목록"] ?? [];
    if (typeof names === "string") {
      try { names = JSON.parse(names); } catch { names = names.split(/\n|\|/); }
    }
    return {
      enabled: flag === true || ["true", "유", "예", "1"].includes(text(flag).toLowerCase()),
      names: Array.isArray(names) ? [...new Set(names.map(text).filter(Boolean))] : []
    };
  }

  function allocationError(box, products, names) {
    const seen = new Set();
    let total = 0;
    for (const item of products) {
      if (!names.includes(item.productName)) return `${box.number}번 박스의 출고 제품을 선택해주세요.`;
      if (seen.has(item.productName)) return `${box.number}번 박스에 같은 제품이 중복되었습니다.`;
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) return `${box.number}번 박스의 수량을 확인해주세요.`;
      seen.add(item.productName);
      total += item.quantity;
    }
    return total === box.quantity ? "" : `${box.number}번 박스: ${format(box.quantity - total)} ea를 조정해주세요.`;
  }

  function choose(product, names, boxes, payload) {
    return new Promise((resolve, reject) => {
      const previousFocus = document.activeElement;
      const dialog = document.createElement("dialog");
      dialog.className = "common-shipping-dialog";
      dialog.setAttribute("aria-labelledby", "commonShippingTitle");
      const drafts = boxes.map(box => ({
        boxId: box.boxId, number: box.number,
        products: box.shippingAllocations?.length
          ? box.shippingAllocations.map(item => ({ ...item }))
          : [{ productName: "", quantity: box.quantity }]
      }));
      const options = selected => '<option value="">제품 선택</option>' + names.map(name => `<option value="${escape(name)}" ${name === selected ? "selected" : ""}>${escape(name)}</option>`).join("");
      dialog.innerHTML = `
        <form class="common-shipping-form">
          <header><div><span>공용용기 출고</span><h2 id="commonShippingTitle">실제 출고 제품 지정</h2></div><button type="button" data-cancel aria-label="출고 제품 지정 닫기">×</button></header>
          <div class="common-shipping-body">
            <div class="common-shipping-source"><strong>${escape(product.productName || payload.productName)}</strong><span>${escape(payload.managementId)} · ${boxes.length} box · ${format(boxes.reduce((sum, box) => sum + box.quantity, 0))} ea</span></div>
            <div class="common-shipping-bulk"><label>전체 박스에 같은 제품 지정<select data-bulk aria-label="전체 박스 출고 제품">${options("")}</select></label><button type="button" data-apply>전체 적용</button></div>
            <div data-boxes></div>
          </div>
          <footer><p role="status" aria-live="polite" data-summary></p><p role="alert" data-error></p><div><button type="button" data-cancel>취소</button><button type="submit" class="common-shipping-submit">지정 완료 · 출고 진행</button></div></footer>
        </form>`;
      const boxList = dialog.querySelector("[data-boxes]");
      function render() {
        boxList.innerHTML = drafts.map((draft, index) => `<section class="common-shipping-box" data-box="${index}">
          <div class="common-shipping-box-heading"><strong>${draft.number}번 박스</strong><span>${format(boxes[index].quantity)} ea</span></div>
          <div>${draft.products.map((item, line) => `<div class="common-shipping-line" data-line="${line}">
            <label><span>출고 제품</span><select data-name aria-label="${draft.number}번 박스 출고 제품 ${line + 1}">${options(item.productName)}</select></label>
            <label><span>수량 (ea)</span><input data-quantity type="number" min="1" step="1" inputmode="numeric" value="${escape(item.quantity)}" aria-label="${draft.number}번 박스 ${line + 1} 제품 수량"></label>
            <button type="button" data-remove ${draft.products.length === 1 ? "disabled" : ""} aria-label="${draft.number}번 박스 제품 ${line + 1} 삭제">×</button>
          </div>`).join("")}</div><button type="button" data-add ${draft.products.length >= names.length ? "disabled" : ""}>+ 다른 제품 나누기</button>
        </section>`).join("");
        updateSummary();
      }
      function updateSummary() {
        const error = drafts.map((draft, index) => allocationError(boxes[index], draft.products, names)).find(Boolean);
        const count = drafts.filter((draft, index) => !allocationError(boxes[index], draft.products, names)).length;
        dialog.querySelector("[data-summary]").textContent = `${count} / ${boxes.length}개 박스 지정 완료`;
        dialog.querySelector("[data-error]").textContent = error || "";
        dialog.querySelector('[type="submit"]').disabled = Boolean(error);
      }
      function finish(value) {
        dialog.close();
        dialog.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
        if (value) resolve(value);
        else { cancelRevision += 1; reject(new Error("공용용기 출고를 취소했습니다.")); }
      }
      dialog.addEventListener("cancel", event => { event.preventDefault(); event.stopPropagation(); finish(null); });
      dialog.addEventListener("keydown", event => {
        // The parent confirmation modal must remain open when this dialog is cancelled.
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(null); }
      });
      dialog.addEventListener("click", event => {
        if (event.target.closest("[data-cancel]")) return finish(null);
        if (event.target.closest("[data-apply]")) {
          const selected = dialog.querySelector("[data-bulk]").value;
          if (!selected) return;
          drafts.forEach((draft, index) => { draft.products = [{ productName: selected, quantity: boxes[index].quantity }]; });
          render();
          return;
        }
        const section = event.target.closest("[data-box]");
        if (!section) return;
        const draft = drafts[Number(section.dataset.box)];
        if (event.target.closest("[data-add]")) {
          draft.products.push({ productName: "", quantity: "" });
          render();
        } else if (event.target.closest("[data-remove]") && draft.products.length > 1) {
          draft.products.splice(Number(event.target.closest("[data-line]").dataset.line), 1);
          render();
        }
      });
      dialog.addEventListener("input", event => {
        const section = event.target.closest("[data-box]");
        const line = event.target.closest("[data-line]");
        if (!section || !line) return;
        const item = drafts[Number(section.dataset.box)].products[Number(line.dataset.line)];
        if (event.target.matches("[data-name]")) item.productName = event.target.value;
        if (event.target.matches("[data-quantity]")) item.quantity = Number(event.target.value);
        updateSummary();
      });
      dialog.querySelector("form").addEventListener("submit", event => {
        event.preventDefault();
        if (drafts.some((draft, index) => allocationError(boxes[index], draft.products, names))) return;
        finish(drafts);
      });
      document.body.append(dialog);
      render();
      dialog.showModal();
      dialog.querySelector("[data-bulk]").focus();
    });
  }

  async function prepare(action, payload, request) {
    if (action !== "updateShippingStatus" || payload.status !== "출고완료"
      || (payload.shippingType || payload["출고유형"] || "정상출고") !== "정상출고"
      || payload.shippingAllocations !== undefined) return payload;
    const revision = cancelRevision;
    const result = await request("getCommonContainerShipping", { managementId: payload.managementId, productId: payload.productId });
    const product = result.product;
    if (!product) throw new Error("출고할 제품 정보를 다시 불러와주세요.");
    const { enabled, names } = info(product);
    if (!enabled) return payload;
    if (!names.length) throw new Error("제품 관리에서 공용용기의 출고 제품명을 먼저 등록해주세요.");
    const next = queue.catch(() => {}).then(async () => {
      if (revision !== cancelRevision) throw new Error("공용용기 출고를 취소했습니다.");
      const ids = new Set((payload.selectedBoxIds || []).map(text));
      const numbers = new Set((payload.selectedBoxes || []).map(Number));
      const boxes = (result.boxes || []).filter(box => ids.has(text(box.boxId)) || numbers.has(Number(box.number)))
        .map(box => ({ ...box, quantity: Number(box.quantity), number: Number(box.number) }));
      if (!boxes.length || boxes.some(box => /출고완료|폐기/.test(box.rawStatus || box.status))) throw new Error("출고 대상 박스의 상태가 변경되었습니다. 목록을 새로고침해주세요.");
      const quantityMap = payload.boxQuantities || payload.selectedBoxQuantities || {};
      if (boxes.some(box => quantityMap[box.number] !== undefined && Number(quantityMap[box.number]) !== box.quantity)) {
        throw new Error("공용용기는 현재 박스 수량 전체를 제품별로 나눠 출고해주세요. 최신 수량으로 다시 선택해주세요.");
      }
      return { ...payload, shippingAllocations: await choose(product, names, boxes, payload) };
    });
    queue = next;
    return next;
  }

  function summary(boxes = []) {
    const totals = new Map();
    boxes.forEach(box => (box.shippingAllocations || []).forEach(item => {
      totals.set(item.productName, (totals.get(item.productName) || 0) + Number(item.quantity || 0));
    }));
    return [...totals].map(([name, quantity]) => `${name} · ${format(quantity)} ea`).join(" / ");
  }
  root.SeungjinCommonShipping = { prepare, summary, info, allocationError };
})(typeof window !== "undefined" ? window : globalThis);
