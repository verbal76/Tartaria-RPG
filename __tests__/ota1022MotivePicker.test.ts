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

// OTA-1022 — THE ONE-TIME VETERAN MOTIVE PICKER. Owner: "let's do the one
// time motive picker" — pre-story saves had their motive DEALT by backfill,
// never chosen. This suite locks: the dealt/chosen distinction (backfill
// deals with chosen=false, creation always chooses), the load path raising
// the picker exactly for un-chosen saves, confirm committing the pick
// durably (asked once, never again), and the wiring at the source level.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore, backfillPlayer } from '../app/state/gameStore';
import { createCharacter } from '../app/engine/character';

describe('OTA-1022 — dealt vs chosen', () => {
  it('backfill DEALS a motive to pre-story saves: chosen = false', () => {
    const legacy: any = {
      name: 'Oldtimer', raceId: 'unknowing_mass', factionId: 'mud_monarchs',
      stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
      hp: 10, hpMax: 10, stamina: 5, staminaMax: 5,
      inventory: [], factionStanding: [], activeQuests: [],
      currentLocationId: 'reclaimer_stake', tc: 0,
    };
    const out = backfillPlayer(legacy);
    expect(out.storyMotive).toBeTruthy();
    expect(out.storyMotiveChosen).toBe(false);
  });

  it('creation always CHOOSES — explicit pick and rolled fallback alike', () => {
    const picked = createCharacter({ name: 'A', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'exile' } as any);
    expect(picked.storyMotive).toBe('exile');
    expect(picked.storyMotiveChosen).toBe(true);
    const rolled = createCharacter({ name: 'B', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' } as any);
    expect(rolled.storyMotiveChosen).toBe(true);
  });
});

describe('OTA-1022 — the load path owes exactly one ask', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('a dealt-motive save raises the picker on load; confirm commits forever', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'Veteran', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'debt',
    } as any);
    store.getState().dismissStoryIntro();
    store.getState().skipTutorial();
    expect(store.getState().motivePickerPending).toBe(false); // creation chose

    // Turn the save into a pre-picker veteran: motive present, never chosen.
    store.setState({ player: { ...store.getState().player!, storyMotiveChosen: false } });
    await store.getState().persist();
    const slotId = store.getState().activeSlotId!;

    await store.getState().loadSlotIntoGame(slotId);
    expect(store.getState().motivePickerPending).toBe(true);

    store.getState().confirmMotivePick('missing');
    const st = store.getState();
    expect(st.motivePickerPending).toBe(false);
    expect(st.player!.storyMotive).toBe('missing');
    expect(st.player!.storyMotiveChosen).toBe(true);
    const logs = st.gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/The Missing.*yours is the one that counts/s);

    // Asked once: the committed answer survives the next load. (confirm's
    // own persist is fire-and-forget like every store action; settle it.)
    await store.getState().persist();
    await store.getState().loadSlotIntoGame(slotId);
    expect(store.getState().motivePickerPending).toBe(false);
    expect(store.getState().player!.storyMotive).toBe('missing');
  });

  it('a bogus pick falls back to the dealt motive rather than corrupting the save', async () => {
    const store = useGameStore;
    store.setState({
      motivePickerPending: true,
      player: { ...store.getState().player!, storyMotive: 'calling', storyMotiveChosen: false },
    });
    store.getState().confirmMotivePick('not_a_motive');
    expect(store.getState().player!.storyMotive).toBe('calling');
    expect(store.getState().player!.storyMotiveChosen).toBe(true);
    expect(store.getState().motivePickerPending).toBe(false);
  });

  it('a fresh game never sees the picker', async () => {
    const store = useGameStore;
    await store.getState().startNewGame({
      name: 'Fresh', raceId: 'unknowing_mass', factionId: 'forgotten_order',
    } as any);
    expect(store.getState().motivePickerPending).toBe(false);
  });
});

describe('OTA-1022 — SOURCE LOCKS (category: the ask reaches the screen)', () => {
  const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

  it('both load paths raise the picker for un-chosen motives', () => {
    expect(storeSrc).toMatch(/motivePickerPending: player\.storyMotiveChosen !== true/);
    expect(storeSrc).toMatch(/motivePickerPending: revived\.storyMotiveChosen !== true/);
  });

  it('the modal mounts globally in App.tsx', () => {
    expect(appSrc).toMatch(/<MotivePickerModal \/>/);
  });
});
