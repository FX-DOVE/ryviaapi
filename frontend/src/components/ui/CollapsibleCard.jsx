import React, { useState, useRef } from 'react';
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import { useEscapeKey, useBodyScrollLock, useFocusTrap } from '../../hooks/useUiBehaviors';

/**
 * A card whose body collapses/expands. Opt in with `maximizable` to add a
 * full-screen toggle: while maximized the card becomes a fixed overlay, locks
 * background scroll, traps focus, and restores on Escape — the same modal
 * affordances used elsewhere in the app, so the behavior stays consistent.
 *
 * Backwards compatible: without `maximizable` it renders and behaves exactly as
 * before (a header that toggles the body open/closed).
 */
export default function CollapsibleCard({
  title,
  icon: Icon,
  defaultOpen = true,
  badge,
  maximizable = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [maximized, setMaximized] = useState(false);
  const cardRef = useRef(null);

  // Modal-like affordances, active only while maximized.
  useBodyScrollLock(maximized);
  useEscapeKey(() => setMaximized(false), maximized);
  useFocusTrap(cardRef, maximized);

  // The body is always shown while maximized, regardless of collapse state.
  const bodyOpen = open || maximized;

  // Maximized: the body flex-fills the overlay and scrolls internally.
  // Otherwise: the original grid-rows height animation.
  const gridWrapperStyle = maximized
    ? { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }
    : {
        display: 'grid',
        gridTemplateRows: bodyOpen ? '1fr' : '0fr',
        transition: 'grid-template-rows 250ms cubic-bezier(0.4, 0, 0.2, 1)',
      };

  const innerWrapperStyle = maximized
    ? { flex: '1 1 auto', minHeight: 0, overflow: 'auto' }
    : { overflow: 'hidden' };

  return (
    <div
      ref={cardRef}
      className={`collapsible-card ${bodyOpen ? 'collapsible-card-open' : ''} ${maximized ? 'collapsible-card-maximized' : ''}`}
    >
      <div className="collapsible-card-header">
        <button
          className="collapsible-card-toggle"
          onClick={() => setOpen((prev) => !prev)}
          type="button"
          aria-expanded={bodyOpen}
          disabled={maximized}
        >
          <span className="collapsible-card-header-left">
            {Icon && <Icon size={15} className="collapsible-card-icon" />}
            <span className="collapsible-card-title">{title}</span>
            {badge && <span className="collapsible-card-badge">{badge}</span>}
          </span>
          <ChevronDown
            size={16}
            className={`collapsible-card-chevron ${bodyOpen ? 'collapsible-card-chevron-open' : ''}`}
          />
        </button>

        {maximizable && (
          <button
            type="button"
            className="collapsible-card-maximize"
            onClick={() => setMaximized((prev) => !prev)}
            aria-label={maximized ? 'Exit fullscreen' : 'Maximize'}
            aria-pressed={maximized}
            title={maximized ? 'Exit fullscreen' : 'Maximize'}
          >
            {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
      </div>

      {/* Animated body using the CSS grid-template-rows trick (or flex-fill when maximized) */}
      <div style={gridWrapperStyle}>
        <div style={innerWrapperStyle}>
          <div className="collapsible-card-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
