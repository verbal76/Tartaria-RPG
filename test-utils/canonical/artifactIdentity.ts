// Phase 11 — collision-safe evidence-artifact paths.
//
// canonicalLife3.test.ts's durable evidence write used to derive its
// filename from RUN_STARTED_AT alone. RUN_STARTED_AT comes from
// installCanonicalClock()'s virtualized Date, which is deliberately
// deterministic — the whole point of the virtual clock is that two runs of
// the exact same scenario are byte-identical. That determinism is correct
// and must not change here. But it means RUN_STARTED_AT is ALSO
// byte-identical across two such runs, so a filename built from it alone
// collided: a second deterministic reproduction silently overwrote the
// first run's forensic evidence (this happened once, to the artifact the
// range-repair investigation itself depended on).
//
// The fix is a separate identity, not a clock change. `crypto.randomUUID()`
// is Node's real crypto RNG — never virtualized by installCanonicalClock()
// (that only patches the Date constructor / Date.now), and never read by
// anything under test, so drawing one cannot affect gameplay RNG
// consumption, production state, or canonical simulation determinism. It
// exists purely to make this run's artifact filename unique on disk.
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface ArtifactPaths {
  readonly runId: string;
  readonly jsonPath: string;
  readonly txtPath: string;
}

/**
 * Build a collision-safe {jsonPath, txtPath} pair for one run's durable
 * evidence, sharing one `runId` so the JSON/TXT twins (and any future
 * cross-reference) can be correlated by identity, not just by filename
 * string-matching. `virtualTimestamp` (the game/virtual clock's
 * RUN_STARTED_AT) is kept in the filename for human sorting even though it
 * is not what makes the path unique — `runId` is.
 *
 * Throws rather than returning a path that already exists on disk: this
 * function must never be the reason forensic evidence gets silently
 * overwritten. `runId` is an optional override for testing determinism of
 * the path-building logic itself; production callers always omit it and
 * get a fresh randomUUID().
 */
export function buildArtifactPaths(
  artifactDir: string,
  label: string,
  virtualTimestamp: string,
  runId: string = randomUUID(),
): ArtifactPaths {
  const stamp = virtualTimestamp.replace(/[:.]/g, '-');
  const base = `${label}-${stamp}-${runId}`;
  const jsonPath = join(artifactDir, `${base}.json`);
  const txtPath = join(artifactDir, `${base}.txt`);
  if (existsSync(jsonPath) || existsSync(txtPath)) {
    throw new Error(
      `Durable evidence artifact path already exists (${jsonPath} / ${txtPath}) despite a fresh identity — refusing to silently overwrite forensic evidence. Investigate before rerunning.`,
    );
  }
  return { runId, jsonPath, txtPath };
}
