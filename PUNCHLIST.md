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

### P2-ANALYSIS — blast radius of "a faction site holds that faction's people"

Owner, 2026-08-09: *"if we go that the faction hub only has that factions people, how many
other things in the game will that break? there seems to be a lot of things tied to
vendors locations, mission turn ins, boards and starting points… this seems from my memory
to be a significant shift in coding and multiple systems wirings."*

**Measured, not estimated:**

| Surface | Reads | Where |
|---|---|---|
| `scene.vendor` | 136 | broad |
| `vendor.faction` | **55** | 47 store, 4 VendorScreen, 2 vendors.ts, 2 VendorContractsModal |
| `missionBoard` | 23 | store |
| `hubRoomFor` | 9 | store, InputBox |

**⚠⚠ THE BIGGEST FINDING DE-RISKS IT: THE OWNERSHIP MAP ALREADY EXISTS.**
`character.ts:307` — `FACTION_STARTING_LOCATION` maps **all nine factions to their own
site**, and it is exactly the list the location tags produce:

```
reclaimers_guild → reclaimer_stake        forgotten_order → varakush
mud_monarchs → monarch_waystation         true_tartarians → pilgrim_waycamp
eternal_dynasty → dynasty_border_post     conspiracy_architects → architect_blind
servants_of_giants → giant_watch_shrine   stone_builders → builders_survey_camp
tartarian_revivalists → revivalist_field_camp
```

**Nothing needs inventing.** "Which faction owns this place" is already answered in code
and already drives where a new character spawns. The change is to *use* that mapping for
vendor anchoring too.

**⚠ IT IS BIGGER THAN "PLACEMENT", THOUGH — `vendor.faction` GATES THE OFFER SIDE TOO.**
`gameStore.ts:11571 / 11596 / 11621 / 11646` filter quests, mysteries, storylines and
hunts by `def.factionId === vendor.faction`. So a faction's vendor both **gives** and
**takes** that faction's work. Changing anchors changes where you *get* work, not only
where you hand it in. That is the intended effect — it is also a larger behavioural change
than the word "placement" suggests, and it is why this is filed as analysis rather than a
one-line fix.

**⚠⚠ AND THERE IS ONE GENUINE TRAP, WHICH IS THE REASON P3 MUST LAND FIRST OR ALONGSIDE:**

At −20 standing a faction turns hostile. If the Conspiracy Architects' only turn-in becomes
the Architect Blind, then **a player hostile to them holds an unfinishable quest again** —
the same defect in a new costume, and arguably worse, because today's random vendor at
least does not care where the player is standing. **The remote hand-in (P3) is the fallback
that makes faction-site anchoring safe.** Shipping the anchoring without it trades one
unfinishable state for another.

**What is NOT at risk:**
- **Starting points.** Every faction already spawns at its own site, so a new character
  meets their own faction's agent immediately — this *improves* the on-ramp.
- **Your own faction's work.** The mission board posts the player's own faction in
  `outpost_central` regardless of where they are; that safety net stays.
- **The other 130-odd `scene.vendor` reads.** They read name/offers/prices/dialogue, not
  faction identity, and are unaffected by which vendor is anchored.

**Honest scale:** not a rewrite, not a patch. A contained change across ~4 surfaces
(anchor selection, the 9 `hubRoomFor` sites if sites keep their own identity, offer
filtering, turn-in) with **one trap that must be closed first**.

**✅ THE RESKIN QUESTION IS ANSWERED — it is deliberate.** `git log` on
`hub_faction_variants.json` (commit `33092eca`, 2026-05-23): *"take a pass at per faction
room names and per faction flavored room descriptions."* 80 variants, 8 factions × 10
rooms, and the commit states the base room's exits, anchorNpc, interactables and tags stay
shared **on purpose** so the navigation graph is identical for everyone.

⚠ **So it is not an omission — it is a DIFFERENT FEATURE that never met this one.** The
reskin exists so **your own** outpost wears your colours. It was never about territory.
Two things were then conflated: "the player's home base" and "a faction's site in the
world" are treated as the same object, and today every outpost is rendered as the first
even when it is the second.

---

## THE RECOMMENDATION (2026-08-09)

**Sequence matters more than the individual pieces.**

**STEP 1 — P3 first: turn on the remote hand-in.** Small, already written, already
documented as working. It removes the unfinishable state for all 17 quest lines
immediately, and — critically — **it is the safety net that makes Step 2 safe.**

⚠ **UPDATED 2026-08-09 by the P3 full audit (below).** The cost is no longer an open
question — the audit proposes it concretely (25% TC cut, full rep, no long-haul bonus,
12 in-game hours to credit) and shows that the anti-farming rationale this was switched
off for **was never the actual rationale**, and does not apply to this content. The audit
also adds a piece Step 1 needs: **P3-C**, the board/hall turn-in fallback, without which
hunts/mysteries/storylines still cannot be handed in at the board that posted them.

**STEP 2 — faction-site anchoring, using `FACTION_STARTING_LOCATION` as the ownership map.**
- At **your own** faction's site: nothing changes. Your reskin, your board, your agents.
- At **another** faction's site: their agent, their work, their prices, their standing gates.
- The reskin rule becomes *"skin to the SITE's faction"* rather than *"skin to the
  player's"* — and your own site still skins to you, because it **is** yours. That is one
  argument at 9 call sites, not a rendering rewrite.

**STEP 3 — the hostility consequence stops being a trap and becomes a mechanic.** With
Step 1 in place, being hostile to the Architects means you cannot walk into the Blind, so
you pay the courier premium instead. That is a decision with a cost, which is a game.
**Without Step 1 it is a dead end**, which is why the order is not negotiable.

⚠ **Do NOT ship Step 2 before Step 1.** It would trade one unfinishable state for another.

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
mechanism that already exists, is documented as existing, and is switched off.

---

## P3 — FULL AUDIT (2026-08-09)

Owner: *"remote hand in was turned off to ensure that players had to work to turn in, find
the discussion it was an attempt to counter mission farming. much has changed since then.
is it still a concern. full audit before you answer and have a recomendation."*

### 1. What the original discussion actually said

Recovered from the commits themselves, not from memory.

**`abbc4461` — OTA-456, 2026-06-10, remote hand-in ADDED.** Hybrid by quest type: FETCH
must be delivered in person ("you can't mail the goods"); DEED quests could "send word" for
full rep and a **15% TC cut**. The commit's own stated intent: *"Face-to-face still pays in
full, so travel stays the optimal play."*

**`c0fdb933` — OTA-810, 2026-07-15, hunts made face-to-face.** Two separate things in one
commit, and they are not the same kind of thing:
- Flavour: *"A bounty's proof is the trophy, and proof is shown in person."*
- **A real exploit:** *"completeContractFromUI('hunt') — the Contracts-UI COMPLETE that
  used to pay FULL from any tile (the actual B2 exploit)."*

**`dc2aedb9` — OTA-824, 2026-07-15, remote hand-in KILLED for everything.** The owner's
own words are in the commit body:

> *"Player: kill all remote hand-ins, make all routable, but make the journey worth the
> loot — no 32-time trip worth 20 TC."*

⚠ **That is not an anti-farming call.** It is a *make-travel-pay* call. The words "farm",
"farming", "grind" and "repeat" appear nowhere in OTA-456, OTA-810, OTA-824 or OTA-900.

**What was actually being closed was an exploit, not a farm:** `completeContractFromUI`
paid **full reward from any tile with no counterparty check at all**. That is not "remote
hand-in", that is "hand-in with nobody on the other side of the table". Killing the
15%-cut courier alongside it was a much bigger hammer than that nail needed.

### 2. Is farming still a concern? No — and it never could have been on this content

**All four contract types are one-shot, off finite static catalogs.**

| Type | Count | Repeat gate |
|---|---|---|
| Hunts | 18 | `completedHuntIds` |
| Mysteries | 18 | `completedMysteryIds` |
| Storylines | 14 | `completedStorylineIds` |
| Faction quests | 65 (18 fetch) | `completedFactionQuestIds` |

**115 contracts, each closable exactly once.** `availableFactionQuests` filters the board
by the completed list; the hook-grant path (`gameStore.ts:33417`) and the neutral-accept
path (`25733`) both refuse an already-done contract. **There is no repeatable contract in
this set to farm.**

### 3. ⚠ The one thing that CAN be farmed already pays out remotely — and always did

The **faction bounty** is the only procedurally generated, repeatable contract in the game.
Its payout fires **inside the kill handler** (`gameStore.ts:23705–23730`): TC and standing
are credited on the killing blow. **No vendor. No turn-in. No trip back.**

So the face-to-face rule was applied to the 115 one-shot contracts that cannot be farmed,
and **not** to the one contract type that can be.

### 4. The guards that actually contain bounty farming — all added AFTER OTA-824

| Guard | OTA | Date | What it stops |
|---|---|---|---|
| Anti-camp (`lastBountyClearedOutpostId`) | OTA-1188 | 2026-08 | *"no second contract from the board you just collected on"* |
| Standing-on-target refusal | OTA-1188 | 2026-08 | 0-tile contracts — accept and finish without moving |
| Board must be FROZEN to accept | OTA-1187 / OTA-1188 | 2026-08 | Politics-shopping the payout |
| `MAX_ACTIVE_BOUNTIES = 3` | OTA-850 / OTA-859 | 2026-07 | Unbounded slate stacking |
| Distance-aware deadline | OTA-862 / OTA-863 / OTA-1185 | 2026-07→08 | 24h + 2.5h/tile + 6h per required kill |

<!-- ⚠ Every OTA reference in this file carries its `OTA-` prefix on purpose. The
     golem renumberer only rewrites prefixed numbers, and in a slash list only the
     first element — a bare `1187/1188` in the table above ported to golem still
     reading HAL's numbers, which is how this note came to exist. -->

⚠ Four of the five sit at or above the renumber floor, so **the same commit carries a
different number on each line** — each line's copy of this table is already correct for
itself, and the two are not meant to match. The pre-floor references are shared history
from before the split and read the same on both.

<!-- ⚠ THAT PARAGRAPH DELIBERATELY CONTAINS NO EXAMPLE PAIR. It first read
     "on golem-line these read 23 lower (OTA-1188 → OTA-1165)" — and the renumberer
     rewrote BOTH sides on the way across, so golem's copy explained the offset using
     golem's own numbers on both ends and said nothing at all. Any sentence here that
     has to stay true on both lines must not name a number. -->


⚠ **Four of the five did not exist when remote hand-in was killed.** The farm risk is
contained today by rules aimed precisely at the loop that has it. The face-to-face rule is
a blunt instrument pointed at a different loop entirely.

### 5. ⚠⚠ The long-haul bonus does not measure the journey

The compensation the owner asked for — *"make the journey worth the loot"* — is
`contractJourneyBonusTc` (`contractMarkers.ts:138`):

```
remoteness = Manhattan distance of the TURN-IN TILE from `tartarian_outskirts`
bonus      = min(remoteness × 6 TC, 1.5 × base)
```

**It measures where you are standing when you hand in. It does not measure how far you
walked.** Three consequences, all live today:

1. A player who accepts, kills and hands in **entirely inside a deep capital** collects the
   **maximum** bonus having travelled nothing.
2. A player who treks from a deep capital **back to the starter hub** collects **zero**.
3. It permanently under-pays every contract belonging to the starter-region factions,
   regardless of how the player played it.

⚠ This is the owner's stated requirement, implemented backwards. It is a defect
independent of anything to do with remote hand-in.

### 6. The face-to-face gate is a presence gate, not a geography gate

All four handlers require a vendor **of the posting faction in scene**. But market stall
reps **rotate across factions daily in real time** (OTA-784, `vendors.ts:371`) — the
"right agent" is usually whoever happens to be rotated into the nearest market, not that
faction's home. So the rule mostly costs the player **searching**, not **travelling**.
That is P2 restated.

### 7. ⚠ A stranded-contract trap exists today

`turnInFactionQuest` accepts a same-faction **vendor OR mission board OR the faction's home
hall** (OTA-451/617). `turnInHunt`, `turnInMystery` and `turnInStoryline` require
`scene.vendor` **strictly**. **A player can stand at the board that posted a hunt, holding
the trophy, and be refused.** That is an ENDS IN NOTHING in its own right.

---

## THE RECOMMENDATION (P3)

Farming is not the concern it was framed as, and the face-to-face rule never addressed it.
But blanket-restoring remote hand-in is also wrong — it would delete the only travel the
contract loop has, and the owner's actual ask is still unmet. Three parts, in priority order.

**A. Fix the long-haul bonus to measure the journey. (Do this first — it is the owner's
original requirement and it is currently inverted.)**
Stamp the accept cell on the contract record (`acceptedAtCell`), and pay on
`distance(accept cell → turn-in cell)` instead of remoteness-from-hub. Same 6 TC/cell,
same 1.5× cap, so tuning is unchanged. Contained: one function in `contractMarkers.ts`
plus one field. **This is the actual bug** — the reward the owner asked for pays the wrong
players.

**B. Keep face-to-face for hunts and fetch quests. Restore the courier for mysteries,
storylines and non-fetch deeds — with a specific cost.**
A trophy and a physical delivery are objects that change hands; a report is not, and OTA-456
drew that line correctly. Proposed cost, concrete:

- **25% TC cut** (up from OTA-456's 15% — the bonus in (A) makes walking worth more now)
- **full rep** (the work was done)
- **no long-haul bonus** (you didn't make the haul)
- **12 in-game hours before it credits** — a runner takes time, and the delay is what makes
  it a fallback rather than a default

With (A) in place, walking pays `base + up to 1.5×base`; couriering pays `0.75×base`,
delayed. **Travel stays the optimal play by roughly 3:1** — which is exactly what OTA-456
said it was for.

**C. Give hunts, mysteries and storylines the board/hall fallback that faction quests
already have.** A posting board should take back what it posted. Closes §7 regardless of
what happens with A and B.

**If only one ships: A.** B is comfort; C is a trap fix; A is the requirement that is
already in the code and already wrong.

⚠ **A and C are defect fixes and need no design decision. B is a design change** — it
restores a mechanic the owner deliberately switched off, and the numbers above are a
proposal, not an assumption.

⚠ **A and C are FILED AS THEIR OWN ITEMS below (P7, P8).** Owner, 2026-08-09: *"make the
bounty issue as a new punch list item and get back to p2."* They came out of the P3 audit
but neither is about remote hand-in, and a defect buried in the prose of an audit about a
different question is a defect nobody works. **B stays inside P3, because B *is* P3.**

---

### P7 — The long-haul bonus pays for where you STAND, not for the trip you made

- **Kind:** WRONG PAYOUT *(a shipped requirement, implemented inverted)*
- **Found:** 2026-08-09, during the P3 audit
- **Needs no design decision** — this is the owner's own requirement, backwards

Owner's requirement, recorded verbatim in OTA-824's commit body: *"make the journey worth
the loot — no 32-time trip worth 20 TC."* What was built (`contractMarkers.ts:138`):

```
remoteness = Manhattan distance of the TURN-IN TILE from `tartarian_outskirts`
bonus      = min(remoteness × 6 TC, 1.5 × base)
```

⚠ **It never looks at where the player came from.** Three live consequences:

1. Accept, kill and hand in **without leaving a deep capital** → **maximum** bonus, zero travel.
2. Trek from a deep capital **back to the starter hub** → **zero** bonus.
3. Every contract belonging to a starter-region faction is permanently under-paid,
   regardless of how it was played.

**The fix, and it is contained:** stamp the player's cell on the contract record at accept
(`acceptedAtCell`), and pay on `distance(accept cell → turn-in cell)`. Same 6 TC/cell, same
1.5× cap, so nothing needs re-tuning. One function in `contractMarkers.ts`, one new field,
and the four turn-in handlers already call the function.

⚠ **Legacy saves:** a contract accepted before the field exists has no accept cell. Fall
back to today's remoteness read so an in-flight contract still pays something, rather than
silently paying zero on a trip the player already made.

---

### P8 — A finished bounty cannot be handed in at the board that posted it

- **Kind:** ENDS IN NOTHING *(a real stranding, reachable in ordinary play)*
- **Found:** 2026-08-09, during the P3 audit
- **Needs no design decision**

`turnInFactionQuest` accepts a same-faction **vendor OR mission board OR the faction's home
hall** (OTA-451, then OTA-617 added the building-level case). The other three handlers do
not:

| Handler | Accepts |
|---|---|
| `turnInFactionQuest` | vendor **or** mission board **or** home hall |
| `turnInHunt` | `scene.vendor` only |
| `turnInMystery` | `scene.vendor` only |
| `turnInStoryline` | `scene.vendor` only |

⚠ **So a player can stand at the board that posted a hunt, holding the trophy, and be told
to go find a vendor.** The board is the poster. It should take back what it put up.

⚠ **This compounds P2**, and is why it is filed rather than folded into it: P2 is about the
*faction* of the agent being a 1-in-30 roll. This is about there being **no agent at all**
at a site that has a board — two independent ways to reach the same dead end, and fixing
either one alone leaves the other.

**The fix:** give the three handlers the same source resolution `turnInFactionQuest`
already has, rather than writing a second one. One shared helper, four call sites.

---

### P6 — The Siren of Zharak's Teeth was chosen for a perk, and there is nothing to attach it to

- **Kind:** *(open design question — raised by OTA-1207, not a defect)*
- **Found:** 2026-08-09, while building the story perks

The owner picked six stories for buffs; five shipped. **The Siren of Zharak's Teeth did
not** — five verses scratched inside a Reclaimer's flask, the hand growing more careful as
they go on, the flask empty. The natural buff is resistance to whatever the Siren does.

⚠ **The game has no charm, compulsion or mental-influence mechanic.** Verified across
`statusEffects.ts` and `combatRules.ts` — nothing to resist. `mud_siren_lair` exists as a
location tag, so the fiction is there; the mechanic is not.

**Two ways to close it, and both are the owner's call:**
1. Build a charm/lure status (a siren pulls you toward it, costs a turn or a stat check),
   and the perk resists it. Makes the flask verses mean something mechanically.
2. Give the story a different perk that fits the fiction — it is also a drowning/coastal
   story, and the Reclaimer died with an empty flask.

⚠ **Filed rather than silently substituted.** Inventing a status effect to justify a buff
is backwards, and quietly swapping the perk would have hidden a decision the owner made.

---

### P4 — `data/spells/runecasters.json` is orphaned: 10 entries, zero importers

- **Kind:** UNFINISHABLE *(content that cannot be reached because nothing loads it)*
- **Found:** 2026-08-09 full loop audit

`app/data/spells/runecasters.json` holds **10 entries** and **no file in `app/**` imports
it** — verified by searching for the filename and for `spells/` across all `.ts`/`.tsx`.
A separate, larger `app/data/items/runecasters.json` (**49 entries**) is the one the
runecaster *weapon* class uses.

⚠ **What this is NOT:** a claim that the spell system is broken. Runecasters exist as a
class (`gameStore.ts:11137` gates them on INT ≥ 9) and their weapons resolve. The finding
is narrower and checkable: **this data file is dead weight, or it is a feature that was
authored and never connected.** Which of the two it is depends on what those 10 entries
were meant to be, and that is the owner's answer, not mine.

---

### P5 — The store says the location challenges are switched off. They are all on.

- **Kind:** *(neither — a stale claim that would mislead the next audit)*
- **Found:** 2026-08-09 full loop audit

`gameStore.ts:22789` reads:

> *"activeChallengesAt() returns [] while the challenges are switched OFF
> (locationChallenges.TIER_C_ENABLED / per-challenge enabled both false), **so this loop is
> inert today**."*

**It is not inert.** `locationChallenges.ts:47` has `TIER_C_ENABLED = true`, and **all six**
challenges carry `enabled: true` — `labyrinth_of_shadows`, `tongue_of_the_red_tower`,
`warden_of_the_cathedral`, `trap_dives_of_the_stair`, `defense_of_the_enclave`,
`parley_of_factions`. All six also have handler references outside the definition file, so
none is a live-but-dead entry.

⚠ **Filed because a false "this is off" comment is how a working system gets skipped in an
audit** — including this one. It cost a detour to disprove, and the next person pays the
same toll. No gameplay defect; the fix is deleting a sentence.

---

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

---

## CLOSED

### ✅ P1 — Collectible story sets (closed by OTA-1206, 2026-08-09)

**Was:** 10 stories / 57 fragments completing into a pill style and a banner on a screen
the player had to navigate to. No reward, no title, no notification.

**The payoff was specified by the owner**, not chosen here:

> *"they should end in story screen like the chapters screens that put the whole story
> together to read, and it should say whatever the collectable sets name is is complete.
> you should get a title for completing all of them, some types of historian title, and it
> should add an investigate all button like the take all and salvage all."*

**Shipped, all four:**

1. **`StoryRevealOverlay`** — the assembled story, read whole. Raised automatically when a
   set closes, and re-openable any time via **READ THE WHOLE STORY** on the Collectibles
   tab. ⚠ Does **not** dismiss on a stray tap (the chapter card does); ⚠ re-derives from
   the player's own collectables, so it can never render an unearned fragment.
2. **Names the set** — *"<Character>'s story is complete"*, through
   `announceMissionComplete`, in the feed the player is already reading.
3. **`historian_of_the_buried_world`** at all 10 stories (+2 Lore, +1 Investigation).
   ⚠ **22nd title, and the first not from the owner's canon docx** — flagged in its own
   data row; **the name is the owner's to change.**
4. **INVESTIGATE ALL** — mirrors SALVAGE ALL / TAKE ALL; sweeps only actionable chips.

**Tests:** `ota1206CollectionPayoff` (27). Four older assertions retargeted from hardcoded
counts to self-maintaining ones — they had turned every future title and every new
completion path into a red test.

⚠ **What is still NOT proven:** that a player can realistically gather 57 fragments at an
8% biome-gated substitution rate. The loop now *ends* somewhere; whether the grind to reach
that end is reasonable is a balance question, and balance is explicitly parked until
completability is clear.


## AUDIT LEDGER — all 31 loops, every one checked

Owner, 2026-08-09: *"I want every single one audited and I want a punch list of the things
that we need to approach and I want a list of every single one that you audited… we keep
listing that we have all these things for the players to do and then we find out that half
of them don't even work."*

**Depth key — this is the honest part, so read it first:**

| Depth | What it means |
|---|---|
| **TRACED** | I read the completion path and the payout. Highest confidence. |
| **WIRED** | Confirmed it has consumers, a completion write and a reward/acknowledgement. Not walked end to end. |
| **BROKEN** | On the punch list above, with evidence. |
| **SCAFFOLD** | Exists as code but is declared unfinished in its own source. Not a defect. |

⚠ **TRACED means "it pays out", not "it is reachable."** Mysteries sat in the traced-and-
paying column right up until the reachability pass proved 9 of them cannot be handed in. A
loop can be correct and unreachable at the same time. Reachability is the separate pass
below.

| # | Loop | Depth | Result |
|---|---|---|---|
| 1 | Tower / Great Climbs | TRACED | Summit grants `rewardArmor` (Skyreacher, 5 pieces) |
| 2 | The 9 Cores → endings | TRACED | Ending splash + install-wide badge (27 combos) |
| 3 | Hunts | TRACED | Trophy + `rewardItem` + TC |
| 4 | Missions (faction quests, 65) | TRACED | Item + TC + standing; mission-board turn-in works |
| 5 | Sigils | TRACED | +1 standing, sigil spent |
| 6 | **Bounties** | TRACED | TC + rep, politics frozen at accept, `announceMissionComplete`; **expiry is narrated, not silent** (`gameStore.ts:3208`) |
| 7 | **Escorts** | TRACED | Pays via faction-quest turn-in with `escortPayMult`; a dead party fails the contract and says so |
| 8 | Mysteries (18) | TRACED + **BROKEN** | Pays — but **P2**, 9 of 18 unreachable |
| 9 | Faction storylines (14) | TRACED + **BROKEN** | Pays — but **P2**, 8 of 14 unreachable |
| 10 | Collectables (10/57) | TRACED + **BROKEN** | **P1** — completes into a banner |
| 11 | **Whispers** | WIRED | Chains resolve, write `completedWhisperIds`, pay items/TC |
| 12 | **Labyrinth of Shadows** | WIRED | Clean run → `recordTitleProgress({labyrinthCleanRuns:1})` → Wayfarer title |
| 13 | **Location challenges (6)** | WIRED | All six live and handler-backed — see **P5** for the stale comment |
| 14 | **Titles (~21)** | WIRED | `newlyEarnedTitles` + `TITLE_PASSIVE_PERK`; a prior write-back bug is fixed in-source |
| 15 | **Recipe discovery** | WIRED | `pickRecipeToLearn` → `knownRecipes`, reward-logged |
| 16 | **Crafting / fusion** | WIRED | 5 consumers, craft + fuse paths |
| 17 | **Corruption** | WIRED | 172 store refs, 5 consumers — deeply integrated |
| 18 | **Aetherkin** | WIRED | 50 store refs |
| 19 | **Golem companion** | WIRED | Bind, repair, power-level (`✦ Power rises to…`) |
| 20 | **Dog rescue → companion** | WIRED | Rescue resolves, dog named and joins |
| 21 | **The Fallen / revenants** | WIRED | Install-wide roll (cap 25), avenge path |
| 22 | **Stat training** | WIRED | Per-stat 0→100 progress |
| 23 | **Story forks / chapters** | WIRED | 3 + 2 consumers incl. EndingScreen |
| 24 | **Hidden locations** | WIRED | 6 consumers incl. worldMap + codex |
| 25 | **Hook puzzles** | WIRED | Input/solve handlers in store |
| 26 | **Relics & curios** | WIRED | Loot tables + reward paths |
| 27 | **Gifting / gift ledger** | WIRED | Engine + ledger; a prior GIVE-flow bug is already fixed |
| 28 | **Faction standing (×9)** | WIRED | −100…+100; **no terminal state by design** |
| 29 | **Resurrection gems** | WIRED | Install-wide, spend-only; **no completion by design** |
| 30 | **Runecaster spells** | **BROKEN** | **P4** — the 10-entry data file has no importer |
| 31 | **Buried Skyscraper** | SCAFFOLD | Header says *"FRAMEWORK ONLY… no quest hooks land here yet"*; post-ending, gated on `phase === 'ended'`. **Not a defect — an unbuilt feature.** ⚠ If it appears on any player-facing or investor-facing feature list, that listing is ahead of the code. |

**Score: 31 audited. 7 traced clean · 2 traced-and-reachable-broken · 1 ends-in-nothing ·
1 orphaned data file · 1 stale claim · 18 wired · 1 declared scaffold.**

⚠ **The 18 "wired" rows are the remaining risk.** Each has a completion path and a payoff,
which is what the bar asks — but none has been walked end to end the way mysteries were,
and mysteries is precisely the loop that looked fine until it didn't. **I am not claiming
these are proven.**

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
