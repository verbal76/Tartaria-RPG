// P1 — canonical host clock virtualization.
//
// READ-ONLY EVIDENCE THIS BUILDS ON (Phase 2B, UNK-P2-11):
//   test-utils/playerWalker.ts's installWalkerClock() already patches
//   Date.now() to a deterministic, action-advanced clock. It does NOT patch
//   no-argument `new Date()`, which is the one real-calendar leak Phase 2B
//   found reachable on the canonical path (app/engine/vendors.ts:479-486,
//   `marketRotationDay(new Date())`).
//
// This module does not replace installWalkerClock. It reuses it for
// Date.now() (via advanceWalkerClock/walkerClockNow) and additionally
// virtualizes the no-argument `Date` constructor and `Date()` call form, so
// that:
//   - `Date.now()`        -> virtual time (already true via playerWalker)
//   - `new Date()`        -> a Date object built from the virtual time
//   - `new Date(x)`       -> UNCHANGED, real Date semantics (owner requirement)
//   - `new Date(y,m,...)` -> UNCHANGED (multi-arg form untouched)
//
// Telemetry reads (Date.now() calls made BY the telemetry layer itself) must
// not advance the clock — they don't, because advanceWalkerClock() is only
// ever called from Walker.tap() (test-utils/playerWalker.ts:180). A plain
// read of Date.now() or `new Date()` is side-effect-free by construction:
// both simply return the box's current `now` value.
//
// No production file is imported or modified by this module.

import {
  installWalkerClock,
  uninstallWalkerClock,
  walkerClockNow,
} from '../playerWalker';

type DateCtor = typeof Date;

let realDateCtor: DateCtor | null = null;
let installed = false;

/** True while the no-arg `new Date()` / `Date()` form is virtualized. */
export function dateVirtualized(): boolean {
  return installed;
}

/**
 * Install the canonical clock: the existing walker Date.now() virtualization
 * plus a no-argument `new Date()` / `Date()` virtualization layered on top.
 * Idempotent (mirrors installWalkerClock's reference counting for Date.now;
 * the Date-constructor patch itself is a simple installed/not-installed flag
 * guarded the same way callers already guard installWalkerClock).
 */
export function installCanonicalClock(): void {
  installWalkerClock();
  if (installed) return;
  realDateCtor = Date;
  const RealDate = realDateCtor;

  function VirtualDate(this: unknown, ...args: unknown[]): Date | string {
    const now = walkerClockNow();
    if (!(this instanceof VirtualDate)) {
      // `Date()` called without `new` — real Date ignores args and returns a
      // string; preserve that shape, but built from the virtual instant.
      return new RealDate(now ?? RealDate.now()).toString();
    }
    if (args.length === 0) {
      // The one form this module exists to change.
      return new RealDate(now ?? RealDate.now()) as unknown as Date;
    }
    // Any explicit argument form: untouched, real Date semantics.
    return new (RealDate as unknown as { new (...a: unknown[]): Date })(...args);
  }
  // Preserve statics (Date.now, Date.parse, Date.UTC, prototype chain) so
  // `instanceof Date`, `Date.now()`, etc. all keep working through the
  // virtualized constructor. Date.now() itself is already patched by
  // installWalkerClock(); re-assigning it here would be redundant, not
  // wrong, so it's left alone deliberately.
  Object.setPrototypeOf(VirtualDate, RealDate);
  VirtualDate.prototype = RealDate.prototype;

  (globalThis as { Date: DateCtor }).Date = VirtualDate as unknown as DateCtor;
  installed = true;
}

/** Restore the real Date constructor and the real Date.now(). */
export function uninstallCanonicalClock(): void {
  if (installed && realDateCtor) {
    (globalThis as { Date: DateCtor }).Date = realDateCtor;
    installed = false;
    realDateCtor = null;
  }
  uninstallWalkerClock();
}
