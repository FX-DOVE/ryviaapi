import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import useAppStore from '../store/useAppStore';
import { CheckCircle, XCircle, Info } from 'lucide-react';

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
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}
