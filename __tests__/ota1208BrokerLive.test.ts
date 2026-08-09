// OTA-1208 — THE LIVE PROOF. Everything in ota1208ContractBroker pins source and maths;
// this one drives the real store and actually hands a foreign faction's contract to the
// trading post, because "the gate function returns true" is not the same claim as "a
// player standing at the gate can finish the quest."
//
// ⚠ The two facts this establishes were BOTH wrong in the original PUNCHLIST P2 entry:
//   1. A player CAN already close their own faction's work anywhere (the Irma anchor is
//      re-pointed to the host, and the host is read from `player.factionId`).
//   2. `true_tartarians` work is therefore NOT reachable that way — she is re-pointed
//      away from them — and P2's table omitted them entirely.

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
// ⚠ `static createAsync = jest.fn(...)` infers its own type from its own initializer
// (TS7022) and is copied into every live suite in this repo. Annotated here so this
// file adds no new typecheck debt to the ci-typecheck-tests baseline.
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));


import { useGameStore } from '../app/state/gameStore';
import { MYSTERIES } from '../app/engine/mysteries';
import { BROKER_PLAYER_SHARE } from '../app/engine/contractBroker';

jest.setTimeout(120000);

/** Put a finished mystery on the slate so only the hand-in remains. */
function putOnSlate(id: string, stage: number, postedByFaction: string | null) {
  const p = useGameStore.getState().player;
  if (!p) throw new Error('no player');
  useGameStore.setState({
    player: { ...p, activeMysteries: [{ id, stage, postedByFaction, acceptedAt: Date.now() }] },
  });
}

/** Put the player in a hub room and re-roll until the named anchor is the scene vendor. */
async function standAt(room: string, vendorName: string, locationId: string) {
  const store = useGameStore;
  for (let i = 0; i < 80; i++) {
    const p = useGameStore.getState().player;
    if (!p) return null;
    useGameStore.setState({ player: { ...p, currentLocationId: locationId, hubRoomId: room } });
    await store.getState().beginScene?.();
    const v = store.getState().currentScene?.vendor;
    if (v?.name === vendorName) return v;
  }
  return null;
}

describe('OTA-1208 — a foreign faction’s mystery closes at the trading post', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ the whole point: it pays out, and it pays the broker rate', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Broker Probe', raceId: 'tartarian_giant', factionId: 'stone_builders' });
    store.getState().skipTutorial?.();

    // A mystery belonging to a faction that is NOT the player's, and NOT one of the two
    // anchors that keep their own faction (Tarek = reclaimers, Jorah = forgotten order).
    const target = MYSTERIES.find((m) =>
      m.factionId && !['stone_builders', 'reclaimers_guild', 'forgotten_order'].includes(m.factionId));
    expect(target).toBeDefined();

    // Put it on the slate, finished, so only the hand-in remains.
    putOnSlate(target!.id, target!.stages.length, target!.factionId ?? null);

    const halem = await standAt('outpost_gate', 'Halem the Trader', 'tartarian_outskirts');
    expect(halem).not.toBeNull();
    expect(halem!.faction).toBeNull();

    const tcBefore = store.getState().player!.tc ?? 0;
    store.getState().turnInMystery(target!.id);
    const after = store.getState().player!;

    // ⚠ It actually closed — not merely "was not refused".
    expect(after.completedMysteryIds ?? []).toContain(target!.id);
    expect((after.activeMysteries ?? []).some((m) => m.id === target!.id)).toBe(false);

    // ⚠ And it paid the broker rate: 80% of base, with NO long-haul bonus on top.
    const gained = (after.tc ?? 0) - tcBefore;
    expect(gained).toBe(Math.max(1, Math.round(target!.rewardTc * BROKER_PLAYER_SHARE)));
    expect(gained).toBeLessThan(target!.rewardTc);
  });

  test('⚠ the same contract at a WRONG faction agent is still refused', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Refusal Probe', raceId: 'tartarian_giant', factionId: 'stone_builders' });
    store.getState().skipTutorial?.();

    const target = MYSTERIES.find((m) =>
      m.factionId && !['stone_builders', 'reclaimers_guild', 'forgotten_order'].includes(m.factionId));
    putOnSlate(target!.id, target!.stages.length, target!.factionId ?? null);

    // Tarek keeps his own faction everywhere (only the Irma anchor is re-pointed).
    const tarek = await standAt('outpost_workshop', 'Tarek the Tinkerer', 'tartarian_outskirts');
    expect(tarek).not.toBeNull();
    expect(tarek!.faction).toBe('reclaimers_guild');

    store.getState().turnInMystery(target!.id);
    const after = store.getState().player!;
    // Refused — the broker is the exception, not a new general rule.
    expect(after.completedMysteryIds ?? []).not.toContain(target!.id);
  });

  test('⚠⚠ P2 CORRECTED: the player’s OWN faction was always closable at any armory', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Own Faction Probe', raceId: 'tartarian_giant', factionId: 'stone_builders' });
    store.getState().skipTutorial?.();

    const own = MYSTERIES.find((m) => m.factionId === 'stone_builders');
    expect(own).toBeDefined();
    putOnSlate(own!.id, own!.stages.length, own!.factionId ?? null);

    // A FOREIGN outpost's armory — the Irma anchor reads as the player's faction here.
    const irma = await standAt('outpost_armory', 'Irma Ironhand', 'monarch_waystation');
    expect(irma).not.toBeNull();
    expect(irma!.faction).toBe('stone_builders');

    const tcBefore = store.getState().player!.tc ?? 0;
    store.getState().turnInMystery(own!.id);
    const after = store.getState().player!;
    expect(after.completedMysteryIds ?? []).toContain(own!.id);
    // ⚠ FULL pay — she is the posting faction here, so no broker cut is taken.
    expect((after.tc ?? 0) - tcBefore).toBeGreaterThanOrEqual(own!.rewardTc);
  });
});
