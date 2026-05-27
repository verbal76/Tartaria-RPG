# Tartaria — Playable Races: Image Generation Guide

> Single-document distillation of every authored description of each of the seven playable races. Sources: `app/data/races/races.json` (in-game mechanical layer + flavor) and `docs/lore-source.txt` (Tartaria Prima lorebook narrative). Use this to generate male and female portrait images for the player creation / approval screen.

---

## Recommended image resolution

For a **player creation approval screen** (full-screen portrait card on mobile + future tablet/web support):

| Target use | Resolution | Aspect | Notes |
|---|---|---|---|
| **Recommended baseline** | **1024 × 1536** | 2:3 portrait | Sweet spot for SDXL / Midjourney / DALL-E 3. Sharp on every phone display at 3× DPR (covers 341 × 512 logical pixels = full half-screen). |
| Premium / tablet-friendly | **2048 × 3072** | 2:3 portrait | Future-proofs for tablets and high-DPI desktop. ~4 MB per PNG; bundle-friendly. |
| Approval thumbnail (auto-derive) | 512 × 768 | 2:3 portrait | Scale down from the baseline; don't render at this size directly. |

Generate at **2048 × 3072** if you have the credits — it downscales beautifully to all phone sizes and gives the player creation screen real visual weight. Two images per race × seven races = **14 portraits**.

For consistency across the set, keep:
- **Same camera framing** for every race: head + shoulders + upper chest (so size differences read through pose, not zoom)
- **Same lighting key**: dim, side-lit, with one warm rim light (think wet-stone-and-Aether-blue palette)
- **Same background motif** per race (drawn from its setting context below), so the approval screen feels like a unified bestiary

---

## 1. Tartarian Giants

**Race ID:** `tartarian_giant`
**Subtitle (lore):** *Masters of the Lost Empire*
**Role:** Towering descendants of Tartaria's first builders. Strongest hand-to-hand fighters; revered as divine by True Tartarians.

### Physical description (synthesized from canon)

- **Height: over 10 feet tall.** The single most defining trait — they tower above ceilings of human structures.
- Massive, broad-shouldered frame. Powerful, deliberate build — not lean, not bulky-fat; carved.
- Skin tone: weathered stone-grey, dusky bronze, or pale ashen depending on bloodline lineage; in modern times often dust-coated from millennia of cave-dwelling.
- Long hair, often braided or tied back. Beards (on males) often elaborate, sometimes threaded with metal rings or aether-crystal beads.
- Eyes carry an unsettling intelligence — described as "remembering bloodlines." Iris colors trend amber, deep slate-grey, or pale Aether-blue.
- Hands so large they make a relic look like jewelry.
- Bearing: regal, unhurried, never bowing.

### Equipment / wardrobe

- Robes of heavy weathered cloth — long, layered, often draped over one shoulder.
- Architectural-scale gauntlets or arm-rings forged of Tartarian alloy, sometimes humming faintly with dormant Aetheric energy.
- Carry oversized two-handed weapons (greatswords, war-mauls, runic staves). Weapons are scaled to their grip — anything human-sized looks like a toy on them.
- Symbols of the lost empire stitched or engraved into their clothing — spiral motifs, Aether-grid patterns, fading royal sigils.

### Setting context (for background composition)

Ancient citadels perched atop high mountains. Cyclopean halls of carved Aetherstone. Half-buried domes of pre-flood architecture. Pillars taller than trees. Dim blue Aether-glow from cores still flickering after millennia. *"The buried halls remember your bloodline; the stones still hum with the commands your ancestors left in them."*

### Mechanical anchors (for visual cues)

- **Base AC 12** (naturally tough)
- **Strength +2** (broad shoulders, thick arms)
- **Barehand damage: 1d6 +2** (their fists ARE weapons)
- **Penalty in confined spaces** (-4 AC) — they're physically uncomfortable indoors

### Suggested image prompts

**Male prompt seed:**
> A 10-foot-tall Tartarian Giant warrior-king, head and shoulders portrait, weathered bronze skin, elaborately braided long dark beard threaded with copper rings, deep amber eyes that seem to remember ancient cities, broad shoulders draped in layered weathered cloth robes with faded spiral aether-grid embroidery, massive runic gauntlets, faint blue aether glow from a buried core lighting the cyclopean stone hall behind him, dim moody lighting with warm rim light, regal unhurried bearing, painterly fantasy realism.

**Female prompt seed:**
> A 10-foot-tall Tartarian Giant matriarch, head and shoulders portrait, weathered pale-ashen skin, long silver braids threaded with aether-crystal beads, pale aether-blue eyes that hold ancient knowing, broad strong shoulders draped in dark layered Tartarian robes with copper architectural embroidery, intricate runic arm-rings humming faintly with dormant power, half-buried Tartarian dome architecture lit by soft Aether glow behind her, dim moody side-lighting with warm rim, regal unbowed bearing, painterly fantasy realism.

---

## 2. True Tartarians (Mud Dwellers)

**Race ID:** `mud_dweller`
**Subtitle (lore):** *Survivors of the Subterranean World*
**Role:** True Tartarians who survived underground in subterranean enclaves. Nimble but lacking brute force; rely on Aethercraft.

### Physical description (synthesized from canon)

- Human-scale, lean, wiry build. Generations of subterranean life have produced an adapted, sinewy frame.
- **Pale, almost translucent skin** — the dark was their cradle. Often pale grey-white or with a slight blue-undertone from constant Aether exposure.
- **Large dark-adapted eyes** — wide pupils that catch any light source. Often unsettlingly reflective in low light.
- **Hair**: often coarse, dark, sometimes streaked with prematurely silver strands from Aetherstone exposure.
- **Skin sometimes scarred** by prolonged Aethercraft use — faint blue-glowing capillary lines running along their forearms and temples.
- Hands deft and calloused — fingers stained from working raw Aetherstone like clay.
- Bearing: cautious, watchful, like someone who's spent their life hearing for the next collapse.

### Equipment / wardrobe

- Layered scavenged textiles: leather, salvaged Tartarian fabric, patched cloaks. Earth tones — mud-brown, soot, ash-grey.
- Tools and pouches for collecting Aetherstone fragments. Carved bone or aether-crystal amulets.
- A small Aetherstone shard often visible at the neck or wrist — their personal lantern + focus for Aethercraft.
- Cloth or leather face wraps (used when surfacing — they avoid being recognized).

### Setting context

Hollowed-out caverns of glowing Aetherstone-blue. Aetherforge workshops. Bioluminescent fungus farms. Ruins of pre-flood Tartarian halls reinforced with scavenged tech. Deep, narrow passages. The eerie soft hum of Aetherstone reactors.

### Mechanical anchors

- **Base AC 10**, +1 underground
- **Dexterity +2** (nimble)
- **Barehand damage: 1d6 -3** (not brute force — they're not fist-fighters)
- **Dark Vision** (can see in darkness)
- **Aethercraft Mastery** (+2 INT casting; their hallmark ability)

### Suggested image prompts

**Male prompt seed:**
> A Mud Dweller (True Tartarian) male, head and shoulders portrait, pale grey-white skin with faint blue-glowing aether capillary lines along temple and neck, large dark-adapted eyes catching low blue light, coarse dark hair with premature silver streaks, lean wiry build, layered scavenged earth-tone clothing — patched leather and ash-grey cloth, small aetherstone shard amulet at throat glowing soft blue, fingers stained dark from working raw aetherstone, hollow underground cavern lit by bioluminescent fungus and an aether-blue reactor glow, watchful cautious expression, painterly fantasy realism.

**Female prompt seed:**
> A Mud Dweller (True Tartarian) female, head and shoulders portrait, pale grey-white skin with delicate blue-glowing aetheric vein-tracings at temples, large dark-adapted eyes reflective in low light, long coarse black hair with silver-grey streaks, lean wiry frame, layered earth-tone scavenged textiles — soot-brown leather over patched Tartarian salvage cloth, carved bone aether-crystal amulet at neck, hands stained with aether-clay, deep cavern of glowing aetherstone-blue behind her, soft watchful expression, painterly fantasy realism.

---

## 3. Architectural Sentinels

**Race ID:** `architectural_sentinel`
**Subtitle (lore):** *Guardians of the Ancient World*
**Role:** Aetherstone-powered constructs left over from Tartaria's golden age. Tireless, durable, programmed with ancient duties.

### Physical description (synthesized from canon)

- **Constructs, not flesh.** Humanoid but unmistakably mechanical. Some closer to "ancient warrior in gleaming Aetheric armor"; others more alien, designed to intimidate.
- Heights vary — typically 6.5 to 8 feet — slightly larger than human but well below Giant.
- Body of Tartarian alloy and ceramic plating, joints visible at shoulders/elbows/knees with exposed runic seams.
- **Aetherstone core** glowing through chest cavity — soft blue or pale violet light, visible through worn or damaged plates.
- **Eyes are glowing aether-light** — pale blue, sometimes amber. Recessed deep in the helmet/face structure.
- Face: an engraved or sculpted helm-mask, often stylized as a Tartarian noble's likeness or an animal motif (lion, owl, falcon). Some show "expression" through micro-shutters and core-light intensity.
- **Centuries of wear** — patina, pitting, vines or aether-moss creeping into seams. Some Sentinels carry battle scars from skirmishes that ended an empire.

### Equipment / wardrobe

- Built-in armor: layered runic plating, ornamental but functional.
- Heraldic engraving running along the chest plate, shoulder guards, and helm — symbols of the city or vault they were assigned to guard.
- Built-in weapons: forearm-mounted Aetheric blades, palm-emitter projectile arrays, or polearm-style limbs depending on design.
- Cloak or tabard of ancient fabric in some cases — colors faded by millennia.

### Setting context

Forgotten Tartarian halls. Aether-grid corridors. Pillared vaults. Statue-lined avenues where the Sentinels themselves are statues until you trip a sensor. Soft scanning blue-light sweeping the floor. Deep silence punctuated by the slow whine of an awakening core.

### Mechanical anchors

- **Base AC 10**, +2 with runic gear
- **STR +2, INT +1** (intelligent constructs)
- **Barehand: 1d10 even/odd to land** — they hit hard but with mechanical, calibrated motion (every other strike lands)
- **Immune to time / hunger / fatigue** (don't draw fatigue lines in the portrait)
- **Aetheric Constitution** — half damage from energy attacks

### Suggested image prompts

**Male prompt seed:**
> An Architectural Sentinel construct in male humanoid form, head and shoulders portrait, 7 feet tall, weathered tartarian alloy plating with pale blue aetherstone core glowing softly through cracks in the chest plate, sculpted helm-mask styled after a noble Tartarian face with recessed pale-blue glowing eyes, ornamental runic engraving along shoulder guards and helm, patina and aether-moss in the joint seams, faded heraldic tabard, dim Tartarian hall background with soft scanning blue light, painterly fantasy realism, unmoving vigilant pose.

**Female prompt seed:**
> An Architectural Sentinel construct in female humanoid form, head and shoulders portrait, 7 feet tall, weathered tartarian alloy plating with violet aetherstone core glowing softly through worn chest seams, sculpted helm-mask styled after a noble Tartarian woman's face with recessed pale-violet glowing eyes, ornamental runic engraving along shoulder guards and helm, centuries of pitting and aether-moss creeping along seams, faded heraldic tabard in royal teal, dim Tartarian vault background with slow scanning blue light, painterly fantasy realism, unmoving vigilant pose.

---

## 4. Mud Golems (Aether Golems)

**Race ID:** `mud_golem`
**Subtitle (lore):** *Sentinels of Aetherstone*
**Role:** Etheric constructs born of the mud that consumed Tartaria. Unpredictable. Some serve their makers, others turn on them.

### Physical description (synthesized from canon)

- **Hulking, massive figures of rock, mud, and Aetherstone**, glowing with soft eerie aetherstone light from within.
- 8-9 feet tall, broader than wide, bodies that look half-eroded and half-reformed — like the earth itself decided to walk.
- **Composite body** of cracked stone, hardened mud, embedded aether-crystals; runs of glowing blue/violet energy at the cracks where the body has split and reformed.
- **No clear face** — eye sockets are voids glowing with raw Aetheric light. Some have a vestigial helm-shape; others are entirely amorphous head-mass.
- Movement narrative: slow, deliberate, with the geological inevitability of a slow-moving landslide.
- Skin texture: wet-looking stone, with rivulets of mud drying and re-saturating depending on proximity to Aetherstone deposits.

### Equipment / wardrobe

- **No conventional clothing** — they ARE clothing-less, their body IS their armor.
- Sometimes Aetheric-charged runes carved into their chest or shoulders by whoever (if anyone) summoned them — these runes glow when active.
- Bound vines, ancient ritual chains, or relic fragments embedded in their stone-mud body — leftover from ancient bindings.
- Weapons: their fists, slabs of broken stone they wield as clubs, or aetherstone they can manipulate at close range (block + attack).

### Setting context

Pulsing Aetherstone caverns. Mud-flooded ruins where the mud is still alive. Buried Tartarian halls that haven't seen light in centuries. Aetheric ley lines running through the floor as glowing veins.

### Mechanical anchors

- **Base AC 8** (low — they're hard to wound but slow to dodge)
- **STR +2** (massive)
- **Barehand: 1d6** (their swing IS heavy stone)
- **Half damage from non-Aetheric attacks** (composite body)
- **Regenerates near Aetherstone**

### Suggested image prompts

**Male prompt seed:**
> A male Mud Golem, head and shoulders portrait, hulking 8-foot construct of cracked stone and hardened mud with embedded aetherstone crystals, soft blue-violet aetheric energy glowing through the cracks where the body has split and reformed, no human face — vestigial helm-shape with two void eye-sockets glowing pale blue with raw aetheric light, runic carvings glowing soft on the chest, drying mud rivulets on the wet-stone skin, ancient ritual chain fragments embedded in one shoulder, pulsing aetherstone cavern with ley-line glow behind him, painterly fantasy realism, slow geological menace.

**Female prompt seed:**
> A female-coded Mud Golem, head and shoulders portrait, slightly more sculpted than the male variant — 8-foot construct of cracked stone and hardened mud with embedded aetherstone crystals at the collarbone and brow, glowing soft violet aetheric energy at the body's cracked seams, no human face — sculpted mud-clay mask suggesting a high-cheekboned visage with two void eye-sockets glowing pale violet, runic carvings glowing along shoulders and collar, drying mud rivulets, broken vine bindings around one wrist, buried Tartarian hall with aetheric ley-line glow behind her, painterly fantasy realism, slow inevitable presence.

---

## 5. Reclaimers

**Race ID:** `reclaimer`
**Subtitle (lore):** *Adventurers of the Forgotten World*
**Role:** Treasure hunters and scavengers, equally at home in ruined cities and dangerous tunnels. Profit before ideology.

### Physical description (synthesized from canon)

- **Ordinary human stock** — modern-era humans descended from Tartarians who don't know it.
- Variable build (lean to wiry to athletic), variable skin tone (full human variety), variable hair.
- Weathered, scarred, marked by the work — old burns from Aether-mishaps, scrapes from ruin-diving, callused hands.
- Eyes alert, scanning — always reading the room for exits, traps, and price tags.
- Practical short or tied-back hair. Beards usually trimmed (long beards catch on ruin debris).

### Equipment / wardrobe

- **Modern-archaeologist mash-up**: salvaged Tartarian gear over modern fabric.
- Goggles or a salvaged Tartarian visor on the forehead or around the neck. **Aetheric flashlight** clipped to the belt or shoulder strap.
- Climbing harness with rope coils, carabiners, pry bars. Heavy work gloves.
- **Reclaimer's Compass** or Aetherstone detector amulet — always within reach.
- Practical clothing: canvas pants, layered leather jacket with reinforced patches, scarf or face wrap for dust.
- Knife at the belt, often a sidearm holster (revolver-style or salvaged Tartarian sidearm).
- Patches and pouches — every Reclaimer's outfit is a mobile workshop.

### Setting context

The Reclaimers' Outpost on the Tartarian Outskirts (mud-brick checkpoint, burned-iron arches, dig camps). Half-collapsed Tartarian ruins. Black-market night-bazaars lit by buzzing aether-lanterns. Dust, mud, ropes, ladders.

### Mechanical anchors

- **Base AC 10**, +1 in constructed environments
- **DEX +1** (scavenger reflexes)
- **Barehand: 1d6** (standard human punch)
- **Urban Explorer** (acrobatics + stealth in ruins)
- **Relic Hunter** (sense Aetherstone within 30 feet)

### Suggested image prompts

**Male prompt seed:**
> A Reclaimer male relic-hunter, head and shoulders portrait, weathered athletic human in his late 30s, sun-darkened skin with a faint old burn-scar across one cheekbone from an aether mishap, short tied-back dark hair, alert scanning eyes, salvaged Tartarian visor pushed up on his forehead, layered canvas-and-leather scavenger's coat with reinforced patches at shoulders, climbing harness with rope coils visible at the chest, aetheric flashlight clipped to a strap glowing soft blue, aetherstone detector amulet at his throat, dusty Tartarian Outskirts dig camp background with burned-iron arches, painterly fantasy realism, ready-for-anything bearing.

**Female prompt seed:**
> A Reclaimer female relic-hunter, head and shoulders portrait, weathered athletic human in her 30s, sun-darkened skin with a faint scrape healing along one temple, long dark hair pulled back into a tight braid, sharp scanning eyes, salvaged Tartarian goggles around her neck, layered canvas-and-leather scavenger's jacket with reinforced shoulder patches, climbing harness with carabiners visible at her chest, aetheric flashlight clipped to a strap glowing soft blue, aetherstone-detector amulet at her throat, dusty Reclaimers' Outpost dig camp background with burned-iron arch, painterly fantasy realism, confident scavenger's posture.

---

## 6. Unknowing Masses

**Race ID:** `unknowing_mass`
**Subtitle (lore):** *The Ignorant Inheritors of a Forgotten Past*
**Role:** Ordinary surface-dwellers unaware of Tartaria's existence until they stumble into it. Average human stock, but adaptive.

### Physical description (synthesized from canon)

- **Completely ordinary modern humans** — the everyman/everywoman of 2148 Earth.
- Full ethnic / phenotypic variety. Average build. Average everything.
- The portrait's hook is NOT exotic biology — it's the *moment of disorientation*. The character has just discovered Tartaria. The expression is unsettled, curious, looking at something off-camera that doesn't fit the world they thought they lived in.
- Clean(ish) — they haven't been doing this long. No scars, no aether-burns. Yet.
- Hair and clothes are everyday modern — they were running errands when their life changed.

### Equipment / wardrobe

- **Civilian modern clothing** — t-shirt under a jacket, hoodie, casual button-down. Practical sneakers or work boots.
- A single anomalous object — a Tartarian locket, a relic fragment, a salvaged ancient coin — held in their hand or visible in a jacket pocket. *That's the artifact that just changed everything.*
- Backpack or messenger bag — they were carrying it when this started.
- A modern phone visible somewhere (in a pocket, or held in the other hand) — still connected to the world they're leaving behind.

### Setting context

A pawn shop window where something just stared back. A grandparent's attic. A modern city street with a buried Tartarian alleyway visible in the background. The aesthetic is **mundane + intrusion** — modern life with a single piece of Tartaria poking through.

### Mechanical anchors

- **Base AC 10** (baseline human)
- **No racial stat bonus** (true everyman)
- **Barehand: 1d6** (standard punch)
- **Curious Mind** (+2 INT/WIS after first Tartaria exposure)
- **Beginner's Luck** (once-per-day reroll)

### Suggested image prompts

**Male prompt seed:**
> An Unknowing Masses male, head and shoulders portrait, ordinary 30-year-old modern human in a casual layered hoodie under a worn jacket, average build, no scars, expression unsettled and curious — caught in the moment of realizing the world isn't what he thought, holding a single small Tartarian locket in his hand that is humming faintly with soft aether-blue light, modern city street fading into a buried Tartarian alleyway behind him, painterly modern realism with a touch of the uncanny, mundane-meets-intrusion mood.

**Female prompt seed:**
> An Unknowing Masses female, head and shoulders portrait, ordinary 30-year-old modern human in a casual t-shirt under a buttoned overshirt, average build, no scars, expression unsettled and questioning — just discovered something that doesn't fit the world she knew, holding a single small Tartarian relic-fragment in her hand humming faintly with soft aether-blue light, modern pawn-shop window fading into Tartarian ruin glow behind her, painterly modern realism with a touch of the uncanny, mundane-meets-intrusion mood.

---

## 7. Aetherborn

**Race ID:** `aetherborn`
**Subtitle (lore):** *The Hidden Heirs of Tartaria*
**Role:** Descendants of Tartaria's noble bloodlines, born with awakened Aetheric genes. Powerful, dangerous, hunted.

### Physical description (synthesized from canon)

- Human-scale, but unmistakably *other*. Where the Unknowing Masses are mundane, the Aetherborn carry the **markers of noble Tartarian blood**.
- Striking, refined features — like a model who's been mistaken for royalty their whole life and never understood why.
- **Eyes carry faint Aetheric luminescence** — pale blue, violet, or pale gold flecks that catch light in ways normal eyes don't.
- **Skin** smooth and slightly luminous — sometimes with delicate aetheric vein-tracings visible at the temples, throat, or inner wrist when their powers are active.
- Hair often pale (silver, platinum) or unusually dark (raven-black) — rarely the in-between shades. Family stories say "your great-aunt had that same hair."
- Bearing: a quiet commanding presence even when slouching. They can't help it.

### Equipment / wardrobe

- Modern clothing with **subtle aristocratic detailing** — a tailored coat, a high collar, an antique pendant. They don't dress for nobility because they don't know they are nobility — but the instinct shows.
- **A family heirloom** prominently visible: a locket, a ring, an old pin. *That's the focus that hums.* The grandmother kept it.
- Cleaner, more carefully kept than a Reclaimer — but not pristine. They live in the modern world.
- When their powers manifest, the heirloom glows; when they don't, it's just a piece of jewelry that no one will explain.

### Setting context

A grandmother's locket. A modern interior with a single oil portrait of a stern-looking ancestor on the wall. A subway tunnel where the lights flickered when they walked past. Crowds where people unconsciously give them more space than they should.

### Mechanical anchors

- **Base AC 11** (slight natural Aetheric resistance)
- **CHA +1** (commanding presence)
- **Barehand: 1d6 -2** (not built for hand-to-hand — they have other tools)
- **Aetheric Awakening** (sense relics, +2 INT around them)
- **Latent Powers** (once-per-day Aetheric surge — speed/strength/barrier for 3 rounds)
- **Destiny Unfolding** — using rare/legendary Aether powers costs them 1d6 HP self-damage. Their gifts have a price.

### Suggested image prompts

**Male prompt seed:**
> An Aetherborn male, head and shoulders portrait, refined late-20s human with striking unusually-symmetrical features, smooth skin with delicate aetheric vein-tracings visible at the temples glowing faint pale-violet, pale silver-blond hair worn slightly long, pale violet eyes with subtle aetheric luminescence, tailored dark high-collar modern coat with an antique silver pendant locket at the throat humming faintly with aether-blue light, quiet commanding bearing even while still, modern interior background with a single oil portrait of a stern Tartarian ancestor visible behind him, painterly modern fantasy realism, the look of someone whose grandmother kept a secret.

**Female prompt seed:**
> An Aetherborn female, head and shoulders portrait, refined late-20s human with striking unusually-symmetrical features, smooth skin with delicate aetheric vein-tracings visible at the temples and throat glowing faint pale-violet, raven-black hair worn long and straight, pale gold-flecked eyes with subtle aetheric luminescence, tailored modern high-collar coat with an antique silver locket at the throat humming faintly with aether-blue light, quiet commanding bearing, modern interior background with a single oil portrait of a stern Tartarian ancestor visible behind her, painterly modern fantasy realism, the bearing of an heir who doesn't yet know she's one.

---

## Cross-race visual style guide

For approval-screen consistency, render every race with these shared parameters so the seven portraits feel like one collection:

| Parameter | Value |
|---|---|
| **Aspect** | 2:3 portrait (1024×1536 minimum, 2048×3072 ideal) |
| **Crop** | Head + shoulders + upper chest |
| **Camera angle** | Slight three-quarter view (5-15° off-axis); never dead front |
| **Lighting** | Dim, side-key with a single warm rim light from the opposite side |
| **Palette anchor** | Aether-blue + warm bronze + weathered earth tones — the Tartarian palette |
| **Style** | Painterly fantasy realism (think *D:OS 2 / Pillars of Eternity* portrait era) |
| **Background** | Soft, in-character, dim — never busy. Suggest the race's setting in 3-4 elements max. |
| **Eyes** | Always visible, always lit. The race's defining "tell" lives in the eyes (Giant's amber knowing, Sentinel's recessed glow, Aetherborn's luminescence, etc.) |
| **Negative prompts** | "Cartoon, anime, photoreal, full body, weapon-focused, modern photo studio, blank background, low contrast, hands prominent" |

---

## Cross-race naming for the file outputs

When you save the 14 generated portraits, this naming convention will plug cleanly into a future asset pipeline:

```
assets/portraits/
  tartarian_giant_m.png
  tartarian_giant_f.png
  mud_dweller_m.png
  mud_dweller_f.png
  architectural_sentinel_m.png
  architectural_sentinel_f.png
  mud_golem_m.png
  mud_golem_f.png
  reclaimer_m.png
  reclaimer_f.png
  unknowing_mass_m.png
  unknowing_mass_f.png
  aetherborn_m.png
  aetherborn_f.png
```

The race IDs match `races.json` exactly so a later `<PortraitPreview raceId={...} gender={...} />` component can resolve filenames programmatically.

---

*Sources: `app/data/races/races.json` (OTA 054 baseline), `docs/lore-source.txt` (Tartaria Prima lorebook lines 3218–3302). Authored 2026-05-22 for the player creation approval screen.*
