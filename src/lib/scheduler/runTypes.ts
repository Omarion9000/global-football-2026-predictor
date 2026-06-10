// Convenience re-exports so scheduler consumers don't have to dig into
// @/lib/types directly. Canonical enum lives in @/lib/types/prediction.ts.

export {
  PREDICTION_RUN_TYPES,
  type PredictionRunType,
} from '@/lib/types';

export const PRE_MATCH_RUN_TYPES = [
  'T_MINUS_3H',
  'T_MINUS_1H',
  'T_ZERO',
] as const;

export const IN_PLAY_RUN_TYPES = ['HT'] as const;

export const POST_MATCH_RUN_TYPES = ['FT'] as const;
