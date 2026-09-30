// Phase 5A, Part 4 — negative-control proof for the central qualification
// framework (test-utils/canonical/qualify.ts). Repairs I-013
// (qualification-no-exception-equals-success).
//
// Every scenario below uses a CONTROLLED FIXTURE action — a small in-memory
// object and hand-written execute()/predicate() functions — never a real
// production door. Part 4 builds and proves the measuring framework only;
// it does not requalify REINFORCEMENT, FUSE, STORY/FORK, SELL, VENDOR
// REPAIR, BENCH REPAIR, or CRAFTING (those are later, Part 11, work). The
// only real repository artifact this file reads is docs/cartography/
// reachability.json (NC5-NC7), and only to prove the reachability gate
// integrates with genuine Part 3 rows — it is never written to.
//
// The jest.mock() header below is required only because qualify.ts imports
// walkerClockNow() from test-utils/playerWalker.ts, which transitively
// imports app/state/gameStore.ts — the same boilerplate every other
// canonical test file already carries to let that import resolve under
// jest, not because this file drives any gameplay.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { qualify, type QualifyArgs, type PredicateResult } from '../test-utils/canonical/qualify';
import { attachRngLedger, detachRngLedger, resetRngLedger, rngDrawCount } from '../test-utils/canonical/rngLedger';
import { installCanonicalClock, uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { walkerClockNow } from '../test-utils/playerWalker';

interface Fixture {
  tc: number;
  unrelated: number;
}

function freshFixture(): Fixture {
  return { tc: 100, unrelated: 0 };
}

/** A tiny mutable "store" the fixture execute() functions act on, standing
 *  in for GameStore — plain object, no production code involved. */
let state: Fixture;

function captureState(): Fixture {
  return { ...state }; // plain shallow copy — observational, no mutation.
}

const REAL_STORE_ONLY_ROW = 'RCH-002-travel-continue-live-enemies';
const REAL_NOT_IMPLEMENTED_ROW = 'RCH-008-combat-heal-chip';
const REAL_GOOD_ROW = 'RCH-001-travel-continue-no-enemies';

beforeEach(() => {
  state = freshFixture();
});

describe('Phase 5A Part 4 — central qualification framework, negative controls', () => {
  it('NC1: void return + unchanged state -> NOT RUNTIME_PROVEN (NO_STATE_CHANGE)', async () => {
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC1',
      mechanismId: 'FIXTURE-VOID-NOOP',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'always true', verify: () => true },
      captureState,
      execute: () => { /* returns void, mutates nothing */ },
      predicate: ({ before, after }) => ({ passed: after.tc > before.tc, reason: 'tc did not increase' }),
      expectedConsequence: 'tc increases',
    });
    expect(record.outcome).not.toBe('RUNTIME_PROVEN');
    expect(record.outcome).toBe('NO_STATE_CHANGE');
    expect(record.observedConsequence).toBeNull();
  });

  it('NC2: explicit success verdict + consequence absent -> NOT RUNTIME_PROVEN', async () => {
    const record = await qualify<Fixture, { ok: boolean }>({
      qualificationId: 'NC2',
      mechanismId: 'FIXTURE-VERDICT-ONLY',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'always true', verify: () => true },
      captureState,
      execute: () => ({ ok: true }), // verdict claims success; nothing actually mutated.
      predicate: ({ before, after, verdict }) => ({
        passed: !!verdict?.ok && after.tc > before.tc,
        reason: 'verdict said ok, but tc unchanged',
      }),
      expectedConsequence: 'tc increases',
    });
    expect(record.outcome).not.toBe('RUNTIME_PROVEN');
    expect(record.produced.verdict).toEqual({ ok: true });
    expect(record.outcome).toBe('NO_STATE_CHANGE'); // state genuinely didn't move.
  });

  it('NC3: unrelated state mutated, required predicate state unchanged -> NOT RUNTIME_PROVEN (SUCCESS_PREDICATE_FAILED, not NO_STATE_CHANGE)', async () => {
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC3',
      mechanismId: 'FIXTURE-WRONG-FIELD',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'always true', verify: () => true },
      captureState,
      execute: () => { state.unrelated += 1; }, // mutates something, just not tc.
      predicate: ({ before, after }) => ({ passed: after.tc > before.tc, reason: 'tc did not increase (unrelated field changed instead)' }),
      expectedConsequence: 'tc increases',
    });
    expect(record.outcome).not.toBe('RUNTIME_PROVEN');
    expect(record.outcome).toBe('SUCCESS_PREDICATE_FAILED');
    expect(record.before).not.toEqual(record.after); // proves this is NOT the NC1 case.
  });

  it('NC4: precondition false -> action never executed -> PRECONDITION_NOT_MET', async () => {
    const executeSpy = jest.fn();
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC4',
      mechanismId: 'FIXTURE-PRECONDITION-FALSE',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'deliberately false', verify: () => false },
      captureState,
      execute: executeSpy,
      predicate: () => ({ passed: true, reason: 'should never run' }),
      expectedConsequence: 'n/a',
    });
    expect(record.outcome).toBe('PRECONDITION_NOT_MET');
    expect(executeSpy).not.toHaveBeenCalled();
    expect(record.before).toBeNull();
  });

  it('NC5: reachability STORE_ONLY -> refuses before action (real Part 3 row)', async () => {
    const executeSpy = jest.fn();
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC5',
      mechanismId: 'FIXTURE-STORE-ONLY',
      reachability: { kind: 'HUMAN_PLAY', rowId: REAL_STORE_ONLY_ROW },
      precondition: { description: 'always true', verify: () => true },
      captureState,
      execute: executeSpy,
      predicate: () => ({ passed: true, reason: 'should never run' }),
      expectedConsequence: 'n/a',
    });
    expect(record.outcome).toBe('REACHABILITY_NOT_ESTABLISHED');
    expect(executeSpy).not.toHaveBeenCalled();
    expect(record.reachability.row?.reachability).toBe('STORE_ONLY');
  });

  it('NC6: player-reachable but harnessMirrorsGate != YES -> refuses before action (real Part 3 row)', async () => {
    const executeSpy = jest.fn();
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC6',
      mechanismId: 'FIXTURE-GATE-NOT-MIRRORED',
      reachability: { kind: 'HUMAN_PLAY', rowId: REAL_NOT_IMPLEMENTED_ROW },
      precondition: { description: 'always true', verify: () => true },
      captureState,
      execute: executeSpy,
      predicate: () => ({ passed: true, reason: 'should never run' }),
      expectedConsequence: 'n/a',
    });
    expect(record.outcome).toBe('REACHABILITY_NOT_ESTABLISHED');
    expect(executeSpy).not.toHaveBeenCalled();
    expect(record.reachability.row?.harnessMirrorsGate).not.toBe('YES');
  });

  it('NC7: success predicate passes with legitimate reachability/precondition -> RUNTIME_PROVEN (real Part 3 row)', async () => {
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC7',
      mechanismId: 'FIXTURE-GENUINE-SUCCESS',
      reachability: { kind: 'HUMAN_PLAY', rowId: REAL_GOOD_ROW },
      precondition: { description: 'always true', verify: () => true },
      captureState,
      execute: () => { state.tc += 10; },
      predicate: ({ before, after }) => ({ passed: after.tc === before.tc + 10, reason: 'tc increased by 10' }),
      expectedConsequence: 'tc increases by 10',
      measureDelta: (before, after) => ({ tcBefore: before.tc, tcAfter: after.tc }),
    });
    expect(record.outcome).toBe('RUNTIME_PROVEN');
    expect(record.observedConsequence).toBe('tc increases by 10');
    expect(record.measuredDelta).toEqual({ tcBefore: 100, tcAfter: 110 });
    expect(record.reachability.row?.reachability).toBe('PLAYER_UI_REACHABLE');
    expect(record.reachability.row?.harnessMirrorsGate).toBe('YES');
  });

  it('NC8: predicate throws -> HARNESS_ERROR, not a production-failure outcome', async () => {
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC8',
      mechanismId: 'FIXTURE-PREDICATE-THROWS',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'always true', verify: () => true },
      captureState,
      execute: () => { state.tc += 1; },
      predicate: () => { throw new Error('predicate bug'); },
      expectedConsequence: 'n/a',
    });
    expect(record.outcome).toBe('HARNESS_ERROR');
    expect(record.failureReason).toContain('predicate bug');
    expect(record.outcome).not.toBe('BLOCKED');
    expect(record.outcome).not.toBe('SUCCESS_PREDICATE_FAILED');
  });

  it('NC9: captureState throws (before) -> HARNESS_ERROR', async () => {
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC9a',
      mechanismId: 'FIXTURE-CAPTURE-THROWS-BEFORE',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'always true', verify: () => true },
      captureState: () => { throw new Error('capture bug (before)'); },
      execute: () => {},
      predicate: () => ({ passed: true, reason: 'should never run' }),
      expectedConsequence: 'n/a',
    });
    expect(record.outcome).toBe('HARNESS_ERROR');
    expect(record.failureReason).toContain('capture bug (before)');
  });

  it('NC9: captureState throws (after) -> HARNESS_ERROR', async () => {
    let calls = 0;
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC9b',
      mechanismId: 'FIXTURE-CAPTURE-THROWS-AFTER',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'always true', verify: () => true },
      captureState: () => {
        calls += 1;
        if (calls === 2) throw new Error('capture bug (after)');
        return captureState();
      },
      execute: () => { state.tc += 1; },
      predicate: () => ({ passed: true, reason: 'should never run' }),
      expectedConsequence: 'n/a',
    });
    expect(record.outcome).toBe('HARNESS_ERROR');
    expect(record.failureReason).toContain('capture bug (after)');
    expect(record.before).not.toBeNull(); // the first (before) capture DID succeed.
  });

  it('NC10: production action throws -> BLOCKED, predicate never called', async () => {
    const predicateSpy = jest.fn<PredicateResult, [never]>(() => ({ passed: true, reason: 'should never run' }));
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC10',
      mechanismId: 'FIXTURE-EXECUTE-THROWS',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'always true', verify: () => true },
      captureState,
      execute: () => { throw new Error('production refused'); },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      predicate: predicateSpy as any,
      expectedConsequence: 'n/a',
    });
    expect(record.outcome).toBe('BLOCKED');
    expect(record.failureReason).toContain('production refused');
    expect(predicateSpy).not.toHaveBeenCalled();
    expect(record.after).toBeNull();
  });

  it('NC11: before-state capture demonstrably occurs before execute(), after-state capture after execute()', async () => {
    const order: string[] = [];
    const record = await qualify<Fixture, void>({
      qualificationId: 'NC11',
      mechanismId: 'FIXTURE-ORDERING',
      reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
      precondition: { description: 'always true', verify: () => true },
      captureState: () => { order.push(order.includes('execute') ? 'capture-after' : 'capture-before'); return captureState(); },
      execute: () => { order.push('execute'); state.tc = 999; },
      predicate: ({ before, after }) => ({ passed: before.tc === 100 && after.tc === 999, reason: 'before/after reflect pre/post mutation' }),
      expectedConsequence: 'tc becomes 999',
    });
    expect(order).toEqual(['capture-before', 'execute', 'capture-after']);
    expect(record.before).toEqual({ tc: 100, unrelated: 0 });
    expect(record.after).toEqual({ tc: 999, unrelated: 0 });
    expect(record.outcome).toBe('RUNTIME_PROVEN');
  });

  it('NC11b: caller cannot supply pre-fabricated before/after — the tautological-capture bug class is structurally unavailable (type-level proof)', () => {
    // The old bug (SELL/VENDOR-REPAIR): both "before" and "after" were plain
    // caller-computed values, both evaluated after the production call. In
    // this framework there is no `before`/`after` field on QualifyArgs at
    // all — only `captureState`, called by the framework itself, twice.
    const args: QualifyArgs<Fixture, void> = {
      qualificationId: 'shape-check',
      mechanismId: 'FIXTURE-SHAPE',
      reachability: { kind: 'NOT_CLAIMED', reason: 'type-shape check only, never run' },
      precondition: { description: 'n/a', verify: () => true },
      captureState,
      execute: () => {},
      predicate: () => ({ passed: true, reason: 'n/a' }),
      expectedConsequence: 'n/a',
    };
    expect('before' in args).toBe(false);
    expect('after' in args).toBe(false);
    expect(typeof args.captureState).toBe('function');
  });

  describe('NC12: qualification observation introduces zero additional RNG/clock/store mutations beyond execute() itself', () => {
    beforeEach(() => {
      resetRngLedger();
      attachRngLedger();
      installCanonicalClock();
    });
    afterEach(() => {
      detachRngLedger();
      uninstallCanonicalClock();
    });

    it('execute() that draws zero RNG and advances no clock -> qualify() itself draws zero RNG and advances no clock', async () => {
      const rngBeforeWholeCall = rngDrawCount();
      const clockBeforeWholeCall = walkerClockNow();
      const record = await qualify<Fixture, void>({
        qualificationId: 'NC12a',
        mechanismId: 'FIXTURE-ZERO-PERTURBATION',
        reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
        precondition: { description: 'always true', verify: () => true },
        captureState,
        execute: () => { state.tc += 1; }, // no RNG, no clock advance.
        predicate: ({ before, after }) => ({ passed: after.tc === before.tc + 1, reason: 'tc +1' }),
        expectedConsequence: 'tc +1',
      });
      const rngAfterWholeCall = rngDrawCount();
      const clockAfterWholeCall = walkerClockNow();
      expect(rngAfterWholeCall - rngBeforeWholeCall).toBe(0);
      expect(clockAfterWholeCall).toBe(clockBeforeWholeCall);
      expect(record.rngDrawSpan).toBeNull();
      expect(record.virtualClockMs.before).toBe(record.virtualClockMs.after);
      expect(record.outcome).toBe('RUNTIME_PROVEN');
    });

    it('execute() that draws N RNG values -> qualify() attributes exactly N draws to the span, no more', async () => {
      const rngBeforeWholeCall = rngDrawCount();
      const record = await qualify<Fixture, void>({
        qualificationId: 'NC12b',
        mechanismId: 'FIXTURE-KNOWN-RNG-COUNT',
        reachability: { kind: 'NOT_CLAIMED', reason: 'fixture-only negative control' },
        precondition: { description: 'always true', verify: () => true },
        captureState,
        execute: () => {
          Math.random(); Math.random(); Math.random(); // exactly 3 draws, attributable to execute() only.
          state.tc += 1;
        },
        predicate: ({ before, after }) => ({ passed: after.tc === before.tc + 1, reason: 'tc +1' }),
        expectedConsequence: 'tc +1',
      });
      const rngAfterWholeCall = rngDrawCount();
      expect(rngAfterWholeCall - rngBeforeWholeCall).toBe(3);
      expect(record.rngDrawSpan).toEqual([rngBeforeWholeCall + 1, rngBeforeWholeCall + 3]);
    });
  });
});
