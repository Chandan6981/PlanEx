import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Header from '../layout/Header';
import { setCreateTaskModal, setTaskDetailPanel, setViewMode } from '../../store/slices/uiSlice';
import { updateTask } from '../../store/slices/tasksSlice';
import KanbanBoard from './KanbanBoard';
import api from '../../utils/api';
import { getDueDateLabel, getDueDateStatus, priorityConfig, getInitials } from '../../utils/helpers';
import { getSocket } from '../../utils/socket';
import { useOfflineSync, useOnlineStatus } from '../../hooks/useOfflineSync';
import { getPendingTasks } from '../../utils/indexedDB';

export default function MyTasks() {
  const dispatch  = useDispatch();
  const { user }  = useSelector(s => s.auth);
  const { viewMode } = useSelector(s => s.ui);
  const isOnline  = useOnlineStatus();

  const [tasks,        setTasks]        = useState([]);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [section,      setSection]      = useState('all');
  const [search,       setSearch]       = useState('');

  const uid = user?._id?.toString();

  // Load pending tasks from IndexedDB
  const loadPending = useCallback(async () => {
    const pending = await getPendingTasks();
    setPendingTasks(pending);
  }, []);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.get('/tasks', { params: { myTasks: true } })
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : (r.data?.tasks || []);
        setTasks(data);
        setLoading(false);
      })
      .catch(() => { setTasks([]); setLoading(false); });
  }, [user]);

  useEffect(() => { load(); loadPending(); }, [load, loadPending]);

  // Sync hook — re-fetch tasks and pending list after sync completes
  const onSyncComplete = useCallback(() => {
    load();
    loadPending();
  }, [load, loadPending]);

  useOfflineSync(onSyncComplete);

  // Also reload pending tasks when tab comes back online
  useEffect(() => {
    if (isOnline) loadPending();
  }, [isOnline, loadPending]);

  const isMine = useCallback((task) => {
    if (!uid) return false;
    const inAssignees = (task.assignees || []).some(a => (a._id || a).toString() === uid);
    const isCreator   = (task.createdBy?._id || task.createdBy)?.toString() === uid;
    return inAssignees || isCreator;
  }, [uid]);

  const isMineRef = useRef(isMine);
  useEffect(() => { isMineRef.current = isMine; }, [isMine]);

  const seenTaskIds = useRef(new Set());

  // Redux-based instant update for newly created tasks
  const lastCreatedTask = useSelector(s => {
    const list = s.tasks?.list;
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[list.length - 1];
  });

  // Sync Redux task list changes back to local state (for Kanban drag updates)
  const reduxTaskList = useSelector(s => s.tasks?.list);
  useEffect(() => {
    if (!Array.isArray(reduxTaskList) || reduxTaskList.length === 0) return;
    setTasks(prev => {
      if (!Array.isArray(prev)) return prev;
      return prev.map(t => {
        const updated = reduxTaskList.find(r => r._id === t._id);
        return updated ? updated : t;
      });
    });
  }, [reduxTaskList]);

  useEffect(() => {
    if (!lastCreatedTask?._id) return;
    if (seenTaskIds.current.has(lastCreatedTask._id)) return;
    if (!isMineRef.current(lastCreatedTask)) return;
    seenTaskIds.current.add(lastCreatedTask._id);
    setTasks(prev => {
      if (!Array.isArray(prev)) return [lastCreatedTask];
      if (prev.some(t => t._id === lastCreatedTask._id)) return prev;
      return [lastCreatedTask, ...prev];
    });
  }, [lastCreatedTask]);

  // Socket listeners
  useEffect(() => {
    if (!user) return;
    const onCreated = (task) => {
      if (!isMineRef.current(task)) return;
      setTasks(prev => {
        if (!Array.isArray(prev)) return [task];
        if (prev.some(t => t._id === task._id)) return prev;
        seenTaskIds.current.add(task._id);
        return [task, ...prev];
      });
    };
    const onUpdated = (task) => {
      const mine = isMineRef.current(task);
      setTasks(prev => {
        if (!Array.isArray(prev)) return prev;
        const exists = prev.some(t => t._id === task._id);
        if (mine && exists)  return prev.map(t => t._id === task._id ? task : t);
        if (mine && !exists) return [task, ...prev];
        return prev.filter(t => t._id !== task._id);
      });
    };
    const onDeleted = (id) => setTasks(prev => Array.isArray(prev) ? prev.filter(t => t._id !== id) : []);

    const attach = () => {
      const socket = getSocket();
      if (!socket) return;
      socket.off('task:created', onCreated);
      socket.off('task:updated', onUpdated);
      socket.off('task:deleted', onDeleted);
      socket.on ('task:created', onCreated);
      socket.on ('task:updated', onUpdated);
      socket.on ('task:deleted', onDeleted);
    };
    attach();
    const socket = getSocket();
    if (socket) socket.on('connect', attach);
    return () => {
      const s = getSocket();
      if (!s) return;
      s.off('task:created', onCreated);
      s.off('task:updated', onUpdated);
      s.off('task:deleted', onDeleted);
      s.off('connect', attach);
    };
  }, [user]);

  const toggleDone = (e, task) => {
    e.stopPropagation();
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    setTasks(prev => Array.isArray(prev) ? prev.map(t =>
      t._id === task._id ? { ...t, status: newStatus, column: newStatus } : t
    ) : prev);
    dispatch(updateTask({ id: task._id, data: { status: newStatus, column: newStatus } }));
  };

  const today    = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const q = search.toLowerCase();
  const filtered = q ? safeTasks.filter(t => t.title?.toLowerCase().includes(q)) : safeTasks;

  // Pending tasks filtered by search
  const filteredPending = q
    ? pendingTasks.filter(t => t.title?.toLowerCase().includes(q))
    : pendingTasks;

  const sections = {
    // All active = real active + all pending
    all:       [...filteredPending, ...filtered.filter(t => t.status !== 'done')],
    // Personal = real personal + all pending (pending are always personal)
    inbox:     [...filteredPending, ...filtered.filter(t => !t.project && t.status !== 'done')],
    today:     filtered.filter(t => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) < tomorrow && t.status !== 'done'),
    upcoming:  filtered.filter(t => t.dueDate && new Date(t.dueDate) >= tomorrow && new Date(t.dueDate) < nextWeek && t.status !== 'done'),
    overdue:   filtered.filter(t => t.dueDate && new Date(t.dueDate) < today && t.status !== 'done'),
    completed: filtered.filter(t => t.status === 'done'),
  };

  const tabs = [
    { key: 'all',       label: 'All Active' },
    { key: 'inbox',     label: 'Personal' },
    { key: 'today',     label: 'Today' },
    { key: 'upcoming',  label: 'This Week' },
    { key: 'overdue',   label: 'Overdue', warn: true },
    { key: 'completed', label: 'Completed' },
  ];

  const current = sections[section] || [];
  const STATUS_LABEL = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' };
  const STATUS_COLOR = { todo: 'var(--text-muted)', inprogress: 'var(--yellow)', review: 'var(--purple)', done: 'var(--green)' };

  return (
    <>
      <Header title="My Tasks" actions={
        <button className="btn btn-ghost btn-sm" onClick={() => { load(); loadPending(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Refresh
        </button>
      }/>

      <div className="page-content">

        {/* Offline banner */}
        {!isOnline && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', marginBottom: 16,
            background: 'var(--yellow-dim)', border: '1px solid var(--yellow)',
            borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--yellow)',
          }}>
            <span>📴</span>
            <span>You are offline. Existing tasks are read-only. New personal tasks will be queued for sync.</span>
          </div>
        )}

        {/* Pending sync banner */}
        {isOnline && pendingTasks.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', marginBottom: 16,
            background: 'var(--yellow-dim)', border: '1px solid var(--yellow)',
            borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--yellow)',
          }}>
            <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: 'var(--yellow)', borderTopColor: 'transparent' }} />
            <span>{pendingTasks.length} task{pendingTasks.length > 1 ? 's' : ''} pending sync…</span>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="tabs">
            {tabs.map(t => {
              const count = sections[t.key]?.length || 0;
              return (
                <button key={t.key} className={`tab ${section === t.key ? 'active' : ''}`}
                  onClick={() => setSection(t.key)}
                  style={t.warn && count > 0 && section !== t.key ? { color: 'var(--red)' } : {}}>
                  {t.label}
                  {count > 0 && (
                    <span style={{ marginLeft: 5, fontSize: '0.65rem', background: 'var(--bg-active)', padding: '1px 6px', borderRadius: 10, fontFamily: 'var(--mono)' }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="search-box" style={{ marginLeft: 'auto', width: 220 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input placeholder="Filter tasks…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
            <button
              onClick={() => dispatch(setViewMode('list'))}
              title="List view"
              style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode !== 'board' ? 'var(--bg-card)' : 'transparent', color: viewMode !== 'board' ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'var(--transition)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
            <button
              onClick={() => dispatch(setViewMode('board'))}
              title="Board view"
              style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: viewMode === 'board' ? 'var(--bg-card)' : 'transparent', color: viewMode === 'board' ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'var(--transition)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/>
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-muted)' }}>
            <div className="spinner" /> Loading…
          </div>

        ) : current.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" style={{ fontSize: '1.6rem' }}>
              {section === 'completed' ? '🎉' : section === 'inbox' ? '🗂️' : section === 'overdue' ? '✅' : '📋'}
            </div>
            <h3 style={{ fontSize: '0.88rem' }}>
              {section === 'completed' ? 'No completed tasks' :
               section === 'inbox'     ? 'No personal tasks' :
               section === 'overdue'   ? 'No overdue tasks' :
               section === 'today'     ? 'Nothing due today' : 'No tasks'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {section === 'inbox' ? 'Personal tasks have no project assigned' :
               section === 'all'   ? 'Tasks you create or are assigned to will appear here' : ''}
            </p>
            {(section === 'all' || section === 'inbox') && (
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
                onClick={() => dispatch(setCreateTaskModal(true))}>
                + New Task
              </button>
            )}
          </div>

        ) : viewMode === 'board' ? (
          <KanbanBoard tasks={current.filter(t => !t._offline)} project={null} />

        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="task-table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Task</th>
                  <th style={{ width: 100 }}>Priority</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 130 }}>Project</th>
                  <th style={{ width: 110 }}>Due Date</th>
                  <th style={{ width: 90 }}>Assignees</th>
                </tr>
              </thead>
              <tbody>
                {current.map((task, idx) => {
                  const isOffline = task._offline === true;
                  const dueStatus = !isOffline ? getDueDateStatus(task.dueDate, task.status === 'done') : '';
                  const pc        = priorityConfig[task.priority] || priorityConfig.none;
                  const done      = task.status === 'done';
                  const rowKey    = task._id || task.localId || idx;

                  return (
                    <tr key={rowKey}
                      onClick={() => !isOffline && dispatch(setTaskDetailPanel(task._id))}
                      style={{ cursor: isOffline ? 'default' : 'pointer', opacity: isOffline ? 0.75 : 1 }}>

                      {/* Checkbox — disabled for offline tasks */}
                      <td style={{ width: 36 }}>
                        <div
                          onClick={e => { if (isOffline || !isOnline) return; e.stopPropagation(); toggleDone(e, task); }}
                          style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            border:     done ? 'none' : '1.5px solid var(--border-strong)',
                            background: done ? 'var(--green)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'var(--transition)',
                            cursor: isOffline || !isOnline ? 'not-allowed' : 'pointer',
                            opacity: isOffline || !isOnline ? 0.4 : 1,
                          }}>
                          {done && (
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </div>
                      </td>

                      {/* Title + offline badge */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 500, color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
                            {task.title}
                          </span>
                          {isOffline && (
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 600,
                              background: 'var(--yellow-dim)', color: 'var(--yellow)',
                              border: '1px solid var(--yellow)',
                              padding: '1px 7px', borderRadius: 10,
                              letterSpacing: '0.03em', flexShrink: 0,
                            }}>
                              ⏳ Pending sync
                            </span>
                          )}
                        </div>
                        {!isOffline && task.subtasks?.length > 0 && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length} subtasks
                          </div>
                        )}
                      </td>

                      {/* Priority */}
                      <td><span className={`badge badge-${task.priority}`}>{pc.label}</span></td>

                      {/* Status */}
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: STATUS_COLOR[task.status] || 'var(--text-muted)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[task.status] || 'var(--text-muted)', flexShrink: 0 }} />
                          {STATUS_LABEL[task.status] || 'To Do'}
                        </span>
                      </td>

                      {/* Project */}
                      <td>
                        <span className="chip" style={{ color: 'var(--text-muted)' }}>🗂️ Personal</span>
                      </td>

                      {/* Due date */}
                      <td>
                        {task.dueDate && !isOffline
                          ? <span className={`due-date ${dueStatus}`} style={{ fontSize: '0.7rem' }}>{getDueDateLabel(task.dueDate)}</span>
                          : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>

                      {/* Assignees */}
                      <td>
                        {!isOffline && task.assignees?.length > 0
                          ? <div className="avatar-stack">
                              {task.assignees.slice(0, 3).map(a => (
                                <div key={a._id} className="avatar avatar-xs"
                                  style={{ background: a.color || 'var(--accent)' }} title={a.name}>
                                  {getInitials(a.name)}
                                </div>
                              ))}
                            </div>
                          : <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}