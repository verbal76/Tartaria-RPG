// ⚠⚠ OTA-1334 — A CATCH-UP HEAL CONSUMES THE WHOLE ACTION.
//
// Found by the storyline walker DURING the map audit, when the audit's data changes
// shifted the seeded RNG stream and a long-standing race stopped hiding. It is a real
// player-reachable wedge, verbatim from the probe log:
//
//   1. investigate → the heal grants the missing mission item, says "Go again" — and the
//      SAME action falls through to the generic search beat, which rolls loot and writes
//      the inventory back from a snapshot taken BEFORE the heal. The healed item vanishes
//      one log line after its receipt printed. The beat also consumes the tile's
//      once-only area search.
//   2. investigate again → item missing again, heal re-fires, and "You already searched
//      the area" eats the verb. The stage is now unwinnable on its own ground.
//
// The mysteries pass stopped the heal from ADVANCING in the same action, for exactly this
// stale-snapshot race. It did not stop the ACTION — same hole, one layer out. The rule this
// suite pins: a heal that lands anything ends the action; the repeat runs on clean state.
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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { STORYLINES } from '../app/engine/factionStorylines';
import { contractStageAnchorId } from '../app/engine/contractMarkers';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

describe('OTA-1334 — the heal consumes the action', () => {
  it('⚠⚠ heal grants survive the action, and the repeat advances the stage', async () => {
    // The exact shape from the wedge: a storyline record standing on a stage whose
    // prerequisite was never handed over (the faction accept door writes records directly).
    const def = STORYLINES.find((d) => d.id === 'story_monarch_ledger_of_silence')!;
    expect(def).toBeTruthy();
    const stageIdx = 1;
    const stage = def.stages[stageIdx]!;
    const needed = stage.requires!.item;
    expect(needed).toBeTruthy();
    expect(stage.checkKind).toBe('investigate');

    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'HealProbe', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();

    const ground = contractStageAnchorId(def as never, stageIdx);
    useGameStore.setState({
      player: {
        ...store.getState().player!,
        currentLocationId: ground,
        hubRoomId: null, travelTarget: undefined,
        gridX: undefined, gridY: undefined, mapX: undefined, mapY: undefined,
        hp: 500, hpMax: 500, stamina: 50, staminaMax: 50,
        activeStorylines: [{ id: def.id, stage: stageIdx, postedByFaction: def.factionId, acceptedAt: Date.now(), tracked: true }],
        mainQuest: { ...(store.getState().player as never as { mainQuest: object }).mainQuest ?? {}, phase: 'seeking' },
      } as never,
    });
    const scene = store.getState().currentScene;
    if (scene) {
      useGameStore.setState({
        currentScene: { ...scene, enemies: [], enemyHps: [], range: null, vendor: undefined },
      } as never);
    }

    const held = () => (store.getState().player!.inventory ?? [])
      .filter((i) => i.name === needed)
      .reduce((n, i) => n + (i.quantity ?? 1), 0);
    const rec = () => (store.getState().player!.activeStorylines ?? []).find((r) => r.id === def.id)!;
    expect(held()).toBe(0);

    // ── Action 1: the heal fires. The item must SURVIVE the action, and the stage must
    // NOT advance (heal-then-stop), and the tile's search must NOT be burned.
    await store.getState().submitPlayerAction('investigate');
    await new Promise((r) => setTimeout(r, 300));
    const logAfter1 = store.getState().gameLog.slice(-8).map((e) => e.text).join('\n');
    expect(logAfter1).toContain('You had it after all');
    expect(held()).toBeGreaterThan(0);
    expect(rec().stage).toBe(stageIdx);
    // ⚠ The generic search beat must not have run on the consumed action — that beat is
    // what clobbered the grant AND burned the once-only search.
    expect(logAfter1).not.toContain('You comb through');
    expect(logAfter1).not.toContain('already searched');

    // ── Action 2: clean state, requirement met — the stage advances through the normal
    // path. This is the "Go again" the heal promised, costing exactly one tap.
    await store.getState().submitPlayerAction('investigate');
    await new Promise((r) => setTimeout(r, 400));
    expect(rec().stage).toBeGreaterThan(stageIdx);
    // And the healed item is still there (or consumed by the advance's own grant flow) —
    // the point is the RECORD moved; nothing silently reverted.
  });
});
