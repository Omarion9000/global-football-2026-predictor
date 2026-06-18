import { cookies } from 'next/headers';
import { HomeView } from '@/components/views/HomeView';
import { getTournamentSim } from '@/data/loadTournamentSim';
import { LANG_COOKIE, resolveLang, t } from '@/i18n/dictionary';
import { MODEL_VERSION } from '@/lib/model';

export async function generateMetadata() {
  const cookieStore = await cookies();
  const lang = resolveLang(cookieStore.get(LANG_COOKIE)?.value);
  return { title: t(lang).home.docTitle };
}

export default function HomePage(): React.ReactElement {
  return <HomeView sim={getTournamentSim()} modelVersion={MODEL_VERSION} />;
}
