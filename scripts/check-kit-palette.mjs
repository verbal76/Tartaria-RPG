#!/usr/bin/env node
/**
 * OTA-1785 — THE KIT PALETTE RULE, AND THERE IS NOW EXACTLY ONE OF IT.
 *
 * VIS-1 set the rule and OTA-1742 wrote it down: every hex in `tartariaKit.tsx`
 * is a WARM NEUTRAL (r ≥ g ≥ b) or a NEAR-NEUTRAL of any temperature (chroma
 * ≤ 18), with a hard chroma ceiling of 60, and a short list of colours exempt
 * BY NAME because the owner ruled on each one.
 *
 * ⚠⚠⚠ IT WAS WRITTEN DOWN TWICE, AND THE SECOND COPY WAS WEAKER. `ota1744` had
 * its own version with FOUR exemptions instead of five and NO chroma ceiling —
 * so a colour could pass the copy and fail the original, and which one you found
 * out about depended on suite ordering. It also read the kit as raw text until
 * today, which meant a sentence describing a measurement could fail it. Neither
 * suite knew the other existed.
 *
 * ⚠⚠ CONSOLIDATED ONTO THE STRONGER RULE, WHICH IS A STRENGTHENING RATHER THAN
 * A COMPROMISE. Owner: *"Do not weaken the actual protections merely to make
 * the tests agree."* The five-name exemption list and the chroma ceiling are
 * both kept; `ota1744`'s weaker copy is the one that goes. Both suites now
 * consume this file, and each keeps its own sentence about why it cares.
 *
 * ⚠ AND IT IS A GATE NOW, not only a test. The palette rule used to be
 * enforceable only by a full surface run — fourteen minutes to learn that a hex
 * is the wrong temperature. It runs here in milliseconds.
 *
 * ⚠⚠ WHAT THIS CANNOT SEE, said plainly (the OTA-1455 lesson): colour written as
 * `rgb()`/`rgba()`, colour reached through a variable or a template string, and
 * colour inside an asset. The kit's translucent layers are deliberately rgba and
 * are governed by a different assertion — that they TINT rather than paint.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KIT = 'app/ui/tartariaKit.tsx';

/** ⚠⚠⚠ EXEMPT BY NAME, WHICH IS THE WHOLE POINT OF THE MECHANISM. The rule is
 *  not "warm colours are fine" — it is "one short list the owner has ruled on,
 *  and everything else obeys the arithmetic." A hex lands here after a decision,
 *  and the decision is written beside it. */
export const BRAND = new Set([
  'C9A86A', // the brand gold
  '8E7548', // dim gold
  'E07A5F', // rust
  '5A2A26', // rust rim
  'F0C96A', // OTA-1773 — the conversation frame; louder than the brand gold BY DESIGN.
            // OTA-1769 MEASURED it at chroma 134 and REFUSED to add it; the owner
            // ruled, and only then did it get a name. That order is the mechanism.
]);

/** A warm aged metal tops out around 58 (the lit rim); a real hue is past it. */
export const CHROMA_CEILING = 60;
/** Grey with a bias, not a hue — VIS-1-PHONE-FIX widened the rule by this one
 *  category, because machined alloy is COOL and the owner asked for alloy. */
export const NEAR_NEUTRAL = 18;

/* ⚠⚠⚠ STRIP COMMENTS BEFORE COUNTING — GRADE THE CODE, NOT THE PROSE. The kit's
 * own comments quote hexes that live in OTHER files (OTA-1782 wrote the four
 * measured control-face luminances into it, one of which is the combat strike
 * chip's green). A rule that can be tripped by writing a measurement down
 * teaches people not to write measurements down. */
export function stripComments(src) {
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

/** Every offending hex, with the arithmetic that condemned it. Empty = clean. */
export function offenders(src) {
  const hexes = [...stripComments(src).matchAll(/#([0-9A-Fa-f]{6})\b/g)].map((m) => m[1].toUpperCase());
  const bad = [];
  for (const h of hexes) {
    if (BRAND.has(h)) continue;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const warmOrdered = r >= g && g >= b;
    const nearNeutral = chroma <= NEAR_NEUTRAL;
    if (!(warmOrdered || nearNeutral)) bad.push({ h, chroma, why: 'neither warm-ordered nor near-neutral' });
    else if (chroma > CHROMA_CEILING) bad.push({ h, chroma, why: `chroma ${chroma} > ceiling ${CHROMA_CEILING}` });
  }
  return bad;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const src = fs.readFileSync(path.join(ROOT, KIT), 'utf8');
  const bad = offenders(src);
  if (bad.length) {
    console.error(`[check:kitpalette] FAIL — ${bad.length} hex(es) in ${KIT} break the palette rule.`);
    console.error('');
    console.error('Every hex is a warm neutral (r >= g >= b) or a near-neutral (chroma <= 18),');
    console.error(`and nothing exceeds chroma ${CHROMA_CEILING}. A colour that must break that is an OWNER`);
    console.error('DECISION and gets a NAME in this file, never an ungoverned literal.');
    console.error('');
    for (const x of bad) console.error(`  #${x.h}  ${x.why}`);
    process.exit(1);
  }
  const count = [...stripComments(src).matchAll(/#([0-9A-Fa-f]{6})\b/g)].length;
  console.log(`[check:kitpalette] OK — ${count} hexes in ${KIT}, ${BRAND.size} exempt by name`);
  console.log('  ⚠ blind to rgb()/rgba(), variables and assets; the translucent layers are governed elsewhere.');
}
