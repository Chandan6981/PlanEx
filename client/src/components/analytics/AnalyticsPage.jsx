import React, { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, CartesianGrid
} from 'recharts';
import Header from '../layout/Header';
import api from '../../utils/api';

// ── Colour palette ────────────────────────────────────────────────────────────
const PRIORITY_COLORS = {
  urgent: '#ef4444', high: '#f97316',
  medium: '#eab308', low: '#22c55e', none: '#6b7280',
};
const MEMBER_COLORS = ['#6366f1','#22c55e','#f97316','#3b82f6','#a855f7','#ec4899','#14b8a6'];

// ── Shared tooltip ────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-strong)', borderRadius:'var(--radius-sm)', padding:'8px 12px', fontSize:'0.75rem' }}>
      <p style={{ color:'var(--text-muted)', marginBottom:4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || 'var(--text-primary)', fontWeight:600 }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color, icon }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: color + '18', fontSize:'1rem' }}>{icon}</div>
    <div className="stat-value" style={{ color }}>{value}</div>
    <div className="stat-label">{label}</div>
    {sub && <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:2 }}>{sub}</div>}
  </div>
);

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section = ({ title, children, action }) => (
  <div className="card">
    <div className="section-header" style={{ marginBottom:16 }}>
      <span className="section-title">{title}</span>
      {action}
    </div>
    {children}
  </div>
);

// ── Format date label (show every ~5th) ───────────────────────────────────────
const shortDate = (d) => {
  if (!d) return '';
  const parts = d.split('-');
  return `${parts[2]}/${parts[1]}`;
};

export default function AnalyticsPage() {
  const { list: projects } = useSelector(s => s.projects);
  const [personal,   setPersonal]   = useState(null);
  const [project,    setProject]    = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [projLoading,setProjLoading]= useState(false);
  const [tab,        setTab]        = useState('personal');

  const loadPersonal = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/analytics/personal');
      setPersonal(r.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadProject = useCallback(async (id) => {
    if (!id) return;
    setProjLoading(true);
    try {
      const r = await api.get(`/analytics/project/${id}`);
      setProject(r.data);
    } catch (e) { console.error(e); }
    finally { setProjLoading(false); }
  }, []);

  useEffect(() => { loadPersonal(); }, [loadPersonal]);

  useEffect(() => {
    if (tab === 'project' && projects.length > 0 && !selectedId) {
      setSelectedId(projects[0]._id);
      loadProject(projects[0]._id);
    }
  }, [tab, projects, selectedId, loadProject]);

  const handleProjectChange = (id) => {
    setSelectedId(id);
    loadProject(id);
  };

  // Show every 5th label on x-axis
  const tickFormatter = (val, idx) => idx % 5 === 0 ? shortDate(val) : '';

  return (
    <>
      <Header title="Analytics" />
      <div className="page-content">

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 24 }}>
          <button className={`tab ${tab === 'personal' ? 'active' : ''}`} onClick={() => setTab('personal')}>
            👤 Personal
          </button>
          <button className={`tab ${tab === 'project' ? 'active' : ''}`} onClick={() => setTab('project')}>
            📁 Project
          </button>
        </div>

        {/* ── PERSONAL TAB ── */}
        {tab === 'personal' && (
          loading ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:40, color:'var(--text-muted)' }}>
              <div className="spinner" /> Loading analytics…
            </div>
          ) : personal && (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

              {/* Stat Cards */}
              <div className="grid-4">
                <StatCard label="Completion Rate" value={`${personal.stats.completionRate}%`}
                  sub={`${personal.stats.completedTasks} of ${personal.stats.totalTasks} tasks`}
                  color="#22c55e" icon="✅" />
                <StatCard label="Active Tasks"    value={personal.stats.activeTasks}
                  color="#6366f1" icon="📋" />
                <StatCard label="Current Streak"  value={`${personal.stats.streak}d`}
                  sub="consecutive days" color="#f97316" icon="🔥" />
                <StatCard label="Avg Completion"  value={`${personal.stats.avgDays}d`}
                  sub="to finish a task" color="#3b82f6" icon="⏱️" />
              </div>

              {/* Tasks completed over time */}
              <Section title="Tasks Completed — Last 30 Days">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={personal.completedOverTime}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={tickFormatter}
                      tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} width={20} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="completed" name="Completed"
                      stroke="#6366f1" strokeWidth={2} fill="url(#grad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Section>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

                {/* Priority breakdown donut */}
                <Section title="Active Tasks by Priority">
                  {personal.priorityBreakdown.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'30px 0', color:'var(--text-muted)', fontSize:'0.82rem' }}>No active tasks</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={personal.priorityBreakdown} dataKey="count" nameKey="_id"
                          cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                          {personal.priorityBreakdown.map((entry, i) => (
                            <Cell key={i} fill={PRIORITY_COLORS[entry._id] || '#6b7280'} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val, name) => [val, name || 'none']} />
                        <Legend formatter={(val) => val || 'none'} iconType="circle" iconSize={8}
                          wrapperStyle={{ fontSize:'0.75rem' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Section>

                {/* Productivity by day of week */}
                <Section title="Productivity by Day of Week">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={personal.productivityByDay} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} width={20} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="completed" name="Completed" radius={[4,4,0,0]}>
                        {personal.productivityByDay.map((entry, i) => (
                          <Cell key={i} fill={entry.completed > 0 ? '#6366f1' : 'var(--bg-active)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Section>

              </div>
            </div>
          )
        )}

        {/* ── PROJECT TAB ── */}
        {tab === 'project' && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

            {/* Project selector */}
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:'0.82rem', color:'var(--text-secondary)' }}>Select project:</span>
              <select className="input" style={{ width:'auto', padding:'6px 28px 6px 10px', fontSize:'0.82rem' }}
                value={selectedId} onChange={e => handleProjectChange(e.target.value)}>
                {projects.map(p => (
                  <option key={p._id} value={p._id}>{p.icon} {p.name}</option>
                ))}
              </select>
            </div>

            {projLoading ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:40, color:'var(--text-muted)' }}>
                <div className="spinner" /> Loading project analytics…
              </div>
            ) : project && (
              <>
                {/* Project stat cards */}
                <div className="grid-4">
                  <StatCard label="Total Tasks"      value={project.stats.total}          color="#6366f1" icon="📋" />
                  <StatCard label="Completed"        value={project.stats.done}            color="#22c55e" icon="✅" />
                  <StatCard label="Active"           value={project.stats.active}          color="#3b82f6" icon="⚡" />
                  <StatCard label="Completion Rate"  value={`${project.stats.completionRate}%`}
                    sub={`${project.stats.overdue} overdue`} color="#f97316" icon="🎯" />
                </div>

                {/* Burn down chart */}
                <Section title="Burn Down Chart — Tasks Remaining">
                  <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:12 }}>
                    Remaining tasks over the last 30 days — ideally trending down
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={project.burnDown}>
                      <defs>
                        <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={tickFormatter}
                        tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} width={25} />
                      <Tooltip content={<ChartTip />} />
                      <Area type="monotone" dataKey="remaining" name="Remaining"
                        stroke="#ef4444" strokeWidth={2} fill="url(#burnGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Section>

                {/* Task creation vs completion */}
                <Section title="Task Creation vs Completion — Last 30 Days">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={project.velocity}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={tickFormatter}
                        tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} width={20} />
                      <Tooltip content={<ChartTip />} />
                      <Line type="monotone" dataKey="created"   name="Created"   stroke="#f97316" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="completed" name="Completed" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:'0.75rem' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Section>

                {/* Member contribution */}
                <Section title="Member Contribution — Completed Tasks">
                  {project.memberContribution.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'30px 0', color:'var(--text-muted)', fontSize:'0.82rem' }}>
                      No completed tasks yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(180, project.memberContribution.length * 50)}>
                      <BarChart data={project.memberContribution} layout="vertical" barCategoryGap="25%">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis type="number" allowDecimals={false}
                          tick={{ fontSize:10, fill:'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={80}
                          tick={{ fontSize:11, fill:'var(--text-primary)' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTip />} />
                        <Bar dataKey="completed" name="Completed" radius={[0,4,4,0]}>
                          {project.memberContribution.map((_, i) => (
                            <Cell key={i} fill={MEMBER_COLORS[i % MEMBER_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Section>

              </>
            )}
          </div>
        )}

      </div>
    </>
  );
}