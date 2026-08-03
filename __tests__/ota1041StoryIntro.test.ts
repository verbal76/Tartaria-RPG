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

// OTA-1041 — THE REASON YOU CAME DOWN (story feature, phase 1). Owner: "we
// have a ton of lore, a living civilization and economy, but no real story...
// we need a scrolling text intro akin to the Skyrim criminal-in-a-cart intro."
// Golem-line only. This suite locks: five motives exist and read; the crawl
// assembles universal + motive + faction + closing; a new character raises it;
// dismiss marks the CHARACTER as having seen it; old saves are dealt a stable
// motive WITHOUT ever being ambushed by the crawl.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore, backfillPlayer } from '../app/state/gameStore';
import {
  STORY_MOTIVE_IDS,
  getStoryMotives,
  introPagesFor,
  introFactionIds,
  assignMotive,
  isStoryMotiveId,
} from '../app/engine/story';
import { getFactions } from '../app/engine/character';

describe('OTA-1041 — the authored content is complete', () => {
  it('all five motives exist with a title, a blurb, and two crawl pages', () => {
    const motives = getStoryMotives();
    expect(motives.map((m) => m.id)).toEqual([...STORY_MOTIVE_IDS]);
    for (const m of motives) {
      expect(m.title.length).toBeGreaterThan(3);
      expect(m.blurb.length).toBeGreaterThan(10);
      expect(m.pages.length).toBe(2);
      for (const p of m.pages) expect(p.length).toBeGreaterThan(80);
    }
  });

  it('every playable faction has an intro paragraph', () => {
    const covered = new Set(introFactionIds());
    for (const f of getFactions()) {
      expect(covered.has(f.id)).toBe(true);
    }
  });

  it('the crawl assembles universal + motive + faction + closing, in order', () => {
    const pages = introPagesFor('missing', 'reclaimers_guild');
    // 3 universal + 2 motive + 1 faction + 1 closing
    expect(pages.length).toBe(7);
    expect(pages[0]).toMatch(/Aetherstone Flood/);
    expect(pages[3]).toMatch(/last letter is sewn into your coat/);
    expect(pages[5]).toMatch(/Reclaimers Guild/);
    expect(pages[6]).toMatch(/take your first step/i);
  });

  it('an unknown faction gets no faction page rather than a wrong one', () => {
    const pages = introPagesFor('debt', 'not_a_faction');
    expect(pages.length).toBe(6);
  });

  it('assignMotive is deterministic and always lands on a real motive', () => {
    const a = assignMotive('Verbal|aetherborn|reclaimers_guild');
    const b = assignMotive('Verbal|aetherborn|reclaimers_guild');
    expect(a).toBe(b);
    expect(isStoryMotiveId(a)).toBe(true);
  });
});

describe('OTA-1041 — a new character opens on their reason', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('startNewGame with a motive raises the personalized crawl; dismiss marks it seen', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: '', raceId: 'unknowing_mass', factionId: 'forgotten_order', motiveId: 'record',
    } as any);
    const p = store.getState().player!;
    expect(p.storyMotive).toBe('record');
    expect(p.storyIntroSeen).toBe(false);
    const intro = store.getState().storyIntro;
    expect(intro).not.toBeNull();
    expect(intro!.some((pg) => pg.includes('empty pages and a straight spine'))).toBe(true);
    expect(intro!.some((pg) => pg.includes('Forgotten Order'))).toBe(true);

    store.getState().dismissStoryIntro();
    expect(store.getState().storyIntro).toBeNull();
    expect(store.getState().player!.storyIntroSeen).toBe(true);
  });

  it('startNewGame WITHOUT a motive still deals one of the five (sims, legacy callers)', async () => {
    const store = useGameStore;
    await store.getState().startNewGame({ name: '', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    expect(isStoryMotiveId(store.getState().player!.storyMotive)).toBe(true);
    expect(store.getState().storyIntro).not.toBeNull();
    store.getState().dismissStoryIntro();
  });

  it('replayStoryIntro re-raises the same character crawl on demand', async () => {
    const store = useGameStore;
    expect(store.getState().storyIntro).toBeNull();
    store.getState().replayStoryIntro();
    const intro = store.getState().storyIntro;
    expect(intro).not.toBeNull();
    expect(intro!.length).toBeGreaterThanOrEqual(6);
    store.getState().dismissStoryIntro();
  });
});

describe('OTA-1041 — old saves are dealt a motive, never ambushed', () => {
  it('backfillPlayer assigns a stable motive and marks the intro seen', () => {
    const legacy: any = {
      name: 'Oldtimer', raceId: 'unknowing_mass', factionId: 'mud_monarchs',
      stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
      hp: 10, hpMax: 10, stamina: 5, staminaMax: 5,
      inventory: [], factionStanding: [], activeQuests: [],
      currentLocationId: 'reclaimer_stake', tc: 0,
    };
    const out = backfillPlayer(legacy);
    expect(isStoryMotiveId(out.storyMotive)).toBe(true);
    expect(out.storyIntroSeen).toBe(true);
    // Deterministic: the same save resolves to the same motive every load.
    const again = backfillPlayer(legacy);
    expect(again.storyMotive).toBe(out.storyMotive);
  });

  it('a character that already picked a motive keeps it through backfill', () => {
    const modern: any = {
      name: 'Chooser', raceId: 'unknowing_mass', factionId: 'reclaimers_guild',
      storyMotive: 'exile', storyIntroSeen: true,
      stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
      hp: 10, hpMax: 10, stamina: 5, staminaMax: 5,
      inventory: [], factionStanding: [], activeQuests: [],
      currentLocationId: 'reclaimer_stake', tc: 0,
    };
    expect(backfillPlayer(modern).storyMotive).toBe('exile');
  });
});

describe('OTA-1041 — SOURCE LOCKS (category: the story reaches the screen)', () => {
  const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const createSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'CharacterCreationScreen.tsx'), 'utf8');
  const charSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'CharacterScreen.tsx'), 'utf8');

  it('startNewGame raises the crawl and every load/reset path clears it', () => {
    expect(storeSrc).toMatch(/storyIntro: introPagesFor\(player\.storyMotive, player\.factionId\)/);
    const clears = storeSrc.match(/storyIntro: null/g) ?? [];
    // initial state + slot load + delete-slot + hard reset
    expect(clears.length).toBeGreaterThanOrEqual(4);
  });

  it('the overlay mounts GLOBALLY (OTA-1046 — replay must play over any screen)', () => {
    expect(appSrc).toMatch(/<StoryIntroOverlay \/>/);
  });

  it("creation has the motive step and passes the pick to startNewGame", () => {
    expect(createSrc).toMatch(/'race', 'faction', 'motive'/);
    // OTA-1089 — the motive is still passed; it is simply no longer the LAST
    // argument, because a fourth creation step (difficulty) now follows it.
    // Asserting on the trailing brace was asserting on the step ORDER, which
    // is a different claim than the one this test's name makes.
    expect(createSrc).toMatch(/startNewGame\(\{[^}]*motiveId/);
  });

  it('the CharacterScreen header offers REPLAY OPENING (OTA-1046 — moved off About, whose only real entry path has no live player)', () => {
    expect(charSrc).toMatch(/REPLAY\{'\\n'\}OPENING/);
    expect(charSrc).toMatch(/replayStoryIntro\(\)/);
  });
});
