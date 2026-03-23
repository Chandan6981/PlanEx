const mongoose = require('mongoose');
const { TASK_STATUS } = require('../constants');
const Task    = require('../models/Task');
const Project = require('../models/Project');

// ── GET /api/analytics/personal ──────────────────────────────────────────────
const getPersonalAnalytics = async (req, res, next) => {
  try {
    const userId    = new mongoose.Types.ObjectId(req.user._id);
    const userIdStr = req.user._id.toString();

    const now   = new Date();
    const day0  = new Date(now); day0.setHours(0,0,0,0);
    const day30 = new Date(day0); day30.setDate(day0.getDate() - 29);

    // ── 1. Tasks completed last 30 days (line chart) ─────────────────────────
    const completedByDay = await Task.aggregate([
      { $match: {
        $or: [{ assignees: userId }, { assignees: userIdStr }, { createdBy: userId }, { createdBy: userIdStr }],
        status:    TASK_STATUS.DONE,
        updatedAt: { $gte: day30 }
      }},
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Fill in missing days with 0
    const dailyMap = {};
    completedByDay.forEach(d => { dailyMap[d._id] = d.count; });
    const completedOverTime = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(day30);
      d.setDate(day30.getDate() + i);
      const key = d.toISOString().split('T')[0];
      completedOverTime.push({ date: key, completed: dailyMap[key] || 0 });
    }

    // ── 2. Priority breakdown (donut chart) ──────────────────────────────────
    const priorityBreakdown = await Task.aggregate([
      { $match: {
        $or: [{ assignees: userId }, { assignees: userIdStr }, { createdBy: userId }, { createdBy: userIdStr }],
        status: { $ne: TASK_STATUS.DONE }
      }},
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // ── 3. Productivity by day of week ────────────────────────────────────────
    const byDayOfWeek = await Task.aggregate([
      { $match: {
        $or: [{ assignees: userId }, { assignees: userIdStr }, { createdBy: userId }, { createdBy: userIdStr }],
        status:    TASK_STATUS.DONE,
        updatedAt: { $gte: day30 }
      }},
      { $group: {
        _id:   { $dayOfWeek: '$updatedAt' }, // 1=Sun, 2=Mon ... 7=Sat
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowMap = {};
    byDayOfWeek.forEach(d => { dowMap[d._id] = d.count; });
    const productivityByDay = DAYS.map((name, i) => ({
      day: name, completed: dowMap[i + 1] || 0
    }));

    // ── 4. Personal stats ─────────────────────────────────────────────────────
    const [totalTasks, completedTasks, activeTasks] = await Promise.all([
      Task.countDocuments({ $or: [{ assignees: userId }, { assignees: userIdStr }, { createdBy: userId }, { createdBy: userIdStr }] }),
      Task.countDocuments({ $or: [{ assignees: userId }, { assignees: userIdStr }, { createdBy: userId }, { createdBy: userIdStr }], status: TASK_STATUS.DONE }),
      Task.countDocuments({ $or: [{ assignees: userId }, { assignees: userIdStr }, { createdBy: userId }, { createdBy: userIdStr }], status: { $ne: TASK_STATUS.DONE } }),
    ]);

    // ── 5. Streak — consecutive days with at least 1 completion ──────────────
    let streak = 0;
    for (let i = completedOverTime.length - 1; i >= 0; i--) {
      if (completedOverTime[i].completed > 0) streak++;
      else break;
    }

    // ── 6. Avg completion time (days from created to done) ────────────────────
    const avgTimeResult = await Task.aggregate([
      { $match: {
        $or: [{ assignees: userId }, { assignees: userIdStr }, { createdBy: userId }, { createdBy: userIdStr }],
        status: TASK_STATUS.DONE
      }},
      { $project: {
        days: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 1000 * 60 * 60 * 24] }
      }},
      { $group: { _id: null, avg: { $avg: '$days' } } }
    ]);
    const avgDays = avgTimeResult[0]?.avg
      ? Math.round(avgTimeResult[0].avg * 10) / 10
      : 0;

    res.json({
      stats: {
        totalTasks,
        completedTasks,
        activeTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        streak,
        avgDays,
      },
      completedOverTime,
      priorityBreakdown,
      productivityByDay,
    });
  } catch (err) { next(err); }
};

// ── GET /api/analytics/project/:id ───────────────────────────────────────────
const getProjectAnalytics = async (req, res, next) => {
  try {
    const projectId = new mongoose.Types.ObjectId(req.params.id);

    const now   = new Date();
    const day0  = new Date(now); day0.setHours(0,0,0,0);
    const day30 = new Date(day0); day30.setDate(day0.getDate() - 29);

    // ── 1. Burn down — tasks remaining per day ────────────────────────────────
    // Total tasks created up to each day minus completed up to each day
    const allTasks = await Task.find({ project: projectId })
      .select('status createdAt updatedAt')
      .lean();

    const burnDown = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(day30);
      d.setDate(day30.getDate() + i);
      d.setHours(23, 59, 59, 999);
      const key = d.toISOString().split('T')[0];

      const created   = allTasks.filter(t => new Date(t.createdAt) <= d).length;
      const completed = allTasks.filter(t =>
        t.status === TASK_STATUS.DONE && new Date(t.updatedAt) <= d
      ).length;

      burnDown.push({ date: key, remaining: created - completed, completed });
    }

    // ── 2. Task creation vs completion (last 30 days) ─────────────────────────
    const createdByDay = await Task.aggregate([
      { $match: { project: projectId, createdAt: { $gte: day30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, created: { $sum: 1 } } }
    ]);
    const completedByDay = await Task.aggregate([
      { $match: { project: projectId, status: TASK_STATUS.DONE, updatedAt: { $gte: day30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, completed: { $sum: 1 } } }
    ]);

    const createdMap   = {}; createdByDay.forEach(d => { createdMap[d._id]   = d.created;   });
    const completedMap = {}; completedByDay.forEach(d => { completedMap[d._id] = d.completed; });

    const velocity = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(day30); d.setDate(day30.getDate() + i);
      const key = d.toISOString().split('T')[0];
      velocity.push({ date: key, created: createdMap[key] || 0, completed: completedMap[key] || 0 });
    }

    // ── 3. Member contribution ────────────────────────────────────────────────
    const memberContribution = await Task.aggregate([
      { $match: { project: projectId, status: TASK_STATUS.DONE } },
      { $unwind: '$assignees' },
      { $group: { _id: '$assignees', completed: { $sum: 1 } } },
      { $lookup: {
        from: 'users', localField: '_id', foreignField: '_id', as: 'user',
        pipeline: [{ $project: { name: 1, color: 1 } }]
      }},
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { name: '$user.name', color: '$user.color', completed: 1 } },
      { $sort: { completed: -1 } },
      { $limit: 10 }
    ]);

    // ── 4. Project overview stats ─────────────────────────────────────────────
    const [total, done, overdue] = await Promise.all([
      Task.countDocuments({ project: projectId }),
      Task.countDocuments({ project: projectId, status: TASK_STATUS.DONE }),
      Task.countDocuments({ project: projectId, status: { $ne: TASK_STATUS.DONE }, dueDate: { $lt: day0 } }),
    ]);

    res.json({
      stats: {
        total, done, overdue,
        active: total - done,
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
      },
      burnDown,
      velocity,
      memberContribution,
    });
  } catch (err) { next(err); }
};

module.exports = { getPersonalAnalytics, getProjectAnalytics };