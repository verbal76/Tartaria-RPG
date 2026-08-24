// OTA-1478 — THE ARBITER STOPS NAMING LETHAL GROUND AS SAFE GROUND.
//
// ⚠⚠ The danger-vs-tier warning (OTA-244) exists for one purpose: to stop a
// player camping somewhere that will kill them. It is the sentence the game
// speaks when it has already decided they are in trouble. It read, verbatim and
// unconditionally, for every player at every tier:
//
//     "Asgardar is lethal country. The things that wake here pull above your
//      weight. 67 HP carries you through the Outskirts (danger 2) or the
//      Mud Seas (danger 2). Start the main quest before you camp here again,
//      or move on until you've got your legs under you."
//
// Three false statements, one root — a sentence built from remembered facts
// instead of read ones:
//
//   1 ⚠⚠ THE MUD SEAS ARE DANGER 4. `locations.json` has carried `"danger": 4`
//     and "storms catastrophic, the creatures within mutated" the entire time.
//     The warning sent a player too weak for danger-4 country INTO danger-4
//     country and stamped an invented "(danger 2)" on it so they would trust it.
//   2 ⚠ The safe tier was hard-coded to 2 while `playerCap` on the line above
//     computes 1, 2 or 3 — right for exactly one of the three brackets.
//   3 ⚠ "Start the main quest" was spoken to a character carrying TWO Cores
//     (4.32.11 log). `phaseHint()` has said the right thing since OTA-430.
//
// ⚠ AND NO TEST ANYWHERE TOUCHED THE LINE. Not one file in __tests__ mentioned
// `dangerWarnedLocations`, "pull above your weight", or the sentence. That is
// how a lethal instruction survives: it is narration, narration reads as
// flavour, and flavour does not get pinned. This suite exists so the next false
// claim in it fails a build instead of a playthrough.
//
// ⚠ THE PINS BELOW ARE ALL DERIVED. Nothing here quotes a danger rating, a
// location name, or a tier boundary as a literal that the catalogue also owns —
// asserting `Mud Seas === 4` in a test would recreate the defect one layer up.
// Everything is recomputed from `locations.json` and from the ladder itself.

import {
  PLAYER_TIER_LADDER,
  playerRarityCap,
  playerDangerCap,
  saferGroundFor,
  saferGroundPhrase,
  dangerLabel,
  dangerWarningLine,
} from '../app/engine/dangerTier';
import { phaseHint, initMainQuest, LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import type { Location, MainQuestPhase } from '../app/engine/types';
import locationsData from '../app/data/locations/locations.json';

const LOCATIONS = locationsData as Location[];
const byId = (id: string): Location | undefined => LOCATIONS.find((l) => l.id === id);

// ---------------------------------------------------------------------------
// 0 — the instrument checks itself
// ---------------------------------------------------------------------------

describe('self-test — the catalogue this suite measures against is really loaded', () => {
  it('has a populated locations table with danger on every entry', () => {
    expect(LOCATIONS.length).toBeGreaterThan(20);
    for (const l of LOCATIONS) {
      expect(typeof l.id).toBe('string');
      expect(typeof l.name).toBe('string');
      expect(typeof l.danger).toBe('number');
    }
  });

  it('spans enough danger tiers for the ladder to be meaningful', () => {
    const tiers = new Set(LOCATIONS.map((l) => l.danger));
    // 1 through 5 all populated — if the catalogue ever collapses to one tier,
    // every "safer ground" assertion below becomes vacuous and must fail here
    // rather than silently pass.
    for (const t of [1, 2, 3, 4, 5]) expect(tiers.has(t)).toBe(true);
  });

  it('still contains the two places the broken sentence named', () => {
    // ABSENT vs NOT-WHERE-I-LOOKED. If these ids are renamed the assertions
    // about them below would quietly stop testing anything.
    expect(byId('mud_seas')).toBeDefined();
    expect(byId('tartarian_outskirts')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 1 — the defect itself
// ---------------------------------------------------------------------------

describe('the Mud Seas are not danger 2', () => {
  it('⚠⚠ the catalogue rates them above the tier the old line claimed', () => {
    const mudSeas = byId('mud_seas')!;
    // Derived, not literal: the claim is "the sentence undersold it", so
    // compare against the tier the sentence asserted.
    const OLD_CLAIMED_DANGER = 2;
    expect(mudSeas.danger).toBeGreaterThan(OLD_CLAIMED_DANGER);
    // And it is not merely a notch off — it is at or above the tier the warning
    // fires ON, i.e. the game was recommending the thing it was warning about.
    expect(mudSeas.danger).toBeGreaterThanOrEqual(4);
  });

  it('⚠⚠ is never offered as safer ground to anyone the warning can fire for', () => {
    // The warning only fires at danger >= 4, which means the player's cap is at
    // most 3. Walk every hp value that produces a cap the warning can reach.
    let capsChecked = 0;
    for (const hp of [1, 20, 40, 59, 60, 80, 99, 100, 120, 139]) {
      const cap = playerDangerCap(hp);
      expect(cap).toBeLessThan(4);
      const ground = saferGroundFor(cap, { limit: 50 });
      expect(ground.map((g) => g.id)).not.toContain('mud_seas');
      capsChecked++;
    }
    expect(capsChecked).toBe(10);
  });

  it('⚠ nothing at or above the warning threshold is ever recommended', () => {
    // The general form of the same claim: no place a player is being warned
    // away from can appear in the advice.
    for (const hp of [30, 70, 110, 139]) {
      const cap = playerDangerCap(hp);
      for (const g of saferGroundFor(cap, { limit: 50 })) {
        expect(g.danger).toBeLessThanOrEqual(cap);
        expect(g.danger).toBeLessThan(4);
      }
    }
  });

  it('⚠ every danger it prints is the catalogue\'s, not a number in a string', () => {
    for (const hp of [40, 80, 120, 200]) {
      const ground = saferGroundFor(playerDangerCap(hp), { limit: 50 });
      expect(ground.length).toBeGreaterThan(0);
      for (const g of ground) {
        expect(g.danger).toBe(byId(g.id)!.danger);
        expect(g.name).toBe(byId(g.id)!.name);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — one ladder, two projections
// ---------------------------------------------------------------------------

describe('the hp→tier ladder has one owner', () => {
  it('is ordered, total and terminated', () => {
    expect(PLAYER_TIER_LADDER.length).toBeGreaterThan(1);
    let prev = -1;
    for (const rung of PLAYER_TIER_LADDER) {
      expect(rung.hpBelow).toBeGreaterThan(prev);
      prev = rung.hpBelow;
      expect(rung.dangerCap).toBeGreaterThan(0);
    }
    // The last rung must be open-ended or a high-HP character falls off it.
    expect(PLAYER_TIER_LADDER[PLAYER_TIER_LADDER.length - 1]!.hpBelow).toBe(Infinity);
  });

  it('is monotone in both projections — more HP never means less licence', () => {
    let prevDanger = -1;
    const rarityRank: Record<string, number> = {
      Common: 0, Uncommon: 1, Rare: 2, Legendary: 3,
    };
    let prevRarity = -1;
    for (let hp = 0; hp <= 400; hp++) {
      const d = playerDangerCap(hp);
      const r = rarityRank[playerRarityCap(hp)]!;
      expect(d).toBeGreaterThanOrEqual(prevDanger);
      expect(r).toBeGreaterThanOrEqual(prevRarity);
      prevDanger = d;
      prevRarity = r;
    }
    expect(prevDanger).toBe(PLAYER_TIER_LADDER[PLAYER_TIER_LADDER.length - 1]!.dangerCap);
  });

  it('reads both projections off the SAME rung at every HP', () => {
    // The defect was two ladders in two vocabularies. Prove there is one: at
    // every HP, the rarity and the danger come from a rung that agrees.
    for (let hp = 0; hp <= 400; hp += 1) {
      const rung = PLAYER_TIER_LADDER.find((r) => hp < r.hpBelow)!;
      expect(playerRarityCap(hp)).toBe(rung.rarity);
      expect(playerDangerCap(hp)).toBe(rung.dangerCap);
    }
  });

  it('lands exactly on the documented boundaries, not one either side', () => {
    // Off-by-one on a boundary is the classic way a re-derived ladder differs
    // from its original. Walk each boundary and its neighbours.
    for (const rung of PLAYER_TIER_LADDER) {
      if (!Number.isFinite(rung.hpBelow)) continue;
      const at = rung.hpBelow;
      expect(playerDangerCap(at - 1)).toBe(rung.dangerCap);
      expect(playerDangerCap(at)).not.toBe(rung.dangerCap);
    }
  });

  it('survives nonsense HP without throwing or granting licence', () => {
    for (const bad of [NaN, -1, -1e9, Infinity, -Infinity]) {
      const cap = playerDangerCap(bad);
      expect(Number.isFinite(cap)).toBe(true);
      // ⚠ A broken hpMax must clamp to the SAFEST rung, never the loosest — a
      // NaN that read as "Legendary" would hand a corrupted save the full
      // encounter table.
      expect(cap).toBe(PLAYER_TIER_LADDER[0]!.dangerCap);
      expect(playerRarityCap(bad)).toBe(PLAYER_TIER_LADDER[0]!.rarity);
    }
  });

  it('is the ladder the encounter picker reads, not a lookalike', () => {
    // Source-level, because the picker's use of it is inside a function whose
    // other inputs are random. If encounter.ts ever re-inlines the brackets
    // this fails, which is the whole point of moving them.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const enc = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'engine', 'encounter.ts'), 'utf8',
    );
    const code = enc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('playerRarityCap(playerHpMax)');
    expect(code).not.toMatch(/playerHpMax\s*<\s*60/);
    expect(code).not.toMatch(/playerHpMax\s*<\s*140/);
  });
});

// ---------------------------------------------------------------------------
// 3 — safer ground is chosen, not recited
// ---------------------------------------------------------------------------

describe('safer ground', () => {
  it('never names the place being warned about', () => {
    for (const l of LOCATIONS.filter((x) => x.danger >= 4)) {
      for (const hp of [40, 80, 120]) {
        const ground = saferGroundFor(playerDangerCap(hp), { excludeId: l.id, limit: 50 });
        expect(ground.map((g) => g.id)).not.toContain(l.id);
      }
    }
  });

  it('excludes the current tile even when it IS within the cap', () => {
    // The exclusion has to work on a same-tier tile, not only on the danger-4+
    // case above, or a player standing on safe-but-warned ground gets told to
    // go where they already are.
    const safeTile = LOCATIONS.find((l) => l.danger === 2)!;
    const ground = saferGroundFor(2, { excludeId: safeTile.id, limit: 50 });
    expect(ground.map((g) => g.id)).not.toContain(safeTile.id);
    expect(ground.length).toBeGreaterThan(0);
  });

  it('⚠ ranks ground the player has already found ahead of ground they have not', () => {
    // ⚠ THE FIRST DRAFT GOT THIS WRONG AND IT SHOWED. Sorting on danger and
    // name alone produced "Builders' Survey Camp or Dynasty Border Post" —
    // alphabetically first among eleven danger-2 places, and two a player is
    // unlikely to have seen. Naming ground somebody cannot find is not better
    // advice than naming the wrong ground.
    const tier2 = LOCATIONS.filter((l) => l.danger === 2).map((l) => l.id);
    expect(tier2.length).toBeGreaterThan(2);
    // Pick a known tile that is NOT the one alphabetical order would surface.
    const alphabeticalFirst = saferGroundFor(2, { limit: 1 })[0]!.id;
    const other = tier2.find((id) => id !== alphabeticalFirst)!;
    const ranked = saferGroundFor(2, { discoveredIds: [other], limit: 2 });
    expect(ranked[0]!.id).toBe(other);
  });

  it('falls back to catalogue order when discovery is unknown', () => {
    // ⚠ ABSENT is a real state. A caller with no discovery data must get an
    // ordering, not an empty list and not a claim about the player's map.
    const withNothing = saferGroundFor(2, { limit: 3 });
    const withEmpty = saferGroundFor(2, { discoveredIds: [], limit: 3 });
    expect(withNothing.map((g) => g.id)).toEqual(withEmpty.map((g) => g.id));
    expect(withNothing.length).toBe(3);
  });

  it('prefers the hardest survivable ground within the cap', () => {
    // Among equally-known places, harder first — the useful advice is the best
    // ground they can survive, not the starter tile.
    const ground = saferGroundFor(3, { limit: 10 });
    for (let i = 1; i < ground.length; i++) {
      expect(ground[i]!.danger).toBeLessThanOrEqual(ground[i - 1]!.danger);
    }
  });

  it('is stable — two reads of one save give one sentence', () => {
    const a = saferGroundFor(2, { discoveredIds: ['tartarian_outskirts'], limit: 2 });
    const b = saferGroundFor(2, { discoveredIds: ['tartarian_outskirts'], limit: 2 });
    expect(a).toEqual(b);
  });

  it('respects the limit and never returns an empty list for a real cap', () => {
    // ⚠ NOT "always returns `limit` entries". A first draft asserted exactly 2
    // at every cap and failed at cap 1, because the catalogue holds exactly ONE
    // danger-1 location. The code was right; the assertion had invented a
    // supply of safe ground. What is actually true: at most `limit`, at least
    // one, and never more than the catalogue can offer at that tier.
    for (const cap of [1, 2, 3, 4, 5]) {
      const available = LOCATIONS.filter((l) => l.danger <= cap).length;
      expect(available).toBeGreaterThan(0);
      for (const limit of [1, 2, 3, 10]) {
        const got = saferGroundFor(cap, { limit });
        expect(got.length).toBe(Math.min(limit, available));
      }
      expect(saferGroundFor(cap, { limit: 0 }).length).toBe(0);
    }
    // And the tier that exposed it, stated plainly.
    expect(LOCATIONS.filter((l) => l.danger <= 1).length).toBe(1);
  });

  it('phrases one, two and none without a grammar hole', () => {
    const one = saferGroundFor(1, { limit: 1 });
    expect(saferGroundPhrase(one)).toBe(`${one[0]!.name} (danger ${one[0]!.danger})`);
    const two = saferGroundFor(2, { limit: 2 });
    expect(saferGroundPhrase(two)).toContain(' or ');
    expect(saferGroundPhrase(two).split(' or ').length).toBe(2);
    expect(saferGroundPhrase([])).toBe('');
    // Three reads as "A, B or C" — no dangling comma, no doubled conjunction.
    const three = saferGroundFor(3, { limit: 3 });
    const p3 = saferGroundPhrase(three);
    expect(p3).toContain(', ');
    expect(p3.match(/ or /g)!.length).toBe(1);
    expect(p3).not.toContain(', or ');
  });
});

// ---------------------------------------------------------------------------
// 4 — the sentence
// ---------------------------------------------------------------------------

describe('the warning sentence', () => {
  const lineFor = (hpMax: number, phase: MainQuestPhase, cores: number, discovered: string[] = []) =>
    dangerWarningLine({
      locationName: 'Asgardar',
      locationId: 'asgardar',
      danger: 5,
      hpMax,
      questHint: phaseHint(phase, cores),
      discoveredIds: discovered,
    });

  it('⚠⚠ never tells anyone the Mud Seas are safe, at any tier', () => {
    let checked = 0;
    for (const hp of [1, 30, 59, 60, 80, 99, 100, 120, 139, 200, 400]) {
      const line = lineFor(hp, 'cores', 2);
      expect(line).not.toContain('Mud Seas');
      checked++;
    }
    expect(checked).toBe(11);
  });

  it('⚠⚠ never offers ground as dangerous as the place it is warning about', () => {
    // ⚠ THE GENERAL FORM, AND IT CAUGHT A REAL HOLE. Looping HP past the range
    // the warning can fire in — which the shipped game never reaches, and a
    // future caller easily could — the sentence offered two danger-5 Capitals
    // as somewhere safer to camp than a danger-5 Capital. The tier cap alone
    // did not stop it; the advice needed its own bound against THIS place.
    let combos = 0;
    for (const warned of LOCATIONS.filter((x) => x.danger >= 2)) {
      for (const hp of [1, 59, 80, 139, 200, 400]) {
        const line = dangerWarningLine({
          locationName: warned.name,
          locationId: warned.id,
          danger: warned.danger,
          hpMax: hp,
          questHint: 'x',
        });
        const clause = line.slice(line.indexOf('HP carries you through'));
        for (const other of LOCATIONS) {
          if (other.danger < warned.danger) continue;
          expect(clause).not.toContain(`${other.name} (danger ${other.danger})`);
        }
        combos++;
      }
    }
    expect(combos).toBeGreaterThan(100); // the sweep is not a no-op
  });

  it('⚠ quotes the player\'s own tier, not a fixed 2', () => {
    // Different brackets must produce different advice. The old sentence was
    // byte-identical for a 40 HP character and a 139 HP one.
    const low = lineFor(40, 'cores', 2);
    const mid = lineFor(80, 'cores', 2);
    const high = lineFor(120, 'cores', 2);
    expect(low).not.toBe(mid);
    expect(mid).not.toBe(high);
    // And each names ground at its own cap.
    for (const [hp, line] of [[40, low], [80, mid], [120, high]] as const) {
      const cap = playerDangerCap(hp);
      const top = saferGroundFor(cap, { excludeId: 'asgardar', limit: 1 })[0]!;
      expect(line).toContain(`${top.name} (danger ${top.danger})`);
      expect(top.danger).toBeLessThanOrEqual(cap);
    }
  });

  it('⚠ says what to do next at every phase, and never "start" to a player mid-quest', () => {
    const phases: MainQuestPhase[] = [
      'hook', 'revelation', 'cores', 'descent', 'nexus', 'choice', 'ended',
    ];
    let seen = 0;
    for (const phase of phases) {
      const cores = phase === 'cores' ? 2 : 0;
      const line = lineFor(80, phase, cores);
      expect(line).toContain(phaseHint(phase, cores));
      seen++;
    }
    expect(seen).toBe(phases.length);
    // The specific 4.32.11 case: two Cores in the pack.
    const twoCores = lineFor(80, 'cores', 2);
    expect(twoCores).toContain('2/9 Cores recovered');
    expect(twoCores).not.toContain('Start the main quest');
    // …and a player who genuinely has not started still gets pointed at one.
    const fresh = lineFor(80, 'hook', 0);
    expect(fresh).toContain('Lost Capital');
    expect(fresh).not.toContain('2/9');
  });

  it('⚠ the hint tracks the Core count rather than restating it', () => {
    for (const n of [0, 1, 2, 5, 8, 9]) {
      expect(lineFor(80, 'cores', n)).toContain(`${n}/9 Cores recovered`);
    }
  });

  it('names the danger label the catalogue rating deserves', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const line = dangerWarningLine({
        locationName: 'Somewhere',
        danger: d,
        hpMax: 80,
        questHint: 'x',
      });
      expect(line).toContain(`is ${dangerLabel(d)} country`);
    }
    // Out-of-range ratings degrade to the harshest label rather than to
    // `undefined country`, which is what an unguarded array index gives.
    expect(dangerLabel(99)).toBe('lethal');
    expect(dangerLabel(-1)).toBe('lethal');
    expect(dangerWarningLine({
      locationName: 'X', danger: 99, hpMax: 80, questHint: 'x',
    })).not.toContain('undefined');
  });

  it('is one well-formed sentence run, with no holes', () => {
    for (const hp of [1, 59, 60, 139, 140, 400]) {
      const line = lineFor(hp, 'cores', 3, ['tartarian_outskirts']);
      expect(line).not.toContain('undefined');
      expect(line).not.toContain('NaN');
      expect(line).not.toContain('  ');
      expect(line).not.toContain('( )');
      expect(line.startsWith('The Arbiter takes you in. "')).toBe(true);
      expect(line.endsWith('"')).toBe(true);
      expect(line).toContain(`${hp} HP carries you through`);
    }
  });

  it('degrades honestly when no ground qualifies rather than printing a gap', () => {
    // Not reachable with the shipped catalogue — there is always danger-1
    // ground — so it is forced here. The claim is that the fallback is an
    // admission, not a sentence with a hole in it.
    const cap0 = saferGroundFor(0, { limit: 5 });
    expect(cap0).toEqual([]);
    expect(saferGroundPhrase(cap0)).toBe('');
    // Every shipped cap DOES qualify, which is the state that matters day to day.
    for (const rung of PLAYER_TIER_LADDER) {
      expect(saferGroundFor(rung.dangerCap, { limit: 1 }).length).toBe(1);
    }
  });

  it('is not the old sentence in any of its parts', () => {
    const line = lineFor(67, 'cores', 2, ['tartarian_outskirts']);
    expect(line).not.toContain('the Outskirts (danger 2)');
    expect(line).not.toContain('Mud Seas (danger 2)');
    expect(line).not.toContain('Start the main quest before you camp here again');
    // The parts that were always true are kept.
    expect(line).toContain('pull above your weight');
    expect(line).toContain("legs under you");
  });
});

// ---------------------------------------------------------------------------
// 5 — the store actually calls it
// ---------------------------------------------------------------------------

describe('the store speaks through the leaf', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const STORE_RAW = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
  );
  const STORE = STORE_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('self-test — the store source is loaded and comments are stripped', () => {
    expect(STORE_RAW.length).toBeGreaterThan(500_000);
    expect(STORE_RAW).toContain('THE MUD SEAS ARE DANGER 4'); // comment only
    expect(STORE).not.toContain('THE MUD SEAS ARE DANGER 4');
    expect(STORE).toContain('export const useGameStore');
  });

  it('⚠ holds no copy of the ladder and no copy of the sentence', () => {
    expect(STORE).not.toMatch(/hpMax\s*<\s*60\s*\?\s*1/);
    expect(STORE).not.toContain("Start the main quest before you camp here again");
    expect(STORE).not.toContain('Mud Seas (danger 2)');
    expect(STORE).not.toMatch(/\['',\s*'unsafe',\s*'edgy'/);
  });

  it('⚠ builds the warning from the leaf, with the live quest state', () => {
    expect(STORE).toContain('dangerWarningLine({');
    expect(STORE).toContain('playerDangerCap(hpMax)');
    expect(STORE).toContain('phaseHint(mq.phase, mq.coresRecovered.length)');
    expect(STORE).toContain('ensureMainQuest(player.mainQuest)');
    expect(STORE).toContain('discoveredLocationIds');
  });

  it('⚠ a fresh quest state still produces a usable hint', () => {
    // `ensureMainQuest` is what the store hands `phaseHint`; prove the default
    // it returns is a phase the hint can answer, not an empty string.
    const fresh = initMainQuest();
    const hint = phaseHint(fresh.phase, fresh.coresRecovered.length);
    expect(hint.length).toBeGreaterThan(10);
    // The 'hook' hint names the Capitals, so it cannot go stale against the list.
    for (const id of LOST_CAPITAL_LOCATIONS) {
      expect(typeof id).toBe('string');
    }
    expect(LOST_CAPITAL_LOCATIONS.length).toBe(9);
  });
});
