# The Shattered Empire of Tartaria — Campaign Module

> **Status:** reference content for the **Buried Skyscraper expansion**
> (scaffold lives in `app/engine/buriedSkyscraper.ts`, OTA-151 framework).
> The campaign's NPCs, key locations, encounters, and 5-Act arc are
> intended source material for the hand-authored floor maps the user
> is producing per archetype. **Not auto-ingested as a procedural
> quest chain** — campaign modules conflict with the live world's
> procedural generation.
>
> When the floor maps for the expansion start landing, this campaign
> is the canonical narrative spine. Translate Acts → floor clusters,
> NPCs → encounter actors, set-piece battles → boss floors.

---

## Original source

Ingested from `Campaign_Title__The_Shattered_Empire_of_Tartaria.docx`
on 2026-05-30 (OTA-233). Verbatim copy lives at
`docs/campaigns/shattered-empire-source.txt`.

## Quick map: Campaign → Buried Skyscraper

| Campaign element | Buried Skyscraper hook |
|---|---|
| **Act 1: The Awakening Mud** (Kholdyr ruin entry) | Entry floors (1-20) — `service_corridor` archetype |
| **Act 2: Faction Wars** (Karhold settlement, Vorgor Keep) | Mid floors — `market_level` + `shrine_level` archetypes |
| **Act 3: Rise of the Mud Monarchs** (King Abzul, Vorgor siege) | `mechanical_floor` cluster, boss floor for the Herald |
| **Act 4: Secrets Beneath** (Ghor'tar, Heart of Tartaria) | Deep floors (60-90) — `dig_camp` archetype |
| **Act 5: Shattered Throne** (final choice + epilogue) | Bottom (floors 95-100), faction-aligned endings |

## Key NPCs (for floor encounter authoring)

- **Dr. Melior Vast** — Forgotten Order scholar. Seeks relics for research.
- **Tareen Drez** — Reclaimer agent. Wants Tartarian tech for "the betterment of society" with possible ulterior motives.
- **King Abzul** — Ancient Mud Monarch. Final boss; merging with the Heart of Tartaria.
- **Herald of King Abzul** — Mid-campaign lieutenant boss (Act 3, Vorgor Keep siege).
- **Lira Valen** — Mud Dweller leader opposed to outside reclamation.

## Choice-based endings (matches the existing Choice ending system)

- Hand the Heart to the **Reclaimers** → power may corrupt, restoration arc.
- Hand to the **Forgotten Order** → arcane misuse, possible cycle restart.
- Side with **Mud Dwellers** → keep Tartaria's power hidden; isolationist ending.

## Open questions for integration

1. The campaign's locations (Kholdyr, Karhold, Vorgor Keep, Ghor'tar) need
   either (a) authored floor map slots in the expansion or (b) procedural
   stub locations linked from the expansion's exit. Decision deferred to
   the floor-map authoring pass.
2. The Heart of Tartaria as a relic doesn't yet have a catalog row.
   When the expansion's loot table lands, it goes in there.
3. King Abzul as a boss enemy needs a row in `enemies.json` with
   Mud Monarch faction + relic-channeling abilities. Deferred.
