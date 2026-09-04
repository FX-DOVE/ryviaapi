import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check } from 'lucide-react';
import { AuthLayout } from '../components/ui/AuthLayout';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      setMessage(data.message || 'If that email is registered, a reset link has been sent.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Forgot password" subtitle="We'll email you a reset link">
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
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="name@company.com"
        />
        <AppButton type="submit" disabled={loading} className="w-full">
          {loading ? 'Sending…' : 'Send reset link'}
        </AppButton>
      </form>

      <div className="text-center mt-8 pt-6 border-t border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Remembered it?{' '}
          <Link to="/login" className="text-[var(--text-primary)] font-semibold hover:text-[var(--brand-light)]">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
