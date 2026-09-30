// Phase 3C — action-door qualification ledger.
//
// A QualificationEntry records, per the owner's exact required schema, what
// was attempted for one action family and what production actually did.
// RESULT is never forced green: BLOCKED and SOURCE_PROVEN_ONLY are first-
// class, honest outcomes, not failures of this module.

export type QualificationResult = 'RUNTIME_PROVEN' | 'SOURCE_PROVEN_ONLY' | 'BLOCKED' | 'NOT_APPLICABLE';

export interface QualificationEntry {
  family: string;
  playerVisiblePrecondition: string;
  playerVisibleOption: string;
  policyDecision: string;
  executorMethod: string;
  uiSurface: string;
  productionDoor: string;
  beforeState: Record<string, unknown>;
  rngDraws: readonly [number, number] | null;
  clockChangeHours: number | null;
  productionLogs: readonly [number, number] | null;
  stateDiff: readonly [number, number] | null;
  afterState: Record<string, unknown>;
  playerVisibleConsequence: string;
  downstreamReaderConsequence: string;
  telemetryJoin: string;
  result: QualificationResult;
  notes: string;
}

let entries: QualificationEntry[] = [];

export function recordQualification(e: QualificationEntry): void {
  entries.push(e);
}

export function getQualifications(): readonly QualificationEntry[] {
  return entries;
}

export function resetQualifications(): void {
  entries = [];
}
