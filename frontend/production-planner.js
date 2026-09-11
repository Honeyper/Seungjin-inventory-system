(function (root) {
  const number = (value) => {
    if (value === null || value === undefined || value === "" || value === "-") return null;
    const parsed = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  function datesBetween(start, end, holidays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(end || "")) return [];
    const dates = [];
    const cursor = new Date(`${start}T12:00:00Z`);
    for (let index = 0; index < 366 && cursor.toISOString().slice(0, 10) <= end; index++) {
      const date = cursor.toISOString().slice(0, 10);
      dates.push({ date, holiday: [0, 6].includes(cursor.getUTCDay()) || holidays.has(date) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }
  function calculate({ orderQuantity, cumulativeProduction, cumulativeHours, loss, actualProduction, workDays, referenceRate }) {
    const order = number(orderQuantity), produced = number(cumulativeProduction), lost = number(loss);
    const hours = number(cumulativeHours), days = number(workDays), actual = number(actualProduction);
    const remaining = order !== null && produced !== null && lost !== null ? Math.max(0, order - produced + lost) : null;
    const hourlyRate = produced > 0 && hours > 0 ? produced / hours : number(referenceRate);
    const dailyRequired = order !== null && days > 0 ? order / days : null;
    // Original sheet G = MIN(H, W*2 - V*8). A negative formula result is shown as-is;
    // the actual schedule below uses nonnegative capacity and the user's working-hour policy.
    const formulaTarget = remaining !== null && dailyRequired !== null && hourlyRate > 0
      ? Math.min(remaining, dailyRequired * 2 - hourlyRate * 8) : null;
    return { orderQuantity: order, cumulativeProduction: produced, cumulativeHours: hours, loss: lost,
      actualProduction: actual, workDays: days, remaining, hourlyRate, dailyRequired, formulaTarget,
      dailyTargetHours: formulaTarget !== null && formulaTarget >= 0 ? Math.ceil(formulaTarget / hourlyRate * 2) / 2 : null,
      totalExpectedHours: remaining !== null && hourlyRate > 0 ? Math.ceil(remaining / hourlyRate * 2) / 2 : null,
      achievementRate: actual !== null && dailyRequired > 0 ? actual / dailyRequired * 100 : null };
  }
  function schedule({ jobs, startDate, holidays, machines }) {
    const unknown = [], ready = [];
    for (const job of jobs) {
      if (job.remaining === 0) continue;
      const problem = job.remaining === null ? "생산량·LOSS 확인 필요"
        : !(job.hourlyRate > 0) ? "생산량·작업시간 필요"
        : !job.dueDate ? "납기일 필요"
        : job.dueDate < startDate ? "납기 경과"
        : !startDate.startsWith("2026-") || !job.dueDate.startsWith("2026-") ? "공휴일 달력 확인 필요" : "";
      if (problem) unknown.push({ id: job.id, reason: problem });
      else ready.push(job);
    }
    ready.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
    const lastDate = ready.reduce((last, job) => job.dueDate > last ? job.dueDate : last, startDate);
    const days = datesBetween(startDate, lastDate, holidays);
    // Weekend work is a last resort. If needed, try 8 hours on every workday first.
    const modes = [{ hours: 8 }, { hours: 9 }, { hours: 10 },
      { hours: 8, holidays: true }, { hours: 9, holidays: true }, { hours: 10, holidays: true }];
    function attempt(mode) {
      const remaining = new Map();
      for (const job of ready) remaining.set(job.group, Math.max(remaining.get(job.group) || 0, job.remaining));
      const entries = [];
      for (const day of days) {
        if (day.holiday && !mode.holidays) continue;
        const limit = day.holiday ? 8 : mode.hours;
        const busy = new Map();
        for (const job of ready) {
          if (job.dueDate < day.date || !(remaining.get(job.group) > 0)) continue;
          const choices = job.machine ? [job.machine] : (machines[job.process] || []);
          const workers = String(job.worker || "").split(/[+,，/]/).map(s => s.trim()).filter(Boolean);
          let best = null;
          for (const machine of choices) {
            const resources = [`machine:${job.process}:${machine}`, ...workers.map(worker => `worker:${worker}`)];
            const intervals = resources.flatMap(key => busy.get(key) || []).sort((a, b) => a[0] - b[0]);
            let cursor = 0;
            const gaps = [];
            for (const interval of intervals) {
              if (interval[0] > cursor) gaps.push([cursor, interval[0]]);
              cursor = Math.max(cursor, interval[1]);
            }
            if (cursor < limit) gaps.push([cursor, limit]);
            for (const gap of gaps) {
              const quantity = Math.min(remaining.get(job.group), Math.floor((gap[1] - gap[0]) * job.hourlyRate + 1e-7));
              if (quantity > 0 && (!best || quantity > best.quantity)) best = { machine, resources, startHour: gap[0], quantity };
            }
          }
          if (!best) continue;
          const duration = best.quantity / job.hourlyRate;
          for (const resource of best.resources) busy.set(resource, [...(busy.get(resource) || []), [best.startHour, best.startHour + duration]]);
          remaining.set(job.group, remaining.get(job.group) - best.quantity);
          entries.push({ id: job.id, group: job.group, date: day.date, machine: best.machine,
            quantity: best.quantity, hours: duration, shiftHours: limit, startHour: best.startHour, holiday: day.holiday });
        }
      }
      return { entries, unplanned: [...remaining.values()].reduce((a, b) => a + b, 0), remaining, mode };
    }
    let result = attempt(modes[0]);
    for (let index = 1; result.unplanned > 0 && index < modes.length; index++) result = attempt(modes[index]);
    return { ...result, unknown, complete: result.unplanned === 0 && unknown.length === 0 };
  }
  root.SeungjinProductionPlanner = { number, calculate, datesBetween, schedule };
})(typeof window === "undefined" ? globalThis : window);
