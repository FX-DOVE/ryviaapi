import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import {
  Server, Activity, Layers, UserPlus, Lock, ArrowUpRight,
  Cpu, Thermometer, MemoryStick, Clock, CreditCard,
  Brain, Film, Image, Zap, Terminal, Key, Loader, XCircle, RefreshCw
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
        <Loader size={12} className="animate-spin" />
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

  // AI Connections state
  const [aiProviders, setAiProviders] = useState([]);
  const [testResults, setTestResults] = useState({});
  const [testingType, setTestingType] = useState(null);

  const [usersList, setUsersList] = useState([]);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promoteMessage, setPromoteMessage] = useState(null);

  const fetchRegistry = async (isFirstLoad = false) => {
    if (isFirstLoad) setLoading(true);
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
        return;
      }

      const [resWorkers, resQueues, resLedger, resStats, resProviders, resUsers] = await Promise.all([
        fetch('/api/system/health', { headers }).catch(() => null),
        fetch('/api/system/metrics', { headers }).catch(() => null),
        fetch('/api/system/ledger', { headers }).catch(() => null),
        fetch('/api/system/stats', { headers }).catch(() => null),
        fetch('/api/providers/status', { headers }).catch(() => null),
        fetch('/api/system/users', { headers }).catch(() => null),
      ]);

      const [dataWorkers, dataQueues, dataLedger, dataStats, dataProviders, dataUsers] = await Promise.all([
        safeJson(resWorkers),
        safeJson(resQueues),
        safeJson(resLedger),
        safeJson(resStats),
        safeJson(resProviders),
        safeJson(resUsers),
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

      setError(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to load system metrics');
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistry(true);
    const interval = setInterval(() => fetchRegistry(false), 8000);
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
      await fetchRegistry(false);
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
      await fetchRegistry(false);
    } catch (err) {
      setPromoteMessage({ type: 'error', text: err.message });
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return (
      <AppPage>
        <PageHeader
          title="Admin Control Center"
          description="Global system metrics, worker instances, and AI provider status."
        />
        <div className="flex border-b border-[var(--glass-border)] mb-8 gap-6 animate-pulse">
          <div className="h-8 w-24 bg-[var(--bg-overlay)] rounded-t-lg"></div>
          <div className="h-8 w-24 bg-[var(--bg-overlay)] rounded-t-lg"></div>
          <div className="h-8 w-24 bg-[var(--bg-overlay)] rounded-t-lg"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] p-6 h-32 animate-pulse">
              <div className="h-4 w-1/3 bg-[var(--bg-overlay)] rounded mb-4"></div>
              <div className="h-8 w-1/2 bg-[var(--bg-overlay)] rounded"></div>
            </div>
          ))}
        </div>
        <div className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] p-6 h-64 animate-pulse">
          <div className="h-6 w-1/4 bg-[var(--bg-overlay)] rounded mb-6"></div>
          <div className="space-y-4">
            <div className="h-4 w-full bg-[var(--bg-overlay)] rounded"></div>
            <div className="h-4 w-5/6 bg-[var(--bg-overlay)] rounded"></div>
            <div className="h-4 w-4/6 bg-[var(--bg-overlay)] rounded"></div>
          </div>
        </div>
      </AppPage>
    );
  }

  if (error) {
    return (
      <AppPage className="flex items-center justify-center min-h-[80vh]">
        <div className="w-full max-w-md p-8 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-[color-mix(in_srgb,var(--accent-red)_12%,transparent)] flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-[var(--accent-red)]" />
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
    <AppPage>
      <PageHeader
        title="Command Center"
        description="Monitor GPU fleet, process queues, and system configuration."
        actions={
          <div className="segmented" role="tablist" aria-label="Admin sections">
            <button
              type="button"
              role="tab"
              className="segmented-option"
              aria-pressed={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            >
              System Overview
            </button>
            <button
              type="button"
              role="tab"
              className="segmented-option"
              aria-pressed={activeTab === 'ai-connections'}
              onClick={() => setActiveTab('ai-connections')}
            >
              AI Connections
            </button>
          </div>
        }
      />

      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">

          {/* ROW 1: 4 KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div className="flex flex-col p-5 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] hover:border-[var(--border-default)] transition-colors h-full">
              <div className="text-[var(--text-secondary)] text-xs font-medium mb-3 flex items-center gap-2">
                <Activity size={14} /> SaaS Users
              </div>
              <div className="text-3xl font-semibold text-[var(--text-primary)] mb-2">{stats.activeUsers}</div>
              <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mt-auto">
                <span className="text-[var(--accent-green)] flex items-center"><ArrowUpRight size={12}/> Active</span> accounts
              </div>
            </div>

            <div className="flex flex-col p-5 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] hover:border-[var(--border-default)] transition-colors h-full">
              <div className="text-[var(--text-secondary)] text-xs font-medium mb-3 flex items-center gap-2">
                <CreditCard size={14} /> MRR Revenue
              </div>
              <div className="text-3xl font-semibold text-[var(--text-primary)] mb-2">{stats.revenue}</div>
              <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mt-auto">
                <span className="text-[var(--accent-green)] flex items-center"><ArrowUpRight size={12}/> Active</span> subscriptions
              </div>
            </div>

            <div className="flex flex-col p-5 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] hover:border-[var(--border-default)] transition-colors h-full">
              <div className="text-[var(--text-secondary)] text-xs font-medium mb-3 flex items-center gap-2">
                <Film size={14} /> Total Productions
              </div>
              <div className="text-3xl font-semibold text-[var(--text-primary)] mb-2">{stats.totalJobs}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-auto">Cumulative pipelines run</div>
            </div>

            <div className="flex flex-col p-5 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] hover:border-[var(--border-default)] transition-colors h-full">
              <div className="text-[var(--text-secondary)] text-xs font-medium mb-3 flex items-center gap-2">
                <XCircle size={14} /> Failed Jobs (24h)
              </div>
              <div className="text-3xl font-semibold text-[var(--text-primary)] mb-2">{stats.failedJobs}</div>
              <div className="text-xs text-[var(--accent-red)] mt-auto">Error rate in past 24h</div>
            </div>

          </div>

          {/* ROW 2: 70/30 GPU Fleet & Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* GPU Cluster Fleet (70%) */}
            <div className="lg:col-span-8 flex flex-col bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--bg-raised)]">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Server size={14} className="text-[var(--text-secondary)]" />
                  GPU Cluster Fleet
                </h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent-green)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent-green)_26%,transparent)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] animate-pulse" />
                  <span className="text-[10px] font-medium text-[var(--accent-green)]">Live Sync</span>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col">
                {workers.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[var(--text-secondary)]">
                    <Server className="w-8 h-8 mb-3 opacity-20" />
                    <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No workers online</p>
                    <p className="text-xs">Ensure compute nodes are connected to the Redis pool.</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {workers.map((w, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[var(--bg-sunken)] border border-[var(--glass-border)] rounded-[var(--radius-md)] gap-4">

                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-md bg-[var(--bg-raised)] border border-[var(--glass-border)] flex items-center justify-center">
                            <Cpu size={14} className="text-[var(--text-primary)]" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-[var(--text-primary)]">{w.workerId}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase ${
                                w.status === 'busy'
                                  ? 'bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] text-[var(--accent-gold)] border-[color-mix(in_srgb,var(--accent-gold)_26%,transparent)]' :
                                ['online', 'ready'].includes(w.status)
                                  ? 'bg-[color-mix(in_srgb,var(--accent-green)_12%,transparent)] text-[var(--accent-green)] border-[color-mix(in_srgb,var(--accent-green)_26%,transparent)]' :
                                w.status === 'throttled'
                                  ? 'bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] text-[var(--accent-gold)] border-[color-mix(in_srgb,var(--accent-gold)_26%,transparent)]' :
                                  'bg-[var(--bg-overlay)] text-[var(--text-muted)] border-[var(--glass-border)]'
                              }`}>
                                {w.status}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-secondary)]">{w.gpuModel}</div>
                          </div>
                        </div>

                        <div className="flex gap-6 sm:justify-end flex-wrap sm:flex-nowrap">
                          <div className="text-left sm:text-right">
                            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
                              {w.workerId.includes('vps') ? 'CPU Load' : 'GPU Load'}
                            </div>
                            <div className="text-sm font-mono text-[var(--text-primary)]">{w.metrics?.gpuUtilization || 0}%</div>
                          </div>
                          <div className="text-left sm:text-right">
                            <div className="text-[10px] text-[var(--text-secondary)] mb-1">Temp</div>
                            <div className="text-sm font-mono text-[var(--text-primary)]">{w.metrics?.temperature || 0}°C</div>
                          </div>
                          <div className="text-left sm:text-right">
                            <div className="text-[10px] text-[var(--text-secondary)] mb-1">
                              {w.workerId.includes('vps') ? 'RAM Used' : 'VRAM Used'}
                            </div>
                            <div className="text-sm font-mono text-[var(--text-primary)]">{((w.metrics?.memoryUsed || 0) / 1024).toFixed(1)}GB</div>
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Queue Backlog (30%) */}
            <div className="lg:col-span-4 flex flex-col bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-[var(--glass-border)] bg-[var(--bg-raised)] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Layers size={14} className="text-[var(--text-secondary)]" />
                  Queue Backlog
                </h2>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  {queueMetrics.total ?? 0} total
                </span>
              </div>

              <div className="p-0 flex-1">
                <ul className="divide-y divide-[var(--glass-border)]">
                  {/* `total` arrives inside backlog and is shown in the header, not as a queue. */}
                  {Object.entries(queueMetrics).filter(([name]) => name !== 'total').map(([queueName, count]) => (
                    <li key={queueName} className="flex justify-between items-center px-5 py-3.5 hover:bg-[var(--bg-raised)] transition-colors">
                      <span className="text-sm text-[var(--text-secondary)] capitalize">
                        {queueName.replace('Queue', ' process')}
                      </span>
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-md border ${
                        count > 0
                          ? 'bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] text-[var(--brand-light)] border-[color-mix(in_srgb,var(--brand-primary)_26%,transparent)]'
                          : 'bg-transparent text-[var(--text-muted)] border-transparent'
                      }`}>
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ROW 3: 70/30 Ledger & User Management */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Credit Ledger (70%) */}
            <div className="lg:col-span-8 flex flex-col bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-[var(--glass-border)] bg-[var(--bg-raised)]">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <CreditCard size={14} className="text-[var(--text-secondary)]" />
                  Credit Ledger
                </h2>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-[var(--glass-border)] text-[var(--text-secondary)]">
                      <th className="px-5 py-3 font-medium">Timestamp</th>
                      <th className="px-5 py-3 font-medium">User</th>
                      <th className="px-5 py-3 font-medium">Action</th>
                      <th className="px-5 py-3 font-medium">Amount</th>
                      <th className="px-5 py-3 font-medium w-full">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--glass-border)]">
                    {ledgerLogs.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-5 py-12 text-center text-[var(--text-muted)]">
                          No ledger transactions recorded.
                        </td>
                      </tr>
                    ) : (
                      ledgerLogs.map((log) => {
                        const isPositive = ['addition', 'refund'].includes(log.type);
                        const date = new Date(log.createdAt);

                        return (
                          <tr key={log._id} className="hover:bg-[var(--bg-raised)] transition-colors">
                            <td className="px-5 py-3 text-xs text-[var(--text-muted)]">
                              {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                            </td>
                            <td className="px-5 py-3">
                              <div className="text-[var(--text-primary)] text-xs">{log.userId?.name || 'System'}</div>
                              <div className="text-[10px] text-[var(--text-muted)]">{log.userId?.email || 'automated'}</div>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${
                                log.type === 'addition' ? 'bg-[color-mix(in_srgb,var(--accent-green)_12%,transparent)] text-[var(--accent-green)] border-[color-mix(in_srgb,var(--accent-green)_26%,transparent)]' :
                                log.type === 'refund' ? 'bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] text-[var(--brand-light)] border-[color-mix(in_srgb,var(--brand-primary)_26%,transparent)]' :
                                'bg-[var(--bg-overlay)] text-[var(--text-secondary)] border-[var(--glass-border)]'
                              }`}>
                                {log.type}
                              </span>
                            </td>
                            <td className={`px-5 py-3 text-xs font-mono ${isPositive ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]'}`}>
                              {isPositive ? '+' : '-'}${((log.credits || 0) / 100).toFixed(2)}
                            </td>
                            <td className="px-5 py-3 text-xs text-[var(--text-secondary)] truncate max-w-[200px]">
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

            {/* Promote User (30%) */}
            <div className="lg:col-span-4 flex flex-col bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-[var(--glass-border)] bg-[var(--bg-raised)]">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <UserPlus size={14} className="text-[var(--text-secondary)]" />
                  User Management
                </h2>
              </div>

              <div className="p-5 flex flex-col flex-1">
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                  Promote a registered user to an Administrator account to grant them dashboard access.
                </p>

                <form onSubmit={(e) => handlePromote(e)} className="space-y-4">
                  <div>
                    <label htmlFor="promote-email" className="form-label text-xs">User email address</label>
                    <div className="flex gap-2">
                      <input
                        id="promote-email"
                        type="email"
                        value={promoteEmail}
                        onChange={(e) => setPromoteEmail(e.target.value)}
                        placeholder="user@example.com"
                        required
                        className="form-input text-xs"
                      />
                      <AppButton type="submit" size="sm" disabled={promoting} className="shrink-0">
                        {promoting ? 'Saving…' : 'Promote'}
                      </AppButton>
                    </div>
                  </div>
                </form>

                {promoteMessage && (
                  <div className={`mt-3 text-xs p-2.5 rounded-[var(--radius-md)] border ${
                    promoteMessage.type === 'success'
                      ? 'bg-[color-mix(in_srgb,var(--accent-green)_12%,transparent)] border-[color-mix(in_srgb,var(--accent-green)_26%,transparent)] text-[var(--accent-green)]'
                      : 'bg-[color-mix(in_srgb,var(--accent-red)_12%,transparent)] border-[color-mix(in_srgb,var(--accent-red)_26%,transparent)] text-[var(--accent-red)]'
                  }`}>
                    {promoteMessage.text}
                  </div>
                )}

                {usersList.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-[var(--glass-border)]">
                    <div className="text-xs font-semibold text-[var(--text-primary)] mb-2 flex items-center justify-between">
                      <span>Registered Users</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">{usersList.length} total</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-[var(--glass-border)] -mx-2 px-2">
                      {usersList.map((u) => (
                        <div key={u._id} className="py-2 flex items-center justify-between text-xs gap-2">
                          <div className="truncate flex-1">
                            <div className="font-medium text-[var(--text-primary)] truncate">{u.name || 'User'}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{u.email}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase ${
                              u.role === 'admin'
                                ? 'bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] text-[var(--brand-light)] border-[color-mix(in_srgb,var(--brand-primary)_26%,transparent)]'
                                : 'bg-[var(--bg-overlay)] text-[var(--text-muted)] border-[var(--glass-border)]'
                            }`}>
                              {u.role}
                            </span>
                            {u.role !== 'admin' ? (
                              <button
                                type="button"
                                onClick={() => handlePromote(null, u.email)}
                                disabled={promoting}
                                className="text-[10px] text-[var(--brand-light)] hover:underline font-medium"
                              >
                                Make Admin
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDemote(u.email)}
                                disabled={promoting}
                                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:underline"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {activeTab === 'ai-connections' && (
        <div className="flex flex-col gap-6">

          <div className="flex justify-end mb-2">
            <AppButton variant="secondary" size="sm" icon={RefreshCw} onClick={handleTestAll}>
              Ping All Endpoints
            </AppButton>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['reasoning', 'video', 'image'].map((type) => {
              const meta = PROVIDER_META[type];
              const Icon = meta.icon;
              const provider = aiProviders.find(p => p.type === type) || {};
              const result = testResults[type];
              const testing = testingType === type;

              const isConfigured = provider.configured;
              const isConnected = result?.connected ?? null;

              return (
                <div key={type} className="flex flex-col bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden h-full transition-colors hover:border-[var(--border-default)]">

                  <div className="p-6 border-b border-[var(--glass-border)] bg-[var(--bg-raised)] flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--bg-overlay)] border border-[var(--glass-border)] flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-[var(--text-secondary)]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{meta.label}</h3>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{meta.subTitle}</p>
                    </div>
                  </div>

                  <div className="p-6 flex flex-col flex-1">
                    <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                      {meta.desc}
                    </p>

                    <div className="flex flex-col mt-auto">
                      <div className="border-b border-[var(--glass-border)] py-3">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase block mb-1">Active Model</span>
                        <span className="text-sm text-[var(--text-primary)] font-mono">{provider.model || <span className="text-[var(--text-muted)] italic">Inherited</span>}</span>
                      </div>

                      <div className="border-b border-[var(--glass-border)] py-3">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase block mb-1">Endpoint</span>
                        <span className="text-sm text-[var(--text-primary)] font-mono truncate block">
                          {shortEndpoint(provider.endpoint) || <span className="text-[var(--text-muted)] italic">Not configured</span>}
                        </span>
                      </div>

                      {/* Qwen answers on two endpoints; continuity depends on the edit one. */}
                      {provider.editEndpoint && (
                        <div className="border-b border-[var(--glass-border)] py-3">
                          <span className="text-[10px] text-[var(--text-muted)] uppercase block mb-1">Edit Endpoint</span>
                          <span className="text-sm text-[var(--text-primary)] font-mono truncate block">
                            {shortEndpoint(provider.editEndpoint)}
                          </span>
                        </div>
                      )}

                      {/* The reasoning role falls back across transports, in this order. */}
                      {provider.fallbacks?.length > 0 && (
                        <div className="border-b border-[var(--glass-border)] py-3">
                          <span className="text-[10px] text-[var(--text-muted)] uppercase block mb-1">Fallback Chain</span>
                          <span className="text-xs text-[var(--text-secondary)] font-mono block leading-relaxed">
                            {provider.fallbacks.join(' → ')}
                          </span>
                        </div>
                      )}

                      <div className="py-3">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase block mb-1">.env Keys</span>
                        <span className="text-xs text-[var(--text-muted)] font-mono block leading-relaxed break-all">
                          {meta.envKeys.join(', ')}
                        </span>
                      </div>

                      <div className="pt-4 border-t border-[var(--glass-border)] flex items-center justify-between">
                        <StatusIndicator connected={isConnected} configured={isConfigured} testing={testing} />
                        <AppButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestProvider(type)}
                          disabled={testing || !isConfigured}
                        >
                          Ping API
                        </AppButton>
                      </div>

                      {/* Worker readiness from /health. `throttled` means the GPU tier has no
                          capacity in the region, which looks identical to a hang otherwise. */}
                      {result?.note && (
                        <div className="mt-2 p-3 rounded-[var(--radius-md)] bg-[var(--bg-raised)] border border-[var(--glass-border)] text-xs text-[var(--text-secondary)] font-mono">
                          {result.note}
                        </div>
                      )}

                      {result?.error && (
                        <div className="mt-2 p-3 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--accent-red)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent-red)_26%,transparent)] text-xs text-[var(--accent-red)]">
                          {result.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </AppPage>
  );
}
