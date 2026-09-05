/**
 * OTA-1678 — THE CHASE GETS HARDER (item 6a of "fix all existing issues one
 * through six").
 *
 * Owner: "on the randoms there should be a flee escalation. the ones that I'm
 * purposely throwing you head first into some big guy because you have to do
 * that to complete or progress a mission or a storyline — I don't think there
 * should be a progression on those, only on the randoms. I want the rest of the
 * world to be dangerous… if you step into danger level 3 you're going to see
 * some big bad guys and there is a chance you're going to get stuck having that
 * fight that might end the game for you."
 *
 * His log: he flees everything at ~100 HP+ on random ground and wins nearly
 * every escape. OTA-1009 made the flee contested and OTA-1459 made it cost
 * stamina; neither moved the bar between the first break and the fourth, a
 * danger-1 verge and a danger-5 pit, a rat and a Legendary. Now, on RANDOM
 * ground only, the pursuer's bar rises with the ground, its rarity and the
 * failed breaks this encounter, and falls with its wounds. The FLEE chip
 * prints the odds, from the same reader the roll is built from.
 *
 * ⚠ Random is DECLARED by the four world rolls (`Enemy.unscripted`), never
 * inferred: a scripted body that was mis-marked would make a mission fight
 * harder to leave, which is the one thing he said must not happen.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
// state/fleeOdds reaches combatResolution → narration → the native engines; the
// same preamble every combatResolution suite carries (see ota1507).
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { readFileSync } from 'fs';
import { join } from 'path';
import enemiesJson from '../app/data/enemies/enemies.json';
import type { Enemy, WeatherEntry } from '../app/engine/types';
import { buildSkillSteps, escapePursuit } from '../app/engine/combatRules';
import {
  markUnscripted, isUnscriptedLineup, fleeEscalationFor, escalatedPursuit, fleeOddsPercent,
  FLAT_ESCAPE_DC, FLEE_RARITY_BONUS, FLEE_RETRY_STEP, FLEE_WOUNDED_HALF, FLEE_WOUNDED_QUARTER,
} from '../app/engine/fleeEscalation';
import { fleePursuitFor, fleeOddsFor, escapeRollBonus } from '../app/state/fleeOdds';

const ROOT = join(__dirname, '..');
const src = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');

const foe = (over: Partial<Enemy> = {}): Enemy => ({
  name: 'Test Foe', type: 'beast', abilityPoint: 'Strength 4', attack: '1d6',
  damage: '1d6', hp: 20, rarity: 'Common', loot: [], ...over,
} as Enemy);

const runner = (dex: number) => ({
  name: 'Runner', raceId: 'reclaimer', hp: 20, hpMax: 20, stamina: 10,
  stats: { strength: 5, dexterity: dex, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
  inventory: [], equipped: {}, statusEffects: [], factionStanding: [],
}) as any;

const CLEAR: WeatherEntry = { id: 'clear', name: 'Clear', description: '', visibility: 1, travelPenalty: 0, corruptionChance: 0, tags: [] };
const scene = (enemies: Enemy[], over: { enemyHps?: number[]; danger?: number; fleeAttempts?: number } = {}) => ({
  enemies,
  enemyHps: over.enemyHps ?? enemies.map((e) => e.hp),
  location: { danger: over.danger ?? 1 } as any,
  weather: CLEAR,
  fleeAttempts: over.fleeAttempts,
});

describe('OTA-1678 — random is declared by the producer', () => {
  it('markUnscripted stamps every body and touches nothing else', () => {
    const marked = markUnscripted([foe({ name: 'A' }), foe({ name: 'B', pos: { bearing: 90, distance: 2 } })]);
    expect(marked.map((e) => e.unscripted)).toEqual([true, true]);
    expect(marked[1]!.pos).toEqual({ bearing: 90, distance: 2 });
  });

  it('a lineup is random only when EVERY live body carries the mark', () => {
    const a = foe({ name: 'A', unscripted: true });
    const b = foe({ name: 'B', unscripted: true });
    const scripted = foe({ name: 'Mark' }); // a hunt's mark, a guardian, a pre-1678 save
    expect(isUnscriptedLineup([a, b])).toBe(true);
    expect(isUnscriptedLineup([a, scripted])).toBe(false);
    // A dead scripted body does not turn a random fight scripted — only the living chase.
    expect(isUnscriptedLineup([a, scripted], [20, 0])).toBe(true);
    // And a dead random body does not make a scripted fight random.
    expect(isUnscriptedLineup([a, scripted], [0, 20])).toBe(false);
    expect(isUnscriptedLineup([])).toBe(false);
    expect(isUnscriptedLineup([a], [0])).toBe(false);
  });

  it('⚠⚠ a scripted lineup resolves to EXACTLY OTA-1009\'s escapePursuit — the bar does not move', () => {
    const mark = foe({ name: 'Hollow King', abilityPoint: 'Strength 9', rarity: 'Legendary', hp: 300 });
    const rat = foe({ name: 'Gutter Rat', abilityPoint: 'Dexterity 3' });
    for (const attempts of [0, 1, 5]) {
      for (const danger of [1, 3, 5]) {
        expect(escalatedPursuit([mark, rat], [300, 10], danger, attempts)).toEqual(escapePursuit([mark, rat]));
      }
    }
    // Wounds do not help against a scripted pursuer either — same contract as before.
    expect(escalatedPursuit([mark], [10], 5, 3)).toEqual(escapePursuit([mark]));
  });
});

describe('OTA-1678 — the escalation, term by term', () => {
  it('the ground: +1 per danger level above the frontier', () => {
    const c = foe({ unscripted: true });
    expect(fleeEscalationFor(c, 20, 0, 0).danger).toBe(0);
    expect(fleeEscalationFor(c, 20, 1, 0).danger).toBe(0);
    expect(fleeEscalationFor(c, 20, 3, 0).danger).toBe(2);
    expect(fleeEscalationFor(c, 20, 5, 0).danger).toBe(4);
  });

  it('the pursuer: Common 0, Uncommon +1, Rare +2, Legendary +3', () => {
    expect(FLEE_RARITY_BONUS).toEqual({ Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 });
    for (const rarity of ['Common', 'Uncommon', 'Rare', 'Legendary'] as const) {
      expect(fleeEscalationFor(foe({ rarity }), 20, 1, 0).rarity).toBe(FLEE_RARITY_BONUS[rarity]);
    }
  });

  it('the count: +2 per failed break this encounter, and the note says which try this is', () => {
    expect(FLEE_RETRY_STEP).toBe(2);
    expect(fleeEscalationFor(foe(), 20, 1, 0).retry).toBe(0);
    expect(fleeEscalationFor(foe(), 20, 1, 1)).toMatchObject({ retry: 2, note: '2nd try +2' });
    expect(fleeEscalationFor(foe(), 20, 1, 2)).toMatchObject({ retry: 4, note: '3rd try +4' });
    expect(fleeEscalationFor(foe(), 20, 1, 3)).toMatchObject({ retry: 6, note: '4th try +6' });
  });

  it('the wounds: −2 at or under half, −4 at or under a quarter, from the pursuer\'s OWN max', () => {
    expect([FLEE_WOUNDED_HALF, FLEE_WOUNDED_QUARTER]).toEqual([2, 4]);
    const c = foe({ hp: 40 });
    expect(fleeEscalationFor(c, 40, 1, 0).wounded).toBe(0);
    expect(fleeEscalationFor(c, 21, 1, 0).wounded).toBe(0);
    expect(fleeEscalationFor(c, 20, 1, 0).wounded).toBe(-2);
    expect(fleeEscalationFor(c, 11, 1, 0).wounded).toBe(-2);
    expect(fleeEscalationFor(c, 10, 1, 0).wounded).toBe(-4);
    expect(fleeEscalationFor(c, 1, 1, 0).wounded).toBe(-4);
  });

  it('the owner\'s case: danger 3, a Rare, second try, unhurt — +6 over its speed; a danger-1 Common first try — +0', () => {
    const big = foe({ name: 'Big Bad', rarity: 'Rare', hp: 120 });
    const e = fleeEscalationFor(big, 120, 3, 1);
    expect(e).toMatchObject({ danger: 2, rarity: 2, retry: 2, wounded: 0, total: 6 });
    expect(e.note).toBe('danger +2, Rare +2, 2nd try +2');
    const small = fleeEscalationFor(foe({ rarity: 'Common' }), 20, 1, 0);
    expect(small).toMatchObject({ total: 0, note: '' });
  });
});

describe('OTA-1678 — the pursuit that results', () => {
  it('on random ground the bar is the pursuer\'s speed plus its escalation, and the note carries the breakdown', () => {
    const wasp = foe({ name: 'Mud Wasp', abilityPoint: 'Dexterity 5', rarity: 'Rare', hp: 30, unscripted: true });
    const p = escalatedPursuit([wasp], [30], 3, 1)!;
    expect(p.bonus).toBe(5 + 2 + 2 + 2);
    expect(p.label).toBe('Mud Wasp');
    expect(p.note).toBe('SPD 5, danger +2, Rare +2, 2nd try +2');
    // Nothing to say → no note, exactly like a plain chase.
    const rat = foe({ name: 'Rat', abilityPoint: 'Dexterity 3', unscripted: true });
    expect(escalatedPursuit([rat], [20], 1, 0)).toEqual({ bonus: 3, label: 'Rat' });
  });

  it('the one who can catch you is chosen AFTER escalation — a bleeding sprinter loses to a fresh brute', () => {
    const sprinter = foe({ name: 'Sprinter', abilityPoint: 'Dexterity 8', traits: ['quick'], hp: 40, unscripted: true }); // speed 10
    const brute = foe({ name: 'Brute', abilityPoint: 'Strength 6', rarity: 'Rare', hp: 80, unscripted: true });      // speed 6 + Rare 2 = 8
    expect(escalatedPursuit([sprinter, brute], [40, 80], 1, 0)!.label).toBe('Sprinter'); // 10 vs 8
    expect(escalatedPursuit([sprinter, brute], [8, 80], 1, 0)!.label).toBe('Brute');     // 10 − 4 = 6 vs 8
    expect(escalatedPursuit([sprinter, brute], [8, 80], 1, 0)!.bonus).toBe(8);
  });

  it('each failed break raises the next bar — the second is harder than the first, the third than the second', () => {
    const wasp = foe({ name: 'Mud Wasp', abilityPoint: 'Dexterity 5', hp: 30, unscripted: true });
    const bars = [0, 1, 2, 3].map((n) => escalatedPursuit([wasp], [30], 3, n)!.bonus);
    expect(bars).toEqual([7, 9, 11, 13]);
  });

  it('the bar floors at zero and an empty or dead lineup is no chase', () => {
    const dying = foe({ name: 'Slug', abilityPoint: 'Strength 1', traits: ['slow'], hp: 40, unscripted: true }); // speed 0
    expect(escalatedPursuit([dying], [1], 1, 0)!.bonus).toBe(0);
    expect(escalatedPursuit([], [], 3, 0)).toBeNull();
    expect(escalatedPursuit([dying], [0], 3, 0)).toBeNull();
  });

  it('the roll card prints the breakdown, and a plain chase prints exactly what OTA-1009 printed', () => {
    const esc = buildSkillSteps('escape', runner(11), {
      pursuit: { bonus: 11, label: 'Mud Wasp', d20: 14, note: 'SPD 5, danger +2, Rare +2, 2nd try +2' },
    })[0]!;
    expect(esc.target).toBe(25);
    expect(esc.targetLabel).toBe('Pursuit 25 — Mud Wasp (d20 14 + 11: SPD 5, danger +2, Rare +2, 2nd try +2)');
    const plain = buildSkillSteps('escape', runner(11), { pursuit: { bonus: 6, label: 'Mud Hound', d20: 14 } })[0]!;
    expect(plain.targetLabel).toBe('Pursuit 20 — Mud Hound (d20 14 + SPD 6)');
  });
});

describe('OTA-1678 — the odds on the chip are exact', () => {
  it('no pursuer: d20 + bonus vs the flat DC — and the DC here IS combatRules\' escape DC', () => {
    expect(buildSkillSteps('escape', runner(0))[0]!.target).toBe(FLAT_ESCAPE_DC);
    expect(fleeOddsPercent(0, null)).toBe(60);   // 9..20 of 20
    expect(fleeOddsPercent(8, null)).toBe(100);  // the OTA-1009 "could never fail" bar
    expect(fleeOddsPercent(-12, null)).toBe(0);
  });

  it('a contested chase counts all 400 pairs, ties to the runner', () => {
    expect(fleeOddsPercent(0, 0)).toBe(53);   // 210/400 = 52.5 → 53
    expect(fleeOddsPercent(5, 5)).toBe(53);
    expect(fleeOddsPercent(19, 0)).toBe(100); // 1 + 19 = 20 ≥ any d20
    expect(fleeOddsPercent(0, 20)).toBe(0);   // 20 + 0 = 20 < 1 + 20
    expect(fleeOddsPercent(6, 0)).toBe(77);   // loses only when q − p ≥ 7: Σ(20−d) for d=7..19 = 91 pairs → 309/400
    const ladder = [0, 2, 4, 6, 8, 10].map((b) => fleeOddsPercent(11, b));
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeLessThan(ladder[i - 1]!);
  });

  it('⚠⚠ fleeOddsFor is measured against the SAME pursuit the dispatch builds the roll from', () => {
    const wasp = foe({ name: 'Mud Wasp', abilityPoint: 'Dexterity 5', rarity: 'Rare', hp: 30, unscripted: true });
    const sc = scene([wasp], { danger: 3, fleeAttempts: 1 });
    const pursuit = fleePursuitFor(sc)!;
    expect(pursuit).toEqual(escalatedPursuit([wasp], [30], 3, 1));
    const odds = fleeOddsFor(runner(11), sc)!;
    expect(odds.pursuit).toEqual(pursuit);
    // The runner's side is the step's own: DEX 11 + the Reclaimer's racial +1
    // (races.json), no companion, clear sky — the same bonus buildSkillSteps
    // puts on the card, not a re-derivation.
    expect(escapeRollBonus(runner(11), sc)).toBe(12);
    expect(escapeRollBonus(runner(11), sc)).toBe(buildSkillSteps('escape', runner(11), { pursuit: { bonus: 0, label: '', d20: 0 } })[0]!.bonus);
    expect(escapeRollBonus({ ...runner(11), companion: { name: 'Dog' } }, sc)).toBe(14);
    expect(odds.pct).toBe(fleeOddsPercent(12, pursuit.bonus));
    expect(odds.pct).toBe(57);
    // Nothing alive to run from → no chip odds.
    expect(fleeOddsFor(runner(11), scene([wasp], { enemyHps: [0] }))).toBeNull();
    expect(fleeOddsFor(runner(11), scene([]))).toBeNull();
  });

  it('the owner\'s picture (runner bonus 12): danger 3 vs a Rare — 66% / 57% / 48% over three tries; danger 5 vs a Legendary, third try, 30%; the same Rare as a MISSION mark, third try, 81%', () => {
    // Bars: speed 5 + danger 2 + Rare 2 = 9, then 11, then 13 (k = bar − 12 → −3 / −1 / +1).
    const rare = foe({ name: 'Big Bad', abilityPoint: 'Strength 5', rarity: 'Rare', hp: 120, unscripted: true });
    const tries = [0, 1, 2].map((n) => fleeOddsFor(runner(11), scene([rare], { danger: 3, fleeAttempts: n }))!.pct);
    expect(tries).toEqual([66, 57, 48]);
    // speed 6 + danger 4 + Legendary 3 + 3rd try 4 = 17 → k = +5 → 120/400.
    const legend = foe({ name: 'Worse', abilityPoint: 'Strength 6', rarity: 'Legendary', hp: 200, unscripted: true });
    expect(fleeOddsFor(runner(11), scene([legend], { danger: 5, fleeAttempts: 2 }))!.pct).toBe(30);
    // The same Rare as a MISSION mark on the same ground, third try: the OTA-1009 bar (speed 5), unmoved → 322/400.
    const mark = { ...rare, unscripted: undefined };
    expect(fleeOddsFor(runner(11), scene([mark], { danger: 3, fleeAttempts: 2 }))!.pct).toBe(81);
  });

  it('over the whole bestiary the worst random chase is still a chase — no bar a nat 20 + DEX 11 cannot clear', () => {
    const worst = (enemiesJson as Enemy[]).map((e) => escalatedPursuit([{ ...e, unscripted: true }], [e.hp], 5, 3)!.bonus);
    expect(Math.max(...worst)).toBeLessThanOrEqual(14 + 4 + 3 + 6);
    expect(Math.max(...worst)).toBeGreaterThan(20); // and it IS the "you might get stuck" he asked for
    expect(fleeOddsPercent(11, Math.max(...worst))).toBeLessThan(15);
  });
});

describe('OTA-1678 — the store: four producers stamp, every scripted site does not', () => {
  const STORE = src('app', 'state', 'gameStore.ts');
  const PARTY = src('app', 'state', 'factionParty.ts');
  const QUEST = src('app', 'state', 'slices', 'questSlice.ts');
  const TYPES = src('app', 'engine', 'types.ts');

  it('the mark is a declared Enemy field', () => {
    expect(TYPES.includes('unscripted?: boolean;')).toBe(true);
  });

  it('⚠⚠ exactly four world rolls stamp the mark: the arrival encounter, the climb encounter, the rest ambush, the patrol crossing', () => {
    // beginScene's roll and the climb encounter wrap the placed lineup.
    expect((STORE.match(/markUnscripted\(placeEnemies\(/g) ?? []).length).toBe(2);
    expect(STORE.includes("scaleEncounterForContext(encounter, location.danger, scalePower), 'patrol',\n    ));")).toBe(true);
    expect(STORE.includes("const scaledEnc = markUnscripted(placeEnemies(scaleEncounterForContext(enc.enemies, climbDanger, climbPower), 'patrol'));")).toBe(true);
    // The rest ambush appends one marked body.
    expect(STORE.includes("{ ...enemy, pos: arrivalPos('far'), unscripted: true }")).toBe(true);
    // The patrol crossing says so to the party spawner; the raid and the hostile-ground patrol do not.
    expect(STORE.includes("noun: 'Patrol', unscripted: true }, { scalePowerOf })")).toBe(true);
    expect((STORE.match(/unscripted: true/g) ?? []).length).toBe(2);
    expect(PARTY.includes("const placedParty = opts.unscripted ? markUnscripted(placeEnemies(scaled, 'patrol')) : placeEnemies(scaled, 'patrol');")).toBe(true);
    // And no scripted spawner anywhere touches the mark.
    expect(QUEST.includes('unscripted')).toBe(false);
    expect(src('app', 'state', 'stageArrival.ts').includes('unscripted')).toBe(false);
    expect(src('app', 'engine', 'coreGuardians.ts').includes('unscripted')).toBe(false);
    expect(src('app', 'engine', 'dogCompanion.ts').includes('unscripted')).toBe(false);
  });

  it('the dispatch builds the escape roll through the one shared reader', () => {
    expect(STORE.includes("pursuit: parsed.intent === 'escape' ? fleePursuitFor(currentScene) : null,")).toBe(true);
    expect(STORE.includes("import { fleePursuitFor } from './fleeOdds';")).toBe(true);
    expect(STORE.includes('escapePursuit(')).toBe(false); // no second reader left in the store
  });

  it('⚠ a failed break is counted ONLY on random ground, said to the player, and counted BEFORE the volley', () => {
    const at = STORE.indexOf('if (isUnscriptedLineup(currentScene.enemies, currentScene.enemyHps)) {');
    expect(at).toBeGreaterThan(-1);
    const block = STORE.slice(at, at + 600);
    expect(block.includes('fleeAttempts: (s.currentScene.fleeAttempts ?? 0) + 1')).toBe(true);
    expect(block.includes("'They have your measure now. The next break will be harder.'")).toBe(true);
    const volleyAt = STORE.indexOf('runEnemyGroupCounters(get, set, player);', at);
    expect(volleyAt).toBeGreaterThan(at);
    expect(STORE.indexOf('fleeAttempts: (s.currentScene.fleeAttempts ?? 0) + 1')).toBeLessThan(volleyAt);
    // One counter site, and it lives in the FAILED-escape arm.
    expect((STORE.match(/fleeAttempts: \(s\.currentScene\.fleeAttempts \?\? 0\) \+ 1/g) ?? []).length).toBe(1);
    expect(STORE.lastIndexOf('You break to run — and turning your back hands them the opening.', at)).toBeGreaterThan(at - 1500);
  });

  it('the count cannot outlive the bodies: reset by FRESH_ENEMY_ARRAYS and by every lineup producer', () => {
    const fresh = STORE.slice(STORE.indexOf('export const FRESH_ENEMY_ARRAYS = {'), STORE.indexOf('} as const;', STORE.indexOf('export const FRESH_ENEMY_ARRAYS = {')));
    expect(fresh.includes('fleeAttempts: undefined,')).toBe(true);
    expect((STORE.match(/fleeAttempts: undefined,/g) ?? []).length).toBe(3); // FRESH + rest ambush + climb
    expect(PARTY.includes('fleeAttempts: undefined,')).toBe(true);
    expect(STORE.includes('fleeAttempts?: number;')).toBe(true);
  });

  it('the FLEE chip carries the odds from the same reader, reduced to one number for the selector', () => {
    const UI = src('app', 'components', 'InputBox.tsx');
    expect(UI.includes("import { fleeOddsFor } from '../state/fleeOdds';")).toBe(true);
    expect(UI.includes('const fleeOddsPct = useGameStore((s) => (s.player && s.currentScene ? fleeOddsFor(s.player, s.currentScene)?.pct ?? null : null));')).toBe(true);
    expect(UI.includes("<QuickBtn label={fleeOddsPct === null ? 'flee' : `flee ${fleeOddsPct}%`} defensive onPress={() => onSubmit('flee')} />")).toBe(true);
  });

  it('the faction-party spawner left the store verbatim (the OTA-1400 ratchet), still landing three ways', () => {
    expect(STORE.includes('function injectFactionParty(')).toBe(false);
    expect(PARTY.includes('export function injectFactionParty(')).toBe(true);
    expect((STORE.match(/injectFactionParty\(get, set, \{/g) ?? []).length).toBe(3);
    expect((STORE.match(/\{ scalePowerOf \}\)/g) ?? []).length).toBe(3);
    expect(STORE.split('\n').length).toBeLessThan(37000);
  });
});
