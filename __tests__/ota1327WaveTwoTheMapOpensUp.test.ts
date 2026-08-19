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



// ⚠⚠ OTA-1327 — LOCATION ROADMAP, WAVE TWO (L4 + L5 + L6 + L16).
//
// Owner: *"anything that isn't the 9 cores mission is a side mission"* — which makes
// this the whole side-mission distribution problem, not one improvement among several.
//
// MEASURED BEFORE: 97 of the game's side missions (65 faction quests, 18 mysteries,
// 14 storylines) had no location of their own. Every one pinned on the posting
// faction's HOME OUTPOST, so the entire contract board resolved to just 10 tiles and
// **26 of 36 locations never received a single pin**. That is why the map did not
// develop: nothing ever pointed at two thirds of the world.
//
// ⚠ The prose was already doing the work. 31 of 32 mysteries and storylines NAME a
// real, resolvable location in their own poster or stage text; they simply had no
// field to carry it. This wave adds the field hunts have had since OTA-1218 and reads
// it with the same resolver, so "where does this contract happen" has ONE spelling
// across every family.
//
// ⚠⚠ AND IT IS DELIBERATELY NOT APPLIED TO EVERYTHING. 18 faction quests mention a
// place, but almost all are escorts and turn-ins that END AT A FACTION AGENT —
// "escort the pilgrims safely to a Forgotten Order agent". For those the faction home
// IS the destination, and routing them at the place their prose happens to mention
// would send the player the wrong way: the exact defect OTA-1218 and L1 just closed.
// Exactly ONE faction quest names a destination in its objective, and only it moved.
import { contractAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import mysteriesData from '../app/data/quests/mysteries.json';
import storylinesData from '../app/data/quests/faction-storylines.json';
import factionQuestsData from '../app/data/quests/faction-quests.json';
import huntsData from '../app/data/quests/hunts.json';
import locationsData from '../app/data/locations/locations.json';

type Q = { id: string; factionId?: string | null; targetLocationName?: string; objective?: string };
const pick = <T,>(d: unknown): T[] => {
  if (Array.isArray(d)) return d as T[];
  const o = d as Record<string, unknown>;
  return (Object.values(o).find((v) => Array.isArray(v)) ?? []) as T[];
};
const MYST = pick<Q>(mysteriesData);
const STORY = pick<Q>(storylinesData);
const FQ = pick<Q>(factionQuestsData);
const HUNTS = pick<Q>(huntsData);
const LOCS = pick<{ id: string }>(locationsData);

describe('OTA-1327 — the contract board points at the whole map', () => {
  it('⚠⚠ THE HEADLINE: pins reach 33 of 36 tiles, up from 10', () => {
    const tiles = new Set<string>();
    for (const q of [...MYST, ...STORY, ...FQ]) tiles.add(contractAnchorId(q));
    for (const h of HUNTS) tiles.add(resolvePosterLocation(h.targetLocationName)!);
    expect(tiles.size).toBeGreaterThanOrEqual(33);
    // The three that stay unpinned are already destinations via other systems:
    // iskan_veil (capital + guardian + labyrinth), parley_ground (a challenge),
    // and mud_flood_nexus — the main quest's terminal, which a side mission must
    // never send an unprepared player to.
    expect(tiles.has('mud_flood_nexus')).toBe(false);
  });

  it('⚠⚠ every routed target resolves to a REAL location — a pin cannot point at nothing', () => {
    const ids = new Set(LOCS.map((l) => l.id));
    for (const q of [...MYST, ...STORY, ...FQ]) {
      if (!q.targetLocationName) continue;
      const r = resolvePosterLocation(q.targetLocationName);
      expect(r).toBeTruthy();
      expect(ids.has(r!)).toBe(true);
    }
  });

  it('⚠ 16 of 18 mysteries and 13 of 14 storylines carry a target', () => {
    expect(MYST.filter((q) => q.targetLocationName).length).toBe(16);
    expect(STORY.filter((q) => q.targetLocationName).length).toBe(13);
    // The hold-outs are genuinely placeless — a hoard with no named location, a
    // six-name silencing run that happens wherever the names are.
    expect(MYST.filter((q) => !q.targetLocationName).map((q) => q.id)).toEqual(
      expect.arrayContaining(['mystery_hollow_crown']),
    );
  });

  it('⚠⚠ ESCORTS WERE LEFT ALONE — their destination is the agent, not the scenery', () => {
    // 18 faction quests mention a place; only the one whose OBJECTIVE says "travel
    // to" was routed. If this count grows, check that the new one is not an escort.
    const routed = FQ.filter((q) => q.targetLocationName);
    expect(routed.length).toBe(1);
    expect(routed[0]!.id).toBe('fq_servants_tribute');
    expect(routed[0]!.objective ?? '').toMatch(/travel to the giant vault/i);
    for (const q of FQ) {
      if (/escort/i.test(q.objective ?? '')) expect(q.targetLocationName).toBeUndefined();
    }
  });

  it('⚠ the faction home is still the fallback, not the default', () => {
    // A contract with no place of its own must still land somewhere sensible.
    expect(contractAnchorId({ factionId: 'forgotten_order' })).toBe('varakush');
    expect(contractAnchorId({ factionId: null })).toBe('tartarian_outskirts');
    // ...and a target beats the fallback.
    expect(contractAnchorId({ factionId: 'forgotten_order', targetLocationName: 'Samarran' })).toBe('samarran');
  });

  it('⚠⚠ no faction home carries 15 contracts any more', () => {
    const load = new Map<string, number>();
    for (const q of [...MYST, ...STORY, ...FQ]) {
      const a = contractAnchorId(q);
      load.set(a, (load.get(a) ?? 0) + 1);
    }
    // varakush was 15 before this wave.
    expect(Math.max(...load.values())).toBeLessThanOrEqual(11);
  });
});
