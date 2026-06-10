import type { Team } from '@/lib/types';

// Fictional teams across five confederations. Names and codes are invented
// and do not reference any real federation, association, or country.
// Real team identities arrive in Phase 7 via licensed adapters.
export const mockTeams: readonly Team[] = [
  { id: 'team-aur', code: 'AUR', name: 'Aurelia',   region: 'UEFA' },
  { id: 'team-bel', code: 'BEL', name: 'Bellatrix', region: 'CONMEBOL' },
  { id: 'team-cas', code: 'CAS', name: 'Castalia',  region: 'CONCACAF' },
  { id: 'team-del', code: 'DEL', name: 'Delphine',  region: 'AFC' },
  { id: 'team-eth', code: 'ETH', name: 'Etheria',   region: 'CAF' },
  { id: 'team-for', code: 'FOR', name: 'Forsythia', region: 'UEFA' },
  { id: 'team-gal', code: 'GAL', name: 'Galatea',   region: 'CONMEBOL' },
  { id: 'team-hel', code: 'HEL', name: 'Helios',    region: 'OFC' },
] as const;
