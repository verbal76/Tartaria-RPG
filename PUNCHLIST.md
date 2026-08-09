# Tartaria Realms — Completability Punch List

**The bar, in the owner's words (2026-08-09):**

> *"A few things that are game breaking count it as non functional. Qwen not allowing the
> Arbiter to ad-hoc lines is flavor compared to the mechanics of being able to finish
> quests missions hunts all of that collectibles… when I say fully functional I mean every
> mechanical aspect of the game has to be able to be finished."*
>
> *"When you find a loop that ends in nothing, you need to mark it as a part of our punch
> list. I want everything completable before we expand on that base."*

**So this file tracks exactly two failure kinds, and nothing else:**

| Kind | Meaning |
|---|---|
| **UNFINISHABLE** | The loop cannot be completed at all — no turn-in, a broken gate, an unreachable state. |
| **ENDS IN NOTHING** | The loop completes, but completion produces no reward, no unlock, and no acknowledgement the player will see. |

⚠ **PAYOFFS ARE NOT DECIDED HERE.** Owner directive: catalogue, do not invent. Each entry
records *what is missing*, never *what it should be replaced with*. Deciding what a
completed set is worth is the owner's call.

⚠ **NOTHING GOES ON THIS LIST FROM A GREP.** Every entry names the file and line that
proves it, and says what was checked to rule out a consumer elsewhere. A punch list that
accumulates guesses is a punch list nobody trusts by item twenty.

---

## OPEN

### P1 — Collectible story sets complete into a banner and nothing else

- **Kind:** ENDS IN NOTHING
- **Scale:** **10 stories, 57 fragments** (`app/data/collectables/character_stories.json`)
- **Found:** 2026-08-09, in response to the owner asking *"what happens when you finish a
  collectible? I don't even know."*

**What happens now.** `grantCollectableFragment` (`app/state/gameStore.ts:8116`) adds the
fragment, writes a `reward` log line, and raises a one-time overlay on the player's very
first collectible ever. `computeAllProgress` (`app/engine/collectables.ts:132`) computes
`complete: missing.length === 0`.

**What consumes that `complete` flag — the entire list:**
- `app/screens/ContractsScreen.tsx:1932` — swaps a pill style.
- `app/screens/ContractsScreen.tsx:1964` — renders `✦ Story complete — every fragment recovered.`

**That is all of it.** No item, no TC, no standing, no title, no log line, no notification.
The player is not told at the moment it happens — they must navigate to
Contracts → Collectibles and notice a banner. ⚠ Verified by searching every reference to
`computeAllProgress` and every occurrence of a story/fragment completion reward across
`app/**` — one consumer, one banner.

**Why it matters against the bar:** 57 fragments is the largest gather loop in the game and
it is the one the owner could not describe the ending of, which is itself the symptom.

### P2 — 17 mysteries and storylines can only be turned in to a 1-in-30 random vendor

- **Kind:** UNFINISHABLE *(in practice — completable only by grinding random spawns)*
- **Scale:** **9 of 18 mysteries, 8 of 14 storylines**, across **6 of the 9 factions**
- **Found:** 2026-08-09 reachability pass

**The chain, each link verified:**

1. Mystery and storyline turn-in gates on the vendor's faction and **nothing else**
   (`gameStore.ts:26313`, `26546+`): `if (candidate.factionId !== scene?.vendor?.faction)`
   → *"Wrong agent."* ⚠ Unlike `turnInFactionQuest` (`gameStore.ts:25362`), which also
   accepts `scene?.missionBoard?.faction`, these two have **no mission-board fallback**.
2. The mission board only ever posts the **player's own** faction, and only in
   `outpost_central` (`gameStore.ts:10377`).
3. **Every outpost in the game shares one room layout** (`data/world/static_hub.json`), so
   every outpost anchors the same three faction vendors and no others:
   Irma Ironhand (`true_tartarians`), Tarek the Tinkerer (`reclaimers_guild`),
   Jorah the Scholar (`forgotten_order`). Halem the Trader is factionless.
4. Any other faction's vendor can only arrive via `pickRandomVendor()`
   (`app/engine/vendors.ts:152`), which is a **uniform pick over all 30 vendors**.
5. Each of the six unanchored factions has **exactly one** vendor in `vendors.json`.

**Net effect:** to finish a Stone Builders mystery you must roll Foreman Drest Holloway
specifically — 1 in 30 per vendor encounter. Same for Mud Monarchs, Servants of Giants,
Eternal Dynasty, Conspiracy Architects and Tartarian Revivalists.

| Faction | Mysteries | Storylines |
|---|---|---|
| mud_monarchs | 2 | 2 |
| servants_of_giants | 2 | 1 |
| stone_builders | 2 | 1 |
| eternal_dynasty | 1 | 2 |
| conspiracy_architects | 1 | 1 |
| tartarian_revivalists | 1 | 1 |

⚠⚠ **AND THE DESIGN INTENT IS DOCUMENTED, IN THE DATA, AS THE OPPOSITE OF WHAT SHIPS.**
`data/world/hub_faction_variants.json` describes the hub anchors in its own header:

> *"Same room ids, same exits, same anchorNpcs (**faction-neutral characters who serve all
> comers**); only `name`, `shortName`, and `description` vary per faction."*

The variants are cosmetic — names and descriptions only, confirming point 3 above. But
three of the four anchors are **not** faction-neutral in the data: Irma carries
`true_tartarians`, Tarek `reclaimers_guild`, Jorah `forgotten_order`. Only Halem is
factionless. ⚠ And the gate is `if (candidate.factionId && candidate.factionId !==
scene?.vendor?.faction)`, so a **genuinely** neutral vendor (faction `null`) accepts
*nothing* with a factionId. Whatever "serve all comers" was meant to mean, the quest
turn-in path does not honour it either way.

⚠ **These are not the player's own faction's quests only** — a Stone Builders *character*
hits this on their own Stone Builders mysteries, because the mission board does not accept
mysteries at all.

---

### P3 — The remote hand-in was designed as the escape hatch for exactly this, and is dead code

- **Kind:** UNFINISHABLE *(contributing cause of P2)*
- **Found:** 2026-08-09, while verifying P2

`turnInHunt` explains the intended design in its own comment (`gameStore.ts:25944`):

> *"the remote 'send word' courier option is removed for hunts. (Mysteries / storylines /
> faction deeds keep their remote cut; a bounty specifically is paid at the …)"*

**So remote turn-in was meant to work for mysteries and storylines. It does not.**

- `turnInMystery(titleOrId, _remote = false)` — `gameStore.ts:26279`
- `turnInStoryline(titleOrId, _remote = false)` — `gameStore.ts:26546`

⚠ The parameter is **underscore-prefixed in both**, i.e. accepted and never read. The
faction-vendor gate runs unconditionally.

⚠ **And no caller passes `true` anywhere in the app** — verified across `app/**`. Every
call site (`gameStore.ts:20426–20432`, `26759–26773`, `36835`) uses the default. So the
remote path is dead in `turnInFactionQuest` and `turnInHunt` too, where it *is* implemented.

**Why this is filed separately from P2:** P2 is the reachability symptom; this is a
mechanism that already exists, is documented as existing, and is switched off. What it
should cost the player (a courier fee, a delay, a rep penalty) is a design decision and is
**not** proposed here.

---

## CLEARED — checked, and these do pay out

Recorded so the audit is not re-run on them, and so a future regression has a baseline.

| Loop | Turn-in | Pays | Evidence |
|---|---|---|---|
| Faction quests | `turnInFactionQuest` | item + TC + standing | `gameStore.ts` — `completedFactionQuestIds`, reward grant in body |
| Hunts | `turnInHunt` | trophy + `rewardItem` + TC | `gameStore.ts:~26xxx`, `lookupCraftedItem(candidate.rewardItem)` |
| Mysteries | `turnInMystery` | trophy + `rewardItem` | `gameStore.ts:26328` |
| Storylines | `turnInStoryline` | `rewardItem` + `rewardTc` + journey bonus | `gameStore.ts:26590–26603` |
| Faction sigils | `turnInSigil` | +1 standing, sigil spent | `gameStore.ts:29961` |
| Great climbs | summit | `rewardArmor` (Skyreacher set), guaranteed | `app/engine/greatClimbs.ts:40–93` |
| Main quest | `chooseEndingMainQuest` | ending splash + install-wide badge | `gameStore.ts:32323`; badge grid `TitleScreen.tsx:1941` |
| Ending screen | — | exits to title (two routes, plus a no-ending fallback) | `EndingScreen.tsx:100,108,216` |

---

## LOOP INVENTORY

Built 2026-08-09 from the engine and data trees, in answer to *"we have the tower loop, the
9 cores loop, hunts, bounties, missions, collectables, titles. what other loops"*.

⚠ **Confidence is marked per row and is not uniform.** "Verified" means I read the
completion path. "Present" means the system exists and carries completion state, but the
arc has not been traced end to end — it is a candidate for the audit, not a claim about it.

### Named by the owner

| Loop | Scale | Status |
|---|---|---|
| Tower / Great Climbs | 5 Skyreacher pieces | **Verified** — summit grants `rewardArmor` |
| The 9 Cores → endings | 9 capitals, 3 endings, 27 badge combos | **Verified** — ending splash + install-wide badge |
| Hunts | `data/quests/hunts.json` | **Verified** — pays trophy + item + TC |
| Bounties | `bountyCourse` / `bountyPolitics` / `factionBounty` | **Not audited** |
| Missions (faction quests) | 65 | **Verified** — pays; mission-board turn-in works |
| Collectables | 10 stories / 57 fragments | **P1 — ends in nothing** |
| Titles | ~21 titles + `titleChallenges` | **Present** — heavy completion logic, not yet traced |

### NOT named — these are also loops

| Loop | Where | Status |
|---|---|---|
| **Mysteries** | 18, `data/quests/mysteries.json` | **P2** — 9 stranded |
| **Faction storylines** | 14, `data/quests/faction-storylines.json` | **P2** — 8 stranded |
| **Whispers** | `whispers.ts`, `completedWhisperIds` | **Present** — chain quests with stages |
| **Labyrinth of Shadows** | `labyrinth.ts`, `data/maze/` | **Present** — a grid maze with a `titleId` reward |
| **Buried Skyscraper** | `buriedSkyscraper.ts` | **Present** — descent arc |
| **Recipe discovery** | `recipeDiscovery.ts` | **Present** — unlockable recipe pool |
| **Sigils** | `sigils.ts` | **Verified** — `turnInSigil` pays +1 standing |
| **The Fallen / revenants** | `fallenRevenants.ts`, install-wide roll (cap 25) | **Present** — avenge a dead character |
| **Faction standing** | `factions.ts`, −100…+100 per faction × 9 | **Present** — no terminal state by design |
| **Dog rescue → companion** | `dogCompanion.ts`, `dog_quest` channel | **Not audited** |
| **Golem companion** | `golems.ts` | **Not audited** |
| **Escorts** | `escort.ts` | **Not audited** |
| **Story forks / chapters** | `storyForks.ts`, `chapters.ts`, `story/forks.json` | **Not audited** |
| **Crafting / fusion** | `crafting.ts`, `itemFusion.ts` | **Not audited** |
| **Relics & curios** | `data/relics/` | **Not audited** |
| **Runecasters / spells** | `data/spells/runecasters.json` | **Not audited** |
| **Corruption** | `corruption.ts` | **Not audited** |
| **Aetherkin** | `aetherkin.ts` | **Not audited** |
| **Stat training** | `statTraining.ts`, `statProgress` | **Present** — per-stat 0→100 bars |
| **Hidden locations** | `hiddenLocations.ts` | **Not audited** |
| **Hook puzzles** | `hookPuzzles.ts` | **Not audited** |
| **Location challenges** | `locationChallenges.ts` | **Not audited** |
| **Gifting / gift ledger** | `gifting.ts`, `giftLedger.ts` | **Not audited** |
| **Resurrection gems** | install-wide stash | **Present** — spend-only, no completion |

⚠ **Ongoing systems, NOT loops** — listed so they are not mistaken for gaps: menace,
weather, hazards, time of day, world pulse, NPC memory, parley/talk-down, vendor pricing
and services, scrap, durability, status effects, digging, perches.

## REACHABILITY — checked and clean

Run 2026-08-09. Recorded because a clean reachability result is worth as much as a finding:
it is the difference between "no problem" and "not looked at".

| Check | Result |
|---|---|
| All 57 collectible fragments' `biomeTags` intersect a real location's `tags` | **0 unreachable** |
| Quest `rewardItem` names resolve in the item catalogs (866 names) | **0 missing** — mysteries 17/17, storylines 14/14 |
| Quest `factionId`s resolve against `factions.json` | **0 unknown** — all 9 used |
| `minRep` gates vs the standing cap (`REP_MAX = 100`) | max gate is **10** — ample headroom |
| Every quest-giving faction has at least one vendor | **9/9** |

⚠ **One false alarm, recorded so it is not "re-found".** 17 of 18 mystery `trophyName`s are
absent from the item catalogs — which looks alarming, and is fine: trophies are minted
inline with explicit `kind: 'relic'`, `rarity: 'Rare'`, tags and description
(`gameStore.ts:26319`), never through `lookupCraftedItem`. ⚠ Worth knowing anyway:
`lookupCraftedItem` **never returns null** — it falls back to a tagless Common `misc`
(`crafting.ts:230`). So a *genuinely* missing reward name would not error; it would silently
hand the player junk with the right name. Nothing currently hits that, and the catalog check
above is what keeps it that way.

## NOT YET AUDITED

⚠ Listed so the gaps in the audit are as visible as its findings. **Absence from the OPEN
section above means NOT CHECKED, not "fine".**

- Faction bounties (`bountyCourse.ts`, `bountyPolitics.ts`, `factionBounty.ts`)
- Dog rescue arc (`dog_quest` channel, `dogCompanion.ts`)
- Golem companion arc
- Escort missions (`escort.ts`) — completion and failure both
- Chapters / story forks (`chapters.ts`, `data/story/forks.json`)
- Aetherkin (`aetherkin.ts`)
- Crafting / Aethercraft trees (`crafting.ts`)
- Relics (`data/relics`)
- Maze, Buried Skyscraper (`buriedSkyscraper.ts`)
- Core Guardians (`coreGuardians.ts`) — spawn is reachable via the Contracts card (OTA-148);
  the completion payoff is not yet traced
- Titles (`earnedTitles`, `titleProgress`)
- Whispers (`completedWhisperIds`)
- Corruption arc (`corruption.ts`)
- Mysteries beyond the turn-in (the *finding* half of the loop)
