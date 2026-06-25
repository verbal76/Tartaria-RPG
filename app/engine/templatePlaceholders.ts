// engine_Dev — TEMPLATE-FLAG detection.
//
// When unfilled TEMPLATE material reaches the PLAYER, the UI tints it PINK so the author
// instantly knows "this is still a template default — go find the template and fill it
// in." Phase 1 (here) flags literal scaffold placeholders: the all-caps REPLACE markers,
// the bundle's default identity strings, and the generic sample-row names. Phase 2 will
// flag un-overridden built-in DEFAULTS (provenance) and will reuse this same color.
//
// The runtime DEFAULT game is unaffected — this only changes how flagged text is TINTED.

import { GENERIC_TABLE_ROWS } from './genericTemplateData';

/** The TEMPLATE-FLAG tint — a hot pink that can't be mistaken for normal narration. */
export const TEMPLATE_FLAG_COLOR = '#ff4fb0';

// All-caps scaffold markers that ONLY occur in an unfilled template (REPLACE,
// REPLACE-with-a-faction-id, REPLACE:, REPLACE the story…). Matched CASE-SENSITIVELY so
// ordinary prose ("you replace the sword") never trips it. `g` for span scanning.
const REPLACE_MARKER = /REPLACE\b[\w-]*/g;

/** Bundle identity defaults — if still these, the field is unfilled. */
export const IDENTITY_PLACEHOLDERS: readonly string[] = [
  'My Game', 'My World', 'A world of your making.',
];

// Generic sample-row NAMES (Worn Sword, Common Residue, …). If an author loaded the
// scaffold and left a row unrenamed, its name is an unfilled placeholder. Collected from
// the generic rows themselves so the set never drifts from the templates.
const GENERIC_ROW_NAMES: ReadonlySet<string> = new Set(
  Object.values(GENERIC_TABLE_ROWS as Record<string, unknown[]>)
    .flat()
    .map((r) =>
      r && typeof r === 'object' && 'name' in r ? String((r as { name: unknown }).name).trim() : '',
    )
    .filter((n) => n.length > 0),
);

/** True when an ENTIRE field is a known unfilled placeholder. Exact (trimmed) match, so
 *  it is safe on names/identity values without prose false positives. Used at name render
 *  points and as a building block for Phase-2 provenance flagging. */
export function isTemplatePlaceholder(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (/\bREPLACE\b/.test(t)) return true;
  if (IDENTITY_PLACEHOLDERS.includes(t)) return true;
  return GENERIC_ROW_NAMES.has(t);
}

/** Split a line into spans, flagging the placeholder SUBSTRINGS that are safe to match
 *  inside prose (the all-caps REPLACE markers). Returns `[{ text, flag }]`; callers tint
 *  `flag` spans with TEMPLATE_FLAG_COLOR. Always returns at least one span. */
export function splitOnPlaceholders(text: string): Array<{ text: string; flag: boolean }> {
  const spans: Array<{ text: string; flag: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  REPLACE_MARKER.lastIndex = 0;
  while ((m = REPLACE_MARKER.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index), flag: false });
    spans.push({ text: m[0], flag: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), flag: false });
  return spans.length ? spans : [{ text, flag: false }];
}

/** Whether a line contains any prose-safe placeholder marker (cheap pre-check so the
 *  feed can keep its single-Text fast path when there's nothing to flag). */
export function hasInlinePlaceholder(text: string): boolean {
  return /REPLACE\b/.test(text);
}
