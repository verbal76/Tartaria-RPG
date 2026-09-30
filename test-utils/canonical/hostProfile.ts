// P1 — canonical harness host profile.
//
// Not a game-mechanics module: this captures the HOST conditions the owner
// required be true (and recorded, not silently assumed) for the one
// canonical run — no-LLM boundary, homework disarmed, console captured
// rather than discarded, and dependency provenance. It never seeds RNG,
// never virtualizes the clock, and never touches gameStore actions; those
// are virtualClock.ts / rngLedger.ts / the CanonicalWalker's own doors.

import { createHash } from 'crypto';
import { readFileSync, realpathSync } from 'fs';
import { resolve } from 'path';
import type { WorldMemory, WeatherEntry } from '../../app/engine/types';
import { emptyMemory } from '../../app/engine/worldMemory';

// ---------------------------------------------------------------------------
// Console capture — never silently discard.
// ---------------------------------------------------------------------------

export interface CapturedConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
  atMs: number;
}

let capturing = false;
let captured: CapturedConsoleEntry[] = [];
const original: Partial<Record<CapturedConsoleEntry['level'], (...args: unknown[]) => void>> = {};

export function startConsoleCapture(): void {
  if (capturing) return;
  capturing = true;
  captured = [];
  (['log', 'warn', 'error', 'info', 'debug'] as const).forEach((level) => {
    original[level] = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      captured.push({ level, args, atMs: Date.now() });
      original[level]!(...args);
    };
  });
}

export function stopConsoleCapture(): CapturedConsoleEntry[] {
  if (!capturing) return captured;
  (['log', 'warn', 'error', 'info', 'debug'] as const).forEach((level) => {
    if (original[level]) console[level] = original[level]!;
  });
  capturing = false;
  return captured;
}

export function getCapturedConsole(): readonly CapturedConsoleEntry[] {
  return captured;
}

// ---------------------------------------------------------------------------
// Dependency provenance — recorded, never modified. If a dependency change
// ever looks required to make the harness work, STOP and report first
// instead of running `npm install`/editing package.json/package-lock.json.
// ---------------------------------------------------------------------------

export interface DependencyProvenance {
  lockfileSha256: string;
  lockfilePath: string;
  nodeModulesRealpath: string;
  resolvedVersions: Record<string, string>;
}

const PROVENANCE_PACKAGES = [
  'jest',
  'jest-expo',
  'react-native',
  'expo',
  'zustand',
  'typescript',
] as const;

function resolvedVersionOf(pkg: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkgJson = require(`${pkg}/package.json`);
    return typeof pkgJson.version === 'string' ? pkgJson.version : null;
  } catch {
    return null;
  }
}

/**
 * Snapshot what's actually installed, without changing anything. Confirms
 * (rather than assumes) the owner's stated fact that node_modules resolves
 * through the /tmp/diag symlink in this worktree.
 */
export function recordDependencyProvenance(repoRoot: string): DependencyProvenance {
  const lockfilePath = resolve(repoRoot, 'package-lock.json');
  const lockfileSha256 = createHash('sha256').update(readFileSync(lockfilePath)).digest('hex');
  let nodeModulesRealpath: string;
  try {
    nodeModulesRealpath = realpathSync(resolve(repoRoot, 'node_modules'));
  } catch {
    nodeModulesRealpath = '<unresolved>';
  }
  const resolvedVersions: Record<string, string> = {};
  for (const pkg of PROVENANCE_PACKAGES) {
    const v = resolvedVersionOf(pkg);
    if (v) resolvedVersions[pkg] = v;
  }
  return { lockfileSha256, lockfilePath, nodeModulesRealpath, resolvedVersions };
}

// ---------------------------------------------------------------------------
// No-LLM boundary — declare and assert, never simulate.
//
// The canonical run must never construct a fake Qwen response or otherwise
// pretend cognition is active. It asserts the real, production
// `qwen.isReady()` gate is false throughout — the same gate `homeworkTick`,
// `narrateViaArbiter`, and the intent-dispatch pre-checks all read.
// ---------------------------------------------------------------------------

export interface NoLlmAssertion {
  qwenReady: boolean;
}

export function assertNoLlm(qwen: { isReady: () => boolean }): NoLlmAssertion {
  const qwenReady = qwen.isReady();
  if (qwenReady) {
    throw new Error(
      'CANONICAL HOST PROFILE VIOLATION: qwen.isReady() returned true. The canonical run ' +
        'requires the declared no-LLM boundary (Qwen/cognitive not ready) and must not proceed ' +
        'while it is false-for-true.',
    );
  }
  return { qwenReady };
}

// ---------------------------------------------------------------------------
// Homework interval — must stay disarmed for the whole run (product's own
// setHomeworkTick(null)/_homeworkInstalled() API; see jest.teardown.js and
// test-utils/playerWalker.ts's own use of the same door).
// ---------------------------------------------------------------------------

export function assertHomeworkDisarmed(store: { _homeworkInstalled: () => boolean }): void {
  if (store._homeworkInstalled()) {
    throw new Error(
      'CANONICAL HOST PROFILE VIOLATION: the homework interval is armed. The canonical run ' +
        'requires it disarmed for the whole run (setHomeworkTick(null)).',
    );
  }
}

// ---------------------------------------------------------------------------
// AsyncStorage fresh-install boundary — declare, don't reconfigure. The
// existing jest AsyncStorage mock (package.json's moduleNameMapper) already
// starts empty per test file; this just records that fact for the report
// rather than adding a second mock layer.
// ---------------------------------------------------------------------------

export async function assertFreshInstallBoundary(AsyncStorage: {
  getAllKeys: () => Promise<readonly string[]>;
}): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  if (keys.length !== 0) {
    throw new Error(
      `CANONICAL HOST PROFILE VIOLATION: AsyncStorage is not empty at run start (${keys.length} key(s)). ` +
        'The canonical run treats the existing in-memory mock as a deliberately-fresh install.',
    );
  }
}

// ---------------------------------------------------------------------------
// Production weather, fail-closed (Phase 3B, Part 2).
//
// jest.setup.js:133-146 mocks app/engine/encounter's pickWeather() to always
// return a synthetic "Eerie Calm" entry tagged `source: 'test-harness'`, for
// every test file in this repo BY DEFAULT (P5 proof #1,
// __tests__/canonicalWeatherProduction.test.ts, proved that
// jest.unmock('app/engine/encounter') restores production weather). A
// canonical-run host file that forgets that one unmock call would silently
// run its whole canonical journey under the wrong weather system and never
// know it.
//
// This assertion makes that failure mode structurally impossible: the
// canonical host calls it once at boot, with the REAL (hopefully unmocked)
// pickWeather, and it throws — refusing to start the run — unless production
// weather is demonstrably active. It never runs the actual canonical journey
// (P7) to prove this; it is a bounded, focused probe (see
// __tests__/canonicalWeatherFailClosed.test.ts).
// ---------------------------------------------------------------------------

export interface ProductionWeatherAssertion {
  sampledSources: readonly string[];
  sampledIds: readonly string[];
}

/**
 * Draws a handful of samples from the caller's `pickWeather` and refuses to
 * proceed if ANY sample carries the mock's `source: 'test-harness'` tag, or
 * if every sample is suspiciously identical (the mock always returns the
 * exact same entry; production draws from a weighted 9-entry catalog, so a
 * real host should see variety across enough draws). Consumes real RNG
 * draws from whatever Math.random is installed — callers must account for
 * this in their own draw-count expectations (it is a HOST-BOOT probe, not a
 * gameplay action, and should run before the one intentional reseed if the
 * canonical run wants it excluded from the gameplay stream — see the P5
 * proof for the exact ordering this project uses).
 */
export function assertProductionWeatherActive(
  pickWeather: (memory: WorldMemory, location?: { id: string; name: string; tags?: readonly string[] } | null) => WeatherEntry,
  sampleCount = 20,
): ProductionWeatherAssertion {
  const memory = emptyMemory();
  const sampledSources: string[] = [];
  const sampledIds: string[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const w = pickWeather(memory);
    sampledSources.push(w.source ?? '(none)');
    sampledIds.push(w.id);
  }
  if (sampledSources.some((s) => s === 'test-harness')) {
    throw new Error(
      'CANONICAL HOST PROFILE VIOLATION: pickWeather() returned the jest.setup.js mock ' +
        "(source: 'test-harness'). The canonical host requires production weather — call " +
        "jest.unmock('app/engine/encounter') (or the equivalent relative path from the host " +
        'file) before boot. Refusing to start.',
    );
  }
  if (new Set(sampledIds).size <= 1) {
    throw new Error(
      `CANONICAL HOST PROFILE VIOLATION: pickWeather() returned the same weather id every time ` +
        `across ${sampleCount} samples (${sampledIds[0]}). Production draws from a weighted ` +
        '9-entry catalog and should show variety; this is indistinguishable from a still-active ' +
        'mock or a pinned test double. Refusing to start.',
    );
  }
  return { sampledSources, sampledIds };
}
