import { describe, expect, it } from 'vitest';
import { mockTeamStats } from '@/mock';
import type { TeamStats } from '@/lib/types';
import { calculateTeamStrength } from '../teamStrength';

describe('calculateTeamStrength', () => {
  const strong: TeamStats = mockTeamStats['team-aur'];
  const weak: TeamStats = mockTeamStats['team-hel'];

  it('returns a composite in [0, 1]', () => {
    const s = calculateTeamStrength(strong);
    expect(s.composite).toBeGreaterThanOrEqual(0);
    expect(s.composite).toBeLessThanOrEqual(1);
  });

  it('higher rating + form produces a higher composite', () => {
    const a = calculateTeamStrength(strong);
    const b = calculateTeamStrength(weak);
    expect(a.composite).toBeGreaterThan(b.composite);
  });

  it('worse defence (more goals against) lowers the defence component', () => {
    const a = calculateTeamStrength(strong); // 0.8 GA/g
    const b = calculateTeamStrength(weak);   // 1.9 GA/g
    expect(a.defence).toBeGreaterThan(b.defence);
  });

  it('each breakdown component is in [0, 1]', () => {
    const s = calculateTeamStrength(strong);
    for (const k of ['rating', 'form', 'attack', 'defence', 'availability', 'composite'] as const) {
      expect(s[k]).toBeGreaterThanOrEqual(0);
      expect(s[k]).toBeLessThanOrEqual(1);
    }
  });

  it('availabilityScore is clamped into [0, 1]', () => {
    const high = calculateTeamStrength(strong, 5);
    const low = calculateTeamStrength(strong, -1);
    expect(high.availability).toBe(1);
    expect(low.availability).toBe(0);
  });
});
