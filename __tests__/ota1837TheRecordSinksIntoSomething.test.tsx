/* ⚠⚠⚠ OTA-1837 — THE TOP EDGE THAT OPENS WHEN A RECORD IS PRESSED.
 *
 * Owner, with physical iPhone evidence: pressing and holding a saved-character
 * card depresses it correctly, but the TOP EDGE OPENS — a dark strip appears
 * along the top and the card stops looking structurally closed. Release puts it
 * back. It is the third time this one geometry has been reported and the second
 * time a repair has shipped for it.
 *
 * ⚠⚠ THE MECHANISM, IN TWO HALVES, WHICH IS WHY ONE REPAIR DID NOT CLOSE IT.
 *
 * The geometry half is cross-platform. `dossierOuter` paints NOTHING — no
 * background, no border, only a margin and a shadow. OTA-1810 gave the record a
 * travel; OTA-1822 moved that travel off the shadow-CASTER and onto the RIM,
 * which correctly stopped a black bar appearing BELOW the card. But the rim is
 * then the only painted thing inside an unpainted parent, so the 3dp it stops
 * covering at the bottom it stops covering at the TOP. The bar was traded, not
 * closed.
 *
 * The colour half is Apple-only, and it is this view's OWN shadow. React Native
 * honours `shadow*` on iOS only — `elevation` is deliberately absent here — and
 * RN cannot precompute a shadow path for a view whose background is not opaque:
 * it says so in as many words in `RCTView` and in `RCTViewComponentView`, and
 * falls back to a PIXEL-BASED shadow, which Core Animation draws BENEATH the
 * layer's own content. `dossierOuter` has no content of its own, so the strip
 * the rim stops covering is lit by nothing but #000 at 0.5.
 *
 * ⚠⚠ AND THAT IS WHY OTA-1827 DID NOT REACH THE OWNER'S PHONE. It recoloured
 * `SwipeableRow`'s sliding surface — the slab BEHIND the row — from a hardcoded
 * #0a0908 to the player's own background. That repair was right, it is kept
 * here untouched, and it is why the Pixel went quiet. It could not close the
 * iPhone, because no colour chosen for the layer underneath can reach past a
 * near-opaque black scrim drawn on top of it.
 *
 * ⚠⚠ THE REPAIR IS THE HOUSING THE CARD NEVER HAD. Every planed control in the
 * kit sinks into something drawn. The dossier sank into a hole. `dossierPressEdge`
 * is that housing: exactly the travel distance high, OPAQUE — a translucent band
 * composites over the same shadow and reads grey — in the record's own resting
 * material with the record's own resting lit top edge, mounted only while
 * pressed and rendered BEHIND the rim. The plate still drops 3dp and still hands
 * its light to the lower edge; the outline no longer opens.
 *
 * ⚠ WHY OTA-1829 CLEARED THIS CARD, WRITTEN DOWN SO THE NEXT PASS DOES NOT.
 * That pass wrote that the dossier "wears NO planes at all ... so its top edge
 * is always drawn". True of the BORDERS and false of the CARD: the border is
 * always drawn, it is simply drawn 3dp lower, and nothing draws what it left.
 * Two inline comments in TitleScreen still said the travel rode the OUTER —
 * stale since OTA-1822 — and that is the sentence the exemption was reasoned
 * from. Both are corrected; §6 pins the correction.
 *
 * ⚠ WHAT THIS SUITE CANNOT DO. It reads construction, not pixels. That the
 * pressed edge READS on a real panel is the owner's eye on hardware, and this
 * defect is NOT closed until he confirms it on iPhone.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { T, tartariaKitStyles as kit } from '../app/ui/tartariaKit';
import { baseColorOf, hexLuminance } from '../app/ui/displaySettings';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

const TITLE = read('app/screens/TitleScreen.tsx');
const SWIPE = read('app/components/SwipeableRow.tsx');

/* ⚠ THE TRAP THIS REPO HAS NOW FALLEN INTO TWICE: a comment that QUOTES the
 * code satisfies a source assertion. Every claim about what the screen DOES
 * reads this, not the raw file. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const TITLE_CODE = codeOnly(TITLE);

/** Pull one `name: { ... }` StyleSheet entry's literal body out of a source. */
const styleBody = (src: string, name: string): string => {
  const at = src.indexOf(`  ${name}: {`);
  if (at < 0) throw new Error(`style ${name} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error(`style ${name} never closed`);
};

/** One top-level `key: value` out of a style body; nested objects are skipped. */
const prop = (body: string, key: string): string | null => {
  const m = new RegExp(`(?:^|[{,\\s])${key}:\\s*([^,}\\n]+)`).exec(body);
  return m ? String(m[1] ?? '').trim().replace(/^'|'$/g, '') : null;
};

const num = (body: string, key: string): number | null => {
  const v = prop(body, key);
  return v === null ? null : Number(v);
};

/** The alpha of an rgba(); a hex or a token name carries none and returns null. */
const alphaOf = (c: string): number | null => {
  const m = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(c);
  return m ? Number(m[1]) : null;
};

/** Resolve a value the screen wrote as `T.something` to the token's real value. */
const resolve = (v: string | null): string | null => {
  if (v === null) return null;
  const m = /^T\.(\w+)$/.exec(v);
  return m ? String((T as unknown as Record<string, string>)[String(m[1])]) : v;
};

/** The travel is the kit's number, not one this suite invents. */
const TRAVEL = (() => {
  const t = flat(kit.controlPressed).transform as Array<Record<string, number>> | undefined;
  const y = t?.find((e) => 'translateY' in e)?.translateY;
  if (typeof y !== 'number') throw new Error('kit.controlPressed no longer translates');
  return y;
})();

/** The two saved-character records, by the style array that opens each one. */
const RECORDS = [
  { name: 'collapsed', anchor: 'styles.dossierOuter, !bootGateOpen' },
  { name: 'selected', anchor: 'styles.dossierOuter, styles.dossierOuterOpen' },
] as const;

/** The JSX of one record, from its Pressable's style array to its TSettle. */
const recordHead = (anchor: string): string => {
  const i = TITLE_CODE.indexOf(anchor);
  expect(i).toBeGreaterThan(-1);
  const j = TITLE_CODE.indexOf('<TSettle', i);
  expect(j).toBeGreaterThan(i);
  return TITLE_CODE.slice(i, j);
};

/* The three record states and the rim style each one wears at rest. The band is
 * asserted against these rather than against copied literals, so a future pass
 * that re-tones a record cannot leave its housing behind. */
const STATES = [
  { state: 'filed', rim: 'dossierRim', band: 'dossierPressEdge' },
  { state: 'selected', rim: 'dossierRimOpen', band: 'dossierPressEdgeOpen' },
  { state: 'dead', rim: 'dossierRimDead', band: 'dossierPressEdgeDead' },
] as const;

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1837 §1 — the hole is real, and it is exactly the travel', () => {
  test('1.1 the shadow-caster still paints NOTHING — that is the precondition', () => {
    /* unchanged from OTA-1822 §5.1 and OTA-1827 §2.1, and re-asserted here
     * because the whole mechanism rests on it. */
    const o = styleBody(TITLE, 'dossierOuter');
    expect(o).not.toMatch(/backgroundColor:/);
    expect(o).not.toMatch(/border(Width|Color)/);
    expect(o).toMatch(/shadowColor:\s*'#000'/);
    expect(o).not.toMatch(/elevation/);
  });

  test('1.2 the rim — the only painted layer — is what travels', () => {
    for (const rim of ['dossierRimPressed', 'dossierRimOpenPressed']) {
      expect(TITLE_CODE).toContain(`pressed && kit.controlPressed, pressed && styles.${rim}`);
    }
    expect(TRAVEL).toBe(3);
  });

  test('1.3 ⚠ THE REPAIR: the housing is exactly as tall as the travel', () => {
    const b = styleBody(TITLE, 'dossierPressEdge');
    expect(num(b, 'height')).toBe(TRAVEL);
    expect(prop(b, 'position')).toBe('absolute');
    expect(num(b, 'top')).toBe(0);
    expect(num(b, 'left')).toBe(0);
    expect(num(b, 'right')).toBe(0);
  });

  test('1.4 it does not reach the bottom, and it cannot take a touch', () => {
    const b = styleBody(TITLE, 'dossierPressEdge');
    expect(prop(b, 'bottom')).toBeNull();
    for (const { anchor } of RECORDS) {
      expect(recordHead(anchor)).toMatch(/dossierPressEdge[\s\S]*pointerEvents="none"/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1837 §2 — the band is OPAQUE, which is the half OTA-1827 could not reach', () => {
  test('2.1 ⚠⚠ every colour the housing paints is opaque — a tint would let the shadow through', () => {
    for (const { band } of STATES) {
      const b = styleBody(TITLE, band);
      for (const key of ['backgroundColor', 'borderColor', 'borderTopColor']) {
        const raw = prop(b, key);
        if (raw === null) continue;
        const v = resolve(raw);
        expect(v).not.toBe('transparent');
        expect(alphaOf(String(v))).toBeNull();      // no rgba() anywhere in the band
        expect(String(v)).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test('2.2 ⚠ and it is not black — it is the record\'s own material', () => {
    for (const { rim, band } of STATES) {
      const fill = resolve(prop(styleBody(TITLE, band), 'backgroundColor'));
      const rimFill = resolve(prop(styleBody(TITLE, rim), 'backgroundColor'));
      expect(fill).toBe(rimFill);                    // copied, never minted
      expect(hexLuminance(String(fill))).toBeGreaterThan(hexLuminance('#000000'));
    }
  });

  test('2.3 the housing wears the record\'s OWN resting lit top edge', () => {
    for (const { rim, band } of STATES) {
      const bandTop = resolve(prop(styleBody(TITLE, band), 'borderTopColor'));
      const rimTop = resolve(prop(styleBody(TITLE, rim), 'borderTopColor'));
      expect(bandTop).toBe(rimTop);
      // and it is genuinely lighter than the fill it sits on: an edge, not a line
      const fill = resolve(prop(styleBody(TITLE, band), 'backgroundColor'));
      expect(hexLuminance(String(bandTop))).toBeGreaterThan(hexLuminance(String(fill)));
    }
  });

  test('2.4 the top edge is DRAWN — one device pixel of border, and a radius', () => {
    const b = styleBody(TITLE, 'dossierPressEdge');
    expect(num(b, 'borderWidth')).toBe(1);
    expect(num(b, 'borderBottomWidth')).toBe(0);     // the rim draws that edge
    expect(num(b, 'borderTopLeftRadius')).toBe(num(styleBody(TITLE, 'dossierRim'), 'borderRadius'));
    expect(num(b, 'borderTopRightRadius')).toBe(num(styleBody(TITLE, 'dossierRim'), 'borderRadius'));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1837 §3 — pressed only, behind the plate, and idle is untouched', () => {
  test('3.1 ⚠ the band is mounted ONLY while the finger is down', () => {
    for (const { anchor } of RECORDS) {
      const head = recordHead(anchor);
      expect(head).toMatch(/\{pressed \?\s*\([\s\S]*?dossierPressEdge[\s\S]*?\)\s*:\s*null\}/);
    }
    /* and NO USE of it anywhere in the screen escapes a pressed guard — the
     * style declarations themselves are `dossierPressEdge:` and are not uses. */
    const uses: number[] = [];
    for (let i = TITLE_CODE.indexOf('styles.dossierPressEdge'); i > -1;
      i = TITLE_CODE.indexOf('styles.dossierPressEdge', i + 1)) uses.push(i);
    expect(uses.length).toBeGreaterThanOrEqual(4);   // base + dead, twice over
    const unguarded = uses.filter((i) => !/pressed \?[\s\S]{0,300}$/.test(TITLE_CODE.slice(0, i)));
    expect(unguarded).toEqual([]);
  });

  test('3.2 it renders BEFORE the plate, so the plate is always in front', () => {
    for (const { anchor } of RECORDS) {
      const head = recordHead(anchor);          // ends at <TSettle
      expect(head).toContain('dossierPressEdge');
    }
  });

  test('3.3 ⚠ IDLE IS BYTE-FOR-BYTE WHAT IT WAS — nothing resting moved', () => {
    expect(prop(styleBody(TITLE, 'dossierRim'), 'backgroundColor')).toBe('#232527');
    expect(resolve(prop(styleBody(TITLE, 'dossierRim'), 'borderTopColor'))).toBe(T.rimAlloy);
    expect(prop(styleBody(TITLE, 'dossierRim'), 'borderBottomColor')).toBe('#0D0E0E');
    expect(num(styleBody(TITLE, 'dossierRim'), 'borderRadius')).toBe(4);
    expect(num(styleBody(TITLE, 'dossierRim'), 'borderWidth')).toBe(1);
    expect(num(styleBody(TITLE, 'dossierRim'), 'padding')).toBe(1);
    expect(prop(styleBody(TITLE, 'dossierRimOpen'), 'backgroundColor')).toBe('#443925');
    expect(prop(styleBody(TITLE, 'dossierRimDead'), 'backgroundColor')).toBe('#33201D');
    expect(num(styleBody(TITLE, 'dossierOuter'), 'marginVertical')).toBe(3);
    expect(num(styleBody(TITLE, 'dossierOuter'), 'shadowOpacity')).toBe(0.5);
    expect(num(styleBody(TITLE, 'dossierOuter'), 'shadowRadius')).toBe(6);
    expect(num(styleBody(TITLE, 'dossierOuterOpen'), 'shadowOpacity')).toBe(0.62);
    expect(num(styleBody(TITLE, 'dossierOuterOpen'), 'shadowRadius')).toBe(11);
  });

  test('3.4 ⚠ RELEASE RESTORES IT — the band is a mount, not a state the card keeps', () => {
    /* the only thing holding it on screen is `pressed`, so the same unmount that
     * ends the travel ends the housing; there is no animation, timer or stored
     * flag anywhere in it. */
    for (const { anchor } of RECORDS) {
      expect(recordHead(anchor)).toMatch(/:\s*null\}/);
    }
    expect(styleBody(TITLE, 'dossierPressEdge')).not.toMatch(/opacity|Animated|transform/);
  });

  test('3.5 the press itself is unchanged — same travel, same inversion, same two taps', () => {
    expect(TITLE_CODE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimPressed');
    expect(TITLE_CODE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimOpenPressed');
    expect(prop(styleBody(TITLE, 'dossierRimPressed'), 'borderTopColor')).toBe('#0D0E0E');
    expect(resolve(prop(styleBody(TITLE, 'dossierRimPressed'), 'borderBottomColor'))).toBe(T.rimAlloy);
    expect(prop(styleBody(TITLE, 'dossierRimOpenPressed'), 'borderBottomColor')).toBe('#B08F55');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1837 §4 — one authority, both records, every state', () => {
  test('4.1 ⚠ BOTH saved-character records take the repair', () => {
    for (const { anchor } of RECORDS) expect(recordHead(anchor)).toContain('styles.dossierPressEdge');
  });

  test('4.2 the selected record takes its own warm variant, the dead one its rust', () => {
    const open = recordHead(RECORDS[1].anchor);
    expect(open).toContain('styles.dossierPressEdgeOpen');
    for (const { anchor } of RECORDS) {
      expect(recordHead(anchor)).toContain('item.dead && styles.dossierPressEdgeDead');
    }
    // dead is declared after open in each array, exactly as the rim orders them
    expect(open.indexOf('dossierPressEdgeOpen')).toBeLessThan(open.indexOf('dossierPressEdgeDead'));
  });

  test('4.3 there is no second copy of this card anywhere — one file owns it', () => {
    const owners = fs.readdirSync(path.join(__dirname, '..', 'app', 'screens'))
      .concat(fs.readdirSync(path.join(__dirname, '..', 'app', 'components')))
      .filter((f) => f.endsWith('.tsx'));
    const declaring = owners.filter((f) => {
      const dir = fs.existsSync(path.join(__dirname, '..', 'app', 'screens', f)) ? 'screens' : 'components';
      return read(`app/${dir}/${f}`).includes('dossierRim: {');
    });
    expect(declaring).toEqual(['TitleScreen.tsx']);
  });

  test('4.4 and both records are still the same one swipeable row they were', () => {
    expect((TITLE_CODE.match(/<SwipeableRow /g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1837 §5 — every theme, and no platform branch', () => {
  test('5.1 ⚠ THE STRIP NO LONGER DEPENDS ON THE PLAYER\'S BACKGROUND AT ALL', () => {
    for (const { band } of STATES) {
      const b = styleBody(TITLE, band);
      expect(b).not.toMatch(/baseColorOf|display|useDisplaySettings|bgHue|bgLight/);
    }
    // and the band's own JSX takes no colour from anywhere
    for (const { anchor } of RECORDS) {
      expect(recordHead(anchor)).not.toMatch(/baseColorOf/);
    }
  });

  test('5.2 which matters, because the layer behind it really can be near-black', () => {
    /* OTA-1827's repair is kept and is still correct for the slab behind the
     * row — it simply was never able to reach the strip. The legal slider range
     * spans values a player can drive to 3% luminance, so "their background is
     * dark" was never an acceptable account of a missing edge. */
    expect(SWIPE).toMatch(/backgroundColor:\s*baseColorOf\(display\)/);
    const darkest = baseColorOf({ bgHue: 0, bgSat: 0, bgLight: 0.02, textureOpacity: 0, vignetteStrength: 1 });
    const lightest = baseColorOf({ bgHue: 0, bgSat: 0, bgLight: 0.30, textureOpacity: 0, vignetteStrength: 1 });
    expect(hexLuminance(darkest)).toBeLessThan(0.05);
    expect(hexLuminance(lightest)).toBeGreaterThan(hexLuminance(darkest));
  });

  test('5.3 ⚠ the housing is one constant per state, so every theme closes identically', () => {
    const sweep = [0, 24, 90, 180, 270, 359].flatMap((bgHue) =>
      [0, 0.5, 1].flatMap((bgSat) =>
        [0.02, 0.115, 0.3].map((bgLight) =>
          baseColorOf({ bgHue, bgSat, bgLight, textureOpacity: 0, vignetteStrength: 1 }))));
    expect(new Set(sweep).size).toBeGreaterThan(1);       // themes really do differ
    for (const { band } of STATES) {
      const fill = resolve(prop(styleBody(TITLE, band), 'backgroundColor'));
      expect(sweep.some((c) => c.toLowerCase() === String(fill).toLowerCase())).toBe(false);
    }
  });

  test('5.4 ⚠ NO PLATFORM BRANCH — the gap is cross-platform, only its contrast was not', () => {
    for (const { band } of STATES) expect(styleBody(TITLE, band)).not.toMatch(/Platform/);
    for (const { anchor } of RECORDS) expect(recordHead(anchor)).not.toMatch(/Platform/);
  });

  test('5.5 Android does not regress: nothing it renders today was taken away', () => {
    /* Android never had the shadow (`elevation` is deliberately absent) and had
     * the SAME geometry hole showing flat ground. It gains the housing and loses
     * nothing: no elevation is introduced, and no resting style moved. */
    expect(styleBody(TITLE, 'dossierOuter')).not.toMatch(/elevation/);
    expect(styleBody(TITLE, 'dossierOuterOpen')).not.toMatch(/elevation/);
    for (const { band } of STATES) expect(styleBody(TITLE, band)).not.toMatch(/elevation|shadow/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1837 §6 — the two stale sentences the exemption was reasoned from', () => {
  test('6.1 ⚠ neither comment still claims the travel rides the OUTER', () => {
    /* OTA-1822 moved it to the rim. Two present-tense sentences did not follow,
     * and they are why "the dossier is the authority" read as sound. */
    expect(TITLE).not.toMatch(/outer takes `controlPressed` for the travel/);
    expect(TITLE).not.toMatch(/travel comes from `kit\.controlPressed` on the OUTER/);
    expect(TITLE).not.toMatch(/material: the outer travels/);
  });

  test('6.2 and the correction is written down where the next pass will read it', () => {
    expect(TITLE).toMatch(/CORRECTED BY OTA-1837/);
    expect(TITLE).toMatch(/OTA-1837[\s\S]{0,4000}HOUSING/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1837 §7 — the guard-rails this repair must not have moved', () => {
  test('7.1 OTA-1827\'s surface repair is intact, and still opaque', () => {
    expect(styleBody(SWIPE, 'surface')).toMatch(/backgroundColor:/);
    expect(styleBody(SWIPE, 'deleteLayer')).toMatch(/backgroundColor:\s*'#5a2a26'/);
  });

  test('7.2 OTA-1826\'s cover-up is still backed out — the outer is still bare', () => {
    expect(TITLE).not.toMatch(/dossierOuterDead/);
    expect(styleBody(TITLE, 'dossierOuter')).not.toMatch(/backgroundColor/);
  });

  test('7.3 the two-tap load contract and the tap target are unchanged', () => {
    expect(TITLE_CODE).toContain('onPress={() => setExpandedSlotId(item.slotId)}');
    expect(TITLE_CODE).toContain('onPress={() => onSlotTap(item)}');
  });

  test('7.4 the record still wears no kit planes — the class fix is still not needed here', () => {
    for (const { anchor } of RECORDS) {
      expect(recordHead(anchor)).not.toMatch(/ctlPlanes|CTL_PLANES/);
    }
  });
});
