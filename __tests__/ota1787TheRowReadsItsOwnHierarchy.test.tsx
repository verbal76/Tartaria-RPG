/**
 * OTA-1787 — THE COMBAT ROW READS ITS OWN HIERARCHY.
 *
 * Two device findings, one subject: a control sitting at the wrong level in the
 * combat stack.
 *
 * PUNCH. Owner: *"PUNCH now looks visually odd beside the illustrated weapon
 * controls. It reads too much like another primary filled weapon even though it
 * is the basic/fallback unarmed action... Find the smallest treatment that makes
 * PUNCH read correctly as an available unarmed/basic action rather than a peer
 * illustrated weapon."*
 *
 * ⚠⚠⚠ THE SMALLEST TREATMENT IS A RE-CLASSIFICATION INSIDE THE FIVE TONES THAT
 * ALREADY EXIST, AND OTA-1454 WROTE THE ARGUMENT FOR IT YEARS AGO: *"A SOLID
 * green block with soot lettering is a decisive, turn-ending commitment; the
 * same green as a thin border on near-black is the ready pool's modifiers and
 * setup tools."* Your fists are not a decisive commitment. They are what is
 * available when nothing better is. `weaponTone` returned `strike` for them
 * purely because bare hands reach `close` — which answers "can it land", not
 * "is it your weapon". No new colour, no new tone, no artwork, no size change.
 *
 * GLYPH KEY. Owner: *"The current small dark button sitting directly beside the
 * illustrated weapon controls looks bolted onto that family... Move/recompose it
 * as a compact NEUTRAL REFERENCE/UTILITY control associated with combat, not as
 * another weapon/action."* And: *"Change the player-facing concept to GLYPH KEY.
 * Do not use a question mark as its identity."*
 *
 * ⚠⚠ OTA-1783 PUT IT ON THE WEAPON LINE FOR A REASON THAT WAS WRONG ON GLASS.
 * The reasoning was that it decodes the marks on the two chips beside it, so it
 * belongs with them. On hardware that adjacency did the opposite: proximity to
 * two illustrated, filled controls made it read as a failed member of that
 * family rather than as a reference. It moves to the utility row — approach,
 * step back, inventory, abilities, heals — where every chip navigates or
 * prepares and none of them is a swing.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const INPUT_BOX = 'app/components/InputBox.tsx';

/* ⚠ GRADE THE CODE, NOT THE PROSE — twenty-sixth sighting, and this pass earned
 * it twice: re-aiming OTA-1783's placement test, the first cut anchored the
 * weapon row on the string `OTA-912`, which lives in a COMMENT. Stripped, the
 * anchor vanished, `indexOf` returned -1, and the slice ran to end-of-file and
 * "proved" the chip was still on the weapon line. The scanner needs grading too. */
function codeOf(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i]; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
        out += src[i]; i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

const code = codeOf(read(INPUT_BOX));
const rowStarts = [...code.matchAll(/styles\.quickRowLine/g)].map((m) => m.index!);

describe('OTA-1787 — the scanner is anchored on code', () => {
  it('the combat stack still has its three rows, found without reading a comment', () => {
    expect(rowStarts.length).toBeGreaterThanOrEqual(3);
  });
});

describe('OTA-1787 — PUNCH stops reading as a weapon', () => {
  it('the strike case is demoted to the outline, and only the strike case', () => {
    expect(code).toContain("const punchTone = punchT === 'strike' ? 'ready' : punchT;");
    expect(code).toContain('tone={punchTone}');
  });

  /* ⚠⚠⚠ THE WARNING IS UNTOUCHED, AND THAT IS THE HALF A CARELESS FIX WOULD
   * HAVE BROKEN. `needs-approach` is amber and means "your fists cannot reach
   * from here". `outOfRange` still keys off the RAW tone, so OTA-1591's
   * buzz-then-let-the-refusal-speak behaviour is byte-identical — a chip that
   * stopped buzzing would be a silent refusal, the exact defect class OTA-1591
   * closed. */
  it('the amber warning and the out-of-range buzz read the RAW tone', () => {
    expect(code).toMatch(/outOfRange=\{punchT === 'needs-approach'\}/);
  });

  /* Owner: *"Do not change its behavior... Do not give Punch weapon artwork
   * merely to make it match."* */
  it('it still submits punch, and still carries no artwork', () => {
    const punch = /<QuickBtn label="punch"[\s\S]*?\/>/.exec(code)?.[0] ?? '';
    expect(punch).not.toBe('');
    expect(punch).toContain("onSubmit('punch')");
    for (const forbidden of ['glyphs=', 'baseGlyph=', 'weapon', 'star']) {
      expect(punch).not.toContain(forbidden);
    }
  });

  /* ⚠⚠ AND THE WEAPON BUTTONS ARE UNTOUCHED — the other half of the ruling.
   * They still take the RAW tone while PUNCH takes a stepped-down one; the
   * hierarchy comes from PUNCH stepping down, not from the weapons stepping up.
   *
   * ⚠ OTA-1800 CHANGED WHAT `strike` LOOKS LIKE, NOT WHO WEARS IT, and that
   * distinction is the whole of this test. The owner ruled the equipped weapon
   * DARK, so `strike` is no longer a filled sage block — it is sage rim and
   * bold sage lettering on the chassis ground. The weapon chips still take the
   * raw tone; punch still does not; the two tones are still distinct. Every
   * claim OTA-1787 makes survives, so the pins move to the part that carries
   * it: the weapons get the undiluted tone, and `strike` and `ready` remain two
   * different styles rather than one. */
  it('the weapon chips still take the raw tone, and it is still its own tone', () => {
    expect(code).toContain('tone={mainT}');
    expect(code).toContain('tone={offT}');
    expect(code).toContain("quickStrike: { borderColor: '#9ec96a'");
    expect(code).toContain("quickReady: { borderColor: '#9ec96a', backgroundColor: '#1b2417' }");
    const body = (k: string) => new RegExp(`\\n {2}${k}: \\{([^}]*)\\}`).exec(code)?.[1] ?? '';
    expect(body('quickStrike')).not.toBe('');
    expect(body('quickStrike')).not.toBe(body('quickReady'));
  });

  /* ⚠ THE 28dp MARK AND OTA-1781's TYPOGRAPHY ARE LOCKED AND STAY LOCKED. */
  it('the approved weapon typography and mark size did not move', () => {
    expect(code).toContain('quickWeaponName: GLYPH_NAME_TYPE');
    expect(code).toContain('width: GLYPH_ART_SIZE.combat');
  });
});

describe('OTA-1787 — the glyph key is a reference, not a weapon', () => {
  const chip = (code.match(/<QuickBtn[\s\S]*?\/>/g) ?? []).find((t) => t.includes('armLoreJump')) ?? '';

  it('it is called what it is, with no question mark', () => {
    expect(chip).toContain('label="glyph key"');
    expect(chip).not.toContain('?');
    expect(code).not.toContain('? glyphs');
  });

  it('it left the weapon line', () => {
    const iMain = code.indexOf('const mainT = weaponTone');
    const weaponRow = rowStarts.find((i) => i < iMain)!;
    const nextRow = rowStarts.find((i) => i > iMain)!;
    const weaponLine = code.slice(weaponRow, nextRow);
    expect(weaponLine).toContain('attack with the off-hand ');
    expect(weaponLine).not.toContain('armLoreJump');
  });

  /* ⚠⚠ AND IT LANDED ON THE ROW WHERE NOTHING IS A SWING. Every other chip on
   * this line navigates or prepares — approach, step back, inventory. That is
   * what makes a legend read correctly beside them, and what makes it
   * subordinate without being shrunk. */
  it('it sits on the utility row, with inventory', () => {
    const iInv = code.indexOf('label="inventory"');
    const utilityRow = rowStarts.filter((i) => i < iInv).pop()!;
    const utilityLine = code.slice(utilityRow);
    expect(utilityLine).toContain('label="inventory"');
    expect(utilityLine).toContain('armLoreJump');
    // approach and step back are on this line too — it really is the utility row
    expect(utilityLine).toContain('label="approach"');
  });

  it('it is still the neutral chassis — no tone, no artwork, no size of its own', () => {
    expect(chip).not.toMatch(/\stone=/);
    for (const forbidden of ['glyphs=', 'baseGlyph=', 'weapon', 'Image']) {
      expect(chip).not.toContain(forbidden);
    }
  });

  /* ⚠⚠⚠ OTA-1783's NAVIGATION IS PRESERVED VERBATIM, by instruction. The jump is
   * armed with the screen we are standing on and then navigates; BACK returns to
   * the exact combat state because a fight is store state displayed on
   * `exploration`. Moving a chip between rows must not touch any of that. */
  it('the return architecture is unchanged', () => {
    expect(chip).toContain("armLoreJump({ section: 'glyphs', returnTo: useGameStore.getState().currentScreen })");
    expect(chip).toContain("setScreen('lore')");
    const i = chip.indexOf('armLoreJump');
    const j = chip.indexOf("setScreen('lore')");
    expect(j).toBeGreaterThan(i);
    // and it still costs the player nothing
    expect(chip).not.toContain('onSubmit');
  });
});
