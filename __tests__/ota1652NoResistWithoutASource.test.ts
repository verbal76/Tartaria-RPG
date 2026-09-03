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

// ⚠⚠⚠ OTA-1652 — NO RESIST WITHOUT A SOURCE.
//
// Owner: *"what does resists degradation do?"*
//
// Nothing. Measured before a line changed: 0 of 135 enemies and 0 of 301 weapons
// dealt `degradation`, and no weather tag countered it — while THREE accessories
// warded against it and printed that on their cards. Two of those three I had
// authored the night before in OTA-1649, which is how the question got asked.
//
// ⚠⚠ THE AUDIT FOUND FOUR HOLES, NOT ONE:
//
//   1. `degradation` — resisted by 3 pieces, dealt by NOTHING.
//   2. `acid` — dealt by 3 enemies, resisted by NOTHING. The mirror image, and
//      the fix for both is one line: corrosion IS acid, so degradation folds
//      into it. Three dead cards go live and acid gains its counter at once.
//   3. `radiation` — resisted by 3 pieces, dealt by no enemy and no weather
//      (5 WEAPONS deal it: live on offence, dead on defence). Ash Storm now
//      answers to it — lead-lined kit is what you wear in fallout — rather than
//      retyping three items players already own.
//   4. `aetheric` — the biggest one. EIGHTY-FIVE pieces name it, TWO storms are
//      tagged `aetheric`, and the tag was never in WEATHER_RESIST_ELEMENT. Full
//      aether-warded plate ate an Aetheric Storm whole while an ELECTRICAL
//      resist cancelled it, which is exactly backwards.
//
// ⚠ THIS SUITE IS THE INSTRUMENT, DELIBERATELY NOT A 19th CLI GATE. The first
// draft WAS a gate — and to know what an enemy deals it had to re-implement
// `enemyDamageType` by scraping regex tables out of TypeScript, which is the
// precise drift the audit exists to catch. A gate that copies the rule it checks
// can go stale the same way `degradation` did. Here it imports the real resolver
// and reads the real tables, so it cannot disagree with the game.
import { readFileSync } from 'node:fs';
import enemiesJson from '../app/data/enemies/enemies.json';
import weatherJson from '../app/data/weather/weather.json';
import armorJson from '../app/data/items/armor.json';
import ringsJson from '../app/data/items/rings.json';
import amuletsJson from '../app/data/items/amulets.json';
import dogGearJson from '../app/data/items/dogGear.json';
import { enemyDamageType, canonicalDamageType, DAMAGE_TYPE_ALIASES } from '../app/engine/damageTypes';
import { weatherCounteredByResists } from '../app/engine/weatherEffects';
import { armorResistances } from '../app/engine/crafting';
import { getItemPreview } from '../app/components/itemPreview';
import { RING_SLOTS } from '../app/engine/equipment';
import type { Enemy, WeatherEntry } from '../app/engine/types';

const ENEMIES = ((enemiesJson as unknown as { enemies: Enemy[] }).enemies
  ?? (enemiesJson as unknown as Enemy[]));
const WEATHER = ((weatherJson as unknown as { weather: WeatherEntry[] }).weather
  ?? (weatherJson as unknown as WeatherEntry[]));

/** Every damage type something in the world can put on the player, with one
 *  example source each. Enemies via the REAL resolver; weather via the real
 *  counter predicate, asked the only honest way — "does resisting X cancel it?" */
function dealtTypes(): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of ENEMIES) {
    const t = canonicalDamageType(enemyDamageType(e));
    if (t && !out.has(t)) out.set(t, `enemy ${e.name}`);
  }
  for (const w of WEATHER) {
    for (const t of CANDIDATES) {
      if (weatherCounteredByResists(w, [t]) && !out.has(t)) out.set(t, `weather ${w.name}`);
    }
  }
  return out;
}

/** Every damage type a piece of wearable gear claims to resist, canonicalised. */
function claimedTypes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (t: string, who: string) => {
    const c = canonicalDamageType(t);
    if (!c) return;
    if (!out.has(c)) out.set(c, []);
    out.get(c)!.push(who);
  };
  for (const a of (armorJson as unknown as { armor: { name: string }[] }).armor) {
    for (const t of armorResistances(a as never)) add(t, `armor ${a.name}`);
  }
  for (const [json, key, label] of [
    [ringsJson, 'rings', 'ring'], [amuletsJson, 'amulets', 'amulet'], [dogGearJson, 'dogGear', 'vest'],
  ] as const) {
    for (const r of (json as unknown as Record<string, { name: string; resistances?: string[] }[]>)[key]!) {
      for (const t of r.resistances ?? []) add(t, `${label} ${r.name}`);
    }
  }
  return out;
}

const CANDIDATES = ['aetheric', 'burn', 'cold', 'electrical', 'poison', 'corruption', 'acid', 'radiation'];

describe('OTA-1652 — no resist without a source', () => {
  describe('the audit', () => {
    it('⚠⚠⚠ every type gear wards against is dealt by SOMETHING', () => {
      // ⚠ THE HEADLINE. A resist is a promise printed on a card; this is the
      // assertion that keeps it answerable. It failed on `degradation` and
      // `radiation` before this OTA.
      const dealt = dealtTypes();
      const dead = [...claimedTypes().entries()]
        .filter(([t]) => !dealt.has(t))
        .map(([t, who]) => `${t} (warded by ${who.length}: ${who.slice(0, 3).join(', ')})`);
      expect(dead).toEqual([]);
    });

    it('⚠⚠ every type the world deals can be resisted by SOMETHING', () => {
      // The mirror rule, and the one that caught `acid`: three enemies corrode
      // you and nothing in the game turned it aside.
      const claimed = claimedTypes();
      const naked = [...dealtTypes().entries()]
        .filter(([t]) => !claimed.has(t))
        .map(([t, src]) => `${t} (dealt by ${src})`);
      expect(naked).toEqual([]);
    });
  });

  describe('the four fixes, each at its root', () => {
    it('degradation folds into acid — one alias, two holes closed', () => {
      // ⚠ AN ALIAS, NOT A RENAME. `degradation` stays a legal authored word (the
      // catalogs, the fusion prompt and existing saves all use it); it simply
      // resolves to `acid` everywhere the weakness math looks.
      expect(DAMAGE_TYPE_ALIASES.degradation).toBe('acid');
      expect(canonicalDamageType('degradation')).toBe('acid');
      expect(canonicalDamageType('corrosive')).toBe('acid');
      // And it is the same lumping OTA-1647's shield table already assumed.
      expect(canonicalDamageType('rust')).not.toBe('acid');   // not a type word; unchanged
    });

    it('a corroding enemy can now be warded against', () => {
      const acidic = ENEMIES.filter((e) => canonicalDamageType(enemyDamageType(e)) === 'acid');
      expect(acidic.length).toBeGreaterThan(0);
      expect(claimedTypes().get('acid')?.length ?? 0).toBeGreaterThan(0);
    });

    it('an AETHERIC resist finally cancels an aetheric storm', () => {
      // ⚠ 85 pieces of gear resist aetheric — more than any other type — and two
      // storms are tagged `aetheric`. Before this the tag was unmapped, so only
      // an ELECTRICAL resist (from the same storms' `lightning` tag) helped.
      const storms = WEATHER.filter((w) => (w.tags ?? []).includes('aetheric'));
      expect(storms.length).toBeGreaterThanOrEqual(2);
      for (const w of storms) expect(weatherCounteredByResists(w, ['aetheric'])).toBe(true);
    });

    it('radiation gear earns its keep in an ash storm', () => {
      const ash = WEATHER.find((w) => (w.tags ?? []).includes('ash'));
      expect(ash).toBeDefined();
      expect(weatherCounteredByResists(ash!, ['radiation'])).toBe(true);
      // ⚠ And nothing ELSE accidentally became an ash counter.
      expect(weatherCounteredByResists(ash!, ['cold'])).toBe(false);
      expect(weatherCounteredByResists(ash!, ['poison'])).toBe(false);
    });

    it('⚠ the fixes did not make everything counter everything', () => {
      // Whisper Fog is uncounterable BY DESIGN — "some weather you can only
      // endure" — and a fix that quietly ended that would be a worse bug than
      // the one it closed.
      const fog = WEATHER.find((w) => w.name === 'Whisper Fog');
      expect(fog).toBeDefined();
      for (const t of CANDIDATES) expect(weatherCounteredByResists(fog!, [t])).toBe(false);
    });
  });

  describe('the card that misled the owner', () => {
    it('the resist line names what the percentage reduces', () => {
      // ⚠ It read "Resists degradation (−6% each, stacks with armour)" and he
      // took it for a DURABILITY buff: *"it slows down the wear and tear of your
      // items by 6% each and it says stackable with armor."* A bare −6% beside a
      // word does not say −6% OF WHAT — and because degradation was a type
      // nothing dealt, nothing in play ever contradicted the reading.
      const line = (getItemPreview('Tin Ward Ring')?.stats ?? []).find((s) => s.startsWith('Resists'));
      expect(line).toBeDefined();
      expect(line).toContain('incoming damage');
      expect(line).not.toMatch(/each, stacks with armour/);
    });
  });

  describe('the character sheet shows the whole hand', () => {
    it('⚠⚠ all four ring slots, built from RING_SLOTS', () => {
      // OTA-1648 opened three more fingers and this screen was never told: a
      // player wearing four rings saw ONE on their own sheet. Built from the
      // constant so it can never fall behind the type again.
      const src = readFileSync('app/screens/CharacterScreen.tsx', 'utf8');
      expect(src).toContain('RING_SLOTS.map((slot, i)');
      // And the slots the owner named as missing are all present in the map.
      for (const kept of ["main: 'Main hand'", "off: 'Off hand'", "amulet: 'Amulet'"]) {
        expect(src).toContain(kept);
      }
      expect(RING_SLOTS.length).toBe(4);
    });
  });
});
