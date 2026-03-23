const mongoose = require('mongoose');
const { emitProject }  = require('../socket/socketHelpers');
const { TASK_STATUS }  = require('../constants');
const Project  = require('../models/Project');
const Task     = require('../models/Task');

const POPULATE_USER = 'name email color avatar';

const getAllProjects = async (req, res, next) => {
  try {
    const projects = await Project.find({
      $or: [{ owner: req.user._id }, { 'members.user': req.user._id }],
      status: { $ne: 'archived' }
    }).populate('owner',        POPULATE_USER)
      .populate('members.user', POPULATE_USER)
      .sort({ updatedAt: -1 });

    const projectIds = projects.map(p => p._id);
    const taskCounts = await Task.aggregate([
      { $match: { project: { $in: projectIds } } },
      { $group: {
          _id:            '$project',
          totalTasks:     { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] } }
      }}
    ]);

    const countMap = {};
    taskCounts.forEach(c => { countMap[c._id.toString()] = c; });

    const projectsWithCounts = projects.map(p => ({
      ...p.toObject(),
      totalTasks:     countMap[p._id.toString()]?.totalTasks     || 0,
      completedTasks: countMap[p._id.toString()]?.completedTasks || 0,
    }));

    res.json(projectsWithCounts);
  } catch (err) { next(err); }
};

const createProject = async (req, res, next) => {
  try {
    const { name, description, color, icon, dueDate, isPrivate, tags } = req.body;
    const project = new Project({
      name, description, color, icon, dueDate, isPrivate, tags,
      owner:   req.user._id,
      members: [{ user: req.user._id, role: 'owner' }]
    });
    await project.save();
    await project.populate('owner',        POPULATE_USER);
    await project.populate('members.user', POPULATE_USER);
    res.status(201).json(project);
  } catch (err) { next(err); }
};

const getProject = async (req, res, next) => {
  try {
    // Find project — accessible if user is owner, member, OR has assigned tasks in it
    let project = await Project.findOne({
      _id: req.params.id,
      $or: [{ owner: req.user._id }, { 'members.user': req.user._id }]
    }).populate('owner',        POPULATE_USER)
      .populate('members.user', POPULATE_USER);

    // If not found as owner/member — check if user has assigned tasks in this project
    if (!project) {
      const hasAssignedTask = await Task.exists({
        project:   req.params.id,
        $or: [
          { assignees: req.user._id },
          { assignees: req.user._id.toString() }
        ]
      });
      if (!hasAssignedTask)
        return res.status(404).json({ message: 'Project not found' });

      // User has assigned tasks — give read-only access to project details
      project = await Project.findById(req.params.id)
        .populate('owner',        POPULATE_USER)
        .populate('members.user', POPULATE_USER);
    }

    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) { next(err); }
};

const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      $or: [{ owner: req.user._id }, { 'members.user': req.user._id }]
    });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const updated = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('owner',        POPULATE_USER)
      .populate('members.user', POPULATE_USER);

    emitProject(req.io, 'project:updated', updated);
    res.json(updated);
  } catch (err) { next(err); }
};

const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Only owner can delete
    if (project.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Only the project owner can delete it' });

    await Project.findByIdAndDelete(req.params.id);
    await Task.deleteMany({ project: req.params.id });
    res.json({ message: 'Project deleted' });
  } catch (err) { next(err); }
};

const addMember = async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $addToSet: { members: { user: userId, role: role || 'member' } } },
      { new: true }
    ).populate('members.user', POPULATE_USER);
    if (!project) return res.status(403).json({ message: 'Only the owner can add members' });
    res.json(project);
  } catch (err) { next(err); }
};

const getProjectStats = async (req, res, next) => {
  try {
    const projectId = new mongoose.Types.ObjectId(req.params.id);
    const now       = new Date();

    const [result] = await Task.aggregate([
      { $match: { project: projectId } },
      { $facet: {
          byStatus:  [{ $group: { _id: '$status',   count: { $sum: 1 } } }],
          byPriority:[{ $group: { _id: '$priority', count: { $sum: 1 } } }],
          overdue:   [
            { $match: { dueDate: { $lt: now }, status: { $ne: TASK_STATUS.DONE } } },
            { $count: 'count' }
          ],
          total: [{ $count: 'count' }]
      }}
    ]);

    const byStatus   = { todo: 0, inprogress: 0, review: 0, done: 0 };
    const byPriority = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
    (result.byStatus   || []).forEach(s => { byStatus[s._id]   = s.count; });
    (result.byPriority || []).forEach(p => { byPriority[p._id] = p.count; });

    const total          = result.total[0]?.count  || 0;
    const overdue        = result.overdue[0]?.count || 0;
    const completionRate = total > 0 ? Math.round((byStatus.done / total) * 100) : 0;

    res.json({ total, byStatus, byPriority, overdue, completionRate });
  } catch (err) { next(err); }
};

// ── PUT /api/projects/:id/columns ─────────────────────────────────────────────
const DEFAULT_COLUMN_IDS    = ['todo', 'inprogress', 'review', 'done'];
const DEFAULT_COLUMNS_DEF   = [
  { id: 'todo',       name: 'To Do',       color: '#64748b', order: 0 },
  { id: 'inprogress', name: 'In Progress', color: '#f59e0b', order: 1 },
  { id: 'review',     name: 'In Review',   color: '#8b5cf6', order: 2 },
  { id: 'done',       name: 'Done',        color: '#10b981', order: 3 },
];
const MAX_CUSTOM_COLUMNS = 10;

const updateColumns = async (req, res, next) => {
  try {
    const { columns } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!Array.isArray(columns) || columns.length === 0)
      return res.status(400).json({ message: 'Columns must be a non-empty array' });

    // All 4 defaults must be present
    const missingDefaults = DEFAULT_COLUMN_IDS.filter(id =>
      !columns.some(c => c.id === id)
    );
    if (missingDefaults.length > 0)
      return res.status(400).json({ message: `Default columns cannot be removed: ${missingDefaults.join(', ')}` });

    // Count custom columns
    const customCols = columns.filter(c => !DEFAULT_COLUMN_IDS.includes(c.id));
    if (customCols.length > MAX_CUSTOM_COLUMNS)
      return res.status(400).json({ message: `Maximum ${MAX_CUSTOM_COLUMNS} custom columns allowed` });

    // Check for duplicate IDs
    const ids = columns.map(c => c.id);
    if (new Set(ids).size !== ids.length)
      return res.status(400).json({ message: 'Duplicate column IDs found' });

    // Check for duplicate names (case-insensitive)
    const names = columns.map(c => c.name.trim().toLowerCase());
    if (new Set(names).size !== names.length)
      return res.status(400).json({ message: 'Column names must be unique' });

    // Validate each column
    for (const col of columns) {
      if (!col.id?.trim())   return res.status(400).json({ message: 'Each column must have an id' });
      if (!col.name?.trim()) return res.status(400).json({ message: 'Each column must have a name' });
    }

    // ── Force defaults to keep their original names and colors ────────────────
    const sanitized = columns.map((col, idx) => {
      if (DEFAULT_COLUMN_IDS.includes(col.id)) {
        const def = DEFAULT_COLUMNS_DEF.find(d => d.id === col.id);
        return { id: def.id, name: def.name, color: def.color, order: idx };
      }
      // Custom column — allow name and color, sanitize id
      return {
        id:    col.id.trim(),
        name:  col.name.trim().slice(0, 30), // max 30 chars
        color: col.color || '#6366f1',
        order: idx,
      };
    });

    // ── Get current project columns to find deleted custom ones ───────────────
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Only owner or admin can manage columns
    // Owner can always manage columns
    // Members with admin role can also manage columns
    const isOwner  = project.owner.toString() === req.user._id.toString();
    const isAdmin  = project.members.some(m =>
      (m.user?._id || m.user).toString() === req.user._id.toString() &&
      ['owner', 'admin'].includes(m.role)
    );
    if (!isOwner && !isAdmin)
      return res.status(403).json({ message: 'Only project owners and admins can manage columns' });

    // ── Find deleted custom columns ───────────────────────────────────────────
    const newColumnIds     = sanitized.map(c => c.id);
    const deletedColumnIds = project.columns
      .filter(c => !DEFAULT_COLUMN_IDS.includes(c.id) && !newColumnIds.includes(c.id))
      .map(c => c.id);

    // ── Migrate tasks from deleted columns to 'todo' ──────────────────────────
    if (deletedColumnIds.length > 0) {
      await Task.updateMany(
        { project: project._id, column: { $in: deletedColumnIds } },
        { $set: { column: 'todo', status: 'todo' } }
      );
    }

    // ── Save updated columns ──────────────────────────────────────────────────
    const updated = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: { columns: sanitized, updatedAt: new Date() } },
      { new: true }
    ).populate('owner', 'name email color')
     .populate('members.user', 'name email color');

    // Emit to all project members via socket
    if (req.io) {
      req.io.to(`project:${req.params.id}`).emit('project:updated', updated);
    }

    res.json({
      project:         updated,
      migratedTasks:   deletedColumnIds.length > 0,
      deletedColumns:  deletedColumnIds,
    });
  } catch (err) { next(err); }
};

// ── GET /api/projects/assigned ────────────────────────────────────────────────
const getAssignedProjects = async (req, res, next) => {
  try {
    const userId    = new mongoose.Types.ObjectId(req.user._id);
    const userIdStr = req.user._id.toString();

    const assignedTasks = await Task.find({
      $or: [{ assignees: userId }, { assignees: userIdStr }]
    }).select('project createdBy status').lean();

    const projectIdSet = new Set();
    assignedTasks.forEach(t => {
      if (!t.project) return;
      const creatorId = (t.createdBy?._id || t.createdBy)?.toString();
      if (creatorId === userIdStr) return;
      projectIdSet.add(t.project.toString());
    });

    if (projectIdSet.size === 0) return res.json([]);

    const projects = await Project.find({
      _id:   { $in: [...projectIdSet] },
      owner: { $ne: userId }
    })
      .populate('owner',        'name email color')
      .populate('members.user', 'name email color')
      .lean();

    const result = projects.map(p => {
      const myTasks = assignedTasks.filter(t =>
        t.project?.toString() === p._id.toString()
      );
      return {
        ...p,
        myAssignedCount:    myTasks.length,
        myActiveTasks:      myTasks.filter(t => t.status !== 'done').length,
        _isAssignedProject: true,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
};

module.exports = {
  getAllProjects, createProject, getProject,
  updateProject, deleteProject, addMember, getProjectStats, updateColumns,
  getAssignedProjects
};