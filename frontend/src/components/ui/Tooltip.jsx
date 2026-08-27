import React, { useId } from 'react';

/**
 * Opt-in tooltip. Wraps a single focusable element and reveals `label`
 * on hover and on keyboard focus. Purely CSS-driven (see the .tt-* rules
 * in index.css), so there's no JS positioning to break, and it inherits
 * reduced-motion from the global handler.
 *
 * Accessibility: the label is exposed to screen readers via
 * `aria-describedby` on the trigger, merged with any existing value.
 * The tooltip supplements a control's accessible name — it does not
 * replace an icon button's `aria-label`.
 *
 *   <Tooltip label="Delete job" side="bottom">
 *     <button aria-label="Delete"><Trash2 /></button>
 *   </Tooltip>
 *
 * Note: like any CSS tooltip, it is clipped by `overflow: hidden`
 * ancestors — use it on chrome and controls, not inside tight scroll
 * containers.
 */
export function Tooltip({ label, children, side = 'top', className = '' }) {
  const id = useId();

  const trigger = React.isValidElement(children)
    ? React.cloneElement(children, {
        'aria-describedby': [children.props['aria-describedby'], id]
          .filter(Boolean)
          .join(' '),
      })
    : children;

  return (
    <span className={`tt-wrap ${className}`}>
      {trigger}
      <span role="tooltip" id={id} className={`tt-bubble tt-${side}`}>
        {label}
      </span>
    </span>
  );
}
