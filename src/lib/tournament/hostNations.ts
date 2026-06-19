// =============================================================================
// hostNations.ts — Phase 9F
// =============================================================================
// The three 2026 tournament host nations. Names match the canonical entries
// in `data/tournament/groups.json` verbatim — the runner validates this
// implicitly because every fixture passes through `resolveNation`, so any
// drift surfaces immediately as a hard error rather than silently failing.
//
// Phase 9F applies the model's fitted home-advantage term to host nations in
// their GROUP-STAGE matches only. Every host nation plays all three of its
// group-stage matches on home soil in 2026 (Mexico in Mexico, Canada in
// Canada, USA in USA). Knockout matches remain modelled as neutral for every
// team — knockout venues span all three countries and depend on bracket
// path, which the simulator does not (yet) resolve.
//
// This is simulator wiring; the Dixon-Coles math in
// `src/lib/backtest/national/{dixonColes,dixonColesConfed}.ts` is byte-
// identical to Phase 9B/9B.2 — the engine wrappers in matchModel.ts /
// matchModelConfed.ts simply stop forcing `neutral=true` when the simulator
// asks for a host's home game.
// =============================================================================

export const HOST_NATIONS: ReadonlySet<string> = new Set([
  'Mexico',
  'Canada',
  'United States',
]);

/** True iff the given team is one of the 2026 host nations. Uses the
 *  canonical groups.json display name; aliases are out of scope. */
export function isHostNation(team: string): boolean {
  return HOST_NATIONS.has(team);
}
