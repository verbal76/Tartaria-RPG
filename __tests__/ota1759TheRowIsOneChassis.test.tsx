/**
 * OTA-1759 — FOUR SCREENS INVENTED FOUR ROWS, AND THREE OF THEM WERE THE SAME ROW.
 *
 * Tier 0, step 3. Measured before writing anything:
 *   Inventory `row`       #13110f · #3a342c 1px · radius 4 · overflow hidden
 *   Vendor    `offerRow`  IDENTICAL but `marginBottom` 6 against Inventory's 4
 *   Crafting  `recipeRow` BYTE-IDENTICAL to Vendor's
 *   Contracts `card`      same ground and rim, but PADDED and not a row — a
 *                         block, not a line. A different shape; left alone.
 *
 * ⚠⚠ AND IT IS STYLES, NOT A `<TRow>` COMPONENT — deliberately a DIFFERENT
 * conclusion from OTA-1758's `TScreenHeader`, for a measured reason: the twelve
 * headers had one interaction (go back), and these rows have four. Vendor's row
 * is a checkbox inside group-select and a button outside it, with a long-press
 * that starts the group; three of Vendor's four rows are not pressable at all
 * and render as a bare `View`. A component owning the container would have to
 * plumb every one of those contracts through props. The owner's amendment says
 * it: "Do not homogenize Tartaria." The shared thing here is the MATERIAL.
 *
 * ⚠⚠⚠ AND THE VOCABULARY STOPS AT THREE STATES BECAUSE THE KIT'S OWN PALETTE
 * RULE REFUSED THE OTHER TWO — which is the finding this pass is really about.
 * I had written Inventory's two extra row states into the kit. OTA-1742's
 * chroma test failed on them, and it was right to:
 *
 *     rowHighlighted  #d8b46a  chroma 110   OTA-684, the deep-link flash
 *     rowSelected     #9c8348  chroma  84   OTA-1097, the reserved tick
 *
 * The kit allows a warm neutral to chroma 58; the brand gold (95) is past that
 * and exempt BY NAME. Neither of these is the brand gold — one is a brighter
 * gold, one a darker one — so Inventory has invented two off-brand golds for
 * row states, and `check:gold` is blind to both because it counts `#c9a86a`
 * alone. Under the owner's ruling that gold is reserved for a meaning already
 * defined, that is a QUESTION for Inventory's own adoption pass, not a colour
 * to copy across in a commit about two other screens. Section 3 records it.
 *
 * ⚠⚠ A SECOND THING WAS WRONG AND IS FIXED RATHER THAN SHIPPED: the first draft
 * of the helper ordered the states by guessed loudness. Inventory ships
 * `[row, highlighted, reserved, grouped]` with a comment saying why (OTA-1100:
 * group membership OUTRANKS the flash), and last wins in RN, so the real
 * precedence was the exact reverse of my guess. Those two states are not here
 * any more, but the ruling is written down in the helper so the pass that does
 * add them inherits it instead of re-deriving it wrong.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';
import { tRowStyle, tartariaKitStyles as kit, T } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const VENDOR = read('app', 'screens', 'VendorScreen.tsx');
const CRAFT = read('app', 'screens', 'CraftingScreen.tsx');
const INVENTORY = read('app', 'screens', 'InventoryScreen.tsx');

/** What RN actually paints: later entries win, falsy entries drop out. */
const flatten = (s: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const walk = (x: unknown) => {
    if (!x && x !== 0) return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const r = typeof x === 'number' ? StyleSheet.flatten(x) : x;
    if (r && typeof r === 'object') Object.assign(out, r as Record<string, unknown>);
  };
  walk(s);
  return out;
};

// ═══ 1. THE MATERIAL THE THREE SCREENS AGREED ON ═════════════════════════════
describe('the chassis is the shipped row, not a new one', () => {
  test('⚠⚠ every declaration is the value Vendor and Crafting already drew', () => {
    const s = flatten(kit.rowChassis);
    expect(s.flexDirection).toBe('row');
    expect(s.backgroundColor).toBe('#13110f');
    expect(s.borderColor).toBe('#3a342c');
    expect(s.borderWidth).toBe(1);
    expect(s.borderRadius).toBe(4);
    expect(s.overflow).toBe('hidden');
    expect(s.marginBottom).toBe(6);
  });

  test('⚠ the one number the three did not agree on is RECORDED, not averaged', () => {
    /* Inventory sits on 4. The chassis takes 6 — the value of the two screens
     * adopting today — so Inventory's adoption has to move 2px or argue for a
     * denser variant, in the open, on the commit that does it. Averaging to 5
     * would have changed three screens to please none of them. */
    expect(INVENTORY).toMatch(/marginBottom: 4,/);
    expect(KIT).toContain('`marginBottom: 4`, Vendor\'s and Crafting\'s on 6');
  });

  test('the gold in rowSelected is the interface gold, read from the token', () => {
    // VIS-3 reserves gold for a live obligation or a live process. The row the
    // player is acting on right now is exactly that — and it is also what three
    // screens already shipped, so this changes no pixels.
    expect(String(flatten(kit.rowSelected).borderColor).toLowerCase())
      .toBe(T.gold.toLowerCase());
    const block = KIT.slice(KIT.indexOf('rowMuted:'), KIT.indexOf('// ── TScreenHeader'));
    expect(block).toContain('borderColor: T.gold');
    expect(block).not.toContain("'#c9a86a'");
  });

  test('the two dim levels are the two the game actually uses', () => {
    expect(flatten(kit.rowMuted).opacity).toBe(0.6);     // usable, de-emphasised
    expect(flatten(kit.rowBlocked).opacity).toBe(0.45);  // you cannot have this
  });
});

// ═══ 2. THE HELPER COMPOSES THE WAY THE ARRAYS DID ═══════════════════════════
describe('tRowStyle composes states the way the shipped arrays did', () => {
  test('no state is the bare chassis', () => {
    expect(flatten(tRowStyle())).toEqual(flatten(kit.rowChassis));
    expect(flatten(tRowStyle({}))).toEqual(flatten(kit.rowChassis));
  });

  test('a false flag contributes nothing — not an undefined that clears a value', () => {
    expect(flatten(tRowStyle({ selected: false, muted: false, blocked: false })))
      .toEqual(flatten(kit.rowChassis));
  });

  test('⚠ opacity and border states are DISJOINT, so a blocked row still reads as selected', () => {
    const s = flatten(tRowStyle({ blocked: true, selected: true }));
    expect(s.opacity).toBe(0.45);
    expect(String(s.borderColor).toLowerCase()).toBe(T.gold.toLowerCase());
    expect(s.backgroundColor).toBe('#1e1a12');
  });

  test('the harsher dim wins when both apply', () => {
    expect(flatten(tRowStyle({ muted: true, blocked: true })).opacity).toBe(0.45);
  });
});

// ═══ 3. ⚠⚠⚠ THE TWO STATES THAT DID NOT COME, AND WHY ═══════════════════════
describe('Inventory’s two extra row states were refused by the kit’s palette rule', () => {
  /** Inventory's shipped values, transcribed from the file it still owns them in. */
  const OFF_BRAND = { flash: '#d8b46a', reserved: '#9c8348' };
  const chroma = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
    return Math.max(r, g, b) - Math.min(r, g, b);
  };

  test('⚠⚠⚠ both are near-gold saturation without being the brand gold', () => {
    /* This is the measurement that stopped them being imported. OTA-1742 caps a
     * non-brand hex at chroma 58 and exempts the brand gold (95) by name. */
    expect(chroma(OFF_BRAND.flash)).toBe(110);
    expect(chroma(OFF_BRAND.reserved)).toBe(84);
    expect(chroma(T.gold)).toBe(95);
    for (const h of Object.values(OFF_BRAND)) expect(chroma(h)).toBeGreaterThan(58);
    // still warm-ordered, so the TEMPERATURE rule never caught them — only the
    // saturation ceiling did. Both are gold family: one brighter, one darker.
    for (const h of Object.values(OFF_BRAND)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
      expect(r >= g && g >= b).toBe(true);
    }
  });

  test('⚠⚠ check:gold cannot see either of them, which is why this had to be measured by hand', () => {
    const gate = readFileSync(join(ROOT, 'scripts', 'check-gold.mjs'), 'utf8');
    expect(gate).toContain("/'#c9a86a'/gi");
    for (const h of Object.values(OFF_BRAND)) expect(gate).not.toContain(h);
    // and they are live in the shipped screen, not dead code
    for (const h of Object.values(OFF_BRAND)) expect(INVENTORY).toContain(h);
  });

  test('⚠ so the kit carries three states, and none of them is an off-brand gold', () => {
    const block = KIT.slice(KIT.indexOf('rowChassis:'), KIT.indexOf('// ── TScreenHeader'));
    for (const h of Object.values(OFF_BRAND)) expect(block).not.toContain(h);
    expect(Object.keys(kit).filter((k) => /^row[A-Z]/.test(k)).sort())
      .toEqual(['rowBlocked', 'rowChassis', 'rowMuted', 'rowSelected']);
  });

  test('⚠⚠ and the question is written down where the answer will be needed', () => {
    // The owner's legacy-hunt rule: every survivor is classified, not skipped.
    // This one is "open question", and it is recorded in the file the next pass
    // will have open rather than only in a commit message.
    expect(KIT).toContain('off-brand golds for row states');
    expect(KIT).toContain('OTA-1100');
  });
});

// ═══ 3b. THE ORDER, WHICH IS SETTLED EVEN THOUGH TWO STATES ARE ABSENT ═══════
describe('the order is the shipped precedence', () => {
  test('the dim states come before the border state, and paint the same either way', () => {
    const fn = KIT.slice(KIT.indexOf('export function tRowStyle'), KIT.indexOf('const kit = StyleSheet.create'));
    expect(fn.indexOf('rowMuted')).toBeLessThan(fn.indexOf('rowBlocked'));
    expect(fn.indexOf('rowBlocked')).toBeLessThan(fn.indexOf('rowSelected'));
  });

  test('⚠ the ruling for the states that are NOT here survives in the helper', () => {
    /* If it lived only in this commit message, the pass that adds them would
     * re-derive it — and my first draft proves that derivation goes wrong. */
    const doc = KIT.slice(KIT.indexOf('export interface TRowState') - 2400, KIT.indexOf('export function tRowStyle'));
    expect(doc).toContain('selected > reserved > flash');
  });
});

// ═══ 4. THE TWO ADOPTIONS ════════════════════════════════════════════════════
describe('Vendor and Crafting adopted it and left nothing behind', () => {
  test('both import the chassis', () => {
    for (const s of [VENDOR, CRAFT]) {
      /* ⚠ LOOSENED BY OTA-1762, AND THIS ONE WAS MY OWN FAULT. I pinned the
       * exact import LIST, so the next primitive either screen adopted broke a
       * suite that has nothing to do with it. What this suite is entitled to
       * claim is that the screen imports the chassis — not that it imports
       * nothing else. */
      expect(s).toMatch(/import \{[^}]*\btRowStyle\b[^}]*\} from '\.\.\/ui\/tartariaKit'/);
    }
  });

  test('⚠⚠ the styles they replaced are DELETED, not orphaned', () => {
    // Orphaned rules are how the old language creeps back, and how a later
    // reader concludes the screen still owns its own row.
    for (const n of ['offerRow', 'offerRowPicked']) {
      expect(VENDOR).not.toMatch(new RegExp(`\\n  ${n}: [\\{\\s]`));
      expect(VENDOR).not.toContain(`styles.${n}`);
    }
    for (const n of ['recipeRow', 'recipeRowMuted', 'recipeRowPicked', 'recipeRowStarved']) {
      expect(CRAFT).not.toMatch(new RegExp(`\\n  ${n}: [\\{\\s]`));
      expect(CRAFT).not.toContain(`styles.${n}`);
    }
  });

  test('Vendor’s four rows all route through the chassis', () => {
    // three plain (buy, learn-recipe, reinforce) and one selectable (sell)
    expect((VENDOR.match(/style=\{tRowStyle\(\)\}/g) ?? []).length).toBe(3);
    expect(VENDOR).toContain('style={tRowStyle({ selected: sellSelected.includes(item.id) })}');
  });

  test('⚠⚠⚠ Crafting’s three states map onto the vocabulary WITHOUT changing what paints', () => {
    /* Shipped: [recipeRow, !available && Muted, picked && Picked, starved && Starved].
     * Note the shipped order puts Starved AFTER Picked while the helper puts
     * blocked BEFORE selected — which is safe only because they touch disjoint
     * properties, and safe at all only because muted and starved are mutually
     * exclusive by construction (`groupStarved = groupBlocked && r.available`,
     * `muted = !r.available`). Both facts are asserted rather than assumed. */
    expect(CRAFT).toContain('muted: !r.available');
    expect(CRAFT).toContain('blocked: groupStarved');
    expect(CRAFT).toContain('selected: groupPicked');
    expect(CRAFT).toMatch(/groupStarved = groupBlocked && r\.available/);
    // disjoint: the dim state sets only opacity, the picked state never does
    expect(Object.keys(flatten(kit.rowBlocked))).toEqual(['opacity']);
    expect(Object.keys(flatten(kit.rowSelected)).sort()).toEqual(['backgroundColor', 'borderColor']);
    // and therefore either order paints the same thing
    expect(flatten([kit.rowChassis, kit.rowSelected, kit.rowBlocked]))
      .toEqual(flatten(tRowStyle({ blocked: true, selected: true })));
  });

  test('⚠⚠ OTA-258’s scoping SURVIVES, and its name was fixed rather than kept', () => {
    /* The broke-dim belongs to the BUY BODY, not the row: dimming the row also
     * dimmed the STEAL button, which is backwards affordance — stealing is what
     * a broke player reaches for. The style was called `offerRowBroke` and had
     * never applied to a row. Adopting a ROW chassis beside a body style called
     * `…Row…` is exactly how the next reader gets it wrong, so it is now
     * `offerBodyBroke`. This is a rename, not a behaviour change. */
    expect(VENDOR).not.toContain('offerRowBroke');
    expect(VENDOR).toContain('offerBodyBroke: { opacity: 0.45 },');
    expect((VENDOR.match(/styles\.offerBody, [^\]]*styles\.offerBodyBroke/g) ?? []).length).toBe(3);
    // ⚠ and it is NOT routed through rowBlocked, though the value matches: it is
    // a different element. Same number, different meaning.
    expect(VENDOR).not.toMatch(/offerBody, [^\]]*tRowStyle/);
  });
});

// ═══ 5. WHAT WAS DELIBERATELY LEFT ALONE ═════════════════════════════════════
describe('the rows that did not converge were left alone', () => {
  test('⚠ Contracts keeps its card — a padded block is not a line', () => {
    const contracts = read('app', 'screens', 'ContractsScreen.tsx');
    expect(contracts).not.toContain('tRowStyle');
    expect(contracts).toMatch(/card: \{[\s\S]{0,320}?padding/);
  });

  test('⚠ Inventory is NOT adopted, and the reasons are two measured disagreements', () => {
    /* It carries a third border state (`rowSelected`, the quiet reserved tick)
     * that Vendor and Crafting have no equivalent of, and its row sits 2px
     * tighter. Both are decisions for the pass that owns Inventory. The
     * third state is an off-brand gold the kit's palette rule refuses (section 3),
     * so its adoption needs a colour decision made in the open — and adopting a
     * fourth screen in a commit about two would put a visible 2px change under a
     * claim that nothing moves. */
    expect(INVENTORY).not.toContain('tartariaKit');
    expect(INVENTORY).toMatch(/rowSelected: \{\n\s+borderColor: '#9c8348',/);
    expect(INVENTORY).toMatch(/marginBottom: 4,/);
  });

  test('the kit gained a chassis, not a component', () => {
    expect(KIT).not.toMatch(/export function TRow\b/);
    expect(KIT).toContain('export function tRowStyle');
    expect(KIT).toContain('WHY IT IS NOT A COMPONENT');
  });
});

// ═══ 6. WHAT THE RENDER SAID, AND WHAT IT COULD NOT REACH ════════════════════
describe('the before/after render, and its honest limit', () => {
  test('⚠⚠⚠ the harness can open a screen STATE, not just a screen', () => {
    /* OTA-1758's harness could open a screen. These rows live behind a TAB, so
     * it could not photograph them at all, and "nothing moves" would have been
     * an untested claim for the second pass running. `--tap=` and `--row=` are
     * the instrument that made the comparison possible; they are Tier 1's
     * regression tool, not this pass's convenience. */
    const H = readFileSync(join(ROOT, 'scripts', 'render-roster.mjs'), 'utf8');
    expect(H).toContain("--tap=");
    expect(H).toContain("--probe=rows");
  });

  test('⚠⚠ and the stub calls ABSENT `null`, because `undefined !== null` is true', () => {
    /* Found while trying to photograph this. Unknown nouns returned `undefined`,
     * which is falsy — but the screens spell the absent test both ways, and
     * Crafting's "Strip these for parts?" is `visible={x !== null}`. It sat over
     * the whole screen. `null` satisfies both spellings. Harness only: this file
     * is never bundled unless TARTARIA_WEB_HARNESS=1. */
    const STUB = readFileSync(join(ROOT, 'web-harness', 'gameStoreStub.js'), 'utf8');
    expect(STUB).toContain('ACTIONish.test(String(k)) ? noop : null');
    expect(STUB).toContain('HARNESS ONLY');
  });

  test('⚠⚠⚠ VENDOR IS NOT RENDER-VERIFIED, AND THAT IS STATED RATHER THAN GLOSSED', () => {
    /* Crafting's REPAIR tab was photographed from the real exported bundle
     * before and after, and every element in the row's DOM chain reported the
     * SAME geometry — [12,308.5,387,195], [17,309.5,381,89], [27,319.5,361,16.5]
     * — so for that screen "nothing moves" is measured, not asserted.
     * Vendor could NOT be reached: the harness stub has no vendor NPC, so the
     * shell's own overlay intercepts before the screen renders. Its change is
     * the simpler of the two (a plain style became an array, the pattern used at
     * hundreds of sites in that same file including ones this pass did not
     * touch, and its selected row was ALREADY an array) — but simpler is not
     * verified, and the difference is worth keeping visible. This test exists so
     * the gap is a fact in the suite rather than a sentence in a commit nobody
     * re-reads. It comes out when the stub can seat a vendor. */
    const STUB = readFileSync(join(ROOT, 'web-harness', 'gameStoreStub.js'), 'utf8');
    expect(STUB).toContain('vendorState: {}');
    expect(STUB).not.toContain('vendorNpc');
  });
});

describe('the gate and the stamp', () => {
  test('⚠ check:gold ratchets DOWN to the new measured count', () => {
    /* ⚠⚠ LOOSENED BY OTA-1762, ALSO MY OWN FAULT AND THE MORE INSTRUCTIVE ONE.
     * I pinned the ratchet's CURRENT VALUE (373) from a suite that is about
     * rows. A ratchet is designed to keep falling, so pinning its value here
     * guaranteed a false failure on the very next conversion — and `ota1757`
     * already owns the baseline's correctness. What THIS suite is entitled to
     * claim is that OTA-1759's step is recorded in the ledger and that the
     * number has not gone back UP since. */
    const gate = read('scripts', 'check-gold.mjs');
    expect(gate).toContain('OTA-1759');
    const now = Number(/const BASELINE = (\d+);/.exec(gate)?.[1] ?? NaN);
    expect(now).toBeLessThanOrEqual(373);
  });

  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1759-one-row'");
  });
});
