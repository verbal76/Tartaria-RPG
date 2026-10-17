# Guardian Critical-Path Audit — RNG Inventory (Pass 1)

## RNG-CORE-01 — `app/engine/rng.ts` (the wrapper module)

The nearest thing this codebase has to a single RNG authority. All functions ultimately call `Math.random()` directly (read in full — see quote below); nothing in this file is seeded.

```ts
rollDie(sides)            -> 1 + floor(Math.random() * sides)
rollDice(count, sides)    -> sum of rollDie, clamped 0..1000 / 1..1000
parseDiceNotation(str)    -> parses 'NdM(+/-B)' strings (no RNG itself)
rollFromNotation(str)     -> parseDiceNotation + rollDice
pick(items)               -> items[floor(Math.random() * items.length)]
rotatingPick(items, key)  -> round-robin cursor per string key, Math.random-free (deterministic order,
                             only the STARTING cursor per key is arbitrary) — module-level Map state
pickWeighted(items, w)    -> weighted pick via Math.random() * totalWeight
chance(percent)           -> Math.random() * 100 < percent
```

**23 files import from `rng.ts` directly** (evidence: `grep -rl "from '../engine/rng'" app`): `app/ai/narration.ts`, `app/components/DiceRoller.tsx`, `app/engine/character.ts`, `app/engine/combatProse.ts`, `app/engine/combatRules.ts`, `app/engine/dogCompanion.ts`, `app/engine/encounter.ts`, `app/engine/itemWeight.ts`, `app/engine/narrativeGenerator.ts`, `app/engine/questGenerator.ts`, `app/engine/statusEffects.ts`, `app/engine/vendors.ts`, `app/engine/voicePools.ts`, `app/engine/weaponEffects.ts`, `app/engine/whispers.ts`, `app/state/combatResolution.ts`, `app/state/gameStore.ts`, `app/state/slices/bootSlice.ts`, `app/state/slices/inventorySlice.ts`, `app/state/slices/questSlice.ts`, `app/state/slices/slotSlice.ts`, `app/state/slices/vendorSlice.ts`, `app/state/weaponRiderEffects.ts`. Combat rolls, loot rolls, dialogue-variant picks, and the DiceRoller UI component all ultimately resolve through this one wrapper.

## Deterministic seeded PRNGs — a SEPARATE class, and NOT unified

### RNG-DET-01 — `mulberry32(hashSeed(str))` in `app/engine/takeableGearSpawns.ts`
- Exported for reuse: True
- Seed source: string key (e.g. take-gear:<seedKey>), derived from room/scene key
- Known consumers: app/engine/buildings.ts, app/state/gameStore.ts
- Confidence: PROVEN

### RNG-DET-02 — `mulberry32(hashSeed(str)) — SEPARATE local implementation` in `app/engine/fallenRevenants.ts`
- Exported for reuse: False
- Seed source: string key, local to this file
- ⚠ duplicate implementation of the same algorithm as RNG-DET-01, not re-using the exported one
- Confidence: PROVEN

### RNG-DET-03 — `xmur3(str) hash -> stream` in `app/engine/worldMap.ts`
- Exported for reuse: False
- Seed source: player/character-derived seed string (characterSeed, though comment at line 159 says positions are canon now and characterSeed is vestigial)
- ⚠ third independent seeded-PRNG implementation
- Confidence: PROVEN

**Finding, recorded not fixed:** three independent implementations of the same mulberry32/xmur3-family deterministic-PRNG idea exist in the engine (`takeableGearSpawns.ts` exports one; `fallenRevenants.ts` and `worldMap.ts` each carry their own local copy). This is real evidence of drift risk, not a claim that any of them is broken.

## Harness-only RNG override (test infrastructure, NOT production)

- File: `jest.setup.js`
- Mechanism: global Math.random monkey-patch to a seeded generator (__s = __SEED)
- Hook: `__TARTARIA_RESEED_RANDOM__ (global), re-armed per test via jest.teardown.js setupFilesAfterEnv`
- Why it exists (quoted from source): a prior version reseeded per-file-byte-layout, which made every seeded draw a function of unrelated source edits (measured: 265,813 vs 269,967 draws from a 4-line reformat)
- Confidence: PROVEN

**This matters for a future replayable Guardian Walker.** Production `Math.random()` is genuinely unseeded and non-replayable on-device; only the Jest process patches it globally to a seeded generator, and only for the duration of that test run. A Walker built on the real store (as `test-utils/playerWalker.ts` is — see `existing-walker-map.md`) inherits this: it is replayable ONLY because it runs inside Jest, under this exact monkeypatch, not because the game itself is deterministic.


## Every file with a direct `Math.random()` call (49 files, including `rng.ts` itself)

| ID | File |
|---|---|
| RNG-001 | `app/ai/narration.ts` |
| RNG-002 | `app/audio/AudioManager.ts` |
| RNG-003 | `app/buildInfo.ts` |
| RNG-004 | `app/diagnostics/bootIdentity.ts` |
| RNG-005 | `app/diagnostics/crashCorrelation.ts` |
| RNG-006 | `app/diagnostics/pendingBundle.ts` |
| RNG-007 | `app/engine/accessoryEffects.ts` |
| RNG-008 | `app/engine/areaSearch.ts` |
| RNG-009 | `app/engine/callToAction.ts` |
| RNG-010 | `app/engine/character.ts` |
| RNG-011 | `app/engine/climbHeight.ts` |
| RNG-012 | `app/engine/combatRules.ts` |
| RNG-013 | `app/engine/coreGuardians.ts` |
| RNG-014 | `app/engine/deathScene.ts` |
| RNG-015 | `app/engine/digging.ts` |
| RNG-016 | `app/engine/dogCompanion.ts` |
| RNG-017 | `app/engine/durability.ts` |
| RNG-018 | `app/engine/elevatedOverlay.ts` |
| RNG-019 | `app/engine/encounter.ts` |
| RNG-020 | `app/engine/escort.ts` |
| RNG-021 | `app/engine/factionBodies.ts` |
| RNG-022 | `app/engine/fallenLedgerStore.ts` |
| RNG-023 | `app/engine/fallenSeal.ts` |
| RNG-024 | `app/engine/golems.ts` |
| RNG-025 | `app/engine/hooks.ts` |
| RNG-026 | `app/engine/indoorAmbush.ts` |
| RNG-027 | `app/engine/narrativeGenerator.ts` |
| RNG-028 | `app/engine/portability.ts` |
| RNG-029 | `app/engine/questGenerator.ts` |
| RNG-030 | `app/engine/restWakeLines.ts` |
| RNG-031 | `app/engine/rng.ts` |
| RNG-032 | `app/engine/saveSystem.ts` |
| RNG-033 | `app/engine/sceneNounMaterial.ts` |
| RNG-034 | `app/engine/scrapEngine.ts` |
| RNG-035 | `app/engine/statusEffects.ts` |
| RNG-036 | `app/engine/vendors.ts` |
| RNG-037 | `app/engine/waterBottle.ts` |
| RNG-038 | `app/engine/weatherEffects.ts` |
| RNG-039 | `app/engine/whispers.ts` |
| RNG-040 | `app/screens/AboutScreen.tsx` |
| RNG-041 | `app/state/combatResolution.ts` |
| RNG-042 | `app/state/gameStore.ts` |
| RNG-043 | `app/state/gearWear.ts` |
| RNG-044 | `app/state/slices/craftingSlice.ts` |
| RNG-045 | `app/state/slices/inventorySlice.ts` |
| RNG-046 | `app/state/slices/questSlice.ts` |
| RNG-047 | `app/state/slices/slotSlice.ts` |
| RNG-048 | `app/state/trapDive.ts` |
| RNG-049 | `app/state/whisperBeats.ts` |
