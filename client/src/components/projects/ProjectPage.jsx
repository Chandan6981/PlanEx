import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTasks, setFilter, clearTasks } from '../../store/slices/tasksSlice';
import { setViewMode, setCreateTaskModal } from '../../store/slices/uiSlice';
import Header from '../layout/Header';
import KanbanBoard from '../tasks/KanbanBoard';
import TaskList from '../tasks/TaskList';
import ManageColumnsModal from './ManageColumnsModal';
import api from '../../utils/api';

export default function ProjectPage() {
  const { id }     = useParams();
  const location   = useLocation();
  const dispatch   = useDispatch();
  const { list: tasks, filter } = useSelector(state => state.tasks);
  const { viewMode }            = useSelector(state => state.ui);
  const { list: projects, assigned } = useSelector(state => state.projects);
  const { user }   = useSelector(state => state.auth);
  const [project,          setProject]          = useState(null);
  const [search,           setSearch]           = useState('');
  const [showColumnsModal, setShowColumnsModal] = useState(false);

  // Detect if viewing as assignee (?view=assigned in URL)
  const isAssignedView = new URLSearchParams(location.search).get('view') === 'assigned';

  // Check both owned and assigned project lists
  const proj = projects.find(p => p._id === id) || assigned?.find(p => p._id === id);

  useEffect(() => {
    if (id) {
      dispatch(fetchTasks({ project: id }));
      api.get(`/projects/${id}`).then(res => setProject(res.data));
    }
    return () => { dispatch(clearTasks()); };
  }, [id, dispatch]);

  // Redux proj always has latest columns — merge with full local project data
  const currentProject = proj
    ? { ...(project || {}), ...proj }
    : project;

  // In assigned view — only show tasks assigned to current user
  const myUserId = user?._id?.toString();
  const visibleTasks = isAssignedView
    ? tasks.filter(t => (t.assignees || []).some(a => (a?._id || a)?.toString() === myUserId))
    : tasks;

  // All columns for this project (defaults + custom)
  const columns = currentProject?.columns
    ? [...currentProject.columns].sort((a, b) => (a.order || 0) - (b.order || 0))
    : [
        { id: 'todo',       name: 'To Do',       color: '#64748b' },
        { id: 'inprogress', name: 'In Progress', color: '#f59e0b' },
        { id: 'review',     name: 'In Review',   color: '#8b5cf6' },
        { id: 'done',       name: 'Done',        color: '#10b981' },
      ];

  const filteredTasks = visibleTasks.filter(t => {
    if (filter.priority !== 'all' && t.priority !== filter.priority) return false;
    if (filter.status   !== 'all' && t.status   !== filter.status)   return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Stats — count tasks per column dynamically (works for custom columns too)
  const now   = new Date();
  const total = visibleTasks.length;
  const done  = visibleTasks.filter(t => t.status === 'done').length;
  const overdue = visibleTasks.filter(t =>
    t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'
  ).length;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  // Count per column (including custom)
  const countByColumn = {};
  visibleTasks.forEach(t => {
    const col = t.column || t.status || 'todo';
    countByColumn[col] = (countByColumn[col] || 0) + 1;
  });

  return (
    <>
      <Header
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {currentProject?.icon && <span>{currentProject.icon}</span>}
            <span>{currentProject?.name || 'Project'}</span>
            {total > 0 && (
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                {done}/{total} done
              </span>
            )}
          </div>
        }
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isAssignedView && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowColumnsModal(true)} title="Manage columns">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="18" rx="1"/>
                  <rect x="14" y="3" width="7" height="10" rx="1"/>
                  <rect x="14" y="17" width="7" height="4" rx="1"/>
                </svg>
                Columns
              </button>
            )}
            <div className="tabs">
              <button className={`tab ${viewMode === 'board' ? 'active' : ''}`} onClick={() => dispatch(setViewMode('board'))}>🗂 Board</button>
              <button className={`tab ${viewMode === 'list'  ? 'active' : ''}`} onClick={() => dispatch(setViewMode('list'))}>📋 List</button>
            </div>
          </div>
        }
      />

      <div className={`page-content${viewMode === 'board' ? ' board-mode' : ''}`}>

        {/* Assigned view banner */}
        {isAssignedView && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 14px', marginBottom: 12,
            background: 'var(--accent-dim)', border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)', fontSize: '0.78rem', color: 'var(--accent)',
            flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Showing only your assigned tasks in <strong>{currentProject?.name}</strong></span>
          </div>
        )}

        {/* ── Stats Bar — scrollable if many columns ── */}
        {total > 0 && (
          <div style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'nowrap',
            overflowX: 'auto',
            flexShrink: 0,
          }}>
            {/* Total always first */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: 'var(--bg-tertiary)', borderRadius: 20, flexShrink: 0 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>{total}</span>
            </div>

            {/* One pill per column — dynamic */}
            {columns.map(col => (
              <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: 'var(--bg-tertiary)', borderRadius: 20, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{col.name}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--mono)', color: col.color }}>
                  {countByColumn[col.id] || 0}
                </span>
              </div>
            ))}

            {/* Overdue */}
            {overdue > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: 'var(--red-dim)', borderRadius: 20, flexShrink: 0 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>Overdue</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)' }}>{overdue}</span>
              </div>
            )}

            {/* Progress bar — right side, never pushed off */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', paddingLeft: 12, flexShrink: 0 }}>
              <div style={{ width: 100, flexShrink: 0 }}>
                <div className="progress-bar" style={{ height: 6 }}>
                  <div className="progress-fill" style={{
                    width: `${completionRate}%`,
                    background: currentProject?.color || 'var(--accent)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: currentProject?.color || 'var(--accent)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                {completionRate}%
              </span>
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          <div className="search-box" style={{ minWidth: 200 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>🔍</span>
            <input placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <select className="input" style={{ width: 'auto', padding: '7px 28px 7px 10px' }}
            value={filter.priority} onChange={e => dispatch(setFilter({ priority: e.target.value }))}>
            <option value="all">All Priorities</option>
            <option value="urgent">🔴 Urgent</option>
            <option value="high">🟠 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>

          {/* Status filter — dynamic, includes custom columns */}
          <select className="input" style={{ width: 'auto', padding: '7px 28px 7px 10px' }}
            value={filter.status} onChange={e => dispatch(setFilter({ status: e.target.value }))}>
            <option value="all">All Statuses</option>
            {columns.map(col => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
          </select>

          {!isAssignedView && (
            <button className="btn btn-primary btn-sm" onClick={() => dispatch(setCreateTaskModal({ project: id }))}>
              + Add Task
            </button>
          )}
        </div>

        {/* ── View ── */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {viewMode === 'board'
            ? <KanbanBoard tasks={filteredTasks} project={currentProject} />
            : <TaskList    tasks={filteredTasks} />
          }
        </div>

      </div>

      {showColumnsModal && currentProject && !isAssignedView && (
        <ManageColumnsModal
          project={currentProject}
          onClose={() => setShowColumnsModal(false)}
        />
      )}
    </>
  );
}