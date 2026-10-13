(function (root) {
  const number = value => {
    if (value === null || value === undefined || value === "" || value === "-") return null;
    const parsed = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  function calculate({orderQuantity, hourlyRate, workHours = 8}) {
    const order = number(orderQuantity), rate = number(hourlyRate), hours = number(workHours);
    const validRate = rate > 0 ? rate : null;
    const target = order !== null && validRate !== null && hours > 0 ? Math.min(order, Math.floor(validRate * hours + 1e-7)) : null;
    return {orderQuantity:order,hourlyRate:validRate,targetQuantity:target,
      hours:target !== null ? target / validRate : null,
      totalHours:order !== null && validRate !== null ? order / validRate : null};
  }
  root.SeungjinProductionPlanner = {number,calculate};
})(typeof window === "undefined" ? globalThis : window);
