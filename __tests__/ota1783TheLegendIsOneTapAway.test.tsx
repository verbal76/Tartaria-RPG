/**
 * OTA-1783 — THE LEGEND IS ONE TAP AWAY, AND ONE TAP BACK.
 *
 * Owner: *"Add a compact, neutral reference control in the combat action/weapon
 * area that takes the player directly to Lore → Glyphs. Its purpose is
 * immediate lookup... Tap reference → Glyph legend → Back → continue the
 * fight."* And the constraint that shapes everything: *"Back must return
 * cleanly to the exact active combat state. Do not dump the player onto another
 * screen, character selection, exploration, or the Lore root."*
 *
 * ⚠⚠⚠ THE FINDING THAT MADE THIS SMALL. There is no `combat` screen. Combat is
 * STORE STATE fought on `exploration`, so a trip to the codex and back never
 * threatened the fight in the first place — nothing here saves, restores or
 * even reads a combat field. What was actually missing was two smaller things:
 * the codex could not be opened ON a tab, and BACK was a RULE
 * (`inSession ? 'exploration' : 'title'`) rather than a RECORD. A rule has to
 * be right about every path that ever reaches it; a record only has to be
 * written down once. This pass writes it down.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const INPUT_BOX = 'app/components/InputBox.tsx';
const LORE_SCREEN = 'app/screens/LoreScreen.tsx';
const CODEX = 'app/components/LoreCodexBody.tsx';
const JUMP = 'app/ui/loreJump.ts';
const GLYPH_ART = 'app/engine/combatGlyphArt.ts';

/* ⚠ GRADE THE CODE, NOT THE PROSE — the twenty-fifth sighting. This pass's own
 * comments quote `openLoreAt`, `loreJump` and the word "glyphs" repeatedly, and
 * the assertions below look for exactly those. */
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

function quickBtnTags(code: string): string[] {
  return code.match(/<QuickBtn[\s\S]*?\/>/g) ?? [];
}

describe('OTA-1783 — the scanners this suite is built on', () => {
  it('the stripper drops comments and keeps strings', () => {
    const code = codeOf("const a = 1; // openLoreAt\n/* loreJump */ const b = 'glyphs';");
    expect(code).not.toContain('armLoreJump');
    expect(code).not.toContain('LoreJump');
    expect(code).toContain('glyphs');
  });

  it('the tag scanner still captures whole tags past their arrow functions', () => {
    const tags = quickBtnTags(codeOf(read(INPUT_BOX)));
    expect(tags.length).toBeGreaterThan(3);
    for (const t of tags) expect(t.endsWith('/>')).toBe(true);
  });
});

describe('OTA-1783 — the control is neutral, compact and not a glyph', () => {
  const code = codeOf(read(INPUT_BOX));
  const chip = quickBtnTags(code).find((t) => t.includes('armLoreJump')) ?? '';

  it('exactly one chip opens the codex', () => {
    expect(quickBtnTags(code).filter((t) => t.includes('armLoreJump'))).toHaveLength(1);
  });

  /* ⚠⚠⚠ THE RULING THIS TEST EXISTS FOR. Owner: *"Do NOT use one of the actual
   * damage/coat glyphs as the reference-control symbol. That would imply that
   * particular damage type."* So the chip carries no artwork and no glyph part
   * of any kind — asserted against the REAL damage-type list read out of the
   * art module, not against a list retyped here, so a damage type added later
   * is covered without anyone remembering to add it. */
  it('it carries no glyph, no coat and no artwork', () => {
    for (const forbidden of ['glyphs=', 'baseGlyph=', 'glyphText=', 'star', 'Image']) {
      expect(chip).not.toContain(forbidden);
    }
    const damageTypes = [...codeOf(read(GLYPH_ART)).matchAll(/^\s{2}(\w+):\s*require\(/gm)].map((m) => m[1]!);
    expect(damageTypes.length).toBeGreaterThan(3);
    for (const t of damageTypes) expect(chip.toLowerCase()).not.toContain(`'${t.toLowerCase()}'`);
  });

  /* ⚠ SUBORDINATE BY CONSTRUCTION. Every other chip on this row takes a `tone`
   * — coloured by what it can do to the enemy right now. This one takes none,
   * so it renders in the neutral chassis and can never compete with a weapon.
   * That is also why it needs no new visual family: it IS the default. */
  it('it takes no tone, so it is the neutral default and nothing louder', () => {
    expect(chip).not.toMatch(/\stone=/);
    expect(chip).not.toMatch(/\sdefensive/);
    expect(chip).not.toMatch(/\soutOfRange/);
  });

  it('its label is the destination itself, and carries no question mark', () => {
    /* ⚠⚠⚠ CHANGED BY OTA-1787, ON A DEVICE RULING. This pass shipped `? glyphs`;
     * the owner saw it and ruled: *"Change the player-facing concept to GLYPH
     * KEY. Do not use a question mark as its identity."* He is right about why —
     * a question mark reads as help-about-the-interface, and this is a KEY to a
     * vocabulary the world uses. The claim the test defends is unchanged: the
     * label is not a damage word and not a glyph. */
    expect(chip).toContain('label="glyph key"');
    expect(chip).not.toContain('?');
  });

  /* ⚠⚠ NAVIGATION, NOT AN ACTION. Every other chip goes through `onSubmit` and
   * costs the player engine time. Looking something up must cost nothing —
   * no stamina, no round, no turn — so this one never reaches the parser. */
  it('it navigates rather than submitting a command', () => {
    expect(chip).toContain('armLoreJump');
    expect(chip).not.toContain('onSubmit');
  });

  /* ⚠ PLACEMENT: it decodes the marks on the weapon chips, so it sits on their
   * line, after them, and it is the last thing there. */
  it('it is NOT on the weapon line — it sits with the utility controls', () => {
    /* ⚠⚠⚠ MOVED BY OTA-1787, ON A DEVICE RULING, AND THIS TEST IS NOW ITS
     * OPPOSITE. OTA-1783 put the control last on the WEAPON line, reasoning
     * that it decodes the marks on the two chips beside it. On hardware that
     * adjacency did the opposite of what was intended — owner: *"The current
     * small dark button sitting directly beside the illustrated weapon controls
     * looks bolted onto that family."*
     * It now sits on the combat stack's UTILITY row, beside `inventory`: every
     * chip on that line navigates or prepares, and none of them is a swing. */
    /* ⚠⚠ ANCHORED ON CODE, NOT ON AN OTA NUMBER IN A COMMENT — the first cut of
     * this used `OTA-912` as the weapon line's closing marker and `code` here is
     * COMMENT-STRIPPED, so that anchor did not exist, `indexOf` returned -1, and
     * the slice silently ran to the end of the file and "found" the chip on the
     * weapon line. Grade the code, not the prose, applied to the SCANNER as well
     * as to the target. The row boundary is `styles.quickRowLine`, which is real
     * code and cannot be stripped. */
    const rowStarts = [...code.matchAll(/styles\.quickRowLine/g)].map((m) => m.index!);
    expect(rowStarts.length).toBeGreaterThanOrEqual(3);
    const weaponRow = rowStarts.find((i) => i < code.indexOf('const mainT = weaponTone'))!;
    const afterWeaponRow = rowStarts.find((i) => i > code.indexOf('const mainT = weaponTone'))!;
    const weaponLine = code.slice(weaponRow, afterWeaponRow);
    expect(weaponLine).toContain('attack with the off-hand ');
    expect(weaponLine).not.toContain('armLoreJump');
    // and it is on the row that carries `inventory`
    const iInv = code.indexOf('label="inventory"');
    const utilityRow = rowStarts.find((i) => i < iInv && !rowStarts.some((j) => j > i && j < iInv))!;
    const utilityLine = code.slice(utilityRow);
    expect(utilityLine).toContain('label="inventory"');
    expect(utilityLine).toContain('armLoreJump');
  });
});

describe('OTA-1783 — the codex opens on the tab you came for', () => {
  it('the body accepts a destination and still defaults to the tab order', () => {
    const code = codeOf(read(CODEX));
    expect(code).toMatch(/export function LoreCodexBody\(\{ openAt \}/);
    expect(code).toContain('useState<Section>(openAt ?? TAB_ORDER[0]!)');
  });

  /* ⚠ THE DESTINATION IS A REAL TAB, checked against the codex's own union
   * rather than trusted. A jump to a section that does not exist would land on
   * a blank codex, which is worse than landing on the root. */
  it("'glyphs' is a section the codex actually has", () => {
    const code = codeOf(read(CODEX));
    const union = code.match(/export type Section = ([^;]+);/)?.[1] ?? '';
    expect(union).toContain("'glyphs'");
    expect(codeOf(read(INPUT_BOX))).toContain("section: 'glyphs'");
  });
});

describe('OTA-1783 — BACK is a record, not a rule', () => {
  const jump = codeOf(read(JUMP));
  const screen = codeOf(read(LORE_SCREEN));
  const input = codeOf(read(INPUT_BOX));

  it('the jump captures the screen it left', () => {
    expect(jump).toMatch(/returnTo: ScreenName/);
    expect(input).toContain("armLoreJump({ section: 'glyphs', returnTo: useGameStore.getState().currentScreen })");
  });

  it('BACK prefers the captured screen and keeps the old rule as the default', () => {
    expect(screen).toContain("onBack={() => setScreen(loreJump?.returnTo ?? (inSession ? 'exploration' : 'title'))}");
  });

  /* ⚠⚠⚠ IT IS NOT STORE STATE, AND THE SECOND REASON IS THE BETTER ONE.
   * The first is a wall: `gameStore.ts` sits at 36,995 lines against a ratchet
   * two suites assert at `< 37,000`. A field, an action, an initialiser and a
   * clear is five lines before a word of explanation.
   * The second is that the store was the wrong home anyway. Store state is
   * SAVED state; this is a hand-off between two renders. `giftMode` is the
   * closest shape in the codebase and it needed OTA-1280 to add a guard in
   * `setScreen` AFTER a mode outlived its screen and silently changed a later
   * visit. Here that cannot happen: the read CONSUMES the value, so a second
   * visit finds nothing pending and takes the ordinary default. */
  it('the store carries none of it', () => {
    const store = codeOf(read('app/state/gameStore.ts'));
    expect(store).not.toContain('loreJump');
    expect(store).not.toContain('openLoreAt');
  });

  it('the read consumes, so a jump cannot outlive the screen it was armed for', () => {
    const take = jump.match(/export function takeLoreJump\(\)[\s\S]*?\n\}/)?.[0] ?? '';
    expect(take).not.toBe('');
    expect(take).toContain('pending = null');
  });

  /* ⚠ ONCE PER MOUNT. `takeLoreJump` clears as it reads, so a second render of
   * the same mount would find it gone; the ref is what holds the answer.
   * `undefined` means "not looked yet", `null` means "looked, nothing there" —
   * a distinction a plain `null` initial could not make. */
  it('the screen reads it once per mount and holds the answer', () => {
    expect(screen).toContain('useRef<LoreJump | null | undefined>(undefined)');
    expect(screen).toContain('if (jump.current === undefined) jump.current = takeLoreJump();');
  });

  /* ⚠ ARM THEN NAVIGATE, IN THAT ORDER AND WITH NOTHING BETWEEN THEM. Reversed,
   * the codex would mount before the jump existed and land on the default. */
  it('the control arms before it navigates', () => {
    const i = input.indexOf('armLoreJump({');
    const j = input.indexOf("setScreen('lore')");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});

describe('OTA-1783 — the fight is not touched, because it never had to be', () => {
  /* ⚠⚠⚠ THE MEASUREMENT BEHIND THE WHOLE DESIGN. If `combat` were a screen,
   * a trip to Lore would have to save and restore it. It is not: the screen
   * union has no such member, so a fight is store state displayed on
   * `exploration`, and `setScreen` moves the view without moving the fight.
   * This is the assertion that would tell a later reader why no combat field
   * appears anywhere in this diff — and that would fail loudly if somebody ever
   * DID add a combat screen, which is the moment this design would need
   * revisiting. */
  it("there is no 'combat' screen — a fight is state on exploration", () => {
    const types = codeOf(read('app/engine/types.ts'));
    const union = types.match(/export type ScreenName =[\s\S]*?;/)?.[0] ?? '';
    expect(union).not.toBe('');
    expect(union).toContain("'exploration'");
    expect(union).not.toContain("'combat'");
  });

  it('no combat field is read or written on the whole path', () => {
    /* ⚠ `enemies` IS NOT ON THIS LIST, and the first cut of this test put it
     * there and went red for a good reason: the codex has a BESTIARY. The word
     * belongs to the lore content, not to the fight. Naming a field that the
     * scanned file legitimately uses for something else is how a guard becomes
     * noise, so the list is the combat-state fields only. */
    for (const rel of [LORE_SCREEN, CODEX]) {
      const code = codeOf(read(rel));
      for (const field of ['activeEnemy', 'combatRound', 'endCombat', 'inCombat']) {
        expect(code).not.toContain(field);
      }
    }
  });
});
