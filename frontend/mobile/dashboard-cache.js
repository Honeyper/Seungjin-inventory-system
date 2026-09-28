(function (root) {
  // IndexedDB stores large snapshots without JSON serialization on the UI thread
  // or the small synchronous localStorage quota.
  function access(mode, key, value) {
    return new Promise(resolve => {
      let db;
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        db?.close();
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), 1500);
      try {
        const open = root.indexedDB.open('seungjin-mobile-cache', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('snapshots');
        open.onerror = () => finish(null);
        open.onblocked = () => finish(null);
        open.onsuccess = () => {
          db = open.result;
          if (settled) { db.close(); return; }
          try {
            const tx = db.transaction('snapshots', mode === 'read' ? 'readonly' : 'readwrite');
            const store = tx.objectStore('snapshots');
            const request = mode === 'read' ? store.get(key) : mode === 'delete' ? store.delete(key) : store.put(value, key);
            let result = null;
            request.onsuccess = () => { result = mode === 'read' ? request.result : true; };
            tx.oncomplete = () => finish(result);
            tx.onerror = tx.onabort = () => finish(null);
          } catch { finish(null); }
        };
      } catch { finish(null); }
    });
  }
  root.SeungjinMobileCache = {read: key => access('read', key), write: (key, value) => access('write', key, value), remove: key => access('delete', key)};
})(globalThis);
