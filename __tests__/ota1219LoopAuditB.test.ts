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



// OTA-1219 — LOOP AUDIT, BATCH 2. Same bar as batch 1: start it, finish it through a
// public action, and assert a payoff the PLAYER can see.
import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(180000);

async function fresh(name: string, factionId = 'mud_monarchs') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId });
  store.getState().skipTutorial?.();
  return store;
}

describe('LOOP 14 — titles: a threshold is crossed, a title is earned, a perk applies', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ every WIRED title is reachable — not one is a dead entry', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const T = require('../app/engine/titles') as typeof import('../app/engine/titles');
    const store = await fresh('Titled');
    const base = store.getState().player!;

    // ⚠⚠ MY FIRST VERSION OF THIS WAS WRONG AND FLAGGED THREE HEALTHY TITLES. It maxed the
    // titleProgress counters and nothing else, on the assumption that every title hangs off
    // one. Three do not: `scion_of_the_giants` wants a GIANT standing well with a
    // giant-respecting faction, `aetherborn_awakened` wants an AETHERBORN carrying dose,
    // and `etheric_explorer` wants a recovered CORE — none of which is a counter. It also
    // built factionStanding as a record when it is an ARRAY of {factionId, standing}.
    // A reachability test that cannot express a title's real gate reports the gate as a
    // defect, which is worse than not testing it.
    const RACES = ['tartarian_giant', 'aetherborn', 'mud_dweller', 'unknowing_mass', 'architectural_sentinel'];
    const FACTIONS = ['servants_of_giants', 'true_tartarians', 'tartarian_revivalists',
      'stone_builders', 'mud_monarchs', 'reclaimers_guild', 'forgotten_order'];

    const maxedFor = (raceId: string, factionId: string) => ({
      ...base,
      raceId,
      factionId,
      earnedTitles: [],
      corruption: 100,
      mainQuest: { ...(base.mainQuest ?? { phase: 'hook' }), coresRecovered: ['core_1'] },
      factionStanding: FACTIONS.map((f) => ({ factionId: f, standing: 100 })),
      titleProgress: Object.fromEntries(
        Object.keys(T.EMPTY_TITLE_PROGRESS).map((k) => [k, 9999]),
      ) as never,
    });

    const unreachable: string[] = [];
    for (const def of T.WIRED_TITLES) {
      let reachable = false;
      for (const race of RACES) {
        for (const fac of FACTIONS) {
          if (T.evaluateEarnedTitles(maxedFor(race, fac) as never).includes(def.id)) {
            reachable = true; break;
          }
        }
        if (reachable) break;
      }
      if (!reachable) unreachable.push(def.id);
    }
    // A title nobody can earn under ANY race, ANY faction, maxed counters, maxed standing,
    // a recovered core and full corruption is a reward that ends in nothing.
    expect(unreachable).toEqual([]);
  });

  test('⚠ an earned title feeds the passive-perk aggregate the combat code reads', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const T = require('../app/engine/titles') as typeof import('../app/engine/titles');
    const withPerk = Object.keys(T.TITLE_PASSIVE_PERK);
    expect(withPerk.length).toBeGreaterThan(0);
    // Every id that claims a passive perk must be a real title, or the perk is attached to
    // nothing and silently never fires.
    for (const id of withPerk) expect(T.WIRED_TITLE_IDS.has(id) || T.HIDDEN_TITLE_IDS.has(id)).toBe(true);
  });
});

describe('LOOP 17 — corruption: the tier is not decoration, it bites', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ a corrupted character rolls WORSE and pays MORE — measured against a clean one', async () => {
    const store = await fresh('Corrupt');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { effectiveStats } = require('../app/engine/equipment') as typeof import('../app/engine/equipment');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const C = require('../app/engine/corruption') as typeof import('../app/engine/corruption');

    const p = store.getState().player!;
    const clean = effectiveStats({ ...p, corruption: 0 });
    const hollowed = effectiveStats({ ...p, corruption: 90 });

    // THE CONSEQUENCE: the sheet is worse. If corruption never reached effectiveStats the
    // whole arc would be a number that goes up and does nothing.
    const cleanSum = Object.values(clean).reduce((a, b) => a + (b as number), 0);
    const hollowSum = Object.values(hollowed).reduce((a, b) => a + (b as number), 0);
    expect(hollowSum).toBeLessThan(cleanSum);

    // AND THE WALLET: prices climb with the tier.
    expect(C.corruptionPriceMultiplier(C.corruptionTierOf(90)))
      .toBeGreaterThan(C.corruptionPriceMultiplier(C.corruptionTierOf(0)));
    // AND THE WORLD: the encounter rate climbs too.
    expect(C.corruptionExtraEncounterChance(C.corruptionTierOf(90)))
      .toBeGreaterThan(C.corruptionExtraEncounterChance(C.corruptionTierOf(0)));
  });

  test('⚠ every tier boundary is crossable and each crossing has a line to say so', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const C = require('../app/engine/corruption') as typeof import('../app/engine/corruption');
    const tiers = [0, 20, 45, 80].map((v) => C.corruptionTierOf(v));
    expect(new Set(tiers).size).toBe(4);          // four distinct tiers, all reachable
    for (let i = 1; i < tiers.length; i++) {
      expect(C.tierCrossLine(tiers[i - 1]!, tiers[i]!)).toBeTruthy();
    }
  });
});

describe('LOOP 19 — golem companion: summon, arm, and it is really there', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ summon → a companion with HP and a weapon die stands beside you', async () => {
    const store = await fresh('Binder');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GOLEM_DEFINITIONS } = require('../app/engine/golems') as typeof import('../app/engine/golems');
    const def = GOLEM_DEFINITIONS.mud_golem;
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        stats: { ...p.stats, intelligence: 20 },
        golem: null,
        inventory: def.fuel.map((f: { name: string; quantity: number }, i: number) => (
          { id: `gf_${i}`, name: f.name, kind: 'misc', quantity: f.quantity * 2, tags: [] } as unknown as InventoryItem
        )),
      },
    });

    let summoned = false;
    for (let i = 0; i < 30 && !summoned; i++) {
      await store.getState().submitPlayerAction('summon golem');
      summoned = !!store.getState().player!.golem;
      if (!summoned) {
        // Re-arm the fuel; the roll is what we are looping on, not the recipe.
        const q = store.getState().player!;
        useGameStore.setState({
          player: {
            ...q,
            inventory: def.fuel.map((f: { name: string; quantity: number }, k: number) => (
              { id: `gf2_${i}_${k}`, name: f.name, kind: 'misc', quantity: f.quantity * 2, tags: [] } as unknown as InventoryItem
            )),
          },
        });
      }
    }
    expect(summoned).toBe(true);
    const golem = store.getState().player!.golem!;
    // THE PAYOFF: a companion with real numbers, not a flag.
    expect(golem.hp).toBeGreaterThan(0);
    expect(golem.hpMax).toBeGreaterThan(0);
    expect(golem.attackDie).toMatch(/^\d+d\d+$/);
  });
});

// ─── LOOP 29 — RESURRECTION GEMS ────────────────────────────────────────────────────────
//
// ⚠ NOT RE-TESTED HERE, DELIBERATELY. `resurrectSlotGemSafety.test.ts` (OTA-428) already
// drives it end to end against the real store: it kills a character, persists the slot,
// calls `resurrectSlot`, and asserts they wake at the backfilled hpMax having spent
// EXACTLY one gem — plus the refusal with none. Writing a second, weaker version of that
// would add a suite and prove nothing new. Loop 29 counts as TRACED on that evidence.
//
// The same applies to LOOP 23 (story forks): `ota1088StoryForks.test.ts` drives
// `answerFork` and asserts the TC change, the narration and that the question never
// returns.
