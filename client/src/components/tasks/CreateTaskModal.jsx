import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createTask, fetchTask } from '../../store/slices/tasksSlice';
import { setCreateTaskModal, showToast } from '../../store/slices/uiSlice';
import { useOnlineStatus } from '../../hooks/useOfflineSync';
import { useSpeechToText, isSpeechSupported } from '../../hooks/useSpeechToText';
import { savePendingTask } from '../../utils/indexedDB';
import MicButton from '../common/MicButton';
import api from '../../utils/api';

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
};
const fileIcon = (type) => {
  if (!type) return '📄';
  if (type.startsWith('image/'))  return '🖼️';
  if (type === 'application/pdf') return '📕';
  if (type.includes('word'))      return '📘';
  return '📝';
};

// Generate a unique local ID for offline tasks
const genLocalId = () => `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export default function CreateTaskModal() {
  const dispatch = useDispatch();
  const { createTaskModal } = useSelector(state => state.ui);
  const { list: projects }  = useSelector(state => state.projects);
  const { user }            = useSelector(state => state.auth);
  const isOnline            = useOnlineStatus();

  const defaultColumn  = typeof createTaskModal === 'object' ? createTaskModal.column  : 'todo';
  const defaultProject = typeof createTaskModal === 'object' ? createTaskModal.project : null;

  const [form, setForm] = useState({
    title:       '',
    description: '',
    project:     defaultProject || '',
    column:      defaultColumn  || 'todo',
    status:      defaultColumn  || 'todo',
    priority:    'none',
    dueDate:     '',
    assignees:   [],
    tags:        '',
    estimatedHours: '',
    isRecurring: false,
    recurringPattern: { frequency: 'weekly', interval: 1 }
  });

  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  // Speech — tracks which field is currently listening
  const [activeField, setActiveField] = useState(null);

  const speechError = (msg) => dispatch(showToast({ message: msg, type: 'error' }));

  const titleSpeech = useSpeechToText({
    fieldId: 'title',
    activeField,
    setActiveField,
    onResult: ({ transcript }) => {
      if (transcript) setForm(p => ({ ...p, title: p.title ? `${p.title} ${transcript}` : transcript }));
    },
    onError: speechError,
  });

  const descSpeech = useSpeechToText({
    fieldId: 'description',
    activeField,
    setActiveField,
    onResult: ({ transcript }) => {
      if (transcript) setForm(p => ({ ...p, description: p.description ? `${p.description} ${transcript}` : transcript }));
    },
    onError: speechError,
  });

  const speechSupported = isSpeechSupported();

  // File queue
  const [queuedFiles,  setQueuedFiles]  = useState([]);
  const [uploadStatus, setUploadStatus] = useState({});
  const [dragOver,     setDragOver]     = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/users').then(res => setUsers(res.data)).catch(() => {});
  }, []);

  // If user goes offline while on a project tab, reset project
  useEffect(() => {
    if (!isOnline && form.project) {
      setForm(p => ({ ...p, project: '' }));
    }
  }, [isOnline, form.project]);

  const addFiles = (newFiles) => {
    const MAX     = 10 * 1024 * 1024;
    const ALLOWED = ['image/jpeg','image/png','image/gif','image/webp','application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'];
    const valid = [];
    for (const f of newFiles) {
      if (f.size > MAX) { dispatch(showToast({ message: `${f.name} too large (max 10MB)`, type: 'error' })); continue; }
      if (!ALLOWED.includes(f.type)) { dispatch(showToast({ message: `${f.name} — file type not allowed`, type: 'error' })); continue; }
      valid.push(f);
    }
    setQueuedFiles(prev => [...prev, ...valid]);
  };

  const removeQueuedFile = (index) => setQueuedFiles(prev => prev.filter((_, i) => i !== index));

  const uploadQueuedFiles = async (taskId) => {
    if (queuedFiles.length === 0) return;
    for (const file of queuedFiles) {
      setUploadStatus(prev => ({ ...prev, [file.name]: 'uploading' }));
      try {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/tasks/${taskId}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setUploadStatus(prev => ({ ...prev, [file.name]: 'done' }));
      } catch {
        setUploadStatus(prev => ({ ...prev, [file.name]: 'error' }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    // Stop any active voice input before submitting
    if (activeField) { titleSpeech.stop(); descSpeech.stop(); }
    setLoading(true);

    try {
      // ── OFFLINE PATH ──────────────────────────────────────────────────────
      if (!isOnline) {
        const offlineTask = {
          localId:     genLocalId(),
          title:       form.title.trim(),
          description: form.description,
          project:     null,           // personal only when offline
          column:      form.column,
          status:      form.column,
          priority:    form.priority,
          dueDate:     form.dueDate || null,
          assignees:   [user._id],     // only self
          tags:        form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          estimatedHours: form.estimatedHours || null,
          createdBy:   user._id,
          createdAt:   new Date().toISOString(),
          _offline:    true,           // flag for UI rendering
        };

        await savePendingTask(offlineTask);
        dispatch(setCreateTaskModal(false));
        dispatch(showToast({ message: '📴 Task saved offline — will sync when online', type: 'info' }));
        return;
      }

      // ── ONLINE PATH ───────────────────────────────────────────────────────
      const taskData = {
        ...form,
        project: form.project || null,
        tags:    form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        status:  form.column,
      };

      const result = await dispatch(createTask(taskData)).unwrap();

      if (queuedFiles.length > 0) {
        await uploadQueuedFiles(result._id);
        dispatch(fetchTask(result._id));
      }

      dispatch(setCreateTaskModal(false));
      dispatch(showToast({
        message: queuedFiles.length > 0
          ? `Task created with ${queuedFiles.length} file${queuedFiles.length > 1 ? 's' : ''}!`
          : 'Task created!',
        type: 'success'
      }));

    } catch (err) {
      dispatch(showToast({ message: 'Failed to create task', type: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => dispatch(setCreateTaskModal(false))}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h3>New Task</h3>
          <button className="btn-icon" onClick={() => dispatch(setCreateTaskModal(false))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Offline banner */}
        {!isOnline && (
          <div style={{
            padding: '10px 20px',
            background: 'var(--yellow-dim)',
            borderBottom: '1px solid var(--yellow)',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: '0.8rem', color: 'var(--yellow)',
          }}>
            <span style={{ fontSize: '1rem' }}>📴</span>
            <span>
              You are <strong>offline</strong>. Task will be saved locally and synced automatically when you reconnect.
              Only <strong>Personal</strong> tasks can be created offline.
            </span>
          </div>
        )}

        <div style={{ padding: '0 20px 10px' }}>
          <div className="tabs">
            {['basic', 'details', ...(isOnline ? ['attachments'] : []), 'advanced'].map(tab => (
              <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)} type="button">
                {tab === 'attachments'
                  ? queuedFiles.length > 0 ? `Files (${queuedFiles.length})` : 'Files'
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ paddingTop: 8 }}>

            {/* ── BASIC TAB ── */}
            {activeTab === 'basic' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="input-group">
                  <label className="input-label">Task title *</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input className="input" type="text" placeholder="What needs to be done?"
                      value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} autoFocus />
                    {speechSupported && (
                      <MicButton
                        listening={titleSpeech.listening}
                        onStart={titleSpeech.start}
                        disabled={loading}
                      />
                    )}
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Description</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <textarea className="input" placeholder="Add details or context..."
                      value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3}
                      style={{ flex: 1 }} />
                    {speechSupported && (
                      <MicButton
                        listening={descSpeech.listening}
                        onStart={descSpeech.start}
                        disabled={loading}
                      />
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="input-group">
                    <label className="input-label">
                      Project
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (optional)</span>
                    </label>
                    <select className="input" value={form.project}
                      disabled={!isOnline}
                      onChange={e => setForm(p => ({ ...p, project: e.target.value }))}
                      title={!isOnline ? 'Project tasks unavailable offline' : ''}>
                      <option value="">— Personal (No project)</option>
                      {isOnline && projects.map(p => (
                        <option key={p._id} value={p._id}>{p.icon} {p.name}</option>
                      ))}
                    </select>
                    {!isOnline && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--yellow)', marginTop: 4, display: 'block' }}>
                        Project tasks unavailable offline
                      </span>
                    )}
                  </div>
                  <div className="input-group">
                    <label className="input-label">Status</label>
                    <select className="input" value={form.column}
                      onChange={e => setForm(p => ({ ...p, column: e.target.value, status: e.target.value }))}>
                      <option value="todo">To Do</option>
                      <option value="inprogress">In Progress</option>
                      <option value="review">In Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="input-group">
                    <label className="input-label">Priority</label>
                    <select className="input" value={form.priority}
                      onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                      <option value="none">No priority</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Due Date</label>
                    <input className="input" type="date" value={form.dueDate}
                      onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {/* ── DETAILS TAB ── */}
            {activeTab === 'details' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="input-group">
                  <label className="input-label">Assign to</label>
                  {!isOnline ? (
                    <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Assignees unavailable offline — task will be assigned to you only
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', maxHeight: 160, overflowY: 'auto' }}>
                      {users.length === 0
                        ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No users found</p>
                        : users.map(u => {
                          const selected = form.assignees.includes(u._id);
                          return (
                            <label key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: selected ? 'var(--accent-dim)' : 'var(--bg-card)', border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, fontSize: '0.8rem', transition: 'var(--transition)' }}>
                              <input type="checkbox" style={{ display: 'none' }} checked={selected}
                                onChange={ev => setForm(p => ({ ...p, assignees: ev.target.checked ? [...p.assignees, u._id] : p.assignees.filter(id => id !== u._id) }))} />
                              <div className="avatar avatar-sm" style={{ background: u.color || '#6366f1' }}>{u.name?.[0]?.toUpperCase()}</div>
                              {u.name}
                              {selected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </label>
                          );
                        })
                      }
                    </div>
                  )}
                </div>

                <div className="input-group">
                  <label className="input-label">Tags <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(comma-separated)</span></label>
                  <input className="input" type="text" placeholder="frontend, bug, design"
                    value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="input-group">
                    <label className="input-label">Start Date</label>
                    <input className="input" type="date"
                      onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Estimated Hours</label>
                    <input className="input" type="number" placeholder="0" min="0"
                      value={form.estimatedHours}
                      onChange={e => setForm(p => ({ ...p, estimatedHours: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {/* ── ATTACHMENTS TAB (online only) ── */}
            {activeTab === 'attachments' && isOnline && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>💡</span> Files will be uploaded after the task is created.
                </div>

                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '28px 16px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s', background: dragOver ? 'var(--accent-dim)' : 'transparent' }}>
                  <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={e => { addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
                  <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>📎</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4 }}>Click or drag files here</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Images, PDF, Word, text — max 10MB each</div>
                </div>

                {queuedFiles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {queuedFiles.length} file{queuedFiles.length > 1 ? 's' : ''} queued
                    </div>
                    {queuedFiles.map((file, idx) => {
                      const status = uploadStatus[file.name];
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                          {file.type.startsWith('image/') ? (
                            <img src={URL.createObjectURL(file)} alt={file.name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>{fileIcon(file.type)}</div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{formatSize(file.size)}</div>
                          </div>
                          {status === 'uploading' && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />}
                          {status === 'done'      && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          {status === 'error'     && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>Failed</span>}
                          {!status && (
                            <button type="button" onClick={() => removeQueuedFile(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '0 2px', flexShrink: 0 }}>✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── ADVANCED TAB ── */}
            {activeTab === 'advanced' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {!isOnline && (
                  <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--yellow-dim)', border: '1px solid var(--yellow)', fontSize: '0.78rem', color: 'var(--yellow)' }}>
                    Recurring tasks are not available offline
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isOnline ? 'pointer' : 'not-allowed', fontSize: '0.82rem', color: 'var(--text-secondary)', opacity: isOnline ? 1 : 0.5 }}>
                  <input type="checkbox" checked={form.isRecurring} disabled={!isOnline}
                    onChange={e => setForm(p => ({ ...p, isRecurring: e.target.checked }))} />
                  Recurring task
                </label>

                {form.isRecurring && isOnline && (
                  <div style={{ padding: 14, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="input-group">
                      <label className="input-label">Frequency</label>
                      <select className="input" value={form.recurringPattern.frequency}
                        onChange={e => setForm(p => ({ ...p, recurringPattern: { ...p.recurringPattern, frequency: e.target.value } }))}>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label className="input-label">Interval</label>
                      <input className="input" type="number" min="1" value={form.recurringPattern.interval}
                        onChange={e => setForm(p => ({ ...p, recurringPattern: { ...p.recurringPattern, interval: parseInt(e.target.value) } }))} />
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => dispatch(setCreateTaskModal(false))}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.title.trim()}
              style={{ background: !isOnline ? 'var(--yellow)' : undefined, borderColor: !isOnline ? 'var(--yellow)' : undefined }}>
              {loading ? (
                <><span className="spinner" style={{ width: 12, height: 12 }} /> {!isOnline ? 'Saving…' : queuedFiles.length > 0 ? 'Creating…' : 'Creating…'}</>
              ) : !isOnline ? (
                '💾 Save Offline'
              ) : queuedFiles.length > 0 ? (
                `Create Task + ${queuedFiles.length} file${queuedFiles.length > 1 ? 's' : ''}`
              ) : (
                'Create Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}