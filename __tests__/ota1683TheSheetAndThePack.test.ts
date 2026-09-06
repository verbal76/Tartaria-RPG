/**
 * OTA-1683 — THE SHEET AND THE PACK (task #193).
 *
 * Five notations from the owner's 09-04 log, 22:00–22:07, each answered:
 *
 *   22:00  "in the small character portrait, ste is not shown"
 *          → STE joins the portrait's stat row.
 *   22:01  "do all of the benefits of stat boosts gained from gear show
 *          properly on the full character sheet?"
 *          → MEASURED: the gear did; the sheet's total was a SECOND copy of the
 *            combat sum that had fallen four sources behind it (stone's mark,
 *            chill, Aether Dust, title perks) and never floored. One
 *            arithmetic now: effectiveStats derives from the breakdown.
 *   22:02  "2 wrongs still standing … when I tap on it, it doesn't expand"
 *          → the row drills into who holds each wrong and what clears it.
 *   22:03  "sell common gear in bulk … should exclude common gear that is
 *          unequipped but has had coatings applied"  (22:04: "or a lock like
 *          fusion") → the sweep steps around coated pieces; the confirm says
 *            how many. The per-item sell still sells them by hand.
 *   22:07  "weapons category … should have subsections for each type of
 *          weapon … mele, spear, ranged and so on"
 *          → Weapons reads in runs headed by the reach class combat already
 *            resolves: Melee, Spears & polearms, Ranged, Rune-casters, Thrown.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { effectiveStats, effectiveStatsBreakdown } from '../app/engine/equipment';
import { regardParts } from '../app/engine/arbiterPersona';
import { wrongsLedger, AMENDS_TC_PER_WRONG } from '../app/engine/npcMemory';
import { planCommonGearSale, isCoatedGear } from '../app/engine/bulkSell';
import {
  weaponSubsectionOf, weaponRuns, WEAPON_SUBSECTION_ORDER, WEAPON_SUBSECTION_LABEL,
} from '../app/components/InventoryCategorize';
import { WEAPONS } from '../app/engine/crafting';
import { LONG_WEAPON_RE } from '../app/engine/combatRules';
import type { InventoryItem, PlayerCharacter, Stats, StatusEffect, NpcRelation } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';

const ROOT = join(__dirname, '..');
const PORTRAIT = readFileSync(join(ROOT, 'app', 'components', 'StatsPanel.tsx'), 'utf8');
const SHEET = readFileSync(join(ROOT, 'app', 'screens', 'CharacterScreen.tsx'), 'utf8');
const PACK = readFileSync(join(ROOT, 'app', 'screens', 'InventoryScreen.tsx'), 'utf8');
const VENDOR = readFileSync(join(ROOT, 'app', 'screens', 'VendorScreen.tsx'), 'utf8');
const EQUIP = readFileSync(join(ROOT, 'app', 'engine', 'equipment.ts'), 'utf8');

const BASE_STATS: Stats = { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 2 };

function makePlayer(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'unknowing_mass',
    factionId: 'reclaimers_guild',
    stats: { ...BASE_STATS },
    hp: 30, hpMax: 30, stamina: 10, staminaMax: 10,
    milestones: { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 },
    equipped: {},
    ac: 12, tc: 100, corruption: 0,
    inventory: [],
    factionStanding: [],
    ...placedAt('tartarian_outskirts'),
    activeQuests: [],
    mapSeed: 'test|test|test|0',
    ...overrides,
  } as PlayerCharacter;
}

const STAT_KEYS = ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth'] as const;

describe('OTA-1683 — ⚠ STE on the small portrait', () => {
  it('the portrait row carries all six attributes now', () => {
    expect(PORTRAIT.includes('<Stat label="STE" value={formatStat(player.stats.stealth ?? 0, eff.stealth)} />')).toBe(true);
    for (const l of ['STR', 'DEX', 'INT', 'WIS', 'CHA']) expect(PORTRAIT.includes(`<Stat label="${l}"`)).toBe(true);
  });
});

describe('OTA-1683 — ⚠⚠⚠ one arithmetic: the sheet and the dice read the same sum', () => {
  it('⚠⚠⚠ THE FOUR SOURCES THE SHEET WAS MISSING now show, and the totals agree on every stat', () => {
    const stoneMark: StatusEffect = { kind: 'stone_marked', remainingRounds: 9, buffStat: 'strength', buffBonus: 2 } as StatusEffect;
    const chilled: StatusEffect = { kind: 'chilled', remainingRounds: 3 } as StatusEffect;
    const p = makePlayer({
      statusEffects: [stoneMark, chilled],
      aetherBuff: { stat: 'wisdom', bonus: 3, expiresAtMs: Date.now() + 60_000 },
      earnedTitles: ['skyreacher'],
    } as Partial<PlayerCharacter>);
    const b = effectiveStatsBreakdown(p);
    const e = effectiveStats(p);
    for (const k of STAT_KEYS) expect(e[k]).toBe(b[k].total);
    // Each of the four names itself on the sheet.
    expect(b.strength.sources.some((s) => s.label === "the stone's mark" && s.delta === 2)).toBe(true);
    expect(b.dexterity.sources.some((s) => s.label === 'chilled' && s.delta === -2)).toBe(true);
    expect(b.wisdom.sources.some((s) => s.label === 'Aether Dust' && s.delta === 3)).toBe(true);
    expect(b.dexterity.sources.some((s) => s.label === 'titles' && s.delta > 0)).toBe(true);
    // And every listed source sums to the printed total — no silent arithmetic.
    for (const k of STAT_KEYS) {
      expect(b[k].base + b[k].sources.reduce((s, x) => s + x.delta, 0)).toBe(b[k].total);
    }
  });

  it('⚠⚠ the floor the dice apply is on the sheet too, and it is listed', () => {
    // Hollowed: −2 on everything; a base of 1 would go to −1 in the naive sum.
    const p = makePlayer({ corruption: 100, stats: { ...BASE_STATS, charisma: 1, stealth: 0 } });
    const b = effectiveStatsBreakdown(p);
    expect(b.charisma.total).toBe(1);
    expect(b.charisma.sources.some((s) => s.label === 'floor' && s.delta === 2)).toBe(true);
    // Stealth floors at 0, not 1 — an untrained character has none.
    expect(b.stealth.total).toBe(0);
    expect(effectiveStats(p).charisma).toBe(1);
    expect(effectiveStats(p).stealth).toBe(0);
  });

  it('⚠⚠ there is ONE sum in the source: effectiveStats reads the breakdown\'s totals', () => {
    const fn = EQUIP.slice(EQUIP.indexOf('export function effectiveStats('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body.includes('const b = effectiveStatsBreakdown(player, weatherMod);')).toBe(true);
    expect(body.includes('strength: b.strength.total,')).toBe(true);
    expect(body.includes('Math.max(1, player.stats')).toBe(false);
  });

  it('a clean character still has no sources and total === base (the OTA 040 contract holds)', () => {
    const b = effectiveStatsBreakdown(makePlayer());
    expect(b.strength.sources).toHaveLength(0);
    expect(b.strength.total).toBe(b.strength.base);
  });
});

describe('OTA-1683 — ⚠⚠ the wrongs row opens', () => {
  const rel = (over: Partial<NpcRelation>): NpcRelation => ({
    id: 'x', name: 'Somebody', firstMetAt: 0, lastSeenAt: 0, lastSeenHours: 0,
    meetings: 1, trades: 0, tcTraded: 0, contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0,
    ...over,
  } as NpcRelation);
  const wm = {
    npcRelations: {
      skiv: rel({ id: 'skiv', name: 'Skiv', role: 'trader', wrongs: 2, amendsTc: 300 }),
      paid: rel({ id: 'paid', name: 'Paid Off', wrongs: 1, amendsCleared: 1 }),
      clean: rel({ id: 'clean', name: 'Clean', wrongs: 0 }),
    },
  };

  it('the regard part is marked drillable, like the gifts row', () => {
    const parts = regardParts({ corruption: 0, menace: 0, factionStanding: [], storyChoices: {}, pressure: undefined, titleProgress: undefined } as never, wm as never);
    const wrongs = parts.find((p) => p.label.includes('still standing'));
    expect(wrongs?.label).toBe('2 wrongs still standing');
    expect(wrongs?.kind).toBe('wrongs');
  });

  it('⚠⚠ the ledger names who, how many, and what clears the next one — from the same relations', () => {
    const led = wrongsLedger(wm as never);
    expect(led).toHaveLength(1);
    expect(led[0]).toEqual({ npcId: 'skiv', name: 'Skiv', role: 'trader', outstanding: 2, banked: 300, owed: AMENDS_TC_PER_WRONG * 2 - 300 });
    expect(wrongsLedger(null)).toEqual([]);
  });

  it('the sheet drills the wrongs row, and prints the rule', () => {
    // ⚠ OTA-1716 — the two hand-rolled booleans this used to pin (`giftsOpen` /
    // `wrongsOpen`) are gone. Keeping a row tappable meant adding state and a
    // branch per row, which is precisely why every OTHER row in the section
    // stayed flat until the owner tapped it and reported it. One open-set keyed
    // by row index replaced them; the wrongs LEDGER, which is what this test is
    // actually about, is unchanged.
    expect(SHEET.includes("if (part.kind === 'wrongs') {")).toBe(true);
    expect(SHEET.includes('onPress={() => togglePart(i)}')).toBe(true);
    expect(SHEET.includes('spend {e.owed} TC at their counter to clear the next')).toBe(true);
    expect(SHEET.includes('{AMENDS_TC_PER_WRONG} TC per wrong')).toBe(true);
  });
});

describe('OTA-1683 — ⚠⚠ the sweep steps around coated gear', () => {
  const gear = (name: string, over: Partial<InventoryItem> = {}): InventoryItem => ({
    id: `i_${name}_${Math.random().toString(36).slice(2, 6)}`, name, kind: 'weapon', rarity: 'Common',
    quantity: 1, tags: ['weapon'], ...over,
  } as InventoryItem);

  it('a coated Common weapon is spared and counted; an uncoated one still sells', () => {
    const coated = gear('Cudgel', { coating: { kind: 'poison', dice: '1d4', label: 'Poisoned' } });
    const dual = gear('Cudgel', { coating2: { kind: 'acid', dice: '1d4', label: 'Acid-etched' }, coatingSlots: 2 });
    const plain = gear('Cudgel');
    expect(isCoatedGear(coated)).toBe(true);
    expect(isCoatedGear(dual)).toBe(true);
    expect(isCoatedGear(plain)).toBe(false);
    const plan = planCommonGearSale([{ item: coated, price: 9 }, { item: dual, price: 9 }, { item: plain, price: 9 }]);
    expect(plan.rows.map((r) => r.item.id)).toEqual([plain.id]);
    expect(plan.count).toBe(1);
    expect(plan.total).toBe(9);
    expect(plan.sparedCoated).toBe(2);
  });

  it('a coated piece that was not Common gear anyway is not counted as spared', () => {
    const rare = gear('Cudgel', { rarity: 'Rare', coating: { kind: 'poison', dice: '1d4', label: 'Poisoned' } });
    expect(planCommonGearSale([{ item: rare, price: 40 }]).sparedCoated).toBe(0);
  });

  it('the confirm says how many it stepped around, and the boundary line names coatings', () => {
    expect(VENDOR.includes('const spared = planCommonGearSale(bulkSellable).sparedCoated;')).toBe(true);
    expect(VENDOR.includes('a coating is work you did')).toBe(true);
    expect(VENDOR.includes('and anything you coated are left alone')).toBe(true);
  });
});

describe('OTA-1683 — ⚠⚠ the Weapons section reads in runs', () => {
  const inst = (name: string, over: Partial<InventoryItem> = {}): InventoryItem => ({
    id: `w_${name}`, name, kind: 'weapon', rarity: 'Common', quantity: 1, tags: [], ...over,
  } as InventoryItem);
  const melee = WEAPONS.find((w) => w.weaponKind === 'melee' && !LONG_WEAPON_RE.test(w.name) && !w.tags.some((t) => /throw/i.test(t)))!;
  const long = WEAPONS.find((w) => w.weaponKind === 'melee' && LONG_WEAPON_RE.test(w.name) && !w.tags.some((t) => /throw/i.test(t)))!;
  const ranged = WEAPONS.find((w) => w.weaponKind === 'ranged' && !w.tags.some((t) => /throw/i.test(t)))!;
  const caster = WEAPONS.find((w) => w.weaponKind === 'runecaster')!;

  it('each class resolves by the same rule combat uses', () => {
    expect(weaponSubsectionOf(inst(melee.name))).toBe('melee');
    expect(weaponSubsectionOf(inst(long.name))).toBe('long');
    expect(weaponSubsectionOf(inst(ranged.name))).toBe('ranged');
    expect(weaponSubsectionOf(inst(caster.name, { kind: 'runecaster' }))).toBe('runecaster');
    expect(weaponSubsectionOf(inst('Shaped Aetheric Shard', { kind: 'misc', tags: ['throwable', 'aether'] }))).toBe('throwable');
  });

  it('runs come out in the fixed order, empty runs dropped, every row placed once', () => {
    const rows = [inst(caster.name, { kind: 'runecaster' }), inst(long.name), inst(melee.name), inst(ranged.name)];
    const runs = weaponRuns(rows);
    expect(runs.map((r) => r.sub)).toEqual(['melee', 'long', 'ranged', 'runecaster']);
    expect(runs.flatMap((r) => r.items).length).toBe(rows.length);
    expect(WEAPON_SUBSECTION_ORDER).toEqual(['melee', 'long', 'ranged', 'runecaster', 'throwable']);
    expect(WEAPON_SUBSECTION_LABEL.long).toBe('Spears & polearms');
  });

  it('the pack renders the runs under the Weapons header, and every other section is one unlabelled run', () => {
    expect(PACK.includes("? weaponRuns(items).map((run) => ({ label: WEAPON_SUBSECTION_LABEL[run.sub], items: run.items }))")).toBe(true);
    expect(PACK.includes(': [{ label: null as string | null, items }]')).toBe(true);
    expect(PACK.includes('styles.weaponSubLabel')).toBe(true);
  });
});
