// =============================================================================
// tournament-sim.types.ts
// =============================================================================
// Phase 9D — UI contract for the offline tournament simulator.
//
// The Phase 9C/9B.2 simulator runs offline as a script
// (scripts/run-tournament-sim.ts --model=confed --write-ui-json) and writes
// this exact shape to src/data/tournament-sim.json. The UI imports the JSON
// at build time and renders it; it never runs the simulator in-request.
//
// This file is the single source of truth for the JSON's shape. Both the
// runner and the UI components reference these types.
// =============================================================================

import type { Confederation } from '@/lib/data/sources/internationalResults/teamMap';

/** All metadata about the run that produced this JSON. */
export type SimMeta = {
  /** ISO 8601. The moment the runner serialised this file. */
  readonly generatedAt: string;
  /** Always 'confed' for committed canonical runs. */
  readonly model: 'confed';
  /** Fixed inputs that make the run reproducible. */
  readonly seed: number;
  readonly n: number;
  /** Wall-clock duration of the run that wrote this file. */
  readonly runtimeMs: number;
  /** Number of pinned played matches at the time of this run. */
  readonly playedMatches: number;
  /** Phase 9E (Option 1a): fraction of simulation passes in which the
   *  third-place cluster constraints could not be perfectly satisfied and
   *  the deterministic fallback was used. */
  readonly thirdPlaceFallbackRate: number;
  /** Short human-readable note. */
  readonly note: string;
};

/** A team row that the title-odds view renders. */
export type TeamOddsRow = {
  readonly slug: string;
  readonly displayName: string;
  readonly code: string; // ISO 3166-1 alpha-3 / FIFA code
  readonly iso2: string; // ISO 3166-1 alpha-2 — used by flag-icons
  readonly confederation: Confederation;
  readonly group: string; // 'A' through 'L'
  readonly pR16: number;
  readonly pQF: number;
  readonly pSF: number;
  readonly pFinal: number;
  readonly pTitle: number;
};

/** A team's advancement probabilities inside its group. */
export type TeamGroupFinish = {
  readonly slug: string;
  readonly displayName: string;
  readonly code: string;
  readonly iso2: string;
  readonly confederation: Confederation;
  readonly p1st: number;
  readonly p2nd: number;
  readonly p3rd: number;
  readonly p4th: number;
};

/** A 4-team group standing. */
export type GroupStanding = {
  readonly group: string; // 'A' through 'L'
  readonly teams: ReadonlyArray<TeamGroupFinish>;
};

/** Reference to a slot in the bracket — what feeds a given R32 side.
 *  Phase 9E: third-place slots are FIFA cluster sets (e.g. ['A','B','C','D','F'])
 *  rather than fixed best-third ranks. */
export type BracketSlot =
  | { readonly kind: 'winner'; readonly group: string; readonly label: string }
  | { readonly kind: 'runnerUp'; readonly group: string; readonly label: string }
  | {
      readonly kind: 'thirdPlace';
      readonly cluster: ReadonlyArray<string>;
      readonly label: string;
    };

/** One R32 match — two slots, identified by match index. */
export type BracketR32Match = {
  readonly idx: number;
  readonly home: BracketSlot;
  readonly away: BracketSlot;
};

/** Knockout bracket structure. Pair arrays carry R32 match indices that feed
 *  each downstream slot, in the same shape as src/lib/tournament/bracket.ts. */
export type BracketStructure = {
  /** Honest framing the UI must surface. */
  readonly placeholderNote: string;
  readonly r32: ReadonlyArray<BracketR32Match>;
  readonly r16Pairs: ReadonlyArray<readonly [number, number]>;
  readonly qfPairs: ReadonlyArray<readonly [number, number]>;
  readonly sfPairs: ReadonlyArray<readonly [number, number]>;
  readonly finalPair: readonly [number, number];
};

/** The full UI contract. */
export type TournamentSimData = {
  readonly meta: SimMeta;
  /** All 48 teams sorted by pTitle descending. */
  readonly teams: ReadonlyArray<TeamOddsRow>;
  /** 12 groups, in alphabetical order; teams within each group sorted by p1st descending. */
  readonly groups: ReadonlyArray<GroupStanding>;
  readonly bracket: BracketStructure;
};
