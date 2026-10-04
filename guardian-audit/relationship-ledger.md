# Guardian Critical-Path Audit — Source Relationship Ledger (Pass 1)

This is an EVIDENCE LEDGER, not a final causal graph — relationships below are recorded as proven facts
about imports/calls/reads found directly in source, not as a claim about which of them "matter most."
Machine-readable companion: `relationship-ledger.json`. IDs are `REL-000001` upward.

## Method

Two evidence classes were used, both direct and reproducible:
1. **Static import evidence** — `grep -oE "from '\.\./engine/[a-zA-Z0-9_]+'"` etc. against real files,
   giving an exact, complete list of what a file imports (not an approximation).
2. **Targeted full-body reads** — `rng.ts`, `coreGuardians.ts`, `mainQuest.ts` (partial),
   `playerWalker.ts` (in full) were read start-to-end; relationships FROM these files are backed by
   reading the actual call, not just the import line.

## REL-000001 — `app/state/gameStore.ts` → 132 distinct `app/engine/*` modules (static imports)

- Source: `app/state/gameStore.ts` (top-level `import` statements)
- Target: 132 distinct modules under `app/engine/` (evidence: `grep -oE "from '\.\./engine/[a-zA-Z0-9_]+'"
  app/state/gameStore.ts | sort -u | wc -l` → 132)
- Value/state transferred: every exported function/constant those 132 modules expose (combat rules, loot
  tables, faction logic, mission engines, world map, etc.)
- Triggering condition: module load time (static import), so this relationship is unconditional —
  `gameStore.ts` cannot construct without all 132.
- Direct, deterministic.
- Confidence: PROVEN (exact grep count against the real file).
- **This single relationship is why `gameStore.ts` is, by a wide margin, the highest-connectivity node
  in this codebase** — see the Pass-1 summary's "TOP 20" list.

## REL-000002 — `app/state/gameStore.ts` → `app/engine/coreGuardians.ts` (deferred `require()`, NOT static import)

- Source: `app/state/gameStore.ts`, ≥10 call sites (lines 11027, 13610, 20186, 22711, 25363, 25409,
  28243, 30584, and more not individually enumerated in this pass)
- Target: `app/engine/coreGuardians.ts`
- Value/state transferred: `isCoreGuardian`, `capitalIdFromGuardian` (statically imported at line 97,
  the ONLY static-import use), plus `scaleStaticBoss` and other exports pulled in via runtime `require()`
  inside function bodies at the other call sites.
- Triggering condition: combat resolution / enemy-defeat / Core-recovery code paths, evaluated at
  runtime, not at module load.
- Confidence: PROVEN (both the static import line and the `require()` call sites are direct grep matches
  against the real file). The MIX of static-import-for-two-functions and runtime-`require()`-for-the-rest
  is unusual relative to the other 131 `app/engine/*` relationships from this same file, all of which are
  static imports — flagged as UNK-013 (see `unknowns.md`) rather than explained, since this pass did not
  determine WHY.

## REL-000003 — `app/engine/coreGuardians.ts` → `app/engine/mainQuest.ts` (`LOST_CAPITAL_LOCATIONS`)

- Source: `app/engine/coreGuardians.ts:27`, `import { LOST_CAPITAL_LOCATIONS } from './mainQuest';`
- Target: `app/engine/mainQuest.ts`
- Value transferred: the 9-element capital-id array
- Triggering condition: module load; static, unconditional
- Confidence: PROVEN (read directly in both files, full bodies)
- Note: the reverse relationship (`mainQuest.ts` importing FROM `coreGuardians.ts`) was NOT found in the
  portion of `mainQuest.ts` read — the dependency is one-directional as far as this pass verified, which
  matches `coreGuardians.ts`'s own comment: *"Both are engine leaves; powerRating reaches
  equipment/combatRules/enemyTraits and none of those reach back here, so this cannot cycle."*

## REL-000004 — `app/engine/coreGuardians.ts` → `app/engine/encounter.ts` + `app/engine/powerRating.ts`

- Source: `app/engine/coreGuardians.ts:31-32`
- Target: `enemyScalePower, AC_POWER_BASELINE, DMG_POWER_BASELINE` (from `encounter.ts`);
  `playerPowerGear` (from `powerRating.ts`)
- Value transferred: the shared player/enemy power-scaling formula — `guardianPlayerPower()` explicitly
  reuses the SAME function the wilderness encounter spawner uses (`enemyScalePower`), per the source's own
  comment: *"the world's own power proxy, imported rather than re-derived."*
- Confidence: PROVEN, read directly.
- Significance for a future Walker: Guardian difficulty and ordinary wilderness-encounter difficulty are
  NOT independent systems — they share one power-proxy formula, so a Walker instrumenting one already has
  the vocabulary for the other.

## REL-000005 — `app/engine/mainQuest.ts` → `app/engine/coreGuardians.ts`'s `CORE_GUARDIAN_TRAIT` domain (indirect, via the trait string, NOT an import)

- Source: neither file imports the other's Guardian-specific symbols in this direction
- Relationship class: **shared string-constant convention**, not a code dependency — `mainQuest.ts`'s
  `FACTION_CORE_GATES` gates the CORE grant; `coreGuardians.ts`'s `CORE_GUARDIAN_TRAIT` tags the fight.
  They meet only through `gameStore.ts`, which calls both.
- Confidence: STRONG (inferred from both files' full-body reads and REL-000002; not verified against
  `gameStore.ts`'s full 36,793-line body, which was not read in full — see UNK-012).

## REL-000006 — `test-utils/playerWalker.ts` → `app/state/gameStore.ts` (`useGameStore`, `setHomeworkTick`)

- Source: `test-utils/playerWalker.ts:40-41`
- Target: `useGameStore`, `type GameStore`, `setHomeworkTick`
- Value transferred: the entire real store instance and its type
- Triggering condition: module load; the Walker cannot function without the real store
- Confidence: PROVEN, read in full (`playerWalker.ts` read start to end)

## REL-000007 — `test-utils/playerWalker.ts` → 15 `app/engine/*` modules (static imports, enumerated)

- Source: `test-utils/playerWalker.ts:42-57`
- Target: `character.ts` (`getRaces`, `getFactions`), `hunts.ts`, `mysteries.ts`, `factionStorylines.ts`,
  `factions.ts`, `factionQuests.ts`, `contractMarkers.ts`, `missionEncounterArm.ts`, `missionEncounter.ts`,
  `questStage.ts`, `hub.ts`, `whispers.ts`, `worldMap.ts`, `contractBroker.ts`
- Value transferred: mission/quest/faction/hub/whisper catalog data and the routing helpers the Walker
  drives against
- Confidence: PROVEN, read directly (full import block)
- **Notably absent from this list: `app/engine/coreGuardians.ts` and `app/engine/mainQuest.ts`** —
  confirms `existing-walker-map.md`'s finding that this Walker has no Guardian-domain relationship at all.

## REL-000008 — `app/engine/rng.ts` → 23 consumer files (both engine and state layers)

- Source: `app/engine/rng.ts`
- Target: 23 files across `app/ai/`, `app/components/`, `app/engine/`, `app/state/` (full list in
  `rng-inventory.md`)
- Value transferred: every dice-roll / weighted-pick / chance-check result those files use
- Confidence: PROVEN (exact grep against the import specifier)

## REL-000009 — Three independent deterministic-PRNG implementations, NOT unified (drift evidence)

- `app/engine/takeableGearSpawns.ts` exports `hashSeed`/`mulberry32`; consumed by `app/engine/buildings.ts`
  and `app/state/gameStore.ts` (both import it — evidence: `grep -rln "mulberry32|xmur3|hashSeed" app`)
- `app/engine/fallenRevenants.ts` and `app/engine/worldMap.ts` each define their OWN local, non-exported
  copy of the same algorithm family
- Relationship class: convergent reimplementation, not a dependency edge
- Confidence: PROVEN (grep evidence of both the exported and the two local definitions)

## REL-000010 — `app/state/combatResolution.ts` is the mutation door EVERY fight (including Guardian fights) resolves through

- Evidence: `coreGuardians.ts`'s `spawnGuardianForCapital` returns an ordinary `Enemy` object (typed
  from `app/engine/types.ts`), not a Guardian-specific fight type; `combatResolution.ts`'s export list
  (`handlePlayerDeath`, `sweepDeadEnemies`, etc.) contains no Guardian-specific branch name.
- Confidence: STRONG (inferred from both files' type/export shapes; the actual call path from "enemy
  array contains a Guardian" to "combatResolution.ts runs the fight" was not traced statement-by-statement
  in this pass — recorded as UNK-016).

## REL-000011 — `app/state/slices/{boot,inventory,quest,slot,vendor}Slice.ts` → `app/engine/rng.ts`

- Source: 5 of the 9 zustand slices import `rng.ts` directly (evidence: grep in the state/ai inventory
  sweep)
- Confidence: PROVEN

## What this ledger does NOT yet cover (named honestly)

A full many-to-many relationship trace across all 341 `system-candidates.md` entries and the 112
`character-state-inventory.md` fields — i.e. "which of the 341 modules reads/writes which of the 112
`PlayerCharacter` fields" — was explicitly NOT attempted in this pass. It is a real, large piece of work
(up to 341 × 112 potential edges) that the second architectural-review pass should scope deliberately
rather than have this pass rush. See `unknowns.md` UNK-009.
