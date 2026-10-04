# Guardian Critical-Path Audit — Character State Inventory (Pass 1)

Source: `app/engine/types.ts`, `export interface PlayerCharacter { ... }` (the interface itself spans
roughly lines 1221-1550+ of a 2913-line file; read via full-interface extraction, not sampled). **112
top-level fields**, every one below copied verbatim from the real interface (not summarized from memory).
This is the single object every gameplay system in `system-candidates.md` ultimately reads or writes
through — it is the "character" in the fullest sense the audit protocol asked for, and its owner is
`app/state/gameStore.ts` (`GameStore.player: PlayerCharacter`).

Grouped by apparent role; grouping is this pass's classification (AUDIT-ASSIGNED), not something the
source itself declares — the interface is one flat object with no internal namespacing.

## Identity / build
`name`, `raceId`, `factionId`, `sex?`, `mapSeed` (creation-time save-key material, NOT world-generation
seed — `worldMap.ts` explicitly voids it: *"positions are canon now"*), `hasSeenIntro`, `storyIntroSeen?`,
`storyMotive?`, `storyMotiveChosen?`.

## Core combat/survival numbers
`hp`, `hpMax`, `stamina`, `staminaMax`, `ac`, `stats` (the six-attribute block — read via `Stats` type,
also exported from `types.ts`), `dead`, `deathId?`, `resurrectedFromDeathId?`, `resurrectionGems?`,
`legacyGemsClaimed?`, `bossDefeatGraceUntilHours` (grace period after a boss kill), `dodgeCooldown?`,
`abilityCooldowns`, `corruption`, `menace`, `menaceUpdatedHour`, `hungerStaminaPenalty`,
`weatherEffectSeen`, `weatherTickCooldown`, `statusEffects`.

## Position / world location
`currentLocationId`, `gridX`, `gridY`, `mapX`, `mapY`, `hubRoomId?`, `lastBeganLocationId?`,
`lastTravelDirection?`, `travelTarget?`, `routedMission?`, `routedClimbId?`, `recentTileHistory`,
`macroVisitSeq`, `safeExitMovesLeft`, `stepsSinceLastPurifier`.

## Time
`hoursElapsed` — **the WORLD CLOCK itself, lives directly on the player record** (see
`clock-inventory.md` CLK-WORLD-01; this is the exact counter `coreGuardians.ts`'s `coreSettleState`
reads as `hoursElapsed`). `lastRestRewardAtHours`, `lastSessionEndedAt` (a REAL wall-clock timestamp —
distinct class from `hoursElapsed`, flagged), `tideStageSeen`.

## Inventory / equipment / economy
`inventory`, `equipped`, `tc` (the currency — "TC"), `knownRecipes`, `knownTechniques`,
`techniqueProficiency`, `overheatCounts?`, `permanentStatWeapons?`, `permanentPierceWeapons?`,
`recentFusedArmorSlots`, `fusionPending?`, `luckyRerollReady?`, `stealHeat`, `stealHeatHours`,
`lastDugSpot?`.

## Companions
`dog?` (the `DogCompanion` type — see `system-candidates.md` `app/engine/dogCompanion.ts` group),
`golem?` (the `Companion`/golem shape — see `app/engine/golems.ts`), `companion?` (generic slot; relation
to `dog`/`golem` not resolved in this pass — flagged as UNK-007).

## Progression
`statProgress`, `earnedTitles`, `titleProgress`, `titleLog`, `milestones` (the `PlayerMilestones` type),
`roleKills`, `curiousMindAwakened?`, `labyrinthRun?`, `labyrinthHeartSeen?`.

## Faction / social
`factionStanding` (array of `{factionId, standing}` — see `app/engine/factions.ts`,
`app/engine/factionRelations.ts`), `menace`/`menaceUpdatedHour` (above — cross-listed, it is both a
survival number and a social one), `buyRepProgress`.

## Missions / quests — the single largest state category by field count
`activeQuests`, `activeHunts`, `activeMysteries`, `activeStorylines`, `activeFactionQuestIds`,
`activeFactionQuests`, `activeWhispers`, `activeBounty?`, `activeBounties`, `completedHuntIds`,
`completedMysteryIds`, `completedStorylineIds`, `completedFactionQuestIds`, `completedWhisperIds`,
`missionEncounters` (keyed conversation-card state — see `app/engine/missionEncounter.ts`),
`pendingLead?`, `pendingProvoke?`, `pendingDirectionalFind?`, `challengeAttempts`,
`brokerMission?`/`brokerOfferDeclined?`, `bountyPrimerSeen?`, `missingResolved?`, `motiveResolved?`,
`storyBeatsSeen?`, `storyChoices`, `mainQuest` — **the Guardian/Core-recovery state itself**
(`MainQuestState { phase, coresRecovered }`, see `core-guardian-map.md`), `arbiterBeatsSeen`.

## Discovery / lore
`loreConceptsRead`, `collectables` (character-story fragments — `app/engine/collectables.ts`),
`aetherBuff?` (relation to combat buffs not resolved in this pass — UNK-008), `pressure` /
`pressureCustom?` (the difficulty-dial system, `app/engine/pressure.ts`).

## Ownership / readers / writers — sampled, not exhaustive

`gameStore.ts` is the near-universal writer (all `store.setState({ player: {...} })` calls originate
there or in `app/state/slices/*.ts`, which `gameStore.ts` composes — see `state-mutation-ledger.md`). Every
one of the ~340 `system-candidates.md` engine modules that takes a `player: PlayerCharacter` parameter is
a READER; this pass did not build a full per-field reader/writer cross-reference (that many-to-many
mapping across 341 candidates and 112 fields is explicitly deferred to a later pass — see
`source-coverage.md` and `unknowns.md` UNK-009). What this pass DID confirm directly: `mainQuest` is
written via `advanceMainQuest()` (`mainQuest.ts`) and read by `coreGuardians.ts`'s
`spawnGuardianForCapital`; `hoursElapsed` is written by travel/rest/wait doors (`travelTime.ts`,
`waitVerb.ts`) and read by `coreSettleState`; `factionStanding` is written by `applyRepChange`
(`factions.ts`) and read pervasively (vendor pricing, faction-quest availability, menace price
multipliers).

## Persistence

Every field above rides inside the save blob — see `persistence-map.md` for the save/load path and the
size-guard machinery (`app/engine/saveTrim.ts`) that exists specifically because this object has grown
large enough to threaten `AsyncStorage`'s practical size limits on some devices.
