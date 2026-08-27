import { useEffect } from 'react';

/**
 * Lock background scrolling while `active` is true.
 * Compensates for the scrollbar width so content doesn't shift, and
 * restores the previous inline styles on cleanup.
 */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const { body } = document;
    const html = document.documentElement;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbarW = window.innerWidth - html.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarW > 0) body.style.paddingRight = `${scrollbarW}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [active]);
}

/** Invoke `handler` when Escape is pressed, while `active` is true. */
export function useEscapeKey(handler, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') handler(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handler, active]);
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Trap Tab focus within the element referenced by `ref` while `active`.
 * Moves focus to the first focusable element when activated. Inert when
 * `active` is false, so it's safe to key off a "drawer/modal open" flag —
 * on desktop, where the container is always visible and the flag stays
 * false, this does nothing.
 */
export function useFocusTrap(ref, active) {
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return undefined;

    const getFocusable = () =>
      Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Prefer an explicit [data-autofocus] target (e.g. a form's first field)
    // so dialogs land focus on the primary input rather than the close button;
    // otherwise fall back to the first focusable element.
    const focusables = getFocusable();
    const preferred = node.querySelector('[data-autofocus]');
    const first = preferred && focusables.includes(preferred) ? preferred : focusables[0];
    if (first) first.focus();

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const els = getFocusable();
      if (els.length === 0) return;
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [ref, active]);
}
