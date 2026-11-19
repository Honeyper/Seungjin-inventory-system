(function () {
  function create(root) {
    const reason = root.querySelector('[data-discard-reason]');
    const otherField = root.querySelector('[data-discard-other-field]');
    const other = root.querySelector('[data-discard-other]');

    function update() {
      const isOther = !root.hidden && reason.value === '기타';
      reason.disabled = root.hidden;
      reason.required = !root.hidden;
      otherField.hidden = !isOther;
      other.disabled = !isOther;
    }

    function setEnabled(enabled) {
      root.hidden = !enabled;
      update();
    }

    function reset() {
      reason.value = '';
      other.value = '';
      setEnabled(false);
    }

    reason.addEventListener('change', update);
    reset();

    return {
      reset,
      setEnabled,
      validate() {
        return reason.reportValidity() && other.reportValidity();
      },
      getMemo(memo = '') {
        const detail = reason.value === '기타' ? other.value.trim().replace(/\s+/g, ' ') : '';
        const label = reason.value + (detail ? ` (${detail})` : '');
        return [`폐기 사유: ${label}`, String(memo || '').trim()].filter(Boolean).join('\n');
      }
    };
  }
  window.SeungjinDiscardReason = { create };
})();
