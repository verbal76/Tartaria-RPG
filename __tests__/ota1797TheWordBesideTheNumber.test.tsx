// ⚠⚠⚠ OTA-1797 — THE WORD BESIDE THE NUMBER.
//
// D1–D5 is the ground's own danger and never moves for the player. The word
// beside it used to be a second spelling of the number (CALM · UNEASY ·
// DANGEROUS · DEADLY · LETHAL by danger alone), so "D3 DANGEROUS" read the same
// to a fresh character and to one in Legendary plate. Owner's question: "how
// dangerous is this place to my character right now?" Ruled 2026-09-10 on the
// relative-threat matrix (revision 2): set D′ bands, half the substitute gain
// plus the soak for a companion, and the party gated to companions that can
// act. These are the claims the page promised the suite would hold.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

import React from 'react';
import enemiesData from '../app/data/enemies/enemies.json';
import {
  THREAT_BANDS, THREAT_TOP_WORD, EXTRA_BODY_WEIGHT, threatWordFor, referencePowerFor, referenceAcFor,
  expectedBodiesFor, spawnPoolFor, hitChance, companionTerm, threatReadout, participationFromScene,
  type ThreatWord,
} from '../app/engine/threatWord';
import { rarityCapForDanger, rarityWeights, PACK_RULE } from '../app/engine/encounter';
import { enemyPowerScore, playerPowerScore } from '../app/engine/powerRating';
import { createCharacter, getRaces, getFactions } from '../app/engine/character';
import type { Enemy, PlayerCharacter, Rarity, DogCompanion, Companion } from '../app/engine/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void };
};

const RANK: Record<Rarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };
const DANGERS = [1, 2, 3, 4, 5];

function fresh(): PlayerCharacter {
  return createCharacter({ name: 'Reader', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
}
const quiet = { elevated: false, target: null };

const dog = (over: Partial<DogCompanion> = {}): DogCompanion => ({
  id: 'd1', name: 'Mongrel', breed: 'mongrel', sex: { raw: 'he', pronoun: 'he' },
  startingProfile: 'mongrel' as never, hp: 16, hpMax: 16,
  stats: { strength: 10, dexterity: 8, intelligence: 6 }, statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
  loyalty: 50, lastFedAtHour: 0, equipped: { vest: null }, status: 'with_player', ...over,
});
const ironGolem = (power = 0): Companion => ({
  kind: 'iron' as never, name: 'Iron Golem', hp: 40, hpMax: 40, attackDie: '1d8', attackMod: 2,
  damageType: 'bludgeoning', hitBonus: 1, summonedAt: 0, stats: { power, resilience: 0 },
});

describe('OTA-1797 — the bands, set D′, as ruled', () => {
  it('⚠⚠⚠ LETHAL <0.65 · SEVERE <0.95 · DANGEROUS <1.20 · RISKY <1.80 · MANAGEABLE from 1.80', () => {
    expect(THREAT_BANDS.map((b) => [b.word, b.below])).toEqual([['LETHAL', 0.65], ['SEVERE', 0.95], ['DANGEROUS', 1.20], ['RISKY', 1.80]]);
    expect(THREAT_TOP_WORD).toBe('MANAGEABLE');
    const at = (r: number): ThreatWord => threatWordFor(r);
    expect([at(0.64), at(0.65), at(0.94), at(0.95), at(1.19), at(1.2), at(1.79), at(1.8), at(9)])
      .toEqual(['LETHAL', 'SEVERE', 'SEVERE', 'DANGEROUS', 'DANGEROUS', 'RISKY', 'RISKY', 'MANAGEABLE', 'MANAGEABLE']);
  });
});

describe('OTA-1797 — the reference is derived, not typed', () => {
  it('⚠⚠⚠ recomputed here from the catalog and the spawner\'s own tables, it is the same number', () => {
    // Independent recomputation: the enemies the tile can spawn (non-boss, under
    // the tile's rarity ceiling), weighted as the primary pick weights them,
    // times the bodies the pack rule is expected to add.
    const all = enemiesData as Enemy[];
    for (const d of DANGERS) {
      const pool = all.filter((e) => !e.boss && RANK[e.rarity] <= RANK[rarityCapForDanger(d)]);
      expect(spawnPoolFor(d).length).toBe(pool.length);
      const w = pool.reduce((s, e) => s + rarityWeights[e.rarity], 0);
      const mean = pool.reduce((s, e) => s + rarityWeights[e.rarity] * enemyPowerScore(e), 0) / w;
      const packChance = PACK_RULE.base + d * PACK_RULE.perDanger;
      const bodies = 1 + packChance * (1 + (d >= PACK_RULE.secondExtraFromDanger ? PACK_RULE.secondExtraChance : 0));
      expect(expectedBodiesFor(d)).toBeCloseTo(bodies, 9);
      expect(referencePowerFor(d)).toBeCloseTo(mean * (1 + EXTRA_BODY_WEIGHT * (bodies - 1)), 9);
    }
  });

  it('⚠⚠ and it reproduces the ruled page — 21.6 · 26.5 · 36.1 · 43.0 · 46.2', () => {
    const page = [21.6, 26.5, 36.1, 43.0, 46.2];
    for (const d of DANGERS) expect({ d, ref: +referencePowerFor(d).toFixed(1) }).toEqual({ d, ref: page[d - 1] });
  });

  it('is monotonic in danger, and D4/D5 draw the same pool (the documented world-design finding)', () => {
    for (let d = 1; d < 5; d++) expect(referencePowerFor(d + 1)).toBeGreaterThan(referencePowerFor(d));
    expect(spawnPoolFor(4).length).toBe(spawnPoolFor(5).length);
    expect(referenceAcFor(5)).toBe(referenceAcFor(4));
    expect(referenceAcFor(1)).toBeLessThan(referenceAcFor(5));
  });

  it('the spawner rolls from the same pack rule the reference reads', () => {
    expect(PACK_RULE).toEqual({ base: 0.10, perDanger: 0.13, secondExtraFromDanger: 3, secondExtraChance: 0.45 });
  });

  it('hit chance carries the natural 1 and 20', () => {
    expect(hitChance(30, 10)).toBe(0.95);
    expect(hitChance(-30, 10)).toBe(0.05);
    expect(hitChance(9, 10)).toBeCloseTo(1.0 * 0.95 + 0.0, 5); // 20 of 20 faces minus the 1 → capped at 95%
    expect(hitChance(0, 10)).toBeCloseTo(0.55, 9);
  });
});

describe('OTA-1797 — the matrix rows, as the page shows them', () => {
  // Rung power → the five words across D1–D5, transcribed from the ruled page.
  const ROWS: Array<[string, number, ThreatWord[]]> = [
    ['FLOOR', 25, ['DANGEROUS', 'SEVERE', 'SEVERE', 'LETHAL', 'LETHAL']],
    ['FRESH', 27, ['RISKY', 'DANGEROUS', 'SEVERE', 'LETHAL', 'LETHAL']],
    ['EARLY', 32, ['RISKY', 'RISKY', 'SEVERE', 'SEVERE', 'SEVERE']],
    ['MID', 43, ['MANAGEABLE', 'RISKY', 'DANGEROUS', 'DANGEROUS', 'SEVERE']],
    ['LATE', 57, ['MANAGEABLE', 'MANAGEABLE', 'RISKY', 'RISKY', 'RISKY']],
    ['APEX', 72, ['MANAGEABLE', 'MANAGEABLE', 'MANAGEABLE', 'RISKY', 'RISKY']],
  ];
  for (const [rung, power, words] of ROWS) {
    it(`${rung} (${power}) reads ${words.join(' · ')}`, () => {
      expect(DANGERS.map((d) => threatWordFor(power / referencePowerFor(d)))).toEqual(words);
    });
  }
});

describe('OTA-1797 — the same tile changes word as the CHARACTER changes, never as the fight goes', () => {
  it('⚠⚠⚠ a fresh character and an apex character read different words on the same ground', () => {
    const p = fresh();
    const freshWord = threatReadout(p, 3, quiet).word;
    const apex: PlayerCharacter = { ...p, hpMax: 140, stats: { ...p.stats, strength: 22 } };
    const apexWord = threatReadout(apex, 3, quiet).word;
    expect(playerPowerScore(apex)).toBeGreaterThan(playerPowerScore(p) + 15);
    expect(freshWord).not.toBe(apexWord);
    expect(['LETHAL', 'SEVERE', 'DANGEROUS']).toContain(freshWord);
    expect(['RISKY', 'MANAGEABLE']).toContain(apexWord);
  });

  it('⚠⚠⚠ THE WORD NEVER MOVES WITH CURRENT HIT POINTS — the header is not a health bar', () => {
    const p = fresh();
    const whole = threatReadout(p, 2, quiet);
    const bleeding = threatReadout({ ...p, hp: 1 }, 2, quiet);
    expect(bleeding.word).toBe(whole.word);
    expect(bleeding.party).toBe(whole.party);
  });

  it('the fresh character\'s D1 warns (RISKY or worse) and does not reassure', () => {
    // The page: a median fresh character wins three D1 fights in four; the word
    // says RISKY, an unlucky roll DANGEROUS. Never MANAGEABLE.
    expect(threatReadout(fresh(), 1, quiet).word).not.toBe('MANAGEABLE');
  });
});

describe('OTA-1797 — the companion term, gated', () => {
  it('⚠⚠⚠ a day-one dog with the player is worth something to a bare-handed fresh character, and the soak is its hit points over ten, a quarter', () => {
    const p: PlayerCharacter = { ...fresh(), dog: dog() };
    const t = companionTerm(p, 1, quiet);
    expect(t.from).toBe('dog');
    expect(t.substitute).toBeGreaterThan(0);
    expect(t.soak).toBeCloseTo((16 / 10) * 0.25, 9);
    expect(threatReadout(p, 1, quiet).party).toBeCloseTo(playerPowerScore(p) + t.substitute + t.soak, 9);
  });

  it('⚠⚠ THE GATE: benched at the base, down, at a climb, or facing a flyer — the dog adds nothing', () => {
    const base = fresh();
    expect(companionTerm({ ...base, dog: dog({ status: 'waiting_at_base' }) }, 1, quiet)).toMatchObject({ substitute: 0, soak: 0, from: null });
    expect(companionTerm({ ...base, dog: dog({ hp: 0 }) }, 1, quiet)).toMatchObject({ substitute: 0, soak: 0, from: null });
    expect(companionTerm({ ...base, dog: dog() }, 1, { elevated: true, target: null })).toMatchObject({ substitute: 0, soak: 0, from: null });
    const flyer = { name: 'Aether Drone', traits: ['flying'], boss: false, type: 'construct' };
    expect(companionTerm({ ...base, dog: dog() }, 1, { elevated: false, target: flyer })).toMatchObject({ substitute: 0, soak: 0, from: null });
  });

  it('⚠⚠ a boss fights the person in front of it — the soak goes, the bite credit stays', () => {
    const p: PlayerCharacter = { ...fresh(), dog: dog() };
    const boss = { name: 'The Bog Dragon', traits: [], boss: true, type: 'beast' };
    const t = companionTerm(p, 1, { elevated: false, target: boss });
    expect(t.soak).toBe(0);
    expect(t.substitute).toBeGreaterThan(0);
  });

  it('⚠⚠ an untrained Iron Golem earns nothing over a Cudgel; trained to power 10 it does', () => {
    const armed: PlayerCharacter = { ...fresh(), equipped: { main: 'Cudgel' } as never };
    // Measured: 6.5 × 66% against the Cudgel's 4.5 × 95% — a hair over even,
    // under the quarter-point deadband, so the term names no companion.
    const idle = companionTerm({ ...armed, golem: ironGolem(0) }, 1, quiet);
    expect(idle).toMatchObject({ substitute: 0, soak: 0, from: null });
    const trained = companionTerm({ ...armed, golem: ironGolem(10) }, 1, quiet);
    expect(trained.from).toBe('golem');
    expect(trained.substitute).toBeGreaterThan(2);
    expect(trained.soak).toBe(0);
    // ...and a golem cannot climb.
    expect(companionTerm({ ...armed, golem: ironGolem(10) }, 1, { elevated: true, target: null }).substitute).toBe(0);
  });

  it('one companion is commanded per turn: the substitute credit is the better of the two, the soak the dog\'s alone', () => {
    const armed: PlayerCharacter = { ...fresh(), equipped: { main: 'Cudgel' } as never, dog: dog(), golem: ironGolem(10) };
    const both = companionTerm(armed, 1, quiet);
    const onlyDog = companionTerm({ ...armed, golem: null }, 1, quiet);
    const onlyGolem = companionTerm({ ...armed, dog: null }, 1, quiet);
    expect(both.substitute).toBeCloseTo(Math.max(onlyDog.substitute, onlyGolem.substitute), 9);
    expect(both.soak).toBeCloseTo(onlyDog.soak, 9);
  });

  it('participationFromScene reads the climb and the active target', () => {
    expect(participationFromScene(null)).toEqual({ elevated: false, target: null });
    const e = [{ name: 'a', boss: false }, { name: 'b', boss: true }];
    expect(participationFromScene({ elevatedOn: { noun: 'spire' }, enemies: e as never, activeEnemyIdx: 1 })).toEqual({ elevated: true, target: e[1] });
    expect(participationFromScene({ enemies: e as never, activeEnemyIdx: 7 })).toEqual({ elevated: false, target: e[0] });
  });
});

describe('OTA-1797 — the header prints the word', () => {
  const mounted: Array<{ unmount(): void }> = [];
  afterEach(() => { renderer.act(() => { for (const r of mounted.splice(0)) { try { r.unmount(); } catch { /* gone */ } } }); });

  function textOf(node: unknown): string {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(textOf).join('');
    const n = node as { children?: unknown };
    return textOf(n.children);
  }

  function mount(player: PlayerCharacter, danger: number): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
    useGameStore.setState({
      player,
      currentScene: {
        location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'], danger },
        ambientNouns: [], displayedAmbientNouns: [], pinnedAmbientNouns: [],
        enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '', activeEnemyIdx: 0,
      },
    } as never);
    let tree!: { toJSON(): unknown; unmount(): void };
    renderer.act(() => { tree = renderer.create(<ExplorationScreen />); });
    mounted.push(tree);
    return textOf(tree.toJSON());
  }

  it('⚠⚠⚠ the stamp is the ground\'s number and the party\'s word — and it changes with the character on the same tile', () => {
    const p = fresh();
    const expected = threatReadout(p, 3, quiet).word;
    expect(mount(p, 3)).toContain(`D3 ${expected}`);
    const apex: PlayerCharacter = { ...p, hpMax: 140, stats: { ...p.stats, strength: 22 } };
    const apexWord = threatReadout(apex, 3, quiet).word;
    expect(apexWord).not.toBe(expected);
    expect(mount(apex, 3)).toContain(`D3 ${apexWord}`);
  });
});
