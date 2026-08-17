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

// ⚠⚠ OTA-1285 (port of golem OTA-1269) — "WHY IS THERE NO EXIT BUTTON" / EXIT MEANT THREE THINGS.
//
// From the owner's 4.29.190 session, in order: he typed `exit` (→ the stamina
// refusal, because it fell through to overland travel with no destination),
// rested 16 game hours, typed `exit` again (→ "You move from room to room,
// looking closer. One floorboard sits proud..." — a SEARCH narration for a
// TRAVEL intent, +1h), typed `leave` (→ refused by the wander path's
// hook-thread block), and only the taught phrase `leave outpost` finally
// walked him out. Four attempts, ~18 game hours.
//
// ⚠⚠ THE BARE-WORD RULE EXISTED IN TWO PLACES ALREADY AND A THIRD DIDN'T HAVE
// IT: the tutorial's explore_or_leave allowance accepted bare `exit`, the
// building-interior handler accepted bare `exit`, and the hub travel gate —
// the one a free-roaming player actually hits — accepted neither `exit` nor
// `leave`. Ninth instance this session of one rule computed in several places.
// `isBareExitCommand` (hub.ts) is now the single source, used at all four
// decision points.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { isBareExitCommand, isLeaveHubCommand } from '../app/engine/hub';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};

// ⚠ OTA-1334 — ONE LIVING CHARACTER PER NAME now holds at the tutorial name beat,
// and every fresh character this file creates lives on in its slot. A fixed name
// here would be refused from the second creation onward, wedging the helper at the
// name ask — so each birth types a unique letter suffix (digits would be sanitized
// away by the name cleaner, so letters it is).
let bornSerial = 0;
const bornTag = (): string =>
  String.fromCharCode(97 + Math.floor(bornSerial / 26)) + String.fromCharCode(97 + (bornSerial++ % 26));
async function freshGameInHub(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'aetherborn', factionId: 'eternal_dynasty',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
  sub('Frank' + bornTag()); sub('look around'); sub('take the cudgel');
  sub("take the Mud-Warden's Vest");
  useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
  await new Promise((r) => setTimeout(r, 0));
  sub('take the rope'); sub('scrap the chest plate');
  for (let i = 0; i < 8 && beat() === 'climb'; i++) {
    sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb');
  }
  sub('investigate door');
  useGameStore.getState().chooseTutorialExplore();
  expect(useGameStore.getState().player?.hubRoomId).toBeTruthy();
}

const feedSince = (from: number): string =>
  useGameStore.getState().gameLog.slice(from).map((e: { text: string }) => String(e.text)).join(' | ');

describe('OTA-1285 (port of golem OTA-1269) — bare exit/leave walk you out of the outpost', () => {
  it.each(['exit', 'leave'])('⚠⚠ typing "%s" leaves — no floorboard story, no wander-hour', async (word) => {
    await freshGameInHub();
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction(word);
    const s = useGameStore.getState();
    expect(s.player?.hubRoomId).toBeNull();
    const feed = feedSince(from);
    expect(feed).toContain('walk back through the gate');
    // The owner's two wrong outcomes, both pinned dead:
    expect(feed).not.toContain('You move from room to room');
    expect(feed).not.toContain('floorboard');
  });

  it('⚠⚠ ...and a hook-thread on the scene no longer blocks it', async () => {
    // His `leave` was refused with "there is already a thread here that wants
    // finishing first" — the wander path's hook block answering a command that
    // was never a wander. Plant an unresolved hook, then leave.
    await freshGameInHub();
    const scene = useGameStore.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene,
        hooks: [...(scene.hooks ?? []), { id: 'zz_thread', kind: 'whisper', nouns: ['draft'], plantedLine: 'A draft.', resolved: false } as never],
      },
    });
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('leave');
    expect(useGameStore.getState().player?.hubRoomId).toBeNull();
    expect(feedSince(from)).not.toContain('thread here that wants finishing');
  });

  it('⚠⚠ a TARGETED leave/exit is untouched — the predicate is bare-words only', () => {
    // "leave the dog", "exit the conversation", "leave it" must not trip a
    // whole-outpost departure; only the naked I-want-out words do.
    for (const s of ['leave the dog', 'leave it', 'exit the menu', 'take the exit ramp', 'leave the rope here']) {
      expect(isBareExitCommand(s)).toBe(false);
    }
    for (const s of ['exit', 'leave', ' EXIT ', 'outside', 'step out', 'get out', 'get out of here']) {
      expect(isBareExitCommand(s)).toBe(true);
    }
    // And the two predicates stay disjoint duties: the phrased form is still
    // the other function's job, not silently absorbed into this one.
    expect(isLeaveHubCommand('leave outpost')).toBe(true);
    expect(isBareExitCommand('leave outpost')).toBe(false);
  });

  it('⚠ leaving still charges the overland step — bare words are a synonym, not a discount', async () => {
    // `leave outpost` spends travel stamina + an hour; the bare word must go
    // through the SAME branch, not a new free door.
    await freshGameInHub();
    const before = useGameStore.getState().player!.hoursElapsed ?? 0;
    useGameStore.getState().submitPlayerAction('exit');
    const after = useGameStore.getState().player!.hoursElapsed ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});
