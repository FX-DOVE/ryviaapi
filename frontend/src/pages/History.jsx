import { useEffect, useMemo, useState } from 'react';
import { Film, Search, ArrowLeft, ArrowRight, Clapperboard, LayoutGrid, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { getHistory, deleteJob } from '../api/jobs';
import JobCard from '../components/JobCard';

import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/ui/EmptyState';
import { useConfirm } from '../components/ui/ConfirmDialog';

const FILTERS = [
  { id: 'all', label: 'All', api: null },
  { id: 'draft', label: 'Draft', api: 'queued' },
  { id: 'rendering', label: 'Rendering', api: 'media_generation' },
  { id: 'complete', label: 'Complete', api: 'completed' },
  { id: 'failed', label: 'Failed', api: 'failed' },
];

const RENDERING_STATUSES = new Set([
  'preparing', 'analyzing', 'scene_generation', 'media_generation',
  'assembling', 'optimizing', 'directing', 'locking',
]);

function JobCardSkeleton() {
  return (
    <div className="job-card-skeleton">
      <div className="job-card-skeleton-thumb" />
      <div className="job-card-skeleton-body">
        <div className="job-card-skeleton-line" style={{ width: '72%' }} />
        <div className="job-card-skeleton-line" style={{ width: '45%', height: '10px', opacity: 0.6 }} />
        <div className="job-card-skeleton-line" style={{ width: '88%', marginTop: '4px' }} />
      </div>
    </div>
  );
}

export default function History() {
  const navigate = useNavigate();
  const { jobs, jobsTotal, setJobs, removeJob, addToast } = useAppStore();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);
  const [view, setView] = useState('grid');
  const { confirm, confirmDialog } = useConfirm();

  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[0];

  const fetchJobs = async (p = 1, nextFilter = filter) => {
    setLoading(true);
    try {
      const f = FILTERS.find((x) => x.id === nextFilter) || FILTERS[0];
      const params = { page: p, limit: 20 };
      // Rendering spans multiple pipeline statuses — fetch a wider page and filter client-side.
      if (f.id === 'rendering') {
        params.limit = 40;
      } else if (f.api) {
        params.status = f.api;
      }
      const { data } = await getHistory(params);
      let nextJobs = data.jobs || [];
      let total = data.total;
      if (f.id === 'rendering') {
        nextJobs = nextJobs.filter((j) => RENDERING_STATUSES.has(j.status));
        total = nextJobs.length;
      }
      setJobs(nextJobs, total);
      setPage(p);
    } catch {
      addToast('Failed to load history', 'error');
    } finally {
      setLoading(false);
      setHasEverLoaded(true);
    }
  };

  useEffect(() => {
    fetchJobs(1, filter);
  }, [filter]);

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete job?',
      message: 'This permanently deletes the job and all its files. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteJob(id);
      removeJob(id);
      addToast('Job deleted', 'success');
    } catch {
      addToast('Delete failed', 'error');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => (j.title || '').toLowerCase().includes(q));
  }, [jobs, search]);

  const isFirstRun = hasEverLoaded && jobsTotal === 0 && filter === 'all' && !search.trim();

  return (
    <AppPage className="history-page">
      <PageHeader
        title="History"
        description={`${jobsTotal} total video${jobsTotal !== 1 ? 's' : ''}`}
        actions={
          <div className="history-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={view === 'grid' ? 'active' : ''}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={view === 'list' ? 'active' : ''}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        }
      />

      <div className="history-controls">
        <div className="history-filters">
          {FILTERS.map((s) => (
            <AppButton
              key={s.id}
              variant={filter === s.id ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter(s.id)}
              className="btn-inline"
            >
              {s.label}
            </AppButton>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            className="form-input pl-10 w-full"
            placeholder="Search titles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search history"
          />
        </div>
      </div>

      {loading ? (
        <div className={view === 'list' ? 'history-grid history-grid--list' : 'history-grid'}>
          {Array.from({ length: 8 }).map((_, i) => (
            <JobCardSkeleton key={i} />
          ))}
        </div>
      ) : isFirstRun ? (
        <EmptyState
          icon={Clapperboard}
          title="Lights, Camera, Action!"
          description="You haven't produced any videos yet. Head to Film Studio to write a script and generate your first cinematic masterpiece."
          checklist={[
            { title: 'Script', description: 'Draft your story or paste a screenplay.' },
            { title: 'Lock', description: 'Approve cast looks and creative locks.' },
            { title: 'Render', description: 'Produce and track the job here.' },
          ]}
          primaryAction={
            <AppButton icon={Clapperboard} onClick={() => navigate('/app/film-studio')}>
              Open Film Studio
            </AppButton>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No videos found"
          description={`Nothing matches “${activeFilter.label}”. Try another filter or clear your search.`}
        />
      ) : (
        <div className={view === 'list' ? 'history-grid history-grid--list' : 'history-grid'}>
          {filtered.map((job) => (
            <JobCard key={job._id} job={job} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {jobsTotal > 20 && (
        <div className="history-pagination">
          <AppButton
            variant="secondary"
            disabled={page <= 1}
            onClick={() => fetchJobs(page - 1)}
            icon={ArrowLeft}
          >
            Previous
          </AppButton>

          <span className="text-sm font-medium text-[var(--text-secondary)]">
            Page {page} of {Math.ceil(jobsTotal / 20)}
          </span>

          <AppButton
            variant="secondary"
            disabled={page >= Math.ceil(jobsTotal / 20)}
            onClick={() => fetchJobs(page + 1)}
            icon={ArrowRight}
          >
            Next
          </AppButton>
        </div>
      )}
      {confirmDialog}
    </AppPage>
  );
}
