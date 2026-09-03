jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1644 — THE COATING GATE ASKED ABOUT DAMAGE TYPE WHERE IT MEANT FORM.
//
// Owner, playing 4.32.11: *"I can't coat my magnetic axe."* True, and the cause
// was a proxy that had stood since OTA-360: `isCoatableWeapon` gated melee on
// `damageType ∈ {slashing, piercing, bludgeoning}` as a stand-in for "does this
// weapon have a surface to paint". The Magnetic Axe is a Rare `electrical`
// weapon with an `axe` tag and a steel head — refused for its magnetised core.
//
// The measurement that made this an OTA rather than a one-line special case:
// 58 of 159 melee weapons were refused, 44 of them carrying an explicit blade /
// axe / knife / hammer / spear / polearm tag — and among those, five VENOM
// BLADES whose whole identity is a substance smeared on an edge.
//
// The mirror bug on the ranged side: `piercing` stood in for "what arrives is
// solid", which is right for an arrow and wrong for a thrown weapon, because a
// thrown weapon IS the projectile. Seven were refused for the damage they do on
// landing rather than for what lands.
//
// This suite pins the rule in both directions: what must now be coatable, and
// what must STILL refuse — a rune-caster (a design boundary since OTA-1561 gave
// them Crucible passives instead) and a launcher that sends no solid round.

import weaponsJson from '../app/data/items/weapons.json';
import { isCoatableWeapon, coatingRefusalFor } from '../app/engine/weaponCoating';

type Row = {
  name: string;
  weaponKind: 'melee' | 'ranged' | 'runecaster';
  damageType: string;
  rarity: string;
  tags: string[];
};

// ⚠ weapons.json is `{ weapons: [...] }` and holds ALL THREE kinds — 159 melee,
// 65 ranged, 64 rune-casters. `runecasters.json` is the Crucible RECIPE list
// (shell + ingredients), not a weapon catalog; reading it here would test recipe
// names against a weapon lookup, which is how the first draft of this suite
// failed for a reason that had nothing to do with the rule.
const WEAPONS = (weaponsJson as unknown as { weapons: Row[] }).weapons;
const RUNECASTERS = WEAPONS.filter((w) => w.weaponKind === 'runecaster');

const byName = (n: string): Row => {
  const r = WEAPONS.find((w) => w.name === n);
  if (!r) throw new Error(`fixture drift: no weapon named ${n}`);
  return r;
};

const asItem = (r: Row) => ({ name: r.name, kind: 'weapon' as const, tags: r.tags });

describe('OTA-1644 — a coating rides the weapon, not the damage type', () => {
  // ── THE REPORT ──────────────────────────────────────────────────────────
  it("the owner's Magnetic Axe takes a coating (the report, verbatim)", () => {
    const axe = byName('Magnetic Axe');
    // The exact shape that made it refuse: energy damage on a solid head.
    expect(axe.damageType).toBe('electrical');
    expect(axe.tags).toContain('axe');
    expect(isCoatableWeapon('Magnetic Axe')).toBe(true);
    expect(coatingRefusalFor(asItem(axe))).toBeNull();
  });

  // ── THE FAMILY IT WAS NEVER ALONE IN ────────────────────────────────────
  it('every melee weapon with a solid form tag is coatable — no damage-type refusals left', () => {
    const SOLID = new Set(['blade', 'axe', 'knife', 'hammer', 'polearm', 'spear', 'club', 'mace']);
    const solidMelee = WEAPONS.filter(
      (w) => w.weaponKind === 'melee' && w.tags.some((t) => SOLID.has(t)),
    );
    // Guards the measurement itself: if the catalog ever loses this family the
    // test must fail loudly rather than pass vacuously.
    expect(solidMelee.length).toBeGreaterThanOrEqual(100);
    const refused = solidMelee.filter((w) => !isCoatableWeapon(w.name));
    expect(refused.map((w) => `${w.name} (${w.damageType})`)).toEqual([]);
  });

  it('the five venom blades can carry venom', () => {
    // The clearest statement that the old proxy was wrong: a poison blade whose
    // entire card is a substance on an edge, refused a substance on its edge.
    for (const n of [
      'Mud Venom Blade', 'Mud Venom Blade (Rare)', 'Mud Thornblade',
      'Bone Thornblade', 'Mud Royal Blade',
    ]) {
      expect(byName(n).damageType).toBe('poison');
      expect(isCoatableWeapon(n)).toBe(true);
    }
  });

  it('every melee weapon in the catalog is coatable — a melee weapon is a solid object', () => {
    const melee = WEAPONS.filter((w) => w.weaponKind === 'melee');
    expect(melee.length).toBeGreaterThanOrEqual(150);
    expect(melee.filter((w) => !isCoatableWeapon(w.name)).map((w) => w.name)).toEqual([]);
  });

  // ── THE RANGED MIRROR ───────────────────────────────────────────────────
  it('a thrown weapon is its own projectile, whatever damage it does on landing', () => {
    for (const n of [
      'Bone Throwing Axe',      // slashing — refused before this OTA
      'Bone Sling', 'Mud Sling', // bludgeoning
      'Mud Darts',               // poison
      'Aetheric Throwing Disk',  // aetheric
      'Plasma Spear',            // burn
    ]) {
      const r = byName(n);
      expect(r.tags.some((t) => t === 'thrown' || t === 'sling')).toBe(true);
      expect(isCoatableWeapon(n)).toBe(true);
    }
  });

  it('a launcher that fires a solid point still qualifies', () => {
    for (const n of ['Repeater Crossbow', 'Bone Harpoon Launcher']) {
      expect(byName(n).damageType).toBe('piercing');
      expect(isCoatableWeapon(n)).toBe(true);
    }
  });

  // ── WHAT MUST STILL REFUSE, AND SAY WHY ─────────────────────────────────
  it('a beam weapon still refuses, and names the reason a player can act on', () => {
    const beam = byName('Plasma Rifle');
    expect(beam.weaponKind).toBe('ranged');
    expect(beam.tags).not.toContain('thrown');
    expect(isCoatableWeapon('Plasma Rifle')).toBe(false);
    const why = coatingRefusalFor(asItem(beam));
    expect(why).toBeTruthy();
    expect(why).toMatch(/beam/);
    // ⚠ The refusal must never again describe a damage type as having no
    // surface — that is the sentence that read as a bug.
    expect(why).not.toMatch(/without a surface to paint/);
  });

  it('rune-casters still refuse — a design boundary, not an oversight', () => {
    expect(RUNECASTERS.length).toBeGreaterThanOrEqual(60);
    for (const r of RUNECASTERS) {
      expect(isCoatableWeapon(r.name)).toBe(false);
    }
    const why = coatingRefusalFor({
      name: RUNECASTERS[0]!.name, kind: 'weapon', tags: RUNECASTERS[0]!.tags,
    });
    expect(why).toMatch(/rune-caster/);
  });

  it('a non-weapon is still refused', () => {
    expect(isCoatableWeapon('Aetheric Cog')).toBe(false);
    expect(coatingRefusalFor({ name: 'Aetheric Cog', kind: 'misc', tags: ['loot'] }))
      .toMatch(/not a weapon/);
  });

  // ── THE RATCHET ─────────────────────────────────────────────────────────
  it('no coatable weapon is decided by its damage type any more', () => {
    // If a future edit reintroduces a damage-type gate on melee or on thrown
    // weapons, this catches it: coatability must be constant across damage
    // types WITHIN each of the two families the OTA opened.
    const meleeTypes = new Set(WEAPONS.filter((w) => w.weaponKind === 'melee').map((w) => w.damageType));
    expect(meleeTypes.size).toBeGreaterThan(3); // the catalog really is mixed
    const thrown = WEAPONS.filter(
      (w) => w.weaponKind === 'ranged' && w.tags.some((t) => t === 'thrown' || t === 'sling'),
    );
    const thrownTypes = new Set(thrown.map((w) => w.damageType));
    expect(thrownTypes.size).toBeGreaterThan(2);
    for (const w of thrown) expect(isCoatableWeapon(w.name)).toBe(true);
  });
});
