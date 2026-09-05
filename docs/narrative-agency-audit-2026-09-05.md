# Narrative Agency / World Reactivity — code audit (2026-09-05)

Item 6(b) of "fix all existing issues one through six". The owner's call was
**"audit first"**, then **"pilot, once workflow is proven then all"**. This is the
audit: a code-grounded inventory of every place the world already remembers
what the player did and changes because of it, the holes in that machinery, and
a pilot proposal. Nothing in the app changed for this document.

Two things the owner needs to know before the pilot is designed:

1. **The Gemini analysis is not in the working transcript.** Only summaries of
   it survived. The pilot design below is grounded in the code, not in that
   text; it needs to be re-pasted before the pilot is built so the design can
   answer it point by point.
2. **There is no "Dracover" anywhere in the repository** — not in `app/`,
   `docs/`, the data JSON, or the lore sources (case-insensitive search, zero
   hits). The capital in this build is **Asgardar** (`app/data/locations/
   locations.json`, `type: "buried_capital"`) plus five `lost_capital` tiles.
   If Dracover is a name from the Gemini document, the pilot needs a real
   location; Asgardar is the natural stand-in and is what the "capital
   reactivity today" section below measures.

## Persistence baseline

`worldMemory` and `player` are written to the slot on nearly every action
(`app/state/slices/persistSlice.ts`), so everything on `WorldMemory`
(`app/engine/types.ts` ~2067–2400) or `PlayerCharacter` is save-persisted
unless noted. `app/engine/saveTrim.ts` caps the big ledgers (memorableEvents
→ 40, chainMemos → 40, aetherkinRolledBuildings → 300, drops
`roomInvestigationTable` under pressure): old memory is deliberately
forgettable.

## Inventory — what the world remembers today

| # | System | Written by | Read by (visible change) | Scope |
|---|--------|-----------|--------------------------|-------|
| 1 | **Memorable events** — `recordMemorableEvent` (`gameStore.ts` ~3757), ~14 sites: theft caught, main-quest beats incl. `mq_guardian_fled`, capital first visit, boss/rare kills, corruption tier, faction join, death/revive | store | `pickTimelineCallback` (`app/engine/narrativeGenerator.ts` ~1315) turns the most recent event into an Arbiter line — the highest-fidelity continuity beat in the game; Chronicle screen (`app/engine/chronicle.ts`); per-capital flee counts on the 9-Capital tracker (`ContractsScreen.tsx` ~639) | persisted, cap 40 |
| 2 | **Menace** — `raiseMenace` (`gameStore.ts` ~35942), +8 person / +4 animal per intimidate attempt | store | lazy decay 0.4/hr; raises the player's own intimidate DC; +0..25% encounter chance (`gameStore.ts` ~9745); tier on the Character screen; Arbiter regard "you rule by fear" (`arbiterPersona.ts` ~160) | persisted on player |
| 3 | **Faction standing + spite cascade** — `applyRepChange` cascades allies (half) and rivals (inverse); `vendorCatchesThief` (`gameStore.ts` ~5631) docks host and native faction, writes a memorable event and `wrongs+1`; lifetime gain caps `meterSpiteGains` / `giftStandingGranted` | store | `logRepChanges` tier-crossing feed lines; contract availability (`MissionBoardModal.tsx`, `VendorContractsModal.tsx`); `standingPriceDiscount`; hostile ground below `HOSTILE_STANDING = −25` (`app/engine/pressure.ts` `hostileHuntChance`) | persisted |
| 4 | **Patrols / hostile ground / quarry** — `worldMemory.patrols` mustered by world events and `maybeSeedQuarry` (bounty target cell, 3 groups) | store | `maybePatrolAmbush` (`gameStore.ts` ~4821): within 2 cells, standing < 0 or bounty target, party size from `factionTides` and the pressure `pack` dial; a real fight with two feed lines. Since OTA-1678 the crossing is a marked world roll (`unscripted`) | persisted |
| 5 | **Faction tides / world pulse** — `nextWorldTide`, `pickWorldEvent` (`app/engine/worldPulse.ts`, `worldEvents.ts`) | store | vendor prices (`tideVendorPriceMult`), raid party size, patrol counts, world-event feed on `WorldScreen.tsx`, frozen politics board (`boardSlice.ts`). Ambient `repDelta` is forbidden by design | persisted |
| 6 | **Prices** — `app/engine/vendorPricing.ts` | — | base × corruption × (1 − CHA/rapport) × faction tide × local war heat × per-person regard × pressure tide. Every factor is something the player's history moved; `strangerBuyPrice` lets the feed say what standing saved | derived |
| 7 | **Per-NPC memory** — `app/engine/npcMemory.ts`: `recordNpcSighting`, `recordNpcDealing` (tcSpent, wrongs, gifts, amends), `rememberNpcMeeting`, transcripts, `talkedTopics` | store | `knowsPlayerName` (3 meetings), `npcGreeting` / `npcAbsenceLine` (72 h), `npcRegard` → `regardPriceMult` (±10% favour, +25% wronged), `gossipLine` every 4th visit, `raidNewsLine`, gift tastes, "I have told you that one" (`TalkSheet.tsx`); amends 600 TC per wrong | persisted (`npcRelations`, `npcTranscripts`) |
| 8 | **Room memory** — `VisitedRoom` (`types.ts` ~2544): visit count, `enemiesCleared`, searched nouns, dig count, dropped items, containers, gear roster, cleared-at hour | store, per verb | `returnLine(visitCount)`; respawn quiet window; repeat-investigate refusals (`arbiterEye.ts`, `ambientNounMatch.ts`); "worked out" digs; floor items persist; **cross-room echo** `findReferenceableInvestigation` plants a hook in a new room about a find in an old one | persisted |
| 9 | **Whisper chains** — `pendingChains` (expire by hour), `chainMemos` (cap 12), `activeWhispers[].talk[]` (OTA-1547 Yulka memory) | store | hook planting; memo dedupe; the Whisper talk sheet | persisted |
| 10 | **Enemy intel / bestiary** — `recordEnemyIntel` (`combatResolution.ts` ~2863), `recordEnemyDefeat` | combat | `EnemyPanel` reveals, codex "???" until defeated, HP milestones, Arbiter callbacks | persisted |
| 11 | **Death, the Fallen, revenants** — `recordFallen` / `recordFallenSeed` (`saveSystem.ts`, install-wide, survives character death) | death | `fallenRevenants.ts` spawns a Hollowed boss from a past character, kill returns their gear, `avengedBy` in the memorial | cross-save |
| 12 | **Story forks / drip / epilogues** — `player.storyChoices`, `dueFork` (`storyForks.ts`), `storyDrip.ts` | choice cards | Arbiter regard per answer, `epilogueChoiceLines` on `EndingScreen.tsx`, motive lines | persisted |
| 13 | **Arbiter persona** — `arbiterPersona.ts`: stance from cores, regard from wrongs / debts / gifts / corruption / menace / standing / lore / relics / forks / pressure tier | derived | tone of every Arbiter line; `mainQuest.ts` gates content on `regardOf(...) === 'kin'` | derived (only `arbiterBeatsSeen` stored) |
| 14 | **Anti-repeat banks** — `tagCounts`, `recentEncounterArchetypes`, `recentTakeableGearNames`, per-tile rolled sets, `recentTileHistory` (50), `gemBossDefeatedKeys`, `salvagedSigilKeys`, `travelOdometer` | store | encounter/quest bias away from the seen; one roll per tile; flee grace; +1 max stamina per odometer step | persisted |
| 15 | **Bounty / contract anti-camp** — `FactionBounty` freezes politics at accept; `lastBountyClearedOutpostId`; `missionFleeHoldCell` | store | refusals with a reason; the fled stage holds until the cell is left | persisted except the hold cell (session) |
| 16 | **Titles / one-shot ledgers** — `titlePerkModifiers` (`titles.ts`), `capitalArrivalSeen`, `dangerWarnedLocations`, `factionRepIntroShown`, and ~10 more latches | store | combat, AC, sell price, rep, flee; one-time arrival signatures and explainers | persisted |

## Capital reactivity today (Asgardar and the five lost capitals)

One-shot arrival signature per capital per character (`capitalArrivalSeen`,
`mainQuest.ts` ~330); `mq_capital_first_visit` memorable event; the 9-Capital
Core tracker with per-capital flee counts; SUMMON-chip gating on
`standingAtLocation` + `coreSettleState` (`coreGuardians.ts` ~1273); the Grand
Spire relocation notice. **Asgardar has no bespoke price, vendor, patrol or
narration reactivity** beyond the generic location machinery: capitals are
main-quest anchors, not politically reactive cities.

## Holes — writes with no reader, readers with no writer

1. **The on-device narrator sees none of this.** `LlmContext`
   (`app/engine/contextInjector.ts` ~29–53) carries biome, room, exits,
   entities, stats, inventory, recent history and `player_faction_id` only. Its
   own comment: *"Anything not represented here is invisible to the LLM —
   including the lore book, faction politics, and quest state."* Memorable
   events, NPC relations, menace, tides, standing and whisper state never reach
   the prompt; every reactive line in the game is a canned template. This is
   the single largest agency gap and the cheapest place to start.
2. `hubVisited` / `hubVisitedFor` — the documented fast-travel consumer does not
   exist; only ✓ marks read it.
3. `enemiesCleared` per room — read only for the respawn quiet window; no line
   ever names what the player cleared here.
4. `WorldEventEffect.repDelta` — a live handler with a catalogue asserted to be
   empty. Delete, or wire to an authored beat.
5. `worldRumors` is a fallback only; `worldEvents` superseded it. Two stores,
   one surface.
6. `chainMemos` — written, read only as a dedupe; the type comment promises the
   Arbiter can reference them, and nothing does.
7. `npcTranscripts` — stored durably, read only by the talk sheet; nothing ever
   quotes what was said.
8. **Menace never changes a greeting or a price.** A "Dreaded" player is priced
   and greeted like anyone else (`npcRegard` ignores menace).
9. The spite and gift standing caps are invisible; standing stops moving with no
   feed line saying why.
10. Most one-shot flags suppress repetition rather than add a consequence.

## Pilot proposal (needs the Gemini text and a location before it is built)

Pilot one place end to end, the way the owner asked ("pilot, once workflow is
proven then all"). Recommended location: **Asgardar**, because the arrival
signature, the guardian, the core tracker and the flee count already give it
more hooks than any outpost, and because it is where the main quest sends
everyone. If the Gemini document names a different place, use that.

The pilot is three readers on one ledger, none of which exist today:

- **A per-location deed ledger.** `worldMemory.deeds[locationId]`: a short list
  of typed, timestamped facts (guardian fled ×N, guardian killed, vendor
  robbed, patrol killed, core recovered, first arrival hour). Written from the
  sites that already record memorable events, so no new detection is needed.
- **Reader 1, arrival.** The arrival line and the Arbiter's callback read the
  ledger for *this* place before the generic pool: "The gate remembers the man
  who ran from it twice." Reuses `pickTimelineCallback`'s shape, keyed by
  location instead of recency.
- **Reader 2, people and prices.** The anchor vendor's greeting and
  `regardPriceMult` take the location ledger and menace into account (closes
  hole 8 for one place).
- **Reader 3, the narrator.** Add a `deeds_here` line to `LlmContext` for the
  current location only (closes hole 1 for one place, bounded to a few dozen
  tokens so the Qwen prompt budget is safe).

Ship it as one OTA with a suite that walks the ledger: flee the guardian
twice, return, and assert all three readers changed. If that reads well on the
device, the "then all" step is a table of locations and deed kinds, not new
machinery.
