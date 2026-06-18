import { cookies } from 'next/headers';
import { GroupsView } from '@/components/views/GroupsView';
import { getTournamentSim } from '@/data/loadTournamentSim';
import { LANG_COOKIE, resolveLang, t } from '@/i18n/dictionary';
import { MODEL_VERSION } from '@/lib/model';

export async function generateMetadata() {
  const cookieStore = await cookies();
  const lang = resolveLang(cookieStore.get(LANG_COOKIE)?.value);
  return { title: t(lang).groups.docTitle };
}

export default function GroupsPage(): React.ReactElement {
  return <GroupsView sim={getTournamentSim()} modelVersion={MODEL_VERSION} />;
}
