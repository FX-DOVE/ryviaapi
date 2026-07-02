import React from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className = ''
}) {
  return (
    <div className={`empty-state-card ${className}`}>
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={48} />
        </div>
      )}
      <h3 className="card-title">{title}</h3>
      {description && <p className="body-text">{description}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="empty-state-actions">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
