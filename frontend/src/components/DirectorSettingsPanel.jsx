import React from 'react';
import { Lock, Unlock } from 'lucide-react';
import StylePresetSelector from './StylePresetSelector';
import { AppInput } from './ui/AppInput';

export default function DirectorSettingsPanel({ styleConfig, setStyleConfig, creativeLock, setCreativeLock }) {
  const updateStyle = (key, value) => {
    setStyleConfig(prev => ({ ...prev, [key]: value }));
  };

  const updateLock = (key, value) => {
    setCreativeLock(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="director-settings-panel">
      
      <StylePresetSelector
        selectedPreset={styleConfig.preset}
        onSelectPreset={(p) => updateStyle('preset', p)}
      />

      <AppInput
        type="select"
        label="Camera Framing"
        value={styleConfig.camera}
        onChange={(e) => updateStyle('camera', e.target.value)}
        options={[
          { value: 'hollywood', label: 'Hollywood Cinematography' },
          { value: 'drone', label: 'Aerial Drone View' },
          { value: 'closeup', label: 'Extreme Close-Up' },
          { value: 'tracking', label: 'Lateral Tracking Shot' },
          { value: 'handheld', label: 'Handheld Shaky Cam' },
          { value: 'slow_zoom', label: 'Slow deliberate zoom' }
        ]}
      />

      <AppInput
        type="select"
        label="Lighting Setup"
        value={styleConfig.lighting}
        onChange={(e) => updateStyle('lighting', e.target.value)}
        options={[
          { value: 'golden_hour', label: 'Golden Hour' },
          { value: 'dramatic_chiaroscuro', label: 'Dramatic Chiaroscuro' },
          { value: 'neon_glow', label: 'Neon Synthwave practical' },
          { value: 'studio_softbox', label: 'Studio Softbox' },
          { value: 'natural_daylight', label: 'Natural Daylight' }
        ]}
      />

      <AppInput
        type="select"
        label="Color Grading"
        value={styleConfig.colorGrade}
        onChange={(e) => updateStyle('colorGrade', e.target.value)}
        options={[
          { value: 'netflix', label: 'Netflix Cinematic (Rich Shadows)' },
          { value: 'sepia', label: 'Vintage Sepia Tone' },
          { value: 'vintage', label: 'Faded Film Stock' },
          { value: 'warm', label: 'Warm Sunlight grades' },
          { value: 'cold', label: 'Cool Cyberpunk highlights' },
          { value: 'desaturated', label: 'Bleach Bypass (Gritty)' }
        ]}
      />

      <AppInput
        type="select"
        label="Motion Strength"
        value={styleConfig.motionLevel}
        onChange={(e) => updateStyle('motionLevel', e.target.value)}
        options={[
          { value: 'static', label: 'Static Shot (locked camera)' },
          { value: 'low', label: 'Low motion pans' },
          { value: 'medium', label: 'Standard smooth motion' },
          { value: 'high', label: 'High dramatic tracking' },
          { value: 'action', label: 'Action scene keyframes' }
        ]}
      />

      <AppInput
        type="select"
        label="Narrative Mood"
        value={styleConfig.emotion}
        onChange={(e) => updateStyle('emotion', e.target.value)}
        options={[
          { value: 'neutral', label: 'Neutral' },
          { value: 'hope', label: 'Uplifting hope' },
          { value: 'fear', label: 'Tense fear' },
          { value: 'victory', label: 'Triumphant epic victory' },
          { value: 'sadness', label: 'Melancholic sadness' }
        ]}
      />

      <AppInput
        type="textarea"
        label="Custom Director Notes"
        value={styleConfig.customStyleNotes}
        onChange={(e) => updateStyle('customStyleNotes', e.target.value)}
        placeholder="Add general style prompts directives..."
        className="[&>textarea]:min-h-[80px]"
      />

      <div className="director-lock-section">
        <div 
          className={`director-lock-toggle ${creativeLock.enabled ? 'director-lock-active' : ''}`}
          onClick={() => updateLock('enabled', !creativeLock.enabled)}
        >
          <div className="director-lock-info">
            {creativeLock.enabled ? (
              <Lock className="text-[var(--brand-primary)]" size={18} />
            ) : (
              <Unlock className="text-[var(--text-muted)]" size={18} />
            )}
            <div>
              <div className="director-lock-label">Creative Lock</div>
              <div className="director-lock-desc">Enforce consistency across scenes</div>
            </div>
          </div>
          
          <div className="director-lock-switch">
            <div className={`director-lock-switch-track ${creativeLock.enabled ? 'director-lock-switch-on' : ''}`}></div>
            <div className={`director-lock-switch-thumb ${creativeLock.enabled ? 'director-lock-switch-thumb-on' : ''}`}></div>
          </div>
        </div>

        {creativeLock.enabled && (
          <div className="director-lock-options animation-fade-in">
            {[
              { key: 'lockFaces', label: 'Lock Character Faces' },
              { key: 'lockLocations', label: 'Lock Environments' },
              { key: 'lockColorGrade', label: 'Lock Color Grading' },
              { key: 'lockCamera', label: 'Lock Camera Setup' },
            ].map(({ key, label }) => (
              <label key={key} className="director-lock-option">
                <span className="director-lock-option-label">{label}</span>
                <input
                  type="checkbox"
                  checked={creativeLock[key]}
                  onChange={(e) => updateLock(key, e.target.checked)}
                  className="director-lock-checkbox"
                />
              </label>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
