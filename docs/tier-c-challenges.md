# Tier-C Title Challenges — Build Register

Status reference for the 6 deferred "Tier-C" Arbiter titles. Each is a place
on the map with a challenge attached. As of **arb46** every challenge here is
**plotted, wired, and switched OFF** — none can be encountered in play until
the master switch and the per-challenge switch are flipped after review.
**arb47:** the Labyrinth of Shadows layout has been supplied + plotted
(`app/data/maze/labyrinth-of-shadows.json`).
**arb48:** the Labyrinth of Shadows is **BUILT + LIVE** — `engine/labyrinth.ts`
+ a `gameStore` handler make it playable, master `TIER_C_ENABLED` is **ON**, and
the labyrinth is the only `enabled` challenge (the other 5 stay OFF). Wayfarer of
the Lost Paths is now the 15th earnable title.
**arb50:** Speaker of Forgotten Tongues + Warden of the Old World are **BUILT +
LIVE** (`engine/titleChallenges.ts` + handler; one-shot attempts, free scouting)
— titles 16 & 17.
**arb53:** Guild Broker is **BUILT + LIVE** (title 18) — a fetch-two-relics
encounter at the Parley Ground (`engine/broker.ts` + handler), and the coveted
chart is upgraded to 9 canon relics. Only `trap_dives_of_the_stair` and
`defense_of_the_enclave` remain OFF — they still need drawn layouts.

**Kill-switches:** `app/engine/locationChallenges.ts`
- `TIER_C_ENABLED = false` — master. Nothing activates while this is false.
- each `LOCATION_CHALLENGES[].enabled = false` — per-challenge.
- `challengeActive(id)` returns true only when BOTH are on.

**Titles** (`app/engine/titles.ts`) read counters that only increment from the
(disabled) challenge completion sites, so the 6 titles can't be earned yet.

---

## What still needs to be PLANNED / DRAWN (the user's to-do)

The `needsLayout: true` challenges below are blocked on a hand-drawn build +
saved map image before they can be turned on. The `needsLayout: false` ones are
mechanically light and can be turned on after a content review without a drawing.

| Challenge | Title | Location | Needs a drawing? | What's needed before it goes live |
|---|---|---|---|---|
| `labyrinth_of_shadows` | Wayfarer of the Lost Paths | **Iskan-Veil** (existing) | ✅ **LIVE (arb48)** | Built: `engine/labyrinth.ts` (navigation over the plotted graph) + `gameStore` handler (ENTER LABYRINTH → typed directions → clean run within the wrong-turn budget calls `recordTitleProgress({labyrinthCleanRuns:1})`). Master ON, this challenge `enabled`. Only tunable left: the wrong-turn budget (currently **2**). |
| `defense_of_the_enclave` | Protector of the Forgotten | **The Sunken Enclave** (new tile) | **YES** | **Defense map**: approach lanes, defendable points, wave order, ally NPC placement. Image → `assets/maps/`. |
| `trap_dives_of_the_stair` | Shadow Diver | **Endless Stair** (existing) | **YES** | **Dive-room sequence**: per-room trap layout + DEX DCs (3 dives, ≤1 trigger each). |
| `parley_of_factions` | Guild Broker | **The Parley Ground** (new tile) | ✅ **LIVE (arb53)** | Built as a fetch-two-relics encounter (no drawing): PARLEY picks two non-allied leaders + names their canon relics; arrive at each source tile to recover it; SEAL THE ALLIANCE turns both in → `alliancesBrokered`/`diplomacyBonus`. |
| `tongue_of_the_red_tower` | Speaker of Forgotten Tongues | **Red Tower of Nimari** (existing) | ✅ **LIVE (arb50)** | Skill-gated: EXAMINE THE RUNES recovers the Glyph-Key free, then DECIPHER THE RUNES is a one-shot d20+INT trial (DC 16) → `languageLearned`/`machineSpeech`. |
| `warden_of_the_cathedral` | Warden of the Old World | **Sinking Cathedral** (existing) | ✅ **LIVE (arb50)** | Materials-gated: bring 3× Scrap Metal, EXAMINE THE CATHEDRAL to scout free, then STABILIZE THE CATHEDRAL is a one-shot d20+INT Engineering check (DC 15) → `relicsPreserved`/`ruinsDefenseBonus`. |

**New tiles plotted** (`locations.json`, `discoverable:false` until live):
`tartarian_enclave` (The Sunken Enclave, deep beneath the Buried Cities,
atlas 0.24/0.40) and `parley_ground` (The Parley Ground, east-central contested
flats, atlas 0.64/0.36).

---

## Canon basis for each placement

- **Wayfarer → Iskan-Veil.** The Conspiracy Architects' maze-capital ("a maze
  of false doors and overlaid corridors; every map is wrong by design"). Matches
  the lore's spatial-distortion "mazes that defy geometry."
- **Speaker → Red Tower of Nimari.** Lore: one of the last structures with
  *functional* Etheric technology; a "cryptic device used to decipher Tartarian
  runes" → the Red Tower Glyph-Key.
- **Warden → Sinking Cathedral.** A collapsing ruin (`objective`, `no_returns`)
  — a building to preserve from destruction.
- **Shadow Diver → Endless Stair.** Reclaimer trap-dive ruin (`etheric_lock`);
  lore: dives "evading traps, ancient sentinels."
- **Protector → The Sunken Enclave.** Lore: True Tartarians live in "isolated,
  self-sufficient enclaves deep beneath the surface"; plotted near Buried Cities.
- **Guild Broker → The Parley Ground.** No lore fix → a new neutral meeting tile
  in a sparse map region (no dead zones).

---

## Guild Broker mission

A brokering mission, **not** a standing counter. At the Parley Ground two faction
leaders confront each other; the player fetches each faction's coveted item to
broker an alliance.

- **Faction restriction:** the two factions are chosen so that **neither is the
  player's faction nor one the player is already affiliated with**
  (`eligibleBrokerFactions(playerFactionId, standings)`; affiliated =
  standing ≥ `AFFILIATED_STANDING` = 20).
- **Reward:** deliver both items → `recordTitleProgress({alliancesBrokered:1})`
  → **Guild Broker** title (+1 Diplomacy perk).

### Faction → coveted item chart (`FACTION_COVETED_ITEM`)

As of **arb53** these are **canon Tartarian relics** (from the user's 15-relic
list), authored as low-tier Uncommon fetch-tokens in
`app/data/items/exploration.json`; the full artifact lore for all 15 lives in
`app/data/lore/canon-loot-treasure.json` (Arbiter-answerable).

| Faction | Coveted relic | Obtained at | Lore basis |
|---|---|---|---|
| Mud Monarchs | Mud Flood Nexus Pulse-Key | Mud Flood Nexus | control the buried country's subterranean systems |
| Forgotten Order | Architect's Master Blueprint | Red Tower of Nimari | recover lost engineering to rebuild |
| Reclaimers Guild | Fragment of the Endless Stair | Endless Stair | prize salvage from the great conduit |
| True Tartarians | Mask of Tartaria's Last King | Buried Cities | sacred link to ancestral history |
| Eternal Dynasty | Eternal Dynasty's Blood-Signet | Asgardar | verify bloodline purity / divine right |
| Conspiracy Architects | Timeworn Ether Compass | Cradle of Dusk | hidden ways / paths to locked cities |
| Servants of the Giants | The Entombed's Prayer Tablet | Buried Cities | venerate the Giants as divine architects |
| Stone Builders | Obsidian Siphon | Obsidian Pillars | engineering — stabilize Etheric grids |
| Tartarian Revivalists | Aetheric Phoenix Feather | Sinking Cathedral | rebirth — revive dead Tartaria |

**Unused-by-Broker canon relics** (in `canon-loot-treasure.json` for Arbiter lore
+ future systems): Zalmar Frequency Harmonizer, Sentinel Commander's Crest, Wrath
of the Ether Titan, Heart of the Ether Dragon, Aetherstorm Shard, Sovereign Ether
Crown.

---

## Title → counter → perk map

| Title | Counter (titles.ts) | Threshold | Perk |
|---|---|---|---|
| Wayfarer of the Lost Paths | `labyrinthCleanRuns` | ≥1 | `pathfinder` |
| Speaker of Forgotten Tongues | `languageLearned` | ≥1 | `machineSpeech` |
| Warden of the Old World | `relicsPreserved` | ≥1 | `ruinsDefenseBonus +1` |
| Shadow Diver | `trapCleanDives` | ≥3 | `stealthBonus +1` |
| Protector of the Forgotten | `settlementsDefended` | ≥1 | `ruinsDefenseBonus +1` |
| Guild Broker | `alliancesBrokered` | ≥1 | `diplomacyBonus +1` |

---

## How to turn one ON (post-review)

1. Supply the layout/drawing (if `needsLayout`) and save the image under
   `assets/maps/`.
2. Build the interaction handler in `gameStore.ts`, calling
   `recordTitleProgress({ <counter>: ... })` on completion.
3. Set the challenge's `enabled: true` in `LOCATION_CHALLENGES`; for new tiles
   also set `discoverable: true` in `locations.json` and drop the
   `disabled_challenge` tag.
4. Flip `TIER_C_ENABLED = true` only when the whole suite is ready (or keep it
   true and gate per-challenge once the first one ships).
