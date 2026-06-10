// V2 placeholder. Player data is not used by the V1 engine and is gated behind
// V2.1 ("data cards") per docs/05_BUILD_ROADMAP.md. This type intentionally
// stores no photographs, federation imagery, or trade-dress fields.

export type PlayerId = string;

export type PlayerPlaceholder = {
  id: PlayerId;
  /** Display string only. Initials or last name; never a photograph. */
  displayName: string;
};
