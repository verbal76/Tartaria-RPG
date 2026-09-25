# Guardian Critical-Path Audit — Content Exclusion Map (Pass 1, §10)

Purpose, stated exactly as the audit specifies: prevent a later pass from concluding a system is dormant
or unused simply because a straight Guardian-to-Guardian run would deliberately skip its content. **Nothing
in this document is a claim that a system is useless.** Every system named below is a real, evidenced
candidate in `system-candidates.md`; this file only tags which ones a Guardian-only run would NOT exercise.

Evidence base: `test-utils/playerWalker.ts`'s own `walkOrder()` enumeration (missions -> faction quests ->
whispers, read in full), `system-candidates.json`'s `purpose_class` field, and the module names/headers
surfaced during the engine/state inventory sweep. This pass did not open every optional-content file in
full — most entries below are evidenced at the header/export level (see `system-candidates.md` for the
per-file citation), consistent with this pass's declared mixed-depth methodology.

## Side-quest / optional-mission families (candidate systems, by evidenced module)

| Family | Representative module(s) | Evidence | Would a Guardian-only run touch it? |
|---|---|---|---|
| Hunts | `app/engine/hunts.ts` | imported by `playerWalker.ts:44` and present in `walkOrder()`'s scenario families | NOT REQUIRED per §7's prerequisite chain (see `core-guardian-map.md` §3) — optional |
| Mysteries | `app/engine/mysteries.ts` | imported by `playerWalker.ts:45`; distinct completedMysteryIds field on PlayerCharacter | NOT REQUIRED — optional |
| Faction storylines | `app/engine/factionStorylines.ts` | imported by `playerWalker.ts:46` | NOT REQUIRED — optional (separate from the FACTION_CORE_GATES intents that DO gate Core recovery, see below) |
| Faction quests | `app/engine/factionQuests.ts` | imported by `playerWalker.ts:48`; `activeFactionQuestIds`/`completedFactionQuestIds` on PlayerCharacter | PARTIALLY RELEVANT — `FACTION_CORE_GATES` (mainQuest.ts) requires specific faction *intents* to be satisfied per faction, which may overlap with faction-quest content; this pass did not resolve whether the required intents are satisfiable WITHOUT playing named faction quests (see UNK-004) |
| Contract board / bounties | `app/state/slices/boardSlice.ts` (`BOUNTY_PRIMER_HINT_ID`), `activeBounty`/`activeBounties` on PlayerCharacter | slice header + PlayerCharacter field | NOT REQUIRED — optional |
| Whispers | `app/engine/whispers.ts` | imported by `playerWalker.ts:56`; `activeWhispers`/`completedWhisperIds` fields; `playWhisperChain` in playerWalker.ts | NOT REQUIRED — optional |
| Towers / Endless Stair trap-dive | `app/state/trapDive.ts` | "moved out of the store" OTA-1844/1845 comment, cataloged in `state-mutation-ledger.md` | NOT traced against the prerequisite chain this pass — flagged below as an open item |
| Labyrinth | `labyrinthRun?`, `labyrinthHeartSeen?` fields on PlayerCharacter | `character-state-inventory.md` Progression group | NOT traced against the prerequisite chain this pass — flagged below |
| Collectables / lore fragments | `app/engine/collectables.ts`, `loreConceptsRead` field | `character-state-inventory.md` Discovery/lore group | NOT REQUIRED — optional, pure discovery content |
| Crafting / recipes | `app/state/slices/craftingSlice.ts`, `knownRecipes`/`knownTechniques` fields | slice header | NOT REQUIRED for progression per evidence read — optional power/economy layer |
| Vendor/market | `app/state/slices/vendorSlice.ts` | slice header | Likely touched incidentally (gear acquisition) but not a Guardian-progression gate per evidence read |

## What this pass could NOT fully resolve

For **towers/trap-dive** and **labyrinth** specifically, this pass did not verify whether they are ever
referenced as a prerequisite anywhere in `FACTION_CORE_GATES` or `advanceMainQuest` (only the first ~150
lines and lines 920-1070 of `mainQuest.ts`'s 1000+ line body were read — see `unknowns.md` UNK-004 and
UNK-012). Their presence in this exclusion map is therefore evidenced as "existing optional-shaped
content" (by field/module naming and isolation from the walker's core scenario families) but NOT proven
absent from the Guardian prerequisite chain. This gap is intentional rather than an oversight — resolving
it fully requires the `mainQuest.ts` full-body read this pass explicitly deferred.

## Explicit non-claim

None of the systems tagged above are declared dormant, dead, or low-value by this document. Several (crafting,
vendor, faction quests) plausibly feed gear/power that makes Guardian fights easier even if not formally
required — this pass does not attempt to settle that either way, consistent with hard rule 6 ("DO NOT
DECLARE SYSTEMS USELESS") and rule 8 ("DO NOT INVENT MISSING GUARDIAN INFORMATION").
