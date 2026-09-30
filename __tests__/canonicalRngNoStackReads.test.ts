// P5 proof — zero game-stream stack reads from telemetry.
//
// Proves rngLedger.ts (P2, channel C) never calls Error().stack or any stack
// facility. Phase 2B (UNK-P2-11) measured that source-map-support's own
// quicksort consumes seeded Math.random draws when an error stack is
// captured — so a ledger that captured a stack per draw would itself
// perturb the very stream it's trying to observe. "UNKNOWN source" is
// preferred over a stack read, per the owner's explicit ruling.
//
// Run focused: npx jest __tests__/canonicalRngNoStackReads.test.ts

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { attachRngLedger, detachRngLedger, resetRngLedger, getRngLedger, rngDrawCount } from '../test-utils/canonical/rngLedger';

const RNG_LEDGER_PATH = resolve(__dirname, '../test-utils/canonical/rngLedger.ts');

describe('P5 proof — RNG ledger never reads a stack', () => {
  afterEach(() => {
    detachRngLedger();
    resetRngLedger();
  });

  it('source text never constructs an Error, reads .stack, or calls a stack-trace API', () => {
    const source = readFileSync(RNG_LEDGER_PATH, 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.includes('new Error')).toBe(false);
    expect(code.includes('.stack')).toBe(false);
    expect(code.includes('captureStackTrace')).toBe(false);
    expect(code.includes('prepareStackTrace')).toBe(false);
  });

  it('attaching the ledger adds no draws by itself (the wrapper does nothing until Math.random is called)', () => {
    resetRngLedger();
    attachRngLedger();
    expect(rngDrawCount()).toBe(0);
  });

  it('the ledger records exactly one draw per Math.random() call — no hidden extra draws from stack capture', () => {
    resetRngLedger();
    attachRngLedger();
    for (let i = 0; i < 10; i++) Math.random();
    expect(rngDrawCount()).toBe(10);
    expect(getRngLedger()).toHaveLength(10);
  });

  it('a real Error thrown elsewhere WHILE the ledger is attached does not itself draw from Math.random (the ledger is not fooled into counting stack-construction draws as gameplay draws)', () => {
    resetRngLedger();
    attachRngLedger();
    const before = rngDrawCount();
    try {
      throw new Error('unrelated error, not constructed by the ledger');
    } catch {
      /* swallow */
    }
    expect(rngDrawCount()).toBe(before);
  });
});
