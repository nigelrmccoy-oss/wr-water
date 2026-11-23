/** Persistent OSM/Overpass cache (IndexedDB) with versioned keys and LRU eviction.
 *  Read the cache before the network. Browser: asks for navigator.storage.persist().
 *  Default cap 16 GB; oldest-used entries go first. All calls fail soft. */
export const CACHE_VER = 'v4';
export const DEFAULT_CAP = 16 * 1024 ** 3;
export const keyFor = (kind, id) => `${CACHE_VER}:${kind}:${id}`;

function byteSize(data) {
  try { return new Blob([JSON.stringify(data)]).size; } catch { return JSON.stringify(data ?? null).length; }
}

/** In-memory backend for Node tests (same shape as the IDB adapter). */
export class MemoryStore {
  constructor() { this.rows = new Map(); }
  async get(key) { return this.rows.get(key) ?? null; }
  async put(row) { this.rows.set(row.key, row); }
  async delete(key) { this.rows.delete(key); }
  async all() { return [...this.rows.values()]; }
  async clear() { this.rows.clear(); }
}

export class MapCache {
  constructor({ capBytes = DEFAULT_CAP, dbName = 'wr-water-map', backend = null } = {}) {
    this.capBytes = capBytes;
    this.dbName = dbName;
    this.backend = backend;
    this.notice = '';
    this.persisted = null;
    this._dbp = null;
  }

  async persist() {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
      this.persisted = (await navigator.storage.persisted?.()) || (await navigator.storage.persist());
      if (!this.persisted) this.notice = 'Browser may clear the map cache (persistent storage not granted)';
    } catch { this.persisted = false; }
  }

  async _store() {
    if (this.backend) return this.backend;
    if (typeof indexedDB === 'undefined') return null;
    if (!this._dbp) {
      this._dbp = new Promise(resolve => {
        try {
          const req = indexedDB.open(this.dbName, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('tiles')) db.createObjectStore('tiles', { keyPath: 'key' }).createIndex('used', 'used');
          };
          req.onsuccess = () => resolve(new IdbStore(req.result));
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch { resolve(null); }
      });
    }
    return this._dbp;
  }

  async get(key) {
    const st = await this._store(); if (!st) return null;
    try {
      const row = await st.get(key); if (!row) return null;
      row.used = Date.now();
      await st.put(row);
      return row.data;
    } catch { this.notice = 'Map cache unavailable'; return null; }
  }

  async put(key, data) {
    const st = await this._store(); if (!st) { this.notice = 'Map storage unavailable'; return; }
    try {
      const row = { key, used: Date.now(), bytes: byteSize(data), data };
      await st.put(row);
      await this._evict(st);
    } catch { this.notice = 'Map storage full or unavailable — existing tiles kept'; }
  }

  async _evict(st) {
    const rows = await st.all();
    let total = rows.reduce((a, r) => a + (r.bytes || 0), 0);
    if (total <= this.capBytes) return;
    rows.sort((a, b) => (a.used || 0) - (b.used || 0)); // oldest-used first
    for (const r of rows) {
      if (total <= this.capBytes) break;
      await st.delete(r.key);
      total -= r.bytes || 0;
    }
    if (rows.length) this.notice = 'Map storage trimmed (oldest-used tiles)';
  }

  async stats() {
    const st = await this._store();
    let count = 0, bytes = 0;
    if (st) {
      try {
        for (const r of await st.all()) { count++; bytes += r.bytes || 0; }
      } catch { /* ignore */ }
    }
    let quota = null;
    try { if (typeof navigator !== 'undefined' && navigator.storage?.estimate) { const e = await navigator.storage.estimate(); quota = e?.quota ?? null; } } catch { /* ignore */ }
    const effectiveCap = quota != null ? Math.min(this.capBytes, quota) : this.capBytes;
    return { count, bytes, persisted: this.persisted, notice: this.notice, capBytes: this.capBytes, quota, effectiveCap };
  }

  async clear() {
    const st = await this._store();
    if (st) try { await st.clear(); } catch { /* ignore */ }
    this.notice = '';
  }
}

class IdbStore {
  constructor(db) { this.db = db; }
  _tx(mode) { return this.db.transaction('tiles', mode).objectStore('tiles'); }
  get(key) {
    return new Promise((resolve, reject) => {
      const r = this._tx('readonly').get(key);
      r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error);
    });
  }
  put(row) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tiles', 'readwrite');
      tx.objectStore('tiles').put(row);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }
  delete(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tiles', 'readwrite');
      tx.objectStore('tiles').delete(key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }
  all() {
    return new Promise((resolve, reject) => {
      const r = this._tx('readonly').getAll();
      r.onsuccess = () => resolve(r.result || []); r.onerror = () => reject(r.error);
    });
  }
  clear() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tiles', 'readwrite');
      tx.objectStore('tiles').clear();
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }
}

export const mapCache = new MapCache();
if (typeof window !== 'undefined') {
  void mapCache.persist();
  window.addEventListener('pointerdown', () => { if (!mapCache.persisted) void mapCache.persist(); }, { once: true });
}
