# Tartaria — World Atlas

**Purpose:** A single document Notebook LM can ingest to build an infographic
map of the navigable Tartaria world. Combines authored lore (the canonical
geography from the Tartaria Prima lorebook) with the hard-coded engine data
that drives in-game travel.

**Reader's note for the infographic:** Tartaria has two simultaneously-true
geographic models:

1. **Lore geography is fixed.** Asgardar is buried in the Great Tartary
   Plains. Varakush sits on the Plains' edge. The Ural Mountains are where
   the Tartarian Giants retreated. These relationships are canon.
2. **In-game tactical geography is procedurally generated per character.**
   Every new save rolls a deterministic 21×21 grid where locations fan out
   from the player's starting tile according to each location's `danger`
   rating. Two characters playing the same save file see the same map; two
   different characters see two different maps. Direction-from-start is
   *not* a constant — but distance bands are. Distance is in days of travel
   (1 tile = 1 day).

A faithful infographic should encode the lore (what is east/west of what
in the world-historical sense) AND the procedural distance model (how far
away things land from a fresh starting tile, by danger tier). Treat the
canonical regional groupings as fixed and the cardinal positions of
individual locations as illustrative.

---

## 1. Macro regions (the five hands of Tartaria)

These are the lore-meaningful regions. Every authored sub-scene lives
under one of these. They are arranged spatially in canon as concentric
nested layers — the surface skin (Silt Wastes / Borderlands), the
strata where humanity ended up living (Lost Capitals / Subterranean
Empire), and the technological mantle deep below (Aetherstone Deep).

### 1.1 The Silt Wastes — *The Endless Mud*
*Surface, post-flood crust. Black silt to the horizon. Half-drowned
spires lean against an ochre sky. Nothing in this country is dry for
long.*

Sub-regions:
- **Sunken Metropolis** — a pre-flood city, three quarters locked
  under the mud. Exposed towers throw light at sunset.
  - Buried Skyscraper — Upper Floors
  - Buried Skyscraper — Flooded Floors
  - Submerged Transit Hub
  - Subterranean Parking Garage
- **Drowned Suburbs** — silt-buried housing rings
  - Collapsed Residential Home
  - Buried Strip Mall

Tags: `mud`, `surface`, `buried`

### 1.2 The Aetherstone Deep — *The Power Mantle*
*The technological substrate of the empire. The cores still pulse.
Most of it is sealed. What isn't sealed is guarded.*

Sub-regions:
- **Aetheric Power Grid**
  - Crystal Pylon Chamber
  - Maintenance Tunnels
- **Giant-Kin Mausoleum** — Tartarian Giants' resting place(s)
  - The Grand Hall
  - Offering Antechamber

### 1.3 The Borderlands — *Where the Living Still Live*
*The seam between buried Tartaria and the modern surface. Excavation
camps, black markets, dispatch boards. This is where new expeditions
form and where most player characters wake into the world.*

Sub-regions:
- **Culvert Markets** — Reclaimer-aligned trading commons
  - Black Market Bazaar
  - Triage Tent
  - Reclaimer Dispatch Board
- **Monarch Excavation Sites** — Mud Monarch-led digs
  - Active Dig Trench
  - Monarch Staging Camp

### 1.4 The Lost Capitals — *The Ruined Crowns*
*The great cities of pre-flood Tartaria. Each contains at least one
tower or vault carrying live Aetheric infrastructure. Every faction
covets these.*

Sub-regions (each a full city, each with two principal accessible
chambers per the engine ladder):
- **Asgardar** — the ancient capital
  - Grand Spire of Etheria
  - Royal Vaults Beneath the Spire
- **Samarran** — the research hub
  - Thametan's Tower
  - Etheric Engine Chamber (site of the Flood)
- **Nimari** — partially buried, contains the Red Tower
  - Red Tower Interior
  - Tartarian Archives

### 1.5 The Subterranean Empire — *The Hidden Survivors*
*Where the True Tartarians (Mud Dwellers) live now. Hollowed caverns
of Aether-infused stone. The new Tartaria, built from the bones of the
old. Connected by tunnels the Dwellers have been digging for centuries.*

Sub-regions:
- **True Tartarian Catacombs**
  - Memorial Passages
  - Aethercraft Workshop
- **Aetherkin Nesting Grounds** — where the partly-fused dead are
  - Pulsing Mud Chamber
  - Old Burial Chamber
- **Underground Markets** — Varakush forum + scattered cantinas
  - Varakush Forum
  - Hidden Cantina

---

## 2. The 21 named locations

The engine treats each of these as a discrete macro-location that can
appear as a named tile on the procedurally-generated world map. They
also surface in the Lore Codex under PLACES. Listed here grouped by
lore region, with danger rating (1 = safe / Reclaimer-controlled, 5 =
deadly / dynastic relic site).

### 2.1 In the Silt Wastes & Borderlands

| Location | Danger | Type | One-line |
|---|---|---|---|
| **Tartarian Outskirts** | 2 | region | Borderlands around buried cities. Littered with traps, dormant defenses, and clues. Where most expeditions begin — and where most die. **Home of the Reclaimers' Outpost hub.** |
| **Great Tartary Plains** | 4 | region | A vast Aether-charged expanse covering ancient Tartaria. Magnetic anomalies, Aetheric storms, time dilation. Ground zero for the cataclysm. |
| **The Buried Cities** | 4 | region | Tartaria's vibrant urban core, sealed beneath Aetherstone mud. The cities are physically intact but functionally inaccessible. Etheric energy creates time distortions and magnetic anomalies. |
| **Mud Seas** | 4 | region | Shallow, murky waters covering Tartarian ruins. Currents are unpredictable, storms catastrophic, the creatures within mutated. |
| **Cradle of Dusk** | 4 | region | A pocket within the Mud Seas where the sky glows with residual Aether. Wrecks of ships and frozen statues of their crews. |
| **Zharak's Teeth** | 3 | formation | Towering spires jutting from shallow waters. Beautiful architecture, deadly mud sirens. |
| **Obsidian Pillars** | 3 | formation | Black, magnetically charged spires near a former Tartarian observatory. Disrupt all technology. |
| **Sinking Cathedral** | 5 | ruin | Only the steeple remains above the mud. Said to contain a powerful artifact. None who enter return. |

### 2.2 In the Lost Capitals tier

| Location | Danger | Type | One-line |
|---|---|---|---|
| **Asgardar** | 5 | buried_capital | The ancient capital. Home of the Grand Spire of Etheria, which once channeled cosmic Aether into the city grid. |
| **Grand Spire of Etheria** | 5 | tower | A monumental tower inside Asgardar. One of the most powerful Aetheric structures ever built. |
| **Samarran** | 5 | buried_city | The research hub. Home of Thametan's Tower and the Etheric Engine whose malfunction triggered the Great Mud Flood. |
| **Thametan's Tower** | 5 | tower | Houses the Etheric Engine. Site of Elior Zalmar's final resonance cascade. The walls still hum. |
| **Voronov** | 4 | buried_city | A Tartarian city deeply scarred by the Flood. Rumored to hide intact remnants of Tartarian technology. |
| **Nimari** | 4 | partially_buried | Half-swallowed. The Red Tower of Nimari is rumored to house one of the last operational Aetheric Cores. |
| **Red Tower of Nimari** | 5 | tower | Believed to contain a functional Aetheric Core. A critical objective for every faction. |
| **Drakova** | 5 | lost_capital | A legendary Lost Capital, sealed beneath Aetherstone mud. Believed to hold an intact Aetheric Core. |

### 2.3 In the Aetherstone Deep & Subterranean Empire

| Location | Danger | Type | One-line |
|---|---|---|---|
| **Varakush** | 1 | stronghold | Hidden base of the Forgotten Order, perched on the edge of the Great Tartary Plains. Library, workshop, refuge. The safest "city" left in the world. |
| **Endless Stair** | 4 | ruin | A vast staircase descending into mud, terminating beneath an impassable Aetheric disturbance. No one has reached its bottom. |
| **The Giant Vault** | 5 | vault | Rumored to hold the last resting place of the Tartarian Giants. Are they sleeping, or imprisoned? |
| **Etheric Chamber** | 5 | vault | The primary power source and control hub for Tartarian technology, buried deep. Guarded by ancient automatons and Aetheric traps. |
| **Mud Flood Nexus** | 5 | control_center | The subterranean control center believed to have regulated the disaster itself. Touching it might mean rebirth — or a second flood. |

---

## 3. Distance + direction model

The engine places these 21 macro-locations on a **21×21 grid** (441 tiles)
seeded by the player's character name + start time. The starting location
sits at the grid center (10,10). Every other location is placed at a
**danger-weighted radius**:

| Danger | Min radius (tiles) | Max radius (tiles) | Lore reading |
|---|---|---|---|
| **1** | 2 | 7 | Within a week's travel — the Outpost's catchment |
| **2** | 4 | 10 | 4–10 days out — the Borderlands proper |
| **3** | 6 | 13 | A fortnight at most — outer formations |
| **4** | 8 | 16 | Up to two weeks — the regional capitals |
| **5** | 10 | 19 | Three weeks or more — the deep relic sites |

**Conversion: 1 tile = 1 day's travel on foot.**

Cardinal direction (N/S/E/W) is the only travel axis — the engine does not
support diagonals. When the Arbiter announces "Asgardar lies 12 days east,"
that means the player's current grid position is 12 tiles west of
Asgardar's placed coordinate, with east being the dominant component of
the dx/dy vector. Distance is reported as Manhattan distance.

**Locations are placed at least 2 tiles apart** so cardinal walks are
mostly through "wandering ground" — empty tiles where the world feels big
and wasteland encounters fire. Roughly **420 of 441 tiles are empty**;
named locations are punctuation, not landscape.

---

## 4. Canonical (lore-fixed) geography

Some relationships are **canon** and override the procedural placement.
The infographic should depict these as fixed even though the engine
shuffles individual cardinal positions per save.

### 4.1 Real-world anchors from the lore manual

The Tartaria Prima lorebook places the empire on real Earth coordinates:

- **The Great Tartary Plains** = the Eurasian steppe-and-mud expanse
  covering "ancient Tartaria." Modern equivalent: trans-Eurasian steppe
  belt, broadly from the Caspian east to the Mongolian frontier.
- **The Ural Mountains** = where the Tartarian Giants retreated after the
  1280 Schism. The Giants' isolation site.
- **The Caspian Sea** = site of the 1505 Etheric Conflux collapse.
- **Siberia** = where the 1682 Etheric Rot outbreak forced the Mud
  Monarch quarantine.
- **The Antarctic Ice Shelf** = where the Forgotten Order detected the
  1973 Etheric pulse, hinting at the global Aetheric network's reach.
- **The Grand Canyon, Arizona** = site of the 1962 Revivalist excavation
  / Lost Capital Struggle.

The five Lost Capitals (Asgardar, Samarran, Nimari, Voronov, Drakova)
are all "scattered across Central Asia" per the manual. Asgardar is
explicitly "buried in the Great Tartary Plains." Varakush sits "on the
edge" of those Plains.

### 4.2 Vertical strata

A Tartarian map is as much vertical as horizontal:

```
                   ┌─ The Sky      (Aether storms, Aetheric lightning)
                   │
       ───────────┼─ Surface       (Silt Wastes, the modern world)
                   │  └ Borderlands  (Reclaimers' Outpost, dig camps)
                   │
       ───────────┼─ Shallow Buried (Buried Cities, partially-buried Nimari)
                   │
       ───────────┼─ Deep Buried    (Lost Capitals: Asgardar, Samarran,
                   │                Voronov, Drakova; Endless Stair drops)
                   │
       ───────────┼─ Subterranean   (True Tartarian Catacombs, Aetherkin
                   │                Nesting, Varakush Forum, Underground
                   │                Markets, Hidden Cantina)
                   │
                   └─ The Mantle     (Aetherstone Deep: Etheric Chamber,
                                     Mud Flood Nexus, Giant Vault, Power
                                     Grid, Giant-Kin Mausoleum)
```

The Endless Stair is the canonical vertical conduit — it descends from
the Mud Seas surface through every layer down to the Mantle. Nobody has
reached its bottom because Aetheric disturbance increases with depth.

### 4.3 Inter-location lore relationships

Drawing the infographic, these arrows are fixed:

- **Reclaimers' Outpost** is *inside* the **Tartarian Outskirts**.
- **Tartarian Outskirts** wraps the **Buried Cities**.
- **Asgardar** is *inside* the **Great Tartary Plains** (the Plains
  cover the original capital).
- **Grand Spire of Etheria** is *inside* **Asgardar**.
- **Thametan's Tower** is *inside* **Samarran**.
- **Red Tower of Nimari** is *inside* **Nimari**.
- **Varakush** is on the **edge** of the **Great Tartary Plains**.
  Reading: Varakush sits at the rim of the Plains, where the danger
  drops sharply — the Forgotten Order chose this spot because they
  could reach the Lost Capitals without living *inside* their Aether
  bleed.
- **Cradle of Dusk** is *inside* the **Mud Seas** (a pocket within them).
- **Zharak's Teeth** rises from the shallows of the **Mud Seas**.
- **Sinking Cathedral** is partially submerged in the **Mud Seas**.
- **Mud Flood Nexus**, **Etheric Chamber**, and **The Giant Vault** are
  all in the **Aetherstone Deep** layer — geographically dispersed across
  the empire but on the same vertical stratum.
- **Endless Stair** physically connects the **Mud Seas** surface
  (its top) to the **Aetherstone Deep** (its impassable bottom).
- **Obsidian Pillars** are surface-level, in the **Great Tartary Plains**.

---

## 5. Faction strongholds

Each faction has a center of gravity. The infographic should mark these
as faction icons over the canonical region:

| Faction | Stronghold | Anchored In |
|---|---|---|
| **Reclaimers Guild** | Reclaimers' Outpost | Tartarian Outskirts |
| **Forgotten Order** | Varakush | Edge of Great Tartary Plains |
| **Mud Monarchs** | (no fixed base — rule from surviving fragments of Asgardar / Nimari and global elite networks) | Asgardar / Nimari + global |
| **True Tartarians** | True Tartarian Catacombs | Subterranean Empire |
| **Eternal Dynasty** | Hidden sanctuaries inside Tartaria's tallest spires | Spire interiors (Asgardar, Nimari) |
| **Conspiracy Architects** | No physical stronghold — they live in the modern surface world's institutions (Vatican, Munich, etc.) | Modern world overlay |
| **Servants of the Giants** | Roving — wherever the Giants' tombs lead them; centered on The Giant Vault | Aetherstone Deep |
| **Stone Builders** | Aethercraft Workshop | True Tartarian Catacombs |
| **Tartarian Revivalists** | Cells scattered across the surface; symbolic anchor: Drakova | Drakova / global |

---

## 6. Race homelands

The seven playable races have lore-canonical origin points:

| Race | Origin / Habitat |
|---|---|
| **Tartarian Giants** | Ural Mountains (retreated there in 1280); now mostly entombed in The Giant Vault |
| **True Tartarians (Mud Dwellers)** | Subterranean Empire — deep below the Lost Capitals |
| **Architectural Sentinels** | Originally distributed across every Tartarian city as guardians; now found wherever ruins survive |
| **Mud Golems** | Born from Aether-charged mud during the Flood; patrol the Buried Cities and the Aetherstone Deep |
| **Aetherborn** | Children of the Aetherstone bleed — emerged in the centuries after the Flood, no fixed homeland; cluster near high-Aether sites (Cradle of Dusk, Endless Stair, the Plains) |
| **Reclaimers** | The Outpost in the Tartarian Outskirts; modern surface humans who came back to dig |
| **Unknowing Masses** | The modern surface world — anywhere outside Tartaria proper |

---

## 7. The Reclaimers' Outpost — interior map

This is the only hand-authored hub with a fixed room graph. 15 rooms,
cardinal exits. Starting room: **The Gate**. The infographic should
include a zoomed-in inset for this.

```
                     Sleeping Quarters
                            |
                            N
                            |
    Workshop   ─── E ── Central Square ── W ─── Mess Hall
                            |
                            S
                            |
                         The Gate
                            |
                            S
                            |
                        (exit to the wilderness)


    Armory ── adj. Square (east of Gate)
    Aether Lab ── inside the deeper Outpost ring
    Relic Vault ── inside the deeper Outpost ring
    Chapel ── inside the deeper Outpost ring
    Culvert Descent ── stairs down


    Below the Culvert Descent (procedural, dig-driven):
      First Landing
        └ Storage Halls
        └ Pump Room
          └ Second Landing
            └ Shallow Digs (terminus — connects to Aetherstone Deep
                            via excavation events)
```

The Outpost is the primary fast-travel hub. From it the player issues
"leave outpost" to step out into the procedural Tartarian Outskirts map.
From any Outskirts tile, cardinal travel reaches every other named
location in the game.

---

## 8. Movement & travel mechanics

For the infographic to be playable as a player-facing reference, encode
these rules:

- **1 cardinal step = 1 in-game hour, 2 stamina, ~1 day of travel
  narrative distance.** (The mechanical clock advances 1 hour but the
  Arbiter narrates "a day's travel" — designed to make the world feel
  big without grinding through real-time.)
- **Walking through empty wandering tiles fires a wasteland-encounter
  roll** (~15–18% per step) plus a **roadside-trader spawn roll** (~15%
  per step outdoors). These are surface events; they don't fire while
  the player is climbing or underground.
- **Climbing** is the vertical-axis equivalent. Climbable nouns have
  1–5 tiers (ledge=1, wall=2, tower=4, cliff=5). Each tap clears one
  tier. Carrying a Climbing Rope auto-passes every tier. Reaching the
  top rolls a 50% chance of climb-top loot.
- **Hubs** (the Reclaimers' Outpost) collapse cardinal travel to
  room-graph travel — exits are explicit, not procedural.
- **Re-entering a previously-visited location** brings up the same room
  state the player left (a microMicroLocation `roomKey`), so once you've
  searched a wagon at the Black Market Bazaar, that wagon stays searched
  even if you walk away and come back.

---

## 9. Hazards & weather as map overlays

Tartaria's terrain is volatile. Weather + hazard pairs are the third
layer the infographic can render as overlays (icons or colour gradients
on top of regions):

**Weather kinds** (drawn from `weather.json`, applied scene-by-scene):
- Aether Lightning (mostly in the Plains and around the Spire)
- Iron Fog (Mud Seas, Cradle of Dusk)
- Whisper Fog (Buried Cities, near Aetherkin Nests — adds corruption)
- Mud Storm (Plains, Outskirts)
- Cold Snap (any surface region at night)
- Clear (default outdoor)

**Hazard kinds** (per-scene environmental dangers):
- Temporal Loop (Plains hot spots, Endless Stair)
- Aether Bleed (around any tower or vault)
- Sinkhole (Mud Seas, Cradle of Dusk)
- Sentinel Patrol (Asgardar, Samarran, Nimari interiors)
- Mud Siren Call (Zharak's Teeth)

For the infographic: render the Plains with Aether Lightning + Temporal
Loop overlays; the Mud Seas with Iron Fog + Sinkhole + Mud Siren overlays;
the Buried Cities with Whisper Fog; etc.

---

## 10. Timeline anchors (events tied to places)

Selected lore events the infographic can use as historical pins on the
map:

| Year | Place | Event |
|---|---|---|
| **~1200** | Ural Mountains | Tartarian Giants retreat from the High Council |
| **1280** | Tartaria's High Council, Urals | Schism between Giants and Nobles |
| **1505** | Caspian Sea | Etheric Conflux collapse |
| **~1530s** | Samarran / Thametan's Tower | Elior Zalmar's Etheric Engine resonance cascade triggers **The Great Mud Flood** — primary cataclysm. Tartaria buried. |
| **1567** | The Capital (now Asgardar, buried in the Plains) | Fall of the Tartarian Capital — Mud Monarchs form from the royal bloodline + key engineers |
| **1603** | The Urals | Etheric Accords signed — formal founding of the Mud Monarchs |
| **1682** | Siberia | Etheric Rot outbreak — first relic-borne plague |
| **1789** | Paris | Reclaimers Guild formalised after underground skirmish over Tartarian relics |
| **1962** | Grand Canyon, Arizona | Lost Capital Struggle — Revivalists vs U.S. Gov |
| **1973** | Antarctic Ice Shelf | Forgotten Order detects an Etheric pulse — hint of the global network |
| **~2148** | Tartarian Outskirts | Game start — the player wakes here |

---

## 11. Suggested infographic structure

A single-page Notebook LM infographic could lay this out as:

1. **Central panel:** the 21×21 procedural grid model, with concentric
   danger rings labelled (1–5 days, 4–10 days, 6–13 days, 8–16 days,
   10–19 days). The Reclaimers' Outpost at the center; the 21 locations
   placed *illustratively* in their lore-correct directions even though
   the engine shuffles them per save.

2. **Left rail — vertical strata:** the 6-layer column from Sky to
   Mantle (section 4.2), with each macro region anchored to its layer.

3. **Right rail — faction icons:** 9 factions with arrows pointing to
   their canonical stronghold tiles.

4. **Inset top-right:** the Reclaimers' Outpost room graph (section 7).

5. **Bottom strip — timeline ribbon:** 1200 → 2148 with the 10 events
   from section 10 pinned to their place.

6. **Legend** explaining the danger colour scale, the weather/hazard
   overlay icons, the "1 tile = 1 day" travel scale.

---

*Sources: `app/data/locations/locations.json` (21 macro locations);
`app/data/world/worldLadder.json` (5 macro / 14 micro / 25 micro-micro
hierarchy); `app/data/world/static_hub.json` (15-room Reclaimers'
Outpost); `app/data/factions/factions.json` (9 factions);
`app/data/races/races.json` (7 races); `app/engine/worldMap.ts` (21×21
grid + danger-weighted placement); `app/engine/worldDirections.ts`
(1 tile = 1 day's travel); `docs/lore-source.txt` (Tartaria Prima
lorebook). Atlas authored 2026-05-22 against OTA 2026-05-22-047.*
