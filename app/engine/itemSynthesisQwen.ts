// itemSynthesisQwen — call Qwen 2.5 0.5B for a balanced stat row
// when the static-inference path in `itemDefaults.ts` doesn't
// confidently classify an item from its name keyword. Output is
// validated, clamped against an upper bound (Qwen can't accidentally
// generate a +20 INT amulet), and cached install-lifetime via
// `itemSynthesisCache.ts`.
//
// Pattern mirrors `app/engine/llmParser.ts` — the existing Qwen-
// backed parser fallback. Same structured-JSON-extraction shape,
// same defensive parsing (`extractJsonObject`), same "fail closed"
// rule: any anomaly returns null and the caller falls back to the
// static-inference row.
//
// The call is fire-and-forget on FIRST encounter with an item name:
// the player's immediate interaction uses the static row, and the
// Qwen result lands in the cache for the NEXT inventory open. This
// avoids blocking on hot paths and mirrors how `narrateViaArbiter`
// defers to template lines while the LLM warms up.

import type { ItemEffect, StatKey } from './itemEffect';
import { getCachedSynth, setCachedSynth, type SynthesizedItem } from './itemSynthesisCache';
import { noteQwenDiscarded } from '../ai/generation/qwenTelemetry';

/** Minimal Qwen interface — same shape as llmParser.ts so tests can
 *  pass a mock without dragging in the full LlamaRuntime stack. */
export interface ItemSynthEngine {
  isReady(): boolean;
  generate(
    messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    opts?: { maxNewTokens?: number; temperature?: number; job?: string },
  ): Promise<string>;
}

/** Hard ceilings applied to every numeric the model returns. Defense
 *  in depth — Qwen 0.5B is well-behaved at temperature 0.1 but should
 *  never be trusted to balance loot. */
const CLAMPS = {
  healHP: 10,
  restoreStamina: 8,
  reduceCorruption: 5,
  extendLight: 8,
  buffBonus: 2,
  buffDuration: 6,
  passiveBonus: 2,
} as const;

const STAT_KEYS: readonly StatKey[] = [
  'strength', 'dexterity', 'intelligence', 'wisdom', 'charisma',
];

const KNOWN_KINDS = ['weapon', 'armor', 'accessory', 'consumable', 'misc', 'relic'] as const;

/** Synchronous cache lookup — call BEFORE deciding to fire the LLM.
 *  Returns the cached row if Qwen has already balanced this name. */
export function readSynthCache(name: string): SynthesizedItem | null {
  return getCachedSynth(name);
}

/** Synthesize a stat overlay for `name` via Qwen. Fire-and-forget —
 *  the result lands in the cache for the NEXT lookup. Returns
 *  immediately with `null` if Qwen isn't ready, the response can't
 *  be parsed, or the clamp / validation rejects the row.
 *
 *  Idempotent on the cache key — calling twice with the same name
 *  doesn't double-spend the model; the second call short-circuits
 *  on `getCachedSynth`. */
export async function synthesizeItemViaQwen(
  name: string,
  hintTags: readonly string[],
  qwen: ItemSynthEngine,
): Promise<SynthesizedItem | null> {
  if (!qwen.isReady()) return null;

  // Don't re-synth if we already have a cached row for this name.
  const cached = getCachedSynth(name);
  if (cached) return cached;

  // ⚠ OTA-1132 — THE PROMPT WAS A SPECIFICATION, AND IT GOT A SPECIFICATION
  // BACK. The OTA-1131 log ran this job three times and every one failed:
  //   item_synthesis n3 avg13.7s max19.6s in310t→out119t cap2 ∅1 ✂2/32.2s
  // 41 seconds, three `item_synth:unparseable`, nothing cached. Two of the
  // three ran into the 180-token cap having written 472 and 488 characters
  // without ever closing an object — which for a shape that needs ~200 means
  // the model was not writing one row, it was elaborating.
  //
  // The old brief handed it a multi-line schema with a SIX-FIELD nested
  // effect object and six prose rules, then asked for "ONLY a single JSON
  // object on one line". A 0.5B model given a big shape fills the big shape:
  // it opens `effect`, works through every field it was shown, and the cap
  // arrives before the braces close.
  //
  // So the shape shrinks to what the validator actually reads, on ONE line,
  // with the rules folded into it as inline hints rather than a separate
  // section. ~900 → ~430 characters (≈310 → ≈150 prompt tokens), which is
  // also prefill this job pays on every single call.
  // ⚠ OTA-1138 — THE PIPES WERE THE BUG. OTA-1132 shrank this prompt and gave
  // the discard reason the raw text, and the very next device log paid that
  // off by showing what actually fails:
  //   item_synthesis ok 10374ms … in 219t→out 239t HIT-CAP (604ch)
  //   ✂ DISCARDED — item_synth:unparseable (604ch)
  //     raw="{"kind":"misc|invented|lorem|quest|tool|misc|misc|misc|misc|…"
  // The model was not running out of room and it was not elaborating. It opened
  // `"kind":"` and then COPIED THE ALTERNATION IT HAD JUST BEEN SHOWN, pipe by
  // pipe, until the 240-token cap stopped it. `weapon|armor|accessory|…` is
  // schema notation to a human and a LITERAL STRING VALUE to a 0.5B model — it
  // is inside the quotes, in the value position, in an object it was told to
  // imitate. Of course it continued the pattern; the example told it to.
  //
  // ⚠ So NO ALTERNATION EVER APPEARS INSIDE THE JSON. The example is now a
  // CONCRETE, VALID OBJECT — one it can copy verbatim and be right — and the
  // allowed values live in prose beside it, where a pipe cannot be mistaken for
  // content. Same fields, same validator, ~same length. This is the third
  // consecutive OTA on this job, and it is the first one aimed at the actual
  // failure rather than at its symptoms (180 → 240 tokens, then a smaller
  // shape); both of those were reasonable reads of the evidence available at
  // the time, and neither would have helped, because a model looping on `|`
  // will loop on `|` in any budget at any size.
  const systemPrompt = [
    'Stat-balance one item for a text RPG. Reply with ONE line: a single JSON object, nothing before or after it.',
    'Example of a correct reply:',
    '{"kind":"misc","description":"A coil of tarred rope, stiff with age.","extraTags":["fiber"]}',
    'Allowed "kind" values, pick exactly one: weapon, armor, accessory, consumable, misc, relic.',
    'Allowed "extraTags" values, pick one or two: organic, metal, fiber, stone, glass.',
    'Omit "effect" unless the item clearly does something. When present, use exactly one shape:',
    'food, drink, potion, tonic or fungus takes {"kind":"consumable","healHP":4,"restoreStamina":3} with healHP 1 to 10 and restoreStamina 1 to 8;',
    'an amulet, ring, charm or locket takes {"kind":"passive","stat":"wisdom","bonus":1} where stat is one of strength, dexterity, intelligence, wisdom, charisma and bonus is 1 or 2.',
    'Tools, rope, lanterns and compasses are "misc" with extraTags and no effect.',
  ].join('\n');

  const userPrompt = [
    `Item name: "${name}".`,
    hintTags.length > 0 ? `Hints from static inference: ${hintTags.join(', ')}.` : '',
    'Return the JSON.',
  ].filter(Boolean).join('\n');

  let raw: string;
  try {
    raw = await qwen.generate(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      // OTA-1132 — 180 was guaranteeing failure: two of three calls in the
      // OTA-1131 log spent the entire budget and still had an open brace. The
      // leaner shape above should make the extra headroom unnecessary in the
      // normal case, and a cap only costs time when it is actually reached —
      // so this is insurance, not a decision to generate more.
      { maxNewTokens: 240, temperature: 0.1, job: 'item_synthesis' },
    );
  } catch {
    return null;
  }

  // OTA-1132 — an empty return is a DIFFERENT failure from an unparseable
  // one and must not be filed under it. The OTA-1131 log has
  // `item_synthesis empty 8809ms read 0ms/write 0ms in 309t→out 0t` moments
  // before the watchdog reported "Qwen dormant … the native context was
  // released" — that is the dormancy bug, not a model that wrote bad JSON,
  // and calling it `unparseable` would have sent the next investigation at
  // the parser.
  if (!raw.trim()) {
    noteQwenDiscarded('item_synth:empty');
    return null;
  }

  // ⚠ OTA-1131 — this was the app's most expensive silent failure. The
  // OTA-1130 device log caught one at `item_synthesis ok 9528ms … out 179t …
  // HIT-CAP (813ch)`: 179 tokens against a 180 cap, so generation was cut off
  // mid-object, and 813 characters for a shape that needs about 200 means the
  // model rambled past the JSON before the cap stopped it. Nine and a half
  // seconds, recorded as `ok`, thrown away without a word. Now the extractor
  // takes the first BALANCED object (surviving both the trailing ramble and a
  // truncated tail), and whatever still fails is reported as the waste it is.
  const obj = extractJsonObject(raw);
  if (!obj) {
    // ⚠ OTA-1132 — NAME THE CULPRIT INSTEAD OF GUESSING AT IT. OTA-1131 made
    // this failure visible and the next log showed it happening three times
    // out of three — but `unparseable` does not say WHETHER the model wrote
    // prose, opened a markdown fence, emitted two objects, or simply ran long.
    // The ambient ∅ mystery was closed the same way (OTA-1057) by printing
    // the raw text beside the verdict. The reason string rides the existing
    // discard sink into the debug channel, so this needs no new plumbing.
    // OTA-1138 — and now that the pipe loop is a KNOWN failure with a known
    // cause, it gets its own name. If it ever comes back, the next log should
    // say so in one word instead of making someone re-derive it from 160
    // characters of raw text. `unparseable` stays for everything else.
    const sample = raw.trim().replace(/\s+/g, ' ').slice(0, 160);
    const reason = looksLikeAlternationLoop(raw) ? 'item_synth:alternation-loop' : 'item_synth:unparseable';
    noteQwenDiscarded(`${reason} (${raw.length}ch) raw="${sample}"`);
    return null;
  }

  const validated = validateAndClamp(name, obj);
  if (!validated) {
    noteQwenDiscarded('item_synth:rejected-by-clamp');
    return null;
  }

  setCachedSynth(name, validated);
  return validated;
}

/** OTA-1138 — did the model fall into the pipe loop this OTA removed the cause
 *  of? The signature is a run of `|`-separated fragments where the SAME token
 *  keeps repeating: `"kind":"misc|invented|lorem|quest|tool|misc|misc|misc|…`.
 *  Three or more pipes with a repeat among the segments is the pattern; a
 *  legitimate reply has no pipes in it at all, so this cannot fire on good
 *  output. Purely a LABEL for the discard reason — it changes no behaviour. */
export function looksLikeAlternationLoop(raw: string): boolean {
  const bars = (raw.match(/\|/g) ?? []).length;
  if (bars < 3) return false;
  const segs = raw.split('|').map((t) => t.trim().toLowerCase()).filter(Boolean);
  return new Set(segs).size < segs.length;
}

/** Pull the first {...} block out of a possibly noisy LLM response
 *  and JSON.parse it. Same defensive pattern as llmParser.ts — Qwen
 *  occasionally wraps its JSON in markdown fences or adds a sentence
 *  of prose. Returns null on any failure.
 *
 *  ⚠ OTA-1131 — first-to-LAST brace was the bug. `raw.lastIndexOf('}')` is
 *  correct only when the response contains exactly one object. Two things in
 *  the device log break that:
 *
 *    - the model keeps talking after the JSON and emits a SECOND object (an
 *      example, a "here's another") — first-to-last then spans both plus the
 *      prose between them, and JSON.parse rejects the lot;
 *    - the 180-token cap cuts the response mid-object — the last `}` on the
 *      line is the nested "effect" object's, so the slice closes at the wrong
 *      depth and parse fails again.
 *
 *  Scanning for the first BALANCED object fixes both: it stops at the real end
 *  of object one and ignores everything after, and when a truncated response
 *  never balances it falls back to the old span rather than losing a response
 *  that the old code happened to handle. String-aware, because a brace inside
 *  the description ("a {strange} relic") must not move the depth counter. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  const parse = (slice: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(slice) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const c = raw[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return parse(raw.slice(start, i + 1));
    }
  }
  // Never balanced — truncated mid-object. Try the old span so a response the
  // previous extractor could read is not newly lost.
  const end = raw.lastIndexOf('}');
  return end > start ? parse(raw.slice(start, end + 1)) : null;
}

function clamp(v: unknown, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined;
  return Math.max(1, Math.min(max, Math.round(v)));
}

function asStatKey(v: unknown): StatKey | undefined {
  if (typeof v !== 'string') return undefined;
  const k = v.toLowerCase();
  return (STAT_KEYS as readonly string[]).includes(k) ? (k as StatKey) : undefined;
}

/** Validate the parsed JSON against the SynthesizedItem schema and
 *  clamp any numeric fields. Returns null if the row is unsalvageable
 *  (missing kind, invalid stat names, etc.). */
function validateAndClamp(name: string, raw: Record<string, unknown>): SynthesizedItem | null {
  const kindRaw = typeof raw.kind === 'string' ? raw.kind.toLowerCase() : '';
  if (!(KNOWN_KINDS as readonly string[]).includes(kindRaw)) {
    // We don't NEED kind to be set to enrich the row, but a Qwen
    // response missing kind is usually missing the rest too — bail.
    return null;
  }

  const out: SynthesizedItem = {
    name: name.toLowerCase(),
    synthesizedAt: Date.now(),
  };

  if (typeof raw.description === 'string' && raw.description.length > 0) {
    out.description = raw.description.slice(0, 280);
  }

  if (Array.isArray(raw.extraTags)) {
    const tags = raw.extraTags
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length > 0 && t.length <= 32)
      .slice(0, 8);
    if (tags.length > 0) out.extraTags = Array.from(new Set(tags));
  }

  if (raw.effect && typeof raw.effect === 'object') {
    const fx = raw.effect as Record<string, unknown>;
    const effectKind = typeof fx.kind === 'string' ? fx.kind.toLowerCase() : '';
    if (effectKind === 'passive') {
      const stat = asStatKey(fx.stat);
      const bonus = clamp(fx.bonus, CLAMPS.passiveBonus);
      if (stat && bonus) {
        out.effect = { kind: 'passive', stat, bonus };
      }
    } else if (effectKind === 'consumable') {
      const partial: ItemEffect = { kind: 'consumable' };
      const healHP = clamp(fx.healHP, CLAMPS.healHP);
      if (healHP) partial.healHP = healHP;
      const restoreStamina = clamp(fx.restoreStamina, CLAMPS.restoreStamina);
      if (restoreStamina) partial.restoreStamina = restoreStamina;
      const reduceCorruption = clamp(fx.reduceCorruption, CLAMPS.reduceCorruption);
      if (reduceCorruption) partial.reduceCorruption = reduceCorruption;
      const extendLight = clamp(fx.extendLight, CLAMPS.extendLight);
      if (extendLight) partial.extendLight = extendLight;
      const buffStat = asStatKey(fx.buffStat);
      const buffBonus = clamp(fx.buffBonus, CLAMPS.buffBonus);
      const buffDuration = clamp(fx.buffDuration, CLAMPS.buffDuration);
      if (buffStat && buffBonus && buffDuration) {
        partial.buffStat = buffStat;
        partial.buffBonus = buffBonus;
        partial.buffDuration = buffDuration;
      }
      // Only stash an effect if SOMETHING came through — empty
      // consumable objects are noise.
      if (Object.keys(partial).length > 1) {
        out.effect = partial;
      }
    }
    // Other effect kinds (gate, scanner) are intentionally not Qwen-
    // synthesized — they're gameplay-gating decisions that should
    // stay author-driven.
  }

  // Reject responses that contributed nothing on top of the static
  // inference. Caching an empty overlay would just take up space.
  if (!out.effect && !out.extraTags && !out.description) {
    return null;
  }

  return out;
}
