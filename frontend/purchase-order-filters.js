(function (root) {
  const columns = [
    [1, 'orderRound', '발주명', 'text'], [2, 'clientName', '거래처명', 'text'],
    [3, 'productName', '제품명', 'text'], [4, 'dates', '발주일 / 납기일', 'dates'],
    [5, 'totalOrderQuantity', '총 발주량', 'number'], [6, 'accumulatedInboundQuantity', '누적 입고량', 'number'],
    [7, 'remainingQuantity', '미입고 수량', 'number'], [8, 'inboundRate', '입고율', 'percent'],
    [9, 'accumulatedShippingQuantity', '누적 출고량', 'number'], [10, 'shippingRate', '출고율', 'percent'],
    [11, 'remainingShippingQuantity', '출고 잔여량', 'number'], [12, 'status', '상태', 'status']
  ];
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  function inRange(value, min, max) {
    if (!min && !max) return true;
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return false;
    return (!min || Number(value) >= Number(min)) && (!max || Number(value) <= Number(max));
  }
  function matches(order, filters) {
    return Object.entries(filters).every(([key, filter]) => {
      if (key === 'dates') {
        return ['startDate', 'endDate'].every(field => {
          const value = String(order[field] || '').slice(0, 10);
          if (field === 'endDate' && filter.undated) return !value;
          return (!filter[field + 'Min'] || (value && value >= filter[field + 'Min']))
            && (!filter[field + 'Max'] || (value && value <= filter[field + 'Max']));
        });
      }
      if (filter.query !== undefined) {
        const value = key === 'orderRound' ? `${order.orderRound || ''} ${order.productId || ''} ${order.purchaseOrderId || ''}` : order[key];
        return normalize(value).includes(normalize(filter.query));
      }
      let value = order[key];
      if ((key === 'inboundRate' || key === 'shippingRate') && value !== null && value !== undefined && value !== '') {
        value = Number(value) * 100;
        value = key === 'inboundRate' ? Math.round(value) : Math.round(value * 10) / 10;
      }
      return inRange(value, filter.min, filter.max);
    });
  }
  function create(table, { onChange, statusSelect, resetButton }) {
    if (!table) return null;
    const filters = {};
    const buttons = new Map();
    const panel = document.createElement('div');
    panel.className = 'purchase-column-filter-panel';
    panel.id = 'purchaseColumnFilterPanel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '발주 열 필터');
    document.body.append(panel);
    let active = null;
    function close(focus = false) {
      if (active) {
        buttons.get(active[1]).setAttribute('aria-expanded', 'false');
        if (focus) buttons.get(active[1]).focus();
      }
      panel.hidden = true;
      active = null;
    }
    function refresh() {
      buttons.forEach((button, key) => {
        const enabled = key === 'status' ? Boolean(statusSelect.value) : Boolean(filters[key]);
        button.classList.toggle('is-filtered', enabled);
        button.setAttribute('aria-label', `${button.dataset.label} 필터${enabled ? ' 적용 중' : ''}`);
      });
    }
    function input(form, name, label, type, value, suffix = '') {
      const wrapper = document.createElement('label');
      wrapper.textContent = label + suffix;
      const el = document.createElement('input');
      el.name = name; el.type = type; el.value = value || '';
      if (type === 'number') { el.min = '0'; el.step = 'any'; }
      wrapper.append(el); form.append(wrapper); return el;
    }
    function open(column) {
      if (active?.[1] === column[1]) { close(true); return; }
      close(); active = column;
      const [, key, label, type] = column;
      const current = filters[key] || {};
      panel.replaceChildren();
      const title = document.createElement('strong'); title.textContent = label + ' 필터'; panel.append(title);
      const form = document.createElement('form'); panel.append(form);
      if (type === 'text') input(form, 'query', key === 'orderRound' ? '발주명 / 제품 ID / 발주 ID 검색' : '포함된 단어', 'search', current.query);
      else if (type === 'dates') {
        input(form, 'startDateMin', '발주일 시작', 'date', current.startDateMin);
        input(form, 'startDateMax', '발주일 종료', 'date', current.startDateMax);
        const a = input(form, 'endDateMin', '납기일 시작', 'date', current.endDateMin);
        const b = input(form, 'endDateMax', '납기일 종료', 'date', current.endDateMax);
        const check = input(form, 'undated', '납기 미정만', 'checkbox', ''); check.checked = Boolean(current.undated);
        const sync = () => { a.disabled = b.disabled = check.checked; };
        check.addEventListener('change', sync); sync();
      } else if (type === 'status') {
        const labelEl = document.createElement('label'); labelEl.textContent = '발주 상태';
        const select = statusSelect.cloneNode(true); select.removeAttribute('id'); select.name = 'status'; select.value = statusSelect.value;
        labelEl.append(select); form.append(labelEl);
      } else {
        const unit = type === 'percent' ? ' (%)' : ' (ea)';
        input(form, 'min', '최소', 'number', current.min, unit);
        input(form, 'max', '최대', 'number', current.max, unit);
      }
      const error = document.createElement('p'); error.className = 'purchase-filter-error'; error.setAttribute('role', 'alert'); form.append(error);
      const actions = document.createElement('div'); actions.className = 'purchase-filter-actions'; form.append(actions);
      for (const [text, action] of [['해제', 'clear'], ['닫기', 'close'], ['적용', 'apply']]) {
        const button = document.createElement('button'); button.textContent = text; button.type = action === 'apply' ? 'submit' : 'button'; actions.append(button);
        if (action === 'close') button.onclick = () => close(true);
        if (action === 'clear') button.onclick = () => {
          if (key === 'status') statusSelect.value = ''; else delete filters[key];
          close(true); refresh(); onChange();
        };
      }
      form.onsubmit = event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const pairs = type === 'dates' ? [['startDateMin', 'startDateMax'], ['endDateMin', 'endDateMax']] : [['min', 'max']];
        if (pairs.some(([a, b]) => data[a] && data[b] && (type === 'dates' ? data[a] > data[b] : Number(data[a]) > Number(data[b])))) {
          error.textContent = '시작값은 종료값보다 클 수 없습니다.'; return;
        }
        if (key === 'status') statusSelect.value = data.status;
        else if (Object.values(data).some(v => String(v).trim())) filters[key] = data;
        else delete filters[key];
        close(true); refresh(); onChange();
      };
      panel.hidden = false;
      const button = buttons.get(key); button.setAttribute('aria-expanded', 'true');
      const rect = button.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 8))}px`;
      form.querySelector('input, select')?.focus();
    }
    columns.forEach(column => {
      const [index, key, label] = column;
      const th = table.tHead.rows[0].cells[index];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'purchase-column-filter-button';
      button.dataset.label = label; button.dataset.filterKey = key;
      button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', panel.id);
      button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg>';
      button.onclick = () => open(column); th.append(button); buttons.set(key, button);
    });
    document.addEventListener('pointerdown', e => { if (!panel.contains(e.target) && !e.target.closest('.purchase-column-filter-button')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && active) { e.preventDefault(); close(true); } });
    window.addEventListener('resize', () => close());
    table.closest('.table-scroll')?.addEventListener('scroll', () => close());
    statusSelect.addEventListener('change', refresh);
    resetButton?.addEventListener('click', () => {
      Object.keys(filters).forEach(key => delete filters[key]); close(); refresh();
    });
    refresh();
    return { matches: order => matches(order, filters), refresh };
  }
  root.PurchaseOrderFilters = { matches, create };
})(typeof window === 'undefined' ? globalThis : window);
