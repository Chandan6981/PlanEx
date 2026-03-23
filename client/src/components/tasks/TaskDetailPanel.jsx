import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTask, updateTask, deleteTask, addComment } from '../../store/slices/tasksSlice';
import { setTaskDetailPanel, showToast } from '../../store/slices/uiSlice';
import { priorityConfig, getInitials, formatDate, getDueDateStatus, getDueDateLabel, timeAgo } from '../../utils/helpers';
import { useSpeechToText, isSpeechSupported, isMediaRecSupported } from '../../hooks/useSpeechToText';
import MicButton from '../common/MicButton';
import api from '../../utils/api';

const isImage    = (mime) => mime?.startsWith('image/');
const fileIcon   = (mime) => {
  if (!mime) return '📄';
  if (mime.startsWith('image/'))  return '🖼️';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('word'))      return '📘';
  return '📝';
};
const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
};

export default function TaskDetailPanel({ taskId }) {
  const dispatch = useDispatch();
  const { selectedTask: task, loading } = useSelector(s => s.tasks);
  const { user } = useSelector(s => s.auth);

  // Permission — comes from server (_permission field) or computed locally as fallback
  const permission = task?._permission || (() => {
    if (!task || !user) return 'none';
    const uid       = user._id?.toString();
    const creatorId = (task.createdBy?._id || task.createdBy)?.toString();
    const isAssignee = (task.assignees || []).some(a => (a?._id || a)?.toString() === uid);
    if (creatorId === uid) return 'owner';
    if (isAssignee) return 'assignee';
    return 'none';
  })();

  const canEdit   = permission === 'owner';
  const canDelete = permission === 'owner';

  const [comment,      setComment]      = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal,     setTitleVal]     = useState('');
  const [newSubtask,   setNewSubtask]   = useState('');
  const [activeTab,    setActiveTab]    = useState('details');
  const [allUsers,       setAllUsers]       = useState([]);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [showPicker,     setShowPicker]     = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState('');
  const [deletingId,   setDeletingId]   = useState(null);
  const [dragOver,     setDragOver]     = useState(false);
  const pickerRef  = useRef(null);
  const fileInputRef = useRef(null);

  // Speech to text for comments
  const [activeField,   setActiveField]   = useState(null);
  const [pendingAudio,  setPendingAudio]  = useState(null); // { blob, mimeType, transcript, duration }
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const commentSpeech = useSpeechToText({
    fieldId:   'comment',
    activeField,
    setActiveField,
    onResult: ({ transcript, audioBlob, mimeType, duration }) => {
      // Always put transcript in comment box
      if (transcript) setComment(prev => prev ? `${prev} ${transcript}` : transcript);

      // If audio was recorded AND recording was long enough → offer choice
      if (audioBlob && duration >= 1 && isMediaRecSupported()) {
        setPendingAudio({ blob: audioBlob, mimeType, transcript, duration });
      } else if (!transcript) {
        dispatch(showToast({ message: "Couldn't hear anything. Please try again.", type: 'error' }));
      }
      // If no audio support → transcript already in box, user just clicks Send
    },
    onError: (msg) => dispatch(showToast({ message: msg, type: 'error' })),
  });

  const speechSupported    = isSpeechSupported();

  useEffect(() => { if (taskId) dispatch(fetchTask(taskId)); }, [taskId, dispatch]);
  useEffect(() => { if (task) setTitleVal(task.title); }, [task]);
  useEffect(() => { api.get('/users').then(r => setAllUsers(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false); setAssigneeSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!task || loading) return (
    <div className="task-detail-overlay" onClick={() => dispatch(setTaskDetailPanel(null))}>
      <div className="task-detail-panel" onClick={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    </div>
  );

  const dueStatus = getDueDateStatus(task.dueDate, task.status === 'done');
  const update    = (data) => dispatch(updateTask({ id: task._id, data }));

  const handleTitleSave = () => {
    if (titleVal.trim() && titleVal !== task.title) update({ title: titleVal });
    setEditingTitle(false);
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await dispatch(addComment({ id: task._id, data: { text: comment } }));
    setComment('');
  };

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      await api.post(`/tasks/${task._id}/subtasks`, { title: newSubtask.trim() });
      // Re-fetch task to get populated addedBy on the new subtask
      dispatch(fetchTask(task._id));
    } catch {
      dispatch(showToast({ message: 'Failed to add subtask', type: 'error' }));
    }
    setNewSubtask('');
  };

  const toggleSubtask = (subtaskId, completed) => {
    // Optimistic UI update — flip completed locally
    const updated = task.subtasks.map(s =>
      s._id === subtaskId ? { ...s, completed: !completed } : s
    );
    dispatch(updateTask({ id: task._id, data: { subtasks: updated.map(s => ({
      _id:       s._id,
      title:     s.title,
      completed: s.completed,
      // Send only the ID for addedBy — not the populated object
      addedBy:   s.addedBy?._id || s.addedBy || null,
      assignee:  s.assignee?._id || s.assignee || null,
    })) }}));
    // Also hit the specific subtask endpoint for accuracy
    api.put(`/tasks/${task._id}/subtasks/${subtaskId}`, { completed: !completed })
      .then(() => dispatch(fetchTask(task._id)))
      .catch(() => dispatch(fetchTask(task._id))); // re-fetch even on error to sync
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this task?')) return;
    await dispatch(deleteTask(task._id));
    dispatch(setTaskDetailPanel(null));
    dispatch(showToast({ message: 'Task deleted', type: 'info' }));
  };

  const toggleAssignee = (userId) => {
    const currentIds = (task.assignees || []).map(a => a._id || a);
    const alreadyIn  = currentIds.some(id => id.toString() === userId.toString());
    update({ assignees: alreadyIn
      ? currentIds.filter(id => id.toString() !== userId.toString())
      : [...currentIds, userId] });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError('File too large. Max 10MB.'); return; }
    setUploadError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/tasks/${task._id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      dispatch(fetchTask(task._id));
      dispatch(showToast({ message: 'File uploaded successfully', type: 'success' }));
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm('Delete this attachment?')) return;
    setDeletingId(attachmentId);
    try {
      await api.delete(`/tasks/${task._id}/attachments/${attachmentId}`);
      dispatch(fetchTask(task._id));
      dispatch(showToast({ message: 'Attachment deleted', type: 'info' }));
    } catch {
      dispatch(showToast({ message: 'Failed to delete', type: 'error' }));
    } finally { setDeletingId(null); }
  };

  const assigneeIds   = new Set((task.assignees || []).map(a => (a._id || a).toString()));
  const filteredUsers = allUsers.filter(u =>
    u.name.toLowerCase().includes(assigneeSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(assigneeSearch.toLowerCase())
  );
  const subtasksDone  = task.subtasks?.filter(s => s.completed).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const attachCount   = task.attachments?.length || 0;

  const TABS = [
    { key: 'details',     label: 'Details' },
    { key: 'attachments', label: attachCount > 0 ? `Files (${attachCount})` : 'Files' },
    { key: 'subtasks',    label: subtasksTotal > 0 ? `Subtasks (${subtasksDone}/${subtasksTotal})` : 'Subtasks' },
    { key: 'comments',    label: task.comments?.length > 0 ? `Comments (${task.comments.length})` : 'Comments' },
    { key: 'activity',    label: 'Activity' },
  ];

  return (
    <div className="task-detail-overlay" onClick={() => dispatch(setTaskDetailPanel(null))}>
      <div className="task-detail-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              {editingTitle && canEdit ? (
                <input className="input" value={titleVal} onChange={e => setTitleVal(e.target.value)}
                  onBlur={handleTitleSave} onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                  autoFocus style={{ fontSize: '1rem', fontWeight: 600 }} />
              ) : (
                <h3 style={{ fontSize: '1.1rem', lineHeight: 1.4,
                  cursor: canEdit ? 'pointer' : 'default',
                  wordBreak: 'break-word' }}
                  onClick={() => canEdit && setEditingTitle(true)}
                  title={canEdit ? 'Click to edit' : ''}>
                  {task.title}
                </h3>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {canDelete && (
                <button className="btn-icon" onClick={handleDelete} title="Delete task" style={{ color: 'var(--red)' }}>🗑️</button>
              )}
              <button className="btn-icon" onClick={() => dispatch(setTaskDetailPanel(null))} title="Close">✕</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 'auto', padding: '4px 28px 4px 8px', fontSize: '0.78rem' }}
              value={task.status} onChange={e => update({ status: e.target.value, column: e.target.value })}>
              <option value="todo">To Do</option>
              <option value="inprogress">In Progress</option>
              <option value="review">In Review</option>
              <option value="done">Done</option>
            </select>
            <select className="input" style={{ width: 'auto', padding: '4px 28px 4px 8px', fontSize: '0.78rem' }}
              value={task.priority}
              disabled={!canEdit}
              onChange={e => canEdit && update({ priority: e.target.value })}>
              <option value="none">⚪ No Priority</option>
              <option value="low">🟢 Low</option>
              <option value="medium">🟡 Medium</option>
              <option value="high">🟠 High</option>
              <option value="urgent">🔴 Urgent</option>
            </select>
            {task.dueDate && <span className={`due-date ${dueStatus}`}>📅 {getDueDateLabel(task.dueDate)}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
          {/* Role banner for assignees */}
          {permission === 'assignee' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', marginBottom: 10,
              background: 'var(--accent-dim)', border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', color: 'var(--accent)',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>You are an <strong>assignee</strong> — you can update status, add comments and subtasks. Editing other fields is restricted to the task creator.</span>
            </div>
          )}
          <div className="tabs">
            {TABS.map(t => (
              <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>

          {/* ── DETAILS ── */}
          {activeTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div className="input-label" style={{ marginBottom: 6 }}>Description</div>
                <textarea className="input" value={task.description || ''}
                  onChange={e => canEdit && update({ description: e.target.value })}
                  placeholder={canEdit ? 'Add a description...' : 'No description'}
                  rows={4}
                  readOnly={!canEdit}
                  style={{ cursor: canEdit ? 'text' : 'default', opacity: canEdit ? 1 : 0.75 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div className="input-label" style={{ marginBottom: 6 }}>Due Date</div>
                  <input className="input" type="date"
                    value={task.dueDate ? task.dueDate.split('T')[0] : ''}
                    onChange={e => canEdit && update({ dueDate: e.target.value })}
                    disabled={!canEdit} />
                </div>
                <div>
                  <div className="input-label" style={{ marginBottom: 6 }}>Estimated Hours</div>
                  <input className="input" type="number" value={task.estimatedHours || ''}
                    placeholder="0" min="0"
                    onChange={e => canEdit && update({ estimatedHours: e.target.value })}
                    disabled={!canEdit} />
                </div>
              </div>

              {/* Assignees */}
              <div>
                <div className="input-label" style={{ marginBottom: 8 }}>Assignees</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {task.assignees?.length > 0 ? task.assignees.map(a => (
                    <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', background: 'var(--bg-tertiary)', borderRadius: 20, fontSize: '0.8rem', border: '1px solid var(--border)' }}>
                      <div className="avatar avatar-sm" style={{ background: a.color || '#6366f1' }}>{getInitials(a.name)}</div>
                      <span>{a.name}</span>
                      {canEdit && (
                        <button onClick={() => toggleAssignee(a._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', fontSize: '0.75rem' }}>✕</button>
                      )}
                    </div>
                  )) : <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No assignees</span>}
                </div>
                {canEdit && (
                  <div ref={pickerRef} style={{ position: 'relative' }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => setShowPicker(v => !v)}>
                      + Assign person
                    </button>
                    {showPicker && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', width: 240, marginTop: 4 }}>
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                          <input className="input" placeholder="Search people…" value={assigneeSearch}
                            onChange={e => setAssigneeSearch(e.target.value)} autoFocus style={{ fontSize: '0.78rem', padding: '5px 8px' }} />
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {filteredUsers.map(u => {
                            const assigned = assigneeIds.has(u._id.toString());
                            return (
                              <div key={u._id} onClick={() => toggleAssignee(u._id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: assigned ? 'var(--accent-dim)' : 'transparent' }}>
                                <div className="avatar avatar-sm" style={{ background: u.color || '#6366f1', flexShrink: 0 }}>{getInitials(u.name)}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{u.name}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{u.email}</div>
                                </div>
                                {assigned && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="input-label" style={{ marginBottom: 6 }}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {task.tags?.length > 0 ? task.tags.map(t => <span key={t} className="tag">{t}</span>)
                    : <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No tags</span>}
                </div>
              </div>
              <div>
                <div className="input-label" style={{ marginBottom: 4 }}>Created</div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {formatDate(task.createdAt)} by {task.createdBy?.name}
                </span>
              </div>
            </div>
          )}

          {/* ── ATTACHMENTS ── */}
          {activeTab === 'attachments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && fileInputRef.current) {
                    const dt = new DataTransfer(); dt.items.add(file);
                    fileInputRef.current.files = dt.files;
                    handleFileChange({ target: fileInputRef.current });
                  }
                }}
                style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '24px 16px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', transition: 'border-color 0.2s', opacity: uploading ? 0.6 : 1 }}>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.txt" onChange={handleFileChange} />
                {uploading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    <span style={{ fontSize: '0.85rem' }}>Uploading…</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📎</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4 }}>Click or drag file to upload</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Images, PDF, Word, text — max 10MB</div>
                  </>
                )}
              </div>
              {uploadError && (
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--red-dim)', border: '1px solid var(--red)', fontSize: '0.8rem', color: 'var(--red)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{uploadError}</span>
                  <button onClick={() => setUploadError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>✕</button>
                </div>
              )}
              {!task.attachments?.length ? (
                <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No files yet — upload one above</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {task.attachments.map(att => (
                    <div key={att._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      {isImage(att.mimetype) ? (
                        <img src={att.url} alt={att.originalName} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, flexShrink: 0, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                          {fileIcon(att.mimetype)}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.originalName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{formatSize(att.size)}{att.uploadedAt && ` · ${timeAgo(att.uploadedAt)}`}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <a href={att.url} target="_blank" rel="noopener noreferrer" download={att.originalName}
                          style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                          {isImage(att.mimetype) ? 'View' : 'Download'}
                        </a>
                        {canDelete && (
                          <button onClick={() => handleDeleteAttachment(att._id)} disabled={deletingId === att._id}
                            style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--red)', cursor: 'pointer', opacity: deletingId === att._id ? 0.5 : 1 }}>
                            {deletingId === att._id ? '…' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SUBTASKS ── */}
          {activeTab === 'subtasks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {subtasksTotal > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div className="progress-fill" style={{ width: `${(subtasksDone / subtasksTotal) * 100}%`, background: 'var(--emerald)' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    {subtasksDone} of {subtasksTotal} completed
                  </span>
                </div>
              )}
              {task.subtasks?.map(s => (
                <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                  <div className={`checkbox ${s.completed ? 'checked' : ''}`} onClick={() => toggleSubtask(s._id, s.completed)}>
                    {s.completed && <span style={{ color: '#fff', fontSize: '0.6rem' }}>✓</span>}
                  </div>
                  <span style={{ flex: 1, fontSize: '0.875rem', textDecoration: s.completed ? 'line-through' : 'none', color: s.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                    {s.title}
                  </span>
                  {/* Show who added this subtask */}
                  {s.addedBy && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <div
                        className="avatar"
                        style={{ width: 18, height: 18, fontSize: '0.55rem', background: s.addedBy.color || '#6366f1', flexShrink: 0 }}
                        title={`Added by ${s.addedBy.name}`}>
                        {getInitials(s.addedBy.name)}
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {s.addedBy.name}
                      </span>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input className="input" placeholder="Add subtask..." value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubtask()} />
                <button className="btn btn-secondary btn-sm" onClick={addSubtask} type="button">Add</button>
              </div>
            </div>
          )}

          {/* ── COMMENTS ── */}
          {activeTab === 'comments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {task.comments?.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  No comments yet. Be the first to comment!
                </div>
              )}

              {task.comments?.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <div className="avatar avatar-sm" style={{ background: c.author?.color || '#6366f1', flexShrink: 0, marginTop: 2 }}>
                    {getInitials(c.author?.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{c.author?.name}</span>
                      {c.isVoice && (
                        <span style={{ fontSize: '0.65rem', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 10, fontWeight: 500 }}>
                          🎤 Voice
                        </span>
                      )}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{timeAgo(c.createdAt)}</span>
                    </div>

                    {/* Audio player for voice comments */}
                    {c.isVoice && c.audioUrl && (
                      <div style={{ marginBottom: 6 }}>
                        <audio
                          controls
                          src={c.audioUrl}
                          style={{
                            width: '100%', height: 36,
                            borderRadius: 'var(--radius-sm)',
                            outline: 'none',
                          }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>
                    )}

                    {/* Text / transcript */}
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-tertiary)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      {c.text}
                    </div>
                  </div>
                </div>
              ))}

              {/* ── Choice dialog — shown after voice recording ── */}
              {pendingAudio && (
                <div style={{
                  padding: '14px', borderRadius: 'var(--radius)',
                  background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    🎤 Recording ready ({Math.round(pendingAudio.duration)}s)
                  </div>
                  {pendingAudio.transcript && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      "{pendingAudio.transcript}"
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    How do you want to send this comment?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* Send as Audio */}
                    <button
                      type="button"
                      disabled={uploadingAudio}
                      onClick={async () => {
                        setUploadingAudio(true);
                        try {
                          // Upload audio blob to S3
                          const ext      = pendingAudio.mimeType.includes('ogg') ? '.ogg' : pendingAudio.mimeType.includes('mp4') ? '.mp4' : '.webm';
                          const audioFile = new File([pendingAudio.blob], `voice${ext}`, { type: pendingAudio.mimeType });
                          const formData  = new FormData();
                          formData.append('audio',      audioFile);
                          formData.append('transcript', pendingAudio.transcript || '');

                          const r = await api.post(`/tasks/${task._id}/comments/voice`, formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          });
                          dispatch(fetchTask(task._id));
                          setPendingAudio(null);
                          setComment('');
                          dispatch(showToast({ message: '🎤 Voice comment sent', type: 'success' }));
                        } catch (err) {
                          // S3 failed — fall back to text automatically
                          dispatch(showToast({ message: 'Audio upload failed — sending as text', type: 'error' }));
                          // Send as text fallback
                          if (pendingAudio.transcript) {
                            await dispatch(addComment({ id: task._id, data: { text: pendingAudio.transcript } }));
                          }
                          setPendingAudio(null);
                          setComment('');
                        } finally {
                          setUploadingAudio(false);
                        }
                      }}
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {uploadingAudio ? (
                        <><span className="spinner" style={{ width: 11, height: 11 }} /> Uploading…</>
                      ) : '🎤 Send as Audio'}
                    </button>

                    {/* Send as Text */}
                    <button
                      type="button"
                      disabled={uploadingAudio}
                      onClick={async () => {
                        const textToSend = comment.trim() || pendingAudio.transcript;
                        if (textToSend) {
                          await dispatch(addComment({ id: task._id, data: { text: textToSend } }));
                        }
                        setPendingAudio(null);
                        setComment('');
                      }}
                      className="btn btn-secondary btn-sm">
                      📝 Send as Text
                    </button>

                    {/* Discard */}
                    <button
                      type="button"
                      disabled={uploadingAudio}
                      onClick={() => { setPendingAudio(null); }}
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {/* ── Comment input ── */}
              {!pendingAudio && (
                <form onSubmit={handleCommentSubmit} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <div className="avatar avatar-sm" style={{ background: user?.color || '#6366f1', flexShrink: 0, marginTop: 2 }}>
                    {getInitials(user?.name)}
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                    <textarea className="input" placeholder={commentSpeech.listening ? '🎤 Listening…' : 'Write a comment...'} value={comment}
                      onChange={e => setComment(e.target.value)} rows={2} style={{ resize: 'none', flex: 1 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      {speechSupported && (
                        <MicButton
                          listening={commentSpeech.listening}
                          onStart={commentSpeech.start}
                          disabled={false}
                        />
                      )}
                      <button className="btn btn-primary btn-sm" type="submit"
                        disabled={!comment.trim()} style={{ flexShrink: 0 }}>
                        Send
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ── ACTIVITY ── */}
          {activeTab === 'activity' && (
            <div>
              {!task.activityLog?.length ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No activity yet</p>
              ) : (
                task.activityLog.slice().reverse().map((log, i) => (
                  <div key={i} className="activity-item">
                    <div className="activity-line">
                      <div className="activity-dot" style={{ background: 'var(--accent)' }} />
                      {i < task.activityLog.length - 1 && <div className="activity-connector" />}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 12 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{log.user?.name || 'Someone'}</strong>
                        {' '}{log.action === 'uploaded' ? 'uploaded' : 'changed'} <strong>{log.field}</strong>
                        {log.action !== 'uploaded' && (
                          <> from{' '}
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--rose)' }}>{log.oldValue || 'empty'}</span>
                            {' '}to{' '}
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--emerald)' }}>{log.newValue}</span>
                          </>
                        )}
                        {log.action === 'uploaded' && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--emerald)' }}> {log.newValue}</span>
                        )}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{timeAgo(log.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}