import React, { useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleNotificationPanel, closeNotificationPanel, setCreateTaskModal } from '../../store/slices/uiSlice';
import { updateTheme, updateNotifications } from '../../store/slices/authSlice';
import api from '../../utils/api';
import { timeAgo } from '../../utils/helpers';

export default function Header({ title, actions }) {
  const dispatch = useDispatch();
  const { user }             = useSelector(state => state.auth);
  const { notificationPanel } = useSelector(state => state.ui);
  const panelRef = useRef();

  // Sort newest first
  const notifications = [...(user?.notifications || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const unread = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handler = e => {
      if (panelRef.current && !panelRef.current.contains(e.target))
        dispatch(closeNotificationPanel());
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dispatch]);

  const handleThemeToggle = () => {
    const t = user?.theme === 'dark' ? 'light' : 'dark';
    dispatch(updateTheme(t));
    document.documentElement.setAttribute('data-theme', t);
  };

  // Mark single notification as read — instant UI update
  const markOneRead = async (n, i) => {
    if (n.read) return;
    const updated = notifications.map((notif, idx) =>
      idx === i ? { ...notif, read: true } : notif
    );
    dispatch(updateNotifications(updated));
    api.put(`/users/notifications/${n._id}/read`).catch(() => {});
  };

  // Mark all as read — instant UI update
  const markAllRead = async () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    dispatch(updateNotifications(updated));
    api.put('/users/notifications/read-all').catch(() => {});
  };

  return (
    <header className="header">
      <div className="header-title">{title}</div>
      <div className="header-actions">
        {actions}

        <button className="btn btn-primary btn-sm" onClick={() => dispatch(setCreateTaskModal(true))} style={{ gap: 4 }}>
          <svg width="15" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Task
        </button>

        <button className="btn-icon" onClick={handleThemeToggle} title="Toggle theme">
          {user?.theme === 'dark' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          )}
        </button>

        <div className="dropdown" ref={panelRef}>
          <button className="btn-icon" style={{ position: 'relative' }} onClick={() => dispatch(toggleNotificationPanel())}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {unread > 0 && <span className="notification-dot" />}
          </button>

          {notificationPanel && (
            <div className="notification-panel">
              <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                  Notifications {unread > 0 && (
                    <span style={{ fontSize: '0.68rem', background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 6px', marginLeft: 4 }}>
                      {unread}
                    </span>
                  )}
                </span>
                {unread > 0 && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 20).map((n, i) => (
                    <div
                      key={n._id || i}
                      className={`notification-item ${!n.read ? 'unread' : ''}`}
                      onClick={() => markOneRead(n, i)}
                      style={{ cursor: n.read ? 'default' : 'pointer' }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                        background: n.read ? 'var(--bg-active)' : 'var(--accent-dim)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke={n.read ? 'currentColor' : 'var(--accent)'}
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 11 12 14 22 4"/>
                          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-primary)',
                          fontWeight: n.read ? 400 : 500,
                          marginBottom: 2, lineHeight: 1.4
                        }}>{n.message}</p>
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}