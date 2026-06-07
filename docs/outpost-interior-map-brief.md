# Tartaria — Outpost Interior Map Brief

> **Use:** the reference for drawing the outpost interior. **There is ONE fixed 15-room layout** — the same graph for every faction, every visit. Only the room NAMES (and a little flavor) change per faction, and only for the 10 surface rooms; the 5 buried rooms stay generic. Draw the layout once and relabel per faction from §4. Connections never change; movement always follows this graph. Pulled live from the shipped app — canon.

---

## 1. Shape

Two tiers: a **10-room surface outpost** entered at The Gate, plus a **5-room buried sublevel** reached by descending the Culvert. The Central Square is the hub everything hangs off. Hand-authored (not a perfect grid) — the adjacency table in §3 is authoritative; §2 is a suggested visual arrangement.

## 2. Generic layout (suggested visual)

```
                 SURFACE OUTPOST  (enter at The Gate)

                          [ Relic Vault ]
                          /            \
                    [ Lab ]          [ Armory ]
                          \           /     \
                          [ Workshop ]       \
                                |             \
   [ Chapel ]              [ Central Sq ]------+
        |   \              /   |    \
        |  [ Quarters ]   /    |     [ Culvert Descent ]
        |        |       /     |              |
        +----[ Mess Hall ]-----+              | (descend)
                    |          |              |
                    +------[ The Gate ]       |
                            (ENTRANCE)        v

   ---- BURIED SUBLEVEL  (down the Culvert) ----------------------

        [ Pumps ]--[ First Landing ]--[ Storage ]
                          |
                  [ Second Landing ]--[ Shallow Digs ]
```

## 3. Room roster + connections (authoritative)

| Room (generic) | Tier | Connects to | What's there |
|---|---|---|---|
| **The Gate** (Gate) | surface | N→Square, E→Armory, W→Mess | NPC: Halem the Trader; entrance, safe, outpost |
| **The Central Square** (Square) | surface | N→Workshop, S→Gate, E→Armory, W→Mess | hub, central, safe |
| **The Armory** (Armory) | surface | N→Workshop, W→Square | NPC: Irma Ironhand; armory, vendor, safe |
| **The Mess Hall** (Mess) | surface | N→Quarters, E→Square | NPC: Halem the Trader; mess, vendor, rest |
| **The Workshop** (Workshop) | surface | N→Vault, S→Square, E→Armory, W→Lab | NPC: Tarek the Tinkerer; workshop, crafting, vendor |
| **Sleeping Quarters** (Quarters) | surface | S→Mess | rest, safe, outpost |
| **The Aether Lab** (Lab) | surface | N→Vault, E→Workshop | NPC: Jorah the Scholar; lab, lore, vendor |
| **The Relic Vault** (Vault) | surface | S→Workshop, W→Lab | vault, relics, locked |
| **The Chapel** (Chapel) | surface | S→Square, W→Quarters | rest, safe, quiet |
| **The Culvert Descent** (Culvert) | surface | S→Square | descent, to_buried, outpost |
| **First Landing** (Landing 1) | buried | N→Culvert, S→Landing 2, E→Storage, W→Pumps | buried, landing |
| **Storage Halls** (Storage) | buried | W→Landing 1 | buried, loot, search |
| **The Pump Room** (Pumps) | buried | E→Landing 1 | buried, tartarian_tech, loot |
| **Second Landing** (Landing 2) | buried | N→Landing 1, S→Shallow Digs | buried, landing, unmapped_edge |
| **The Shallow Digs** (Shallow Digs) | buried | N→Landing 2 | buried, dig, active |

## 4. The nine outposts — same layout, faction names

Overall outpost name (minimap title) per faction:

| Faction | Outpost name |
|---|---|
| Mud Monarchs | **Monarch Court** |
| Eternal Dynasty | **Dynasty Spire** |
| Reclaimers' Guild | **Reclaimers' Outpost** |
| Forgotten Order | **Order Cloister** |
| True Tartarians | **Catacomb Hall** |
| Stone Builders | **Stone Builders' Workshop** |
| Servants of the Giants | **Tomb Vigil** |
| Conspiracy of Architects | **Architect's Cell** |
| Tartarian Revivalists | **Revivalist Camp** |

Per-room names — draw the §2 layout, then relabel each surface room from this faction's column:

| Room | Monarchs | Dynasty | Reclaimers | Order | True Tart. | Builders | Servants | Architects | Revivalists |
|---|---|---|---|---|---|---|---|---|---|
| Gate | The Atrium | The Crown Gate | The Gate | The Threshold | The Threshold Stair | The Tool Threshold | The Vigil Door | The Reception | The Stand-Down |
| Square | The Court of Standards | The Throne Promenade | The Central Square | The Sanctum Hall | The Memorial Hall | The Plan Floor | The Tomb-Lit Court | The Operations Room | The Rally Hall |
| Armory | The Court Arsenal | The Heir's Armory | The Armory | The Reliquary Armory | The Forge Shrine | The Aethercraft Smithy | The Vigil Forge | The Secured Storage | The Cell Cache |
| Mess | The Banquet Floor | The Imperial Hall | The Mess Hall | The Refectory | The Common Hearth | The Mess Bench | The Vigil Refectory | The Break Room | The Cell Mess |
| Workshop | The Cabinet Workshop | The Heir's Workshop | The Workshop | The Vellum Workshop | The Ancestor Workshop | The Construction Hall | The Vigil Workshop | The Lab | The Field Shop |
| Quarters | The Retainers' Quarters | The Royal Quarters | Sleeping Quarters | The Scriptorium Dormitory | The Ancestor Bunks | The Crew Bunks | The Vigil Cells | The Safehouse Bunks | The Crash Room |
| Lab | The Cabinet of Curiosities | The Library of the Line | The Aether Lab | The High Reading Room | The Glyph Chamber | The Drafting Office | The Tomb Records | The Document Room | The Evidence Room |
| Vault | The Royal Strongroom | The Imperial Vault | The Relic Vault | The Sealed Archive | The Ancestor Crypt | The Materials Vault | The Reliquary of the Sleepers | The Evidence Vault | The Field Vault |
| Chapel | The Family Chapel | The Coronation Chamber | The Chapel | The Reading Cell | The Ancestor Chapel | The Plan Room | The Vigil Chamber | The Quiet Office | The Cell Sanctum |
| Culvert | The Sub-Court Descent | The Crypt Stair | The Culvert Descent | The Archive Descent | The Catacomb Descent | The Foundation Descent | The Vault Descent | The Sublevel Access | The Storage Descent |

*(Buried sublevel — First/Second Landing, Storage, Pumps, Shallow Digs — generic for all factions.)*

