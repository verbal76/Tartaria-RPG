/* ⚠⚠⚠ OTA-1827 — THE BLACK RECTANGLE WAS A HARDCODED COLOUR, AND OTA-1826
 * NAMED THE WRONG SOURCE.
 *
 * Owner, on the Pixel and earlier on Apple: pressing a character choice exposes
 * a BLACK RECTANGLE along the record's TOP edge for as long as the finger is
 * down. The depressed travel is intended; the black is not.
 *
 * ⚠⚠ THE CORRECTION, STATED BEFORE THE REPAIR. OTA-1826 diagnosed this as the
 * app backdrop plus the iOS drop shadow showing through a transparent
 * `dossierOuter`, and covered it by painting that view with the card's own
 * material. The GEOMETRY in that diagnosis was right — `dossierRim` travels
 * 3dp down and uncovers 3dp of whatever is behind it — but the SOURCE was
 * wrong, and so the repair was a cover-up of a symptom.
 *
 * What is actually behind every record is `SwipeableRow`'s sliding surface, and
 * it was painted a hardcoded `#0a0908`. That is the black. It is not the
 * backdrop, not the shadow, and not platform-dependent — which is exactly why
 * the owner saw it on Android, where `elevation` is deliberately absent and no
 * shadow exists at all. OTA-1826's cover has been backed out; `dossierOuter`
 * is transparent again and OTA-1822's §5 pins stand unamended.
 *
 * ⚠ THE SURFACE HAS TO BE OPAQUE — it slides sideways over `deleteLayer` and
 * must hide it — but it never had to be near-black. It now takes the colour the
 * PLAYER CHOSE, from the Display settings' background sliders. Owner ruling
 * 2026-09-16: "it should be the same color as whatever they chose for the
 * background."
 *
 * ⚠⚠ WHAT THIS SUITE CANNOT DO. It reads construction, not pixels. No device,
 * no simulator, no screenshot here — that the black rectangle is GONE, and that
 * the milestone cells now read as buttons, is the owner's eye on hardware.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';
import { baseColorOf, type DisplaySettings } from '../app/ui/displaySettings';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** code with comments stripped — a scan that fires on the ⚠ block explaining a
 *  defect teaches the next author to delete the explanation. */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const SWIPE = read('app/components/SwipeableRow.tsx');
const SWIPE_CODE = strip(SWIPE);
const TITLE = read('app/screens/TitleScreen.tsx');
const CONTRACTS = read('app/screens/ContractsScreen.tsx');

const blockOf = (src: string, name: string) =>
  new RegExp(`${name}:\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '';

describe('OTA-1827 §1 — the black rectangle is named, and it is a colour', () => {
  test('1.1 ⚠ THE REPAIR: the sliding surface takes the player\'s chosen background', () => {
    expect(SWIPE_CODE).toMatch(/backgroundColor:\s*baseColorOf\(display\)/);
    expect(SWIPE_CODE).toMatch(/useDisplaySettings\(\)/);
  });

  test('1.2 that colour really is the player\'s three background sliders', () => {
    /* ⚠ bgSat and bgLight are FRACTIONS (0..1 and 0.02..0.30), not percentages —
     * hslToHex is written for that range and a percentage overflows a channel
     * past two hex digits. Feed it what the sliders actually store. */
    const mk = (h: number, s: number, l: number) =>
      baseColorOf({ bgHue: h, bgSat: s, bgLight: l } as unknown as DisplaySettings);
    // it varies with what they chose — not a constant dressed up as a lookup
    expect(mk(30, 0.2, 0.12)).not.toBe(mk(30, 0.2, 0.28));
    expect(mk(200, 0.2, 0.12)).not.toBe(mk(30, 0.2, 0.12));
    // and it is a colour a style can actually take
    expect(mk(30, 0.2, 0.12)).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('1.3 ⚠ the surface is still OPAQUE — it must hide the delete layer', () => {
    // a fallback fill remains, so a failed settings read can never reveal it
    expect(blockOf(SWIPE, 'surface')).toMatch(/backgroundColor:/);
  });

  test('1.4 the delete layer itself is untouched', () => {
    expect(blockOf(SWIPE, 'deleteLayer')).toMatch(/backgroundColor:\s*'#5a2a26'/);
    expect(blockOf(SWIPE, 'deleteLayer')).toMatch(/position:\s*'absolute'/);
  });
});

describe('OTA-1827 §2 — OTA-1826\'s cover-up is backed out, its geometry kept', () => {
  test('2.1 dossierOuter paints nothing again — the shadow-caster is bare', () => {
    const o = blockOf(TITLE, 'dossierOuter');
    expect(o).not.toMatch(/backgroundColor:/);
    expect(o).not.toMatch(/borderWidth:/);
    expect(o).toMatch(/shadowColor:\s*'#000'/);
  });

  test('2.2 the invented dead-outer variant is gone', () => {
    expect(TITLE).not.toMatch(/dossierOuterDead/);
  });

  test('2.3 ⚠ the press the owner asked to keep is untouched, exactly as before', () => {
    const down = StyleSheet.flatten(kit.controlPressed) as {
      transform?: { translateY?: number }[];
    };
    expect(down.transform?.[0]?.translateY).toBe(3);
    // and it still rides the rim, never the shadow-caster (OTA-1822 §5 holds)
    expect(TITLE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimPressed');
    expect(TITLE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimOpenPressed');
  });

  test('2.4 both character records still sit inside a SwipeableRow, so both are fixed', () => {
    const rows = [...TITLE.matchAll(/<SwipeableRow/g)];
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe('OTA-1827 §3 — the milestone cells read as buttons', () => {
  test('3.1 ⚠ THE REPAIR: the row separates its cells', () => {
    expect(blockOf(CONTRACTS, 'milestoneRow')).toMatch(/gap:\s*6/);
  });

  test('3.2 "just a bit" — the separation is small and bounded', () => {
    const gap = Number(/gap:\s*(\d+)/.exec(blockOf(CONTRACTS, 'milestoneRow'))?.[1]);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(8);
  });

  test('3.3 the panel around them is unchanged', () => {
    const r = blockOf(CONTRACTS, 'milestoneRow');
    expect(r).toMatch(/backgroundColor:\s*'#13110f'/);
    expect(r).toMatch(/borderColor:\s*'#3a342c'/);
    expect(r).toMatch(/borderRadius:\s*4/);
    expect(r).toMatch(/padding:\s*10/);
    expect(r).toMatch(/flexDirection:\s*'row'/);
  });

  test('3.4 ⚠ the CELLS are untouched — separation is the row\'s to give', () => {
    const c = blockOf(CONTRACTS, 'cell');
    expect(c).toMatch(/flex:\s*1/);
    expect(c).toMatch(/paddingVertical:\s*4/);
    expect(c).toMatch(/borderRadius:\s*4/);
    expect(c).toMatch(/borderWidth:\s*1/);
    expect(c).not.toMatch(/margin/);
  });

  test('3.5 they are still four buttons that still press and still expand', () => {
    expect([...CONTRACTS.matchAll(/<MilestoneStat/g)]).toHaveLength(4);
    expect(CONTRACTS).toMatch(/pressed && kit\.controlPressed/);
  });
});
