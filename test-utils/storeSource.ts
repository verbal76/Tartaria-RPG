/**
 * `storeSource()` — the store's source, INCLUDING the slices it has been split
 * into. Added OTA-1395.
 *
 * ⚠ Lives in `test-utils/`, not `__tests__/`. The jest-expo preset treats EVERY
 * file under `__tests__/` as a suite, so a helper placed there fails the run with
 * "your test suite must contain at least one test" — which is how this file
 * first announced itself.
 *
 * ⚠⚠ WHY THIS EXISTS, AND WHY IT IS NOT A WEAKENING.
 *
 * A large number of suites pin store behaviour by reading `gameStore.ts` as TEXT
 * and asserting a literal appears in it. That worked while the store was one
 * file. Part 4 is splitting it into slices, and every slice that moves takes some
 * of those literals with it — so each move turns a set of unrelated suites red,
 * for a reason that has nothing to do with what they are testing.
 *
 * Slice 4 alone broke TWENTY-FOUR assertions across TEN suites, all of them
 * pinning something inside `hydrate()` — the telemetry sinks, the ambient
 * contradiction wiring, the crash-ledger promotion, the dying-breath phases.
 * `hydrate` turns out to be the single most source-pinned function in the
 * codebase, which is worth knowing on its own.
 *
 * ⚠ THE TEMPTING FIXES WERE BOTH WRONG. Re-pointing twenty-four assertions by
 * hand is churn that has to be repeated on every future slice. Relaxing them
 * leaves tests that pass and pin nothing. This is the third option: say what a
 * pin actually means now.
 *
 * A pin like "the boot path installs the telemetry sink" was never a claim about
 * a FILE. It was a claim about the STORE. The store is now a store plus its
 * slices, so that is what this returns.
 *
 * ⚠ WHEN NOT TO USE IT. If a test genuinely cares WHICH module something is in —
 * that the legacy-save guess stays out of the record-driven path, that the
 * engines are constructed in exactly one place, that a slice imports no value
 * from the store — read the specific file. `ota1320AuditOfTheAudit` reads both
 * files for exactly that reason, and `ota1392StoreSlices` polices the boundary
 * itself. Those are claims about structure, and this helper would erase them.
 *
 * ⚠ AND IT CANNOT BE USED TO HIDE A DELETION. Every file it concatenates is real
 * source that ships. A literal that vanished from all of them still fails.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const SLICE_DIR = join(ROOT, 'app', 'state', 'slices');

/** Every file the Zustand store is assembled from, concatenated. */
export function storeSource(): string {
  const parts = [readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8')];
  if (existsSync(SLICE_DIR)) {
    for (const f of readdirSync(SLICE_DIR).sort()) {
      if (!f.endsWith('.ts') || f.endsWith('.d.ts')) continue;
      parts.push(readFileSync(join(SLICE_DIR, f), 'utf8'));
    }
  }
  return parts.join('\n');
}

/** The slice files currently in play — useful for a test that wants to say
 *  "this lives in a slice now" without hard-coding which one. */
export function sliceNames(): string[] {
  if (!existsSync(SLICE_DIR)) return [];
  return readdirSync(SLICE_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort();
}
