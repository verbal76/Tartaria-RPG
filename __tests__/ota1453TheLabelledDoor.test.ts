/**
 * OTA-1453 — THE DOOR HAS TO LOOK LIKE A DOOR.
 *
 * ⚠⚠ REPORTED BY SOMEONE WHO IS NOT THE OWNER, which is the whole reason it is
 * worth pixels. A second player asked *"why do I have to gift someone before I
 * can use them?"* — she had not found the store at all. The vendor chip IS the
 * button and its own hint line says "tap to trade", and none of that reached
 * her, because the only things on that row that LOOKED like buttons were TALK
 * and GIFT. So gifting read as the way in to a shopkeeper.
 *
 * ⚠⚠ THE FIX IS DELIBERATE REDUNDANCY, NOT A SECOND ROUTE. STORE fires the same
 * handler the chip fires. A player conditioned by other games hunts for a
 * labelled control and never learns that a banner is tappable; giving them the
 * shape they are looking for costs one chip and cannot desync, because there is
 * only one behaviour behind both.
 *
 * ⚠ WHAT THIS SUITE IS FOR. Not "a button exists" — that is the assertion that
 * passes while the button navigates somewhere else, or appears in combat, or
 * outlives the vendor. The claims are: it goes exactly where the chip goes, it
 * is subject to every gate the chip is subject to, and it never eats the chip's
 * own tap.
 */
import { blockAt, between } from '../test-utils/srcBlock';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');

/** The vendor chip: from its render gate to the close of its opening tag block. */
const VENDOR_CHIP = between(
  EXPL,
  '{currentScene?.vendor && !inCombat && !activeBuildingId && !vendorChipDismissed && (',
  'OTA-1029 — ✕ on the trader',
);

describe('OTA-1453 — the STORE button', () => {
  it('⚠⚠ EXISTS, and lives INSIDE the vendor chip rather than loose on the row', () => {
    // Loose on the row it would outlive the vendor: the chip's gate is what ties
    // it to there being somebody to trade with.
    expect(VENDOR_CHIP).toContain('>STORE<');
  });

  it('⚠⚠⚠ GOES EXACTLY WHERE THE CHIP GOES — one behaviour, two shapes', () => {
    // The defect this replaces would be a STORE button that opened something
    // subtly different from the banner. Both handlers are read out of the source
    // and compared, so they cannot drift into two answers.
    const chipOpen = between(EXPL, 'style={[styles.placeChip, styles.vendorChip]}', 'activeOpacity');
    const storeOpen = between(EXPL, 'style={[styles.placeChipTalk, styles.placeChipStore]}', 'hitSlop');
    const handlerOf = (s: string) => /onPress=\{([^}]*)\}/.exec(s)?.[1]?.trim();
    expect(handlerOf(chipOpen)).toBe("() => setScreen('vendor')");
    expect(handlerOf(storeOpen)).toBe(handlerOf(chipOpen));
  });

  it('⚠⚠ IS GATED BY THE VENDOR CHIP ITSELF — no store button without a shopkeeper', () => {
    // Every condition the chip carries applies to STORE for free, because STORE
    // is nested inside it. Pinned as the REASON it is nested: no trading mid
    // combat (arb166), none inside a building where the stalls are the rooms
    // (OTA-775), none after the chip is dismissed.
    const gate = '{currentScene?.vendor && !inCombat && !activeBuildingId && !vendorChipDismissed && (';
    expect(EXPL).toContain(gate);
    expect(EXPL.indexOf('>STORE<')).toBeGreaterThan(EXPL.indexOf(gate));
  });

  it('⚠⚠ SITS BEFORE TALK AND GIFT — trading is the primary action at a counter', () => {
    // Order is the whole point of the report. She read the row left to right and
    // the first labelled control she found was the wrong one.
    const store = VENDOR_CHIP.indexOf('>STORE<');
    const talk = VENDOR_CHIP.indexOf('>TALK<');
    const gift = VENDOR_CHIP.indexOf('>GIFT<');
    expect(store).toBeGreaterThan(-1);
    expect(talk).toBeGreaterThan(store);
    expect(gift).toBeGreaterThan(store);
  });

  it('⚠ …and it LOOKS primary, where TALK and GIFT are deliberately quiet', () => {
    // A third grey chip would have been read as another secondary action and the
    // report would repeat. It wears the vendor's own gold.
    expect(VENDOR_CHIP).toContain('styles.placeChipStore');
    expect(EXPL).toContain("placeChipStore: { borderColor: '#c9a86a'");
    // The vendor stripe and name use that same gold — one palette, not a new one.
    expect(EXPL).toContain("vendorBannerStripe: { width: 4, backgroundColor: '#c9a86a'");
  });

  it('⚠⚠ CARRIES A REAL ACCESSIBILITY LABEL, not the bare word', () => {
    // A screen reader announcing "STORE" tells somebody nothing about WHOSE.
    const storeBtn = between(EXPL, 'styles.placeChipStore]}', '>STORE<');
    expect(storeBtn).toContain('accessibilityRole="button"');
    expect(storeBtn).toMatch(/accessibilityLabel=\{`Open \$\{currentScene\.vendor\.name\}'s store/);
    expect(storeBtn).toContain('offers');
  });

  it('⚠⚠ THE OTHER DOOR INTO THE STORE ALREADY HAD A LABELLED BUTTON', () => {
    // The many-doors check, done rather than assumed: there are exactly two
    // places that navigate to the vendor screen from exploration, and the other
    // one — the hook-continue modal — has carried an explicit TRADE NOW button
    // since OTA-284. So this report had exactly one door to fix, and it is fixed.
    const doors = (EXPL.match(/setScreen\('vendor'\)/g) ?? []).length;
    expect(doors).toBe(3);   // the chip, the new STORE button, the hook modal
    expect(EXPL).toContain('onTrade=');
    expect(EXPL).toContain('vendorName={currentScene?.vendor?.name}');
  });

  it('⚠ the chip keeps its own hint line — the button ADDS an affordance, it does not replace one', () => {
    // Removing "tap to trade" because a button now exists would take the
    // discovery away from the players who DID find it that way.
    expect(VENDOR_CHIP).toContain('offers · tap to trade');
  });
});
