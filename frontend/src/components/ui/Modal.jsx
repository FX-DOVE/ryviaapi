import React, { useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyScrollLock, useEscapeKey, useFocusTrap } from '../../hooks/useUiBehaviors';

const SIZE_WIDTH = { sm: '440px', md: '560px', lg: '720px' };

/**
 * Accessible modal dialog. Renders through a portal, locks background scroll,
 * closes on Escape / overlay click, and traps focus while open.
 *
 * Props:
 *   open           — whether the dialog is visible
 *   onClose        — called on Escape, close button, or overlay click
 *   title          — optional heading text (renders the header + close button)
 *   footer         — optional node rendered in .modal-footer (e.g. action buttons)
 *   size           — 'sm' | 'md' | 'lg' (max-width; defaults to the CSS default)
 *   closeOnOverlay — clicking the backdrop closes (default true)
 *   showClose      — render the header close button (default true when a title is set)
 *
 * Add `data-autofocus` to a field inside the modal to focus it on open
 * (otherwise focus lands on the first focusable element).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size,
  className = '',
  closeOnOverlay = true,
  showClose = true,
  labelledBy,
}) {
  const panelRef = useRef(null);
  const overlayDownOnSelf = useRef(false);
  const autoId = useId();

  useBodyScrollLock(open);
  useEscapeKey(() => onClose?.(), open);
  useFocusTrap(panelRef, open);

  if (!open) return null;

  const titleId = labelledBy || (title ? `modal-title-${autoId}` : undefined);
  const panelStyle = size && SIZE_WIDTH[size] ? { maxWidth: SIZE_WIDTH[size] } : undefined;

  // Only close when the press *starts and ends* on the backdrop itself, so
  // selecting text inside the panel and releasing outside doesn't dismiss it.
  const onOverlayMouseDown = (e) => {
    overlayDownOnSelf.current = e.target === e.currentTarget;
  };
  const onOverlayMouseUp = (e) => {
    if (closeOnOverlay && overlayDownOnSelf.current && e.target === e.currentTarget) {
      onClose?.();
    }
    overlayDownOnSelf.current = false;
  };

  const hasHeader = Boolean(title) || showClose;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={onOverlayMouseDown}
      onMouseUp={onOverlayMouseUp}
    >
      <div
        ref={panelRef}
        className={`modal-panel ${className}`.trim()}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {hasHeader && (
          <div className="modal-header">
            {title ? <h2 id={titleId}>{title}</h2> : <span aria-hidden="true" />}
            {showClose && onClose && (
              <button
                type="button"
                className="modal-close"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
