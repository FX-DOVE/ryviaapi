import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check } from 'lucide-react';
import { AuthLayout } from '../components/ui/AuthLayout';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Reset failed');
      setMessage(data.message || 'Password updated.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset password" subtitle="Choose a new password for your account">
      {!token && (
        <div className="alert alert-error">
          <AlertTriangle size={16} /> Missing reset token. Request a new link from the forgot password page.
        </div>
      )}
      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}
      {message && (
        <div className="alert alert-success">
          <Check size={16} style={{ flexShrink: 0 }} /> {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AppInput
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
        />
        <AppInput
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="••••••••"
        />
        <AppButton type="submit" disabled={loading || !token} className="w-full">
          {loading ? 'Updating…' : 'Update password'}
        </AppButton>
      </form>

      <div className="text-center mt-8 pt-6 border-t border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-secondary)]">
          <Link to="/forgot-password" className="text-[var(--text-primary)] font-semibold hover:text-[var(--brand-light)]">
            Request a new link
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
