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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1014 — THE WEDGED CONTRACTS CARD. Owner's report: after accidentally
// tapping quit-navigating, a READY faction contract showed a stale
// "Auto-routing" note with NO route button, and ~15 taps on the green
// COMPLETE "did nothing" (the log shows 7 invisible wrong-faction refusals
// spoken to the world feed while the Contracts screen was up). Three fixes:
// (1) stopTravel / stopWhisperCourse also clear player.routedMission;
// (2) the card's routed note requires a LIVE course (heals stale saves);
// (3) completeContractFromUI wraps the turn-in body and surfaces any refusal
//     as contractsNotice, rendered as a strip ON the Contracts screen.
jest.setTimeout(30000);

// ⚠ OTA-1400 — SLICE 9 sent contracts and the mission board into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — what a pin on THE STORE has meant since slice 4.
import { storeSource } from '../test-utils/storeSource';
import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { VENDORS } from '../app/engine/vendors';

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Router', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-1014 — cancelling a course stands down the mission route chain', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
  });

  it('stopTravel clears routedMission along with the course', async () => {
    const store = await boot();
    store.setState({
      player: {
        ...store.getState().player!,
        travelTarget: { locationId: 'reclaimers_stake', distanceRemaining: 5 },
        routedMission: { id: 'fq_wedge_probe', phase: 'to_turnin' },
      },
    });
    store.getState().stopTravel();
    const p = store.getState().player!;
    expect(p.travelTarget).toBeUndefined();
    // The wedge: this survived quit-navigating, freezing the card's
    // "Auto-routing" note over the ROUTE button.
    expect(p.routedMission).toBeNull();
  });

  it('stopWhisperCourse clears routedMission too', async () => {
    const store = useGameStore;
    store.setState({
      player: {
        ...store.getState().player!,
        travelTarget: undefined,
        whisperCourse: { mapX: 3, mapY: 4, label: 'probe' },
        routedMission: { id: 'fq_wedge_probe', phase: 'to_objective' },
      },
    });
    store.getState().stopWhisperCourse();
    const p = store.getState().player!;
    expect(p.whisperCourse).toBeNull();
    expect(p.routedMission).toBeNull();
  });
});

describe('OTA-1014 — a refused COMPLETE tap answers on the Contracts screen', () => {
  it('wrong-faction refusal surfaces as contractsNotice — and repeat taps (dedup-eaten) still surface it', async () => {
    const store = useGameStore;
    const def = FACTION_QUESTS.find((q) => q.factionId === 'reclaimers_guild')!;
    expect(def).toBeTruthy();
    const rival = VENDORS.find((v) => v.faction && v.faction !== 'reclaimers_guild')!;
    expect(rival).toBeTruthy();
    const scene = store.getState().currentScene!;
    store.setState({
      player: {
        ...store.getState().player!,
        activeFactionQuests: [{ id: def.id, stage: 0, postedByFaction: def.factionId, acceptedAt: 0 }],
        activeFactionQuestIds: [def.id],
      },
      currentScene: { ...scene, vendor: { ...(rival as any), stock: [] } as any, enemies: [] },
      contractsNotice: null,
      missionCompleteNotice: null,
    });

    // Tap 1 — the guard speaks a fresh Arbiter line; the wrapper surfaces it.
    store.getState().completeContractFromUI('faction_quest', def.id);
    const first = store.getState().contractsNotice;
    expect(first).not.toBeNull();
    expect(first!.text).toMatch(/wrong faction/i);
    // Nothing completed — the contract is still on the slate.
    expect((store.getState().player!.activeFactionQuests ?? []).map((q) => q.id)).toContain(def.id);

    // Dismiss, then tap again — the arbiter dedup swallows the repeated line
    // (this was the owner's 15-taps-into-silence). The wrapper's fallback
    // surfaces the suppressed line anyway.
    store.getState().clearContractsNotice();
    expect(store.getState().contractsNotice).toBeNull();
    store.getState().completeContractFromUI('faction_quest', def.id);
    const second = store.getState().contractsNotice;
    expect(second).not.toBeNull();
    expect(second!.text).toMatch(/wrong faction/i);
  });

  it('clearContractsNotice empties the strip', () => {
    const store = useGameStore;
    store.setState({ contractsNotice: { text: 'probe', ts: 1 } });
    store.getState().clearContractsNotice();
    expect(store.getState().contractsNotice).toBeNull();
  });
});

describe('OTA-1014 — SOURCE LOCKS (category: course-cancel clears routing; refusals visible on-screen)', () => {
  const storeSrc = storeSource();
  const screenSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'ContractsScreen.tsx'), 'utf8');

  it('both course-cancel paths clear routedMission (new shape present)', () => {
    expect(storeSrc).toMatch(/travelTarget: undefined, routedMission: null/);
    expect(storeSrc).toMatch(/whisperCourse: null, routedMission: null/);
  });

  it('the COMPLETE wrapper exists and the UI still calls the public name', () => {
    expect(storeSrc).toMatch(/completeContractFromUIInner\(kind, id\)/);
    expect(screenSrc).toMatch(/completeContractFromUI\(/);
    expect(screenSrc).not.toMatch(/completeContractFromUIInner/);
  });

  it('the routed note is gated on a LIVE course; the ungated shape is gone', () => {
    expect(screenSrc).toMatch(/const courseLive = !!player\?\.travelTarget \|\| !!player\?\.whisperCourse;/);
    expect(screenSrc).toMatch(/const routed = courseLive && player\?\.routedMission\?\.id === def\.id;/);
    expect(screenSrc).not.toMatch(/const routed = player\?\.routedMission\?\.id === def\.id;/);
  });

  it('the Contracts screen renders the strip and clears it on unmount', () => {
    expect(screenSrc).toMatch(/contractsNotice \? \(/);
    expect(screenSrc).toMatch(/clearContractsNotice\(\); \}, \[\]\);/);
  });
});
