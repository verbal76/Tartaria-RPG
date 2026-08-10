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

## STILL OPEN — the whole list, 2026-08-10

⚠ Seventeen items have been filed. **Fourteen are closed, two were reclassified as
not-defects, and two are open** (P9 and P16). The closed and reclassified entries are kept below
with their reasoning rather than deleted — a punch list you can only read forwards is a
punch list nobody can audit.

| # | Item | Kind | Where it stands |
|---|---|---|---|
| **P9** | Anchor the vendors to the site, not to the player | DESIGN | Untouched. The largest of the three P2 jobs; the other two shipped (OTA-1185/1209). **55 `vendor.faction` reads**, and that field decides which work a vendor OFFERS as well as who they are. |
| **P15** | *(loot half closed 2026-08-10, OTA-1199)* The ladder's loot half was never called | WIRING | ⚠⚠ **Re-measured 2026-08-10 (OTA-1197) and the original filing was WRONG** — `loot_tables.json` IS imported. The real defect: `pickLootFromLadder` has **no caller**, while its enemy twin `pickEncounterFromLadder` is called twice. 27 pools / 153 entries, all resolving, with no door. **Blocked on one owner decision** (see the entry). `relics.json` is SUPERSEDED — 7 of 13 already ship. |
| **P18** | *(closed 2026-08-10, OTA-1200)* Veil outside combat paid for nothing | ENDS IN NOTHING | ✅ **CLOSED — fix 1.** Refuses an empty room at zero cost. The fix's test also caught `channel veil of ether` failing to resolve (dropped-word class); token tier added. |
| **P17** | *(closed 2026-08-10, OTA-1198)* Scholar of Forgotten Lore was unearnable without the narration model | UNFINISHABLE | ✅ **CLOSED.** The offline answer path already existed since OTA-233 — it just never credited the player. Also closed the nonsense-ask farm the credit would have opened. |
| **P16** | Aether techniques | IN PROGRESS | 🟡 **Reachable as of OTA-1195** — buy, channel, four effects, tab. Open for the owner's stated next step (**mirror to enemies per spawn**) and the two acquisition routes not built (found texts, contract rewards). |

**The two former PARTIALs — RESOLVED by owner ruling (2026-08-10):**

> *"There is no completion — these aren't story loops, these are how you get your
> companions. The naming popup for each and the Arbiter's comment is the closing of that
> loop."*

| | Status |
|---|---|
| Dog rescue | ✅ **CLOSED AS DESIGNED.** The loop is ACQUISITION: rescue → the naming popup (`confirmDogOnboarding`) → the dog joins with the Arbiter's acknowledgement. Verified: `dogRescueIntegration` + `ota1027DogGolemPopups`. |
| Golem creation | ✅ **CLOSED AS DESIGNED.** Summon → `pendingGolemNaming` popup → *"You gave it life. You might as well give it a name."* Verified: `golemCompanion` + `ota1027DogGolemPopups`. 70 tests across the three suites, re-run green 2026-08-10. |

⚠ The audit called these "no completion event to trace" — which was true as an
observation and wrong as a diagnosis: it was looking for a STORY ending on loops whose
entire purpose is to hand you a companion. The companion, named, IS the payout.

✅ **THE 18 WIRED ROWS ARE NOW TRACED (2026-08-10, OTA-1196).** Every one was walked live:
started from a state a player could be in, finished through the public action the UI calls,
and asserted on a payoff the player can see. See **WIRED → TRACED** in the audit ledger
below for the per-loop evidence. ⚠ Five of my own assertions flagged healthy code and were
wrong; all five are written up there rather than quietly fixed.

---

## OPEN

### P2 — 17 mysteries and storylines can only be turned in to a 1-in-30 random vendor

- **Kind:** UNFINISHABLE *(in practice — completable only by grinding random spawns)*
- **Scale:** **9 of 18 mysteries, 8 of 14 storylines**, across **6 of the 9 factions**
- **Found:** 2026-08-09 reachability pass
- ## ✅ **CLOSED — OTA-1185.** The trading post brokers any faction's contract for 20%.
- ⚠ **The scale line above is WRONG in both directions** — corrected below, after the
  original text. It is left standing rather than edited so the mistake is legible.
- ⚠ **The world-feel half of this was NOT closed here** and is now **P9** (anchor the
  vendors to the site). Nothing is unfinishable while it stays open.

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

---

## ⚠⚠ P2 — CORRECTED 2026-08-09, AND IT WAS WRONG IN BOTH DIRECTIONS

**Everything above this line is the original entry, kept as written.** Building the fix
meant driving the real store instead of reading it, and two of the claims above did not
survive that. Both corrections are pinned by `ota1185BrokerLive`.

### Correction 1 — the claim about your OWN faction is FALSE

The line that stood here read: *"a Stone Builders character hits this on their own Stone
Builders mysteries."* **They do not.**

`beginScene` re-points the Irma anchor to the **host** faction, and reads "host" from
`player.factionId` — so at **every** outpost in the world, the armory quartermaster
answers for the player's own faction. Verified live: a Stone Builders character standing
in the **Monarch Waystation** armory gets `Irma.faction === 'stone_builders'`, and turns in
a Stone Builders mystery there at full pay.

⚠ That behaviour predates this punch list (`arbAnchorVendorFaction`, arb-fix). I read the
vendor roster and the turn-in gate and did not read the scene builder that sits between
them. **A defect overstated is the same failure as a defect missed** — it sends work at
something that already works.

### Correction 2 — and the table is missing a faction, for the same reason

Because Irma is re-pointed **away** from her own `true_tartarians`, no anchor answers for
the True Tartarians at all unless the player is one. **They belong in the table above and
are absent from it.**

### The verified picture

Anchored at every outpost, and who they actually answer for:

| Anchor | Room | Answers for |
|---|---|---|
| Irma Ironhand | armory | **the player's own faction** (re-pointed) |
| Tarek the Tinkerer | workshop | `reclaimers_guild` (not re-pointed) |
| Jorah the Scholar | lab | `forgotten_order` (not re-pointed) |
| Halem the Trader | gate, mess | nobody — `faction: null` refused everything |

So before OTA-1185, always reachable = **your own faction + Reclaimers + Forgotten Order**.
Everything else needed the 1-in-30 roll:

| The player is… | Contracts gated behind a 1-in-30 roll |
|---|---|
| True Tartarian | 17 |
| Mud Monarch / Dynasty / Architect / Builder / Giant-servant / Revivalist | **16** |
| Reclaimer or Forgotten Order | **20** |

⚠ **The scale was roughly right; the composition was not.** The original flat "17" was
close by coincidence — it dropped the player's own faction and added True Tartarians in
almost equal measure.

**None of this changes the fix.** The broker covers every row of that table uniformly,
which is exactly why it was the right shape.

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

**STEP 1 — a safety net that does not reverse a single owner decision.**

⚠⚠ **REVISED 2026-08-09. The original Step 1 was "turn the remote hand-in back on", which
made P2 wait on a design call the owner has not made** (*"we are still debating wiring
changes for p2"*). There is a cheaper net that needs no such call, and it was already
standing in every outpost.

**HALEM THE TRADER — the broker.**

| Fact | Verified at |
|---|---|
| `faction: null` | `data/npcs/vendors.json` |
| Anchored in **two rooms** of the shared hub layout | `data/world/static_hub.json:45, :126` |
| That layout is used by **every outpost in the game** | P2, point 3 |
| *"General Goods… runs the village trading post"* | his own data row |

He is already written as the man everything passes through — *"Everything on this post came
off somebody who needed something else more… things that have changed hands enough times
to look new."* (`dialogue_topics.json:173`)

**Why this beats the courier as the net:**

1. ⚠ **It reverses nothing.** The owner's call was *"kill all remote hand-ins, make all
   routable, but make the journey worth the loot."* A hand-in to Halem is **face to face at
   an outpost you travelled to.** Every word of that instruction still holds.
2. **It is smaller.** No remote path revived, no delay timer, no courier fiction, no
   parser route. One branch ahead of the faction gate in four handlers.
3. **It needs no placement work.** He is already at every outpost, in two rooms.
4. **It closes the hostility trap that blocks Step 2.** Hostile to the Architects and
   unable to enter the Blind? Halem takes it.
5. **It fixes P2 on its own**, before any anchoring work at all.

**Proposed terms:** **full rep, 20% TC cut, no long-haul bonus.** The faction's own agent
therefore pays base + up to 1.5× base + full rep; Halem pays 0.8× base and no bonus. Same
shape as the OTA-456 courier that the owner approved, minus the part he later removed.

⚠ **Scope it to Halem by ID (`halem_trader`), NOT to "any vendor with a null faction."**
Six vendors are factionless, and four of them — Naha, Thalan, Velar, Elara — are wanderers
and specialists who turn up **on the road**. Keying on `faction: null` would make the
fallback available anywhere a drifter spawns and delete the travel entirely, which is the
one thing OTA-824 was actually about. Keying on the trading post keeps the rule *"reach an
outpost."*

⚠ **Still needs P8** (the board/hall fallback), which is a separate item and a separate
defect: Halem answers *"the right faction's agent isn't here"*; P8 answers *"there is no
agent here at all."*

⚠ **This does not close P3.** The courier question is still open and still the owner's —
this only removes P3 from P2's critical path.

**STEP 2 — faction-site anchoring, using `FACTION_STARTING_LOCATION` as the ownership map.**
- At **your own** faction's site: nothing changes. Your reskin, your board, your agents.
- At **another** faction's site: their agent, their work, their prices, their standing gates.
- The reskin rule becomes *"skin to the SITE's faction"* rather than *"skin to the
  player's"* — and your own site still skins to you, because it **is** yours. That is one
  argument at 9 call sites, not a rendering rewrite.

**STEP 3 — the hostility consequence stops being a trap and becomes a mechanic.** With
Step 1 in place, being hostile to the Architects means you cannot walk into the Blind, so
you take the broker's cut at the trading post instead. That is a decision with a cost,
which is a game. **Without Step 1 it is a dead end**, which is why the order is not
negotiable.

⚠ **Do NOT ship Step 2 before Step 1.** It would trade one unfinishable state for another.

---

### P3 — The remote hand-in was designed as the escape hatch for exactly this, and is dead code

## ✅ **CLOSED — OTA-1188.** The courier carries REPORTS: 25% cut, full rep, no long-haul bonus, 12 in-game hours charged up front. Hunts and fetch deliveries still refuse it.

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
| Anti-camp (`lastBountyClearedOutpostId`) | OTA-1165 | 2026-08 | *"no second contract from the board you just collected on"* |
| Standing-on-target refusal | OTA-1165 | 2026-08 | 0-tile contracts — accept and finish without moving |
| Board must be FROZEN to accept | OTA-1164 / OTA-1165 | 2026-08 | Politics-shopping the payout |
| `MAX_ACTIVE_BOUNTIES = 3` | OTA-850 / OTA-859 | 2026-07 | Unbounded slate stacking |
| Distance-aware deadline | OTA-862 / OTA-863 / OTA-1162 | 2026-07→08 | 24h + 2.5h/tile + 6h per required kill |

<!-- ⚠ Every OTA reference in this file carries its `OTA-` prefix on purpose. The
     golem renumberer only rewrites prefixed numbers, and in a slash list only the
     first element — a bare `1187/1188` in the table above ported to golem still
     reading HAL's numbers, which is how this note came to exist. -->

⚠ Four of the five sit at or above the renumber floor, so **the same commit carries a
different number on each line** — each line's copy of this table is already correct for
itself, and the two are not meant to match. The pre-floor references are shared history
from before the split and read the same on both.

<!-- ⚠ THAT PARAGRAPH DELIBERATELY CONTAINS NO EXAMPLE PAIR. It first read
     "on golem-line these read 23 lower (OTA-1165 → OTA-1142)" — and the renumberer
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

## ✅ **CLOSED — OTA-1187.** It measures accept-cell → turn-in-cell now.

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

## ✅ **CLOSED — OTA-1187.** Board and hall take it back, via one shared resolver.

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

### P9 — Anchor the vendors to the site, not to the player

- **Kind:** DESIGN — *the world does not feel like factions hold ground*
- **Filed:** 2026-08-09 at the owner's instruction: *"let's put #3 as a new punch list item"*
- ⚠ **Not a defect.** Nothing is unfinishable here. This is the third and largest of the
  three P2 jobs, deliberately separated from the two that shipped.

**The three jobs, and where they now stand:**

| | Status |
|---|---|
| Halem the broker | ✅ shipped, OTA-1185 |
| Skin the rooms by the SITE's faction | ✅ shipped, OTA-1186 |
| **Anchor the VENDORS by the site's faction** | **this item** |

**What is left.** OTA-1186 makes the Architect Blind *read* as Architect ground. It does
not change **who stands in it**. The armory quartermaster there is still the Irma anchor
re-pointed to the player's own faction, and the workshop and lab still answer for the
Reclaimers and the Forgotten Order at every site in the world.

**Why it is the big one, measured (see P2-ANALYSIS):** `vendor.faction` does not only
decide who a vendor *is* — it also filters **which quests, mysteries, storylines and hunts
they offer** (`gameStore.ts:11571 / 11596 / 11621 / 11646`). So anchoring vendors changes
where you *get* work as well as where you hand it in. That is the 55 `vendor.faction` reads,
and it is the part that deserves the caution the owner has been giving it.

⚠⚠ **THE SEAM OTA-1186 LEAVES, WRITTEN DOWN SO IT IS NOT LATER FOUND AS A BUG:** after the
reskin, a site's rooms carry that faction's names while its armory quartermaster still
answers for the player's faction. It is invisible in play — Irma's own name and dialogue
do not change — but it is a real inconsistency and it is this item's to close.

⚠ **The hostility trap that used to block this is closed.** With the broker shipped, being
hostile to the Architects and unable to enter the Blind costs you 20% at the trading post
instead of stranding the contract. **P9 can now be taken purely on its merits.**

---

### P13 — Finishing the Labyrinth imperfectly ends in nothing

## ✅ **CLOSED — OTA-1190.** The heart of the maze now reveals what Iskan-Veil's masking Core is still doing, with a keepsake. Once per character; the Wayfarer title still rides the clean run only.

- **Kind:** ENDS IN NOTHING
- **Found:** 2026-08-09, second-round audit of the 14 untraced loops

`gameStore.ts:1297` — on reaching the maze's heart:

| Run | What you get |
|---|---|
| **Clean** (no wrong turns) | narration + `labyrinthCleanRuns` → the Wayfarer title |
| **Any other run** | **two lines of text.** No TC, no item, no progress counter. |

The run is then discarded (`labyrinthRun: undefined`). ⚠ **The Labyrinth of Shadows is one
of the six Tier-C challenges P5 just confirmed are all LIVE**, so this is reachable in
ordinary play — and a maze walked with one wrong turn pays exactly the same as one walked
with nine: nothing.

⚠ **What is NOT claimed:** that the clean-run reward is wrong. Reserving the title for a
perfect run is good design. The defect is that an imperfect run — the ordinary outcome —
produces no outcome at all.

---

### P14 — `engine/buriedSkyscraper.ts` is a 100-floor dungeon nothing imports

## ⛔ **NOT A DEFECT — RECLASSIFIED 2026-08-09 on the owner's word:** *"p14 is correct, it's a blocked door to an unwritten expansion."*

⚠ **Left on the list deliberately, as a RESERVATION rather than a finding.** A complete module with an entry gate and no caller is indistinguishable from an accident to anyone auditing it — this entry exists so the next pass does not re-file it. The shape is exactly what you would build to hold an entrance open: `canEnterSkyscraper` with its own refusal copy, and nothing behind it yet.

- **Kind:** ~~UNFINISHABLE~~ → **RESERVED** *(no entry point BY DESIGN)*
- **Found:** 2026-08-09, second-round audit

The module is complete: floor archetypes, a 2D grid per floor, `emptyBuildingState`,
`canEnterSkyscraper` with its own refusal copy, and a documented **1–100 floor** descent
(`buriedSkyscraper.ts:264`).

⚠ **`grep -rn "from '.*buriedSkyscraper'"` across `app/` returns NOTHING.** The only
references anywhere are comments in `buildInfo.ts`. `canEnterSkyscraper` and
`emptyBuildingState` have no callers outside their own file. **There is no way in.**

⚠ This is the same class as P4 but larger: authored, finished-looking, and connected to
nothing. Whether it is dead weight or a feature that lost its entry point is the owner's
call, exactly as with the runecasters.

---

### P18 — Veil of Ether channelled outside combat pays for nothing

## ✅ **CLOSED — OTA-1200, fix 1.** The Veil now refuses an empty room before fuel is touched, with the reason spoken and zero cost. ⚠ The fix's own test found a second OTA-1195 defect: the parser strips small words, so `channel veil of ether` could not resolve the technique under its own name — `findTechniqueByName` now carries titleMatch's token tier, ambiguity still refusing. Shield/Slip pre-channelling confirmed deliberate and left as designed.

- **Kind:** ENDS IN NOTHING *(a successful channel whose effect the next action deletes)*
- **Found:** 2026-08-10, Monday full audit of the weekend's work (OTA-1195's own review)

**What happens.** Veil of Ether applies the existing `stealthed` status — a deliberate
OTA-1195 decision, and the right one in combat. But `stealthed` is in
`COMBAT_ONLY_STATUSES`, and the tick expires every combat-only status on the first action
taken with **no enemies present**. So a Veil channelled out of combat costs the fuel, the
4-corruption dose and 10 in-game minutes, succeeds, prints its success line — and the very
next action (a step, a search, anything) silently deletes it. It can never cover an
approach, which is the one thing an out-of-combat stealth field is for.

⚠ In combat it works exactly as designed (+5 next attack, backstab flag). Only the
out-of-combat channel is a purchase that ends in nothing.

**Two candidate fixes, owner's call:**
1. **Refuse the channel with no enemies in the scene** — before fuel is touched, with a
   spoken reason ("nothing here to hide from"). Cheapest, honest, loses the approach use.
2. **Let a Veil persist until the next fight begins** — needs `stealthed` split or a
   veil-specific carrier so the approach case actually works. More design surface.

⚠ Sibling note, a DECISION to confirm rather than a defect: `aether_shield` and
`temporal_slip` are deliberately NOT combat-only, so a field channelled before a fight
survives into it (3 actions max, dose and fuel paid). That matches the "standing field,
held by hand" fiction but is an asymmetry against every other tactical stance. Confirm
intended.

---

### P16 — Aether techniques: foundation shipped, not yet reachable

## 🟡 **REACHABLE — OTA-1195.** A player can now buy a procedure from a rapport vendor, see all four in the Aetheric tab, and `channel` one; the effect lands, the dose is charged, and in a fight it costs the round. **Steps 1–5 done.** ⚠ It stays OPEN for the owner's last instruction on it — *"once this is working we will mirror it to enemies and have them applied like the resists are"* — and for the two acquisition routes not yet built (found texts, contract rewards).

- **Kind:** IN PROGRESS *(deliberately on this list until a player can use one)*
- **Started:** 2026-08-09, at the owner's direction
- **Reachable:** 2026-08-10 (OTA-1195)

Owner: *"I would like to have players get aether powers based off of the spells, once this
is working we will mirror it to enemies and have them applied like the resists are. this
fills the mage gap, but these are science not magic."*

**Shipped so far** — `engine/aetherTechniques.ts` + 24 tests:

| | |
|---|---|
| The four techniques | Aether Shield, Temporal Slip, Veil of Ether, Resonance Cascade |
| Dose | scaled by tier (1 → 8); a FAILED channel still doses at half; Aetherborn take half |
| Growth | per-technique, five ranks, and it shaves the DC rather than raising output |
| Anti-farm guard | practice counts only on a **success under pressure** |

⚠ **Only four of the ten, and that is not a shortfall.** Seven of the orphaned spell file's
entries already exist in the shipped game — shape/summon/mend are the Aethercraft
disciplines, and bolt/lance/pulse are runecasters, which are instruments rather than
techniques. Building all ten would have shipped seven of them twice under two rule sets.

**⚠⚠ WHY IT IS ON THIS LIST AT ALL: a module nothing calls is P4 and P14's defect.** It is
committed as foundation with its next step named rather than abandoned, but it does not
come off this list until a player can channel one.

**The five steps, all shipped in OTA-1195:**

| | | |
|---|---|---|
| 1 | The channel runner | `runAetherTechnique` — mirrors `runAethercraft` step for step, incl. OTA-970's cheapest-first fuel order |
| 2 | The combat turn cost | channelling calls `runSurvivorVolley`; the enemy group answers |
| 3 | The four effects | Shield → `statusAcAdjustment` +3/3 rounds · Slip → the to-hit verdict · Veil → the existing `stealthed` · Cascade → 5d10 out, 1d10 back |
| 4 | One acquisition route | a rapport vendor's **Procedure Text**; buying it teaches, exactly as OTA-726's recipe row does |
| 5 | The Aetheric tab | all four listed, locked ones dimmed rather than hidden |

⚠ **Two decisions inside those worth keeping:** `sweepDeadEnemies` was EXTRACTED from the
DOT tick rather than copied, because Cascade is the second thing that can kill several
enemies at once; and the Slip deliberately does NOT stop a natural 20, because OTA-815's
rule is that no defensive stack buys literal immunity.

**WHAT KEEPS THIS ITEM OPEN:**
1. **Mirror to enemies** — the owner's own next step: *"once this is working we will mirror
   it to enemies and have them applied like the resists are."* Per spawn, from type pools,
   the way `randomizeEnemyDefense` already stamps `vulnerable:` / `resist:` / `inured:`.
2. **The other two acquisition routes** — found texts and contract rewards. Only the
   deterministic one (rapport purchase) shipped, deliberately: one working door first.

---

### P17 — Scholar of Forgotten Lore could not be earned without the narration model

## ✅ **CLOSED — OTA-1198.** The offline answer path now counts as reading lore, and it counts DISTINCT concepts rather than asks.

- **Kind:** UNFINISHABLE *(a title with no reachable route on an affected device)*
- **Found:** 2026-08-10, while reading P15's loot tables — five lore texts in the pools led to the question "how does a player read lore at all?"

**WHAT IT WAS.** `titleProgress.loreRead` — the counter gating **Scholar of Forgotten Lore**
(+2 Lore) — had exactly **one writer in the entire codebase**, and it sat inside
`if (cognitive.isReady())`. So the counter only moved when the **LLM** answered a lore
question.

⚠⚠ **On a device where the narration model does not load, the title was unearnable.** That
is not hypothetical: the owner's own device reads `Narration engine: failed` across
OTA-1180, OTA-1181 and OTA-1182.

⚠⚠ **AND THE GAME WAS ANSWERING THE QUESTIONS THE WHOLE TIME.** A keyword lookup over
`concepts.json` has answered lore offline since OTA-233 — and then `break`s, before the
counter. **The answer was never the missing part; the credit was.** A player could read
thirty lore entries on a model-less device and the game recorded that they had read none.

**THE FIX, in three parts:**
1. **`creditLoreRead` — one place that decides an answer was earned.** Three paths answer a
   lore question (keyword concepts, the embedder, the bank match) and only the middle one
   credited the player. All three now route through one helper, rather than three copies of
   the bookkeeping that would drift apart.
2. **An offline bank matcher** (`findLoreConceptOffline`), same three-tier shape as
   `titleMatch.ts` — exact label, substring with ambiguity refusing, then a token subset.
   The embedder still runs FIRST and is untouched; this is what runs when it cannot.
   ⚠ It makes the ~180-entry concept BANK (canon events, titles, glossary) reachable
   without a model, which the keyword path never covered.
3. **DISTINCT concepts, not asks.** The old tick counted every answer, so asking the same
   question three times earned the title. Two loops that paid out on repetition have already
   been closed this session; opening two more doors onto this one without the guard would
   have made a farm of it.

⚠⚠ **A SECOND DEFECT THE FIX EXPOSED, AND IT WOULD HAVE BEEN THE FARM.** The keyword lookup
matched against the RAW parsed target, which for *"ask the arbiter about X"* still carries
the word **arbiter** — and `arbiter` is itself a lore keyword. So **any** ask matched
something whenever nothing longer beat it. Harmless while the branch only printed prose;
the moment it also credits the title, three nonsense questions earn it. The address is now
stripped before matching, pinned by test.

⚠ **THE LOOP-AUDIT TITLE SWEEP DID NOT CATCH THIS, and that is worth recording.** It set
`loreRead` to 9999 and confirmed the threshold fires — it proved the THRESHOLD, not that a
player can move the number. That is the WIRED-vs-TRACED gap reappearing inside a test
written to close it.

**Tests:** `ota1198OfflineLore` (12), every live case driven with **no narration model at
all** — which is the condition under test, not a workaround.

---

### P15 — Two of the three relic data files have no importers

## ✅ **THE LOOT HALF IS CLOSED — OTA-1199.** Owner's call: *"it goes from the tuned pool and has a small percentage to pull from the alternate loot table as a replacement item for something already on the list."* Shipped at **10%**, one constant, REPLACEMENT not addition — the drop rate does not move and no extra objects enter the economy. The two unique quest rewards are excluded at the shared resolver. ⛔ `relics.json` stays SUPERSEDED — nothing to do.

## ⚠⚠ **CORRECTED 2026-08-10 (OTA-1197) — THE ORIGINAL FILING WAS WRONG, AND IN THE SAME WAY P4 WAS.** It said `loot_tables.json` has **zero importers**. It has one, `engine/encounter.ts:8`, and I filed it off a search rather than a read. The original text is left below the correction so the mistake stays legible. The real defect is narrower, sharper, and still real.

- **Kind:** *(one wiring omission + one superseded file)*
- **Found:** 2026-08-09, second-round audit · **Measured:** 2026-08-10, suite `ota1197RelicDataAudit` (8)

### What a READ establishes

| File | Entries | Verdict |
|---|---|---|
| `curios.json` | — | ✅ **WIRED** — 3 importers (`portability`, `itemFusion`, `salvagePools`) |
| `loot_tables.json` | **113** | ⚠⚠ **IMPORTED BUT UNREACHABLE** — see below |
| `relics.json` | **13** | ⛔ **SUPERSEDED** — 7 of 13 already ship as live items; the other 6 are unbuilt concepts |

### ⚠⚠ THE ACTUAL DEFECT: an unused half of a matched pair

`encounter.ts` exports **two** ladder pickers, written together and documented together:

| | Reader | Called from the game? |
|---|---|---|
| `pickEncounterFromLadder` (enemies) | ladder `possibleEncounters` | ✅ **yes** — `gameStore.ts`, 2 sites |
| `pickLootFromLadder` (loot) | ladder `lootTable` | ⛔ **NO CALLER ANYWHERE** |

So the loot table is imported, parsed and indexed on boot, and the one function that reads
it is never called. **27 ladder loot pools, 153 entries, and every single one resolves** —
the authoring is correct and agrees with itself; nothing is dangling. It simply has no door.

⚠ **The function's own doc comment names the intended caller** — *"the caller (area-search,
dig, etc.) builds the actual InventoryItem from the name"* — so this reads as an omission,
not a decision.

### ⚠ WHY IT IS NOT FIXED HERE, AND WHAT THE OWNER HAS TO DECIDE

Area-search already has its own loot source: a deliberate **Common-only** pool
(`areaSearch.ts`), with digging as the separate "chunky relic" path. Wiring ladder loot into
search would not fill a hole — it would **replace a tuned pool with a per-location curated
one that includes Rare and Legendary rows.** That is a loot-economy decision, and this file
catalogues rather than invents.

**The question was, in one line: should searching a place pull from that place's authored
loot table, or keep pulling from the pool it uses today?** ✅ **ANSWERED (OTA-1199):
both — the tuned pool stays primary and 10% of finds are swapped for something the place
authored.** ⚠ The pool is not "flat Common", which I said once and had to correct: it is two
tuned pools retuned across five OTAs against specific playtester complaints.

⚠ **Measured, so the decision has numbers:** only **13 of the 113** names have a live
catalog row. The other 100 would mint through OTA-961's `resolveLootItem`, which turns an
unknown name into a **sellable trophy at the enemy's rarity** rather than 2-TC junk — so
wiring it would pay, it just would not pay *authored* items until someone curates them.

⚠ **THE LORE HALF OF THIS SPLIT OUT AS P17 and is closed.** Reading these pools raised the
question *"how does a player read lore at all?"*, and the answer was: on a device whose
model does not load, they could not be credited for it. That was a completability defect in
its own right and did not belong inside a loot-economy decision.

### ⛔ `relics.json` — superseded, the P4 shape again

**7 of its 13 entries already ship** under the live catalogs (Aetheric Core, Aetheric Torch,
Aether-Binder Tool, Aether-Breath Mask, Aether Grip Pads, Aetheric Vision Lens, Aetheric
Locket). The file is largely a duplicate of shipped content, so *"13 orphaned entries"*
overstated it by half. The remaining **6 are names in no catalog at all** — Architect's Key,
Tartarian Obelisk, Void Compass, Memory Prism, Resonance Lantern, Temporal Lens. **Unbuilt
concepts, not broken wiring:** nothing reaches for them and fails. Listed so the next pass
does not rediscover them as a defect.

⚠ **The docs were checked first this time** (the promise made when P4 turned out to be
superseded). Neither file carries a `[PLANNED]` annotation — but `docs/open-audits-2026-07-20.md`
item 6 already names a *"content reachability / dead-content sweep"* as an outstanding batch,
which is this work.

---

**ORIGINAL TEXT, LEFT STANDING (2026-08-09) — the "zero importers" line is the error:**

| File | Entries | Importers |
|---|---|---|
| `data/relics/curios.json` | — | **3** (`portability`, `itemFusion`, `salvagePools`) ✅ |
| `data/relics/relics.json` | **13** | **0** |
| `data/relics/loot_tables.json` | **113** | **0** |

⚠ `worldLadder.ts:23` names `loot_tables.json` **in a comment** — *"names of loot items
(matching loot_tables.json)"* — while importing nothing from it. So a file with 113 entries
is being treated as the source of truth by convention and by nothing else, which means
nothing checks that the two still agree.

---

### P12 — A typed contract name that fits two titles silently closes one of them

## ✅ **CLOSED — OTA-1193.** The substring tier refuses instead of guessing. ⚠ It caught a live case immediately: `accept drakova` matched TWO hunts and a shipped test was pinning the arbitrary pick as correct.

- **Kind:** WRONG TARGET *(pre-existing; found 2026-08-09 while building OTA-1188)*
- ⚠ **Not introduced by OTA-1188, and deliberately not fixed there.**

All four contract finders resolve a typed title in tiers: exact, then substring either way,
then (as of OTA-1188) token match. **The substring tier uses `pool.find()`, which returns
the FIRST match even when several fit.** So a player holding *"Red Tower Fragment Cache"*
and *"Red Tower Fragment Vault"* who types `turn in red tower fragment` closes whichever
happens to sit earlier in the catalog — silently, with a real payout attached.

⚠ **The OTA-1188 token tier already refuses on ambiguity**, so the new behaviour is safe.
The old tier is the one that guesses.

⚠ **Why it was left alone:** the entire safety argument for dropping a shared resolver into
four widely-used finders was that it is **strictly additive** — it can only widen what
matches, never change an answer the old code already gave. Making the substring tier refuse
would have broken that promise inside the same change. Pinned by a test that documents the
guess rather than asserting it is correct.

**The fix, when wanted:** collect substring matches instead of taking the first, and refuse
when more than one survives — the same rule the token tier already follows. It is a
behaviour change, which is why it is a decision rather than a patch.

---

### P11 — HaL2001 lets you leave the outpost from any room; golem-line does not

## ✅ **CLOSED — OTA-1194.** Owner: *"ok then bring hal up to the better version."* The fix was ported UP rather than stripped from golem, so the live line gained the correct geography and `InputBox.tsx` stops diverging.

- **Kind:** LINE DIVERGENCE *(not a defect on either line — a decision that was only ever made on one of them)*
- **Found:** 2026-08-09, when `verify-parity` flagged `InputBox.tsx` during the OTA-1186 port
- ⚠ **Not an "ends in nothing."** Filed here because it is the owner's call and because it
  will keep flagging parity on every future port that touches this file.

`fix(golem-line): EXIT chip only in the gate room` (`e04a6ed5`, 2026-06-27) added
`roomIsExit` / `hubDefinesExitRoom` to golem's `hub.ts` and gated the hub OUT chip:

> *"The outpost is a 15-room layout entered/left through `outpost_gate` (tagged 'entrance',
> and the spawn room). But InputBox rendered the EXIT chip in EVERY hub room, so the player
> could leave through the armory/mess/etc. — not how the outpost is laid out."*

**It was never ported up.** So today:

| Line | Leaving an outpost |
|---|---|
| golem-line | walk to the Gate, then OUT |
| **HaL2001 (the live line)** | **OUT from any of the 15 rooms** |

⚠ **The live line is the one without the fix**, which is the wrong way round — and the
reasoning in that commit applies to HAL exactly as written, since both lines share the
same 15-room layout and the same `entrance`-tagged gate.

⚠ **NOT ported here, deliberately.** It came from `engine_Dev`, which is off limits, and
it changes how every player leaves every outpost — that is a feel decision, not a defect
fix, and it is not what "do halem and the reskin" asked for.

**The question for the owner:** port it up to HAL so both lines agree, or drop it from
golem so both lines agree the other way? Either closes the parity flag; leaving it is the
only option that keeps `InputBox.tsx` diverging forever.

---

### P10 — The Hidden Market hands out contracts it cannot take back

## ✅ **CLOSED — OTA-1192.** Its stalls broker at **10%**, against the trading post's 20% — geography, not generosity: one location you travel to versus a broker at every gate.

- **Kind:** INCOHERENCE *(no longer a dead end — the broker covers it)*
- **Found:** 2026-08-09, while building OTA-1185

A Hidden Market stall is already a broker on the **accept** side: `isBrokerVendorId`
(`gameStore.ts:5750`, `VendorContractsModal.tsx:23`) makes `hidden_market_*` stalls post
**every** faction's open work, not just their own rostered faction's — *"so there's always
a board to pick from no matter who you've been running with."*

⚠ **But the turn-in gate was never given the same rule.** A stall rostered to a Stone
Builders rep will hand you a Mud Monarch mystery and then refuse to take it back. **A
broker that only brokers in one direction.**

⚠ **Deliberately NOT fixed in OTA-1185, and the reasoning matters:** including
`hidden_market_*` in `isContractBroker` would have been a one-line change, but it would
also have started charging a 20% cut at an existing, working location the owner did not
ask me to touch. And it is no longer a dead end — Halem takes those contracts at any
outpost gate, so leaving it strands nothing.

**The question for the owner:** should a broker take back what a broker hands out — i.e.
should `isContractBroker` cover the Hidden Market stalls too, at the same 20%? It is one
line either way.

---

### P6 — The Siren of Zharak's Teeth was chosen for a perk, and there is nothing to attach it to

## ✅ **CLOSED — OTA-1189.** Owner: *"p6 charisma?"* — +1 CHA, consumed by diplomacy checks and the CHA vendor discount, injected at `effectiveStats`.

- **Kind:** *(open design question — raised by OTA-1184, not a defect)*
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

## ⛔ **NOT A DEFECT — SUPERSEDED, and the project's own docs said so three weeks before I filed it.**

`docs/tartaria-hack-v2.5.txt`, annotated 2026-07-20: *"Shipped recipes are: 1x 'Blank Runecaster Casing (rarity)' + two ordinary reagents… gated at effective INT 11 (the INT-11 gate MATCHES the outline). **[PLANNED] the relic + transmutative-material structure described here survives only in an unused data file.**"* That unused data file is this one.

⚠⚠ **I FILED A KNOWN, DOCUMENTED LEFTOVER AS A NEW DISCOVERY, TWICE, AND GOT THE SCALE WRONG BOTH TIMES.** See the corrected measurement below. The lesson for this list: **when a data file looks orphaned, read the docs before writing the entry** — this one had already been found, understood and annotated.

- **Kind:** ~~UNFINISHABLE~~ → **SUPERSEDED** *(the design draft the shipped version replaced)*
- **Found:** 2026-08-09 full loop audit

`app/data/spells/runecasters.json` holds **10 entries** and **no file in `app/**` imports
it** — verified by searching for the filename and for `spells/` across all `.ts`/`.tsx`.
⚠⚠ **CORRECTED 2026-08-09 — the sentence that stood here was WRONG.** It read: *"A
separate, larger `app/data/items/runecasters.json` (49 entries) is the one the runecaster
weapon class uses."* **It is not. Neither file is imported anywhere** — the 2026-07-20
doc-vs-game audit already said so (`docs/tartaria-doc-vs-game-audit-2026-07-20.md:241`)
and this entry read past it.

**The measured picture, both files:**

| File | Entries | Status |
|---|---|---|
| `data/spells/runecasters.json` | 10 spells, Common→Legendary, INT 6→18 | imported nowhere |
| `data/items/runecasters.json` | 49 runecaster weapons | imported nowhere |

⚠ Of the 49 weapons, **15 also exist in `weapons.json`** and are therefore reachable
through the live catalog. **34 are not in `weapons.json` at all** — Whispering Flame,
Tempest Call, Shockwave, Ice Vein, Emberstrike and 29 more exist nowhere in the game.

**What `cast` does today:** the verb is live and routes to **Aethercraft** — shape /
summon / mend, a real system with skill checks, race modifiers, corruption interaction and
golem recipes. Roughly three of the ten spells overlap it under other names
(`shape_aetherstone`, `summon_mud_arm`, `mold_ether`); **the other seven have no
equivalent** — no ranged aetheric attack, no shield, no AoE, no evasion, no stealth.

Both files date to the first commit (`d4698a3f`, 2026-05-15, "playable vertical slice") —
original design the build grew past.

**So it is three questions, not one:**
1. **The 34 unreachable weapons** — authored and statted; they need catalog rows. Data
   entry, not design. The cheapest content in the game.
2. **The 7 unbuilt spells** — a genuine feature. Aethercraft is the spine that would carry
   them, but it is a build, not a wiring job.
3. **The 3 overlapping spells** — already exist as Aethercraft under other names.

⚠ **What this is NOT:** a claim that the spell system is broken. Runecasters exist as a
class (`gameStore.ts:11137` gates them on INT ≥ 9) and their weapons resolve. The finding
is narrower and checkable: **this data file is dead weight, or it is a feature that was
authored and never connected.** Which of the two it is depends on what those 10 entries
were meant to be, and that is the owner's answer, not mine.

---

### P5 — The store says the location challenges are switched off. They are all on.

## ✅ **CLOSED — OTA-1187.** The false comment is gone; a test pins the premise.

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

### ✅ P1 — Collectible story sets (closed by OTA-1183, 2026-08-09)

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

**Tests:** `ota1183CollectionPayoff` (27). Four older assertions retargeted from hardcoded
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

⚠ **The 18 "wired" rows WERE the remaining risk.** Each had a completion path and a payoff,
which is what the bar asks — but none had been walked end to end the way mysteries were,
and mysteries is precisely the loop that looked fine until it didn't.

## ⚠⚠ WIRED → TRACED (2026-08-10, OTA-1196)

Owner: *"audit this for traced and make sure the loops are functional."* Every WIRED row was
then walked. The bar for a promotion was the same three things, live, against the real
store: **start it from a state a player could be in, finish it through the PUBLIC action the
UI calls, and assert a payoff the PLAYER can see.**

| Loop | Now | How it was proved |
|---|---|---|
| Crafting | **TRACED** | `craftRecipe` → the object is in the pack, the materials are gone, the feed says so; and it refuses with nothing |
| Fusion | **TRACED** | `confirmFusionSelection` → a named weapon exists, all three inputs are consumed |
| Recipe discovery | **TRACED** | the picker drained 200 times: every pick is NEW, and it terminates |
| Stat training | **TRACED** | the ledger fills and the stat on the sheet actually rises |
| Gifting | **TRACED** | `giveGift` → item leaves, the NPC remembers, the taste is learned; and an UNMET recipient is refused WITHOUT eating the item (the OTA-1064 guard) |
| Titles | **TRACED** | every WIRED title is earnable under some race × faction × maxed sheet — none is a dead entry; every passive perk is attached to a real title |
| Corruption | **TRACED** | a corrupted sheet rolls measurably worse, pays more, and draws more encounters; all four tiers reachable, every crossing has a line |
| Golem companion | **TRACED** | `summon golem` → a companion with real HP and a real attack die |
| Location challenges | **TRACED** | all six enabled, every tile EXISTS in `locations.json`, every one reachable through the store or `titleChallenges` |
| Labyrinth | **TRACED** | walked LIVE from the entrance to the heart (route solved off the engine's own adjacency, then TYPED) → the keepsake lands, and a second walk pays nothing |
| Hidden locations | **TRACED** | every hidden tile has a real world row; unrevealed reads as the placeholder, revealed reads as the name |
| Chapters | **TRACED** | every phase × every motive produces a card — no phase advances into silence |
| Faction standing | **TRACED** | a live bounty turn-in raises the posting faction's standing; bounds hold |
| Aetherkin | **TRACED** | encounters build in both contexts and EVERY authored variant name resolves to a real enemy; the revering factions are real factions |
| Hook puzzles | **TRACED** | every hook kind has a chain and every chain ENDS in something |
| The Fallen | **TRACED** | a fallen hero becomes a fightable enemy, defeat has words, and avenging writes back so the same ghost is not raised twice |
| Story forks | **TRACED** | already proved end to end by `ota1065StoryForks` — answer → TC change → narration → never returns |
| Resurrection gems | **TRACED** | already proved end to end by `resurrectSlotGemSafety` — revives at the backfilled hpMax spending EXACTLY one gem, refuses with none |

**Suites:** `ota1196LoopAuditA/B/C/D`. ⚠ Two loops were NOT re-tested (forks, gems) because
existing suites already drive them end to end; a second weaker version would add a file and
prove nothing.

⚠⚠ **FIVE OF MY OWN ASSERTIONS WERE WRONG AND FLAGGED HEALTHY CODE.** Worth recording,
because a completability audit that cries wolf is the thing that gets ignored:
1. The title sweep maxed the counters and called three titles dead — `scion_of_the_giants`
   wants a GIANT standing well with a giant-respecting faction, `aetherborn_awakened` wants
   an AETHERBORN carrying dose, `etheric_explorer` wants a recovered CORE. None is a counter.
   It also built `factionStanding` as a record when it is an ARRAY.
2. The challenge sweep looked only in `gameStore` and called three challenges orphaned —
   they route through `titleChallenges.ts`, which the store calls generically.
3. The Labyrinth walk typed north/east and never arrived. The maze is AUTHORED, not a grid.
4. The Aetherkin check read `enc.enemy`; the encounter carries an enemy NAME.
5. The gift check asserted the log GREW — `appendLog` merges same-channel writes, so a
   working gift left the count unchanged.

**Nothing in the game was broken by any of the five.** Every failure was the test.

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

## SECOND-ROUND AUDIT — the 14, all checked (2026-08-09)

Owner: *"audit the other 14 loops when done give me a new punch list."*

| Loop | Verdict |
|---|---|
| Faction bounties | ✅ **TRACED** — pays TC + standing inside the kill handler; five guards (anti-camp, standing-on-target, board-freeze, deadline, slate cap) |
| Escort missions | ✅ **TRACED** — completion pays scaled by surviving party (`escortPayMult`); failure drops the contract with narration |
| Chapters | ✅ wired — `chapterCardFor` consumed at `gameStore.ts:34792` |
| Story forks | ✅ wired — 3 importers incl. the ending screen |
| Aetherkin | ✅ wired — encounter builder + reverence delta both live |
| Crafting / Aethercraft | ✅ wired — 39 importers |
| Corruption arc | ✅ wired — 4 importers; tiers drive stats, prices, encounter rate |
| Core Guardians | ✅ **TRACED** — `core_recovered` advances the main-quest phase, which drives chapters, Arbiter stance and the ending |
| Titles | ✅ **TRACED** — every engine title has a data row and vice versa (pinned by test since OTA-1183) |
| Whispers | ✅ pays — TC on completion (`gameStore.ts:34435`) |
| Dog rescue arc | ✅ **CLOSED AS DESIGNED** *(owner ruling 2026-08-10: acquisition loop — the naming popup + Arbiter comment IS the completion; was marked PARTIAL for lacking a story ending it was never meant to have)* |
| Golem companion arc | ✅ **CLOSED AS DESIGNED** *(same ruling; summon → naming popup → Arbiter acknowledgement, all tested)* |
| Mysteries (the finding half) | ✅ wired — stage advance + artifact gate; turn-in closed by OTA-1185 |
| **Maze / Labyrinth** | ❌ **P13** — an imperfect run ends in nothing |
| **Buried Skyscraper** | ❌ **P14** — 100-floor dungeon, no entry point |
| *(found alongside)* Relics data | ❌ **P15** — 2 of 3 files orphaned, 126 entries |

⚠ **The two PARTIALs are resolved (owner ruling, 2026-08-10).** They are acquisition
loops, not story arcs: the naming popup and the Arbiter's comment are the completion, and
both are live and tested (70 tests across three suites). The original caution is left
above so the reasoning stays legible — it looked for an ending these loops were never
meant to have.

---

## NOT YET AUDITED

⚠ Listed so the gaps in the audit are as visible as its findings.

⚠⚠ **THIS SECTION WAS STALE AND IS REWRITTEN (2026-08-10).** It still listed fourteen
loops as unchecked — every one of which the second-round audit above had since checked and
recorded. A "not audited" list that names already-audited work is worse than no list: it
sends the next pass to re-do finished work and hides where the real gaps are. The stale
names are gone; what replaces them is what is genuinely not proved.

**Nothing is unaudited. What is UNPROVEN is a different thing, and here it is:**

1. **The 18 WIRED rows in the audit ledger.** Confirmed to have a consumer, a completion
   write and a payoff — not walked end to end. That is a lower bar than TRACED and it is
   named as such in the ledger's own footer.
2. **The dog rescue arc and the golem companion arc** — PARTIAL. Mechanics live at every
   point checked; no completion event found to trace. Possibly open-ended by design, which
   is a thing to confirm rather than assume.
3. **P15's two data files** — filed but not investigated. The docs may already have
   superseded them, exactly as they had for P4.

⚠ **Absence from the OPEN list means CHECKED-AND-CLEAR OR WIRED-BUT-UNWALKED. It has never
meant "proved".**
