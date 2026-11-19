(function () {
  function getBoxes(inbound, normalizeStatus, parseQuantity) {
    const source = inbound?.allShippingBoxes?.length ? inbound.allShippingBoxes : inbound?.activeShippingBoxes || [];
    return source.filter(box => !/출고완료|폐기/.test(normalizeStatus(box.rawStatus || box.status)))
      .map(box => ({ ...box, number: Number(box.number), quantity: parseQuantity(box.quantity) }))
      .filter(box => Number.isInteger(box.number) && box.number > 0 && box.quantity >= 0)
      .sort((a, b) => a.number - b.number);
  }

  function create({ request, userName, date, time, normalizeStatus, parseQuantity, onSaved, focusDialog }) {
    const modal = document.querySelector('#inventoryDiscardModal');
    const form = modal.querySelector('form');
    const fields = modal.querySelector('fieldset');
    const boxList = modal.querySelector('[data-boxes]');
    const selectAll = modal.querySelector('[data-select-all]');
    const summary = modal.querySelector('[data-summary]');
    const message = modal.querySelector('[data-message]');
    const submit = modal.querySelector('[type="submit"]');
    const closeButtons = modal.querySelectorAll('[data-close]');
    const reason = window.SeungjinDiscardReason.create(modal.querySelector('[data-reason-fields]'));
    let context = null;
    let saving = false;
    let returnFocus = null;

    function selectedBoxes() {
      return Array.from(boxList.querySelectorAll('input:checked'), input => context.boxes[Number(input.value)]);
    }

    function updateSummary() {
      const selected = selectedBoxes();
      summary.textContent = `${selected.length.toLocaleString('ko-KR')}박스 · ${selected.reduce((sum, box) => sum + box.quantity, 0).toLocaleString('ko-KR')} ea 선택`;
      selectAll.checked = selected.length === context.boxes.length;
      selectAll.indeterminate = selected.length > 0 && !selectAll.checked;
      submit.disabled = saving || !selected.length;
    }

    function close() {
      if (saving) return;
      modal.hidden = true;
      context = null;
      if (!document.querySelector('.modal-backdrop:not([hidden])')) document.body.classList.remove('modal-open');
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }

    function open(inbound) {
      if (saving || !modal.hidden) return false;
      const boxes = getBoxes(inbound, normalizeStatus, parseQuantity);
      if (!boxes.length) return false;
      returnFocus = document.activeElement;
      context = { inbound, boxes };
      form.reset();
      fields.disabled = false;
      reason.reset();
      reason.setEnabled(true);
      message.textContent = '';
      modal.querySelector('[data-target]').textContent = `${inbound.productName} · ${inbound.managementId}`;
      boxList.replaceChildren();
      boxes.forEach((box, index) => {
        const label = document.createElement('label');
        label.className = 'inventory-discard-box';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = String(index);
        input.setAttribute('aria-label', `${box.number}번 박스 폐기 선택`);
        const text = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = `${box.number}번 박스 · ${box.quantity.toLocaleString('ko-KR')} ea`;
        const detail = document.createElement('small');
        detail.textContent = `${box.storage || inbound.storage || '미지정'} · ${normalizeStatus(box.rawStatus || box.status)}`;
        text.append(title, detail);
        label.append(input, text);
        boxList.append(label);
      });
      updateSummary();
      modal.hidden = false;
      modal.querySelector('.product-modal').scrollTop = 0;
      document.body.classList.add('modal-open');
      focusDialog(modal);
      return true;
    }

    closeButtons.forEach(button => button.addEventListener('click', close));
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    boxList.addEventListener('change', updateSummary);
    selectAll.addEventListener('change', () => {
      boxList.querySelectorAll('input').forEach(input => { input.checked = selectAll.checked; });
      updateSummary();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving || !context) return;
      const selected = selectedBoxes();
      if (!selected.length || !reason.validate()) return;
      const inbound = context.inbound;
      const quantity = selected.reduce((sum, box) => sum + box.quantity, 0);
      const payload = {
        managementId: inbound.managementId, productId: inbound.productId,
        clientName: inbound.clientName, productName: inbound.productName,
        batch: inbound.batch, finalProcess: inbound.finalProcess,
        inspector: userName, inspectionDate: date(), inspectionTime: time(),
        inspectionQuantity: quantity, defectQuantity: quantity,
        defectReasons: ['박스 폐기'], discardRequested: true,
        memo: reason.getMemo('재고관리에서 박스 폐기'),
        selectedBoxes: selected.map(box => box.number),
        selectedBoxIds: selected.map(box => box.boxId).filter(Boolean)
      };
      saving = true;
      fields.disabled = true;
      submit.disabled = true;
      closeButtons.forEach(button => { button.disabled = true; });
      submit.textContent = '폐기 중';
      message.textContent = '';
      let result;
      try {
        // Keep the server's current quantity for restoration; do not overwrite it with a list snapshot.
        result = await request('saveShippingInspection', payload);
      } catch (error) {
        message.textContent = error.message || '박스 폐기를 저장하지 못했습니다.';
        return;
      } finally {
        saving = false;
        fields.disabled = false;
        closeButtons.forEach(button => { button.disabled = false; });
        submit.textContent = '선택 박스 폐기';
        updateSummary();
      }
      close();
      onSaved(inbound, result);
    });
    return { open, close };
  }
  window.SeungjinInventoryDiscard = { create, getBoxes };
})();
