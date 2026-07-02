import React from 'react';

export function PageHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 ${className}`}>
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="subheading mt-2">{description}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
