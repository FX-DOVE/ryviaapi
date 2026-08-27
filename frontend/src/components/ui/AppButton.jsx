import React from 'react';

export function AppButton({ 
  children, 
  variant = 'primary', 
  size,
  icon: Icon, 
  className = '', 
  ...props 
}) {
  const baseClass = 'btn';
  const variantClass = variant === 'icon' ? 'btn-icon' : `btn-${variant}`;
  const sizeClass = size === 'sm' ? 'btn-sm' : '';
  
  return (
    <button 
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`.trim()}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 16 : 20} />}
      {variant !== 'icon' && children}
    </button>
  );
}
