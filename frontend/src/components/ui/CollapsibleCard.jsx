import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function CollapsibleCard({ title, icon: Icon, defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-card ${open ? 'collapsible-card-open' : ''}`}>
      <button
        className="collapsible-card-header"
        onClick={() => setOpen(prev => !prev)}
        type="button"
      >
        <div className="collapsible-card-header-left">
          {Icon && <Icon size={15} className="collapsible-card-icon" />}
          <span className="collapsible-card-title">{title}</span>
          {badge && <span className="collapsible-card-badge">{badge}</span>}
        </div>
        <ChevronDown
          size={16}
          className={`collapsible-card-chevron ${open ? 'collapsible-card-chevron-open' : ''}`}
        />
      </button>
      {open && (
        <div className="collapsible-card-body">
          {children}
        </div>
      )}
    </div>
  );
}
