'use client';
import { useEffect, useState } from 'react';

function formatDelta(ms: number): string {
  if (ms <= 0) return 'In play';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function emphasis(ms: number): { wrap: string; value: string } {
  if (ms <= 10 * 60 * 1000) {
    return {
      wrap: 'text-right',
      value: 'text-base font-semibold text-accent-gold',
    };
  }
  if (ms <= 60 * 60 * 1000) {
    return {
      wrap: 'text-right',
      value: 'text-sm font-semibold text-text-primary',
    };
  }
  return { wrap: 'text-right', value: 'text-sm text-text-primary' };
}

export function Countdown({
  kickoffUtc,
}: {
  kickoffUtc: string;
}): React.ReactElement {
  const target = Date.parse(kickoffUtc);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = target - now;
  const label = remaining > 0 ? 'Kicks off in' : 'Started';
  const styles = emphasis(remaining);

  return (
    <div className={styles.wrap} aria-live="polite">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        {label}
      </div>
      <div className={`font-mono tabular-nums ${styles.value}`}>
        {formatDelta(remaining)}
      </div>
    </div>
  );
}
