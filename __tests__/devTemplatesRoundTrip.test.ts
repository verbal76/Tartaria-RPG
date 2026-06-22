// engine_Dev — every dev-console box's TEMPLATE button must emit JSON its own LOADER
// accepts. This is the regression net for "Template → edit → Load" round-tripping on
// EVERY box, so a template can never silently drift out of sync with its loader.
//
// It caught a real one (OTA-756): the Faction/Race LORE templates emitted the
// playable-table rows, which the lore loader REJECTS (those belong in the TABLE
// boxes). This locks that — and every other box — in. As more boxes/loaders are
// added, append them below and the round-trip is guaranteed.

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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));

import {
  getTableTemplate, getLoreTemplate,
  buildMissionsTemplate, buildHooksTemplate, buildWhispersTemplate, buildWastelandTemplate,
  buildTitlesTemplate, buildStartingAreasTemplate, buildCollectablesTemplate, buildSummonsTemplate,
  buildInteractionTagsTemplate, buildMainQuestTemplate, buildAnnotatedGameBundle,
} from '../app/engine/contentTemplates';
import { CONTENT_TABLES, LORE_BLOCKS, clearAllOverrides } from '../app/engine/contentPack';
import { useContentPackStore } from '../app/state/contentPackStore';

const store = () => useContentPackStore.getState();
beforeEach(() => { store().clearAll(); clearAllOverrides(); });

describe('dev-console TEMPLATE → LOAD round-trips', () => {
  test.each(CONTENT_TABLES.map((t) => t.id))('table template loads: %s', (id) => {
    const r = store().loadTableJson(id, getTableTemplate(id));
    expect(r.ok).toBe(true);
  });

  test.each(LORE_BLOCKS.map((b) => b.id))('lore template loads: %s', (id) => {
    const r = store().loadLoreJson(id, getLoreTemplate(id));
    expect(r.ok).toBe(true);
  });

  // Special boxes — each build*Template() must satisfy its dedicated loader.
  const special: Array<[string, () => { ok: boolean; error?: string }]> = [
    ['missions', () => store().loadMissionsJson(buildMissionsTemplate())],
    ['hooks', () => store().loadHooksJson(buildHooksTemplate())],
    ['whispers', () => store().loadWhispersJson(buildWhispersTemplate())],
    ['wasteland', () => store().loadWastelandJson(buildWastelandTemplate())],
    ['titles', () => store().loadTitlesJson(buildTitlesTemplate())],
    ['startingAreas', () => store().loadStartingAreasJson(buildStartingAreasTemplate())],
    ['collectables', () => store().loadCollectablesJson(buildCollectablesTemplate())],
    ['summons', () => store().loadSummonsJson(buildSummonsTemplate())],
    ['interactionTags', () => store().loadInteractionTagsJson(buildInteractionTagsTemplate())],
    ['mainQuest', () => store().loadMainQuestJson(buildMainQuestTemplate())],
  ];
  test.each(special)('special template loads: %s', (_name, load) => {
    expect(load().ok).toBe(true);
  });

  // The WHOLE-GAME file (blank, all-template) must apply through loadGameBundle, which
  // also covers the damage-types / resistances / fusion-tags / coatings / inventory /
  // mainQuest / bosses sections that live only in the bundle + their dev-box consts.
  test('whole-game template applies via loadGameBundle', () => {
    const r = store().loadGameBundle(buildAnnotatedGameBundle({}));
    expect(r.ok).toBe(true);
  });
});
