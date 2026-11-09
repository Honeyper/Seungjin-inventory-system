// A durable last-good roster keeps Google Sheets off the interactive read path.
export function normalizeStaffSnapshot(value) {
  if (!value || !Array.isArray(value.staff) || value.staff.some(person => !person
    || typeof person.name !== "string" || !person.name.trim()
    || !["employee", "outsourcing", "company"].includes(person.type))) {
    throw new Error("직원 목록 응답을 확인해주세요.");
  }
  const seen = new Set();
  const staff = value.staff.filter(person => {
    const key = person.type + ":" + person.name.trim();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(person => ({name:person.name.trim(),type:person.type,
    label:person.type === "employee" ? "직원" : person.type === "outsourcing" ? "아웃소싱" : "타업체"}));
  return {staff,sourceSheet:String(value.sourceSheet || "직원정보"),sourceSheetId:Number(value.sourceSheetId) || 1419995975,
    fetchedAt:String(value.fetchedAt || "")};
}

export function createProductionPlanStaffReader({loadSnapshot,claimRefresh,saveSnapshot,fetchSource,runInBackground,
  onError = () => {},clock = Date.now,maxAgeMs = 60000}) {
  let pendingRefresh = null;
  function usable(row) {
    if (!row?.payload || !Number.isFinite(Date.parse(row.fetched_at))) return null;
    try { return {...row,payload:normalizeStaffSnapshot(row.payload)}; }
    catch { return null; }
  }
  function refresh() {
    if (pendingRefresh) return pendingRefresh;
    const task = (async () => {
      // The database lease also deduplicates refreshes across separate Edge instances.
      const lease = await claimRefresh();
      if (!lease) return null;
      const payload = normalizeStaffSnapshot(await fetchSource());
      const row = {payload,fetched_at:new Date(clock()).toISOString()};
      return await saveSnapshot(row,lease) ? row : null;
    })();
    const pending = task.finally(() => { if (pendingRefresh === pending) pendingRefresh = null; });
    pendingRefresh = pending;
    return pending;
  }
  return async function readStaff() {
    let row = usable(await loadSnapshot());
    if (!row) {
      row = usable(await refresh()) || usable(await loadSnapshot());
      if (!row) throw new Error("직원 목록을 갱신하고 있습니다. 잠시 후 다시 열어주세요.");
    }
    const age = clock() - Date.parse(row.fetched_at);
    const stale = age >= maxAgeMs || age < -60000;
    if (stale) runInBackground(refresh().catch(error => {onError(error);}));
    return {...row.payload,staffCache:{source:"server-cache",fetchedAt:row.fetched_at,refreshing:stale}};
  };
}
