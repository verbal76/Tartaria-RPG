# Wave Three — the Asgardar spires

**Status: STAGED, NOT STARTED.** Owner: *"stage the next thing in the wave to work on,
don't do it yet, but lay out the framework and explain what we are doing and why."*

Nothing in this document has been applied. It is the plan and the measurements behind it.

---

## 0. ⚠⚠ WHAT THE MEASUREMENT CHANGED

`LOCATION-CHANGES.md` scoped Wave Three as **L8–L12**, and its headline was:

> *"`worldLadder.json` places `grand_spire_etheria` INSIDE Asgardar while
> `grand_spire_of_etheria` is a separate top-level location with its own climb and its own
> summit boss. The world says one spire is in two places."*

**That framing is wrong, and I wrote it.** Measuring the shipped data before planning any
work turns up three things that change what Wave Three actually is:

### ⚠ Finding 1 — there are TWO spires on purpose, not one spire duplicated

`app/engine/greatClimbs.ts` defines them as separate climbs with separate everything:

| id | location | noun | tiers | reward |
|---|---|---|---|---|
| `grand_spire` | `grand_spire_of_etheria` | the Grand Spire of Etheria | 15 | Skyreacher Crown |
| `asgardar_spire` | `asgardar` | **the Buried Spire of Asgardar** | 14 | Skyreacher Cuirass |

Two names, two heights, two pieces of a five-piece set. This is authored intent, not drift.
Asgardar has its *own* crown-spire; the Grand Spire of Etheria is a different tower.

### ⚠⚠ Finding 2 — the tile L9 wanted us to BUILD already exists

L9 says *"Create `asgardar_crown_spire`… all seven registries are required or the tile
renders mute."* Measured:

- `locations.json` — `grand_spire_of_etheria` exists, `"parent": "asgardar"`, danger 5,
  `type: "tower"`, its own aliases and 33 interactables.
- `atlasCoords.ts` — `asgardar { fx 0.16, fy 0.47 }`, `grand_spire_of_etheria { 0.16, 0.53 }`.
- Canon cells, read from the engine: **Asgardar (27,19), Grand Spire (27,21).**
- `worldLadder.ts` — both mapped to the `lost_capitals` macro.

**It is already its own tile, parented to Asgardar, two cells out.** Compare that to the
owner's own Wave Three instruction:

> *"we can make a named file for the Grand Spire 1-2 spaces East of Asgardar it can be known
> to be at Asgardar and be just outside the city"*

Two cells south rather than east — otherwise this is exactly the thing he asked for, and it
shipped some time ago. **L9 is the expensive, risky item in Wave Three (seven registries, a
possible atlas-cell collision) and it does not need doing.**

### ⚠ Finding 3 — the real contradiction is one room and one sentence

What genuinely disagrees is Asgardar's **interior**:

- `worldLadder.json` → `lost_capitals ▸ asgardar` description: *"The **Grand Spire of
  Etheria** still throws light at full power five centuries after the flood."*
- the same node's first micro-micro room: `id: grand_spire_etheria`, `name: "Grand Spire of
  Etheria"` — a room **inside** Asgardar.
- but the climb the engine hosts at Asgardar is **the Buried Spire of Asgardar**.

So Asgardar's interior is named after its neighbour's tower. That is a **text problem in two
places**, not a world-structure problem.

---

## 1. ⚠⚠ AND ONE LIVE BUG THE ROADMAP PREDICTED BACKWARDS

L11 warned that once two tiles carry the word "asgardar", the `asgardar_spire` token would
**over**-match. Measured, today, the problem is the opposite: it **under**-matches.

`greatClimbFor(noun, locationId)` resolves a climbed noun by `noun.includes(token)`.
`asgardar_spire.tokens = ['asgardar']`.

**The intended path works.** Once the player uses Skyreacher Chart 2, `beginScene` injects
the canonical noun *"the Buried Spire of Asgardar"* into the scene's ambient nouns. That
string contains "asgardar", so climbing it resolves to the 14-tier great climb. ✓

**The natural path does not.** `asgardar`'s own interactable list **leads with `spire`**. A
player standing in the buried capital who types *"climb the spire"*:

- `grand_spire` tokens are `spire of etheria` / `grand spire of etheria` → no match
- `asgardar_spire` token is `asgardar` → `"spire"` does not contain it → **no match**

…and falls through to a generic 3-tier ascent, at a landmark that hosts a 14-tier one. That
is verbatim the symptom `gameStore.ts` already documents at the OTA-1304 seam:

> *"Climbing that pillar gives a generic 3-tier ascent ending in 'Tier 3/3 cleared' — which
> is exactly the symptom that opened this item, and it reads as the chart having lied."*

⚠ Both risks are real. The token is too narrow **now**, and would become too broad if a
second asgardar-named tile were ever added. Any fix has to solve both, which means the fix is
"tokens that name the SPIRE, plus the existing location check", not "more tokens containing
the city's name".

---

## 2. What Wave Three becomes

Re-cut against the measurements. **Ordered so every step is shippable on its own** and the
cheap, high-value work lands before anything risky.

### W3-A — Decide the naming ⚠⚠ OWNER CALL, blocks everything else
The only real question in this wave, and it is a lore question, not a code one:

> **Asgardar's own great climb is "the Buried Spire of Asgardar". Its interior room and its
> ladder description are both named "Grand Spire of Etheria". Which name is the mistake?**

Two coherent answers, and they lead to different work:

- **(a) The interior is mis-named.** Asgardar's crown-spire is the Buried Spire; the Grand
  Spire of Etheria is the separate tower two cells south. → rename the room and rewrite one
  description. Small, text-only. *This is the reading the climb table and the atlas already
  support, and the one I'd recommend.*
- **(b) They are the same tower, seen from inside and outside.** Then the Buried Spire climb
  is the mistake and should be folded into the Grand Spire — which deletes a Skyreacher
  piece from a five-piece set and is a much larger change.

**No code until this is answered.** Everything below assumes (a).

### W3-B — Make the natural noun work ⚠ the only actual bug here
- **File:** `app/engine/greatClimbs.ts` (tokens only).
- **What:** give `asgardar_spire` tokens that name the *spire* (`buried spire`, `crown-spire`,
  `buried spire of asgardar`) and keep `asgardar` for the chart-injected canonical noun.
  The existing `locationId` check in `greatClimbFor` already prevents leakage between the two
  spires, so a shared bare token like `spire` can be considered — **but only with the location
  check proven by test first**, because `spire` also appears in the interactables of
  `obsidian_pillars` and `zharaks_teeth`.
- **Test:** at Asgardar, `climb the spire` resolves to `asgardar_spire`; at the Grand Spire
  tile the same words resolve to `grand_spire`; at Zharak's Teeth they resolve to **neither**.
- **Risk:** low. Pure resolution logic, fully unit-testable, no save impact.

### W3-C — Rename the interior room and the ladder line *(assumes W3-A = a)*
- **Files:** `app/data/world/worldLadder.json` — the `asgardar` micro `description`, and the
  `grand_spire_etheria` micro-micro `id` + `name`.
- ⚠ **The `id` is the risk in this step.** Room ids are persisted in saves as `hubRoomId` /
  room keys. Changing `grand_spire_etheria` → `asgardar_buried_spire` strands anyone standing
  in it. **Either** keep the id and change only the display name (safe, slightly untidy),
  **or** change the id and add a migration at the `loadSlotIntoGame` seam — the same seam the
  OTA-1320 gear backfill uses. Recommend: **change the name, keep the id**, and leave a
  comment saying why.
- **Test:** no location, ladder room, or lore entry names the Grand Spire as being *inside*
  Asgardar.

### W3-D — Skyreacher Chart 2 wording
- **File:** `app/data/items/gear.json` line ~1300. Current text: *"plots the route to the
  buried spire of Asgardar and opens its great climb."*
- ⚠ Measured: **this is already correct** under reading (a). It says *buried* spire, and it
  unlocks `asgardar_spire`. L12 assumed it was wrong; it is not. **Verify and close, don't
  edit** — unless W3-A lands on (b).

### W3-E — Lore sweep
- **Files:** `app/data/lore/glossary.json`, `app/data/lore/location-flavors.json`.
- The glossary defines the spire as *"a monumental tower in Asgardar"* without saying which.
  Under (a) that needs one disambiguating clause. Cheap, text-only, do it last so it matches
  whatever names W3-A settles on.

---

## 3. What is NOT in this wave

- **L9 — build `asgardar_crown_spire`.** ⚠ **Dropped.** The tile exists
  (`grand_spire_of_etheria`, parent `asgardar`, two cells south). Building a third spire
  would create the very duplication this wave exists to remove.
- **L10 — move the climb onto the new tile.** ⚠ **Dropped with L9.** Both climbs are already
  on the tiles they belong to.
- **L13 — capitals stop being outposts / the Reclaimer camp gets its own tile.** Separate
  wave. It carries **the highest save risk in the whole roadmap**: `static_hub.json`
  `hubLocationIds` currently includes `asgardar` and `drakova`, and removing them strands any
  character standing in one of those 15 rooms. It needs its own migration and its own
  `halOnlySaveMigrationsSurvive`-shaped suite. Do not fold it in here.
- **"Great climbs at locations all their own"** — still an open owner question, and the
  measurement above is the evidence it needs: of five great climbs, **three already sit on
  dedicated non-settlement tiles** (`grand_spire_of_etheria`, `thametans_tower`,
  `obsidian_pillars`), one sits on a formation (`zharaks_teeth`), and exactly one sits on a
  populated capital (`asgardar`). So "all their own" is a one-climb decision, not a five-climb
  project.

---

## 4. Suggested order

1. **W3-A** — owner answers the naming question. *(blocks the rest)*
2. **W3-B** — token fix + tests. Ships alone; fixes a real bug; no save impact.
3. **W3-C** — rename the room's display name, rewrite the ladder description.
4. **W3-D** — verify the chart text and close it.
5. **W3-E** — glossary and flavour sweep.

W3-B is worth doing even if W3-A stalls: the generic-climb-at-a-great-climb-landmark bug is
independent of what anyone decides to call the tower.

---

## 5. How we will know it worked

- Typing `climb the spire` at Asgardar starts the **14-tier** ascent, not a 3-tier one.
- Typing the same words at the Grand Spire tile starts the **15-tier** ascent.
- Typing them at Zharak's Teeth or the Obsidian Pillars starts an ordinary climb — no
  cross-landmark leak.
- No file describes the Grand Spire of Etheria as being *inside* Asgardar.
- Both Skyreacher pieces remain reachable; the five-piece set is untouched.
