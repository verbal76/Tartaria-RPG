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
import {
  getCachedSynth, setCachedSynth, noteSynthRefused, wasSynthRefused, clearSynthRefusal,
  type SynthesizedItem,
} from './itemSynthesisCache';
import { noteQwenDiscarded, lastQwenCallPreempted } from '../ai/generation/qwenTelemetry';

/** Minimal Qwen interface — same shape as llmParser.ts so tests can
 *  pass a mock without dragging in the full LlamaRuntime stack. */
export interface ItemSynthEngine {
  isReady(): boolean;
  generate(
    messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    opts?: { maxNewTokens?: number; temperature?: number; job?: string; homework?: boolean; interruptible?: boolean },
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

/**
 * ⚠⚠ OTA-1411 — NEAR-MISS KINDS ARE COERCED, NOT BINNED. Fifth device log in a
 * row where this job threw work away, and the FIRST one where the model was not
 * really wrong:
 *
 *     item_synth:rejected-by-clamp bad-kind="tool"   ("Reclaimer's Rope")
 *     …and again, same item, 45 seconds later. ~10s of native lock, twice.
 *
 * A rope IS a tool. `tool` is simply not a word in `KNOWN_KINDS`, so a correct
 * answer was discarded on vocabulary. The four previous OTAs on this job all
 * rewrote the PROMPT (token cap, then shape, then the pipe loop, then the
 * nesting) on the premise that the model was getting it wrong. Here the
 * validator's dictionary is the thing that is short, and rewriting the brief a
 * fifth time would not have touched it.
 *
 * ⚠ COERCION IS DELIBERATELY TINY AND ONE-WAY. Only words with an unambiguous
 * home go in: nothing here changes what an item DOES, it only stops a legal
 * description being thrown away over a synonym. Anything genuinely unknown still
 * fails the clamp and still says so in the log.
 */
const KIND_SYNONYMS: Readonly<Record<string, typeof KNOWN_KINDS[number]>> = {
  tool: 'misc',
  utility: 'misc',
  material: 'misc',
  // ⚠⚠ OTA-1465 — the SAME miss this table was created to fix, one vocabulary
  // later. The owner's 2026-08-24 log rejected "Smooth Stone" three times on
  // `bad-kind="junk"`, and junk is a perfectly correct answer for a smooth
  // stone. Every word below is one a small model reaches for when the honest
  // answer is "this is ordinary stuff": still one-way, still changes nothing
  // about what an item DOES.
  junk: 'misc',
  trash: 'misc',
  scrap: 'misc',
  debris: 'misc',
  resource: 'misc',
  ingredient: 'misc',
  component: 'misc',
  part: 'misc',
  curio: 'misc',
  oddment: 'misc',
  keepsake: 'misc',
  supply: 'misc',
  drink: 'consumable',
  medicine: 'consumable',
  ration: 'consumable',
  jewelry: 'accessory',
  necklace: 'accessory',
  charm: 'accessory',
  shield: 'armor',
  clothing: 'armor',
  gear: 'accessory',
  trinket: 'accessory',
  amulet: 'accessory',
  ring: 'accessory',
  potion: 'consumable',
  food: 'consumable',
  artifact: 'relic',
};

/** The kind this row should be filed under, after synonym coercion. Returns ''
 *  when the word has no legal home — the clamp then rejects and names it. */
export function canonicalSynthKind(raw: unknown): string {
  const k = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if ((KNOWN_KINDS as readonly string[]).includes(k)) return k;
  return KIND_SYNONYMS[k] ?? '';
}

/** Synchronous cache lookup — call BEFORE deciding to fire the LLM.
 *  Returns the cached row if Qwen has already balanced this name. */
export function readSynthCache(name: string): SynthesizedItem | null {
  return getCachedSynth(name);
}

/** ⚠ OTA-1465 — re-exported through THIS module because the homework scanner
 *  reaches the synthesis job as one unit (`require('itemSynthesisQwen')`), and a
 *  caller should not have to know that "has it been described?" and "has it been
 *  refused?" happen to live in two different files. Both are asked at the same
 *  seam, one line apart; answering only half of them here is exactly the split
 *  that lets the other half be forgotten at the next call site. */
export { wasSynthRefused } from './itemSynthesisCache';

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
  // ⚠ OTA-1126 — HOMEWORK. The first real slot of the headroom track. When the
  // player is reading a menu rather than waiting on the engine, this runs
  // ahead of time so the item popup is already written when they open it.
  // Everything else is identical: same prompt, same clamps, same cache, same
  // silent discard on a bad row. The ONLY difference is that the call queues
  // below voice and is cut short the instant the player needs the model.
  opts?: { homework?: boolean },
): Promise<SynthesizedItem | null> {
  if (!qwen.isReady()) return null;

  // Don't re-synth if we already have a cached row for this name.
  const cached = getCachedSynth(name);
  if (cached) return cached;

  // ⚠ OTA-1109 — THE PROMPT WAS A SPECIFICATION, AND IT GOT A SPECIFICATION
  // BACK. The OTA-1108 log ran this job three times and every one failed:
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
  // ⚠ OTA-1115 — THE PIPES WERE THE BUG. OTA-1109 shrank this prompt and gave
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
  // ⚠ OTA-1134 — THE PROMPT TAUGHT THE MODEL TO FAIL ITS OWN VALIDATOR, and this
  // is the fourth consecutive OTA on this job. The previous three chased the
  // token cap, then the shape, then the pipe loop. Every device log since has
  // still shown the SAME outcome — four generations, four discards, all
  // `item_synth:rejected-by-clamp`, ~4 seconds each.
  //
  // The clamp has exactly two ways to reject, and the first is a `kind` outside
  // the allowed set. Read the old brief as a 0.5B model reads it:
  //
  //     Allowed "kind" values … weapon, armor, accessory, consumable, misc, relic
  //     … takes {"kind":"consumable","healHP":4,"restoreStamina":3}
  //     … takes {"kind":"passive","stat":"wisdom","bonus":1}
  //
  // The word "kind" names TWO different fields at two nesting levels, and the
  // inner ones are shown as BARE TOP-LEVEL OBJECTS. One of them is
  // `{"kind":"passive"…}` — and "passive" is not a legal top-level kind at all.
  // A small model copies the shape it was shown; the validator then rejects
  // exactly that shape. The prompt and the parser disagreed, and the prompt won.
  //
  // ⚠ THE FIX IS TO SHOW THE NESTING, NOT TO DESCRIBE IT. Every example is now a
  // COMPLETE reply with `"effect"` wrapped where it actually belongs, so there
  // is no bare object to copy and no ambiguity about which "kind" is which. The
  // allowed-values prose stays (it is what OTA-1115 replaced the pipe
  // alternation with, and the pipe loop has not returned since).
  const systemPrompt = [
    'Stat-balance one item for a text RPG. Reply with ONE line: a single JSON object, nothing before or after it.',
    'Top-level "kind" is required, pick exactly one: weapon, armor, accessory, consumable, misc, relic.',
    'Allowed "extraTags" values, pick one or two: organic, metal, fiber, stone, glass.',
    'Example reply with no effect:',
    '{"kind":"misc","description":"A coil of tarred rope, stiff with age.","extraTags":["fiber"]}',
    'Omit "effect" unless the item clearly does something. It is NESTED and has its own inner kind:',
    '{"kind":"consumable","description":"Thin broth, still warm.","extraTags":["organic"],"effect":{"kind":"consumable","healHP":4,"restoreStamina":3}}',
    '{"kind":"accessory","description":"A worn silver band.","extraTags":["metal"],"effect":{"kind":"passive","stat":"wisdom","bonus":1}}',
    'Food, drink, potions and fungus use the consumable effect: healHP 1 to 10, restoreStamina 1 to 8.',
    'Amulets, rings, charms and lockets use the passive effect: stat is one of strength, dexterity, intelligence, wisdom, charisma; bonus is 1 or 2.',
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
      // OTA-1109 — 180 was guaranteeing failure: two of three calls in the
      // OTA-1108 log spent the entire budget and still had an open brace. The
      // leaner shape above should make the extra headroom unnecessary in the
      // normal case, and a cap only costs time when it is actually reached —
      // so this is insurance, not a decision to generate more.
      {
        maxNewTokens: 240,
        temperature: 0.1,
        // OTA-1126 — priced separately so idle work never hides inside the
        // interactive number. A slot that looks cheap because its cost was
        // averaged with something else is how a budget gets lost.
        job: opts?.homework ? 'item_synthesis_hw' : 'item_synthesis',
        homework: opts?.homework,
        // ⚠ OTA-1134 — CUT ME SHORT IF THE VOICE NEEDS THE LOCK. The device log
        // measured a welcome-back line waiting 3,940 ms behind one of these,
        // for a synthesis that then failed its own validator. Enrichment losing
        // a description is the cheaper loss: the item keeps its static row and
        // asks again on the next lookup, while a voice line four seconds late
        // cannot be retried at all.
        interruptible: true,
      },
    );
  } catch {
    return null;
  }

  // OTA-1109 — an empty return is a DIFFERENT failure from an unparseable
  // one and must not be filed under it. The OTA-1108 log has
  // `item_synthesis empty 8809ms read 0ms/write 0ms in 309t→out 0t` moments
  // before the watchdog reported "Qwen dormant … the native context was
  // released" — that is the dormancy bug, not a model that wrote bad JSON,
  // and calling it `unparseable` would have sent the next investigation at
  // the parser.
  if (!raw.trim()) {
    // ⚠ OTA-1138 — AN INTERRUPTED CALL IS NOT AN EMPTY ONE. OTA-1134 made this
    // job preemptible, and the very next log showed the label lying about it:
    // `item_synthesis preempted 3535ms` … `DISCARDED — item_synth:empty`. Empty
    // is the DORMANCY signature (OTA-1119's watchdog keys off it); preempted is
    // the voice winning the lock, which is the feature working as built. Same
    // reason twice over: a discard label the next investigation will trust has
    // to name what actually happened.
    noteQwenDiscarded(lastQwenCallPreempted() ? 'item_synth:preempted' : 'item_synth:empty');
    return null;
  }

  // ⚠ OTA-1108 — this was the app's most expensive silent failure. The
  // OTA-1107 device log caught one at `item_synthesis ok 9528ms … out 179t …
  // HIT-CAP (813ch)`: 179 tokens against a 180 cap, so generation was cut off
  // mid-object, and 813 characters for a shape that needs about 200 means the
  // model rambled past the JSON before the cap stopped it. Nine and a half
  // seconds, recorded as `ok`, thrown away without a word. Now the extractor
  // takes the first BALANCED object (surviving both the trailing ramble and a
  // truncated tail), and whatever still fails is reported as the waste it is.
  const obj = extractJsonObject(raw);
  if (!obj) {
    // ⚠ OTA-1109 — NAME THE CULPRIT INSTEAD OF GUESSING AT IT. OTA-1108 made
    // this failure visible and the next log showed it happening three times
    // out of three — but `unparseable` does not say WHETHER the model wrote
    // prose, opened a markdown fence, emitted two objects, or simply ran long.
    // The ambient ∅ mystery was closed the same way (OTA-1034) by printing
    // the raw text beside the verdict. The reason string rides the existing
    // discard sink into the debug channel, so this needs no new plumbing.
    // OTA-1115 — and now that the pipe loop is a KNOWN failure with a known
    // cause, it gets its own name. If it ever comes back, the next log should
    // say so in one word instead of making someone re-derive it from 160
    // characters of raw text. `unparseable` stays for everything else.
    const sample = raw.trim().replace(/\s+/g, ' ').slice(0, 160);
    const reason = looksLikeAlternationLoop(raw) ? 'item_synth:alternation-loop' : 'item_synth:unparseable';
    noteQwenDiscarded(`${reason} (${raw.length}ch) raw="${sample}"`);
    return null;
  }

  // ⚠ OTA-1134 — NAME THE CULPRIT. This was the LAST discard path in the file
  // that reported only that it happened. Its neighbours all print what they
  // saw (OTA-1109 added that, OTA-1034 before it), and the payoff is exactly
  // the same here: four device logs said `rejected-by-clamp` four times and not
  // one of them said WHICH of the clamp's two rejections fired, so the cause
  // had to be re-derived from the source instead of read off the log.
  const validated = validateAndClamp(name, obj);
  if (!validated) {
    const kindSeen = typeof obj.kind === 'string' ? obj.kind : `(${typeof obj.kind})`;
    const why = !canonicalSynthKind(obj.kind)
      ? `bad-kind="${kindSeen}"`
      : 'no-content';   // parsed, legal kind, but no description/tags/effect to add
    noteQwenDiscarded(`item_synth:rejected-by-clamp ${why}`);
    // ⚠⚠⚠ OTA-1465 — AND REMEMBER IT. Without this the homework scanner picks
    // the same name again on the next tick, forever, AND — because it takes the
    // first eligible item — starves every item behind it in the pack. Three
    // identical discards for "Smooth Stone" in one of his sessions, and nothing
    // else described after it appeared.
    noteSynthRefused(name);
    return null;
  }

  // ⚠ A success retires any standing refusal for this name. See clearSynthRefusal.
  clearSynthRefusal(name);
  setCachedSynth(name, validated);
  return validated;
}

/** OTA-1115 — did the model fall into the pipe loop this OTA removed the cause
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
 *  ⚠ OTA-1108 — first-to-LAST brace was the bug. `raw.lastIndexOf('}')` is
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
  // ⚠ OTA-1411 — coerced first. See KIND_SYNONYMS: `tool` on a rope is a right
  // answer in a word the dictionary did not have.
  const kindRaw = canonicalSynthKind(raw.kind);
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
