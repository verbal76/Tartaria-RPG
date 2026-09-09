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

// ⚠⚠⚠ OTA-1636 — THE BASE READS ON THE RIGHT.
//
// Owner: *"we need a way to identify a weapons base damage in the buttons like
// we do the coatings"* — and, correcting the first draft of the ask: *"all the
// way to the right so it's not mixed in."*
//
// So the row is `🔥☣ launcher ✦ ★` (OTA-1638 moved the star past the base). Coating glyphs on the left (OTA-1553's
// order), the name, the discovery star, and LAST the weapon's own damage type —
// one glyph per canonical type, set off by an em space in the painted label so
// it can never be read as a third coat. The flat string is still the tap
// breadcrumb, so it carries the same four pieces in the same order.

import {
  BASE_DAMAGE_GLYPH, BASE_GLYPH_COLOR, COATING_GLYPH, COATING_GLYPH_COLOR,
  baseDamageGlyph, combatWeaponLabel, combatWeaponLabelParts,
} from '../app/engine/weaponGlyphs';
import { DAMAGE_TYPE_KEYWORDS, canonicalDamageType } from '../app/engine/damageTypes';
import type { InventoryItem } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const coated = (a: string, b?: string) => ({
  coating: { kind: a, dice: '1d4', label: a },
  ...(b ? { coating2: { kind: b, dice: '1d4', label: b } } : {}),
} as unknown as Pick<InventoryItem, 'coating' | 'coating2'>);

describe('OTA-1636 — his launcher, exactly', () => {
  it('⚠⚠⚠ `🔥☣ choir-bound launcher ✦ ★` — coats left, base type, star LAST (OTA-1638)', () => {
    expect(combatWeaponLabel('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', ['aetheric']))
      .toBe('🔥☣ choir-bound launcher ✦ ★');
    expect(combatWeaponLabel('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', []))
      .toBe('🔥☣ choir-bound launcher ✦');
  });

  it('⚠⚠⚠ the base glyph is the LAST character of every typed label', () => {
    const cases: Array<[string, Pick<InventoryItem, 'coating' | 'coating2'> | null, string]> = [
      ['Cudgel', coated('burn', 'cold'), 'bludgeoning'],
      ['Auralite Talon', coated('acid', 'corruption'), 'aetheric'],
      ['Crude Golem Pike', null, 'piercing'],
      ['Geode-Cored Cleaver', null, 'slashing'],
      ['Frost Rod', coated('cold'), 'frost'],
    ];
    for (const [name, item, raw] of cases) {
      const label = combatWeaponLabel(name, item, raw, []);
      const starred = combatWeaponLabel(name, item, raw, [canonicalDamageType(raw)]);
      const g = baseDamageGlyph(raw);
      expect({ name, ends: label.endsWith(` ${g}`) }).toEqual({ name, ends: true });
      expect({ name, ends: starred.endsWith(` ${g} ★`) }).toEqual({ name, ends: true });
      // and no coat glyph sits to the right of the name
      const coatGlyphs = Object.values(COATING_GLYPH);
      const afterName = label.slice(label.toLowerCase().indexOf(name.split(' ').slice(-2).join(' ').toLowerCase()));
      for (const c of coatGlyphs) {
        if (c === g) continue; // the base type may share a coat's glyph (fire is fire)
        expect({ name, c, leaked: afterName.includes(c) }).toEqual({ name, c, leaked: false });
      }
    }
  });

  it('⚠⚠ no raw type known → no base glyph, no false symbol', () => {
    expect(combatWeaponLabel('Plain Stick', null, null, [])).toBe('plain stick');
    expect(combatWeaponLabelParts('Plain Stick', null, null, []).base).toBeNull();
    expect(baseDamageGlyph(undefined)).toBe('');
    expect(baseDamageGlyph('mystery')).toBe('');
  });

  it('⚠⚠ aliases canonicalise — frost is cold, force and psychic are aetheric', () => {
    expect(baseDamageGlyph('frost')).toBe(BASE_DAMAGE_GLYPH.cold);
    expect(baseDamageGlyph('force')).toBe(BASE_DAMAGE_GLYPH.aetheric);
    expect(baseDamageGlyph('psychic')).toBe(BASE_DAMAGE_GLYPH.aetheric);
    expect(combatWeaponLabelParts('Frost Rod', null, 'frost', []).base).toEqual({ ch: '❄', kind: 'cold' });
  });
});

describe('OTA-1636 — one glyph per damage type, each with a colour', () => {
  it('⚠⚠⚠ EVERY canonical damage type has a base glyph', () => {
    for (const t of DAMAGE_TYPE_KEYWORDS) {
      expect({ t, glyph: baseDamageGlyph(t) !== '' }).toEqual({ t, glyph: true });
    }
  });

  it('⚠⚠ every base glyph has a colour, and the coat families reuse the coat colour', () => {
    for (const k of Object.keys(BASE_DAMAGE_GLYPH)) {
      expect({ k, colour: BASE_GLYPH_COLOR[k] }).toMatchObject({ colour: expect.stringMatching(/^#[0-9a-f]{6}$/) });
    }
    for (const k of Object.keys(COATING_GLYPH) as Array<keyof typeof COATING_GLYPH>) {
      expect({ k, same: BASE_GLYPH_COLOR[k] === COATING_GLYPH_COLOR[k] && BASE_DAMAGE_GLYPH[k] === COATING_GLYPH[k] })
        .toEqual({ k, same: true });
    }
  });

  it('⚠⚠ the seven non-coat glyphs are seven distinct signals', () => {
    const own = ['bludgeoning', 'slashing', 'piercing', 'aetheric', 'radiation', 'degradation', 'stun']
      .map((k) => BASE_DAMAGE_GLYPH[k]);
    expect(new Set(own).size).toBe(own.length);
    // and none of them is a coat glyph — a base type that borrowed ❄ would read as frost
    for (const g of own) expect(Object.values(COATING_GLYPH)).not.toContain(g);
  });
});

describe('OTA-1636 — the wiring', () => {
  const BOX = src('app/components/InputBox.tsx');

  it('⚠⚠⚠ both hands pass the base part, and the button paints it last with its own colour', () => {
    expect((BOX.match(/baseGlyph=\{parts\.base\}/g) ?? []).length).toBe(2);
    expect(BOX).toContain('baseGlyph?: BaseGlyphPart | null;');
    expect(BOX).toContain("BASE_GLYPH_COLOR[baseGlyph.kind] ?? '#ffffff'");
    // the base node comes AFTER the text node inside the styled label
    const painted = BOX.slice(BOX.indexOf('(glyphs && glyphs.length > 0) || baseGlyph ?'));
    expect(painted.indexOf('glyphText ?? \'\'')).toBeLessThan(painted.indexOf('baseGlyph.ch'));
  });

  it('⚠⚠ the base is SET APART from the name — a margin now, an em space before', () => {
    /* ⚠⚠⚠ OTA-1766 MOVED THE MECHANISM AND KEPT THE CLAIM, WHICH IS THE ONLY
     * HONEST WAY TO UPDATE A PIN. The combat label stopped being one inline
     * `<Text>` and became a `<View>` row of measured boxes, on the owner's
     * instruction: *"handle the combat image layout appropriately rather than
     * trying to force the images into the old inline text-glyph
     * construction."* */
    /* ⚠ THE CLAIM — "the weapon's own damage is visibly set off from its name,
     * so it can never read as a third coat" — is unchanged. The em space
     * (U+2003) existed because an inline `Text` has no box and therefore no
     * margin; OTA-1638 had already had to pull it OUT of the dark cell to stop
     * the cell stretching across the gap into the black bar the owner
     * photographed. A row makes the gap a property, and the failure mode goes
     * with the workaround: there is no cell left for a spacer to be inside. */
    expect(BOX).toContain('quickMarkLead: { marginLeft: 7 }');
    expect(BOX).toContain('lead');
    // ⚠ the workaround is gone because the thing it worked around is
    expect(BOX).not.toContain("<Text>{'\\u2003'}</Text>");
    /* ⚠⚠ AND THE FLAT LABEL STILL SPELLS IT WITH A SPACE. `combatWeaponLabel`
     * is untouched — it is the breadcrumb and the screen-reader string — so the
     * separation survives in BOTH renderings, which is the actual promise. */
    expect(combatWeaponLabel('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', []))
      .toContain(' ✦');
  });

  it('⚠ the flat label and the parts still agree — the breadcrumb is one string', () => {
    const parts = combatWeaponLabelParts('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', ['aetheric']);
    const rebuilt = `${parts.glyphs.map((g) => g.ch).join('')} ${parts.text} ${parts.base!.ch}${parts.star ? ' ★' : ''}`;
    expect(rebuilt).toBe(combatWeaponLabel('Choir-Bound Launcher', coated('burn', 'corruption'), 'aetheric', ['aetheric']));
  });
});
