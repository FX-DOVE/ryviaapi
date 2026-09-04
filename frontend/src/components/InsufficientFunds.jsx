import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowRight, X } from 'lucide-react';
import { formatUsd } from '../api/billing';
import { AppButton } from './ui/AppButton';

export default function InsufficientFunds({ open, detail, onClose }) {
  const navigate = useNavigate();
  if (!open) return null;

  const required = detail?.requiredUsd || 0;
  const balance = detail?.balanceUsd || 0;
  const shortfall = detail?.shortfallUsd || Math.max(0, required - balance);

  return (
    <div className="funds-overlay" role="dialog" aria-modal="true" aria-labelledby="funds-title">
      <div className="funds-modal">
        <button className="funds-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <div className="funds-icon">
          <Wallet size={22} />
        </div>
        <h2 id="funds-title">Fund your studio</h2>
        <p className="funds-copy">
          This production needs {formatUsd(required)}. Your balance is {formatUsd(balance)}.
          Add {formatUsd(shortfall)} to continue.
        </p>
        <div className="funds-actions">
          <AppButton variant="secondary" onClick={onClose}>Not now</AppButton>
          <AppButton
            icon={ArrowRight}
            onClick={() => {
              onClose?.();
              navigate('/app/billing');
            }}
          >
            Add funds
          </AppButton>
        </div>
      </div>
    </div>
  );
}
