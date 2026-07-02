import { useEffect, useState } from 'react';
import { Film, Search, ArrowLeft, ArrowRight } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { getHistory, deleteJob } from '../api/jobs';
import JobCard from '../components/JobCard';

import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { EmptyState } from '../components/ui/EmptyState';

const STATUS_FILTERS = ['all', 'queued', 'media_generation', 'completed', 'failed'];

export default function History() {
  const { jobs, jobsTotal, setJobs, removeJob, addToast } = useAppStore();
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);

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
    }
  };

  useEffect(() => { 
    fetchJobs(1, filter); 
  }, [filter]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this job and all its files permanently?')) return;
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
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
            </AppButton>
          ))}
        </div>

        <div className="relative w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            className="form-input pl-10 w-full"
            placeholder="Search titles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-[var(--text-muted)]">
          <div className="spinner w-8 h-8 border-2 border-[var(--border-default)] border-t-[var(--brand-primary)] rounded-full animate-spin"></div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState 
          icon={Film}
          title="No videos found"
          description="Try a different filter or create your first video."
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
    </AppPage>
  );
}
