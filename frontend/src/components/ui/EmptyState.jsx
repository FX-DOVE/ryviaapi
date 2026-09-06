import React from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  checklist,
  primaryAction,
  secondaryAction,
  className = ''
}) {
  return (
    <div className={`empty-state-card ${className}`}>
      {Icon && (
        <div className="empty-state-icon" aria-hidden="true">
          <Icon size={32} />
        </div>
      )}
      <h3 className="card-title">{title}</h3>
      {description && <p className="body-text text-[var(--text-secondary)]">{description}</p>}
      {Array.isArray(checklist) && checklist.length > 0 && (
        <ol className="empty-checklist">
          {checklist.map((item, i) => (
            <li key={item.title || i}>
              <span className="empty-checklist-num">{i + 1}</span>
              <div>
                <strong>{item.title}</strong>
                {item.description && <span>{item.description}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="empty-state-actions">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
