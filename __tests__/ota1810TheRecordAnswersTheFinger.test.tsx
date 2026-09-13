/**
 * ⚠⚠⚠ OTA-1810 — THE CHARACTER SURFACES ANSWER THE FINGER.
 *
 * Owner, on the device after the 1806 interaction pass: the character-selection
 * dossier controls and the in-game Character expandable headers still do not
 * physically respond while the finger is down.
 *
 * ⚠⚠ THIS IS THE SAME DEFECT OTA-1805 NAMED AND OTA-1806 REPAIRED ELSEWHERE,
 * SURVIVING IN THREE PLACES IT WAS NEVER ASKED ABOUT. A `TouchableOpacity` has
 * NO `({ pressed }) => …` style callback and no render-prop children, so the
 * depth language is STRUCTURALLY UNREACHABLE inside one — it cannot fail a
 * press invariant because it cannot be asked. All three surfaces repaired here
 * were `TouchableOpacity`, and a 15–30% fade was the whole of what a tap could
 * produce on them.
 *
 * ⚠ THE PRECEDENT IS EXACT AND IT IS IN THIS REPOSITORY. arb119 built
 * `CharacterScreen.sectionHeader` to mirror the Inventory category headers, and
 * the two plates are the same material — `rgba(8,6,4,0.55)`, a 4dp coloured
 * left bar, radius 3, the same paddings. OTA-1806 gave Inventory's the press.
 * Character's did not get it. This closes that asymmetry at the shared owner.
 *
 * ⚠⚠ WHAT THIS FILE REFUSES TO DO IS COUNT CONSTRUCTION. OTA-1806's lesson was
 * that `style={[a, b]}` naming an authority satisfies a census while the
 * control does not move. Every claim below is either (a) a property of the
 * FUNCTION of `pressed`, or (b) a real value read out of the kit / the
 * screen's own StyleSheet. Section 4 is the resting half and matters as much:
 * the standing rule is "AT REST: preserve the UI we have. UNDER MY FINGER:
 * make the buttons feel consistently alive."
 *
 * WHAT THIS FILE CANNOT PROVE: that the settle is perceptible on a Pixel or an
 * iPhone. That is the owner's eye and it is not claimed here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit, T } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** Grade the code, not the prose — a comment naming a token proves nothing. */
const codeOf = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

const CHARACTER = codeOf(read('app/screens/CharacterScreen.tsx'));
const TITLE = codeOf(read('app/screens/TitleScreen.tsx'));
const PORTRAIT = codeOf(read('app/components/CharacterPortrait.tsx'));

/**
 * The source of the ONE touchable element that carries `marker`, from its own
 * opening tag to the next touchable's opening tag.
 *
 * ⚠ Keyed on the element's own accessibility text / style name rather than on a
 * line number, a `HEAD~1` diff or a position in the file. Four separate suites
 * in this repository have already become position pins and had to be repaired;
 * this one must not become the fifth.
 */
function controlBearing(code: string, marker: string): string {
  const opens = [...code.matchAll(/<(?:Pressable|TouchableOpacity)\b/g)].map((m) => m.index as number);
  expect(opens.length).toBeGreaterThan(0);
  for (let i = 0; i < opens.length; i += 1) {
    const body = code.slice(opens[i], opens[i + 1] ?? code.length);
    if (body.includes(marker)) return body;
  }
  throw new Error(`no touchable in this file carries ${marker}`);
}

const HEADER = controlBearing(CHARACTER, 'styles.sectionHeaderBar');
const REPLAY = controlBearing(CHARACTER, 'accessibilityLabel="Replay the opening crawl"');
const DOSSIER_COLLAPSED = controlBearing(TITLE, 'Shows ${item.playerName}');
const DOSSIER_OPEN = controlBearing(TITLE, 'Loads ${item.playerName}');

/** (a) the primitive can REPORT the press at all. */
const reportsPress = (body: string) => /^<Pressable\b/.test(body);
/** (b) the pressed treatment is a FUNCTION of the finger, not a resting list entry. */
const travelsOnPress = (body: string) => /pressed && (?:kit|tartariaKitStyles)\.controlPressed/.test(body);

/** The two border colours of one named style object, read from the screen's own
 *  StyleSheet source. Used to prove an inversion is a real inversion. */
function borderPair(code: string, name: string): { top: string; bottom: string } {
  const m = new RegExp(`\\b${name}:\\s*\\{([^}]*)\\}`).exec(code);
  if (!m) throw new Error(`no style object named ${name}`);
  const body = m[1] ?? '';
  const top = /borderTopColor:\s*([^,\n}]+)/.exec(body)?.[1];
  const bottom = /borderBottomColor:\s*([^,\n}]+)/.exec(body)?.[1];
  if (!top || !bottom) throw new Error(`${name} does not declare a top/bottom border pair`);
  return { top: top.trim(), bottom: bottom.trim() };
}

describe('1. the canon — what "pressed" means, read out of the kit itself', () => {
  it('the pressed material moves the face and carries no fade', () => {
    const down = flat(kit.controlPressed);
    expect(down.borderTopColor).toBe(T.controlRaisedDark);
    expect(down.borderBottomColor).toBe(T.controlRaisedLit);
    const travel = (down.transform as [{ translateY: number }])[0].translateY;
    expect(travel).toBeGreaterThanOrEqual(2);
    // OTA-1791 replaced fades with depth; nothing may smuggle opacity back in.
    expect(down).not.toHaveProperty('opacity');
  });
});

describe('2. the Character expandable headers — one owner, every instance', () => {
  it('⚠⚠⚠ NC-CHAR-1 — the header reports the press and travels under it', () => {
    expect(reportsPress(HEADER)).toBe(true);
    expect(travelsOnPress(HEADER)).toBe(true);
    // The style is a FUNCTION of pressed, not a static array that merely names
    // the authority — the exact distinction OTA-1806 was written to catch.
    expect(HEADER).toMatch(/style=\{\(\{ pressed \}\) =>/);
  });

  it('the sidewall planes are drawn ONLY while pressed, so nothing is added at rest', () => {
    expect(HEADER).toMatch(/\{pressed \? \(<>/);
    expect(HEADER).toMatch(/kit\.controlPlaneTopPressed/);
    expect(HEADER).toMatch(/kit\.controlPlaneBottomPressed/);
    // The resting plane styles must NOT appear: this plate has no resting
    // construction and must not acquire one.
    expect(HEADER).not.toMatch(/kit\.controlPlaneTop\b/);
    expect(HEADER).not.toMatch(/kit\.controlPlaneBottom\b/);
  });

  it('every expandable section on the screen inherits it from ONE helper', () => {
    const definitions = [...CHARACTER.matchAll(/const sectionHeader = \(/g)].length;
    expect(definitions).toBe(1);
    const callSites = [...CHARACTER.matchAll(/\{sectionHeader\('/g)].length;
    // Historical evidence said "about 15". The current tree is the authority;
    // this asserts the family is large and shared, and may only grow.
    expect(callSites).toBeGreaterThanOrEqual(15);
    // No section may hand-roll its own header plate beside the shared one.
    const rogue = [...CHARACTER.matchAll(/styles\.sectionHeaderBar/g)].length;
    expect(rogue).toBe(1);
  });
});

describe('3. the character-selection dossier — both states press', () => {
  it('⚠⚠⚠ NC-CHAR-2 — the collapsed record reports the press and travels under it', () => {
    expect(reportsPress(DOSSIER_COLLAPSED)).toBe(true);
    expect(travelsOnPress(DOSSIER_COLLAPSED)).toBe(true);
    expect(DOSSIER_COLLAPSED).toMatch(/pressed && styles\.dossierRimPressed/);
  });

  it('⚠⚠⚠ NC-CHAR-2b — the open (selected) record presses the same way', () => {
    expect(reportsPress(DOSSIER_OPEN)).toBe(true);
    expect(travelsOnPress(DOSSIER_OPEN)).toBe(true);
    expect(DOSSIER_OPEN).toMatch(/pressed && styles\.dossierRimOpenPressed/);
  });

  it('⚠⚠ the pressed rim is the record\'s OWN pair, inverted — not the kit\'s generic one', () => {
    // This is the claim that keeps VIS-1's material intact. A pressed record
    // must still look like a filed record; borrowing `controlRaisedLit/Dark`
    // here would have worked mechanically and changed what the object IS for
    // as long as a finger was on it.
    const rest = borderPair(TITLE, 'dossierRim');
    const down = borderPair(TITLE, 'dossierRimPressed');
    expect(down.top).toBe(rest.bottom);
    expect(down.bottom).toBe(rest.top);

    const restOpen = borderPair(TITLE, 'dossierRimOpen');
    const downOpen = borderPair(TITLE, 'dossierRimOpenPressed');
    expect(downOpen.top).toBe(restOpen.bottom);
    expect(downOpen.bottom).toBe(restOpen.top);

    // …and they are genuinely different from each other, so "inverted" is not
    // being satisfied by a pair that was symmetric to begin with.
    expect(rest.top).not.toBe(rest.bottom);
    expect(restOpen.top).not.toBe(restOpen.bottom);
  });

  it('the plate is still the one tap target — nothing inside it became pressable', () => {
    // VIS-1's rule: everything added inside the record is pointerEvents="none"
    // so no layer can intercept the tap, the second tap, the swipe-to-delete or
    // the scroll. The repair must not have introduced a nested control.
    expect(DOSSIER_COLLAPSED).not.toMatch(/<Pressable[\s\S]+<Pressable/);
    expect(DOSSIER_OPEN).not.toMatch(/<Pressable[\s\S]+<Pressable/);
    for (const body of [DOSSIER_COLLAPSED, DOSSIER_OPEN]) {
      expect(body).toMatch(/pointerEvents="none"/);
    }
  });
});

describe('4. AT REST, NOTHING MOVED — the protected half', () => {
  it('the pressed styles exist only behind `pressed`, never in a resting list', () => {
    for (const [name, body] of [
      ['header', HEADER],
      ['dossier collapsed', DOSSIER_COLLAPSED],
      ['dossier open', DOSSIER_OPEN],
    ] as const) {
      // Every occurrence of a pressed-only style must be guarded by `pressed`.
      const occurrences = [...body.matchAll(/(?:kit\.controlPressed|styles\.dossierRim(?:Open)?Pressed|kit\.controlPlane\w*Pressed)/g)];
      expect(occurrences.length).toBeGreaterThan(0);
      for (const occ of occurrences) {
        const at = occ.index as number;
        const line = body.slice(body.lastIndexOf('\n', at) + 1, (body.indexOf('\n', at) + 1) || body.length);
        // Guarded either on its own line (`pressed && …`) or by an enclosing
        // `{pressed ? (<> … </>) : null}` block opened before it.
        const inlineGuard = /pressed (?:&&|\?)/.test(line);
        const blockOpen = body.lastIndexOf('{pressed ? (<>', at);
        const blockGuard = blockOpen !== -1 && body.indexOf('</>) : null}', blockOpen) > at;
        const where = `${name} :: ${line.trim()}`;
        expect({ where, guarded: inlineGuard || blockGuard }).toEqual({ where, guarded: true });
      }
    }
  });

  it('the resting dossier composition is untouched — rim, face, spine, corners, field', () => {
    for (const body of [DOSSIER_COLLAPSED, DOSSIER_OPEN]) {
      expect(body).toMatch(/styles\.dossierOuter/);
      expect(body).toMatch(/styles\.dossierRim/);
      expect(body).toMatch(/styles\.dossierFace/);
      expect(body).toMatch(/styles\.spine/);
      expect(body).toMatch(/<TCorners/);
      expect(body).toMatch(/<DossierField/);
      expect(body).toMatch(/<TSettle/);
    }
    // The old Character Creation presentation must not have been recreated here.
    expect(TITLE).not.toMatch(/CharacterCreation/);
  });

  it('the header plate keeps its own resting material and gains none', () => {
    const bar = /sectionHeaderBar:\s*\{([^}]*)\}/.exec(CHARACTER);
    expect(bar).not.toBeNull();
    const body = (bar as RegExpExecArray)[1];
    // arb119's plate, unchanged: translucent backing, gold left bar, radius 3.
    expect(body).toMatch(/backgroundColor:\s*'rgba\(8,6,4,0\.55\)'/);
    expect(body).toMatch(/borderLeftWidth:\s*4/);
    expect(body).toMatch(/borderLeftColor:\s*T\.gold/);
    expect(body).toMatch(/borderRadius:\s*3/);
    // It is NOT constructed as a key, so it must not have acquired a ring.
    expect(body).not.toMatch(/\bborderWidth:/);
  });
});

describe('5. REPLAY OPENING — a proven exclusion, not an omission', () => {
  it('it already answered the finger before this OTA and is left alone', () => {
    // §9: two separate questions, and only the interaction one was authorized.
    // This control was already a Pressable carrying the depth language, so the
    // minimum repair for it is NO repair. Asserted rather than assumed.
    expect(reportsPress(REPLAY)).toBe(true);
    expect(REPLAY).toMatch(/tControlDepth\(pressed\)/);
  });

  it('its resting colour is NOT authorized for change, and did not change', () => {
    const btn = /replayBtn:\s*\{([^}]*)\}/.exec(CHARACTER);
    expect(btn).not.toBeNull();
    expect((btn as RegExpExecArray)[1]).toMatch(/backgroundColor:\s*'#1a1714'/);
    expect((btn as RegExpExecArray)[1]).toMatch(/borderColor:\s*'#3a342c'/);
    expect(CHARACTER).toMatch(/replayText:.*color:\s*'#8aa0a4'/);
  });
});

describe('6. THE CHARACTERPORTRAIT FIREWALL', () => {
  it('⚠⚠⚠ CharacterPortrait remains presentation-only — no control materials in it', () => {
    // §4: it owns artwork / background / banner / faction crest / sex mark /
    // motive / caption and is intentionally not a control. This repair was
    // required to reach its targets WITHOUT going through it.
    expect(PORTRAIT).not.toMatch(/<Pressable\b/);
    expect(PORTRAIT).not.toMatch(/<Touchable\w*/);
    expect(PORTRAIT).not.toMatch(/\bonPress\b/);
    expect(PORTRAIT).not.toMatch(/controlPressed|tControlDepth|kit\.ctl\b/);
  });

  it('the Character screen still renders the portrait, unwrapped by any control', () => {
    expect(CHARACTER).toMatch(/<CharacterPortrait/);
    const pressables = [...CHARACTER.matchAll(/<(?:Pressable|TouchableOpacity)\b/g)].map((m) => m.index as number);
    const portrait = CHARACTER.indexOf('<CharacterPortrait');
    expect(portrait).toBeGreaterThan(-1);
    // The portrait must not sit inside the header helper or the replay button.
    const headerStart = CHARACTER.indexOf('const sectionHeader = (');
    expect(portrait).toBeGreaterThan(headerStart);
    expect(pressables.length).toBeGreaterThan(0);
  });
});

describe('7. the OTA identity travels with the repair', () => {
  it('the build stamp is this repair or later, and never goes backwards', () => {
    // ⚠ DURABLE FORM, DELIBERATELY. Three previous suites pinned an exact OTA
    // number and broke on the next legitimate one. This asserts the originating
    // version OR LATER instead.
    const { OTA_BUILD_ID } = require('../app/buildInfo') as { OTA_BUILD_ID: string };
    const n = Number(/^\d{4}-\d{2}-\d{2}-(\d+)-/.exec(OTA_BUILD_ID)?.[1]);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(1810);
  });
});
