/**
 * OTA-1445 — THE TITLE FOOTER: THREE BUTTONS, OWNER'S ORDER.
 *
 * Owner: *"the new tartaria block is a little bit taller than the check for
 * OTA update and restore from backup. I want all of them to be the same
 * thickness as the OTA update line and I want them reordered new tartarian
 * first check for OTA update second and restore from backup third."*
 *
 * ⚠⚠ VIS-1 SUPERSEDED THE SECOND HALF OF THAT, AND ONLY THE SECOND HALF.
 * The ORDER is owner intent about which action matters most. It is unchanged,
 * still pinned below, and it outlived the restyle.
 *
 * The equal-THICKNESS rule was a fix for a specific defect: all three were the
 * same flat rectangle, so the lead one standing a few pixels taller read as a
 * misalignment rather than as rank. VIS-1's brief asks the opposite for a
 * different reason — *"NEW TARTARIAN should become the strongest standalone
 * action on the screen ... full primary treatment"*, with OTA and RESTORE as a
 * subordinate utility family in the same material. Rank now reads in MATERIAL
 * (lit rim, raised face, top bevel, plate type, survey diamonds), of which
 * height is one part, so the old metric pins would have held the lead action
 * flat. They are replaced by pins on what carries rank now: the variant each
 * button is given, and the fact that the material is the kit's rather than a
 * one-screen restyle.
 */
const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const TITLE = read('app', 'screens', 'TitleScreen.tsx');
const KIT = read('app', 'ui', 'tartariaKit.tsx');

describe('OTA-1445 — the order', () => {
  it('⚠⚠ New Tartarian, then CHECK FOR OTA UPDATE, then Restore from backup', () => {
    const newBtn = TITLE.indexOf("'NEW TARTARIAN'");
    const ota = TITLE.indexOf("'CHECK FOR OTA UPDATE'");
    const restore = TITLE.indexOf('"RESTORE FROM BACKUP"');
    expect(newBtn).toBeGreaterThan(-1);
    expect(ota).toBeGreaterThan(newBtn);
    expect(restore).toBeGreaterThan(ota);
  });
});

describe('OTA-1445 → VIS-1 — the rank', () => {
  const footer = TITLE.slice(TITLE.indexOf('<View style={styles.footerActions}>'));

  it('⚠⚠ the lead action is the ONLY primary; the other two are the utility family', () => {
    // Bounded to the footer action group so a TButton elsewhere on the screen
    // can never quietly satisfy these counts.
    const body = footer.slice(0, footer.indexOf('styles.cornerGear'));
    expect(body.length).toBeGreaterThan(0);
    expect((body.match(/variant="primary"/g) ?? []).length).toBe(1);
    expect((body.match(/variant="utility"/g) ?? []).length).toBe(2);
    // And the primary is the LEAD one, not whichever happened to sort first.
    const lead = body.indexOf("label={bootGateOpen ? 'NEW TARTARIAN' : bootGateReason}");
    expect(lead).toBeGreaterThan(-1);
    expect(body.indexOf('variant="primary"')).toBeGreaterThan(lead);
  });

  it('⚠ rank reads in material, and the material is the kit’s — not a local restyle', () => {
    expect(TITLE).toContain("from '../ui/tartariaKit'");
    // The flat one-screen button styles are gone, not merely unused.
    expect(TITLE).not.toContain('primaryBtnText:');
    expect(TITLE).not.toContain('secondaryBtnText:');
    // Primary carries a lit rim; utility carries the quieter face. Both are the
    // same construction, which is what makes them one family.
    const primaryRim = KIT.slice(KIT.indexOf('btnRimPrimary:'), KIT.indexOf('btnRimDestructive:'));
    expect(primaryRim).toContain('T.rimLit');
    const utilityFace = KIT.slice(KIT.indexOf('btnFaceUtility:'), KIT.indexOf('btnFaceUtility:') + 160);
    expect(utilityFace).toContain('T.faceUtility');
  });
});
