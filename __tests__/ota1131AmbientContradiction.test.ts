// OTA-1131 — WHAT THE FIRST DEEP-TELEMETRY LOG ACTUALLY SAID.
//
// OTA-1130 shipped the read/write split, prompt sizes, stop reasons, cache
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
// OTA-1129 worked: ambient fell from ~1,145 prompt tokens and 16.8s to ~545
// and 8–11.8s. Four things it also exposed, all fixed here:
//
//   1. ⚠ THE CACHE NUMBER WAS BEING READ BACKWARDS. In every row `cache`
//      equals in+out exactly (546+31=577, 542+31=573, 309+179=488, 127+22=149,
//      124+20=144). That is the KV cache SIZE after the call, not reuse.
//      Reuse is the remainder, and the remainder is zero — every generation
//      re-reads its whole prompt. The rollup now says so.
//   2. ⚠ THE AMBIENT PROMPT CONTRADICTS ITSELF. OTA-1129 removed the SYSTEM
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

describe('OTA-1131 — the cache number was being read backwards', () => {
  beforeEach(() => resetQwenTelemetry());

  it('⚠ the device-log shape (cache === in + out) reports as ZERO reuse', () => {
    // Every single row in the log had this shape. Read as "reuse", it says the
    // model reused more tokens than the prompt even had.
    call('ambient', { promptTokens: 546, outTokens: 31, cachedTokens: 577 });
    call('flourish', { promptTokens: 127, outTokens: 22, cachedTokens: 149 });
    const byJob = Object.fromEntries(qwenJobStats().map((j) => [j.job, j]));
    expect(byJob.ambient!.reusedTokens).toBe(0);
    expect(byJob.flourish!.reusedTokens).toBe(0);
    expect(qwenTelemetrySummary()).toContain('reuse0t');
  });

  it('real reuse — a cache larger than this call\'s own contribution — is counted', () => {
    call('narration:travel', { promptTokens: 300, outTokens: 40, cachedTokens: 1000 });
    expect(qwenJobStats()[0]!.reusedTokens).toBe(660);
    expect(qwenTelemetrySummary()).toContain('reuse660t');
  });

  it('a build that reports the field differently can never show a negative saving', () => {
    call('ambient', { promptTokens: 546, outTokens: 31, cachedTokens: 12 });
    expect(qwenJobStats()[0]!.reusedTokens).toBe(0);
  });

  it('no cache field at all stays quiet — absent data is not a measured zero', () => {
    call('ambient', { promptTokens: 546, outTokens: 31 });
    expect(qwenJobStats()[0]!.cacheSamples).toBe(0);
    expect(qwenTelemetrySummary()).not.toContain('reuse');
  });

  it('the store logs the derived remainder, not the raw cache size', () => {
    const store = src('app/state/gameStore.ts');
    expect(store).toContain('reuse ${reused}t');
    expect(store).toContain('r.cachedTokens - (r.promptTokens ?? 0) - (r.outTokens ?? 0)');
  });
});

describe('OTA-1131 — the ambient prompt stops arguing with itself', () => {
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
    expect(p).not.toContain('AVAILABLE PLAYER ACTIONS');
    expect(p).not.toContain('dash / sprint');
    // The reaction prompt keeps it; that is where system vocabulary belongs.
    expect(buildSystemPrompt({ ...ambientCtx(), ambient: false })[0]!.content)
      .toContain('AVAILABLE PLAYER ACTIONS');
  });

  it('⚠ the guards that ambient actually needs all survive', () => {
    const p = ambientSystem();
    // The original failure mode: third-person recap.
    expect(p).toContain('**SECOND PERSON ONLY.**');
    expect(p).toContain("NEVER write 'The player'");
    // The location anchor and its no-invented-places rule.
    expect(p).toContain("The Architect's Blind");
    expect(p).toContain('Do not name any place, room, weather or person other than the location named above');
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
    expect(p.length).toBeLessThan(1500);
    expect(p.length).toBeLessThan(reaction.length * 0.56);
    const ambientRules = p.slice(p.indexOf('**SECOND PERSON ONLY.**'));
    const sharedRules = reaction.slice(reaction.indexOf('**SECOND PERSON ONLY.**'));
    expect(ambientRules.length).toBeLessThan(sharedRules.length * 0.5);
  });

  it('the scene-reaction voice block is untouched — this OTA splits, it does not rewrite', () => {
    const reaction = buildSystemPrompt({ ...ambientCtx(), ambient: false })[0]!.content;
    expect(reaction).toContain("Only narrate the player's last action");
    expect(reaction).toContain('Aetheric verbs: cast, channel, weave, incant.');
  });

  it('prompts stay deterministic — same context, same bytes', () => {
    expect(ambientSystem()).toBe(ambientSystem());
  });
});

describe('OTA-1131 — item synthesis stops failing silently at full price', () => {
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
    // The waste is attributable now — this is the whole point of OTA-1130's
    // accounting, and this call site was missing from it.
    // RETARGETED BY OTA-1132: the unparseable reason now carries the raw text
    // and its length, because the next log showed this failing three times out
    // of three without ever saying WHY. The reporting itself is what this test
    // guards, so it asserts the call, not the exact string it now builds.
    // RETARGETED AGAIN BY OTA-1138: the parse failure now picks between two
    // NAMES — the pipe loop earned its own — so the reason is built above the
    // call instead of inlined into it. What this test guards is that the parse
    // failure is REPORTED at all, which is still true.
    const src2 = src('app/engine/itemSynthesisQwen.ts');
    expect(src2).toContain("'item_synth:unparseable'");
    expect(src2).toContain('noteQwenDiscarded(`${reason}');
    expect(src2).toContain("noteQwenDiscarded('item_synth:rejected-by-clamp')");
    expect(src2).toContain("noteQwenDiscarded('item_synth:empty')");
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

describe('OTA-1131 — the talk popup hides what the feed hides', () => {
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

  it('the timestamp window itself is unchanged — OTA-1121 must not regress', () => {
    const sheet = src('app/components/TalkSheet.tsx');
    expect(sheet).toContain('e.ts >= ctx.startedAtTs');
    // Not an INDEX. gameLog is sliced to MAX_LOG_IN_MEMORY on every append, so
    // an index mark silently points past the end after 500 lines.
    expect(sheet).not.toMatch(/const transcript[\s\S]{0,400}gameLog\.length/);
    expect(sheet).not.toMatch(/startedAtIndex/);
  });
});
