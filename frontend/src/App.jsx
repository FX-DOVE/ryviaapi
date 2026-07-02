import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout     from './components/Layout';
import History    from './pages/History';
import JobDetail  from './pages/JobDetail';
import Providers  from './pages/Providers';
import Login      from './pages/Login';
import Register   from './pages/Register';
import Billing    from './pages/Billing';
import Admin      from './pages/Admin';
import ProjectsPage from './pages/ProjectsPage';
import FilmStudioPage from './pages/FilmStudioPage';
import { useSocketGlobal } from './hooks/useSocket';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppRoutes() {
  useSocketGlobal(); // Connect Socket.io globally

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/film-studio" replace />} />
        <Route path="history" element={<History />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="providers" element={<Providers />} />
        <Route path="billing" element={<Billing />} />
        <Route path="admin" element={<Admin />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="film-studio" element={<FilmStudioPage />} />
        <Route path="*" element={<Navigate to="/film-studio" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

