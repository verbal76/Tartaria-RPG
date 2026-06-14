// arb172 — surface the LAST JS-FATAL CRASH in the exportable diagnostic.
//
// The global ErrorUtils handler (App.tsx) and the beginScene bail (gameStore)
// already stash the crash reason — stage, message, stack — to
// `@tartaria/lastCrash` so the title screen can show "last crash: …". But the
// LOG export that internal testers paste (buildBasicDeviceSummary) only carried
// ML-runtime health + save-load health, so a pure JS crash (logic / render /
// state bug, not native ML) showed up with NO cause in the report. For an
// internal test build that's the difference between "it crashed, no idea why"
// and a stack we can act on.
//
// This caches the record at boot (loadLastCrash, called alongside the other
// health loaders) and exposes a SYNC summary block (lastCrashSummary) for the
// device-summary builder. Best-effort and never throws — it runs in the same
// diagnostic path as a possibly-bricked app.

import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_CRASH_KEY = '@tartaria/lastCrash';

interface LastCrashRecord {
  stage?: string;
  message?: string;
  stack?: string;
  isFatal?: boolean;
  sinceBoot?: number;
  timestamp?: number;
}

let cached: LastCrashRecord | null = null;

/** Load the stashed crash record into the sync cache. Called once at boot,
 *  next to loadSaveLoadHealth / loadMLHealth. Never throws. */
export async function loadLastCrash(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CRASH_KEY);
    cached = raw ? (JSON.parse(raw) as LastCrashRecord) : null;
  } catch {
    cached = null;
  }
}

/** Sync block for buildBasicDeviceSummary. Reads the boot-loaded cache. */
export function lastCrashSummary(): string {
  if (!cached || !cached.message) {
    return 'Last JS crash\n  Status: none recorded';
  }
  const when = cached.timestamp ? new Date(cached.timestamp).toISOString() : 'unknown';
  const lines = [
    'Last JS crash',
    `  Stage: ${cached.stage ?? 'unknown'}${cached.isFatal ? ' (fatal)' : ''}`,
    `  When: ${when}${cached.sinceBoot != null ? ` (${cached.sinceBoot}ms after boot)` : ''}`,
    `  Message: ${(cached.message ?? '').slice(0, 240)}`,
  ];
  if (cached.stack) {
    // First few frames, flattened — enough to locate without flooding the paste.
    lines.push(`  Stack: ${cached.stack.split('\n').slice(0, 4).map((s) => s.trim()).join(' ⏎ ').slice(0, 320)}`);
  }
  return lines.join('\n');
}

/** True when a crash is on file (lets the UI surface a "report this" nudge). */
export function hasLastCrash(): boolean {
  return !!(cached && cached.message);
}

/** Clear the record once it's been seen/exported. Never throws. */
export async function clearLastCrash(): Promise<void> {
  cached = null;
  try {
    await AsyncStorage.removeItem(LAST_CRASH_KEY);
  } catch {
    /* ignore */
  }
}
