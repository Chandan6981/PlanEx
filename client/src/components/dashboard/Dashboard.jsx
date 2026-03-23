import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Header from '../layout/Header';
import { fetchProjects } from '../../store/slices/projectsSlice';
import { setTaskDetailPanel } from '../../store/slices/uiSlice';
import api from '../../utils/api';
import { getDueDateLabel, getDueDateStatus, priorityConfig } from '../../utils/helpers';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: '0.75rem' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</p>
        <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{payload[0].value} tasks</p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector(state => state.auth);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(() => {
    api.get('/dashboard')
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    dispatch(fetchProjects());
    fetchDashboard();

    // Re-fetch whenever the user comes back to this tab
    const onFocus = () => fetchDashboard();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [dispatch, fetchDashboard]);

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
    </div>
  );

  const { stats = {}, recentTasks = [], projectStats = [] } = data || {};

  const statCards = [
    { label: 'Total Projects', value: stats.totalProjects || 0, color: '#6366f1', bg: 'rgba(99,102,241,0.1)',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> },
    { label: 'Active Tasks', value: stats.myTasks || 0, color: '#22c55e', bg: 'rgba(34,197,94,0.1)',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
    { label: 'Due Today', value: stats.dueTodayTasks || 0, color: '#f97316', bg: 'rgba(249,115,22,0.1)',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { label: 'Overdue', value: stats.overdueTasks || 0, color: '#ef4444', bg: 'rgba(239,68,68,0.1)',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
  ];

  const barData = [
    { name: 'To Do',       value: stats.byStatus?.todo       || 0, fill: '#4b5563' },
    { name: 'In Progress', value: stats.byStatus?.inprogress || 0, fill: '#f59e0b' },
    { name: 'In Review',   value: stats.byStatus?.review     || 0, fill: '#8b5cf6' },
    { name: 'Done',        value: stats.byStatus?.done       || 0, fill: '#22c55e' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const emoji    = hour < 12 ? '👋' : hour < 18 ? '☀️' : '🌙';

  return (
    <>
      <Header title={`${greeting}, ${user?.name?.split(' ')[0]} ${emoji}`} />
      <div className="page-content">

        {/* ── Stat Cards ── */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {statCards.map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(300px, 360px) minmax(240px, 300px)', gap: 16, marginBottom: 24 }}>

          {/* ── My Priority Tasks ── */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">🔴 High Priority Tasks</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/my-tasks')} style={{ fontSize: '0.72rem' }}>
                View all →
              </button>
            </div>
            {recentTasks.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 0' }}>
                <div className="empty-state-icon">🎉</div>
                <h3>All clear!</h3>
                <p>No high or urgent priority tasks. You are on top of things!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentTasks.slice(0, 7).map(task => {
                  const dueStatus = getDueDateStatus(task.dueDate, task.status === 'done');
                  const pc = priorityConfig[task.priority] || priorityConfig.none;
                  return (
                    <div key={task._id} className="task-card" onClick={() => dispatch(setTaskDetailPanel(task._id))}>
                      <div className="task-card-title">{task.title}</div>
                      <div className="task-card-meta">
                        <span className={`badge badge-${task.priority}`}>{pc.label}</span>
                        {task.dueDate && <span className={`due-date ${dueStatus}`}>{getDueDateLabel(task.dueDate)}</span>}
                        {task.project && (
                          <span className="chip">
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: task.project.color || '#6366f1' }} />
                            {task.project.name}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Task Distribution Chart ── */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">Task Distribution</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                {stats.completionRate || 0}% done
              </span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} barCategoryGap="35%">
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {barData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>Overall completion</div>
              <div className="progress-bar" style={{ height: 6 }}>
                <div className="progress-fill" style={{ width: `${stats.completionRate || 0}%`, background: '#22c55e', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{stats.byStatus?.done || 0} completed</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#22c55e', fontFamily: 'var(--mono)' }}>{stats.completionRate || 0}%</span>
              </div>
            </div>
          </div>

          {/* ── Projects ── */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">Projects</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')} style={{ fontSize: '0.72rem' }}>
                All →
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projectStats.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No projects</p>
              ) : projectStats.map(p => (
                <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}
                  onClick={() => navigate(`/projects/${p._id}`)}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                    background: (p.color || '#6366f1') + '18',
                    border: `1px solid ${(p.color || '#6366f1')}28`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.85rem', flexShrink: 0
                  }}>{p.icon || '📋'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', flexShrink: 0, marginLeft: 6 }}>
                        {p.progress}%
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${p.progress}%`, background: p.color || '#6366f1' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}