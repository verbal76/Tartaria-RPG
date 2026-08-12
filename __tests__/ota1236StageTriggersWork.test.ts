jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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

// OTA-1236 — EVERY STAGE OF EVERY MISSION HAS A WORKING TRIGGER. Owner, stuck
// on the Bog Dragon at stage 2/7 while standing where the card told him to
// stand: "I investigated everything in the area, I hit investigate when the
// area was empty, nothing is happening... we need to make sure every stage of
// every mission has a working trigger." The old trigger was a dice roll most
// investigate inputs never even reached; in an exhausted tile NO input reached
// it. Now the VERB is the trigger — hunts gated on the anchor tile the card's
// "You're at" line reads, mysteries/storylines on the verb alone, combat
// gating unchanged.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS, findHuntById } from '../app/engine/hunts';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { huntAnchorId } from '../app/engine/contractMarkers';
import { canonicalCellOf } from '../app/engine/worldMap';

jest.setTimeout(120000);

async function settle(pred: () => boolean, deadlineMs = 4000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

// The set the intent choke point actually handles (advanceStagesOnIntent +
// the combat handlers for boss kills). A stage outside this set is a stage
// nothing can ever fire — the exact class the owner ordered dead.
const HANDLED_KINDS = new Set([
  'investigate', 'stealth', 'diplomacy', 'escape', 'cast', 'attack_provoke', 'boss',
]);

describe('OTA-1236 — the audit: every stage of every mission is triggerable', () => {
  it('⚠⚠ every hunt stage carries a handled checkKind', () => {
    const offenders: string[] = [];
    for (const h of HUNTS) {
      for (const [i, st] of h.stages.entries()) {
        const kind = (st as { checkKind?: string }).checkKind;
        if (kind != null && !HANDLED_KINDS.has(kind)) offenders.push(`${h.id} stage ${i}: ${kind}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('⚠⚠ every mystery and storyline stage carries a handled checkKind', () => {
    const offenders: string[] = [];
    for (const m of MYSTERIES) {
      for (const [i, st] of m.stages.entries()) {
        const kind = (st as { checkKind?: string }).checkKind;
        if (kind != null && !HANDLED_KINDS.has(kind)) offenders.push(`mystery ${m.id} stage ${i}: ${kind}`);
      }
    }
    for (const sl of STORYLINES) {
      for (const [i, st] of sl.stages.entries()) {
        const kind = (st as { checkKind?: string }).checkKind;
        if (kind != null && !HANDLED_KINDS.has(kind)) offenders.push(`storyline ${sl.id} stage ${i}: ${kind}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('⚠ every hunt anchors to a routable tile (the gate can always be satisfied)', () => {
    for (const h of HUNTS) {
      const anchor = huntAnchorId(h);
      expect(typeof anchor).toBe('string');
      expect(anchor.length).toBeGreaterThan(0);
      const cell = canonicalCellOf(anchor);
      expect(Number.isFinite(cell.x)).toBe(true);
      expect(Number.isFinite(cell.y)).toBe(true);
    }
  });
});

describe("OTA-1236 — LIVE: the owner's exact wall, torn down", () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  async function bootWithBogDragon(atAnchor: boolean) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Hunter', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    const def = findHuntById('hunt_bog_dragon')!;
    expect(def).toBeTruthy();
    const anchor = huntAnchorId(def);
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        currentLocationId: atAnchor ? anchor : 'tartarian_outskirts',
        hubRoomId: null,
        // Stage index 1 = the card's "Stage 2/7 — The First Friction", the
        // owner's exact position. Tracked (activated), like his screenshot.
        activeHunts: [{ id: 'hunt_bog_dragon', stage: 1, tracked: true, postedByFaction: null, acceptedAt: 0 }],
      },
    });
    const scene = store.getState().currentScene!;
    // The owner's exact scene state: EVERYTHING already investigated — no
    // nouns left. Under the old dice gate this room had no path to the roll.
    useGameStore.setState({
      currentScene: { ...scene, enemies: [], hooks: [], ambientNouns: [], displayedAmbientNouns: [] },
    });
    return { store, anchor };
  }

  it('⚠⚠ at the anchor, in an EXHAUSTED room, `investigate the area` advances the stage', async () => {
    const { store } = await bootWithBogDragon(true);
    await store.getState().submitPlayerAction('investigate the area');
    await settle(() => (store.getState().player!.activeHunts?.[0]?.stage ?? 1) > 1);
    expect(store.getState().player!.activeHunts?.[0]?.stage).toBe(2);
  });

  it('at the WRONG place the stage holds — and the silence is replaced by a routing line', async () => {
    const { store } = await bootWithBogDragon(false);
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('investigate the area');
    await settle(() => store.getState().gameLog.length > before);
    expect(store.getState().player!.activeHunts?.[0]?.stage).toBe(1);
    const since = store.getState().gameLog.slice(before).map((e) => e.text).join('\n');
    expect(since).toMatch(/Not here\./);
  });

  it('a paused (deactivated) hunt never advances — the DEACTIVATE contract holds', async () => {
    const { store, anchor } = await bootWithBogDragon(true);
    const p = store.getState().player!;
    useGameStore.setState({
      player: { ...p, currentLocationId: anchor, activeHunts: [{ id: 'hunt_bog_dragon', stage: 1, tracked: false, postedByFaction: null, acceptedAt: 0 }] },
    });
    await store.getState().submitPlayerAction('investigate the area');
    await new Promise((r) => setTimeout(r, 400));
    expect(store.getState().player!.activeHunts?.[0]?.stage).toBe(1);
  });
});
