// OTA-1882 — ONE CRASH, ONE CORRELATION KEY (#214).
//
// The owner's orange recovery card offered COPY CRASHED SAVE, he pressed it, and
// the payload was too large to paste anywhere. Bounding that export (see
// `portableReport.ts`) means the pasted report no longer carries the whole state
// — so it has to be able to NAME the full evidence instead. This file is that
// name, and it is deliberately the smallest thing that can be.
//
// ⚠⚠⚠ WHY NOT `bundleId`, WHICH IS THE OBVIOUS ANSWER AND THE WRONG ONE.
// `pendingBundle` mints the id the relay files our evidence under as
// `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`. Three
// facts disqualify it: it contains randomness, so it cannot be derived from the
// crash; it is minted at SEND-STAGING time, which is strictly later than the
// capture; and in the incident that prompted this package the process DIED after
// the capture and the push happened on the next boot, so at capture time the
// bundle did not exist in any form. Reading "the newest pending bundle" at COPY
// time would be a reverse lookup against mutable disk state that an adjacent
// crash, a manual SEND LOG, or a retry all move — which is exactly the
// cross-association this key exists to prevent.
//
// ⚠⚠ SO THE KEY IS MADE OF THE CRASH'S OWN FACTS. `ts` and `kind` are both known
// at the instant of the crash, on both paths, and they are already what the crash
// ledger has keyed its records on since it was written. This file does not invent
// a scheme; it lifts the ledger's existing spelling DOWN into a leaf so the
// capture side and the ledger side cannot drift into two spellings of one idea.
// That is the same rule `saveLimits.ts` was created for: when two modules share a
// value, the value moves down to something neither of them owns.
//
// ⚠ AND IT IS CALLED "CORRELATION", NOT "UNIQUE", BECAUSE THAT IS WHAT IT IS.
// See the collision note on `crashCorrelationId` below. The property #214 needs
// is that one crash's capture and one crash's relayed evidence agree on one key
// — not that the key is a globally unique identifier. Claiming the stronger
// thing would be a lie a future reader would rely on.

import type { CrashKind } from './crashLedger';

/**
 * The correlation key for one crash: its timestamp and its kind.
 *
 * ⚠⚠ COLLISION SEMANTICS, STATED EXACTLY, because "unique" would be false.
 * Two DIFFERENT crashes of the SAME `kind` inside the SAME millisecond produce
 * the SAME key. Nothing in the system prevents that, and `recordCrash` already
 * treats it as one crash on purpose — it dedups on this id so that a re-entered
 * `hydrate()` cannot invent a crash that never happened. This package inherits
 * that behaviour rather than changing it: a same-millisecond same-kind pair was
 * already one ledger row before #214 and still is.
 *
 * What IS guaranteed, and what #214 relies on:
 *   · the same crash yields the same key everywhere it is computed, because the
 *     key is a pure function of facts fixed at the moment of the crash;
 *   · two crashes at different milliseconds get different keys;
 *   · two crashes of different kinds get different keys even at one timestamp;
 *   · no randomness, no clock re-read, no global state, so a restart, a retry or
 *     a later send cannot change a crash's key.
 *
 * That is deterministic correlation, which is the property the pasted report
 * needs in order to point at the right full evidence.
 */
export function crashCorrelationId(ts: number, kind: CrashKind): string {
  return `${ts}_${kind}`;
}
