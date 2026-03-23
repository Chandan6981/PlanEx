const DB_NAME    = 'planex-offline';
const DB_VERSION = 1;
const STORE      = 'pending-tasks';

// Open (or create) the IndexedDB database
const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);

  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE)) {
      const store = db.createObjectStore(STORE, { keyPath: 'localId' });
      store.createIndex('createdAt', 'createdAt', { unique: false });
    }
  };

  req.onsuccess = (e) => resolve(e.target.result);
  req.onerror   = (e) => reject(e.target.error);
});

// Save a pending task to IndexedDB
export const savePendingTask = async (task) => {
  const db    = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req   = store.add(task);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
};

// Get all pending tasks sorted by createdAt ascending (oldest first for sync)
export const getPendingTasks = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req   = store.getAll();
    req.onsuccess = (e) => {
      const tasks = e.target.result || [];
      // Sort oldest first so sync happens in creation order
      tasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      resolve(tasks);
    };
    req.onerror = (e) => reject(e.target.error);
  });
};

// Delete a single pending task after successful sync
export const deletePendingTask = async (localId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req   = store.delete(localId);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
};

// Count pending tasks (for badges)
export const countPendingTasks = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req   = store.count();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
};