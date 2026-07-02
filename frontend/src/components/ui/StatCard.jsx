import React from 'react';
import { AppCard } from './AppCard';

export function StatCard({ label, value, subtext, subtextColor = 'var(--text-muted)' }) {
  return (
    <AppCard className="flex flex-col justify-center h-full">
      <div className="label mb-2">{label}</div>
      <div className="metric-value mb-1">{value}</div>
      {subtext && (
        <div className="caption" style={{ color: subtextColor }}>
          {subtext}
        </div>
      )}
    </AppCard>
  );
}
