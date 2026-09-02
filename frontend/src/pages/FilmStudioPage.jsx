import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Settings, 
  Film, User, Clapperboard, Users, Folder, Lightbulb, Tag, Music, Ticket,
  Edit2, Trash2, AlertTriangle, CheckCircle, ListChecks, Save,
  Video, BookOpen, Camera, UploadCloud, X, Plus, Sparkles,
} from 'lucide-react';
import { filmCharactersApi, screenplaysApi } from '../api/filmStudio';
import { getProject } from '../api/projects';
import { useScreenplaySocket } from '../hooks/useSocket';
import useAppStore from '../store/useAppStore';
import { useConfirm } from '../components/ui/ConfirmDialog';

// ── Helpers ──────────────────────────────────────────────────────────────────
const VIDEO_TYPES = [
  { id: 'documentary', label: 'Documentary', description: 'Factual narration with cinematic B-roll and captions.', mediaRequired: true,  fixedRuntime: false, Icon: Film,        image: '/modes/documentary.jpg' },
  { id: 'drama',       label: 'Drama',       description: 'Emotional acting: characters cry, argue, love, betray.',  mediaRequired: false, fixedRuntime: true,  defaultTargetMinutes: 3, Icon: Users,        image: '/modes/drama.jpg' },
  { id: 'movie',       label: 'Movie / Film',description: 'Full cinematic production with acting and coverage.',      mediaRequired: false, fixedRuntime: true,  defaultTargetMinutes: 5, Icon: Clapperboard, image: '/modes/movie.jpg' },
  { id: 'explainer',   label: 'Explainer',   description: 'Clear teaching video, clean lighting.',                   mediaRequired: true,  fixedRuntime: false, Icon: Lightbulb,    image: '/modes/explainer.jpg' },
  { id: 'commercial',  label: 'Commercial / Ad', description: 'Short punchy product-hero visuals.',                  mediaRequired: true,  fixedRuntime: false, Icon: Tag,          image: '/modes/commercial.jpg' },
  { id: 'music_video', label: 'Music Video', description: 'Beat-synced stylised visuals.',                           mediaRequired: true,  fixedRuntime: false, Icon: Music,        image: '/modes/music_video.jpg' },
  { id: 'cinematic_trailer', label: 'Cinematic Trailer', description: 'High-tension montage, epic pacing.',          mediaRequired: false, fixedRuntime: false, Icon: Ticket,       image: '/modes/cinematic_trailer.jpg' },
  { id: 'anime',       label: 'Anime / Cartoon', description: 'Style-locked animated performance.',                  mediaRequired: false, fixedRuntime: true,  defaultTargetMinutes: 3, Icon: Clapperboard, image: '/modes/anime.jpg' },
];

const ASPECT_RATIOS = [
  { id: '16:9', label: 'Landscape (YouTube)' },
  { id: '9:16', label: 'Vertical (Shorts/TikTok)' },
  { id: '1:1', label: 'Square' },
  { id: '4:5', label: 'Portrait' },
  { id: '21:9', label: 'Cinematic wide' },
  { id: '4:3', label: 'Classic' },
];

const CHARACTER_ROLES = ['protagonist', 'antagonist', 'supporting', 'minor'];

function StepIndicator({ step, current }) {
  const STEPS = ['Film Concept', 'Characters', 'Generate', 'Review'];
  const progressPct = ((current - 1) / (STEPS.length - 1)) * 100;
  return (
    <>
      <div className="film-step-indicator">
        {STEPS.map((label, i) => (
          <div key={i} className={`film-step ${i + 1 === current ? 'active' : ''} ${i + 1 < current ? 'done' : ''}`}>
            <div className="film-step-num">{i + 1 < current ? '✓' : i + 1}</div>
            <span>{label}</span>
            {i < STEPS.length - 1 && <div className="film-step-line" />}
          </div>
        ))}
      </div>
      {/* Compact mobile-only replacement — text label + thin progress bar */}
      <div className="film-step-indicator-mobile">
        <div className="flex justify-between items-center text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
          <span>Step {current} of {STEPS.length}</span>
          <span className="text-[var(--brand-light)] font-semibold">{STEPS[current - 1]}</span>
        </div>
        <div className="film-step-indicator-mobile-track">
          <div className="film-step-indicator-mobile-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
    </>
  );
}

// Build a proxy URL through our own API so the image never expires
function charImageUrl(char) {
  if (char._id) return `/api/v1/film-characters/${char._id}/reference-image`;
  return null;
}

function CharacterCard({ char, onEdit, onDelete, onPreview, index }) {
  const [imgErr, setImgErr] = useState(false);
  const proxyUrl = charImageUrl(char);
  const hasImg = proxyUrl && !imgErr;

  return (
    <div className="char-card">
      <div
        className={`char-avatar ${hasImg ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
        style={{ background: `hsl(${index * 60}, 70%, 25%)` }}
        onClick={() => {
          if (hasImg && onPreview) {
            onPreview({
              title: `${char.name} (${char.role || 'Character'})`,
              badge: char.role?.toUpperCase(),
              icon: <User size={16} />,
              src: proxyUrl,
              label: 'Physical Description & Consistency Prompt',
              subtitle: char.physicalDescription || 'Master reference photo used for character consistency locks.',
            });
          }
        }}
        title={hasImg ? `Click to view full photo for ${char.name}` : char.name}
      >
        {hasImg
          ? <img src={proxyUrl} alt={char.name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <span>{char.name ? char.name[0].toUpperCase() : '?'}</span>}
      </div>
      <div className="char-info">
        <div className="char-name">{char.name}</div>
        <div className="char-role-badge">{char.role}</div>
        {char.physicalDescription && (
          <p className="char-desc">{char.physicalDescription.slice(0, 80)}…</p>
        )}
      </div>
      <div className="char-actions">
        <button className="btn-icon" onClick={() => onEdit(char)} title="Edit"><Edit2 size={14} /></button>
        <button className="btn-icon btn-icon-danger" onClick={() => onDelete(char)} title="Delete"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function CharacterEditor({ character, onSave, onCancel }) {
  const [form, setForm] = useState(character || {
    name: '', role: 'supporting', gender: 'unspecified', physicalDescription: ''
  });
  const [previewImage, setPreviewImage] = useState(character?.referenceImageUrl || character?.referenceImage || null);
  const [imageFile, setImageFile] = useState(null);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="char-editor-overlay">
      <div className="char-editor">
        <div className="char-editor-header">
          <h3>{character ? 'Edit Character' : 'New Character'}</h3>
          <button className="btn-close" onClick={onCancel}>✕</button>
        </div>

        <div className="char-editor-body">
          <div className="editor-row items-center">
            <div className="editor-field flex-none text-center">
              <div className="w-20 h-20 rounded-lg bg-[var(--bg-elevated)] border border-dashed border-[var(--border-default)] flex items-center justify-center overflow-hidden cursor-pointer relative"
                onClick={() => document.getElementById('char-img-upload').click()}>
                {previewImage ? (
                  <img src={previewImage} className="w-full h-full object-cover" alt="Preview" />
                ) : (
                  <Camera className="opacity-50 text-2xl" size={24} />
                )}
              </div>
              <input type="file" id="char-img-upload" hidden accept="image/*" onChange={handleImageUpload} />
              <label className="text-[10px] block mt-1 text-[var(--text-muted)]">Photo (Opt)</label>
            </div>
            
            <div className="editor-field flex-1">
              <label>Character Name *</label>
              <input value={form.name} onChange={set('name')} placeholder="e.g. Adaeze, Kojo, Mei" />
            </div>
            <div className="editor-field flex-1">
              <label>Role</label>
              <select value={form.role} onChange={set('role')}>
                {CHARACTER_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="editor-row">
            <div className="editor-field">
              <label>Gender</label>
              <select value={form.gender} onChange={set('gender')}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="unspecified">Unspecified</option>
              </select>
            </div>
          </div>

          <div className="editor-field">
            <label>Physical Description <span className="label-hint">(This is injected into EVERY scene — be very detailed)</span></label>
            <textarea
              value={form.physicalDescription}
              onChange={set('physicalDescription')}
              rows={3}
              placeholder="e.g. Tall athletic build, dark brown skin, high cheekbones, short natural hair, wearing a red dress"
            />
          </div>

        </div>

        <div className="char-editor-footer">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form, imageFile)}>Save Character</button>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible Section Card ──────────────────────────────────────────────────
function CollapseCard({ title, icon, badge, defaultOpen = false, accent = 'purple', children }) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = {
    purple: 'from-purple-900/30 to-indigo-900/20 border-purple-500/20 text-purple-300',
    teal:   'from-teal-900/30 to-emerald-900/20 border-teal-500/20 text-teal-300',
    amber:  'from-amber-900/30 to-orange-900/20 border-amber-500/20 text-amber-300',
    blue:   'from-blue-900/30 to-cyan-900/20 border-blue-500/20 text-blue-300',
    rose:   'from-rose-900/30 to-pink-900/20 border-rose-500/20 text-rose-300',
  };
  const c = colors[accent] || colors.purple;
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${c} mb-4 overflow-hidden transition-all duration-200`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <span className="text-xl">{icon}</span>
        <span className="font-semibold flex-1 text-[var(--text-primary)] text-sm">{title}</span>
        {badge != null && (
          <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-bold mr-2 opacity-80">{badge}</span>
        )}
        <span className={`text-lg transition-transform duration-200 ${open ? 'rotate-180' : ''} opacity-60`}>▾</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-white/10">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Inline Editable Field ─────────────────────────────────────────────────────
function EditableField({ label, value, multiline = false, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(draft); setEditing(false); } catch {}
    setSaving(false);
  };

  if (editing) {
    return (
      <div className="mt-2">
        {label && <div className="text-xs text-[var(--text-muted)] mb-1 font-semibold uppercase tracking-wider">{label}</div>}
        {multiline
          ? <textarea
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] resize-y min-h-[120px] focus:outline-none focus:border-purple-500"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
            />
          : <input
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-purple-500"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
            />
        }
        <div className="flex gap-2 mt-2">
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : <><CheckCircle size={14} className="inline mr-1"/> Save</>}
          </button>
          <button onClick={() => { setEditing(false); setDraft(value || ''); }}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[var(--text-secondary)] text-xs font-bold transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative mt-2">
      {label && <div className="text-xs text-[var(--text-muted)] mb-1 font-semibold uppercase tracking-wider">{label}</div>}
      <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap pr-8">
        {value || <span className="italic opacity-40">Empty</span>}
      </div>
      <button
        onClick={() => { setDraft(value || ''); setEditing(true); }}
        className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-purple-300"
        title="Edit"
      ><Edit2 size={13} /></button>
    </div>
  );
}

// ── Full Screenplay Review Panel ──────────────────────────────────────────────
function ScreenplayReviewPanel({ screenplay, onProduce, onRegenerate, loading, screenplaysApi, onScreenplayUpdate }) {
  const [sp, setSp] = useState(screenplay);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSp(screenplay); }, [screenplay]);

  const patchField = async (field, value) => {
    setSaving(true);
    try {
      const { data } = await screenplaysApi.patch(sp._id, { [field]: value });
      const updated = { ...sp, ...data?.screenplay, [field]: value };
      setSp(updated);
      if (onScreenplayUpdate) onScreenplayUpdate(updated);
    } catch (err) {
      console.error('Patch failed:', err);
    }
    setSaving(false);
  };

  const patchAct = async (actIndex, field, value) => {
    const acts = [...(sp.acts || [])];
    acts[actIndex] = { ...acts[actIndex], [field]: value };
    await patchField('acts', acts);
  };

  const patchScene = async (actIndex, sceneIndex, field, value) => {
    const acts = [...(sp.acts || [])];
    const scenes = [...(acts[actIndex].scenes || [])];
    scenes[sceneIndex] = { ...scenes[sceneIndex], [field]: value };
    acts[actIndex] = { ...acts[actIndex], scenes };
    await patchField('acts', acts);
  };

  const totalScenes = sp.acts?.reduce((n, a) => n + (a.scenes?.length || 0), 0) || sp.totalScenes || 0;

  return (
    <div className="film-step-panel">
      {/* Header */}
      <div className="step-panel-header">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="flex items-center gap-2">✅ Screenplay Ready</h2>
            <p>Review, edit, then start production. Click the edit icon to edit inline.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="stat-pill"><ListChecks size={12} style={{ display: "inline", marginRight: 4 }} />{totalScenes} Scenes</div>
            <div className="stat-pill"><Film size={14} className="inline mr-1"/> {sp.acts?.length} Acts</div>
            <div className="stat-pill"><Users size={12} style={{ display: "inline", marginRight: 4 }} />{sp.characters?.length || 0} Characters</div>
            {saving && <div className="stat-pill animate-pulse"><Save size={12} style={{ display: "inline", marginRight: 4 }} />Saving…</div>}
          </div>
        </div>
      </div>

      {/* ── Story Bible ── */}
      <CollapseCard title="Story Bible & Logline" icon={<BookOpen size={16} />} defaultOpen={true} accent="purple">
        <EditableField
          label="Film Title"
          value={sp.title}
          onSave={v => patchField('title', v)}
        />
        <EditableField
          label="Synopsis"
          value={sp.synopsis}
          multiline
          onSave={v => patchField('synopsis', v)}
        />
        {sp.storyBible && (
          <EditableField
            label="Story Bible"
            value={sp.storyBible}
            multiline
            onSave={v => patchField('storyBible', v)}
          />
        )}
        {sp.styleGuide && (
          <EditableField
            label="Visual Style Guide"
            value={typeof sp.styleGuide === 'string' ? sp.styleGuide : JSON.stringify(sp.styleGuide, null, 2)}
            multiline
            onSave={v => patchField('styleGuide', v)}
          />
        )}
      </CollapseCard>

      {/* ── Characters ── */}
      {sp.characters?.length > 0 && (
        <CollapseCard title="Characters" icon={<User size={16}/>} badge={sp.characters.length} accent="teal">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {sp.characters.map((char, i) => (
              <div key={i} className="rounded-lg bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-7 h-7 rounded-full bg-teal-800/60 flex items-center justify-center text-xs font-bold text-teal-200 shrink-0">
                    {(char.name || '?')[0].toUpperCase()}
                  </span>
                  <span className="font-semibold text-sm text-[var(--text-primary)]">{char.name}</span>
                  {char.role && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-teal-900/60 text-teal-300 uppercase font-bold">{char.role}</span>}
                </div>
                {char.physicalDescription && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{char.physicalDescription}</p>
                )}
              </div>
            ))}
          </div>
        </CollapseCard>
      )}

      {/* ── Acts & Scenes ── */}
      <CollapseCard title="Act Structure & Scenes" icon={<Clapperboard size={16}/>} badge={`${sp.acts?.length || 0} acts · ${totalScenes} scenes`} defaultOpen={true} accent="amber">
        {sp.acts?.map((act, ai) => (
          <div key={ai} className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 uppercase">Act {act.actNumber}</span>
              <span className="font-semibold text-[var(--text-primary)] text-sm flex-1">{act.title}</span>
              {act.emotion && <span className="text-xs text-[var(--text-muted)]">{act.emotion}</span>}
            </div>
            <EditableField
              label="Act Description"
              value={act.description}
              multiline
              onSave={v => patchAct(ai, 'description', v)}
            />
            {/* Scene list within act */}
            {act.scenes?.map((scene, si) => (
              <CollapseCard
                key={si}
                title={`Scene ${scene.sceneNumber || si + 1}: ${scene.location || 'Unknown location'}`}
                icon={<Camera size={16} />}
                badge={`${scene.beats?.length || 0} beats`}
                accent="blue"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 text-xs">
                  <div><span className="text-[var(--text-muted)]">Time: </span><span className="text-[var(--text-secondary)]">{scene.timeOfDay || '—'}</span></div>
                  <div><span className="text-[var(--text-muted)]">Tone: </span><span className="text-[var(--text-secondary)]">{scene.emotion || '—'}</span></div>
                  <div><span className="text-[var(--text-muted)]">Characters: </span><span className="text-[var(--text-secondary)]">{scene.characters?.join(', ') || scene.characterNames?.join(', ') || '—'}</span></div>
                  <div><span className="text-[var(--text-muted)]">Duration: </span><span className="text-[var(--text-secondary)]">{scene.estimatedDuration || '—'}s</span></div>
                </div>
                <EditableField
                  label="Scene Description"
                  value={scene.description}
                  multiline
                  onSave={v => patchScene(ai, si, 'description', v)}
                />
                {scene.beats?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Beats</div>
                    <div className="space-y-2">
                      {scene.beats.map((beat, bi) => (
                        <div key={bi} className="rounded-lg bg-white/5 p-2.5 text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[var(--text-muted)] font-mono">#{bi + 1}</span>
                            {beat.strategy && <span className="px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 text-[10px] uppercase font-bold">{beat.strategy}</span>}
                            {beat.cameraAngle && <span className="text-[var(--text-muted)] text-[10px]">{beat.cameraAngle.replace(/_/g, ' ')}</span>}
                            {beat.speaker && <span className="ml-auto text-teal-300 font-semibold">{beat.speaker}</span>}
                          </div>
                          <div className="text-[var(--text-secondary)] leading-relaxed">{beat.action}</div>
                          {beat.dialogue && (
                            <div className="mt-1 pl-2 border-l-2 border-purple-500/40 text-purple-200 italic">
                              "{beat.dialogue}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CollapseCard>
            ))}
          </div>
        ))}
      </CollapseCard>

      {/* ── Full Script Text ── */}
      {sp.rawScript && (
        <CollapseCard title="Full Script Text" icon={<Film size={16} />} accent="rose">
          <EditableField
            label="Raw Script"
            value={sp.rawScript}
            multiline
            onSave={v => patchField('rawScript', v)}
          />
        </CollapseCard>
      )}
      {sp.synopsis && !sp.rawScript && (
        <CollapseCard title="Synopsis / Script" icon={<Film size={16} />} accent="rose">
          <EditableField
            label="Script / Synopsis"
            value={sp.synopsis}
            multiline
            onSave={v => patchField('synopsis', v)}
          />
        </CollapseCard>
      )}

      {/* ── Production Cost ── */}
      <div className="production-cost-note mt-4">
        <div className="cost-icon"><Lightbulb size={20} /></div>
        <div>
          <strong>Production Cost Estimate:</strong> This film will require ~{totalScenes} image generations and ~{totalScenes} video clip generations.
          Cost depends on your video provider (Kling: ~$0.15/clip · Runway: ~$0.25/clip).
        </div>
      </div>

      <div className="step-footer">
        <button className="btn-secondary" onClick={onRegenerate}>← Regenerate</button>
        <button className="btn-produce btn-lg" onClick={onProduce} disabled={loading}>
          {loading ? 'Starting Production…' : <><Clapperboard size={16} className="inline mr-1"/> Start Film Production</>}
        </button>
      </div>
    </div>
  );
}

// ── Interactive Image Lightbox Modal ──────────────────────────────────────────
function ImageLightboxModal({ preview, onClose }) {
  if (!preview) return null;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="relative max-w-4xl w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-[var(--radius-xl)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--bg-raised)]">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <span className="text-lg">{preview.icon || <Film size={16}/>}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{preview.title}</h3>
              {preview.badge && (
                <span className="text-[10px] text-[var(--brand-light)] font-semibold uppercase tracking-wider">{preview.badge}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={preview.src}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--glass-border)] text-xs flex items-center gap-1 transition-colors"
              title="Open full image in new tab"
            >
              <span>↗️</span>
              <span className="hidden sm:inline text-[11px] font-medium">Open Full</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--glass-border)] transition-colors"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Image Preview Container */}
        <div className="flex-1 bg-black/75 flex items-center justify-center p-4 overflow-auto min-h-[300px] max-h-[65vh]">
          <img
            src={preview.src}
            alt={preview.title}
            className="max-w-full max-h-[60vh] object-contain rounded-[var(--radius-md)] shadow-2xl border border-white/10"
          />
        </div>

        {/* Details / Subtitle */}
        {preview.subtitle && (
          <div className="p-4 bg-[var(--bg-surface)] border-t border-[var(--glass-border)] text-xs text-[var(--text-secondary)] leading-relaxed max-h-32 overflow-y-auto">
            {preview.label && <strong className="text-[var(--text-primary)] block mb-1">{preview.label}</strong>}
            {preview.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function FilmStudioPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get('new') === 'true';

  const { activeProject, setActiveProject } = useAppStore();
  const { confirm, confirmDialog } = useConfirm();
  const [projectLoading, setProjectLoading] = useState(true);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedScreenplay, setGeneratedScreenplay] = useState(null);
  const [showCharEditor, setShowCharEditor] = useState(false);
  const [editingChar, setEditingChar] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [researchNotes, setResearchNotes] = useState('');

  // Film concept form
  const [concept, setConcept] = useState({
    title: '',
    videoType: 'documentary',
    aspectRatio: '16:9',
    synopsis: '',
    duration: 3,
    themes: '',
    additionalSettings: '',
    mediaFile: null,
  });

  // Sync step and concept to local storage
  useEffect(() => {
    localStorage.setItem('film_studio_step', step.toString());
  }, [step]);

  useEffect(() => {
    localStorage.setItem('film_studio_concept', JSON.stringify(concept));
  }, [concept]);

  useEffect(() => {
    if (generatedScreenplay) {
      localStorage.setItem('film_studio_screenplay', JSON.stringify(generatedScreenplay));
      // Persist the stable id too — on reload we re-fetch this exact screenplay by
      // id (source of truth), rather than trusting the cached snapshot.
      if (generatedScreenplay._id) {
        localStorage.setItem('film_studio_screenplay_id', String(generatedScreenplay._id));
      }
    } else {
      localStorage.removeItem('film_studio_screenplay');
      localStorage.removeItem('film_studio_screenplay_id');
    }
  }, [generatedScreenplay]);

  // Load project details, characters & screenplay on mount / route change
  useEffect(() => {
    let isMounted = true;

    async function initStudio() {
      setProjectLoading(true);
      try {
        let currentProj = null;

        // 1. Resolve project if ID provided in route
        if (projectId) {
          try {
            const res = await getProject(projectId);
            currentProj = res.data;
            if (isMounted && currentProj) {
              setActiveProject(currentProj);
              localStorage.setItem('film_studio_project_id', currentProj._id);
            }
          } catch (err) {
            console.error('Error fetching project:', err);
          }
        } else {
          const savedProjId = localStorage.getItem('film_studio_project_id');
          if (savedProjId) {
            navigate(`/app/film-studio/${savedProjId}`, { replace: true });
            return;
          }
        }

        const targetProjId = currentProj?._id || projectId || activeProject?._id;

        // 2. Fetch characters scoped to target project
        try {
          const charRes = await filmCharactersApi.list(targetProjId ? { projectId: targetProjId } : {});
          if (isMounted) setCharacters(charRes.data.characters || []);
        } catch (err) {
          console.error('Failed to load characters:', err);
        }

        // 3. Handle NEW studio creation vs existing project load
        if (isNew) {
          localStorage.removeItem('film_studio_screenplay');
          localStorage.removeItem('film_studio_screenplay_id');
          localStorage.setItem('film_studio_step', '1');
          if (isMounted) {
            setGeneratedScreenplay(null);
            setStep(1);
            setConcept({
              title: currentProj ? currentProj.name : '',
              videoType: currentProj?.style?.preset || 'documentary',
              aspectRatio: '16:9',
              synopsis: currentProj ? currentProj.description : '',
              duration: 3,
              themes: '',
              additionalSettings: '',
              mediaFile: null,
            });
          }
        } else {
          // Load the screenplay we were last working on. Prefer the exact id we
          // persisted (survives a refresh precisely, including mid-generation),
          // and fall back to the latest screenplay for this project.
          try {
            const savedSpId = localStorage.getItem('film_studio_screenplay_id');
            let loaded = null;

            if (savedSpId) {
              try {
                const { data } = await screenplaysApi.get(savedSpId);
                const sp = data?.screenplay;
                // Only reuse it if it belongs to the project we're viewing.
                if (sp && (!targetProjId || String(sp.projectId) === String(targetProjId))) {
                  loaded = sp;
                }
              } catch {
                // Not found / different workspace — fall through to the list lookup.
              }
            }

            if (!loaded) {
              const spRes = await screenplaysApi.list(targetProjId ? { projectId: targetProjId } : {});
              const list = spRes.data.screenplays || [];
              if (list.length > 0) {
                const { data } = await screenplaysApi.get(list[0]._id);
                loaded = data?.screenplay || null;
              }
            }

            if (loaded && isMounted) {
              setGeneratedScreenplay(loaded);
              // Every persisted screenplay is reviewed on step 4, which renders the
              // right view per status: generating → live progress, draft → retry,
              // ready → produce, in_production/completed → info. The poll + socket
              // effects then keep a 'generating' one updating to completion.
              setStep(4);
              setConcept(prev => ({
                ...prev,
                title: loaded.title || currentProj?.name || prev.title,
                synopsis: loaded.synopsis || currentProj?.description || prev.synopsis,
                videoType: loaded.genre || prev.videoType,
                duration: Math.ceil((loaded.totalScenes || 18) / 6),
              }));
            } else if (currentProj && isMounted) {
              setGeneratedScreenplay(null);
              setStep(1);
              setConcept(prev => ({
                ...prev,
                title: currentProj.name || prev.title,
                synopsis: currentProj.description || prev.synopsis,
              }));
            }
          } catch (err) {
            console.error('Failed to load screenplay:', err);
          }
        }
      } finally {
        if (isMounted) setProjectLoading(false);
      }
    }

    initStudio();

    return () => { isMounted = false; };
  }, [projectId, isNew]);

  // ── Live generation tracking ────────────────────────────────────────────────
  // While a screenplay is 'generating', poll the backend as a safety net so the UI
  // reaches completion even if a socket event is missed (reconnect, restart, etc.).
  const pollRef = useRef(null);
  useEffect(() => {
    // Always clear the previous interval when id/status changes or on unmount.
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const id = generatedScreenplay?._id;
    if (!id || generatedScreenplay.status !== 'generating') return;

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await screenplaysApi.get(id);
        if (data?.screenplay) setGeneratedScreenplay(data.screenplay);
      } catch (err) {
        console.error('[FilmStudio] Screenplay poll failed:', err);
      }
    }, 4000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generatedScreenplay?._id, generatedScreenplay?.status]);

  // Socket push: merge live progress patches instantly. On a terminal status the
  // patch is only a lightweight summary, so re-fetch the full document.
  useScreenplaySocket(generatedScreenplay?._id, async (payload) => {
    const id = payload?.screenplayId;
    const terminal = ['ready', 'draft', 'in_production', 'completed'].includes(payload.status);
    if (terminal) {
      try {
        const { data } = await screenplaysApi.get(id);
        if (data?.screenplay) { setGeneratedScreenplay(data.screenplay); return; }
      } catch { /* fall through to the merge below */ }
    }
    setGeneratedScreenplay(prev => (prev && prev._id === id ? { ...prev, ...payload } : prev));
  });

  const setConcField = (field) => (e) => setConcept(c => ({ ...c, [field]: e.target.value }));

  // ── Step 1: Film Concept ────────────────────────────────────────────────────
  const step1Valid = concept.title.trim().length > 0 && concept.synopsis.trim().length > 20;

  // ── Step 2: Characters ─────────────────────────────────────────────────────
  const handleSaveCharacter = async (form, imageFile) => {
    try {
      setLoading(true);
      setError('');
      let charId;
      let finalChar;

      const currentProjId = projectId || activeProject?._id;
      const payload = { ...form, projectId: currentProjId || null };
      delete payload.referenceImage;
      delete payload.referenceImageUrl;

      if (editingChar?._id) {
        const { data } = await filmCharactersApi.update(editingChar._id, payload);
        charId = editingChar._id;
        finalChar = data.character;
      } else {
        const { data } = await filmCharactersApi.create(payload);
        charId = data.character._id;
        finalChar = data.character;
      }

      // If a new image was uploaded, send it to the multipart endpoint
      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        const { data } = await filmCharactersApi.uploadReferenceImage(charId, formData);
        finalChar = data.character;
      }

      if (editingChar?._id) {
        setCharacters(cs => cs.map(c => c._id === charId ? finalChar : c));
      } else {
        setCharacters(cs => [...cs, finalChar]);
      }

      setShowCharEditor(false);
      setEditingChar(null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to save character');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCharacter = async (char) => {
    const ok = await confirm({
      title: 'Delete character?',
      message: `This permanently removes "${char.name}" from this production. This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await filmCharactersApi.delete(char._id);
      setCharacters(cs => cs.filter(c => c._id !== char._id));
    } catch (err) {
      setError('Failed to delete character');
    }
  };

  // ── Start a completely new studio film ────────────────────────────────────
  const handleStartNewFilm = () => {
    localStorage.removeItem('film_studio_screenplay');
    localStorage.removeItem('film_studio_screenplay_id');
    localStorage.removeItem('film_studio_project_id');
    localStorage.setItem('film_studio_step', '1');
    setActiveProject(null);
    setGeneratedScreenplay(null);
    setCharacters([]);
    setConcept({
      title: '',
      videoType: 'documentary',
      aspectRatio: '16:9',
      synopsis: '',
      duration: 3,
      themes: '',
      additionalSettings: '',
      mediaFile: null,
    });
    setStep(1);
    navigate('/app/film-studio?new=true', { replace: true });
  };

  // ── AI Research & Trend Expansion ──────────────────────────────────────────
  const handleAiResearchExpand = async () => {
    if (!concept.synopsis.trim()) return;
    setIsExpanding(true);
    setError('');
    try {
      const selectedType = VIDEO_TYPES.find(t => t.id === concept.videoType)?.label || concept.videoType;
      const { data } = await screenplaysApi.researchExpand({
        title: concept.title,
        synopsis: concept.synopsis,
        videoType: concept.videoType,
      });

      if (data?.expandedSynopsis) {
        setConcept(c => ({
          ...c,
          title: (!c.title || c.title.trim().length < 3 || c.title === 'Untitled') ? (data.suggestedTitle || c.title) : c.title,
          synopsis: data.expandedSynopsis,
          themes: data.themes?.length ? data.themes.join(', ') : c.themes,
        }));

        if (data.researchHighlights || data.videoTypeDirectives) {
          setResearchNotes(`${data.researchHighlights ? data.researchHighlights + ' ' : ''}Tailored specifically as a ${selectedType} script.`);
        }

        // If characters were suggested and user has no characters yet, auto-suggest them
        if ((!characters || characters.length === 0) && data.suggestedCharacters?.length) {
          setCharacters(data.suggestedCharacters.map(sc => ({
            _id: 'temp-' + Math.random().toString(36).slice(2, 9),
            name: sc.name,
            role: sc.role || 'supporting',
            physicalDescription: sc.physicalDescription || '',
            backstory: sc.backstory || '',
          })));
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to research and expand concept. Please try again.');
    } finally {
      setIsExpanding(false);
    }
  };

  // ── Step 3: Generate Screenplay ────────────────────────────────────────────
  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      // If the current project has a different name than the concept title,
      // it's a new studio film! Treat projectId as null so a brand new Project Studio is created.
      const isSameProject = activeProject && activeProject.name?.trim().toLowerCase() === concept.title.trim().toLowerCase();
      const currentProjId = isSameProject ? (projectId || activeProject._id) : null;

      const { data } = await screenplaysApi.generate({
        title: concept.title,
        genre: concept.videoType, // Map VideoType to genre for backend compatibility
        synopsis: concept.synopsis,
        tone: 'cinematic', // default tone
        themes: concept.themes ? concept.themes.split(',').map(t => t.trim()).filter(Boolean) : [],
        animationStyle: 'cinematic', // fallback for previous required field
        aspectRatio: concept.aspectRatio,
        targetDurationMinutes: concept.duration,
        additionalSettings: concept.additionalSettings,
        filmCharacterIds: characters.map(c => c._id),
        projectId: currentProjId || null,
      });

      setGeneratedScreenplay(data.screenplay);

      // If a new Project Studio was created / assigned, switch studio context to it
      if (data.screenplay?.projectId) {
        const newProjId = String(data.screenplay.projectId);
        localStorage.setItem('film_studio_project_id', newProjId);
        navigate(`/app/film-studio/${newProjId}`, { replace: true });
        try {
          const projRes = await getProject(newProjId);
          if (projRes?.data) setActiveProject(projRes.data);
        } catch {}
      }

      setStep(4);
    } catch (err) {
      setError(err.response?.data?.error || 'Screenplay generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 4: Start Production ───────────────────────────────────────────────
  const handleProduce = async () => {
    if (!generatedScreenplay?._id) return;
    if (generatedScreenplay.status !== 'ready') {
      setError(`Screenplay is not ready (status: ${generatedScreenplay.status}). Please retry generation.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await screenplaysApi.produce(generatedScreenplay._id);
      navigate(`/app/jobs/${data.jobId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start production');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 4: Retry failed screenplay generation ─────────────────────────────
  const handleRegenerate = async () => {
    if (!generatedScreenplay?._id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await screenplaysApi.regenerate(generatedScreenplay._id);
      setGeneratedScreenplay(data.screenplay);
    } catch (err) {
      setError(err.response?.data?.error || 'Regeneration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedStyle = VIDEO_TYPES.find(t => t.id === concept.videoType);
  const estimatedScenes = concept.duration * 6;

  // Live progress readouts for a screenplay that is still generating. Socket
  // patches carry `stage` / `scenesSoFar` / `totalScenesTarget`; a polled full
  // document carries `totalScenes` (scenes persisted so far) and the target
  // derives from its duration. Fall back to the on-screen estimate.
  const genStage = generatedScreenplay?.stage
    || (generatedScreenplay?.acts?.length ? 'scenes' : '');
  const genScenesSoFar = generatedScreenplay?.scenesSoFar
    ?? generatedScreenplay?.totalScenes ?? 0;
  const genTotalTarget = generatedScreenplay?.totalScenesTarget
    ?? (generatedScreenplay?.targetDurationMinutes
        ? generatedScreenplay.targetDurationMinutes * 6
        : estimatedScenes);

  return (
    <div className="film-studio-page">
      {/* Header */}
      <div className="film-studio-header">
        <div className="film-studio-header-content">
          {/* Top Bar: Title + Project Badge + Switch Button */}
          <div className="flex items-center justify-between w-full min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="film-studio-icon hidden sm:flex shrink-0">
                <Clapperboard size={22}/>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base sm:text-lg md:text-xl font-bold text-[var(--text-primary)] m-0 shrink-0">
                  Film Studio
                </h1>
                {activeProject && (
                  <span className="px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent-green)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent-green)_30%,transparent)] text-[var(--accent-green)] text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1 max-w-[110px] sm:max-w-[160px] shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--accent-green)] animate-pulse" />
                    <span className="truncate">{activeProject.name}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                onClick={handleStartNewFilm}
                className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-dark)] text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                title="Start a new film"
              >
                <Plus size={13} />
                <span className="hidden sm:inline">New Film</span>
                <span className="sm:hidden">New</span>
              </button>

              <button
                onClick={() => navigate('/app/projects')}
                className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] transition-all flex items-center gap-1.5 shrink-0"
              >
                <Folder size={13} />
                <span className="hidden sm:inline">Switch Studio</span>
                <span className="sm:hidden">Studios</span>
              </button>
            </div>
          </div>

          {/* Desktop Subtitle */}
          <p className="hidden md:block text-xs text-[var(--text-secondary)] m-0 mt-1">
            Generate feature-length AI films from your imagination
          </p>

          {/* Step Indicator (desktop & mobile) */}
          <div className="w-full md:w-auto md:ml-auto mt-2 md:mt-0">
            <StepIndicator step={step} current={step} />
          </div>
        </div>
      </div>

      <div className="film-studio-body">
        {error && (
          <div className="film-error-banner">
            <span><AlertTriangle size={14} style={{ display: "inline", marginRight: 4 }} />{error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* ── STEP 1: Film Concept ── */}
        {step === 1 && (
          <div className="film-step-panel film-step-panel-inner">
            <div className="step-panel-header mb-8">
              <h2 className="flex items-center gap-2"><Settings size={20} className="text-[var(--text-muted)]"/> Project Configuration</h2>
              <p className="text-[var(--text-secondary)]">Define your project requirements, style, and scope.</p>
            </div>

            <div className="film-concept-grid">
              <div className="film-concept-left">
                <div className="form-group">
                  <label className="form-label">Project Title *</label>
                  <input
                    className="form-input"
                    value={concept.title}
                    onChange={setConcField('title')}
                    placeholder="e.g. My Next Masterpiece"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Video Type</label>
                  <div className="film-style-grid">
                    {VIDEO_TYPES.map(type => (
                      <button
                        key={type.id}
                        type="button"
                        className={`film-style-option ${concept.videoType === type.id ? 'selected' : ''}`}
                        onClick={() => {
                          setConcept(c => ({
                            ...c,
                            videoType: type.id,
                            duration: type.defaultTargetMinutes || c.duration
                          }));
                        }}
                      >
                        <div className="vt-thumb">
                          <img src={type.image} alt={type.label} loading="lazy" decoding="async" />
                          <span className="vt-badge">{type.Icon && <type.Icon size={14} />}</span>
                        </div>
                        <div className="vt-body">
                          <div className="vt-label">{type.label}</div>
                          <div className="vt-desc">{type.description}</div>
                          <div className="vt-media">
                            {type.mediaRequired !== false
                              ? <><Music size={11} style={{ display: 'inline', marginRight: 3 }} />Audio Required</>
                              : <><Film size={11} style={{ display: 'inline', marginRight: 3 }} />Script-Driven</>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <label className="form-label m-0">
                      Script / Synopsis * <span className="label-hint hidden sm:inline">Provide your full script or a summary</span>
                    </label>

                    <button
                      type="button"
                      disabled={isExpanding || !concept.synopsis.trim()}
                      onClick={handleAiResearchExpand}
                      className="px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      title="AI will research the internet and create a trending script matching your Video Type"
                    >
                      {isExpanding ? (
                        <>
                          <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                          <span>Researching trends for {VIDEO_TYPES.find(t => t.id === concept.videoType)?.label || 'film'}...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} className="text-amber-300" />
                          <span>AI Research & Expand</span>
                        </>
                      )}
                    </button>
                  </div>

                  <textarea
                    className="form-textarea"
                    rows={6}
                    value={concept.synopsis}
                    onChange={setConcField('synopsis')}
                    placeholder="Describe your idea or paste your script here (e.g. 'a man who acts good and loves everybody'). Click 'AI Research & Expand' to craft a trending, video-type script!"
                  />

                  {researchNotes && (
                    <div className="mt-2 p-2.5 rounded-lg bg-[var(--brand-subtle)] border border-[color-mix(in_srgb,var(--brand-primary)_30%,transparent)] text-xs text-[var(--text-secondary)] flex items-start gap-2 animate-fadeIn">
                      <Sparkles size={14} className="text-[var(--brand-light)] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[var(--text-primary)]">Researched & Trending: </span>
                        <span>{researchNotes}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="film-concept-right">
                <div className="form-group">
                  <label className="form-label">Aspect Ratio</label>
                  <div className="film-aspect-grid">
                    {ASPECT_RATIOS.map(ratio => (
                      <button
                        key={ratio.id}
                        className={`film-aspect-btn ${concept.aspectRatio === ratio.id ? 'selected' : ''}`}
                        onClick={() => setConcept(c => ({ ...c, aspectRatio: ratio.id }))}
                      >
                        <span className="film-aspect-label">{ratio.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`form-group ${VIDEO_TYPES.find(t => t.id === concept.videoType)?.fixedRuntime ? 'opacity-100' : 'opacity-50'}`}>
                  <label className="form-label">Target Runtime (Minutes)</label>
                  <input
                    type="number"
                    className="form-input"
                    min="1"
                    disabled={!VIDEO_TYPES.find(t => t.id === concept.videoType)?.fixedRuntime}
                    value={concept.duration}
                    onChange={(e) => setConcept(c => ({ ...c, duration: parseInt(e.target.value) || 1 }))}
                  />
                  <small className="label-hint block mt-2">
                    {!VIDEO_TYPES.find(t => t.id === concept.videoType)?.fixedRuntime 
                      ? "Runtime is dynamic based on your script/media for this type." 
                      : "Fixed target runtime for this video type."}
                  </small>
                </div>

                <div className="form-group">
                  <div className="flex justify-between items-center mb-2">
                    <label className="form-label m-0">
                      Media File {VIDEO_TYPES.find(t => t.id === concept.videoType)?.mediaRequired ? <span className="text-[var(--accent-red)]">*</span> : <span className="label-hint">(optional)</span>}
                    </label>
                    {concept.mediaFile && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConcept(c => ({ ...c, mediaFile: null }));
                        }}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-red)] flex items-center gap-1 transition-colors"
                      >
                        <X size={12} /> Clear
                      </button>
                    )}
                  </div>

                  <input
                    type="file"
                    id="concept-media-file-input"
                    hidden
                    accept="audio/*,video/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setConcept(c => ({ ...c, mediaFile: file }));
                      }
                    }}
                  />

                  <div
                    onClick={() => document.getElementById('concept-media-file-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingMedia(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingMedia(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingMedia(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) setConcept(c => ({ ...c, mediaFile: file }));
                    }}
                    className={`film-media-dropzone ${isDraggingMedia ? 'active' : ''}`}
                  >
                    {concept.mediaFile ? (
                      <div className="flex items-center gap-3 w-full">
                        <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--accent-green)_16%,transparent)] text-[var(--accent-green)] flex items-center justify-center shrink-0 border border-[color-mix(in_srgb,var(--accent-green)_30%,transparent)]">
                          <CheckCircle size={15} />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {concept.mediaFile.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {(concept.mediaFile.size / (1024 * 1024)).toFixed(2)} MB · Tap to replace
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 w-full">
                        <div className="w-8 h-8 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand-primary)] flex items-center justify-center shrink-0 border border-[var(--border-subtle)]">
                          <UploadCloud size={15} />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <div className="text-xs font-semibold text-[var(--text-primary)]">
                            Upload Audio / Video
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            MP3, WAV, MP4, MOV · Tap to browse
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <small className="label-hint block mt-1.5">
                    {VIDEO_TYPES.find(t => t.id === concept.videoType)?.mediaRequired
                      ? 'Required for this video type. The system matches visuals to your media.'
                      : 'Optional. If left blank, video is built entirely from script.'}
                  </small>
                </div>
              </div>
            </div>

            <div className="step-footer mt-12 pt-6 border-t border-[var(--border-default)] flex justify-between items-center">
              <div className="step-info text-[var(--text-secondary)]">
                <span><strong>{VIDEO_TYPES.find(t => t.id === concept.videoType)?.label}</strong> · {concept.aspectRatio}</span>
              </div>
              <button
                className="btn btn-primary px-8 min-h-[48px] text-[1.1rem]"
                disabled={!step1Valid}
                onClick={() => setStep(2)}
              >
                Next: Add Characters →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Characters ── */}
        {step === 2 && (
          <div className="film-step-panel">
            <div className="step-panel-header">
              <h2 className="flex items-center gap-2"><Users size={20} className="text-[var(--text-muted)]"/> Character Builder</h2>
              <p>Add your main characters. The more detail you give, the more consistent they'll look across all scenes.</p>
            </div>

            <div className="characters-grid">
              {characters.map((char, i) => (
                <CharacterCard
                  key={char._id}
                  char={char}
                  index={i}
                  onEdit={(c) => { setEditingChar(c); setShowCharEditor(true); }}
                  onDelete={handleDeleteCharacter}
                  onPreview={setPreviewImage}
                />
              ))}

              <button
                className="add-char-btn"
                onClick={() => { setEditingChar(null); setShowCharEditor(true); }}
              >
                <div className="add-char-icon">+</div>
                <div>Add Character</div>
              </button>
            </div>

            {characters.length === 0 && (
              <div className="chars-empty-hint">
                <div className="chars-empty-icon"><Lightbulb size={24} style={{ color: "var(--accent-gold)" }} /></div>
                <p>You can skip characters and let the AI create them, or add your own for better visual consistency.</p>
              </div>
            )}

            <div className="step-footer">
              <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-primary btn-lg" onClick={() => setStep(3)}>
                Next: Generate Screenplay →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Generate ── */}
        {step === 3 && (
          <div className="film-step-panel">
            <div className="step-panel-header">
              <h2 className="flex items-center gap-2"><BookOpen size={20} className="text-[var(--text-muted)]"/> AI Screenplay Generator</h2>
              <p>The AI will write your full {concept.duration}-minute screenplay with {estimatedScenes} scenes. This takes 1–3 minutes.</p>
            </div>

            <div className="generation-summary">
              <div className="summary-card">
                <div className="summary-icon"><Clapperboard size={16}/></div>
                <div className="summary-label">Film Title</div>
                <div className="summary-value">"{concept.title}"</div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">{selectedStyle?.icon}</div>
                <div className="summary-label">Style</div>
                <div className="summary-value">{selectedStyle?.label}</div>
              </div>
              <div className="summary-card">
                <div className="summary-icon">⏱️</div>
                <div className="summary-label">Duration</div>
                <div className="summary-value">{concept.duration} min · {estimatedScenes} scenes</div>
              </div>
              <div className="summary-card">
                <div className="summary-icon"><User size={16}/></div>
                <div className="summary-label">Characters</div>
                <div className="summary-value">{characters.length > 0 ? characters.map(c => c.name).join(', ') : 'AI-Generated'}</div>
              </div>
            </div>

            <div className="synopsis-preview">
              <h4>Synopsis</h4>
              <p>"{concept.synopsis}"</p>
            </div>

            {loading && (
              <div className="generation-progress">
                <div className="gen-spinner" />
                <div className="gen-status">
                  <div className="gen-title">AI Screenplay Director is writing your film…</div>
                  <div className="gen-substeps">
                    <div className="gen-substep active"><BookOpen size={13} style={{ display: "inline", marginRight: 5 }} />Writing Story Bible &amp; Act Structure</div>
                    <div className="gen-substep"><User size={14} className="inline mr-1"/> Generating {estimatedScenes} scene descriptions</div>
                    <div className="gen-substep"><Camera size={14} className="inline mr-1"/> Assigning camera angles &amp; action types</div>
                    <div className="gen-substep"><Save size={13} style={{ display: "inline", marginRight: 5 }} />Saving screenplay to production queue</div>
                  </div>
                </div>
              </div>
            )}

            <div className="step-footer">
              <button className="btn-secondary" onClick={() => setStep(2)} disabled={loading}>← Back</button>
              <button className="btn-primary btn-lg btn-generate" onClick={handleGenerate} disabled={loading}>
                {loading ? 'Generating…' : 'Generate Full Screenplay'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Review & Produce ── */}
        {step === 4 && !generatedScreenplay && (
          <div className="film-step-panel p-12">
            <div className="step-panel-header">
              <h2>⏳ Loading Screenplay...</h2>
              <p>Fetching your generated screenplay from the production queue.</p>
            </div>
            <div className="step-footer mt-4">
              <button className="btn-secondary" onClick={() => setStep(3)}>← Go Back to Generate</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Draft / Generation Failed ── */}
        {step === 4 && generatedScreenplay && generatedScreenplay.status === 'draft' && (
          <div className="film-step-panel p-12">
            <div className="step-panel-header">
              <h2 className="flex items-center gap-2"><AlertTriangle size={20} className="text-[var(--accent-gold)]"/> Generation Incomplete</h2>
              <p>
                The AI started generating &ldquo;{generatedScreenplay.title}&rdquo; but encountered an error
                before finishing. The draft has been saved — you can retry without losing your settings.
              </p>
            </div>
            {(generatedScreenplay.generationError || error) && (
              <div className="error-banner mt-4" style={{ maxWidth: 520, margin: '1rem auto' }}>
                {generatedScreenplay.generationError || error}
              </div>
            )}
            <div className="step-footer mt-4">
              <button className="btn-secondary" onClick={() => setStep(3)} disabled={loading}>← Back to Settings</button>
              <button className="btn-produce btn-lg" onClick={handleRegenerate} disabled={loading}>
                {loading ? 'Retrying…' : <><AlertTriangle size={14} className="inline mr-1"/> Retry Generation</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Generation in progress (live) ── */}
        {step === 4 && generatedScreenplay && generatedScreenplay.status === 'generating' && (
          <div className="film-step-panel">
            <div className="step-panel-header">
              <h2>⏳ Writing Your Screenplay…</h2>
              <p>
                The AI Director is writing &ldquo;{generatedScreenplay.title}&rdquo;. This keeps running on
                the server even if you close this tab or the backend restarts — you can leave and come back
                any time.
              </p>
            </div>

            <div className="generation-progress">
              <div className="gen-spinner" />
              <div className="gen-status">
                <div className="gen-title">
                  {genScenesSoFar > 0
                    ? `Generating scenes… ${genScenesSoFar} / ${genTotalTarget}`
                    : 'Writing Story Bible & Act Structure…'}
                </div>
                <div className="gen-substeps">
                  <div className={`gen-substep ${genStage ? 'done' : 'active'}`}>
                    <BookOpen size={13} style={{ display: "inline", marginRight: 5 }} />Story Bible &amp; Act Structure
                  </div>
                  <div className={`gen-substep ${genStage === 'scenes' ? 'active' : ''}`}>
                    <User size={14} className="inline mr-1"/> Generating {genTotalTarget} scene descriptions
                    {genScenesSoFar > 0 ? ` (${genScenesSoFar}/${genTotalTarget})` : ''}
                  </div>
                  <div className="gen-substep"><Camera size={14} className="inline mr-1"/> Assigning camera angles &amp; action types</div>
                  <div className="gen-substep"><Save size={13} style={{ display: "inline", marginRight: 5 }} />Finalizing screenplay</div>
                </div>

                {generatedScreenplay.acts?.length > 0 && (
                  <div className="acts-list mt-4">
                    {generatedScreenplay.acts.map(act => (
                      <div key={act.actNumber} className="act-card">
                        <div className="act-num">Act {act.actNumber}</div>
                        <div className="act-title">{act.title}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="step-footer">
              <button className="btn-secondary" onClick={() => setStep(3)}>← Back</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Review & Produce ── */}
        {step === 4 && generatedScreenplay && generatedScreenplay.status === 'ready' && (
          <ScreenplayReviewPanel
            screenplay={generatedScreenplay}
            onProduce={handleProduce}
            onRegenerate={() => setStep(3)}
            loading={loading}
            screenplaysApi={screenplaysApi}
            onScreenplayUpdate={setGeneratedScreenplay}
          />
        )}
        {/* ── STEP 4: Catch-all fallback (in_production / completed / unknown status) ── */}
        {step === 4 && generatedScreenplay &&
          !['draft', 'ready', 'generating'].includes(generatedScreenplay.status) && (
          <div className="film-step-panel p-12">
            <div className="step-panel-header">
              <h2>
                {generatedScreenplay.status === 'in_production' && <><Clapperboard size={14} className="inline mr-1"/> Already In Production</>}
                {generatedScreenplay.status === 'completed' && <><CheckCircle size={20} style={{ display: 'inline', marginRight: 6, color: 'var(--accent-green)' }} />Production Complete</>}
                {!['in_production','completed'].includes(generatedScreenplay.status) && <><AlertTriangle size={20} style={{ display: 'inline', marginRight: 6 }} />Unknown Status</>}
              </h2>
              <p>
                {generatedScreenplay.status === 'in_production' &&
                  `"${generatedScreenplay.title}" is already being produced. Check your Jobs dashboard for progress.`}
                {generatedScreenplay.status === 'completed' &&
                  `"${generatedScreenplay.title}" has already been produced.`}
                {!['in_production','completed'].includes(generatedScreenplay.status) &&
                  `Screenplay status: ${generatedScreenplay.status}. Please try regenerating.`}
              </p>
            </div>
            <div className="step-footer mt-4">
              <button className="btn-secondary" onClick={() => setStep(3)}>← Back to Generate</button>
              {!['in_production','completed'].includes(generatedScreenplay.status) && (
                <button className="btn-produce btn-lg" onClick={handleRegenerate} disabled={loading}>
                  {loading ? 'Retrying…' : <><AlertTriangle size={14} className="inline mr-1"/> Retry Generation</>}
                </button>
              )}
              {generatedScreenplay.status === 'in_production' && (
                <button className="btn-produce btn-lg" onClick={() => navigate('/app/history')}>
                  <ListChecks size={16} style={{ display: "inline", marginRight: 6 }} />View Jobs Dashboard
                </button>
              )}
              {generatedScreenplay.status === 'completed' && (
                <button className="btn-produce btn-lg" onClick={() => navigate('/app/history')}>
                  <ListChecks size={16} style={{ display: "inline", marginRight: 6 }} />View Results
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Character Editor Modal */}
      {showCharEditor && (
        <CharacterEditor
          character={editingChar}
          onSave={handleSaveCharacter}
          onCancel={() => { setShowCharEditor(false); setEditingChar(null); }}
        />
      )}
      {confirmDialog}
      <ImageLightboxModal preview={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
