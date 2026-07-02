import { useEffect, useRef } from 'react';
import { Info, AlertTriangle, XCircle } from 'lucide-react';

const icons = {
  info:  <Info size={14} style={{ color: 'var(--accent-blue)' }} />,
  warn:  <AlertTriangle size={14} style={{ color: 'var(--accent-gold)' }} />,
  error: <XCircle size={14} style={{ color: 'var(--accent-red)' }} />,
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

export default function LogTimeline({ logs = [] }) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  if (!logs.length) {
    return (
      <p className="caption" style={{ padding: '16px 0' }}>
        No logs yet — pipeline hasn't started.
      </p>
    );
  }

  return (
    <div className="log-timeline">
      {logs.map((log, i) => (
        <div key={i} className={`log-entry ${log.level}`}>
          <span className="log-time">{formatTime(log.timestamp)}</span>
          <span className="log-icon">{icons[log.level] || icons.info}</span>
          <span className="log-message">{log.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
