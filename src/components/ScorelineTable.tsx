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
    <table className="w-full overflow-hidden rounded-md border border-surface-strong text-sm">
      <thead>
        <tr className="border-b border-surface-strong bg-surface-strong font-mono text-[10px] uppercase tracking-widest text-text-secondary">
          <th className="w-12 px-3 py-2 text-left">Rank</th>
          <th className="px-3 py-2 text-left text-text-primary">
            Score ({teamACode}–{teamBCode})
          </th>
          <th className="px-3 py-2 text-right text-text-primary">Probability</th>
        </tr>
      </thead>
      <tbody>
        {scorelines.map((s, i) => (
          <tr
            key={`${s.teamAGoals}-${s.teamBGoals}`}
            className={`transition-colors hover:bg-surface-muted ${
              i % 2 === 0 ? 'bg-surface' : 'bg-surface-muted/60'
            }`}
          >
            <td className="px-3 py-2 font-mono tabular-nums text-text-secondary">
              {String(i + 1).padStart(2, '0')}
            </td>
            <td className="px-3 py-2 font-mono tabular-nums font-semibold text-text-primary">
              <span className="text-accent-red">{s.teamAGoals}</span>
              <span className="px-1 text-text-secondary">–</span>
              <span className="text-accent-green">{s.teamBGoals}</span>
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
