import React from 'react';

export function AppCard({ children, className = '', noPadding = false, ...props }) {
  return (
    <div 
      className={`card ${noPadding ? '!p-0' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
