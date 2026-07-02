import { NavLink, useNavigate } from 'react-router-dom';
import { History, Cpu, CreditCard, Shield, LogOut, Clapperboard, Film, ScrollText, Video } from 'lucide-react';

const mainNav = [
  { to: '/film-studio', icon: Film, label: 'Film Studio' },
  { to: '/projects', icon: Video, label: 'Projects' },
  { to: '/history', icon: History, label: 'History' },
];

const workspaceNav = [
  { to: '/screenplays', icon: ScrollText, label: 'Screenplays' },
];

const settingsNav = [
  { to: '/providers', icon: Cpu, label: 'AI Providers' },
  { to: '/billing', icon: CreditCard, label: 'Billing' },
  { to: '/admin', icon: Shield, label: 'Admin Panel' },
];

export default function Sidebar() {
  const navigate = useNavigate();

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
        >
          <Icon />
          {label}
          {badge && <span className="nav-badge">{badge}</span>}
        </NavLink>
      ))}
    </>
  );

  return (
    <aside className="sidebar">
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
          <div className="nav-label">Workspace</div>
          <NavList items={workspaceNav} />
        </div>

        <div className="sidebar-nav-group">
          <div className="nav-label">Settings</div>
          <NavList items={settingsNav} />
        </div>

        <div className="sidebar-footer">
          <button
            onClick={handleLogout}
            className="nav-item sidebar-logout"
            style={{ color: 'var(--accent-red)' }}
          >
            <LogOut />
            Logout
          </button>
        </div>
      </nav>
    </aside>
  );
}
