// OTA-1507 — THE BAND FOLLOWS THE SIGHTS.
//
// ⚠⚠⚠ FROM THE OWNER'S FIRST LIVE OTA-1506 LOG (2026-08-26 01:46, Pixel,
// hal): the acid flask dropped True Tartarians Raider 1 at arm's reach, the
// sights auto-promoted to Raider 2 — standing at HIS OWN mid ring — and the
// legacy `scene.range` carried the corpse's 'close' forward. The attack gate
// told the truth ('mid', swing refused), while the parser debug line and every
// legacy reader still said 'close'. One kill, two answers about where the
// player stands.
//
// The rule the fix encodes: WHEREVER THE SIGHTS MOVE, THE LEGACY BAND MOVES
// WITH THEM. Swipe (OTA-1506 already), kill-promotion, KO-promotion, and the
// DOT/AoE sweep now all re-derive `range` from whoever is actually on the card.

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

import { useGameStore } from '../app/state/gameStore';
import { sweepDeadEnemies } from '../app/state/combatResolution';
import type { Enemy } from '../app/engine/types';
import type { GameStore } from '../app/state/gameStore';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const ROOT = join(__dirname, '..');
const STORE = readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');
const COMBAT = readFileSync(join(ROOT, 'app', 'state', 'combatResolution.ts'), 'utf8');

const foe = (name: string, pos: { bearing: number; distance: number }): Enemy => ({
  name, type: 'Human', abilityPoint: 'Strength 3', attack: 'Cudgel',
  damage: '1D6', hp: 10, rarity: 'Common', loot: [], pos,
});

describe('OTA-1507 — the kill-promotion re-derives the band (live store)', () => {
  it("⚠⚠⚠ THE OWNER'S EXACT CASE: corpse at close, survivor at far — the sweep leaves range 'far'", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Bandtest', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();
    const scene = store.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene,
        enemies: [
          foe('Dead Leader', { bearing: 0, distance: 0.5 }),   // close — the corpse
          foe('Far Survivor', { bearing: 120, distance: 2.5 }), // far — his own ring
        ],
        enemyHps: [0, 10],
        activeEnemyIdx: 0,
        range: 'close',
        enemyAmbushUsed: [false, false],
        enemyKnockedOut: [false, false],
      },
    });
    const get = () => store.getState();
    const set = (fn: (s: GameStore) => Partial<GameStore>) => { useGameStore.setState(fn(store.getState())); };
    const ended = sweepDeadEnemies(get, set);
    expect(ended).toBe(false); // the survivor keeps the fight open
    const after = store.getState().currentScene!;
    expect(after.enemies.map((e) => e.name)).toEqual(['Far Survivor']);
    // ⚠ THE CLAIM: the legacy band re-derived to the PROMOTED target's own
    // ring — before this fix it stayed 'close', the dead man's distance.
    expect(after.range).toBe('far');
  });
});

describe('OTA-1507 — every sights-mover carries the band (source claims)', () => {
  it('⚠⚠ resolveEnemyDefeat derives from the spliced lineup + promoted index', () => {
    expect(STORE).toContain(
      'derivedSceneRange({ ...currentScene, enemies: remainingEnemies, activeEnemyIdx: nextActiveIdx })',
    );
  });

  it('⚠⚠ the KO-promotion (sights move off a sleeper) re-derives too', () => {
    expect(STORE).toContain('const moved = { ...s.currentScene, activeEnemyIdx: nextUp.i2 };');
    expect(STORE).toContain('range: derivedSceneRange(moved) ?? s.currentScene.range');
  });

  it('⚠⚠ the DOT/AoE sweep re-derives after its splices settle', () => {
    expect(COMBAT).toContain(
      "range: derivedSceneRange(s.currentScene) ?? s.currentScene.range",
    );
  });
});
