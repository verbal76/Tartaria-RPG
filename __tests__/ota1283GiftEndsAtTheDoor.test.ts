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

// ⚠⚠ OTA-1283 (port of golem OTA-1280) — LEAVING THE PACK ENDS GIFT MODE.
//
// From the owner's device, in his own words:
//
//     "Even though I exited the give Halem a gift screen by backing out of the
//      inventory selection screen, I'm back into gameplay ... but when I hit my
//      inventory to equip a piece of armor afterwards, it still thinks that I'm
//      trying to gift Halem. if I am in a gift screen ... and I leave that
//      screen, I'm no longer giving a gift."
//
// The mode's entire UI lives on the inventory screen, but the ONLY exits that
// cleared it were the banner tap (cancelGiftMode) and a completed GIVE. The
// BACK button — the most natural way out of any screen — called plain
// setScreen('exploration') and left `giftMode` armed, so the NEXT inventory
// visit, minutes later and about armour, silently reopened as a gift picker.
// A mode that outlives its screen is invisible state; OTA-1154 said exactly
// that when it added the banner, and then left this door unguarded.
//
// The guard lives in setScreen — the one door every navigation passes through —
// not in the BACK button, so the tab bar, a forced navigation, or any future
// exit ends the mode the same way.
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

async function freshCharacterAtExplore(): Promise<void> {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'conspiracy_architects',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
  sub('Greg'); sub('look around'); sub('take the cudgel');
  sub("take the Mud-Warden's Vest");
  useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
  await new Promise((r) => setTimeout(r, 0));
  sub('take the rope'); sub('scrap the chest plate');
  for (let i = 0; i < 8 && beat() === 'climb'; i++) {
    sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb');
  }
  sub('investigate door');
  useGameStore.getState().chooseTutorialExplore();
  // Walk to the Mess (gate → square → mess) — Halem the Trader anchors there,
  // and a gift needs a recipient standing in the room. It is also where the
  // owner actually was: his skin labels it the Break Room.
  sub('go north');
  sub('go west');
}

/** Enter gift mode against whoever is present (single-candidate fast path or
 *  the picker), exactly as the GIVE affordance does. */
function enterGiftMode(): void {
  useGameStore.getState().openGift();
  const pg = useGameStore.getState().pendingGift;
  if (pg && pg.candidates.length > 0) {
    useGameStore.getState().chooseGiftRecipient(pg.candidates[0]!.id);
  }
}

describe("OTA-1283 — the owner's exact walk", () => {
  beforeAll(async () => { await freshCharacterAtExplore(); });

  it('⚠⚠ BACK out of the pack ends the gift; the next visit is a normal inventory', () => {
    const before = useGameStore.getState().gameLog.length;
    enterGiftMode();
    const st = useGameStore.getState();
    if (!st.giftMode) {
      throw new Error('PROBE — openGift did not arm: ' + JSON.stringify({
        pendingGift: st.pendingGift,
        log: st.gameLog.slice(before).map((e: { text: string }) => e.text),
        hubRoomId: st.player?.hubRoomId,
        enemies: st.currentScene?.enemies?.length,
      }));
    }
    expect(st.giftMode).not.toBeNull();
    expect(st.currentScreen).toBe('inventory');
    // His exit: the BACK button, which is a plain setScreen('exploration').
    useGameStore.getState().setScreen('exploration');
    expect(useGameStore.getState().giftMode).toBeNull();
    // His return: open the pack to equip armour. It must NOT be a gift picker.
    useGameStore.getState().setScreen('inventory');
    expect(useGameStore.getState().giftMode).toBeNull();
    useGameStore.getState().setScreen('exploration');
  });

  it('⚠⚠ ANY exit counts, not just BACK — the rule is the screen, not the button', () => {
    enterGiftMode();
    expect(useGameStore.getState().giftMode).not.toBeNull();
    useGameStore.getState().setScreen('world');   // tab bar, forced nav, anything
    expect(useGameStore.getState().giftMode).toBeNull();
    useGameStore.getState().setScreen('exploration');
  });

  it('⚠ the banner cancel still works and STAYS in the pack', () => {
    enterGiftMode();
    expect(useGameStore.getState().currentScreen).toBe('inventory');
    useGameStore.getState().cancelGiftMode();
    expect(useGameStore.getState().giftMode).toBeNull();
    // Cancelling the gift is not a navigation — the player keeps their pack.
    expect(useGameStore.getState().currentScreen).toBe('inventory');
    useGameStore.getState().setScreen('exploration');
  });

  it('⚠⚠ a COMPLETED give is untouched — it clears the mode before it navigates', () => {
    enterGiftMode();
    const item = useGameStore.getState().player!.inventory[0];
    expect(item).toBeTruthy();
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().giveGift(item!.id);
    const st = useGameStore.getState();
    expect(st.giftMode).toBeNull();
    expect(st.currentScreen).not.toBe('inventory');   // OTA-1155's return
    // ...and the door guard did not fire — the give path cleared first, so the
    // "left without giving" line must NOT appear on a give that happened.
    const feed = st.gameLog.slice(from).map((e: { text: string }) => String(e.text)).join(' | ');
    expect(feed).not.toContain('left the inventory without giving');
  });
});

describe('OTA-1283 — the guard sits at the one door', () => {
  it('⚠⚠ setScreen owns the rule — no button needs to remember it', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const i = store.indexOf('setScreen(screen) {');
    expect(i).toBeGreaterThan(-1);
    const body = store.slice(i, store.indexOf('async startNewGame', i));
    expect(body).toContain("get().giftMode && get().currentScreen === 'inventory' && screen !== 'inventory'");
    expect(body).toContain('gift: mode ended — left the inventory without giving');
    // And the InventoryScreen's BACK stays a dumb navigation — the fix must not
    // have been re-implemented locally there (one rule, one house).
    const screen = readFileSync(join(__dirname, '..', 'app', 'screens', 'InventoryScreen.tsx'), 'utf8');
    const back = screen.indexOf("onPress={() => setScreen('exploration')}");
    expect(back).toBeGreaterThan(-1);
  });
});
