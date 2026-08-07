// OTA-1161 — THE SHEET SHOWS WHERE ITS NUMBERS CAME FROM.
//
// Owner, on his own character sheet: "for AC it shows your base and your buffs. HP
// just says HP not what my base number was so I can see the progression, I didn't
// roll a 29 at start. and instead of things given away under arbitor, it should say
// gifts given, and if you tap it, it should show you what you gave to whom and how
// they received it."
//
// Three asks, one theme, and it is the same theme as OTA-1158 and OTA-1160: the game
// knows something about the player that the player cannot see.

import { hpBreakdown, hpBreakdownLine, MILESTONE_KILL_STEP } from '../app/engine/hpBreakdown';
import { giftLedger, giftLedgerLine, REACTION_WORD } from '../app/engine/giftLedger';
import { regardParts } from '../app/engine/arbiterPersona';

import * as fs from 'fs';
import * as path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const SHEET = read('app', 'screens', 'CharacterScreen.tsx');

describe('OTA-1161 — HP says where it came from', () => {
  it('splits a baked hpMax into roll, milestones and gear', () => {
    const b = hpBreakdown(
      { hpMax: 29, equipped: {} },
      { defeatedEnemies: ['A', 'B', 'C', 'D', 'E', 'F'] },
    )!;
    expect(b.earned).toBe(2);            // 6 distinct / 3
    expect(b.gear).toBe(0);
    expect(b.base).toBe(27);             // recovered by subtraction
    expect(b.total).toBe(29);
    expect(b.base + b.earned + b.gear).toBe(b.total);
  });

  it('counts DISTINCT kinds, never the lifetime tally', () => {
    // ⚠ The distinction the owner was misinformed about earlier today. Grinding one
    // enemy pays nothing; the milestone keys off the set of names.
    const ground = hpBreakdown(
      { hpMax: 30, equipped: {} },
      { defeatedEnemies: Array(30).fill('Mud Skulker') },
    )!;
    expect(ground.distinctKills).toBe(1);
    expect(ground.earned).toBe(0);
  });

  it('reports how far the next +1 is', () => {
    for (const [n, left] of [[0, 3], [1, 2], [2, 1], [3, 3], [5, 1]] as const) {
      const names = Array.from({ length: n }, (_, i) => `foe${i}`);
      const b = hpBreakdown({ hpMax: 20, equipped: {} }, { defeatedEnemies: names })!;
      expect(`${n}→${b.toNextMilestone}`).toBe(`${n}→${left}`);
    }
  });

  it('never claims a base below 1, however odd the save', () => {
    // The base is a RESIDUAL. A save whose hpMax drifted (or a future grower this
    // file has not been taught about) must not render a negative or zero base.
    const b = hpBreakdown(
      { hpMax: 1, equipped: {} },
      { defeatedEnemies: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
    )!;
    expect(b.base).toBeGreaterThanOrEqual(1);
  });

  it('the line drops empty terms so a fresh character reads clean', () => {
    expect(hpBreakdownLine(hpBreakdown({ hpMax: 24, equipped: {} }, { defeatedEnemies: [] })))
      .toBe('base 24');
    expect(hpBreakdownLine(hpBreakdown({ hpMax: 29, equipped: {} }, { defeatedEnemies: ['a', 'b', 'c'] })))
      .toBe('base 28 · +1 earned');
    expect(hpBreakdownLine(null)).toBeNull();
  });

  it('the store awards the milestone with the constant the sheet explains it with', () => {
    // ⚠ The whole reason MILESTONE_KILL_STEP moved into engine/hpBreakdown. A
    // threshold the sheet QUOTES while the store AWARDS it must have one home —
    // the same cleanup OTA-1156 did for JOIN_THRESHOLD.
    expect(MILESTONE_KILL_STEP).toBe(3);
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain("import { MILESTONE_KILL_STEP } from '../engine/hpBreakdown';");
    expect(store).not.toMatch(/^const MILESTONE_KILL_STEP = \d/m);
    expect(store).toContain('checkMilestone(distinctKills, MILESTONE_KILL_STEP)');
  });

  it('the sheet renders it under the HP bar', () => {
    expect(SHEET).toContain('hpBreakdownLine(hpParts)');
    expect(SHEET).toContain('kinds beaten,');
  });
});

describe('OTA-1161 — the Arbiter row says "gifts given" and opens', () => {
  const rel = (name: string, gifts: unknown[]) => ({ name, wrongs: 0, trades: 0, gifts });

  it('the label is the owner\'s wording, not "things given away"', () => {
    const parts = regardParts(
      { corruption: 0, menace: 0, factionStanding: [], storyChoices: {} } as never,
      { npcRelations: { a: rel('Halem', [{ name: 'Mud Essence', atHours: 10 }]) } } as never,
    );
    const row = parts.find((p) => p.label.includes('gift'));
    expect(row?.label).toBe('1 gift given');
    expect(parts.some((p) => p.label.includes('given away'))).toBe(false);
  });

  it('pluralises, and marks itself drillable', () => {
    const parts = regardParts(
      { corruption: 0, menace: 0, factionStanding: [], storyChoices: {} } as never,
      { npcRelations: {
        a: rel('Halem', [{ name: 'X', atHours: 1 }, { name: 'Y', atHours: 2 }]),
      } } as never,
    );
    const row = parts.find((p) => p.label.includes('gift'))!;
    expect(row.label).toBe('2 gifts given');
    expect(row.kind).toBe('gifts');
  });
});

describe('OTA-1161 — the ledger says what, to whom, and how it landed', () => {
  const WM = {
    npcRelations: {
      halem: { name: 'Halem', wrongs: 0, trades: 0, gifts: [
        { name: 'Mud Essence', atHours: 10, reaction: 'loved', standingDelta: 4 },
        { name: 'Cracked Lens', atHours: 50, reaction: 'insulted', standingDelta: -2 },
      ] },
      odar: { name: 'Odar Flameforge', wrongs: 0, trades: 0, gifts: [
        { name: 'Core Relic', atHours: 30 },  // pre-OTA-1161: no reaction on file
      ] },
    },
  } as never;

  it('lists every gift across every person, newest first', () => {
    const l = giftLedger(WM);
    expect(l.map((e) => e.item)).toEqual(['Cracked Lens', 'Core Relic', 'Mud Essence']);
    // ⚠ Newest-first and NOT grouped by person — the player is asking about the
    // exchange he just made, and grouping would bury it under someone he stopped
    // dealing with on day three.
    expect(l[0]!.who).toBe('Halem');
    expect(l[1]!.who).toBe('Odar Flameforge');
  });

  it('names the recipient and the reaction in the line', () => {
    const l = giftLedger(WM);
    expect(giftLedgerLine(l[2]!)).toBe('Mud Essence — Halem loved it');
    expect(giftLedgerLine(l[0]!)).toBe('Cracked Lens — Halem took it as an insult');
  });

  it('⚠ says nothing rather than guessing when the reaction predates the field', () => {
    // Inventing one would be worse than a blank: OTA-1153 rewrote the entire taste
    // table underneath those older entries, so a recomputed reaction would be a
    // confident lie about how somebody once felt.
    const l = giftLedger(WM);
    const old = l.find((e) => e.item === 'Core Relic')!;
    expect(old.reaction).toBeUndefined();
    expect(giftLedgerLine(old)).toBe('Core Relic — Odar Flameforge');
    expect(SHEET).toContain('reaction not recorded');
  });

  it('converts in-game hours to the day the feed would have said', () => {
    const l = giftLedger(WM);
    expect(l.find((e) => e.item === 'Mud Essence')!.day).toBe(1);
    expect(l.find((e) => e.item === 'Cracked Lens')!.day).toBe(3);
  });

  it('every reaction tier has a player-facing word', () => {
    for (const k of ['loved', 'liked', 'polite', 'disliked', 'insulted']) {
      expect(typeof REACTION_WORD[k]).toBe('string');
    }
    // 'disliked' is NOT an insult — OTA-1153 added that tier precisely because a
    // shrug and a refusal had been reading identically.
    expect(REACTION_WORD.disliked).not.toContain('insult');
  });

  it('empty and absent world memory are both safe', () => {
    expect(giftLedger(null)).toEqual([]);
    expect(giftLedger({ npcRelations: {} } as never)).toEqual([]);
  });

  it('the store now records the reaction it used to discard', () => {
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain('reaction: out.reaction,');
    expect(store).toContain('standingDelta: out.standingDelta,');
  });
});
