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

// OTA-974 — Phase B of real heights: PERCHES. Objects tucked partway up taller
// climbables: deterministic per-room seeding (no reroll farming), tier-crest
// discovery lines, catalog-resolved tier-gated loot harvested once per room,
// and an attack gate so swinging from the ground can't loot what only climbers
// reach. Apex tiers stay perch-free — the top belongs to the overlay system.
import { useGameStore } from '../app/state/gameStore';
import {
  PERCH_TEMPLATES, seedPerches, rollPerchLoot, perchTemplateFor,
} from '../app/engine/perches';
import { findCatalogItem } from '../app/engine/crafting';
import { getRaces, getFactions } from '../app/engine/character';

describe('OTA-974 — perch templates are honest', () => {
  it('every loot name resolves in the item catalog (no fake loot, ever)', () => {
    for (const tpl of PERCH_TEMPLATES) {
      for (const l of tpl.loot) {
        expect({ tpl: tpl.noun, name: l.name, found: !!findCatalogItem(l.name) })
          .toEqual({ tpl: tpl.noun, name: l.name, found: true });
      }
    }
  });
  it('every template pays SOMETHING at low tiers (a tier-1 perch is never a rickroll)', () => {
    for (const tpl of PERCH_TEMPLATES) {
      expect(tpl.loot.some((l) => (l.minTier ?? 0) <= 1)).toBe(true);
    }
  });
  it('short forms find their template', () => {
    expect(perchTemplateFor('satchel')?.noun).toBe('wax-sealed satchel');
    expect(perchTemplateFor('wax-sealed satchel')?.noun).toBe('wax-sealed satchel');
    expect(perchTemplateFor('shore')).toBeNull();
  });
});

describe('OTA-974 — deterministic seeding', () => {
  const CLIMBS = [
    { noun: 'guard tower', tiers: 4 },
    { noun: 'stone pillar', tiers: 3 },
    { noun: 'low wall', tiers: 2 },
  ];
  it('same room, same climbs → identical result, forever', () => {
    const a = seedPerches('room:alpha:1:2', CLIMBS);
    const b = seedPerches('room:alpha:1:2', CLIMBS);
    expect(a).toEqual(b);
  });
  it('tiers are 1..tiers-1 (never ground, never the apex) and structures are real', () => {
    for (let i = 0; i < 40; i++) {
      const r = seedPerches(`room:probe:${i}:${i}`, CLIMBS);
      for (const [noun, p] of Object.entries(r.placements)) {
        const climb = CLIMBS.find((c) => c.noun === p.structure)!;
        expect(climb).toBeTruthy();
        expect(climb.tiers).toBeGreaterThanOrEqual(3);
        expect(p.tier).toBeGreaterThanOrEqual(1);
        expect(p.tier).toBeLessThanOrEqual(climb.tiers - 1);
        expect(r.nouns).toContain(noun);
      }
    }
  });
  it('2-tier structures and empty rooms never seed', () => {
    for (let i = 0; i < 20; i++) {
      const r = seedPerches(`room:short:${i}`, [{ noun: 'low wall', tiers: 2 }]);
      expect(r.nouns).toEqual([]);
    }
    expect(seedPerches('room:none', []).nouns).toEqual([]);
  });
});

describe('OTA-974 — tier-gated loot roller', () => {
  const satchel = perchTemplateFor('wax-sealed satchel')!;
  it('low tiers never pay the high-tier entries', () => {
    for (let die = 1; die <= 8; die++) {
      const got = rollPerchLoot(satchel, 1, () => Math.min(die, 5));
      expect(got).toBeTruthy();
      expect(['Worn Tartarian Coin', 'Cloth Scrap']).toContain(got!.name);
    }
  });
  it('high tiers unlock the rarer pool and qty stays in bounds', () => {
    const names = new Set<string>();
    for (let v = 1; v <= 8; v++) {
      const got = rollPerchLoot(satchel, 4, (max) => ((v - 1) % max) + 1)!;
      names.add(got.name);
      const entry = satchel.loot.find((l) => l.name === got.name)!;
      expect(got.qty).toBeGreaterThanOrEqual(entry.qtyMin);
      expect(got.qty).toBeLessThanOrEqual(entry.qtyMax);
    }
    expect(names.size).toBeGreaterThan(1);
  });
});

/** Poll until pred() holds or the deadline passes. The assertion AFTER the poll still
 *  does the real judging — this only replaces the fixed sleeps that made the suite
 *  flake on a loaded parallel run (it passed 17/17 isolated; a 5ms window raced the
 *  store's own async work and lost only when the box was busy). */
async function settle(pred: () => boolean, deadlineMs = 4000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

/** Wait for the boot's trailing fire-and-forget writes to drain: the log length must
 *  hold still across two samples, or a late write can clobber an injected scene. */
async function quiesce(store: typeof useGameStore) {
  let last = -1;
  await settle(() => {
    const n = store.getState().gameLog.length;
    const stable = n === last;
    last = n;
    return stable;
  });
}

describe('OTA-974 — harvest flow in the store', () => {
  async function bootPerched(elevated: boolean) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Percher', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    await quiesce(store);
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        enemies: [],
        ambientNouns: ['guard tower', 'shore', 'wax-sealed satchel'],
        nounPlacements: { 'wax-sealed satchel': { structure: 'guard tower', tier: 2 } },
        elevatedOn: elevated ? { noun: 'guard tower', tier: 2, totalTiers: 4 } : null,
        elevatedOverlayMeta: undefined,
      },
    });
    return store;
  }

  it('at the perch: investigate harvests catalog loot ONCE, then reads picked-clean', async () => {
    const store = await bootPerched(true);
    const inv0 = store.getState().player!.inventory.reduce((a, i) => a + (i.quantity ?? 1), 0);
    await store.getState().submitPlayerAction('investigate the satchel');
    await settle(() => store.getState().gameLog.some((e) => e.channel === 'reward' && e.text.startsWith('✦')));
    const rewards = store.getState().gameLog.filter((e) => e.channel === 'reward' && e.text.startsWith('✦'));
    expect(rewards.length).toBe(1);
    const inv1 = store.getState().player!.inventory.reduce((a, i) => a + (i.quantity ?? 1), 0);
    expect(inv1).toBeGreaterThan(inv0);
    await store.getState().submitPlayerAction('investigate the satchel');
    await settle(() => store.getState().gameLog.some((e) => e.text.includes('picked the wax-sealed satchel clean')));
    expect(store.getState().gameLog.some((e) => e.text.includes('picked the wax-sealed satchel clean'))).toBe(true);
    const rewards2 = store.getState().gameLog.filter((e) => e.channel === 'reward' && e.text.startsWith('✦'));
    expect(rewards2.length).toBe(1);
  });

  it('from the ground, ATTACKING the perch is refused with directions, not loot', async () => {
    const store = await bootPerched(false);
    await store.getState().submitPlayerAction('attack the satchel');
    await settle(() => store.getState().gameLog.some((e) => e.text.includes('up on the guard tower')));
    expect(store.getState().gameLog.some((e) => e.text.includes('up on the guard tower'))).toBe(true);
    expect(store.getState().gameLog.some((e) => e.channel === 'reward' && e.text.startsWith('✦'))).toBe(false);
  });

  it('scene building stamps placements without crashing (smoke)', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Smoke', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    const pl = store.getState().currentScene?.nounPlacements;
    expect(pl === undefined || typeof pl === 'object').toBe(true);
  });
});
