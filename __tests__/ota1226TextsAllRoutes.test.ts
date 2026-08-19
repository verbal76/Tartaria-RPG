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
// OTA-1226 — PUNCHLIST P16: all three doors open. Owner: *"push it through all routes,
// three doors makes it accessible even with bad faction standing."*
//
// Door 1 (rapport purchase) shipped in OTA-1218. This OTA opens the other two:
//   Door 2 — FOUND: the four Procedure Texts live in the ladder loot pools of four
//     aether-heavy sites, surfaced by OTA-1222's substitution. Zero standing required —
//     the accessibility guarantee itself.
//   Door 3 — STORY: four storylines hand the text over alongside their authored reward.
// Both doors produce an OBJECT; the read path is the one teacher, INT-gated at read time.
// OTA-1226 — PUNCHLIST P16: all three doors open. Owner: *"push it through all routes,
// three doors makes it accessible even with bad faction standing."*
//
// Door 1 (rapport purchase) shipped in OTA-1218. This OTA opens the other two:
//   Door 2 — FOUND: the four Procedure Texts live in the ladder loot pools of four
//     aether-heavy sites, surfaced by OTA-1222's substitution. Zero standing required —
//     the accessibility guarantee itself.
//   Door 3 — STORY: four storylines hand the text over alongside their authored reward.
// Both doors produce an OBJECT; the read path is the one teacher, INT-gated at read time.
import { useGameStore } from '../app/state/gameStore';
import {
  AETHER_TECHNIQUES, STORYLINE_TEXT_REWARDS, findTechnique, findTechniqueByTextName,
  techniqueTextName,
} from '../app/engine/aetherTechniques';
import { ladderLootPool } from '../app/engine/encounter';
import { WORLD_LADDER, findMicroMicroAnywhere } from '../app/engine/worldLadder';
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(180000);

const feedTail = (n: number) =>
  useGameStore.getState().gameLog.slice(n).map((l: { text: string }) => l.text).join('\n');

async function boot(name: string, factionId = 'mud_monarchs') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId });
  store.getState().skipTutorial?.();
  return store;
}

function giveText(techId: string): string {
  const tech = findTechnique(techId)!;
  const name = techniqueTextName(tech);
  const p = useGameStore.getState().player!;
  useGameStore.setState({
    player: {
      ...p,
      inventory: [...p.inventory, { id: `pt_${techId}`, name, kind: 'relic', rarity: tech.tier, quantity: 1, tags: ['text', 'procedure'] } as unknown as InventoryItem],
    },
  });
  return name;
}

describe('OTA-1226 / P16 — door 2, the texts are FINDABLE with zero standing', () => {
  test('⚠⚠ every technique has a text placed in a real ladder pool — no technique is standing-locked', () => {
    const placedTexts = new Set<string>();
    for (const macro of WORLD_LADDER.macroLocations) {
      for (const micro of macro.microLocations ?? []) {
        for (const mm of micro.microMicroLocations ?? []) {
          const pool = ladderLootPool(findMicroMicroAnywhere(mm.id));
          for (const row of pool) {
            const tech = findTechniqueByTextName(row.name);
            if (tech) placedTexts.add(tech.id);
          }
        }
      }
    }
    // ⚠ The whole ruling hangs here: a technique missing from every pool would have only
    // the standing-gated doors, which is exactly what "three doors" forbids.
    for (const t of AETHER_TECHNIQUES) expect([...placedTexts]).toContain(t.id);
  });

  test('⚠ the texts carry real catalog identity — priced by rarity, not 2-TC junk', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { lookupCraftedItem } = require('../app/engine/crafting') as typeof import('../app/engine/crafting');
    for (const t of AETHER_TECHNIQUES) {
      const cat = lookupCraftedItem(techniqueTextName(t));
      expect(cat.rarity).toBe(t.tier);
      expect(cat.tags).toContain('procedure');
    }
  });
});

describe('OTA-1226 / P16 — the READ path is the one teacher', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ reading a held text TEACHES the technique and consumes the text', async () => {
    const store = await boot('Reader');
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, stats: { ...p.stats, intelligence: 20 }, knownTechniques: [] } });
    const name = giveText('aether_shield');
    await store.getState().submitPlayerAction(`read ${name.toLowerCase()}`);
    const after = store.getState().player!;
    expect(after.knownTechniques ?? []).toContain('aether_shield');
    expect(after.inventory.some((i) => i.name === name)).toBe(false);
  });

  test('⚠⚠ INT too low: the read REFUSES and KEEPS the text — banked, not wasted', async () => {
    const store = await boot('Early Bird');
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, stats: { ...p.stats, intelligence: 8 }, knownTechniques: [] } });
    const name = giveText('resonance_cascade');
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction(`read ${name.toLowerCase()}`);
    const after = store.getState().player!;
    expect(after.knownTechniques ?? []).not.toContain('resonance_cascade');
    expect(after.inventory.some((i) => i.name === name)).toBe(true);
    expect(feedTail(before)).toMatch(/Grow into it/);
  });

  test('⚠ already known: the text is kept and named sellable', async () => {
    const store = await boot('Collector');
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, stats: { ...p.stats, intelligence: 20 }, knownTechniques: ['aether_shield'] } });
    const name = giveText('aether_shield');
    await store.getState().submitPlayerAction(`read ${name.toLowerCase()}`);
    expect(store.getState().player!.inventory.some((i) => i.name === name)).toBe(true);
  });
});

describe('OTA-1226 / P16 — door 3, the story pays the text', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠ every mapped storyline id and technique id is REAL — a reward aimed at nothing fires never', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const q = require('../app/data/quests/faction-storylines.json');
    const arr = Array.isArray(q) ? q : Object.values(q).find(Array.isArray) as { id: string }[];
    for (const [sid, tid] of Object.entries(STORYLINE_TEXT_REWARDS)) {
      expect(arr.some((st: { id: string }) => st.id === sid)).toBe(true);
      expect(findTechnique(tid)).toBeTruthy();
    }
    expect(Object.keys(STORYLINE_TEXT_REWARDS)).toHaveLength(4);
  });

  test('⚠⚠ finishing a mapped storyline HANDS OVER the text alongside the authored reward', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const q = require('../app/data/quests/faction-storylines.json');
    const arr = Array.isArray(q) ? q : Object.values(q).find(Array.isArray) as never[];
    const sid = 'story_builders_scripture_in_stone';
    const def = (arr as { id: string; factionId: string; stages: unknown[]; rewardItem?: string }[]).find((st) => st.id === sid)!;
    expect(def).toBeDefined();

    // Stand at the POSTING faction's own site (OTA-1224: hand-in is host-specific now).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FACTION_STARTING_LOCATION } = require('../app/engine/character') as typeof import('../app/engine/character');
    const store = await boot('Story Finisher', def.factionId);
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        currentLocationId: FACTION_STARTING_LOCATION[def.factionId]!,
        hubRoomId: 'outpost_armory',
        activeStorylines: [{ id: sid, stage: def.stages.length, postedByFaction: def.factionId, acceptedAt: Date.now() }],
      },
    });
    await store.getState().beginScene?.();
    store.getState().turnInStoryline(sid);
    const after = store.getState().player!;
    expect(after.completedStorylineIds ?? []).toContain(sid);
    // BOTH rewards: the authored item is untouched, and the text rides beside it.
    const names = after.inventory.map((i) => i.name);
    expect(names).toContain(techniqueTextName(findTechnique('aether_shield')!));
    if (def.rewardItem) expect(names).toContain(def.rewardItem);
  });
});
