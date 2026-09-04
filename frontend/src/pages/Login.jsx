import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { AuthLayout } from '../components/ui/AuthLayout';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      navigate('/app/film-studio', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      navigate('/app');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome Back" subtitle="Log in to your workspace">
      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AppInput
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="name@company.com"
        />

        <div className="relative">
          <div className="absolute right-0 top-0">
          <Link to="/forgot-password" className="text-xs font-medium text-[var(--brand-light)] hover:text-[var(--text-primary)] transition-colors mt-1 block">Forgot password?</Link>
          </div>
          <AppInput
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
        </div>

        <div className="pt-2">
          <AppButton
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <div className="spinner w-5 h-5 border-white border-t-transparent mr-2"></div>
                Authenticating...
              </>
            ) : 'Sign In'}
          </AppButton>
        </div>
      </form>

      <div className="text-center mt-8 pt-6 border-t border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-secondary)]">
          New to Reyvia?{' '}
          <Link to="/register" className="text-[var(--text-primary)] font-semibold hover:text-[var(--brand-light)] transition-colors underline decoration-[var(--border-subtle)] hover:decoration-[var(--brand-light)] underline-offset-4">
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
