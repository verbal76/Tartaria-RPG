// P2 — decision journal (channel D).
//
// One record per human-policy action. Per the owner's firewall requirement,
// this module records what the POLICY saw (a PlayerView, never raw store
// state), never contains hidden information as an input, and is populated
// by the CanonicalWalker (which has already committed to the production
// door before recording) — never by the policy module itself, so the
// policy file's own imports stay clean of telemetry (see firewall.proof).

import type { PlayerViewHash } from './playerView';

export interface DecisionRecord {
  seq: number;
  actionSeq: number;
  virtualTimeMs: number;
  position: { locationId: string | null; gridX: number | null; gridY: number | null };
  playerViewHash: PlayerViewHash;
  optionsShown: readonly string[];
  decision: string;
  reason: string;
  productionDoor: string;
  /** [firstStoreDiffSeq, lastStoreDiffSeq] this decision's action produced,
   *  filled in by the walker after the door call settles. */
  resultingDiffRange: readonly [number, number] | null;
}

let journal: DecisionRecord[] = [];
let seq = 0;

export function recordDecision(entry: Omit<DecisionRecord, 'seq'>): DecisionRecord {
  seq += 1;
  const rec: DecisionRecord = { seq, ...entry };
  journal.push(rec);
  return rec;
}

export function getDecisionJournal(): readonly DecisionRecord[] {
  return journal;
}

export function resetDecisionJournal(): void {
  journal = [];
  seq = 0;
}
