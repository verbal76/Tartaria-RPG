// P2 — RNG ledger (channel C).
//
// Wraps the ALREADY-SEEDED Math.random (jest.setup.js:73-79) with a counting
// wrapper. This adds NO draws and NO stack reads — Phase 2B (UNK-P2-11) found
// that source-map-support's own quicksort consumes seeded draws when an
// error stack is captured, so this module never calls Error().stack, never
// reads .stack anywhere, and never calls any stack-trace API. Attribution is
// therefore limited to what the caller declares explicitly (see `mark`),
// not what a stack frame could tell us — "UNKNOWN source" is preferred over
// a stack read, per the owner's explicit ruling.
//
// Draw order is preserved exactly: the wrapper calls the underlying
// Math.random() synchronously, once, per invocation, before returning.

export interface RngDraw {
  seq: number;
  actionSeq: number;
  value: number;
  /** Declared by the caller via `mark(...)`, never derived from a stack. */
  source: string;
}

let ledger: RngDraw[] = [];
let seq = 0;
let currentActionSeq = 0;
let currentSource = 'UNKNOWN';
let installedFn: (() => number) | null = null;
let originalRandom: (() => number) | null = null;

/** Advance which action subsequent draws are attributed to. Call this from
 *  the decision journal / walker right before invoking a production door. */
export function setRngActionSeq(n: number): void {
  currentActionSeq = n;
}

/** Declare the source label for draws about to happen (a caller-supplied
 *  string, e.g. "combat.attack" or "UNKNOWN" — never a stack read). Resets
 *  to 'UNKNOWN' is the caller's responsibility after the marked region. */
export function markRngSource(source: string): void {
  currentSource = source;
}

export function attachRngLedger(): void {
  if (installedFn) return; // already attached
  originalRandom = Math.random;
  const real = originalRandom;
  installedFn = function ledgeredRandom(): number {
    const value = real();
    seq += 1;
    ledger.push({ seq, actionSeq: currentActionSeq, value, source: currentSource });
    return value;
  };
  Math.random = installedFn;
}

export function detachRngLedger(): void {
  if (originalRandom) {
    Math.random = originalRandom;
    originalRandom = null;
    installedFn = null;
  }
}

export function rngLedgerAttached(): boolean {
  return installedFn !== null;
}

export function getRngLedger(): readonly RngDraw[] {
  return ledger;
}

export function rngDrawCount(): number {
  return seq;
}

export function resetRngLedger(): void {
  ledger = [];
  seq = 0;
  currentActionSeq = 0;
  currentSource = 'UNKNOWN';
}
