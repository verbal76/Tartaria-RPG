# The contrary walker — the Bog Dragon of Old Drakova (2026-09-05)

Step 1 of the Narrative Agency plan (task #195): one hunt, four roads, every
deviation graded. Shipped as OTA-1686 with the walker
(`test-utils/contraryWalker.ts`), the suite
(`__tests__/ota1686TheContraryWalker.test.ts`) and this punch list. Step 2
(the deed ledger and its three readers, #196) builds against the "no" column
below.

Run it by hand:

    npx jest __tests__/ota1686TheContraryWalker.test.ts
    PLAYER_WALKER_FEED=1 PLAYER_WALKER_REPORT=/tmp/r.txt npx jest … -t interrupted

## The four roads

| road | what the thumb did |
|---|---|
| **obedient** | the player-shaped walker as it stands: accept at Halem's gate, follow every course, type every arrival line, answer every card, hand in |
| **premature** | read the poster ("cathedral steeple roost … Mud Seas"), skipped the reeve, went to the Broken Steeple and to Old Mira first, then played it properly |
| **contrary** | tried to hand the bounty in with no trophy; walked out on the reeve's card and came back; typed the wrong verbs on the right ground; ABANDONED at stage 3 with the token and the map in the pack and took the posting again |
| **interrupted** | let the harpy ambush land, killed one and FLED, stepped off and back; let the Dragon rise, wounded it and FLED, stepped off and back |

Every deviation is a probe with an authored expected outcome, graded three
ways: **handled** (the game did something sensible and the hunt still
finished), **acknowledged** (a line or card named what the player just did),
**prior knowledge** (the earlier deed changed a later line or state). The
grades are measured from the feed and pinned in the suite; a fix flips a pin.

Allowances, as on the parent walker: HP 600, STR/DEX 20, standing 100, dice
on 18, stamina by fiat instead of resting, and one of this walker's own — the
finished hunt is struck from the completed ledger between roads so Halem will
post it again.

## Results

| road | probe | handled | acknowledged | prior | what was measured |
|---|---|---|---|---|---|
| obedient | the whole hunt | yes | yes | n/a | seven stages, a card on every close, purse moved (952 taps) |
| premature | the steeple before the reeve | yes | **no** | n/a | nothing on screen mentioned the hunt or the roost; only the tile's wandering pack (four Mud Wasps) stood up |
| premature | Old Mira before the reeve | yes | **partial** | n/a | "negotiate" on her ground drew the generic *"Not here. The Bog Dragon of Old Drakova points elsewhere — set a course from Contracts and do it there."*; no card armed; nothing named the reeve or the token |
| premature | the proper visits afterwards | yes | n/a | **no** | Mira, the reeve and the steeple read exactly as a first visit |
| contrary | the trophy before the hunt | yes | yes | n/a | *"The trophy is the proof. You don't have it yet."* |
| contrary | walking out on the reeve | yes | yes | **no** | *"You break off and step away from Reeve Halvard."*; SUMMON reopened the card; the reeve picked up as if nothing happened |
| contrary | the wrong verb on the right ground | yes | **partial** | n/a | "negotiate" and "attack" on the Cradle of Dusk drew nothing about the hunt; only the arrival line, printed earlier, spoke for it |
| contrary | abandon with the items, take it up again | **partial** | yes | **no** | the drop was said; the re-accept started over at stage 0 (the token and the map still in the pack, not doubled); the reeve's card stayed shut — its record says `resolved` — and only the typed verb paid |
| interrupted | one harpy down, then run | yes | yes | **no** | the flee was said; the fled tile held (`investigate` did not re-summon); on return **three** harpies stood up after one had died; the same stinger, word for word |
| interrupted | the Dragon wounded, then run | yes | yes | **no** | the flee was said; the Dragon came back at 561 after being left at 543 of 561; the name stalled it a second time, word for word; no line knew you ran |

The world's own memory *did* show up on every road, just never about the
hunt: vendors' *"You again."* (OTA-1547 npcGreeting), the room's *"The bodies
you left are still here. Nothing has moved in to replace them."* and *"Whatever
this place was to you the first time, it is furniture now."* (room memory),
Halem's *"Held something back for you."* The machinery the audit inventoried
is live; the mission layer does not read it.

## Four defects found on the road and fixed in this OTA

00. **A knocked-out body held the apex shut.** The walker cleared a wandering
    pack on the Broken Steeple with the last body left out cold (HP 9, knocked
    out) and the Dragon never rose: both arm guards — `armSpawnStagesAtArrival`
    and advanceHunt's freeze-for-kill guard — counted any body with hit points
    as a live hostile. OTA-1612 taught the escort clear that "still up" means
    conscious; the two guards now follow the same rule. A subdued wanderer is
    not a fight, and the hunt's own body stands up over it.

0. **"approach Mud Elemental Spawn" was filed as a bug note.** The
   meta-comment guard's engine vocabulary lists `spawn` as a word that
   "never reaches the player" — but a Legendary enemy is *named* Mud
   Elemental Spawn, the party announcer prints it, and the APPROACH picker
   submits it. Every approach and every named attack on that enemy drew *"I'm
   not sure what you're trying to tell me"* (once) and then nothing: a fight
   that could not be closed and could not be won. This was the parent
   walker's one documented "intermittent" (a mid-range approach that would not
   close), never root-caused. `classifyMetaComment` now takes the scene's own
   names (enemies, ambient nouns, the vendor) and cuts them out before any tier
   reads; the owner's real notes (*"nothing spawned here to combat"*) stay notes.
1. **The stall line fired on every fight in the world.** With the harpy stage
   (`attack_provoke`) pending, two Mud Striders at Dynasty Border Post — twenty
   tiles from the Mud Seas — drew *"That is the right move for The Bog Dragon of
   Old Drakova — but not with something on you. Put this down first."* on the
   player's own swing, and on the Mud Seas the same line printed while the
   player was cutting down the harpies the stage had stood up.
   `missionTrace.stalledInCombat` now skips `attack_provoke` and any stage with
   an authored spawn (the fight *is* the beat, as the apex already was) and
   speaks only on the stage's own cell. OTA-1624's six pins still hold.
2. **"3 Mud Harpys are on you"** — the escort ambush line used a bare `+s`;
   it now uses `grammar.pluralizeNoun` like the party announcer.

## The punch list

Each item is a "no" or "partial" above, with the reader that would close it.
Items 1–5 are the deed ledger's work (step 2, #196 — **all five closed by
OTA-1688**, re-measured by the walker: every road handled and remembered);
6–8 are mission-layer fixes that need no ledger (closed by OTA-1687).

1. **A hunt ground visited early says nothing.** Standing on the Broken
   Steeple at stage 0 there is no line at all about the hunt; the arrival
   reader (`missionArrivalLines`) considers only the *current* stage's
   ground. Expected: *"▸ The Bog Dragon of Old Drakova: the roost — but not
   yet. The Drakovan reeve first."* Reader 1 of the ledger (arrival) keyed on
   every stage's ground, not just the current one. **Closed by OTA-1688**
   (`missionTrace.laterStageUnderfoot`, printed once per standing).
2. **The early visit is not remembered on the proper one.** Arriving at Mira's
   or the steeple after having been there reads as a first visit. Expected: the
   arrival line or the Arbiter's callback notes it (*"You have stood on this
   roost once already."*). Reader 1 again, from a `visited` deed. **Closed by
   OTA-1688** (*"You have stood here before, ahead of the trail."*).
3. **Old Mira before the reeve is a generic refusal.** Her ground, at stage 0,
   answers a parley with *"Not here … points elsewhere"*. Expected: Mira (or the
   slate) says what she wants — *"Old Mira wants the reeve's token before she
   talks."* The wrong-ground line (`standingAt.wrongGroundLine`) can name the
   stage that *does* stand here and what it requires; a person-stage's
   `npcName`/`requires` are already on the def. **Closed by OTA-1688** (the
   same later-step line names her and the reeve).
4. **Walking out on the reeve is forgotten by the reeve.** The encounter record
   carries `phase: fled`, so the fact is stored; nothing reads it back except
   the SUMMON bar. Expected: on the reopened card, one line — *"Back, then."*
   `onReenter` already has a `mock` slot for the persuade case; the walk-away
   case needs its own line. Reader 2 (people). **Closed by OTA-1688** (a
   `walked_out` deed; SUMMON draws *"Back, then."*).
5. **The brood and the Dragon forget their dead and their wounds.** After a
   flee and a return, the escort respawns at its authored count (three, with
   one dead) and the apex at full HP, and the name-token narration stalls the
   Dragon "for one breath" a second time. Expected: the kill sticks (spawn
   `count − killed`), the wound sticks or a line says it healed, and the second
   stall is refused (*"It has heard the name once. It does not stall twice."*).
   Needs a per-stage deed (`fled`, `killed n`) read by `spawnStageEscort` /
   `scaleHuntBoss` and by the apex narration. **Closed by OTA-1688** (a `fled`
   deed with the bodies' state; the return replaces the first-time curtain).
6. **ABANDON + ACCEPT leaves every answered card shut.** The record restarts at
   stage 0 but `missionEncounters[hunt:…:0]` keeps `resolved`, and the card
   component hides a resolved card — the player sees no card at the reeve and
   has to type the arrival line. Expected: the re-accept either resumes the
   record where the pack proves it was (the token *and* the map are held, so
   stage 3) or resets the hunt's encounter records with the record. The walker
   falls through to the typed door and reports the shut card; a real player
   may not. **Closed by OTA-1687** (ABANDON drops the mission's records).
7. **The wrong verb on the right ground is silent about the hunt.** "negotiate"
   on a search stage draws nothing; the hunt matcher only speaks when the verb
   matches and the ground does not. Expected: on the stage's cell, a verb the
   hunt does not want says what it does want — *"Not a parley. This ground
   wants searching."* One line in `advanceStagesOnIntent` where the ground
   matches and no stage pays the intent. **Closed by OTA-1687**
   (`missionTrace.stageUnderfoot`; the look family excluded).
8. **The escort clear narrates the next beat before the player reaches it.**
   `resolveStageEscortClear` prints `nextDef.narration` on the clear: Mira
   *"reads the locket without crying"* at the Mud Flood Nexus, 46 tiles from
   her holding, and the Dragon *"uncoils from"* the steeple while the player
   stands on the Mud Seas; both then print again at the ground. Expected: the
   clear prints the direction line and the card; the beat's prose waits for
   the beat whenever the ground moves (a same-ground next stage keeps it, since
   no arrival will ever narrate it). **Closed by OTA-1687.**

Observations, not defects: the auto-route from the Mud Seas to the steeple
reported 23 tiles on one run and 1 tile on another for the same adjacent
cells (the router's detour); wandering hunt posters (*"✦ Hunt added to your
slate — The Sludge Behemoth"*) land on the slate mid-walk, parked.

## What the walker itself learned

- A wandering pack on the ground holds the mission arm (OTA-1605) and the
  stage's own body stands up when the last wanderer dies — inside the same
  fight. A walker that swings until the field is empty kills the Dragon it
  came to measure; `clearAmbient` swings until the stage's body appears.
- A step costs stamina and the flee costs more; "north" on an empty tank is
  refused and the boots never leave the cell. The return re-arm was never
  tested until the walker rested first.
- The scene generator says "steeple", "roost" and "locket" of its own accord,
  the compass names The Broken Steeple on every Drakova arrival, and "before"
  matches "stands before you". A line counts as being *about the hunt* only on
  the hunt's own proper nouns, on its own line, with the walker's travel lines
  excluded.
