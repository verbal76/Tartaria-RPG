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
  buildInteractionTagsTemplate, buildMainQuestTemplate, buildBossesTemplate, buildAnnotatedGameBundle,
  buildGameBundleTemplate,
} from '../app/engine/contentTemplates';
import { CONTENT_TABLES, LORE_BLOCKS, clearAllOverrides } from '../app/engine/contentPack';
import { GENERIC_TABLE_ROWS } from '../app/engine/genericTemplateData';
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
    ['bosses', () => store().loadBossesJson(buildBossesTemplate())],
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

  // The whole-game file must carry EVERY loader-supported section, so an export is
  // never missing a section the engine can load (anything absent from the bundle is
  // silently dropped on export). This locks identity + every content section in.
  // engine_Dev — the TEMPLATE scaffolds must read GENERIC, not Tartaria. They used to
  // emit slices of the real game tables, leaking setting nouns (Aether/Mud Monarchs/
  // Tartary) into a blank author's file. This locks the genericized table templates
  // free of those proper nouns so they can't regress back to built-in data.
  const TARTARIA_NOUNS = /tartar|aether|etheric|reclaimer|mud monarch|forgotten order|mudstone|aetherstone/i;
  test.each(Object.keys(GENERIC_TABLE_ROWS))('table template is generic (no Tartaria nouns): %s', (id) => {
    // Row CONTENT only (includeTokenNote=false). The optional-field NOTES legitimately
    // document real engine condition ids (e.g. aether_powers) which are functional, not
    // flavor, and stay per "templates' scripting only, not the coding/usage".
    const t = getTableTemplate(id as (typeof CONTENT_TABLES)[number]['id'], undefined, false);
    const hit = t.match(TARTARIA_NOUNS);
    expect(hit ? `${id} leaks "${hit[0]}"` : 'clean').toBe('clean');
  });

  // The genericized special builders (Phase 2) must also be free of Tartaria nouns.
  // (Flavor pools are Phase 3 and still themed, so the whole bundle isn't asserted yet.)
  const genericSpecials: Array<[string, () => string]> = [
    ['missions', () => buildMissionsTemplate()],
    ['hooks', () => buildHooksTemplate()],
    ['whispers', () => buildWhispersTemplate()],
    ['summons', () => buildSummonsTemplate()],
    ['powers', () => getTableTemplate('powers', undefined, false)],
    ['world lore', () => getLoreTemplate('world')],
    ['flavor', () => getLoreTemplate('flavor')],
    ['faction lore', () => getLoreTemplate('faction')],
    ['race lore', () => getLoreTemplate('race')],
  ];
  test.each(genericSpecials)('special template is generic (no Tartaria nouns): %s', (_name, build) => {
    const hit = build().match(TARTARIA_NOUNS);
    expect(hit ? `leaks "${hit[0]}"` : 'clean').toBe('clean');
  });

  // With Phase 1-3 done, the ENTIRE whole-game file must read generic — no setting
  // proper nouns anywhere an author might leave a section at its template default.
  test('whole-game template is free of Tartaria nouns', () => {
    const hit = buildGameBundleTemplate().match(TARTARIA_NOUNS);
    expect(hit ? `whole-game leaks "${hit[0]}"` : 'clean').toBe('clean');
  });

  test('whole-game bundle includes every loader-supported section key', () => {
    const t = buildGameBundleTemplate();
    const required = [
      // identity
      'title', 'tagline', 'narrator', 'worldName', 'corruptionName', 'crucibleName', 'crucibleEnabled',
      // tables + lore (data-driven from the registries)
      ...CONTENT_TABLES.map((x) => x.id), ...LORE_BLOCKS.map((x) => x.id),
      // special content
      'missions', 'hooks', 'wasteland', 'titles', 'mainQuest', 'bosses', 'startingAreas',
      'interactionTags', 'summons', 'dogEnabled', 'damageTypes', 'damageResistances',
      'fusionTags', 'coatings', 'inventory', 'collectables', 'whispers',
    ];
    for (const key of required) expect(t).toContain(`"${key}"`);
  });
});
