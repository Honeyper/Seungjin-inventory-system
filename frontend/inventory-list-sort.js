(function (root) {
  const columns = [
    [1, 'inboundDate', '입고일'], [2, 'managementId', '관리ID'],
    [3, 'clientName', '거래처명'], [4, 'productName', '제품명'],
    [5, 'batch', '차수'], [6, 'purchaseOrderRound', '발주명'],
    [7, 'finalProcess', '최종공정'], [8, 'currentBoxCount', '현재 박스 수'],
    [9, 'currentTotalQuantity', '현재 총 수량 (EA)'], [10, 'storage', '보관 위치'],
    [11, 'processStatus', '공정 상태'], [12, 'dueDate', '납기일']
  ];
  const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });
  const numericKeys = new Set(['currentBoxCount', 'currentTotalQuantity']);
  const dateKeys = new Set(['inboundDate', 'dueDate']);
  const text = value => {
    const result = String(value ?? '').normalize('NFKC').trim();
    return result === '-' ? '' : result;
  };
  const compareText = (a, b) => !a ? (b ? 1 : 0) : !b ? -1 : collator.compare(a, b);
  function value(row, key) {
    let result = text(row[key]);
    if (!result) return null;
    if (numericKeys.has(key)) {
      const match = result.replace(/,/g, '').match(/^-?\d+(?:\.\d+)?(?:\s*(?:ea|box))?$/i);
      return match && Number.isFinite(parseFloat(match[0])) ? parseFloat(match[0]) : null;
    }
    if (dateKeys.has(key)) {
      const match = result.match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})(?:$|[.T\s])/);
      if (!match) return null;
      const [year, month, day] = match.slice(1).map(Number);
      const stamp = Date.UTC(year, month - 1, day), date = new Date(stamp);
      return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? stamp : null;
    }
    if (key === 'clientName') result = result.replace(/주식회사|\(\s*주\s*\)/g, '').trim();
    if (key === 'processStatus' && result === '일부 출고') result = '부분출고';
    return result || null;
  }
  function sort(rows, key = 'inboundDate', direction = 'desc') {
    if (!columns.some(column => column[1] === key)) { key = 'inboundDate'; direction = 'desc'; }
    return rows.map(row => ({ row, value: value(row, key) })).sort((a, b) => {
      let comparison = 0;
      if (a.value === null && b.value !== null) return 1;
      if (b.value === null && a.value !== null) return -1;
      if (a.value !== null && b.value !== null) {
        comparison = numericKeys.has(key) || dateKeys.has(key) ? a.value - b.value : collator.compare(a.value, b.value);
      }
      return comparison * (direction === 'asc' ? 1 : -1)
        || compareText(text(a.row.managementId), text(b.row.managementId))
        || compareText(text(a.row.productId), text(b.row.productId))
        || compareText(text(a.row.storage), text(b.row.storage));
    }).map(entry => entry.row);
  }
  function create(table, { onChange, hint } = {}) {
    if (!table?.tHead) return null;
    let key = 'inboundDate', direction = 'desc';
    const buttons = [];
    function refresh() {
      buttons.forEach(({button, arrow, field, label, th}) => {
        const active = field === key;
        const order = direction === 'asc' ? '오름차순' : '내림차순';
        th.removeAttribute('aria-sort');
        button.classList.toggle('is-sorted', active);
        arrow.textContent = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
        button.setAttribute('aria-label', `${label}, ${active ? order + ' 정렬 중, ' : ''}클릭하여 ${active && direction === 'asc' ? '내림차순' : '오름차순'} 정렬`);
        if (active) th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
      });
      const label = columns.find(column => column[1] === key)[2];
      if (hint) hint.textContent = `${label} ${direction === 'asc' ? '오름차순' : '내림차순'} · 같은 값은 관리 ID순 · 열 제목을 클릭해 정렬하세요.`;
    }
    columns.forEach(([index, field, label]) => {
      const th = table.tHead.rows[0].cells[index];
      if (!th) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'inventory-column-sort-button';
      button.append(document.createTextNode(label));
      const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden','true'); button.append(arrow);
      button.addEventListener('click', () => {
        direction = key === field && direction === 'asc' ? 'desc' : 'asc';
        key = field; refresh(); onChange?.();
      });
      th.replaceChildren(button); buttons.push({button,arrow,field,label,th});
    });
    refresh();
    return { sort: rows => sort(rows, key, direction) };
  }
  root.InventoryListSort = { sort, create };
})(typeof window === 'undefined' ? globalThis : window);
