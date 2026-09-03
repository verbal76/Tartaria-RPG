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

// ⚠⚠⚠ OTA-1653 — THE WEAR WARD, AND HOW IT GOT INVENTED.
//
// Owner: *"I kind of like those two items the amulet in the ring that it slows
// down the durability decline of your gear… so if you wear the ring I think one
// ring. I think the ring that I have on is -6% then it slows down the wear and
// tear of your items by 6% each and it says stackable with armor… that's a
// pretty cool buff right?"*
//
// ⚠⚠ HE WAS DESCRIBING A BUFF THAT DID NOT EXIST. What he was reading was
// OTA-1649's resist line — "Resists degradation (−6% each, stacks with armour)"
// — which meant −6% of INCOMING DEGRADATION DAMAGE, a type OTA-1652 then proved
// nothing in the game even dealt. A bare percentage beside a word does not say
// what it reduces, and the type being dead meant nothing in play ever
// contradicted his reading.
//
// His reading is the better item. So it is real now, on the ring he was wearing.
import ringsJson from '../app/data/items/rings.json';
import recipesJson from '../app/data/items/recipes.json';
import materialsJson from '../app/data/items/materials.json';
import {
  WEAR_WARD_PCT, FAMILY_RULE, accessoryFamilies, accessoryLadderViolation,
  equippedAccessoryPowers, wearWardPct, wearIsWarded,
} from '../app/engine/accessoryEffects';
import { getItemPreview } from '../app/components/itemPreview';
import type { CatalogAccessory } from '../app/engine/crafting';
import type { PlayerCharacter, Rarity } from '../app/engine/types';

const RINGS = (ringsJson as unknown as { rings: CatalogAccessory[] }).rings;
const TIN = RINGS.find((r) => r.name === 'Tin Ward Ring')!;
const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Legendary'];

const wearing = (...names: string[]): PlayerCharacter => {
  const eq: Record<string, string> = {};
  names.forEach((n, i) => { eq[i === 0 ? 'ring' : `ring${i + 1}`] = n; });
  return { name: 'T', ac: 10, equipped: eq, inventory: [], statusEffects: [] } as unknown as PlayerCharacter;
};

describe('OTA-1653 — the wear ward', () => {
  describe('the ring he was wearing', () => {
    it('the Tin Ward Ring carries it', () => {
      expect(TIN.wearWard).toBe(true);
    });

    it('⚠⚠ it had to be promoted to Rare, and that is the ladder working', () => {
      // OTA-1649's rule: Common and Uncommon may never carry a SPECIAL, and a
      // wear ward is a special. Smuggling one onto a Common would have broken the
      // rule an entire OTA was spent establishing — so the ring moved up instead.
      expect(TIN.rarity).toBe('Rare');
      expect(FAMILY_RULE.Common.special).toBe('forbidden');
      expect(accessoryFamilies(TIN)).toContain('special');
      expect(accessoryLadderViolation(TIN)).toBeNull();
    });

    it('every accessory in the game still sits on the ladder', () => {
      const bad = RINGS.map((r) => ({ n: r.name, why: accessoryLadderViolation(r) })).filter((x) => x.why);
      expect(bad).toEqual([]);
    });

    it('its recipe gained a Rare anchor, from a name recipes already used', () => {
      // The OTA-1649 ingredient-quality rule (a Rare needs a Rare component) AND
      // the OTA-1649 fusion-pool rule (never claim a fresh material — it would
      // leave the Crucible's fodder).
      const rec = (recipesJson as unknown as { recipes: { result: string; ingredients: { name: string }[] }[] })
        .recipes.find((r) => r.result === 'Tin Ward Ring')!;
      const mats = new Map((materialsJson as unknown as { materials: { name: string; rarity?: Rarity }[] })
        .materials.map((m) => [m.name, m.rarity ?? 'Common']));
      expect(rec.ingredients.some((i) => mats.get(i.name) === 'Rare' || mats.get(i.name) === 'Legendary')).toBe(true);
    });
  });

  describe('the ladder', () => {
    it('rises at every step and never reaches certainty', () => {
      for (let i = 1; i < RARITIES.length; i++) {
        expect(WEAR_WARD_PCT[RARITIES[i]!]).toBeGreaterThan(WEAR_WARD_PCT[RARITIES[i - 1]!]);
      }
      // ⚠ A CEILING WELL SHORT OF 1. Gear that never wears would quietly delete
      // the repair economy the Crucible and the bench are built on.
      expect(WEAR_WARD_PCT.Legendary).toBeLessThanOrEqual(0.25);
      expect(WEAR_WARD_PCT.Common).toBe(0.06);   // the number already on his card
    });

    it('⚠⚠ BEST, NOT SUM — four wards do not make gear immortal', () => {
      // This is the one where summing would be catastrophic rather than merely
      // generous: four Rare wards summed is 60%, four Legendary is 100%.
      const one = equippedAccessoryPowers(wearing('Tin Ward Ring'));
      const four = equippedAccessoryPowers(wearing('Tin Ward Ring', 'Tin Ward Ring', 'Tin Ward Ring', 'Tin Ward Ring'));
      expect(one.wearWardPct).toBe(WEAR_WARD_PCT.Rare);
      expect(four.wearWardPct).toBe(WEAR_WARD_PCT.Rare);
      expect(four.wearWardPct).toBeLessThan(1);
    });

    it('nothing worn wards nothing', () => {
      expect(wearWardPct(wearing())).toBe(0);
      expect(wearWardPct(null)).toBe(0);
    });
  });

  describe('what the percentage means', () => {
    it('⚠ it is a CHANCE TO SKIP a point, not a fraction of one', () => {
      // Durability is an integer that moves one point at a time — there is no
      // 0.85 of a chip. A fractional decrement would round to a full point on
      // every hit and the buff would do nothing at all.
      expect(wearIsWarded(0.15, 0.10)).toBe(true);    // roll under → the point is kept
      expect(wearIsWarded(0.15, 0.20)).toBe(false);   // roll over  → it lands
      expect(wearIsWarded(0, 0.00)).toBe(false);      // no ward, never skips
      expect(wearIsWarded(0.15, 0.15)).toBe(false);   // boundary is exclusive
    });

    it('⚠⚠⚠ AN UNWARDED PLAYER DOES NOT TOUCH THE RNG — the bug this OTA shipped and caught', () => {
      // The first draft wrote `wearIsWarded(pct, roll = Math.random())`, and a
      // DEFAULT PARAMETER IS EVALUATED ON EVERY CALL — guard or no guard. So a
      // player wearing no ward burned one draw per wear event, shifting the whole
      // stream: every initiative, hit, crit and loot roll after any chip came out
      // different. ota1017 found it (a volley that must kill the player stopped
      // killing them). A silent, global change to how the game rolls.
      const real = Math.random;
      let draws = 0;
      Math.random = () => { draws += 1; return real(); };
      try {
        for (let i = 0; i < 50; i++) wearIsWarded(0);
        expect(draws).toBe(0);
        // …and a warded one does draw, exactly once per point.
        for (let i = 0; i < 10; i++) wearIsWarded(0.15);
        expect(draws).toBe(10);
      } finally {
        Math.random = real;
      }
    });

    it('over many points it saves about what it says', () => {
      const pct = WEAR_WARD_PCT.Rare;
      let saved = 0;
      for (let i = 0; i < 10000; i++) if (wearIsWarded(pct, i / 10000)) saved++;
      expect(saved / 10000).toBeCloseTo(pct, 2);
    });

    it('the wear gate consults it, and only in one place', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const src = require('node:fs').readFileSync('app/state/gearWear.ts', 'utf8') as string;
      expect(src).toContain('accessoryWearWardPct(player)');
      expect(src).toContain('wearIsWarded(ward)');
      // ⚠ BEFORE the wear, not after: a ward applied to the result would have
      // already spent the point it was meant to save.
      expect(src.indexOf('wearIsWarded(ward)')).toBeLessThan(src.indexOf('wearItemById(player.inventory, boundId)'));
    });
  });

  describe('the card says it in words that cannot be misread', () => {
    it('the line names the effect and its scope', () => {
      // ⚠ The copy this replaces is the reason this OTA exists. "−6% each" said
      // neither what it reduced nor what it covered.
      const stats = getItemPreview('Tin Ward Ring')?.stats ?? [];
      const line = stats.find((s) => /longer/.test(s));
      expect(line).toBe('Everything you wear or wield lasts 15% longer');
      // And the resist line beside it still names ITS object too (OTA-1652).
      expect(stats.some((s) => s.startsWith('Resists') && s.includes('incoming damage'))).toBe(true);
    });
  });
});
