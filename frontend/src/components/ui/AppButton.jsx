import React from 'react';

export function AppButton({ 
  children, 
  variant = 'primary', 
  icon: Icon, 
  className = '', 
  ...props 
}) {
  const baseClass = 'btn';
  const variantClass = variant === 'icon' ? 'btn-icon' : `btn-${variant}`;
  
  return (
    <button 
      className={`${baseClass} ${variantClass} ${className}`}
      {...props}
    >
      {Icon && <Icon size={20} />}
      {variant !== 'icon' && children}
    </button>
  );
}
