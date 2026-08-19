// OTA-1200 — COUNT THE LIVE MODEL CONTEXTS. AN INSTRUMENT, NOT A FIX.
//
// ⚠⚠ THE MEASUREMENT THAT MADE THIS NECESSARY. Three JetsamEvent reports off the owner's
// iPhone XR (3 GB), all three naming us:
//
//     "largestProcess" : "TartariaRealmsHAL"
//     "reason"         : "per-process-limit"
//     "rpages"         : 118454   →  1.85 GB
//     "rpages"         : 121207   →  1.89 GB
//
// Every other process in those lists is 100–1,200 pages (2–19 MB). We were at 121,000.
// `per-process-limit` means iOS killed us for blowing OUR OWN cap, not because the system
// was short — and ~50 daemons died of `vm-pageshortage` in the seconds before us, so we
// starved the phone on the way down. That is the freeze and the crash, both.
//
// ⚠ THE MODEL IS ~400 MB OF IT. ROUGHLY 1.5 GB IS UNACCOUNTED FOR, and this file exists to
// find out what, WITHOUT guessing again.
//
// ⚠⚠ THE CANDIDATE — and it is a candidate, deliberately not treated as the answer.
// `LlamaRuntime.dispose()` reads:
//     const ctx = this.context; this.context = null; if (!ctx) return;
// If a dispose lands while `initLlama` is still in flight, `this.context` has not been
// assigned yet, so it frees NOTHING — and the load then completes and hands a ~400 MB
// native context to an object nobody holds. Four or five orphans is 1.6–2.0 GB, which
// matches the measurement. That is exactly the shape of the OTA-1196 loop: load → memory
// warning → dispose (frees nothing) → load again.
//
// ⚠⚠⚠ AND THE REASON THIS SHIPS ALONE, WITH NO FIX ATTACHED. Owner's rule, written after a
// day spent building on an unmeasured cause: **measure the cause, or ship an instrument.**
// OTA-1195 wrote that rule down; OTA-1196 overrode it with a well-argued paragraph and
// created the loop it was trying to prevent. The candidate above is not a number yet, so
// nothing here changes behaviour. The next device log makes it a number, and then the fix
// is written against evidence instead of a story.

/** Where ledger lines go. The store installs this; nothing in this file imports the store,
 *  so `LlamaRuntime` stays a leaf and no import cycle is possible. */
type LedgerSink = (line: string) => void;
let sink: LedgerSink | null = null;

export function setContextLedgerSink(s: LedgerSink | null): void { sink = s; }

function emit(line: string): void {
  try { sink?.(line); } catch { /* an instrument must never break its host */ }
}

let opened = 0;
let released = 0;
let disposeFoundNothing = 0;
let stragglersTornDown = 0;
let peakLive = 0;

/** ⚠ Approximate, and labelled as such wherever it is printed. Qwen2.5-0.5B-Instruct
 *  Q4_K_M is ~398 MB of weights plus ~25 MB of KV cache at n_ctx 2048. This is here to
 *  turn a count into a number a human can compare against a jetsam report — it is NOT a
 *  measurement of the process footprint. */
export const APPROX_CONTEXT_MB = 425;

/** A native llama context now exists. Called AFTER `initLlama` resolves — before that
 *  point nothing has been allocated that we could account for. */
export function noteContextOpened(): void {
  opened += 1;
  const live = opened - released;
  if (live > peakLive) peakLive = live;
  emit(`ctx: OPENED — live=${live} (opened=${opened} released=${released}) ≈${live * APPROX_CONTEXT_MB}MB est`);
  // ⚠ MORE THAN ONE LIVE CONTEXT IS THE WHOLE HYPOTHESIS. There is never a legitimate
  // reason to hold two: the engine keeps a single runtime. If this fires, the leak is
  // real and the count is the evidence.
  if (live > 1) {
    emit(`⚠⚠ ctx: ${live} LIVE CONTEXTS AT ONCE — only one is ever intended. `
      + `≈${live * APPROX_CONTEXT_MB}MB est held by the model alone.`);
  }
}

/** A native llama context was genuinely released. */
export function noteContextReleased(): void {
  released += 1;
  emit(`ctx: RELEASED — live=${opened - released} (opened=${opened} released=${released})`);
}

/** ⚠⚠ THE LEAK SIGNATURE, AND THE LINE THIS WHOLE OTA EXISTS TO PRODUCE.
 *  `dispose()` ran and found no context to free, which means a load was still in flight.
 *  If that load completes, its ~400 MB lands on an object nobody holds. */
export function noteDisposeFoundNothing(phase: string): void {
  disposeFoundNothing += 1;
  emit(`⚠⚠ ctx: DISPOSE FOUND NOTHING TO FREE (${phase}) — a load is in flight, so this `
    + `freed 0 bytes. If it completes, ~${APPROX_CONTEXT_MB}MB is orphaned. `
    + `count=${disposeFoundNothing}, live=${opened - released}`);
}

/** The GOOD path: a straggler load landed after a dispose and was torn down by the
 *  lifecycle-generation guard. Counted so we can tell a working guard from a silent one —
 *  if orphans are climbing while this stays at 0, the guard is not running. */
export function noteStragglerTornDown(): void {
  stragglersTornDown += 1;
  emit(`ctx: straggler load torn down by the lifecycle guard (count=${stragglersTornDown})`);
}

export interface ContextLedger {
  opened: number;
  released: number;
  live: number;
  peakLive: number;
  disposeFoundNothing: number;
  stragglersTornDown: number;
}

export function contextLedger(): ContextLedger {
  return {
    opened, released, live: opened - released, peakLive,
    disposeFoundNothing, stragglersTornDown,
  };
}

/** The bug-report block. ⚠ Reads flat when healthy so a clean session says so plainly and
 *  nobody has to interpret it. */
export function contextLedgerSummary(l: ContextLedger = contextLedger()): string {
  const out: string[] = ['Model contexts'];
  out.push(l.live > 1
    ? `  ⚠⚠ Live now: ${l.live} (≈${l.live * APPROX_CONTEXT_MB}MB est) — only one is ever intended`
    : `  Live now: ${l.live}`);
  out.push(`  Opened: ${l.opened} · Released: ${l.released} · Peak live: ${l.peakLive}`);
  if (l.disposeFoundNothing > 0) {
    out.push(`  ⚠⚠ Disposes that freed nothing: ${l.disposeFoundNothing} — each one is a `
      + `possible ~${APPROX_CONTEXT_MB}MB orphan`);
  }
  if (l.stragglersTornDown > 0) {
    out.push(`  Stragglers cleaned by the lifecycle guard: ${l.stragglersTornDown}`);
  }
  return out.join('\n');
}

/** Tests only. ⚠ Not called from app code — a counter that anything can zero is a counter
 *  that reads clean right when it matters most. */
export function _resetContextLedger(): void {
  opened = 0; released = 0; disposeFoundNothing = 0; stragglersTornDown = 0; peakLive = 0;
}
