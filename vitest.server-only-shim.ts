// Empty shim for the `server-only` package, aliased from vitest.config.ts.
// The real package throws when imported outside a React Server Component
// context. Vitest runs in plain Node, so we resolve it to this no-op.
// Production builds still consume the real `server-only` module, which means
// the build-time enforcement remains intact.
export {};
