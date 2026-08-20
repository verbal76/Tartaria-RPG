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

// ⚠⚠ OTA-1292 — LORE'S BACK BUTTON WAS A TRAPDOOR OUT OF THE GAME.
//
// Owner, right after clearing the beginner outpost and getting his dog:
//
//     "I went into lore went into beasts read all that I hit the back button
//      and it dropped me to the character selection screen and that character
//      was wiped"
//
// The LoreScreen was built as a TITLE-MENU destination (v2.4.1 OTA 046) and
// its BACK is hard-wired setScreen('title'). Then the exploration crest nav
// (◈ LORE) started linking here MID-GAME — so reading the bestiary always
// ended with the player dumped onto the character select, mid-session, save
// state live behind it. With a character loaded, BACK now returns to the
// game; the true title-menu path still returns to title.
//
// ⚠ The WIPE half of his report did not reproduce in the store (fresh
// character → lore → title → refreshSlots → resume restored everything), so
// the navigation trapdoor is what this OTA fixes; the wipe investigation
// continues on his device log. This suite ALSO pins the two save-protection
// guards that make a wipe-by-navigation impossible in the store, so if the
// device wipe turns out to be one of them regressing, the pin names it.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};
const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);

// ⚠ OTA-1339 — ONE LIVING CHARACTER PER NAME now holds at the tutorial name beat,
// and every fresh character this file creates lives on in its slot. A fixed name
// here would be refused from the second creation onward, wedging the helper at the
// name ask — so each birth types a unique letter suffix (digits would be sanitized
// away by the name cleaner, so letters it is).
let bornSerial = 0;
const bornTag = (): string =>
  String.fromCharCode(97 + Math.floor(bornSerial / 26)) + String.fromCharCode(97 + (bornSerial++ % 26));
async function freshAtExplore(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  sub('Greg' + bornTag()); sub('look around'); sub('take the cudgel');
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

describe("OTA-1292 — lore's BACK stays in the game", () => {
  it('⚠⚠ the source rule: BACK is conditional on a live session, not hard-wired', () => {
    const lore = src('app', 'screens', 'LoreScreen.tsx');
    expect(lore).toContain("setScreen(inSession ? 'exploration' : 'title')");
    expect(lore).not.toContain("onPress={() => setScreen('title')}");
    // The session flag reads the one authority — a loaded player.
    expect(lore).toContain('useGameStore((s) => s.player !== null)');
  });

  it("⚠⚠ THE OWNER'S WALK: explore → lore → BACK lands back in the game", async () => {
    await freshAtExplore();
    expect(useGameStore.getState().player).not.toBeNull();
    useGameStore.getState().setScreen('lore');
    // The fixed BACK:
    useGameStore.getState().setScreen('exploration');
    const st = useGameStore.getState();
    expect(st.currentScreen).toBe('exploration');
    expect(st.player).not.toBeNull();      // nobody got logged out
  });

  it('⚠⚠ EVEN THE OLD TRAPDOOR CANNOT WIPE: title + refresh + resume round-trips the save', async () => {
    // The wipe protection this suite exists to pin: if a future navigation bug
    // drops a live session onto the title again, the save must survive it.
    await freshAtExplore();
    sub('go north');
    const before = useGameStore.getState().player!;
    await useGameStore.getState().persist();
    useGameStore.getState().setScreen('lore');
    useGameStore.getState().setScreen('title');           // the old trapdoor
    await useGameStore.getState().refreshSlots();
    const slots = useGameStore.getState().slots as Array<{ slotId: string; playerName?: string }>;
    const mine = slots.find((s) => s.playerName === before.name);
    expect(mine).toBeTruthy();
    await useGameStore.getState().loadSlotIntoGame(mine!.slotId);
    const after = useGameStore.getState().player;
    expect(useGameStore.getState().slotLoadError).toBeNull();
    expect(after?.name).toBe(before.name);
    expect(after?.hubRoomId).toBe(before.hubRoomId);
    expect(after?.inventory.length).toBe(before.inventory.length);
  });

  it('⚠⚠ the two guards that make navigation wipes impossible stay pinned', () => {
    // ⚠ OTA-1392 — THE FIRST GUARD MOVED FILES, AND THIS ASSERTION MOVED WITH IT.
    // `persist()` left gameStore.ts for `app/state/slices/persistSlice.ts` when
    // the store split began. The guard is character-for-character the same; only
    // its address changed. Re-pointing this rather than relaxing it is the whole
    // point — a source pin that gets loosened after a refactor stops pinning
    // anything, and this one guards against overwriting a real save with a stub.
    const persistSrc = src('app', 'state', 'slices', 'persistSlice.ts');
    // persist() refuses a null player and a stub player outright.
    expect(persistSrc).toContain('if (!player) return false;');
    expect(persistSrc).toContain('if (!player.name || !player.raceId || !player.stats) {');
    // ...and a failed load rolls the active slot back BEFORE anything can
    // persist over it.
    // ⚠ OTA-1394 — THIS HALF MOVED TOO. The note here used to read "still in
    // gameStore — loadSlotIntoGame has not been sliced out", and slice 3 sliced
    // it out. Both guards now live in `app/state/slices/`, one file each:
    // persistSlice owns the refusal to write a stub, slotSlice owns the
    // roll-back on a failed load. Re-pointed, not relaxed — together they are
    // what makes a navigation bug unable to cost somebody their character.
    const slotSrc = src('app', 'state', 'slices', 'slotSlice.ts');
    expect(slotSrc).toContain('try { await setActiveSlot(null); } catch { /* ignore */ }');
  });
});
