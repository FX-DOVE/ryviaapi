import React from 'react';
import { Lightbulb, Layers } from 'lucide-react';

const MODES = [
  { id: 'idea_mode', label: 'Idea Mode', Icon: Lightbulb },
  { id: 'assets_mode', label: 'Assets Mode', Icon: Layers },
];

export default function InputModeToggle({ mode, setMode }) {
  return (
    <div
      className="segmented"
      role="group"
      aria-label="Input mode"
      style={{ maxWidth: '340px', margin: '0 auto' }}
    >
      {MODES.map(({ id, label, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            className="segmented-option"
            aria-pressed={active}
            onClick={() => setMode(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
