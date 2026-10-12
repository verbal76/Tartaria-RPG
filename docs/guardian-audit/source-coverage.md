# Guardian Critical-Path Audit — Source Coverage Manifest (Pass 1, §14)

This is proof-of-work, not a keyword-search log: it lists what was actually opened, at what depth, and what
was deliberately left out and why. Depth classes used throughout: **FULL** (entire file read start to end),
**PARTIAL** (specific line ranges read directly), **SWEPT** (header + export list extracted programmatically
via regex/awk across every file in a directory — not manually read line-by-line, but every file's
declared surface was captured), **SAMPLED** (a small number of targeted greps against the file, not a
structured sweep), **LISTED ONLY** (directory/file existence confirmed via `ls`, contents not opened).

## Directories inspected, by depth

| Directory | File count | Depth | Notes |
|---|---:|---|---|
| `app/engine/` | 240 | SWEPT (all 240) + FULL/PARTIAL for `rng.ts`, `coreGuardians.ts`, `mainQuest.ts` | The core gameplay-rule layer; highest-value files read deeply, rest swept |
| `app/state/` (top-level, ~26 files) | 26 | SWEPT (all 26) | Standalone orchestration modules extracted from the store |
| `app/state/slices/` | 9 | SWEPT (all 9) | The 9 zustand slice creators |
| `app/ai/` + subdirectories | 20 | SWEPT | On-device AI/cognition subsystem |
| `app/diagnostics/` | 27 | SWEPT (all 27) + PARTIAL for `gameLog.ts` (FULL, 43 lines), `crashLedger.ts` (header), `sentryTransport.ts` (header) | Observability layer |
| `app/voice/` | 15 | SWEPT | TTS/STT subsystem |
| `app/updates/` | 3 | SWEPT | OTA/APK update-application subsystem |
| `app/config/` | 1 | SWEPT | Build/product configuration |
| `app/components/` | 84 | SWEPT (header/export level) + SAMPLED (`grep -rl "useGameStore("` → 53 of 84) | Presentation layer; not given CAND ids (treated as UI surface of the systems, not separate systems) |
| `app/screens/` | 17 | SWEPT (header/export level) + SAMPLED (`grep -rl "useGameStore("` → included in the 53-of-101 count above) | Same treatment as components |
| `test-utils/` | ~6+ files identified | `playerWalker.ts` FULL (1720 lines, 3 targeted reads covering full range); `contraryWalker.ts` SAMPLED only (1159 lines); `placePlayer.ts`, `factionProbes.ts`, `storeSource.ts` LISTED ONLY (not opened) | See `existing-walker-map.md`, UNK-003, UNK-006 |
| `app/engine/types.ts` | 1 (2913 lines) | PARTIAL — `PlayerCharacter` interface extracted in full via awk (~330 lines of the 2913); rest of file not read | See `character-state-inventory.md` |
| `app/state/gameStore.ts` | 1 (36,793 lines) | PARTIAL — top-level import block, top-level export list (regex-extracted), lines ~7931-7968 (save-size comment), ~10 grepped `require('./coreGuardians')` call sites read in surrounding context | **Largest single coverage gap of this pass** — see UNK-012 |
| `jest.setup.js` / `jest.teardown.js` | 2 | PARTIAL (`jest.setup.js` lines 95-129) | RNG-seeding mechanism confirmation |
| `.github/workflows/` | several | PARTIAL — `ci.yml`, `eas-update-golem.yml`, `promote.yml` read at the job/trigger level (not full YAML bodies line-by-line) | CI/OTA authority, `pass1-authority.md` |

## Directories LISTED but NOT inventoried into `system-candidates.md` — named honestly

These were confirmed to exist (via `ls`) but their contents were **not** swept, read, or given `CAND-####`
entries this pass. This is a real coverage gap, not an oversight hidden from the reader:

- **`app/data/`** — 20 subdirectories of JSON/TS data catalogs (`collectables`, `dogs`, `enemies`, `events`,
  `factions`, `golems`, `hazards`, `items`, `locations`, `lore`, `maze`, `npcs`, `quests`, `races`, `relics`,
  `spells`, `story`, `weather`, `world`, plus `thirdPartyNotices.ts`). This is very likely where a large
  share of the actual Guardian gear (`GUARDIAN_GEAR_BY_CAPITAL`'s 18 signature items), enemy templates, and
  location data for the 9 capitals physically live as data rather than code. **Not covered by this pass's
  `system-candidates.md`, which only inventoried `app/engine/`, `app/state/`, `app/ai/`, `app/diagnostics/`,
  `app/voice/`, `app/updates/`, `app/config/`, `app/components/`, `app/screens/`.**
- **`app/audio/`** — existence confirmed via top-level `ls app/`; contents not listed or inspected.
- **`app/ui/`** — existence confirmed via top-level `ls app/`; contents not listed or inspected.

**Recommendation for the next pass:** `app/data/` in particular should be swept before any Guardian-gear,
enemy-template, or capital-location relationship claims are treated as complete — the current
`system-candidates.md` and `relationship-ledger.md` describe code-level relationships only and do not yet
account for what the code reads out of `app/data/`.

## Test/harness areas inspected

- `__tests__/` — directory-level confirmation only (`Test Suites: 1383 passed, 1383 total` from the most
  recent full-surface CI run, per `pass1-authority.md`); individual test files were not opened in this
  pass except where a specific suite name was directly relevant (`__tests__/walkerReplaySeed.test.ts`,
  `__tests__/playerWalkerSim.test.ts` — both referenced by name/role from `playerWalker.ts`'s own source
  comments, not opened and read independently).
- `test-utils/playerWalker.ts` — FULL (see above).
- `test-utils/contraryWalker.ts` — SAMPLED (see above, UNK-006).
- `web-harness/gameStoreStub.js` — existence and role confirmed (a small stub used only by the web
  dev-harness build, NOT by either Walker) but not read in full.

## Major gameplay modules discovered (representative, not exhaustive — full list in `system-candidates.md`)

`rng.ts`, `coreGuardians.ts`, `mainQuest.ts`, `combatResolution.ts`, `encounter.ts`, `powerRating.ts`,
`worldMap.ts`, `factions.ts`, `factionRelations.ts`, `hunts.ts`, `mysteries.ts`, `factionStorylines.ts`,
`factionQuests.ts`, `whispers.ts`, `hub.ts`, `saveSystem.ts`, `saveExport.ts`, `saveTrim.ts`,
`fallenLedger.ts` + `fallenLedgerStore.ts` + `fallenMailbox.ts` + `fallenSeal.ts`, `dogCompanion.ts`,
`golems.ts`, `collectables.ts`, `pressure.ts`, `takeableGearSpawns.ts`, `fallenRevenants.ts`,
`buildings.ts`, `character.ts`, `contractMarkers.ts`, `contractBroker.ts`, `missionEncounter.ts` +
`missionEncounterArm.ts`, `questStage.ts`, `itemBackfill.ts`, `itemMigrations.ts`, `worldMemory.ts`.

## Data/config tables inspected

**None inspected directly this pass** — `app/data/`'s 20 subdirectories (listed above) were not opened.
`app/config/` (1 file, SWEPT at header/export level only, not read for actual configuration VALUES).

## Directories intentionally excluded, with reason

| Path | Reason for exclusion |
|---|---|
| `node_modules/` (both checkouts) | Third-party dependency code, not project source; also the one untracked item in the otherwise-clean `golem-line` worktree per `pass1-authority.md` |
| `promotions`, `promotions-p2`, `promotions-p3`, `main`, `docs-ios` and other scratch worktrees under `/tmp/*` | Leftover from prior release-engineering sessions in this same container; not part of this audit's chosen authority (`golem-line`), see `pass1-authority.md` |
| `.git/` internals | Version-control metadata, not gameplay source |
| `scripts/` (CI/repo tooling: `heavy-suites.mjs`, `shard-suites.cjs`, `check-*.mjs`) | Confirmed to be CI/test infrastructure, not gameplay Walker code, per `pass1-authority.md`'s pointer note; not swept for candidates since it does not touch runtime gameplay state |

## Honest summary of this pass's coverage shape

This pass used a deliberately mixed-depth strategy: **broad SWEEP** (regex/awk header+export extraction)
across ~341 files to avoid missing systems, combined with **deep FULL/PARTIAL reads** of the highest-value
files for the audit's specific Guardian-critical-path question (`rng.ts`, `coreGuardians.ts`, `mainQuest.ts`
partial, `playerWalker.ts` full, `types.ts`'s `PlayerCharacter` interface, `jest.setup.js` partial). The
single largest file in the entire codebase (`gameStore.ts`, 36,793 lines) and the entire `app/data/`
directory (20 subdirectories) were NOT read/swept — both are named explicitly here and in `unknowns.md`
(UNK-012 and this section respectively) as the largest remaining coverage gaps for a second pass to close
before treating this audit's relationship/state-mutation claims as complete.
