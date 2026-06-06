# Tartaria — World Map Artist Brief

> **Use:** hand this whole document to the map artist. It contains the world's lore, the exact canvas size, every location with its plotted coordinates, the region groupings, and the danger-ring model. Everything below is pulled live from the shipped app — **the app is now the canon source of truth**, and these coordinates match where the in-game 'you are here' marker lands.

---

## 1. The world in brief

Tartaria is a **buried civilization**. Generations ago the **Mud Flood** drowned a continent-spanning empire under black silt; its cities, spires and machines were entombed where they stood. The survivors dug in and live underground. You play a tomb-thief / expedition member who ventures out from a frontier outpost into the buried country.

The spine of the world is the **Mud Flood Nexus** — the original, failed Aethercraft engine whose collapse caused the flood. To reach it you must recover **nine Aetheric Cores**, one entombed in each of the **nine Lost Capitals**, every Core guarded by a Guardian. Your unseen guide is **the Arbiter**, a narrator-judge who frames the world and rules on your actions.

Nine **factions** (Mud Monarchs, Eternal Dynasty, Reclaimers' Guild, Forgotten Order, True Tartarians, Stone Builders, Servants of the Giants, Conspiracy of Architects, Tartarian Revivalists) each pursue the Cores for their own ends. Each faction now launches from its **own frontier outpost** on the safe rim — never from a capital.

**Aesthetic:** aged, ochre-and-umber, post-flood. Black silt, half-drowned marble, ether-blue light leaking from broken capacitors, brass and mud-glass. Think 'antique survey map of a drowned empire' — sepia parchment, hand-inked.

## 2. Map canvas & coordinate system

- **Canvas size:** **1408 × 768 px** (landscape, ~16:9). The shipped atlas asset is `assets/world-atlas.png` at this size.
- **Coordinate system:** every location has a normalized **(fx, fy)** in the range 0..1, where **fx=0 is the left edge, fx=1 the right edge; fy=0 is the top, fy=1 the bottom.** Multiply by the canvas to get pixels: **px = (fx×1408, fy×768)**.
- The painted/usable area is inset slightly from the very edge: keep icons within **fx ∈ [0.05, 0.92], fy ∈ [0.05, 0.92]**.
- Each table below lists BOTH normalized (fx, fy) and pixel (x, y) for convenience.
- The marker the game drops is small (~26 px). Leave room around each plotted point for a label.

## 3. Danger rings (difficulty zones)

Danger is the world's core spatial logic: locations fan out from the safe frontier rim (low danger) toward the lethal deep (high danger). Render danger as **concentric color rings / zone tints**, safest at the frontier, most lethal at the buried core.

| Danger | Tier | Render as |
|---|---|---|
| 1 | **Calm** | green ring — foraging, scrap, the occasional lone scavenger |
| 2 | **Uneasy** | pale-amber ring — Common enemies only; the frontier outposts and their approaches |
| 3 | **Dangerous** | amber ring — packs and Uncommon foes; deep frontier and enclaves |
| 4 | **Deadly** | orange ring — Rare enemies, ambushes, the shallower capitals |
| 5 | **Lethal** | red ring — Legendary monsters (Mud Giant, Iron Titan, Bog Dragon…) and Core Guardians; the deep capitals and the Nexus |

## 4. The nine Lost Capitals (the objectives — mark prominently)

Each holds one Aetheric Core behind a Guardian. These should read as the biggest, most ominous icons on the map.

| Capital | Danger | Norm (fx, fy) | Pixel (x, y) | Region |
|---|---|---|---|---|
| **Asgardar** | 5 | (0.160, 0.470) | (225, 361) | lost_capitals |
| **Drakova** | 5 | (0.770, 0.470) | (1084, 361) | lost_capitals |
| **Iskan-Veil** | 5 | (0.050, 0.320) | (70, 246) | (unmapped) |
| **Karok-Sa** | 5 | (0.420, 0.720) | (591, 553) | (unmapped) |
| **Samarran** | 5 | (0.280, 0.480) | (394, 369) | lost_capitals |
| **Yuldra-Tul** | 5 | (0.880, 0.180) | (1239, 138) | (unmapped) |
| **Nimari** | 4 | (0.500, 0.500) | (704, 384) | lost_capitals |
| **Ostragar** | 4 | (0.930, 0.420) | (1309, 323) | (unmapped) |
| **Voronov** | 4 | (0.780, 0.560) | (1098, 430) | silt_wastes |

## 5. The nine faction starting outposts (frontier rim — danger 2)

| Outpost | Faction | Norm (fx, fy) | Pixel (x, y) |
|---|---|---|---|
| Reclaimer's Stake | Reclaimers Guild | (0.060, 0.160) | (84, 123) |
| The Architect's Blind | Conspiracy of Architects | (0.100, 0.200) | (141, 154) |
| The Monarch's Waystation | Mud Monarchs | (0.140, 0.080) | (197, 61) |
| Dynasty Border Post | Eternal Dynasty | (0.230, 0.090) | (324, 69) |
| Varakush | Forgotten Order | (0.280, 0.740) | (394, 568) |
| Tartarian Pilgrim Camp | True Tartarians | (0.320, 0.080) | (451, 61) |
| Builders' Survey Camp | Stone Builders | (0.410, 0.090) | (577, 69) |
| Giant-Watch Shrine | Servants of the Giants | (0.550, 0.080) | (774, 61) |
| Revivalist Field Camp | Tartarian Revivalists | (0.700, 0.090) | (986, 69) |

## 6. Every location, by region

### The Borderlands — the Frontier Edge

*The safe outer rim where every expedition launches. Trap-fields, dormant defenses, frontier camps and toll-courts. Black silt and broken arches, but nothing here is meant to kill a beginner outright. This is where all 9 faction outposts sit — the staging ground before the descent.*

| Location | Danger | Norm (fx, fy) | Pixel (x, y) | Type | Notes |
|---|---|---|---|---|---|
| **Builders' Survey Camp** | 2 | (0.410, 0.090) | (577, 69) | region | start: Stone Builders |
| **Dynasty Border Post** | 2 | (0.230, 0.090) | (324, 69) | region | start: Eternal Dynasty |
| **Giant-Watch Shrine** | 2 | (0.550, 0.080) | (774, 61) | region | start: Servants of the Giants |
| **Reclaimer's Stake** | 2 | (0.060, 0.160) | (84, 123) | region | start: Reclaimers Guild |
| **Revivalist Field Camp** | 2 | (0.700, 0.090) | (986, 69) | region | start: Tartarian Revivalists |
| **Tartarian Outskirts** | 2 | (0.100, 0.130) | (141, 100) | region |  |
| **Tartarian Pilgrim Camp** | 2 | (0.320, 0.080) | (451, 61) | region | start: True Tartarians |
| **The Architect's Blind** | 2 | (0.100, 0.200) | (141, 154) | region | start: Conspiracy of Architects |
| **The Monarch's Waystation** | 2 | (0.140, 0.080) | (197, 61) | region | start: Mud Monarchs |

**Descriptions:**

- **Builders' Survey Camp** — A Stone Builders' survey staging post — theodolite stakes, chalked plans, and stacked shoring timber at the safe edge of the ruin-field before the works run deep.
- **Dynasty Border Post** — An old garrison of the Eternal Dynasty kept lit at the edge of the ruins. The oath-stones are still standing; the road past them runs down into the flooded capitals.
- **Giant-Watch Shrine** — A roadside vigil-shrine of the Servants of the Giants at the frontier, where keepers wait and watch before the long road down to the giant vaults.
- **Reclaimer's Stake** — A Reclaimers' Guild salvage-stake driven into the frontier mud: claim-posts, a tally-board of marked ruins, and a winch rig for hauling up whatever the wastes give. The expedition launches from here.
- **Revivalist Field Camp** — A Revivalist dig-and-press camp pitched at the lip of the wastes. Crates of equipment, a printing trestle, and a map-board marking the capitals they mean to make headlines of.
- **Tartarian Outskirts** — Borderlands around buried cities. Littered with traps, dormant defenses, and clues. A reasonable place for a new expedition to die.
- **Tartarian Pilgrim Camp** — A rest-camp of True Tartarian pilgrims on the frontier track, where the faithful gather before the long descent into the deep buried cities.
- **The Architect's Blind** — A Conspiracy of Architects observation-blind disguised as a collapsed waystation. Behind the false rubble: a map-wall of routes the public must never connect, and a quiet door onto the road.
- **The Monarch's Waystation** — A frontier toll-court of the Mud Monarchs, last ordered ground before the buried capitals. Banners hang stiff with silt; a seneschal logs every traveler who passes toward the deeper cities.

### The Silt Wastes — the Endless Mud (surface)

*The post-flood surface crust: black silt to the horizon, half-drowned spires leaning into an ochre sky. Sunken metropolises, drowned suburbs, mud seas. Nothing is dry for long. The surface skin of the buried world.*

| Location | Danger | Norm (fx, fy) | Pixel (x, y) | Type | Notes |
|---|---|---|---|---|---|
| **Great Tartary Plains** | 4 | (0.480, 0.200) | (676, 154) | region |  |
| **Mud Seas** | 4 | (0.710, 0.220) | (1000, 169) | region |  |
| **The Buried Cities** | 4 | (0.310, 0.220) | (436, 169) | region |  |
| **Voronov** | 4 | (0.780, 0.560) | (1098, 430) | buried_city | ★ CORE CAPITAL |
| **Sinking Cathedral** | 5 | (0.360, 0.120) | (507, 92) | ruin |  |

**Descriptions:**

- **Great Tartary Plains** — A vast Etheric-charged expanse covering ancient Tartaria. Magnetic anomalies, Etheric storms, time dilation. Ground zero for the cataclysm.
- **Mud Seas** — Shallow, murky waters covering Tartarian ruins. Currents are unpredictable, storms catastrophic, the creatures within mutated.
- **The Buried Cities** — Tartaria's most powerful secrets, sealed under Aetherstone. Time distortions and magnetic anomalies make every step a gamble.
- **Voronov** — A significant Tartarian city deeply scarred by the Mud Flood. Rumored to hide intact remnants of Tartarian technology.
- **Sinking Cathedral** — Only the steeple remains above the mud. Said to contain a powerful artifact. None who enter return.

### The Subterranean Empire — where the living went

*The strata where surviving humanity actually lives — enclaves and strongholds dug into the mud and rock below the wastes. Varakush, the Forgotten Order's seat, anchors this layer.*

| Location | Danger | Norm (fx, fy) | Pixel (x, y) | Type | Notes |
|---|---|---|---|---|---|
| **Varakush** | 1 | (0.280, 0.740) | (394, 568) | stronghold | start: Forgotten Order |

**Descriptions:**

- **Varakush** — Hidden base of the Forgotten Order, perched on the edge of the Great Tartary Plains. Library, workshop, refuge.

### The Lost Capitals — the buried Core-cities

*The nine buried capitals of old Tartaria, each entombing one Aetheric Core behind a Guardian. Marble pillars, broken thrones, sentinel shells, ether cabling. These are the objectives — and the most dangerous inhabited ground in the world.*

| Location | Danger | Norm (fx, fy) | Pixel (x, y) | Type | Notes |
|---|---|---|---|---|---|
| **Nimari** | 4 | (0.500, 0.500) | (704, 384) | partially_buried_city | ★ CORE CAPITAL |
| **Asgardar** | 5 | (0.160, 0.470) | (225, 361) | buried_capital | ★ CORE CAPITAL |
| **Drakova** | 5 | (0.770, 0.470) | (1084, 361) | lost_capital | ★ CORE CAPITAL |
| **Grand Spire of Etheria** | 5 | (0.160, 0.530) | (225, 407) | tower |  |
| **Red Tower of Nimari** | 5 | (0.520, 0.600) | (732, 461) | tower |  |
| **Samarran** | 5 | (0.280, 0.480) | (394, 369) | buried_city | ★ CORE CAPITAL |
| **Thametan's Tower** | 5 | (0.330, 0.570) | (465, 438) | tower |  |

**Descriptions:**

- **Nimari** — Half-swallowed. The Red Tower of Nimari is rumored to house one of the last operational Aetheric Cores.
- **Asgardar** — The ancient capital of Tartaria. Home of the Grand Spire of Etheria, which once channeled cosmic Aether into the city grid.
- **Drakova** — A legendary Lost Capital, sealed beneath Aetherstone mud. Believed to hold an intact Aetheric Core.
- **Grand Spire of Etheria** — A monumental tower in Asgardar that drew Aether from celestial realms. Said to be one of the most powerful Aetheric structures ever built.
- **Red Tower of Nimari** — Believed to contain a functional Aetheric Core. A critical objective for every faction.
- **Samarran** — A research hub of Tartaria. Home of Thametan's Tower and the Etheric Engine whose malfunction triggered the Great Mud Flood.
- **Thametan's Tower** — Houses the catastrophic Etheric Engine. Site of Elior Zalmar's final resonance cascade. The walls still hum.

### The Aetherstone Deep — the Power Mantle

*The technological mantle far below everything — the empire's power substrate. The Cores still pulse here; most of it is sealed, and what isn't sealed is guarded. The Endless Stair descends through it to the Mud Flood Nexus, the wound that drowned the world.*

| Location | Danger | Norm (fx, fy) | Pixel (x, y) | Type | Notes |
|---|---|---|---|---|---|
| **Obsidian Pillars** | 3 | (0.380, 0.330) | (535, 253) | formation |  |
| **Zharak's Teeth** | 3 | (0.530, 0.290) | (746, 223) | formation |  |
| **Cradle of Dusk** | 4 | (0.620, 0.170) | (873, 131) | region |  |
| **Endless Stair** | 4 | (0.590, 0.760) | (831, 584) | ruin |  |
| **Etheric Chamber** | 5 | (0.880, 0.870) | (1239, 668) | vault |  |
| **Mud Flood Nexus** | 5 | (0.840, 0.940) | (1183, 722) | control_center | TERMINAL — the Nexus |
| **The Giant Vault** | 5 | (0.780, 0.860) | (1098, 660) | vault |  |

**Descriptions:**

- **Obsidian Pillars** — Black, magnetically charged spires rising from the mud near a former Tartarian observatory. Disrupt all technology.
- **Zharak's Teeth** — Towering spires jutting from shallow waters. Beautiful architecture, deadly mud sirens.
- **Cradle of Dusk** — A pocket within the Mud Seas where the sky glows with residual Aether. Wrecks of ships and frozen statues of their crews litter the ground.
- **Endless Stair** — A vast staircase descending into mud, terminating beneath an impassable Etheric disturbance. No one has reached its bottom.
- **Etheric Chamber** — The primary power source and control hub for Tartarian technology, buried deep. Guarded by ancient automatons and Etheric traps.
- **Mud Flood Nexus** — The subterranean control center believed to have regulated the disaster itself. Touching it might mean rebirth — or a second flood.
- **The Giant Vault** — Ancient vault rumored to hold the last resting place of the Tartarian Giants. Are they sleeping, or imprisoned?

### Unzoned / liminal sites

*Sites not bound to a single macro-region in the engine's travel ladder.*

| Location | Danger | Norm (fx, fy) | Pixel (x, y) | Type | Notes |
|---|---|---|---|---|---|
| **The Parley Ground** | 2 | (0.640, 0.360) | (901, 276) | neutral_ground |  |
| **The Sunken Enclave** | 3 | (0.240, 0.400) | (338, 307) | settlement |  |
| **Ostragar** | 4 | (0.930, 0.420) | (1309, 323) | lost_capital | ★ CORE CAPITAL |
| **Iskan-Veil** | 5 | (0.050, 0.320) | (70, 246) | lost_capital | ★ CORE CAPITAL |
| **Karok-Sa** | 5 | (0.420, 0.720) | (591, 553) | lost_capital | ★ CORE CAPITAL |
| **Yuldra-Tul** | 5 | (0.880, 0.180) | (1239, 138) | lost_capital | ★ CORE CAPITAL |

**Descriptions:**

- **The Parley Ground** — A weathered ring of standing stones on contested flats where rival factions meet under truce. No faction holds it; banners change with the season. A place for envoys, brokers, and uneasy bargains.
- **The Sunken Enclave** — A deep, self-sufficient True Tartarian enclave hollowed beneath the Buried Cities — Aethercraft-shaped mud walls, ancestor-shrines to the fallen Giants, and Seekers who venture the labyrinthine tunnels for relics and Aetherstone. Hidden from the surface by design.
- **Ostragar** — An eastern wetland Lost Capital. The Eternal Dynasty's river city — half-submerged in slow current, the Core seat ringed by a still pool the Riverbinder bound to the housing with a cantor's chord.
- **Iskan-Veil** — A far-northwestern Lost Capital. The Conspiracy Architects' hidden city — a maze of false doors and overlaid corridors. Every map of Iskan-Veil is wrong by design; the true Core seat is behind the door you didn't see.
- **Karok-Sa** — A southern Lost Capital. The Forgotten Order's ritual seat — halls of binding-sigils carved into black basalt, the Core kept under a chain of seals only a Sealwarden can read.
- **Yuldra-Tul** — A northeastern mountain Lost Capital. Frost-wreathed, the gate-city to the Giants' tombs. The Servants of Giants kept the long vigil here before the Flood — the Core sleeps under a cold-stone in the deep keep.

## 7. Legend / art-direction checklist

- [ ] Sepia/parchment base; ochre silt; ether-blue accent for Aetheric sites.
- [ ] Concentric **danger rings** (green→amber→orange→red) from frontier rim to deep core.
- [ ] **9 Lost Capitals** as large ominous city-ruin icons (★).
- [ ] **9 faction outposts** as small camp/banner icons along the frontier rim (danger 2 band).
- [ ] **Mud Flood Nexus** at the deepest point — a drowned engine-pit, terminus of the Endless Stair.
- [ ] Region tints behind the icons per §6.
- [ ] Plot each icon at its **pixel (x, y)**; labels offset so they don't collide.
- [ ] Total locations to place: **35**.

