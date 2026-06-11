// The independence disclaimer per docs/04 §3.6. This is the ONLY component in
// the UI tree allowed to contain the word "FIFA" in body text, and only inside
// the non-affiliation sentence. See ui-vocabulary.test.ts.

export function Disclosure(): React.ReactElement {
  return (
    <p className="text-xs leading-relaxed text-text-secondary">
      Independent analytical project. Not affiliated with FIFA, any federation,
      tournament organizer, broadcaster, or sponsor. Predictions are
      probabilistic estimates, not guarantees.
    </p>
  );
}
