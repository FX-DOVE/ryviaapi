import { NavLink } from 'react-router-dom';
import { Film, Video, History, Wallet } from 'lucide-react';

const tabs = [
  { to: '/app/film-studio', icon: Film, label: 'Studio' },
  { to: '/app/projects', icon: Video, label: 'Projects' },
  { to: '/app/history', icon: History, label: 'History' },
  { to: '/app/billing', icon: Wallet, label: 'Wallet' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          <Icon size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
