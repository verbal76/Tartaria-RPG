// OTA-1152 — READY TO HAND IN, and the three definitions of "ready" it had to
// unify first.
//
// Owner: "also under contracts you have sort by distance and when I click on it
// it says you know grouped so each group sorts by distance. I want another sort
// button there. same style as that. just put it to the right of it and I wanted
// to say sort by ready to hand in and I want it to pull from the groups. all the
// ones that are ready to hand in right to the top and sort those by distance
// automatically."
//
// ⚠ THE TRAP THIS SUITE EXISTS TO HOLD SHUT. "Ready" was not one predicate — it
// was THREE, each computed inline in a different section of ContractsScreen with
// nothing tying them together:
//     hunts / mysteries / storylines → run.stage >= def.stages.length
//     faction contracts              → factionQuestReady(def, stage, countItem)
//     the broker's alliance legs     → every demanded relic held
// Wire a new sort button to any ONE of them and it floats that kind correctly
// while SILENTLY missing the others — a finished hunt would simply never rise,
// and nothing would look broken. So the definitions were unified into
// engine/missionReady first, and the locks below assert both halves: the new
// shape is present AND the old inline shapes are gone.
//
// ⚠ The stage arm deliberately keeps its original expression, missing guard and
// all: `stage >= stageCount` says a stage-less def is ready, which is what the
// screen has always done. This OTA moved WHERE the answer is computed, not WHAT
// it answers. Tightening that is a separate, deliberate call.
import fs from 'fs';
import path from 'path';
import { missionTurnInReady } from '../app/engine/missionReady';
import type { FactionQuestDef } from '../app/engine/factionQuests';

const SCREEN = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'screens', 'ContractsScreen.tsx'),
  'utf8',
);

const fq = (over: Partial<FactionQuestDef> = {}): FactionQuestDef => ({
  id: 'fq_test',
  factionId: 'ashen_covenant',
  title: 'A Test Contract',
  description: 'd',
  objective: 'o',
  requirement: { rep: 0 },
  reward: { tc: 10, rep: 1 },
  ...over,
});

const stage = { narration: 'n' };

describe('OTA-1152 — the stage kinds (hunts / mysteries / storylines)', () => {
  it('is ready only once every stage has been played', () => {
    for (const kind of ['hunt', 'mystery', 'storyline'] as const) {
      expect(missionTurnInReady({ kind, stage: 0, stageCount: 3 })).toBe(false);
      expect(missionTurnInReady({ kind, stage: 2, stageCount: 3 })).toBe(false);
      expect(missionTurnInReady({ kind, stage: 3, stageCount: 3 })).toBe(true);
    }
  });

  it('a stage counter past the end still reads ready (never traps a finished run)', () => {
    expect(missionTurnInReady({ kind: 'hunt', stage: 9, stageCount: 3 })).toBe(true);
  });

  it('⚠ preserves the old expression exactly — a stage-less def reads READY', () => {
    // 0 >= 0. This is what `run.stage >= def.stages.length` did before the
    // extraction, so it is what the extraction must keep doing. Asserted so a
    // later "tidy-up" that adds a stageCount > 0 guard fails here loudly
    // instead of quietly changing which cards can be handed in.
    expect(missionTurnInReady({ kind: 'mystery', stage: 0, stageCount: 0 })).toBe(true);
  });
});

describe('OTA-1152 — faction contracts keep all three of their shapes', () => {
  const none = () => 0;

  it('STAGED — ready when every stage is played', () => {
    const def = fq({ stages: [stage, stage] });
    expect(missionTurnInReady({ kind: 'faction_quest', def, stage: 1, countItem: none })).toBe(false);
    expect(missionTurnInReady({ kind: 'faction_quest', def, stage: 2, countItem: none })).toBe(true);
  });

  it('FETCH — ready on held quantity, not on the stage counter', () => {
    const def = fq({ fetch: { itemName: 'Golem Core', quantity: 2 } });
    const held = (n: number) => (name: string) => (name === 'Golem Core' ? n : 0);
    expect(missionTurnInReady({ kind: 'faction_quest', def, stage: 0, countItem: held(1) })).toBe(false);
    expect(missionTurnInReady({ kind: 'faction_quest', def, stage: 0, countItem: held(2) })).toBe(true);
    // A fetch quest carries no stages, so a stage-driven answer would have
    // called it ready from the moment it was accepted.
    expect(missionTurnInReady({ kind: 'faction_quest', def, stage: 5, countItem: held(0) })).toBe(false);
  });

  it('LEGACY — a single-objective def is always turn-in-able', () => {
    expect(missionTurnInReady({ kind: 'faction_quest', def: fq(), stage: 0, countItem: none })).toBe(true);
  });
});

describe('OTA-1152 — the broker alliance', () => {
  const legs = [{ itemName: 'Sunken Sigil' }, { itemName: 'Ashen Pendant' }];

  it('needs EVERY demanded relic, not just one', () => {
    const has = (owned: string[]) => (n: string) => owned.includes(n);
    expect(missionTurnInReady({ kind: 'broker', legs, hasItem: has([]) })).toBe(false);
    expect(missionTurnInReady({ kind: 'broker', legs, hasItem: has(['Sunken Sigil']) })).toBe(false);
    expect(missionTurnInReady({ kind: 'broker', legs, hasItem: has(['Sunken Sigil', 'Ashen Pendant']) })).toBe(true);
  });

  it('an empty leg list is NOT ready (no mission ≠ a finished one)', () => {
    expect(missionTurnInReady({ kind: 'broker', legs: [], hasItem: () => true })).toBe(false);
  });
});

describe('OTA-1152 — category lock: the old inline definitions are GONE', () => {
  // Each of these is one of the three definitions the screen used to compute for
  // itself. A lock that only asserted the new helper exists would stay green
  // over any site still doing it the old way — which is precisely how a previous
  // lock in this repo went green over eight missed sibling sites.
  it('no section computes the stage predicate inline any more', () => {
    expect(SCREEN).not.toMatch(/run\.stage\s*>=\s*def\.stages\.length/);
  });

  it('the screen no longer calls factionQuestReady directly', () => {
    expect(SCREEN).not.toContain('factionQuestReady(');
  });

  it('the broker readiness is no longer an inline every()', () => {
    expect(SCREEN).not.toMatch(/brokerLegs\.length\s*>\s*0\s*&&\s*brokerLegs\.every/);
  });

  it('every kind resolves through engine/missionReady', () => {
    expect(SCREEN).toContain("from '../engine/missionReady'");
    expect(SCREEN).toContain('missionTurnInReady');
  });
});

describe('OTA-1152 — category lock: NO SECTION IS LEFT OUT OF THE FLOAT', () => {
  // The named failure mode: wire the button to one kind and the other kinds
  // never rise. Every sortable section that CAN be handed in must pass its
  // readiness accessor to byMoves, and every kind must appear in the roll-up.
  it('all four contract sections pass a readiness accessor to byMoves', () => {
    // Bounded spans, not [^)]* — the locOf argument is itself a call, so a
    // paren-excluding pattern can never reach the readiness argument and the
    // lock would fail on correct code.
    expect(SCREEN).toMatch(/byMoves\(hunts,[\s\S]{0,160}?stageRunReady\('hunt'/);
    expect(SCREEN).toMatch(/byMoves\(mysteries,[\s\S]{0,160}?stageRunReady\('mystery'/);
    expect(SCREEN).toMatch(/byMoves\(storylines,[\s\S]{0,160}?stageRunReady\('storyline'/);
    expect(SCREEN).toMatch(/byMoves\(factionQuests,[\s\S]{0,160}?factionRecReady/);
  });

  it('the roll-up gathers all five turn-in-able kinds', () => {
    for (const tag of ['HUNT', 'MYSTERY', 'STORYLINE', 'FACTION', 'ALLIANCE']) {
      expect(SCREEN).toContain(`tag: '${tag}'`);
    }
  });

  it('READY mode ranks readiness FIRST and breaks ties on distance', () => {
    // Both halves matter: rank alone would leave the ready group unordered, and
    // distance alone is the button that already existed.
    expect(SCREEN).toMatch(/rank\(a\)\s*-\s*rank\(b\)\s*\|\|\s*dist\(a\)\s*-\s*dist\(b\)/);
  });
});

describe('OTA-1152 — category lock: the roll-up is not a second turn-in path', () => {
  it('its COMPLETE routes through the same store action the cards use', () => {
    // The roll-up adds four more call sites; every one of them must be the
    // store's own gated action, so a refusal (the hunts face-to-face gate) is
    // refused identically wherever the player taps.
    for (const kind of ['hunt', 'mystery', 'storyline', 'faction_quest']) {
      expect(SCREEN).toContain(`completeContractFromUI('${kind}'`);
    }
  });

  it('the screen never reaches past it to a raw turn-in', () => {
    expect(SCREEN).not.toContain('turnInFactionQuest(');
  });
});

describe('OTA-1152 — the two sort buttons are one mode', () => {
  it('the impossible states are unrepresentable — one mode, not two booleans', () => {
    expect(SCREEN).toContain("type SortMode = 'default' | 'distance' | 'ready'");
    expect(SCREEN).not.toContain('setSortByDistance');
  });

  it('tapping the live mode returns to the default order', () => {
    expect(SCREEN).toMatch(/cur === m \? 'default' : m/);
  });

  it('the faction sort keys off the same location the card displays', () => {
    // A ready faction contract's card shows the distance to the faction HOME it
    // hands in at, not to the objective. The sort read the objective, so the
    // ordering disagreed with the printed number on exactly the cards this
    // feature is about.
    expect(SCREEN).toContain('factionSortLocId');
    expect(SCREEN).toMatch(/byMoves\(factionQuests,\s*\(fq\) => factionSortLocId\(fq\)/);
  });
});
