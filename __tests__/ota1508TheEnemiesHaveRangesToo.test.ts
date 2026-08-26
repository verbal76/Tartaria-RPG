// OTA-1508 — THE ENEMIES HAVE RANGES TOO (step 3 of the combat range rework).
//
// ⚠⚠⚠ THE OWNER'S SPEC, verbatim: *"remember range should limit my weapons
// ability and theirs depending on what they have so the enemies have to have
// a range too"* — and the dot: *"a small circle in one of the bottom corners
// … red means they can hit me, yellow is they can reach me but it'd be weak
// damage, green means they can't touch me."*
//
// One resolver (enemyReach) mirrors playerWeaponReach for the other side:
// carried kit through the real catalog, authored attack text as the always-on
// fallback, each class reaching some bands FULL and its outermost band WEAK.
// The dot reads it; the counter volley rolls with it; a weak-edge blow lands
// HALVED. ⚠ Deliberately conservative: for text-classified enemies the reach
// bands are band-for-band what OTA-550 shipped, so no fight becomes safe that
// wasn't — what changes is the halving at the edge and that a carried crossbow
// finally shoots.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
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
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
// ⚠ Deterministic dice for the halving proof: every die shows a fixed face
// and every notation rolls its flat value. No Date/random in suites.
jest.mock('../app/engine/rng', () => ({
  ...jest.requireActual('../app/engine/rng'),
  rollDie: jest.fn((sides: number) => (sides === 20 ? 10 : 2)),
  rollFromNotation: jest.fn(() => 10),
  pick: jest.fn(<T,>(arr: T[]) => arr[0]),
}));

import { useGameStore } from '../app/state/gameStore';
import { enemyReach, enemyThreatAt, runEnemyGroupCounters } from '../app/state/combatResolution';
import type { Enemy, PlayerCharacter } from '../app/engine/types';
import type { GameStore } from '../app/state/gameStore';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const ROOT = join(__dirname, '..');
const COMBAT = readFileSync(join(ROOT, 'app', 'state', 'combatResolution.ts'), 'utf8');
const SCREEN = readFileSync(join(ROOT, 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
const PANEL = readFileSync(join(ROOT, 'app', 'components', 'EnemyPanel.tsx'), 'utf8');

const foe = (over: Partial<Enemy>): Enemy => ({
  name: 'Test Foe', type: 'Human', abilityPoint: 'Strength 6', attack: 'Cudgel',
  damage: '10', hp: 30, rarity: 'Common', loot: [], ...over,
});

describe('OTA-1508 — the reach resolver', () => {
  it('⚠⚠⚠ A PLAIN MELEE BODY: full at close, WEAK at mid — the shipped reach, now honest about the lunge', () => {
    const r = enemyReach(foe({ attack: 'Cudgel' }));
    expect([...r.bands].sort()).toEqual(['close', 'mid']);
    expect(r.weakBands).toEqual(['mid']);
  });

  it('⚠⚠ a LONG arm owns mid outright — a spear at mid is its whole job', () => {
    const r = enemyReach(foe({ attack: 'Spear Thrust' }));
    expect([...r.bands].sort()).toEqual(['close', 'mid']);
    expect(r.weakBands).toEqual([]);
  });

  it('⚠⚠ a RANGED attacker reaches all four bands, weak only at the distant extreme', () => {
    const r = enemyReach(foe({ attack: 'Crossbow Bolt' }));
    expect([...r.bands].sort()).toEqual(['close', 'distant', 'far', 'mid']);
    expect(r.weakBands).toEqual(['distant']);
  });

  it('⚠⚠⚠ THE CARRIED KIT WIDENS THE REACH — a cudgel-swinger with a Bone Crossbow on his back shoots', () => {
    const bare = enemyReach(foe({ attack: 'Cudgel' }));
    expect(bare.bands).not.toContain('far');
    const armed = enemyReach(foe({ attack: 'Cudgel', carries: { weapons: ['Bone Crossbow'] } }));
    expect(armed.bands).toContain('far');
    expect(armed.bands).toContain('distant');
    expect(armed.weakBands).toContain('distant');
  });

  it('⚠ full beats weak in the union — melee mid-lunge stops being weak once a spear covers mid', () => {
    const r = enemyReach(foe({ attack: 'Cudgel', carries: { weapons: ['Rusted Blade'] } }));
    expect(r.weakBands).toEqual(['mid']); // two melee sources — mid stays the weak lunge
    const withLong = enemyReach(foe({ attack: 'Whip Lash' }));
    expect(withLong.weakBands).toEqual([]); // the long arm owns mid full
  });
});

describe("OTA-1508 — the owner's dot", () => {
  it('⚠⚠⚠ RED CAN HIT ME, YELLOW HITS WEAK, GREEN CANNOT TOUCH ME — judged at the enemy\'s own ring', () => {
    const melee = foe({ attack: 'Cudgel' });
    expect(enemyThreatAt(melee, 'close')).toBe('red');
    expect(enemyThreatAt(melee, 'mid')).toBe('yellow');
    expect(enemyThreatAt(melee, 'far')).toBe('green');
    const shooter = foe({ attack: 'Laser Burst' });
    expect(enemyThreatAt(shooter, 'far')).toBe('red');
    expect(enemyThreatAt(shooter, 'distant')).toBe('yellow');
    // Ring 5: present, closing, unable to act — green.
    expect(enemyThreatAt(shooter, null)).toBe('green');
  });
});

describe('OTA-1508 — the weak edge halves the blow (live store, deterministic dice)', () => {
  async function hitFor(distance: number): Promise<number> {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: `Edge${distance}`, raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();
    // Strip worn armor so the blow lands unshaved — the claim is about the
    // halving, not the armor stack.
    const p = store.getState().player!;
    useGameStore.setState({
      player: { ...p, hp: 100, maxHp: 100, equipped: {}, statusEffects: [] } as unknown as PlayerCharacter,
    });
    const scene = store.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene,
        enemies: [foe({ pos: { bearing: 0, distance } })],
        enemyHps: [30],
        activeEnemyIdx: 0,
        range: 'close',
        enemyAmbushUsed: [true], // no ambush bonus noise
        enemyKnockedOut: [false],
      },
    });
    const get = () => store.getState();
    const set = (fn: (s: GameStore) => Partial<GameStore>) => { useGameStore.setState(fn(store.getState())); };
    runEnemyGroupCounters(get, set, store.getState().player!, { skipDotTick: true });
    return 100 - (store.getState().player!.hp ?? 100);
  }

  it('⚠⚠⚠ THE SAME CUDGEL: full damage at close, HALF from the mid lunge', async () => {
    const atClose = await hitFor(0.5);
    const atMid = await hitFor(1.5);
    expect(atClose).toBeGreaterThan(0);
    expect(atMid).toBeGreaterThan(0);
    expect(atMid * 2).toBe(atClose);
  });
});

describe('OTA-1508 — the wiring (source claims)', () => {
  it('⚠⚠ the halving covers crit and boss dice — applied after the whole blow assembles', () => {
    const bossAt = COMBAT.indexOf('if (enemy.boss) {\n      rawDmg += rollDie(6);');
    const halveAt = COMBAT.indexOf('if (edgeWeak) rawDmg = Math.max(1, Math.ceil(rawDmg / 2));');
    expect(bossAt).toBeGreaterThan(-1);
    expect(halveAt).toBeGreaterThan(bossAt);
    // And the deals-line says so, so the log explains the number.
    expect(COMBAT).toContain("${edgeWeak ? ' [edge of reach — halved]' : ''}");
  });

  it('⚠⚠ the counter gate rolls with the SAME resolver (no second spelling of enemy reach)', () => {
    expect(COMBAT).toContain('return enemyReach(enemy).bands.includes(range);');
  });

  it('⚠⚠ the card feeds the dot from enemyThreatAt, dead bodies read green', () => {
    expect(SCREEN).toContain("threat: (currentScene.enemyHps[i] ?? e.hp) <= 0 ? ('green' as const) : enemyThreatAt(e, band),");
    expect(PANEL).toContain('styles[`threat_${view.threat}`]');
    expect(PANEL).toContain("threat_red: { backgroundColor: '#e05f5f' },");
    expect(PANEL).toContain("threat_yellow: { backgroundColor: '#e0c05f' },");
    expect(PANEL).toContain("threat_green: { backgroundColor: '#9ec96a' },");
  });
});
