const mongoose = require('mongoose');
const { TASK_STATUS, TASK_PRIORITY } = require('../constants');
const Task    = require('../models/Task');
const Project = require('../models/Project');

const getDashboard = async (req, res, next) => {
  try {
    const userId    = new mongoose.Types.ObjectId(req.user._id);
    const userIdStr = req.user._id.toString();
    const now       = new Date();
    const today     = new Date(now); today.setHours(0, 0, 0, 0);
    const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const nextWeek  = new Date(today); nextWeek.setDate(today.getDate() + 7);

    // ── 1. Get user's projects ───────────────────────────────────────────────
    const projects = await Project.find({
      $or: [{ owner: userId }, { 'members.user': userId }],
      status: { $ne: 'archived' }
    }).select('_id name color icon');

    const projectIds = projects.map(p => p._id);

    // ── 2. Build user task filter ────────────────────────────────────────────
    // A task "belongs" to the user if:
    //   - it is in one of their projects, OR
    //   - they created it, OR
    //   - they are an assignee
    // We match broadly then DEDUPLICATE immediately so every facet
    // downstream counts each task exactly once.
    const userTaskMatch = {
      $or: [
        { project: { $in: projectIds } },
        { createdBy: userId },
        { createdBy: userIdStr },
        { assignees: userId },
        { assignees: userIdStr },
      ]
    };

    // ── 3. Aggregation pipeline ──────────────────────────────────────────────
    const [result] = await Task.aggregate([
      // Broad match — may return duplicate docs for the same task
      { $match: userTaskMatch },

      // DEDUPLICATE — collapse duplicates to one doc per task _id
      // preserving all fields we need downstream
      { $group: {
        _id:       '$_id',
        status:    { $first: '$status' },
        priority:  { $first: '$priority' },
        title:     { $first: '$title' },
        dueDate:   { $first: '$dueDate' },
        createdAt: { $first: '$createdAt' },
        updatedAt: { $first: '$updatedAt' },
        project:   { $first: '$project' },
        assignees: { $first: '$assignees' },
        createdBy: { $first: '$createdBy' },
      }},

      // Now fan out into independent facets — each sees exactly one doc per task
      { $facet: {

        // ── Total / completed / urgent counts ──────────────────────────────
        // Scoped to user's own tasks only (assignee OR creator)
        overview: [
          { $match: {
            $or: [
              { assignees: userId },
              { assignees: userIdStr },
              { createdBy: userId },
              { createdBy: userIdStr },
            ]
          }},
          { $group: {
            _id:       null,
            total:     { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] } },
            urgent:    { $sum: { $cond: [{
              $and: [
                { $eq: ['$priority', TASK_PRIORITY.URGENT] },
                { $ne: ['$status', TASK_STATUS.DONE] }
              ]
            }, 1, 0] }}
          }}
        ],

        // ── My active tasks (assigned to me OR created by me, not done) ────
        activeTasks: [
          { $match: {
            $or: [
              { assignees: userId },
              { assignees: userIdStr },
              { createdBy: userId },
              { createdBy: userIdStr },
            ],
            status: { $ne: TASK_STATUS.DONE }
          }},
          { $count: 'count' }
        ],

        // ── Task count by status (for the bar chart) ───────────────────────
        // Only count tasks that belong to the user (assignee OR creator)
        // so the chart matches what My Tasks shows
        byStatus: [
          { $match: {
            $or: [
              { assignees: userId },
              { assignees: userIdStr },
              { createdBy: userId },
              { createdBy: userIdStr },
            ]
          }},
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],

        // ── Overdue tasks ──────────────────────────────────────────────────
        overdue: [
          { $match: {
            dueDate: { $lt: today },
            status:  { $ne: TASK_STATUS.DONE }
          }},
          { $count: 'count' }
        ],

        // ── Due today ─────────────────────────────────────────────────────
        dueToday: [
          { $match: {
            dueDate: { $gte: today, $lt: tomorrow },
            status:  { $ne: TASK_STATUS.DONE }
          }},
          { $count: 'count' }
        ],

        // ── Due this week ──────────────────────────────────────────────────
        dueThisWeek: [
          { $match: {
            dueDate: { $gte: today, $lt: nextWeek },
            status:  { $ne: TASK_STATUS.DONE }
          }},
          { $count: 'count' }
        ],

        // ── Per-project counts (for project progress cards) ────────────────
        perProject: [
          { $match: { project: { $in: projectIds } } },
          { $group: {
            _id:   '$project',
            total: { $sum: 1 },
            done:  { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] } }
          }}
        ],

        // ── High priority tasks (urgent + high, not done) ──────────────────
        recentTasks: [
          { $match: {
            $or: [
              { assignees: userId },
              { assignees: userIdStr },
              { createdBy: userId },
              { createdBy: userIdStr },
            ],
            status:   { $ne: TASK_STATUS.DONE },
            priority: { $in: [TASK_PRIORITY.URGENT, TASK_PRIORITY.HIGH] }
          }},
          { $addFields: {
            priorityRank: { $switch: {
              branches: [
                { case: { $eq: ['$priority', TASK_PRIORITY.URGENT] }, 'then': 4 },
                { case: { $eq: ['$priority', TASK_PRIORITY.HIGH]   }, 'then': 3 },
                { case: { $eq: ['$priority', 'medium'] },             'then': 2 },
                { case: { $eq: ['$priority', 'low']    },             'then': 1 },
              ],
              default: 0
            }}
          }},
          { $sort: { priorityRank: -1, dueDate: 1, createdAt: -1 } },
          { $limit: 10 },
          { $lookup: {
            from: 'projects', localField: 'project', foreignField: '_id', as: 'project'
          }},
          { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
          { $lookup: {
            from: 'users', localField: 'assignees', foreignField: '_id', as: 'assignees',
            pipeline: [{ $project: { name: 1, color: 1, avatar: 1 } }]
          }}
        ]

      }}
    ]);

    // ── 4. Reshape results ───────────────────────────────────────────────────
    const overview = result?.overview[0] || {};

    // Build byStatus map with defaults
    const byStatus = { todo: 0, inprogress: 0, review: 0, done: 0 };
    (result?.byStatus || []).forEach(s => {
      if (s._id) byStatus[s._id] = s.count;
    });

    const total          = overview.total || 0;
    const completionRate = total > 0
      ? Math.round((byStatus.done / total) * 100)
      : 0;

    const stats = {
      totalProjects:  projects.length,
      totalTasks:     total,
      myTasks:        result?.activeTasks[0]?.count  || 0,
      completedTasks: overview.completed             || 0,
      urgentTasks:    overview.urgent                || 0,
      overdueTasks:   result?.overdue[0]?.count      || 0,
      dueTodayTasks:  result?.dueToday[0]?.count     || 0,
      dueThisWeek:    result?.dueThisWeek[0]?.count  || 0,
      completionRate,
      byStatus,
    };

    // Build project progress cards
    const countMap = {};
    (result?.perProject || []).forEach(p => {
      countMap[p._id.toString()] = p;
    });

    const projectStats = projects.slice(0, 6).map(p => {
      const c = countMap[p._id.toString()];
      return {
        _id:      p._id,
        name:     p.name,
        color:    p.color,
        icon:     p.icon,
        total:    c?.total || 0,
        done:     c?.done  || 0,
        progress: c?.total > 0
          ? Math.round((c.done / c.total) * 100)
          : 0
      };
    });

    res.json({
      stats,
      recentTasks:  result?.recentTasks  || [],
      projectStats,
    });

  } catch (err) { next(err); }
};

module.exports = { getDashboard };