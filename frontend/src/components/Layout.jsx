import { Outlet } from 'react-router-dom';
import { useState, useCallback, useRef, useEffect } from 'react';
import Sidebar from './Sidebar';
import useAppStore from '../store/useAppStore';
import { CheckCircle, XCircle, Info, Menu } from 'lucide-react';
import { useBodyScrollLock, useEscapeKey } from '../hooks/useUiBehaviors';

function Toasts() {
  const { toasts, removeToast } = useAppStore();
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => removeToast(t.id)}>
          {t.type === 'success' ? <CheckCircle size={16} style={{ color: 'var(--green)' }} />
            : t.type === 'error' ? <XCircle size={16} style={{ color: 'var(--red)' }} />
              : <Info size={16} style={{ color: 'var(--cyan)' }} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hamburgerRef = useRef(null);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    // Return focus to the trigger for keyboard users (no-op on desktop,
    // where the hamburger is display:none and can't take focus).
    const btn = hamburgerRef.current;
    if (btn && btn.offsetParent !== null) btn.focus();
  }, []);

  // Escape closes the mobile drawer; background scroll locks while it's open.
  useEscapeKey(closeSidebar, sidebarOpen);
  useBodyScrollLock(sidebarOpen);

  // If the viewport grows to desktop the sidebar becomes static — drop the
  // "open" drawer state so scroll-lock/focus-trap don't linger.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const mq = window.matchMedia('(min-width: 769px)');
    const onChange = (e) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [sidebarOpen]);

  return (
    <div className="app-layout">
      {/* Mobile hamburger — only visible at ≤768px via CSS */}
      <button
        ref={hamburgerRef}
        className="sidebar-hamburger"
        onClick={openSidebar}
        aria-label="Open navigation menu"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
      >
        <Menu size={22} />
      </button>

      {/* Backdrop overlay — closes sidebar when clicked */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <main className="main-content">
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}
