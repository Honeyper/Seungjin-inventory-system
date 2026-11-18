(function () {
  function create({ request, parseQuantity, userName, onSaved, printLabels }) {
    const modal = document.querySelector('#additionalProductionModal');
    const form = modal.querySelector('form');
    const fields = form.querySelector('fieldset');
    const message = modal.querySelector('[data-message]');
    const boxes = modal.querySelector('[data-boxes]');
    const boxCount = form.elements.namedItem('boxCount');
    const save = modal.querySelector('[type="submit"]');
    const closeButtons = modal.querySelectorAll('[data-close]');
    let context = null;
    let saving = false;

    function quantities() {
      return Array.from(boxes.querySelectorAll('input'), input => Number(input.value));
    }

    function updateSummary() {
      const total = quantities().reduce((sum, quantity) => sum + quantity, 0);
      modal.querySelector('[data-summary]').textContent =
        `추가 ${boxes.children.length}박스 · 합계 ${total.toLocaleString('ko-KR')} ea`;
    }

    function syncBoxes() {
      const count = Number(boxCount.value);
      if (!Number.isInteger(count) || count < 1 || count > 100) return;
      while (boxes.children.length > count) boxes.lastElementChild.remove();
      const previous = boxes.lastElementChild?.querySelector('input');
      const defaultQuantity = previous?.value || parseQuantity(context?.inbound.boxQuantity) || '';
      while (boxes.children.length < count) {
        const number = boxes.children.length + 1;
        const label = document.createElement('label');
        label.className = 'form-field additional-production-box';
        label.innerHTML = `<span>추가 ${number}박스 수량</span><span class="unit-input"><input type="number" min="1" step="1" required aria-label="추가 ${number}박스 수량"><i>ea</i></span>`;
        label.querySelector('input').value = defaultQuantity;
        boxes.append(label);
      }
      updateSummary();
    }

    function close() {
      if (saving) return;
      modal.hidden = true;
      context = null;
      if (!Array.from(document.querySelectorAll('.modal-backdrop')).some(element => !element.hidden)) {
        document.body.classList.remove('modal-open');
      }
    }

    function open(inbound) {
      if (saving || !modal.hidden) return;
      context = { inbound, requestId: crypto.randomUUID() };
      form.reset();
      fields.disabled = false;
      save.disabled = false;
      message.textContent = '';
      modal.querySelector('[data-target]').textContent = `${inbound.productName} · ${inbound.managementId}`;
      boxes.innerHTML = '';
      syncBoxes();
      modal.hidden = false;
      document.body.classList.add('modal-open');
      boxCount.focus();
    }

    closeButtons.forEach(button => button.addEventListener('click', close));
    modal.addEventListener('click', event => {
      if (event.target === modal) close();
    });
    boxCount.addEventListener('input', syncBoxes);
    form.addEventListener('input', updateSummary);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving || !context) return;
      syncBoxes();
      const boxQuantities = quantities();
      if (!form.reportValidity() || boxQuantities.length !== Number(boxCount.value)
        || boxQuantities.some(quantity => !Number.isSafeInteger(quantity) || quantity <= 0)) {
        message.textContent = '박스 수와 각 박스의 수량을 1 이상의 정수로 입력해주세요.';
        return;
      }

      const active = context;
      const payload = {
        managementId: active.inbound.managementId,
        productId: active.inbound.productId,
        requestId: active.requestId,
        registrationMode: 'boxes-only',
        boxQuantities,
        userName
      };
      saving = true;
      fields.disabled = true;
      save.disabled = true;
      closeButtons.forEach(button => { button.disabled = true; });
      message.textContent = '추가 박스를 등록하는 중입니다.';
      let result;
      try {
        result = await request('registerAdditionalProduction', payload);
      } catch (error) {
        message.textContent = error.message || '등록하지 못했습니다. 같은 내용으로 다시 시도해주세요.';
      } finally {
        saving = false;
        fields.disabled = false;
        save.disabled = false;
        closeButtons.forEach(button => { button.disabled = false; });
      }
      if (!result) return;
      // Retain the registered box IDs so label reads never repeat the write.
      close();
      onSaved(result);
      await printLabels(active.inbound.managementId, active.inbound.productId, result.boxIds);
    });
    return { open, close };
  }
  window.SeungjinAdditionalProduction = { create };
})();
