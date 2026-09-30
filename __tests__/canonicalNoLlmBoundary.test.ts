// P5 proof — the no-LLM boundary holds, and is DECLARED-AND-ASSERTED, never
// simulated.
//
// Proves test-utils/canonical/hostProfile.ts's assertNoLlm() reads the real
// production gate (qwen.isReady()) and throws loudly if it is ever true,
// rather than the canonical run silently proceeding as if cognition were
// off. Also proves it never constructs a fake LLM response itself — it has
// no code path that could (readable from its own source: it only calls
// `.isReady()`, nothing else on the passed object).
//
// Run focused: npx jest __tests__/canonicalNoLlmBoundary.test.ts

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { assertNoLlm } from '../test-utils/canonical/hostProfile';

describe('P5 proof — no-LLM boundary (declared and asserted, never simulated)', () => {
  it('passes and reports qwenReady: false when the gate reports not-ready', () => {
    const fakeQwen = { isReady: () => false };
    expect(() => assertNoLlm(fakeQwen)).not.toThrow();
    expect(assertNoLlm(fakeQwen)).toEqual({ qwenReady: false });
  });

  it('throws loudly (never silently proceeds) when the gate reports ready', () => {
    const fakeQwen = { isReady: () => true };
    expect(() => assertNoLlm(fakeQwen)).toThrow(/CANONICAL HOST PROFILE VIOLATION/);
  });

  it('reads the caller-supplied gate exactly once per call and nothing else on the object (never simulates a response)', () => {
    let calls = 0;
    const fakeQwen = {
      isReady: () => { calls += 1; return false; },
      // A real LLM engine has generation methods too; assertNoLlm must never
      // touch them.
      generate: () => { throw new Error('assertNoLlm must never call generate()'); },
    };
    assertNoLlm(fakeQwen);
    expect(calls).toBe(1);
  });

  it('source text never constructs a synthetic LLM response, and calls nothing but isReady()', () => {
    const source = readFileSync(resolve(__dirname, '../test-utils/canonical/hostProfile.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const fnBody = code.slice(code.indexOf('export function assertNoLlm'));
    const closeBrace = fnBody.indexOf('\n}');
    const body = fnBody.slice(0, closeBrace);
    expect(body).toMatch(/qwen\.isReady\(\)/);
    expect(body).not.toMatch(/qwen\.(?!isReady)\w+\(/); // no other method call on qwen
  });
});
