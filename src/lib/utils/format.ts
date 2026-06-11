// UI-safe presentation helpers. Components may import these. The functions
// here are deterministic and UTC-based — they produce the same output on
// server and client, so SSR + hydration agree without timezone surprises.
//
// (Per CLAUDE.md "Tooling versions" + docs/06 §0, the UI may import safe
//  helpers from src/lib/utils but never the engine-math modules.)

const DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** "Sat, Jun 13 · 18:30 GMT" */
export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dow = DAY_OF_WEEK[d.getUTCDay()];
  const mon = MONTH[d.getUTCMonth()];
  return `${dow}, ${mon} ${d.getUTCDate()} · ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} GMT`;
}

/** "Sat, Jun 13" — for daily section headers on the home grid. */
export function formatDayHeader(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${DAY_OF_WEEK[d.getUTCDay()]}, ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Jun 11, 17:00 GMT" — used on prediction-timeline chips and run metadata. */
export function formatExecutedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} GMT`;
}
