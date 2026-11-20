(function () {
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function previousDate(value) {
    if (!validDate(value)) throw new Error('기준일을 확인해주세요.');
    return new Date(Date.parse(`${value}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  }

  function key(prefix, job) {
    const type = String(job.process || '').replace(/\s/g, '');
    const process = ['실크', '실크인쇄', '자동화'].includes(type) ? '실크인쇄' : type;
    const stages = [...new Set((job.stageGroup?.length ? job.stageGroup : [job.stage]).map(Number))].sort((a,b) => a-b);
    if (!job.purchaseOrderId || !job.productId || !process || !stages.length
      || stages.some(stage => !Number.isInteger(stage) || stage < 1)) throw new Error('발주와 작업 공정을 먼저 선택해주세요.');
    return `${prefix}:baseline:${JSON.stringify([job.purchaseOrderId, job.productId, process, stages])}`;
  }

  function entries(storage, prefix, job) {
    const raw = storage.getItem(key(prefix, job));
    if (raw === null) return [];
    let saved;
    try { saved = JSON.parse(raw); } catch (_error) { throw new Error('기존 생산량 기록을 읽을 수 없습니다.'); }
    if (saved?.version !== 1 || !Array.isArray(saved.entries) || saved.entries.some(entry =>
      !validDate(entry?.date) || !Number.isSafeInteger(entry.quantity) || entry.quantity < 0)
      || new Set(saved.entries.map(entry => entry.date)).size !== saved.entries.length) {
      throw new Error('기존 생산량 기록을 확인해주세요.');
    }
    return [...saved.entries].sort((a,b) => a.date.localeCompare(b.date));
  }

  function read(storage, prefix, job, date) {
    if (!validDate(date)) throw new Error('조회 날짜를 확인해주세요.');
    return entries(storage, prefix, job).filter(entry => entry.date <= date).at(-1) || null;
  }

  function write(storage, prefix, job, values) {
    const storageKey = key(prefix, job);
    const raw = JSON.stringify({version: 1, entries: values});
    storage.setItem(storageKey, raw);
    if (storage.getItem(storageKey) !== raw) throw new Error('기존 생산량을 저장하지 못했습니다.');
  }

  function save(storage, prefix, job, date, quantity) {
    if (!validDate(date)) throw new Error('기준일을 확인해주세요.');
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('생산량을 0 이상의 정수로 입력해주세요.');
    const values = entries(storage, prefix, job).filter(entry => entry.date !== date);
    values.push({date, quantity});
    values.sort((a,b) => a.date.localeCompare(b.date));
    write(storage, prefix, job, values);
  }

  function remove(storage, prefix, job, date) {
    write(storage, prefix, job, entries(storage, prefix, job).filter(entry => entry.date !== date));
  }

  function createDialog({readValue, saveValue, removeValue, onChanged, focusDialog}) {
    const modal = document.querySelector('#productionPlanBaselineModal');
    const form = modal.querySelector('form');
    const date = form.elements.namedItem('baselineDate');
    const quantity = form.elements.namedItem('baselineQuantity');
    const message = modal.querySelector('[data-message]');
    const removeButton = modal.querySelector('[data-remove]');
    let context = null;
    let returnFocus = null;
    function close() {
      modal.hidden = true;
      context = null;
      if (!document.querySelector('.modal-backdrop:not([hidden])')) document.body.classList.remove('modal-open');
      if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
    }
    function open(job, planDate, label) {
      const maxDate = planDate;
      const defaultDate = previousDate(planDate);
      let existing;
      try { existing = readValue(job, maxDate); }
      catch (error) { return {error: error.message}; }
      context = {job: {...job, stageGroup: job.stageGroup ? [...job.stageGroup] : undefined}, existing};
      returnFocus = document.activeElement;
      form.reset();
      date.max = maxDate;
      date.value = existing?.date || defaultDate;
      quantity.value = existing ? String(existing.quantity) : '';
      removeButton.hidden = !existing;
      message.textContent = '';
      modal.querySelector('[data-target]').textContent = label;
      modal.querySelector('[data-date-hint]').textContent = `기준일은 선택한 계획일(${maxDate})까지 입력할 수 있습니다.`;
      modal.hidden = false;
      document.body.classList.add('modal-open');
      focusDialog(modal);
      return {opened: true};
    }
    modal.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!context || !form.reportValidity()) return;
      const value = quantity.value.trim() === '' ? NaN : Number(quantity.value);
      if (!validDate(date.value) || date.value > date.max || !Number.isSafeInteger(value) || value < 0) {
        message.textContent = '기준일과 0 이상의 정수 수량을 확인해주세요.';
        return;
      }
      try { saveValue(context.job, date.value, value); }
      catch (error) { message.textContent = error.name === 'QuotaExceededError' ? '저장 공간이 부족합니다. 입력은 유지되므로 저장 공간을 확인한 뒤 다시 시도해주세요.' : error.name === 'SecurityError' ? '브라우저에서 저장을 차단하고 있습니다. 이 사이트의 저장 권한을 확인해주세요.' : error.message || '기존 생산량을 저장하지 못했습니다.'; return; }
      const job = context.job;
      close();
      onChanged(job, false);
    });
    removeButton.addEventListener('click', () => {
      if (!context?.existing || !window.confirm(`${context.existing.date}까지의 기존 생산량 입력을 삭제할까요? 일별 생산 기록은 그대로 보존됩니다.`)) return;
      try { removeValue(context.job, context.existing.date); }
      catch (error) { message.textContent = error.message || '기존 입력을 삭제하지 못했습니다.'; return; }
      const job = context.job;
      close();
      onChanged(job, true);
    });
    return {open, close};
  }
  window.SeungjinProductionBaseline = {key, validDate, previousDate, entries, read, save, remove, createDialog};
})();
