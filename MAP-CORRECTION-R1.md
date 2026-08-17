# MAP CORRECTION — REVISION 1

**Read this alongside `MAP-SPEC.md`. Where the two disagree, this document wins.**

The first render is a good painting and the wrong map. The palette, the mood and the
top-to-bottom danger gradient are all correct and should be preserved. Three things must
change, and one of them is the whole point of the exercise.

---

## 1. WHAT THE FIRST RENDER GOT RIGHT — KEEP ALL OF IT

- **No text, no numerals anywhere.** Correct. Keep it that way.
- **Terrain runs to all four edges.** No frame, no border, no corner vignette. Correct.
- **Palette.** Soot, rust, aged parchment. Water that reads as silt rather than sea. The
  molten light coming *up* from beneath in the south. This is exactly right.
- **The colour gradient runs north to south** — green, olive, orange, fissured black. The
  direction is correct; only the *timing* of the transitions needs a nudge (see §3).

**Feed the first render back in as a style anchor.** The look is not the problem.

---

## 2. ⚠⚠ CORRECTION ONE — NO BULLSEYE, NO CENTRAL CITADEL

The render placed a single monumental structure at the centre of the frame with roads,
cracks and ring-roads radiating outward in concentric circles. **Remove this entirely.**

The world is not organised around a central capital. Nothing orbits anything.

> **Prompt language:**
> *No central citadel. No radial composition. No concentric rings, ring-roads, or circular
> structures organising the layout. Danger and terrain change with LATITUDE ONLY — smoothly
> from the top edge to the bottom edge. A horizontal band structure, never a target.*

⚠ Image generators default hard to radial symmetry on the word "map". Expect to repeat this
instruction and to reject at least one render for it.

---

## 3. ⚠ CORRECTION TWO — BAND TIMING

The direction was right; the transitions sit slightly low. Measured against the render:
green ran to about 28% down and molten began about 62%. The bands should fall here:

| Band | Feel | Starts | Ends |
|---|---|---|---|
| **A** — living frontier | mossy green, pale ochre, standing water reflecting sky | top edge | **17% down** |
| **B** — deep frontier | yellow-ochre into amber, drying out, first real wreckage | 21% | **37%** |
| **C** — the drowned heart | burnt orange and rust, cities full to the second storey | 42% | **54%** |
| **D** — the Deep Below | deep red into molten black, fissures, heat-glow from beneath | 67% | bottom edge |

The gaps between bands (17–21%, 37–42%, 54–67%) are **empty transitional country** — no
landmarks sit there. The 54–67% gap is the widest and most important: it is the break
between the buried capitals and the Deep. Draw it as a real barrier — a scarp, a flood-line,
a change in the ground itself.

---

## 4. ⚠⚠⚠ CORRECTION THREE — THIS IS THE ONE THAT MATTERS

**The render painted a dense ruin-scape of well over a hundred structures scattered
decoratively. It must instead place EXACTLY 38 landmarks at 38 specific positions.**

This is not a stylistic preference. The game draws its own markers — the player's position,
contract pins, quest objectives — at these exact pixel coordinates. If nothing meaningful is
painted there, every marker in the game lands on anonymous ground. **That is the precise
failure this new map exists to fix, and the first render reproduces it.**

### The rules

1. **Exactly 38 major landmarks.** Not 40. Not 120.
2. **Each sits at its listed coordinate**, within about half a tile (30 px).
3. **Each must be individually legible** — a distinct silhouette a player can point at.
4. **The ground between them is comparatively EMPTY.** Broken country, silt, rubble fields,
   watercourses, scarps — texture, not architecture. If it looks like a place, it shouldn't
   be there.
5. Median spacing between neighbours is **134 px**, and the closest pair is **60 px**. So
   landmarks are genuinely sparse and isolated; the map should feel like a wide, mostly empty
   country with distinct places in it.

> **Prompt language:**
> *Exactly 38 distinct landmarks, sparse and widely separated, each individually readable as
> its own place. The land between them is empty broken country — silt flats, rubble, dry
> watercourses, scarps — with no buildings, ruins or structures of any kind. Do not fill the
> map with background architecture.*

### The 38 positions

Coordinates for a **2400 × 1440** canvas, with percentages so they survive a rescale.

| # | Landmark | px (x, y) | % across | % down | Draw as |
|---|---|---|---|---|---|
| 1 | **The Monarch's Waystation** | 360, 120 | 15.0% | 8.3% | camp — tents, stakes, banners |
| 2 | **Dynasty Border Post** | 540, 120 | 22.5% | 8.3% | camp — tents, stakes, banners |
| 3 | **Tartarian Pilgrim Camp** | 780, 120 | 32.5% | 8.3% | camp — tents, stakes, banners |
| 4 | **Builders' Survey Camp** | 960, 120 | 40.0% | 8.3% | camp — tents, stakes, banners |
| 5 | **Giant-Watch Shrine** | 1320, 120 | 55.0% | 8.3% | camp — tents, stakes, banners |
| 6 | **Revivalist Field Camp** | 1680, 120 | 70.0% | 8.3% | camp — tents, stakes, banners |
| 7 | **Tartarian Outskirts** | 240, 180 | 10.0% | 12.5% | camp — tents, stakes, banners |
| 8 | **Sinking Cathedral** | 840, 180 | 35.0% | 12.5% | collapsed, unreadable |
| 9 | **Reclaimer's Stake** | 120, 240 | 5.0% | 16.7% | camp — tents, stakes, banners |
| 10 | **The Architect's Blind** | 240, 240 | 10.0% | 16.7% | camp — tents, stakes, banners |
| 11 | **Great Tartary Plains** | 1140, 240 | 47.5% | 16.7% | camp — tents, stakes, banners |
| 12 | **Cradle of Dusk** | 1500, 240 | 62.5% | 16.7% | camp — tents, stakes, banners |
| 13 | **Yuldra-Tul** | 2100, 240 | 87.5% | 16.7% | drowned city — domes above silt |
| 14 | **The Buried Cities** | 720, 300 | 30.0% | 20.8% | camp — tents, stakes, banners |
| 15 | **Mud Seas** | 1680, 300 | 70.0% | 20.8% | camp — tents, stakes, banners |
| 16 | **Zharak's Teeth** | 1260, 360 | 52.5% | 25.0% | natural black rock |
| 17 | **The Hidden Market** | 1560, 360 | 65.0% | 25.0% | small, occupied, smoke |
| 18 | **Iskan-Veil** | 180, 420 | 7.5% | 29.2% | drowned city — domes above silt |
| 19 | **Obsidian Pillars** | 900, 420 | 37.5% | 29.2% | natural black rock |
| 20 | **The Parley Ground** | 1560, 480 | 65.0% | 33.3% | open flats, no structure |
| 21 | **The Sunken Enclave** | 600, 540 | 25.0% | 37.5% | small, occupied, smoke |
| 22 | **Ostragar** | 2220, 540 | 92.5% | 37.5% | drowned city — domes above silt |
| 23 | **Asgardar** | 360, 600 | 15.0% | 41.7% | drowned city — domes above silt |
| 24 | **Drakova** | 1860, 600 | 77.5% | 41.7% | drowned city — domes above silt |
| 25 | **Samarran** | 660, 660 | 27.5% | 45.8% | drowned city — domes above silt |
| 26 | **Nimari** | 1200, 660 | 50.0% | 45.8% | drowned city — domes above silt |
| 27 | **Grand Spire of Asgardar** 🆕 | 360, 720 | 15.0% | 50.0% | single leaning tower |
| 28 | **Voronov** | 1860, 720 | 77.5% | 50.0% | drowned city — domes above silt |
| 29 | **Thametan's Tower** | 780, 780 | 32.5% | 54.2% | single leaning tower |
| 30 | **Red Tower of Nimari** | 1260, 780 | 52.5% | 54.2% | single leaning tower |
| 31 | **Varakush** | 660, 960 | 27.5% | 66.7% | fortified and LIT |
| 32 | **Karok-Sa** | 1020, 960 | 42.5% | 66.7% | drowned city — domes above silt |
| 33 | **Endless Stair** | 1440, 1020 | 60.0% | 70.8% | collapsed, unreadable |
| 34 | **The Giant Vault** | 1860, 1140 | 77.5% | 79.2% | sealed door in the ground |
| 35 | **Aetheric Chamber** | 2100, 1140 | 87.5% | 79.2% | sealed door in the ground |
| 36 | **Mud Flood Nexus** | 2040, 1260 | 85.0% | 87.5% | monumental machinery |
| 37 | **Grand Spire of Etheria** ➡️ | 1920, 1320 | 80.0% | 91.7% | single leaning tower |
| 38 | **The Black Reach** 🆕 | 2040, 1320 | 85.0% | 91.7% | opening running off-frame |

---

## 5. ⚠ CORRECTION FOUR — FOUR LANDMARKS THAT MUST STAND OUT

The render treated every band as uniform. Four places deliberately contradict their
surroundings, and the map has to show it.

| Landmark | Position | What it must look like |
|---|---|---|
| **Varakush** | 660, 960 · 27.5% / 66.7% | ⚠ **The only safe place on the map**, and it sits deep in the worst country. A fortified stronghold that is visibly **LIT and occupied** — warm light, intact walls, smoke. It should be the one point of human warmth in the bottom half. The first render has nothing like it. |
| **Sinking Cathedral** | 840, 180 · 35% / 12.5% | A **lethal, black, sunken ruin sitting inside the green living band**. It must look wrong for its surroundings — a dead thing in country that is otherwise alive. |
| **Yuldra-Tul** | 2100, 240 · 87.5% / 16.7% | A **frost-bitten mountain capital** at the top-right. Cold, pale, snow-touched, where everything else in that band is warm and green. |
| **The Black Reach** | 2040, 1320 · 85% / 91.7% | Not merely cracked ground. An **opening that descends** — a chasm system whose fissures run off the bottom edge of the canvas. The map ends here because the ground does. Heat-glow from far below. Nothing built. |

---

## 6. ONE THING TO VERIFY BEFORE THE NEXT RENDER

**Confirm the output is exactly 2400 × 1440 (5:3).** The first render appeared to come back
near 1.64:1 rather than 1.667:1. That sounds trivial and isn't: every coordinate in §4 is a
fraction of the canvas, so a different aspect stretches all 38 positions away from where the
game will draw its markers. If the generator cannot hit 5:3 exactly, tell me the dimensions
it *can* produce and I will recompute every coordinate for that canvas.

---

## 7. FULL CORRECTED PROMPT — PASTE THIS

> A top-down fantasy world map, hand-inked and water-stained, in the style of an aged
> survivor's reference chart. Canvas 2400 × 1440 pixels.
>
> A drowned continent: an empire buried under mud and silt five centuries ago, now picked
> over by scavengers. Palette of soot, rust and aged parchment — grounds in near-black,
> dark umber and burnt orange. All water is thick grey-brown silt, never blue.
>
> The land changes with LATITUDE ONLY, smoothly from top to bottom: mossy green living
> country at the top edge, through yellow-ochre drying ruin-fields, into burnt orange
> drowned cities, and finally into fissured molten black at the bottom where lava-light
> glows up through cracks in the ground.
>
> NO central citadel. NO radial or concentric composition. NO ring-roads or circular
> structures. Horizontal bands, never a target.
>
> Exactly 38 distinct landmarks, sparse and widely separated, each individually readable —
> frontier camps of tents and banners in the green north, drowned cities showing only domes
> and rooftops above the silt in the middle, lone leaning towers, sealed vault doors, black
> rock formations, and one lit fortified stronghold in the lower third. The land between the
> landmarks is EMPTY broken country: silt flats, rubble, dry watercourses and scarps, with no
> background buildings or ruins.
>
> At the bottom centre-right, a chasm system whose fissures run off the bottom edge of the
> image, glowing from far below.
>
> Terrain fills the entire canvas to all four edges. No frame, no border, no vignette.
>
> ABSOLUTELY NO TEXT, NO LABELS, NO NAMES, NO NUMBERS, NO LEGEND, NO COMPASS ROSE, NO TITLE
> and no cartouche of any kind anywhere in the image.

---

## 8. ACCEPTANCE CHECKLIST FOR REVISION 2

- [ ] Exactly **2400 × 1440**
- [ ] **No central citadel**; no radial or concentric structure anywhere
- [ ] Roughly **38 distinct landmarks**, not a dense ruin-field
- [ ] The ground between landmarks is **empty broken country**
- [ ] Band transitions at approximately **17% / 37% / 54–67%** down the canvas
- [ ] A visible **barrier or scarp** across the 54–67% band
- [ ] One **lit stronghold** at 27.5% across, 67% down (Varakush)
- [ ] A **dark sunken ruin** at 35% across, 12.5% down, inside the green band
- [ ] A **cold, pale peak** at 87.5% across, 17% down (Yuldra-Tul)
- [ ] A **chasm running off the bottom edge** at 85% across
- [ ] Zero text, zero numerals, no frame
