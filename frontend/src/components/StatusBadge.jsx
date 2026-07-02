const STATUS_LABELS = {
  queued:           'Queued',
  preparing:        'Preparing',
  analyzing:        'Analyzing',
  scene_generation: 'Building Scenes',
  media_generation: 'Generating Media',
  assembling:       'Assembling',
  optimizing:       'Optimizing',
  completed:        'Completed',
  failed:           'Failed',
};

const isActive = (s) =>
  ['preparing','analyzing','scene_generation','media_generation','assembling','optimizing'].includes(s);

export default function StatusBadge({ status }) {
  const cls = status === 'completed' ? 'badge badge-completed'
            : status === 'failed'    ? 'badge badge-failed'
            : status === 'queued'    ? 'badge badge-queued'
            : isActive(status)       ? 'badge badge-processing'
            : 'badge';

  return (
    <span className={cls}>
      {isActive(status) && <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px', marginRight: '6px' }} />}
      {STATUS_LABELS[status] || status}
    </span>
  );
}
