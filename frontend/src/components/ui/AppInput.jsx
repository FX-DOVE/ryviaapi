import React from 'react';

export function AppInput({ 
  label, 
  error, 
  hint, 
  id, 
  className = '', 
  type = 'text',
  options = [],
  ...props 
}) {
  const inputId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  
  return (
    <div className={`form-group ${className}`}>
      {label && <label htmlFor={inputId} className="form-label">{label}</label>}
      
      {type === 'textarea' ? (
        <textarea
          id={inputId}
          className={`form-textarea ${error ? 'form-error' : ''}`}
          {...props}
        />
      ) : type === 'select' ? (
        <select
          id={inputId}
          className={`form-select ${error ? 'form-error' : ''}`}
          {...props}
        >
          {options.map((opt, i) => (
            <option key={i} value={opt.value || opt}>{opt.label || opt}</option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          type={type}
          className={`form-input ${error ? 'form-error' : ''}`}
          {...props}
        />
      )}
      
      {error && <div className="error-text">{error}</div>}
      {hint && !error && <div className="caption mt-1">{hint}</div>}
    </div>
  );
}
