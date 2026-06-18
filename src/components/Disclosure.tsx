'use client';

import { useLang } from './LanguageProvider';

// The independence disclaimer per docs/04 §3.6. This is the ONLY component in
// the UI tree allowed to contain the word "FIFA" in body text, and only inside
// the non-affiliation sentence. The dictionary intentionally does NOT carry the
// translated text; both languages are inline here so the vocab scan keeps a
// single canonical FIFA location. See `src/components/__tests__/ui-vocabulary.test.ts`.

export function Disclosure(): React.ReactElement {
  const { lang } = useLang();
  const text =
    lang === 'es'
      ? 'Proyecto analítico independiente. Sin afiliación con la FIFA, ninguna federación, ningún organizador de torneo, ninguna emisora ni ningún patrocinador. Las predicciones son estimaciones probabilísticas, no garantías.'
      : 'Independent analytical project. Not affiliated with FIFA, any federation, tournament organizer, broadcaster, or sponsor. Predictions are probabilistic estimates, not guarantees.';
  return <p className="text-xs leading-relaxed text-text-secondary">{text}</p>;
}
