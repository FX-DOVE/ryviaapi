import User from '../models/User.js';
import Job  from '../models/Job.js';

export async function getMe(req, res, next) {
  try {
    const [user, stats] = await Promise.all([
      User.findById(req.user._id),
      Job.aggregate([
        { $match: { userId: req.user._id } },
        {
          $group: {
            _id:       null,
            total:     { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            failed:    { $sum: { $cond: [{ $eq: ['$status', 'failed']    }, 1, 0] } },
            running:   { $sum: { $cond: [{ $in: ['$status', ['preparing','analyzing','scene_generation','media_generation','assembling','optimizing']] }, 1, 0] } },
            totalSize: { $sum: { $ifNull: ['$fileSize', 0] } },
          },
        },
      ]),
    ]);

    const s = stats[0] || { total: 0, completed: 0, failed: 0, running: 0, totalSize: 0 };

    res.json({
      user,
      stats: {
        totalJobs:     s.total,
        completed:     s.completed,
        failed:        s.failed,
        running:       s.running,
        storageUsedGb: +(s.totalSize / 1e9).toFixed(2),
      },
    });
  } catch (err) {
    next(err);
  }
}

export default { getMe };
