import React from 'react';

export function Skeleton({ className = '', variant = 'rectangular', width, height }) {
  const styles = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1em' : '100%'),
    borderRadius: variant === 'circular' ? '50%' : variant === 'text' ? '4px' : 'var(--radius-md)'
  };

  return (
    <div 
      className={`bg-[var(--bg-elevated)] animate-pulse ${className}`} 
      style={styles}
    />
  );
}
