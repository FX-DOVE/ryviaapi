import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import {
  listProjects, createProject, deleteProject
} from '../api/projects';

import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { EmptyState } from '../components/ui/EmptyState';

import { Film, Plus, Trash2 } from 'lucide-react';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const {
    projects, setProjects, addProject,
    addToast
  } = useAppStore();

  const [loading, setLoading] = useState(true);

  // Modals / Creation State
  const [showProjModal, setShowProjModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');

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
    try {
      const res = await createProject({
        name: newProjName,
        description: newProjDesc
      });
      addProject(res.data);
      addToast('Project created successfully', 'success');
      setShowProjModal(false);
      setNewProjName('');
      setNewProjDesc('');
      navigate(`/projects/${res.data._id}`);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to create project', 'error');
    }
  };


  const handleDeleteProj = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await deleteProject(id);
      setProjects(projects.filter(p => p._id !== id));
      addToast('Project deleted successfully', 'success');
    } catch (err) {
      addToast('Failed to delete project', 'error');
    }
  };

  if (loading) {
    return (
      <AppPage className="flex items-center justify-center min-h-[80vh]">
        <div className="spinner w-12 h-12 border-4 border-[var(--border-default)] border-t-[var(--brand-primary)] rounded-full animate-spin"></div>
      </AppPage>
    );
  }

  return (
    <AppPage className="projects-page">
      <PageHeader
        title="Project Studios"
        description="Manage your active cinematic productions and workspaces."
        actions={
          <AppButton onClick={() => setShowProjModal(true)} icon={Plus}>
            New Studio
          </AppButton>
        }
      />

      {/* THREE PANELS LAYOUT */}
      <div className="projects-shell">
        <div className="projects-layout-grid">

        {/* PROJECTS GRID (Main) */}
        <div className="projects-main-panel">
          <h2 className="section-title projects-section-title">Active Projects</h2>
          {projects.length === 0 ? (
            <EmptyState
              icon={Film}
              title="No projects started yet"
              description="Create a studio to begin producing video."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {projects.map((p, i) => {
                // Give each card a unique accent color cycling through a curated palette
                const accents = [
                  { from: '#7C3AED', to: '#A855F7', light: 'rgba(124,58,237,0.15)' },
                  { from: '#2563EB', to: '#60A5FA', light: 'rgba(37,99,235,0.15)' },
                  { from: '#DB2777', to: '#F472B6', light: 'rgba(219,39,119,0.15)' },
                  { from: '#D97706', to: '#FCD34D', light: 'rgba(217,119,6,0.15)' },
                  { from: '#059669', to: '#34D399', light: 'rgba(5,150,105,0.15)' },
                ];
                const accent = accents[i % accents.length];
                return (
                  <div
                    key={p._id}
                    onClick={() => navigate(`/film-studio`)}
                    data-project-card
                    style={{
                      cursor: 'pointer',
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.07)',
                      background: 'linear-gradient(160deg, #1A1A26, #101018)',
                      overflow: 'hidden',
                      transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.borderColor = `${accent.from}55`;
                      e.currentTarget.style.boxShadow = `0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px ${accent.from}33`;
                      const btn = e.currentTarget.querySelector('.project-card-delete');
                      if (btn) btn.style.opacity = '1';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = '';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                      e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.35)';
                      const btn = e.currentTarget.querySelector('.project-card-delete');
                      if (btn) btn.style.opacity = '0';
                    }}
                  >
                    {/* Thumbnail area */}
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '16/9',
                      overflow: 'hidden',
                      background: `radial-gradient(ellipse at 30% 50%, ${accent.light}, transparent 70%), #0D0D15`,
                    }}>
                      {/* Cinematic grid lines */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `linear-gradient(${accent.from}08 1px, transparent 1px), linear-gradient(90deg, ${accent.from}08 1px, transparent 1px)`,
                        backgroundSize: '32px 32px',
                      }} />
                      {/* Center glow */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: `radial-gradient(circle at 50% 50%, ${accent.from}22, transparent 65%)`,
                      }} />
                      {/* Film icon */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{
                          width: '54px', height: '54px',
                          borderRadius: '14px',
                          background: `linear-gradient(135deg, ${accent.from}30, ${accent.from}10)`,
                          border: `1px solid ${accent.from}40`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: `0 0 32px ${accent.from}40`,
                        }}>
                          <Film size={24} style={{ color: accent.from, opacity: 0.9 }} />
                        </div>
                      </div>
                      {/* Bottom gradient fade */}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: '60%',
                        background: 'linear-gradient(to top, #101018, transparent)',
                      }} />
                      {/* Top-right action */}
                      <button
                        onClick={(e) => handleDeleteProj(p._id, e)}
                        title="Delete project"
                        style={{
                          position: 'absolute', top: '10px', right: '10px',
                          width: '30px', height: '30px',
                          borderRadius: '8px',
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          backdropFilter: 'blur(8px)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'rgba(255,255,255,0.35)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          opacity: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
                        className="project-card-delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Content */}
                    <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <h3 style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          lineHeight: 1.3,
                          letterSpacing: '-0.01em',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                        }}>{p.name}</h3>
                        {/* Accent dot */}
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '5px',
                          background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
                          boxShadow: `0 0 8px ${accent.from}80`,
                        }} />
                      </div>

                      <p style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        minHeight: '36px',
                      }}>{p.description || 'No description provided.'}</p>

                      {/* Tags */}
                      {(p.style?.preset || p.style?.colorGrade) && (
                        <div style={{
                          display: 'flex', flexWrap: 'wrap', gap: '5px',
                          paddingTop: '10px',
                          borderTop: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          {p.style?.preset && (
                            <span style={{
                              fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              padding: '3px 8px', borderRadius: '999px',
                              background: `linear-gradient(135deg, ${accent.from}22, ${accent.from}0A)`,
                              border: `1px solid ${accent.from}40`,
                              color: accent.from,
                            }}>{p.style.preset}</span>
                          )}
                          {p.style?.colorGrade && (
                            <span style={{
                              fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              padding: '3px 8px', borderRadius: '999px',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'var(--text-muted)',
                            }}>{p.style.colorGrade}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>


      </div>
    </div>

      {/* PROJECT CREATION MODAL */}
      {showProjModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="modal-header">
              <h2>New Project Studio</h2>
              <AppButton variant="icon" onClick={() => setShowProjModal(false)} icon={Plus} className="rotate-45" />
            </div>
            <form onSubmit={handleCreateProject} className="modal-body space-y-4">
              <AppInput
                label="Project Name"
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                required
                placeholder="e.g. Rome: The Rise & Fall"
              />
              <AppInput
                type="textarea"
                label="Description"
                value={newProjDesc}
                onChange={(e) => setNewProjDesc(e.target.value)}
                placeholder="Details, outline, or series direction..."
              />
            </form>
            <div className="modal-footer">
              <AppButton variant="ghost" onClick={() => setShowProjModal(false)}>Cancel</AppButton>
              <AppButton onClick={handleCreateProject}>Create Studio</AppButton>
            </div>
          </div>
        </div>,
        document.body
      )}



    </AppPage>
  );
}
