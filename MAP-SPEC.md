# MAP SPEC — everything needed to draw a new Tartaria atlas

**Purpose:** a complete, measured brief for an AI image generator (or a human
cartographer). Every number here is read from the shipped game data, not from the
existing artwork.

⚠⚠ **WORLD FIRST, ART SECOND.** Owner's ruling. The current art was commissioned after the
world was laid out, and it paints a *different* arrangement — measured drift against the
live art is a **median 5.8 tiles, worst 27 tiles**, with only **1 of 19** labelled places
within a tile of where the game thinks it is. The world is the tuned thing (travel times,
deadlines, long-haul pay all derive from it), so **the new art must be drawn to match these
coordinates.** Do not adjust the world to match a picture.

⚠ **Why that matters more than it sounds:** in this codebase one number does two jobs.
`LOCATION_ATLAS_COORDS` fractions feed `canonicalCellFor()`, which produces each place's
**gameplay grid cell** — the thing travel distance is computed from:

```
x = 41 + round((fx − 0.5) × 40)
y = 20 + round((fy − 0.5) × 22)
```

So a coordinate is not decoration. Move one and you have changed how far the player walks.

---

## 1. Canvas

| | |
|---|---|
| **Canvas size** | **2400 × 1200 px** (2.00 : 1) |
| Current art, for reference | 1774 × 887 px (2.00 : 1) — same aspect, so nothing downstream changes |
| **Ground field** (where the world is drawn) | x **120 → 2280**, y **60 → 1140** — i.e. **2160 × 1080**, a 120 px left/right and 60 px top/bottom frame |
| Orientation | Landscape. North = up. A compass rose belongs bottom-left. |

**Pixel formula** — this is the whole mapping, and every position in §4 already has it applied:

```
fx = 0.5 + (gridX − 41) / 40          px = 120 + fx × 2160
fy = 0.5 + (gridY − 20) / 22          py =  60 + fy × 1080
```

⚠ **The decorative frame, the title cartouche, the danger legend and the faction panel must
be painted ON TOP of the terrain, inside the canvas — not as reserved margins that push the
ground inward.** The current art reserves a left stripe for its title block, which forced a
fudge in the draw code (`insetGroundFx`). Drawing the terrain edge-to-edge and floating the
cartouches over it lets that fudge be deleted.

---

## 2. The grid

| | |
|---|---|
| Full playfield | 82 columns × 41 rows |
| **Actually occupied** | **x 23 → 58** (36 cols), **y 11 → 31** (21 rows) |
| Grid centre | (41, 20) — this is fx 0.5, fy 0.5, the dead centre of the canvas |
| One tile ≈ | **54 px horizontally**, **51 px vertically** at 2400 × 1200 |

The world sits in the middle of a larger notional field; the unoccupied margin is where
runtime-born places (whisper targets, discovered sites) can appear. **Do not draw grid lines** —
the grid is math, the map is a painting. Distances are read by the game, not by the player.

---

## 3. Danger tiers — the concentric rings

The map's defining visual is a **bullseye of danger** radiating out from the Mud Flood Nexus.
This is canon and must be preserved: colour temperature rises toward the centre.

| Tier | Name | Ring colour | What lives there |
|---|---|---|---|
| **1** | CALM | deep green | Foraging, scrap, lone scavengers |
| **2** | UNEASY | yellow-green | Common enemies. Frontier outposts and approaches |
| **3** | DANGEROUS | amber | Packs and Uncommon foes. Deep frontier and enclaves |
| **4** | DEADLY | orange | Rare enemies, ambushes. Shallower capitals |
| **5** | LETHAL | red / molten | Legendary monsters, Core Guardians. The deep capitals and the Nexus |

**Distribution across the 38 locations:** thirteen at tier 5, eight at 4, three at 3, eleven
at 2, one at 1 (Varakush — the only genuinely safe stronghold).

⚠ The rings are **not** concentric circles around the canvas centre. They centre on the
**Mud Flood Nexus at grid (55,30) — px 1956, 1091** — which sits low and right. The green
frontier band therefore crowds the top and left of the map, and the molten core sits toward
the bottom-right. That asymmetry is the point: the frontier is where people still live.

---

## 4. Every location

🆕 = new in this revision · ➡️ = moved in this revision

| # | Location | Grid | Pixel (2400×1200) | D | Region | Type |
|---|---|---|---|---|---|---|
| 1 | **The Monarch's Waystation** | (27,11) | 444, 158 | 2 | The Borderlands | region |
| 2 | **Dynasty Border Post** | (30,11) | 606, 158 | 2 | The Borderlands | region |
| 3 | **Tartarian Pilgrim Camp** | (34,11) | 822, 158 | 2 | The Borderlands | region |
| 4 | **Builders' Survey Camp** | (37,11) | 984, 158 | 2 | The Borderlands | region |
| 5 | **Giant-Watch Shrine** | (43,11) | 1308, 158 | 2 | The Borderlands | region |
| 6 | **Revivalist Field Camp** | (49,11) | 1632, 158 | 2 | The Borderlands | region |
| 7 | **Tartarian Outskirts** | (25,12) | 336, 207 | 2 | The Borderlands | region |
| 8 | **Sinking Cathedral** | (35,12) | 876, 207 | 5 | The Silt Wastes | ruin |
| 9 | **Reclaimer's Stake** | (23,13) | 228, 256 | 2 | The Borderlands | region |
| 10 | **The Architect's Blind** | (25,13) | 336, 256 | 2 | The Borderlands | region |
| 11 | **Great Tartary Plains** | (40,13) | 1146, 256 | 4 | The Silt Wastes | region |
| 12 | **Cradle of Dusk** | (46,13) | 1470, 256 | 4 | The Aetherstone Deep | region |
| 13 | **Yuldra-Tul** | (56,13) | 2010, 256 | 5 | The Lost Capitals | lost_capital |
| 14 | **The Buried Cities** | (33,14) | 768, 305 | 4 | The Silt Wastes | region |
| 15 | **Mud Seas** | (49,14) | 1632, 305 | 4 | The Silt Wastes | region |
| 16 | **Zharak's Teeth** | (42,15) | 1254, 355 | 3 | The Aetherstone Deep | formation |
| 17 | **The Hidden Market** ⚠ | (47,15) | 1524, 355 | 2 | *(no region — see §11)* | settlement |
| 18 | **Iskan-Veil** | (24,16) | 282, 404 | 5 | The Lost Capitals | lost_capital |
| 19 | **Obsidian Pillars** | (36,16) | 930, 404 | 3 | The Aetherstone Deep | formation |
| 20 | **The Parley Ground** | (47,17) | 1524, 453 | 2 | The Borderlands | neutral_ground |
| 21 | **The Sunken Enclave** | (31,18) | 660, 502 | 3 | The Subterranean Empire | settlement |
| 22 | **Ostragar** | (58,18) | 2118, 502 | 4 | The Lost Capitals | lost_capital |
| 23 | **Asgardar** | (27,19) | 444, 551 | 5 | The Lost Capitals | buried_capital |
| 24 | **Drakova** | (52,19) | 1794, 551 | 5 | The Lost Capitals | lost_capital |
| 25 | **Samarran** | (32,20) | 714, 600 | 5 | The Lost Capitals | buried_city |
| 26 | **Nimari** | (41,20) | 1200, 600 | 4 | The Lost Capitals | partially_buried_city |
| 27 | **Grand Spire of Asgardar** 🆕 | (27,21) | 444, 649 | 5 | The Lost Capitals | tower |
| 28 | **Voronov** | (52,21) | 1794, 649 | 4 | The Silt Wastes | buried_city |
| 29 | **Thametan's Tower** | (34,22) | 822, 698 | 5 | The Lost Capitals | tower |
| 30 | **Red Tower of Nimari** | (42,22) | 1254, 698 | 5 | The Lost Capitals | tower |
| 31 | **Varakush** | (32,25) | 714, 845 | 1 | The Subterranean Empire | stronghold |
| 32 | **Karok-Sa** | (38,25) | 1038, 845 | 5 | The Lost Capitals | lost_capital |
| 33 | **Endless Stair** | (45,26) | 1416, 895 | 4 | The Aetherstone Deep | ruin |
| 34 | **The Giant Vault** | (52,28) | 1794, 993 | 5 | The Aetherstone Deep | vault |
| 35 | **Aetheric Chamber** | (56,28) | 2010, 993 | 5 | The Aetherstone Deep | vault |
| 36 | **Mud Flood Nexus** | (55,30) | 1956, 1091 | 5 | The Aetherstone Deep | control_center |
| 37 | **Grand Spire of Etheria** ➡️ | (53,31) | 1848, 1140 | 5 | The Aetherstone Deep | tower |
| 38 | **The Black Reach** 🆕 | (55,31) | 1956, 1140 | 5 | The Aetherstone Deep | chasm |

---

## 5. Named regions the art must letter

These are the painted band labels. ⚠ **Three of the five on the current art exist nowhere in
the game data** — they are art-only and should be treated as flavour bands, not places.

| Band | Subtitle | In game data? | Where it lies |
|---|---|---|---|
| **THE BORDERLANDS** | Frontier Edge | ✅ yes | The green top band, y 11–13 |
| **THE SUNKEN MIDDENS** | Deep Frontier | ✅ yes | Below the Borderlands, y 13–15 |
| **THE SILT WASTES** | The Drowned Heart | ✅ yes | The orange middle, y 15–20 |
| **THE DROWNED VALE** | Forgotten Enclaves | ❌ art only | Left flank, around x 24–31 |
| **THE CRUSHED SPIRES** | Ancient Highlands | ❌ art only | Right flank, around x 52–58 |
| **THE BLACK REACH** | The Deep Below | 🆕 **now a real place** | Bottom centre-right, grid (55,31) |

**Macro regions the game actually models** (these drive the "In the Lost Capitals" line the
player reads):

- **The Borderlands** — 10 locations, the safe frontier arc across the top
- **The Silt Wastes** — 5, the drowned middle
- **The Lost Capitals** — 11, the buried cities and their towers
- **The Aetherstone Deep** — 9, the technological mantle beneath everything
- **The Subterranean Empire** — 2, the living underground

---

## 6. What changed in this revision

**🆕 THE BLACK REACH — grid (55,31), px 1956 · 1140, danger 5**
The southernmost point on the map, directly below the Mud Flood Nexus. A second way down
into the Aetherstone Deep, opening onto the **Giantkin Mausoleum** (which exists in the game
as an interior area with no surface entrance — this gives it one). Visually: the terrain
should *run off the bottom edge of the frame here* — a chasm the map cannot contain. The
Deep Below is not a place you see across, it is a place you fall into.

**➡️ GRAND SPIRE OF ETHERIA — moves from (27,21) to grid (53,31), px 1848 · 1140**
Two tiles west of the Black Reach. It leaves the Lost Capitals for the **Aetherstone Deep**,
which is where its own description always put it: *"a tower that drew Aether from celestial
realms, venting its waste heat into the black between the stars."* That is power-grid
architecture — it belongs beside the way down into the grid, not among the buried cities.
Fifteen tiers, the tallest climb in the game. Draw it enormous and leaning.

**🆕 GRAND SPIRE OF ASGARDAR — grid (27,21), px 444 · 649** *(taking the vacated tile)*
Asgardar's own crown-spire, two tiles south of the capital — on the outskirts, as instructed,
"known to be at Asgardar but outside the city." Fourteen tiers. Where the Etheria spire is a
skyward antenna, this one is a **buried** tower whose crown breaks the silt-line: most of it
is underground and you climb what's left standing.

⚠ Two spires now share the "Grand Spire of ___" naming. If that reads as one tower named
twice on the finished art, rename the *second* one — do not merge them. They are separate
climbs with separate summit rewards.

---

## 7. Location-by-location brief

Each entry: what it is, how dangerous, which region, where to put it, and one line of lore
for the artist.

**The Monarch's Waystation** — *danger 2 · region · The Borderlands* · grid (27,11) · px 444,158
> A frontier toll-court of the Mud Monarchs, last ordered ground before the buried capitals. Banners hang stiff with silt; a seneschal logs every traveler who passes toward the deeper cities.

**Dynasty Border Post** — *danger 2 · region · The Borderlands* · grid (30,11) · px 606,158
> An old garrison of the Eternal Dynasty kept lit at the edge of the ruins. The oath-stones are still standing; the road past them runs down into the flooded capitals.

**Tartarian Pilgrim Camp** — *danger 2 · region · The Borderlands* · grid (34,11) · px 822,158
> A rest-camp of True Tartarian pilgrims on the frontier track, where the faithful gather before the long descent into the deep buried cities.

**Builders' Survey Camp** — *danger 2 · region · The Borderlands* · grid (37,11) · px 984,158
> A Stone Builders' survey staging post — theodolite stakes, chalked plans, and stacked shoring timber at the safe edge of the ruin-field before the works run deep.

**Giant-Watch Shrine** — *danger 2 · region · The Borderlands* · grid (43,11) · px 1308,158
> A roadside vigil-shrine of the Servants of the Giants at the frontier, where keepers wait and watch before the long road down to the giant vaults.

**Revivalist Field Camp** — *danger 2 · region · The Borderlands* · grid (49,11) · px 1632,158
> A Revivalist dig-and-press camp pitched at the lip of the wastes. Crates of equipment, a printing trestle, and a map-board marking the capitals they mean to make headlines of.

**Tartarian Outskirts** — *danger 2 · region · The Borderlands* · grid (25,12) · px 336,207
> Borderlands around buried cities. Littered with traps, dormant defenses, and clues. A reasonable place for a new expedition to die.

**Sinking Cathedral** — *danger 5 · ruin · The Silt Wastes* · grid (35,12) · px 876,207
> Only the steeple remains above the mud. Said to contain a powerful artifact. None who enter return.

**Reclaimer's Stake** — *danger 2 · region · The Borderlands* · grid (23,13) · px 228,256
> A Reclaimers' Guild salvage-stake driven into the frontier mud: claim-posts, a tally-board of marked ruins, and a winch rig for hauling up whatever the wastes give. The expedition launches from here.

**The Architect's Blind** — *danger 2 · region · The Borderlands* · grid (25,13) · px 336,256
> A Conspiracy of Architects observation-blind disguised as a collapsed waystation. Behind the false rubble: a map-wall of routes the public must never connect, and a quiet door onto the road.

**Great Tartary Plains** — *danger 4 · region · The Silt Wastes* · grid (40,13) · px 1146,256
> A vast Aetheric-charged expanse covering ancient Tartaria. Magnetic anomalies, Aetheric storms, time dilation. Ground zero for the cataclysm.

**Cradle of Dusk** — *danger 4 · region · The Aetherstone Deep* · grid (46,13) · px 1470,256
> A pocket within the Mud Seas where the sky glows with residual Aether. Wrecks of ships and frozen statues of their crews litter the ground.

**Yuldra-Tul** — *danger 5 · lost_capital · The Lost Capitals* · grid (56,13) · px 2010,256
> A northeastern mountain Lost Capital. Frost-wreathed, the gate-city to the Giants' tombs. The Servants of Giants kept the long vigil here before the Flood — the Core sleeps under a cold-stone in the deep keep.

**The Buried Cities** — *danger 4 · region · The Silt Wastes* · grid (33,14) · px 768,305
> Tartaria's most powerful secrets, sealed under Aetherstone. Time distortions and magnetic anomalies make every step a gamble.

**Mud Seas** — *danger 4 · region · The Silt Wastes* · grid (49,14) · px 1632,305
> Shallow, murky waters covering Tartarian ruins. Currents are unpredictable, storms catastrophic, the creatures within mutated.

**Zharak's Teeth** — *danger 3 · formation · The Aetherstone Deep* · grid (42,15) · px 1254,355
> Towering spires jutting from shallow waters. Beautiful architecture, deadly mud sirens.

**The Hidden Market** — *danger 2 · settlement · (unassigned)* · grid (47,15) · px 1524,355
> A neutral-ground bazaar that does not advertise itself — four canvas stalls pitched in a wind-scoured hollow of the Sunken Middens, out past the frontier camps. Agents of every faction trade here under an unspoken truce; the…

**Iskan-Veil** — *danger 5 · lost_capital · The Lost Capitals* · grid (24,16) · px 282,404
> A far-northwestern Lost Capital. The Conspiracy Architects' hidden city — a maze of false doors and overlaid corridors. Every map of Iskan-Veil is wrong by design; the true Core seat is behind the door you didn't see.

**Obsidian Pillars** — *danger 3 · formation · The Aetherstone Deep* · grid (36,16) · px 930,404
> Black, magnetically charged spires rising from the mud near a former Tartarian observatory. Disrupt all technology.

**The Parley Ground** — *danger 2 · neutral_ground · The Borderlands* · grid (47,17) · px 1524,453
> A weathered ring of standing stones on contested flats where rival factions meet under truce. No faction holds it; banners change with the season. A place for envoys, brokers, and uneasy bargains.

**The Sunken Enclave** — *danger 3 · settlement · The Subterranean Empire* · grid (31,18) · px 660,502
> A deep, self-sufficient True Tartarian enclave hollowed beneath the Buried Cities — Aethercraft-shaped mud walls, ancestor-shrines to the fallen Giants, and Seekers who venture the labyrinthine tunnels for relics and…

**Ostragar** — *danger 4 · lost_capital · The Lost Capitals* · grid (58,18) · px 2118,502
> An eastern wetland Lost Capital. The Eternal Dynasty's river city — half-submerged in slow current, the Core seat ringed by a still pool the Riverbinder bound to the housing with a cantor's chord.

**Asgardar** — *danger 5 · buried_capital · The Lost Capitals* · grid (27,19) · px 444,551
> The ancient capital of Tartaria. Home of the Grand Spire of Etheria, which once channeled cosmic Aether into the city grid.

**Drakova** — *danger 5 · lost_capital · The Lost Capitals* · grid (52,19) · px 1794,551
> A legendary Lost Capital, sealed beneath Aetherstone mud. Believed to hold an intact Aetheric Core.

**Samarran** — *danger 5 · buried_city · The Lost Capitals* · grid (32,20) · px 714,600
> A research hub of Tartaria. Home of Thametan's Tower and the Aetheric Engine whose malfunction triggered the Great Mud Flood.

**Nimari** — *danger 4 · partially_buried_city · The Lost Capitals* · grid (41,20) · px 1200,600
> Half-swallowed. The Red Tower of Nimari is rumored to house one of the last operational Aetheric Cores.

**Grand Spire of Asgardar** — *danger 5 · tower · The Lost Capitals* · grid (27,21) · px 444,649
> Asgardar's own crown-spire, breaking the silt-line two tiles south of the buried capital.

**Voronov** — *danger 4 · buried_city · The Silt Wastes* · grid (52,21) · px 1794,649
> A significant Tartarian city deeply scarred by the Mud Flood. Rumored to hide intact remnants of Tartarian technology.

**Thametan's Tower** — *danger 5 · tower · The Lost Capitals* · grid (34,22) · px 822,698
> Houses the catastrophic Aetheric Engine. Site of Elior Zalmar's final resonance cascade — the day the vibration shook the radiators' vacuum seals apart and the trapped heat, with nowhere left to vent, poured down into the…

**Red Tower of Nimari** — *danger 5 · tower · The Lost Capitals* · grid (42,22) · px 1254,698
> Believed to contain a functional Aetheric Core. A critical objective for every faction.

**Varakush** — *danger 1 · stronghold · The Subterranean Empire* · grid (32,25) · px 714,845
> Hidden base of the Forgotten Order, perched on the edge of the Great Tartary Plains. Library, workshop, refuge.

**Karok-Sa** — *danger 5 · lost_capital · The Lost Capitals* · grid (38,25) · px 1038,845
> A southern Lost Capital. The Forgotten Order's ritual seat — halls of binding-sigils carved into black basalt, the Core kept under a chain of seals only a Sealwarden can read.

**Endless Stair** — *danger 4 · ruin · The Aetherstone Deep* · grid (45,26) · px 1416,895
> A vast staircase descending into mud, terminating beneath an impassable Aetheric disturbance. No one has reached its bottom.

**The Giant Vault** — *danger 5 · vault · The Aetherstone Deep* · grid (52,28) · px 1794,993
> Ancient vault rumored to hold the last resting place of the Tartarian Giants. Are they sleeping, or imprisoned?

**Aetheric Chamber** — *danger 5 · vault · The Aetherstone Deep* · grid (56,28) · px 2010,993
> The primary power source and control hub for Tartarian technology, buried deep. Guarded by ancient automatons and Aetheric traps.

**Mud Flood Nexus** — *danger 5 · control_center · The Aetherstone Deep* · grid (55,30) · px 1956,1091
> The subterranean control center believed to have regulated the disaster itself. Touching it might mean rebirth — or a second flood.

**Grand Spire of Etheria** — *danger 5 · tower · The Aetherstone Deep* · grid (53,31) · px 1848,1140
> ⚠ **Its shipped description still opens "a monumental tower in Asgardar" — that line is now
> wrong and must be rewritten in the game data as part of this move.** For the artist, draw
> it as: a monumental tower that drew Aether from the celestial realms, harvesting the sun and
> the cold night sky at once and venting its waste heat through vacuum-sealed radiators into
> the black between the stars — one of the most powerful Aetheric structures ever built,
> standing alone at the lip of the Deep. Fifteen tiers. The tallest thing on the map.

**The Black Reach** — *danger 5 · chasm · The Aetherstone Deep* · grid (55,31) · px 1956,1140
> The Deep Below. A second way down into the Aetherstone Deep, opening onto the Giantkin Mausoleum.


---

## 8. Nine factions (for the legend panel)

Mud Monarchs · Eternal Dynasty · Reclaimers' Guild · Forgotten Order · True Tartarians ·
Stone Builders · Servants of the Giants · Conspiracy of Architects · Tartarian Revivalists

Each has a sigil in the current art's right-hand panel. Keep that panel — it earns its space.

---

## 9. House style

- **Palette:** aged parchment and soot. Gold `#c9a86a` for lettering and rules; grounds in
  `#0a0908` → `#17150f` → `#2a1f12`; text in `#f0e6cc` / `#e6d8b3` / `#a2977b`.
- **Feel:** a survivor's reference map, not a fantasy poster. Hand-inked, water-stained,
  annotated. It should look like something carried in a pack for years.
- **Settlements** are drawn as clustered towers and domes half-swallowed by silt.
  **Outposts** are tents and staked banners. **Towers** stand alone and lean.
  **Vaults and chasms** are openings in the ground, not buildings.
- **Numbered markers:** the game overlays its own pins at runtime — small numerals in the
  same weight as the existing `?` marker. Leave the terrain readable beneath each position
  in §4; don't paint a detail there that a marker would obscure.
- **Do not letter the location names into the art.** The current map does, and it is why the
  art and the world drifted apart invisibly. Names come from the game.

---

## 10. Checklist before accepting a render

- [ ] 2400 × 1200, terrain edge to edge, cartouches floating over it
- [ ] Every position in §4 lands on plausible ground — no city in open water, no tower in a lake
- [ ] Danger rings centre on the Mud Flood Nexus at px 1956 · 1091, not on the canvas centre
- [ ] The Black Reach runs off the bottom edge
- [ ] The five band labels are lettered; **no location names are**
- [ ] Compass rose bottom-left, danger legend left, faction panel right

---

## 11. ⚠ Two data gaps this spec uncovered

Neither blocks the artwork, but both should be fixed in the game.

1. **The Hidden Market belongs to no macro region.** Every other location maps to one of the
   five in `LOCATION_TO_MACRO`; this one doesn't, so the player's "In the Lost Capitals…"
   whereabouts line comes up blank there. It is the map's hidden location, so it may be
   deliberate — but nothing in the code says so, which means it reads as an oversight either
   way. ⚠ On the art it should stay **unmarked**: the game reveals it with its own `?` glyph
   and spoiling it in the terrain would undo that.

2. **Three painted region names exist only in the art** — The Drowned Vale, The Crushed
   Spires, and (until this revision) The Black Reach. The map promises five named regions and
   the engine knows two and a half. Either give them real entries or accept them as pure
   flavour bands; right now a player who reads a name off the map can't find it in the game.
