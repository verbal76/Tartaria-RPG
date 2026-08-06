// OTA-1134 — THE VOICE WAITED 3,940 ms FOR A JOB THAT THREW ITS OWN WORK AWAY.
//
// OTA-1132 put a timestamp on the voice because the owner was clocking the gap
// by hand — *"5-6 second delay between welcome back text and when kokoro fired
// the same line."* The very next device log answered it in one line:
//
//   voice⏱ gap 4935ms (wait 3940ms + synth 859ms, live) "Welcome back, Verbal."
//
// Kokoro needed 859 ms. Everything else was WAIT. And the thing it was waiting
// for is in the same log:
//
//   qwen⏱ item_synthesis ok 3847ms → ✂ DISCARDED — item_synth:rejected-by-clamp
//
// Two separate defects stacked into one visible one, and this OTA takes both.
//
// ── 1. The job could not be stopped ─────────────────────────────────────────
// OTA-1130 already raised the voice ABOVE narration, and that was the right
// call — but priority only reorders WAITERS. `runExclusiveNativeMl` guards a
// native call in flight with `running`, so a synthesis that has already started
// is unreachable no matter what arrives behind it. OTA-1123 built the escape
// hatch (the `onPreempt` hook) and wired it to `homework` only, because at the
// time homework was the only work nobody was waiting on.
//
// Item synthesis is not homework — a player who opened an unknown item IS
// waiting on it, so it keeps ML_PRIORITY_LLM and never queues below idle work.
// What it gains is the ability to be CUT SHORT. That is a new axis: priority
// says where you queue, `interruptible` says whether you can be stopped once
// you are running. They used to be one flag; now they are two.
//
// ⚠ NARRATION TAKES NEITHER. It has no fallback once it has started and half a
// sentence is worse than a late one. This suite guards that harder than it
// guards the feature.
//
// ── 2. The prompt taught the model to fail its own validator ────────────────
// Four device logs, four `item_synthesis` calls, four `rejected-by-clamp`, ~4
// seconds each. Nothing that job produced has ever reached the player. The
// clamp rejects on a `kind` outside the allowed six, and the old brief showed
// the model this:
//
//     Allowed "kind" values … weapon, armor, accessory, consumable, misc, relic
//     … takes {"kind":"consumable","healHP":4,"restoreStamina":3}
//     … takes {"kind":"passive","stat":"wisdom","bonus":1}
//
// The word "kind" named TWO different fields at two nesting levels, and the
// inner ones were shown as BARE TOP-LEVEL OBJECTS — one of them declaring
// `"kind":"passive"`, which is not a legal top-level kind at all. A 0.5B model
// copies the shape it was shown. Same class of bug as the OTA-1115 pipe loop:
// the prompt and the parser disagreed, and the prompt won.
//
// Every example is now a COMPLETE reply with `"effect"` nested where it
// belongs, and the discard reason finally says WHICH of the clamp's two
// rejections fired — the last unnamed discard path in the file.

import fs from 'fs';
import path from 'path';

const src = (p: string): string =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const SYNTH = src('app/engine/itemSynthesisQwen.ts');
const RUNTIME = src('app/ai/generation/LlamaRuntime.ts');
const ENGINE = src('app/ai/generation/QwenGenerativeEngine.ts');

/** The prompt lines only — the commentary above them QUOTES the old broken
 *  brief on purpose, and must never be mistaken for the brief itself. */
function promptLines(): string[] {
  const from = SYNTH.indexOf('const systemPrompt = [');
  const to = SYNTH.indexOf("].join('\\n');", from);
  return SYNTH.slice(from, to)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith("'"));
}

/** Every JSON object literal appearing in the brief, parsed. */
function promptObjects(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of promptLines()) {
    const open = line.indexOf('{');
    const close = line.lastIndexOf('}');
    if (open < 0 || close <= open) continue;
    out.push(JSON.parse(line.slice(open, close + 1)) as Record<string, unknown>);
  }
  return out;
}

const TOP_LEVEL_KINDS = ['weapon', 'armor', 'accessory', 'consumable', 'misc', 'relic'];

describe('OTA-1134 — every example in the brief is a reply the validator accepts', () => {
  it('⚠ THE FIX: there is not one bare effect object left to copy', () => {
    // This is the whole bug in one assertion. An effect object at the top level
    // of an example is a shape the model can imitate wholesale, and imitating
    // it fails the clamp. Every object in the brief must be a COMPLETE reply.
    for (const obj of promptObjects()) {
      expect(typeof obj.kind).toBe('string');
      expect(TOP_LEVEL_KINDS).toContain(obj.kind as string);
    }
  });

  it('⚠ "passive" never appears as a top-level kind — that was the exact leak', () => {
    // `{"kind":"passive","stat":"wisdom","bonus":1}` sat in the old brief as a
    // standalone object. "passive" is a legal INNER kind and an illegal outer
    // one, so a model that copied it was rejected 100% of the time.
    for (const obj of promptObjects()) {
      expect(obj.kind).not.toBe('passive');
      expect(obj.kind).not.toBe('consumable-effect');
    }
  });

  it('the effect examples are NESTED, and there are two of them', () => {
    const withEffect = promptObjects().filter((o) => o.effect);
    expect(withEffect.length).toBe(2);
    for (const obj of withEffect) {
      const eff = obj.effect as Record<string, unknown>;
      expect(typeof eff.kind).toBe('string');
      expect(['consumable', 'passive']).toContain(eff.kind as string);
      // …and the outer object is still a complete, legal reply.
      expect(TOP_LEVEL_KINDS).toContain(obj.kind as string);
      expect(typeof obj.description).toBe('string');
      expect(Array.isArray(obj.extraTags)).toBe(true);
    }
  });

  it('the brief SAYS the nesting as well as showing it', () => {
    const text = promptLines().join('\n');
    expect(text).toContain('It is NESTED and has its own inner kind');
    expect(text).toContain('Top-level "kind" is required');
  });

  it('⚠ copying ANY example verbatim would now survive the clamp', () => {
    // The strongest form of the property: paste an example in as the model's
    // whole reply and the validator takes it. That was false before this OTA
    // for two of the four objects in the brief.
    for (const obj of promptObjects()) {
      expect(TOP_LEVEL_KINDS).toContain(String(obj.kind).toLowerCase());
      const eff = obj.effect as Record<string, unknown> | undefined;
      if (!eff) continue;
      if (eff.kind === 'consumable') {
        expect(Number(eff.healHP)).toBeLessThanOrEqual(10);
        expect(Number(eff.restoreStamina)).toBeLessThanOrEqual(8);
      } else {
        expect(['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma'])
          .toContain(eff.stat as string);
        expect(Number(eff.bonus)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('⚠ OTA-1115 IS NOT REGRESSED — still no alternation anywhere in the brief', () => {
    // The pipe loop cost three OTAs to find. Rewriting the prompt is exactly
    // the edit that could bring it back, so it is re-asserted here rather than
    // left to the other suite alone.
    for (const line of promptLines()) expect(line).not.toContain('|');
  });

  it('the whole allowed vocabulary is still stated — shrinking the brief was never the fix', () => {
    const text = promptLines().join('\n');
    for (const k of TOP_LEVEL_KINDS) expect(text).toContain(k);
    for (const t of ['organic', 'metal', 'fiber', 'stone', 'glass']) expect(text).toContain(t);
    expect(text).toContain('healHP 1 to 10');
    expect(text).toContain('restoreStamina 1 to 8');
    expect(text).toContain('bonus is 1 or 2');
  });
});

describe('OTA-1134 — the last unnamed discard finally names its culprit', () => {
  it('⚠ rejected-by-clamp distinguishes a bad kind from an empty row', () => {
    // Four logs said `rejected-by-clamp` and not one said WHICH check fired, so
    // the cause had to be re-derived from source instead of read off the log.
    expect(SYNTH).toContain('noteQwenDiscarded(`item_synth:rejected-by-clamp ${why}');
    expect(SYNTH).toContain('? `bad-kind="${kindSeen}"`');
    expect(SYNTH).toContain("'no-content'");
  });

  it('a non-string kind is reported by TYPE, not printed as garbage', () => {
    expect(SYNTH).toContain("typeof obj.kind === 'string' ? obj.kind : `(${typeof obj.kind})`");
  });

  it('the classification uses the same KNOWN_KINDS the clamp does', () => {
    // A second hand-written list here would drift from the validator and start
    // lying in the log — the failure mode this whole OTA is about.
    expect(SYNTH).toContain('!(KNOWN_KINDS as readonly string[]).includes(String(obj.kind).toLowerCase())');
  });

  it('its neighbours keep the instrumentation that made THIS bug findable', () => {
    expect(SYNTH).toContain("noteQwenDiscarded('item_synth:empty')");
    expect(SYNTH).toContain('noteQwenDiscarded(`${reason} (${raw.length}ch) raw="${sample}"`)');
  });
});

describe('OTA-1134 — interruptible is a SEPARATE axis from priority', () => {
  it('⚠ the hook no longer implies the low tier', () => {
    // Before: one flag meant both "queue last" and "may be cut short".
    // After: `homework` still means both; `interruptible` means only the second.
    expect(RUNTIME).toContain('(opts.homework || opts.interruptible)');
    // The priority line is UNCHANGED — interruptible must not demote anything.
    expect(RUNTIME).toContain('opts.homework ? ML_PRIORITY_HOMEWORK : ML_PRIORITY_LLM,');
    expect(RUNTIME).not.toContain('opts.interruptible ? ML_PRIORITY_HOMEWORK');
  });

  it('the flag exists on both option surfaces and is forwarded, not dropped', () => {
    expect(RUNTIME).toContain('interruptible?: boolean;');
    expect(ENGINE).toContain('interruptible?: boolean;');
    // generate() and stream() both pass it down — a flag that silently stops at
    // one of the two would be a bug nobody sees until the next device log.
    const forwards = ENGINE.match(/interruptible: opts\.interruptible,/g) ?? [];
    expect(forwards.length).toBe(2);
  });

  it('⚠ item synthesis is INTERRUPTIBLE BUT NOT DEMOTED', () => {
    // The player who opened an unknown item is waiting on this. It must never
    // sit behind idle work — only be cut short when the voice needs the lock.
    expect(SYNTH).toContain('interruptible: true,');
    expect(SYNTH).toContain("job: opts?.homework ? 'item_synthesis_hw' : 'item_synthesis',");
    expect(SYNTH).toContain('homework: opts?.homework,');
    // It does not hardcode homework — that stays the caller's choice.
    expect(SYNTH).not.toContain('homework: true,');
  });

  it('⚠ NARRATION IS NOT INTERRUPTIBLE — the property this OTA must not break', () => {
    // Cutting a narration line short leaves the player reading half a sentence,
    // and unlike an item description it has nothing to fall back to.
    const store = src('app/state/gameStore.ts');
    const nar = store.slice(
      store.indexOf('async function narrateViaArbiter'),
      store.indexOf('async function maybeGenerateAmbientArbiter'),
    );
    expect(nar.length).toBeGreaterThan(0);
    expect(nar).not.toContain('interruptible');
  });

  it('the runtime still reports a cut-short call as preempted, not as ok or err', () => {
    // Partial text from a job we stopped must not average into latency as a
    // success. This path is now reachable from a NON-homework job for the first
    // time, so the accounting matters more than it did.
    expect(RUNTIME).toContain("outcome: preempted ? 'preempted'");
    const tel = src('app/ai/generation/qwenTelemetry.ts');
    expect(tel).toContain("| 'preempted'");
  });
});

describe('OTA-1134 — the file records the measurement, not just the change', () => {
  it('the runtime carries the number that justified the flag', () => {
    expect(RUNTIME).toContain('INTERRUPTIBLE, BUT NOT DEPRIORITISED');
    expect(RUNTIME).toContain('3940ms');
  });

  it('⚠ the trade is written down where the next editor will read it', () => {
    // An interrupted synthesis LOSES its description. That is a real cost and
    // it is stated, not buried — the item keeps its static row and asks again.
    expect(RUNTIME).toContain('THE TRADE, STATED PLAINLY');
    expect(SYNTH).toContain('CUT ME SHORT IF THE VOICE NEEDS THE LOCK');
  });

  it('the prompt fix names its own class of bug', () => {
    expect(SYNTH).toContain('THE PROMPT TAUGHT THE MODEL TO FAIL ITS OWN VALIDATOR');
    expect(SYNTH).toContain('SHOW THE NESTING, NOT TO DESCRIBE IT');
  });
});
