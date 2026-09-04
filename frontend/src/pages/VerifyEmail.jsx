import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Mail } from 'lucide-react';
import { AuthLayout } from '../components/ui/AuthLayout';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';

const RESEND_COOLDOWN_SEC = 60;

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailFromQuery = searchParams.get('email') || '';

  const [email] = useState(emailFromQuery);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SEC);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      navigate('/app/film-studio', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!email) return;
    setCooldown(RESEND_COOLDOWN_SEC);
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email) {
      setError('Missing email. Please register again.');
      return;
    }
    if (!code.trim()) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
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

  const handleResend = useCallback(async () => {
    if (!email || cooldown > 0 || resending) return;
    setError('');
    setMessage('');
    setResending(true);
    try {
      const response = await fetch('/api/auth/register/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 && data.retryAfter) {
          setCooldown(Number(data.retryAfter) || RESEND_COOLDOWN_SEC);
        }
        throw new Error(data.error || 'Could not resend code');
      }
      setMessage('A new code has been sent. Check your inbox.');
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }, [email, cooldown, resending]);

  if (!email) {
    return (
      <AuthLayout title="Verify email" subtitle="We need your signup email">
        <div className="alert alert-error">
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          Missing email. Start again from registration.
        </div>
        <div className="pt-4">
          <Link to="/register">
            <AppButton className="w-full">Back to register</AppButton>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={`We sent a 6-digit code to ${email}`}
    >
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

      <form onSubmit={handleVerify} className="space-y-4">
        <AppInput
          label="Verification code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
          placeholder="000000"
          maxLength={6}
        />

        <div className="pt-2">
          <AppButton type="submit" disabled={loading || code.length !== 6} className="w-full">
            {loading ? (
              <>
                <div className="spinner w-5 h-5 border-white border-t-transparent mr-2"></div>
                Verifying…
              </>
            ) : 'Verify & continue'}
          </AppButton>
        </div>
      </form>

      <div className="mt-6 text-center space-y-3">
        <p className="text-sm text-[var(--text-secondary)] flex items-center justify-center gap-2">
          <Mail size={14} /> Didn’t get the code?
        </p>
        <AppButton
          type="button"
          variant="secondary"
          disabled={cooldown > 0 || resending}
          onClick={handleResend}
          className="w-full"
        >
          {resending
            ? 'Sending…'
            : cooldown > 0
              ? `Resend in ${cooldown}s`
              : 'Resend code'}
        </AppButton>
      </div>

      <div className="text-center mt-8 pt-6 border-t border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Wrong email?{' '}
          <Link to="/register" className="text-[var(--text-primary)] font-semibold hover:text-[var(--brand-light)]">
            Register again
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
