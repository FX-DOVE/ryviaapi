import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { AuthLayout } from '../components/ui/AuthLayout';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder = '••••••••',
  autoComplete = 'new-password',
  required = true,
  minLength = 6,
}) {
  return (
    <div className="form-group relative">
      <label htmlFor={id} className="form-label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="form-input pr-11"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
          tabIndex={0}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      const targetEmail = data.email || email;
      navigate(`/verify-email?email=${encodeURIComponent(targetEmail)}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create Account" subtitle="Start your cinematic journey">
      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AppInput
          label="Full Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Christopher Nolan"
        />

        <AppInput
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="name@company.com"
        />

        <PasswordField
          id="register-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          show={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
        />

        <PasswordField
          id="register-confirm-password"
          label="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          show={showConfirm}
          onToggleShow={() => setShowConfirm((v) => !v)}
        />

        <div className="pt-2">
          <AppButton type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <div className="spinner w-5 h-5 border-white border-t-transparent mr-2"></div>
                Sending code…
              </>
            ) : (
              'Continue'
            )}
          </AppButton>
        </div>
      </form>

      <div className="text-center mt-8 pt-6 border-t border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-[var(--text-primary)] font-semibold hover:text-[var(--brand-light)] transition-colors underline decoration-[var(--border-subtle)] hover:decoration-[var(--brand-light)] underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
