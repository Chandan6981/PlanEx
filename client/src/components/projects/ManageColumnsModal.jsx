import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { showToast } from '../../store/slices/uiSlice';
import { updateProjectColumns } from '../../store/slices/projectsSlice';
import api from '../../utils/api';

const DEFAULT_IDS    = ['todo', 'inprogress', 'review', 'done'];
const MAX_CUSTOM     = 10;
const MAX_NAME_LEN   = 30;

const PRESET_COLORS = [
  '#6366f1','#22c55e','#f97316','#ef4444',
  '#3b82f6','#a855f7','#ec4899','#14b8a6',
  '#f59e0b','#64748b','#8b5cf6','#10b981',
];

// Generate a unique id for a custom column
const genId = (name) => {
  const slug   = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
  const random = Math.random().toString(36).slice(2, 7);
  return `${slug}_${random}`;
};

// StrictMode-safe Droppable
function SafeDroppable({ children, ...props }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEnabled(true));
    return () => { cancelAnimationFrame(id); setEnabled(false); };
  }, []);
  if (!enabled) return null;
  return <Droppable {...props}>{children}</Droppable>;
}

export default function ManageColumnsModal({ project, onClose }) {
  const dispatch = useDispatch();

  // Separate defaults and custom columns
  const initialDefaults = (project.columns || [])
    .filter(c => DEFAULT_IDS.includes(c.id))
    .sort((a, b) => DEFAULT_IDS.indexOf(a.id) - DEFAULT_IDS.indexOf(b.id));

  const initialCustom = (project.columns || [])
    .filter(c => !DEFAULT_IDS.includes(c.id))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const [defaults, setDefaults]   = useState(initialDefaults);
  const [customs,  setCustoms]    = useState(initialCustom);
  const [newName,  setNewName]    = useState('');
  const [newColor,      setNewColor]      = useState('#6366f1');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editVal,   setEditVal]   = useState('');
  const [errors,    setErrors]    = useState({});
  const [saving,    setSaving]    = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes — simpler and more reliable
  useEffect(() => {
    const origCustom = JSON.stringify(initialCustom.map(c => `${c.id}|${c.name}|${c.color}|${c.order}`));
    const currCustom = JSON.stringify(customs.map((c, i) => `${c.id}|${c.name}|${c.color}|${i}`));
    const origDef    = JSON.stringify(initialDefaults.map(c => c.id));
    const currDef    = JSON.stringify(defaults.map(c => c.id));
    setHasChanges(origCustom !== currCustom || origDef !== currDef);
  }, [customs, defaults]);

  // ── Reorder defaults ──────────────────────────────────────────────────────
  const onDragDefaultEnd = (result) => {
    if (!result.destination) return;
    const items = [...defaults];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setDefaults(items);
    setHasChanges(true);
  };

  // ── Reorder custom columns ────────────────────────────────────────────────
  const onDragCustomEnd = (result) => {
    if (!result.destination) return;
    const items = [...customs];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setCustoms(items);
    setHasChanges(true);
  };

  // ── Add new custom column ─────────────────────────────────────────────────
  const handleAdd = () => {
    const name = newName.trim();
    setErrors({});

    if (!name) {
      setErrors({ add: 'Column name is required' });
      return;
    }
    if (name.length > MAX_NAME_LEN) {
      setErrors({ add: `Name too long (max ${MAX_NAME_LEN} chars)` });
      return;
    }
    if (customs.length >= MAX_CUSTOM) {
      setErrors({ add: `Maximum ${MAX_CUSTOM} custom columns allowed` });
      return;
    }

    // Duplicate check (case-insensitive, against all columns)
    const allNames = [
      ...defaults.map(c => c.name.toLowerCase()),
      ...customs.map(c => c.name.toLowerCase()),
    ];
    if (allNames.includes(name.toLowerCase())) {
      setErrors({ add: 'A column with this name already exists' });
      return;
    }

    // Prevent custom name matching a default id
    if (DEFAULT_IDS.includes(name.toLowerCase().replace(/\s/g, ''))) {
      setErrors({ add: 'This name is reserved. Please choose another.' });
      return;
    }

    const newCol = { id: genId(name), name, color: newColor, order: customs.length };
    setCustoms(prev => [...prev, newCol]);
    setNewName('');
    setNewColor('#6366f1');
    setHasChanges(true);
  };

  // ── Start renaming ────────────────────────────────────────────────────────
  const startEdit = (col) => {
    setEditingId(col.id);
    setEditVal(col.name);
    setErrors({});
  };

  // ── Save rename ───────────────────────────────────────────────────────────
  const saveEdit = (colId) => {
    const name = editVal.trim();
    setErrors({});

    if (!name) {
      setErrors({ [colId]: 'Name cannot be empty' });
      return;
    }
    if (name.length > MAX_NAME_LEN) {
      setErrors({ [colId]: `Max ${MAX_NAME_LEN} characters` });
      return;
    }

    // Duplicate check against all OTHER columns
    const allNames = [
      ...defaults.map(c => c.name.toLowerCase()),
      ...customs.filter(c => c.id !== colId).map(c => c.name.toLowerCase()),
    ];
    if (allNames.includes(name.toLowerCase())) {
      setErrors({ [colId]: 'Name already exists' });
      return;
    }

    setCustoms(prev => prev.map(c => c.id === colId ? { ...c, name } : c));
    setEditingId(null);
    setEditVal('');
    setHasChanges(true);
  };

  const cancelEdit = () => { setEditingId(null); setEditVal(''); setErrors({}); };

  // ── Delete custom column ──────────────────────────────────────────────────
  const handleDelete = (col) => {
    setCustoms(prev => prev.filter(c => c.id !== col.id));
    setHasChanges(true);
  };

  // ── Save to server ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!hasChanges) { onClose(); return; }
    setSaving(true);
    try {
      // Build final columns: defaults first (in user order), then custom
      const finalColumns = [
        ...defaults.map((c, i) => ({ ...c, order: i })),
        ...customs.map((c, i) => ({ ...c, order: defaults.length + i })),
      ];

      const r = await api.put(`/projects/${project._id}/columns`, { columns: finalColumns });
      dispatch(updateProjectColumns({ projectId: project._id, columns: r.data.project.columns }));

      if (r.data.migratedTasks) {
        dispatch(showToast({
          message: `Columns saved. Tasks from deleted columns moved to To Do.`,
          type: 'info'
        }));
      } else {
        dispatch(showToast({ message: 'Columns updated successfully', type: 'success' }));
      }
      onClose();
    } catch (err) {
      dispatch(showToast({
        message: err.response?.data?.message || 'Failed to save columns',
        type: 'error'
      }));
    } finally {
      setSaving(false);
    }
  };

  // ── Close with unsaved changes warning ────────────────────────────────────
  const handleClose = () => {
    if (hasChanges && !window.confirm('You have unsaved changes. Discard them?')) return;
    onClose();
  };

  const allColumnCount = defaults.length + customs.length;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h3>Manage Columns</h3>
          <button className="btn-icon" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-body" style={{ paddingTop: 4, maxHeight: '70vh', overflowY: 'auto' }}>

          {/* ── Default columns ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
              Default Columns
            </div>
            <DragDropContext onDragEnd={onDragDefaultEnd}>
              <SafeDroppable droppableId="defaults">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {defaults.map((col, idx) => (
                      <Draggable key={col.id} draggableId={`def_${col.id}`} index={idx}>
                        {(prov, snap) => (
                          <div ref={prov.innerRef} {...prov.draggableProps}
                            style={{
                              ...prov.draggableProps.style,
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 12px',
                              background: snap.isDragging ? 'var(--bg-active)' : 'var(--bg-tertiary)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                            }}>
                            {/* Drag handle */}
                            <div {...prov.dragHandleProps}
                              style={{ color: 'var(--text-muted)', cursor: 'grab', fontSize: '0.9rem', flexShrink: 0 }}>
                              ⋮⋮
                            </div>
                            {/* Color dot */}
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                            {/* Name */}
                            <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 500 }}>{col.name}</span>
                            {/* Lock badge */}
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-active)', padding: '2px 7px', borderRadius: 10, letterSpacing: '0.04em' }}>
                              🔒 locked
                            </span>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </SafeDroppable>
            </DragDropContext>
          </div>

          {/* ── Custom columns ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
              Custom Columns {customs.length > 0 && `(${customs.length}/${MAX_CUSTOM})`}
            </div>

            {customs.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)' }}>
                No custom columns yet — add one below
              </div>
            ) : (
              <DragDropContext onDragEnd={onDragCustomEnd}>
                <SafeDroppable droppableId="customs">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {customs.map((col, idx) => (
                        <Draggable key={col.id} draggableId={col.id} index={idx}>
                          {(prov, snap) => (
                            <div ref={prov.innerRef} {...prov.draggableProps}
                              style={{
                                ...prov.draggableProps.style,
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 12px',
                                background: snap.isDragging ? 'var(--bg-active)' : 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                                border: `1px solid ${snap.isDragging ? 'var(--accent)' : 'var(--border)'}`,
                              }}>

                              {/* Drag handle */}
                              <div {...prov.dragHandleProps}
                                style={{ color: 'var(--text-muted)', cursor: 'grab', fontSize: '0.9rem', flexShrink: 0 }}>
                                ⋮⋮
                              </div>

                              {/* Color dot */}
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, flexShrink: 0 }} />

                              {/* Name or edit input */}
                              {editingId === col.id ? (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <input
                                      className="input"
                                      value={editVal}
                                      onChange={e => setEditVal(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') saveEdit(col.id);
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      autoFocus
                                      style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem' }}
                                      maxLength={MAX_NAME_LEN}
                                    />
                                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(col.id)} style={{ padding: '3px 10px' }}>✓</button>
                                    <button className="btn btn-ghost btn-sm" onClick={cancelEdit} style={{ padding: '3px 8px' }}>✕</button>
                                  </div>
                                  {errors[col.id] && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>{errors[col.id]}</span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 500 }}>{col.name}</span>
                              )}

                              {/* Edit + Delete buttons */}
                              {editingId !== col.id && (
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                  <button
                                    className="btn-icon"
                                    onClick={() => startEdit(col)}
                                    title="Rename"
                                    style={{ width: 26, height: 26 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                  </button>
                                  <button
                                    className="btn-icon"
                                    onClick={() => handleDelete(col)}
                                    title="Delete column"
                                    style={{ width: 26, height: 26, color: 'var(--red)' }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                                      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </SafeDroppable>
              </DragDropContext>
            )}
          </div>

          {/* ── Add new column ── */}
          {customs.length < MAX_CUSTOM && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                Add Custom Column
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Color picker */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div
                    style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: newColor, border: '2px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => setShowColorPicker(v => !v)}
                    title="Pick color"
                  />
                  {showColorPicker && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, width: 120, boxShadow: 'var(--shadow-lg)' }}>
                      {PRESET_COLORS.map(col => (
                        <div key={col} onClick={() => { setNewColor(col); setShowColorPicker(false); }}
                          style={{ width: 22, height: 22, borderRadius: '50%', background: col, cursor: 'pointer', border: newColor === col ? '2px solid var(--text-primary)' : '2px solid transparent', transition: 'border 0.1s' }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Name input */}
                <input
                  className="input"
                  placeholder="Column name…"
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setErrors({}); }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  maxLength={MAX_NAME_LEN}
                  style={{ flex: 1 }}
                />

                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleAdd}
                  disabled={!newName.trim()}
                  style={{ flexShrink: 0 }}>
                  + Add
                </button>
              </div>
              {errors.add && (
                <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 6 }}>{errors.add}</div>
              )}
            </div>
          )}

          {/* Max columns reached */}
          {customs.length >= MAX_CUSTOM && (
            <div style={{ padding: '10px 12px', background: 'var(--yellow-dim)', border: '1px solid var(--yellow)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--yellow)' }}>
              Maximum {MAX_CUSTOM} custom columns reached. Delete one to add another.
            </div>
          )}

        </div>

        <div className="modal-footer">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flex: 1 }}>
            {allColumnCount} total column{allColumnCount !== 1 ? 's' : ''}
            {hasChanges && <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>● Unsaved changes</span>}
          </div>
          <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}