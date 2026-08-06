// OTA-1048 — PLAYER-FEEDBACK BATCH. Locks the three fixes from the owner's
// device session: over-level Guardians finally hit like it (damage bonus,
// fresh arrivals untouched), the travel/room row wraps instead of shrinking
// to unreadable, and the resonance hook is rarer and more varied.
import * as fs from 'fs';
import * as path from 'path';
import { monotoneTierDmgBonus, spawnGuardianForCapital, guardianOverLevel } from '../app/engine/coreGuardians';
import { HOOK_WEIGHTS } from '../app/engine/hooks';
import type { GuardianTier } from '../app/engine/coreGuardians';

const mkPlayer = (best: number, hpMax: number, cores: string[] = []) => ({
  name: 'P', raceId: 'r', factionId: 'f',
  stats: { strength: best, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
  hp: hpMax, hpMax, stamina: 10, staminaMax: 10,
  inventory: [], factionStanding: [], activeQuests: [],
  currentLocationId: 'asgardar', tc: 0,
  mainQuest: { phase: 'cores', coresRecovered: cores },
} as any);

describe('OTA-1048 — Guardians: over-level damage bonus', () => {
  it('a fresh arrival is untouched — the OTA-448 promise holds byte-identically', () => {
    const fresh = mkPlayer(10, 30);
    expect(guardianOverLevel(fresh, 1)).toBe(1);
    expect(monotoneTierDmgBonus(fresh, 1)).toBe(0);
    const g = spawnGuardianForCapital(fresh, 'asgardar')!;
    expect(g.damage).toBe('1d8+3'); // authored tier-1 die, no bonus
  });
  it("an over-leveled 2nd fight hits harder (the owner's case)", () => {
    const vet = mkPlayer(14, 137, ['samarran']); // power ≈ 27.7, tier 2
    const bonus = monotoneTierDmgBonus(vet, 2);
    expect(bonus).toBeGreaterThanOrEqual(3);
    const g = spawnGuardianForCapital(vet, 'asgardar')!;
    expect(g.damage).toMatch(/^1d8\+\d+$/);
    expect(parseInt(g.damage.split('+')[1]!, 10)).toBe(4 + bonus);
  });
  it('the bonus stages monotone across tiers at any fixed power', () => {
    for (const best of [10, 14, 18, 24]) {
      for (const hpMax of [40, 90, 140, 200]) {
        const p = mkPlayer(best, hpMax);
        let prev = -1;
        for (let t = 1 as GuardianTier; t <= 9; t++) {
          const b = monotoneTierDmgBonus(p, t as GuardianTier);
          expect(b).toBeGreaterThanOrEqual(prev);
          prev = b;
        }
      }
    }
  });
});

describe('OTA-1048 — resonance hook rarer + varied', () => {
  it('weight cut to 2 and the plant pool widened to 5 lines', () => {
    expect(HOOK_WEIGHTS.resonance).toBe(2);
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'hooks.ts'), 'utf8');
    const plantBlock = src.slice(src.indexOf('resonance: ['), src.indexOf('half_buried_spire: ['));
    expect((plantBlock.match(/\{ line:/g) ?? []).length).toBe(5);
    expect(plantBlock).not.toMatch(/from the south/);
  });
});

describe('OTA-1048 — SOURCE LOCKS (category: the row wraps, not shrinks)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'InputBox.tsx'), 'utf8');
  it('the travel/room row wraps with a readable minimum width + font floor', () => {
    expect(src).toMatch(/travelRow: \{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' \}/);
    expect(src).toMatch(/minWidth: 92/);
    expect(src).toMatch(/minimumFontScale=\{0.8\}/);
  });
});
