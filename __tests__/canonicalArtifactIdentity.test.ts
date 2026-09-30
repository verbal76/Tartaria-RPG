// Phase 11 — focused regression for the evidence-artifact identity fix.
//
// The bug being closed: canonicalLife3.test.ts's durable-evidence filename
// used to come from RUN_STARTED_AT alone, which is drawn from the
// virtualized canonical clock (installCanonicalClock()) and is therefore
// byte-identical across every deterministic rerun of the exact same
// scenario. A second deterministic run silently overwrote the first run's
// forensic evidence — which is exactly what happened to the artifact the
// range-repair investigation this task closes depended on.
//
// These tests exercise buildArtifactPaths() directly, against a real
// temp directory (no store, no boot, no production doors) — small, fast,
// and independent of the full Life 3 harness.

import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildArtifactPaths } from '../test-utils/canonical/artifactIdentity';

describe('buildArtifactPaths (Phase 11 — artifact identity)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'canonical-artifact-identity-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('two calls with the SAME virtual timestamp (the exact collision that bit the old filename scheme) produce two DIFFERENT paths', () => {
    const sameVirtualTimestamp = '2026-01-01T09:00:07.500Z';
    const a = buildArtifactPaths(dir, 'life3-run', sameVirtualTimestamp);
    const b = buildArtifactPaths(dir, 'life3-run', sameVirtualTimestamp);
    expect(a.jsonPath).not.toBe(b.jsonPath);
    expect(a.txtPath).not.toBe(b.txtPath);
    expect(a.runId).not.toBe(b.runId);
  });

  it('the virtual timestamp is still present in the path for human sorting, even though it is not what makes the path unique', () => {
    const { jsonPath } = buildArtifactPaths(dir, 'life3-run', '2026-01-01T09:00:07.500Z');
    expect(jsonPath).toMatch(/2026-01-01T09-00-07-500Z/);
  });

  it('json and txt paths for the same call share the same runId in their filenames — correlates the twins by identity', () => {
    const { runId, jsonPath, txtPath } = buildArtifactPaths(dir, 'life3-run', '2026-01-01T09:00:07.500Z');
    expect(jsonPath).toContain(runId);
    expect(txtPath).toContain(runId);
  });

  it('⚠⚠⚠ never silently overwrites: refuses (throws) when the computed path already exists on disk, and the existing content is untouched', () => {
    const runId = 'forced-collision-id';
    const first = buildArtifactPaths(dir, 'life3-run', '2026-01-01T09:00:07.500Z', runId);
    writeFileSync(first.jsonPath, '{"already":"here"}');
    expect(() => buildArtifactPaths(dir, 'life3-run', '2026-01-01T09:00:07.500Z', runId)).toThrow(
      /already exists/i,
    );
    // buildArtifactPaths only computes and checks paths — it never itself
    // writes — so the pre-existing file's content must be exactly what this
    // test wrote, proving the throw happened before any write was attempted.
    expect(readFileSync(first.jsonPath, 'utf8')).toBe('{"already":"here"}');
  });

  it('does not throw for a fresh runId even at the identical virtual timestamp that just collided above', () => {
    const { jsonPath } = buildArtifactPaths(dir, 'life3-run', '2026-01-01T09:00:07.500Z');
    expect(existsSync(jsonPath)).toBe(false); // computed, not yet written — this call only builds+checks the path
  });

  it('different labels (e.g. a future non-Life-3 caller) never collide with each other at the same timestamp+runId', () => {
    const runId = 'shared-id-different-label';
    const a = buildArtifactPaths(dir, 'life3-run', '2026-01-01T09:00:07.500Z', runId);
    const b = buildArtifactPaths(dir, 'life4-run', '2026-01-01T09:00:07.500Z', runId);
    expect(a.jsonPath).not.toBe(b.jsonPath);
  });
});
