// ⚠⚠⚠ OTA-1688 — THE DEED LEDGER. Step 2 of the Narrative Agency plan.
//
// The audit (docs/narrative-agency-audit-2026-09-05.md) inventoried sixteen
// systems that remember what the player did, and the contrary walker
// (OTA-1686) measured the mission layer reading none of them: a hunt ground
// visited early said nothing; the proper visit read as a first visit; walking
// out on the reeve was forgotten by the reeve; the brood respawned at three
// with one dead and the Dragon at full after being wounded; the name-token
// stalled it twice. Every one of those is a fact about a PLACE that nothing
// wrote down.
//
// This is the one ledger: `worldMemory.deeds[locationId]` — a short list of
// typed, timestamped facts about what the player did on that ground. Four
// writers, each already a moment the store handles (a mission ground under the
// boots, a card walked out on, a mission fight fled, the state of the bodies
// at the flee), and three readers the plan names: the arrival line, the people
// on the ground, and the narrator's fact sheet.
//
// ⚠ A DEED IS A FACT, NOT PROSE. The readers phrase it; the ledger holds only
// what happened, keyed by the place it happened, so a new reader never needs a
// new writer.
//
// ⚠ BOUNDED. Twenty-four deeds per place, sixty places; the oldest place by
// its newest deed is dropped first. saveTrim caps it again under pressure.

import type { Deed, WorldMemory } from './types';

export const DEEDS_PER_LOCATION = 24;
export const DEED_LOCATIONS = 60;

export function deedsAt(memory: WorldMemory | null | undefined, locationId: string | null | undefined): Deed[] {
  if (!memory?.deeds || !locationId) return [];
  return memory.deeds[locationId] ?? [];
}

export function lastDeed(
  memory: WorldMemory | null | undefined,
  locationId: string | null | undefined,
  pred: (d: Deed) => boolean,
): Deed | null {
  const list = deedsAt(memory, locationId);
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i]!;
    if (pred(d)) return d;
  }
  return null;
}

export function hasDeed(
  memory: WorldMemory | null | undefined,
  locationId: string | null | undefined,
  pred: (d: Deed) => boolean,
): boolean {
  return lastDeed(memory, locationId, pred) !== null;
}

/** Append one deed to a place. Returns the next memory; never mutates. */
export function recordDeed(
  memory: WorldMemory,
  locationId: string,
  deed: Omit<Deed, 'ts'> & { ts?: number },
): WorldMemory {
  const ts = deed.ts ?? Date.now();
  const entry: Deed = { ...deed, ts };
  const prev = memory.deeds ?? {};
  const list = [...(prev[locationId] ?? []), entry].slice(-DEEDS_PER_LOCATION);
  const next: Record<string, Deed[]> = { ...prev, [locationId]: list };
  const keys = Object.keys(next);
  if (keys.length > DEED_LOCATIONS) {
    // Drop the place whose NEWEST deed is oldest — a place the player has not
    // touched in the longest time.
    const newest = (k: string) => next[k]!.reduce((m, d) => Math.max(m, d.ts), 0);
    keys.sort((a, b) => newest(a) - newest(b));
    for (const k of keys.slice(0, keys.length - DEED_LOCATIONS)) delete next[k];
  }
  return { ...memory, deeds: next };
}

/** The last flee from a mission stage's own fight on this ground. */
export function stageFled(
  memory: WorldMemory | null | undefined,
  locationId: string | null | undefined,
  missionId: string,
  stage: number,
): Deed | null {
  return lastDeed(memory, locationId, (d) => d.kind === 'fled' && d.missionId === missionId && d.stage === stage);
}

/** Was this mission stage's ground stood on before the hour given? (A visit
 *  recorded THIS arrival has the current hour; an earlier one is older.) */
export function visitedBefore(
  memory: WorldMemory | null | undefined,
  locationId: string | null | undefined,
  missionId: string,
  stage: number,
  hourNow: number,
): Deed | null {
  return lastDeed(memory, locationId, (d) => d.kind === 'visited' && d.missionId === missionId && d.stage === stage && d.hour < hourNow - 0.01);
}

/** Reader 3 — the narrator's fact sheet, one short clause per deed, newest
 *  first, at most three, a few dozen tokens: the Qwen prompt budget is the
 *  reason for the bound. Null when the ground holds no deeds. */
export function deedsHereLine(memory: WorldMemory | null | undefined, locationId: string | null | undefined): string | null {
  const list = deedsAt(memory, locationId);
  if (!list.length) return null;
  const clauses: string[] = [];
  for (let i = list.length - 1; i >= 0 && clauses.length < 3; i--) {
    const d = list[i]!;
    const c = deedClause(d);
    if (c && !clauses.includes(c)) clauses.push(c);
  }
  return clauses.length ? clauses.join('; ') : null;
}

export function deedClause(d: Deed): string | null {
  switch (d.kind) {
    case 'visited':
      return d.title ? `stood here before on the trail of ${d.title}` : 'stood here before';
    case 'walked_out':
      return d.who ? `walked out on ${d.who} mid-conversation` : 'walked out mid-conversation';
    case 'fled':
      if (d.hpLeft !== undefined && d.hpMax !== undefined && d.who) return `fled ${d.who} after wounding it (${d.hpLeft} of ${d.hpMax} left)`;
      if (d.n !== undefined && d.who) return `fled ${d.who} with ${d.n} still standing`;
      return d.title ? `fled the fight for ${d.title}` : 'fled a fight here';
    default:
      return null;
  }
}
