import { cookies } from 'next/headers';
import { BracketView } from '@/components/views/BracketView';
import { getTournamentSim } from '@/data/loadTournamentSim';
import { LANG_COOKIE, resolveLang, t } from '@/i18n/dictionary';
import { MODEL_VERSION } from '@/lib/model';

export async function generateMetadata() {
  const cookieStore = await cookies();
  const lang = resolveLang(cookieStore.get(LANG_COOKIE)?.value);
  return { title: t(lang).bracket.docTitle };
}

export default function BracketPage(): React.ReactElement {
  return <BracketView sim={getTournamentSim()} modelVersion={MODEL_VERSION} />;
}
