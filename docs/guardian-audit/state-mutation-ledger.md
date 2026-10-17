# Guardian Critical-Path Audit — State Mutation Ledger (Pass 1)

Evidence: `app/state/gameStore.ts` (36,793 lines — export list read via regex, NOT the full body; see
`unknowns.md` UNK-012 for what that gap means) plus full header/export reads of the 9 files in
`app/state/slices/` and the ~26 other files directly in `app/state/`. `gameStore.ts` composes the store
via `create<GameStore>(...)`, and — per its own top-of-file imports — pulls in slice creators from
`./slices/*` and dozens of standalone `app/state/*.ts` orchestration modules (`dogStatus.ts`, `lastWalk.ts`,
`ledgerVisits.ts`, `trapDive.ts`, etc.), each "moved out of the store" per their own header comments
(quoted repeatedly: *"OTA-1844/1845 — moved out of the store"*/*"orchestrated outside the store"*) — i.e.
this codebase has an active, ongoing effort to decompose one giant store file into named modules, and this
ledger reflects that decomposition as it stands at this HEAD.

## The 9 zustand slices — the primary, named mutation doors

| Slice | File | Lines | Exported creator | Mutation surface (from its own type name) |
|---|---|---|---:|---|
| AI lifecycle | `app/state/slices/aiLifecycleSlice.ts` | 272 | `createAiLifecycleSlice` | on-device AI boot/lifecycle state |
| Board | `app/state/slices/boardSlice.ts` | 344 | `createBoardSlice` | the Contracts/bounty board, incl. `BOUNTY_PRIMER_HINT_ID` |
| Boot | `app/state/slices/bootSlice.ts` | 1183 | `createBootSlice` | app boot sequencing (`Settled`, `settled` helpers) — imports `rng.ts` |
| Crafting | `app/state/slices/craftingSlice.ts` | 328 | `createCraftingSlice` | crafting/recipe state |
| Inventory | `app/state/slices/inventorySlice.ts` | 1768 | `createInventorySlice` | the largest slice after Quest/Vendor; imports `rng.ts` |
| Persist | `app/state/slices/persistSlice.ts` | 382 | `createPersistSlice` | save/load orchestration, `_resetPersistStateForTest` |
| Quest | `app/state/slices/questSlice.ts` | 3706 | `createQuestSlice` | the LARGEST slice by far — `MissionCloseCard`, `raiseMissionClose`, `readOutTrailingHuntBeats`, `resolveStageEscortClear`; imports `rng.ts` |
| Slot | `app/state/slices/slotSlice.ts` | 978 | `createSlotSlice` | character-slot lifecycle; imports `rng.ts` |
| Vendor | `app/state/slices/vendorSlice.ts` | 1201 | `createVendorSlice` | vendor/market transactions; imports `rng.ts` |

**5 of 9 slices import `rng.ts` directly** — inventory, boot, quest, slot, vendor — meaning loot, crafting
outcomes, dice-adjacent boot randomness, mission progression, character-slot assignment, and vendor
stocking ALL mutate state through a door that also rolls dice in the same call, which is the expected
shape for a "gameplay action" door (state change + randomness resolved together) rather than a defect.

## Standalone `app/state/*.ts` orchestration modules — mutation doors NOT inside a slice

These were, per their own comments, deliberately extracted FROM `gameStore.ts` into standalone functions
that `gameStore.ts` still calls, rather than converted into slices:

- `app/state/combatResolution.ts` (3285 lines, the 2nd-largest file in `app/state/`) — the entire live
  combat-resolution surface: `handlePlayerDeath`, `sweepDeadEnemies`, `runSurvivorVolley`,
  `runEnemyGroupCounters`, `tickEnemyControls`, `tickEnemyDotsAndMaybeEndFight`, `staggerEnemy`,
  `applyEnemyCounterToDog`, `dealReflectToAttacker`, `recordEnemyIntel`. **This is the mutation door a
  Guardian fight would run through** — no Guardian-specific branch was found in its export list, meaning
  a Guardian fight is resolved through the SAME combat machinery as any other fight (consistent with
  `coreGuardians.ts`'s `spawnGuardianForCapital` returning an ordinary `Enemy` object with `boss: true` and
  a `core_guardian` trait, not a special-cased fight type).
- `app/state/dogStatus.ts`, `app/state/lastWalk.ts`, `app/state/ledgerRoute.ts`, `app/state/ledgerVisits.ts`,
  `app/state/trapDive.ts`, `app/state/whisperBeats.ts` — all explicitly "moved out of the store"
  (OTA-1844/1845 comments) time/event-driven mutation doors for dog fate, the Last Walk ceremony, the
  Fallen Ledger's routing/visit queue, and the Endless Stair trap-dive mechanic respectively.
- `app/state/stageArrival.ts` (432 lines) — `healStageDebtsAtArrival`, `armSpawnStagesAtArrival`,
  `noteMissionGroundsUnderfoot`, `rearmAfterRoll`, `closeEscapeBeatOnFlee`, `checkStandingGround` — the
  arrival-side half of mission-stage materialization (cross-references SYSTEMIC-A in the prior-session
  task history recorded in this same container: *"stage materialization has no authority"* — a
  pre-existing named finding this pass corroborates the existence of the relevant module for, without
  re-litigating the finding itself).
- `app/state/gearWear.ts` (`wearEquippedItem`), `app/state/sprint.ts`, `app/state/factionParty.ts`
  (`injectFactionParty`), `app/state/fleeOdds.ts`, `app/state/weaponRiderEffects.ts`,
  `app/state/aethercraftBatch.ts` (`runAethercraftBatch`), `app/state/defeatCredit.ts`
  (`creditDefeatedTarget`) — each a narrow, single-purpose mutation door for one mechanic.

## `gameStore.ts` itself — the composition root and the single largest mutation surface

Its own export list (regex-extracted, ~230 top-level exports) includes dozens of action-shaped functions
that were NOT moved into a slice or standalone module: `advanceTime`, `restoreStamina`, `spendStamina`,
`recordMemorableEvent`, `chargeOutpostCrucibleFee`, `acceptCellStamp`, `backfillPlayer`,
`maintainPatrols`/`simulatePatrols`, `logRepChanges`, `bumpQuestsAccepted`, `resolveWhispersForTile`,
`applyTrainAndLog`, and — directly relevant to this audit — `unlockGreatClimbFromChart`,
`assembleBeaconRifle`. **`coreGuardians.ts` is reached from `gameStore.ts` via `require()` at 10+ call
sites (lines 11027, 13610, 20186, 22711, 25363, 25409, 28243, 30584, and more)** rather than via the static
top-level `import` most other engine modules use — a runtime `require()` inside a function body, not a
module-load-time import, which is itself worth flagging (**UNK-013**: why Guardian logic specifically uses
deferred `require()` while ~131 other engine modules are statically imported at the top of the file — a
circular-dependency avoidance pattern, or something else, was not determined in this pass).

## Direct `store.setState(...)` writes that BYPASS a named action

`test-utils/playerWalker.ts`'s `resetForMission()` (see `existing-walker-map.md`) is one confirmed example
of a direct `store.setState({...})` write outside any named action — this is test-harness code, not
production, but it demonstrates the store's state IS directly writable from outside its own action set,
which matters for any future replay/snapshot tooling that wants to restore a game state exactly (a direct
`setState` is available as a restoration primitive; whether production ever uses it this way was not
checked in this pass — **UNK-014**).

## UI-reachable mutation doors — 53 components confirmed to call `useGameStore(` directly

`grep -rl "useGameStore(" app/components app/screens` returns 53 files (out of 84 components + 17
screens = 101 total). Every one of those 53 is a UI-reachable mutation surface in the sense the audit
asks about (§4: "whether UI can reach it"). This pass did not individually catalog which STORE ACTION
each of those 53 files calls — that many-to-many mapping is deferred (**UNK-015**), but the file list
itself is real and reproducible (`components_using_store.txt` in this pass's scratch output, summarized
here rather than reproduced in full to keep this ledger legible).

## Whether normal gameplay / UI / the existing Walker can reach each door — summary judgment

| Door class | Normal gameplay reach | UI reach | Existing Walker reach |
|---|---|---|---|
| The 9 zustand slices | YES (every slice backs live player-facing mechanics) | YES (53 confirmed UI callers) | PARTIAL — `playerWalker.ts` calls named actions like `acceptFactionQuest`, `setContractActive`, `submitPlayerAction` (which itself dispatches into many slices via the parser), but does not exercise every slice action directly |
| `combatResolution.ts` | YES | YES (via combat UI) | YES — indirectly, any fight the Walker starts routes through it |
| Guardian-specific paths (`spawnGuardianForCapital`, `summonCoreGuardian`) | YES (in-game) | YES (SUMMON button, per `mainQuest.ts` owner ruling) | **NO — confirmed absent, see `existing-walker-map.md`** |
| Direct `store.setState` outside a named action | Not confirmed in production code read | N/A | YES, in test-only harness code (`resetForMission`) |
