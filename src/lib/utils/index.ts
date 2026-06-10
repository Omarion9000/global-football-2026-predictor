// Pure helpers for the engine and (selectively) the UI.
//
// Engine-only helpers (Phase 3): rng.ts, poisson.ts, factorial — these MUST NOT
// be imported by React components. See docs/06_CLAUDE_CODE_RULES.md §0.
//
// UI-safe helpers may be added here later (date/locale formatting, etc.).
export { smoke } from './smoke';
