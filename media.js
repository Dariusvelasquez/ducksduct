/* Photo storage in the browser's IndexedDB (far bigger than localStorage). Falls back to memory if IndexedDB is
 * unavailable, in which case photos last until the page is closed. */
(function (root) {
  const mem = new Map();
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const r = indexedDB.open('ductlayout-media', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('media');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function run(mode, fn) {
    return open().then((db) => new Promise((resolve) => {
      if (!db) return resolve(fn(null));
      try {
        const t = db.transaction('media', mode), req = fn(t.objectStore('media'));
        t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
        t.onerror = () => resolve(undefined);
      } catch (e) { resolve(undefined); }
    }));
  }
  const api = {
    put: (id, blob) => run('readwrite', (s) => (s ? s.put(blob, id) : (mem.set(id, blob), null))),
    get: (id) => run('readonly', (s) => (s ? s.get(id) : { result: mem.get(id) })),
    del: (id) => run('readwrite', (s) => (s ? s.delete(id) : (mem.delete(id), null))),
    keys: () => run('readonly', (s) => (s ? s.getAllKeys() : { result: [...mem.keys()] })),
  };
  root.Media = api;
})(typeof window !== 'undefined' ? window : globalThis);
