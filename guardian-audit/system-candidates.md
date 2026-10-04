# Guardian Critical-Path Audit — System Candidate Inventory (Pass 1)

**341 candidates**, one row per source module, discovered by a full directory sweep of `app/engine/`, `app/state/` (+ `slices/`), `app/ai/` (+ `cognition/`, `embedding/`, `generation/`, `ota/`), `app/diagnostics/`, `app/voice/`, `app/updates/`, `app/config/` at HEAD `f25aee76603c1316985940987def2e125f188b61` on `golem-line`.

**Method (record this, it is the proof this was not keyword search):** for every `.ts`/`.tsx` file in those directories, this pass read (a) the file's first header comment line verbatim, (b) every top-level `export function|const|class|interface|type|enum` declaration by regex over the real file, and (c) cross-referenced the file's path against separately-built file-sets for `Math.random(`, `Date.now(`, `setTimeout(`, `setInterval(`, `performance.now(`, and `AsyncStorage` usage. Every field below is machine-extracted from the actual file, not inferred from the filename alone. `app/components/` (84 files) and `app/screens/` (17 files) were inventoried separately (see `existing-observability.md`/`source-coverage.md`) and are NOT given their own CAND ids here — they are the *presentation* of the systems below, not separate gameplay systems, and are cross-referenced in `relationship-ledger.md` wherever they call a store action directly.

**Confidence key:** `PROVEN` = header comment present and read verbatim; `STRONG` = exports read directly but no header comment existed to quote (implementation still read, purpose inferred only from name/exports — flagged, not hidden). No candidate here is `POSSIBLE` or `UNKNOWN`; those grades are reserved for *relationships*, not for the existence of the modules themselves, which is a directory listing fact.


## gameplay-rule/content module  (240 candidates)

| ID | Module | Lines | RNG | Clock | Persist | Conf. | Purpose (header, verbatim, truncated) |
|---|---|---:|:---:|:---:|:---:|---|---|
| CAND-0049 | `app/engine/accessoryEffects.ts` | 441 | ● |  |  | PROVEN | // ⚠⚠⚠ OTA-1649 — WHAT A RING IS FOR. |
| CAND-0050 | `app/engine/aetherTechniques.ts` | 417 |  |  |  | PROVEN | // OTA-1191 — AETHER TECHNIQUES. The mage gap, filled with science. |
| CAND-0051 | `app/engine/aetherkin.ts` | 154 |  |  |  | PROVEN | // aetherkin — OTA-914 (HAL + golem only; NOT the lore-agnostic engine line). |
| CAND-0052 | `app/engine/ambientNounMatch.ts` | 108 |  |  |  | PROVEN | // Pure noun-matching used by the exploration UI to decide whether an |
| CAND-0053 | `app/engine/ambientNouns.ts` | 265 |  |  |  | PROVEN | // Ambient noun extractor — pulls notable content tokens out of a scene |
| CAND-0054 | `app/engine/arbiterDedup.ts` | 61 |  |  |  | PROVEN | // OTA-609 — near-duplicate suppression for GENERATED Arbiter lines. |
| CAND-0055 | `app/engine/arbiterEye.ts` | 78 |  |  |  | PROVEN | // arbiterEye.ts — OTA-1206. THE TORCH MARKS WHAT'S WORTH A CLOSER LOOK. |
| CAND-0056 | `app/engine/arbiterKnowledge.ts` | 179 |  |  |  | PROVEN | // arbiterKnowledge — deterministic, app-grounded answers to world-knowledge |
| CAND-0057 | `app/engine/arbiterNudge.ts` | 68 |  |  |  | PROVEN | // OTA-1459 — THE ARBITER STOPS SAYING THE SAME THING ALL DAY. |
| CAND-0058 | `app/engine/arbiterPersona.ts` | 712 |  |  |  | PROVEN | // OTA-1067 — PHASE 5: THE ARBITER BECOMES SOMEONE. |
| CAND-0059 | `app/engine/areaSearch.ts` | 525 | ● |  |  | PROVEN | // Area-search engine — when the player searches a generic SPATIAL or |
| CAND-0060 | `app/engine/armorBiteBack.ts` | 63 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1671 — THE ARMOUR BITES BACK. |
| CAND-0061 | `app/engine/armorStatAffinity.ts` | 344 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1670 — WHAT A PIECE IS CALLED DECIDES WHAT IT DOES FOR YOU. |
| CAND-0062 | `app/engine/askArbiter.ts` | 215 |  |  |  | PROVEN | // askArbiter — MiniLM-backed lore lookup. Player types |
| CAND-0063 | `app/engine/askInventory.ts` | 131 |  |  |  | PROVEN | // Small text-pattern helpers used by intent handlers in the game store. |
| CAND-0064 | `app/engine/atlasCoords.ts` | 268 |  |  |  | PROVEN | // OTA 053 — Atlas dot calibration for the redrawn world map. |
| CAND-0065 | `app/engine/atlasLabels.ts` | 346 |  |  |  | PROVEN | // ⚠⚠ THE ATLAS NAME OVERLAY — because the new map art has no lettering on it at all. |
| CAND-0066 | `app/engine/bandolierEligibility.ts` | 93 |  |  |  | PROVEN | // arb110 — Bandolier eligibility predicate (the throwables counterpart to |
| CAND-0067 | `app/engine/bonusDrops.ts` | 81 |  |  |  | PROVEN | // bonusDrops — a Fallout-4-ish "sprinkle" of GOOD crafting materials on top |
| CAND-0068 | `app/engine/bossLoot.ts` | 69 |  |  |  | PROVEN | // OTA-940 — BOSS SPOILS TABLE. Owner spec: "there shouldn't be any boss fight that ends |
| CAND-0069 | `app/engine/bountyCourse.ts` | 95 |  |  |  | PROVEN | // OTA-1164 — WHAT THE "SET COURSE" CONTROL ON A HELD BOUNTY SHOULD SAY. |
| CAND-0070 | `app/engine/bountyPolitics.ts` | 141 |  |  |  | PROVEN | // OTA-1165 — THE BOARD YOU FROZE IS THE DEAL YOU GET. |
| CAND-0071 | `app/engine/bountyPrimer.ts` | 90 |  |  |  | PROVEN | // OTA-1163 — THE FIRST CONTRACT COMES WITH SOMEONE TO EXPLAIN IT. |
| CAND-0072 | `app/engine/broker.ts` | 190 |  |  |  | PROVEN | // broker — the Guild Broker challenge (Parley Ground). Two non-allied faction |
| CAND-0073 | `app/engine/buildingMaps.ts` | 369 |  |  |  | PROVEN | // ⚠⚠ OTA-1429 — ONE TABLE FOR EVERY PAINTED BUILDING. |
| CAND-0074 | `app/engine/buildings.ts` | 469 |  |  |  | PROVEN | // Enterable-building templates (arb24). A small pool of generic interiors |
| CAND-0075 | `app/engine/bulkSell.ts` | 202 |  |  |  | PROVEN | // ⚠⚠ OTA-1232 — "SELL ALL COMMON GEAR", AND THE THREE THINGS THAT WORD HIDES. |
| CAND-0076 | `app/engine/bulkSellReview.ts` | 134 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1873 — A BULK SALE IS REVIEWED BEFORE IT IS MADE. |
| CAND-0077 | `app/engine/buriedSkyscraper.ts` | 310 |  |  |  | PROVEN | // OTA-151 — Buried Skyscraper expansion framework (scaffold only). |
| CAND-0078 | `app/engine/callToAction.ts` | 140 | ● |  |  | PROVEN | // callToAction — backstory-fill flavor for evocative "call to action" |
| CAND-0079 | `app/engine/canonFacts.ts` | 145 |  |  |  | PROVEN | // canonFacts — picks 0-2 canon lore facts to inject into the Qwen |
| CAND-0080 | `app/engine/chainMemos.ts` | 29 |  |  |  | PROVEN | // OTA-1697 — THE NOTES REACH THE NARRATOR. The narrative-agency audit's hole 6: |
| CAND-0081 | `app/engine/chapters.ts` | 109 |  |  |  | PROVEN | // OTA-1020 — CHAPTER CARDS (golem-line story feature, phase 2 of 3). |
| CAND-0082 | `app/engine/character.ts` | 413 | ● | ● |  | PROVEN | // Race + faction starter weapon kits. Every character begins with: |
| CAND-0083 | `app/engine/chronicle.ts` | 98 |  |  |  | PROVEN | // OTA-843 [Character Chronicle] — the "legends" view. A character already ACCRETES |
| CAND-0084 | `app/engine/climbEncounters.ts` | 148 |  |  |  | PROVEN | // climbEncounters — OTA-911. The great climbs are the Aether-collector towers |
| CAND-0085 | `app/engine/climbHeight.ts` | 258 | ● |  |  | PROVEN | // OTA 030 — variable-height climb tiers. The OTA 027 climb verb was a |
| CAND-0086 | `app/engine/climbReadiness.ts` | 68 |  |  |  | PROVEN | // Climb-readiness — pure helper that mirrors the engine's climb refusal order |
| CAND-0087 | `app/engine/climbableSpawns.ts` | 135 |  |  |  | PROVEN | // climbableSpawns — 2026-05-24, playtester-spec curated climbable pool. |
| CAND-0088 | `app/engine/coatingRemedy.ts` | 96 |  |  |  | PROVEN | // OTA-745 — coatings are tri-modal: paint one on a WEAPON for an offensive DOT, on |
| CAND-0089 | `app/engine/collectables.ts` | 334 |  |  |  | PROVEN | // Character-story collectables. Each of the 10 authored characters |
| CAND-0090 | `app/engine/combatCues.ts` | 51 |  |  |  | PROVEN | // OTA-936 — combat LEGIBILITY cues ("show me my build is working"). The math already |
| CAND-0091 | `app/engine/combatEvent.ts` | 166 |  |  |  | PROVEN | /* ⚠⚠⚠ VIS-2 — THE COMBAT RESULT, AS A FACT, BESIDE THE SENTENCE THAT SAYS IT. |
| CAND-0092 | `app/engine/combatGeometry.ts` | 203 |  |  |  | PROVEN | // --------------------------------------------------------------------------- |
| CAND-0093 | `app/engine/combatGlyphArt.ts` | 183 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1766 — THE ILLUSTRATED GLYPHS ARE THE GLYPHS NOW. ONE TABLE, THREE |
| CAND-0094 | `app/engine/combatProse.ts` | 194 |  |  |  | PROVEN | // combatProse — pure display strings for combat lines. No store, no native |
| CAND-0095 | `app/engine/combatRules.ts` | 1181 | ● |  |  | PROVEN | // ⚠ OTA-1562 — safe to import here: weaponEffects reaches only rng / enemyTraits |
| CAND-0096 | `app/engine/combatSentence.ts` | 259 |  |  |  | PROVEN | /** |
| CAND-0097 | `app/engine/companionGear.ts` | 198 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1650 — THE COMPANIONS' GEAR IS REAL GEAR. |
| CAND-0098 | `app/engine/consumableCures.ts` | 90 |  |  |  | PROVEN | // consumableCures — OTA-1573. |
| CAND-0099 | `app/engine/consumeVerb.ts` | 18 |  |  |  | PROVEN | // OTA 23-010 / OTA-393 — the right verb for consuming an item: you APPLY a first |
| CAND-0100 | `app/engine/containerLoot.ts` | 128 |  |  |  | PROVEN | // containerLoot — derive a loot bundle from a container the player |
| CAND-0101 | `app/engine/contextInjector.ts` | 722 |  |  |  | PROVEN | /** |
| CAND-0102 | `app/engine/contractBroker.ts` | 202 |  |  |  | PROVEN | // OTA-1185 — THE TRADING POST TAKES ANY FACTION'S CONTRACT, FOR A CUT. |
| CAND-0103 | `app/engine/contractMarkers.ts` | 344 |  |  |  | PROVEN | // arb100 — plot OPEN contracts on the world atlas as distinct, numbered pins. |
| CAND-0104 | `app/engine/contractRefusal.ts` | 121 |  |  |  | PROVEN | /** |
| CAND-0105 | `app/engine/coreGuardians.ts` | 1397 | ● | ● |  | PROVEN | // Core Guardians — the Aether-Born Order. |
| CAND-0106 | `app/engine/corruption.ts` | 86 |  |  |  | PROVEN | // Corruption tier ladder. OTA 039 promotes corruption from a meter |
| CAND-0107 | `app/engine/crafting.ts` | 1314 |  |  |  | PROVEN | /** OTA-120 Phase 5 — Dog armor (vest) catalog row. All entries are |
| CAND-0108 | `app/engine/crucibleGuard.ts` | 137 |  |  |  | PROVEN | // crucibleGuard — OTA-1552. "ARE YOU SURE ABOUT THAT?" |
| CAND-0109 | `app/engine/damageTypes.ts` | 172 |  |  |  | PROVEN | // arb119 — every enemy attack resolves to a concrete damage TYPE. |
| CAND-0110 | `app/engine/dangerTier.ts` | 202 |  |  |  | PROVEN | // OTA-1478 — THE ARBITER STOPS NAMING LETHAL GROUND AS SAFE GROUND. |
| CAND-0111 | `app/engine/deathScene.ts` | 120 | ● |  |  | PROVEN | // OTA-1110 — THE DEATH SCENE. Owner: "The second my HP hits 0 for whatever |
| CAND-0112 | `app/engine/deeds.ts` | 129 |  | ● |  | PROVEN | // ⚠⚠⚠ OTA-1688 — THE DEED LEDGER. Step 2 of the Narrative Agency plan. |
| CAND-0113 | `app/engine/dialogue.ts` | 525 |  |  |  | PROVEN | // OTA-1058 — PHASE 2, VERTICAL SLICE: GIVE THE WORLD A MOUTH. |
| CAND-0114 | `app/engine/digging.ts` | 278 | ● |  |  | PROVEN | // Digging engine — this is a mud-flood world, so most things in your pack |
| CAND-0115 | `app/engine/diskLogCap.ts` | 20 |  |  | ● | PROVEN | // OTA-398 — on-disk COPY-LOG cap. The slot log key APPENDS every log line and was |
| CAND-0116 | `app/engine/dodgeCooldown.ts` | 77 |  |  |  | PROVEN | // OTA-1170 — DODGE GETS A COOLDOWN, AND THE BUTTON SHOWS IT. |
| CAND-0117 | `app/engine/dogAdoption.ts` | 249 |  |  |  | PROVEN | /** ⚠⚠⚠ THE ADOPTION IS ONE TRANSACTION, AND IT LIVES HERE BECAUSE IT IS THE |
| CAND-0118 | `app/engine/dogBreeds.ts` | 388 |  | ● |  | PROVEN | // ⚠⚠⚠ OTA — THE DOG MARKET SELLS POTENTIAL, NOT A FINISHED DOG. |
| CAND-0119 | `app/engine/dogCompanion.ts` | 740 | ● | ● |  | PROVEN | // OTA-120 — Dog Companion central module. |
| CAND-0120 | `app/engine/dogComparison.ts` | 103 |  |  |  | PROVEN | /** ⚠⚠⚠ THE NUMBERS THE COMPARISON CARD SHOWS, COMPUTED WHERE THEY CAN BE TESTED. |
| CAND-0121 | `app/engine/dogMarket.ts` | 247 |  |  |  | PROVEN | /** ⚠⚠⚠ OTA-1726 — WHERE A REPLACEMENT DOG COMES FROM. |
| CAND-0122 | `app/engine/durability.ts` | 514 | ● |  |  | PROVEN | // OTA-188 — when a durability-tracked item breaks, drop ONE low-tier |
| CAND-0123 | `app/engine/editDistance.ts` | 17 |  |  |  | STRONG |  |
| CAND-0124 | `app/engine/elevatedOverlay.ts` | 610 | ● | ● |  | PROVEN | // 2026-05-27 OTA-089 — Elevated overlay scenes. When the |
| CAND-0125 | `app/engine/eliteSwap.ts` | 150 |  |  |  | PROVEN | // OTA-1116 — THE ELITE SWAP. The last of OTA-1113's nine dials to find a |
| CAND-0126 | `app/engine/encounter.ts` | 692 | ● |  |  | PROVEN | // OTA-1478 — the player-tier ladder, once, as data. `dangerTier` imports |
| CAND-0127 | `app/engine/enemyCoating.ts` | 328 |  |  |  | PROVEN | /** |
| CAND-0128 | `app/engine/enemyControl.ts` | 144 |  |  |  | PROVEN | // enemyControl — OTA-1572, slice 2 of the weapon-effects program. |
| CAND-0129 | `app/engine/enemyTraits.ts` | 422 |  |  |  | PROVEN | // Per-enemy combat traits. Layer on top of the existing macro |
| CAND-0130 | `app/engine/entityGuard.ts` | 87 |  |  |  | PROVEN | // OTA-678 — off-canon entity guard for LLM narration. The Qwen narrator is |
| CAND-0131 | `app/engine/equipment.ts` | 1178 |  | ● |  | PROVEN | /** |
| CAND-0132 | `app/engine/escort.ts` | 162 | ● |  |  | PROVEN | // Escort-contract mechanic — ported from engine_Dev's shared-pool model. |
| CAND-0133 | `app/engine/factionBodies.ts` | 186 | ● |  |  | PROVEN | // OTA-1035 — WHAT A FACTION FIGHTER IS MADE OF. Owner: "let's fix the loot drop |
| CAND-0134 | `app/engine/factionBounty.ts` | 237 |  |  |  | PROVEN | // OTA-850 [faction patrols & bounties] — the bounty layer on top of the living |
| CAND-0135 | `app/engine/factionCrests.ts` | 128 |  |  |  | PROVEN | // ⚠⚠ OTA-1431 — THE NINE FACTION EMBLEMS, ONE TABLE. |
| CAND-0136 | `app/engine/factionHint.ts` | 54 |  |  |  | PROVEN | // Helper for the accept / turn-in refusal messages. Given a player's |
| CAND-0137 | `app/engine/factionQuests.ts` | 314 |  |  |  | PROVEN | /** What kind of player action advances this stage. |
| CAND-0138 | `app/engine/factionRapport.ts` | 134 |  |  |  | PROVEN | // OTA-805 — Charisma-scaled vendor pricing, gated per faction by a "rapport" |
| CAND-0139 | `app/engine/factionRelations.ts` | 209 |  |  |  | PROVEN | // OTA-853 [emergent grudges] — factions get STANDING WITH EACH OTHER, the same |
| CAND-0140 | `app/engine/factionStorylines.ts` | 64 |  |  |  | PROVEN | // Faction storyline engine — 5-10 stage chains tied to a single faction. |
| CAND-0141 | `app/engine/factions.ts` | 178 |  |  |  | PROVEN | // arb119 — reputation is a bounded standing, never an unbounded resource. The join |
| CAND-0142 | `app/engine/fallenDogs.ts` | 271 |  |  |  | PROVEN | /* ⚠⚠⚠ OTA-1844 — THE LAST WALK. |
| CAND-0143 | `app/engine/fallenLedger.ts` | 1050 |  | ● |  | PROVEN | // ⚠⚠ OTA-1362 — THE SHARED ROLL OF THE FALLEN: validator + merge rules. |
| CAND-0144 | `app/engine/fallenLedgerStore.ts` | 903 | ● | ● | ● | PROVEN | // ⚠⚠ OTA-1362 — THE SHARED ROLL OF THE FALLEN: identity, disk, and the exchange. |
| CAND-0145 | `app/engine/fallenMailbox.ts` | 229 |  | ● | ● | PROVEN | // ⚠⚠ OTA-1362 — THE MAILBOX: automatic delivery for the shared roll. |
| CAND-0146 | `app/engine/fallenRevenants.ts` | 439 |  | ● |  | PROVEN | // OTA-998 — THE HOLLOWED. The install's Fallen roll made flesh: a character |
| CAND-0147 | `app/engine/fallenSeal.ts` | 163 | ● |  |  | PROVEN | // ⚠⚠ OTA-1362 — THE SEAL: HMAC-SHA256 over a ledger payload. |
| CAND-0148 | `app/engine/feedActionChip.ts` | 160 |  |  |  | PROVEN | // OTA-1457 — A TRAILING ACTION CHIP ON THE FEED, AND THE ONE RULE IT OBEYS. |
| CAND-0149 | `app/engine/fillerWords.ts` | 57 |  |  |  | PROVEN | // Common English descriptors that show up in player input but don't |
| CAND-0150 | `app/engine/fleeEscalation.ts` | 156 |  |  |  | PROVEN | // fleeEscalation — OTA-1678, THE CHASE GETS HARDER. |
| CAND-0151 | `app/engine/flourish.ts` | 239 |  |  |  | PROVEN | // OTA-1063 — THE FLOURISH. One short beat of stage business after a reply. |
| CAND-0152 | `app/engine/foreignText.ts` | 184 |  |  |  | PROVEN | // foreignText — strip non-English (foreign-script / romanized-foreign) WORDS that |
| CAND-0153 | `app/engine/gameLog.ts` | 43 |  | ● |  | PROVEN | /** ⚠ THE CHANNELS THE PLAYER NEVER SEES, and the ONE place that list lives. |
| CAND-0154 | `app/engine/gatherSort.ts` | 730 |  |  |  | PROVEN | // ⚠⚠ OTA-1232 — WHAT THE LOOT POPUP HAS TO ANSWER, ANSWERED IN THE POPUP. |
| CAND-0155 | `app/engine/giftEligibility.ts` | 66 |  |  |  | PROVEN | /** OTA-1154 — ONE ANSWER TO "CAN I GIVE THIS AWAY?", FOR THE UI AND THE STORE. |
| CAND-0156 | `app/engine/giftLedger.ts` | 80 |  |  |  | PROVEN | // OTA-1161 — WHAT YOU GAVE, TO WHOM, AND HOW THEY TOOK IT. |
| CAND-0157 | `app/engine/gifting.ts` | 362 |  |  |  | PROVEN | // OTA-1060 — GIVING SOMEBODY SOMETHING. |
| CAND-0158 | `app/engine/golems.ts` | 436 | ● | ● |  | PROVEN | // 2026-05-25 [MECHANIC-1b] — Golem sidekick definitions. |
| CAND-0159 | `app/engine/grammar.ts` | 114 |  |  |  | PROVEN | // Shared indefinite-article + article-dedup grammar for interpolated nouns. |
| CAND-0160 | `app/engine/greatClimbs.ts` | 376 |  |  |  | PROVEN | // greatClimbs — OTA-910. Five landmark "great climbs" tall enough (11–15 |
| CAND-0161 | `app/engine/healBatch.ts` | 28 |  |  |  | PROVEN | // healBatch.ts — OTA-693. "Use Max" batch healing. Instead of tapping "use First |
| CAND-0162 | `app/engine/hiddenLocations.ts` | 47 |  |  |  | PROVEN | // hiddenLocations — OTA-498. Locations that start as an unknown "?" on the atlas |
| CAND-0163 | `app/engine/hookPuzzles.ts` | 323 |  |  |  | PROVEN | // Hook-puzzle resolver. OTA-129. |
| CAND-0164 | `app/engine/hooks.ts` | 1121 | ● | ● |  | PROVEN | // Narrative hook engine — turns the random "feature sightings" and "casual |
| CAND-0165 | `app/engine/hpBreakdown.ts` | 95 |  |  |  | PROVEN | // OTA-1161 — WHERE YOUR MAX HP CAME FROM. |
| CAND-0166 | `app/engine/hub.ts` | 641 |  |  |  | PROVEN | // HANDOFF #15b — hub engine integration. Loads the hand-authored hub |
| CAND-0167 | `app/engine/hunts.ts` | 609 |  |  |  | PROVEN | // Hunt engine — long-form, multi-stage monster hunts (5-9 prep stages + a |
| CAND-0168 | `app/engine/indoorAmbush.ts` | 145 | ● |  |  | PROVEN | // OTA-1032 — WHO CAN AMBUSH YOU INDOORS. A rest-ambush used to draw from the |
| CAND-0169 | `app/engine/interactionTags.ts` | 224 |  |  |  | PROVEN | // Tag-based classifier for ambient nouns. A single noun can carry |
| CAND-0170 | `app/engine/inventory.ts` | 237 |  |  |  | PROVEN | // The pack has no weight / slot / encumbrance system — meaningful gear, loot, |
| CAND-0171 | `app/engine/investigationTable.ts` | 807 |  | ● |  | PROVEN | // OTA-071 — Per-room investigation table. Every ambient noun |
| CAND-0172 | `app/engine/itemAliases.ts` | 170 |  |  |  | PROVEN | // Ambient-noun → catalog-item aliases. The location interactables |
| CAND-0173 | `app/engine/itemBackfill.ts` | 407 |  |  |  | PROVEN | // itemBackfill — one-shot pass over an existing player inventory |
| CAND-0174 | `app/engine/itemDefaults.ts` | 485 |  |  |  | PROVEN | // itemDefaults — synthesize a catalog entry on the fly for items the |
| CAND-0175 | `app/engine/itemEffect.ts` | 377 |  |  |  | PROVEN | // itemEffect.ts — generic effect system for catalog items. |
| CAND-0176 | `app/engine/itemFusion.ts` | 1538 |  |  |  | PROVEN | // itemFusion — combine the player's reserved inferred items into a |
| CAND-0177 | `app/engine/itemIdentity.ts` | 106 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1736 — WHAT AN ITEM INSTANCE IS CALLED, AND WHERE IT IS WORN. |
| CAND-0178 | `app/engine/itemMigrations.ts` | 129 |  |  |  | PROVEN | // OTA-998 — LEGACY CATALOG-NAME MIGRATIONS. A catalog rename/removal MUST land an |
| CAND-0179 | `app/engine/itemResolution.ts` | 117 |  |  |  | PROVEN | // itemResolution — single source of truth for "give me this item's |
| CAND-0180 | `app/engine/itemSynthesisCache.ts` | 233 |  |  | ● | PROVEN | // itemSynthesisCache — install-lifetime store of Qwen-synthesized |
| CAND-0181 | `app/engine/itemSynthesisQwen.ts` | 510 |  | ● |  | PROVEN | // itemSynthesisQwen — call Qwen 2.5 0.5B for a balanced stat row |
| CAND-0182 | `app/engine/itemWeight.ts` | 112 |  |  |  | PROVEN | // Item weight / mass for throw damage and other physics-driven mechanics. |
| CAND-0183 | `app/engine/keyboardPoll.ts` | 29 |  |  |  | PROVEN | // OTA-933 — pure decision logic for the KeyboardInputBar reliability poll, extracted so |
| CAND-0184 | `app/engine/keyboardSafeCard.ts` | 222 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1718 — CAN THE PLAYER REACH THE BUTTON WITH THE KEYBOARD OPEN? |
| CAND-0185 | `app/engine/knockout.ts` | 59 |  |  |  | PROVEN | // knockout.ts — OTA-361 humanoid knockout rule. |
| CAND-0186 | `app/engine/labyrinth.ts` | 166 |  |  |  | PROVEN | // labyrinth — the Wayfarer of the Lost Paths challenge engine (Iskan-Veil). |
| CAND-0187 | `app/engine/ledgerLinks.ts` | 132 |  |  |  | PROVEN | /* ⚠⚠⚠ OTA-1845 — THE LEDGER OF THE FALLEN: THE INVITATION, AND THE DOOR IT OPENS. |
| CAND-0188 | `app/engine/llmParser.ts` | 274 |  |  |  | PROVEN | // llmParser — Qwen-backed fallback when the dictionary parser can't |
| CAND-0189 | `app/engine/locationChallenges.ts` | 176 |  |  |  | PROVEN | // locationChallenges — the Tier-C "title challenge" registry. Each of the 6 |
| CAND-0190 | `app/engine/locationMatch.ts` | 156 |  |  |  | PROVEN | // OTA-989 — "travel to <place>" must find the place the player NAMED, not the place |
| CAND-0191 | `app/engine/logSeam.ts` | 72 |  |  |  | PROVEN | // ⚠⚠ OTA-1494 — A LOG THAT SAYS WHICH ERA EACH LINE BELONGS TO. |
| CAND-0192 | `app/engine/loreConceptBank.ts` | 312 |  |  |  | PROVEN | // loreConceptBank — unified searchable index over every lore source |
| CAND-0193 | `app/engine/mainQuest.ts` | 1096 |  |  |  | PROVEN | // v2.4.1 (OTA 033) — Mud Flood Nexus main quest arc. |
| CAND-0194 | `app/engine/mapFraction.ts` | 72 |  |  |  | PROVEN | // ⚠⚠ OTA-1370 — WHERE THE PLAYER IS DRAWN, AS A FRACTION OF THE ART. ONE COPY. |
| CAND-0195 | `app/engine/medkitEligibility.ts` | 147 |  |  |  | PROVEN | // app/engine/medkitEligibility.ts — THE HEALING POUCH. |
| CAND-0196 | `app/engine/menace.ts` | 92 |  |  |  | PROVEN | // OTA-808 — Menace: the price of ruling by fear. Intimidation is powerful — you can |
| CAND-0197 | `app/engine/metaComment.ts` | 370 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1464 — TELLING A BUG REPORT FROM A COMMAND. |
| CAND-0198 | `app/engine/missionEncounter.ts` | 306 |  |  |  | PROVEN | // missionEncounter — OTA-1580. The mission conversation card's rules, pure. |
| CAND-0199 | `app/engine/missionEncounterArm.ts` | 176 |  |  |  | PROVEN | // missionEncounterArm — OTA-1581. IS THERE SOMEBODY STANDING HERE RIGHT NOW? |
| CAND-0200 | `app/engine/missionReady.ts` | 59 |  |  |  | PROVEN | /** OTA-1152 — ONE definition of "ready to hand in", for every contract kind. |
| CAND-0201 | `app/engine/missionRepair.ts` | 111 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1589 — THE RECORDS OLD BUILDS LEFT STANDING WHERE NOTHING CAN PAY THEM. |
| CAND-0202 | `app/engine/missionRoles.ts` | 175 |  |  |  | PROVEN | // missionRoles — OTA-1581. WHO IS STANDING THERE, and what it costs to talk |
| CAND-0203 | `app/engine/missionRouting.ts` | 56 |  |  |  | PROVEN | // Faction-mission ROUTE CHAIN support (Tartaria line). |
| CAND-0204 | `app/engine/missionTrace.ts` | 996 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1586 — WHAT THE SLATE HELD, IN EVERY PART OF EVERY LOG. |
| CAND-0205 | `app/engine/mysteries.ts` | 67 |  |  |  | PROVEN | // Mystery-object quest engine — 3-5 step chains to find lore-canonical |
| CAND-0206 | `app/engine/namedFoes.ts` | 76 |  |  |  | PROVEN | // namedFoes — creatures that exist ONLY when something in the world calls them |
| CAND-0207 | `app/engine/narrativeGenerator.ts` | 1419 | ● |  |  | PROVEN | // OTA-1067 — Phase 5: the Arbiter's arc across the Cores and his opinion of |
| CAND-0208 | `app/engine/npcGender.ts` | 39 |  |  |  | PROVEN | // ⚠ OTA-1440 — WHO IS "HE" AND WHO IS "SHE", from the one place that already |
| CAND-0209 | `app/engine/npcMemory.ts` | 996 |  | ● |  | PROVEN | // OTA-1049 — PHASE 1, SLICE 1: NPCs REMEMBER YOU. |
| CAND-0210 | `app/engine/oneToAPack.ts` | 61 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1673 — SOME TOOLS YOU ONLY EVER NEED ONE OF. |
| CAND-0211 | `app/engine/outpostGraph.ts` | 203 |  |  |  | PROVEN | // ⚠⚠ OTA-1279 — THE UNIVERSAL OUTPOST NAVIGATION GRAPH. |
| CAND-0212 | `app/engine/outpostRoomMarks.ts` | 232 |  |  |  | PROVEN | // ⚠ OTA-1355 — WHERE EACH ROOM'S NAME IS PAINTED, PER OUTPOST SKIN. |
| CAND-0213 | `app/engine/parley.ts` | 176 |  |  |  | PROVEN | // OTA-808 — Parley: the two-button social encounter. When you speak to a wild NPC |
| CAND-0214 | `app/engine/parseValidator.ts` | 307 |  |  |  | PROVEN | // parseValidator.ts — post-processing rules for the rule-based parser |
| CAND-0215 | `app/engine/parser.ts` | 1682 |  |  |  | PROVEN | // Verb pools. Goal of 10 synonyms per intent for natural-language |
| CAND-0216 | `app/engine/perches.ts` | 190 |  |  |  | PROVEN | // OTA-951 — Phase B of the real-heights model: PERCHES. Small objects tucked |
| CAND-0217 | `app/engine/playerName.ts` | 116 |  |  |  | PROVEN | // OTA-635 — player-name hygiene. The name is SPOKEN aloud by the Kokoro voice, so |
| CAND-0218 | `app/engine/pocketLoot.ts` | 72 |  |  |  | PROVEN | // OTA-1078 — WHAT'S ACTUALLY IN THEIR POCKETS. |
| CAND-0219 | `app/engine/portability.ts` | 280 | ● |  |  | PROVEN | // Portability check. Some ambient nouns resolve to real catalog |
| CAND-0220 | `app/engine/pouchEligibility.ts` | 131 |  |  |  | PROVEN | // OTA-269 — Tool pouch eligibility predicate. |
| CAND-0221 | `app/engine/powerRating.ts` | 152 |  |  |  | PROVEN | // OTA-928 — a single "Power" rating for the player and for each enemy, on the SAME |
| CAND-0222 | `app/engine/pressure.ts` | 628 |  |  |  | PROVEN | // OTA-1066 — PHASE 4: LET THE DEBT COME DUE, BEHIND A DIFFICULTY TOGGLE. |
| CAND-0223 | `app/engine/progressionHints.ts` | 234 |  |  |  | PROVEN | // progressionHints — OTA-1701. THE WORLD TELLS YOU WHERE THE POWER IS. |
| CAND-0224 | `app/engine/quarrySeed.ts` | 93 |  |  |  | PROVEN | // OTA-1166 — ARRIVING SOMEWHERE MEANS FINDING SOMEONE. |
| CAND-0225 | `app/engine/questGenerator.ts` | 106 | ● | ● |  | PROVEN | /** ⚠⚠ OTA-1214 — EVERY LEAD VERB HAS A TRIGGER. The owner asked, after the hunt |
| CAND-0226 | `app/engine/questItems.ts` | 27 |  |  |  | PROVEN | // questItems — OTA-493. Items reserved for an objective: the main quest (Cores, |
| CAND-0227 | `app/engine/questStage.ts` | 519 |  |  |  | PROVEN | // ⚠⚠ P19 — THE STAGE LAYER. What a staged contract needs in order to mean what it says. |
| CAND-0228 | `app/engine/questionMarkers.ts` | 74 |  |  |  | PROVEN | // arb99 — numbered "?" markers. When more than one unknown "?" place is on the |
| CAND-0229 | `app/engine/raceAbilities.ts` | 107 |  |  |  | PROVEN | // raceAbilities — the activatable, once-per-day race powers. arb-fix: the |
| CAND-0230 | `app/engine/raceMechanics.ts` | 330 |  |  |  | PROVEN | // Race-driven mechanics that fire at runtime (not just at character |
| CAND-0231 | `app/engine/racePortraits.ts` | 43 |  |  |  | PROVEN | // ⚠⚠ OTA-1433 — THE SEVEN RACE PORTRAITS, ONE TABLE. |
| CAND-0232 | `app/engine/recipeDiscovery.ts` | 244 |  |  |  | PROVEN | // recipeDiscovery — "cool rare recipes" are LOCKED until you find them. |
| CAND-0233 | `app/engine/resonanceLantern.ts` | 142 |  |  |  | PROVEN | // resonanceLantern.ts — the Aetheric Torch "resonance probe" gamble. |
| CAND-0234 | `app/engine/restWakeLines.ts` | 75 | ● |  |  | PROVEN | // OTA-1112 — THE OUTDOOR HALF OF OTA-1032. |
| CAND-0235 | `app/engine/resurrectionRules.ts` | 9 |  |  |  | PROVEN | // ⚠ OTA-1738 — the pity interval, named where teaching can read it. The |
| CAND-0236 | `app/engine/rng.ts` | 105 | ● |  |  | PROVEN | // Module-level cursors so a given pool cycles through its entries before |
| CAND-0237 | `app/engine/runecasterPassives.ts` | 171 |  |  |  | PROVEN | // runecasterPassives — OTA-1560. WHICH STAT A RUNE-CASTER'S CRUCIBLE PASSIVE |
| CAND-0238 | `app/engine/sacredGround.ts` | 26 |  |  |  | PROVEN | // sacredGround.ts — OTA-1212. THE MARKET TRUCE, AS LAW. |
| CAND-0239 | `app/engine/salvagePools.ts` | 921 |  |  |  | PROVEN | // Per-noun salvage outcome pools. When the player salvages a wagon, |
| CAND-0240 | `app/engine/salvageableSpawns.ts` | 129 |  |  |  | PROVEN | // salvageableSpawns — 2026-05-24, playtester-spec curated salvage pool. |
| CAND-0241 | `app/engine/saveExport.ts` | 253 |  |  | ● | PROVEN | // OTA-1178 — SAVE EXPORT / IMPORT. A CHARACTER YOU CAN GET BACK. |
| CAND-0242 | `app/engine/saveSystem.ts` | 1927 | ● | ● | ● | PROVEN | // ⚠ OTA-1844 — TYPE ONLY, and that is load-bearing: `fallenLedger` imports |
| CAND-0243 | `app/engine/saveTrim.ts` | 201 |  |  | ● | PROVEN | // OTA-395/396 — slot-blob size guard (the save-loss root cause). |
| CAND-0244 | `app/engine/sceneIntroRefusals.ts` | 90 |  |  |  | PROVEN | // sceneIntroRefusals — OTA-1571. |
| CAND-0245 | `app/engine/sceneNounMaterial.ts` | 191 | ● |  |  | PROVEN | // Scene-noun material & hardness classifier. |
| CAND-0246 | `app/engine/scrapEngine.ts` | 331 | ● |  |  | PROVEN | // scrapEngine — disassemble built items into stock materials. |
| CAND-0247 | `app/engine/sellPrice.ts` | 316 |  |  |  | PROVEN | // Sell-back pricing for vendor trades. Player gets roughly 40% of a |
| CAND-0248 | `app/engine/senderIntro.ts` | 254 |  |  |  | PROVEN | /* ⚠⚠⚠ OTA-1845 — THE PERSON WHO SENT THEM COMES AND ASKS. |
| CAND-0249 | `app/engine/sigils.ts` | 108 |  |  |  | PROVEN | // sigils.ts — OTA-691. Found faction SIGILS: a slain member's mark — a pendant or |
| CAND-0250 | `app/engine/staminaCosts.ts` | 12 |  |  |  | PROVEN | // ⚠ OTA-1738 — THE STAMINA TABLE, OUT OF THE STORE. It has lived in gameStore |
| CAND-0251 | `app/engine/standingAt.ts` | 199 |  |  |  | PROVEN | // OTA-1458 — "AM I STANDING AT X?", ASKED ONCE, ANSWERED THE SAME WAY EVERYWHERE. |
| CAND-0252 | `app/engine/statTraining.ts` | 285 |  |  |  | PROVEN | // OTA 058 — Use-based stat progression (Skyrim model with success-gate). |
| CAND-0253 | `app/engine/statusEffects.ts` | 303 | ● |  |  | PROVEN | // Probability and duration tuning per damage type. Pulled from the |
| CAND-0254 | `app/engine/story.ts` | 102 |  |  |  | PROVEN | // OTA-1018 — THE REASON YOU CAME DOWN (golem-line story feature, phase 1 of 3). |
| CAND-0255 | `app/engine/storyDrip.ts` | 361 |  |  |  | PROVEN | // OTA-1021 — THE MOTIVE DRIP (golem-line story feature, phase 3 of 3). |
| CAND-0256 | `app/engine/storyForks.ts` | 210 |  |  |  | PROVEN | // OTA-1065 — PHASE 3: MAKE THE STORY ASK QUESTIONS. |
| CAND-0257 | `app/engine/storyNouns.ts` | 139 |  |  |  | PROVEN | // ⚠⚠ OTA-1236 — THE NOUN THAT CARRIES THE STORY, AND WHY BULK ACTIONS MUST KNOW IT. |
| CAND-0258 | `app/engine/takeableGearSpawns.ts` | 102 |  |  |  | PROVEN | // takeableGearSpawns — revives the `take` verb as the GEAR loop. |
| CAND-0259 | `app/engine/talkDown.ts` | 93 |  |  |  | PROVEN | // OTA-806 — Talk down a fight. A high-Charisma answer to "where does persuade |
| CAND-0260 | `app/engine/threatWord.ts` | 223 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1797 — THE WORD BESIDE THE NUMBER. |
| CAND-0261 | `app/engine/timeOfDay.ts` | 48 |  |  |  | PROVEN | // 2026-05-25 — time-of-day helpers. Day / night modifiers apply to: |
| CAND-0262 | `app/engine/titleChallenges.ts` | 123 |  |  |  | PROVEN | // titleChallenges — the two "content-review-only" Tier-C challenges that need |
| CAND-0263 | `app/engine/titleMatch.ts` | 97 |  |  |  | PROVEN | // OTA-1188 — TITLE MATCHING THAT SURVIVES THE PARSER'S OWN STOP-WORD STRIPPING. |
| CAND-0264 | `app/engine/titles.ts` | 489 |  |  |  | PROVEN | // titles — the Arbiter-assigned title earning engine. OTA-236 shipped the |
| CAND-0265 | `app/engine/travelTime.ts` | 154 |  |  |  | PROVEN | // OTA-1162 — WHAT ONE TILE COSTS, IN ONE PLACE. |
| CAND-0266 | `app/engine/types.ts` | 2913 |  | ● |  | PROVEN | /** OTA 204 — argument role taxonomy. See ParsedInput.args for the |
| CAND-0267 | `app/engine/utilityGlyphArt.ts` | 79 |  |  |  | PROVEN | /** |
| CAND-0268 | `app/engine/vendorPricing.ts` | 87 |  |  |  | PROVEN | // OTA-865 [war micro-economy] — the single source of truth for what a vendor charges and |
| CAND-0269 | `app/engine/vendorServices.ts` | 29 |  |  |  | PROVEN | // OTA-728 — paid vendor-service tuning (pure + testable). Costs are shaped so |
| CAND-0270 | `app/engine/vendors.ts` | 782 | ● | ● |  | PROVEN | // arb92 — food / material stocking. Traders carry multiples of perishables |
| CAND-0271 | `app/engine/verbFrames.ts` | 178 |  |  |  | PROVEN | // verbFrames.ts — subcategorization frames for the rule-based parser |
| CAND-0272 | `app/engine/voicePools.ts` | 451 |  |  |  | PROVEN | // OTA-1461 — THE LINES YOU HEAR TEN TIMES AN HOUR. |
| CAND-0273 | `app/engine/wanderers.ts` | 269 |  |  |  | PROVEN | // OTA-807 — Wandering NPCs. The second half of the "where does Charisma matter?" |
| CAND-0274 | `app/engine/wastelandEncounters.ts` | 476 |  |  |  | PROVEN | // wastelandEncounters — roll for an encounter during long-distance |
| CAND-0275 | `app/engine/waterBottle.ts` | 33 | ● | ● |  | PROVEN | // OTA 004 / OTA-393 — drinking a Water Bottle must leave an Empty Water Bottle |
| CAND-0276 | `app/engine/weaponCoating.ts` | 426 |  |  |  | PROVEN | // weaponCoating.ts — OTA-360 weapon-coating helpers. |
| CAND-0277 | `app/engine/weaponEffects.ts` | 1652 |  |  |  | PROVEN | // Lightweight parser for the rulebook's "Effect or Special Property" |
| CAND-0278 | `app/engine/weaponFamilyArt.ts` | 233 |  |  |  | PROVEN | /** |
| CAND-0279 | `app/engine/weaponGlyphs.ts` | 361 |  |  |  | PROVEN | // weaponGlyphs — OTA-1553. WHAT THIS WEAPON DOES, AND WHETHER IT BITES *THIS* FOE, |
| CAND-0280 | `app/engine/weatherEffects.ts` | 393 | ● |  |  | PROVEN | // Weather effects engine — turns the WeatherEntry data file's atmospheric |
| CAND-0281 | `app/engine/whisperChains.ts` | 1055 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1548 — TWENTY MORE FIRES IN THE DARK. |
| CAND-0282 | `app/engine/whispers.ts` | 459 | ● | ● |  | PROVEN | // Whisper system — informal NPC-to-NPC tips that drive emergent |
| CAND-0283 | `app/engine/worldDirections.ts` | 240 |  |  |  | PROVEN | // --------------------------------------------------------------------------- |
| CAND-0284 | `app/engine/worldEvents.ts` | 499 |  |  |  | PROVEN | // OTA-851 [living world — variety] — the WORLD EVENT engine + roaming patrols. |
| CAND-0285 | `app/engine/worldLadder.ts` | 251 |  |  |  | PROVEN | // --------------------------------------------------------------------------- |
| CAND-0286 | `app/engine/worldMap.ts` | 637 |  |  |  | PROVEN | // Procedural world-map layout — places every Location on a sparse grid |
| CAND-0287 | `app/engine/worldMemory.ts` | 322 |  | ● |  | PROVEN | // ⚠ OTA-1339 — the map makeover moved the Grand Spire of Asgardar out of the capital |
| CAND-0288 | `app/engine/worldPulse.ts` | 169 |  |  |  | PROVEN | // OTA-844 [world that moves offscreen] — the WORLD PULSE. Tartaria used to sit still |

## diagnostics / telemetry / crash-reporting instrument  (27 candidates)

| ID | Module | Lines | RNG | Clock | Persist | Conf. | Purpose (header, verbatim, truncated) |
|---|---|---:|:---:|:---:|:---:|---|---|
| CAND-0022 | `app/diagnostics/aboutSummary.ts` | 330 |  |  |  | PROVEN | // OTA-063 — shared "basic device + install" summary used by: |
| CAND-0023 | `app/diagnostics/aliveBeat.ts` | 135 |  | ● |  | PROVEN | /* ⚠⚠⚠ LAG-3 — THE ALIVE BEAT BELONGS TO THE APP, NOT TO ONE SCREEN. |
| CAND-0024 | `app/diagnostics/autoBundle.ts` | 128 |  |  | ● | PROVEN | /** |
| CAND-0025 | `app/diagnostics/bootIdentity.ts` | 364 | ● | ● | ● | PROVEN | // ⚠⚠⚠ OTA-1587 — WHICH LIFE DIED. AN INSTRUMENT, NOT A FIX. |
| CAND-0026 | `app/diagnostics/bugReport.ts` | 447 |  | ● | ● | PROVEN | // arb75 — shared bug-report composer. Extracted from TitleScreen.sendBugReport |
| CAND-0027 | `app/diagnostics/crashCorrelation.ts` | 61 | ● | ● |  | PROVEN | // OTA-1882 — ONE CRASH, ONE CORRELATION KEY (#214). |
| CAND-0028 | `app/diagnostics/crashLedger.ts` | 437 |  | ● | ● | PROVEN | // ⚠⚠ OTA-1380 — THE CRASH LEDGER. Owner: *"add crash reporting."* |
| CAND-0029 | `app/diagnostics/crashReporter.ts` | 199 |  |  | ● | PROVEN | // ⚠⚠ OTA-1380 — CRASH DELIVERY, AND IT IS INERT UNTIL TWO SEPARATE THINGS ARE TRUE. |
| CAND-0030 | `app/diagnostics/crashSave.ts` | 279 |  | ● | ● | PROVEN | // OTA-343 — crash-save capture. Sibling to saveSnapshot.ts (COPY SAVE) and |
| CAND-0031 | `app/diagnostics/inventorySnapshot.ts` | 236 |  |  |  | PROVEN | // OTA-202 — inventory snapshot bundled into the COPY LOG export. |
| CAND-0032 | `app/diagnostics/lastCrash.ts` | 75 |  |  | ● | PROVEN | // arb172 — surface the LAST JS-FATAL CRASH in the exportable diagnostic. |
| CAND-0033 | `app/diagnostics/memoryTimeline.ts` | 257 |  | ● |  | PROVEN | // ⚠⚠⚠ OTA-1809 (BAKER #3A) — THE MEMORY TIMELINE. AN INSTRUMENT, NOT A FIX. |
| CAND-0034 | `app/diagnostics/mlHealth.ts` | 1300 |  |  | ● | PROVEN | // OTA-272 — ML runtime health tracker. |
| CAND-0035 | `app/diagnostics/nativeMemoryRecorder.ts` | 1347 |  | ● |  | PROVEN | // ⚠⚠⚠ BUILD 190 — THE JS SIDE OF THE NATIVE MEMORY FLIGHT RECORDER. |
| CAND-0036 | `app/diagnostics/ownerTools.ts` | 45 |  |  | ● | PROVEN | // ⚠⚠ OTA-1490 — OWNER TOOLS UNLOCK BY DEVICE, NOT BY CHARACTER. |
| CAND-0037 | `app/diagnostics/pendingBundle.ts` | 246 | ● | ● | ● | PROVEN | /** |
| CAND-0038 | `app/diagnostics/portableReport.ts` | 284 |  |  |  | PROVEN | // OTA-1882 — THE PASTE FITS IN THE WINDOW (#214). |
| CAND-0039 | `app/diagnostics/renderClock.ts` | 40 |  | ● |  | PROVEN | // OTA-1696 — THE RENDER HAS A CLOCK. The 13:32 stalls begin at `engine-done |
| CAND-0040 | `app/diagnostics/rollTiming.ts` | 56 |  | ● |  | PROVEN | // OTA-1694 — THE DICE CLOCK. The owner: "I am talking specifically about lag |
| CAND-0041 | `app/diagnostics/runtimePressure.ts` | 368 |  | ● |  | PROVEN | // OTA-1172 — MEMORY WARNINGS, APP-STATE CHURN, AND A FREEZE DETECTOR. |
| CAND-0042 | `app/diagnostics/runtimePressureWatch.ts` | 614 |  | ● |  | PROVEN | /** |
| CAND-0043 | `app/diagnostics/saveLoadHealth.ts` | 249 |  |  | ● | PROVEN | // arb38 — Save-load crash guard (sibling to mlHealth.ts). |
| CAND-0044 | `app/diagnostics/saveSnapshot.ts` | 61 |  |  |  | PROVEN | // OTA-341 — save-state snapshot for the COPY SAVE diagnostic. Player ask: |
| CAND-0045 | `app/diagnostics/sentryTransport.ts` | 1290 |  | ● |  | PROVEN | /** |
| CAND-0046 | `app/diagnostics/subsystemMemoryMarks.ts` | 298 |  |  |  | PROVEN | /* ⚠⚠⚠ OTA-1853 — THE RING KNEW *WHEN*. IT DID NOT KNOW *WHO*. |
| CAND-0047 | `app/diagnostics/tapClock.ts` | 78 |  | ● |  | PROVEN | // OTA-1695 — THE TAP HAS A CLOCK. Owner: "I hit Dodge and it hangs for 4 or 5 |
| CAND-0048 | `app/diagnostics/touchPath.ts` | 604 |  | ● | ● | PROVEN | // ⚠⚠⚠ OTA-1813 — WHERE DOES THE TOUCH STOP? THIS IS AN INSTRUMENT, NOT A REPAIR. |

## gameplay state orchestration module  (26 candidates)

| ID | Module | Lines | RNG | Clock | Persist | Conf. | Purpose (header, verbatim, truncated) |
|---|---|---:|:---:|:---:|:---:|---|---|
| CAND-0289 | `app/state/accessibility.ts` | 79 |  |  | ● | PROVEN | // OTA-898 (SA-6) — device-level accessibility preferences. |
| CAND-0290 | `app/state/aethercraftBatch.ts` | 108 |  |  |  | PROVEN | // ⚠⚠ OTA-1673 — CASTS BY THE HANDFUL, and where that logic lives. |
| CAND-0291 | `app/state/combatResolution.ts` | 3285 | ● | ● |  | PROVEN | /** |
| CAND-0292 | `app/state/defeatCredit.ts` | 274 |  |  |  | PROVEN | // defeatCredit — OTA-1612. WHAT THE OBJECTIVES HEAR WHEN A TARGET GOES DOWN. |
| CAND-0293 | `app/state/dogStatus.ts` | 161 |  |  |  | PROVEN | /* ⚠⚠⚠ OTA-1844 — THE DOG'S TIME-BASED FATES, MOVED OUT OF THE STORE. |
| CAND-0294 | `app/state/factionParty.ts` | 142 |  |  |  | PROVEN | // factionParty — the faction-party spawner, out of gameStore. |
| CAND-0295 | `app/state/fleeOdds.ts` | 53 |  |  |  | PROVEN | // fleeOdds — OTA-1678, THE CHASE GETS HARDER (store-side half). |
| CAND-0296 | `app/state/gameStore.ts` | 36793 | ● | ● | ● | PROVEN | // ⚠ OTA-1844 — the dog's time-based fates live in their own file now; both names |
| CAND-0297 | `app/state/gearWear.ts` | 150 | ● | ● |  | PROVEN | /** |
| CAND-0298 | `app/state/humanActivity.ts` | 339 |  | ● |  | PROVEN | /** |
| CAND-0299 | `app/state/lastWalk.ts` | 113 |  | ● |  | PROVEN | /* ⚠⚠⚠ OTA-1844 — THE LAST WALK, ORCHESTRATED OUTSIDE THE STORE. |
| CAND-0300 | `app/state/ledgerRoute.ts` | 77 |  |  |  | PROVEN | /* ⚠⚠⚠ OTA-1845 — THE DOOR THAT WAS ALREADY THERE AND NOBODY WAS STANDING AT. |
| CAND-0301 | `app/state/ledgerVisits.ts` | 158 |  | ● |  | PROVEN | /* ⚠⚠⚠ OTA-1845 — THE RIDER'S QUEUE, ORCHESTRATED OUTSIDE THE STORE. |
| CAND-0302 | `app/state/playerGrid.ts` | 40 |  |  |  | PROVEN | /** |
| CAND-0303 | `app/state/presentationHandoff.ts` | 140 |  | ● |  | PROVEN | // ⚠⚠⚠ OTA-1863 — NATIVE DISMISSAL COMPLETION OWNS THE HANDOFF. |
| CAND-0304 | `app/state/saveLimits.ts` | 32 |  |  | ● | PROVEN | /** |
| CAND-0314 | `app/state/sprint.ts` | 95 |  | ● |  | PROVEN | /** |
| CAND-0315 | `app/state/stageArrival.ts` | 432 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1596 — THE MARK CATCHES UP AT THE DOOR, AND THE SPAWN STANDS UP AT IT. |
| CAND-0316 | `app/state/storeLeaves.ts` | 55 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1796 — THE STORE'S LEAVES: values the store's INITIAL STATE reads, kept |
| CAND-0317 | `app/state/storeNotify.ts` | 118 |  |  |  | PROVEN | /* ⚠⚠⚠ LAG-2 — ONE ACTION'S LOG LINES ARE ONE SUBSCRIBER SWEEP, NOT ONE EACH. |
| CAND-0318 | `app/state/talkContext.ts` | 62 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1867 — WHAT THE TOPIC GATES NEED, GATHERED IN ONE PLACE. |
| CAND-0319 | `app/state/trapDive.ts` | 78 | ● |  |  | PROVEN | /* ⚠⚠⚠ OTA-1845 — THE ENDLESS STAIR, MOVED OUT OF THE STORE. |
| CAND-0320 | `app/state/visibleLogCount.ts` | 39 |  |  |  | PROVEN | /** |
| CAND-0321 | `app/state/waitVerb.ts` | 84 |  |  |  | PROVEN | // ⚠⚠⚠ OTA-1627 — THE HOUR CAN BE WAITED FOR. |
| CAND-0322 | `app/state/weaponRiderEffects.ts` | 147 |  |  |  | PROVEN | // weaponRiderEffects — OTA-1676, slice 4c of the weapon-effects program. |
| CAND-0323 | `app/state/whisperBeats.ts` | 110 | ● |  |  | PROVEN | // ⚠⚠⚠ OTA-1628 — THE WHISPER BEATS POP UP TOO. |

## on-device AI / cognition subsystem  (20 candidates)

| ID | Module | Lines | RNG | Clock | Persist | Conf. | Purpose (header, verbatim, truncated) |
|---|---|---:|:---:|:---:|:---:|---|---|
| CAND-0001 | `app/ai/CognitiveOrchestrator.ts` | 233 |  | ● |  | PROVEN | // Statically-known runtime version. Bumped when the package is bumped in package.json. |
| CAND-0002 | `app/ai/cognition/EmotionInferenceEngine.ts` | 25 |  |  |  | STRONG |  |
| CAND-0003 | `app/ai/cognition/IntentInferenceEngine.ts` | 25 |  |  |  | STRONG |  |
| CAND-0004 | `app/ai/cognitionGate.ts` | 23 |  |  |  | PROVEN | // OTA-1696 — THE FIGHT SHEDS ITS PASSENGERS. The 13:32 bundle (#mtof9i1d5eoj, |
| CAND-0005 | `app/ai/deferredQwenWarm.ts` | 66 |  |  |  | PROVEN | // ⚠⚠ OTA-1493 — THE WARM WAITS FOR THE PLAYER. |
| CAND-0006 | `app/ai/embedding/EmbeddingCache.ts` | 36 |  |  |  | STRONG |  |
| CAND-0007 | `app/ai/embedding/SemanticEmbeddingService.ts` | 161 |  |  |  | PROVEN | // ⚠⚠ OTA-1696 — THE CLASSIFIER KEEPS TWO CORES. onnxruntime's default intra-op |
| CAND-0008 | `app/ai/embedding/Tokenizer.ts` | 88 |  |  |  | STRONG |  |
| CAND-0009 | `app/ai/embedding/VectorSimilarityEngine.ts` | 35 |  |  |  | STRONG |  |
| CAND-0010 | `app/ai/engines.ts` | 63 |  |  |  | PROVEN | /** |
| CAND-0011 | `app/ai/generation/LlamaRuntime.ts` | 715 |  | ● |  | PROVEN | // --------------------------------------------------------------------------- |
| CAND-0012 | `app/ai/generation/QwenGenerativeEngine.ts` | 412 |  | ● |  | PROVEN | // --------------------------------------------------------------------------- |
| CAND-0013 | `app/ai/generation/contextLedger.ts` | 136 |  |  |  | PROVEN | // OTA-1177 — COUNT THE LIVE MODEL CONTEXTS. AN INSTRUMENT, NOT A FIX. |
| CAND-0014 | `app/ai/generation/jsHeartbeat.ts` | 60 |  | ● |  | PROVEN | // ⚠⚠ OTA-1692 — THE JS HEARTBEAT UNDER A MODEL CALL. Thirteen freeze-watch |
| CAND-0015 | `app/ai/generation/qwenTelemetry.ts` | 630 |  |  |  | PROVEN | // OTA-1105 — QWEN CALL TELEMETRY. The measurement the 29-second mystery has |
| CAND-0016 | `app/ai/narration.ts` | 1669 | ● | ● |  | PROVEN | /** |
| CAND-0017 | `app/ai/nativeMlLock.ts` | 689 |  | ● |  | PROVEN | // arb159 / OTA-634 — Native-ML serialization lock, now PRIORITY-aware. |
| CAND-0018 | `app/ai/ota/ModelDownloader.ts` | 276 |  |  |  | PROVEN | /** Subdirectory the Qwen GGUF lives in once downloaded. */ |
| CAND-0019 | `app/ai/qwenWatchdog.ts` | 512 |  | ● |  | PROVEN | /** |
| CAND-0020 | `app/ai/types.ts` | 50 |  |  |  | STRONG |  |

## TTS/STT voice subsystem  (15 candidates)

| ID | Module | Lines | RNG | Clock | Persist | Conf. | Purpose (header, verbatim, truncated) |
|---|---|---:|:---:|:---:|:---:|---|---|
| CAND-0327 | `app/voice/PiperDownloader.ts` | 109 |  |  |  | PROVEN | // PiperDownloader — fetches the Piper voice model + sherpa-onnx |
| CAND-0328 | `app/voice/PiperTTSManager.ts` | 1651 |  | ● |  | PROVEN | // KokoroTTSManager — bundled neural TTS via react-native-executorch. |
| CAND-0329 | `app/voice/STTManager.ts` | 365 |  |  |  | PROVEN | // STTManager — push-to-talk speech recognition. |
| CAND-0330 | `app/voice/TTSController.ts` | 372 |  | ● | ● | PROVEN | // TTSController — subscribes to the game store and feeds new log |
| CAND-0331 | `app/voice/TTSManager.ts` | 418 |  | ● | ● | PROVEN | // TTSManager — speaks game lines through the device's text-to-speech |
| CAND-0332 | `app/voice/arbiterFrame.ts` | 94 |  |  | ● | PROVEN | // arbiterFrame — pulls speakable dialogue out of arbiter-channel |
| CAND-0333 | `app/voice/audioPad.ts` | 26 |  |  |  | PROVEN | // Pure PCM padding helper, split out of PiperTTSManager so it can be |
| CAND-0334 | `app/voice/executorchAdapter.ts` | 228 |  | ● |  | PROVEN | // ExpoFileSystemResourceFetcherAdapter — minimal ResourceFetcherAdapter |
| CAND-0335 | `app/voice/kokoroWeb.ts` | 12 |  |  |  | PROVEN | // kokoroWeb (native stub) — the real implementation is kokoroWeb.web.ts, which |
| CAND-0336 | `app/voice/kokoroWeb.web.ts` | 118 |  |  |  | PROVEN | // kokoroWeb (web/desktop) — Kokoro TTS via ONNX, using the `kokoro-js` library |
| CAND-0337 | `app/voice/loreLexicon.ts` | 418 |  |  |  | PROVEN | // loreLexicon — respelling overrides for Tartaria-specific words so |
| CAND-0338 | `app/voice/sentenceSplitter.ts` | 20 |  |  |  | PROVEN | // Tiny pure helper used by TTSController to split streaming Qwen |
| CAND-0339 | `app/voice/speakerVoices.ts` | 92 |  |  |  | PROVEN | // speakerVoices — map a detected speaker name to a TTS voice id. |
| CAND-0340 | `app/voice/streamBundler.ts` | 97 |  |  | ● | PROVEN | // streamBundler — pure incremental sentence-bundler for streaming Qwen |
| CAND-0341 | `app/voice/voiceSettings.ts` | 157 |  |  | ● | PROVEN | // Voice settings — persisted via AsyncStorage so TTS / STT preferences |

## zustand store slice (state mutation door)  (9 candidates)

| ID | Module | Lines | RNG | Clock | Persist | Conf. | Purpose (header, verbatim, truncated) |
|---|---|---:|:---:|:---:|:---:|---|---|
| CAND-0305 | `app/state/slices/aiLifecycleSlice.ts` | 272 |  | ● |  | PROVEN | /** |
| CAND-0306 | `app/state/slices/boardSlice.ts` | 344 |  | ● |  | PROVEN | /** |
| CAND-0307 | `app/state/slices/bootSlice.ts` | 1183 |  | ● | ● | PROVEN | /** |
| CAND-0308 | `app/state/slices/craftingSlice.ts` | 328 | ● | ● |  | PROVEN | /** |
| CAND-0309 | `app/state/slices/inventorySlice.ts` | 1768 | ● | ● |  | PROVEN | /** |
| CAND-0310 | `app/state/slices/persistSlice.ts` | 382 |  | ● | ● | PROVEN | /** |
| CAND-0311 | `app/state/slices/questSlice.ts` | 3706 | ● | ● |  | PROVEN | /** |
| CAND-0312 | `app/state/slices/slotSlice.ts` | 978 | ● | ● | ● | PROVEN | /** |
| CAND-0313 | `app/state/slices/vendorSlice.ts` | 1201 |  |  |  | PROVEN | /** |

## OTA / APK update-application subsystem  (3 candidates)

| ID | Module | Lines | RNG | Clock | Persist | Conf. | Purpose (header, verbatim, truncated) |
|---|---|---:|:---:|:---:|:---:|---|---|
| CAND-0324 | `app/updates/apkInstaller.ts` | 148 |  |  |  | PROVEN | // In-app .apk download + install flow. Bypasses the browser entirely |
| CAND-0325 | `app/updates/apkRelease.ts` | 226 |  | ● | ● | PROVEN | // APK release pointer. |
| CAND-0326 | `app/updates/checkAndApplyOTA.ts` | 451 |  | ● | ● | PROVEN | // checkAndApplyOTA — shared OTA check + fetch + reload sequence. |

## build/product configuration  (1 candidates)

| ID | Module | Lines | RNG | Clock | Persist | Conf. | Purpose (header, verbatim, truncated) |
|---|---|---:|:---:|:---:|:---:|---|---|
| CAND-0021 | `app/config/features.ts` | 102 |  |  |  | PROVEN | // ⚠⚠ OTA-1382 — THE PRODUCT FLAGS. Step 3 of collapsing the four lines. |
