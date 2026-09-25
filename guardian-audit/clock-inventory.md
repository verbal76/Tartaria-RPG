# Guardian Critical-Path Audit — Clock / Time Inventory (Pass 1)

**99 files** in `app/` reference a wall-clock or timer primitive (`Date.now()`, `setTimeout()`, `setInterval()`, or `performance.now()`), found by a direct grep sweep of every `.ts`/`.tsx` file (evidence: raw match counts, not inference).

| clock primitive | files using it |
|---|---:|
| Date.now() | 77 |
| setTimeout() | 45 |
| setInterval() | 5 |
| performance.now() | 4 |

## Gameplay-relevant clock authorities identified by targeted reading (not the whole 99-file sweep — see confidence notes)

### CLK-WORLD-01 — the WORLD CLOCK (`player.mainQuest`/`worldMemory` hours-elapsed counters)
Evidence: `app/engine/coreGuardians.ts` `coreSettleState(hoursElapsed, lastCoreAtHours)` and its extensive header comment explicitly distinguishes this from wall-clock time: *"this gate reads the WORLD CLOCK, which walking advances by `TILE_HOURS` (0.25) and nothing else"* — contrasted directly against `travelTime.HOURS_PER_TILE_TRUE` (2.5, a deadline-allowance constant) and against real `Date.now()`. The world clock is advanced by player actions (travel, rest), NOT by real elapsed time. `app/engine/travelTime.ts` (`TILE_HOURS`, `HOURS_PER_TILE_TRUE`), `app/engine/timeOfDay.ts` (`getDayPeriod`, day/night modifiers), `app/state/waitVerb.ts` (`clockSpan`, `waitSpan`, `runWait`) all read/advance this same in-fiction hour counter. Confidence: PROVEN, deterministic and replay-safe (it is player-action-driven, not wall-clock-driven).

### CLK-REAL-01 — the DEVICE WALL CLOCK, used for cooldowns/telemetry/anti-abuse
`Date.now()` is used directly (77 files) for things the world clock does NOT cover: crash-ledger timestamps (`app/diagnostics/crashLedger.ts`), the boot-identity/handoff freshness window (`app/diagnostics/bootIdentity.ts` `HANDOFF_FRESH_MS`), the Fallen Ledger's `MAX_CLOCK_SKEW_MS` cross-device tolerance (`app/engine/fallenLedger.ts`), memory-timeline sampling (`app/diagnostics/memoryTimeline.ts`), the Arbiter flavor-budget gap (`app/ai/narration.ts` `_ARBITER_FLAVOR_GAP_MS`), the bounty nudge cooldown (`app/engine/arbiterNudge.ts` `BOUNTY_NUDGE_COOLDOWN_HOURS`), and the disk-log write coalescing window (`app/engine/saveSystem.ts` `DISK_LOG_BATCH_MS`). These are REAL-TIME (not world-time) gates: a device put to sleep and woken a week later genuinely waits a week of real time for these, unlike the world clock. Confidence: PROVEN by direct constant-name reading, NOT independently verified deterministic/replay-safe — flagged in `unknowns.md`.

### CLK-BEAT-01 — `app/diagnostics/aliveBeat.ts` — `ALIVE_BEAT_MS` heartbeat
A `setInterval`-driven liveness heartbeat, explicitly described as belonging to "the app, not to one screen" (LAG-3 header comment). Diagnostics-class, not gameplay-class, but noted because a future Walker running long sessions inherits this interval unless the harness disarms it the way `playerWalker.ts` disarms the 5-second hydrate interval via `setHomeworkTick(null)` (see `existing-walker-map.md`).

### CLK-QWEN-01 through 04 — AI-subsystem timing gates
`app/ai/qwenWatchdog.ts` (`QWEN_BACKGROUND_SETTLE_MS`), `app/ai/nativeMlLock.ts` (`VOICE_RESERVATION_MS`, `ML_WAIT_WARN_MS`), `app/ai/generation/jsHeartbeat.ts` (`JS_HEARTBEAT_INTERVAL_MS`), `app/ai/deferredQwenWarm.ts`. These gate on-device LLM warm-up/health but are not gameplay-rule clocks; grouped here for completeness since a Walker interacting with the AI narrator inherits their timing.


## Full file list (99 files, every clock/timer primitive present)

| ID | File | Primitives present |
|---|---|---|
| CLK-001 | `app/ai/CognitiveOrchestrator.ts` | Date.now(), performance.now() |
| CLK-002 | `app/ai/generation/LlamaRuntime.ts` | Date.now() |
| CLK-003 | `app/ai/generation/QwenGenerativeEngine.ts` | Date.now() |
| CLK-004 | `app/ai/generation/jsHeartbeat.ts` | setTimeout() |
| CLK-005 | `app/ai/narration.ts` | Date.now() |
| CLK-006 | `app/ai/nativeMlLock.ts` | Date.now(), setTimeout() |
| CLK-007 | `app/ai/qwenWatchdog.ts` | Date.now(), setTimeout() |
| CLK-008 | `app/audio/AudioManager.ts` | Date.now(), setTimeout() |
| CLK-009 | `app/buildInfo.ts` | Date.now(), setTimeout(), performance.now() |
| CLK-010 | `app/components/ArtFlash.tsx` | setTimeout() |
| CLK-011 | `app/components/BugReportModal.tsx` | Date.now() |
| CLK-012 | `app/components/DeathOverlay.tsx` | setTimeout() |
| CLK-013 | `app/components/DiceRoller.tsx` | Date.now(), setTimeout() |
| CLK-014 | `app/components/DogOnboardingModal.tsx` | setTimeout() |
| CLK-015 | `app/components/EnemyPanel.tsx` | setTimeout() |
| CLK-016 | `app/components/FeedbackModal.tsx` | setTimeout() |
| CLK-017 | `app/components/FusionBlockedModal.tsx` | setTimeout() |
| CLK-018 | `app/components/GatherModal.tsx` | setTimeout() |
| CLK-019 | `app/components/GolemNamingModal.tsx` | setTimeout() |
| CLK-020 | `app/components/HookContinueModal.tsx` | setTimeout() |
| CLK-021 | `app/components/KeyboardInputBar.tsx` | setTimeout(), setInterval() |
| CLK-022 | `app/components/MissionCompleteModal.tsx` | setTimeout() |
| CLK-023 | `app/components/NumberStepper.tsx` | setTimeout() |
| CLK-024 | `app/components/SearchModal.tsx` | setTimeout() |
| CLK-025 | `app/components/SplashOverlay.tsx` | setTimeout() |
| CLK-026 | `app/components/StatsPanel.tsx` | Date.now(), setTimeout(), setInterval() |
| CLK-027 | `app/components/WandererEncounterModal.tsx` | setTimeout() |
| CLK-028 | `app/diagnostics/aliveBeat.ts` | setInterval() |
| CLK-029 | `app/diagnostics/bootIdentity.ts` | Date.now() |
| CLK-030 | `app/diagnostics/bugReport.ts` | Date.now() |
| CLK-031 | `app/diagnostics/crashCorrelation.ts` | Date.now() |
| CLK-032 | `app/diagnostics/crashLedger.ts` | Date.now() |
| CLK-033 | `app/diagnostics/crashSave.ts` | Date.now() |
| CLK-034 | `app/diagnostics/memoryTimeline.ts` | Date.now() |
| CLK-035 | `app/diagnostics/nativeMemoryRecorder.ts` | Date.now() |
| CLK-036 | `app/diagnostics/pendingBundle.ts` | Date.now() |
| CLK-037 | `app/diagnostics/renderClock.ts` | Date.now() |
| CLK-038 | `app/diagnostics/rollTiming.ts` | Date.now() |
| CLK-039 | `app/diagnostics/runtimePressure.ts` | Date.now() |
| CLK-040 | `app/diagnostics/runtimePressureWatch.ts` | Date.now(), setTimeout() |
| CLK-041 | `app/diagnostics/sentryTransport.ts` | Date.now(), setTimeout() |
| CLK-042 | `app/diagnostics/tapClock.ts` | Date.now(), performance.now() |
| CLK-043 | `app/diagnostics/touchPath.ts` | Date.now(), setTimeout(), performance.now() |
| CLK-044 | `app/engine/character.ts` | Date.now() |
| CLK-045 | `app/engine/coreGuardians.ts` | Date.now() |
| CLK-046 | `app/engine/deeds.ts` | Date.now() |
| CLK-047 | `app/engine/dogBreeds.ts` | Date.now() |
| CLK-048 | `app/engine/dogCompanion.ts` | Date.now() |
| CLK-049 | `app/engine/elevatedOverlay.ts` | Date.now() |
| CLK-050 | `app/engine/equipment.ts` | Date.now() |
| CLK-051 | `app/engine/fallenLedger.ts` | Date.now() |
| CLK-052 | `app/engine/fallenLedgerStore.ts` | Date.now(), setTimeout() |
| CLK-053 | `app/engine/fallenMailbox.ts` | Date.now(), setTimeout() |
| CLK-054 | `app/engine/fallenRevenants.ts` | Date.now(), setTimeout() |
| CLK-055 | `app/engine/gameLog.ts` | Date.now() |
| CLK-056 | `app/engine/golems.ts` | Date.now() |
| CLK-057 | `app/engine/hooks.ts` | Date.now() |
| CLK-058 | `app/engine/investigationTable.ts` | Date.now(), setTimeout() |
| CLK-059 | `app/engine/itemSynthesisQwen.ts` | Date.now() |
| CLK-060 | `app/engine/npcMemory.ts` | Date.now() |
| CLK-061 | `app/engine/questGenerator.ts` | Date.now() |
| CLK-062 | `app/engine/saveSystem.ts` | Date.now(), setTimeout() |
| CLK-063 | `app/engine/types.ts` | Date.now() |
| CLK-064 | `app/engine/vendors.ts` | Date.now() |
| CLK-065 | `app/engine/waterBottle.ts` | Date.now() |
| CLK-066 | `app/engine/whispers.ts` | Date.now() |
| CLK-067 | `app/engine/worldMemory.ts` | Date.now() |
| CLK-068 | `app/screens/AboutScreen.tsx` | Date.now(), setTimeout() |
| CLK-069 | `app/screens/ActionReferenceScreen.tsx` | Date.now() |
| CLK-070 | `app/screens/ContractsScreen.tsx` | Date.now() |
| CLK-071 | `app/screens/CraftingScreen.tsx` | setTimeout() |
| CLK-072 | `app/screens/ExplorationScreen.tsx` | setTimeout() |
| CLK-073 | `app/screens/InventoryScreen.tsx` | Date.now(), setTimeout() |
| CLK-074 | `app/screens/LogScreen.tsx` | Date.now(), setTimeout(), setInterval() |
| CLK-075 | `app/screens/MapScreen.tsx` | Date.now() |
| CLK-076 | `app/screens/TitleScreen.tsx` | Date.now(), setTimeout() |
| CLK-077 | `app/state/combatResolution.ts` | Date.now() |
| CLK-078 | `app/state/gameStore.ts` | Date.now(), setTimeout(), setInterval() |
| CLK-079 | `app/state/gearWear.ts` | Date.now() |
| CLK-080 | `app/state/humanActivity.ts` | Date.now() |
| CLK-081 | `app/state/lastWalk.ts` | Date.now() |
| CLK-082 | `app/state/ledgerVisits.ts` | Date.now() |
| CLK-083 | `app/state/presentationHandoff.ts` | setTimeout() |
| CLK-084 | `app/state/slices/aiLifecycleSlice.ts` | setTimeout() |
| CLK-085 | `app/state/slices/boardSlice.ts` | Date.now() |
| CLK-086 | `app/state/slices/bootSlice.ts` | Date.now() |
| CLK-087 | `app/state/slices/craftingSlice.ts` | Date.now(), setTimeout() |
| CLK-088 | `app/state/slices/inventorySlice.ts` | Date.now(), setTimeout() |
| CLK-089 | `app/state/slices/persistSlice.ts` | Date.now() |
| CLK-090 | `app/state/slices/questSlice.ts` | Date.now() |
| CLK-091 | `app/state/slices/slotSlice.ts` | Date.now() |
| CLK-092 | `app/state/sprint.ts` | Date.now() |
| CLK-093 | `app/ui/backupCharacter.ts` | Date.now() |
| CLK-094 | `app/updates/apkRelease.ts` | Date.now() |
| CLK-095 | `app/updates/checkAndApplyOTA.ts` | Date.now(), setTimeout() |
| CLK-096 | `app/voice/PiperTTSManager.ts` | Date.now(), setTimeout() |
| CLK-097 | `app/voice/TTSController.ts` | Date.now() |
| CLK-098 | `app/voice/TTSManager.ts` | Date.now(), setTimeout() |
| CLK-099 | `app/voice/executorchAdapter.ts` | setTimeout() |
