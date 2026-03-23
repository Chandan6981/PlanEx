import { useEffect, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { showToast } from '../store/slices/uiSlice';
import { syncPendingTasks } from '../utils/syncManager';
import { getPendingTasks } from '../utils/indexedDB';

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
};

export const useOfflineSync = (onSyncComplete) => {
  const dispatch = useDispatch();
  const isOnline = useOnlineStatus();

  const runSync = useCallback(async () => {
    const pending = await getPendingTasks();
    if (pending.length === 0) return;

    dispatch(showToast({
      message: `Syncing ${pending.length} offline task${pending.length > 1 ? 's' : ''}…`,
      type: 'info'
    }));

    await syncPendingTasks({
      onComplete: ({ synced, failed }) => {
        if (synced > 0) {
          dispatch(showToast({
            message: `✅ ${synced} task${synced > 1 ? 's' : ''} synced successfully`,
            type: 'success'
          }));
        }
        if (failed > 0) {
          dispatch(showToast({
            message: `⚠️ ${failed} task${failed > 1 ? 's' : ''} failed — will retry`,
            type: 'error'
          }));
        }
        if (synced > 0) onSyncComplete?.();
      },
      onError: ({ task }) => {
        console.warn('Sync failed for task:', task.title);
      }
    });
  }, [dispatch, onSyncComplete]);

  // Sync when coming back online (with 1.5s stability delay)
  useEffect(() => {
    if (isOnline) {
      const timer = setTimeout(runSync, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, runSync]);

  // Sync on mount if already online — empty deps intentional (run once)
  useEffect(() => {
    if (navigator.onLine) runSync();
  }, []); // eslint-disable-line

  return { isOnline, runSync };
};