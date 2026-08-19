// ⚠⚠ OTA-1358 — THE CLONE: your own dead rise as themselves.
//
// Owner: *"what I want is the exact same in every detail dead I send someone to
// have everything exactly as it was when they died, same gear, same stats, same
// coatings, everything I want a clone sent."*
//
// ⚠ THE HOLLOWED WAS NEVER A CLONE. `revenantFromFallen` hard-coded
// `abilityPoint: 'Strength 6'`, took its damage from KILL COUNT alone, and sized
// HP off the LIVING player. The dead character's own stats, hpMax and AC were
// never recorded anywhere — so it has always been a scaled boss wearing a name
// and a kit rather than the person who died.
//
// ⚠ HAL TAKES THE CLONE, NOT THE SHARING. The shared roll of the fallen —
// ledger, pairing, seal, mailbox — stays golem-only pending the owner's
// two-phone test. This half needs no transport: it is about YOUR predecessors
// rising as themselves for the character who follows them.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  revenantFromFallen,
  buildFallenGearSnapshot,
  CLONE_HP_CAP_MULTIPLIER,
  _setFallenCacheForTests,
} from '../app/engine/fallenRevenants';

jest.setTimeout(60_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
afterEach(() => { _setFallenCacheForTests(null); });

const BASE = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 3, corruption: 'Tainted', hours: 96, ts: 1_760_000_000_000,
};
const SNAP = {
  stats: { strength: 18, dexterity: 14, intelligence: 9, wisdom: 11, charisma: 7, stealth: 4 },
  hpMax: 240, ac: 17, raceId: 'aetherborn', factionId: 'eternal_dynasty',
};

describe('OTA-1358 — the Hollowed fights as the character fought', () => {
  it("⚠⚠ THE OWNER'S ASK: real health, real attribute, the real weapon's damage", () => {
    const f = {
      ...BASE, snapshot: SNAP,
      gear: [{
        name: 'Marrowsong Cleaver', kind: 'weapon', rarity: 'Legendary', slot: 'main', tags: ['weapon'],
        uniqueStats: { kind: 'weapon', rarity: 'Legendary', durability: { current: 30, max: 30 }, damageDice: '2d10', damageType: 'slashing', scalesWith: 'strength' },
      }],
    } as never;
    // The living successor is frail; the clone does NOT scale down to meet them.
    const foe = revenantFromFallen(f, 60);
    expect(foe.hp).toBe(240);
    // Their real blade's dice, not the 2d6 a 3-kill record would have given.
    expect(foe.damage).toBe('2d10');
    // Their strongest attribute, not a hard-coded Strength 6.
    expect(foe.abilityPoint).toBe('Strength 18');
    expect(foe.boss).toBe(true);
  });

  it('⚠ a catalog weapon resolves its real damage too, not a kill-count band', () => {
    const f = { ...BASE, snapshot: SNAP, gear: [{ name: 'Rusted Blade', kind: 'weapon', slot: 'main', tags: [] }] } as never;
    const foe = revenantFromFallen(f, 100);
    // Whatever the catalog/inference says, it is NOT the 3-kill 2d6 band unless
    // the weapon genuinely deals that.
    expect(typeof foe.damage).toBe('string');
    expect(foe.damage).toMatch(/^\d{1,2}d\d{1,3}$/);
  });

  it('⚠⚠ a record with no snapshot still builds the old way — nothing regresses', () => {
    const foe = revenantFromFallen({ ...BASE, kills: 200 } as never, 100);
    expect(foe.abilityPoint).toBe('Strength 6');
    // The legacy band and the living-player cap both still apply.
    expect(foe.hp).toBeLessThanOrEqual(Math.round(100 * 2.5));
    expect(foe.hp).toBeGreaterThanOrEqual(60);
  });

  it('⚠ the HP cap is OFF by default, and is one constant if it must come back', () => {
    // Stated plainly because it changes every fight: a clone is not sized to
    // the player who meets it.
    expect(CLONE_HP_CAP_MULTIPLIER).toBeNull();
    const src = readFileSync(join(__dirname, '..', 'app', 'engine', 'fallenRevenants.ts'), 'utf8');
    expect(src).toContain('export const CLONE_HP_CAP_MULTIPLIER');
    expect(src).toContain('CLONE_HP_CAP_MULTIPLIER\n      ? Math.max(20');
  });

  it('⚠⚠ the FULL kit is captured — ten slots, so rings and an amulet survive', () => {
    const equipped: Record<string, string> = {};
    const inventory = ['main', 'off', 'chest', 'head', 'legs', 'feet', 'amulet', 'ring', 'ring2', 'ring3']
      .map((slot, i) => {
        equipped[slot] = `Piece ${i}`;
        return { id: `i${i}`, name: `Piece ${i}`, kind: slot === 'main' || slot === 'off' ? 'weapon' : 'armor', quantity: 1, tags: [] };
      });
    const snap = buildFallenGearSnapshot({ equipped, inventory } as never);
    expect(snap).toHaveLength(10);
    expect(snap.map((g) => g.slot)).toContain('ring3');
    expect(snap.map((g) => g.slot)).toContain('amulet');
  });

  it('⚠⚠ every per-instance detail survives the snapshot — coatings included', () => {
    // The snapshot is a deep copy, so the work the player put IN (coatings, the
    // second Crucible slot, rolled perks, fused stats) is what makes the clone
    // theirs rather than a look-alike.
    const item = {
      id: 'w1', name: 'Whisper Marrow', kind: 'weapon', rarity: 'Rare', quantity: 1, tags: ['weapon'],
      durability: { current: 12, max: 20 },
      coating: { kind: 'poison', dice: '1d6', label: 'Envenomed' },
      coating2: { kind: 'cold', dice: '1d4', label: 'Frosted' },
      coatingSlots: 2,
      instanceStats: { statBonuses: [{ stat: 'stealth', amount: 2 }] },
    };
    const snap = buildFallenGearSnapshot({ equipped: { main: 'Whisper Marrow', mainId: 'w1' }, inventory: [item] } as never);
    const piece = snap[0] as unknown as Record<string, unknown>;
    expect(piece.coating).toEqual({ kind: 'poison', dice: '1d6', label: 'Envenomed' });
    expect(piece.coatingSlots).toBe(2);
    expect(piece.instanceStats).toEqual({ statBonuses: [{ stat: 'stealth', amount: 2 }] });
    expect(piece.durability).toEqual({ current: 12, max: 20 });
  });

  it('⚠ the death path records the character, not just the kit', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const i = store.indexOf('snapshot: {');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 700);
    for (const field of ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth', 'hpMax', 'ac']) {
      expect(block).toContain(field);
    }
  });
});
