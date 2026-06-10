export default function HomePage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-text-secondary">
        Phase 1 · scaffolding
      </p>
      <h1 className="mt-4 text-3xl font-semibold text-text-primary">
        World Cup 2026 Predictor
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-text-secondary">
        Probability-based match predictions powered by statistical simulations.
      </p>
      <p className="mt-8 max-w-2xl text-sm text-text-secondary">
        Independent analytical project. Not affiliated with FIFA, any
        confederation, any federation, or any broadcaster. Predictions are
        probabilistic estimates produced by a statistical model, not guarantees
        about real-world outcomes.
      </p>
    </main>
  );
}
