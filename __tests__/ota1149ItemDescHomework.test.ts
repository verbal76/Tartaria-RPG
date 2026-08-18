// ⚠ PORTED FROM THE GOLEM LINE during the golem-parity pass. Golem is the model
// line, so its version of this suite is authoritative; the OTA numbers in the
// commentary below are GOLEM's, which is the honest provenance for where the
// behaviour being pinned was actually written.
// OTA-1126 — THE FIRST HOMEWORK SLOT: ITEM DESCRIPTIONS.
//
// Owner's governing rule for the whole homework track, and the thing that
// decided which slot ships first:
//
//   "our problem is screen real estate. more just scrolls up and blends in
//    with the chatter and isn't read. I would go with faster, and only do
//    fancy bespoke writing on screens that are stationary like conversations
//    or other writing popup."
//
// Item descriptions fit that better than anything else in the game. They land
// in a POPUP the player is holding still and reading — not in the scrolling
// feed — so the writing is actually seen. And the work is pure SPEED: the
// synthesis already runs today, on demand, the moment an unknown item is
// opened. Doing it early changes nothing about what the game CONTAINS; it only
// moves a 4-13 second wait out of the player's way.
//
// ⚠ THE SLOT IS A SCHEDULER AND NOTHING ELSE. The generation, prompt, clamps,
// cache and silent-discard-on-bad-row are the existing path untouched — which
// is the whole point, because those are five OTAs of hard-won correctness and
// a second copy would drift from them invisibly.
//
// It rides OTA-1123's harness, so it queues below voice and is cut short the
// moment the player acts. Owner's requirement was that idle work cost the
// player nothing; the harness is what delivers that, and this is its first
// real consumer beyond the bank's own filler.

// Source-reading suite with no `import` — without this the file is a SCRIPT and
// `SRC`/`SYNTH`/`INV` become globals that collide with the identically-named
// consts in the other source-reading suites. `export {}` makes it a module.
export {};

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SRC: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SYNTH: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/engine/itemSynthesisQwen.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const INV: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/screens/InventoryScreen.tsx'), 'utf8');

describe('OTA-1126 — the slot reuses the live path rather than copying it', () => {
  it('⚠ synthesis takes a homework flag and changes NOTHING else', () => {
    // Same prompt, same clamps, same cache, same discard. If a future edit
    // forks a second synthesis path for homework, the two will drift and only
    // one of them will have the OTA-1109 pipe-loop fix in it.
    expect(SYNTH).toContain('opts?: { homework?: boolean },');
    expect(SYNTH).toContain('homework: opts?.homework,');
  });

  it('⚠ it is priced separately — idle work must not hide in the live number', () => {
    // A slot that looks cheap because its cost was averaged with the
    // interactive job is how a budget gets lost.
    expect(SYNTH).toContain("job: opts?.homework ? 'item_synthesis_hw' : 'item_synthesis',");
  });

  it('the scheduler calls the real synthesizer with the flag set', () => {
    expect(SRC).toContain('synth.synthesizeItemViaQwen(target.name, target.tags, qwen, { homework: true })');
  });
});

describe('OTA-1126 — the idle gate, and every muzzle it inherits', () => {
  const tick = SRC.slice(SRC.indexOf('const homeworkTick = (): void => {'),
    SRC.indexOf('setHomeworkTick(homeworkTick);'));

  it('⚠ nothing runs without an idle stamp — null is the safe default', () => {
    expect(tick).toContain('const idleSince = get().uiIdleSince;');
    expect(tick).toContain('if (idleSince === null');
    expect(SRC).toContain('uiIdleSince: null,');
  });

  it('⚠ combat and the tutorial muzzle it, exactly like ambient', () => {
    // A free description is still the wrong thing to be computing mid-fight.
    expect(tick).toContain("if ((get().currentScene?.enemies?.length ?? 0) > 0) return;");
    expect(tick).toContain('if (inScriptedTutorialPhase(get)) return;');
  });

  it('⚠ the difficulty dial still wins — a hard run gets no free identification', () => {
    // OTA-1117's witholdIdentity says the enrichment does not run. Homework
    // must not become a back door around a rule the player chose.
    expect(tick).toContain('if (profileOf(get().player).witholdIdentity) return;');
  });

  it('it never races the interactive requester for the same slot', () => {
    expect(tick).toContain('if (synthInFlight) return;');
    expect(tick).toContain('if (!qwen.isReady() || get().isGenerating) return;');
  });

  it('⚠ spacing is far wider than the interactive gap — this is unasked-for battery', () => {
    expect(SRC).toContain('const HOMEWORK_GAP_MS = 30_000;');
    expect(SRC).toContain('const SYNTH_GAP_MS = 20_000;');
  });

  it('an item already cached is never re-synthesized', () => {
    expect(SRC).toContain('if (synth.readSynthCache(it.name)) continue;');
    expect(SRC).toContain('if (pending.has(key)) continue;');
  });
});

describe('OTA-1126 — ⚠ the player coming back always wins', () => {
  it('submitPlayerAction clears the idle stamp at the one door every action uses', () => {
    const head = SRC.slice(SRC.indexOf('submitPlayerAction(text, _opts) {'));
    // OTA-1351 widened this window (900 -> 1600): the dying-breath try/finally
    // wrap and its comment now sit between the door and the idle-clear. The
    // lock's claim is unchanged -- the clear happens at the TOP of the door,
    // before any action dispatch -- the top is just a few lines deeper now.
    expect(head.slice(0, 1600)).toContain('if (get().uiIdleSince !== null) set({ uiIdleSince: null });');
  });

  it('⚠ marking idle is idempotent — a re-render must not restart the dwell', () => {
    // A screen that re-renders every second would otherwise keep resetting the
    // clock and the window would never open at all.
    expect(SRC).toContain('return st.uiIdleSince === null ? { uiIdleSince: Date.now() } : {};');
  });

  it('the pack declares itself an idle window, and cleans up', () => {
    expect(INV).toContain('mark(true);');
    expect(INV).toContain('return () => { mark(false); };');
  });

  it('⚠ a broken tick can never take the app down', () => {
    expect(SRC).toContain("try { homeworkTickFn?.(); } catch { /* homework must never break the app */ }");
  });

  it('the outcome is logged either way, so a silent slot is visible', () => {
    expect(SRC).toContain("`homework: item_desc \"${target.name}\" ${got ? '✓' : '∅'} ${Date.now() - t0}ms`");
  });
});

describe('OTA-1127 — ⚠ the tracking that can answer the caching question', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TEL: string = require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '../app/ai/generation/qwenTelemetry.ts'), 'utf8');

  it('⚠ ms-per-prompt-token is recorded as a RANGE, not an average', () => {
    // Owner: "fix the tracking information in the log so that we can see more
    // clearly what is affecting number one." `reuse` read 0t before AND after
    // the prefix reorder, which tells us nothing — a working cache and an
    // unreported field look identical through it. Read time per prompt token
    // cannot lie. Averaging would destroy it: a job whose first call is cold
    // and second is warm averages to a number describing neither.
    expect(TEL).toContain('bestMsPerPromptTok: number;');
    expect(TEL).toContain('worstMsPerPromptTok: number;');
    expect(TEL).toContain('agg.bestMsPerPromptTok = Math.min(agg.bestMsPerPromptTok, per);');
    expect(TEL).toContain('agg.worstMsPerPromptTok = Math.max(agg.worstMsPerPromptTok, per);');
  });

  it('⚠ a preempted call contributes NO per-token number', () => {
    // It was cut off mid-read, so its ratio is a fiction that would drag the
    // best downward and make the cache look better than it is.
    expect(TEL).toContain("r.outcome !== 'preempted'");
    expect(TEL).toContain('(r.promptTokens ?? 0) > 0');
  });

  it('the rollup prints the range where a log reader will see it', () => {
    expect(TEL).toContain("` ms/tok ${j.bestMsPerPromptTok.toFixed(1)}-${j.worstMsPerPromptTok.toFixed(1)}`");
    expect(TEL).toContain('${cached}${perTok}');
  });

  it('⚠⚠ reuse is RETIRED from the display, and the reason is recorded in its place', () => {
    // ⚠⚠ OTA-1259 (N4) REVERSED THIS ONE. OTA-1127 kept the figure on the reasoning
    // that "if cachedTokens ever starts reporting properly, reuse becomes
    // meaningful again" — which assumed the field was misreporting. **It is not.**
    // llama.rn reports `tokens_cached` as `llama->n_past` (jni.cpp:748), the
    // sequence position after the call: prompt + generated, reuse or no reuse.
    // The derived remainder is ~0 BY CONSTRUCTION and there is no future build in
    // which it starts to move.
    //
    // ⚠ The evidence is not destroyed by removing the display — it is PRESERVED,
    // in the tombstone on the field itself, which is the place someone tempted to
    // re-derive it will actually look. **A metric that cannot move is worse than
    // no metric: it reads as evidence.**
    expect(TEL).not.toContain('reuse${j.reusedTokens}t');
    expect(TEL).toContain('jni.cpp:748');
    expect(TEL).toContain('reusedTokens: number;');   // the field survives as a tombstone
  });

  it('a job with no measured prefill shows no range rather than a fake zero', () => {
    expect(TEL).toContain('j.prefillSamples > 0');
    expect(TEL).toContain('bestMsPerPromptTok: a.prefillSamples > 0 ? a.bestMsPerPromptTok : 0,');
  });
});
