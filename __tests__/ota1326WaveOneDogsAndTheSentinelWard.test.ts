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



// ⚠⚠ OTA-1326 — LOCATION ROADMAP, WAVE ONE (L1 + L2 + L3).
//
// From the LOCATION-CHANGES.md audit. Two owner instructions, both data-only:
//
// L1  *"the Sentinel Ward"* — `hunt_iron_titan`'s poster names a place that did not
//     exist, making it the ONE hunt in eighteen whose poster could not resolve; it
//     fell back to the biome anchor and pinned on `obsidian_pillars`. Meanwhile
//     `etheric_chamber` (tags vault/core/guarded, danger 5) was the only genuinely
//     dead location in the game — nothing pointed at it at all. One alias joins them.
//
// L2/L3 *"leave dog events at outposts."* All four rescue scenarios matched on
//     world-shape tags (`ruin`, `buried`, `lost_capital`, `wasteland`, `open`), which
//     put a chained shepherd inside six Lost Capitals, the Endless Stair, the Sinking
//     Cathedral and Iskan-Veil. `cellar` alone was eligible at 13 locations, 3 of them
//     outposts.
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolvePosterLocation, huntAnchorId } from '../app/engine/contractMarkers';
import { RESCUE_SCENARIOS } from '../app/engine/dogCompanion';
import huntsData from '../app/data/quests/hunts.json';
import locationsData from '../app/data/locations/locations.json';
import staticHub from '../app/data/world/static_hub.json';

type Loc = { id: string; name: string; tags?: string[]; type?: string; aliases?: string[] };
const LOCS = ((locationsData as unknown as { locations?: Loc[] }).locations
  ?? (locationsData as unknown as Loc[])) as Loc[];
const HUNTS = ((huntsData as unknown as { hunts: Array<{ id: string; biomeTag?: string; targetLocationName?: string; factionId?: string }> }).hunts);
const HUB_IDS: string[] = (staticHub as unknown as { hubLocationIds: string[] }).hubLocationIds;
const tagsOf = (l: Loc): string[] => [...(l.tags ?? []), l.type ?? ''].map((t) => t.toLowerCase());

describe('OTA-1326 L1 — the Sentinel Ward is a real place now', () => {
  it('⚠⚠ the poster name resolves, where it used to resolve to nothing', () => {
    expect(resolvePosterLocation('the Sentinel Ward (inner archive)')).toBe('etheric_chamber');
  });

  it('⚠⚠ THE POINT: every hunt now anchors on the place its poster NAMES', () => {
    // Before this there was exactly one biome fallback in the whole table.
    for (const h of HUNTS) {
      const poster = resolvePosterLocation(h.targetLocationName);
      expect(poster).toBeTruthy();
      expect(huntAnchorId(h)).toBe(poster);
    }
  });

  it('⚠ and the tile it points at is no longer dead', () => {
    const anchored = HUNTS.filter((h) => huntAnchorId(h) === 'etheric_chamber');
    expect(anchored.map((h) => h.id)).toContain('hunt_iron_titan');
  });

  it('⚠ the existing aliases still work — this added, it did not replace', () => {
    for (const a of ['chamber', 'aetheric core', 'power chamber']) {
      expect(resolvePosterLocation(a)).toBe('etheric_chamber');
    }
  });
});

describe('OTA-1326 L2/L3 — dog rescues are outpost-only', () => {
  const eligible = (arch: readonly string[]): Loc[] =>
    LOCS.filter((l) => tagsOf(l).some((t) => arch.includes(t)));

  it('⚠⚠ ALL FOUR scenarios, not just the one that was measured', () => {
    const ids = Object.keys(RESCUE_SCENARIOS);
    expect(ids.sort()).toEqual(['cellar', 'smelter', 'snare', 'wagon']);
    for (const id of ids) {
      expect(RESCUE_SCENARIOS[id as keyof typeof RESCUE_SCENARIOS].archetypes).toEqual(['outpost']);
    }
  });

  it('⚠⚠ no rescue is eligible at a Lost Capital, a ruin, or a climb landmark', () => {
    for (const sc of Object.values(RESCUE_SCENARIOS)) {
      for (const l of eligible(sc.archetypes)) {
        expect(tagsOf(l)).not.toContain('lost_capital');
        expect(tagsOf(l)).not.toContain('buried_capital');
        expect(l.id).not.toBe('endless_stair');
        expect(l.id).not.toBe('sinking_cathedral');
        expect(l.id).not.toBe('iskan_veil');
      }
    }
  });

  it('⚠⚠ ...and every place that IS eligible actually hosts an outpost', () => {
    // The whole instruction, stated as one assertion.
    for (const sc of Object.values(RESCUE_SCENARIOS)) {
      const places = eligible(sc.archetypes);
      expect(places.length).toBeGreaterThan(0); // a rescue nobody can find is worse
      for (const l of places) expect(HUB_IDS).toContain(l.id);
    }
  });

  it('⚠ `outpost` is outpost-exclusive — that is why it is the tag used', () => {
    // Every other tag the hubs carry leaks somewhere else; this one was chosen by
    // checking all 30 of them. If a non-hub ever gains it, dogs escape again.
    const carriers = LOCS.filter((l) => tagsOf(l).includes('outpost')).map((l) => l.id);
    expect(carriers.length).toBeGreaterThanOrEqual(9);
    for (const id of carriers) expect(HUB_IDS).toContain(id);
  });

  it('⚠ the starter region can still give you your first dog', () => {
    // tartarian_outskirts hosts a hub and is where a new player is; it gained the
    // tag in this pass precisely so the first dog stays reachable.
    const starter = LOCS.find((l) => l.id === 'tartarian_outskirts')!;
    expect(tagsOf(starter)).toContain('outpost');
  });
});
