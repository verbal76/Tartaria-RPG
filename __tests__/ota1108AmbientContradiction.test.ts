// OTA-1108 — WHAT THE FIRST DEEP-TELEMETRY LOG ACTUALLY SAID.
//
// OTA-1107 shipped the read/write split, prompt sizes, stop reasons, cache
// numbers and wasted-work accounting. The first device log carrying it:
//
//   item_synthesis ok 9528ms  read 3539ms/write 5844ms in 309t→out 179t cache 488t HIT-CAP (813ch)
//   ambient        ok 11820ms read 9902ms/write 1154ms in 546t→out  31t cache 577t HIT-CAP (132ch)
//   flourish       ok  2006ms read 1292ms/write  694ms in 127t→out  22t cache 149t (94ch)
//   ambient        ok  8079ms read 5876ms/write 1525ms in 542t→out  31t cache 573t HIT-CAP (153ch)
//   ✂ DISCARDED ambient after 8079ms — ambient:stale:log-moved-on
//   ambient        ok  8554ms read 5812ms/write 1142ms in 545t→out  31t cache 576t HIT-CAP (185ch)
//   ✂ DISCARDED ambient after 8554ms — ambient:∅   (reason=action-opener)
//
// OTA-1106 worked: ambient fell from ~1,145 prompt tokens and 16.8s to ~545
// and 8–11.8s. Four things it also exposed, all fixed here:
//
//   1. ⚠ THE CACHE NUMBER WAS BEING READ BACKWARDS. In every row `cache`
//      equals in+out exactly (546+31=577, 542+31=573, 309+179=488, 127+22=149,
//      124+20=144). That is the KV cache SIZE after the call, not reuse.
//      Reuse is the remainder, and the remainder is zero — every generation
//      re-reads its whole prompt. The rollup now says so.
//   2. ⚠ THE AMBIENT PROMPT CONTRADICTS ITSELF. OTA-1106 removed the SYSTEM
//      FACTS block from the ambient prompt but left the shared VOICE_RULES,
//      which orders "Only narrate the player's last action" and twice cites a
//      section that is no longer there — while AMBIENT_INSTRUCTION says DO NOT
//      react to the last action. The log shows the model obeying the wrong
//      one: `reason=action-opener`, 8.5 seconds binned.
//   3. ⚠ ITEM SYNTHESIS WAS FAILING SILENTLY AT FULL PRICE. 179 tokens against
//      a 180 cap, 813 characters for a ~200-character shape: the model rambled
//      past its JSON and then got cut off. first-brace-to-LAST-brace can parse
//      neither, so 9.5 seconds returned null without a word in the log.
//   4. Debug lines were rendering inside the talk popup — reported by the
//      owner in-game, typed at the Arbiter: "you are showing the qwen notes in
//      the talk popup".
//
// NOT changed, deliberately: the ambient token cap. Every ambient ends
// HIT-CAP at 31/32 tokens, but the discards in this log are `action-opener`
// and `stale`, not truncation, and the beat is clamped to one sentence
// anyway. Raising it costs decode time; lowering it risks the first sentence.
// The cap gets touched when a log blames it, not before.

jest.setTimeout(20000);

import {
  recordQwenCall,
  qwenJobStats,
  qwenTelemetrySummary,
  resetQwenTelemetry,
  type QwenCallRecord,
} from '../app/ai/generation/qwenTelemetry';
import { buildSystemPrompt } from '../app/engine/contextInjector';
import { synthesizeItemViaQwen } from '../app/engine/itemSynthesisQwen';
import { _resetCacheForTests } from '../app/engine/itemSynthesisCache';
import { readFileSync } from 'fs';
import { join } from 'path';
// ⚠ OTA-1395 — reads the store AND its slices. Part 4 is splitting gameStore
// into slices, and the literals these pins look for travel with the code. A
// pin like this was never a claim about a FILE; it is a claim about the STORE.
// See __tests__/helpers/storeSource.ts for when NOT to use it.
import { storeSource } from '../test-utils/storeSource';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

const call = (job: string, over: Partial<QwenCallRecord> = {}): void =>
  recordQwenCall({
    job, totalMs: 1000, waitMs: 0, chars: 100, outcome: 'ok', at: 0, ...over,
  });

const ambientCtx = (): Parameters<typeof buildSystemPrompt>[0] => ({
  current_biome: 'Buried Capital',
  room_name: "The Architect's Blind",
  environmental_description: 'A collapsed waystation with a map-wall behind false rubble.',
  available_exits: 'north: Tartarian Outskirts · east: Dynasty Border Post',
  active_entities: 'Ember (dog), Tarek the Tinkerer (vendor)',
  player_stats: 'STR5 DEX12 INT3 WIS8 CHA9 STE1 HP 23/23',
  full_inventory: 'main hand Cudgel · 40 TC',
  recent_history: 'investigate rubble',
  in_combat: false,
  ambient: true,
}) as Parameters<typeof buildSystemPrompt>[0];

const ambientSystem = (): string => buildSystemPrompt(ambientCtx())[0]!.content;

describe('OTA-1108 — the cache number was being read backwards', () => {
  beforeEach(() => resetQwenTelemetry());

  // ⚠⚠ OTA-1259 (N4) OVERTURNED THIS WHOLE BLOCK'S PREMISE, AND THE ORIGINAL
  // FINDING WAS HALF RIGHT. OTA-1108 was correct that OTA-1107 read the raw cache
  // size as "tokens reused" and that this was backwards. It then derived
  // `cachedTokens - promptTokens - outTokens` and read the resulting zero as a
  // REAL measurement — "a stable prompt prefix is still entirely on the table".
  //
  // ⚠⚠ THAT NUMBER CANNOT MOVE. llama.rn reports `tokens_cached` as
  // `llama->n_past` (android/src/main/jni.cpp:748), which after a completion is
  // the sequence position — prompt tokens PLUS generated tokens — whether or not
  // any prefix was reused. **Reuse changes what has to be COMPUTED, not what ends
  // up in the cache.** So the subtraction yields ~0 by construction in every run.
  //
  // ⚠ AND THE WORRY WAS BACKWARDS TOO: llama.rn already does prefix reuse
  // (`n_past = common_part(embd, prompt_tokens)`), and measured, our prompts share
  // 53–85% of their text with the previous one. The 2026-08-14 device log shows
  // two `scene_intro_fill` calls at 12.2 and 3.67 ms/prompt-token on near-identical
  // prompt sizes — a 3.3× spread, which is what a warm prefix looks like.
  //
  // **A METRIC THAT CANNOT MOVE IS WORSE THAN NO METRIC: IT READS AS EVIDENCE.**
  // The tests below now pin the retirement so the number cannot come back.

  it('⚠⚠ the derived remainder is ZERO for the shape the device ACTUALLY reports', () => {
    // cache === in + out is not "a cold cache" — it is the only shape this field
    // can ever have. Both rows are verbatim from the OTA-1107 log.
    call('ambient', { promptTokens: 546, outTokens: 31, cachedTokens: 577 });
    call('flourish', { promptTokens: 127, outTokens: 22, cachedTokens: 149 });
    const byJob = Object.fromEntries(qwenJobStats().map((j) => [j.job, j]));
    expect(byJob.ambient!.reusedTokens).toBe(0);
    expect(byJob.flourish!.reusedTokens).toBe(0);
  });

  it('⚠⚠ ...and it is NO LONGER PRINTED, in the rollup or the per-call line', () => {
    call('ambient', { promptTokens: 546, outTokens: 31, cachedTokens: 577 });
    expect(qwenTelemetrySummary()).not.toContain('reuse');
    const store = storeSource();
    expect(store).not.toContain('reuse ${reused}t');
    expect(store).not.toContain('r.cachedTokens - (r.promptTokens ?? 0) - (r.outTokens ?? 0)');
  });

  it('⚠⚠ the per-call line carries PREFILL PER PROMPT TOKEN instead — the real signal', () => {
    // A cold call and a warm one are two visibly different numbers here, which is
    // the whole point: this one CAN move.
    const store = storeSource();
    // ⚠ OTA-1263 added OTA-1139's sanity guard to this line (a prefill longer than
    // its own call is not a measurement), so the expression is non-null-asserted.
    expect(store).toContain('(r.prefillMs! / r.promptTokens!).toFixed(1)');
    // ⚠ OTA-1405 — the guard moved into the shared `qwenTimingsArePossible`, so
    // this pin follows it to the name the line now uses.
    expect(store).toContain('const prefillIsPossible = timingsOk');
    expect(store).toContain('${msPerTok}');
  });

  it('⚠ the tombstone explains itself, so nobody re-derives it', () => {
    const tel = src('app/ai/generation/qwenTelemetry.ts');
    expect(tel).toContain('jni.cpp:748');
    expect(tel).toContain('bestMsPerPromptTok');
  });

  it('⚠ the best/worst per-token range still rides the rollup', () => {
    // ⚠ prefill must be <= totalMs or OTA-1139's sanity guard rejects the sample
    // — a physically impossible prefill must never move the range. Both rows here
    // are shaped like real calls.
    call('ambient', { totalMs: 8000, promptTokens: 500, outTokens: 30, prefillMs: 6000 });
    call('ambient', { totalMs: 2500, promptTokens: 500, outTokens: 30, prefillMs: 1500 });
    expect(qwenTelemetrySummary()).toContain('ms/tok');
    const j = qwenJobStats()[0]!;
    expect(j.bestMsPerPromptTok).toBeLessThan(j.worstMsPerPromptTok);
  });
});

describe('OTA-1108 — the ambient prompt stops arguing with itself', () => {
  it('⚠ ambient is no longer told to narrate the last action it is forbidden to narrate', () => {
    const p = ambientSystem();
    expect(p).toContain('DO NOT narrate or react to their last action');
    // The shared VOICE_RULES clause that said the opposite.
    expect(p).not.toContain("Only narrate the player's last action");
  });

  it('⚠ ambient no longer cites a SYSTEM FACTS section its own prompt does not have', () => {
    const p = ambientSystem();
    expect(p).not.toContain('SYSTEM FACTS');
    // …and the scene-reaction prompt, which DOES carry that block, still cites it.
    const reaction = buildSystemPrompt({ ...ambientCtx(), ambient: false })[0]!.content;
    expect(reaction).toContain('SYSTEM FACTS');
  });

  it('the action-verb catalog is gone — ambient resolves no actions', () => {
    const p = ambientSystem();
    // ⚠ RETARGETED BY OTA-1128. The header "AVAILABLE PLAYER ACTIONS" and the
    // slash-alternate "dash / sprint" were both padding and both went; the
    // catalog itself stayed, because teaching the player the engine's verbs
    // through narration is a real feature. Anchored on the VERBS now — they
    // are what the test is actually about, and they cannot be reworded away.
    expect(p).not.toContain('brawl');
    expect(p).not.toContain('cast, channel, weave, incant');
    // The reaction prompt keeps it; that is where system vocabulary belongs.
    const reaction = buildSystemPrompt({ ...ambientCtx(), ambient: false })[0]!.content;
    expect(reaction).toContain('brawl');
    expect(reaction).toContain('cast, channel, weave, incant');
  });

  it('⚠ the guards that ambient actually needs all survive', () => {
    const p = ambientSystem();
    // The original failure mode: third-person recap.
    expect(p).toContain('**SECOND PERSON ONLY.**');
    expect(p).toContain("NEVER write 'The player'");
    // The location anchor and its no-invented-places rule.
    expect(p).toContain("The Architect's Blind");
    // RETARGETED BY OTA-1121 — "above" → "below". The rules now PRECEDE the
    // scene anchor so they can sit in the cached prefix, so this pointer had
    // to follow the move. The guard is unchanged; where it points is.
    // ⚠ RETARGETED AGAIN BY OTA-1128: this clause was one of FOUR copies of
    // the same rule, and the four collapsed into one statement carried by
    // NO_INVENTED_PLACES. The guard ambient needs is unchanged and still
    // present — asserted here in its surviving form, plus the escape hatch
    // that used to be duplicated alongside it.
    expect(p).toContain('NEVER name a location, room, weather or person that is not named below');
    expect(p).toContain('If you would have to invent scenery to fill a sentence, end early.');
    // Mid-sentence cutoffs were a named failure mode from the start.
    expect(p).toContain('End on a complete sentence.');
  });

  it('⚠ and the prompt gets materially cheaper — this is prefill time, measured at ~11ms/token', () => {
    const p = ambientSystem();
    const reaction = buildSystemPrompt({ ...ambientCtx(), ambient: false })[0]!.content;
    // Measured: the shared voice block is 1,352 characters, the ambient one
    // 622 — so the prompt drops from ~2,157 to ~1,427 on this context, about
    // 545 → ~360 tokens, roughly two seconds of prefill per ambient line at
    // the ~11ms/token this device measures.
    // ⚠ THE ABSOLUTE FIGURE IS THE REAL MEASURE, and it is untouched: this is
    // what OTA-1106 bought, and prefill is paid in tokens, not in ratios.
    expect(p.length).toBeLessThan(1500);
    // RETARGETED BY OTA-1128, and the direction matters. The ratio was 0.56;
    // it is now ~0.63 — but NOT because ambient grew. It is because OTA-1128
    // cut the REACTION prompt by deleting three duplicate statements of the
    // no-invented-places rule, so the gap closed from the other side. A
    // tighter ratio here would mean the reaction prompt got fatter again,
    // which is the thing worth catching, so the bound is loosened only as far
    // as the measured value and no further.
    expect(p.length).toBeLessThan(reaction.length * 0.68);
    // RETARGETED BY OTA-1121. This used to slice both prompts from
    // '**SECOND PERSON ONLY.**' to the end and compare the remainders. That
    // marker now lives in the SHARED preamble at the very top, so the slice
    // became "almost the whole prompt" for both and stopped measuring what it
    // was named for. The property is unchanged and still worth guarding:
    // ambient dropped the ~470-character action catalog it is forbidden to
    // use, so its RULES block is far cheaper than the reaction one.
    expect(p).not.toContain('brawl');
    expect(reaction).toContain('brawl');
    // ⚠ THE RATIO ASSERTION IS GONE, AND NOT BECAUSE IT WAS INCONVENIENT.
    // It compared the two RULES blocks and required ambient's to be under 60%
    // of the reaction one. OTA-1128 halved the REACTION block by deleting
    // three duplicated rules, while ambient's block is mostly the companion
    // brief — irreducible, and not what OTA-1108 was cutting. So the ratio
    // now reads ~0.9 and asserting 0.6 would be asserting something FALSE
    // about the code. What OTA-1108 actually secured is the line below and
    // the two size assertions above: ambient does not read the verb catalog.
  });

  it('the scene-reaction voice block still says what it said — the split did not rewrite it', () => {
    const reaction = buildSystemPrompt({ ...ambientCtx(), ambient: false })[0]!.content;
    expect(reaction).toContain("Only narrate the player's last action");
    // RETARGETED BY OTA-1128 — 'Aetheric verbs: cast…' became '— and the
    // Aetheric verbs cast…' when the catalog's padding was stripped. The four
    // verbs are the assertion; the punctuation around them never was.
    expect(reaction).toContain('cast, channel, weave, incant');
  });

  it('prompts stay deterministic — same context, same bytes', () => {
    expect(ambientSystem()).toBe(ambientSystem());
  });
});

describe('OTA-1108 — item synthesis stops failing silently at full price', () => {
  const engine = (reply: string) => ({
    isReady: () => true,
    generate: () => Promise.resolve(reply),
  });

  beforeEach(() => {
    resetQwenTelemetry();
    _resetCacheForTests();
  });

  it('⚠ a response that rambles past its JSON now parses — the first BALANCED object wins', async () => {
    // The 813-character shape: valid object, then the model keeps going.
    const reply =
      '{"kind":"consumable","description":"A bitter tonic.","effect":{"kind":"consumable","healHP":6}}\n'
      + 'Here is another example for a different item:\n'
      + '{"kind":"weapon","description":"A blade."}';
    const out = await synthesizeItemViaQwen('Bitter Tonic', ['drink'], engine(reply));
    expect(out).not.toBeNull();
    expect(out!.description).toBe('A bitter tonic.');
    // The SECOND object in the reply describes a weapon; taking it would be
    // just as wrong as taking neither.
    expect(out!.effect).toMatchObject({ kind: 'consumable', healHP: 6 });
  });

  it('⚠ a brace inside the description does not move the depth counter', async () => {
    const reply = '{"kind":"misc","description":"A relic marked {sigil} on one face."} trailing prose';
    const out = await synthesizeItemViaQwen('Marked Relic', [], engine(reply));
    expect(out).not.toBeNull();
    expect(out!.description).toContain('{sigil}');
  });

  it('an escaped quote inside the description does not end the string early', async () => {
    const reply = '{"kind":"misc","description":"They call it \\"the key\\"."}';
    const out = await synthesizeItemViaQwen('The Key', [], engine(reply));
    expect(out).not.toBeNull();
  });

  it('⚠ a response truncated by the token cap is REPORTED, not swallowed', async () => {
    // out 179t against a 180 cap: cut off mid-object, no closing brace.
    const reply = '{"kind":"weapon","description":"A long-hafted maul of scavenged rail steel that';
    const out = await synthesizeItemViaQwen('Rail Maul', ['metal'], engine(reply));
    expect(out).toBeNull();
    // The waste is attributable now — this is the whole point of OTA-1107's
    // accounting, and this call site was missing from it.
    // RETARGETED BY OTA-1109: the unparseable reason now carries the raw text
    // and its length, because the next log showed this failing three times out
    // of three without ever saying WHY. The reporting itself is what this test
    // guards, so it asserts the call, not the exact string it now builds.
    // RETARGETED AGAIN BY OTA-1115: the parse failure now picks between two
    // NAMES — the pipe loop earned its own — so the reason is built above the
    // call instead of inlined into it. What this test guards is that the parse
    // failure is REPORTED at all, which is still true.
    const src2 = src('app/engine/itemSynthesisQwen.ts');
    expect(src2).toContain("'item_synth:unparseable'");
    expect(src2).toContain('noteQwenDiscarded(`${reason}');
    // RETARGETED BY OTA-1134 — the reason is a template literal now, because
    // the clamp finally NAMES which of its two rejections fired
    // (`bad-kind="…"` or `no-content`). Four device logs said
    // `rejected-by-clamp` and none said which, so the cause had to be
    // re-derived from source. The property here is unchanged: the discard is
    // reported rather than swallowed.
    expect(src2).toContain('item_synth:rejected-by-clamp ${why}');
    expect(src2).toContain("? `bad-kind=");
    expect(src2).toContain("'no-content'");
    // RETARGETED BY OTA-1138 — empty is still its own reason; it just yields
    // to 'preempted' when the runtime was told to stop (a different fact).
    expect(src2).toContain("'item_synth:empty'");
    expect(src2).toContain("'item_synth:preempted'");
  });

  it('a plain single-object response is unaffected — no regression on the happy path', async () => {
    const reply = '{"kind":"misc","description":"A coil of waxed cord.","extraTags":["fiber"]}';
    const out = await synthesizeItemViaQwen('Waxed Cord', [], engine(reply));
    expect(out).not.toBeNull();
    expect(out!.extraTags).toContain('fiber');
  });

  it('no JSON at all still fails closed', async () => {
    const out = await synthesizeItemViaQwen('Nothing', [], engine('I cannot help with that.'));
    expect(out).toBeNull();
  });
});

describe('OTA-1108 — the talk popup hides what the feed hides', () => {
  it('⚠ the transcript filters hidden channels, not just the timestamp', () => {
    const sheet = src('app/components/TalkSheet.tsx');
    expect(sheet).toContain("import { HIDDEN_LOG_CHANNELS } from '../engine/gameLog'");
    expect(sheet).toContain('!HIDDEN_LOG_CHANNELS.has(e.channel)');
  });

  it('it uses the SAME set as the feed — a channel hidden later cannot leak here', () => {
    const feed = src('app/components/AdventureFeed.tsx');
    const sheet = src('app/components/TalkSheet.tsx');
    expect(feed).toContain('HIDDEN_LOG_CHANNELS');
    expect(sheet).toContain('HIDDEN_LOG_CHANNELS');
    expect(src('app/engine/gameLog.ts')).toContain("new Set(['cognitive', 'debug'])");
  });

  it('the timestamp window itself is unchanged — OTA-1098 must not regress', () => {
    const sheet = src('app/components/TalkSheet.tsx');
    expect(sheet).toContain('e.ts >= ctx.startedAtTs');
    // Not an INDEX. gameLog is sliced to MAX_LOG_IN_MEMORY on every append, so
    // an index mark silently points past the end after 500 lines.
    expect(sheet).not.toMatch(/const transcript[\s\S]{0,400}gameLog\.length/);
    expect(sheet).not.toMatch(/startedAtIndex/);
  });
});
