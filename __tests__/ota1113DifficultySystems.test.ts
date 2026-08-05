// OTA-1113 — DIFFICULTY THAT MEANS SOMETHING, AND A CUSTOM PICKER.
//
// Owner, after reading a survey of how the industry actually builds difficulty:
// "go with the best suggestions on each category. let's make the difficulty
// tiers mean something, the effects should be game wide. Also create a custom
// selection that fires a popup and lets you check what systems they want to
// effect."
//
// ⚠ THIS OTA AMENDS pressure.ts's FOUNDING RULE, deliberately. That file was
// written to own only substrates that threatened NOTHING before (time,
// standing) and to scale only the RATE of accumulation for the two that
// already bit (corruption, weather) — because "re-scaling them from here would
// put a difficulty multiplier on top of a year of tuning and quietly
// invalidate all of it." The owner overruled that, correctly: a difficulty
// setting that only touches prices, patrols and weather is a weather setting.
//
// ⚠ WHAT REPLACES THAT PROTECTION IS THE IDENTITY ROW, and it is the single
// most important thing this suite guards. Every dial is defined so that 'owed'
// is a mathematical no-op. The tuning is safe because the default run is
// literally unchanged — not "close to unchanged", unchanged. If a future dial
// lands on this profile with a non-identity value at 'owed', these tests fail.
//
// The survey's three lever types are why the registry is tagged: MULTIPLIERS
// are cheap and feel fake at extremes, RULE CHANGES are free and feel
// meaningful, CONTENT SWAPS are expensive and feel best. And its named traps
// are why two things here look conservative: `loot` bottoms out at 0.7 rather
// than lower (resource starvation is tedium, not tension), and the pack dial
// is welded to the swing cap (damage sponges / stalls — the exact problem
// OTA-1088 and OTA-1089 were written to fix).

jest.setTimeout(20000);

import {
  PRESSURE_PROFILES,
  PRESET_TIERS,
  PRESSURE_ORDER,
  DIFFICULTY_SYSTEMS,
  DEFAULT_PRESSURE,
  profileOf,
  dialOf,
  canChangeTo,
  normalizeCustom,
  scaledPackSize,
  scaledSwingCap,
  isPressureTier,
  type DifficultySystemId,
} from '../app/engine/pressure';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

const custom = (intensity: string, systems: DifficultySystemId[]) =>
  ({ pressure: 'custom', pressureCustom: { intensity, systems } }) as never;

describe('OTA-1113 — ⚠ the identity row protects the tuning', () => {
  it('⚠ EVERY dial is a no-op at the default tier', () => {
    // This is the whole safety argument for amending pressure.ts's founding
    // rule. If this test fails, a year of combat balance is silently moving.
    const owed = PRESSURE_PROFILES[DEFAULT_PRESSURE];
    expect(owed.spawn).toBe(1);
    expect(owed.discovery).toBe(1);
    expect(owed.pack).toBe(1);
    expect(owed.loot).toBe(1);
    expect(owed.hunger).toBe(1);
    expect(owed.tide).toBe(1);
    expect(owed.hostile).toBe(1);
    expect(owed.creep).toBe(1);
    expect(owed.exposure).toBe(1);
    // The two rule dials and the content dial are OFF, not merely small.
    expect(owed.elite).toBe(0);
    expect(owed.witholdIdentity).toBe(false);
    expect(owed.witholdIntel).toBe(false);
  });

  it('⚠ a multiplier of 1 must be a real no-op at the consumers, not merely close', () => {
    expect(0.29 * 1).toBe(0.29);
    expect(scaledPackSize(3, 1)).toBe(3);
    expect(scaledSwingCap(3, 1)).toBe(3);
    expect(0.07 * 1).toBe(0.07);
  });

  it('the tiers are monotonic — harder is harder on every dial at once', () => {
    const rows = PRESET_TIERS.map((t) => PRESSURE_PROFILES[t]);
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1]!;
      const cur = rows[i]!;
      // Danger rises.
      expect(cur.spawn).toBeGreaterThanOrEqual(prev.spawn);
      expect(cur.pack).toBeGreaterThanOrEqual(prev.pack);
      expect(cur.elite).toBeGreaterThanOrEqual(prev.elite);
      expect(cur.hunger).toBeGreaterThanOrEqual(prev.hunger);
      // Generosity falls.
      expect(cur.discovery).toBeLessThanOrEqual(prev.discovery);
      expect(cur.loot).toBeLessThanOrEqual(prev.loot);
    }
  });

  it('⚠ loot never bottoms out into the resource-starvation trap', () => {
    // The survey: resource starvation "produces tedium rather than tension".
    // And this dial stacks with TIDE's price drift, so the floor is deliberate.
    for (const t of PRESET_TIERS) {
      expect(PRESSURE_PROFILES[t].loot).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('no dial scales enemy HP or damage — the sponge trap stays shut', () => {
    const mod = src('app/engine/pressure.ts');
    expect(mod).not.toMatch(/enemyHp|damageMult|hpMult|toughness/i);
    expect(mod).toContain('NO dial here scales enemy HP');
  });
});

describe('OTA-1113 — pack size and the swing cap move together', () => {
  it('⚠ growing the pack grows the cap — otherwise it is longer, not harder', () => {
    // OTA-1089 capped melee swings per round because a five-raider wall was
    // more dice than drama and the whole of the sim's stall tail. Growing
    // parties without growing that cap brings it straight back.
    expect(scaledPackSize(3, 1.6)).toBeGreaterThan(3);
    expect(scaledSwingCap(3, 1.6)).toBeGreaterThan(3);
  });

  it('…but the cap grows by LESS, so the hardest tier is not a shredder', () => {
    const packGrowth = scaledPackSize(3, 1.6) / 3;
    const capGrowth = scaledSwingCap(3, 1.6) / 3;
    expect(capGrowth).toBeLessThan(packGrowth);
  });

  it('the cap never falls below the shipped value, even on the gentlest tier', () => {
    expect(scaledSwingCap(3, 0.7)).toBe(3);
    expect(scaledSwingCap(3, 0.1)).toBe(3);
  });

  it('a party never empties, however gentle the tier', () => {
    expect(scaledPackSize(2, 0.7)).toBeGreaterThanOrEqual(1);
    expect(scaledPackSize(1, 0.01)).toBe(1);
  });

  it('both consumers are wired, and the store says why', () => {
    const store = src('app/state/gameStore.ts');
    expect(store).toContain('scaledPackSize(');
    expect(store).toContain('scaledSwingCap(MELEE_PACK_SWINGS_PER_ROUND, profileOf(get().player).pack)');
    expect(store).toContain('THE CAP MOVES WITH THE PACK');
  });
});

describe('OTA-1113 — CUSTOM: pick the intensity, then pick what it touches', () => {
  it('⚠ an unchecked system runs at the default, not at the chosen intensity', () => {
    // The entire point of the popup. Checking "enemy spawn rate" at bury_me
    // must not also make loot scarce.
    const p = custom('bury_me', ['spawn']);
    expect(dialOf(p, 'spawn')).toBe(PRESSURE_PROFILES.bury_me.spawn);
    expect(dialOf(p, 'loot')).toBe(PRESSURE_PROFILES.owed.loot);
    expect(dialOf(p, 'pack')).toBe(PRESSURE_PROFILES.owed.pack);
    expect(dialOf(p, 'tide')).toBe(PRESSURE_PROFILES.owed.tide);
  });

  it('a checked system takes the intensity exactly', () => {
    const p = custom('let_it_come', ['loot', 'pack']);
    expect(dialOf(p, 'loot')).toBe(PRESSURE_PROFILES.let_it_come.loot);
    expect(dialOf(p, 'pack')).toBe(PRESSURE_PROFILES.let_it_come.pack);
  });

  it('⚠ custom with NOTHING checked is exactly the default run', () => {
    const p = custom('bury_me', []);
    const owed = PRESSURE_PROFILES[DEFAULT_PRESSURE];
    const got = profileOf(p);
    for (const k of ['spawn', 'discovery', 'pack', 'loot', 'elite', 'hunger', 'tide', 'hostile', 'creep', 'exposure'] as const) {
      expect(got[k]).toBe(owed[k]);
    }
    expect(got.witholdIdentity).toBe(false);
    expect(got.witholdIntel).toBe(false);
  });

  it('the rule dials are switched by their own system ids, not the field name', () => {
    expect(profileOf(custom('bury_me', ['identity'])).witholdIdentity).toBe(true);
    expect(profileOf(custom('bury_me', ['identity'])).witholdIntel).toBe(false);
    expect(profileOf(custom('bury_me', ['intel'])).witholdIntel).toBe(true);
  });

  it('⚠ profileOf COMPOSES, so every pre-existing consumer is custom-aware for free', () => {
    // Consumers written before this OTA read profileOf(player).tide directly.
    // They must resolve the custom choice without being touched.
    expect(profileOf(custom('bury_me', ['tide'])).tide).toBe(PRESSURE_PROFILES.bury_me.tide);
    expect(profileOf(custom('bury_me', ['spawn'])).tide).toBe(PRESSURE_PROFILES.owed.tide);
  });

  it('a preset returns its own row untouched — this is a no-op for non-custom runs', () => {
    for (const t of PRESET_TIERS) {
      expect(profileOf({ pressure: t } as never)).toBe(PRESSURE_PROFILES[t]);
    }
  });

  it('junk from a hand-edited or newer save is dropped, never thrown on', () => {
    expect(normalizeCustom(undefined)).toEqual({ intensity: DEFAULT_PRESSURE, systems: [] });
    expect(normalizeCustom({ intensity: 'nonsense', systems: ['spawn', 'not-a-system'] }))
      .toEqual({ intensity: DEFAULT_PRESSURE, systems: ['spawn'] });
    // 'custom' as an intensity would be infinite regress.
    expect(normalizeCustom({ intensity: 'custom', systems: [] }).intensity).toBe(DEFAULT_PRESSURE);
    expect(normalizeCustom({ systems: ['loot', 'loot'] }).systems).toEqual(['loot']);
    expect(() => normalizeCustom('garbage')).not.toThrow();
  });

  it('every registry entry is renderable and honest about its lever type', () => {
    expect(DIFFICULTY_SYSTEMS.length).toBeGreaterThanOrEqual(10);
    for (const s of DIFFICULTY_SYSTEMS) {
      expect(s.label.length).toBeGreaterThan(3);
      expect(s.blurb.length).toBeGreaterThan(15);
      expect(['multiplier', 'rule', 'content']).toContain(s.kind);
    }
    // The survey's best-value category must actually be represented.
    expect(DIFFICULTY_SYSTEMS.some((s) => s.kind === 'rule')).toBe(true);
    expect(DIFFICULTY_SYSTEMS.some((s) => s.kind === 'content')).toBe(true);
  });

  it('system ids are unique — a duplicate would silently shadow a dial', () => {
    const ids = DIFFICULTY_SYSTEMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('OTA-1113 — ⚠ custom is not a back door up the ladder', () => {
  it('the lower-only rule still holds between presets', () => {
    expect(canChangeTo('bury_me', 'salvage')).toBe(true);
    expect(canChangeTo('salvage', 'bury_me')).toBe(false);
    expect(canChangeTo('owed', 'owed')).toBe(true);
  });

  it('⚠ a custom config is ranked by its INTENSITY, so it cannot be used to climb', () => {
    // The exploit this closes: start on 'salvage', "customise" to bury_me
    // numbers on every system, call it a sidegrade.
    expect(canChangeTo('salvage', 'custom', { toCustom: { intensity: 'bury_me', systems: ['spawn'] } }))
      .toBe(false);
    expect(canChangeTo('bury_me', 'custom', { toCustom: { intensity: 'salvage', systems: ['spawn'] } }))
      .toBe(true);
  });

  it('⚠ custom → custom may only REMOVE systems, never add', () => {
    const from = { intensity: 'bury_me', systems: ['spawn', 'loot', 'pack'] };
    expect(canChangeTo('custom', 'custom', { fromCustom: from, toCustom: { intensity: 'bury_me', systems: ['spawn'] } }))
      .toBe(true);
    expect(canChangeTo('custom', 'custom', { fromCustom: from, toCustom: { intensity: 'bury_me', systems: ['spawn', 'loot', 'pack', 'tide'] } }))
      .toBe(false);
  });

  it('dropping from custom to a preset at or below the intensity is allowed', () => {
    const c = { intensity: 'let_it_come', systems: ['spawn'] };
    expect(canChangeTo('custom', 'owed', { fromCustom: c })).toBe(true);
    expect(canChangeTo('custom', 'bury_me', { fromCustom: c })).toBe(false);
  });

  it("'custom' is a real tier but deliberately has no rung on the ladder", () => {
    expect(isPressureTier('custom')).toBe(true);
    expect((PRESSURE_ORDER as readonly string[]).includes('custom')).toBe(false);
    expect(PRESET_TIERS).toHaveLength(4);
  });
});

describe('OTA-1113 — the dials reach the game', () => {
  const store = src('app/state/gameStore.ts');

  it('⚠ SPAWN reaches the encounter roll', () => {
    expect(store).toContain('baseRollChance * timeMult * pressureProfile.spawn');
  });

  it('⚠ DISCOVERY is a SEPARATE dial from spawn, and only lifts what helps', () => {
    // One roll produces danger AND help. Scaling only the roll would make a
    // hard run thicker in enemies and scarcer in traders — two punishments
    // billed as one.
    expect(store).toContain('discoveryMult: pressureProfile.discovery');
    const enc = src('app/engine/wastelandEncounters.ts');
    expect(enc).toContain("const helps = a.type === 'treasure' || a.type === 'fusion_bench' || a.type === 'npc';");
    expect(enc).toContain('opts.discoveryMult');
  });

  it('LOOT rides the find CHANCE, not the stack size', () => {
    // A lean tier should make a find rarer, not make every find insulting.
    expect(store).toContain('0.07 * profileOf(livePlayer).loot');
  });

  it('the amendment to the founding rule is written down, not worked around', () => {
    const mod = src('app/engine/pressure.ts');
    expect(mod).toContain('THE RULE ABOVE IS NOW EXPLICITLY AMENDED');
    expect(mod).toContain('WHAT WE GIVE UP');
    expect(mod).toContain('WHAT PROTECTS THE TUNING');
  });
});

describe('OTA-1113 — the popup', () => {
  const view = src('app/components/DifficultyCustomModal.tsx');

  it('⚠ it is a checklist of systems, which is what was asked for', () => {
    expect(view).toContain('DIFFICULTY_SYSTEMS.map');
    expect(view).toContain('accessibilityRole="checkbox"');
    expect(view).toContain('accessibilityState={{ checked: on }}');
  });

  it('it picks an intensity as well as the systems', () => {
    expect(view).toContain('PRESET_TIERS.map');
    expect(view).toContain('setIntensity');
  });

  it('it says plainly what an empty selection means', () => {
    expect(view).toContain('this plays as the standard run');
  });

  it('it shows the lever TYPE, so the player sees they are choosing between kinds of change', () => {
    expect(view).toContain('KIND_LABEL');
    expect(view).toContain('rowKind');
  });

  it('creation offers CUSTOM below the presets and sends the payload', () => {
    const screen = src('app/screens/CharacterCreationScreen.tsx');
    expect(screen).toContain('<DifficultyCustomModal');
    expect(screen).toContain("setPressure('custom')");
    expect(screen).toContain("...(pressure === 'custom' && pressureCustom ? { pressureCustom } : {})");
  });

  it('createCharacter normalises the payload on the way in', () => {
    const ch = src('app/engine/character.ts');
    expect(ch).toContain("pressure === 'custom' ? normalizeCustom(input.pressureCustom) : undefined");
  });
});
