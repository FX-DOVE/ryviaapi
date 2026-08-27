import { useEffect, useState, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { History, Cpu, CreditCard, Shield, LogOut, Clapperboard, Film, Video, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useUiBehaviors';
import useAppStore from '../store/useAppStore';

// Job statuses that mean a render is actively in flight. When any job (in the
// list or the open detail) is in one of these, the sidebar's production rail
// lights up and advances — the signature "your film is being made" moment.
const LIVE_STATUSES = new Set([
  'queued', 'preparing', 'analyzing', 'scene_generation',
  'media_generation', 'assembling', 'optimizing',
]);

const mainNav = [
  { to: '/app/film-studio', icon: Film, label: 'Film Studio' },
  { to: '/app/projects', icon: Video, label: 'Projects' },
  { to: '/app/history', icon: History, label: 'History' },
];

export default function Sidebar({ isOpen = false, onClose }) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const asideRef = useRef(null);

  // Derive a stable boolean so the sidebar only re-renders when the live
  // state actually flips — covers both the jobs list and the open detail.
  const hasLiveRender = useAppStore((s) =>
    (s.activeJob && LIVE_STATUSES.has(s.activeJob.status)) ||
    s.jobs.some((j) => LIVE_STATUSES.has(j.status)),
  );

  // Trap focus inside the drawer while it's open (mobile only — on desktop
  // isOpen stays false and this is inert).
  useFocusTrap(asideRef, isOpen);

  useEffect(() => {
    const syncRole = async () => {
      let user = null;
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) user = JSON.parse(userStr);
      } catch {}

      if (user?.role === 'admin' || user?.email === 'odohchisom51@gmail.com') {
        setIsAdmin(true);
        return;
      }

      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const text = await res.text();
            const data = text ? JSON.parse(text) : null;
            if (data?.user?.role === 'admin' || data?.user?.email === 'odohchisom51@gmail.com') {
              setIsAdmin(true);
              localStorage.setItem('user', JSON.stringify(data.user));
            }
          }
        } catch {}
      }
    };

    syncRole();
  }, []);

  // Settings navigation — Admin-only items conditionally included
  const settingsNav = [
    { to: '/app/billing', icon: CreditCard, label: 'Billing' },
    ...(isAdmin ? [{ to: '/app/admin', icon: Shield, label: 'Admin Panel', badge: 'Admin' }] : []),
  ];

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const NavList = ({ items }) => (
    <>
      {items.map(({ to, icon: Icon, label, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <Icon />
          {label}
          {badge && <span className="nav-badge text-[10px] px-1.5 py-0.5 rounded bg-[var(--brand-primary)]/20 text-[var(--brand-light)] font-bold uppercase">{badge}</span>}
        </NavLink>
      ))}
    </>
  );

  return (
    <aside
      ref={asideRef}
      id="app-sidebar"
      className={`sidebar ${isOpen ? 'open' : ''} ${hasLiveRender ? 'is-live' : ''}`}
      aria-label="Primary navigation"
    >
      <button
        className="sidebar-close"
        onClick={onClose}
        aria-label="Close navigation menu"
      >
        <X size={20} />
      </button>

      <div className="sidebar-logo">
        <Clapperboard size={24} style={{ color: 'var(--brand-primary)' }} />
        <h2>AI Film Studio</h2>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-nav-group">
          <div className="nav-label">Main</div>
          <NavList items={mainNav} />
        </div>

        <div className="sidebar-nav-group">
          <div className="nav-label">Settings</div>
          <NavList items={settingsNav} />
        </div>

        <div className="sidebar-footer">
          <button
            onClick={handleLogout}
            className="nav-item sidebar-logout"
          >
            <LogOut />
            Logout
          </button>
        </div>
      </nav>
    </aside>
  );
}
