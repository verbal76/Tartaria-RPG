# Tartaria Realms — Lore Compliance & Deviation Report

*Audit of Tartaria-RPG codebase (OTA `2026-05-22-037`) against `docs/lore-source.txt` (Tartarian Hack 2.5)*
*Generated 2026-05-22*

## 1. Executive Summary

The current Android build is **substantially lore-aligned at the narrative-frame level and meaningfully divergent at the mechanics level**. Every faction, named NPC, major buried city, monument, and foundational world concept from the lorebook is present in the codebase — the world the player walks through reads as Tartaria. The lorebook's tabletop-RPG combat math (10-tier DC table, race-based AC table, race-based barehanded damage, parry-durability roll system, advantage/disadvantage dice pools, runecaster damage scaling, HP-per-stat-point progression) has been re-engineered into a leaner attack/dodge/skill-check engine that uses a 4-tier DC table and milestone-based HP growth. Two original factions and roughly two dozen vendors plus seven named bosses are code-first additions that need canonization. Two damage types from the lorebook (Degradation, Stun) remain unimplemented.

**OTA 038 updates**: the race-as-distinct-from-faction layer is now wired (barehand damage, conditional racial AC bonuses, always-on racial stat bumps surfaced through every skill check) and the previously-empty Servants of the Giants stash is now populated with a vendor and three contracts (1 faction quest, 1 hunt, 1 mystery).

## 2. Direct Matches (Faithful Implementations)

- **All 7 lorebook factions present** in `app/data/factions/factions.json`: Mud Monarchs, Forgotten Order, True Tartarians, Reclaimers Guild, Eternal Dynasty, Conspiracy Architects, Tartarian Revivalists.
- **All 6 named NPCs present** in `app/data/npcs/npcs.json` with lore-accurate roles and affiliations: Elior Zalmar, Professor Harlan Moore, Sasha Ironheart, Drake Volkov, Ivy Solis, Dr. Lucius Kincaid.
- **Buried capitals faithfully implemented**: Asgardar (with Grand Spire of Etheria nested), Samarran (with Thametan's Tower nested), Voronov, Nimari (with Red Tower nested), Drakova.
- **Major monuments and ruin formations match**: Obsidian Pillars, Zharak's Teeth, Endless Stair, Sinking Cathedral, Cradle of Dusk, Giant Vault, Mud Flood Nexus, Etheric Chamber.
- **Regional biomes match**: Great Tartary Plains, Mud Seas, Tartarian Outskirts, The Buried Cities.
- **Varakush** correctly implemented as the Forgotten Order stronghold on the edge of the Great Tartary Plains.
- **8 of 10 lorebook damage types** are present with lore-aligned mechanical effects: Slashing, Piercing, Bludgeoning, Burn, Electrical, Poison, Aetheric, Radiation.
- **Movement distance bands** (`arm` / `close` / `far`) match the lorebook's "Arm's Reach / Close / Far" definitions.
- **The Arbiter's voice and role** in `app/data/lore/concepts.json` ("I notice. I narrate. I remember more than I let on...") faithfully matches the lorebook's mystery-narrator framing.
- **The Great Mud Flood origin story** — Etheric Power experiments at Thametan's Tower in Samarran malfunctioning under Elior Zalmar's resonance research — is canon-accurate.
- **Aether / Aetherstone / Aethercraft** core concepts match.
- **Currency**: `TC` matches the lorebook's "Tartarian Coin" (no expansion of the abbreviation in the UI; minor).
- **Mud Siren / Zharak's Teeth pairing** preserved (recent playtest log confirmed a Mud Siren Queen hunt posting at Zharak's Teeth, matching lore at line ~7425).
- **Mud Golems and Architectural Sentinels** present as iconic enemy archetypes.
- **Sasha Ironheart leading the Tartarian Revivalists** matches the lorebook.

## 3. Lore Deviations & Conflicts

### Difficulty Class table

- **Lorebook Concept**: 10-tier DC table — Very Easy (3+), Easy (6+), Moderate (9+), Hard (12+), Very Hard (15+), Difficult (18+), Very Difficult (21+), Nearly Impossible (24+), Impossible (27+), Legendary (30+).
- **Codebase Reality**: 4-tier DC table in `app/data/lore/dc_table.json` — Easy (6), Moderate (9), Hard (12), Very Hard (15).
- **Impact Level**: **Major** — half of the lorebook's difficulty space (everything past DC 15) doesn't exist; bosses and "legendary" checks get clamped to the highest implemented tier.

### Advantage / Disadvantage math

- **Lorebook Concept**: Advantage = roll `d20 + d6`; Disadvantage = roll `d10 + d6` (compressed dice pool).
- **Codebase Reality**: Advantage = `+1d6` bonus die; Disadvantage = `-2` penalty + cap at 16.
- **Impact Level**: **Major** — different probability curves entirely.

### ~~Race-based Armor Class and Barehanded Damage~~ — RESOLVED in OTA 038

- **Lorebook Concept**: AC and unarmed damage are determined by race (Tartarian Giants AC 12, Aetherborn AC 11, etc.; Giants 1d6+2 unarmed, Mud Dwellers 1d6−3, etc.).
- **Codebase Reality (OTA 038)**: Race-driven barehand damage now fires through `combatRules.buildCombatSteps` via `barehandDamageFor(player.raceId)` in `app/engine/raceMechanics.ts`. Conditional racial AC bonuses (Mud Dweller +1 underground, Giant −4 confined, Reclaimer +1 in ruins, Aetherborn +1 with aether gear, Sentinel +2 with runic gear, Golem +1 with relic armor) apply through `effectiveAC(player, scene)`. Always-on racial stat bumps (Giant +2 STR, Sentinel +2 STR +1 INT, Mud Dweller +2 DEX, Aetherborn +1 CHA, Reclaimer +1 DEX, Golem +2 STR) fold into every `effectiveStats` read, so all 30+ skill-check sites pick them up automatically. The Character Creation and Lore screens now surface combat row, conditional AC, always-on stat bumps, traits, and starting kit per race.
- **Remaining (deferred)**: Architectural Sentinel's `1d10 even/odd` hit-gate is captured in the BarehandSpec but not yet branched on (lands as 1d10+0 currently). Per-day racial powers (Legacy of Power, Beginner's Luck, Defensive Protocols, Latent Powers, Mud Golem Regenerative Core), Sentinel hunger/fatigue immunity, and Aetherborn 1d6 self-damage on rare/legendary Aether use deferred to a follow-up OTA.

### Character progression model

- **Lorebook Concept**: No traditional leveling; HP grows by +10 per point of STR or INT (from any source, including gear).
- **Codebase Reality**: HP max grows every 5 enemies defeated (milestone-based). Stat-derived HP scaling is not wired.
- **Impact Level**: **Major** — fundamentally different growth curve.

### Runecaster damage scaling

- **Lorebook Concept**: Common `1d6` → Uncommon `2d6 or 1d10` → Rare `1d10 + 1d6` → Legendary `2d10`.
- **Codebase Reality**: Common `1d6` → Uncommon `1d8` → Rare `1d10` → Legendary `2d10`.
- **Impact Level**: **Minor variation** — endpoints match; middle tiers slightly weaker than canon.

### Parry-durability system

- **Lorebook Concept**: After a parry, roll d20 three times; if 2+ rolls are odd, the weapon breaks. Runecasters cannot be repaired.
- **Codebase Reality**: Generic durability counter that decrements on hits; no parry-specific triple-roll break check. Runecaster non-repairability is not specifically enforced.
- **Impact Level**: **Minor** — durability exists but the canonical break formula doesn't.

### Mud Monarchs joinability

- **Lorebook Concept**: Listed as a playable faction in character creation.
- **Codebase Reality**: Starting standing −10; join requires "bloodline ties + demonstrated loyalty to suppression"; no concrete threshold wired. Effectively unjoinable from a fresh character.
- **Impact Level**: **Minor** — playable on paper, gated in practice.

### Tartarian Revivalists joinability

- **Lorebook Concept**: Presented as a historical / antagonist faction, not a playable origin.
- **Codebase Reality**: Joinable at standing 20 (same threshold as other playable factions).
- **Impact Level**: **Minor** — adds a playable path the lore implies should be restricted.

### Rest mechanics

- **Lorebook Concept**: 2-hour rest restores 2d6 HP (safe); 24-hour rest restores full HP but rolls a d6 for ambush risk (odd = combat).
- **Codebase Reality**: 8-hour rest restores up to 16 HP (`hours × 2`) and 8 stamina, no ambush roll.
- **Impact Level**: **Minor** — pacing differs; the lorebook's risk dimension is absent.

### Aetherborn power cost

- **Lorebook Concept**: Using rare/legendary Aetheric powers costs the user 1d6 self-damage.
- **Codebase Reality**: No self-damage backlash on Aether powers / runecasters appears wired.
- **Impact Level**: **Minor** — gameplay-relevant safety valve missing.

## 4. Newly Added Lore (Code-First Additions)

These entities ship in the codebase but have no source in the lorebook. **Treat this section as canonical for NotebookLM** — these are now official.

### New factions

- **Servants of the Giants** (`servants_of_giants`) — Religious / Reclamation alignment. Devoted to the Sleeping Titans. Believe awakening Tartarian Giants will restore the empire through their power. Join requirement: demonstrated faith and willingness for ritual expeditions; threshold 20 standing.
- **Stone Builders** (`stone_builders`) — Scholarly / Reconstructive alignment. Seek to understand and replicate Architectural Sorcery (Aetheric engineering). Join requirement: prior knowledge of Tartarian architecture or original research; threshold 20 standing.

### New named NPCs (vendor archetypes)

22 vendor characters added in `app/data/npcs/vendors.json` with full names, titles, faction affiliations, and item offers. Roster:

- **Tellin Mak** (Scrap Broker, Reclaimers Guild)
- **Vesryn of Varakush** (Order Scholar, Forgotten Order)
- **Korash of the Deep** (True Tartarian Quartermaster)
- **Naha** (Wandering Drifter, unaffiliated)
- **Thalan the Wanderer** (unaffiliated)
- **Irma Ironhand** (Heavy Armorer, True Tartarians)
- **Velar Shadowblade** (Stealth Outfitter, unaffiliated)
- **Jorah the Scholar** (Tomekeeper, Forgotten Order)
- **Elara Lightfinger** (Trinketmonger, unaffiliated)
- **Halem the Trader** (General Goods, unaffiliated)
- **Tarek the Tinkerer** (Mechanical Outfitter, Reclaimers Guild)
- **Felra Swiftfoot** (Boot-Smith, unaffiliated)
- **Korr Stonefoot** (Heavy Weapons Dealer, mud_golems)
- **Cassia Nightwind** (Ranged Weapons Specialist, aetherborn)
- **Odar Flameforge** (Fire-Weaponsmith, architectural_sentinels)
- **Silvan the Quiet** (Relic Dealer, aetherborn)
- **Bran the Beastmaster** (Wilderness Outfitter, Reclaimers Guild)
- **Vela Ironheart** (Melee Armorer, True Tartarians)
- **Mara Stoneskin** (Earth-Gear Vendor, mud_golems)
- **Yara the Windcaller** (Wind-Gear Dealer, aetherborn)
- **Zorin Nightblade** (Exotic Weapons Dealer, unknowing_masses)
- **Kirin Spellweaver** (Arcane Gear Dealer, aetherborn)
- **Drakos the Mercenary** (Two-Handed Weapons Dealer, True Tartarians)
- **Nalren Frostgrip** (Frost-Gear Specialist, Reclaimers Guild)
- **Veska of the Hollow** (Monarch Agent, Mud Monarchs)
- **Old John Begotsnit** (Rare Relic Dealer, Independent — appears in `npcs.json` rather than vendors)

### New unnamed-NPC archetypes (OTA 030/034)

- **Road Hawker** — honest wandering trader; appears on outdoor cardinal steps; sells cheap food and consumables.
- **Sketchy Stall** — fence under a hooded cloak; sells knives, mushrooms, contraband at suspicious prices; easier to steal from but harder fight when caught.

### New named bosses

Eight bosses in `app/data/enemies/enemies.json` not present in the lorebook:

- **Aetheric Lich** — phylactery-anchored undead caster.
- **Mud Tyrant** — slow, monstrous-strength heavy.
- **Hollow King** — sealed-tomb dweller; savage.
- **Iron Worm** — pre-Flood industrial automaton; coil-crush attacker.
- **Bog Wyrm** — two-century-old viper; intelligent; baits prey.
- **Tartarian Reaver** — Mud Monarch elite officer with plate armor and an officer's blade.
- **Aetheric Behemoth** — apex mutation; bone-crystal hybrid.
- **Voidspawn Matriarch** — Aetheric mutation queen.

### New historical event

- **Lost Covenant of the Giants (1280)** — Tartarian Giants refused to share Aetheric secrets and withdrew to the Ural Mountains. The schism weakened the empire and set the stage for the Thametan's Tower experiments three centuries later. This now bridges the gap between Tartaria's peak and the Mud Flood, plugging a chronology hole the lorebook leaves implicit.

### New mechanical systems

- **Aethercraft disciplines** — three named branches: Aetherstone manipulation, Aether golem constructor, Aetheric healing. The lorebook names Aethercraft as a True Tartarian capability but doesn't enumerate disciplines; the codebase canonizes three.
- **Resurrection Gem economy** — rare drop (~0.5%) revives a fallen character from the title screen at full HP/stamina. The lorebook doesn't define a death/revival mechanic; this is now canonical for the game.
- **Corruption stat** — accumulates from Aetheric exposure; high corruption attracts unwanted attention. The lorebook implies "lasting conditions" from prolonged Etheric exposure but doesn't define a metered stat.
- **Faction standing economy** — concrete numeric values (+1 per purchase, +5 per gift, −10 for theft, −20 for betrayal, join at 20). The lorebook implies rep-gated joining without numbers.

### New scene-flavor canon

`app/data/lore/scene-flavors.json` ships 60 atmospheric narration strings (12 each across atmospheric / aether / ruins / danger / mystery). These define the prose voice of in-world ambient description and should be treated as canon for tone reference.

## 5. Unimplemented Lore (Missing in Action)

- **Degradation damage type** — Corrosive Etheric-mud damage that decays organic matter and reduces armor effectiveness one step per prolonged exposure. Lorebook lists it as the #1 damage type; absent from `app/data/items/weapons.json` and combat resolution.
- **Stun damage type** — Non-lethal Etheric disruption that prevents movement / speech / physical action for 1 round; auto-fails Dex saves. Listed as #10 damage type; absent from engine.
- **Race layer distinct from faction** — Lorebook treats race (Tartarian Giants, Aetherborn, Mud Dwellers, Mud Golems, Architectural Sentinels, Unknowing Masses, Reclaimers) as orthogonal to faction allegiance. Codebase collapses race into faction identity. Race-derived AC, racial barehanded damage, and racial "instants" (free reaction abilities) are all unimplemented.
- **Race-specific starting items table** — Lorebook authors per-race starting items (Tartarian Giants get Giant's Bone Pickaxe / Resonant Echo Horn; Mud Dwellers get Water Catcher / Aether-Breath Mask; etc.). Codebase doesn't gate starting inventory by race.
- **Tier 5+ DCs** — Difficult (18), Very Difficult (21), Nearly Impossible (24), Impossible (27), Legendary (30). No path to express these checks in the engine.
- **Lost Tartarian Temples** as a discrete location archetype — Scattered across Central Asia; once powered Tartaria's Etheric network. Lorebook describes them; codebase has no `temple` location type.
- **Etheric Ruins** as a general explorable category (distinct from specific named ruins) — Lorebook describes time/space-distorting Tartarian structures as their own thing; codebase has individual named ruins but no procedural "etheric ruin" type.
- **Parry-system durability rules** — Triple-d20 break check, runecaster non-repairability, salvage-only-from-runecaster-cores. None implemented.
- **Aetherborn self-damage cost** — 1d6 to user for rare/legendary Aetheric power use. Not wired.
- **24-hour rest ambush roll** — Lorebook's even/odd ambush check on extended rest. Codebase rests are always safe.
- **Aetheric Apparition / Rock Basilisk / Flesh Weaver / Mud Cyclops / Mud Drake / Aetheric Banshee** — Rare-tier creatures named in the lorebook (lines ~5300–5600) with stats but not in `app/data/enemies/enemies.json`.
- **Mud Elemental / Bog Dragon / Metal Hydra / Aetheric Wyvern** — Legendary-tier creatures from the lorebook (lines ~5600+) not yet shipped.
- **"Switching weapons costs a full empty-handed turn"** rule — Lorebook tactical penalty for mid-combat loadout change; codebase doesn't enforce.

## 6. Infographic Data Points

```
Lorebook factions implemented:           7 / 7 (100%)
Code-added factions:                     2 (Servants of the Giants, Stone Builders)
Total shipping factions:                 9
Lorebook named NPCs implemented:         6 / 6 (100%)
Code-added named NPCs:                   22 vendors + 1 (Old John Begotsnit)
Lorebook damage types implemented:       8 / 10 (80%) — missing Degradation, Stun
DC tiers implemented:                    4 / 10 (40%) — Easy / Moderate / Hard / Very Hard
Major lorebook locations implemented:    18 / 19 (95%)
Code-added bosses (no lore source):      8
Lorebook rare/legendary enemies missing: 10
Identified lore deviations (major):      5
Identified lore deviations (minor):      5
New code-first systems canonized:        4 (Aethercraft disciplines, Resurrection Gems, Corruption stat, Faction standing economy)
Lines of lorebook source audited:        7,426
Lines of audited codebase data files:    ~2,500 (factions, locations, vendors, items, enemies)
```
