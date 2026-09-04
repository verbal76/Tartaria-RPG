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

// OTA-1667 — THE KEY GOES WHERE THE PLAYER IS.
//
// Owner, three things in one message: *"the about tab, should that be there or
// should it just be wrapped up in the log? it honestly doesn't mean anything to
// anyone but you and me. the weapon glyphs section should be under the lore
// button that lives on the minimap not in about, that should be easily player
// facing. also audit the glyphs list to see if all of those damage types exist
// in game."*
//
// ⚠⚠⚠ THE AUDIT ANSWER IS NO — FOUR OF THIRTEEN DID NOT EXIST. Measured across
// all 301 catalog weapons, through the SAME `baseDamageGlyph` path the combat
// buttons paint from:
//
//     ⚒ bludgeoning 65   ▲ piercing 55   ✦ aetheric 49   ⚔ slashing 45
//     🔥 burn 45         ⚡ electrical 22  ☠ poison 9      ❄ cold 6
//     ☢ radiation 5
//     ⚙ degradation 0    ✱ stun 0        ⚗ acid 0        ☣ corruption 0
//
// ⚠⚠ AND ⚙ WAS WORSE THAN EMPTY — IT WAS UNREACHABLE BY CONSTRUCTION. OTA-1652
// aliased `degradation → acid`, and `baseDamageGlyph` canonicalises BEFORE the
// glyph lookup. So even a weapon authored with degradation would print ⚗. That
// row could not appear on a button under any circumstances, and the key
// promised it anyway — for 29 OTAs.
//
// ⚠ ACID AND CORRUPTION ARE NOT MISSING FROM THE GAME. They are missing as a
// weapon's OWN damage. Both are live coating families with real vials (burn 3,
// electrical 3, poison 3, cold 2, corruption 2, acid 1), and the key's COATS
// section listed them correctly all along. The defect was listing them a SECOND
// time under "own damage", where nothing can carry them.
//
// ⚠⚠⚠ SO THE FIX IS A DERIVATION, NOT A SHORTER LIST — and that distinction is
// the whole reason this is worth a suite. A list I prune by hand today is wrong
// again the first time someone authors an acid-based weapon: the key would then
// HIDE a glyph the buttons paint, the same lie pointing the other way. Reading
// the catalog makes both directions impossible, and the tests below are what
// keeps it honest.

import { readFileSync } from 'fs';
import { join } from 'path';
import { baseTypesInPlay, BASE_TYPE_MEANING } from '../app/components/WeaponGlyphKey';
import { BASE_DAMAGE_GLYPH, BASE_GLYPH_COLOR, baseDamageGlyph } from '../app/engine/weaponGlyphs';
import { canonicalDamageType } from '../app/engine/damageTypes';
import { WEAPONS } from '../app/engine/crafting';

const ROOT = join(__dirname, '..');
const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const code = (s: string): string => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('OTA-1667 — ⚠⚠⚠ the glyph audit, kept as a measurement', () => {
  it('the key lists EXACTLY the base types weapons actually deal', () => {
    // Recomputed here from the catalog, independently of the component, so the
    // two have to agree rather than the test copying the implementation.
    const fromCatalog = new Set<string>();
    for (const w of WEAPONS) {
      const c = canonicalDamageType((w as { damageType?: string }).damageType);
      if (c && BASE_DAMAGE_GLYPH[c]) fromCatalog.add(c);
    }
    expect([...baseTypesInPlay()].sort()).toEqual([...fromCatalog].sort());
  });

  it('⚠⚠ and the four dead rows are gone — none of them can reach a button', () => {
    const shown = new Set(baseTypesInPlay());
    for (const dead of ['degradation', 'stun', 'acid', 'corruption']) {
      // Nothing in the catalog deals it...
      const dealt = WEAPONS.filter(
        (w) => canonicalDamageType((w as { damageType?: string }).damageType) === dead,
      );
      expect({ dead, dealt: dealt.length }).toEqual({ dead, dealt: 0 });
      // ...so it is not offered as a weapon's own damage.
      expect(shown.has(dead)).toBe(false);
    }
  });

  it('⚠⚠⚠ ⚙ DEGRADATION was unreachable BY CONSTRUCTION, not merely unused', () => {
    // The other three were empty. This one was impossible: OTA-1652's alias
    // rewrites the type before the glyph table is consulted, so the ⚙ in
    // BASE_DAMAGE_GLYPH has never had a path to a screen.
    expect(canonicalDamageType('degradation')).toBe('acid');
    expect(baseDamageGlyph('degradation')).toBe(BASE_DAMAGE_GLYPH.acid);
    expect(baseDamageGlyph('degradation')).not.toBe(BASE_DAMAGE_GLYPH.degradation);
  });

  it('⚠ every type the game DOES deal is present, furnished, and glyphed', () => {
    const shown = baseTypesInPlay();
    for (const t of ['bludgeoning', 'piercing', 'aetheric', 'slashing', 'burn',
      'electrical', 'poison', 'cold', 'radiation']) {
      expect({ t, listed: shown.includes(t) }).toEqual({ t, listed: true });
      expect({ t, glyph: !!BASE_DAMAGE_GLYPH[t], colour: !!BASE_GLYPH_COLOR[t],
        meaning: (BASE_TYPE_MEANING[t] ?? '').length > 0 })
        .toEqual({ t, glyph: true, colour: true, meaning: true });
    }
  });

  it('⚠⚠ a NEW acid-based weapon would bring its row back automatically', () => {
    // The property that makes this a derivation rather than a prune. If the
    // catalog ever gains one, the key must show ⚗ under OWN DAMAGE without
    // anybody remembering to edit a list — and the meaning is already written.
    expect(BASE_DAMAGE_GLYPH.acid).toBeTruthy();
    expect((BASE_TYPE_MEANING.acid ?? '').length).toBeGreaterThan(0);
    expect((BASE_TYPE_MEANING.corruption ?? '').length).toBeGreaterThan(0);
    // And the component reads the catalog rather than a literal array.
    const KEY = code(src('app/components/WeaponGlyphKey.tsx'));
    expect(KEY).toContain("from '../engine/crafting'");
    expect(KEY).toContain('baseTypesInPlay()');
  });
});

describe('OTA-1667 — ⚠⚠ the key is player-facing now', () => {
  it('GLYPHS is a codex tab, third in the row', () => {
    const CODEX = code(src('app/components/LoreCodexBody.tsx'));
    expect(CODEX).toContain("'bestiary', 'fallen', 'glyphs'");
    expect(CODEX).toContain("glyphs: 'GLYPHS'");
    expect(CODEX).toContain('<WeaponGlyphKey />');
  });

  it('⚠ and the codex kept every tab it had — nothing was displaced to make room', () => {
    // The row WRAPS, so adding a tab costs nothing. Losing one would cost 172
    // lore entries or the memorial, and an insert is exactly where that happens.
    const CODEX = code(src('app/components/LoreCodexBody.tsx'));
    for (const t of ['bestiary', 'fallen', 'places', 'factions', 'races', 'lore', 'timeline']) {
      expect({ t, present: CODEX.includes(`'${t}'`) }).toEqual({ t, present: true });
    }
  });

  it('⚠⚠ the codex is reachable from the map crest, which is the door he named', () => {
    expect(code(src('app/screens/ExplorationScreen.tsx'))).toContain("setScreen('lore')");
  });
});

describe('OTA-1667 — ⚠⚠ the ABOUT tab folded away', () => {
  it('SETTINGS is down to four tabs', () => {
    const ABOUT = code(src('app/screens/AboutScreen.tsx'));
    expect(ABOUT).toContain("['session', 'sfx', 'display', 'notices']");
    expect(ABOUT).not.toContain("tab === 'about'");
  });

  it('⚠ nothing was lost — the dedication, the ritual and the notices are one page', () => {
    const ABOUT = code(src('app/screens/AboutScreen.tsx'));
    const page = ABOUT.slice(ABOUT.indexOf("tab === 'notices'"));
    // The dedication leads it, where it used to be buried under a build dump.
    expect(page.indexOf('styles.dedication')).toBeGreaterThan(-1);
    expect(page.indexOf('styles.dedication')).toBeLessThan(page.indexOf('NOTICES_PREAMBLE'));
    // ⚠⚠ AND THE SEVEN-TAP OWNER UNLOCK STILL EXISTS. OTA-1490 built it because
    // a name-based unlock cannot reach an install whose roster carries ordinary
    // names; both of the owner's phones depend on it. Deleting a tab is exactly
    // how a gesture bound to that tab's text disappears without anyone noticing.
    expect(page).toContain('handleOwnerTap');
    expect(page).toContain('more taps to unlock owner tools');
  });

  it('⚠⚠ the build block he called meaningless still reaches him the two ways that matter', () => {
    // "should it just be wrapped up in the log" — it already was, twice over,
    // which is what made the third copy on a tab redundant rather than load-
    // bearing. Both of these are the same `buildBasicDeviceSummary`.
    expect(code(src('app/diagnostics/aboutSummary.ts'))).toContain('export function buildBasicDeviceSummary');
    expect(code(src('app/diagnostics/bugReport.ts'))).toContain('buildBasicDeviceSummary()');
    expect(code(src('app/screens/AboutScreen.tsx'))).toContain('stampLogExport');
  });
});
