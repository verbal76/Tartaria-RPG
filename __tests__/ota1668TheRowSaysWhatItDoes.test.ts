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

// OTA-1668 — THE ROW SAYS WHAT IT IS AND WHAT IT DOES.
//
// Owner: *"at workings to learn at a vendor, the things you buy need more than a
// name, they need to tell you what they are and what they do on the button line.
// I understand that if you tap on it you get the full detailed view but that's
// an extra step. If I know it's an axe with electric base damage and it's a 2d10
// then it helps me choose faster."*
//
// ⚠⚠ HE NAMED THE ONE BUY SURFACE THAT HAD NOTHING, and he was precise about it.
// The ordinary offer rows have carried `kindLabel · rarity` and a full stat line
// for many OTAs. WORKINGS TO LEARN — the recipe list — printed the result's NAME,
// its price, and the literal word "recipe". So choosing between two workings
// meant opening both and backing out of one, every time.
//
// ⚠ THE HEADLINE IS BUILT AT THE SOURCE, NOT PARSED AT THE ROW. Each branch of
// itemPreview writes its own, from the values it already holds. The tempting
// shortcut — have the caller slice `stats[0]` and regex "Damage: 2d10
// (electrical)" back apart — is how a screen eventually prints a weapon's
// durability where its damage belongs, and it would have had to be repeated at
// every surface that wanted the line.
//
// ⚠⚠⚠ AND THE LOOT LABEL RIDES ALONG, because the owner asked what loot is FOR
// in the same breath: *"we need to define what loot is in the inventory. It's
// just there, but what is it for?"*
//
// It already had a job and never said so. `isForgeableLootReagent` has fed
// 'loot'-tagged drops to the Fusing Crucible since OTA-737, and OTA-1642
// authored 86 enemy drops specifically to keep that hopper full. ⚠ BUT THE
// ANSWER IS NOT ONE ANSWER — the engine already splits them in two, and a
// blanket label would have been a lie: a drop named by any recipe is
// DELIBERATELY excluded from the Crucible so fusing can never cannibalise
// crafting. `lootPurposeLine` reads those same two predicates, so the label and
// the bench's refusal cannot disagree.

import { readFileSync } from 'fs';
import { join } from 'path';
import { getItemPreview, lootPurposeLine } from '../app/components/itemPreview';
import { WEAPONS, ARMOR, isRecipeIngredientName } from '../app/engine/crafting';
import { isForgeableLootReagent } from '../app/engine/itemFusion';
import { baseDamageGlyph } from '../app/engine/weaponGlyphs';

const ROOT = join(__dirname, '..');
const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const code = (s: string): string => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('OTA-1668 — ⚠⚠ every weapon can answer "what is it and what does it do"', () => {
  it('the headline names the kind, the damage and the stat it scales on', () => {
    // His exact example: an axe, electric, 2d10. Whatever the catalog happens to
    // hold, the SHAPE has to be that — kind, then damage, then scaling.
    for (const w of WEAPONS) {
      const h = getItemPreview(w.name).headline;
      expect({ w: w.name, hasKind: h.includes('Weapon') || h.includes('Runecaster') })
        .toEqual({ w: w.name, hasKind: true });
      expect({ w: w.name, hasDice: h.includes(w.damageDice) })
        .toEqual({ w: w.name, hasDice: true });
      expect({ w: w.name, hasType: h.toLowerCase().includes(w.damageType.toLowerCase()) })
        .toEqual({ w: w.name, hasType: true });
    }
  });

  it('⚠ and it carries the SAME glyph the combat button paints', () => {
    // OTA-1636 put the base glyph on the button; OTA-1667 moved its key to the
    // codex where a player can learn it. A shop row using a different symbol
    // would make that key wrong for the surface people read first.
    for (const w of WEAPONS.slice(0, 40)) {
      const g = baseDamageGlyph(w.damageType);
      if (!g) continue;
      expect({ w: w.name, glyph: getItemPreview(w.name).headline.includes(g) })
        .toEqual({ w: w.name, glyph: true });
    }
  });

  it('armor answers the same question in its own terms', () => {
    for (const a of ARMOR.slice(0, 60)) {
      const h = getItemPreview(a.name).headline;
      expect({ a: a.name, ac: h.includes(`AC +${a.acBonus}`) }).toEqual({ a: a.name, ac: true });
      expect({ a: a.name, slot: h.toLowerCase().includes(a.slot.toLowerCase()) })
        .toEqual({ a: a.name, slot: true });
    }
  });

  it('⚠⚠ no headline is ever empty — a blank line is worse than the old row', () => {
    for (const w of [...WEAPONS.slice(0, 30), ...ARMOR.slice(0, 30)]) {
      expect({ n: w.name, len: getItemPreview(w.name).headline.length > 0 })
        .toEqual({ n: w.name, len: true });
    }
  });
});

describe('OTA-1668 — ⚠⚠⚠ the loot label agrees with the bench that enforces it', () => {
  it('a recipe ingredient is labelled one, and is NOT offered to the Crucible', () => {
    // The two halves are the same fact. isForgeableLootReagent excludes recipe
    // names on purpose (fusing must never cannibalise crafting), so a label
    // saying "Crucible fodder" on a recipe part would be a promise the bench
    // refuses — which is the exact shape of defect this project keeps finding.
    const ingredients = ['Aetheric Cloth', 'Drone Core'].filter((n) => isRecipeIngredientName(n));
    expect(ingredients.length).toBeGreaterThan(0);
    for (const name of ingredients) {
      expect(lootPurposeLine({ name, tags: ['loot'] })).toBe('crafting ingredient');
      expect(isForgeableLootReagent({ name, tags: ['loot'] })).toBe(false);
    }
  });

  it('⚠ and anything the Crucible WILL take says so', () => {
    const fodder = { name: 'Zzz Unlisted Scrap Fragment', tags: ['loot'] };
    expect(isForgeableLootReagent(fodder)).toBe(true);
    expect(lootPurposeLine(fodder)).toBe('Crucible fodder');
  });

  it('⚠⚠ an item with no loot claim stays silent rather than inventing one', () => {
    // The third case is real and must not be papered over: plenty of things are
    // simply worth what a vendor pays. A label on those would be noise.
    expect(lootPurposeLine({ name: 'Zzz Unlisted Plain Thing', tags: [] })).toBeNull();
  });

  it('⚠ the label never costs a row — a throwing predicate is survivable', () => {
    // isForgeableLootReagent reaches the catalogs, which is the shape that threw
    // in OTA-1663 on a drifted key. A vendor list that cannot render because a
    // courtesy label failed would be a far worse defect than the missing label.
    expect(() => lootPurposeLine({ name: '', tags: undefined })).not.toThrow();
    expect(() => lootPurposeLine({ name: 'Zzz', kind: 'nonsense_kind', tags: ['loot'] })).not.toThrow();
  });
});

describe('OTA-1668 — ⚠ the rows actually render it', () => {
  it('WORKINGS TO LEARN prints the headline', () => {
    const V = code(src('app/screens/VendorScreen.tsx'));
    const recipes = V.slice(V.indexOf('recipeOffers.map'));
    expect(recipes).toContain('preview.headline');
  });

  it('and the sell rows print the loot purpose', () => {
    expect(code(src('app/screens/VendorScreen.tsx'))).toContain('lootPurposeLine(item)');
  });

  it('⚠⚠ the row reads the SAME preview the confirm sheet does', () => {
    // A row and the sheet it opens disagreeing about the same object is the
    // OTA-1611 defect. One derivation, two surfaces.
    const V = code(src('app/screens/VendorScreen.tsx'));
    expect(V).toContain('getItemPreview(o.result)');
    expect(V).toContain('getItemPreview(pending.itemName)');
  });
});
