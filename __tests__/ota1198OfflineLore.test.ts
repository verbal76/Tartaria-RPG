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



// OTA-1196 — LOOP AUDIT, BATCH 2. Same bar as batch 1: start it, finish it through a
// public action, and assert a payoff the PLAYER can see.
// OTA-1196 — LOOP AUDIT, BATCH 3. Same bar: start it, finish it, assert a payoff the
// PLAYER can see.
// OTA-1196 — LOOP AUDIT, BATCH 4 — the last of the WIRED rows.
// OTA-1198 — PUNCHLIST P17: the lore loop no longer needs the narration model.
//
// ⚠⚠ THE DEFECT, MEASURED. `titleProgress.loreRead` had exactly ONE writer in the whole
// codebase, and it sat inside `if (cognitive.isReady())`. On a device where the model fails
// to load — the owner's own, across OTA-1180 / OTA-1181 / OTA-1182, all reading
// `Narration engine: failed` — the counter never moved, so Scholar of Forgotten Lore was
// UNEARNABLE and 177 authored lore concepts were unreachable.
//
// ⚠ The loop-audit's title sweep did NOT catch this, and that is worth saying: it set
// loreRead to 9999 and confirmed the threshold fires. It proved the threshold, not that a
// player can move the number. Every test below moves the number the way a player does.
import { useGameStore } from '../app/state/gameStore';
import { findLoreConceptOffline, extractLoreQuery } from '../app/engine/askArbiter';
import { loadLoreConceptBank } from '../app/engine/loreConceptBank';

jest.setTimeout(180000);

async function fresh(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
  store.getState().skipTutorial?.();
  return store;
}

const feed = () => useGameStore.getState().gameLog.map((l: { text: string }) => l.text).join('\n');

describe('OTA-1198 / P17 — the offline matcher', () => {
  const BANK = loadLoreConceptBank();

  test('⚠⚠ the bank is big, and it needs no model to be read', () => {
    expect(BANK.length).toBeGreaterThan(100);
  });

  test('⚠⚠ every concept can be found by its OWN label — none is unreachable', () => {
    // The strongest reachability claim available: if a concept's own name does not find it,
    // nothing a player types will.
    const unreachable = BANK.filter((c) => findLoreConceptOffline(c.label.toLowerCase(), BANK)?.concept.id !== c.id);
    // ⚠ Some labels legitimately collide (two concepts named the same thing), and an
    // ambiguous label MUST refuse rather than guess. Those are the only allowed misses.
    const trulyDead = unreachable.filter(
      (c) => BANK.filter((o) => o.label.toLowerCase() === c.label.toLowerCase()).length === 1,
    );
    expect(trulyDead.map((c) => c.label)).toEqual([]);
  });

  test('⚠ an ambiguous query REFUSES rather than guessing — the P12 rule', () => {
    // A one-letter query is inside a great many labels.
    expect(findLoreConceptOffline('a', BANK)).toBeNull();
    expect(findLoreConceptOffline('', BANK)).toBeNull();
  });

  test('⚠ a query with no match is silent, not wrong', () => {
    expect(findLoreConceptOffline('zzzzz nonsense not in any lore', BANK)).toBeNull();
  });

  test('⚠ a query that CONTAINS a whole label still answers — deliberately forgiving', () => {
    // ⚠ My first version of this asserted the opposite and went red. Tier 2 matches both
    // directions, so 'qwertyuiop aetherstone' finds Aetherstone. That is correct: a player
    // typing a sentence around a real term should get the real term.
    expect(findLoreConceptOffline('qwertyuiop aetherstone', BANK)?.concept.label).toBe('Aetherstone');
  });

  test('⚠ but a query whose words appear NOWHERE together is refused', () => {
    expect(findLoreConceptOffline('qwertyuiop plumbus', BANK)).toBeNull();
  });

  test('the parser prefix stripper feeds it a clean topic', () => {
    expect(extractLoreQuery('ask the arbiter about the black cloaks')).toBe('the black cloaks');
    expect(extractLoreQuery('what is aetherstone?')).toBe('aetherstone');
  });
});

describe('OTA-1198 / P17 — LIVE, with no narration model at all', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ asking about lore ANSWERS and ticks the counter — model absent', async () => {
    const store = await fresh('Scholar');
    // The jest harness mocks llama.rn to a stub that never loads, so `cognitive.isReady()`
    // is false here for the same reason it is false on the owner's phone. That is the
    // condition under test, not a workaround.
    const before = store.getState().player!.titleProgress?.loreRead ?? 0;

    await store.getState().submitPlayerAction('ask the arbiter about the black cloaks');
    await new Promise((r) => setTimeout(r, 60));   // the ask handler answers async

    expect(feed()).toMatch(/Black Cloaks/i);
    expect(store.getState().player!.titleProgress?.loreRead ?? 0).toBe(before + 1);
    expect(store.getState().player!.loreConceptsRead ?? []).toHaveLength(1);
  });

  test('⚠⚠ asking the SAME thing again does NOT tick it — distinct concepts, not asks', async () => {
    const store = useGameStore;
    const after1 = store.getState().player!.titleProgress?.loreRead ?? 0;
    await store.getState().submitPlayerAction('ask the arbiter about the black cloaks');
    await new Promise((r) => setTimeout(r, 60));
    // ⚠ A title called Scholar of Forgotten Lore earned by asking one question three times
    // is a farm. Growth-through-repetition has been closed twice this session already.
    expect(store.getState().player!.titleProgress?.loreRead ?? 0).toBe(after1);
  });

  test('⚠⚠ THREE DIFFERENT concepts EARN the title — the whole point of P17', async () => {
    const store = await fresh('Scholar Two');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WIRED_TITLES } = require('../app/engine/titles') as typeof import('../app/engine/titles');
    expect(WIRED_TITLES.some((t) => t.id === 'scholar_of_forgotten_lore')).toBe(true);

    const bank = loadLoreConceptBank();
    // ⚠ Ask until THREE DISTINCT concepts have been credited. Asking three different
    // labels is not the same thing: two labels can resolve to the same concept through the
    // keyword path, and the first version of this test assumed they could not (it got 2).
    const picks = bank.filter((c) => bank.filter((o) => o.label === c.label).length === 1);
    for (const c of picks) {
      if ((store.getState().player!.titleProgress?.loreRead ?? 0) >= 3) break;
      await store.getState().submitPlayerAction(`ask the arbiter about ${c.label.toLowerCase()}`);
      await new Promise((r) => setTimeout(r, 40));
    }

    expect(store.getState().player!.titleProgress?.loreRead ?? 0).toBeGreaterThanOrEqual(3);
    // THE PAYOFF: the title is actually held, on a device with no model.
    expect(store.getState().player!.earnedTitles ?? []).toContain('scholar_of_forgotten_lore');
  });

  test('⚠ a question with no lore behind it still does not tick the counter', async () => {
    const store = await fresh('Scholar Three');
    const before = store.getState().player!.titleProgress?.loreRead ?? 0;
    await store.getState().submitPlayerAction('ask the arbiter about zzzzz nonsense topic');
    await new Promise((r) => setTimeout(r, 60));
    expect(store.getState().player!.titleProgress?.loreRead ?? 0).toBe(before);
  });
});

describe('OTA-1198 / P17 — the address is not the topic', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ "ask the arbiter about <nonsense>" must not match the ARBITER concept', async () => {
    // The keyword lookup used the raw parsed target, which still carries the word
    // "arbiter" — and `arbiter` is a lore keyword. So every ask matched something whenever
    // nothing longer beat it. Harmless while it only printed prose; a farm the moment it
    // credits the title.
    const store = await fresh('Address Probe');
    const before = store.getState().player!.titleProgress?.loreRead ?? 0;
    for (let i = 0; i < 3; i++) {
      await store.getState().submitPlayerAction(`ask the arbiter about zzzz${i} nonsense topic`);
      await new Promise((r) => setTimeout(r, 40));
    }
    expect(store.getState().player!.titleProgress?.loreRead ?? 0).toBe(before);
    expect(store.getState().player!.earnedTitles ?? []).not.toContain('scholar_of_forgotten_lore');
  });
});
