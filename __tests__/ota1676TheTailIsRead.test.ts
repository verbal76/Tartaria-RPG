/**
 * OTA-1676 (slice 4c) — THE TAIL IS READ.
 *
 * Slice 4's measurement, re-run on 2026-09-05 before this OTA: 316 effect
 * strings, 200 parsed, 116 unread. Twenty-nine of the unread were rows of
 * `app/data/items/runecasters.json`, a catalog NOTHING in the app imports
 * (asserted below) — so the live tail was 87, the "~85" the task recorded.
 *
 * Three things close it:
 *   1. THE PARSER READS THE CATALOG'S OWN WORDS for mechanics that already
 *      existed — "pins enemies", "reduces enemy speed", "pushes the target
 *      back", "disables Tartarian tech", "+1 damage to tech", "the arc jumps to
 *      one extra enemy" — and two new ones: the shield riders (DR / immunity /
 *      on-block reflect) and the wielder's own share (guard / cover / ward /
 *      heal), plus the on-hit shred OTA-1563 left "for the shred slice" and a
 *      `pull` control, the mirror of knockback.
 *   2. FIFTY-TWO CARDS ARE REWORDED onto what the engine does: the ward rods
 *      onto one grammar, the "decay keeps going" flavour onto real festering
 *      riders, the impossible ones (teleport, summon, resurrect, parry-break,
 *      "50% enemy HP loss") onto honest mechanics of the same weight or onto
 *      plain flavour that promises nothing.
 *   3. THE TAIL IS PINNED: every live effect string either parses or is on the
 *      flavour list below, by name. A card that promises something unread
 *      cannot be authored again without failing here.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import weaponsJson from '../app/data/items/weapons.json';
import {
  parseWeaponEffect, shieldDamageReduction, rollShieldReflect, effectConditionMatches,
} from '../app/engine/weaponEffects';
import { controlLabel, controlAttackPenalty, bracesAgainst } from '../app/engine/enemyControl';
import { statusAcAdjustment, applyEffect, tickEffects } from '../app/engine/statusEffects';
import { heldShieldAc } from '../app/engine/equipment';
import { planSelfBuff } from '../app/state/weaponRiderEffects';
import type { Enemy, PlayerCharacter, StatusEffect } from '../app/engine/types';

type Row = { name: string; effect?: string; tags?: string[] };
const WEAPONS = (weaponsJson as unknown as { weapons: Row[] }).weapons;
const row = (name: string): Row => {
  const r = WEAPONS.find((w) => w.name === name);
  if (!r) throw new Error(`no weapon row named ${name}`);
  return r;
};
const parse = (name: string) => parseWeaponEffect(row(name).effect);
const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const enemy = (over: Partial<Enemy> = {}): Enemy => ({
  name: 'Test Thing', type: 'Mud Creature', hp: 20, ac: 12, damage: '1d6', traits: [], ...over,
} as Enemy);

function empty(v: unknown): boolean {
  if (v == null || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).every(empty);
  return false;
}
const parsesToSomething = (effect: string | undefined): boolean => {
  const p = parseWeaponEffect(effect) as unknown as Record<string, unknown> | null;
  return !!p && Object.values(p).some((v) => !empty(v));
};

/**
 * ⚠⚠⚠ THE FLAVOUR LIST — every live card that promises nothing the parser
 * should read, BY NAME. Three kinds: an HP grant that `statBonuses` already
 * pays; a faction-issue line that is identity, not mechanics; and a sentence
 * this OTA wrote to say plainly that the weapon does nothing special. The two
 * bucklers are here because their bash is paid by the `shield` tag (OTA-1510),
 * the Bone Shiv because its +2 Stealth is a `statBonuses` row the card now
 * states honestly (it used to say +1).
 */
const FLAVOUR_ONLY: ReadonlySet<string> = new Set([
  'Club', 'Cudgel', 'Stone Spear', 'Bone Maul', 'Mud Sledge', 'Mud Mauler', 'Bonebreaker Mace',
  'Mud Buckler', 'Iron Buckler', 'Bone Shiv (Stealth)', 'Bone Club',
  'Aetheric Greatsword', 'Rust Dagger', 'Rusty Shortsword', 'Bone Shortsword', 'Minor Repair Wand',
  'Aetheric Spark Wand', 'Mud Spear (Runecaster)', 'Aetheric Pillar Stave', "Reaver's Greatsword",
  'Monarch\'s Court Blade', 'Dynasty Oathspear', 'Reclaimer\'s Salvage Maul', 'Order Reliquary Blade',
  'Ancestor Bone Cleaver', 'Builder\'s Aethercraft Hammer', 'Giant-Watch Greatspear', 'Architect\'s Silent Dagger',
]);

describe('OTA-1676 — the tail ratchet', () => {
  it('⚠⚠⚠ every live effect string parses, or is on the flavour list by name', () => {
    const unread = WEAPONS.filter((w) => w.effect && !parsesToSomething(w.effect)).map((w) => w.name);
    const offList = unread.filter((n) => !FLAVOUR_ONLY.has(n));
    expect(offList).toEqual([]);
    // …and the list is not padding: every name on it really is unread today.
    const stale = [...FLAVOUR_ONLY].filter((n) => parsesToSomething(row(n).effect));
    expect(stale).toEqual([]);
    expect(unread.length).toBe(FLAVOUR_ONLY.size);
  });

  it('⚠⚠ the measurement: 239 of 267 live strings parse (was 180 of 267 before this OTA)', () => {
    // 316 in the probe = 267 live rows here + 49 in the orphaned runecasters.json.
    const live = WEAPONS.filter((w) => !!w.effect);
    const parsed = live.filter((w) => parsesToSomething(w.effect));
    expect(live.length).toBe(267);
    expect(parsed.length).toBe(live.length - FLAVOUR_ONLY.size);
  });

  it('⚠ app/data/items/runecasters.json is imported by nothing in the app — its 29 rows are not the tail', () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(f)) continue;
        // An IMPORT, not a mention — buildInfo names the file in its notes.
        if (/(?:from|require\()\s*['"][^'"]*items\/runecasters\.json['"]/.test(readFileSync(p, 'utf8'))) hits.push(p);
      }
    };
    walk(join(__dirname, '..', 'app'));
    expect(hits).toEqual([]);
  });
});

describe('OTA-1676 — the shield riders, read off the nine cards that carry them', () => {
  it('Giant Bone Shield / Plasma Shield / Titan Shield / Graviton Shield carry a typed DR', () => {
    expect(parse('Giant Bone Shield')?.shieldAc?.dr).toEqual({ dice: '1d6', types: ['slashing'] });
    expect(parse('Plasma Shield')?.shieldAc?.dr).toEqual({ dice: '1d6', types: ['bludgeoning'] });
    expect(parse('Titan Shield')?.shieldAc?.dr).toEqual({ dice: '1d6', types: ['slashing', 'piercing', 'bludgeoning'] });
    // The one with no shield word on its card — the probe's finding.
    expect(parse('Graviton Shield')?.shieldAc?.dr).toEqual({
      dice: '1d6', types: ['burn', 'cold', 'electrical', 'poison', 'radiation', 'aetheric'],
    });
    // …and the AC beside it is untouched.
    expect(parse('Titan Shield')?.shieldAc?.flat).toBe(4);
  });

  it('Plasma Shield / Plasma Energy Shield / Mud Royal Shield turn a named type outright', () => {
    expect(parse('Plasma Shield')?.shieldAc?.immune).toEqual(['aetheric']);
    // "plasma" is this world's burn — no enemy deals a type called plasma.
    expect(parse('Plasma Energy Shield')?.shieldAc?.immune).toEqual(['burn']);
    expect(parse('Mud Royal Shield')?.shieldAc?.immune).toEqual(['aetheric']);
    expect(parse('Mud Royal Shield')?.shieldAc?.flat).toBe(3);
  });

  it('the four biting shields reflect on the block', () => {
    expect(parse('Mud Spiked Shield')?.shieldAc?.reflect).toEqual({ dice: '1d6' });
    expect(parse('Plasma Buckler')?.shieldAc?.reflect).toEqual({ dice: '1d6', type: 'plasma' });
    expect(parse('Plasma Energy Shield')?.shieldAc?.reflect).toEqual({ dice: '1d6' });
    expect(parse("Mud Emperor's Buckler")?.shieldAc?.reflect).toEqual({ dice: '1d6' });
  });

  it('⚠⚠ the Shield-Hammer is NOT a shield: its guard rides selfBuff, not shieldAc', () => {
    const p = parse('Aetheric Shield-Hammer');
    expect(p?.shieldAc).toBeUndefined();
    expect(p?.selfBuff).toEqual({ kind: 'guard', when: 'hit', amount: 2, rounds: 1 });
  });

  it('a defensive number is never read as an attack rider (OTA-1643 held)', () => {
    for (const n of ['Giant Bone Shield', 'Titan Shield', 'Graviton Shield', 'Plasma Buckler', 'Mud Spiked Shield']) {
      const p = parse(n);
      expect([n, p?.flatRider, p?.riderDot, p?.bonuses]).toEqual([n, undefined, undefined, undefined]);
    }
  });

  it('shieldDamageReduction: immunity zeroes, DR soaks within its dice, the wrong type is untouched', () => {
    const sac = parse('Plasma Shield')!.shieldAc!;
    expect(shieldDamageReduction(sac, 'aetheric', 9)).toEqual({ dmg: 0, soaked: 9, immune: true });
    for (let i = 0; i < 40; i++) {
      const r = shieldDamageReduction(sac, 'bludgeoning', 10);
      expect(r.immune).toBe(false);
      expect(r.soaked).toBeGreaterThanOrEqual(1);
      expect(r.soaked).toBeLessThanOrEqual(6);
      expect(r.dmg).toBe(10 - r.soaked);
    }
    expect(shieldDamageReduction(sac, 'slashing', 7)).toEqual({ dmg: 7, soaked: 0, immune: false });
    expect(shieldDamageReduction(sac, 'bludgeoning', 0)).toEqual({ dmg: 0, soaked: 0, immune: false });
    expect(shieldDamageReduction(null, 'bludgeoning', 5)).toEqual({ dmg: 5, soaked: 0, immune: false });
  });

  it('rollShieldReflect rolls the card\'s dice and nothing for a shield without a bite', () => {
    const spiked = parse('Mud Spiked Shield')!.shieldAc!;
    for (let i = 0; i < 40; i++) {
      const r = rollShieldReflect(spiked);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }
    expect(rollShieldReflect(parse('Titan Shield')!.shieldAc)).toBe(0);
    expect(rollShieldReflect(null)).toBe(0);
  });

  it('⚠⚠ heldShieldAc hands the resolver the riders — and a tagged buckler with no card is still held', () => {
    const holding = (off: string): PlayerCharacter => ({ equipped: { off } } as unknown as PlayerCharacter);
    expect(heldShieldAc(holding('Titan Shield')).riders?.dr?.types).toEqual(['slashing', 'piercing', 'bludgeoning']);
    expect(heldShieldAc(holding('Mud Spiked Shield')).name).toBe('Mud Spiked Shield');
    expect(heldShieldAc(holding('Mud Spiked Shield')).riders?.reflect).toEqual({ dice: '1d6' });
    // Pre-1676 the Mud Buckler parsed to nothing and was never "held" for the
    // OTA-1646 landing roll: a blow could not land on it and it never wore.
    const buckler = heldShieldAc(holding('Mud Buckler'));
    expect(buckler.name).toBe('Mud Buckler');
    expect(buckler.flat).toBe(0);
    expect(buckler.riders).toBeNull();
    // A hammer in the off hand is not a shield.
    expect(heldShieldAc(holding('Aetheric Shield-Hammer')).name).toBeNull();
  });
});

describe('OTA-1676 — the wielder\'s own share', () => {
  it.each([
    ['Aetheric Touch Wand', { kind: 'heal', when: 'use', dice: '1d6', rounds: 0 }],
    ['Phoenix Rebirth Scepter', { kind: 'heal', when: 'hit', dice: '2d6', rounds: 0 }],
    ['Dust Cloud Wand', { kind: 'cover', when: 'use', rounds: 1 }],
    ['Lightfoot Dash Wand', { kind: 'guard', when: 'use', amount: 3, rounds: 2 }],
    ['Displace Aether Scepter', { kind: 'guard', when: 'hit', amount: 4, rounds: 2 }],
    ['Shadow Caller Stave', { kind: 'guard', when: 'hit', amount: 3, rounds: 1 }],
    ['Mud Shell Wand', { kind: 'ward', when: 'use', dice: '1d6', rounds: 3 }],
    ['Aetheric Ward Rod', { kind: 'ward', when: 'use', dice: '2d6', rounds: 3 }],
    ['Barrier of Aether Rod', { kind: 'ward', when: 'use', dice: '1d6', rounds: 5 }],
    ['Mud Armor Rod', { kind: 'ward', when: 'use', dice: '2d6', rounds: 5 }],
    ['Aetheric Armor Stave', { kind: 'ward', when: 'use', dice: '2d10', rounds: 5 }],
    ['Mud Guard Stave', { kind: 'ward', when: 'use', dice: '2d8', rounds: 5 }],
    ['Hoarfrost Ward Stave', { kind: 'ward', when: 'use', dice: '2d8', rounds: 4 }],
    ['Mud Golem Creation Stave', { kind: 'ward', when: 'use', dice: '2d8', rounds: 5 }],
  ] as const)('%s reads as %j', (name, expected) => {
    expect(parse(name)?.selfBuff).toEqual(expected);
  });

  it('⚠⚠ a ward card is never a DOT and never a shield (the two readers it sits next to)', () => {
    for (const n of ['Mud Shell Wand', 'Aetheric Armor Stave', 'Hoarfrost Ward Stave']) {
      const p = parse(n);
      expect([n, p?.riderDot, p?.flatRider, p?.shieldAc]).toEqual([n, undefined, undefined, undefined]);
    }
  });

  it('planSelfBuff: guard → guard_up with the card\'s AC, cover → in_cover, and the wrong moment is nothing', () => {
    const guard = planSelfBuff({ kind: 'guard', when: 'hit', amount: 2, rounds: 1 }, 'hit', 'Aetheric Shield-Hammer', 10, 20)!;
    const fx = guard.effects!([]);
    expect(fx).toEqual([{ kind: 'guard_up', remainingRounds: 1, acBonus: 2, label: 'Aetheric Shield-Hammer guard (+2 AC)' }]);
    expect(guard.line).toContain('+2 AC for 1 round.');
    expect(planSelfBuff({ kind: 'guard', when: 'hit', amount: 2, rounds: 1 }, 'use', 'x', 10, 20)).toBeNull();
    const cover = planSelfBuff({ kind: 'cover', when: 'use', rounds: 1 }, 'use', 'Dust Cloud Wand', 10, 20)!;
    expect(cover.effects!([])[0]).toMatchObject({ kind: 'in_cover', remainingRounds: 1 });
  });

  it('planSelfBuff: a ward is rolled once, seeded like the stone ward, and replaces the old one', () => {
    for (let i = 0; i < 30; i++) {
      const plan = planSelfBuff({ kind: 'ward', when: 'use', dice: '2d6', rounds: 3 }, 'use', 'Mud Armor Rod', 10, 20)!;
      const prior: StatusEffect[] = [{ kind: 'stone_ward', remainingRounds: 9, absorb: 99, label: 'old' }, { kind: 'bleed', remainingRounds: 2 }];
      const fx = plan.effects!(prior);
      const wards = fx.filter((e) => e.kind === 'stone_ward');
      expect(wards.length).toBe(1);
      expect(wards[0]!.absorb).toBeGreaterThanOrEqual(2);
      expect(wards[0]!.absorb).toBeLessThanOrEqual(12);
      expect(wards[0]!.remainingRounds).toBe(3);
      expect(fx.some((e) => e.kind === 'bleed')).toBe(true);
      expect(plan.line).toContain(`the next ${wards[0]!.absorb} damage breaks on it`);
    }
  });

  it('planSelfBuff: a heal is clamped to the room there is, and says so when there is none', () => {
    for (let i = 0; i < 30; i++) {
      const plan = planSelfBuff({ kind: 'heal', when: 'use', dice: '1d6', rounds: 0 }, 'use', 'Aetheric Touch Wand', 18, 20)!;
      expect(plan.heal).toBeGreaterThanOrEqual(1);
      expect(plan.heal).toBeLessThanOrEqual(2);
      expect(plan.effects).toBeUndefined();
    }
    const whole = planSelfBuff({ kind: 'heal', when: 'use', dice: '1d6', rounds: 0 }, 'use', 'Aetheric Touch Wand', 20, 20)!;
    expect(whole.heal).toBeUndefined();
    expect(whole.line).toContain('nothing to mend');
  });

  it('guard_up is counted by statusAcAdjustment at its own amount, refreshes to the larger AC, and dies with the fight', () => {
    const fx: StatusEffect[] = [{ kind: 'guard_up', remainingRounds: 1, acBonus: 2 }];
    expect(statusAcAdjustment(fx)).toBe(2);
    expect(statusAcAdjustment([{ kind: 'guard_up', remainingRounds: 0, acBonus: 2 }])).toBe(0);
    const refreshed = applyEffect(fx, { kind: 'guard_up', remainingRounds: 1, acBonus: 4 });
    expect(refreshed).toEqual([{ kind: 'guard_up', remainingRounds: 1, acBonus: 4 }]);
    const shrunk = applyEffect(refreshed, { kind: 'guard_up', remainingRounds: 3, acBonus: 1 });
    expect(shrunk[0]).toMatchObject({ remainingRounds: 3, acBonus: 4 });
    expect(tickEffects(fx, { inCombat: false }).effects).toEqual([]);
    expect(tickEffects([{ kind: 'guard_up', remainingRounds: 2, acBonus: 2 }], { inCombat: true }).effects)
      .toEqual([{ kind: 'guard_up', remainingRounds: 1, acBonus: 2 }]);
  });
});

describe('OTA-1676 — the catalog\'s own words, now read', () => {
  it('the shred on hit: the four mud blades + the Shatter scepter, capped at 4', () => {
    expect(parse('Mud Cleaver')?.onHitShred).toBe(1);
    expect(parse('Mud Royal Blade')?.onHitShred).toBe(2);
    expect(parse("Mud Emperor's Saber")?.onHitShred).toBe(1);
    expect(parse('Shatter Aether Scepter')?.onHitShred).toBe(3);
    // A max-roll shred stays OTA-1564's and is not double-read here.
    for (const w of WEAPONS) {
      const p = parseWeaponEffect(w.effect);
      if (p?.onMaxRoll?.shredDice) expect([w.name, p.onHitShred]).toEqual([w.name, undefined]);
    }
  });

  it.each([
    ['Mud Harpoon Gun', 'restrained', 1, 'always'],
    ["Mud Emperor's Harpoon", 'restrained', 2, 'always'],
    ['Mud Saber', 'slowed', 1, 'always'],
    ['Aetheric Disrupt Rod', 'slowed', 2, 'always'],
    ['Gale Binder Wand', 'knockback', 1, 'always'],
    ['Aetheric Push Rod', 'knockback', 1, 'always'],
    ['Mud War Pike', 'knockback', 1, 'chance'],
    ['Void Pulse Rod', 'pull', 1, 'always'],
  ] as const)('%s → %s for %i round(s), trigger %s', (name, kind, rounds, trigger) => {
    const c = parse(name)?.onHitControl;
    expect(c).toMatchObject({ kind, rounds, trigger });
  });

  it('⚠ the magnets drag METAL only; the bolt rod stops a MACHINE only', () => {
    for (const n of ['Magnetic Axe', 'Magnetized Rod', 'Magnetized Halberd']) {
      expect(parse(n)?.onHitControl).toMatchObject({ kind: 'pull', restrictedTo: 'mechanical' });
    }
    expect(parse('Ether Bolt Rod')?.onHitControl).toMatchObject({ kind: 'stunned', rounds: 2, restrictedTo: 'construct' });
    expect(parse('Ether Bolt Rod')?.onHitControl?.fallback).toBeUndefined();
  });

  it('pull is a hinder, never a skip: −2 to its swing, no brace, a label of its own', () => {
    expect(bracesAgainst('pull')).toBe(false);
    expect(controlAttackPenalty({ kind: 'pull', roundsRemaining: 1, sourceName: 'x' })).toBe(-2);
    expect(controlLabel('pull')).toBe('dragged in');
  });

  it.each([
    ['Mud Knife', '1d4', 'slashing', 2, 3],
    ['Void Edge', '1d8', 'aetheric', 2, undefined],
    ["Mud Emperor's Curse Scepter", '1d10', 'poison', 3, undefined],
    ['Necromancer Staff', '1d4', 'aetheric', 3, undefined],
    ['Half-Life Pulse Scepter', '1d6', 'radiation', 3, undefined],
    ['Glowrot Rod', '1d4', 'radiation', 2, undefined],
    ['Dark Blight Rod', '1d4', 'poison', 2, undefined],
    ['Flame of Aether Wand', '1d4', 'burn', 2, undefined],
    ['Ember Storm Stave', '1d4', 'burn', 2, undefined],
    ['Mud Royal Blade', '1d6', 'poison', 2, undefined],
    ["Mud Emperor's Saber", '1d6', 'slashing', 2, undefined],
  ] as const)('%s festers: %s %s for %i rounds (threshold %s)', (name, dice, type, rounds, threshold) => {
    const d = parse(name)?.riderDot;
    expect(d).toMatchObject({ dice, type, rounds });
    expect(d?.threshold).toBe(threshold);
    // The rune-caster's own base dice are never doubled into a rider (OTA-1643's plus-sign rule).
    expect(parse(name)?.flatRider).toBeUndefined();
  });

  it('the blasts: a headcount for the arc, the base dice for the storm, a max-roll burst for the blade', () => {
    expect(parse('Stormcaller Stave')?.splash).toEqual({ dice: '2d8', maxVictims: 1 });
    expect(parse('Ember Storm Stave')?.splash).toEqual({ dice: '2d8' });
    expect(parse('Aetheric Plasma Blade')?.splash).toEqual({ dice: '1d20', whenMaxRoll: true });
    expect(parse('Aetheric Plasma Blade')?.onMaxRoll).toBeUndefined();
    for (const n of ['Mud Army Scepter', 'Aetheric Collapse Stave']) expect(parse(n)?.splash).toEqual({ dice: '2d8' });
    expect(parse('Aetheric Wave Rod')?.splash).toEqual({ dice: '2d6' });
  });

  it('the max-roll payloads and the riders the rewords put in reach of OTA-1564/1643', () => {
    expect(parse('Aetheric Deathblade')?.onMaxRoll).toEqual({ bonusFlat: 20 });
    expect(parse('Plasma Pistol')?.onMaxRoll).toEqual({ bonusDice: '2d10' });
    expect(parse('Plasma Burst Rifle')?.onMaxRoll).toEqual({ pierce: 'shields' });
    expect(parse('Plasma Burst Rifle')?.armorIgnore).toBeUndefined();
    expect(parse('Heavy Aetheric Flail')?.bonuses).toEqual([{ dice: '1d6', condition: 'aetheric' }]);
    expect(effectConditionMatches('aetheric', enemy({ name: 'Aetherkin Warden', type: 'Aetherkin' }))).toBe(true);
    expect(parse('Energy Saber')?.flatRider).toEqual({ dice: '1d4', type: 'energy' });
    expect(parse('Mud Forge Stave')?.flatRider).toEqual({ dice: '1d6', type: 'bludgeoning' });
    expect(parse('Aetheric Rod')?.bonuses).toEqual([{ flat: 1, condition: 'mechanical' }]);
    expect(parse('Mud Spear (Throwing)')?.rangeNote).toBe('long');
    expect(parse('Tartarian Hand Axe (Throw)')?.rangeNote).toBe('short');
  });

  it('⚠ the Iron Buckler\'s bash is not read as a control — the shield tag already pays it', () => {
    expect(parse('Iron Buckler')?.onHitControl).toBeUndefined();
  });
});

describe('OTA-1676 — wired where the promise is paid', () => {
  const store = codeOnly(src('app', 'state', 'gameStore.ts'));
  const resolver = codeOnly(src('app', 'state', 'combatResolution.ts'));

  it('the swing pays the "on use" share and the hit pays the "after a hit" share', () => {
    expect(store.includes("applyWeaponSelfBuff(get, set, parseWeaponEffect(swung?.effect), swung?.name ?? 'your weapon', 'use');")).toBe(true);
    expect(store.includes("applyWeaponSelfBuff(get, set, parsedEffect, equipped?.name ?? 'your weapon', 'hit');")).toBe(true);
  });

  it('the shred and the control land through the module, and the on-hit shred is capped', () => {
    expect(store.includes('shredEnemyArmor(set, Math.max(0, Math.min(activeIdx, currentScene.enemies.length - 1)), parsedEffect.onHitShred, acidShredCap(enemy));')).toBe(true);
    expect(store.includes('shredEnemyArmor(set, Math.max(0, Math.min(activeIdx, currentScene.enemies.length - 1)), shred);')).toBe(true);
    expect(store.includes('landControlOnScene(set, idxCtl, landed);')).toBe(true);
    expect(store.includes('if (splashSpec.maxVictims && victims.length >= splashSpec.maxVictims) return;')).toBe(true);
  });

  it('⚠⚠ the shield riders are spent AFTER the landing roll and BEFORE the coating splash', () => {
    const landing = resolver.indexOf('const landing = ecLanding.rollBlowLanding(');
    const riders = resolver.indexOf("if (landing.on === 'shield' && heldShield.riders && dmg > 0) {");
    const coating = resolver.indexOf('if (enemy.coating) {', landing);
    expect(landing).toBeGreaterThan(-1);
    expect(riders).toBeGreaterThan(landing);
    expect(riders).toBeLessThan(coating);
    expect(resolver.includes('${shieldSoakTag}${coatingClause}')).toBe(true);
  });

  it('⚠⚠ the bite is owed by the BLOCK: both the landing site and the raised-BLOCK site pay through one helper', () => {
    expect((resolver.match(/dealReflectToAttacker\(get, set, enemy, /g) ?? []).length).toBe(2);
    expect(resolver.includes("const shieldReflect = !killed && landing.on === 'shield' ? wevReflect.rollShieldReflect(heldShield.riders) : 0;")).toBe(true);
    expect(resolver.includes('const reflectBack = armourReflect + shieldReflect;')).toBe(true);
    // The armour's own bite is unchanged: it still needs the blow to have got through.
    expect(resolver.includes('const armourReflect = dmg > 0 && !killed ? aggregateEquippedReflect(player) : 0;')).toBe(true);
  });

  it('gameStore stays under the OTA-1400 ratchet after absorbing the family', () => {
    expect(src('app', 'state', 'gameStore.ts').split('\n').length).toBeLessThan(37000);
  });
});
