/* ⚠⚠⚠ OTA-1829 — THE TOP PIECE THAT DISAPPEARS, AND IT WAS THE WHOLE CLASS.
 *
 * Owner, with a repro a device can reproduce: the exploration row where STORE
 * sits beside FUSE CRUCIBLE, and the three-button STORE / TALK / GIFT row —
 * *"when you hit the store button the top of it disappears."*
 *
 * ⚠⚠ WHY OTA-1828 MISSED IT, WRITTEN DOWN SO THE NEXT CENSUS DOES NOT. That
 * pass censused BORDER PAIRS and pronounced 154 `ctl` controls correct. Every
 * one of those claims was true and none of them was sufficient, because the
 * visible top edge of a planed control is NOT its border — it is
 * `controlPlaneTop`, a 2dp absolutely-positioned band of `controlFaceLit`. The
 * defect lived one layer above where the census was looking.
 *
 * ⚠⚠ THE MECHANISM. Pressed, `controlPlaneTopPressed` painted that band with
 * `controlSidewall` — a two-thirds-opaque black — over a face already near
 * black. It composites to the face, so the band reads as ABSENT rather than
 * shaded. ~250 planed controls in 54 files, every screen.
 *
 * ⚠ AND THE ASYMMETRY THE OWNER ACTUALLY REPORTED: the character-selection
 * dossier wears NO planes at all. It inverts border colours only, so its top
 * edge is always drawn — which is precisely why that screen was the authority
 * and everything else looked broken beside it.
 *
 * ⚠ WHAT THIS SUITE CANNOT DO. It reads construction, not pixels. That the
 * pressed band READS on a real panel is the owner's eye on hardware.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

const TITLE = read('app/screens/TitleScreen.tsx');

/** parse an rgba()'s alpha; a hex or a name has no alpha and returns null. */
const alphaOf = (c: unknown): number | null => {
  const m = /rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/.exec(String(c));
  return m ? Number(m[4]) : null;
};
/** is this colour LIGHT (a catch of light) rather than a shadow? */
const isLight = (c: unknown) => {
  const m = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(c));
  if (!m) return false;
  return Number(m[1]) > 128 && Number(m[2]) > 128 && Number(m[3]) > 128;
};

describe('OTA-1829 §1 — the pressed top band is still a band', () => {
  test('1.1 ⚠ THE REPAIR: pressing does not paint the top plane with a shadow', () => {
    const c = flat(kit.controlPlaneTopPressed).backgroundColor;
    expect(c).toBeTruthy();
    // the defect was a near-opaque BLACK here, which on a dark face is absence
    expect(isLight(c)).toBe(true);
  });

  test('1.2 ⚠ it is DIMMER than at rest — the light moved, it did not switch off', () => {
    const rest = alphaOf(flat(kit.controlPlaneTop).backgroundColor);
    const down = alphaOf(flat(kit.controlPlaneTopPressed).backgroundColor);
    expect(rest).not.toBeNull();
    expect(down).not.toBeNull();
    expect(down as number).toBeLessThan(rest as number);
    expect(down as number).toBeGreaterThan(0);
  });

  test('1.3 ⚠ and the light it lost went to the BOTTOM, which is the press', () => {
    const bottomDown = flat(kit.controlPlaneBottomPressed).backgroundColor;
    expect(bottomDown).toBe(flat(kit.controlPlaneTop).backgroundColor);
    expect(isLight(bottomDown)).toBe(true);
  });

  test('1.4 no new material was minted — the pressed tone is an existing token', () => {
    // controlLit has dressed the inner sheen since VIS-1; this spends it again
    expect(flat(kit.controlPlaneTopPressed).backgroundColor).toBe('rgba(255,250,240,0.20)');
  });
});

describe('OTA-1829 §2 — every geometry cue Phase 2 bought is untouched', () => {
  test('2.1 the band still GROWS on press — the key still loses height', () => {
    expect(flat(kit.controlPlaneTop).height).toBe(2);
    expect(flat(kit.controlPlaneTopPressed).height).toBe(3);
  });

  test('2.2 the sidewall still collapses', () => {
    expect(flat(kit.controlPlaneBottom).height).toBe(4);
    expect(flat(kit.controlPlaneBottomPressed).height).toBe(1);
  });

  test('2.3 the planes still own NO layout — absolute, zero-size-impact', () => {
    for (const s of [kit.controlPlaneTop, kit.controlPlaneTopPressed,
      kit.controlPlaneBottom, kit.controlPlaneBottomPressed, kit.controlPlaneContact]) {
      expect(flat(s).position).toBe('absolute');
      expect(flat(s).margin).toBeUndefined();
      expect(flat(s).padding).toBeUndefined();
    }
  });

  test('2.4 ⚠ the press travel is unchanged at 3dp and still lives on the ring', () => {
    const down = flat(kit.controlPressed);
    expect((down.transform as { translateY?: number }[])?.[0]?.translateY).toBe(3);
    // and no plane carries travel of its own
    for (const s of [kit.controlPlaneTopPressed, kit.controlPlaneBottomPressed]) {
      expect(flat(s).transform).toBeUndefined();
    }
  });

  test('2.5 the RESTING planes are byte-for-byte what they were', () => {
    expect(flat(kit.controlPlaneTop).backgroundColor).toBe('rgba(255,250,240,0.38)');
    expect(flat(kit.controlPlaneBottom).backgroundColor).toBe('rgba(0,0,0,0.66)');
    expect(flat(kit.controlPlaneContact).backgroundColor).toBe('rgba(0,0,0,0.88)');
  });
});

describe('OTA-1829 §3 — the character-selection authority is untouched, and here is why', () => {
  test('3.1 ⚠⚠ THE DOSSIER WEARS NO PLANES — so this class fix does not reach it', () => {
    /* if a future pass ever gives the character record planes, it inherits this
     * whole class of behaviour and this suite should be re-derived.
     * ⚠⚠ AMENDED BY OTA-1837, AND THE ASSERTION IS UNCHANGED — only the reason
     * written beside it was wrong. This test used to be titled "that is why it
     * never had the defect", and the header above says the dossier's top edge
     * "is always drawn". True of the BORDER and false of the CARD: pressed, the
     * whole rim travels 3dp, so that border is drawn 3dp LOWER and nothing drew
     * what it left behind. The record had its own version of the same complaint
     * the entire time, and this sentence is why nobody looked. It still wears
     * no planes, which is all this test ever actually proved. */
    const seg = (anchor: string) => {
      const i = TITLE.indexOf(anchor);
      return i < 0 ? '' : TITLE.slice(i, i + 2600);
    };
    for (const a of ['styles.dossierOuter, !bootGateOpen', 'styles.dossierOuter, styles.dossierOuterOpen']) {
      expect(seg(a)).toBeTruthy();
      expect(seg(a)).not.toMatch(/ctlPlanes|CTL_PLANES|controlPlaneTop/);
    }
  });

  test('3.2 the dossier still expresses its press as a border inversion', () => {
    expect(TITLE).toMatch(/dossierRimPressed:\s*\{[^}]*borderTopColor/);
    expect(TITLE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimPressed');
  });
});
