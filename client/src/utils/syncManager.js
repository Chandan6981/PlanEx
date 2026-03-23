import api                  from './api';
import { getPendingTasks, deletePendingTask } from './indexedDB';

// Track if a sync is already running — prevents double-sync on rapid reconnects
let isSyncing = false;

export const syncPendingTasks = async ({ onProgress, onComplete, onError } = {}) => {
  // Prevent concurrent sync runs
  if (isSyncing) return;
  if (!navigator.onLine) return;

  const pending = await getPendingTasks();
  if (pending.length === 0) return;

  isSyncing = true;
  let synced  = 0;
  let failed  = 0;

  for (const task of pending) {
    try {
      // Strip offline-only fields before sending to server
      const { localId, _offline, _syncFailed, syncAttempts, ...taskData } = task;

      await api.post('/tasks', taskData);
      await deletePendingTask(localId);
      synced++;
      onProgress?.({ synced, total: pending.length, task });
    } catch (err) {
      // Network error or server error — leave in queue for next attempt
      failed++;
      onError?.({ task, err });
    }
  }

  isSyncing = false;
  onComplete?.({ synced, failed, total: pending.length });
};