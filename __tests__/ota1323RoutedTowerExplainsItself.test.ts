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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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



// ⚠⚠ OTA-1323 (PUNCHLIST B7) — YOU ROUTED TO A TOWER AND THE TOWER ISN'T THERE.
//
// B7 asked whether a ROUTED arrival at a great climb runs the GREAT climb or a
// generic one — the walker experiment had seen "Tier 4/4 cleared" at a 15-tier
// spire. Measured across all five landmarks on a real `travelTo` arrival:
//
//   grand_spire       arrived, prop present, 15 tiers ✓
//   asgardar_spire    arrived INTO THE HUB (outpost_gate) — prop suppressed
//   obsidian_monolith arrived INTO A FIGHT (1 hostile) — prop suppressed
//   thametan_tower    arrived, prop present, 12 tiers ✓
//   zharak_fang       arrived, prop present, 11 tiers ✓
//
// ⚠ THE LOOP IS NOT UNFINISHABLE — that was B7's stated fear and it is NOT what
// the measurement shows. Leave the gate, or clear the fight, and the prop returns;
// the height lookup then resolves to the real 11–15 tiers. So this does NOT get
// promoted to Alpha.
//
// ⚠⚠ WHAT IS REAL is that the player is told NOTHING. They set a course to the
// Great Obsidian Monolith, arrive, look around, and read a list holding `pillar`
// and no monolith. Climbing that pillar is a generic 3-tier ascent — the exact
// symptom that opened the item, and it reads as the chart having lied. A landmark
// you were ROUTED to is the one noun whose absence has to explain itself.
import { useGameStore } from '../app/state/gameStore';
import { GREAT_CLIMBS } from '../app/engine/greatClimbs';
import { climbHeightFor } from '../app/engine/climbHeight';

jest.setTimeout(180_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

const unlockAll = (): void => {
  useGameStore.setState((s) => ({
    worldMemory: { ...s.worldMemory, unlockedGreatClimbs: GREAT_CLIMBS.map((c) => c.id) },
  }));
};
/** ⚠ Asgardar's arrival can roll a CORE GUARDIAN (Sentinel-Priest Vaelka), and a
 *  `look` with a boss on you resolves as a combat beat, not a look. That is correct
 *  behaviour and a separate rule; clear the board so this suite measures the look. */
/** ⚠ Asgardar is a LOST CAPITAL as well as a great-climb landmark, so an
 *  `investigate`-class verb there (which `look` is) can fire the Core Guardian
 *  gate — `canRecoverCore` is true in the `revelation`/`cores` phases and the
 *  look resolves as a combat beat instead. That is correct, separate behaviour;
 *  park the main quest off those phases so this suite measures the LOOK. */
const parkMainQuest = (): void => {
  useGameStore.setState((s) => (s.player ? {
    player: {
      ...s.player,
      mainQuest: { ...(s.player.mainQuest ?? {}), phase: 'seeking' } as never,
    },
  } : s));
};
const clearHostiles = (): void => {
  useGameStore.setState((s) => (s.currentScene
    ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], enemyKnockedOut: [] } }
    : s));
};
const lookText = (): string => {
  const before = useGameStore.getState().gameLog.length;
  useGameStore.getState().submitPlayerAction('look');
  return useGameStore.getState().gameLog.slice(before).map((e) => e.text).join('\n');
};

describe('OTA-1323 — a routed tower explains its own absence', () => {
  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Skyreacher', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('⚠⚠ THE MEASUREMENT: every great climb resolves to its REAL tier count, never the generic 2-4', () => {
    // This is the half of B7 that was actually feared. It holds.
    for (const c of GREAT_CLIMBS) {
      expect(climbHeightFor(c.noun)).toBe(c.tiers);
      expect(c.tiers).toBeGreaterThanOrEqual(11);
    }
  });

  it('⚠⚠ ARRIVING IN THE HUB: the look says the spire is outside the walls', () => {
    unlockAll();
    const asg = GREAT_CLIMBS.find((c) => c.id === 'asgardar_spire')!;
    useGameStore.getState().travelTo(asg.locationId);
    parkMainQuest();
    clearHostiles();
    const p = useGameStore.getState().player!;
    // The measured arrival state: a hub room, hence no prop.
    expect(p.hubRoomId).toBeTruthy();
    const txt = lookText();
    expect(txt).toContain(asg.noun);
    expect(txt.toLowerCase()).toContain('outside the walls');
  });

  it('⚠⚠ ...and leaving the outpost actually produces the climb it promised', () => {
    const asg = GREAT_CLIMBS.find((c) => c.id === 'asgardar_spire')!;
    parkMainQuest();
    clearHostiles();
    useGameStore.getState().submitPlayerAction('leave outpost');
    clearHostiles();
    const p = useGameStore.getState().player!;
    expect(p.hubRoomId).toBeFalsy();
    const sc = useGameStore.getState().currentScene!;
    const nouns = sc.displayedAmbientNouns ?? sc.ambientNouns ?? [];
    expect(nouns.some((n) => n.toLowerCase() === asg.noun.toLowerCase())).toBe(true);
    // ⚠ The line must NOT still be claiming the spire is elsewhere.
    expect(lookText().toLowerCase()).not.toContain('outside the walls');
  });

  it('⚠⚠ ARRIVING INTO A FIGHT: the look says the climb is here but not while something is on you', () => {
    unlockAll();
    const obs = GREAT_CLIMBS.find((c) => c.id === 'obsidian_monolith')!;
    useGameStore.getState().travelTo(obs.locationId);
    // Force the measured condition rather than waiting on the arrival roll.
    useGameStore.setState((s) => (s.currentScene ? {
      currentScene: {
        ...s.currentScene,
        enemies: [{ name: 'Rust Stalker', hp: 12, hpMax: 12 }] as never,
        enemyHps: [12],
        displayedAmbientNouns: (s.currentScene.displayedAmbientNouns ?? [])
          .filter((n) => n.toLowerCase() !== obs.noun.toLowerCase()),
        ambientNouns: (s.currentScene.ambientNouns ?? [])
          .filter((n) => n.toLowerCase() !== obs.noun.toLowerCase()),
      },
    } : s));
    const txt = lookText();
    expect(txt).toContain(obs.noun);
    expect(txt.toLowerCase()).toContain('something on you');
  });

  it('⚠ a landmark whose CHART is unused stays silent — the place reads as ordinary', () => {
    // The prop is chart-gated on purpose: "you can stand at Asgardar and never see
    // the climb until a chart puts it on your route." Explaining an absence the
    // player was never promised would leak the whole Skyreacher set.
    useGameStore.setState((s) => ({ worldMemory: { ...s.worldMemory, unlockedGreatClimbs: [] } }));
    const zh = GREAT_CLIMBS.find((c) => c.id === 'zharak_fang')!;
    useGameStore.getState().travelTo(zh.locationId);
    clearHostiles();
    const txt = lookText();
    expect(txt).not.toContain(zh.noun);
  });

  it('⚠ and where the prop IS on screen, the look adds no excuse for it', () => {
    unlockAll();
    const gs = GREAT_CLIMBS.find((c) => c.id === 'grand_spire')!;
    useGameStore.getState().travelTo(gs.locationId);
    clearHostiles();
    const sc = useGameStore.getState().currentScene!;
    const nouns = sc.displayedAmbientNouns ?? sc.ambientNouns ?? [];
    if (nouns.some((n) => n.toLowerCase() === gs.noun.toLowerCase())) {
      const txt = lookText().toLowerCase();
      expect(txt).not.toContain('outside the walls');
      expect(txt).not.toContain('something on you');
      expect(txt).not.toContain('should be here');
    }
  });
});
