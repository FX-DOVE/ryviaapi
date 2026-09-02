import { useEffect, useState } from 'react';
import { Film, Search, ArrowLeft, ArrowRight, Clapperboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { getHistory, deleteJob } from '../api/jobs';
import JobCard from '../components/JobCard';

import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/ui/EmptyState';
import { useConfirm } from '../components/ui/ConfirmDialog';

const STATUS_FILTERS = ['all', 'queued', 'media_generation', 'completed', 'failed'];

// Skeleton card that mirrors the real JobCard layout
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
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const fetchJobs = async (p = 1, status = filter) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (status !== 'all') params.status = status;
      const { data } = await getHistory(params);
      setJobs(data.jobs, data.total);
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

  const filtered = search.trim()
    ? jobs.filter((j) => j.title.toLowerCase().includes(search.toLowerCase()))
    : jobs;

  // True first-run: no jobs at all, unfiltered
  const isFirstRun = hasEverLoaded && jobsTotal === 0 && filter === 'all' && !search.trim();

  return (
    <AppPage className="history-page">
      <PageHeader 
        title="History"
        description={`${jobsTotal} total video${jobsTotal !== 1 ? 's' : ''}`}
      />

      {/* Filters & Search */}
      <div className="history-controls">
        <div className="history-filters">
          {STATUS_FILTERS.map((s) => (
            <AppButton
              key={s}
              variant={filter === s ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter(s)}
              className="btn-inline"
            >
              {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
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
          />
        </div>
      </div>

      {/* Grid / Loading / Empty */}
      {loading ? (
        <div className="history-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <JobCardSkeleton key={i} />
          ))}
        </div>
      ) : isFirstRun ? (
        <EmptyState
          icon={Clapperboard}
          title="Lights, Camera, Action!"
          description="You haven't produced any videos yet. Head to Film Studio to write a script and generate your first cinematic masterpiece."
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
          description="Try a different filter or clear your search."
        />
      ) : (
        <div className="history-grid">
          {filtered.map((job) => (
            <JobCard key={job._id} job={job} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Pagination */}
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
