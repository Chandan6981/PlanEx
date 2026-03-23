import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import { setCreateProjectModal } from '../../store/slices/uiSlice';
import { getInitials } from '../../utils/helpers';
import { PlanExIcon } from '../common/PlanExLogo';

export default function Sidebar() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const { user }  = useSelector(state => state.auth);
  const { list: projects, assigned } = useSelector(state => state.projects);
  const [ownedExpanded,    setOwnedExpanded]    = useState(true);
  const [assignedExpanded, setAssignedExpanded] = useState(true);

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <PlanExIcon size={32} />
        <span className="logo-text">
          Plan<span style={{ color: '#6366F1' }}>Ex</span>
        </span>
      </div>

      {/* Main nav */}
      <div className="sidebar-section" style={{ marginTop: 6 }}>
         <NavLink to="/search" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          Search
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </span>
          Overview
        </NavLink>

        <NavLink to="/my-tasks" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
          </span>
          My Tasks
        </NavLink>

       

        <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </span>
          Analytics
        </NavLink>
      </div>

      {/* ── OWNED PROJECTS ── */}
      <div className="sidebar-section" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 0 8px', marginBottom: 2 }}>
          <span className="sidebar-section-label" style={{ padding: 0 }}>My Workspace</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="btn-icon" style={{ width: 20, height: 20, padding: 0, fontSize: '11px' }}
              onClick={() => setOwnedExpanded(v => !v)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {ownedExpanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
              </svg>
            </button>
            <button className="btn-icon" style={{ width: 20, height: 20, padding: 0 }}
              onClick={() => dispatch(setCreateProjectModal(true))} title="New project">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

        {ownedExpanded && (
          <>
            {projects.length === 0 ? (
              <div style={{ padding: '6px 8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                No projects yet
              </div>
            ) : (
              projects.slice(0, 12).map(p => (
                <NavLink key={p._id} to={`/projects/${p._id}`}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color || '#6366f1', flexShrink: 0 }} />
                  <span className="text-truncate">{p.name}</span>
                  {p.totalTasks > 0 && (
                    <span className="nav-count">{p.completedTasks}/{p.totalTasks}</span>
                  )}
                </NavLink>
              ))
            )}
          </>
        )}
      </div>

      {/* ── ASSIGNED PROJECTS ── */}
      {assigned?.length > 0 && (
        <div className="sidebar-section" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 0 8px', marginBottom: 2 }}>
            <span className="sidebar-section-label" style={{ padding: 0 }}>Assigned</span>
            <button className="btn-icon" style={{ width: 20, height: 20, padding: 0 }}
              onClick={() => setAssignedExpanded(v => !v)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {assignedExpanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
              </svg>
            </button>
          </div>

          {assignedExpanded && assigned.map(p => (
            <NavLink key={p._id} to={`/projects/${p._id}?view=assigned`}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              {/* Different icon — person icon to indicate assigned */}
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color || '#6366f1', flexShrink: 0, opacity: 0.6 }} />
              <span className="text-truncate" style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
              <span style={{
                fontSize: '0.62rem', fontFamily: 'var(--mono)', fontWeight: 600,
                color: 'var(--accent)', background: 'var(--accent-dim)',
                padding: '1px 6px', borderRadius: 10, flexShrink: 0,
              }}>
                {p.myAssignedCount}
              </span>
            </NavLink>
          ))}
        </div>
      )}

      {/* User */}
      <div className="sidebar-bottom">


        <div className="user-card" onClick={() => navigate('/dashboard')}>
          <div className="avatar" style={{ background: user?.color || '#6366f1' }}>
            {getInitials(user?.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
          </div>
          <button className="btn-icon" style={{ flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); dispatch(logout()); navigate('/login'); }}
            title="Sign out">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}