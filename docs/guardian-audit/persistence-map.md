# Guardian Critical-Path Audit — Save / Persistence Map (Pass 1)

Evidence source: full header/export sweep of `app/engine/saveSystem.ts` (1927 lines), `app/engine/saveExport.ts`,
`app/engine/saveTrim.ts`, `app/state/slices/persistSlice.ts`, `app/state/slices/slotSlice.ts` (978 lines),
`app/diagnostics/saveSnapshot.ts`, `app/diagnostics/crashSave.ts`, `app/diagnostics/saveLoadHealth.ts`, plus a
targeted grep of `AsyncStorage` usage (48 files) and `persist(` call sites in `gameStore.ts`. Deep line-by-line
reading was done for `rng.ts`, `coreGuardians.ts`, `mainQuest.ts` (partial), `playerWalker.ts` — **NOT** for
`saveSystem.ts`'s 1927-line body itself, which was read only at the export/header level this pass. That
gap is named explicitly in `unknowns.md` (UNK-010) rather than papered over.

## Storage backend

`AsyncStorage` (`@react-native-async-storage/async-storage`) is the on-device store, imported directly in
`gameStore.ts` (`import AsyncStorage from '@react-native-async-storage/async-storage';`, line 434) and in
48 files total across the tree. There is no evidence in this pass of a `zustand persist` middleware being
used — `persist()` appears to be a **hand-rolled store method** (`get().persist()`, called from at least 4
sites in `gameStore.ts`: lines 835, 2214, 2298, 6077, and more not individually enumerated), not the
library middleware of the same name. This is worth a second-pass confirmation (UNK-011) since the name
collision is exactly the kind of thing worth double-checking before building on it.

## Save representation — multiple named concepts, not one blob

- **Slot saves** — `ACTIVE_SLOT_KEY`, `slotSaveKey`, `SlotSummary`, `getActiveSlotId`, `newSlotId`
  (`saveSystem.ts`). Multiple character slots exist; `app/state/slices/slotSlice.ts` (978 lines,
  `SlotSlice`/`SlotSliceDeps`/`createSlotSlice`) is the zustand slice that owns slot lifecycle.
- **Global stash** — `GlobalStash`, `STASH_UNCHANGED` sentinel (`saveSystem.ts`) — an install-wide
  concept separate from any one slot; a sentinel value exists specifically to distinguish "no change" from
  "explicitly emptied," which is a real idempotency concern worth carrying into replay-snapshot design.
- **Fallen ledger** — a SEPARATE, larger persistence subsystem: `app/engine/fallenLedger.ts` (1050 lines)
  + `app/engine/fallenLedgerStore.ts` (903 lines) + `app/engine/fallenMailbox.ts` (229 lines) +
  `app/engine/fallenSeal.ts` (163 lines, HMAC-SHA256 sealing). Cross-device/cross-install sharing of
  fallen-character and fallen-dog records, with explicit caps (`FOREIGN_FALLEN_CAP`, `REST_RECORD_CAP`,
  `MAX_GEAR_PIECES`, `MAX_CLOCK_SKEW_MS`, `FOREIGN_DOG_CAP`, `MAX_EXCHANGE_BYTES`) — a persistence surface
  with real-time (wall-clock) skew tolerance baked in, distinct from the world clock (see
  `clock-inventory.md`).
- **Crash-save capture** — `app/diagnostics/crashSave.ts` (`CRASH_SAVE_KEY`, `buildCrashSaveExport`) — a
  sibling snapshot mechanism to `saveSnapshot.ts`, specifically for the "COPY SAVE" diagnostic export
  path, separate from the normal slot-save write path.
- **Portable/export encoding** — `app/engine/saveExport.ts` (`SAVE_EXPORT_FORMAT`, `saveChecksum`,
  `encodeSaveExport`/`decodeSaveExport`, `CLIPBOARD_SAFE_CHARS`) — a checksummed, clipboard-safe export
  format for moving a character between devices/installs manually (distinct from the Fallen Ledger's
  automatic cross-install sharing).

## Size-guard machinery (evidence of a real, previously-hit failure mode)

`app/engine/saveTrim.ts` (`SAFE_BLOB_CHARS`, `utf8ByteLength`, `trimSaveStateToFit`,
`pruneRegenerableRoomTables`, `saveSizeBreakdown`) exists, per its own header comment, because of "the
save-loss root cause" (OTA-395/396) — the slot blob grew past a safe size and lost data. `gameStore.ts`'s
own comment thread (lines ~7931-7968) independently corroborates this: *"`persist()` embeds gameLog.slice(
...)` ... grew with the session until it crossed AsyncStorage's ~2 MB readback [limit]"* — this is the
exact reason `app/state/saveLimits.ts` (`MAX_LOG_IN_MEMORY`) and the diagnostics-side `LOG_CHARS_CAP` /
`FULL_LOG_CHARS_CAP` (`app/diagnostics/bugReport.ts`) exist as bounded caps. **Relevant to snapshot design
for a future Walker:** the game log itself is NOT saved in full — it is capped and trimmed, so a
before/after snapshot that wants the full transcript of a Guardian run needs a different capture path
(the diagnostics bundle / crash-save path, not the normal slot save).

## Migration machinery

`app/engine/itemBackfill.ts` (`restampInventoryItem`, `restampInventory`, `healSavedItem`),
`app/engine/itemMigrations.ts` (`LEGACY_ITEM_RENAMES`, `migrateLegacyName`), `worldMemory.ts`'s
`migrateLoadedWorldMemory`/`migrateGroundRoomKeys` (referenced from `gameStore.ts`'s own export list),
`golems.ts`'s `migrateLegacyDogPotential`-equivalent pattern, and numerous `?? default` backfills scattered
through `PlayerCharacter` field comments in `types.ts` (e.g. `bountyPrimerSeen` deliberately NOT
backfilled to true, `storyIntroSeen` deliberately IS backfilled to true — see `character-state-inventory.md`)
together form a real, ongoing migration discipline: this codebase has shipped save-shape changes many
times and has a house style for doing so without breaking existing saves. Worth reusing rather than
reinventing for any new persisted Walker/replay state.

## Guardian / Core persistence specifically

`player.mainQuest: MainQuestState { phase, coresRecovered: string[] }` (see
`character-state-inventory.md`) is the entire persisted Guardian-progression state — a phase enum plus an
array of capital-ids whose Core has been recovered. No separate "Guardian defeated" boolean exists apart
from `coresRecovered` membership; a Guardian is considered defeated exactly when its capital's id is in
that array (cross-checked against `coreGuardians.ts`'s own read of `player.mainQuest?.coresRecovered.length`).
This is a small, clean, easily-snapshotted piece of state — the harder persistence surface for a
before/after Guardian-run snapshot is everything else that changed alongside it (HP, inventory, gear
drops, world-clock hours, faction standing) — see `character-state-inventory.md` for the full field list.

## RNG / seed persistence

**Not found.** No field on `PlayerCharacter` or in the slot-save shape read in this pass stores an RNG
seed or stream position. `player.mapSeed` exists but is explicitly voided for world-generation purposes
(`worldMap.ts`: *"positions are canon now; seed kept for signature compat"*) — it is NOT a live RNG seed. A
replayable Guardian Walker will need its OWN seed-persistence mechanism layered on top of the existing save
shape, mirroring what `playerWalker.ts`'s `walkerBaseSeed()`/replay-token machinery already does at the
test-harness level (see `existing-walker-map.md`) — production itself has none.

## Clock / time persistence

`player.hoursElapsed` (the world clock) and `player.lastRestRewardAtHours` / `bossDefeatGraceUntilHours` /
`menaceUpdatedHour` / `tideStageSeen` (world-clock-relative gates) ARE persisted, as ordinary numeric
fields on the save. `player.lastSessionEndedAt` is a real wall-clock timestamp and IS persisted, used (per
its name) to detect session boundaries across app restarts — a genuinely different persistence class from
the world clock, worth keeping distinct in any replay design (see `clock-inventory.md`).

## Death / recovery persistence

`deathId`, `resurrectedFromDeathId`, `resurrectionGems`, `legacyGemsClaimed` (all on `PlayerCharacter`,
see `character-state-inventory.md`) plus the Fallen Ledger's own `FallenSnapshot`/`FallenHero` shapes in
`saveSystem.ts`'s export list. OTA-1850's header comment (quoted in `character-state-inventory.md`)
establishes that resurrection-gem balance is deliberately character-bound, not install-wide — a real design
decision with persistence consequences that a Walker simulating character death should respect rather than
route around.
