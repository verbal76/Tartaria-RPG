// Strategic repair — Phase 13 (driver integration + observability). Closes
// the deferred gap named in the Phase 12 report's known limitation #6/§10:
// "Not yet exercised inside an actual life driver — proven only in isolated
// fixtures" plus the owner's originally-requested, previously-deferred
// non-perturbing strategic/travel evidence surface.
//
// Same architectural role and shape as decisionJournal.ts (P2, channel D),
// which this module does NOT modify or replace — decisionJournal.ts already
// covers per-round COMBAT decisions. This is its BETWEEN-ENCOUNTER/STRATEGIC
// sibling: one record per strategic decision (recovery/retreat/destination/
// equipment/vendor), carrying the richer fields the owner asked for (§10)
// that decisionJournal's combat-shaped schema doesn't carry (destination,
// equip before/after identity, learned danger state).
//
// Like decisionJournal.ts, this module is POPULATED BY THE ORCHESTRATOR
// (test-utils/canonical/lifeOrchestrator.ts) AFTER it has already committed
// to the real production door — never by policy.ts or the strategic option
// constructors themselves, and it is never read back by them either. A
// static firewall test (canonicalStrategicFirewallStatic.test.ts, extended
// this task) proves policy.ts/strategicPolicy.ts/equipmentOptions.ts/
// destinationOptions.ts never import this file.
//
// Non-perturbing by construction: a plain in-memory array push, no RNG, no
// store access, no mutation of anything the caller hands in. Proven by
// canonicalStrategicEvidenceNonPerturbation.test.ts (§11): the same bounded
// deterministic sequence run twice — once recording, once not — produces an
// identical RNG draw count and identical resulting player state; only the
// evidence artifact differs (present vs. absent).

export interface StrategicEvidenceRecord {
  seq: number;
  /** In-game clock, player-visible (the same value the log/report lines
   *  already print as `hoursElapsed=`) — caller-supplied, never computed
   *  here. null when the caller didn't have one available (e.g. a bounded
   *  fixture with no live player). */
  hoursElapsed: number | null;
  locationId: string | null;
  /** The destination this decision named, when it concerns travel/route
   *  choice (a set-course or retreat target) — else null. */
  destinationId: string | null;
  /** 'continue' | 'rest' | 'retreat' | 'set-course' | 'equip' | 'buy' | null
   *  — the concrete action the orchestrator executed as a RESULT of this
   *  decision (never the option id alone, which can be opaque). */
  travelAction: string | null;
  hp: number;
  hpMax: number;
  stamina: number;
  staminaMax: number;
  /** The Decision.category returned by policy.ts/strategicPolicy.ts. */
  strategicCategory: string;
  optionId: string | null;
  /** The exact human-readable reason string decide()/decideBetweenEncounters()
   *  returned — built entirely from PLAYER_VISIBLE/PLAYER_DERIVABLE/
   *  LEARNED_DURING_THIS_LIFE inputs, per policy.ts's own contract. */
  reason: string;
  /** Item name previously in the relevant slot, only when this record is an
   *  equip decision; else null. */
  equipBefore: string | null;
  /** Item name now in the relevant slot, only when this record is an equip
   *  decision; else null. */
  equipAfter: string | null;
  /** A snapshot of the LEARNED_DURING_THIS_LIFE visited-capital-danger map
   *  used for a destination decision, when applicable — else null. Plain
   *  data, not a live reference, so later mutation of the caller's map
   *  cannot retroactively rewrite past evidence. */
  learnedDangerState: Readonly<Record<string, number>> | null;
}

let log: StrategicEvidenceRecord[] = [];
let seq = 0;

export function recordStrategicEvidence(entry: Omit<StrategicEvidenceRecord, 'seq'>): StrategicEvidenceRecord {
  seq += 1;
  const rec: StrategicEvidenceRecord = { seq, ...entry };
  log.push(rec);
  return rec;
}

export function getStrategicEvidence(): readonly StrategicEvidenceRecord[] {
  return log;
}

export function resetStrategicEvidence(): void {
  log = [];
  seq = 0;
}
