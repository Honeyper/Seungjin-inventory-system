// Shared with the Edge Function; the parity test keeps both deployed copies identical.
(function (root) {
  "use strict";
  const KST_OFFSET = 9 * 60 * 60 * 1000;

  function checkedTime(value) {
    const text = String(value ?? "").trim();
    if (!text || text === "-") return NaN;
    // Database timestamps without an offset are Korean local time, regardless of the browser timezone.
    const local = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?$/);
    if (local) {
      const [, year, month, day, hour = "00", minute = "00", second = "00", fraction = ""] = local;
      const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}Z`);
      if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month)
        || date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return NaN;
      return date.getTime() - KST_OFFSET;
    }
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? Date.parse(text) : NaN;
  }

  function expiresAt(value) {
    const timestamp = checkedTime(value);
    if (!Number.isFinite(timestamp)) return NaN;
    const date = new Date(timestamp + KST_OFFSET);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.getTime() - KST_OFFSET;
  }

  function isEligible(box) {
    const status = String(box?.rawStatus || box?.status || "").replace(/\s+/g, "");
    const quantity = parseFloat(String(box?.quantity ?? "").replace(/,/g, ""));
    return Number.isFinite(quantity) && quantity > 0 && !/출고대기|출고완료|보류|폐기/.test(status);
  }

  function isConfirmed(box, now = Date.now()) {
    const checked = checkedTime(box?.lastInventoryCheckedAt);
    const current = Number(now);
    return isEligible(box) && Number.isFinite(checked) && checked <= current
      && current < expiresAt(box.lastInventoryCheckedAt);
  }

  function withInboundConfirmation(box, inbound) {
    const existing = String(box?.lastInventoryCheckedAt ?? "").trim();
    // A later physical check, including an expired one, always takes precedence.
    if (existing && existing !== "-") return box;
    const date = String(inbound?.inboundDate ?? "").trim();
    const time = String(inbound?.inboundTime ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return box;
    const timestamp = `${date} ${!time || time === "-" ? "00:00:00" : time}`;
    if (!Number.isFinite(checkedTime(timestamp))) return box;
    return { ...box, lastInventoryCheckedAt: timestamp, inventoryConfirmationSource: "inbound" };
  }

  function withInboundConfirmationRow(source) {
    if (!source?.inboundDate) return source;
    const row = { ...source };
    const resolved = new Map();
    for (const field of ["allShippingBoxes", "activeShippingBoxes", "shippedShippingBoxes"]) {
      if (!Array.isArray(source[field])) continue;
      row[field] = source[field].map(box => {
        if (!resolved.has(box)) resolved.set(box, withInboundConfirmation(box, source));
        return resolved.get(box);
      });
    }
    const times = [...resolved.values()].map(box => box.lastInventoryCheckedAt)
      .filter(value => Number.isFinite(checkedTime(value)));
    if (times.length) row.lastInventoryCheckedAt = times.reduce((latest, value) =>
      checkedTime(value) > checkedTime(latest) ? value : latest);
    return row;
  }

  root.SeungjinInventoryConfirmation = Object.freeze({ expiresAt, isEligible, isConfirmed,
    withInboundConfirmation, withInboundConfirmationRow });
})(globalThis);
