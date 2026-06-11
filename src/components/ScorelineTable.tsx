import type { ScorelineProbability } from '@/lib/types';

type Props = {
  scorelines: readonly ScorelineProbability[];
  teamACode: string;
  teamBCode: string;
};

export function ScorelineTable({
  scorelines,
  teamACode,
  teamBCode,
}: Props): React.ReactElement {
  if (scorelines.length === 0) {
    return (
      <p className="text-sm text-text-secondary">No scoreline data available.</p>
    );
  }
  return (
    <table className="w-full overflow-hidden rounded-md border border-border text-sm">
      <thead className="bg-surface-strong">
        <tr className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
          <th className="px-3 py-2 text-left">Rank</th>
          <th className="px-3 py-2 text-left">
            Score ({teamACode}–{teamBCode})
          </th>
          <th className="px-3 py-2 text-right">Probability</th>
        </tr>
      </thead>
      <tbody>
        {scorelines.map((s, i) => (
          <tr
            key={`${s.teamAGoals}-${s.teamBGoals}`}
            className={i % 2 === 0 ? 'bg-surface' : 'bg-surface-muted'}
          >
            <td className="px-3 py-2 font-mono tabular-nums text-text-secondary">
              {i + 1}
            </td>
            <td className="px-3 py-2 font-mono tabular-nums font-semibold text-text-primary">
              {s.teamAGoals}–{s.teamBGoals}
            </td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
              {(s.probability * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
