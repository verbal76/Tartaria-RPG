// Strategic repair — Phase 13. Static proof, sibling to
// canonicalFirewallStatic.test.ts and canonicalStrategicFirewallStatic.test.ts,
// scoped to this task's two new files (lifeOrchestrator.ts, strategicEvidence.ts)
// which are NOT part of the player-visible-firewall boundary (they are the
// DRIVER and its evidence sink, the same role Life2/3/4's closures already
// played) — so they are checked for different invariants:
//
//   1. strategicEvidence.ts has ZERO imports — a pure in-memory recorder,
//      structurally unable to reach RNG/store/anything else.
//   2. lifeOrchestrator.ts only ever WRITES evidence (recordStrategicEvidence)
//      and never READS it back (getStrategicEvidence) — evidence can never
//      become a hidden information channel INTO a decision.
//   3. None of the decision-making files (policy.ts, strategicPolicy.ts,
//      equipmentOptions.ts, destinationOptions.ts) import strategicEvidence.ts
//      or lifeOrchestrator.ts at all — decisions are made before evidence is
//      ever written, never informed by it.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve(__dirname, '../test-utils/canonical');
const read = (f: string) => readFileSync(resolve(DIR, f), 'utf8');

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const importRe = /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) specs.push(m[1]!);
  return specs;
}

describe('Strategic repair — orchestrator/evidence static firewall proof', () => {
  it('strategicEvidence.ts has zero imports — a pure recorder, structurally unable to reach RNG/store', () => {
    const source = read('strategicEvidence.ts');
    expect(importSpecifiers(source).length).toBe(0);
  });

  it('lifeOrchestrator.ts writes evidence but never reads it back (no hidden channel into decisions)', () => {
    const source = read('lifeOrchestrator.ts');
    expect(source.includes('recordStrategicEvidence')).toBe(true);
    expect(source.includes('getStrategicEvidence')).toBe(false);
  });

  it('none of the decision-making files (policy/strategicPolicy/equipmentOptions/destinationOptions) import evidence or the orchestrator', () => {
    for (const f of ['policy.ts', 'strategicPolicy.ts', 'equipmentOptions.ts', 'destinationOptions.ts']) {
      const source = read(f);
      const specs = importSpecifiers(source);
      for (const spec of specs) {
        expect(spec.includes('strategicEvidence')).toBe(false);
        expect(spec.includes('lifeOrchestrator')).toBe(false);
      }
    }
  });
});
