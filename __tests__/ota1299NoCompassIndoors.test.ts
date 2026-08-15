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

// ⚠⚠ OTA-1299 (port of golem OTA-1298) — THE GAME WAS PRINTING TWO DIFFERENT NORTHS, BACK TO BACK.
//
// Owner, reading his own 4.29.206 log: *"it said leave The Outpost first but
// I'm seeing cardinal directions."* Every single interior room printed BOTH:
//
//   Paths: north to Promenade · south to Landing 1. (Type 'leave outpost'…)
//   [Dynasty Border Post] north: open ground · east: Tartarian Pilgrim Camp…
//
// The first line is the room graph — the only movement that works indoors. The
// second is the OVERLAND compass, describing a map you cannot walk until you
// leave, which the line directly above it has just finished telling you. Two
// contradictory norths, one after the other, in every room of every outpost.
//
// ⚠ AND OTA-1279 MADE IT WORSE, not better: now that interior norths are
// correct and consistent, a bogus second north beside them is pure noise. The
// radar is a WILDERNESS instrument. Indoors it has nothing to describe.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};
const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
const feedSince = (n: number): string[] =>
  useGameStore.getState().gameLog.slice(n).map((e: { text: string }) => String(e.text));
const compassLines = (lines: string[]): string[] =>
  // The banner can arrive merged into a grouped world entry, so scan the whole
  // text rather than only the start of it — a merged compass is still a compass.
  lines.filter((t) => /\[[^\]]+\] (north|east|south|west):/.test(t));

async function freshAtGate(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'aetherborn', factionId: 'eternal_dynasty',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  sub('Francis'); sub('look around'); sub('take the cudgel');
  sub("take the Mud-Warden's Vest");
  useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
  await new Promise((r) => setTimeout(r, 0));
  sub('take the rope'); sub('scrap the chest plate');
  for (let i = 0; i < 8 && beat() === 'climb'; i++) {
    sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb');
  }
  sub('investigate door');
  useGameStore.getState().chooseTutorialExplore();
}

describe('OTA-1299 (port of golem OTA-1298) — the overland compass stays outdoors', () => {
  it("⚠⚠ THE OWNER'S CASE: walking the outpost prints NO cardinal banner", async () => {
    await freshAtGate();
    const mark = useGameStore.getState().gameLog.length;
    // His exact walk: gate → square → vault → back down to the buried level.
    sub('go north'); sub('go north'); sub('go south'); sub('go south'); sub('go south');
    const lines = feedSince(mark);
    expect(compassLines(lines)).toEqual([]);
    // ...and the interior paths line IS still there — we removed the wrong
    // north, not the right one.
    // (merged world entries join with a paragraph break, so match anywhere)
    expect(lines.some((t) => t.includes('Paths: '))).toBe(true);
  });

  it('⚠⚠ ...and it COMES BACK the moment you step outside', async () => {
    await freshAtGate();
    const mark = useGameStore.getState().gameLog.length;
    sub('leave outpost');
    expect(useGameStore.getState().player?.hubRoomId ?? null).toBeNull();
    // Outdoors the radar is the whole point — it is how the player knows what
    // lies in each direction without a compass item.
    expect(compassLines(feedSince(mark)).length).toBeGreaterThan(0);
  });

  it('⚠ the gate is decided by BEING indoors, not by the room name', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(store).toContain('const indoors = !!hubRoom || !!get().activeBuildingId;');
    expect(store).toContain('if (!opts?.isOpening && !indoors) {');
  });
});
