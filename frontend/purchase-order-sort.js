(function (root) {
  const columns = [
    [1, 'orderRound', '발주명'], [2, 'clientName', '거래처명'], [3, 'productName', '제품명'],
    [4, 'startDate', '발주일'], [4, 'endDate', '납기일'],
    [5, 'totalOrderQuantity', '총 발주량'], [6, 'accumulatedInboundQuantity', '누적 입고량'],
    [7, 'remainingQuantity', '미입고 수량'], [8, 'inboundRate', '입고율'],
    [9, 'accumulatedShippingQuantity', '누적 출고량'], [10, 'shippingRate', '출고율'],
    [11, 'remainingShippingQuantity', '출고 잔여량'], [12, 'status', '상태']
  ];
  const numericKeys = new Set(['totalOrderQuantity', 'accumulatedInboundQuantity', 'remainingQuantity', 'inboundRate', 'accumulatedShippingQuantity', 'shippingRate', 'remainingShippingQuantity']);
  const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
  function sort(orders, key, direction = 'asc', getStatus = order => order.status) {
    if (!columns.some(column => column[1] === key)) return [...orders];
    const value = order => {
      let result = key === 'status' ? getStatus(order) : order[key];
      if (result === null || result === undefined || String(result).trim() === '') return null;
      if (numericKeys.has(key)) return Number.isFinite(Number(result)) ? Number(result) : null;
      if (key === 'status' && result === '임의 완료') result = '발주 완료';
      return String(result).trim();
    };
    return orders.map((order, index) => ({ order, index, value: value(order) })).sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const comparison = numericKeys.has(key) ? a.value - b.value : collator.compare(a.value, b.value);
      return comparison ? comparison * (direction === 'desc' ? -1 : 1) : a.index - b.index;
    }).map(item => item.order);
  }
  function create(table, { onChange, getStatus }) {
    if (!table) return null;
    let key = '', direction = 'asc';
    const buttons = [];
    const headers = [...table.tHead.rows[0].cells];
    const prepared = new Set();
    function refresh() {
      headers.forEach(th => th.removeAttribute('aria-sort'));
      buttons.forEach(({ button, arrow, field, label, th }) => {
        const active = field === key;
        button.classList.toggle('is-sorted', active);
        arrow.textContent = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
        button.setAttribute('aria-label', `${label}, ${active ? (direction === 'asc' ? '오름차순 정렬 중, 내림차순으로 정렬' : '내림차순 정렬 중, 오름차순으로 정렬') : '오름차순으로 정렬'}`);
        if (active) th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
      });
    }
    columns.forEach(([index, field, label]) => {
      const th = headers[index];
      if (!prepared.has(index)) { th.replaceChildren(); prepared.add(index); }
      else th.append(document.createTextNode(' / '));
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'purchase-column-sort-button'; button.dataset.sortKey = field;
      button.append(document.createTextNode(label));
      const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); button.append(arrow);
      button.addEventListener('click', () => {
        direction = key === field && direction === 'asc' ? 'desc' : 'asc';
        key = field; refresh(); onChange();
      });
      th.append(button); buttons.push({button, arrow, field, label, th});
    });
    refresh();
    return {
      sort: orders => sort(orders, key, direction, getStatus),
      reset: () => { key = ''; direction = 'asc'; refresh(); }
    };
  }
  root.PurchaseOrderSort = { sort, create };
})(typeof window === 'undefined' ? globalThis : window);
