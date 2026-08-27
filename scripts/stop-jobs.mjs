import '../backend/env.js';
import db from '../backend/src/config/db.js';
import Job from '../backend/src/models/Job.js';
import { queues } from '../backend/src/queues/queueManager.js';

async function main() {
  await db();
  
  const activeJobs = await Job.find({ status: { $nin: ['completed', 'failed', 'cancelled'] } });
  console.log('Found active jobs in DB:', activeJobs.map(j => ({ id: j._id, title: j.title, status: j.status })));

  for (const job of activeJobs) {
    await Job.findByIdAndUpdate(job._id, { status: 'cancelled', error: 'Cancelled by user' });
    console.log('Updated DB status to cancelled for job:', job._id);
  }

  for (const [name, q] of Object.entries(queues)) {
    try {
      await q.drain();
      await q.clean(0, 1000, 'active');
      await q.clean(0, 1000, 'wait');
      await q.clean(0, 1000, 'delayed');
      console.log(`Drained and cleaned queue: ${name}`);
    } catch (err) {
      console.warn(`Queue ${name} clean error:`, err.message);
    }
  }

  console.log('Successfully cancelled all active jobs.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
