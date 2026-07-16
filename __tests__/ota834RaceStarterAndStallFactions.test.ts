// OTA-834 — audit fixes (races/factions/titles wiring sweep):
//   (1) RACE_PRIMARY was keyed by plural/faction-shaped ids (tartarian_giants,
//       architectural_sentinels, …) but looked up by the SINGULAR race.id, so 6 of 7
//       races silently got the 'Rusted Blade' fallback instead of their starter arm
//       (the Giant lost Mud-fist Wraps, the Sentinel lost its Tartarian Spear). Now
//       re-keyed to the real singular ids.
//   (2) Four Hidden-Market stall reps carried RACE ids as their `faction`
//       (unknowing_masses / aetherborn / mud_golems / architectural_sentinels) that
//       aren't in factions.json, so rapport/CHA-discount could never fire on those
//       rotation days. Remapped to canonical factions.

import { createCharacter, getFactions } from '../app/engine/character';
import { buildStallVendor } from '../app/engine/vendors';

describe('OTA-834 (1) — each race starts with its intended primary weapon', () => {
  const primaryFor = (raceId: string) =>
    createCharacter({ name: 'T', raceId, factionId: 'reclaimers_guild' }).equipped?.main;

  it('the Tartarian Giant starts with Mud-fist Wraps (was Rusted Blade)', () => {
    expect(primaryFor('tartarian_giant')).toBe('Mud-fist Wraps');
  });
  it('the Architectural Sentinel starts with a Tartarian Spear (was Rusted Blade)', () => {
    expect(primaryFor('architectural_sentinel')).toBe('Tartarian Spear');
  });
  it('the Aetherborn keeps its Pyric Wand', () => {
    expect(primaryFor('aetherborn')).toBe('Pyric Wand');
  });
  it('every race resolves a real primary (none crash / none is undefined)', () => {
    for (const r of ['tartarian_giant', 'mud_dweller', 'reclaimer', 'architectural_sentinel', 'mud_golem', 'unknowing_mass', 'aetherborn']) {
      expect(typeof primaryFor(r)).toBe('string');
      expect(primaryFor(r)!.length).toBeGreaterThan(0);
    }
  });
});

describe('OTA-834 (2) — every stall vendor faction is a canonical faction (or null)', () => {
  it('no Hidden-Market stall rep carries a non-existent (race) faction id', () => {
    const valid = new Set(getFactions().map((f) => f.id));
    // buildStallVendor rotates through the roster by a name-seeded index; drive it
    // across many stall names + categories so every roster entry is exercised, and
    // assert each resolved vendor's faction is canonical or absent.
    const cats = ['weapons', 'armor', 'food', 'materials'] as const;
    for (const cat of cats) {
      for (let i = 0; i < 40; i++) {
        const v = buildStallVendor(cat, `Stall ${cat} ${i}`);
        const fid = (v as { faction?: string | null }).faction ?? null;
        if (fid !== null) {
          expect(valid.has(fid)).toBe(true);
        }
      }
    }
  });
});
