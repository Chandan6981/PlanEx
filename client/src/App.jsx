import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadUser, addNotification } from './store/slices/authSlice';
import { PlanExIcon } from './components/common/PlanExLogo';
import { fetchProjects, fetchAssignedProjects } from './store/slices/projectsSlice';
import { initSocket, getSocket, disconnectSocket } from './utils/socket';
import { taskUpdatedSocket, taskCreatedSocket, taskDeletedSocket } from './store/slices/tasksSlice';
import { updateProjectSocket } from './store/slices/projectsSlice';
import { showToast } from './store/slices/uiSlice';

import AuthPage        from './components/auth/AuthPage';
import Sidebar         from './components/layout/Sidebar';
import Dashboard       from './components/dashboard/Dashboard';
import MyTasks         from './components/tasks/MyTasks';
import ProjectPage     from './components/projects/ProjectPage';
import SearchPage      from './components/dashboard/SearchPage';
import CreateProjectModal from './components/projects/CreateProjectModal';
import CreateTaskModal    from './components/tasks/CreateTaskModal';
import TaskDetailPanel    from './components/tasks/TaskDetailPanel';
import Toast              from './components/ui/Toast';
import AnalyticsPage          from './components/analytics/AnalyticsPage';

import './styles/globals.css';

function ProtectedLayout() {
  const dispatch = useDispatch();
  const { createProjectModal, createTaskModal, taskDetailPanel } = useSelector(s => s.ui);
  const { user }            = useSelector(s => s.auth);
  const { list: projects }  = useSelector(s => s.projects);

  useEffect(() => {
    dispatch(fetchProjects());
    dispatch(fetchAssignedProjects());
  }, [dispatch]);

  // Init socket once per login session
  useEffect(() => {
    if (!user) return;
    document.documentElement.setAttribute('data-theme', user.theme || 'dark');
    const token = localStorage.getItem('token');
    const socket = initSocket(token);

    // Global socket handlers — update Redux project task list
    socket.on('task:updated', (task) => dispatch(taskUpdatedSocket(task)));
    socket.on('task:created', (task) => dispatch(taskCreatedSocket(task)));
    socket.on('task:deleted', (id)   => dispatch(taskDeletedSocket(id)));
    socket.on('project:updated', (p) => dispatch(updateProjectSocket(p)));
    socket.on('notification:new', (n) => {
      dispatch(showToast({ message: n.message, type: 'info' }));
      dispatch(addNotification(n));
    });

    return () => disconnectSocket();
  }, [user, dispatch]);

  // Join project rooms whenever projects list loads/changes
  useEffect(() => {
    const socket = getSocket();
    if (!socket || projects.length === 0) return;
    projects.forEach(p => socket.emit('project:join', p._id));
  }, [projects]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/dashboard"      element={<Dashboard />} />
          <Route path="/my-tasks"       element={<MyTasks />} />
          <Route path="/projects/:id"   element={<ProjectPage />} />
          <Route path="/search"         element={<SearchPage />} />
          <Route path="/analytics"      element={<AnalyticsPage />} />
          <Route path="*"               element={<Navigate to="/dashboard" />} />
        </Routes>
      </main>
      {createProjectModal && <CreateProjectModal />}
      {createTaskModal    && <CreateTaskModal />}
      {taskDetailPanel    && <TaskDetailPanel taskId={taskDetailPanel} />}
      <Toast />
    </div>
  );
}

function AppRouter() {
  const dispatch = useDispatch();
  const { token, initialized, user } = useSelector(s => s.auth);

  useEffect(() => {
    if (token && !user) dispatch(loadUser());
  }, [token, dispatch, user]);

  if (token && !initialized) {
    return (
      <div className="loading-screen">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: '2rem' }}><PlanExIcon size={56} /></div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
            Plan<span style={{ color: '#6366F1' }}>Ex</span>
          </div>
          <div className="spinner" style={{ width: 20, height: 20 }} />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <AuthPage /> : <Navigate to="/dashboard" />} />
      <Route path="/*"     element={user  ? <ProtectedLayout /> : <Navigate to="/login" />} />
    </Routes>
  );
}

export default function App() {
  return <BrowserRouter><AppRouter /></BrowserRouter>;
}