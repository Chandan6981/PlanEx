import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../utils/api';

export const fetchProjects = createAsyncThunk('projects/fetchAll', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/projects');
    return res.data;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const fetchAssignedProjects = createAsyncThunk('projects/fetchAssigned', async (_, { rejectWithValue }) => {
  try {
    const res = await api.get('/projects/assigned');
    return res.data;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const createProject = createAsyncThunk('projects/create', async (data, { rejectWithValue }) => {
  try {
    const res = await api.post('/projects', data);
    return res.data;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const updateProject = createAsyncThunk('projects/update', async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await api.put(`/projects/${id}`, data);
    return res.data;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const deleteProject = createAsyncThunk('projects/delete', async (id, { rejectWithValue }) => {
  try {
    await api.delete(`/projects/${id}`);
    return id;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const fetchProjectStats = createAsyncThunk('projects/stats', async (id, { rejectWithValue }) => {
  try {
    const res = await api.get(`/projects/${id}/stats`);
    return { id, stats: res.data };
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

const projectsSlice = createSlice({
  name: 'projects',
  initialState: {
    list:           [],   // projects user owns
    assigned:       [],   // projects user is assigned tasks in
    current:        null,
    stats:          {},
    loading:        false,
    assignedLoading: false,
    error:          null,
  },
  reducers: {
    setCurrentProject: (state, action) => { state.current = action.payload; },
    updateProjectSocket: (state, action) => {
      const idx = state.list.findIndex(p => p._id === action.payload._id);
      if (idx !== -1) state.list[idx] = action.payload;
      const aidx = state.assigned.findIndex(p => p._id === action.payload._id);
      if (aidx !== -1) state.assigned[aidx] = action.payload;
    },
    updateProjectColumns: (state, action) => {
      const { projectId, columns } = action.payload;
      const idx = state.list.findIndex(p => p._id === projectId);
      if (idx !== -1) state.list[idx] = { ...state.list[idx], columns };
      const aidx = state.assigned.findIndex(p => p._id === projectId);
      if (aidx !== -1) state.assigned[aidx] = { ...state.assigned[aidx], columns };
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending,  (state) => { state.loading = true; })
      .addCase(fetchProjects.fulfilled,(state, action) => {
        state.loading = false;
        state.list    = action.payload;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false;
        state.error   = action.payload;
      })
      .addCase(fetchAssignedProjects.pending,  (state) => { state.assignedLoading = true; })
      .addCase(fetchAssignedProjects.fulfilled,(state, action) => {
        state.assignedLoading = false;
        state.assigned        = action.payload;
      })
      .addCase(fetchAssignedProjects.rejected, (state) => { state.assignedLoading = false; })
      .addCase(createProject.fulfilled, (state, action) => {
        state.list.unshift(action.payload);
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const idx = state.list.findIndex(p => p._id === action.payload._id);
        if (idx !== -1) state.list[idx] = action.payload;
        if (state.current?._id === action.payload._id) state.current = action.payload;
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.list     = state.list.filter(p => p._id !== action.payload);
        state.assigned = state.assigned.filter(p => p._id !== action.payload);
      })
      .addCase(fetchProjectStats.fulfilled, (state, action) => {
        state.stats[action.payload.id] = action.payload.stats;
      });
  }
});

export const { setCurrentProject, updateProjectSocket, updateProjectColumns } = projectsSlice.actions;
export default projectsSlice.reducer;