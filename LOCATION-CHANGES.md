# Tartaria Realms — Location Changes Roadmap

**Status: WAVE 1 SHIPPED (L1, L2, L3 — OTA-1326). Everything else is still a proposal.**

Owner: *"if we go with those choices then you need to map out all of the text, description,
and lore, story beat, and mission instruction changes as well that need to be done to make
this seamless. these will be big changes."*

---

## 0. ⚠⚠ CORRECTIONS TO THE AUDIT THAT PRODUCED THIS PLAN

Two of my own numbers were wrong, and both change what is worth doing. Recorded here at the
top because the plan below is built on the corrected figures, not the ones in the first pass
of `EVENT-MAP.md`.

**(a) Hunts are not a load on Asgardar. Zero hunts anchor there.**
I matched `biomeTag` against location tags myself and reported six hunts landing on Asgardar.
The engine does not do that. `huntAnchorId()` (engine/contractMarkers.ts) resolves the
**poster's named place** first — `targetLocationName`, matched against `locations.json` names
and aliases — and only falls back to a biome anchor when the poster names pure flavour.
OTA-1218 fixed this deliberately; its own comment says so. Measured with the real resolver:

| anchor | hunts |
|---|---|
| endless_stair, cradle_of_dusk, obsidian_pillars, zharaks_teeth | 2 each |
| mud_seas, tartarian_outskirts, sinking_cathedral, drakova, red_tower_of_nimari, great_tartary_plains, thametans_tower, tartarian_enclave, yuldra_tul, voronov | 1 each |
| **asgardar** | **0** |

17 of 18 resolve from the poster. One falls back: `hunt_iron_titan` names *"the Sentinel Ward
(inner archive)"*, which is not a location, so it anchors on `obsidian_pillars`.

**(b) Three of the four "empty" tiles are not empty.**
`cradle_of_dusk` (2 hunts), `mud_seas` (1), `great_tartary_plains` (1) all carry hunt anchors.
**`etheric_chamber` is the only genuinely dead location in the game.**

**Revised true load at Asgardar: 6, not 12.** Five fixed triggers plus one dog rescue. Still
the busiest tile by a wide margin — no other location carries more than three — so the split
is still worth doing. But §4 of my original verbal suggestion ("fill the four empty tiles")
was mostly answering a problem that does not exist, and is dropped from this plan.

---

## 1. What is actually being proposed

| # | Move | Asgardar | Other effect |
|---|---|---|---|
| **M1** | Buried Spire + Draugveil → new tile `asgardar_crown_spire` | 6 → 4 | great climbs become consistent |
| **M2** | Outpost hub off `asgardar` and `drakova` | 4 → 3 | Drakova 3 → 2 |
| **M3** | Dog `cellar` rescue restricted to outposts | 3 → 2 | dogs leave all 9 capitals + ruins |
| **M4** | Labyrinth of Shadows `iskan_veil` → `cradle_of_dusk` | — | Iskan-Veil 3 → 2 |
| **M5** | `etheric_chamber` becomes the Sentinel Ward | — | fixes `hunt_iron_titan`'s dead name |

**End state:** every Lost Capital reads identically — the capital and its Core Guardian, and
nothing else. That is already true for seven of the nine.

---

## 2. M1 — The Buried Spire gets its own tile

### The precedent this follows
The game already does this once: **Nimari** is a capital (`nimari`) and **Red Tower of
Nimari** is a separate tile (`red_tower_of_nimari`) with its own challenge. Asgardar is the
only great climb of the five that shares a tile with something else; the other four
(`grand_spire_of_etheria`, `obsidian_pillars`, `thametans_tower`, `zharaks_teeth`) are
dedicated landmarks.

### ⚠⚠ A LORE CONTRADICTION THIS MUST RESOLVE FIRST
`worldLadder.json` places **`grand_spire_etheria`** as a micro-micro location *inside*
Asgardar, described as *"The Grand Spire of Etheria still throws light at full power five
centuries after the flood."* But `grand_spire_of_etheria` is **also a separate top-level
location** with its own great climb and its own summit boss (Aurenthal). Asgardar's tags
carry `grand_spire` and `spire` because of this.

So the world currently says the Grand Spire is both at Asgardar and somewhere else. **This
must be settled before M1**, because M1 adds a third spire to the same city. Three options:

- **(A) Rename the ladder micro** to the Buried Spire — the Grand Spire of Etheria belongs to
  its own tile, and Asgardar's crown-spire is the one you climb. Cheapest, and it makes M1's
  new tile the thing already described in the ladder.
- **(B) Drop the micro entirely** from the Asgardar ladder node.
- **(C) Keep both and write the difference** — two Aether-collectors, one at the capital, one
  on the plain. Most expensive; needs new lore in three files.

**Recommend (A).** It costs one description edit and makes the geography honest.

### Registries a new location must be added to
Measured from `thametans_tower`, the closest existing analogue:

| File | What it needs |
|---|---|
| `app/data/locations/locations.json` | full entry: `id`, `name`, `type: 'tower'`, `tags`, `danger`, `description`, `interactables`, `aliases` |
| `app/engine/atlasCoords.ts` | `fx`/`fy` — drives the atlas pin AND the canonical grid cell |
| `app/engine/worldLadder.ts` | tier assignment (`asgardar: 'lost_capitals'` is the sibling line) |
| `app/data/world/worldLadder.json` | ladder node + micro/micro-micro locations |
| `app/data/lore/location-flavors.json` | ambient flavour lines (Asgardar has 2; this needs its own) |
| `app/data/lore/glossary.json` | glossary entry, if the name is player-facing lore |
| `app/engine/greatClimbs.ts` | `locationId` changes from `asgardar` → `asgardar_crown_spire` |

### Text that must change
| File | Line(s) | Current | Change needed |
|---|---|---|---|
| `app/data/items/gear.json` | ~1300 | *"This one plots the route to the buried spire of Asgardar and opens its great climb."* | Still true in spirit, but SET COURSE now routes to a different tile. Reword to name the crown-spire as its own place so the chart and the map agree. |
| `app/data/lore/glossary.json` | 234 | *"A monumental tower in Asgardar, known for drawing Aetheric energy…"* | Decide which spire this defines (see the contradiction above) and point it at one tile. |
| `app/data/lore/location-flavors.json` | 14–23 | 2 Asgardar lines, both about the city | Unchanged, but the new tile needs its **own** flavour block or it will read as silent. |
| `app/data/world/worldLadder.json` | Asgardar node | *"The Grand Spire of Etheria still throws light at full power"* | Per option (A), rename to the Buried Spire. |
| `app/engine/greatClimbs.ts` | `asgardar_spire` entry | `locationId: 'asgardar'`, `tokens: ['asgardar']` | New locationId. ⚠ **The token `asgardar` becomes dangerous** — it would match the capital's own nouns. Retune to `buried spire` / `crown spire`. |
| `app/engine/contractMarkers.ts` | 32 | `buried_capital: 'asgardar'` | Confirm the biome anchor still means the city, not the spire. |

### Story beats and missions that name Asgardar
None of these move — they are all about the **city**, and the city keeps its id. Listed so the
pass can confirm each reads correctly once a second Asgardar tile exists:

- `mystery_tuning_fork_asgardar` — *"In the Asgardar ruins you find the Resonance Fork in a
  collapsed workshop."* Stays at the city. ⚠ Its poster does not name a tile, so its map pin
  comes from the faction anchor, not from this move.
- `story_dynasty_purge_asgardar` — *"A cadet branch at Asgardar has thinned… tending a
  border-shrine."* Stays at the city.
- `character_stories.json` — *"A vision of ancient Asgardar opened in front of me at the edge
  of the Mud Seas."* Stays; it is a memory, not a place reference.
- `hunt_mud_titan` — poster reads *"the Endless Stair (Asgardar descent, level 6)"* and
  already anchors on `endless_stair`. **Do not touch** — the parenthetical is flavour and the
  resolver strips it.

### Engine references to re-check
`worldDirections.ts` (alias comment naming "spire"), `interactionTags.ts` (has a standing
comment about *"Spire" containing "asgardar"* — this is exactly the collision class M1 makes
more likely), `locationMatch.ts`, `encounter.ts`, `indoorAmbush.ts`, `hub.ts`, `character.ts`.

---

## 3. M2 — Capitals stop being outposts

`static_hub.json` `hubLocationIds` currently includes `asgardar` and `drakova` alongside 12
ordinary regions. The other seven capitals have no hub. Removing the two ids is a **one-line
data change**, but the consequences are not:

- **A 15-room interior disappears from two capitals.** Any save whose `hubRoomId` points into
  one of those rooms must be handled — a player standing in Asgardar's Operations Room when
  the OTA lands needs somewhere to be. ⚠ **This is the highest-risk item in the plan** and
  needs a migration at `loadSlotIntoGame`, in the same seam as the OTA-1320 gear backfill.
- Both capitals lose their vendors, contract boards and rest rooms. If capitals are meant to
  be desolate that is the point; if not, M2 should be dropped.
- **Owner's instruction "leave dog events at outposts" interacts here:** dog rescues follow
  archetype tags, not hubs, so removing a hub does not remove its dogs. M3 does that.

**Open question for the owner:** is a Lost Capital supposed to have a staffed Reclaimer
outpost inside it? If yes, M2 is wrong and Asgardar stops at 4.

---

## 4. M3 — Dog events at outposts only *(owner instruction)*

Measured in `dogCompanion.ts`:

| scenario | archetypes | lands on | at outposts | NOT at outposts |
|---|---|---|---|---|
| `wagon` | borderlands, camp, open, road, wasteland | 13 | 9 | 4 |
| `cellar` | buried, dungeon, lost_capital, ruin, wasteland | 13 | 3 | **10** |

`cellar` is the offender: `lost_capital`, `buried` and `ruin` put rescues in six capitals,
the Endless Stair, the Sinking Cathedral, the Cradle of Dusk and Iskan-Veil.

**Change:** narrow `cellar`'s archetypes to the outpost-ish set `wagon` already uses. No text
changes — the scenario prose (*"The cellar door clatters open under your hand…"*) reads fine
at an outpost. ⚠ But check `smelter` and `snare` too; only `wagon` and `cellar` were measured.

---

## 5. M4 — The Labyrinth leaves Iskan-Veil

`labyrinth-of-shadows.json` carries `"location": "iskan_veil"`, and the maze's own notes cite
**Iskan-Veil spatial-distortion lore** twice as the reason its corridors connect the way they
do. So this is not a free move — the labyrinth's design is justified by the place.

Text that would have to change:
| File | Current |
|---|---|
| `app/data/maze/labyrinth-of-shadows.json` | `"location": "iskan_veil"` + 2 notes citing Iskan-Veil lore |
| `app/data/items/exploration.json` (~1744) | *"A water-stained fragment of a map to **Iskan-Veil's shifting halls**."* |
| `app/engine/labyrinth.ts` | header: *"the Wayfarer of the Lost Paths challenge engine (Iskan-Veil)"* |
| `app/engine/locationChallenges.ts` | `locationId: 'iskan_veil'` |

⚠ **Recommend NOT doing M4.** The lore justification is load-bearing, `cradle_of_dusk`
already carries two hunt anchors, and Iskan-Veil at 3 is not a real problem once M1–M3 land.
Better alternative: leave it, and accept capital + guardian + labyrinth as an intentional
"this capital is the strange one".

---

## 6. M5 — `etheric_chamber` becomes the Sentinel Ward

The only genuinely dead location in the game — tags `vault, core, guarded`, danger 5, zero
triggers, zero prose references outside its own entry. And `hunt_iron_titan` names *"the
Sentinel Ward (inner archive)"*, a place that does not exist, which is why it is the one hunt
in eighteen that cannot resolve its poster.

**Change:** give `etheric_chamber` the alias `Sentinel Ward` (or rename it outright) so
`resolvePosterLocation` resolves that hunt to a real tile. This is the **cheapest win in the
whole document** — one alias in `locations.json` — and it removes the last biome fallback.

Text needed: a `location-flavors.json` block and a `glossary.json` entry, since the tile has
never been visited by anything and has no ambient voice.

---

## 7. Suggested order

1. **M5** — one alias, no risk, fixes a real dead-end. Do it first and alone.
2. **M3** — data-only, implements a standing owner instruction, no text changes.
3. **M1 (a)** — settle the Grand Spire contradiction. Lore only, no mechanics.
4. **M1 (b)** — the new tile and the climb move. The big one.
5. **M2** — only if the owner confirms capitals should not be outposts; needs a save migration.
6. **M4** — recommend dropping.

## 8. Test coverage this will need

- The great-climb suites (`ota1323RoutedTowerExplainsItself`) assert five climbs and their
  tier counts; the Asgardar entry's `locationId` assertion will move.
- `contractMarkers` / hunt-anchor suites — M5 changes one hunt from fallback to poster-resolved.
- Any suite asserting `hubLocationIds` length or membership (M2).
- A **new** suite for the save migration in M2, in the shape of
  `halOnlySaveMigrationsSurvive`: a save parked inside a removed hub room must land somewhere
  legal.
- ⚠ `atlasCoords` has a uniqueness/spacing expectation — a new tile needs a cell that does not
  collide with Asgardar's pin.

---

# 9. THE ACTIONABLE LIST — one task at a time

Each item below is independently shippable: it can be built, gated and pushed on its own
without any other item being done first, unless it names a dependency. Ordered by value
against risk — the first four are data-only and carry no save risk at all.

## ⚠⚠ THE FINDING THAT SHOULD DRIVE THE ORDER

**97 side missions have no location of their own** — 18 mysteries, 14 storylines, 65 faction
quests. Every one of them pins to one of **10 faction home outposts**. Measured:

| pin tile | side missions |
|---|---|
| varakush | 15 |
| dynasty_border_post, builders_survey_camp | 13 each |
| revivalist_field_camp | 12 |
| reclaimer_stake, monarch_waystation | 9 each |
| pilgrim_waycamp, giant_watch_shrine | 8 each |
| architect_blind | 7 |
| tartarian_outskirts | 3 |

**26 of 36 locations never receive a single side-mission pin** — every Lost Capital, every
great-climb landmark, every challenge site. That, not Asgardar's crowding, is why the map does
not develop.

**And the content is already written for the fix.** 31 of 32 mysteries and storylines NAME a
real, resolvable location in their own poster or stage prose — they simply have no field to
carry it. Routing them by the place they already talk about takes side-mission coverage from
**10 tiles to 27**. No new writing required.

---

### L1 — Give `etheric_chamber` the alias "Sentinel Ward"
**Why:** the only genuinely dead tile in the game, and `hunt_iron_titan` names *"the Sentinel
Ward (inner archive)"* — a place that does not exist, making it the one hunt in eighteen whose
poster cannot resolve and which falls back to `obsidian_pillars`.
**Files:** `app/data/locations/locations.json` (one `aliases` entry).
**Risk:** none. **Test:** `resolvePosterLocation('the Sentinel Ward (inner archive)')` returns
`etheric_chamber`; the biome-fallback count in `huntAnchorId` drops from 1 to 0.
**Done when:** every one of the 18 hunts resolves from its poster.

### L2 — Restrict the `cellar` dog rescue to outposts *(owner instruction)*
**Why:** *"leave dog events at outposts."* `cellar`'s archetypes are `buried, dungeon,
lost_capital, ruin, wasteland` — it fires at 13 locations, only 3 of them outposts. `wagon` is
already 9 of 13 correct.
**Files:** `app/engine/dogCompanion.ts` (one archetype array).
**Risk:** none — no prose change; the cellar-door narration reads fine at an outpost.
**Test:** every rescue scenario's archetype set intersects only outpost-tagged locations.
**Done when:** no dog rescue is eligible at any Lost Capital.

### L3 — Audit the other two rescue scenarios
**Why:** only `wagon` and `cellar` were measured. `smelter` and `snare` were not.
**Files:** `app/engine/dogCompanion.ts`. **Depends on:** L2 (same file, do it in the same pass
or immediately after). **Done when:** all four scenarios are outpost-only.

### L4 — Add `targetLocationName` to the 17 mysteries that already name a place ⭐
**Why:** the single highest-leverage change in this document. The prose already exists; only
the routing field is missing.
**Files:** `app/data/quests/mysteries.json` (one field per entry).
**Risk:** none to saves — a new optional field. **Depends on:** L6 to have any effect on pins.
**Test:** every mystery with the field resolves to a real location id.
**Done when:** 17 of 18 mysteries carry a target. (`mystery_pale_signal` → `mud_flood_nexus`
is the only one whose named place is the terminal Nexus — decide whether that should pin.)

### L5 — Add `targetLocationName` to all 14 storylines
**Why:** same as L4; 14 of 14 already name a place. Several name three or four — **pick the
one the player must actually stand on**, not the first match.
**Files:** `app/data/quests/faction-storylines.json`. **Risk:** none.

### L6 — Teach `contractMarkers` to resolve mystery/storyline targets
**Why:** L4 and L5 are inert without it. The mechanism already exists — `resolvePosterLocation`
+ `huntAnchorId` do exactly this for hunts (OTA-1218). This extends the same two functions to
the other two families, keeping ONE spelling of "where this contract happens".
**Files:** `app/engine/contractMarkers.ts` (`anchorForFaction` becomes a fallback, not the
first answer).
**Risk:** low, display-layer only. **Depends on:** L4 and/or L5 to show any change.
**Test:** the pin, the card's "You're at", and the SET COURSE target all read one value; a
mystery with no target still falls back to its faction home.
**Done when:** side-mission pins land on 27 tiles instead of 10.

### L7 — Close the remaining nine tiles
**Why:** after L4–L6, nine locations still receive nothing: Drakova, Iskan-Veil, Yuldra-Tul,
Thametan's Tower, the Parley Ground, and five faction homes (which are already pinned by their
own faction's work, so they are fine).
**The real gaps are five:** `drakova`, `iskan_veil`, `yuldra_tul`, `thametans_tower`,
`parley_ground`.
**Files:** whichever of the 65 faction quests suit them — 18 already name a location, so start
by giving those 18 a target field (see L16) before writing anything new.
**Risk:** none if it is retargeting; this becomes authoring work only if new missions are wanted.

### L8 — Settle the Grand Spire contradiction *(lore only, no mechanics)*
**Why:** `worldLadder.json` places `grand_spire_etheria` INSIDE Asgardar — *"still throws light
at full power"* — while `grand_spire_of_etheria` is a separate top-level location with its own
climb and its own summit boss. The world says one spire is in two places. **This must be
settled before L9**, which adds a third spire to the same city.
**Recommendation:** rename the ladder micro to the Buried Spire.
**Files:** `app/data/world/worldLadder.json`, `app/data/lore/glossary.json` (entry 234 defines
"a monumental tower in Asgardar" without saying which).
**Risk:** none mechanically. **Done when:** each spire name maps to exactly one tile.

### L9 — Create `asgardar_crown_spire`
**Why:** the Buried Spire needs its own tile, following the `nimari` / `red_tower_of_nimari`
precedent the game already uses.
**Files (all seven are required or the tile renders mute):** `locations.json`,
`engine/atlasCoords.ts`, `engine/worldLadder.ts`, `data/world/worldLadder.json`,
`data/lore/location-flavors.json`, `data/lore/glossary.json`, plus travel-graph checks in
`worldDirections.ts`.
**Depends on:** L8. **Risk:** medium — a new atlas cell must not collide with Asgardar's pin.
**Test:** the tile is reachable, routable, has flavour lines, and appears on the atlas.

### L10 — Move the great climb and Draugveil onto it
**Files:** `app/engine/greatClimbs.ts` — `locationId: 'asgardar'` → `asgardar_crown_spire`.
**Depends on:** L9. **Test:** `ota1323RoutedTowerExplainsItself` — its measured table of five
climbs and their tier counts moves with this; routing to the tower must still produce the
14-tier climb, not a generic one.

### L11 — Retune the climb's match tokens ⚠
**Why:** `asgardar_spire` currently matches on the token `asgardar`. Once two tiles carry that
word, the token will match the capital's own nouns. `interactionTags.ts` already carries a
standing comment warning about *"Spire" containing "asgardar"* — this is that collision, made
live.
**Files:** `app/engine/greatClimbs.ts` (`tokens`), `app/engine/interactionTags.ts`.
**Depends on:** L10. **Test:** climbing a noun at the CITY does not resolve to the great climb.

### L12 — Update the Skyreacher Chart 2 description
**Why:** it says *"plots the route to the buried spire of Asgardar"* and its SET COURSE now
routes to a different tile than the player expects from the wording.
**Files:** `app/data/items/gear.json` (~line 1300). **Depends on:** L10.

### L13 — Decide: should a Lost Capital contain a Reclaimer outpost? ⚠⚠ OWNER CALL
**Why:** `asgardar` and `drakova` are the only two of nine capitals carrying a 15-room hub.
**If yes:** drop this item; Asgardar stops at 4 triggers.
**If no:** remove both ids from `static_hub.json` `hubLocationIds` — a one-line data change
with the **highest save risk in this document**: any character standing inside one of those
rooms when the OTA lands has a `hubRoomId` pointing at a room that no longer exists.
**Required if proceeding:** a migration at the `loadSlotIntoGame` seam (same place as the
OTA-1320 gear backfill) that relocates a stranded player to the capital's open ground, plus a
dedicated suite in the shape of `halOnlySaveMigrationsSurvive`.

### L14 — Labyrinth of Shadows: **recommend NO MOVE**
**Why:** its corridors are justified twice in its own data by Iskan-Veil spatial-distortion
lore, its map item reads *"a map to Iskan-Veil's shifting halls"*, and the engine file is
titled for the place. Cradle of Dusk already carries two hunt anchors. Iskan-Veil at 3 is not
a problem once L1–L13 land.
**Action:** record the decision and close it, or override with the four text changes listed in
§5 of this document.

### L15 — Hunts still do not require you to go where they say
**Why:** separate from everything above, but the same family. A hunt names a destination on its
poster and its stages advance on matching ACTIONS anywhere — you can finish the Red Tower hunt
without leaving the outpost. The anchor exists (`huntAnchorId`); nothing gates on it.
**Files:** the hunt stage-advance path in `gameStore.ts`.
**Risk:** medium — this is a difficulty/pacing change, not a bug fix. **Owner call.**

### L16 — Give the 18 location-naming faction quests a target
**Why:** 18 of 65 already name a real place (varakush ×8, buried_cities ×7, mud_seas ×3, and
five more). The other 47 are genuinely placeless and should keep the faction-home fallback.
**Files:** `app/data/quests/faction-quests.json`, `app/engine/contractMarkers.ts`.
**Depends on:** L6. **Feeds:** L7.

---

## 10. Suggested sequence

**Wave 1 — free wins, no risk, ship individually:** L1 → L2 → L3
**Wave 2 — the map opens up:** L4 → L5 → L6 → L16 → L7
**Wave 3 — Asgardar splits:** L8 → L9 → L10 → L11 → L12
**Wave 4 — owner decisions:** L13, L14, L15

Wave 2 is where the exploration payoff is: it triples the number of tiles the contract board
sends a player to, and it needs no new prose, no new locations and no save migration.


---

# 11. ⚠⚠ OWNER RULINGS — these supersede the scoping above

Two rulings that change how this document should be read.

## 11.1 "Anything that isn't the 9 cores mission is a side mission"

The plan above treated hunts, great climbs, location challenges and title challenges as
separate categories from "side missions". They are not. **The main quest is the nine Cores and
the Nexus. Everything else is a side mission**, which means the coverage problem in §9 is
bigger than stated there, not smaller.

Restating the map under the correct definition — every trigger EXCEPT the ten main-quest
entries (9 capitals + Nexus):

| side-mission system | count | bound to a place? |
|---|---|---|
| faction quests | 65 | ✗ — faction home fallback |
| hunts | 18 | ✓ — poster-resolved (fixed at OTA-1218; L1 closed the last gap) |
| mysteries | 18 | ✗ — faction home fallback |
| storylines | 14 | ✗ — faction home fallback |
| great climbs | 5 | ✓ |
| summit bosses | 5 | ✓ |
| location challenges | 6 | ✓ |
| title challenges | 3 | ✓ (same ids as three of the six above) |
| dog rescues | 4 | ✓ outposts only, as of OTA-1326 |

**97 of 138 side missions have no location of their own** — and all 97 are the quest families.
The place-bound ones are already fine. So §9's Wave 2 is not one improvement among several;
it is **the** side-mission distribution problem, and L4/L5/L6/L16 are the whole fix.

## 11.2 "The great climbs should be at locations all their own"

Stronger than M1, which only moved Asgardar. Measured against the ruling, **three of the five
climbs share their tile with something else**:

| climb | tile | shares with |
|---|---|---|
| Grand Spire of Etheria | `grand_spire_of_etheria` | ✓ own tile (summit boss only) |
| Thametan's Tower | `thametans_tower` | 1 hunt |
| **Buried Spire of Asgardar** | `asgardar` | **capital + Core Guardian + outpost hub** |
| **Great Obsidian Monolith** | `obsidian_pillars` | **2 hunts** |
| **Great Fang of Zharak** | `zharaks_teeth` | **2 hunts** |

A climb's own summit boss is not a collision — it is part of the climb. The hunts are the
question. Under the ruling there are two readings, and they need a decision before L9:

- **(A) Strict** — a climb tile hosts the climb and nothing else. The 5 hunts anchored on
  `thametans_tower`, `obsidian_pillars` and `zharaks_teeth` move to neighbouring tiles, which
  means rewriting five hunt posters that name those places by name.
- **(B) Practical** — a climb tile hosts no other *system*; hunts may still point there,
  because a hunt is a reason to visit and visiting is the goal. Only Asgardar violates this,
  and M1/L9 already fixes it.

**Recommend (B).** Under (A) the five posters would have to stop naming the landmark the
player is being sent to, which re-creates the exact defect L1 just closed. Under (B) the
ruling is satisfied by L9 alone.

⚠ **If (A) is wanted**, add these to the list: rewrite `hunt_mud_golem_thametan`,
`hunt_iron_spider_obsidian`, `hunt_steam_walker_zharak`, `hunt_mud_siren_queen` and
`hunt_iron_titan` posters, and re-point their `targetLocationName` — five prose edits plus
five data edits, with the same seamlessness pass this document asks for elsewhere.
