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

// ⚠⚠ OTA-1295 (port of golem OTA-1294) — THE CHARACTER SELECT WAS A BOOT-TIME SNAPSHOT, AND THE OWNER
// CAUGHT IT EXACTLY:
//
//     "my character selection screen really wasn't a character selection
//      screen. it was a hallucination and it hadn't saved and updated in that
//      aspect so it didn't see the character which was still live?"
//
// Yes. The store's `slots` filled at hydrate and was re-read only on
// pull-to-refresh, restore, or delete. His character Francis was created THIS
// session — so when OTA-1292's lore trapdoor threw him onto the title, the
// list showed the world as it was at LAUNCH: no Francis. He read it as a wipe,
// reached for RESTORE, was told there was no backup, and only got his
// character back when a staged OTA applied and the reboot resumed the
// still-active slot ("Welcome back, Francis" — the disk record was intact the
// entire time; every persist through the dog fight is in his log).
//
// Two fixes ended this class: 1292 made lore's BACK stay in the game, and this
// one makes the title RE-LIST ON EVERY APPEARANCE, so even if some future
// navigation lands there mid-session, the screen tells the truth.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1295 (port of golem OTA-1294) — the title screen re-lists on every appearance', () => {
  it('⚠⚠ the mount effect exists and calls the real lister', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'screens', 'TitleScreen.tsx'), 'utf8');
    expect(src).toContain('useEffect(() => { void refreshSlots(); }, [refreshSlots]);');
  });

  it("⚠⚠ THE OWNER'S CASE: a character created THIS session appears after a refresh", async () => {
    // Boot-time state: no slots listed.
    useGameStore.setState({ slots: [] } as never);
    // Create a character mid-session (the store does NOT push it into `slots` —
    // that is exactly why a snapshot list lies).
    await useGameStore.getState().startNewGame({
      name: '', raceId: 'aetherborn', factionId: 'eternal_dynasty',
      motiveId: 'debt', pressure: 'owed',
    } as never);
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
    useGameStore.getState().submitPlayerAction('Francis');
    await useGameStore.getState().persist();
    expect((useGameStore.getState().slots as unknown[]).length).toBe(0);   // the stale lie
    // What the title's mount effect now runs:
    await useGameStore.getState().refreshSlots();
    const slots = useGameStore.getState().slots as Array<{ playerName?: string }>;
    expect(slots.some((s) => s.playerName === 'Francis')).toBe(true);      // the truth
    void TUTORIAL_STEPS;
  });
});
