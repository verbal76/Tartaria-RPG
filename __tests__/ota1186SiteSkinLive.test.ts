// OTA-1186 — LIVE PROOF THAT THE SKIN ACTUALLY CHANGES IN PLAY.
//
// ⚠⚠ WHY THIS EXISTS SEPARATELY FROM ota1186SiteSkin. That suite calls
// `hubSkinFactionFor` directly, so it proves the resolver is right and proves nothing
// about whether the arguments it gets in the real app are the ones it needs. The whole
// change hinges on `player.currentLocationId` holding the hub MACRO-location while the
// player is inside a room — if it held the room id instead, every lookup would miss, the
// fallback would return the player's faction, and the OTA would silently do nothing while
// 16 green unit tests said otherwise.
//
// That is the same failure mode that put two wrong claims in the PUNCHLIST P2 entry:
// reading the layer above and the layer below without running the one in between.

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


import { useGameStore } from '../app/state/gameStore';
import { hubNameForFaction } from '../app/engine/hub';

jest.setTimeout(120000);

async function enterHub(locationId: string, room: string) {
  const store = useGameStore;
  const p = store.getState().player!;
  useGameStore.setState({ player: { ...p, currentLocationId: locationId, hubRoomId: room } });
  await store.getState().beginScene?.();
  return store.getState();
}

/** ⚠ The hub header the player actually READS. `hubName` is an argument to
 *  `buildOpeningNarrative`, not a field on `currentScene` — the first version of this
 *  suite asserted `currentScene.hubName` and got `undefined` three times over. The header
 *  is emitted as a world log line (`sceneText`), so that is what gets checked.
 *
 *  ⚠⚠ AND IT MUST BE SCOPED TO WHAT THIS ARRIVAL EMITTED. The second version joined the
 *  WHOLE feed and failed: the character's own opening scene at their own starting site is
 *  still in it, so "Monarch Court" was present at the Architect Blind — written three
 *  arrivals earlier, by the opening. A feed assertion that does not bound its window is
 *  reading someone else's sentence. */
function logLength(): number {
  return (useGameStore.getState().gameLog ?? []).length;
}
function feedSince(mark: number): string {
  const entries = useGameStore.getState().gameLog ?? [];
  return entries.slice(mark).map((e: { text?: string }) => e.text ?? '').join('\n');
}

describe('OTA-1186 — live: a foreign site reads as its owner', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ currentLocationId holds the MACRO location while inside a room', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Skin Probe', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();
    const s = await enterHub('architect_blind', 'outpost_gate');
    // If this were the room id, every ownership lookup would miss and the OTA would be a
    // no-op that all the unit tests still passed.
    expect(s.player!.currentLocationId).toBe('architect_blind');
    expect(s.player!.hubRoomId).toBe('outpost_gate');
  });

  test('⚠⚠ the scene at the Architect Blind is named for the ARCHITECTS, not the visitor', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Skin Probe 2', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();
    const mark = logLength();
    await enterHub('architect_blind', 'outpost_gate');
    const feed = feedSince(mark);
    expect(feed).toContain(hubNameForFaction('conspiracy_architects'));
    expect(feed).not.toContain(hubNameForFaction('mud_monarchs'));
  });

  test('at their OWN site a Monarch still sees Monarch Court', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Skin Probe 3', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();
    const mark = logLength();
    await enterHub('monarch_waystation', 'outpost_gate');
    expect(feedSince(mark)).toContain(hubNameForFaction('mud_monarchs'));
  });

  test('⚠ at an UNOWNED site (a lost capital) nothing changed — still the visitor’s', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Skin Probe 4', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();
    const mark = logLength();
    await enterHub('asgardar', 'outpost_gate');
    expect(feedSince(mark)).toContain(hubNameForFaction('mud_monarchs'));
  });

  test('⚠ and the broker is still standing in the gate at the foreign site', async () => {
    // OTA-1185's fallback must survive the reskin at the exact place it matters most —
    // a site whose own faction the player may be hostile to.
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Skin Probe 5', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      const s = await enterHub('architect_blind', 'outpost_gate');
      if (s.currentScene?.vendor?.id === 'halem_trader') found = true;
    }
    expect(found).toBe(true);
  });
});
