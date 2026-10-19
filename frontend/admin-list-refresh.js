/* Refresh only the visible list, and discard responses overtaken by user activity. */
(function initializeAdminListRefresh() {
  function create({ getContext, isPaused, refresh, window: host = window,
    document: doc = document, now = Date.now, intervalMs = 30000,
    resumeMs = 5000, retryMs = 1500, onError = () => {} }) {
    const attempts = new Map();
    let running = false;
    let pending = false;
    let timer = null;
    let revision = 0;
    let quietUntil = 0;

    function available() {
      return running && !doc.hidden && host.navigator?.onLine !== false
        && now() >= quietUntil && !isPaused();
    }

    function schedule(delay) {
      if (!running) return;
      if (delay === undefined) {
        const context = getContext();
        const remaining = (attempts.get(JSON.stringify(context)) ?? -Infinity) + intervalMs - now();
        delay = remaining > 0 ? Math.min(resumeMs, remaining) : resumeMs;
      }
      host.clearTimeout(timer);
      timer = host.setTimeout(async () => {
        try { await check("interval"); }
        finally { schedule(); }
      }, delay);
    }

    async function check(reason = "resume") {
      if (pending || !available()) return false;
      const context = getContext();
      if (!context) return false;
      const key = JSON.stringify(context);
      const age = now() - (attempts.get(key) ?? -Infinity);
      if (age < (reason === "interval" ? intervalMs : resumeMs)) return false;
      const startedRevision = revision;
      const canApply = () => available() && revision === startedRevision
        && JSON.stringify(getContext()) === key;
      attempts.set(key, now());
      pending = true;
      try {
        const applied = await refresh(context, canApply);
        // A deferred response should be retried as soon as editing has ended.
        if (applied === false) attempts.delete(key);
        return applied !== false;
      } catch (error) {
        onError(error);
        return false;
      } finally {
        pending = false;
      }
    }

    function activity() {
      revision++;
      quietUntil = now() + retryMs;
      schedule(retryMs);
    }

    function resume() {
      revision++;
      void check();
      schedule(retryMs);
    }

    const bindings = [
      [doc, "input", activity], [doc, "change", activity],
      [doc, "pointerdown", activity], [doc, "focusin", activity],
      [doc, "focusout", activity], [doc, "visibilitychange", resume],
      [host, "focus", resume], [host, "online", resume],
      [host, "hashchange", resume], [host, "pageshow", resume]
    ];
    return {
      start() {
        if (running) return;
        running = true;
        const context = getContext();
        if (context) attempts.set(JSON.stringify(context), now());
        bindings.forEach(([target, name, listener]) => target.addEventListener(name, listener));
        schedule();
      },
      stop() {
        running = false;
        revision++;
        host.clearTimeout(timer);
        bindings.forEach(([target, name, listener]) => target.removeEventListener(name, listener));
      },
      check
    };
  }
  window.SeungjinAdminListRefresh = { create };
})();
