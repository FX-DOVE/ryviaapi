import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import {
  Server, Activity, Layers, UserPlus, Lock, ArrowUpRight,
  Cpu, CreditCard,
  Brain, Film, Image, RefreshCw,
  Mail, Ticket, Gift, XCircle
} from 'lucide-react';

/**
 * The three model roles, as /api/providers/status reports them.
 *
 * `envKeys` is what an operator has to set in .env to make the role work, so it
 * lists the whole surface the providers actually read — including the second Qwen
 * endpoint. Qwen is deployed twice on purpose: two fp8 pipelines resident at once
 * OOM a 48 GB card, so each endpoint pins QWEN_MODES to a single mode.
 */
const PROVIDER_META = {
  reasoning: {
    icon: Brain,
    label: 'AI Reasoning',
    subTitle: 'Google Gemini (gemini-3.5-flash-lite)',
    desc: 'Decomposes the screenplay, directs angles, and plans 8s segment prompts',
    envKeys: ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_BASE_URL', 'AI_API_KEY', 'AI_API_ENDPOINT'],
  },
  video: {
    icon: Film,
    label: 'LTX-2.5 Video',
    subTitle: 'Runpod Serverless — Native Audio',
    desc: 'Image→video with a muxed audio track. Cold start runs 7-11 min before the first frame.',
    envKeys: ['RUNPOD_API_KEY', 'RUNPOD_LTX_ENDPOINT_ID', 'LTX_RESOLUTION'],
  },
  image: {
    icon: Image,
    label: 'Qwen-Image',
    subTitle: 'Runpod Serverless — text2image + edit',
    desc: 'Character and environment lock sheets, anchor keyframes, and the edit-mode re-anchor that keeps continuity across cuts',
    envKeys: ['RUNPOD_API_KEY', 'RUNPOD_QWEN_T2I_ENDPOINT_ID', 'RUNPOD_QWEN_EDIT_ENDPOINT_ID'],
  },
};

/**
 * Keep the endpoint id, drop only the scheme.
 *
 * Every Runpod endpoint lives on the same host, so trimming to the host — which
 * this used to do — rendered all three cards as "api.runpod.ai" and hid the one
 * field that tells a stale id (HTTP 404 on a valid key) from a real outage.
 */
function shortEndpoint(url) {
  if (!url) return null;
  return String(url).replace(/^https?:\/\//, '');
}

function StatusIndicator({ connected, configured, testing }) {
  if (testing) {
    return (
      <div className="status-indicator status-indicator-testing">
        <RefreshCw size={12} className="animate-spin" />
        <span>Testing</span>
      </div>
    );
  }
  if (!configured) {
    return (
      <div className="status-indicator status-indicator-unconfigured">
        <div className="indicator-dot" />
        <span>Unconfigured</span>
      </div>
    );
  }
  if (connected === true) {
    return (
      <div className="status-indicator status-indicator-connected">
        <div className="indicator-dot" />
        <span>Connected</span>
      </div>
    );
  }
  return (
    <div className="status-indicator status-indicator-failed">
      <div className="indicator-dot" />
      <span>Failed</span>
    </div>
  );
}

function workerChipClass(status) {
  if (status === 'busy' || status === 'throttled') return 'admin-chip admin-chip--busy';
  if (['online', 'ready'].includes(status)) return 'admin-chip admin-chip--ok';
  return 'admin-chip admin-chip--muted';
}

function ledgerTypeChip(type) {
  if (type === 'addition') return 'admin-chip admin-chip--ok';
  if (type === 'refund') return 'admin-chip admin-chip--brand';
  return 'admin-chip admin-chip--muted';
}

export default function Admin({ defaultTab = 'overview' }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [workers, setWorkers] = useState([]);
  const [ledgerLogs, setLedgerLogs] = useState([]);
  // Pipeline order, and every queue the backend reports. directing/locking/segment
  // were missing here and from the metrics endpoint, so the three queues that carry
  // a film from screenplay to footage were the only ones an admin could not see.
  const [queueMetrics, setQueueMetrics] = useState({
    scriptQueue: 0, directingQueue: 0, lockingQueue: 0, segmentQueue: 0,
    promptQueue: 0, audioQueue: 0, imageQueue: 0, videoQueue: 0,
    renderingQueue: 0, uploadQueue: 0, notificationQueue: 0,
  });
  const [stats, setStats] = useState({ activeUsers: 0, revenue: '$0', totalJobs: 0, failedJobs: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetchInFlightRef = useRef(false);

  // AI Connections state
  const [aiProviders, setAiProviders] = useState([]);
  const [testResults, setTestResults] = useState({});
  const [testingType, setTestingType] = useState(null);

  const [usersList, setUsersList] = useState([]);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promoteMessage, setPromoteMessage] = useState(null);

  const [couponsList, setCouponsList] = useState([]);
  const [couponForm, setCouponForm] = useState({ code: '', fixedCreditUsd: '25', percentOff: '', maxRedemptions: '', expiresAt: '' });
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState(null);

  const [grantForm, setGrantForm] = useState({ email: '', amountUsd: '10', reason: 'Admin grant', allUsers: false });
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState(null);

  const [bulkForm, setBulkForm] = useState({ subject: '', text: '' });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState(null);

  const fetchRegistry = async ({ isFirstLoad = false, showRefreshing = false } = {}) => {
    // Silent background polls must not disable the Refresh button.
    // Skip overlapping polls (interval can fire while a request is in flight).
    if (fetchInFlightRef.current && !isFirstLoad) return;
    fetchInFlightRef.current = true;
    if (isFirstLoad) setLoading(true);
    if (showRefreshing) setRefreshing(true);
    const safeJson = async (res) => {
      if (!res || !res.ok) return null;
      try {
        const text = await res.text();
        if (!text || !text.trim()) return null;
        return JSON.parse(text);
      } catch {
        return null;
      }
    };

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        fetchInFlightRef.current = false;
        setError('Please log in as an administrator.');
        return;
      }
      const headers = { 'Authorization': `Bearer ${token}` };

      // Verify or refresh live user profile & admin permissions
      let userStr = localStorage.getItem('user');
      let user = null;
      try {
        if (userStr) user = JSON.parse(userStr);
      } catch {}

      try {
        const meRes = await fetch('/api/auth/me', { headers });
        const meData = await safeJson(meRes);
        if (meData?.user) {
          user = meData.user;
          localStorage.setItem('user', JSON.stringify(meData.user));
        }
      } catch (e) {
        console.warn('Could not refresh user profile:', e);
      }

      if (user?.role !== 'admin' && user?.email !== 'odohchisom51@gmail.com') {
        setError('Access denied. Administrator privileges required.');
        setLoading(false);
        setRefreshing(false);
        fetchInFlightRef.current = false;
        return;
      }

      const [resWorkers, resQueues, resLedger, resStats, resProviders, resUsers, resCoupons] = await Promise.all([
        fetch('/api/system/health', { headers }).catch(() => null),
        fetch('/api/system/metrics', { headers }).catch(() => null),
        fetch('/api/system/ledger', { headers }).catch(() => null),
        fetch('/api/system/stats', { headers }).catch(() => null),
        fetch('/api/providers/status', { headers }).catch(() => null),
        fetch('/api/system/users', { headers }).catch(() => null),
        fetch('/api/system/coupons', { headers }).catch(() => null),
      ]);

      const [dataWorkers, dataQueues, dataLedger, dataStats, dataProviders, dataUsers, dataCoupons] = await Promise.all([
        safeJson(resWorkers),
        safeJson(resQueues),
        safeJson(resLedger),
        safeJson(resStats),
        safeJson(resProviders),
        safeJson(resUsers),
        safeJson(resCoupons),
      ]);

      if (dataWorkers?.workers) setWorkers(dataWorkers.workers);
      if (dataQueues?.backlog) setQueueMetrics(dataQueues.backlog);
      if (dataLedger?.logs) setLedgerLogs(dataLedger.logs);
      if (dataStats) {
        setStats({
          activeUsers: dataStats.activeUsers || 0,
          revenue: dataStats.revenue || '$0',
          totalJobs: dataStats.totalJobs || 0,
          failedJobs: dataStats.failedJobs || 0
        });
      }
      if (dataProviders?.providers) setAiProviders(dataProviders.providers);
      if (dataUsers?.users) setUsersList(dataUsers.users);
      if (dataCoupons?.coupons) setCouponsList(dataCoupons.coupons);

      setError(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to load system metrics');
    } finally {
      if (isFirstLoad) setLoading(false);
      if (showRefreshing) setRefreshing(false);
      fetchInFlightRef.current = false;
    }
  };

  useEffect(() => {
    fetchRegistry({ isFirstLoad: true });
    const interval = setInterval(() => fetchRegistry({}), 8000);
    return () => clearInterval(interval);
  }, []);

  const handleTestProvider = async (type) => {
    setTestingType(type);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/providers/${type}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      setTestResults(prev => ({ ...prev, [type]: result }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [type]: { connected: false, error: err.message } }));
    } finally {
      setTestingType(null);
    }
  };

  const handleTestAll = async () => {
    for (const type of ['reasoning', 'video', 'image']) {
      await handleTestProvider(type);
    }
  };

  const handlePromote = async (e, customEmail = null) => {
    if (e) e.preventDefault();
    const targetEmail = customEmail || promoteEmail;
    if (!targetEmail) return;

    setPromoting(true);
    setPromoteMessage(null);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/system/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: targetEmail })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to promote user');

      setPromoteMessage({ type: 'success', text: data.message });
      setPromoteEmail('');
      await fetchRegistry({});
    } catch (err) {
      setPromoteMessage({ type: 'error', text: err.message });
    } finally {
      setPromoting(false);
    }
  };

  const handleDemote = async (email) => {
    if (!email) return;
    setPromoting(true);
    setPromoteMessage(null);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/system/demote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update user role');

      setPromoteMessage({ type: 'success', text: data.message });
      await fetchRegistry({});
    } catch (err) {
      setPromoteMessage({ type: 'error', text: err.message });
    } finally {
      setPromoting(false);
    }
  };

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
  });

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const body = {
        code: couponForm.code,
        maxRedemptions: couponForm.maxRedemptions ? Number(couponForm.maxRedemptions) : undefined,
        expiresAt: couponForm.expiresAt || undefined,
      };
      if (couponForm.percentOff) body.percentOff = Number(couponForm.percentOff);
      else body.fixedCreditUsd = Number(couponForm.fixedCreditUsd || 0);
      const res = await fetch('/api/system/coupons', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create coupon');
      setCouponMsg({ type: 'success', text: `Created coupon ${data.coupon?.code}` });
      setCouponForm({ code: '', fixedCreditUsd: '25', percentOff: '', maxRedemptions: '', expiresAt: '' });
      await fetchRegistry({});
    } catch (err) {
      setCouponMsg({ type: 'error', text: err.message });
    } finally {
      setCouponBusy(false);
    }
  };

  const handleDisableCoupon = async (id) => {
    setCouponBusy(true);
    try {
      const res = await fetch(`/api/system/coupons/${id}/disable`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disable coupon');
      setCouponMsg({ type: 'success', text: 'Coupon disabled' });
      await fetchRegistry({});
    } catch (err) {
      setCouponMsg({ type: 'error', text: err.message });
    } finally {
      setCouponBusy(false);
    }
  };

  const handleGrantCredits = async (e) => {
    e.preventDefault();
    setGrantBusy(true);
    setGrantMsg(null);
    try {
      const body = {
        amountUsd: Number(grantForm.amountUsd),
        reason: grantForm.reason,
        allUsers: !!grantForm.allUsers,
      };
      if (!grantForm.allUsers) body.email = grantForm.email;
      const res = await fetch('/api/system/credits/grant', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Grant failed');
      setGrantMsg({ type: 'success', text: `Granted $${data.grantedUsd} to ${data.count} user(s)` });
      await fetchRegistry({});
    } catch (err) {
      setGrantMsg({ type: 'error', text: err.message });
    } finally {
      setGrantBusy(false);
    }
  };

  const handleBulkEmail = async (e) => {
    e.preventDefault();
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await fetch('/api/system/email/bulk', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ subject: bulkForm.subject, text: bulkForm.text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk email failed');
      setBulkMsg({ type: 'success', text: `Queued to ${data.recipients} users (${data.sent} sent, ${data.skipped} skipped)` });
      setBulkForm({ subject: '', text: '' });
    } catch (err) {
      setBulkMsg({ type: 'error', text: err.message });
    } finally {
      setBulkBusy(false);
    }
  };

  const activeCoupons = couponsList.filter((c) => c.active !== false);

  if (loading) {
    return (
      <AppPage className="admin-page">
        <PageHeader
          title="Admin Control Center"
          description="Global system metrics, worker instances, and AI provider status."
        />
        <div className="admin-tabs segmented" aria-hidden="true">
          <Skeleton height={36} width={96} className="rounded-[var(--radius-sm)]" />
          <Skeleton height={36} width={110} className="rounded-[var(--radius-sm)]" />
          <Skeleton height={36} width={110} className="rounded-[var(--radius-sm)]" />
        </div>
        <div className="admin-skeleton-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="admin-skeleton-card">
              <Skeleton variant="text" height={12} width="40%" />
              <Skeleton variant="text" height={28} width="55%" />
              <Skeleton variant="text" height={10} width="30%" />
            </div>
          ))}
        </div>
        <div className="admin-panel">
          <div className="admin-panel-header">
            <Skeleton variant="text" height={16} width={160} />
          </div>
          <div className="admin-panel-body" style={{ gap: 12 }}>
            <Skeleton height={64} className="rounded-[var(--radius-md)]" />
            <Skeleton height={64} className="rounded-[var(--radius-md)]" />
            <Skeleton height={64} className="rounded-[var(--radius-md)]" />
          </div>
        </div>
      </AppPage>
    );
  }

  if (error) {
    return (
      <AppPage className="admin-page flex items-center justify-center min-h-[70vh]">
        <div className="admin-error-card">
          <div className="admin-error-icon" aria-hidden="true">
            <Lock size={20} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Access Restricted</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed">{error}</p>
          <AppButton onClick={() => navigate('/app/film-studio')} className="w-full">
            Return to Studio
          </AppButton>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="admin-page">
      <PageHeader
        title="Command Center"
        description="Monitor GPU fleet, process queues, and system configuration."
        actions={
          <AppButton
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => fetchRegistry({ showRefreshing: true })}
            disabled={refreshing}
            className={refreshing ? 'opacity-80' : ''}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </AppButton>
        }
      />

      <div className="admin-tabs segmented" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          role="tab"
          className="segmented-option"
          aria-pressed={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          className="segmented-option"
          aria-pressed={activeTab === 'ai-connections'}
          onClick={() => setActiveTab('ai-connections')}
        >
          <span className="admin-tab-label-short">AI</span>
          <span className="admin-tab-label-full">AI Connections</span>
        </button>
        <button
          type="button"
          role="tab"
          className="segmented-option"
          aria-pressed={activeTab === 'studio-ops'}
          onClick={() => setActiveTab('studio-ops')}
        >
          Studio Ops
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-label"><Activity size={14} /> SaaS Users</div>
              <div className="admin-stat-value">{stats.activeUsers}</div>
              <div className="admin-stat-meta admin-stat-meta--ok">
                <ArrowUpRight size={12} /> Active accounts
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label"><CreditCard size={14} /> MRR Revenue</div>
              <div className="admin-stat-value">{stats.revenue}</div>
              <div className="admin-stat-meta admin-stat-meta--ok">
                <ArrowUpRight size={12} /> Active subscriptions
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label"><Film size={14} /> Total Productions</div>
              <div className="admin-stat-value">{stats.totalJobs}</div>
              <div className="admin-stat-meta">Cumulative pipelines run</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label"><XCircle size={14} /> Failed Jobs (24h)</div>
              <div className="admin-stat-value">{stats.failedJobs}</div>
              <div className="admin-stat-meta admin-stat-meta--bad">Error rate in past 24h</div>
            </div>
          </div>

          <div className="admin-overview-grid">
            <div className="admin-panel">
              <div className="admin-panel-header">
                <h2 className="admin-panel-title">
                  <Server size={14} />
                  GPU Cluster Fleet
                </h2>
                <span className="admin-chip admin-chip--live">
                  <span className="admin-live-dot" aria-hidden="true" />
                  Live Sync
                </span>
              </div>
              <div className="admin-panel-body">
                {workers.length === 0 ? (
                  <EmptyState
                    icon={Server}
                    title="No workers online"
                    description="Ensure compute nodes are connected to the Redis pool."
                    className="!py-10 !px-4"
                  />
                ) : (
                  <div className="admin-worker-list">
                    {workers.map((w, idx) => (
                      <div key={idx} className="admin-worker-row">
                        <div className="admin-worker-identity">
                          <div className="admin-worker-icon" aria-hidden="true">
                            <Cpu size={14} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{w.workerId}</span>
                              <span className={workerChipClass(w.status)}>{w.status}</span>
                            </div>
                            <div
                              className="text-xs text-[var(--text-secondary)] admin-worker-gpu"
                              title={w.gpuModel || undefined}
                            >
                              {w.gpuModel}
                            </div>
                          </div>
                        </div>
                        <div className="admin-worker-metrics">
                          <div className="admin-metric">
                            <div className="admin-metric-label">
                              {String(w.workerId || '').includes('vps') ? 'CPU Load' : 'GPU Load'}
                            </div>
                            <div className="admin-metric-value">{w.metrics?.gpuUtilization || 0}%</div>
                          </div>
                          <div className="admin-metric">
                            <div className="admin-metric-label">Temp</div>
                            <div className="admin-metric-value">{w.metrics?.temperature || 0}°C</div>
                          </div>
                          <div className="admin-metric">
                            <div className="admin-metric-label">
                              {String(w.workerId || '').includes('vps') ? 'RAM Used' : 'VRAM Used'}
                            </div>
                            <div className="admin-metric-value">{((w.metrics?.memoryUsed || 0) / 1024).toFixed(1)}GB</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-panel">
              <div className="admin-panel-header">
                <h2 className="admin-panel-title">
                  <Layers size={14} />
                  Queue Backlog
                </h2>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  {queueMetrics.total ?? 0} total
                </span>
              </div>
              <div className="admin-panel-body admin-panel-body--flush">
                <ul className="admin-queue-list">
                  {/* `total` arrives inside backlog and is shown in the header, not as a queue. */}
                  {Object.entries(queueMetrics).filter(([name]) => name !== 'total').map(([queueName, count]) => (
                    <li key={queueName}>
                      <span className="admin-queue-name">
                        {queueName.replace('Queue', ' process')}
                      </span>
                      <span className={`admin-queue-count ${count > 0 ? 'admin-queue-count--hot' : ''}`}>
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">
                <CreditCard size={14} />
                Credit Ledger
              </h2>
            </div>

            <div className="admin-mobile-only">
              {ledgerLogs.length === 0 ? (
                <div className="admin-empty-inline">No ledger transactions recorded.</div>
              ) : (
                <div className="admin-stack-list">
                  {ledgerLogs.map((log) => {
                    const isPositive = ['addition', 'refund'].includes(log.type);
                    const date = new Date(log.createdAt);
                    return (
                      <div key={log._id} className="admin-stack-item">
                        <div className="admin-stack-row">
                          <div className="min-w-0">
                            <div className="text-xs text-[var(--text-muted)]">
                              {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-sm text-[var(--text-primary)] truncate mt-0.5">{log.userId?.name || 'System'}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{log.userId?.email || 'automated'}</div>
                          </div>
                          <div className={`text-sm font-mono shrink-0 ${isPositive ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]'}`}>
                            {isPositive ? '+' : '-'}${((log.credits || 0) / 100).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`${ledgerTypeChip(log.type)} capitalize`}>{log.type}</span>
                          {log.reason && (
                            <span className="text-xs text-[var(--text-secondary)] break-words">{log.reason}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="admin-desktop-only admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Amount</th>
                    <th className="w-full">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLogs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="admin-empty-inline">
                        No ledger transactions recorded.
                      </td>
                    </tr>
                  ) : (
                    ledgerLogs.map((log) => {
                      const isPositive = ['addition', 'refund'].includes(log.type);
                      const date = new Date(log.createdAt);
                      return (
                        <tr key={log._id}>
                          <td className="text-xs text-[var(--text-muted)]">
                            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <div className="text-[var(--text-primary)] text-xs">{log.userId?.name || 'System'}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{log.userId?.email || 'automated'}</div>
                          </td>
                          <td>
                            <span className={`${ledgerTypeChip(log.type)} capitalize`}>{log.type}</span>
                          </td>
                          <td className={`text-xs font-mono ${isPositive ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]'}`}>
                            {isPositive ? '+' : '-'}${((log.credits || 0) / 100).toFixed(2)}
                          </td>
                          <td className="text-xs text-[var(--text-secondary)] truncate max-w-[200px]">
                            {log.reason}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai-connections' && (
        <div className="flex flex-col gap-4">
          <div className="admin-provider-actions">
            <AppButton
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={handleTestAll}
              disabled={!!testingType}
              className="w-full sm:w-auto"
            >
              {testingType ? 'Pinging…' : 'Ping All Endpoints'}
            </AppButton>
          </div>

          <div className="admin-provider-grid">
            {['reasoning', 'video', 'image'].map((type) => {
              const meta = PROVIDER_META[type];
              const Icon = meta.icon;
              const provider = aiProviders.find(p => p.type === type) || {};
              const result = testResults[type];
              const testing = testingType === type;
              const isConfigured = provider.configured;
              const isConnected = result?.connected ?? null;

              return (
                <div key={type} className="admin-provider-card">
                  <div className="admin-provider-head">
                    <div className="admin-provider-icon" aria-hidden="true">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{meta.label}</h3>
                        <StatusIndicator connected={isConnected} configured={isConfigured} testing={testing} />
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] truncate">{meta.subTitle}</p>
                    </div>
                  </div>

                  <div className="admin-provider-body">
                    <p className="admin-provider-desc">{meta.desc}</p>

                    <div className="admin-kv">
                      <span className="admin-kv-label">Active Model</span>
                      <span className="admin-kv-value">
                        {provider.model || <span className="text-[var(--text-muted)] italic">Inherited</span>}
                      </span>
                    </div>

                    <div className="admin-kv">
                      <span className="admin-kv-label">Endpoint</span>
                      <span className="admin-kv-value">
                        {shortEndpoint(provider.endpoint) || <span className="text-[var(--text-muted)] italic">Not configured</span>}
                      </span>
                    </div>

                    {/* Qwen answers on two endpoints; continuity depends on the edit one. */}
                    {provider.editEndpoint && (
                      <div className="admin-kv">
                        <span className="admin-kv-label">Edit Endpoint</span>
                        <span className="admin-kv-value">{shortEndpoint(provider.editEndpoint)}</span>
                      </div>
                    )}

                    {/* The reasoning role falls back across transports, in this order. */}
                    {provider.fallbacks?.length > 0 && (
                      <div className="admin-kv">
                        <span className="admin-kv-label">Fallback Chain</span>
                        <span className="admin-kv-value" style={{ fontSize: 11 }}>
                          {provider.fallbacks.join(' → ')}
                        </span>
                      </div>
                    )}

                    <div className="admin-kv">
                      <span className="admin-kv-label">.env Keys</span>
                      <div className="admin-env-chips">
                        {meta.envKeys.map((key) => (
                          <span key={key} className="admin-env-chip">{key}</span>
                        ))}
                      </div>
                    </div>

                    <div className="admin-provider-footer">
                      <StatusIndicator connected={isConnected} configured={isConfigured} testing={testing} />
                      <AppButton
                        variant={testing ? 'secondary' : 'ghost'}
                        size="sm"
                        icon={testing ? RefreshCw : undefined}
                        onClick={() => handleTestProvider(type)}
                        disabled={testing || !isConfigured}
                      >
                        {testing ? 'Testing…' : 'Ping API'}
                      </AppButton>
                    </div>

                    {/* Worker readiness from /health. `throttled` means the GPU tier has no
                        capacity in the region, which looks identical to a hang otherwise. */}
                    {result?.note && (
                      <div className="mt-3 p-3 rounded-[var(--radius-md)] bg-[var(--bg-raised)] border border-[var(--glass-border)] text-xs text-[var(--text-secondary)] font-mono">
                        {result.note}
                      </div>
                    )}

                    {result?.error && (
                      <div className="mt-3 p-3 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--accent-red)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent-red)_26%,transparent)] text-xs text-[var(--accent-red)]">
                        {result.error}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'studio-ops' && (
        <div className="admin-ops-grid">
          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">
                <Ticket size={14} />
                Coupons
              </h2>
            </div>
            <div className="admin-panel-body">
              <form onSubmit={handleCreateCoupon} className="admin-form">
                <div>
                  <label htmlFor="coupon-code" className="form-label text-xs">Code</label>
                  <input
                    id="coupon-code"
                    type="text"
                    value={couponForm.code}
                    onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="LAUNCH25"
                    required
                    className="form-input text-xs w-full"
                  />
                </div>
                <div>
                  <label htmlFor="coupon-fixed" className="form-label text-xs">Fixed credit (USD)</label>
                  <input
                    id="coupon-fixed"
                    type="number"
                    min="0"
                    step="0.01"
                    value={couponForm.fixedCreditUsd}
                    onChange={(e) => setCouponForm((f) => ({ ...f, fixedCreditUsd: e.target.value, percentOff: '' }))}
                    placeholder="25"
                    className="form-input text-xs w-full"
                    disabled={!!couponForm.percentOff}
                  />
                </div>
                <div>
                  <label htmlFor="coupon-percent" className="form-label text-xs">Percent off (optional)</label>
                  <input
                    id="coupon-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={couponForm.percentOff}
                    onChange={(e) => setCouponForm((f) => ({ ...f, percentOff: e.target.value, fixedCreditUsd: e.target.value ? '' : f.fixedCreditUsd }))}
                    placeholder="Leave empty for fixed credit"
                    className="form-input text-xs w-full"
                  />
                </div>
                <div>
                  <label htmlFor="coupon-max" className="form-label text-xs">Max redemptions</label>
                  <input
                    id="coupon-max"
                    type="number"
                    min="1"
                    value={couponForm.maxRedemptions}
                    onChange={(e) => setCouponForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                    placeholder="Unlimited"
                    className="form-input text-xs w-full"
                  />
                </div>
                <div>
                  <label htmlFor="coupon-expires" className="form-label text-xs">Expires at</label>
                  <input
                    id="coupon-expires"
                    type="datetime-local"
                    value={couponForm.expiresAt}
                    onChange={(e) => setCouponForm((f) => ({ ...f, expiresAt: e.target.value }))}
                    className="form-input text-xs w-full"
                  />
                </div>
                <AppButton type="submit" size="sm" disabled={couponBusy} className="w-full">
                  {couponBusy ? 'Creating…' : 'Create coupon'}
                </AppButton>
              </form>

              {couponMsg && (
                <div className={`admin-msg mt-3 ${couponMsg.type === 'success' ? 'admin-msg--ok' : 'admin-msg--err'}`}>
                  {couponMsg.text}
                </div>
              )}

              <div className="admin-section-divider">
                <div className="admin-section-label">
                  <span>Active coupons</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{activeCoupons.length}</span>
                </div>

                {activeCoupons.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No active coupons.</p>
                ) : (
                  <>
                    <div className="admin-mobile-only admin-scroll">
                      {activeCoupons.map((c) => (
                        <div key={c._id || c.id || c.code} className="admin-stack-item !px-0">
                          <div className="admin-stack-row">
                            <div className="min-w-0">
                              <div className="text-xs font-mono font-medium text-[var(--text-primary)] truncate">{c.code}</div>
                              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                {c.percentOff != null && c.percentOff !== ''
                                  ? `${c.percentOff}% off`
                                  : `$${((c.fixedCreditCents != null ? c.fixedCreditCents : Math.round(Number(c.fixedCreditUsd || 0) * 100)) / 100).toFixed(2)} credit`}
                                {c.maxRedemptions ? ` · max ${c.maxRedemptions}` : ''}
                                {c.expiresAt ? ` · exp ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                              </div>
                            </div>
                            <AppButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={couponBusy}
                              onClick={() => handleDisableCoupon(c._id || c.id)}
                              className="shrink-0"
                            >
                              Disable
                            </AppButton>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="admin-desktop-only admin-scroll">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Value</th>
                            <th>Limits</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {activeCoupons.map((c) => (
                            <tr key={c._id || c.id || c.code}>
                              <td className="font-mono text-xs">{c.code}</td>
                              <td className="text-xs text-[var(--text-secondary)]">
                                {c.percentOff != null && c.percentOff !== ''
                                  ? `${c.percentOff}% off`
                                  : `$${((c.fixedCreditCents != null ? c.fixedCreditCents : Math.round(Number(c.fixedCreditUsd || 0) * 100)) / 100).toFixed(2)}`}
                              </td>
                              <td className="text-[10px] text-[var(--text-muted)]">
                                {c.maxRedemptions ? `max ${c.maxRedemptions}` : 'unlimited'}
                                {c.expiresAt ? ` · ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                              </td>
                              <td>
                                <AppButton
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={couponBusy}
                                  onClick={() => handleDisableCoupon(c._id || c.id)}
                                >
                                  Disable
                                </AppButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">
                <Gift size={14} />
                Grant credits
              </h2>
            </div>
            <div className="admin-panel-body">
              <form onSubmit={handleGrantCredits} className="admin-form">
                <div>
                  <label htmlFor="grant-email" className="form-label text-xs">User email</label>
                  <input
                    id="grant-email"
                    type="email"
                    value={grantForm.email}
                    onChange={(e) => setGrantForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="user@example.com"
                    required={!grantForm.allUsers}
                    disabled={grantForm.allUsers}
                    className="form-input text-xs w-full disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="grant-amount" className="form-label text-xs">Amount (USD)</label>
                  <input
                    id="grant-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={grantForm.amountUsd}
                    onChange={(e) => setGrantForm((f) => ({ ...f, amountUsd: e.target.value }))}
                    required
                    className="form-input text-xs w-full"
                  />
                </div>
                <div>
                  <label htmlFor="grant-reason" className="form-label text-xs">Reason</label>
                  <input
                    id="grant-reason"
                    type="text"
                    value={grantForm.reason}
                    onChange={(e) => setGrantForm((f) => ({ ...f, reason: e.target.value }))}
                    className="form-input text-xs w-full"
                  />
                </div>
                <label className="admin-check-row">
                  <input
                    type="checkbox"
                    checked={grantForm.allUsers}
                    onChange={(e) => setGrantForm((f) => ({ ...f, allUsers: e.target.checked }))}
                    className="rounded border-[var(--glass-border)]"
                  />
                  Grant to all users
                </label>
                <AppButton type="submit" size="sm" disabled={grantBusy} className="w-full">
                  {grantBusy ? 'Granting…' : 'Grant'}
                </AppButton>
              </form>

              {grantMsg && (
                <div className={`admin-msg mt-3 ${grantMsg.type === 'success' ? 'admin-msg--ok' : 'admin-msg--err'}`}>
                  {grantMsg.text}
                </div>
              )}
            </div>
          </div>

          <div className="admin-panel">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">
                <Mail size={14} />
                Bulk email
              </h2>
            </div>
            <div className="admin-panel-body">
              <form onSubmit={handleBulkEmail} className="admin-form flex-1">
                <div>
                  <label htmlFor="bulk-subject" className="form-label text-xs">Subject</label>
                  <input
                    id="bulk-subject"
                    type="text"
                    value={bulkForm.subject}
                    onChange={(e) => setBulkForm((f) => ({ ...f, subject: e.target.value }))}
                    required
                    className="form-input text-xs w-full"
                  />
                </div>
                <div className="flex flex-col flex-1">
                  <label htmlFor="bulk-body" className="form-label text-xs">Body</label>
                  <textarea
                    id="bulk-body"
                    value={bulkForm.text}
                    onChange={(e) => setBulkForm((f) => ({ ...f, text: e.target.value }))}
                    required
                    rows={6}
                    className="form-input text-xs w-full min-h-[120px] resize-y"
                  />
                </div>
                <AppButton type="submit" size="sm" disabled={bulkBusy} className="w-full">
                  {bulkBusy ? 'Sending…' : 'Send to all users'}
                </AppButton>
              </form>

              {bulkMsg && (
                <div className={`admin-msg mt-3 ${bulkMsg.type === 'success' ? 'admin-msg--ok' : 'admin-msg--err'}`}>
                  {bulkMsg.text}
                </div>
              )}
            </div>
          </div>

          <div className="admin-panel admin-ops-span-full">
            <div className="admin-panel-header">
              <h2 className="admin-panel-title">
                <UserPlus size={14} />
                User Management
              </h2>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">{usersList.length} total</span>
            </div>
            <div className="admin-panel-body">
              <p className="text-sm text-[var(--text-secondary)] mb-1">
                Promote a registered user to an Administrator account to grant them dashboard access.
              </p>

              <form onSubmit={(e) => handlePromote(e)} className="admin-form">
                <div>
                  <label htmlFor="promote-email" className="form-label text-xs">User email address</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="promote-email"
                      type="email"
                      value={promoteEmail}
                      onChange={(e) => setPromoteEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                      className="form-input text-xs w-full"
                    />
                    <AppButton type="submit" size="sm" disabled={promoting} className="w-full sm:w-auto shrink-0">
                      {promoting ? 'Saving…' : 'Promote'}
                    </AppButton>
                  </div>
                </div>
              </form>

              {promoteMessage && (
                <div className={`admin-msg mt-3 ${promoteMessage.type === 'success' ? 'admin-msg--ok' : 'admin-msg--err'}`}>
                  {promoteMessage.text}
                </div>
              )}

              {usersList.length > 0 && (
                <div className="admin-section-divider">
                  <div className="admin-section-label">
                    <span>Registered Users</span>
                  </div>

                  <div className="admin-mobile-only admin-scroll">
                    {usersList.map((u) => (
                      <div key={u._id} className="admin-stack-item !px-0">
                        <div className="admin-stack-row">
                          <div className="min-w-0">
                            <div className="font-medium text-xs text-[var(--text-primary)] truncate">{u.name || 'User'}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{u.email}</div>
                          </div>
                          <span className={u.role === 'admin' ? 'admin-chip admin-chip--brand' : 'admin-chip admin-chip--muted'}>
                            {u.role}
                          </span>
                        </div>
                        <div className="admin-stack-actions">
                          {u.role !== 'admin' ? (
                            <AppButton
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => handlePromote(null, u.email)}
                              disabled={promoting}
                              className="btn-inline admin-role-action"
                            >
                              Make Admin
                            </AppButton>
                          ) : (
                            <AppButton
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDemote(u.email)}
                              disabled={promoting}
                              className="btn-inline admin-role-action admin-role-action--danger"
                            >
                              Revoke
                            </AppButton>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="admin-desktop-only admin-table-wrap admin-scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Role</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((u) => (
                          <tr key={u._id}>
                            <td>
                              <div className="text-xs text-[var(--text-primary)]">{u.name || 'User'}</div>
                              <div className="text-[10px] text-[var(--text-muted)]">{u.email}</div>
                            </td>
                            <td>
                              <span className={u.role === 'admin' ? 'admin-chip admin-chip--brand' : 'admin-chip admin-chip--muted'}>
                                {u.role}
                              </span>
                            </td>
                            <td>
                              {u.role !== 'admin' ? (
                                <AppButton
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handlePromote(null, u.email)}
                                  disabled={promoting}
                                  className="btn-inline admin-role-action"
                                >
                                  Make Admin
                                </AppButton>
                              ) : (
                                <AppButton
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDemote(u.email)}
                                  disabled={promoting}
                                  className="btn-inline admin-role-action admin-role-action--danger"
                                >
                                  Revoke
                                </AppButton>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppPage>
  );
}
