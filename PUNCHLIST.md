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
