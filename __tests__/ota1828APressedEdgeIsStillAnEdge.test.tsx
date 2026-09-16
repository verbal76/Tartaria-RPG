/* ⚠⚠⚠ OTA-1828 — A PRESSED EDGE IS STILL AN EDGE.
 *
 * Owner: some buttons depress correctly; others "break" at the top edge when
 * pressed — *"idle state has a colored top edge… when pressed the top edge
 * disappears completely; the top outline becomes absent rather than changing to
 * a pressed-state color… the button therefore looks visually broken/open at the
 * top."* The CHARACTER SELECTION screen is the declared visual authority.
 *
 * ⚠⚠ THE AUTHORITY, READ FROM SOURCE. `dossierRim` carries an asymmetric pair —
 * `rimAlloy` above, `#0D0E0E` below — and `dossierRimPressed` SWAPS them. The
 * edge never disappears and the width never changes; the LIGHT MOVES. Its gold
 * variant proves the accent rule too: `dossierRimOpenPressed` does not go to
 * black, it goes to `#1E170F` — a warm dark still inside the gold family — and
 * returns the gold to the bottom.
 *
 * ⚠⚠ THE CENSUS, and it is why this repair is three call sites and not thirty.
 * 159 press sites apply `controlPressed`; 154 of them ride on `kit.ctl`, which
 * already supplies the directional pair at rest, so inverting it is the intended
 * language and they were CORRECT before this OTA and are untouched by it. The
 * defect is the handful that invert an edge they never had, or never invert one
 * they do.
 *
 * ⚠ WHAT THIS SUITE CANNOT DO. It reads construction, not pixels. That the
 * pressed edge is VISIBLE on a real panel is the owner's eye on hardware.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** comments stripped — a scan that fires on the ⚠ block EXPLAINING a defect
 *  teaches the next author to delete the explanation. */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const KIT = read('app/ui/tartariaKit.tsx');
const TITLE = read('app/screens/TitleScreen.tsx');
const CONTRACTS_CODE = strip(read('app/screens/ContractsScreen.tsx'));
const INVENTORY_CODE = strip(read('app/screens/InventoryScreen.tsx'));
const KIT_CODE = strip(KIT);

const blockOf = (src: string, name: string) =>
  new RegExp(`${name}:\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '';
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

describe('OTA-1828 §1 — the authority is unchanged and still says "the light moves"', () => {
  test('1.1 ⚠ the character-selection rim still inverts its own pair', () => {
    expect(blockOf(TITLE, 'dossierRimPressed')).toMatch(/borderTopColor:\s*'#0D0E0E'/);
    expect(blockOf(TITLE, 'dossierRimPressed')).toMatch(/borderBottomColor:\s*T\.rimAlloy/);
  });

  test('1.2 ⚠ its GOLD variant presses into its own family, never to black', () => {
    const o = blockOf(TITLE, 'dossierRimOpenPressed');
    expect(o).toMatch(/borderTopColor:\s*'#1E170F'/);
    expect(o).toMatch(/borderBottomColor:\s*'#B08F55'/);
  });

  test('1.3 ⚠ the reference press motion is untouched at 3dp', () => {
    const down = flat(kit.controlPressed);
    expect((down.transform as { translateY?: number }[])?.[0]?.translateY).toBe(3);
  });

  test('1.4 ⚠ no pressed style anywhere removes an edge instead of recolouring it', () => {
    // width is structure; a pressed style may move light but never delete a side
    for (const n of ['controlPressed', 'goldEdgePressed', 'btnRimPressed',
      'btnRimPrimaryPressed', 'btnRimDestructivePressed', 'btnFacePressed']) {
      const b = blockOf(KIT, n);
      expect(b).not.toMatch(/borderTopWidth/);
      expect(b).not.toMatch(/borderWidth/);
      expect(b).not.toMatch(/borderTopColor:\s*'transparent'/);
    }
  });
});

describe('OTA-1828 §2 — the accent families keep an edge when pressed', () => {
  test('2.1 ⚠ THE REPAIR: a gold pressed edge exists and is a real colour', () => {
    const t = flat(kit.goldEdgePressed).borderTopColor;
    expect(typeof t).toBe('string');
    expect(t).not.toBe('transparent');
    // and it is DARKER than resting gold, so it reads as pressed, not as absent
    expect(t).not.toBe(flat(kit.filledGold).borderColor);
  });

  test('2.2 ⚠ the missions PRIMARY OBJECTIVE card takes it, after the shared press', () => {
    // order matters: controlPressed carries the travel, this overrides the top
    expect(CONTRACTS_CODE).toMatch(
      /styles\.mainQuestCard,\s*pressed && kit\.controlPressed,\s*pressed && kit\.goldEdgePressed/,
    );
  });

  test('2.3 the card\'s IDLE identity is untouched — same gold, same width', () => {
    const c = blockOf(CONTRACTS_CODE, 'mainQuestCard');
    expect(c).toMatch(/borderColor:\s*'#c9a86a'/);
    expect(c).toMatch(/borderWidth:\s*1\.5/);
    expect(c).toMatch(/backgroundColor:\s*'#13110f'/);
  });

  /* ⚠⚠ THIS PAIR EXISTS BECAUSE THE NEGATIVE CONTROL CAUGHT ME. 2.4 below
   * asserts the rim's pressed STYLES relate correctly to its resting ones — and
   * deleting the three lines that APPLY them in `TButton` left it green, because
   * a well-formed style nobody reaches is still a well-formed style. A style
   * that is never applied cannot repair anything, so the application is pinned
   * separately from the values. */
  test('2.4a ⚠ THE REPAIR IS REACHED: TButton actually applies the rim pressed styles', () => {
    const KIT_ONLY = strip(KIT);
    expect(KIT_ONLY).toMatch(/pressed && kit\.btnRimPressed/);
    expect(KIT_ONLY).toMatch(/pressed && primary && kit\.btnRimPrimaryPressed/);
    expect(KIT_ONLY).toMatch(/pressed && destructive && kit\.btnRimDestructivePressed/);
    // and `lift` still lands last, so the travel is not reordered under them
    expect(/btnRimDestructivePressed,\s*\n\s*lift\]/.test(KIT_ONLY)).toBe(true);
  });

  test('2.4 ⚠ TButton\'s rim now answers the finger in each variant\'s own family', () => {
    expect(flat(kit.btnRimPrimaryPressed).borderBottomColor).toBe(flat(kit.btnRimPrimary).borderTopColor);
    expect(flat(kit.btnRimPressed).borderBottomColor).toBe(flat(kit.btnRim).borderTopColor);
    expect(flat(kit.btnRimDestructivePressed).borderBottomColor)
      .toBe(flat(kit.btnRimDestructive).borderTopColor);
  });

  test('2.5 …and the rim\'s resting appearance is unchanged', () => {
    expect(flat(kit.btnRimPrimary).borderTopColor).toBe('#C9A86A');
    expect(flat(kit.btnRim).borderTopColor).toBe('rgba(140,146,150,0.55)');
  });

  test('2.6 the rim pressed styles carry NO travel — the 1.5dp lift stays on `lift`', () => {
    for (const s of [kit.btnRimPressed, kit.btnRimPrimaryPressed, kit.btnRimDestructivePressed]) {
      expect(flat(s).transform).toBeUndefined();
    }
  });
});

/* ⚠⚠⚠ §3 PINS A DECISION, NOT A REPAIR — AND THE RATCHET IS WHY.
 *
 * The gift banner is the one `kit.ctl` control whose press does not invert its
 * directional pair. Adding `controlPressed` here WAS written, and OTA-1806's
 * census failed it as B-PARTIAL: the control renders `CTL_PLANES` as a CONSTANT,
 * so the travel arrived while the sidewall stayed frozen at resting height — a
 * key that moves and never loses height, which is a NEW defect, not a repair.
 *
 * ⚠ So it is reverted and recorded. Completing it means restructuring the
 * control's children into a `({ pressed }) => …` render prop, which is the class
 * OTA-1806 governs. This suite therefore pins that the control stays WHOLE —
 * neither silently half-fixed nor quietly stripped.
 */
describe('OTA-1828 §3 — the gift banner is found, named, and left whole', () => {
  test('3.1 ⚠ it does NOT travel — a half-fix here is the B-PARTIAL defect', () => {
    const arr = /\[kit\.ctl, styles\.giftModeBar[^\]]*\]/.exec(INVENTORY_CODE)?.[0] ?? '';
    expect(arr).toBeTruthy();
    expect(arr).not.toMatch(/controlPressed/);
  });

  test('3.2 ⚠ its existing fade is KEPT — no press feedback was removed', () => {
    expect(INVENTORY_CODE).toMatch(/styles\.giftModeBar,\s*pressed && \{ opacity: 0\.7 \}/);
  });

  test('3.3 its idle accent is untouched', () => {
    expect(blockOf(INVENTORY_CODE, 'giftModeBar')).toMatch(/borderColor:\s*'#9ec96a'/);
  });

  test('3.4 the finding is written down where the next author will stand', () => {
    // the ⚠ block survives comment-stripping only in the raw file, by design
    expect(read('app/screens/InventoryScreen.tsx')).toMatch(/OTA-1828 FOUND THIS AND DELIBERATELY LEFT IT/);
  });
});

describe('OTA-1828 §4 — the 154 correct controls were not disturbed', () => {
  test('4.1 `ctl` still carries the directional pair at rest', () => {
    expect(flat(kit.ctl).borderTopColor).toBe('rgba(255,250,240,0.50)');
    expect(flat(kit.ctl).borderBottomColor).toBe('rgba(0,0,0,0.75)');
  });

  test('4.2 `controlPressed` still inverts exactly that pair', () => {
    expect(flat(kit.controlPressed).borderTopColor).toBe(flat(kit.ctl).borderBottomColor);
    expect(flat(kit.controlPressed).borderBottomColor).toBe(flat(kit.ctl).borderTopColor);
  });

  test('4.3 ⚠ the census holds: every controlPressed site still rides `ctl`, bar the named few', () => {
    /* if this number moves, a new control has joined the family without the
     * directional pair — which is exactly the defect this OTA repaired. */
    const sites = [...KIT_CODE.matchAll(/controlPressed/g)];
    expect(sites.length).toBeGreaterThan(0);
    // the kit never applies controlPressed to a bare accent outline itself
    expect(KIT_CODE).not.toMatch(/borderColor:\s*T\.gold[^]{0,80}controlPressed/);
  });
});
