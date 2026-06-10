/**
 * Thrown by the engine when a PredictionInput is missing fields required for
 * the given runType. See docs/03_MODEL_SPEC.md §2. The scheduler decides
 * whether to fall back to the previous runType's prediction.
 */
export class MissingInputError extends Error {
  readonly missingFields: readonly string[];

  constructor(missingFields: readonly string[]) {
    super(`Missing required engine inputs: ${missingFields.join(', ')}`);
    this.name = 'MissingInputError';
    this.missingFields = missingFields;
    Object.setPrototypeOf(this, MissingInputError.prototype);
  }
}
