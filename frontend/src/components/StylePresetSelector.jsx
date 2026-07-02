import React from 'react';

const PRESETS = [
  { name: 'cinematic',           label: 'Cinematic',           icon: '🎬', color: '#7C3AED' },
  { name: 'documentary',         label: 'Documentary',         icon: '📽️',  color: '#3B82F6' },
  { name: 'movie_trailer',       label: 'Trailer',             icon: '🎪', color: '#EF4444' },
  { name: 'animation_pixar',     label: 'Pixar',               icon: '🧒', color: '#F59E0B' },
  { name: 'animation_anime',     label: 'Anime',               icon: '🌸', color: '#EC4899' },
  { name: 'animation_3d',        label: '3D Anim.',            icon: '🏛️', color: '#6366F1' },
  { name: 'animation_disney',    label: 'Disney',              icon: '🏰', color: '#F59E0B' },
  { name: 'realistic',           label: 'Realistic',           icon: '📷', color: '#10B981' },
  { name: 'news_report',         label: 'News',                icon: '📺', color: '#3B82F6' },
  { name: 'horror',              label: 'Horror',              icon: '👻', color: '#6B7280' },
  { name: 'fantasy',             label: 'Fantasy',             icon: '🧙', color: '#8B5CF6' },
  { name: 'luxury',              label: 'Luxury',              icon: '💎', color: '#F59E0B' },
  { name: 'scifi',               label: 'Sci-Fi',              icon: '🚀', color: '#06B6D4' },
  { name: 'historical',          label: 'Historical',          icon: '⚔️', color: '#92400E' },
  { name: 'african_storytelling',label: 'African',             icon: '🌍', color: '#10B981' },
  { name: 'custom',              label: 'Custom',              icon: '✨', color: '#A855F7' },
];

export default function StylePresetSelector({ selectedPreset, onSelectPreset }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '2px',
      }}>
        Visual Preset
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '6px',
        maxHeight: '260px',
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(124,58,237,0.2) transparent',
        paddingRight: '2px',
      }}>
        {PRESETS.map((p) => {
          const active = selectedPreset === p.name;
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => onSelectPreset(p.name)}
              title={p.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                padding: '8px 4px',
                borderRadius: '10px',
                border: active
                  ? `1px solid ${p.color}66`
                  : '1px solid rgba(255,255,255,0.055)',
                background: active
                  ? `linear-gradient(145deg, ${p.color}22, ${p.color}0A)`
                  : 'rgba(26, 26, 36, 0.6)',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                boxShadow: active
                  ? `0 0 12px ${p.color}33, inset 0 1px 0 rgba(255,255,255,0.05)`
                  : 'none',
                transform: active ? 'translateY(-1px)' : 'none',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.045)';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.055)';
                  e.currentTarget.style.background = 'rgba(26, 26, 36, 0.6)';
                }
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>{p.icon}</span>
              <span style={{
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.03em',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
