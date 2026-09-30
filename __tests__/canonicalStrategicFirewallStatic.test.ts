// Strategic repair — Phase 12. Same static-proof pattern as the existing
// canonicalFirewallStatic.test.ts (P5 proof), extended to this repair's new
// files: proves each imports NOTHING from the game store or telemetry, and
// that none references an RNG-consuming identifier — satisfying §23's
// FIREWALL requirement (no forensic hidden data reaches policy; equipment
// evaluation and richer evidence consume no gameplay RNG).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const FILES = [
  'itemIntelligence.ts',
  'equipmentOptions.ts',
  'destinationOptions.ts',
  'strategicPolicy.ts',
].map((f) => resolve(__dirname, '../test-utils/canonical', f));

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

const FORBIDDEN_IDENTIFIERS = [
  'useGameStore', 'getRngLedger', 'rngDrawCount', 'attachStoreDiffer',
  'getStoreDiffLog', 'getLogMirror', 'getSnapshots', '.subscribe(',
  'Math.random', 'rollDie', 'guardianPlayerPower', 'guardianOverLevel', 'monotoneTierHp',
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const importRe = /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) specs.push(m[1]!);
  return specs;
}

describe('Strategic repair — static firewall proof (new files)', () => {
  for (const path of FILES) {
    const source = readFileSync(path, 'utf8');
    const name = path.split('/').pop()!;

    it(`${name} imports nothing from the store or telemetry`, () => {
      const specs = importSpecifiers(source);
      expect(specs.length).toBeGreaterThan(0);
      for (const spec of specs) {
        for (const forbidden of FORBIDDEN_SUBSTRINGS) {
          expect(spec.includes(forbidden)).toBe(false);
        }
      }
    });

    it(`${name} source text never references an RNG-consuming or hidden-source identifier`, () => {
      const code = stripComments(source);
      for (const id of FORBIDDEN_IDENTIFIERS) {
        expect(code.includes(id)).toBe(false);
      }
    });
  }
});
