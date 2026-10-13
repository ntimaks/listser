// A tiny key-value store on IndexedDB, for what must outlive a reload: the
// write queue and the last copy of the lists. Every call swallows errors
// (private windows, blocked storage) and reads as empty, so the app works
// without it, just not offline.

const DB_NAME = "listser";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T | undefined> {
  return open()
    .then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        })
    )
    .catch((e) => {
      console.error("IndexedDB:", e);
      return undefined;
    });
}

export function idbGet<T>(key: string) {
  return run<T>("readonly", (s) => s.get(key));
}

export async function idbSet(key: string, value: unknown) {
  await run("readwrite", (s) => s.put(value, key));
}

/** Forget everything stored on this device: data and the offline page cache. */
export async function clearLocalData() {
  await run("readwrite", (s) => s.clear());
  if ("caches" in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}
