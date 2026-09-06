import React from 'react';

export function Skeleton({ className = '', variant = 'rectangular', width, height }) {
  const styles = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1em' : variant === 'media' ? undefined : '100%'),
    aspectRatio: variant === 'media' ? '16 / 9' : undefined,
    borderRadius: variant === 'circular' ? '50%' : variant === 'text' ? '4px' : 'var(--radius-md)'
  };

  return (
    <div
      className={`skeleton-shimmer bg-[var(--bg-elevated)] ${className}`}
      style={styles}
      aria-hidden="true"
    />
  );
}

export function MediaCardSkeleton({ className = '' }) {
  return (
    <div className={`project-card-skeleton ${className}`}>
      <Skeleton variant="media" className="rounded-none" />
      <div className="project-card-skeleton-body">
        <Skeleton variant="text" height={16} width="60%" />
        <Skeleton variant="text" height={12} width="85%" />
        <Skeleton variant="text" height={10} width="40%" />
      </div>
    </div>
  );
}
