import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { listProjects, createProject, deleteProject } from '../api/projects';

import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { Film, Plus, Trash2, Calendar } from 'lucide-react';

// Skeleton card matching the real project card layout
function ProjectCardSkeleton() {
  return (
    <div className="project-card-skeleton">
      <div className="project-card-skeleton-thumb" />
      <div className="project-card-skeleton-body">
        <div className="job-card-skeleton-line" style={{ width: '60%', height: '16px' }} />
        <div className="job-card-skeleton-line" style={{ width: '85%', height: '12px', opacity: 0.5 }} />
        <div className="job-card-skeleton-line" style={{ width: '40%', height: '10px', opacity: 0.4, marginTop: '8px' }} />
      </div>
    </div>
  );
}

// Each studio gets a stable accent for quick visual recognition in the grid.
// Sourced from design tokens so the palette stays on-brand.
const STUDIO_ACCENTS = [
  'var(--brand-primary)',
  'var(--accent-gold)',
  'var(--accent-green)',
  'var(--accent-blue)',
  'var(--brand-light)',
];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, setProjects, addProject, addToast } = useAppStore();
  const [loading, setLoading] = useState(true);
  const { confirm, confirmDialog } = useConfirm();

  // Creation modal state
  const [showProjModal, setShowProjModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const projRes = await listProjects();
        setProjects(projRes.data);
      } catch (err) {
        addToast(err.response?.data?.error || 'Failed to fetch projects data', 'error');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await createProject({
        name: newProjName,
        description: newProjDesc,
      });
      addProject(res.data);
      addToast('Project created successfully', 'success');
      setShowProjModal(false);
      setNewProjName('');
      setNewProjDesc('');
      navigate(`/app/film-studio/${res.data._id}?new=true`);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to create project', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProj = async (id, e) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete project?',
      message: 'This permanently deletes the studio and its saved references. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteProject(id);
      setProjects(projects.filter((p) => p._id !== id));
      addToast('Project deleted successfully', 'success');
    } catch (err) {
      addToast('Failed to delete project', 'error');
    }
  };

  if (loading) {
    return (
      <AppPage className="projects-page">
        <PageHeader
          title="Project Studios"
          description="Manage your active cinematic productions."
          actions={
            <AppButton icon={Plus} onClick={() => setShowProjModal(true)}>
              New Studio
            </AppButton>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="projects-page">
      <PageHeader
        title="Project Studios"
        description="Manage your active cinematic productions. Each studio isolates its own character locks and environment references."
        actions={
          <AppButton icon={Plus} onClick={() => setShowProjModal(true)}>
            New Studio
          </AppButton>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No projects started yet"
          description="Create your first studio to begin writing scripts and generating cinematic video."
          primaryAction={
            <AppButton icon={Plus} onClick={() => setShowProjModal(true)}>
              Create Studio
            </AppButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {projects.map((p, i) => {
            const accent = STUDIO_ACCENTS[i % STUDIO_ACCENTS.length];
            const dateObj = new Date(p.createdAt || Date.now());

            return (
              <div
                key={p._id}
                onClick={() => navigate(`/app/film-studio/${p._id}`)}
                className="project-card group relative flex flex-col rounded-[var(--radius-xl)] bg-[var(--bg-surface)] border border-[var(--glass-border)] hover:border-[var(--border-default)] transition-all duration-300 cursor-pointer overflow-hidden hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
              >
                {/* Thumbnail / accent area */}
                <div className="relative w-full aspect-[16/9] bg-[var(--bg-sunken)] overflow-hidden border-b border-[var(--glass-border)]">
                  {/* Accent glow */}
                  <div
                    className="absolute inset-0 opacity-20 transition-opacity duration-500 group-hover:opacity-40"
                    style={{ background: `radial-gradient(circle at 50% 50%, ${accent}, transparent 70%)` }}
                  />
                  {/* Blueprint grid */}
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: `linear-gradient(${accent} 1px, transparent 1px), linear-gradient(90deg, ${accent} 1px, transparent 1px)`,
                      backgroundSize: '24px 24px',
                    }}
                  />

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center border backdrop-blur-md transition-transform duration-500 group-hover:scale-110"
                      style={{
                        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                        borderColor: `color-mix(in srgb, ${accent} 28%, transparent)`,
                        color: accent,
                      }}
                    >
                      <Film size={24} />
                    </div>
                  </div>

                  {/* Bottom scrim */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-1/2"
                    style={{ background: 'linear-gradient(to top, var(--bg-surface), transparent)' }}
                  />

                  {/* Delete (hover-reveal) */}
                  <button
                    onClick={(e) => handleDeleteProj(p._id, e)}
                    className="absolute top-4 right-4 p-2 rounded-xl bg-black/40 border border-[var(--glass-border)] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md hover:text-[var(--accent-red)] hover:border-[color-mix(in_srgb,var(--accent-red)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-red)_15%,transparent)]"
                    title="Delete project"
                    aria-label={`Delete project ${p.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] line-clamp-1">{p.name}</h3>
                    <div
                      className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }}
                    />
                  </div>

                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2 min-h-[40px] mb-4">
                    {p.description || <span className="italic opacity-50">No description provided</span>}
                  </p>

                  <div className="mt-auto pt-4 border-t border-[var(--glass-border)] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
                      <Calendar size={12} /> {dateObj.toLocaleDateString()}
                    </div>

                    {p.style?.preset && (
                      <div
                        className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border"
                        style={{
                          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                          color: accent,
                          borderColor: `color-mix(in srgb, ${accent} 28%, transparent)`,
                        }}
                      >
                        {p.style.preset}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create project */}
      <Modal
        open={showProjModal}
        onClose={() => setShowProjModal(false)}
        title="New Project Studio"
        size="sm"
      >
        <form onSubmit={handleCreateProject} className="flex flex-col gap-5">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="proj-name" className="form-label">Project name</label>
            <input
              id="proj-name"
              type="text"
              className="form-input"
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              placeholder="e.g. Rome: The Rise & Fall"
              required
              data-autofocus
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="proj-desc" className="form-label">Description</label>
            <textarea
              id="proj-desc"
              className="form-textarea"
              value={newProjDesc}
              onChange={(e) => setNewProjDesc(e.target.value)}
              placeholder="Details, outline, or series direction..."
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <AppButton
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => setShowProjModal(false)}
            >
              Cancel
            </AppButton>
            <AppButton type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Studio'}
            </AppButton>
          </div>
        </form>
      </Modal>

      {confirmDialog}
    </AppPage>
  );
}
