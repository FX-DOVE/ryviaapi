import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Layout     from './components/Layout';
import History    from './pages/History';
import JobDetail  from './pages/JobDetail';

import Login      from './pages/Login';
import Register   from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Billing    from './pages/Billing';
import Admin      from './pages/Admin';
import ProjectsPage from './pages/ProjectsPage';
import FilmStudioPage from './pages/FilmStudioPage';
import FilmEditorPage from './pages/FilmEditorPage';
import LandingPage from './pages/landingpage/LandingPage';
import { useSocketGlobal } from './hooks/useSocket';

// Public routes — no auth required
function PublicRoute({ children }) {
  return children;
}

// Protected routes — require auth
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RootRedirect() {
  const token = localStorage.getItem('accessToken');
  return <Navigate to={token ? "/app/film-studio" : "/login"} replace />;
}

function LegacyProjectRedirect() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={`/app/film-studio/${projectId}${search ? `?${search}` : ''}`} replace />;
}

function LegacyJobRedirect() {
  const { id } = useParams();
  return <Navigate to={`/app/jobs/${id}`} replace />;
}

/** Robust access control for admin pages — verifies against server & auto-syncs role */
function AdminRoute({ children }) {
  const [authorized, setAuthorized] = useState(null);

  useEffect(() => {
    const checkRole = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setAuthorized(false);
        return;
      }

      let user = null;
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) user = JSON.parse(userStr);
      } catch {}

      // Immediate check if local cache already has role: 'admin' or matches admin email
      if (user?.role === 'admin' || user?.email === 'odohchisom51@gmail.com') {
        if (user && user.role !== 'admin') {
          user.role = 'admin';
          localStorage.setItem('user', JSON.stringify(user));
        }
        setAuthorized(true);
        return;
      }

      // Fetch fresh profile from backend API to confirm role changes
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const text = await res.text();
          const data = text ? JSON.parse(text) : null;
          if (data?.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
            if (data.user.role === 'admin' || data.user.email === 'odohchisom51@gmail.com') {
              setAuthorized(true);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('[AdminRoute] Could not verify remote profile:', err.message);
      }

      setAuthorized(false);
    };

    checkRole();
  }, []);

  if (authorized === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <div className="spinner w-10 h-10 border-4 border-white/10 border-t-[var(--brand-primary)] rounded-full animate-spin" />
        <span className="text-xs text-muted font-mono uppercase tracking-widest">Verifying Admin Access…</span>
      </div>
    );
  }

  if (!authorized) {
    return <Navigate to="/app/film-studio" replace />;
  }

  return children;
}

function AppRoutes() {
  useSocketGlobal(); // Connect Socket.io globally

  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/landing" element={<LandingPage />} />

      {/* Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Protected app */}
      <Route path="/app" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/app/film-studio" replace />} />
        <Route path="history" element={<History />} />
        <Route path="jobs" element={<Navigate to="/app/history" replace />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="jobs/:id/editor" element={<FilmEditorPage />} />
        <Route path="billing" element={<Billing />} />

        {/* Admin-only routes */}
        <Route path="providers" element={<AdminRoute><Admin defaultTab="ai-connections" /></AdminRoute>} />
        <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />

        <Route path="projects" element={<ProjectsPage />} />
        <Route path="film-studio" element={<FilmStudioPage />} />
        <Route path="film-studio/:projectId" element={<FilmStudioPage />} />
        <Route path="*" element={<Navigate to="/app/film-studio" replace />} />
      </Route>

      {/* Legacy / Top-level route aliases to /app/... */}
      <Route path="/film-studio" element={<Navigate to="/app/film-studio" replace />} />
      <Route path="/film-studio/:projectId" element={<LegacyProjectRedirect />} />
      <Route path="/projects" element={<Navigate to="/app/projects" replace />} />
      <Route path="/history" element={<Navigate to="/app/history" replace />} />
      <Route path="/jobs" element={<Navigate to="/app/history" replace />} />
      <Route path="/jobs/:id" element={<LegacyJobRedirect />} />
      <Route path="/billing" element={<Navigate to="/app/billing" replace />} />
      <Route path="/admin" element={<Navigate to="/app/admin" replace />} />
      <Route path="/providers" element={<Navigate to="/app/providers" replace />} />

      {/* Fallback redirects */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  );
}
