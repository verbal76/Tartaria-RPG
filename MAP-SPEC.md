# TARTARIA ATLAS — ARTWORK HAND-OFF SPEC

**This document is the complete brief for generating a new world map.** Everything in it is
measured from the shipped game data. Hand it to an image generator or a cartographer as-is.

---

## ⚠⚠ READ FIRST — THE FIVE RULES

1. **NO TEXT ON THE MAP.** No title block. No legend. No danger key. No faction panel. No
   compass rose. No location names. No region names. **No lettering of any kind.** The map is
   pure terrain, edge to edge. Every label the player sees is drawn by the game on top.
2. **NO NUMBERS ON THE MAP.** The game overlays its own numbered markers at run time. Any
   numeral painted into the art will collide with them.
3. **The world is fixed. The art must fit it.** Every coordinate below is load-bearing — it
   drives travel distance in the game, not just where a dot sits. Do not move a location to
   improve the composition.
4. **Terrain fills the whole canvas.** No border, no frame, no vignette that eats the edges.
   The world runs to all four sides.
5. **Leave the marked positions readable.** A marker will be drawn at each pixel coordinate.
   Don't put a bright highlight or fine detail exactly there.

---

## 1. CANVAS AND GRID

| | |
|---|---|
| **Canvas size** | **2400 × 1440 px** |
| Aspect | 5 : 3 (1.667) |
| **Tile size** | **60 × 60 px** — square |
| Grid covered by the canvas | 40 columns × 24 rows |
| **Grid occupied by the world** | **x 23 → 58** (36 cols) · **y 11 → 31** (21 rows) |
| Terrain used | x **120 → 2220 px** · y **120 → 1320 px** |
| Empty margin | 120 px left · 180 px right · 120 px top · 120 px bottom |

⚠ The margin is *world*, not frame — it should be painted terrain (open silt, broken ground,
water) that simply has nothing on it. Do not treat it as a border.

**Coordinate formula** (already applied to every position in §4):

```
px = (gridX − 21) × 60          py = (gridY − 9) × 60
```

North is up. West is left. The map is a top-down survey, not an isometric view.

---

## 2. WHAT THIS WORLD IS

A drowned continent. An empire buried by a flood of mud and Aether five centuries ago, and
the people picking over it now. Three layers stacked vertically:

- **The surface** — silt plains, half-swallowed ruins, frontier camps where people still live.
- **The buried cities** — capitals drowned with their courts intact, towers breaking the
  silt-line, streets full to the second storey.
- **The Aetherstone Deep** — the technological mantle underneath everything, where the
  original power cores still pulse behind ancient automated defences.

The map shows the surface. The deep announces itself through what breaks the surface: vents,
chasms, towers, and the glow of something still running underground.

---

## 3. THE DANGER BANDS — NORTH TO SOUTH

⚠⚠ **This is a north-to-south gradient, NOT a bullseye.** Measured against the shipped danger
ratings, danger correlates with row at **r = +0.56** and with distance from the map's centre
at only **r = −0.48**. Earlier drafts of this document described concentric rings around a
central point; the data does not support that and it has been corrected here.

Safe country is the **top of the map**. It gets worse as you go **down**.

| Band | Name | Grid rows | Pixel rows (y) | Locations | Mean danger |
|---|---|---|---|---|---|
| **A** | THE BORDERLANDS — *Frontier Edge* | 11 – 13 | 120 – 240 | 13 | 2.8 |
| **B** | THE SUNKEN MIDDENS — *Deep Frontier* | 14 – 18 | 300 – 540 | 9 | 3.3 |
| **C** | THE SILT WASTES — *The Drowned Heart* | 19 – 22 | 600 – 780 | 8 | 4.8 |
| **D** | THE BLACK REACH — *The Deep Below* | 25 – 31 | 960 – 1320 | 8 | 4.4 |

**Palette by band** — colour temperature rises southward:

| Band | Ground tone | Feel |
|---|---|---|
| **A** rows 11–13 | mossy green, pale ochre | Living country. Tents, banners, tracks, standing water that reflects sky. |
| **B** rows 14–18 | yellow-ochre into amber | Drying out. Ruin fields, salt crusts, the first real wreckage. |
| **C** rows 19–22 | burnt orange, rust | The drowned heart. Towers and domes half-buried, streets full of silt. |
| **D** rows 25–31 | deep red into molten black | The Deep Below. Fissures, heat-glow from beneath, ground that has cracked open. |

⚠ **Rows 23, 24, 27 and 29 contain nothing at all.** These are natural empty bands — use them
as the visual seams between the four zones. Rows 23–24 in particular are the break between
the buried capitals and the Deep, and should read as a barrier: a scarp, a flood-line, a
change in the ground itself.

### The four places that break the gradient

These are deliberate and the art must show them:

| Location | Grid | Why it breaks the pattern |
|---|---|---|
| **Sinking Cathedral** | (35,12) | Danger 5 sitting in the green frontier band. A lethal ruin in safe country — it should look *wrong* for its surroundings, dark and sunken where everything near it is alive. |
| **Yuldra-Tul** | (56,13) | Danger 5 at the top-right edge. A frost-bitten mountain capital; cold where the rest of the band is warm. |
| **Iskan-Veil** | (24,16) | Danger 5 on the western flank, far from the Deep. Hidden, mazed, wrong-angled. |
| **Varakush** | (32,25) | **Danger 1 — the only safe place on the map** — and it sits deep in band D. A lit stronghold in bad country. It should be the one warm point below the capitals. |

---

## 4. EVERY LOCATION — 38 POSITIONS

🆕 new · ➡️ moved

| # | Location | Grid (x,y) | Pixel (x,y) | Danger | Band | Region | Type |
|---|---|---|---|---|---|---|---|
| 1 | **The Monarch's Waystation** | (27,11) | 360, 120 | 2 | A | Borderlands | region |
| 2 | **Dynasty Border Post** | (30,11) | 540, 120 | 2 | A | Borderlands | region |
| 3 | **Tartarian Pilgrim Camp** | (34,11) | 780, 120 | 2 | A | Borderlands | region |
| 4 | **Builders' Survey Camp** | (37,11) | 960, 120 | 2 | A | Borderlands | region |
| 5 | **Giant-Watch Shrine** | (43,11) | 1320, 120 | 2 | A | Borderlands | region |
| 6 | **Revivalist Field Camp** | (49,11) | 1680, 120 | 2 | A | Borderlands | region |
| 7 | **Tartarian Outskirts** | (25,12) | 240, 180 | 2 | A | Borderlands | region |
| 8 | **Sinking Cathedral** | (35,12) | 840, 180 | 5 | A | Silt Wastes | ruin |
| 9 | **Reclaimer's Stake** | (23,13) | 120, 240 | 2 | A | Borderlands | region |
| 10 | **The Architect's Blind** | (25,13) | 240, 240 | 2 | A | Borderlands | region |
| 11 | **Great Tartary Plains** | (40,13) | 1140, 240 | 4 | A | Silt Wastes | region |
| 12 | **Cradle of Dusk** | (46,13) | 1500, 240 | 4 | A | Aetherstone Deep | region |
| 13 | **Yuldra-Tul** | (56,13) | 2100, 240 | 5 | A | Lost Capitals | lost_capital |
| 14 | **The Buried Cities** | (33,14) | 720, 300 | 4 | B | Silt Wastes | region |
| 15 | **Mud Seas** | (49,14) | 1680, 300 | 4 | B | Silt Wastes | region |
| 16 | **Zharak's Teeth** | (42,15) | 1260, 360 | 3 | B | Aetherstone Deep | formation |
| 17 | **The Hidden Market** | (47,15) | 1560, 360 | 2 | B | — | settlement |
| 18 | **Iskan-Veil** | (24,16) | 180, 420 | 5 | B | Lost Capitals | lost_capital |
| 19 | **Obsidian Pillars** | (36,16) | 900, 420 | 3 | B | Aetherstone Deep | formation |
| 20 | **The Parley Ground** | (47,17) | 1560, 480 | 2 | B | Borderlands | neutral_ground |
| 21 | **The Sunken Enclave** | (31,18) | 600, 540 | 3 | B | Subterranean Empire | settlement |
| 22 | **Ostragar** | (58,18) | 2220, 540 | 4 | B | Lost Capitals | lost_capital |
| 23 | **Asgardar** | (27,19) | 360, 600 | 5 | C | Lost Capitals | buried_capital |
| 24 | **Drakova** | (52,19) | 1860, 600 | 5 | C | Lost Capitals | lost_capital |
| 25 | **Samarran** | (32,20) | 660, 660 | 5 | C | Lost Capitals | buried_city |
| 26 | **Nimari** | (41,20) | 1200, 660 | 4 | C | Lost Capitals | partially_buried_city |
| 27 | **Grand Spire of Asgardar** 🆕 | (27,21) | 360, 720 | 5 | C | Lost Capitals | tower |
| 28 | **Voronov** | (52,21) | 1860, 720 | 4 | C | Silt Wastes | buried_city |
| 29 | **Thametan's Tower** | (34,22) | 780, 780 | 5 | C | Lost Capitals | tower |
| 30 | **Red Tower of Nimari** | (42,22) | 1260, 780 | 5 | C | Lost Capitals | tower |
| 31 | **Varakush** | (32,25) | 660, 960 | 1 | D | Subterranean Empire | stronghold |
| 32 | **Karok-Sa** | (38,25) | 1020, 960 | 5 | D | Lost Capitals | lost_capital |
| 33 | **Endless Stair** | (45,26) | 1440, 1020 | 4 | D | Aetherstone Deep | ruin |
| 34 | **The Giant Vault** | (52,28) | 1860, 1140 | 5 | D | Aetherstone Deep | vault |
| 35 | **Aetheric Chamber** | (56,28) | 2100, 1140 | 5 | D | Aetherstone Deep | vault |
| 36 | **Mud Flood Nexus** | (55,30) | 2040, 1260 | 5 | D | Aetherstone Deep | control_center |
| 37 | **Grand Spire of Etheria** ➡️ | (53,31) | 1920, 1320 | 5 | D | Aetherstone Deep | tower |
| 38 | **The Black Reach** 🆕 | (55,31) | 2040, 1320 | 5 | D | Aetherstone Deep | chasm |

---

## 5. WHAT NOT TO DRAW A MARKER FOR

⚠ **The Hidden Market — grid (47,15), px 1560, 360.** Paint the terrain there as ordinary,
unremarkable ground. **No structure, no settlement, nothing that reads as a place.** It is a
secret location the game reveals with its own `?` glyph after the player finds it. Anything
recognisable painted there spoils a discovery.

Everything else in §4 should have visible terrain appropriate to its type — but again, **no
numbers and no names**. The game numbers them.

**Do not draw at all** (these exist in the game but are *inside* other places, not on the
surface): the nine outpost interior rooms, the five buried sub-levels, the Sunken Metropolis,
the Drowned Suburbs, the Aetheric Power Grid, the Giant-Kin Mausoleum, the Culvert Markets,
the Monarch Excavation Sites, the True Tartarian Catacombs, the Aetherkin Nesting Grounds,
the Underground Markets, and the interiors of Asgardar, Samarran and Nimari.

---

## 6. HOW EACH KIND OF PLACE SHOULD LOOK

| Type | Count | Draw it as |
|---|---|---|
| `region` | 10 | Open country — plains, silt flats, marsh. Frontier camps read as tents, stakes and banners, not buildings. |
| `lost_capital` / `buried_capital` / `buried_city` | 9 | A city drowned to its upper storeys. Domes and roofs above the silt, streets below it. Scale: these are the largest features on the map. |
| `tower` | 4 | A single vertical structure standing alone, leaning. Tall enough to read as a landmark from a distance. |
| `vault` | 2 | A sealed opening in the ground — doors, not buildings. Massive stonework, closed. |
| `ruin` | 2 | Collapsed structure, no longer legible as what it was. |
| `formation` | 2 | Natural rock — black pillars, jagged ridges. Not built. |
| `settlement` | 2 | Small, alive, occupied. Smoke, light, movement. |
| `stronghold` | 1 | Fortified and *lit* — the only place on the map that looks defended and safe. |
| `neutral_ground` | 1 | Open flats, no structure, a meeting place. |
| `control_center` | 1 | The Mud Flood Nexus. Machinery on a monumental scale, half-drowned, still running. |
| `chasm` | 1 | The Black Reach. An opening the map cannot contain — terrain should run off the bottom edge here. |

---

## 7. THE THREE NEW OR MOVED PLACES

**🆕 THE BLACK REACH — grid (55,31), px 2040 · 1320, danger 5**
The southernmost point of the world, directly below the Mud Flood Nexus. A second way down
into the Aetherstone Deep, opening onto the Giant-Kin Mausoleum. Draw it as a fissure system
running off the bottom edge of the canvas — the map ends because the ground does. Heat-glow
from below. Nothing built here; this is a wound, not a place.

**➡️ GRAND SPIRE OF ETHERIA — grid (53,31), px 1920 · 1320, danger 5**
Two tiles west of the Black Reach. A monumental tower that drew Aether from the celestial
realms — harvesting the sun and the cold night sky at once, venting its waste heat through
vacuum-sealed radiators into the black between the stars. One of the most powerful structures
ever built. **The tallest thing on the map.** It stands at the lip of the Deep, alone.

**🆕 GRAND SPIRE OF ASGARDAR — grid (27,21), px 360 · 720, danger 5**
Two tiles south of Asgardar, on the capital's outskirts. Where the Etheria spire is a skyward
antenna, this one is *buried* — most of it is underground and only the crown breaks the
silt-line. Draw a tower that looks like the top third of something much larger.

---

## 8. LOCATION-BY-LOCATION LORE

One line each, for the artist. Position, danger and type repeated so this section stands alone.

**The Monarch's Waystation** · grid (27,11) · px 360,120 · danger 2 · region
> A frontier toll-court of the Mud Monarchs, last ordered ground before the buried capitals. Banners hang stiff with silt; a seneschal logs every traveler who passes toward the deeper cities.

**Dynasty Border Post** · grid (30,11) · px 540,120 · danger 2 · region
> An old garrison of the Eternal Dynasty kept lit at the edge of the ruins. The oath-stones are still standing; the road past them runs down into the flooded capitals.

**Tartarian Pilgrim Camp** · grid (34,11) · px 780,120 · danger 2 · region
> A rest-camp of True Tartarian pilgrims on the frontier track, where the faithful gather before the long descent into the deep buried cities.

**Builders' Survey Camp** · grid (37,11) · px 960,120 · danger 2 · region
> A Stone Builders' survey staging post — theodolite stakes, chalked plans, and stacked shoring timber at the safe edge of the ruin-field before the works run deep.

**Giant-Watch Shrine** · grid (43,11) · px 1320,120 · danger 2 · region
> A roadside vigil-shrine of the Servants of the Giants at the frontier, where keepers wait and watch before the long road down to the giant vaults.

**Revivalist Field Camp** · grid (49,11) · px 1680,120 · danger 2 · region
> A Revivalist dig-and-press camp pitched at the lip of the wastes. Crates of equipment, a printing trestle, and a map-board marking the capitals they mean to make headlines of.

**Tartarian Outskirts** · grid (25,12) · px 240,180 · danger 2 · region
> Borderlands around buried cities. Littered with traps, dormant defenses, and clues. A reasonable place for a new expedition to die.

**Sinking Cathedral** · grid (35,12) · px 840,180 · danger 5 · ruin
> Only the steeple remains above the mud. Said to contain a powerful artifact. None who enter return.

**Reclaimer's Stake** · grid (23,13) · px 120,240 · danger 2 · region
> A Reclaimers' Guild salvage-stake driven into the frontier mud: claim-posts, a tally-board of marked ruins, and a winch rig for hauling up whatever the wastes give. The expedition launches from here.

**The Architect's Blind** · grid (25,13) · px 240,240 · danger 2 · region
> A Conspiracy of Architects observation-blind disguised as a collapsed waystation. Behind the false rubble: a map-wall of routes the public must never connect, and a quiet door onto the road.

**Great Tartary Plains** · grid (40,13) · px 1140,240 · danger 4 · region
> A vast Aetheric-charged expanse covering ancient Tartaria. Magnetic anomalies, Aetheric storms, time dilation. Ground zero for the cataclysm.

**Cradle of Dusk** · grid (46,13) · px 1500,240 · danger 4 · region
> A pocket within the Mud Seas where the sky glows with residual Aether. Wrecks of ships and frozen statues of their crews litter the ground.

**Yuldra-Tul** · grid (56,13) · px 2100,240 · danger 5 · lost_capital
> A northeastern mountain Lost Capital. Frost-wreathed, the gate-city to the Giants' tombs. The Servants of Giants kept the long vigil here before the Flood — the Core sleeps under a cold-stone in the deep keep.

**The Buried Cities** · grid (33,14) · px 720,300 · danger 4 · region
> Tartaria's most powerful secrets, sealed under Aetherstone. Time distortions and magnetic anomalies make every step a gamble.

**Mud Seas** · grid (49,14) · px 1680,300 · danger 4 · region
> Shallow, murky waters covering Tartarian ruins. Currents are unpredictable, storms catastrophic, the creatures within mutated.

**Zharak's Teeth** · grid (42,15) · px 1260,360 · danger 3 · formation
> Towering spires jutting from shallow waters. Beautiful architecture, deadly mud sirens.

**The Hidden Market** · grid (47,15) · px 1560,360 · danger 2 · settlement
> A neutral-ground bazaar that does not advertise itself — four canvas stalls pitched in a wind-scoured hollow of the Sunken Middens, out past the frontier camps. Agents of every faction trade here under an unspoken truce; the place keeps no banner…

**Iskan-Veil** · grid (24,16) · px 180,420 · danger 5 · lost_capital
> A far-northwestern Lost Capital. The Conspiracy Architects' hidden city — a maze of false doors and overlaid corridors. Every map of Iskan-Veil is wrong by design; the true Core seat is behind the door you didn't see.

**Obsidian Pillars** · grid (36,16) · px 900,420 · danger 3 · formation
> Black, magnetically charged spires rising from the mud near a former Tartarian observatory. Disrupt all technology.

**The Parley Ground** · grid (47,17) · px 1560,480 · danger 2 · neutral_ground
> A weathered ring of standing stones on contested flats where rival factions meet under truce. No faction holds it; banners change with the season. A place for envoys, brokers, and uneasy bargains.

**The Sunken Enclave** · grid (31,18) · px 600,540 · danger 3 · settlement
> A deep, self-sufficient True Tartarian enclave hollowed beneath the Buried Cities — Aethercraft-shaped mud walls, ancestor-shrines to the fallen Giants, and Seekers who venture the labyrinthine tunnels for relics and Aetherstone. Hidden from the…

**Ostragar** · grid (58,18) · px 2220,540 · danger 4 · lost_capital
> An eastern wetland Lost Capital. The Eternal Dynasty's river city — half-submerged in slow current, the Core seat ringed by a still pool the Riverbinder bound to the housing with a cantor's chord.

**Asgardar** · grid (27,19) · px 360,600 · danger 5 · buried_capital
> The ancient capital of Tartaria. Home of the Grand Spire of Etheria, which once channeled cosmic Aether into the city grid.

**Drakova** · grid (52,19) · px 1860,600 · danger 5 · lost_capital
> A legendary Lost Capital, sealed beneath Aetherstone mud. Believed to hold an intact Aetheric Core.

**Samarran** · grid (32,20) · px 660,660 · danger 5 · buried_city
> A research hub of Tartaria. Home of Thametan's Tower and the Aetheric Engine whose malfunction triggered the Great Mud Flood.

**Nimari** · grid (41,20) · px 1200,660 · danger 4 · partially_buried_city
> Half-swallowed. The Red Tower of Nimari is rumored to house one of the last operational Aetheric Cores.

**Grand Spire of Asgardar** · grid (27,21) · px 360,720 · danger 5 · tower
> Asgardar's own crown-spire, breaking the silt-line two tiles south of the buried capital.

**Voronov** · grid (52,21) · px 1860,720 · danger 4 · buried_city
> A significant Tartarian city deeply scarred by the Mud Flood. Rumored to hide intact remnants of Tartarian technology.

**Thametan's Tower** · grid (34,22) · px 780,780 · danger 5 · tower
> Houses the catastrophic Aetheric Engine. Site of Elior Zalmar's final resonance cascade — the day the vibration shook the radiators' vacuum seals apart and the trapped heat, with nowhere left to vent, poured down into the bedrock. The walls still…

**Red Tower of Nimari** · grid (42,22) · px 1260,780 · danger 5 · tower
> Believed to contain a functional Aetheric Core. A critical objective for every faction.

**Varakush** · grid (32,25) · px 660,960 · danger 1 · stronghold
> Hidden base of the Forgotten Order, perched on the edge of the Great Tartary Plains. Library, workshop, refuge.

**Karok-Sa** · grid (38,25) · px 1020,960 · danger 5 · lost_capital
> A southern Lost Capital. The Forgotten Order's ritual seat — halls of binding-sigils carved into black basalt, the Core kept under a chain of seals only a Sealwarden can read.

**Endless Stair** · grid (45,26) · px 1440,1020 · danger 4 · ruin
> A vast staircase descending into mud, terminating beneath an impassable Aetheric disturbance. No one has reached its bottom.

**The Giant Vault** · grid (52,28) · px 1860,1140 · danger 5 · vault
> Ancient vault rumored to hold the last resting place of the Tartarian Giants. Are they sleeping, or imprisoned?

**Aetheric Chamber** · grid (56,28) · px 2100,1140 · danger 5 · vault
> The primary power source and control hub for Tartarian technology, buried deep. Guarded by ancient automatons and Aetheric traps.

**Mud Flood Nexus** · grid (55,30) · px 2040,1260 · danger 5 · control_center
> The subterranean control center believed to have regulated the disaster itself. Touching it might mean rebirth — or a second flood.

**Grand Spire of Etheria** · grid (53,31) · px 1920,1320 · danger 5 · tower
> A monumental tower in Asgardar that drew Aether from celestial realms — harvesting the sun and the cold night sky at once, venting its waste heat through vacuum-sealed radiators into the black between the stars. Said to be one of the most…

**The Black Reach** · grid (55,31) · px 2040,1320 · danger 5 · chasm
> The Deep Below. A second way down into the Aetherstone Deep, opening onto the Giantkin Mausoleum.


---

## 9. HOUSE STYLE

- **Palette:** aged parchment and soot. Grounds `#0a0908` → `#17150f` → `#2a1f12`. If any
  warm accent is needed in the terrain itself, `#c9a86a`.
- **Feel:** a survivor's working map — hand-inked, water-stained, carried for years. Not a
  fantasy poster, not a game UI.
- **Lighting:** overcast, low sun. The only warm light comes from beneath: the Deep glowing
  up through fissures in band D, and the single lit stronghold at Varakush.
- **Water:** everywhere and dirty. Silt, not sea. Nothing is clear or blue.

---

## 10. ACCEPTANCE CHECKLIST

- [ ] 2400 × 1440, terrain to all four edges, no frame or vignette
- [ ] **Zero text.** No names, no regions, no legend, no compass, no title
- [ ] **Zero numerals** anywhere in the image
- [ ] All 38 positions in §4 sit on plausible ground — no city in open water, no tower in a lake
- [ ] Danger reads as a **north→south gradient**, green at the top to molten at the bottom
- [ ] Rows 23–24 read as a visible break between the capitals and the Deep
- [ ] The Black Reach runs off the **bottom edge**
- [ ] Varakush (32,25) is the one warm, lit point in the southern half
- [ ] The Hidden Market (47,15) is **blank ground** — nothing built there
- [ ] The Grand Spire of Etheria (53,31) is the tallest structure in the image
