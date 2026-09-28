// A version change bypasses the cache immediately. Concurrent readers of the
// same version share one build; failures are never retained.
export function createInventoryReadCache({ maxAgeMs = 15000, clock = Date.now } = {}) {
  let cached = null;
  const pending = new Map();
  let latestRequest = null;
  return async function read(key, load) {
    if (cached?.key === key && clock() - cached.at < maxAgeMs) return cached.value;
    if (pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(load).then((value) => {
      // A slower, older read must not evict the latest version's result.
      if (latestRequest === request) cached = { key, value, at: clock() };
      return value;
    }).finally(() => pending.delete(key));
    latestRequest = request;
    pending.set(key, request);
    return request;
  };
}
