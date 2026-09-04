import React from 'react';

export function PageHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`page-header ${className}`.trim()}>
      <div className="page-header-text">
        <h1 className="page-title">{title}</h1>
        {description && <p className="subheading mt-2">{description}</p>}
      </div>
      {actions && (
        <div className="page-header-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
