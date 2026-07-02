import React from 'react';
import { Lightbulb, Layers } from 'lucide-react';

export default function InputModeToggle({ mode, setMode }) {
  return (
    <div style={{
      display: 'flex',
      gap: '3px',
      background: 'rgba(10, 10, 15, 0.7)',
      padding: '3px',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.07)',
      backdropFilter: 'blur(12px)',
      maxWidth: '340px',
      margin: '0 auto',
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    }}>
      {[
        { id: 'idea_mode', label: 'Idea Mode', Icon: Lightbulb },
        { id: 'assets_mode', label: 'Assets Mode', Icon: Layers },
      ].map(({ id, label, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              padding: '9px 20px',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer',
              border: 'none',
              ...(active
                ? {
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(124,58,237,0.15))',
                    color: 'var(--brand-light)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
                    border: '1px solid rgba(124,58,237,0.35)',
                  }
                : {
                    background: 'transparent',
                    color: 'var(--text-muted)',
                  }
              ),
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
