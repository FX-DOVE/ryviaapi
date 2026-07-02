import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { AppCard } from './ui/AppCard';

function getMeterColor(val) {
  if (val < 60) return 'var(--accent-green)';
  if (val < 80) return 'var(--accent-gold)';
  return 'var(--accent-red)';
}

export default function HealthWidget() {
  const health = useAppStore((s) => s.health);

  if (!health) {
    return (
      <AppCard className="flex items-center justify-center p-6 min-h-[200px]">
        <div className="spinner w-6 h-6 border-2 border-[var(--border-default)] border-t-[var(--brand-primary)] rounded-full animate-spin"></div>
      </AppCard>
    );
  }

  const { cpu, mem, disk, queue } = health;

  return (
    <AppCard className="space-y-6">

      {/* CPU */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 label">
            <Cpu size={16} /> CPU
          </span>
          <span className="mono">{cpu?.usagePercent ?? 0}%</span>
        </div>
        <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${cpu?.usagePercent ?? 0}%`, backgroundColor: getMeterColor(cpu?.usagePercent ?? 0) }} />
        </div>
      </div>

      {/* RAM */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 label">
            <MemoryStick size={16} /> RAM
          </span>
          <span className="mono">{mem?.usedGb ?? 0} / {mem?.totalGb ?? 0} GB</span>
        </div>
        <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${mem?.usagePercent ?? 0}%`, backgroundColor: getMeterColor(mem?.usagePercent ?? 0) }} />
        </div>
      </div>

      {/* Disk */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 label">
            <HardDrive size={16} /> Disk
          </span>
          <span className="mono">{disk?.usedGb ?? 0} / {disk?.totalGb ?? 0} GB</span>
        </div>
        <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${disk?.usagePercent ?? 0}%`, backgroundColor: getMeterColor(disk?.usagePercent ?? 0) }} />
        </div>
      </div>

      {/* Queue */}
      {queue && (
        <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-secondary">Queue waiting</span>
            <span className="mono">{queue.waiting}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-secondary">Active jobs</span>
            <span className="mono">{queue.active}</span>
          </div>
        </div>
      )}
    </AppCard>
  );
}
