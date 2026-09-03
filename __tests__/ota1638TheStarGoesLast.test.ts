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

// ⚠⚠⚠ OTA-1638 — THE STAR GOES LAST, AND THE KEY IS ON THE ABOUT SCREEN.
//
// Owner, three asks in a row: *"put this glyph key in the About screen and
// explain the discovery star"*, *"put the discovery star all the way to the
// right"*, and — from the screenshot — *"why the weird black boxes around the
// glyphs"*. So:
//
//   • the row is `🔥☣ launcher ✦ ★` now: coats, name, own damage, star LAST;
//   • the em space before the base glyph lives OUTSIDE the dark cell, so the
//     cell no longer stretches across the gap into a black box;
//   • a WEAPON GLYPHS card on the About tab reads the live tables and says
//     what the star means.

import {
  BASE_DAMAGE_GLYPH, BASE_GLYPH_COLOR, COATING_GLYPH, COATING_GLYPH_COLOR,
  combatWeaponLabel, combatWeaponLabelParts,
} from '../app/engine/weaponGlyphs';
import {
  BASE_KEY_ORDER, BASE_TYPE_MEANING, COAT_KEY_ORDER, COAT_MEANING, STAR_EXPLAINED, GLYPH_KEY_EXAMPLE,
} from '../app/components/WeaponGlyphKey';
import type { InventoryItem } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const coated = (a: string, b?: string) => ({
  coating: { kind: a, dice: '1d4', label: a },
  ...(b ? { coating2: { kind: b, dice: '1d4', label: b } } : {}),
} as unknown as Pick<InventoryItem, 'coating' | 'coating2'>);

describe('OTA-1638 — the star goes last', () => {
  it('⚠⚠⚠ `🔥☣ choir-bound launcher ✦ ★` — the star is the LAST character of a starred label', () => {
    expect(combatWeaponLabel('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', ['aetheric']))
      .toBe('🔥☣ choir-bound launcher ✦ ★');
    expect(combatWeaponLabel('Cudgel', coated('burn', 'cold'), 'bludgeoning', ['cold'])).toBe('🔥❄ cudgel ⚒ ★');
    expect(combatWeaponLabel('Cudgel', null, 'bludgeoning', ['bludgeoning'])).toBe('cudgel ⚒ ★');
    // no base type known: the star still closes the row
    expect(combatWeaponLabel('Plain Stick', coated('burn'), null, ['burn'])).toBe('🔥 plain stick ★');
    // unstarred: the base glyph closes it
    expect(combatWeaponLabel('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', [])).toBe('🔥☣ choir-bound launcher ✦');
  });

  it('⚠⚠⚠ the parts carry the star as its own piece, and the text is the bare name', () => {
    const p = combatWeaponLabelParts('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', ['aetheric']);
    expect(p.text).toBe('choir-bound launcher');
    expect(p.star).toBe(true);
    expect(p.base).toEqual({ ch: '✦', kind: 'aetheric' });
    expect(combatWeaponLabelParts('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', []).star).toBe(false);
  });

  it('⚠⚠ the painted button paints the star after the base glyph, and the spacer sits outside the cell', () => {
    const BOX = src('app/components/InputBox.tsx');
    expect((BOX.match(/star=\{parts\.star\}/g) ?? []).length).toBe(2);
    expect(BOX).toContain('star?: boolean;');
    expect(BOX).toContain("{star ? <Text>{' ★'}</Text> : null}");
    const painted = BOX.slice(BOX.indexOf('(glyphs && glyphs.length > 0) || baseGlyph ?'));
    expect(painted.indexOf('baseGlyph.ch')).toBeLessThan(painted.indexOf("{star ? <Text>{' ★'}</Text> : null}"));
    // his "weird black boxes": the em space is an unstyled node, not part of the dark cell
    expect(BOX).toContain("<Text>{'\\u2003'}</Text>");
    expect(BOX).toContain('{`\\u200a${baseGlyph.ch}\\u200a`}');
    expect(BOX).not.toContain('{`\\u2003${baseGlyph.ch}');
  });
});

describe('OTA-1638 — the key on the About screen reads the live tables', () => {
  it('⚠⚠⚠ every base type in the table is in the key, once, with a meaning', () => {
    expect([...BASE_KEY_ORDER].sort()).toEqual(Object.keys(BASE_DAMAGE_GLYPH).sort());
    expect(new Set(BASE_KEY_ORDER).size).toBe(BASE_KEY_ORDER.length);
    for (const k of BASE_KEY_ORDER) {
      expect({ k, meaning: (BASE_TYPE_MEANING[k] ?? '').length > 0, colour: !!BASE_GLYPH_COLOR[k] })
        .toEqual({ k, meaning: true, colour: true });
    }
  });

  it('⚠⚠⚠ every coating family is in the key, once, with a meaning', () => {
    expect([...COAT_KEY_ORDER].sort()).toEqual(Object.keys(COATING_GLYPH).sort());
    for (const k of COAT_KEY_ORDER) {
      expect({ k, meaning: (COAT_MEANING[k] ?? '').length > 0, colour: !!COATING_GLYPH_COLOR[k] })
        .toEqual({ k, meaning: true, colour: true });
    }
  });

  it('⚠⚠ the example row IS the label the engine prints — coats, name, own damage, star', () => {
    expect(GLYPH_KEY_EXAMPLE).toBe(combatWeaponLabel('Launcher', coated('burn', 'corruption'), 'aetheric', ['aetheric']));
    expect(GLYPH_KEY_EXAMPLE).toBe('🔥☣ launcher ✦ ★');
  });

  it('⚠⚠ the star is explained in the terms the buttons live by', () => {
    const text = STAR_EXPLAINED.join(' ');
    expect(text).toContain('all the way to the right');
    expect(text).toContain('Wisdom 12');
    expect(text).toContain('boss');
    expect(text).toContain('by hitting the thing');
    expect(text).toContain('"not known to bite", never "known not to bite"');
    expect(text).toContain('same verdict as the enemy card');
  });

  it('⚠ the aliases the engine canonicalises are named in the key', () => {
    expect(BASE_TYPE_MEANING.cold).toContain('frost counts as cold');
    expect(BASE_TYPE_MEANING.aetheric).toContain('force and psychic count as aetheric');
  });

  it('⚠⚠ the card is on the About tab', () => {
    const ABOUT = src('app/screens/AboutScreen.tsx');
    expect(ABOUT).toContain("import { WeaponGlyphKey } from '../components/WeaponGlyphKey';");
    const aboutTab = ABOUT.slice(ABOUT.indexOf("{tab === 'about' && ("));
    expect(aboutTab.indexOf('<WeaponGlyphKey />')).toBeGreaterThan(0);
    expect(aboutTab.indexOf('<WeaponGlyphKey />')).toBeLessThan(aboutTab.indexOf('styles.dedication'));
    const KEY = src('app/components/WeaponGlyphKey.tsx');
    // the glyphs and colours come from the engine, never a copy
    expect(KEY).toContain("} from '../engine/weaponGlyphs';");
    expect(KEY).not.toMatch(/bludgeoning: '⚒'/);
  });
});
