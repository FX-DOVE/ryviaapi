import { useState, useEffect, useCallback } from 'react';
import {
  Cpu, Plus, Trash2, ChevronUp, ChevronDown,
  RefreshCw, CheckCircle, XCircle, Loader, Eye, EyeOff,
  AlertTriangle, Plug, GripVertical, Zap, Info
} from 'lucide-react';
import {
  getProviders, createProvider, testProvider,
  reorderProviders, updateProvider, deleteProvider,
} from '../api/providers';
import useAppStore from '../store/useAppStore';

import { AppPage }   from '../components/ui/AppPage';
import { AppCard }   from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import { AppInput }  from '../components/ui/AppInput';

// ─── Constants ────────────────────────────────────────────────────────────────

const BUILTIN_META = {
  'ollama':        { icon: '🦙', label: 'Ollama',         desc: 'Local generation via REST API' },
  'grok-cli':      { icon: '⚡', label: 'Grok CLI',       desc: 'Grok AI via local CLI binary — tried first' },
  'gemini':        { icon: '✦', label: 'Gemini',          desc: 'Google Gemini 2.5 Flash via API key' },
  'groq':          { icon: '🦙', label: 'Groq',           desc: 'Llama 3.3 70B via Groq cloud — generous free tier' },
  'openrouter':    { icon: '🔀', label: 'OpenRouter',     desc: 'Auto-routes to best free model via OpenRouter' },
  'github-models': { icon: '🐙', label: 'GitHub Models',  desc: 'Llama 3.3 70B via GitHub Models — PAT required' },
};

// ─── Status indicator ─────────────────────────────────────────────────────────

function StatusPill({ connected, configured, testing }) {
  if (testing) return (
    <span className="provider-status provider-status-testing">
      <Loader size={11} style={{ animation: 'spin 700ms linear infinite' }} />
      Testing…
    </span>
  );
  if (!configured) return (
    <span className="provider-status provider-status-unconfigured">
      Not configured
    </span>
  );
  return (
    <span className={`provider-status ${connected ? 'provider-status-ok' : 'provider-status-fail'}`}>
      <span className="provider-status-dot" />
      {connected ? 'Connected' : 'Failed'}
    </span>
  );
}

// ─── Priority badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }) {
  return (
    <span className="provider-priority-badge">#{priority}</span>
  );
}

// ─── Shared provider row ──────────────────────────────────────────────────────

function ProviderRow({ provider, isBuiltin, onTest, onMove, onToggle, onDelete, isFirst, isLast, testing }) {
  const meta = isBuiltin ? (BUILTIN_META[provider.builtinId] || { icon: '🤖', label: provider.name, desc: '' }) : null;

  return (
    <div className={`provider-row ${provider.enabled ? '' : 'provider-row-disabled'} ${isBuiltin ? '' : 'provider-row-custom'}`}>
      {/* Custom accent bar */}
      {!isBuiltin && <div className="provider-row-accent" />}

      {/* Reorder handle */}
      <div className="provider-row-handle">
        <button
          className={`provider-arrow ${isFirst ? 'provider-arrow-dim' : ''}`}
          disabled={isFirst}
          onClick={() => onMove(provider._id, -1)}
          title="Move up"
        >
          <ChevronUp size={14} />
        </button>
        <button
          className={`provider-arrow ${isLast ? 'provider-arrow-dim' : ''}`}
          disabled={isLast}
          onClick={() => onMove(provider._id, 1)}
          title="Move down"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Emoji icon */}
      <div className="provider-icon">
        {isBuiltin ? meta.icon : '🔌'}
      </div>

      {/* Name + meta */}
      <div className="provider-info">
        <div className="provider-name-row">
          <span className="provider-name">{provider.name}</span>
          <PriorityBadge priority={provider.priority} />
          <span className={`provider-type-badge ${isBuiltin ? '' : 'provider-type-badge-custom'}`}>
            {isBuiltin ? 'built-in' : 'custom'}
          </span>
        </div>
        <div className="provider-desc">
          {isBuiltin ? meta.desc : provider.endpoint}
        </div>
        <div className="provider-key">
          {isBuiltin
            ? `Key: ${provider.maskedKey || '—'}`
            : `Model: ${provider.model} · Key: ${provider.maskedKey}`
          }
        </div>
        {provider.lastError && !provider.connected && provider.configured && (
          <div className="provider-error">
            <AlertTriangle size={11} />
            {provider.lastError}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="provider-actions">
        <StatusPill connected={provider.connected} configured={provider.configured} testing={testing} />

        <AppButton
          variant="icon"
          className="w-8 h-8"
          onClick={() => onTest(provider._id)}
          disabled={testing}
          title="Test connection"
          icon={RefreshCw}
        />

        {isBuiltin ? (
          <AppButton
            variant={provider.enabled ? 'secondary' : 'primary'}
            className="btn-sm px-3"
            onClick={() => onToggle(provider._id, !provider.enabled)}
          >
            {provider.enabled ? 'Disable' : 'Enable'}
          </AppButton>
        ) : (
          <AppButton
            variant="icon"
            className="w-8 h-8"
            style={{ color: 'var(--accent-red)' }}
            onClick={() => onDelete(provider._id, provider.name)}
            title="Remove provider"
            icon={Trash2}
          />
        )}
      </div>
    </div>
  );
}

// ─── Add Provider form ────────────────────────────────────────────────────────

function AddProviderForm({ onAdded }) {
  const { addToast } = useAppStore();
  const [form,    setForm]    = useState({ name: '', endpoint: '', apiKey: '', model: '' });
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [open,    setOpen]    = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim())     return setError('Name is required');
    if (!form.endpoint.trim()) return setError('Endpoint URL is required');
    if (!form.model.trim())    return setError('Model name is required');
    setLoading(true);
    try {
      const { data } = await createProvider(form);
      addToast(`"${data.name}" connected and saved`, 'success');
      setForm({ name: '', endpoint: '', apiKey: '', model: '' });
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <AppButton onClick={() => setOpen(true)} icon={Plus}>
        Add Custom Provider
      </AppButton>
    );
  }

  return (
    <div className="add-provider-form animation-fade-in">
      <div className="add-provider-form-header">
        <h3 className="card-title">Connect a Custom Provider</h3>
        <AppButton variant="icon" className="w-8 h-8" onClick={() => setOpen(false)} icon={XCircle} />
      </div>

      <p className="caption" style={{ marginBottom: 'var(--space-3)' }}>
        Any OpenAI-compatible API endpoint. The system makes a test call before saving.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div className="add-provider-grid">
          <AppInput label="Display Name" placeholder="My DeepSeek Instance" value={form.name} onChange={set('name')} />
          <AppInput label="Model Name" placeholder="deepseek-chat" value={form.model} onChange={set('model')} />
        </div>

        <AppInput
          label="API Base URL"
          placeholder="https://api.deepseek.com/v1"
          value={form.endpoint}
          onChange={set('endpoint')}
        />

        <div style={{ position: 'relative' }}>
          <AppInput
            type={showKey ? 'text' : 'password'}
            label="API Key"
            placeholder="sk-..."
            value={form.apiKey}
            onChange={set('apiKey')}
          />
          <button
            type="button"
            className="api-key-toggle"
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && (
          <div className="add-provider-error">
            <XCircle size={15} />
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-2)', paddingTop: '4px' }}>
          <AppButton type="submit" disabled={loading}>
            {loading
              ? <><Loader size={15} style={{ animation: 'spin 700ms linear infinite', marginRight: 6 }} />Testing &amp; Saving…</>
              : <><CheckCircle size={15} style={{ marginRight: 6 }} />Connect &amp; Save</>
            }
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </AppButton>
        </div>
      </form>
    </div>
  );
}

// ─── How it works panel ───────────────────────────────────────────────────────

function HowItWorks() {
  const items = [
    { icon: '✓', label: 'Success',    color: 'var(--accent-green)',  text: 'Result is used immediately, remaining providers are skipped.' },
    { icon: '⚡', label: 'Rate limit', color: 'var(--accent-orange)', text: 'Falls through to the next provider automatically with a log entry.' },
    { icon: '✗', label: 'All fail',   color: 'var(--accent-red)',    text: 'The job step fails once with a clear log showing which provider failed and why.' },
  ];

  return (
    <AppCard className="how-it-works-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-2)' }}>
        <Info size={18} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
        <h3 className="card-title" style={{ fontSize: 'var(--text-lg)' }}>How the fallback chain works</h3>
      </div>

      <p className="body-text" style={{ marginBottom: 'var(--space-3)' }}>
        When a job needs to generate a scene prompt or write a script, the pipeline tries each{' '}
        <strong style={{ color: 'var(--text-primary)' }}>enabled</strong> provider in priority order (lowest number = tried first).
      </p>

      <div className="chain-steps">
        {items.map(({ icon, label, color, text }) => (
          <div key={label} className="chain-step">
            <div className="chain-step-icon" style={{ color }}>
              <span>{icon}</span>
            </div>
            <div>
              <span className="chain-step-label" style={{ color }}>{label}</span>
              <span className="chain-step-text"> {text}</span>
            </div>
          </div>
        ))}
      </div>
    </AppCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Providers() {
  const { addToast } = useAppStore();
  const [providers, setProviders] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [testing,   setTesting]   = useState({});

  const load = useCallback(async () => {
    try {
      const { data } = await getProviders();
      setProviders(data);
    } catch {
      addToast('Failed to load providers', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const handleTest = async (id) => {
    setTesting((t) => ({ ...t, [id]: true }));
    try {
      const { data } = await testProvider(id);
      setProviders((prev) =>
        prev.map((p) => p._id === id
          ? { ...p, connected: data.connected, lastError: data.error || '' }
          : p
        )
      );
      addToast(
        data.connected ? 'Connection successful' : `Test failed: ${data.error}`,
        data.connected ? 'success' : 'error'
      );
    } catch {
      addToast('Test request failed', 'error');
    } finally {
      setTesting((t) => ({ ...t, [id]: false }));
    }
  };

  const handleToggle = async (id, enabled) => {
    try {
      const { data } = await updateProvider(id, { enabled });
      setProviders((prev) => prev.map((p) => p._id === id ? { ...p, enabled: data.enabled } : p));
    } catch {
      addToast('Failed to update provider', 'error');
    }
  };

  const handleMove = async (id, direction) => {
    const idx = providers.findIndex((p) => p._id === id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= providers.length) return;

    const reordered = [...providers];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const withPriorities = reordered.map((p, i) => ({ ...p, priority: (i + 1) * 100 }));
    setProviders(withPriorities);

    try {
      await reorderProviders(withPriorities.map((p) => ({ id: p._id, priority: p.priority })));
    } catch {
      addToast('Failed to save new order', 'error');
      load();
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Remove "${name}"? This cannot be undone.`)) return;
    try {
      await deleteProvider(id);
      setProviders((prev) => prev.filter((p) => p._id !== id));
      addToast('Provider removed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to remove provider', 'error');
    }
  };

  const builtins = providers.filter((p) => p.type === 'builtin');
  const customs  = providers.filter((p) => p.type === 'custom');

  if (loading) {
    return (
      <AppPage>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 12, color: 'var(--text-muted)' }}>
          <Loader size={32} style={{ animation: 'spin 700ms linear infinite', color: 'var(--brand-primary)' }} />
          <p className="caption">Loading providers…</p>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage>
      {/* Page header */}
      <div className="providers-header">
        <div>
          <h1 className="page-title">AI Providers</h1>
          <p className="subheading" style={{ marginTop: 8 }}>
            Manage the fallback chain for script generation and scene-prompt building.
            Providers are tried top-to-bottom — use the arrows to set your preferred order.
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="providers-layout">

        {/* ── LEFT: provider lists ─────────────────────────────────────────── */}
        <div className="providers-main">

          {/* Built-in */}
          <AppCard>
            <div className="section-card-header">
              <Cpu size={20} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
              <div>
                <h2 className="card-title">Built-in Providers</h2>
                <p className="caption" style={{ marginTop: 4 }}>
                  API keys are read from your server's <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-blue)' }}>.env</code> file.
                  Built-ins cannot be deleted but can be disabled or reordered.
                </p>
              </div>
            </div>

            <div className="provider-list">
              {builtins.map((p, i) => (
                <ProviderRow
                  key={p._id}
                  provider={p}
                  isBuiltin
                  onTest={handleTest}
                  onMove={handleMove}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  isFirst={i === 0 && customs.length === 0}
                  isLast={i === builtins.length - 1 && customs.length === 0}
                  testing={!!testing[p._id]}
                />
              ))}
            </div>
          </AppCard>

          {/* Custom */}
          <AppCard>
            <div className="section-card-header">
              <Plug size={20} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
              <div>
                <h2 className="card-title">Custom Providers</h2>
                <p className="caption" style={{ marginTop: 4 }}>
                  Any OpenAI-compatible API endpoint. Keys are encrypted at rest. By default, custom
                  providers slot in between Grok CLI and Gemini (priority 200 range).
                </p>
              </div>
            </div>

            {customs.length > 0 && (
              <div className="provider-list">
                {customs.map((p, i) => (
                  <ProviderRow
                    key={p._id}
                    provider={p}
                    isBuiltin={false}
                    onTest={handleTest}
                    onMove={handleMove}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    isFirst={i === 0}
                    isLast={i === customs.length - 1}
                    testing={!!testing[p._id]}
                  />
                ))}
              </div>
            )}

            {customs.length === 0 && (
              <div className="provider-empty">
                <Plug size={28} style={{ opacity: 0.4 }} />
                <p>No custom providers added yet.</p>
              </div>
            )}

            <div style={{ marginTop: customs.length > 0 ? 'var(--space-3)' : 'var(--space-2)' }}>
              <AddProviderForm onAdded={load} />
            </div>
          </AppCard>
        </div>

        {/* ── RIGHT: info panel ───────────────────────────────────────────── */}
        <div className="providers-side">
          <HowItWorks />

          {/* Stats card */}
          <AppCard>
            <h3 className="card-title" style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>
              Chain Overview
            </h3>
            <div className="chain-stats">
              <div className="chain-stat">
                <span className="metric-value" style={{ fontSize: 32 }}>{providers.filter(p => p.enabled).length}</span>
                <span className="caption">Enabled</span>
              </div>
              <div className="chain-stat-divider" />
              <div className="chain-stat">
                <span className="metric-value" style={{ fontSize: 32, background: 'linear-gradient(135deg, var(--accent-green), #34d399)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{providers.filter(p => p.connected).length}</span>
                <span className="caption">Connected</span>
              </div>
              <div className="chain-stat-divider" />
              <div className="chain-stat">
                <span className="metric-value" style={{ fontSize: 32 }}>{providers.length}</span>
                <span className="caption">Total</span>
              </div>
            </div>
          </AppCard>
        </div>

      </div>
    </AppPage>
  );
}
