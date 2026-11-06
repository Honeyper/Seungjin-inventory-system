// DEV aligned with PRD snapshot 7058 on 2026-11-06.
window.SEUNGJIN_CONFIG = {
  ENV: "dev",
  API_URL: "https://script.google.com/macros/s/AKfycbzSz-9IspdGb_wcAIUVhokQdQR0egaiR5M1sJ9PQVX5pjm_w7-FPU3gaj-cmLwjAvxvsg/exec",
  SUPABASE_GATEWAY_URL: "https://lponwunagtixddwqkzxx.supabase.co/functions/v1/seungjin-dev-gateway",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_kjj59xENATbzJwnUlKsmGg_uA5lwI0R",
  SUPABASE_CANONICAL_WRITES: true
};

// Production plans live in this browser, independently of the server database.
// Align them once per browser while retaining the previous DEV values.
(function alignDevProductionPlans() {
  const revision = "20261106-prd-7058";
  const marker = `seungjinDevAlignment:${revision}:production-plans`;
  const backupKey = `${marker}:backup`;
  const sourcePrefix = "seungjinProductionPlan:v1:prod:";
  const targetPrefix = "seungjinProductionPlan:v1:dev:";
  let storage;
  let previous;
  const keys = () => Array.from({length: storage.length}, (_, i) => storage.key(i)).filter(Boolean);
  try {
    storage = window.localStorage;
    if (!storage || storage.getItem(marker)) return;
    const existing = keys();
    const source = existing.filter(key => key.startsWith(sourcePrefix))
      .map(key => [targetPrefix + key.slice(sourcePrefix.length), storage.getItem(key)]);
    // A browser without PRD plans cannot supply a source snapshot.
    if (!source.length) return;
    previous = existing.filter(key => key.startsWith(targetPrefix))
      .map(key => [key, storage.getItem(key)]);
    storage.setItem(backupKey, JSON.stringify(previous));
    previous.forEach(([key]) => storage.removeItem(key));
    source.forEach(([key, value]) => storage.setItem(key, value));
    storage.setItem(marker, "complete");
  } catch (error) {
    // Storage failures must leave an existing DEV plan usable and retryable.
    if (storage && previous && storage.getItem(backupKey)) {
      try {
        keys().filter(key => key.startsWith(targetPrefix)).forEach(key => storage.removeItem(key));
        previous.forEach(([key, value]) => storage.setItem(key, value));
        storage.removeItem(marker);
      } catch (_) { /* The saved backup remains available for recovery. */ }
    }
    console.warn("DEV 생산계획 복사를 완료하지 못했습니다.");
  }
})();
