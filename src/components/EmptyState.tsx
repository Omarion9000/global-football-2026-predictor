type EmptyStateProps = {
  title: string;
  hint?: string;
};

export function EmptyState({
  title,
  hint,
}: EmptyStateProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
      <p className="text-base font-semibold text-text-primary">{title}</p>
      {hint != null ? (
        <p className="mt-2 text-sm text-text-secondary">{hint}</p>
      ) : null}
    </div>
  );
}
