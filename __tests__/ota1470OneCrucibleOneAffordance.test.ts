/**
 * OTA-1470 — ONE CRUCIBLE, ONE AFFORDANCE, FROM THE FIRST MOMENT.
 *
 * ⚠⚠⚠ THE OWNER, TYPED INTO THE GAME 2026-08-24:
 *
 *   "so when I first went to ovik's shop inside there was the fuse screen we
 *    were looking for, so I hit cancel and went out to come back in for a screen
 *    shot, but when I backed out it put the store chip and the fuse chip on the
 *    same line like we had decided before. it's only the initial time i enter
 *    that I see the messed up fuse block. it's not that it's broken, it just
 *    shouldn't be there, it should be a separate chip from the start."
 *
 * ⚠⚠ WHAT HE WAS SEEING WAS TWO DIFFERENT PIECES OF UI FOR ONE CRUCIBLE, and
 * which one he got depended on whether he had already paid:
 *
 *   before 25 TC   a full-width CRUCIBLE button inside the vendor screen
 *   after  25 TC   `fusionPending` flips → a chip on the tile, beside the store
 *
 * Same Crucible, same tap, two completely different affordances swapping under
 * him mid-session. He is not describing a layout preference; he is describing
 * the game changing shape for no reason he can see.
 *
 * ⚠ arb153 was RIGHT that the two must never both show — that was the
 * duplication it removed. It picked the wrong survivor. The chip composes: it
 * lives in `placeChipRow`, which wraps two-across, which is the layout he asks
 * for by name. So the chip wins and the button goes.
 */
import { BUILDINGS } from '../app/engine/buildings';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const EXPL = codeOnly(read('app', 'screens', 'ExplorationScreen.tsx'));
const VENDOR = codeOnly(read('app', 'screens', 'VendorScreen.tsx'));

/** The Crucible chip block, bounded by its own landmarks. */
const chipBody = (): string => {
  const a = EXPL.indexOf('const atLocationCrucible');
  expect(a).toBeGreaterThan(-1);
  const b = EXPL.indexOf('Dismiss Fusing Crucible', a);
  expect(b).toBeGreaterThan(a);
  return EXPL.slice(a, b);
};

describe('OTA-1470 — the block is gone from the vendor screen', () => {
  it('⚠⚠⚠ NO FULL-WIDTH CRUCIBLE BUTTON REMAINS', () => {
    // The "messed up fuse block". Its work moved to the chip.
    expect(VENDOR).not.toContain('USE CRUCIBLE');
    expect(VENDOR).not.toContain('styles.crucibleBtn');
  });

  it('⚠⚠ …and the screen no longer subscribes to the action it cannot fire', () => {
    // A dead selector is a needless re-render subscription and a lie about what
    // this component does.
    expect(VENDOR).not.toContain('useGameStore((s) => s.useVendorCrucible)');
  });

  it('⚠⚠⚠ THE ACTION ITSELF SURVIVES — nothing about the Crucible was deleted', () => {
    // The chip is a new DOOR onto the old handler, not a second implementation.
    // `useVendorCrucible` still owns the charge and every refusal behind it.
    const slice = read('app', 'state', 'slices', 'vendorSlice.ts');
    expect(slice).toContain('useVendorCrucible()');
    expect(slice).toContain('const COST = 25;');
    expect(slice).toContain("The Crucible's not for first-timers");
  });
});

describe('OTA-1470 — the chip is there from the start', () => {
  it('⚠⚠⚠ A VENDOR TILE OFFERS THE CRUCIBLE BEFORE ANYTHING IS PAID', () => {
    // The whole ask: "it should be a separate chip from the start". Previously
    // `atLocationCrucible` alone gated the chip, and it is false at a roadside
    // vendor until `fusionPending` flips — which only happens after paying.
    const body = chipBody();
    expect(body).toContain('const vendorCrucible');
    expect(body).toContain('currentScene?.vendor');
    expect(body).toContain('if (!atLocationCrucible && !vendorCrucible) return null;');
  });

  it('⚠⚠⚠ AND IT IS THE SAME CHIP, IN THE SAME ROW AS THE STORE CHIP', () => {
    // "it put the store chip and the fuse chip on the same line like we had
    // decided before" — that row is `placeChipRow`, and both chips carry
    // `styles.placeChip`, which is what makes them share it.
    const body = chipBody();
    expect(body).toContain('styles.placeChip, styles.fusionChip');
    expect(EXPL).toContain('styles.placeChipRow');
  });

  it('⚠⚠⚠ THE TWO CRUCIBLES NEVER BOTH SHOW — arb153\'s rule survives', () => {
    // A location that has its own free Crucible must not ALSO offer the vendor's
    // paid one. That was the duplication arb153 removed, and reversing which
    // affordance survives must not reintroduce it.
    const body = chipBody();
    const i = body.indexOf('const vendorCrucible');
    const decl = body.slice(i, body.indexOf(';', i));
    expect(decl).toContain('!atLocationCrucible');
  });

  it('⚠⚠⚠ AND NOT BEFORE THE PLAYER HAS EVER LEFT — the lit-button-that-refuses defect', () => {
    // `useVendorCrucible` refuses outright while macroVisitSeq < 1. His log has
    // four taps and four identical refusals in seventy seconds against the old
    // button, which is why that gate was moved to render time. The chip must
    // carry it too, or the defect simply moved house.
    const body = chipBody();
    const i = body.indexOf('const vendorCrucible');
    const decl = body.slice(i, body.indexOf(';', i));
    expect(decl).toContain('macroVisitSeq');
    expect(decl).toMatch(/>= 1/);
  });
});

describe('OTA-1470 — the chip tells the truth about the price', () => {
  it('⚠⚠⚠ A VENDOR CRUCIBLE NAMES ITS FEE ON THE CHIP', () => {
    const body = chipBody();
    expect(body).toContain("'★★ Crucible · 25 TC'");
    // and the free one still reads free
    expect(body).toContain("'★★ Crucible ready'");
  });

  it('⚠⚠⚠ SHORT OF COIN IS SHOWN BEFORE THE TAP, WITH THE BALANCE', () => {
    // OTA-1024 exists because he spent down to 11 TC, tapped, and learned about
    // the fee from a buried system line. That lesson has to travel with the
    // affordance, not stay behind on the button that carried it.
    const body = chipBody();
    expect(body).toContain('const shortOfCoin');
    expect(body).toMatch(/25 TC to fire — you have \$\{player\.tc \?\? 0\}/);
  });

  it('⚠⚠ the fee check and the label are derived from one flag', () => {
    // Two derivations of "is this the paid one" is how the label and the action
    // come to disagree — a chip that says free and charges, or the reverse.
    const body = chipBody();
    expect((body.match(/const vendorCrucible\s*=/g) ?? []).length).toBe(1);
    const i = body.indexOf('const shortOfCoin');
    expect(body.slice(i, body.indexOf(';', i))).toContain('vendorCrucible');
  });

  it('⚠⚠⚠ AND THE TAP ROUTES TO THE PRICED HANDLER, not the free one', () => {
    // The single most important wiring fact here: a vendor chip that fired
    // `submitPlayerAction('fuse')` would hand out a free fuse at a roadside
    // stall and quietly delete the 25 TC economy.
    const body = chipBody();
    const i = body.indexOf('const fireCrucible');
    const fn = body.slice(i, body.indexOf(';', i));
    expect(fn).toContain('vendorCrucible');
    expect(fn).toContain('useVendorCrucible()');
    expect(fn).toContain("submitPlayerAction('fuse')");
  });
});

describe('OTA-1470 — what the chip already did, it still does', () => {
  it('⚠⚠ a BLOCKED Crucible still spells out what is missing', () => {
    // OTA-220's reason line: "a player once tapped fuse 5× not knowing".
    const body = chipBody();
    expect(body).toContain("'★★ Crucible · needs prep'");
    expect(body).toContain('gate.reason');
  });

  it('⚠⚠ the readiness gate still mirrors the fuse handler exactly', () => {
    // The banner must read "ready" exactly when the fuse will succeed —
    // including the equipped-catalyst subtlety (the Crucible burns it).
    const body = chipBody();
    expect(body).toContain('findFactionCatalyst');
    expect(body).toContain('gateFusion');
    expect(body).toContain('bannerEquippedIds');
  });

  it('⚠ it is still dismissable, and still suppressed inside a building', () => {
    const body = chipBody();
    expect(body).toContain('setCrucibleChipDismissedKey');
    expect(EXPL).toContain("if (activeBuildingId || currentScene?.location?.id === 'hidden_market') return null;");
  });

  it('⚠⚠⚠ AND THE INDOOR SUPPRESSION DOES NOT DELETE ANYONE\'S CRUCIBLE', () => {
    // ⚠ THE ONE PLACE THIS OTA COULD HAVE LOST SOMETHING. The removed button was
    // inside the VENDOR SCREEN, which opens indoors; the chip returns null inside
    // any building (OTA-775). So if a non-market building could hold a vendor,
    // that vendor's Crucible would have been deleted rather than moved.
    //
    // It cannot. A building room only carries a vendor through `stallCategory`
    // (`patchSceneForBuildingRoom` sets `vendor: stallVendor`, null otherwise),
    // and every stall in the game is a market stall — and the market already has
    // its own free cauldron and is already excluded by `atLocationCrucible`.
    // Asserted rather than reasoned, so the day a trader is hung in the shack
    // this fails instead of quietly shipping a Crucible nobody can reach.
    const withStalls = Object.entries(BUILDINGS)
      .filter(([, b]) => (b.rooms ?? []).some((r) => !!r.stallCategory))
      .map(([id]) => id);
    expect(withStalls).toEqual(['market']);
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain('vendor: stallVendor,');
    expect(store).toContain('const stallVendor = room.stallCategory');
  });
});

export {};
