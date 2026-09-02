import React, { useState, useEffect } from 'react';
import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import { CreditCard, Check, Lock } from 'lucide-react';

export default function Billing() {
  const [credits, setCredits] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const plans = [
    { name: 'Creator Kickstart', credits: 500, price: '$15', desc: 'Perfect for small scripts & social clips' },
    { name: 'Production Studio', credits: 2500, price: '$49', desc: 'Best for standard marketing and documentary projects', popular: true },
    { name: 'Enterprise Factory', credits: 10000, price: '$149', desc: 'For automated batch scaling and full concurrent workers' }
  ];

  // Helper to fetch user workspace credits
  const fetchCredits = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/users/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok && data.user) {
        // Find credits if returned, fallback to mock state
        setCredits(data.user.credits || 1250);
      }
    } catch (e) { }
  };

  useEffect(() => {
    fetchCredits();
  }, []);

  const handlePurchase = async (planName, creditAmount) => {
    setMessage(`Stripe checkout integration is coming soon! For now, this is a preview.`);
  };

  return (
    <AppPage>
      <PageHeader
        title="Credits & Billing"
        description="Manage your usage plan, workspaces budgets, and top-up processing credits."
      />

      {message && (
        <div className="alert alert-success">
          <Check size={18} /> {message}
        </div>
      )}

      {/* Credit Balance Card */}
      <AppCard className="billing-balance-card">
        <div className="absolute inset-0 bg-[var(--gradient-brand)] opacity-5 z-0 pointer-events-none"></div>
        <div className="billing-balance-main">
          <h2 className="section-title mb-2">Active Workspace Balance</h2>
          <div className="billing-credit-value">
            {credits.toLocaleString()} <span className="text-xl font-medium text-[var(--text-muted)]">credits</span>
          </div>
          <p className="caption billing-balance-note">
            Credits are consumed based on video pipeline actions (Script: 5, Image: 2, Video: 20, Voice: 3, Render: 5).
          </p>
        </div>
        <div className="billing-plan-card">
          <div className="border-b border-[var(--glass-border)] pb-3 mb-3">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">Current Plan</div>
            <div className="text-lg font-bold text-[var(--text-primary)] mt-1">Pay-As-You-Go Pro</div>
          </div>
          <div className="text-[12px] text-[var(--text-secondary)] flex items-center justify-between py-2 border-b border-[var(--glass-border)]">
            <span className="text-[var(--text-muted)]">Storage Quota</span>
            <span className="font-medium">10 GB (Cloud R2)</span>
          </div>
          <div className="text-[12px] text-[var(--text-secondary)] flex items-center justify-between py-2">
            <span className="text-[var(--text-muted)]">Billing</span>
            <span className="font-medium">Usage-based</span>
          </div>
        </div>
      </AppCard>

      {/* Pricing Options */}
      <div className="billing-section-heading">
        <h2 className="section-title">Top-up Credit Packages</h2>
      </div>

      <div className="billing-plans-grid">
        {plans.map((p, idx) => (
          <AppCard
            key={idx}
            className={`billing-plan-option ${p.popular ? 'billing-plan-popular' : ''}`}
          >
            {p.popular && (
              <div className="billing-popular-badge">
                Most Popular
              </div>
            )}
            <div className="billing-plan-content">
              <h3 className="card-title text-xl mb-2">{p.name}</h3>
              <p className="body-text text-sm min-h-[48px]">{p.desc}</p>

              <div className="billing-plan-price">
                <span className="metric-value" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>{p.price}</span>
                <span className="caption ml-2">one-time</span>
              </div>

              <div className="billing-credit-pill">
                <span className="text-[var(--brand-light)] font-bold text-base">{p.credits} credits</span>
              </div>
            </div>

            <AppButton
              onClick={() => handlePurchase(p.name, p.credits)}
              disabled
              variant="secondary"
              className={`w-full text-base btn-coming-soon`}
              icon={Lock}
            >
              Coming Soon
            </AppButton>
          </AppCard>
        ))}
      </div>
    </AppPage>
  );
}
