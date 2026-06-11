type StatPill = {
  value: string;
  label: string;
};

export function HeroStats({
  stats,
}: {
  stats: readonly StatPill[];
}): React.ReactElement {
  return (
    <dl className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-md border border-surface-strong bg-surface px-3 py-2 shadow-panel"
        >
          <dt className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            {s.label}
          </dt>
          <dd className="mt-1 font-mono text-base font-semibold tabular-nums text-text-primary">
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
