import React from 'react';

export function AppPage({ children, className = '' }) {
  return (
    <div className={`page-container animation-page-enter ${className}`}>
      {children}
    </div>
  );
}
