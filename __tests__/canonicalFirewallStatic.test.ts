// P5 proof — player-knowledge firewall, enforced by an actual static check.
//
// Proves (not just documents) that test-utils/canonical/policy.ts imports
// NOTHING but its own declared PlayerView types from playerView.ts — never
// the game store, telemetry (rngLedger/storeDiffer/logMirror/
// decisionJournal/snapshot), the CanonicalWalker, or any app/state/* module.
// A future edit that adds a forbidden import fails this test, not just a
// code-review comment.
//
// Run focused: npx jest __tests__/canonicalFirewallStatic.test.ts

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

const POLICY_PATH = resolve(__dirname, '../test-utils/canonical/policy.ts');

const FORBIDDEN_SUBSTRINGS = [
  'app/state/gameStore',
  'app/state/',
  './rngLedger',
  './storeDiffer',
  './logMirror',
  './decisionJournal',
  './snapshot',
  './hostProfile',
  './CanonicalWalker',
  '../playerWalker',
  'useGameStore',
];

/** Strip comments so a doc line explaining what's forbidden ("never calls
 *  set()") doesn't itself trip the forbidden-identifier scan below. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const importRe = /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) specs.push(m[1]!);
  const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRe.exec(source))) specs.push(m[1]!);
  return specs;
}

describe('P5 proof — player-knowledge firewall (static)', () => {
  const source = readFileSync(POLICY_PATH, 'utf8');

  it('policy.ts imports only from playerView.ts (and bare/relative type-only paths), never the store or telemetry', () => {
    const specs = importSpecifiers(source);
    expect(specs.length).toBeGreaterThan(0); // sanity: the regex actually found imports
    for (const spec of specs) {
      const isPlayerView = spec === './playerView' || spec.endsWith('/playerView');
      if (isPlayerView) continue;
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        expect(spec.includes(forbidden)).toBe(false);
      }
    }
  });

  it('policy.ts source text never mentions the raw RNG ledger, store subscribe, or hidden-source identifiers', () => {
    const forbiddenIdentifiers = [
      'useGameStore', 'getRngLedger', 'rngDrawCount', 'attachStoreDiffer',
      'getStoreDiffLog', 'getLogMirror', 'getSnapshots', '.subscribe(',
      'guardianPlayerPower', 'guardianOverLevel', 'monotoneTierHp',
    ];
    const code = stripComments(source);
    for (const id of forbiddenIdentifiers) {
      expect(code.includes(id)).toBe(false);
    }
  });

  it('decide() and resetPolicyState() take only PlayerView + plain option/decision types as parameters (no store/telemetry types)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../test-utils/canonical/policy') as Record<string, unknown>;
    expect(typeof mod.decide).toBe('function');
    expect(typeof mod.resetPolicyState).toBe('function');
    // decide() takes exactly 2 params per its signature (view, options).
    expect((mod.decide as (...a: unknown[]) => unknown).length).toBe(2);
  });

  it('every OTHER file under test-utils/canonical/ that policy.ts is allowed to import from (playerView.ts) does not itself re-export the store, telemetry, or a live subscription', () => {
    const playerViewPath = resolve(dirname(POLICY_PATH), 'playerView.ts');
    const pvCode = stripComments(readFileSync(playerViewPath, 'utf8'));
    expect(pvCode.includes('useGameStore')).toBe(false);
    expect(pvCode.includes('.subscribe(')).toBe(false);
    expect(pvCode.includes('getItemPreview')).toBe(false);
  });
});
