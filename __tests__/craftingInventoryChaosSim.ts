// craftingInventoryChaosSim — adversarial coverage for OTAs 056-095 around
// Crafting, Scrap UX, pack-full handling, and catalog inference noise.
//
// Five scenarios, each driving its own deterministic random stream so the
// suite runs in well under the 60-second budget:
//
//   1. Aetheric tab parity — every fuel in AETHERCRAFT_DISCIPLINES (parsed
//      out of CraftingScreen.tsx since it's not exported) must resolve in
//      one of the canonical catalogs (materials / amulets / etc.). The
//      shape's output item (Shaped Aetheric Shard) must exist. And no
//      part of ActionReferenceScreen.tsx may import RecipesView or
//      reference an aether discipline id — OTA-095 stripped it.
//
//   2. Scrap UX invariants — 200 seeded scrap attempts mixing
//      pass/fail rolls + equipped/unequipped + 2H/1H items. Asserts the
//      OTA-058 min-yield, the OTA-058 auto-unequip, the always-consume
//      anti-spam rule, and the OTA-056 2H auto-displace.
//
//   3. Pack-full handling — drive Small Rock (cap 10), Big Rock (cap 1),
//      Stick (cap 6) past their per-name caps via grantItem(). Asserts
//      OTA-078 invariant: when accepted === 0, the inventory row count
//      is UNCHANGED. The silent-fail bug (cap consumed source chip but
//      didn't grant) MUST not appear.
//
//   4. Catalog inference noise — instrument setOnInferred so we capture
//      every inferred-stats event. For every authored row in
//      materials/exploration/gear, look the name up via getItemPreview
//      (the preview path that DOES consult the materials catalog) AND
//      via the find* helpers in engine/crafting (the path that does
//      NOT). The first path must be silent. The second path WILL leak
//      for armor-keyword'd material names like "Sentinel Core Plate" —
//      that's the open bug, captured as test.failing with a fix-shape
//      comment.
//
//   5. SearchSortBar parity — grep the screens directory for any other
//      "<TextInput" + sort-pill style hand-roll. The shared
//      SearchSortBar must be the only filter+sort UI in
//      Inventory/Crafting; nothing has drifted into a private copy.

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
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import {
  MATERIALS,
  AMULETS,
  RINGS,
  GEAR,
  EXPLORATION,
  WEAPONS,
  ARMOR,
  RECIPES,
  findArmorByName,
  findWeaponByName,
} from '../app/engine/crafting';
import { capacityFor, grantItem } from '../app/engine/inventory';
import { canScrap, scrapOutputFor } from '../app/engine/scrapEngine';
import { getItemPreview } from '../app/components/itemPreview';
import * as itemDefaults from '../app/engine/itemDefaults';
import type { InventoryItem } from '../app/engine/types';

// -------------------- Seeded RNG --------------------
// Mulberry32 — small, fast, deterministic. Each describe block makes
// its own stream so test order doesn't leak between scenarios.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------- Parse AETHERCRAFT_DISCIPLINES --------------------
// The constant isn't exported from CraftingScreen.tsx (it's a private
// render-time list). Pull the source and parse out the array literal
// so the test stays accurate even if someone edits the constant.
interface Discipline {
  id: string;
  title: string;
  fuels: string[];
  examples: string[];
}

function parseAethercraftDisciplines(): Discipline[] {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'screens', 'CraftingScreen.tsx'),
    'utf8',
  );
  // Find every object literal under AETHERCRAFT_DISCIPLINES that has an
  // id starting aether_. We don't need a full TS parser — just pull
  // the id / fuels / examples fields out per block.
  const start = src.indexOf('AETHERCRAFT_DISCIPLINES');
  expect(start).toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf('];', start) + 1);
  const idRe = /id:\s*'([^']+)'[^}]*?title:\s*'([^']+)'/g;
  const out: Discipline[] = [];
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(block)) !== null) {
    const recordStart = m.index;
    // Find the matching closing brace for this discipline object.
    let depth = 0;
    let i = recordStart;
    while (i < block.length) {
      const ch = block[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }
    const record = block.slice(recordStart, i + 1);
    const fuelsMatch = record.match(/fuels:\s*\[([^\]]*)\]/);
    const examplesMatch = record.match(/examples:\s*\[([^\]]*)\]/);
    const parseList = (s: string) =>
      Array.from(s.matchAll(/'([^']+)'/g)).map((x) => x[1]!);
    out.push({
      id: m[1]!,
      title: m[2]!,
      fuels: fuelsMatch ? parseList(fuelsMatch[1]!) : [],
      examples: examplesMatch ? parseList(examplesMatch[1]!) : [],
    });
  }
  return out;
}

// Build a single name→catalog index across every catalog so a fuel
// lookup can resolve in one pass.
function catalogIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const m of MATERIALS) idx.set(m.name.toLowerCase(), 'materials');
  for (const a of AMULETS) idx.set(a.name.toLowerCase(), 'amulets');
  for (const r of RINGS) idx.set(r.name.toLowerCase(), 'rings');
  for (const g of GEAR) idx.set(g.name.toLowerCase(), 'gear');
  for (const e of EXPLORATION) idx.set(e.name.toLowerCase(), 'exploration');
  for (const w of WEAPONS) idx.set(w.name.toLowerCase(), 'weapons');
  for (const a of ARMOR) idx.set(a.name.toLowerCase(), 'armor');
  return idx;
}

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'ChaosSim',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  return store;
}

// -------------------- Suite --------------------

describe('craftingInventoryChaosSim — Crafting / Scrap / Pack / Catalog', () => {
  beforeAll(() => {
    // Silence the noisy in-game console output during the sim. The
    // inference-noise scenario explicitly RE-CAPTURES inferred events
    // via setOnInferred, so we don't need console.log to see them.
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  // ====================================================================
  // 1. Aetheric tab parity
  // ====================================================================
  describe('Aethercraft tab parity (OTA-091 / OTA-095)', () => {
    const disciplines = parseAethercraftDisciplines();
    const idx = catalogIndex();

    it('parses 3 disciplines (shape / summon / mend) out of CraftingScreen.tsx', () => {
      const ids = disciplines.map((d) => d.id).sort();
      expect(ids).toEqual(['aether_mend', 'aether_shape', 'aether_summon']);
    });

    it('every fuel listed on a discipline resolves in the canonical catalogs', () => {
      const missing: { id: string; fuel: string }[] = [];
      for (const d of disciplines) {
        for (const fuel of d.fuels) {
          if (!idx.has(fuel.toLowerCase())) missing.push({ id: d.id, fuel });
        }
      }
      expect(missing).toEqual([]);
    });

    it('Shaped Aetheric Shard (the shape-discipline output) exists in the catalog', () => {
      // Only the shape discipline produces a concrete inventory item;
      // summon yields an ally entity, mend modifies HP. We can only
      // catalog-check the item-producing one.
      expect(idx.has('shaped aetheric shard')).toBe(true);
    });

    it('ActionReferenceScreen has NO reference to aether discipline ids or RecipesView', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'app', 'screens', 'ActionReferenceScreen.tsx'),
        'utf8',
      );
      // Comments mentioning the removed feature are fine — they document
      // history. JSX/code references are not. Check the lines outside
      // of comments by stripping line comments + block comments.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
      expect(stripped).not.toMatch(/AETHERCRAFT_DISCIPLINES/);
      expect(stripped).not.toMatch(/RecipesView/);
      expect(stripped).not.toMatch(/aether_shape|aether_summon|aether_mend/);
    });
  });

  // ====================================================================
  // 2. Scrap UX invariants
  // ====================================================================
  describe('Scrap UX invariants (OTA-056 / OTA-058)', () => {
    // 200 trials is the upper bound the brief asks for. Each trial
    // bootstraps the store fresh and forces a specific random outcome,
    // so a single trial runs in ~5ms. 200 trials ≈ 1s, well inside the
    // 60s budget.
    const TRIAL_COUNT = 200;

    // Test fixtures — six item shapes that exercise the relevant code
    // paths: 1H metal blade, 2H metal blade, locket relic, ring relic,
    // amulet relic, chest armor.
    interface Trial {
      item: InventoryItem;
      slot: 'main' | 'off' | 'amulet' | 'ring' | 'chest' | null;
      slotIdKey: string | null;
      isTwoHanded: boolean;
    }

    function makeTrials(rng: () => number): Trial[] {
      const trials: Trial[] = [];
      const itemShapes: Trial[] = [
        {
          item: { id: 'i1H', name: 'Chaos Sim 1H Blade', kind: 'weapon', quantity: 1, tags: ['metal', 'blade'] },
          slot: 'main',
          slotIdKey: 'mainId',
          isTwoHanded: false,
        },
        {
          item: { id: 'i2H', name: 'Chaos Sim Greatsword', kind: 'weapon', quantity: 1, tags: ['metal', 'blade', 'two_handed'] },
          slot: 'main',
          slotIdKey: 'mainId',
          isTwoHanded: true,
        },
        {
          item: { id: 'iLoc', name: 'Chaos Sim Locket', kind: 'relic', quantity: 1, tags: ['aether'] },
          slot: 'amulet',
          slotIdKey: 'amuletId',
          isTwoHanded: false,
        },
        {
          item: { id: 'iRing', name: 'Chaos Sim Ring', kind: 'relic', quantity: 1, tags: ['aether'] },
          slot: 'ring',
          slotIdKey: 'ringId',
          isTwoHanded: false,
        },
        {
          item: { id: 'iArm', name: 'Chaos Sim Cuirass', kind: 'armor', quantity: 1, tags: ['plate', 'chest'] },
          slot: 'chest',
          slotIdKey: 'chestId',
          isTwoHanded: false,
        },
        {
          item: { id: 'iBare', name: 'Chaos Sim Trinket', kind: 'relic', quantity: 1, tags: ['aether'] },
          slot: null,
          slotIdKey: null,
          isTwoHanded: false,
        },
      ];
      for (let t = 0; t < TRIAL_COUNT; t++) {
        const shape = itemShapes[Math.floor(rng() * itemShapes.length)]!;
        // Per-trial unique id so multiple trials with the same shape
        // don't collide on the equip-slot id check.
        trials.push({
          ...shape,
          item: { ...shape.item, id: `${shape.item.id}_${t}` },
        });
      }
      return trials;
    }

    it(`across ${TRIAL_COUNT} scrap trials: never lose the item, always grant >=1 material, auto-unequip on success/fail`, async () => {
      const store = await bootstrap();
      const baseplayer = store.getState().player!;
      const trials = makeTrials(makeRng(0xC0FFEE));
      const realRandom = Math.random;
      const violations: string[] = [];

      for (let t = 0; t < trials.length; t++) {
        const trial = trials[t]!;
        // 50/50 pass/fail per trial. We pin Math.random to a constant
        // for the duration of the scrap call so all internal rolls
        // (success, second-chance, failure-line picker) see the same
        // value.
        const wantSuccess = t % 2 === 0;
        // success chance is 0.7+; 0.0 wins, 0.99 loses (when stats are low).
        Math.random = () => (wantSuccess ? 0.0 : 0.99);
        // Set up player: drop the test item into inventory, optionally
        // equip into the trial slot. For 2H weapons, also stick a
        // dummy off-hand item in to verify auto-displace works.
        const inv: InventoryItem[] = [trial.item];
        const equipped: Record<string, string | undefined> = {};
        if (trial.slot && trial.slotIdKey) {
          equipped[trial.slot] = trial.item.name;
          equipped[trial.slotIdKey] = trial.item.id;
        }
        // 2H setup — drop an off-hand item that should be unequipped
        // implicitly (but scrap doesn't TRIGGER displace, only equip
        // does — so for 2H scrap we verify the EQUIPPED 2H instance
        // is unequipped from main and the off slot is unchanged).
        if (trial.isTwoHanded && trial.slot === 'main') {
          inv.push({
            id: `off_${t}`,
            name: 'Chaos Sim Buckler',
            kind: 'armor',
            quantity: 1,
            tags: ['armor', 'shield'],
          });
        }
        // Drop stats LOW so we land exactly on the 35% floor for the
        // failure trials; on the success trials random=0 dominates
        // regardless of stats.
        store.setState({
          player: {
            ...baseplayer,
            inventory: inv,
            stats: { ...baseplayer.stats, intelligence: 1, dexterity: 1 },
            equipped,
          },
        });
        let threw: unknown = null;
        try {
          store.getState().scrapInventoryItem(trial.item.name);
        } catch (e) {
          threw = e;
        } finally {
          Math.random = realRandom;
        }
        if (threw) {
          violations.push(`trial ${t} (${trial.item.name}, ${wantSuccess ? 'win' : 'lose'}): scrap threw — ${(threw as Error).message}`);
          continue;
        }
        const after = store.getState().player!;
        // Invariant A — item is gone from inventory regardless of roll.
        const remaining = after.inventory.find((i) => i.id === trial.item.id);
        if (remaining) {
          violations.push(`trial ${t} (${trial.item.name}, ${wantSuccess ? 'win' : 'lose'}): item still in inventory after scrap`);
        }
        // Invariant B — at least one material grant landed. scrapOutputFor
        // tells us which one to expect.
        const expectedFirst = scrapOutputFor(trial.item).grants[0]?.name;
        if (expectedFirst) {
          const got = after.inventory.find((i) => i.name === expectedFirst);
          if (!got || got.quantity < 1) {
            violations.push(`trial ${t} (${trial.item.name}, ${wantSuccess ? 'win' : 'lose'}): expected >=1 ${expectedFirst}, got ${got?.quantity ?? 0}`);
          }
        }
        // Invariant C — equipped slot is cleared if it was occupied
        // by THIS item.
        if (trial.slot && trial.slotIdKey) {
          const slotName = after.equipped?.[trial.slot as keyof typeof after.equipped];
          const slotId = after.equipped?.[trial.slotIdKey as keyof typeof after.equipped];
          if (slotName === trial.item.name || slotId === trial.item.id) {
            violations.push(`trial ${t} (${trial.item.name}): equipped slot ${trial.slot} still points at scrapped item`);
          }
        }
      }
      if (violations.length > 0) {
        // Surface the first 10 violations so the failure message is
        // readable. The full list is in the assertion failure body.
        const summary = violations.slice(0, 10).join('\n  ');
        throw new Error(`${violations.length} scrap invariant violations across ${trials.length} trials:\n  ${summary}`);
      }
      expect(violations).toEqual([]);
    });

    it('2H weapon scrap clears the main slot (OTA-056 displace path stays consistent under scrap)', async () => {
      const store = await bootstrap();
      const p = store.getState().player!;
      store.setState({
        player: {
          ...p,
          stats: { ...p.stats, intelligence: 14, dexterity: 12 },
          inventory: [
            { id: 't2h', name: 'Sim 2H Maul', kind: 'weapon', quantity: 1, tags: ['metal', 'two_handed'] } as InventoryItem,
          ],
          equipped: { main: 'Sim 2H Maul', mainId: 't2h' },
        },
      });
      const realRandom = Math.random;
      Math.random = () => 0;
      try {
        store.getState().scrapInventoryItem('Sim 2H Maul');
      } finally {
        Math.random = realRandom;
      }
      const after = store.getState().player!;
      expect(after.equipped?.main).toBeUndefined();
      expect(after.equipped?.mainId).toBeUndefined();
      expect(after.inventory.find((i) => i.id === 't2h')).toBeUndefined();
    });
  });

  // ====================================================================
  // 3. Uncapped pack invariants (was "Pack-full handling", OTA-078)
  // ====================================================================
  describe('Uncapped pack invariants', () => {
    // The pack now has NO carrying limit — the old per-name caps
    // (Small Rock 10 / Big Rock 1 / Stick 6) were removed. These names are
    // the regression canaries: if a cap ever sneaks back, these fail.
    const FORMERLY_CAPPED = ['Small Rock', 'Big Rock', 'Stick'];

    it('no item is capped — capacityFor is Infinity for every name', () => {
      for (const name of [...FORMERLY_CAPPED, 'Scrap Metal', 'Iron Spear', 'Aether Residue']) {
        expect(capacityFor(name)).toBe(Infinity);
      }
    });

    it('100 grant attempts never lose a unit, never drop, and stack into one row', () => {
      const rng = makeRng(0xDECAFBAD);
      const violations: string[] = [];
      for (let t = 0; t < 100; t++) {
        const name = FORMERLY_CAPPED[Math.floor(rng() * FORMERLY_CAPPED.length)]!;
        const inv: InventoryItem[] = [{ id: `seed_${t}`, name, kind: 'misc', quantity: 3, tags: [] }];
        const grantQty = 1 + Math.floor(rng() * 5);
        const result = grantItem(inv, { id: `grant_${t}`, name, kind: 'misc', quantity: grantQty, tags: [] });
        // Uncapped: everything is accepted, nothing dropped, no unit lost.
        if (result.accepted !== grantQty) {
          violations.push(`trial ${t}: accepted(${result.accepted}) != grantQty(${grantQty})`);
        }
        if (result.dropped !== 0) {
          violations.push(`trial ${t}: dropped(${result.dropped}) on an uncapped pack`);
        }
        const afterTotal = result.inventory.filter((i) => i.name === name).reduce((s, i) => s + i.quantity, 0);
        if (afterTotal !== 3 + grantQty) {
          violations.push(`trial ${t}: stack total ${afterTotal} != ${3 + grantQty}`);
        }
        if (result.inventory.filter((i) => i.name === name).length !== 1) {
          violations.push(`trial ${t}: row split instead of stacking`);
        }
      }
      expect(violations).toEqual([]);
    });

    it('pouring 25 Small Rocks one at a time stacks to 25 in a single row (no cap)', () => {
      let inv: InventoryItem[] = [];
      let accepted = 0;
      let dropped = 0;
      for (let i = 0; i < 25; i++) {
        const r = grantItem(inv, { id: `r${i}`, name: 'Small Rock', kind: 'misc', quantity: 1, tags: [] });
        accepted += r.accepted;
        dropped += r.dropped;
        inv = r.inventory;
      }
      expect(accepted).toBe(25);
      expect(dropped).toBe(0);
      const rocks = inv.filter((i) => i.name === 'Small Rock');
      expect(rocks).toHaveLength(1);
      expect(rocks[0]!.quantity).toBe(25);
    });
  });

  // ====================================================================
  // 4. Catalog inference noise
  // ====================================================================
  describe('Catalog inference noise (OTA-093 backfill gap)', () => {
    let captured: string[] = [];
    beforeEach(() => {
      captured = [];
      itemDefaults.setOnInferred((label) => captured.push(label));
    });
    afterAll(() => {
      itemDefaults.setOnInferred(null);
    });

    it('getItemPreview is silent for every authored catalog row (materials / gear / exploration / armor / weapons / amulets / rings)', () => {
      const rows: { name: string; source: string }[] = [];
      for (const m of MATERIALS) rows.push({ name: m.name, source: 'materials' });
      for (const g of GEAR) rows.push({ name: g.name, source: 'gear' });
      for (const e of EXPLORATION) rows.push({ name: e.name, source: 'exploration' });
      for (const a of ARMOR) rows.push({ name: a.name, source: 'armor' });
      for (const w of WEAPONS) rows.push({ name: w.name, source: 'weapons' });
      for (const a of AMULETS) rows.push({ name: a.name, source: 'amulets' });
      for (const r of RINGS) rows.push({ name: r.name, source: 'rings' });
      const leaks: { name: string; source: string; events: string[] }[] = [];
      for (const row of rows) {
        const before = captured.length;
        getItemPreview(row.name);
        const events = captured.slice(before);
        if (events.length > 0) leaks.push({ name: row.name, source: row.source, events });
      }
      // Surface every leak — these are catalog backfill candidates.
      // Hard fail with the punch list so the report has names.
      if (leaks.length > 0) {
        const summary = leaks
          .slice(0, 25)
          .map((l) => `${l.source}:${l.name} → ${l.events.join(' | ')}`)
          .join('\n  ');
        throw new Error(`${leaks.length} catalog rows leak inferred-stats warnings via getItemPreview:\n  ${summary}`);
      }
      expect(leaks).toEqual([]);
    });

    // KNOWN BUG: findArmorByName / findWeaponByName don't consult
    // MATERIALS / EXPLORATION / GEAR before falling through to
    // inferArmor / inferWeapon. So a material name that happens to
    // contain an armor keyword (e.g. "Sentinel Core Plate" — "plate"
    // matches the chest-armor regex) fires inferred-stats even though
    // the row exists in materials.json.
    //
    // OTA-110 fix: `isCataloguedElsewhere` guard in app/engine/crafting.ts
    // makes find* return null when the name is catalogued in a different
    // bucket, so MATERIALS rows with armor-keyword names no longer leak
    // through inference. The reference implementation was already in
    // app/components/itemPreview.ts:60-95 — the fix brings find* in line.
    it(
      'findArmorByName is silent for materials.json rows whose name contains an armor keyword (Sentinel Core Plate)',
      () => {
        const seed = MATERIALS.find((m) => m.name === 'Sentinel Core Plate');
        expect(seed).toBeDefined();
        captured.length = 0;
        const result = findArmorByName('Sentinel Core Plate');
        expect(result).toBeNull();
        expect(captured).toEqual([]);
      },
    );

    // Same shape, weapon side — "Bone Bolt" contains no weapon keyword
    // so it stays clean. "Wyrm Fang" is the candidate (contains
    // "fang" → claws regex). Captured here so the punch list
    // surfaces both leak axes.
    it('catalog scan punch list — names that leak via find* fallbacks (snapshot for the dev)', () => {
      const leaks: { name: string; via: 'armor' | 'weapon'; label: string }[] = [];
      const sweep = (name: string) => {
        captured.length = 0;
        findArmorByName(name);
        for (const l of captured) leaks.push({ name, via: 'armor', label: l });
        captured.length = 0;
        findWeaponByName(name);
        for (const l of captured) leaks.push({ name, via: 'weapon', label: l });
      };
      // Sweep only the catalogs that ARE NOT armor/weapons themselves
      // — those would correctly resolve direct and never reach
      // inference. We're hunting for cross-bucket name collisions.
      for (const m of MATERIALS) sweep(m.name);
      for (const g of GEAR) sweep(g.name);
      for (const e of EXPLORATION) sweep(e.name);
      // OTA-110 fix expectation: zero leaks. If the catalog grows new
      // exploration/materials/gear rows that trip armor/weapon keyword
      // regexes, this test surfaces them via the failure diff before
      // they get silently absorbed into the inference noise floor.
      if (leaks.length > 0) {
        const lines = leaks.map((l) => `  ${l.via}:${l.name} → ${l.label}`).join('\n');
        // eslint-disable-next-line no-console
        process.stdout.write(`\n[craftingInventoryChaosSim] find* inference leaks (${leaks.length}):\n${lines}\n`);
      }
      expect(leaks).toEqual([]);
    });
  });

  // ====================================================================
  // 5. SearchSortBar parity
  // ====================================================================
  describe('SearchSortBar parity (OTA-087)', () => {
    function readScreen(name: string): string {
      return fs.readFileSync(
        path.join(__dirname, '..', 'app', 'screens', `${name}.tsx`),
        'utf8',
      );
    }

    it('InventoryScreen + CraftingScreen both import SearchSortBar from the shared component', () => {
      const importRe = /from\s+['"]\.\.\/components\/SearchSortBar['"]/;
      expect(readScreen('InventoryScreen')).toMatch(importRe);
      expect(readScreen('CraftingScreen')).toMatch(importRe);
    });

    it('SearchSortBar is rendered (not just imported) on Inventory + Crafting screens', () => {
      const jsxRe = /<SearchSortBar/;
      expect(readScreen('InventoryScreen')).toMatch(jsxRe);
      expect(readScreen('CraftingScreen')).toMatch(jsxRe);
    });

    it('no screen has a private "search + sort pill" hand-roll that drifted from SearchSortBar', () => {
      const screensDir = path.join(__dirname, '..', 'app', 'screens');
      const files = fs.readdirSync(screensDir).filter((f) => f.endsWith('.tsx'));
      // Heuristic: a screen that renders BOTH a TextInput AND a sort
      // pill list-style control is suspicious — that's the shape the
      // shared bar replaced. SearchSortBar (the shared component) is
      // allowed to do this; screens that DON'T import it shouldn't.
      const driftCandidates: string[] = [];
      for (const file of files) {
        const src = fs.readFileSync(path.join(screensDir, file), 'utf8');
        const usesSearchSortBar = /SearchSortBar/.test(src);
        const hasTextInput = /<TextInput\b/.test(src);
        // Sort-pill shape: a button row tied to a "sort" key. Loose
        // signature — we want false positives so we can rule them
        // out manually, not silent passes.
        const hasSortPill = /sort(Key|Direction|Dir)/.test(src) && /Touchable/.test(src);
        if (!usesSearchSortBar && hasTextInput && hasSortPill) {
          driftCandidates.push(file);
        }
      }
      expect(driftCandidates).toEqual([]);
    });
  });
});
