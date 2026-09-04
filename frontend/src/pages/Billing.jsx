import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { Check, Wallet, ArrowUpRight, Loader2 } from 'lucide-react';
import {
  getWallet,
  getLedger,
  initializeTopup,
  verifyTopup,
  formatUsd,
} from '../api/billing';
import useAppStore from '../store/useAppStore';

export default function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setWallet = useAppStore((s) => s.setWallet);
  const [balanceUsd, setBalanceUsd] = useState(0);
  const [packages, setPackages] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [customCredit, setCustomCredit] = useState('50');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [walletRes, ledgerRes] = await Promise.all([
        getWallet(),
        getLedger({ limit: 20 }),
      ]);
      setBalanceUsd(walletRes.data.balanceUsd || 0);
      setPackages(walletRes.data.packages || []);
      setLedger(ledgerRes.data.logs || []);
      setWallet({ balanceUsd: walletRes.data.balanceUsd || 0 });
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load billing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const reference = searchParams.get('reference');
    if (!reference) return;

    let cancelled = false;
    (async () => {
      setPaying('verify');
      try {
        const { data } = await verifyTopup(reference);
        if (cancelled) return;
        setMessage(`Payment received. ${formatUsd(data.creditUsd)} added to your studio.`);
        setBalanceUsd(data.balanceUsd);
        setWallet({ balanceUsd: data.balanceUsd });
        await load();
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Could not confirm payment');
      } finally {
        if (!cancelled) {
          setPaying(null);
          searchParams.delete('reference');
          searchParams.delete('trxref');
          setSearchParams(searchParams, { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams.get('reference')]);

  const startPay = async ({ packageId, creditUsd }) => {
    setError('');
    setMessage('');
    setPaying(packageId || 'custom');
    try {
      const { data } = await initializeTopup(packageId ? { packageId } : { creditUsd });
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      throw new Error('Paystack did not return a checkout URL');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Could not start payment');
      setPaying(null);
    }
  };

  const customValue = Number(customCredit);
  const customCharge = Number.isFinite(customValue) ? customValue * 2 : 0;

  return (
    <AppPage>
      <PageHeader
        title="Studio wallet"
        description="Add funds to produce films. Unused balance stays on your account."
      />

      {message && (
        <div className="alert alert-success">
          <Check size={18} /> {message}
        </div>
      )}
      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      <AppCard className="wallet-hero">
        <div className="wallet-hero-main">
          <div className="wallet-kicker">Available balance</div>
          <div className="wallet-balance">
            {loading ? '—' : formatUsd(balanceUsd)}
          </div>
          <p className="wallet-note">
            Production is billed from this balance when a film finishes rendering.
          </p>
        </div>
        <div className="wallet-hero-side">
          <Wallet size={28} />
          <span>Pay as you produce</span>
        </div>
      </AppCard>

      <div className="billing-section-heading">
        <h2 className="section-title">Add funds</h2>
      </div>

      <div className="billing-plans-grid">
        {packages.map((p) => (
          <AppCard
            key={p.id}
            className={`billing-plan-option ${p.popular ? 'billing-plan-popular' : ''}`}
          >
            {p.popular && <div className="billing-popular-badge">Most chosen</div>}
            <div className="billing-plan-content">
              <h3 className="card-title text-xl mb-2">{p.label}</h3>
              <p className="body-text text-sm">Adds {formatUsd(p.creditUsd)} to your studio wallet.</p>
              <div className="billing-plan-price">
                <span className="metric-value" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
                  {formatUsd(p.chargeUsd)}
                </span>
              </div>
              <div className="billing-credit-pill">
                <span className="text-[var(--brand-light)] font-bold text-base">
                  You receive {formatUsd(p.creditUsd)}
                </span>
              </div>
            </div>
            <AppButton
              onClick={() => startPay({ packageId: p.id })}
              disabled={!!paying}
              className="w-full text-base"
              icon={paying === p.id ? Loader2 : ArrowUpRight}
            >
              {paying === p.id ? 'Redirecting…' : 'Pay with Paystack'}
            </AppButton>
          </AppCard>
        ))}
      </div>

      <AppCard className="custom-topup">
        <h3 className="card-title mb-2">Custom amount</h3>
        <p className="body-text text-sm mb-4">Enter the studio balance you want to add.</p>
        <div className="custom-topup-row">
          <AppInput
            label="Balance to add (USD)"
            type="number"
            min="5"
            step="5"
            value={customCredit}
            onChange={(e) => setCustomCredit(e.target.value)}
          />
          <div className="custom-topup-charge">
            <span>You pay</span>
            <strong>{formatUsd(customCharge)}</strong>
          </div>
          <AppButton
            disabled={!!paying || !Number.isFinite(customValue) || customValue < 5}
            onClick={() => startPay({ creditUsd: customValue })}
          >
            {paying === 'custom' ? 'Redirecting…' : 'Pay with Paystack'}
          </AppButton>
        </div>
      </AppCard>

      <div className="billing-section-heading">
        <h2 className="section-title">Activity</h2>
      </div>
      <AppCard className="ledger-card">
        {ledger.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No wallet activity yet.</p>
        ) : (
          <ul className="ledger-list">
            {ledger.map((row) => (
              <li key={row._id} className="ledger-row">
                <div>
                  <div className="ledger-reason">{row.reason}</div>
                  <div className="ledger-date">
                    {new Date(row.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className={`ledger-amount ${row.type === 'deduction' ? 'is-out' : 'is-in'}`}>
                  {row.type === 'deduction' ? '−' : '+'}{formatUsd(row.amountUsd)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </AppPage>
  );
}
