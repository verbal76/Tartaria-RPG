# Guardian Critical-Path Audit — Existing Observability / Diagnostics (Pass 1)

Evidence: full header/export sweep of all 27 files in `app/diagnostics/` (see `system-candidates.md` for
the per-file table), plus `app/engine/gameLog.ts`, `app/state/storeNotify.ts`,
`app/state/visibleLogCount.ts`, `app/state/saveLimits.ts`, and targeted reads of
`app/diagnostics/crashLedger.ts` and `app/diagnostics/sentryTransport.ts` headers. This document catalogs
what can be REUSED without changing gameplay semantics — per the audit's own instruction, nothing here was
modified.

## The game log itself — the base observation surface

`app/engine/gameLog.ts` (43 lines, read in full): `HIDDEN_LOG_CHANNELS`, `isPlayerVisibleChannel`,
`makeEntry`, `formatEntry`. Every player-visible AND hidden (debug/system) log line flows through one
`gameLog` array on the store, channel-tagged. `test-utils/playerWalker.ts`'s feed-mirroring mechanism
(see `existing-walker-map.md`) reads exactly this array by entry identity. `app/state/saveLimits.ts`
(`MAX_LOG_IN_MEMORY`) bounds it in memory; `app/state/visibleLogCount.ts` tracks how much of it the player
has actually scrolled through (`noteVisibleLogLine`, `visibleLogTotal`) — a genuine "has the player SEEN
this" signal distinct from "is it in the log."

## Crash / crash-correlation

- `app/diagnostics/crashLedger.ts` (437 lines) — `CRASH_LEDGER_KEY`, `CRASH_LEDGER_CAP`, `CrashKind`,
  `CrashRecord`, `recordCrash`, `settleCrashWrites`, `unsentCrashes`, `crashLedgerSummary`. Header, quoted:
  *"THE CRASH LEDGER. Owner: 'add crash reporting.'"* A bounded, capped, disk-durable ledger of crash
  events, independent of whether Sentry delivery succeeds.
- `app/diagnostics/crashReporter.ts` — `CrashTransport`, `installCrashTransport`, opt-in gating
  (`reportingOptedIn`, `CRASH_REPORTING_PREF_KEY`) — crash delivery is "inert until two separate things
  are true" per its own header.
- `app/diagnostics/crashCorrelation.ts` (61 lines) — `crashCorrelationId` — "ONE CRASH, ONE CORRELATION
  KEY" (OTA-1882), ties a crash-save export back to its Sentry event.
- `app/diagnostics/crashSave.ts`, `app/diagnostics/lastCrash.ts`, `app/diagnostics/saveLoadHealth.ts`
  (slot-specific crash-count tracking, sibling to `mlHealth.ts`).

## Native memory / runtime pressure — a genuinely deep instrumentation layer

- `app/diagnostics/nativeMemoryRecorder.ts` (**1347 lines** — the single largest diagnostics file) — a
  full "native memory flight recorder": `MEM_KIND`, ratchet-step detection (`RATCHET_MIN_STEPS`,
  `RATCHET_STEP_MB`, `detectRatchetSteps`), baseline stability windows, a `MemoryFlightReport` with
  sample/event row caps. Explicitly self-described (header): *"AN INSTRUMENT, NOT A FIX."*
- `app/diagnostics/memoryTimeline.ts`, `app/diagnostics/subsystemMemoryMarks.ts` (per-subsystem
  mark/unmount tracking — artwork mount/unmount, audio player create/dispose, speech-queue drain),
  `app/diagnostics/runtimePressure.ts` (freeze-verdict detection, `FreezeVerdict`, `StallCrumb`,
  memory-warning tracking), `app/diagnostics/runtimePressureWatch.ts` (the live watcher that starts/stops
  the above and exposes `underMemoryPressure()`/`qwenStoodDownForMemory()` — i.e. the AI subsystem reads
  this same instrument to decide whether to run at all).

## Touch / interaction tracing — directly relevant to a future input-driven Walker

`app/diagnostics/touchPath.ts` (604 lines) — `TOUCH_PATH_SCHEMA`, `TouchStage`, `TouchPathEntry`,
`noteRootTouch`/`claimTouch`/`noteContentTouch`/`notePressIn`/`noteHandlerEnter`/`noteStage`,
`flushTouchPath`. Header, quoted: *"WHERE DOES THE TOUCH STOP? THIS IS AN INSTRUMENT, NOT A REPAIR."* A
full per-tap lifecycle trace (root → content → handler → stage), already built and already the
instrument used to diagnose exactly the class of "the button didn't respond" defect a Walker's `tap()`
call could, in principle, cross-check against. `app/diagnostics/tapClock.ts` (`TAP_LATE_FLAG_MS`,
`TOUCH_FRESH_MS`) and `app/diagnostics/rollTiming.ts` (`AUTO_RESOLVE_HOLD_MS`, dice-roll-specific timing)
are siblings.

## Boot / lifecycle / handoff

`app/diagnostics/bootIdentity.ts` (364 lines) — `BOOT_ID`, `BOOT_AT`, `bootAgeMs`, `OTA_HANDOFF_KEY`,
`HandoffContexts`, `launchFacts`, `launchSummary`. Header: *"WHICH LIFE DIED. AN INSTRUMENT, NOT A FIX."*
Distinguishes which app process/life a given log line or crash belongs to across OTA-triggered reloads —
directly relevant if a future Walker needs to survive or detect an app reload mid-run.
`app/diagnostics/aliveBeat.ts` — the app-wide heartbeat (`ALIVE_BEAT_MS`, `setAliveBeatContext`,
`startAliveBeat`/`stopAliveBeat`), already app-scoped rather than screen-scoped per its own LAG-3 header.

## Save/inventory/about snapshots — reusable "state at a point in time" builders

- `app/diagnostics/saveSnapshot.ts` — `buildSaveSnapshot`, `stampSaveExport` — the COPY SAVE diagnostic.
- `app/diagnostics/inventorySnapshot.ts` — `buildInventorySnapshot`, `stampInventoryExport`.
- `app/diagnostics/aboutSummary.ts` (330 lines) — `buildBasicDeviceSummary`, `stampLogExport` — shared
  device+install summary reused across multiple export surfaces (per its own header).
- `app/diagnostics/portableReport.ts` (284 lines) — `PORTABLE_REPORT_MAX_BYTES`, `assemblePortableReport`,
  `renderBoundedCollection` — the byte-bounded, structured "paste this into a bug report" assembler
  (OTA-1882, "THE PASTE FITS IN THE WINDOW" — the same OTA this session's earlier work in this same
  container shipped, per its own build stamp comment history).
- `app/diagnostics/bugReport.ts` (447 lines) — `LOG_CHARS_CAP`, `FULL_LOG_CHARS_CAP`, `trimLogForReport`,
  the shared bug-report composer "extracted from TitleScreen.sendBugReport" per its header — i.e. this is
  literally the function the player-facing bug-report UI calls, fully reusable headlessly.

## Sentry transport — the delivery layer, not the capture layer

`app/diagnostics/sentryTransport.ts` (1290 lines) — `toSentryEvent`, `installSentryIfAvailable`,
`DiagnosticsBundle`, chunked/inline log-splitting for size-constrained delivery (`LOG_CHUNK_CHARS`,
`packLogIntoParts`, `splitLogIntoBlocks`). This is the wire format the rest of the diagnostics layer feeds
into; not itself a capture mechanism.

## AI/ML health

`app/diagnostics/mlHealth.ts` (1300 lines) — `qwenGateReason`, `shouldAttemptQwen`,
`shouldAttemptBundledTTS`, `deviceCapabilityLine`, `mlHealthSummary` — device-capability gating for the
on-device LLM/TTS subsystems (see `system-candidates.md`'s `app/ai/` group), consulted before those
subsystems even attempt to run.

## Existing test hooks / snapshot machinery (cross-referenced, not re-described)

`test-utils/playerWalker.ts`'s `walkerWorldDigest()` (SHA-256 world fingerprint) and its `WalkReport`
output shape (see `existing-walker-map.md`) are the closest thing to an existing "replay/snapshot" tool in
the repository, though scoped to test-time only and to the mission/faction-quest/whisper families, not to
Guardian fights.

## What is conspicuously ABSENT (recorded as a gap, not a defect)

No dedicated "combat event stream" instrument was found distinct from `app/engine/combatEvent.ts`'s
`CombatEvent`/`combatEventOf` (a presentation-facing typed combat-result shape, cataloged in
`system-candidates.md`, not a diagnostics-layer trace). A future Guardian Walker wanting round-by-round
combat telemetry would likely build on `combatEvent.ts`'s shape rather than on anything in
`app/diagnostics/`, none of which is combat-specific.
