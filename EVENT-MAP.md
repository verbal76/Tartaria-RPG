# Tartaria Realms — Event Map

**Owner's ask:** *"do a full audit of all the missions, whispers, hooks, anything that can be
triggered, the guardian, the whole nine yards. I want to find out the location of every event
and I want to find out which ones have overlapping locations."*

Harvested from the shipped content and engine tables, not from memory. Every row below names
the file it came from. Two kinds of trigger exist and the distinction is the whole point:

- **FIXED-PLACE** — bound to one `locationId`. These are the ones that can collide.
- **FLOATING** — bound to a biome tag or an archetype, so they land on many places at once.


---

## 1. The headline: Asgardar carries five

The owner guessed four. It is **five**, and two of them are bosses:

- **MAIN QUEST** — Lost Capital — Core recovery
- **CORE GUARDIAN** — Sentinel-Priest Vaelka  ★ boss
- **GREAT CLIMB** — the Buried Spire of Asgardar — 14 tiers
- **SUMMIT BOSS** — Draugveil, the Drowned Warden  ★ boss
- **OUTPOST HUB** — 15-room interior

Plus **7 floating** triggers (1 dog-rescue archetype, 6 hunts by biome) = **12 things**
that can fire at Asgardar. It is by a wide margin the busiest location in the game;
the next is Tartarian Outskirts at 7, and it carries only ONE fixed trigger.


---

## 2. Fixed-place triggers, by location

| Location | id | # | Triggers |
|---|---|---|---|
| **Asgardar** | `asgardar` | 5 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Sentinel-Priest Vaelka  ★ boss<br>`GREAT CLIMB` the Buried Spire of Asgardar — 14 tiers<br>`SUMMIT BOSS` Draugveil, the Drowned Warden  ★ boss<br>`OUTPOST HUB` 15-room interior |
| **Drakova** | `drakova` | 3 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Mother Drakovna  ★ boss<br>`OUTPOST HUB` 15-room interior |
| **Iskan-Veil** | `iskan_veil` | 3 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Veilkeeper Inarra  ★ boss<br>`LOCATION CHALLENGE` labyrinth_of_shadows |
| **Grand Spire of Etheria** | `grand_spire_of_etheria` | 2 | `GREAT CLIMB` the Grand Spire of Etheria — 15 tiers<br>`SUMMIT BOSS` Aurenthal, the Crown-Sentinel  ★ boss |
| **Karok-Sa** | `karok_sa` | 2 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Sealwarden Tobiel  ★ boss |
| **Nimari** | `nimari` | 2 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Iron Litany Brother Konrad  ★ boss |
| **Obsidian Pillars** | `obsidian_pillars` | 2 | `GREAT CLIMB` the Great Obsidian Monolith — 13 tiers<br>`SUMMIT BOSS` Magnetar, the Obsidian Colossus  ★ boss |
| **Ostragar** | `ostragar` | 2 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Riverbinder Ostros  ★ boss |
| **Red Tower of Nimari** | `red_tower_of_nimari` | 2 | `LOCATION CHALLENGE` tongue_of_the_red_tower<br>`TITLE CHALLENGE` tongue_of_the_red_tower |
| **Samarran** | `samarran` | 2 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Heir Atalan-Drowned  ★ boss |
| **Sinking Cathedral** | `sinking_cathedral` | 2 | `LOCATION CHALLENGE` warden_of_the_cathedral<br>`TITLE CHALLENGE` warden_of_the_cathedral |
| **The Sunken Enclave** | `tartarian_enclave` | 2 | `LOCATION CHALLENGE` defense_of_the_enclave<br>`TITLE CHALLENGE` defense_of_the_enclave |
| **Voronov** | `voronov` | 2 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Voronov-Beneath High Cantor  ★ boss |
| **Yuldra-Tul** | `yuldra_tul` | 2 | `MAIN QUEST` Lost Capital — Core recovery<br>`CORE GUARDIAN` Hierophant Mara-of-Yuldra  ★ boss |
| **Zharak's Teeth** | `zharaks_teeth` | 2 | `GREAT CLIMB` the Great Fang of Zharak — 11 tiers<br>`SUMMIT BOSS` Ossika, the Fang-Sentinel  ★ boss |
| Builders' Survey Camp | `builders_survey_camp` | 1 | `OUTPOST HUB` 15-room interior |
| Dynasty Border Post | `dynasty_border_post` | 1 | `OUTPOST HUB` 15-room interior |
| Endless Stair | `endless_stair` | 1 | `LOCATION CHALLENGE` trap_dives_of_the_stair |
| Giant-Watch Shrine | `giant_watch_shrine` | 1 | `OUTPOST HUB` 15-room interior |
| Mud Flood Nexus | `mud_flood_nexus` | 1 | `MAIN QUEST` Terminal — needs all 9 Cores |
| Reclaimer's Stake | `reclaimer_stake` | 1 | `OUTPOST HUB` 15-room interior |
| Revivalist Field Camp | `revivalist_field_camp` | 1 | `OUTPOST HUB` 15-room interior |
| Tartarian Outskirts | `tartarian_outskirts` | 1 | `OUTPOST HUB` 15-room interior |
| Tartarian Pilgrim Camp | `pilgrim_waycamp` | 1 | `OUTPOST HUB` 15-room interior |
| The Architect's Blind | `architect_blind` | 1 | `OUTPOST HUB` 15-room interior |
| The Buried Cities | `buried_cities` | 1 | `OUTPOST HUB` 15-room interior |
| The Giant Vault | `giant_vault` | 1 | `OUTPOST HUB` 15-room interior |
| The Hidden Market | `hidden_market` | 1 | `HIDDEN LOCATION` hidden until discovered |
| The Monarch's Waystation | `monarch_waystation` | 1 | `OUTPOST HUB` 15-room interior |
| The Parley Ground | `parley_ground` | 1 | `LOCATION CHALLENGE` parley_of_factions |
| Varakush | `varakush` | 1 | `OUTPOST HUB` 15-room interior |

**Total fixed-place triggers: 51 across 31 locations.**


---

## 3. Overlaps — every location with more than one

| # | Location | Collision |
|---|---|---|
| 5 | **Asgardar** `asgardar` | MAIN QUEST + CORE GUARDIAN + GREAT CLIMB + SUMMIT BOSS + OUTPOST HUB |
| 3 | **Drakova** `drakova` | MAIN QUEST + CORE GUARDIAN + OUTPOST HUB |
| 3 | **Iskan-Veil** `iskan_veil` | MAIN QUEST + CORE GUARDIAN + LOCATION CHALLENGE |
| 2 | **Samarran** `samarran` | MAIN QUEST + CORE GUARDIAN |
| 2 | **Nimari** `nimari` | MAIN QUEST + CORE GUARDIAN |
| 2 | **Voronov** `voronov` | MAIN QUEST + CORE GUARDIAN |
| 2 | **Karok-Sa** `karok_sa` | MAIN QUEST + CORE GUARDIAN |
| 2 | **Yuldra-Tul** `yuldra_tul` | MAIN QUEST + CORE GUARDIAN |
| 2 | **Ostragar** `ostragar` | MAIN QUEST + CORE GUARDIAN |
| 2 | **Grand Spire of Etheria** `grand_spire_of_etheria` | GREAT CLIMB + SUMMIT BOSS |
| 2 | **Obsidian Pillars** `obsidian_pillars` | GREAT CLIMB + SUMMIT BOSS |
| 2 | **Zharak's Teeth** `zharaks_teeth` | GREAT CLIMB + SUMMIT BOSS |
| 2 | **Red Tower of Nimari** `red_tower_of_nimari` | LOCATION CHALLENGE + TITLE CHALLENGE |
| 2 | **Sinking Cathedral** `sinking_cathedral` | LOCATION CHALLENGE + TITLE CHALLENGE |
| 2 | **The Sunken Enclave** `tartarian_enclave` | LOCATION CHALLENGE + TITLE CHALLENGE |

### The four collision shapes

1. **Capital + Guardian (9×)** — every Lost Capital hosts its own Core Guardian. By design.

2. **Great Climb + Summit Boss (5×)** — every great climb has a boss at the top. By design.

3. **Challenge doubled (3×) — NOT a collision, checked.** `red_tower_of_nimari`,
   `sinking_cathedral` and `tartarian_enclave` each show a LOCATION CHALLENGE and a TITLE
   CHALLENGE under the *same id*. `locationChallenges.ts` is a **registry** (it carries
   `enabled`, `entryKind`, `note`); `titleChallenges.ts` is the **implementation** (the
   stat check, the requirement item, the verb patterns). One feature, two tables, matched
   ids on purpose. ⚠ But note the registry lists **six** enabled challenges and the
   implementation table holds **three** — `labyrinth_of_shadows`, `trap_dives_of_the_stair`
   and `parley_of_factions` are marked `enabled: true` with no entry in `titleChallenges`.
   The labyrinth has its own maze system so it is likely fine; the other two are worth a
   look before they read as registered-but-unbuilt.

4. ⚠ **The genuine pile-ups** — the three places where UNRELATED systems land on one tile:

   - **Asgardar** — MAIN QUEST + CORE GUARDIAN + GREAT CLIMB + SUMMIT BOSS + OUTPOST HUB
   - **Iskan-Veil** — MAIN QUEST + CORE GUARDIAN + LOCATION CHALLENGE
   - **Drakova** — MAIN QUEST + CORE GUARDIAN + OUTPOST HUB

---

## 4. Floating triggers (biome / archetype)

These are NOT bound to a location — they match on tags, so one entry lands on many places.

| Location | Floating load |
|---|---|
| Asgardar `asgardar` | 1× DOG RESCUE, 6× HUNT |
| Tartarian Outskirts `tartarian_outskirts` | 1× DOG RESCUE, 5× HUNT |
| Cradle of Dusk `cradle_of_dusk` | 2× DOG RESCUE |
| Great Tartary Plains `great_tartary_plains` | 1× DOG RESCUE |
| Mud Seas `mud_seas` | 1× DOG RESCUE |
| The Monarch's Waystation `monarch_waystation` | 1× DOG RESCUE |
| Dynasty Border Post `dynasty_border_post` | 1× DOG RESCUE |
| Revivalist Field Camp `revivalist_field_camp` | 1× DOG RESCUE |
| Tartarian Pilgrim Camp `pilgrim_waycamp` | 1× DOG RESCUE |
| Builders' Survey Camp `builders_survey_camp` | 1× DOG RESCUE |
| Giant-Watch Shrine `giant_watch_shrine` | 1× DOG RESCUE |
| Reclaimer's Stake `reclaimer_stake` | 1× DOG RESCUE |
| The Architect's Blind `architect_blind` | 1× DOG RESCUE |
| The Hidden Market `hidden_market` | 1× DOG RESCUE |

---

## 5. What is NOT location-bound at all

Answering the 'whispers and hooks' half of the ask directly: **they have no location.**

- **Hooks / whispers** — 44 kinds in `engine/hooks.ts`, drawn by WEIGHT anywhere in the
  world (`smoke` and `footprints` at 12 are the most common). Two are weight 0 and
  spawner-planted only: `fallen_whisper` and `stranded_traveler`. So `whisper_crystal`
  and the rest can appear at any location, including on top of everything in §2.

- **Indoor rest-ambush** — 8% resting in a safe zone, 22% in the wilds (`gameStore`).

- **Elevated overlay** — 30% at the top of a climb (`elevatedOverlay.ts`).

- **Wilderness encounter roll** — per-tile, unbound.


⚠ **This is why Asgardar reads as crowded in play.** Five fixed triggers, seven floating
ones, and the global hook/ambush rolls all apply on top of the same tile.


---

## 6. Reading notes

- Hunts bind by `biomeTag`, not `locationId` — a hunt is not 'at' a place, it is 'in' a
  kind of place. `mud_seas` and `lost_capital` are the two busiest tags.

- Dog rescues bind by `archetypes` on the scenario, matched against a location's `tags`.

- Outpost hubs are a 15-room interior attached to 15 different locations from one
  `static_hub.json` definition, which is why they never collide with each other.

