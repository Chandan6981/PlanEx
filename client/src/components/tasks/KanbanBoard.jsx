import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { useDispatch } from 'react-redux';
import { updateTask, moveTaskOptimistic } from '../../store/slices/tasksSlice';
import { setTaskDetailPanel, setCreateTaskModal } from '../../store/slices/uiSlice';
import { getDueDateLabel, getDueDateStatus, priorityConfig, getInitials } from '../../utils/helpers';

// Fix for react-beautiful-dnd + React 18:
// Droppable needs to be enabled AFTER first render to avoid the invariant crash
function StrictModeDroppable({ children, ...props }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);
  if (!enabled) return null;
  return <Droppable {...props}>{children}</Droppable>;
}

const DEFAULT_COLUMNS = [
  { id: 'todo',       name: 'To Do',       color: '#64748b' },
  { id: 'inprogress', name: 'In Progress', color: '#f59e0b' },
  { id: 'review',     name: 'In Review',   color: '#8b5cf6' },
  { id: 'done',       name: 'Done',        color: '#10b981' },
];

function TaskCard({ task, index }) {
  const dispatch = useDispatch();
  const dueStatus = getDueDateStatus(task.dueDate, task.status === 'done');
  const pc = priorityConfig[task.priority] || priorityConfig.none;
  const subtasksDone = task.subtasks?.filter(s => s.completed).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;

  return (
    <Draggable draggableId={task._id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`task-card priority-${task.priority}`}
          style={{
            ...provided.draggableProps.style,
            opacity: snapshot.isDragging ? 0.92 : 1,
            boxShadow: snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : undefined,
            userSelect: 'none',
          }}
          onMouseUp={() => {
            if (!snapshot.isDragging) {
              dispatch(setTaskDetailPanel(task._id));
            }
          }}
        >
          <div className="task-card-title">{task.title}</div>

          {task.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {task.tags.slice(0, 3).map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}

          {subtasksTotal > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Subtasks</span>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                  {subtasksDone}/{subtasksTotal}
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill"
                  style={{ width: `${(subtasksDone / subtasksTotal) * 100}%`, background: 'var(--green)' }} />
              </div>
            </div>
          )}

          <div className="task-card-meta">
            <span className={`badge badge-${task.priority}`} style={{ fontSize: '0.65rem' }}>
              {pc.label}
            </span>
            {task.dueDate && (
              <span className={`due-date ${dueStatus}`} style={{ fontSize: '0.65rem' }}>
                {getDueDateLabel(task.dueDate, task.status === 'done')}
              </span>
            )}
            {task.comments?.length > 0 && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                {task.comments.length}
              </span>
            )}
            {task.assignees?.length > 0 && (
              <div className="avatar-stack" style={{ marginLeft: 'auto' }}>
                {task.assignees.slice(0, 3).map(a => (
                  <div key={a._id} className="avatar avatar-xs"
                    style={{ background: a.color || '#6366f1' }} title={a.name}>
                    {getInitials(a.name)}
                  </div>
                ))}
                {task.assignees.length > 3 && (
                  <div className="avatar avatar-xs" style={{ background: 'var(--bg-active)', fontSize: '0.5rem' }}>
                    +{task.assignees.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

export default function KanbanBoard({ tasks, project }) {
  const dispatch = useDispatch();
  const columns = project?.columns?.length > 0 ? project.columns : DEFAULT_COLUMNS;

  const getColumnTasks = (colId) => tasks.filter(t => (t.column || t.status) === colId);

  const onDragEnd = (result) => {
    const { draggableId, destination, source } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newColumn = destination.droppableId;
    dispatch(moveTaskOptimistic({ taskId: draggableId, newColumn, newStatus: newColumn }));
    dispatch(updateTask({ id: draggableId, data: { column: newColumn, status: newColumn } }));
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="board-container">
        {[...columns].sort((a, b) => (a.order || 0) - (b.order || 0)).map(col => {
          const colTasks = getColumnTasks(col.id);
          return (
            <div key={col.id} className="board-column">
              <div className="board-column-header">
                <span className="status-dot" style={{ background: col.color }} />
                <span className="column-name">{col.name}</span>
                <span className="column-count">{colTasks.length}</span>
                <button
                  className="btn-icon"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => dispatch(setCreateTaskModal({ column: col.id, project: project?._id }))}
                  title="Add task">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </div>

              <StrictModeDroppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="board-column-body"
                    style={{
                      background: snapshot.isDraggingOver ? 'rgba(99,102,241,0.05)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {colTasks.length === 0 && !snapshot.isDraggingOver && (
                      <div
                        style={{
                          padding: '16px 8px', textAlign: 'center',
                          color: 'var(--text-muted)', fontSize: '0.72rem',
                          border: '1px dashed var(--border)',
                          borderRadius: 'var(--radius)', cursor: 'pointer',
                        }}
                        onClick={() => dispatch(setCreateTaskModal({ column: col.id, project: project?._id }))}>
                        No tasks
                      </div>
                    )}
                    {colTasks.map((task, idx) => (
                      <TaskCard key={task._id} task={task} index={idx} />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </StrictModeDroppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}