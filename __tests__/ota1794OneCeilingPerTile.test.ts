// ⚠⚠⚠ OTA-1794 — ONE CEILING PER TILE.
//
// The rarity ceiling a tile's danger allows was written three times in
// encounter.ts: inline in pickEnemyForLocation, inline in
// pickEnemyForLocationGuaranteed, and as rarityCapForDanger for the pack roll —
// under a comment calling it "shared by the pickers" when nothing shared it.
// Two seeded mutations proved that no suite read any copy: opening both inline
// copies to Legendary at danger 1 passed 514 tests (audit M9b), and opening the
// pack copy the same way passed the full fast surface, 1274 suites. The owner
// ruled: adjudicate, then repair. This suite is the protection that was
// missing. It samples EVERY reader at EVERY danger, so a mutation in any one of
// them — or a fourth copy that drifts — fails where it stands.

import {
  rarityCapForDanger, pickEnemyForLocation, pickEnemyForLocationGuaranteed, rollExtraPackMembers,
  getLocationById,
} from '../app/engine/encounter';
import type { Enemy, Location, Rarity } from '../app/engine/types';

const RANK: Record<Rarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };
const DANGERS = [0, 1, 2, 3, 4, 5];
// The ladder as the owner has it, stated here INDEPENDENTLY of the function so
// that a reader and the function cannot drift together and still pass.
const EXPECTED: Rarity[] = ['Common', 'Common', 'Uncommon', 'Rare', 'Legendary', 'Legendary'];
const DRAWS = 300;

// A real tile, re-rated. The pickers read only `danger` from it.
const tileAt = (danger: number): Location => ({ ...getLocationById('nimari'), danger });

/** Highest rarity seen across `n` non-null draws of `draw`. */
function maxSeen(n: number, draw: () => Enemy | null | undefined): Rarity {
  let best: Rarity = 'Common';
  let seen = 0;
  for (let guard = 0; guard < n * 6 && seen < n; guard++) {
    const e = draw();
    if (!e) continue;
    seen++;
    if (RANK[e.rarity] > RANK[best]) best = e.rarity;
  }
  expect(seen).toBe(n);
  return best;
}

describe('OTA-1794 — the ladder, stated once', () => {
  it('⚠⚠⚠ THE RULE: 0–1 Common, 2 Uncommon, 3 Rare, 4+ Legendary', () => {
    for (const d of DANGERS) expect({ d, cap: rarityCapForDanger(d) }).toEqual({ d, cap: EXPECTED[d] });
  });

  it('is monotonic — more danger never lowers the ceiling', () => {
    for (let d = 0; d < 9; d++) {
      expect(RANK[rarityCapForDanger(d + 1)]).toBeGreaterThanOrEqual(RANK[rarityCapForDanger(d)]);
    }
    expect(rarityCapForDanger(-1)).toBe('Common');
  });
});

describe('OTA-1794 — every reader obeys the one ceiling', () => {
  it('⚠⚠⚠ THE SCENE-ARRIVAL PICKER never exceeds the ceiling, and reaches it', () => {
    // M9b's mutation (danger 1 → Legendary) fails here on the first clause.
    for (const d of DANGERS) {
      const cap = EXPECTED[d]!;
      const top = maxSeen(DRAWS, () => pickEnemyForLocation(tileAt(d)));
      expect({ d, top }).toEqual({ d, top: cap });
    }
  });

  it('⚠⚠⚠ THE REST-AMBUSH PICKER, with no player cap, never exceeds the ceiling, and reaches it', () => {
    for (const d of DANGERS) {
      const cap = EXPECTED[d]!;
      const top = maxSeen(DRAWS, () => pickEnemyForLocationGuaranteed(tileAt(d)));
      expect({ d, top }).toEqual({ d, top: cap });
    }
  });

  it('⚠⚠ and with a player cap, the LOWER of the two ceilings holds (OTA-243 stays)', () => {
    // A starter (hpMax 40) on danger-5 ground: Common only, whatever the tile says.
    const top = maxSeen(DRAWS, () => pickEnemyForLocationGuaranteed(tileAt(5), 40));
    expect(top).toBe('Common');
  });

  it('⚠⚠⚠ THE PACK ROLL never exceeds the ceiling, and reaches it', () => {
    // Today's seeded mutation (pack path, danger 1 → Legendary) fails here.
    // rng forced low so the pack chance always passes and both extras roll.
    const seed: Enemy = { ...(pickEnemyForLocationGuaranteed(tileAt(0)) as Enemy), boss: false };
    for (const d of DANGERS) {
      const cap = EXPECTED[d]!;
      let best: Rarity = 'Common';
      let bodies = 0;
      for (let i = 0; i < DRAWS; i++) {
        for (const e of rollExtraPackMembers(tileAt(d), [seed], { rng: () => 0.01 })) {
          bodies++;
          if (RANK[e.rarity] > RANK[best]) best = e.rarity;
        }
      }
      expect(bodies).toBeGreaterThan(0);
      expect({ d, top: best }).toEqual({ d, top: cap });
    }
  });
});
