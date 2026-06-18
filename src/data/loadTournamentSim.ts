import simJson from './tournament-sim.json';
import type { TournamentSimData } from './tournament-sim.types';

/** Typed accessor for the committed simulator JSON. Server components import
 *  this once at module scope; the JSON is bundled at build time. */
export function getTournamentSim(): TournamentSimData {
  return simJson as unknown as TournamentSimData;
}
