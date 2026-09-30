// Phase 3D — shared qualification-recording helpers, extracted from the
// Phase 3C inline version (__tests__/canonicalDoorQualification.test.ts) so
// every Phase 3D bounded-scenario file can file entries the same honest way:
// RUNTIME_PROVEN only when the production door actually ran with result 'ok',
// BLOCKED with the exact reason otherwise. Never forced green.

import type { ActionRecord } from './actionExecutor';
import { recordQualification, getQualifications, type QualificationEntry } from './qualification';

export function fileFromActionRecord(
  family: string,
  precondition: string,
  option: string,
  uiSurface: string,
  record: ActionRecord | null,
  err: unknown,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  consequence: string,
  downstream: string,
): QualificationEntry {
  if (!record || record.result !== 'ok') {
    recordQualification({
      family,
      playerVisiblePrecondition: precondition,
      playerVisibleOption: option,
      policyDecision: record?.policyChoice ?? '(none)',
      executorMethod: family,
      uiSurface,
      productionDoor: record?.productionDoor ?? 'n/a',
      beforeState: before,
      rngDraws: null,
      clockChangeHours: null,
      productionLogs: null,
      stateDiff: null,
      afterState: after,
      playerVisibleConsequence: 'refused/errored — see notes',
      downstreamReaderConsequence: 'n/a',
      telemetryJoin: String(record?.actionSeq ?? '(none)'),
      result: 'BLOCKED',
      notes: err ? String(err) : `production refused (result=${record?.result})`,
    });
    return getQualifications()[getQualifications().length - 1]!;
  }
  const entry: QualificationEntry = {
    family,
    playerVisiblePrecondition: precondition,
    playerVisibleOption: option,
    policyDecision: record.policyChoice,
    executorMethod: family,
    uiSurface,
    productionDoor: record.productionDoor,
    beforeState: before,
    rngDraws: record.rngRange,
    clockChangeHours: null,
    productionLogs: record.logRange,
    stateDiff: record.stateDiffRange,
    afterState: after,
    playerVisibleConsequence: consequence,
    downstreamReaderConsequence: downstream,
    telemetryJoin: String(record.actionSeq),
    result: 'RUNTIME_PROVEN',
    notes: '',
  };
  recordQualification(entry);
  return entry;
}

export function blocked(family: string, precondition: string, reason: string): void {
  recordQualification({
    family,
    playerVisiblePrecondition: precondition,
    playerVisibleOption: '(none offered)',
    policyDecision: '(none)',
    executorMethod: family,
    uiSurface: 'n/a',
    productionDoor: 'n/a',
    beforeState: {},
    rngDraws: null,
    clockChangeHours: null,
    productionLogs: null,
    stateDiff: null,
    afterState: {},
    playerVisibleConsequence: 'n/a — not reached',
    downstreamReaderConsequence: 'n/a',
    telemetryJoin: '(none)',
    result: 'BLOCKED',
    notes: reason,
  });
}

export function sourceProvenOnly(family: string, precondition: string, reason: string): void {
  recordQualification({
    family,
    playerVisiblePrecondition: precondition,
    playerVisibleOption: '(not attempted this run)',
    policyDecision: '(none)',
    executorMethod: family,
    uiSurface: 'n/a',
    productionDoor: 'n/a',
    beforeState: {},
    rngDraws: null,
    clockChangeHours: null,
    productionLogs: null,
    stateDiff: null,
    afterState: {},
    playerVisibleConsequence: 'n/a — not attempted, by owner-allowed scope decision',
    downstreamReaderConsequence: 'n/a',
    telemetryJoin: '(none)',
    result: 'SOURCE_PROVEN_ONLY',
    notes: reason,
  });
}
