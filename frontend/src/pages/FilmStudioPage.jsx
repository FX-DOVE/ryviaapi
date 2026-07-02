import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { filmCharactersApi, screenplaysApi } from '../api/filmStudio';

// ── Helpers ──────────────────────────────────────────────────────────────────
const GENRES = ['Action', 'Drama', 'Romance', 'Thriller', 'Sci-Fi', 'Horror',
                'Comedy', 'Adventure', 'Fantasy', 'Mystery', 'Historical', 'Animation'];
const ANIMATION_STYLES = [
  { value: '3d_cgi_hollywood', label: '3D CGI Hollywood', desc: 'Photorealistic CGI like Avengers, Black Panther', icon: '🎬' },
  { value: 'nollywood_drama',  label: 'Nollywood Drama',   desc: 'Authentic African film with vibrant cultural settings', icon: '🌍' },
  { value: '2d_anime',         label: '2D Anime',          desc: 'Studio Ghibli / Demon Slayer inspired animation', icon: '⛩️' },
  { value: 'pixar',            label: 'Pixar Animation',   desc: 'Warm stylized 3D animation like Toy Story, Coco', icon: '🌟' },
  { value: 'cinematic',        label: 'Cinematic Realism',  desc: 'Hollywood documentary-style cinematography', icon: '🎥' },
];

const CHARACTER_ROLES = ['protagonist', 'antagonist', 'supporting', 'minor'];

function StepIndicator({ step, current }) {
  const STEPS = ['Film Concept', 'Characters', 'Generate', 'Review'];
  return (
    <div className="film-step-indicator">
      {STEPS.map((label, i) => (
        <div key={i} className={`film-step ${i + 1 === current ? 'active' : ''} ${i + 1 < current ? 'done' : ''}`}>
          <div className="film-step-num">{i + 1 < current ? '✓' : i + 1}</div>
          <span>{label}</span>
          {i < STEPS.length - 1 && <div className="film-step-line" />}
        </div>
      ))}
    </div>
  );
}

function CharacterCard({ char, onEdit, onDelete, index }) {
  return (
    <div className="char-card">
      <div className="char-avatar" style={{ background: `hsl(${index * 60}, 70%, 25%)` }}>
        {char.referenceImageUrl
          ? <img src={char.referenceImageUrl} alt={char.name} />
          : <span>{char.name[0]}</span>}
      </div>
      <div className="char-info">
        <div className="char-name">{char.name}</div>
        <div className="char-role-badge">{char.role}</div>
        {char.physicalDescription && (
          <p className="char-desc">{char.physicalDescription.slice(0, 80)}…</p>
        )}
      </div>
      <div className="char-actions">
        <button className="btn-icon" onClick={() => onEdit(char)} title="Edit">✏️</button>
        <button className="btn-icon btn-icon-danger" onClick={() => onDelete(char)} title="Delete">🗑️</button>
      </div>
    </div>
  );
}

function CharacterEditor({ character, onSave, onCancel }) {
  const [form, setForm] = useState(character || {
    name: '', role: 'supporting', age: '', gender: 'unspecified',
    ethnicity: '', physicalDescription: '', clothingDefault: '',
    personality: '', backstory: '', voiceId: '', voiceName: '',
    animationStyle: null,
  });

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="char-editor-overlay">
      <div className="char-editor">
        <div className="char-editor-header">
          <h3>{character ? 'Edit Character' : 'New Character'}</h3>
          <button className="btn-close" onClick={onCancel}>✕</button>
        </div>

        <div className="char-editor-body">
          <div className="editor-row">
            <div className="editor-field">
              <label>Character Name *</label>
              <input value={form.name} onChange={set('name')} placeholder="e.g. Adaeze, Kojo, Mei" />
            </div>
            <div className="editor-field">
              <label>Role</label>
              <select value={form.role} onChange={set('role')}>
                {CHARACTER_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="editor-row">
            <div className="editor-field">
              <label>Age</label>
              <input type="number" value={form.age} onChange={set('age')} placeholder="28" />
            </div>
            <div className="editor-field">
              <label>Gender</label>
              <select value={form.gender} onChange={set('gender')}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="unspecified">Unspecified</option>
              </select>
            </div>
            <div className="editor-field">
              <label>Ethnicity / Culture</label>
              <input value={form.ethnicity} onChange={set('ethnicity')} placeholder="e.g. Nigerian Yoruba, Japanese" />
            </div>
          </div>

          <div className="editor-field">
            <label>Physical Description <span className="label-hint">(This is injected into EVERY scene — be very detailed)</span></label>
            <textarea
              value={form.physicalDescription}
              onChange={set('physicalDescription')}
              rows={3}
              placeholder="e.g. Tall athletic build, dark brown skin, high cheekbones, short natural hair, strong jawline, deep-set brown eyes, usually has a serious determined expression"
            />
          </div>

          <div className="editor-field">
            <label>Default Clothing / Wardrobe</label>
            <input
              value={form.clothingDefault}
              onChange={set('clothingDefault')}
              placeholder="e.g. Red and gold ankara dress with matching headwrap and silver jewelry"
            />
          </div>

          <div className="editor-field">
            <label>Personality</label>
            <input
              value={form.personality}
              onChange={set('personality')}
              placeholder="e.g. Brave but impulsive, protective of family, speaks in short direct sentences"
            />
          </div>

          <div className="editor-field">
            <label>Backstory</label>
            <textarea
              value={form.backstory}
              onChange={set('backstory')}
              rows={2}
              placeholder="Brief character history that informs the AI screenplay writer..."
            />
          </div>

          <div className="editor-row">
            <div className="editor-field">
              <label>ElevenLabs Voice ID <span className="label-hint">(optional)</span></label>
              <input value={form.voiceId} onChange={set('voiceId')} placeholder="21m00Tcm4TlvDq8ikWAM" />
            </div>
            <div className="editor-field">
              <label>Voice Name</label>
              <input value={form.voiceName} onChange={set('voiceName')} placeholder="e.g. Adaeze – warm Nigerian voice" />
            </div>
          </div>
        </div>

        <div className="char-editor-footer">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form)}>Save Character</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function FilmStudioPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedScreenplay, setGeneratedScreenplay] = useState(null);
  const [showCharEditor, setShowCharEditor] = useState(false);
  const [editingChar, setEditingChar] = useState(null);
  const [characters, setCharacters] = useState([]);

  // Film concept form
  const [concept, setConcept] = useState({
    title: '',
    genre: 'Action',
    synopsis: '',
    tone: 'dramatic',
    animationStyle: '3d_cgi_hollywood',
    duration: 90,
    themes: '',
    additionalSettings: '',
  });

  const setConcField = (field) => (e) => setConcept(c => ({ ...c, [field]: e.target.value }));

  // ── Step 1: Film Concept ────────────────────────────────────────────────────
  const step1Valid = concept.title.trim().length > 0 && concept.synopsis.trim().length > 20;

  // ── Step 2: Characters ─────────────────────────────────────────────────────
  const handleSaveCharacter = async (form) => {
    try {
      setLoading(true);
      if (editingChar?._id) {
        const { data } = await filmCharactersApi.update(editingChar._id, form);
        setCharacters(cs => cs.map(c => c._id === editingChar._id ? data.character : c));
      } else {
        const { data } = await filmCharactersApi.create(form);
        setCharacters(cs => [...cs, data.character]);
      }
      setShowCharEditor(false);
      setEditingChar(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save character');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCharacter = async (char) => {
    if (!confirm(`Delete character "${char.name}"?`)) return;
    try {
      await filmCharactersApi.delete(char._id);
      setCharacters(cs => cs.filter(c => c._id !== char._id));
    } catch (err) {
      setError('Failed to delete character');
    }
  };

  // ── Step 3: Generate Screenplay ────────────────────────────────────────────
  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await screenplaysApi.generate({
        title: concept.title,
        genre: concept.genre,
        synopsis: concept.synopsis,
        tone: concept.tone,
        themes: concept.themes.split(',').map(t => t.trim()).filter(Boolean),
        animationStyle: concept.animationStyle,
        targetDurationMinutes: concept.duration,
        additionalSettings: concept.additionalSettings,
        filmCharacterIds: characters.map(c => c._id),
      });
      setGeneratedScreenplay(data.screenplay);
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
    setLoading(true);
    setError('');
    try {
      const { data } = await screenplaysApi.produce(generatedScreenplay._id);
      navigate(`/jobs/${data.jobId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start production');
    } finally {
      setLoading(false);
    }
  };

  const selectedStyle = ANIMATION_STYLES.find(s => s.value === concept.animationStyle);
  const estimatedScenes = concept.duration * 6;

  return (
    <div className="film-studio-page">
      {/* Header */}
      <div className="film-studio-header">
        <div className="film-studio-header-content">
          <div className="film-studio-brand">
            <div className="film-studio-icon">🎬</div>
            <div>
              <h1>Film Studio</h1>
              <p>Generate feature-length AI films from your imagination</p>
            </div>
          </div>
          <StepIndicator step={step} current={step} />
        </div>
      </div>

      <div className="film-studio-body">
        {error && (
          <div className="film-error-banner">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* ── STEP 1: Film Concept ── */}
        {step === 1 && (
          <div className="film-step-panel">
            <div className="step-panel-header">
              <h2>🎭 Film Concept</h2>
              <p>Define your film — the AI will write the full screenplay from this brief.</p>
            </div>

            <div className="concept-grid">
              <div className="concept-left">
                <div className="form-group">
                  <label>Film Title *</label>
                  <input
                    className="film-input"
                    value={concept.title}
                    onChange={setConcField('title')}
                    placeholder="e.g. The Last Guardian of Lagos"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Genre</label>
                    <select className="film-select" value={concept.genre} onChange={setConcField('genre')}>
                      {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tone</label>
                    <select className="film-select" value={concept.tone} onChange={setConcField('tone')}>
                      {['dramatic', 'dark', 'hopeful', 'mysterious', 'epic', 'tense', 'romantic', 'funny', 'inspirational'].map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Synopsis * <span className="label-hint">2-4 sentences — the AI does the rest</span></label>
                  <textarea
                    className="film-textarea"
                    rows={4}
                    value={concept.synopsis}
                    onChange={setConcField('synopsis')}
                    placeholder="e.g. A young warrior from Lagos discovers he has the power to control time, but using it corrupts his soul. When his village is threatened by an ancient demon warlord, he must choose between saving his family and losing his humanity forever..."
                  />
                  <div className="char-count">{concept.synopsis.length} chars</div>
                </div>

                <div className="form-group">
                  <label>Themes <span className="label-hint">comma-separated</span></label>
                  <input
                    className="film-input"
                    value={concept.themes}
                    onChange={setConcField('themes')}
                    placeholder="e.g. sacrifice, redemption, family, power"
                  />
                </div>
                
                <div className="form-group">
                  <label>Director's Notes / Additional Settings <span className="label-hint">(optional)</span></label>
                  <textarea
                    className="film-textarea"
                    rows="3"
                    value={concept.additionalSettings}
                    onChange={setConcField('additionalSettings')}
                    placeholder="Specify camera angles, pacing, color grading, or specific visual styles here."
                  />
                </div>
              </div>

              <div className="concept-right">
                <div className="form-group">
                  <label>Animation Style</label>
                  <div className="style-grid">
                    {ANIMATION_STYLES.map(style => (
                      <button
                        key={style.value}
                        className={`style-option ${concept.animationStyle === style.value ? 'selected' : ''}`}
                        onClick={() => setConcept(c => ({ ...c, animationStyle: style.value }))}
                      >
                        <div className="style-option-icon">{style.icon}</div>
                        <div className="style-option-label">{style.label}</div>
                        <div className="style-option-desc">{style.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Film Duration (Minutes)</label>
                  <div className="duration-input-wrapper" style={{ marginTop: '0.5rem' }}>
                    <input
                      type="number"
                      className="film-input"
                      min="1"
                      value={concept.duration}
                      onChange={(e) => setConcept(c => ({ ...c, duration: parseInt(e.target.value) || 1 }))}
                      style={{ fontSize: '1.2rem', padding: '1rem' }}
                    />
                    <div className="duration-scenes" style={{ marginTop: '0.5rem', color: '#888' }}>
                      ~{concept.duration * 6} scenes
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="step-footer">
              <div className="step-info">
                <span className="step-info-icon">{selectedStyle?.icon}</span>
                <span><strong>{selectedStyle?.label}</strong> · <strong>{concept.duration} min film</strong> · ~{estimatedScenes} scenes</span>
              </div>
              <button
                className={`btn-primary btn-lg ${!step1Valid ? 'disabled' : ''}`}
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
              <h2>🧑‍🎭 Character Builder</h2>
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
                <div className="chars-empty-icon">💡</div>
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
              <h2>🤖 AI Screenplay Generator</h2>
              <p>The AI will write your full {concept.duration}-minute screenplay with {estimatedScenes} scenes. This takes 1–3 minutes.</p>
            </div>

            <div className="generation-summary">
              <div className="summary-card">
                <div className="summary-icon">🎬</div>
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
                <div className="summary-icon">🧑‍🎭</div>
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
                    <div className="gen-substep active">📖 Writing Story Bible &amp; Act Structure</div>
                    <div className="gen-substep">🎭 Generating {estimatedScenes} scene descriptions</div>
                    <div className="gen-substep">🎬 Assigning camera angles &amp; action types</div>
                    <div className="gen-substep">💾 Saving screenplay to production queue</div>
                  </div>
                </div>
              </div>
            )}

            <div className="step-footer">
              <button className="btn-secondary" onClick={() => setStep(2)} disabled={loading}>← Back</button>
              <button className="btn-primary btn-lg btn-generate" onClick={handleGenerate} disabled={loading}>
                {loading ? 'Generating…' : '🤖 Generate Full Screenplay'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Review & Produce ── */}
        {step === 4 && generatedScreenplay && (
          <div className="film-step-panel">
            <div className="step-panel-header">
              <h2>✅ Screenplay Ready</h2>
              <p>Your {generatedScreenplay.totalScenes}-scene screenplay has been generated. Review the structure, then start production.</p>
            </div>

            <div className="screenplay-overview">
              <div className="sp-title">"{generatedScreenplay.title}"</div>
              {generatedScreenplay.storyBible && (
                <div className="sp-bible">
                  <h4>Story Bible</h4>
                  <p>{generatedScreenplay.storyBible.slice(0, 600)}{generatedScreenplay.storyBible.length > 600 ? '…' : ''}</p>
                </div>
              )}
              <div className="sp-acts">
                <h4>Act Structure</h4>
                <div className="acts-list">
                  {generatedScreenplay.acts?.map(act => (
                    <div key={act.actNumber} className="act-card">
                      <div className="act-num">Act {act.actNumber}</div>
                      <div className="act-title">{act.title}</div>
                      <div className="act-desc">{act.description}</div>
                      <div className="act-meta">
                        <span>🎵 {act.musicStyle}</span>
                        <span>😤 {act.emotion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sp-stats">
                <div className="stat-pill">📝 {generatedScreenplay.totalScenes} Scenes</div>
                <div className="stat-pill">📚 {generatedScreenplay.totalChapters} Chapters</div>
                <div className="stat-pill">🎭 {generatedScreenplay.acts?.length} Acts</div>
                <div className="stat-pill">🧑 {generatedScreenplay.characters?.length} Characters</div>
              </div>
            </div>

            <div className="production-cost-note">
              <div className="cost-icon">💡</div>
              <div>
                <strong>Production Cost Estimate:</strong> This film will require ~{generatedScreenplay.totalScenes} image generations and ~{generatedScreenplay.totalScenes} video clip generations.
                Cost depends on your video provider (Kling: ~$0.15/clip · Runway: ~$0.25/clip).
              </div>
            </div>

            <div className="step-footer">
              <button className="btn-secondary" onClick={() => setStep(3)}>← Regenerate</button>
              <button className="btn-produce btn-lg" onClick={handleProduce} disabled={loading}>
                {loading ? 'Starting Production…' : '🎬 Start Film Production'}
              </button>
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
    </div>
  );
}
