/**
 * OTA-1788 — THE UTILITY MARKS ARE OURS.
 *
 * Owner, from an actual device: *"The actual-device Take/Salvage surface still
 * uses generic-looking symbolic marks that do not belong to the illustrated
 * Tartaria glyph vocabulary."*
 *
 * ⚠⚠⚠ THE REFERENCE PACK CHANGED THE ANSWER, AND SAVED A COMMISSION. My reported
 * plan was to DRAW these marks in Views, on OTA-1748's precedent. The pack's
 * asset policy overruled it: *"Use the existing glyph library. Do not generate
 * or commission another weapon-glyph vocabulary... Use util_salvage.png as the
 * existing-pack candidate for salvage instead of inventing new crossed-tools
 * art."* Both files here were SELECTED from the owner's shipped packs and
 * renamed semantically — nothing was drawn.
 *
 * ⚠⚠ THE CHARACTERS THEY REPLACE HAD A REAL DEFECT, not merely a look. `⚒`
 * (U+2692) is exactly the case OTA-1748 documented for `⚙`: it carries an EMOJI
 * PRESENTATION VARIANT, so on an Android build whose font fallback reaches the
 * colour emoji font first it renders as a colour sticker and ignores `color`
 * entirely. That is why this is a defect fix and not a restyle.
 *
 * ⚠ AND THE COMPARISON MARKS ARE DELIBERATELY UNTOUCHED. The pack: *"For
 * superior/inferior comparison marks: do NOT invent new art during this pass.
 * Keep the current safe comparison marks unless a clearly suitable EXISTING
 * library glyph is found during the asset trace. If a replacement is obvious
 * from the existing packs, wire it consistently; otherwise leave the current
 * pixels and report the mapping gap."* The supplied set contains no up/down
 * pair. So ▲/▼ keep their pixels and the gap is REPORTED — asserted below, so
 * a later pass cannot quietly invent one.
 */
import fs from 'node:fs';
import path from 'node:path';

import { utilityArt, UTILITY_ART_SIZE } from '../app/engine/utilityGlyphArt';
import { gatherIcon, gatherIconArt } from '../app/engine/gatherSort';
import { GLYPH_ART_SIZE } from '../app/engine/combatGlyphArt';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const bin = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p));

const TABLE = 'app/engine/utilityGlyphArt.ts';
const MODAL = 'app/components/GatherModal.tsx';
const INPUT_BOX = 'app/components/InputBox.tsx';

/** PNG header reader — width/height out of the IHDR, no decoder needed. */
function png(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('OTA-1788 — the assets, as shipped', () => {
  it('two files, at the 128px standard the combat glyphs already use', () => {
    const files = fs.readdirSync(path.join(ROOT, 'assets', 'ui-glyphs')).filter((f) => f.endsWith('.png')).sort();
    expect(files).toEqual(['glyph_key.png', 'salvage.png']);
    for (const f of files) {
      const p = png(bin('assets', 'ui-glyphs', f));
      expect([f, p.w, p.h]).toEqual([f, 128, 128]);
    }
  });

  it('both resolve through the table, and an unknown name resolves to nothing', () => {
    expect(utilityArt('salvage')).toBeDefined();
    expect(utilityArt('glyph_key')).toBeDefined();
    expect(utilityArt('nonsense')).toBeUndefined();
    expect(utilityArt(null)).toBeUndefined();
    expect(utilityArt(undefined)).toBeUndefined();
  });

  /* ⚠⚠⚠ TWO FAMILIES, TWO TABLES — the pack's own ruling: *"Do not replace the
   * damage/coating/discovery glyph family already shipped yesterday. Those
   * remain the authority for damage, coatings and discovery."* A damage glyph
   * answers WHAT KIND OF HARM; a utility glyph answers WHAT THIS CONTROL DOES.
   * Neither file may reach into the other's directory. */
  it('the utility table does not touch the combat-glyph family, or the reverse', () => {
    expect(read(TABLE)).not.toContain('assets/combat-glyphs');
    expect(read('app/engine/combatGlyphArt.ts')).not.toContain('assets/ui-glyphs');
  });

  /* ⚠ ONE require() SITE, the same rule `combatGlyphArt` carries: the owner's
   * standing instruction is to keep an icon mapping centralised rather than
   * letting each surface grow its own. */
  it('nothing outside the table requires a ui-glyph directly', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const offenders = walk(path.join(ROOT, 'app'))
      .filter((f) => fs.readFileSync(f, 'utf8').includes('assets/ui-glyphs'))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([TABLE]);
  });
});

describe('OTA-1788 — salvage is artwork; everything else keeps its character', () => {
  /* ⚠ `scenery` IS THE SALVAGE ROW, and the first cut of this test used a kind
   * called `scrap` that does not exist. It passed anyway — `gatherIcon` returns
   * `⚒` as its FALL-THROUGH, so a fictional kind produced the right answer for
   * the wrong reason. `typecheck:tests` caught it. The lanes are named `scrap`
   * in the UI and the KIND is `scenery`; conflating them is exactly the sort of
   * near-miss a fixture invents. */
  const salvageRow = { kind: 'scenery' as const, upgrade: false, verdict: null };

  it('the salvage row resolves art, and still has its character as the fallback', () => {
    expect(gatherIconArt(salvageRow)).toBe('salvage');
    expect(gatherIcon(salvageRow)).toBe('⚒');
  });

  /* ⚠⚠ THE NEGATIVE IS THE POINT OF THIS PASS. Only salvage was supplied, so
   * only salvage moves. A row that is a lead, an item or a piece of gear must
   * keep the mark it has. */
  it.each([
    ['weapon', { kind: 'weapon' as const, upgrade: false, verdict: null }],
    ['armor', { kind: 'armor' as const, upgrade: false, verdict: null }],
    ['other', { kind: 'other' as const, upgrade: false, verdict: null }],
    ['inert', { kind: 'inert' as const, upgrade: false, verdict: null }],
    ['lead', { kind: 'lead' as const, upgrade: false, verdict: null }],
  ])('a %s row resolves no art', (_name, row) => {
    expect(gatherIconArt(row)).toBeNull();
  });

  /* ⚠⚠ AND NEITHER DOES A VERDICT ROW, which is the case the comparison-mark
   * ruling is actually about: an ▲/▼ verdict outranks the kind inside
   * `gatherIcon`, so a scenery row carrying a verdict is NOT a salvage row and
   * must not wear the salvage artwork. */
  it.each([
    ['up', 'up' as const],
    ['down', 'down' as const],
    ['empty', 'empty' as const],
  ])('a %s verdict outranks the kind and resolves no art', (_name, state) => {
    const row = { kind: 'scenery' as const, upgrade: false, verdict: { state, slot: 'main' } as never };
    expect(gatherIconArt(row)).toBeNull();
  });

  /* ⚠⚠⚠ THE MAPPING GAP, PINNED SO IT CANNOT BE QUIETLY FILLED. The owner's
   * up/down instruction is to leave the current pixels and report. If a later
   * pass adds a `superior`/`inferior` entry without a supplied asset, this
   * fails and asks for the ruling. */
  it('there is no up/down artwork — the comparison marks are still characters', () => {
    expect(utilityArt('superior')).toBeUndefined();
    expect(utilityArt('inferior')).toBeUndefined();
    const modal = read(MODAL);
    expect(modal).toContain('iconBetter');
    expect(modal).toContain('iconWorse');
    expect(read('app/engine/gatherSort.ts')).toContain("=== 'up') return '▲'");
    expect(read('app/engine/gatherSort.ts')).toContain("=== 'down') return '▼'");
  });

  /* ⚠ AND REPAIR KEEPS `⚒` TOO. The character is doing double duty: SALVAGE in
   * the loot picker, REPAIR in the crafting screen. Only the salvage half was
   * ruled on, so only the salvage half moves — which makes the two verbs
   * visually distinct for the first time. Recorded, not assumed. */
  it('the crafting screen still spells REPAIR with the character', () => {
    expect(read('app/screens/CraftingScreen.tsx')).toContain('⚒ REPAIR');
  });
});

describe('OTA-1788 — the cells did not move', () => {
  const modal = read(MODAL);

  /* The artwork sits in the SAME 28dp cell the character held, so a salvage row
   * lines up with the take rows above and below it. */
  it('the art cell is the width the character cell had', () => {
    expect(modal).toContain("icon: { fontSize: 20, fontWeight: '700', width: 28 },");
    const art = /iconArt: \{[^}]*\}/.exec(modal)?.[0] ?? '';
    expect(art).toContain('width: 28');
    expect(art).toContain('height: UTILITY_ART_SIZE.row');
  });

  /* ⚠⚠ A UTILITY MARK IS SMALLER THAN A DAMAGE GLYPH, DELIBERATELY. 28 is the
   * damage glyph's size — set for a weapon button and for Lore's legend, where
   * the mark IS the subject. A utility mark labels a control whose WORD is the
   * subject, and the pack says the same about the transcript: *"Do not blindly
   * force 28dp if this context demonstrably requires a smaller governed
   * density."* */
  it('utility marks are subordinate to the damage glyph size', () => {
    expect(UTILITY_ART_SIZE.row).toBeLessThan(GLYPH_ART_SIZE.combat);
    expect(UTILITY_ART_SIZE.chip).toBeLessThan(GLYPH_ART_SIZE.combat);
  });

  /* ⚠ AND IT DOES NOT GROW THE CHIP. At 16 the mark fits inside the 12pt
   * label's own line box, so a chip wearing one is the same height as the chip
   * beside it — OTA-1767's discipline, which refused to widen the shared chip
   * padding for a problem only weapon chips had. */
  it('a chip mark fits inside the chassis line box', () => {
    const CHASSIS_PT = 12;
    expect(UTILITY_ART_SIZE.chip).toBeLessThanOrEqual(Math.ceil(CHASSIS_PT * 1.4));
  });
});

describe('OTA-1788 — the glyph key control wears the book', () => {
  const code = read(INPUT_BOX);
  const chip = (code.match(/<QuickBtn[\s\S]*?\/>/g) ?? []).find((t) => t.includes('armLoreJump')) ?? '';

  it('it opts in by name, through the shared prop', () => {
    expect(chip).toContain('utility="glyph_key"');
    expect(chip).toContain('label="glyph key"');
  });

  /* ⚠⚠ THE UTILITY PROP IS NOT THE GLYPH PROP, and that separation is the whole
   * reason it is a second prop rather than a reuse of `glyphs`. The damage
   * glyphs carry colour, order, a set-off and a discovery star; a utility mark
   * carries none of that and must never be read as a damage family. */
  it('it is not carrying damage glyphs', () => {
    for (const forbidden of ['glyphs=', 'baseGlyph=', 'glyphText=', 'tone=']) {
      expect(chip).not.toContain(forbidden);
    }
  });

  /* OTA-1783's navigation and OTA-1787's placement both survive an icon. */
  it('the return architecture and the utility-row placement are unchanged', () => {
    expect(chip).toContain("armLoreJump({ section: 'glyphs', returnTo: useGameStore.getState().currentScreen })");
    expect(chip).toContain("setScreen('lore')");
    expect(chip).not.toContain('onSubmit');
  });

  /* ⚠ EVERY OTHER CHIP TAKES THE SAME PATH AND MUST BE UNCHANGED. The flat-label
   * branch became a row so a mark could lead the word; with no mark it is a row
   * of one, which lays out exactly as the bare Text did. */
  it('only the glyph key opts in — no other chip carries a utility mark', () => {
    const flagged = (code.match(/<QuickBtn[\s\S]*?\/>/g) ?? []).filter((t) => /\sutility=/.test(t));
    expect(flagged).toHaveLength(1);
  });
});
