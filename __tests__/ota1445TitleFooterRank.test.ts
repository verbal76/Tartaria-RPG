/**
 * OTA-1445 — THE TITLE FOOTER: THREE BUTTONS, ONE HEIGHT, OWNER'S ORDER.
 *
 * Owner: *"the new tartaria block is a little bit taller than the check for
 * OTA update and restore from backup. I want all of them to be the same
 * thickness as the OTA update line and I want them reordered new tartarian
 * first check for OTA update second and restore from backup third."*
 */
const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const TITLE = read('app', 'screens', 'TitleScreen.tsx');

describe('OTA-1445 — the order', () => {
  it('⚠⚠ New Tartarian, then CHECK FOR OTA UPDATE, then Restore from backup', () => {
    const newBtn = TITLE.indexOf("'New Tartarian'");
    const ota = TITLE.indexOf("'CHECK FOR OTA UPDATE'");
    const restore = TITLE.indexOf('>Restore from backup<');
    expect(newBtn).toBeGreaterThan(-1);
    expect(ota).toBeGreaterThan(newBtn);
    expect(restore).toBeGreaterThan(ota);
  });
});

describe('OTA-1445 — the thickness', () => {
  it('⚠⚠ the lead button carries the SECONDARY metrics — same padding, same font size', () => {
    // Height = padding + text line height; both must match or the buttons
    // stand unequal again. Rank shows in colour (amber border, lighter fill),
    // not in size.
    const primary = TITLE.slice(TITLE.indexOf('primaryBtn: {'), TITLE.indexOf('btnDisabled:'));
    expect(primary).toContain('paddingVertical: 12,');
    expect(primary).not.toContain('paddingVertical: 14,');
    expect(primary).toContain("primaryBtnText: { color: '#e6d8b3', fontSize: 12,");
    // The secondary metrics it mirrors, pinned so a drift in either direction
    // fails here rather than on a phone.
    const secondary = TITLE.slice(TITLE.indexOf('secondaryBtn: {'), TITLE.indexOf('btnDisabled:'));
    expect(secondary).toContain('paddingVertical: 12,');
    expect(secondary).toContain('fontSize: 12,');
  });

  it('⚠ rank still reads: the lead keeps the amber border and lighter fill', () => {
    const primary = TITLE.slice(TITLE.indexOf('primaryBtn: {'), TITLE.indexOf('primaryBtnText:'));
    expect(primary).toContain("borderColor: '#c9a86a',");
    expect(primary).toContain("backgroundColor: '#3a342c',");
  });
});
