import React from 'react';
import {
  Clapperboard, Video, Film, Smile, Flower2, Box, Castle, Camera,
  Tv, Ghost, Wand2, Diamond, Rocket, Sword, Globe, Sparkles
} from 'lucide-react';

const PRESETS = [
  { name: 'cinematic',           label: 'Cinematic',           icon: <Clapperboard size={14} />, color: '#7C3AED' },
  { name: 'documentary',         label: 'Documentary',         icon: <Video size={14} />,        color: '#3B82F6' },
  { name: 'movie_trailer',       label: 'Trailer',             icon: <Film size={14} />,         color: '#EF4444' },
  { name: 'animation_pixar',     label: 'Pixar',               icon: <Smile size={14} />,        color: '#F59E0B' },
  { name: 'animation_anime',     label: 'Anime',               icon: <Flower2 size={14} />,      color: '#EC4899' },
  { name: 'animation_3d',        label: '3D Anim.',            icon: <Box size={14} />,          color: '#6366F1' },
  { name: 'animation_disney',    label: 'Disney',              icon: <Castle size={14} />,       color: '#F59E0B' },
  { name: 'realistic',           label: 'Realistic',           icon: <Camera size={14} />,       color: '#10B981' },
  { name: 'news_report',         label: 'News',                icon: <Tv size={14} />,           color: '#3B82F6' },
  { name: 'horror',              label: 'Horror',              icon: <Ghost size={14} />,        color: '#6B7280' },
  { name: 'fantasy',             label: 'Fantasy',             icon: <Wand2 size={14} />,        color: '#8B5CF6' },
  { name: 'luxury',              label: 'Luxury',              icon: <Diamond size={14} />,      color: '#F59E0B' },
  { name: 'scifi',               label: 'Sci-Fi',              icon: <Rocket size={14} />,       color: '#06B6D4' },
  { name: 'historical',          label: 'Historical',          icon: <Sword size={14} />,        color: '#92400E' },
  { name: 'african_storytelling',label: 'African',             icon: <Globe size={14} />,        color: '#10B981' },
  { name: 'custom',              label: 'Custom',              icon: <Sparkles size={14} />,     color: '#A855F7' },
];

export default function StylePresetSelector({ selectedPreset, onSelectPreset }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div className="section-label">Visual Preset</div>
      <div className="preset-grid" role="listbox" aria-label="Visual preset">
        {PRESETS.map((p) => {
          const active = selectedPreset === p.name;
          return (
            <button
              key={p.name}
              type="button"
              role="option"
              aria-selected={active}
              className={`preset-tile ${active ? 'active' : ''}`}
              style={{ '--preset-color': p.color }}
              onClick={() => onSelectPreset(p.name)}
              title={p.label}
            >
              <span className="preset-tile-emoji">{p.icon}</span>
              <span className="preset-tile-label">{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
