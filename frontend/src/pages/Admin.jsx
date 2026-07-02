import React, { useState, useEffect } from 'react';
import { AppPage } from '../components/ui/AppPage';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { AppCard } from '../components/ui/AppCard';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/ui/EmptyState';
import { ShieldAlert, Server, Activity } from 'lucide-react';

export default function Admin() {
  const [workers, setWorkers] = useState([]);
  const [ledgerLogs, setLedgerLogs] = useState([]);
  const [queueMetrics, setQueueMetrics] = useState({
    scriptQueue: 0, audioQueue: 0, promptQueue: 0, imageQueue: 0,
    videoQueue: 0, renderingQueue: 0, uploadQueue: 0, notificationQueue: 0
  });
  const [stats, setStats] = useState({ activeUsers: 0, revenue: '$0', totalJobs: 0, failedJobs: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Promotion state
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promoteMessage, setPromoteMessage] = useState(null);

  const fetchRegistry = async (isFirstLoad = false) => {
    if (isFirstLoad) setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const [resWorkers, resQueues, resLedger, resStats] = await Promise.all([
        fetch('/api/system/health', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/system/metrics', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/system/ledger', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/system/stats', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (!resWorkers.ok || !resQueues.ok || !resLedger.ok || !resStats.ok) {
        throw new Error('Failed to load system metrics. Check admin permissions.');
      }

      const dataWorkers = await resWorkers.json();
      const dataQueues = await resQueues.json();
      const dataLedger = await resLedger.json();
      const dataStats = await resStats.json();

      if (dataWorkers.workers) setWorkers(dataWorkers.workers);
      if (dataQueues.backlog) setQueueMetrics(dataQueues.backlog);
      if (dataLedger.logs) setLedgerLogs(dataLedger.logs);

      setStats({
        activeUsers: dataStats.activeUsers || 0,
        revenue: dataStats.revenue || '$0',
        totalJobs: dataStats.totalJobs || 0,
        failedJobs: dataStats.failedJobs || 0
      });
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistry(true);
    const interval = setInterval(() => fetchRegistry(false), 8000);
    return () => clearInterval(interval);
  }, []);

  const handlePromote = async (e) => {
    e.preventDefault();
    setPromoting(true);
    setPromoteMessage(null);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/system/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: promoteEmail })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to promote user');

      setPromoteMessage({ type: 'success', text: data.message });
      setPromoteEmail('');
    } catch (err) {
      setPromoteMessage({ type: 'error', text: err.message });
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return (
      <AppPage className="flex items-center justify-center min-h-[80vh]">
        <div className="spinner w-12 h-12 border-4 border-[var(--border-default)] border-t-[var(--brand-primary)] rounded-full animate-spin"></div>
      </AppPage>
    );
  }

  if (error) {
    return (
      <AppPage className="flex items-center justify-center min-h-[80vh]">
        <EmptyState
          icon={ShieldAlert}
          title="Access Denied"
          description={error}
          className="border-red-500/20 bg-red-500/5 text-[var(--accent-red)]"
        />
      </AppPage>
    );
  }

  return (
    <AppPage>
      <PageHeader
        title="Admin Operations Dashboard"
        description="Real-time status of distributed GPU clusters, job queues backlog, and system analytics."
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard label="Active SaaS Users" value={stats.activeUsers} subtext="▲ Real-time registered users" subtextColor="var(--accent-green)" />
        <StatCard label="MRR Revenue" value={stats.revenue} subtext="▲ Active subscription plans" subtextColor="var(--accent-green)" />
        <StatCard label="Total Video Pipelines Run" value={stats.totalJobs} subtext="Cumulative SaaS processes" />
        <StatCard label="Failed Jobs (24h)" value={stats.failedJobs} subtext="Error rate in past 24h" subtextColor="var(--accent-red)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        {/* GPU Workers Fleet List */}
        <div className="lg:col-span-8 w-full">
          <h2 className="section-title mb-8">Registered GPU Cluster Fleet ({workers.length})</h2>

          {workers.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No active workers"
              description="No active GPU workers currently checked into the registry."
            />
          ) : (
            <div className="space-y-4">
              {workers.map((w, idx) => (
                <AppCard key={idx} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${w.status === 'busy' ? 'bg-[var(--accent-gold)]' : 'bg-[var(--accent-green)]'}`} />

                  <div className="flex justify-between items-start pl-3">
                    <div>
                      <div className="font-semibold text-lg">{w.workerId}</div>
                      <div className="text-secondary mt-1">{w.gpuModel} · {(w.vramTotal / 1024).toFixed(0)}GB VRAM</div>
                    </div>
                    <span className={`badge ${w.status === 'busy' ? 'badge-preparing' : 'badge-completed'}`}>
                      <div className="badge-dot"></div>
                      {w.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-6 pt-4 border-t border-[var(--border-subtle)] pl-3 text-left">
                    <div>
                      <div className="label">GPU Load</div>
                      <div className="font-semibold mt-1">{w.metrics?.gpuUtilization || 0}%</div>
                    </div>
                    <div>
                      <div className="label">Temp</div>
                      <div className="font-semibold mt-1">{w.metrics?.temperature || 0}°C</div>
                    </div>
                    <div>
                      <div className="label">VRAM Used</div>
                      <div className="font-semibold mt-1">{((w.metrics?.memoryUsed || 0) / 1024).toFixed(1)} GB</div>
                    </div>
                    <div>
                      <div className="label">System RAM</div>
                      <div className="font-semibold mt-1">{((w.metrics?.freeSystemMemory || 0) / 1024).toFixed(1)} GB</div>
                    </div>
                  </div>
                </AppCard>
              ))}
            </div>
          )}
        </div>

        {/* BullMQ Backlog */}
        <div className="lg:col-span-4 w-full">
          <h2 className="section-title mb-8">Queue Backlog</h2>

          <AppCard className="flex flex-col gap-0 !p-0 overflow-hidden">
            {Object.entries(queueMetrics).map(([queueName, count]) => (
              <div key={queueName} className="flex justify-between items-center p-4 border-b border-[var(--border-subtle)] last:border-0">
                <span className="text-secondary font-medium capitalize">{queueName.replace('Queue', ' step')}</span>
                <span className={`px-2 py-1 rounded-[var(--radius-sm)] text-xs font-bold ${count > 0 ? 'bg-purple-500/15 text-[var(--brand-light)]' : 'bg-white/5 text-[var(--text-muted)]'}`}>
                  {count} jobs
                </span>
              </div>
            ))}
          </AppCard>

          {/* Add New Admin Section */}
          <AppCard className="mt-12">
            <h3 className="card-title mb-4">Add Admin User</h3>
            <form onSubmit={handlePromote} className="space-y-4">
              <AppInput
                type="email"
                value={promoteEmail}
                onChange={(e) => setPromoteEmail(e.target.value)}
                placeholder="User's email to promote"
                required
              />
              <AppButton type="submit" disabled={promoting} className="w-full">
                {promoting ? 'Promoting...' : 'Promote to Admin'}
              </AppButton>
            </form>
            {promoteMessage && (
              <div className={`mt-3 text-sm ${promoteMessage.type === 'success' ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                {promoteMessage.text}
              </div>
            )}
          </AppCard>
        </div>
      </div>

      {/* Credit Ledger Audit History */}
      <div className="mt-12">
        <h2 className="section-title mb-8">Credit Ledger Audit History</h2>
        <AppCard noPadding className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-white/5">
                <th className="p-4 label">Timestamp</th>
                <th className="p-4 label">User</th>
                <th className="p-4 label">Type</th>
                <th className="p-4 label">Change</th>
                <th className="p-4 label">Reason</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {ledgerLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-[var(--text-muted)]">
                    No credit transactions recorded in the ledger yet.
                  </td>
                </tr>
              ) : (
                ledgerLogs.map((log) => {
                  const isPositive = ['addition', 'refund'].includes(log.type);
                  const formattedDate = new Date(log.createdAt).toLocaleString();
                  return (
                    <tr key={log._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="p-4 mono text-[var(--text-secondary)]">{formattedDate}</td>
                      <td className="p-4">
                        <div className="font-medium text-[var(--text-primary)]">{log.userId?.name || 'System'}</div>
                        <div className="caption">{log.userId?.email || 'automated@videofactory.com'}</div>
                      </td>
                      <td className="p-4">
                        <span className={`badge ${log.type === 'addition' ? 'badge-completed' :
                            log.type === 'refund' ? 'badge-analyzing' :
                              log.type === 'expiration' ? 'badge-queued' :
                                'badge-failed'
                          }`}>
                          {log.type}
                        </span>
                      </td>
                      <td className={`p-4 font-bold ${isPositive ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                        {isPositive ? '+' : '-'}{log.credits}
                      </td>
                      <td className="p-4 text-[var(--text-secondary)] max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap" title={log.reason}>
                        {log.reason}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </AppCard>
      </div>
    </AppPage>
  );
}
