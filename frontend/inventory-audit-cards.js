(function (root) {
  function attach(container, { isSaving, confirm }) {
    if (!container) return;
    let dragged = null;
    let origin = null;
    let target = null;
    function clear() {
      dragged?.classList.remove('is-dragging');
      target?.classList.remove('is-drop-target');
      origin?.classList.remove('is-dragging-card');
      dragged = origin = target = null;
    }
    function valid() {
      return dragged?.isConnected && origin?.isConnected && !isSaving()
        && dragged.closest('.inventory-audit-box-section') === origin
        && dragged.matches('.unconfirmed[draggable="true"]');
    }
    container.addEventListener('dragstart', event => {
      const card = event.target.closest('[data-inventory-audit-card].unconfirmed');
      if (!card) return;
      clear();
      if (isSaving() || event.target.closest('button, input, a') || !event.dataTransfer) { event.preventDefault(); return; }
      dragged = card; origin = card.closest('.inventory-audit-box-section');
      target = origin?.querySelector('[data-inventory-audit-drop]');
      if (!target) { event.preventDefault(); clear(); return; }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${card.dataset.inventoryAuditCard}번 박스`);
      origin.classList.add('is-dragging-card');
      // Let the browser capture the full card before dimming its original position.
      requestAnimationFrame(() => { if (dragged === card) card.classList.add('is-dragging'); });
    });
    container.addEventListener('dragover', event => {
      if (!valid()) { clear(); return; }
      const over = target.contains(event.target);
      target.classList.toggle('is-drop-target', over);
      if (over) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
    });
    container.addEventListener('dragleave', event => {
      if (target?.contains(event.target) && !target.contains(event.relatedTarget)) target.classList.remove('is-drop-target');
    });
    container.addEventListener('drop', event => {
      if (!valid() || !target.contains(event.target)) { clear(); return; }
      event.preventDefault();
      const number = Number(dragged.dataset.inventoryAuditCard);
      clear();
      if (Number.isInteger(number) && number > 0) confirm([number]);
    });
    container.addEventListener('dragend', clear);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') clear(); });
  }
  root.InventoryAuditCards = { attach };
})(typeof window === 'undefined' ? globalThis : window);
