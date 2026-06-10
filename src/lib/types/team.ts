export type TeamId = string;

export type Region =
  | 'AFC'
  | 'CAF'
  | 'CONCACAF'
  | 'CONMEBOL'
  | 'OFC'
  | 'UEFA';

export type Team = {
  id: TeamId;
  /** Short 3-letter code used for display and joins. */
  code: string;
  /** Display name. No federation crests or photos are stored here. */
  name: string;
  region: Region;
};
