// OTA-1116 — THE ELITE SWAP.
//
// The last of OTA-1113's nine dials to find a consumer, and the one the survey
// the owner brought back rates highest: the CONTENT lever. A multiplier makes
// the same fight longer — this project has been bitten by that once, and it is
// why scaledPackSize is welded to scaledSwingCap. A content swap makes the
// fight different.
//
// What this suite actually guards is that the swap costs the player NOTHING it
// did not mean to cost. Three specific ways it could have been a fake-difficulty
// change, all of them tested here:
//   1. an elite weaker or stronger than the party it replaced (durability),
//   2. an elite that pays one corpse's loot for a four-body fight (the carry),
//   3. an elite firing where a party is the content (bosses, small groups).

import fs from 'fs';
import path from 'path';
import {
  ELITE_MIN_PARTY,
  rarityStepUp,
  eliteNounFor,
  shouldSwapToElite,
  foldPartyIntoElite,
  eliteExtraLootRolls,
} from '../app/engine/eliteSwap';
import { PRESSURE_PROFILES } from '../app/engine/pressure';
import type { Enemy } from '../app/engine/types';

const foe = (name: string, hp: number, extra: Partial<Enemy> = {}): Enemy => ({
  name, hp, rarity: 'Uncommon', loot: [], ...extra,
} as unknown as Enemy);

const party = (n: number, hp = 10): Enemy[] =>
  Array.from({ length: n }, (_, i) => foe(`Grunt ${i + 1}`, hp));

const OPTS = { factionName: 'Mud Monarchs', noun: 'Patrol' };

describe('OTA-1116 — the dial decides, and `owed` never sees it', () => {
  it('⚠ the identity row is still identity: elite is 0 at owed, and at salvage', () => {
    expect(PRESSURE_PROFILES.owed.elite).toBe(0);
    expect(PRESSURE_PROFILES.salvage.elite).toBe(0);
  });

  it('a zero dial never swaps, whatever the party size or the roll', () => {
    for (const n of [3, 4, 8]) {
      expect(shouldSwapToElite(n, { eliteMult: 0, rand: () => 0 })).toBe(false);
    }
  });

  it('the harder tiers do swap, and bury_me more often than let_it_come', () => {
    expect(PRESSURE_PROFILES.let_it_come.elite).toBeGreaterThan(0);
    expect(PRESSURE_PROFILES.bury_me.elite)
      .toBeGreaterThan(PRESSURE_PROFILES.let_it_come.elite);
  });

  it('the roll is a probability, not a multiplier — it respects the number', () => {
    expect(shouldSwapToElite(4, { eliteMult: 0.3, rand: () => 0.29 })).toBe(true);
    expect(shouldSwapToElite(4, { eliteMult: 0.3, rand: () => 0.31 })).toBe(false);
  });

  it('⚠ a party of two is never swapped — that is subtraction, not a swap', () => {
    expect(ELITE_MIN_PARTY).toBe(3);
    expect(shouldSwapToElite(2, { eliteMult: 1, rand: () => 0 })).toBe(false);
    expect(shouldSwapToElite(1, { eliteMult: 1, rand: () => 0 })).toBe(false);
    expect(shouldSwapToElite(3, { eliteMult: 1, rand: () => 0 })).toBe(true);
  });
});

describe('OTA-1116 — the elite is exactly as durable as the party it replaced', () => {
  it('⚠ its HP budget is the pack total, to the point — no new constant', () => {
    // This is the whole reason the fold runs on the SCALED party. If this ever
    // stops being an exact sum, someone has invented an elite multiplier and
    // the difficulty of a swapped encounter has silently drifted off the pack's.
    const p = [foe('A', 11), foe('B', 13), foe('C', 17), foe('D', 19)];
    const out = foldPartyIntoElite(p, OPTS)!;
    expect(out.hpBudget).toBe(11 + 13 + 17 + 19);
    expect(out.elite.hp).toBe(out.hpBudget);
  });

  it('an uneven party still sums exactly, including a one-HP body', () => {
    const out = foldPartyIntoElite([foe('A', 1), foe('B', 2), foe('C', 3)], OPTS)!;
    expect(out.hpBudget).toBe(6);
  });

  it('the elite is seeded from the TOUGHEST body — one of them, more than the rest', () => {
    const p = [foe('Weak', 5, { flavor: 'w' }), foe('Strong', 40, { flavor: 's' }), foe('Mid', 12)];
    const out = foldPartyIntoElite(p, OPTS)!;
    expect(out.elite.flavor).toBe('s');
  });
});

describe('OTA-1116 — it is a NAMED body, not a silent stat inflation', () => {
  it('the name carries the faction and a title, and no numeric index', () => {
    const out = foldPartyIntoElite(party(4), OPTS)!;
    expect(out.elite.name).toBe('Mud Monarchs Patrol Warden');
    expect(out.elite.name).not.toMatch(/\d/);
  });

  it('a party noun with no authored title still gets a sensible one', () => {
    expect(eliteNounFor('Raider')).toBe('Reaver-Captain');
    expect(eliteNounFor('Skirmisher')).toBe('Skirmisher Warden');
  });

  it('rarity steps up exactly one tier and stops at the top', () => {
    expect(rarityStepUp('Common')).toBe('Uncommon');
    expect(rarityStepUp('Uncommon')).toBe('Rare');
    expect(rarityStepUp('Rare')).toBe('Legendary');
    expect(rarityStepUp('Legendary')).toBe('Legendary');
  });

  it('the parser can still reach it — the old nouns stay as aliases', () => {
    const out = foldPartyIntoElite(party(3), OPTS)!;
    expect(out.elite.aliases).toContain('patrol');
    expect(out.elite.aliases).toContain('warden');
    expect(out.elite.aliases).toContain('elite');
  });

  it('aliases are deduped — a seed that already listed the noun does not double it', () => {
    const p = party(3).map((e) => ({ ...e, aliases: ['patrol', 'elite'] }));
    const out = foldPartyIntoElite(p, OPTS)!;
    const seen = out.elite.aliases ?? [];
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('OTA-1116 — ⚠ the carry, which is the only way this could underpay', () => {
  it('a corpse that replaced four bodies owes three extra loot rolls', () => {
    // One body's worth is already in the rarity roll; the carry is n-1.
    expect(eliteExtraLootRolls({ eliteReplaced: 4 })).toBe(3);
    expect(eliteExtraLootRolls({ eliteReplaced: 3 })).toBe(2);
  });

  it('an ordinary enemy is owed nothing — no field, no change', () => {
    expect(eliteExtraLootRolls({})).toBe(0);
    expect(eliteExtraLootRolls({ eliteReplaced: undefined })).toBe(0);
    expect(eliteExtraLootRolls({ eliteReplaced: 1 })).toBe(0);
    expect(eliteExtraLootRolls({ eliteReplaced: 0 })).toBe(0);
  });

  it('the fold records the count it must be paid for', () => {
    expect(foldPartyIntoElite(party(4), OPTS)!.elite.eliteReplaced).toBe(4);
  });
});

describe('OTA-1116 — the things it must never touch', () => {
  it('⚠ a party containing a boss is never folded', () => {
    const p = [foe('A', 10), foe('B', 10), foe('Boss', 90, { boss: true })];
    expect(foldPartyIntoElite(p, OPTS)).toBeNull();
  });

  it('a party under the minimum is refused at the fold too, not just the roll', () => {
    expect(foldPartyIntoElite(party(2), OPTS)).toBeNull();
    expect(foldPartyIntoElite([], OPTS)).toBeNull();
  });
});

describe('OTA-1116 — the store wires it where a party spawns, and nowhere else', () => {
  const store: string = fs.readFileSync(
    path.join(__dirname, '../app/state/gameStore.ts'), 'utf8');

  it('the swap is driven by the tier profile, not a local constant', () => {
    expect(store).toContain('const eliteMult = profileOf(player).elite;');
    expect(store).toContain('eliteSwapMod.shouldSwapToElite(scaled.length, { eliteMult })');
  });

  it('⚠ the fold runs AFTER pack scaling — that is where the HP budget comes from', () => {
    // Sliced to the function's OWN body (column-0 closing brace) rather than a
    // magic character count — anchoring on a length is how an assertion breaks
    // on someone else's edit, which is the least useful kind of red there is.
    const from = store.indexOf('function injectFactionParty(');
    const fn = store.slice(from, store.indexOf('\n}\n', from));
    const scaleAt = fn.indexOf('scaleEncounterForContext(party, packDanger, power)');
    const foldAt = fn.indexOf('foldPartyIntoElite');
    expect(scaleAt).toBeGreaterThan(-1);
    expect(foldAt).toBeGreaterThan(-1);
    expect(scaleAt).toBeLessThan(foldAt);
  });

  it('⚠ and the single body is RE-scaled through the solo branch, then given the pack HP', () => {
    // Durability from the pack, aggression from the solo. Losing either half
    // makes the elite either a pushover or a spike.
    expect(store).toContain('scaleEncounterForContext([folded.elite], packDanger, power)');
    expect(store).toContain('hp: folded.hpBudget');
  });

  it('the loot path pays the carry, and rides the roll count rather than a flat grant', () => {
    expect(store).toContain('eliteMod.eliteExtraLootRolls(enemy)');
    expect(store).toContain('+ eliteMod.eliteExtraLootRolls(enemy);');
  });

  it('⚠ the announce line stops claiming a headcount that is no longer true', () => {
    expect(store).toContain('No war party crests the rise — one figure does.');
    expect(store).toContain('works the ground near their outpost alone');
  });

  it('the injector reports what landed, and a failed spawn is still falsy', () => {
    expect(store).toContain('type InjectedParty = { elite: Enemy | null } | null;');
    expect(store).toContain('return { elite: scaled.length === 1 && scaled[0]?.eliteReplaced ? scaled[0] : null };');
  });
});

describe('OTA-1116 — the audit is recorded so it is not re-litigated', () => {
  const src: string = fs.readFileSync(
    path.join(__dirname, '../app/engine/eliteSwap.ts'), 'utf8');

  it('states that there are no kill-count objectives to break', () => {
    expect(src).toContain('There are NO "kill N of X" objectives in the game');
  });

  it('records that the HP milestone keys on DISTINCT types, so nothing is lost', () => {
    expect(src).toContain('DISTINCT enemy types, not total kills');
  });

  it('⚠ warns that hunts match by exact name and must never be touched', () => {
    expect(src).toContain('Hunts match their target by EXACT NAME');
  });

  it('names the no-new-constants rule that makes the durability claim checkable', () => {
    expect(src).toContain('NO NEW BALANCE CONSTANTS');
  });

  it('says why this lever and not another multiplier', () => {
    expect(src).toContain('makes the same fight LONGER');
    expect(src).toContain('ANTI-`pack`');
  });
});
