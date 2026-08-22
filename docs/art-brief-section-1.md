# TARTARIA — ART BRIEF, SECTION 1
### Every image that bolsters what is already built

Each entry is one image. Lore quotes are taken **verbatim from the game's own data files** — `factions.json`, `races.json`, `locations.json`, `enemies.json`, `weather.json`, `hazards.json`, `golems.ts`, `dogCompanion.ts`, `arbiter-persona.json` — so nothing here contradicts what a player reads in game.

**Total: 78 images across 10 groups.**

| # | Group | Count | Priority |
|---|---|---|---|
| 1 | Race portraits | 7 | ★★★ Highest |
| 2 | Faction crests | 9 | ★★★ Highest |
| 3 | The Arbiter | 1 | ★★★ |
| 4 | Dog companions | 5 | ★★ |
| 5 | Golem companions | 4 | ★★ |
| 6 | Boss plates | 8 | ★★ |
| 7 | Location arrival plates | 20 | ★★ (12 priority, 8 second wave) |
| 8 | Weather states | 9 | ★ |
| 9 | Hazards | 11 | ★ |
| 10 | Equipment slot silhouettes | 11 | ★ |
| 11 | Death screen | 1 | ★★ |

---

## HOW TO USE THIS DOCUMENT

Paste the **STYLE HEADER** below at the top of every request, then paste one entry's **Prompt** underneath it. The style header is what keeps 78 images looking like they came from the same game.

---

## STYLE HEADER — paste this with every single prompt

> **World:** Tartaria — a lost empire drowned by the Great Mud Flood, when an Aetheric Engine at the city of Samarran malfunctioned and buried the world in mud. Cities lie hundreds of feet down. The surviving technology runs on **Aether**: a blue-violet energy that arcs, hums, and corrupts flesh over time. **Aetherstone** is hardened Aether-mud, stronger than stone. The era reads as 19th-century imperial architecture and machinery, drowned and half-dug-out, with impossible energy running through it.
>
> **Look:** Dark, wet, painterly. Heavy shadow with warm lamplight pooling in small places. Muted palette — wet browns, grey-green, rust, rotten timber, silt — broken only by **warm lantern gold** and **cold Aether blue-violet**. Weathered wood, corroded iron, cracked masonry, standing water, silt, moss. Everything looks like it has been rained on for a hundred years.
>
> **Rendering:** Detailed digital painting. Not photoreal, not cartoon, not cel-shaded. Think dark fantasy tabletop battle-map illustration and hand-painted RPG art — visible brushwork, deep contrast, fine object detail. No lens flare, no chrome, no modern UI, no neon.
>
> **Never include:** modern clothing, guns that look contemporary, plastic, text or lettering (unless the entry explicitly asks for it), watermarks, signatures, borders, UI frames.

---

## TECHNICAL SPEC — paste the relevant block with every prompt

Each group below has a **FORMAT BLOCK**. Paste it alongside the style header and the entry's prompt. These are not arbitrary numbers — they exist because of how the app actually displays the image, and the explanation is included so the model composes for it rather than just resizing at the end.

### Why the bleed rule exists — explain this to the generator

> **How this image will be used:** it is displayed inside a container whose shape changes with the device. The same picture is shown on a tall phone screen, on a short wide one, on a tablet, and sometimes inside a small square card. The app **scales the image to fill that container and crops from the centre** — it never letterboxes and never pads. That means the edges of your image get cut off by an unpredictable amount, on an unpredictable side, every single time it is shown.
>
> Two things follow, and both are mandatory:
>
> **1 — Paint all the way to every edge.** The artwork must run right off all four sides of the frame with no border, no frame, no matte, no rounded corners, no letterbox bars, no flat colour band, and no vignette that hardens into a visible edge. If the picture stops short of the frame — even by a few pixels of dark or blank — the player sees that blank strip as a black bar down the side of a character card. **Full bleed, edge to edge, with real painted content in the corners.**
>
> **2 — Keep everything that matters in the middle.** Treat the outer **15% on each side as expendable** — it exists purely to be cropped away. Every essential element (the face, the silhouette, the held object, the thing the picture is *about*) must sit inside the **centred 70%**. Compose so the image still reads correctly if the left and right thirds vanish, and still reads correctly if the top and bottom vanish. A subject whose head is near the top edge will be decapitated on a wide screen.

### Why the alpha rule exists — explain this for crests and icons

> **How this image will be used:** it is a symbol composited over many different backgrounds — dark UI panels, painted map artwork, parchment, plain black — at many different sizes, from a **40-pixel chip** in a corner up to a full-screen watermark. It is never shown on the background you generated it against.
>
> **1 — Transparent background, and a real outer silhouette.** The emblem is an *object* — a stamped seal, a metal plate, a carved stone, a stitched patch. Everything outside that object's outer edge must be fully transparent. The object needs a **definable outer boundary**; do not let it fade, feather, smear or scorch off into nothing, because there is then no line to cut on.
>
> **2 — No drop shadow, no outer glow, no ground plane, no plinth, no backing rectangle.** A soft shadow falling onto the background is neither emblem nor background, and it is the single thing that makes a clean cut-out impossible.
>
> **3 — It must survive being shrunk to 40 pixels.** Bold silhouette, high contrast, one clear read. No hairline detail, no fine texture that turns to mush, no lettering of any kind, no thin lines under about 8 px at full size.
>
> **4 — It must survive a circular mask.** Crests are sometimes shown in round chips. Nothing essential may sit outside a **circle inscribed in the centre of the frame**, and nothing at all may touch the frame edge.

### Quick reference

| Group | Request this size | Orientation | Alpha | Safe area | Notes |
|---|---|---|---|---|---|
| Races, Arbiter, Golems | **1024 × 1536** | Portrait | No | centre 70% (≈717 × 1075) | Full bleed all four edges |
| Dogs, Bosses, Locations, Death | **1536 × 1024** | Landscape | No | centre 70% (≈1075 × 717) | Full bleed all four edges |
| The four towers | **1024 × 1536** | Portrait | No | centre 70% | Vertical exception in Group 7 |
| Crests | **1024 × 1024** | Square | **Yes** | inscribed circle, ⌀ 800 px | ≥110 px clear margin all round |
| Weather + Hazard icons | **1024 × 1024** | Square | **Yes** | inscribed circle, ⌀ 820 px | ≥100 px clear margin all round |
| Equipment slots | **1024 × 1024** | Square | **Yes** | centred 780 × 780 box | Flat single-colour silhouette |

**On sizes:** `1024 × 1536`, `1536 × 1024` and `1024 × 1024` are the image model's native output sizes — ask for those exact numbers and it will not letterbox or pad to reach them. Anything larger is an upscale afterwards, which is fine: **generate at native, upscale 2× for shipping if wanted, never generate at a non-native size and hope.**

**On file delivery:** finished images go into the repo at `art/<group>/<id>.png` — the folder, the exact filenames and the alpha fallback are all in [`art/README.md`](../art/README.md). Do not paste finished images into a chat window; they are expensive to read, they crowd out everything else in the conversation, and they are not saved anywhere when the session ends.

---
---

# GROUP 1 — RACE PORTRAITS (7)

**What these are for:** character creation. Right now a new player picks their race off a plain text list. These seven images are the first thing anyone sees, so they carry the most weight of anything on this list.

> **FORMAT BLOCK — race portraits.** Generate at **1024 × 1536, portrait**. Waist-up or three-quarter body, single figure, **centred**. Dark environmental background suggesting where the race lives — not a flat colour, but not a busy scene either. Face visible and readable. Neutral standing pose with weight and presence, not an action pose.
>
> **Full bleed:** the painting runs off all four edges. No border, no frame, no vignette that hardens into an edge, no flat colour band anywhere along a side. Real painted environment in all four corners.
>
> **Safe area:** the figure's **head, face and the whole silhouette read must sit inside the centred 70%** — roughly 717 × 1075 of the 1024 × 1536 frame. This picture is cropped from the centre to fit containers of different shapes, so the outer 15% on every side will be cut away by an unknown amount. Leave the head well clear of the top edge; a head near the top gets decapitated on a wide crop. Everything in the outer 15% must be expendable environment.
>
> **File:** `art/01-races/<race_id>.png` · no alpha · PNG.

---

### 1.1 — Tartarian Giant

> **In-game description:** "Towering descendants of Tartaria's first builders. Strongest hand-to-hand fighters; revered as divine by True Tartarians."
>
> **In-game flavor:** "You stand a head taller than any ceiling down here. The buried halls remember your bloodline; the stones still hum with the commands your ancestors left in them. Whatever you reclaim, you do not bow to take it."

**Mechanically:** +2 Strength, +15 starting HP, +2 AC from size — but **−4 AC in confined spaces**, because they physically do not fit in the buried world. Once a day they can channel Aether into a relic to repair or overcharge it.

**Prompt:** A colossal humanoid, easily nine feet tall, stooping under a low buried-stone ceiling — the confinement is the whole point of the image, they are too big for the world they live in. Broad, slab-muscled build. Skin like weathered granite with faint hairline seams of dull blue-gold Aether light running through it, as though the bloodline itself is part-mineral. Heavy simple garments — thick leather, coarse wrapped cloth, no fine tailoring. Bare forearms. One massive hand rests on ancient carved stonework and the carvings glow faintly where the fingers touch, answering to the bloodline. Face: broad, heavy-browed, calm, ancient, not brutish — this is a builder, not an ogre. Long braided or bound hair. Lit from a lantern below and to one side, so the ceiling above stays dark and oppressive. Background: a buried Tartarian hall, columns half-sunk in dried mud.

---

### 1.2 — Mud Dweller

> **In-game description:** "True Tartarians who survived underground in subterranean enclaves. Nimble but lacking brute force; rely on Aethercraft."
>
> **In-game flavor:** "The dark was your cradle. You hear stone the way the surface hears wind, and Aetherstone shapes under your fingers like wet clay. Above you are the cities that should have been yours."

**Mechanically:** +2 Dexterity, +1 AC underground, half damage from Aetheric attacks, and +2 Intelligence when shaping Aetherstone. Their bare hands are the weakest in the game (1d6 −3) — they are not brawlers, they are craftsmen.

**Prompt:** A lean, wiry figure adapted to a lifetime with no sun. Pale-grey skin with a permanent film of dried mud in every crease. Large dark eyes, over-wide pupils, built for total darkness — slightly unsettling but human. Close-cropped or shaved head. Practical layered underground clothing: wrapped cloth, leather straps, small tools and picks slung close to the body, no loose fabric to snag in a tunnel. **Key detail:** one hand held palm-up, and a lump of Aetherstone is *softening* above it, sagging like wet clay, lit blue-violet from within — Aethercraft in mid-use. No weapon drawn. Crouched or half-crouched, close to the ground, at home. Background: a hand-carved tunnel with a shrine-niche cut into the wall.

---

### 1.3 — Reclaimer

> **In-game description:** "Treasure hunters and scavengers, equally at home in ruined cities and dangerous tunnels. Profit before ideology."
>
> **In-game flavor:** "Other people see ruins. You see paydays. The relic is real, the buyer is real, the danger is real — three more things than most mornings give you. Whatever you carry out, somebody's already paying for it."

**Mechanically:** +1 Dexterity, +1 AC in ruins and cities, +2 Stealth, and the best always-on loot instinct in the game. They start with the most money of any race (5d6 × 10).

**Prompt:** A scavenger loaded for a long dig. Human, weathered, mid-thirties, sharp-eyed and unsentimental — the face of someone doing arithmetic on what you're worth. Layered scavenged gear: a patched long coat, mismatched leather bracers, a scarf pulled down off the mouth, goggles pushed up on the forehead. Heavily equipped: coils of rope, hooks, a crowbar, lamps, satchels, small canvas bags of salvage clipped everywhere. One hand holds up a small humming Aetheric relic, examining it the way a jeweller checks a stone — appraising it, not admiring it. Faint blue glow from the relic lighting the face from below. Background: a half-collapsed city street sunk to the second-storey windows in dried mud.

---

### 1.4 — Architectural Sentinel

> **In-game description:** "Aetherstone-powered constructs left over from Tartaria's golden age. Tireless, durable, programmed with ancient duties."
>
> **In-game flavor:** "You do not eat. You do not sleep. You have not stopped patrolling for a span of years that has no word in any language still being spoken. You were told to watch. You watch."

**Mechanically:** an ageless construct. +2 Strength, +1 Intelligence, half damage from energy attacks, and it cannot be decayed by the corrupting Aether in the weather. Everything costs it half the stamina flesh would spend.

**Prompt:** A humanoid construct of carved stone and dark bronze, still standing a guard post that no longer exists. Proportions human but architectural — the body reads as *masonry*: fitted stone plates, bronze banding at the joints, decorative runic scrollwork carved into the chest and shoulders in the same style as the buildings around it. A steady blue-violet Aether glow from deep in the chest cavity, seen through the seams. Face: a smooth carved mask, no mouth, with two calm points of light for eyes — dignified, not menacing. Centuries of damage: chipped stone, one cracked shoulder plate, moss and dried mud in the deeper carvings, a bird's nest wedged in one crevice. Perfectly upright, motionless, hands at its sides. Background: a ruined gatehouse it has been watching for a thousand years.

---

### 1.5 — Mud Golem

> **In-game description:** "Aetheric constructs born of the mud that consumed Tartaria. Unpredictable. Some serve their makers, others turn on them."
>
> **In-game flavor:** "You are mud and Aether and the violence of an empire's last breath, given a shape that walks. You do not remember being summoned. You only know that the buried things still belong somewhere, and that you go where they hum."

**Mechanically:** +2 Strength, shrugs off a quarter of all non-Aetheric damage — but raw **Aether tears into it for half again as much**. It can shape the ground around it into a weapon or a shield, and once a day its core hums back to life and heals it.

**Prompt:** A roughly humanoid figure made of packed mud and embedded Aetherstone — the mud that killed the empire, standing up and walking. The silhouette is thick, heavy-shouldered, slightly asymmetric, as though it was *poured* rather than built. Surface: cracked drying river-mud with jagged blue-violet Aetherstone shards protruding through the shoulders, forearms and spine. Deep glowing seams where the mud has split. No face — just a dense mass with a single bright Aether core burning in the chest, visible through a crack. Loose mud continually shedding from the arms in small falls. Stance: standing still, head slightly tilted, as if listening to something underground. Background: a mud flat with hardened Aetherstone ridges.

---

### 1.6 — Unknowing Mass

> **In-game description:** "Ordinary surface-dwellers unaware of Tartaria's existence until they stumble into it. Average human stock, but adaptive."
>
> **In-game flavor:** "Last week you had never heard the word Tartaria. This week you can't stop hearing it. Something in a pawn shop window stared back at you and now the world doesn't fit the way it did, and you are not going home until it does."

**Mechanically:** the underdog. They start with **no Aetheric resistance and no training** and attempt Aethercraft at a stiff penalty — until the wasteland teaches them. Then: +2 Intelligence and Wisdom after first contact with Tartaria's secrets, and once a day they can reroll any failure.

**Prompt:** An ordinary person, badly out of their depth and refusing to turn around. Period-plausible surface clothing — a decent wool coat, a waistcoat, sturdy walking boots — clothes bought for a city, now filthy to the knee with mud. Nothing about the outfit was chosen for this. Carrying improvised kit: a single lantern, a rolled blanket, a satchel, one clumsy weapon that is clearly not theirs. The face is the whole image: awake, frightened, fascinated, absolutely not leaving. Holding a small Aetheric object in both hands and staring at it — the pawn-shop object that started all of this — its blue glow lighting their face. Background: the mouth of a dug-out shaft, daylight behind them and dark ahead.

---

### 1.7 — Aetherborn

> **In-game description:** "Descendants of Tartaria's noble bloodlines, born with awakened Aetheric genes. Powerful, dangerous, hunted."
>
> **In-game flavor:** "Your grandmother kept the locket no one would explain. The locket is in your pocket now and it is humming, and you finally understand why she never let anyone else hold it. Some people will kill to take that locket from you. Others will kill to protect it."

**Mechanically:** +1 Charisma, attuned to relics, and once a day an Aetheric-presence surge floods them (+3 Charisma) for persuasion or intimidation. Their awakened bloodline charges Aetheric weapons — **+1d6 damage on every hit**.

**Prompt:** Noble blood in exile. A striking figure in the faded remnants of aristocratic dress — a fine coat gone threadbare at the cuffs, good boots resurfaced badly, an old family piece of jewellery that has never been sold no matter how bad things got. Bearing is upright, composed, used to being obeyed. **Key detail:** thin veins of blue-violet Aether light running visibly beneath the skin of the throat, temple and the back of the hands, brightest near the heart — the awakened gene, impossible to hide, which is exactly why they are hunted. Eyes carry a faint internal glow. In one hand, an old locket on a chain, held slightly away from the body, humming — the light from it matches the light in their veins. Guarded expression: someone who is watched. Background: a shadowed corridor, half in ruin.

---
---

# GROUP 2 — FACTION CRESTS (9) ✅ **DELIVERED**

> ## ⚠⚠ ALL NINE ARE DONE. DO NOT GENERATE FROM THIS SECTION.
>
> The nine emblems shipped and live in **`art/02-crests/`**. What arrived does **not** match the devices described below — the generated art went its own way, and rather than discard nine good images each was read for what it actually shows and **re-matched to the faction whose lore it fits.** Six files were renamed; three stayed put.
>
> **[`art/02-crests/README.md`](../art/02-crests/README.md) is the truth for this group.** It records what each emblem depicts and why it belongs to its faction. The prompts below survive only as the historical brief — if a crest is ever regenerated, read that README first, so the replacement matches the set it is joining rather than the paragraph that produced the mismatch.
>
> **Two rules changed for this group, by the owner's call.** These are used as a **corner overlay on a character portrait** and as a **full-screen flash when a faction is picked** — never shrunk to a chip. So the square canvas, the clear margin and the circular-mask rule in the format block below **do not apply to the delivered nine**, and their geometry must not be "corrected": cropping and padding would shrink the artwork for a use the game does not have. The alpha requirement did apply, and all nine met it.

**What these are for:** a corner overlay on the character portrait, and a full-screen flash on faction selection. Nine images that carry a faction's identity where it is felt rather than read.

> **FORMAT BLOCK — faction crests.** Generate at **1024 × 1024, square, with a fully transparent background.**
>
> **This is a cut-out symbol, not a picture of a symbol.** It gets composited over dark UI panels, painted map artwork, parchment and plain black, at sizes from a **40-pixel chip** up to a full-screen watermark. It is never shown against the background you generated it on.
>
> - **Transparent everywhere outside the emblem.** The emblem is a physical *object* — a stamped seal, a metal plate, a carved stone, a stitched patch — and it needs a **hard, definable outer edge**. Do not let it fade, feather, smear or scorch away into nothing; there must be a clean line to cut on.
> - **No drop shadow. No outer glow. No ground plane, plinth, pedestal or backing rectangle.** A soft shadow falling onto the background is the single thing that makes a clean cut-out impossible.
> - **Fits a circle.** Crests are sometimes shown in round chips, so nothing essential may sit outside a **circle of ⌀ 800 px centred in the frame**, and nothing at all may touch the frame edge — leave at least **110 px of clear transparency on all four sides**.
> - **Survives 40 pixels.** Bold silhouette, one clear read, high contrast. No hairline detail, no fine texture, **no text or lettering of any kind**, no line thinner than about 8 px at full size.
> - **Symmetrical and centred** unless the entry explicitly says otherwise.
> - **Material, not vector.** Aged metal, worn enamel, carved stone, stamped leather. Never clean flat vector, never glossy, never chrome.
> - Each faction has a named accent colour. Keep everything else desaturated so the accent does the identifying at small size.
>
> **If the generator will not produce transparency:** put the emblem on a **flat pure black (#000000)** background with no shadow and no glow reaching the edge of frame, and save it anyway. That keys to alpha cleanly in one pass. Do not substitute grey, white or a gradient.
>
> **File:** `art/02-crests/<faction_id>.png` · **alpha required** · PNG.

---

### 2.1 — Mud Monarchs · *Architects of a False World Order*

> **Goal:** "Bury Tartaria's legacy forever to preserve their crumbling rule."
> **Philosophy:** "If the masses ever learn what lies buried beneath them, the world order they spent centuries building collapses. Better that history forget Tartaria entirely."
> **Structure:** "Descended from Tartaria's noble class. Operate through global elites, intelligence networks, assassins, and aging Aetheric machines."
> **Flavor:** "The throne is crumbling, but it is still a throne."

**Read as:** decaying aristocracy. Old power, still dangerous, visibly rotting.
**Accent:** tarnished gold on black-brown mud.

**Prompt:** A heraldic crown, ornate and imperial — and **sinking**, its lower half swallowed by a rising line of thick mud that cuts across the emblem horizontally. The mud line is the point: the crown is going under and refuses to acknowledge it. The crown is tarnished gold, blackened in the recesses, with one or two gemstone settings **empty** where the stones have been prised out. Above the crown, a small closed eye — deliberate blindness, enforced. Rendered as a worn stamped-metal seal, the gold rubbed thin on every raised edge.

---

### 2.2 — Forgotten Order · *Seekers of the Lost Truth*

> **Goal:** "Recover Tartaria's Aetheric knowledge and rebuild the world with it."
> **Philosophy:** "Aether is humanity's birthright. Buried, it festers; revealed and mastered, it saves us."
> **Structure:** "Descendants of Tartaria's engineers and scholars. Operate from hidden enclaves like Varakush, conducting clandestine expeditions."
> **Flavor:** "You have a notebook, a lamp, and a long way to walk."

**Read as:** scholars with dirty hands. Idealists who dig.
**Accent:** warm lamp gold on deep indigo.

**Prompt:** A lit oil lantern at the centre, its flame rendered as a small blue-violet Aether spark rather than fire. Behind the lantern, crossed diagonally, a **surveyor's dividers** and a **digging trowel** — the scholar and the labourer in one mark. Beneath, an open book with blank pages. A ring of small stylised rays radiates from the lantern, but the outer third of the ring is broken and unfinished — knowledge recovered, not complete. Rendered as an engraved brass plate, scratched and finger-worn where it has been handled.

---

### 2.3 — Reclaimers Guild · *Opportunists of the Lost World*

> **Goal:** "Profit. Whoever pays best gets the relic."
> **Philosophy:** "Tartaria is a goldmine. We don't ask what the buyer wants it for."
> **Structure:** "Loose coalition of scavengers, mercenaries, and treasure hunters. Black-market network with brokers in every major city."
> **Flavor:** "Ideology is a tax other people pay."

**Read as:** a trade mark, not a coat of arms. Practical, mercenary, unashamed.
**Accent:** brass and rust-red on grey canvas.

**Prompt:** A **grappling hook** and a **balance scale** crossed over each other — take it, then weigh it. Below them, a coin held between two fingers, or a coin with a bite out of it. No crown, no laurel, no honour symbols of any kind — deliberately unheroic. The whole emblem is branded and stencilled onto **a single rectangular leather trade-tag with a hard cut edge and one punched eyelet** — a crate-mark, not a coat of arms. The tag's outline is the emblem's outline; nothing extends past it. Leather scuffed, the stencil slightly misaligned, as if applied fast and often.

---

### 2.4 — True Tartarians · *Survivors of the Subterranean World*

> **Goal:** "Reclaim the surface and restore Tartaria's empire."
> **Philosophy:** "We are the rightful heirs. The surface forgot; we remembered."
> **Structure:** "Subterranean enclaves beneath buried cities. Aethercraft adepts. Worship the Tartarian Giants as divine."
> **Flavor:** "Every tunnel you carve is a road home. When the Giants wake, you will already be marching."

**Read as:** ancient, devout, patient, underground. The oldest-looking crest of the nine.
**Accent:** pale bone-white and Aether blue on black basalt.

**Prompt:** A **tunnel mouth** rendered as an inverted arch, opening downward into black — and framed within it, the silhouette of a colossal seated figure, a sleeping Giant, seen from behind and below. Around the arch, a ring of hand-carved Tartarian sigils. The whole thing carved directly into black basalt rather than cast in metal, the grooves rubbed pale by generations of hands touching the same places. Faint blue Aether light seeping from the deepest carved lines.

---

### 2.5 — Eternal Dynasty · *The Aetherborn Cabal*

> **Goal:** "Reactivate Tartaria's Aetheric cores and rule the world through the Aetherborn bloodline."
> **Philosophy:** "The fall of Tartaria was a cleansing test. Only the pure deserve to inherit."
> **Structure:** "Secretive aristocracy of Aetherborn descendants. Bred, trained, and tested in hidden estates. Some are sacrificed to power their machines."
> **Flavor:** "The Dynasty does not flinch at what it asks."

**Read as:** beautiful and cruel. Bloodline supremacy. The most elegant crest, and the coldest.
**Accent:** cold blue-violet on polished black, with silver.

**Prompt:** A **stylised bloodline tree** — but rendered as a branching Aetheric circuit diagram rather than a tree, each branch terminating in a small socket, and only the topmost sockets still lit blue-violet. The lower branches are dark: spent, sacrificed. Enclosing it, a perfect unbroken circle of polished silver, flawless where every other crest here is damaged. At the centre of the trunk, a single faceted Aether core. Precise, symmetrical, cold, expensive. Rendered as an enamelled noble sigil on polished black stone.

---

### 2.6 — Conspiracy Architects · *Controllers of the False Narrative*

> **Goal:** "Keep the Unknowing Masses ignorant of Tartaria and Aetheric technology by any means necessary."
> **Philosophy:** "Knowledge of Tartaria would destabilize global society. The lie is a kindness. The silence is a service."
> **Structure:** "A covert cabal embedded in global media, academia, and intelligence networks. Aligned with and largely funded by the Mud Monarchs."
> **Flavor:** "You sell silence by the page, by the city, by the century."

**Read as:** a mark that does not want to be a mark. Bureaucratic, quiet, everywhere.
**Accent:** ink-black and bone-paper white, almost no colour at all.

**Prompt:** A **wax seal pressed over a sheaf of documents** — and the seal's device is a mouth with a line drawn across it, or a keyhole with no key. Behind the seal, several overlapping printed pages, all of them **redacted**: heavy black bars struck through the text, the text itself illegible and unreadable. A quill laid across the whole thing. The **outer edge of the document stack is the emblem's outline** — squared-off paper with clean corners, slightly fanned; nothing drifts past it and no page curls out of frame. Deliberately dull and clerical: a departmental stamp, not heraldry. The most desaturated crest of the nine; near-monochrome, only the dull red of the wax carrying any colour.

---

### 2.7 — Servants of the Giants · *Devoted to the Sleeping Titans*

> **Goal:** "Awaken the Tartarian Giants and restore the empire through their divine power."
> **Philosophy:** "The Giants did not fall. They wait. When they rise, Tartaria rises with them."
> **Structure:** "A religious faction conducting rituals and pilgrimages at Tartarian ruins. Loosely affiliated with the True Tartarians but more fervent and less political."
> **Flavor:** "Every ritual you walk, every ruin you visit, you are telling them you remember."

**Read as:** raw devotional faith. Homemade, fervent, unofficial — a pilgrim's mark, not a state's.
**Accent:** candle-gold and ash-grey on rough cloth.

**Prompt:** An enormous **closed eye**, stylised, laid horizontally — the sleeping Giant — with a ring of small kneeling human figures arranged around and beneath it, tiny by comparison, to establish the scale. Above the eye, a scattering of small flames or votive candles. **The rendering matters more than the device:** hand-stitched with uneven thread onto **a roughly circular patch of coarse pilgrim cloth with a defined, whipstitched outer edge** — devotional and homemade, not manufactured. The patch's edge is the emblem's edge: frayed in silhouette is fine, but it must be a real boundary, not a fade-out. Slight asymmetry inside the patch is correct here.

---

### 2.8 — Stone Builders · *Scholars of the Sacred Architecture*

> **Goal:** "Understand and replicate Architectural Sorcery — the Tartarian fusion of engineering and Aetheric principles."
> **Philosophy:** "Tartaria's buildings were scripture in stone. Study them long enough and they will teach us to build a better world."
> **Structure:** "A hybrid religious-scientific order with lodges near major Tartarian ruins."
> **Flavor:** "Every Tartarian wall is a sentence and you can almost read them."

**Read as:** a guild lodge crest. Masonic in feel, half science and half faith.
**Accent:** chalk-white and verdigris on grey stone.

**Prompt:** A **keystone** at the centre, seen head-on, with an unfinished arch springing from either side of it — the arch deliberately stops short of completing, because they have not finished reading the language yet. Overlaid across the keystone, a **plumb bob** hanging on a line, dead centre and perfectly vertical. Carved into the keystone's face, lines of Tartarian sigils rendered like written script rather than decoration — *scripture in stone*, literally. Rendered as a carved and chalk-dusted stone lodge-plaque with verdigris in the deeper cuts.

---

### 2.9 — Tartarian Revivalists · *Restore Tartaria at Any Cost*

> **Goal:** "Reactivate Tartaria's Aetheric Power systems and fully restore the empire, even at the risk of a Second Mud Flood."
> **Philosophy:** "Every other faction tinkers at the edges. We are the only ones willing to do what actually needs to be done."
> **Structure:** "Led by Sasha Ironheart. Decentralized cells that share a goal but not always methods. Regarded as extremists by most other factions."
> **Flavor:** "Half measures are how empires die. Sasha Ironheart will not ask you to be careful. She will ask you to be brave."

**Read as:** an agitator's mark. Loud, urgent, painted fast, meant to be seen and to frighten people.
**Accent:** hot Aether-white and violent orange-red on soot-black.

**Prompt:** A **massive lever or switch thrown fully to the ON position**, with raw Aether energy blasting out from around its housing in hard jagged arcs. Beneath the housing, a wave-form line rising — the second flood, drawn as a rising tide, and *not* drawn as a warning. The device is **hand-painted in thick brush strokes, running slightly at the bottom as if applied in haste** — onto **a circular riveted iron disc, soot-blackened and scorched, with a hard machine-cut outer edge**. The paint runs and the scorching stay *inside* the disc; the disc's rim is the emblem's outline and it is clean and unbroken. Deliberately the crudest and most kinetic of the nine — the only one that looks angry.

---
---

# GROUP 3 — THE ARBITER (1)

**What this is for:** the Arbiter is the game's narrator and constant companion. He has more screen time than any character in the game and currently no face at all.

### 3.1 — The Arbiter

He is not a servant, a guide, or a quest-giver. He is a survivor of Tartaria who walks with you and is **deciding what he thinks of you** the entire time. His opinion is a direct function of your conduct.

> **First meeting (in-game):** "The Arbiter falls into step without being asked. *'I do not walk with everyone who comes down. Understand that I have not decided anything yet.'*"
>
> **His name — spoken once, at the very end of the game, only to a player who earned it:** "The Arbiter stops at the threshold. *'You asked me once whether I had a name.'* He says it quietly, and only once, and not in the voice he uses for lore. *'Tovan Irekh. The city that used it is under nine hundred feet of mud and I have not said it aloud since the water came.'* A pause. *'You may use it. Nobody else living has the standing.'*"

> **FORMAT BLOCK — the Arbiter.** Generate at **1024 × 1536, portrait**. Waist-up, single figure, centred.
>
> **Full bleed:** the painting runs off all four edges — no border, no frame, no matte, no letterbox bar, no flat colour band along any side, and no vignette that hardens into a visible edge. Real painted content in all four corners.
>
> **Safe area:** everything essential sits inside the **centred 70%**. The app scales this to fill containers of different shapes and **crops from the centre**, so the outer 15% on every side will be cut away by an unknown amount. Compose so it still reads with the left and right thirds gone, and still reads with the top and bottom gone.
> **File:** `art/03-arbiter/arbiter.png` · no alpha · PNG.

**Prompt:** A man who watched his city drown nine hundred feet down and has not said its name aloud since. Age is deliberately ambiguous — he could be sixty, he could be far older, and Aether exposure has left it unclear. Lean, upright, composed, standing slightly apart. Clothing: the remains of a formal Tartarian office — a long dark coat of good cut, worn to threads, mended carefully many times, with a faded insignia at the collar that no longer means anything to anyone alive. He carries no weapon and no pack; he is not equipped for the journey, which is itself unsettling. Faintest trace of blue-violet Aether behind the eyes, otherwise no glow. **The whole image lives in the expression:** watchful, reserved, withholding judgement — a man who has not decided about you yet and wants you to know it. Not kind, not cruel. Half-lit from one side, the other half in shadow. Background: dark, indistinct, a suggestion of a drowned street far behind him.

---
---

# GROUP 4 — DOG COMPANIONS (5)

**What these are for:** the companion card. Every dog in the game is **rescued from a captor** — you find one chained, caged, snared or held, you kill the person holding it, and it decides whether to follow you. The starting profile is set by where you found it. Their strength, dexterity and intelligence all train up over time from what they actually do: strength from landing a bite, dexterity from surviving a hit, intelligence from winning a distraction.

> **FORMAT BLOCK — dog companions.** Generate at **1536 × 1024, landscape**. Single dog, full body or three-quarter, centred. **Alive, wary, and recently freed — never posed like a pet portrait.** Each one should look like it has just made a decision about you. Mud on the legs, and the mark of whatever was holding it.
>
> **Full bleed:** the painting runs off all four edges — no border, no frame, no matte, no letterbox bar, no flat colour band along any side, and no vignette that hardens into a visible edge. Real painted content in all four corners.
>
> **Safe area:** everything essential sits inside the **centred 70%**. The app scales this to fill containers of different shapes and **crops from the centre**, so the outer 15% on every side will be cut away by an unknown amount. Compose so it still reads with the left and right thirds gone, and still reads with the top and bottom gone.
> **File:** `art/04-dogs/<profile>.png` — `mongrel` / `shepherd` / `hound` / `mutt` / `puppy` · no alpha · PNG.

---

### 4.1 — The Mongrel · *found chained at a smelter*

**Stats:** STR 10 / DEX 10 / INT 10 · 13–19 HP. The all-rounder — nothing exceptional, nothing weak.
**Rescued from:** a Reclaimer Deserter, at a forge ruin.
> "The Reclaimer deserter falls into the slag. The dog is still chained, watching you with the wary level look of an animal that has read its odds."

**Prompt:** A medium-sized mixed-breed dog of no identifiable pedigree — patchwork coat, rough and uneven, ears that don't match. Still wearing a heavy iron chain and collar, the chain now slack and trailing on the ground. Standing square and steady, head level, watching the viewer directly with a flat, assessing, unafraid expression — *an animal that has read its odds.* Scorch marks and ash in the coat. Background: a ruined forge, cooling slag glowing dull orange.

---

### 4.2 — The Shepherd · *found lashed to a wagon wheel*

**Stats:** STR 12 / DEX 9 / INT 9 · 15–21 HP. The strongest and toughest. Best biter, slowest to dodge.
**Rescued from:** a Mud Monarch Enforcer, at an overturned wagon.
> "The enforcer breathes wet, then not at all. The shepherd lashed to the wheel finally stops growling at you — starts watching you instead."

**Prompt:** A large, powerfully built working shepherd — deep chest, heavy shoulders, thick double coat, upright ears, an old scar across the muzzle. A rope harness still knotted around its chest where it was lashed to a wheel, the cut end frayed. The moment to capture is exactly the turn described in the lore: **it has just stopped growling.** Mouth closed, hackles still half-raised, head lowered and forward, eyes locked on the viewer — no longer aggression, not yet trust. Background: an overturned wagon, one wheel broken, on a rutted mud road in the rain.

---

### 4.3 — The Hound · *found in a cellar*

**Stats:** STR 9 / DEX 12 / INT 10 · 11–17 HP. The fastest. Hardest to hit, lightest bite.
**Rescued from:** an Aetherborn Scavenger, through a cellar trapdoor.
> "The scavenger crumples into the dark below. Up through the cellar floor comes a hound, lean and quiet, that pauses to look you over before it commits."

**Prompt:** A tall, lean, long-legged sighthound — narrow waist, deep chest, fine bones, ribs faintly visible, built entirely for speed. Short coat. Long muzzle, drop ears. **Caught mid-emergence**: front paws and head up through an open cellar hatch in a stone floor, body still below in the dark, having stopped halfway to look the viewer over before committing. Quiet, poised, unblinking. Dust and cobweb on the shoulders. Lit from above by a single shaft of grey daylight.

---

### 4.4 — The Mutt · *found in a snare*

**Stats:** STR 9 / DEX 10 / INT 12 · 11–17 HP. The clever one — best at winning a distraction, and the only unaligned rescue.
**Rescued from:** a trapper, at a snare pit. No faction holds this one.

**Prompt:** A scruffy, wiry-haired, medium-small mongrel with a face full of obvious intelligence — the smartest-looking dog of the five, and it knows it. Uneven wiry coat, expressive brows, one ear up and one down, alert forward posture. A snare wire still loose around one hind leg, the leg held slightly off the ground. **The expression is the point:** head cocked, watching the viewer with active, calculating curiosity rather than fear — it is working out what you are for. Background: a trapper's camp, cold fire, wire and stakes scattered.

---

### 4.5 — The Puppy · *found in the rubble*

**Stats:** STR 8 / DEX 9 / INT 9 · 9–15 HP. The weakest start in the game — this is the underdog run, and losing it is a real risk.
**Rescued from:** nothing. This one is found alone in the rubble after everything else is over.

**Prompt:** A young puppy, three or four months old, all oversized paws and loose skin it has not grown into. Coat matted with grey stone dust. Sitting in a hollow between broken masonry blocks, dwarfed by the rubble around it, looking up and out of frame toward the viewer. Not cute-cartoon — genuinely small, dirty, alone, and unmistakably in danger. Frightened but holding still. A single warm shaft of light reaching it in an otherwise cold grey scene. This is the only image in the whole set that is allowed to be tender.

---
---

# GROUP 5 — GOLEM COMPANIONS (4)

**What these are for:** the companion card, and the summoning screen. A golem is not found — it is **built**. You gather the fuel, you roll Aethercraft against a difficulty, and if you succeed you seal a name into the Aetherstone. They train **power** and **resilience** as they fight.

> **FORMAT BLOCK — golem companions.** Generate at **1024 × 1536, portrait**. Full body, standing, centred, seen slightly from below so they read as heavy. Dark workshop or ruin background.
>
> **Full bleed:** the painting runs off all four edges — no border, no frame, no matte, no letterbox bar, no flat colour band along any side, and no vignette that hardens into a visible edge. Real painted content in all four corners.
>
> **Safe area:** everything essential sits inside the **centred 70%**. The app scales this to fill containers of different shapes and **crops from the centre**, so the outer 15% on every side will be cut away by an unknown amount. Compose so it still reads with the left and right thirds gone, and still reads with the top and bottom gone.
> ⚠ Full body means the **feet must clear the bottom safe line** — keep the whole figure inside the centred 70% vertically, not just the head.
>
> **File:** `art/05-golems/<kind>.png` — `mud_golem` / `iron_golem` / `aether_golem` / `crystal_golem` · no alpha · PNG.

---

### 5.1 — Mud Golem

> **In-game blurb:** "Starter anchor. Cheap to bind, modest in every measure."

**Built from:** 2 × Aether Mud, 2 × Mud Fragment, 1 × Aether Crystal. **Difficulty 13** — the easiest to bind, because the mud is everywhere. 24 HP, bludgeoning, 15–35% damage resistance.

**Prompt:** The crudest of the four — a lumpen humanoid mass of packed river mud with a single fist-sized Aether Crystal seated in the chest, glowing dull blue through the mud around it. Thick, stubby, top-heavy proportions; oversized fists; short legs. Surface cracked and drying, shedding crumbs of dirt. No face, no detail work, no craftsmanship — this is the first thing an apprentice ever manages to stand up. Slightly slumped posture. Small and unimpressive next to the others.

---

### 5.2 — Iron Golem

> **In-game blurb:** "Tank build. Tough frame, steady slashing strikes."

**Built from:** 3 × Scrap Metal, 1 × Golem Core. **Difficulty 15** — the baseline. 40 HP, slashing, 30–50% damage resistance.

**Prompt:** A humanoid frame assembled from salvaged industrial iron — riveted plate, girder segments, boiler panels, machine parts bolted into a working body. Broad, square, heavily armoured, clearly the toughest build. Forearms end in crude fixed blade-edges rather than hands. The **Golem Core** is visible as a caged furnace in the torso, glowing hot orange-blue through a grille. Rust bleeding down every seam, mismatched plating, one shoulder heavier than the other. Reads as *scrapyard armour that walks*.

---

### 5.3 — Aether Golem

> **In-game blurb:** "Energy striker. Heavy aetheric blows pierce armor."

**Built from:** 2 × Aether Crystal, 1 × Aetheric Shard. **Difficulty 17** — volatile; the binding fights you. 34 HP, aetheric damage, 20–40% resistance.

**Prompt:** The least solid of the four — a humanoid **containment frame** of thin bronze rings and rods with very little mass, holding a churning body of raw blue-violet Aether energy that never stops moving. The frame is a cage for the energy, not a skeleton. Bright arcs of light spitting between the rings. Hands are open and bright; the energy trails from the fingertips. Slightly indistinct at the edges. Casts more light onto the environment than any other entry in this document — the ground beneath it is lit blue.

---

### 5.4 — Crystal Golem

> **In-game blurb:** "Apex anchor — the hardest to seat and the strongest in every measure."

**Built from:** 2 × Aether Crystal, 1 × Aetheric Cloth, 1 × Aetheric Shard. **Difficulty 19** — the hardest binding in the game. 52 HP, piercing, 35–55% resistance.

**Prompt:** A tall, angular, faceted humanoid grown from interlocking Aether Crystal — geometric rather than organic, all planes and edges, refracting light through its own body. Deep violet at the core fading to near-clear at the extremities. Limbs terminate in long tapering crystalline points. Bands of dark **Aetheric Cloth** wrapped at the joints and waist, the only soft material on it, holding the lattice in alignment. Tallest and most elegant of the four; unmistakably the apex. Light bends visibly through it onto the floor behind.

---
---

# GROUP 6 — BOSS PLATES (8)

**What these are for:** shown once, full-screen, at the opening of a boss fight. These are the eight legendary enemies in the game.

> **FORMAT BLOCK — boss plates.** Generate at **1536 × 1024, landscape**. Cinematic. The creature dominant, close, and **centred**. Low camera angle. Environment implied but subordinate to the silhouette.
>
> **Full bleed:** the painting runs off all four edges — no border, no frame, no matte, no letterbox bar, no flat colour band along any side, and no vignette that hardens into a visible edge. Real painted content in all four corners.
>
> **Safe area:** everything essential sits inside the **centred 70%**. The app scales this to fill containers of different shapes and **crops from the centre**, so the outer 15% on every side will be cut away by an unknown amount. Compose so it still reads with the left and right thirds gone, and still reads with the top and bottom gone.
> ⚠ These are shown full-screen on phones held **both ways**, so the crop is severe in both directions. The creature's head and its main weapon or limb must be well inside the centre.
>
> **File:** `art/06-bosses/<name>.png` · no alpha · PNG.

---

### 6.1 — Aetheric Behemoth · *Aetheric Mutation · 300 HP · "Aether Smash" 4d10*

> "A slow-moving cataclysm of caged Aether, each smash landing with the finality of a rockfall."

**Traits:** armored, savage, slow, concussive, fast-regenerating. Vulnerable to bludgeoning.
**Drops:** Behemoth Heart, Behemoth Plate, Aetheric Shard.

**Prompt:** A mountainous quadruped-into-biped mutation, so heavy it deforms the ground under it. Hide is fused mineral plate — overlapping natural armour like broken paving. Between the plates, the flesh is not flesh: it is **caged Aether**, a raging blue-violet furnace visible in every gap, straining to get out. Enormous forelimbs ending in blunt crushing masses. The head is small relative to the body and almost featureless. Mid-motion, raising one forelimb for a downward smash. Everything about it says *slow and inevitable*.

---

### 6.2 — Aetheric Lich · *Aetheric Undead · 330 HP · "Soul Drain" 3d8 Aetheric*

> "An arch-undead sustained by a core of stolen souls, its drain colder than the grave it left."

**Traits:** fast-regenerating, ambush striker, resists slashing and piercing. Vulnerable to burn.
**Drops:** Lich Phylactery, Lich-Bone Mantle, Aetherstone Heart.

**Prompt:** A desiccated Tartarian noble, long dead and still standing. Skeletal frame in the rotted remains of imperial court dress — a heavy mantle of bone and cloth over shoulders that are mostly bone. In place of a heart, a **suspended glass phylactery** holding a slow-turning cluster of pale captured souls, each one faintly a face. Its outstretched hand is drawing a visible cold pale-blue stream out of the air toward that core. No lower jaw. Eye sockets lit with two small cold flames. Frost forming on everything around it.

---

### 6.3 — Mud Tyrant · *Aetheric Mutation · 345 HP · "Sovereign Crush" 4d8*

> "A self-made sovereign of the drowned wastes, ruling by the crush of an armored fist."

**Traits:** armored, savage, concussive, causes bleeding, fast-regenerating. Vulnerable to bludgeoning.
**Drops:** Tyrant's Crown, Mud-Iron Heart.

**Prompt:** A hulking mud-born warlord that **made itself a king**. Body of compacted mud and Aetherstone, armoured in scavenged iron plate hammered on crookedly and bound with chain — armour taken from the dead, not fitted. On its head, a crude heavy crown of twisted iron and mud, self-made and badly made, worn with total conviction. One vast armoured fist raised. Standing on a mound of flooded rubble as a throne, in ankle-deep grey water. The posture is a monarch's; the material is filth.

---

### 6.4 — Hollow King · *Aetheric Undead · 330 HP · "Hollow Cleave" 3d10*

> "A crowned husk on a rotted throne, hollow of all but the will to make the world hollow too."

**Traits:** armored, savage, ambush striker, fast-regenerating, resists piercing. Vulnerable to burn.
**Drops:** Hollow Crown, Throne Shard.

**Prompt:** A crowned figure seated on a collapsing throne, **and the armour is empty**. Full ornate Tartarian royal plate, upright and animate, but where the face should be inside the helm there is only depth — a hollow that goes further back than the helmet does. A tarnished crown fused to the helm. A great two-handed blade held point-down into the floor. The throne behind and beneath it is rotted through, wood gone soft, half-swallowed by mud creeping up the dais steps. Absolute stillness. Nothing about it glows.

---

### 6.5 — Iron Worm · *Mech-Construct · 345 HP · "Coiling Crush" 4d6*

> "A boring-machine turned monster, its segmented body grinding through wall and warrior alike."

**Traits:** armored, slow, savage, concussive, fast-regenerating, resists slashing and piercing. Vulnerable to burn.
**Drops:** Worm Plating, Iron Core, Blank Runecaster Casing (Legendary).

**Prompt:** A Tartarian tunnel-boring machine that has become an animal. An enormous segmented mechanical body, each segment a riveted iron ring, bursting up out of a stone floor it has just chewed through — masonry and dust still falling. The head is the **original cutting face**: a circular array of rotating iron teeth and drill bits, still spinning, now functioning as a mouth. No eyes. Hydraulic lines and severed cabling trailing from the joints like sinew. Coiling, the body looping back on itself. Grinding, filthy, industrial.

---

### 6.6 — Bog Wyrm · *Aetheric Mutation · 320 HP · "Wyrm Bite" 3d8*

> "A venom-fanged serpent-drake of the deep marsh, quick as a struck match and twice as ruinous."

**Traits:** agile, quick, venomous, causes bleeding, fast-regenerating, resists piercing. Vulnerable to burn.
**Drops:** Wyrm Fang, Wyrm-Scale Hide, Bog-Heart Pearl.

**Prompt:** A long, sinuous serpent-drake exploding upward out of black marsh water, water still sheeting off it. Slick dark-green and brown scales with a wet oil-slick iridescence. Narrow reptilian head, jaws open, **long curved fangs dripping a luminous green-yellow venom** that sizzles where it lands. Vestigial clawed forelimbs held close to the body. Whip-fast, coiled, mid-strike — the only boss on this list that reads as *fast*. Bog gas and reeds around it. The one boss image with green in the palette.

---

### 6.7 — Voidspawn Matriarch · *Aetheric Mutation · 330 HP · "Voidspawn Spittle" 3d8 Aetheric*

> "The brood-mother of the void-touched, spitting corrosive young that hatch as they land."

**Traits:** armored, venomous, causes bleeding, concussive, fast-regenerating, resists burn. Vulnerable to slashing.
**Drops:** Matriarch's Carapace, Voidspawn Egg.

**Prompt:** A vast armoured brood-mother, part arthropod, part something with no earthly reference. A heavy segmented carapace of dark chitin over a swollen, translucent egg-sac abdomen through which **dozens of small curled shapes are visible, moving**. Multiple limbs. Head low and forward with a distending maw mid-spit — a stream of corrosive matter arcing out of frame, and where it has already landed the ground is smoking and small hatchlings are uncurling. Cold void-violet light from within the sac. The most genuinely horrifying image in the set.

---

### 6.8 — Tartarian Reaver · *Human · 310 HP · "Reaver's Sweep" 3d8*

> "A warlord of the old bloodlines, armored and merciless, cutting a red sweep through any line."

**Traits:** armored, savage, quick, ambush striker, causes bleeding, concussive. Vulnerable to piercing.
**Drops:** Reaver's Pauldron.

**Prompt:** The only human boss, and the one that should be the most frightening for exactly that reason. A warlord of the old Tartarian bloodlines in heavy layered battle plate — scarred, dented, blood-darkened, with one **enormous asymmetric pauldron** dominating the left shoulder. Face bare and visible: middle-aged, hard, scarred, entirely calm. A long single-edged blade held out low and wide, mid-sweep, trailing blood in an arc. Faint Aether-blue light in the veins of the throat and temple — the bloodline. Standing over broken bodies. No monster, no glow, no mutation. Just a person who is extremely good at this.

---
---

# GROUP 7 — LOCATION ARRIVAL PLATES (20)

**What these are for:** shown on arrival, once, when the player reaches a named place. This is what turns *"you are at Asgardar"* into actually arriving somewhere.

> **FORMAT BLOCK — location plates.** Generate at **1536 × 1024, landscape** — except the four towers in the second wave, which are **1024 × 1536, portrait**. **Establishing shot**, always from the traveller's point of view arriving: a middle-distance view of the place, never an interior, never a close-up. Include a small human figure or two for scale wherever it fits; the scale is half the point. **No text anywhere in the image.**
>
> **Full bleed:** the painting runs off all four edges — no border, no frame, no matte, no letterbox bar, no flat colour band along any side, and no vignette that hardens into a visible edge. Real painted content in all four corners.
>
> **Safe area:** everything essential sits inside the **centred 70%**. The app scales this to fill containers of different shapes and **crops from the centre**, so the outer 15% on every side will be cut away by an unknown amount. Compose so it still reads with the left and right thirds gone, and still reads with the top and bottom gone.
> ⚠ The landmark that names the place — the spire, the tower, the chasm — must sit inside the centred 70%. A tower placed at the far left of frame is simply gone on a square crop.
>
> **File:** `art/07-locations/<location_id>.png` · no alpha · PNG.

## Priority wave — 12

### 7.1 — Asgardar · *the buried capital*
> "The ancient capital of Tartaria. Its collector-tower, the Grand Spire of Asgardar, still stands out past the last streets and once channeled cosmic Aether into the city grid."

**Prompt:** A vast imperial capital sunk to its second and third storeys in hardened grey mud — grand boulevards now narrow trenches between rooftops, domes sitting at ground level like half-buried skulls. Dug-out excavation ramps and scaffolding where people have cut back down to the old doors. Dominating the far distance past the last street, an enormous slender **collector-tower**, still standing, still faintly humming with blue-violet light at its crown. Overcast, cold, immense. Tiny figures on the excavation ramps for scale.

### 7.2 — Samarran · *where it all went wrong*
> "A research hub of Tartaria. Home of Thametan's Tower and the Aetheric Engine whose malfunction triggered the Great Mud Flood."

**Prompt:** A drowned research city, and the site of the original catastrophe. Cleaner, more technical architecture than Asgardar — laboratory halls, observation domes, conduit towers. At its centre, **Thametan's Tower**, cracked open down one side, with the ruined **Aetheric Engine** visible inside it as a colossal broken machine still discharging weak arcs of blue-violet light after all these centuries. The mud around the tower has been **blasted outward in a radial pattern** and fused to glass at the centre — the shape of the moment the world ended. Nobody works here.

### 7.3 — Nimari · *half-swallowed*
> "Half-swallowed. The Red Tower of Nimari is rumored to house one of the last operational Aetheric Cores."

**Prompt:** A city caught exactly halfway — one half of the skyline still standing tall and intact above the mud line, the other half sunk and drowned, with the mud cutting a hard diagonal across the whole view. Rising from the drowned half, the **Red Tower**: deep oxide-red stone, unmistakable against the grey, entirely undamaged, with a steady blue-violet glow burning behind its highest windows. It is clearly still on.

### 7.4 — Voronov · *deeply scarred*
> "A significant Tartarian city deeply scarred by the Mud Flood. Rumored to hide intact remnants of Tartarian technology."

**Prompt:** The most violently damaged city in the set. Buildings not merely buried but **torn**, sheared off mid-structure, whole facades ripped away by the force of the flood. Deep gouges scored through the ruins where something enormous was dragged. Twisted structural iron protruding from the mud like ribs. Amid the wreckage, one or two intact Tartarian machines still upright and undamaged, incongruously perfect, faintly lit — which is exactly why people come.

### 7.5 — Varakush · *the Forgotten Order's stronghold*
> "Hidden base of the Forgotten Order, perched on the edge of the Great Tartary Plains. Library, workshop, refuge."

**Prompt:** The one warm and inhabited place in this whole group. A fortified stronghold built into a rock outcrop at the edge of an endless grey plain, half-natural and half-constructed, deliberately hard to spot. **Warm lantern light in every window** — the only warmth for miles. Smoke from chimneys. Rope bridges, ladders, book-crates being winched up the cliff face, expedition gear stacked under awnings. Scholars visible as small figures moving between levels. It looks like somewhere you could sleep.

### 7.6 — Drakova · *the sealed capital*
> "A legendary Lost Capital, sealed beneath Aetherstone mud. Believed to hold an intact Aetheric Core."

**Prompt:** Almost nothing of a city is visible — only the very tops of spires and one enormous arch breaking the surface of a flat, unbroken plain of **hardened Aetherstone mud** that stretches to the horizon like grey ice. The seal is total. Faint blue veins run through the Aetherstone from something enormous and still powered far below. Excavation equipment abandoned at the edge, defeated. The image should communicate: *there is a whole capital under this and nobody has got in.*

### 7.7 — Karok-Sa · *the ritual seat*
> "A southern Lost Capital. The Forgotten Order's ritual seat — halls of binding-sigils carved into black basalt, the Core kept under a chain of seals only a Sealwarden can read."

**Prompt:** A southern city of **black basalt**, sharp-edged and severe against pale desert mud. Every visible surface carved with dense binding-sigils — the walls are covered in writing, floor to roof, more text than architecture. At the centre, a low ziggurat-like structure with a sealed door bearing a visible **chain of nested seals**, each a different age. Heat shimmer. Dry, hot, hostile, and clearly locked.

### 7.8 — Yuldra-Tul · *the gate-city to the Giants' tombs*
> "A northeastern mountain Lost Capital. Frost-wreathed, the gate-city to the Giants' tombs. The Servants of Giants kept the long vigil here before the Flood — the Core sleeps under a cold-stone in the deep keep."

**Prompt:** A frost-wreathed mountain city, snow and rime over everything, built into a high pass. Colossal **tomb-gates** carved into the mountainside behind it, each one sized for something far larger than a person — that scale mismatch is the image. Ice-rimed votive shrines and burnt-out candle stations along the approach road, left by generations of pilgrims. Blue-grey palette, breath-fogging cold, deep snow. The keep at the centre is dark and sealed.

### 7.9 — Ostragar · *the river city*
> "An eastern wetland Lost Capital. The Eternal Dynasty's river city — half-submerged in slow current, the Core seat ringed by a still pool the Riverbinder bound to the housing with a cantor's chord."

**Prompt:** A wetland capital drowned in **slow-moving brown water** rather than mud — a city of canals that became a city of current. Elegant Dynasty architecture: colonnades, water-stairs, arched bridges, all half-submerged, the water flowing through the ground floors. Reeds and drowned trees. At the centre, ringed by the moving river, a **perfectly still circular pool** that the current does not touch — visibly, impossibly calm. Mist on the water. Green-brown palette.

### 7.10 — Iskan-Veil · *the city that lies about itself*
> "A far-northwestern Lost Capital. The Conspiracy Architects' hidden city — a maze of false doors and overlaid corridors. Every map of Iskan-Veil is wrong by design; the true Core seat is behind the door you didn't see."

**Prompt:** A city built to deceive. Facades that are only facades, doors that open onto flat wall, staircases that arrive at nothing, corridors overlaid on corridors at slightly wrong angles. The perspective of the image itself should feel subtly untrustworthy — two vanishing points that disagree, an alley that reads as both near and far. Snow and cold northern light. Identical unmarked doors repeating along a street. Nothing here tells you the truth.

### 7.11 — The Hidden Market
> "A neutral-ground bazaar that does not advertise itself — four canvas stalls pitched in a wind-scoured hollow of the Sunken Middens, out past the frontier camps. Agents of every faction trade here under an unspoken truce; the place keeps no banner and no name on any map, only the rumor of one."

**Prompt:** *(Note: the top-down interior map for this already exists — this is the **approach** shot, seen from the ridge above.)* Four canvas stalls pitched in a wind-scoured hollow, seen from the lip above at dusk. Lantern light under the awnings, the only light in a grey landscape. Figures from visibly different factions standing close together and not fighting. **No banners, no signage of any kind** — that absence is the identity of the place. Wind pulling at the canvas. Out past everything, in the middle of nowhere.

### 7.12 — The Black Reach
> "The southernmost wound in the world, directly beneath the Mud Flood Nexus — a chasm system that simply keeps going down. It is the open door to the Aetherstone Deep: no vault, no seal, no guardian, just a floor that ends. Heat and a faint grid-hum come up out of it."

**Prompt:** A chasm with no visible bottom. The near lip in sharp detail — cracked Aetherstone, fused rock — and beyond it the ground simply **stops**, opening into black depth. Heat haze rising out of it distorting the far wall. A faint blue-violet grid pattern glowing on the chasm walls far down, receding until it is too small to see, implying it continues far past the frame. **No gate, no seal, no guardian, no structure** — the horror is that it is simply open. A single tiny figure at the edge, standing back from it.

## Second wave — 8

### 7.13 — Grand Spire of Asgardar / of Etheria / Thametan's Tower / Red Tower of Nimari *(4 towers)*
Each of the five great climbs deserves its own vertical plate — these are the game's landmark ascents. **Format exception: vertical, 3:4, looking up the full height of the tower from its base.** Asgardar's spire is the Aether collector, still humming. Etheria's is the tallest. Thametan's is cracked open with the ruined Engine inside. Nimari's is deep oxide-red with a live Core burning at the top.

### 7.14 — Sinking Cathedral
> "Only the steeple remains above the mud. Said to contain a powerful artifact. None who enter return."

**Prompt:** A single stone steeple rising alone from a flat grey mud plain — the entire cathedral beneath it, invisible. Dark opening at the belfry, which is now the only entrance, at what used to be roof height. Birds absent. A rope ladder hanging from the opening, its lower end rotted away.

### 7.15 — Zharak's Teeth
> "Towering spires jutting from shallow waters. Beautiful architecture, deadly mud sirens."

**Prompt:** A field of impossibly tall, slender, beautifully carved stone spires rising out of shallow still water, arranged like a mouthful of teeth. Genuinely beautiful architecture — the most graceful thing in the game. Mist between the spires. Half-glimpsed pale shapes in the water near the bases, deliberately unclear.

### 7.16 — Endless Stair
> "A vast staircase descending into mud, terminating beneath an impassable Aetheric disturbance. No one has reached its bottom."

**Prompt:** An enormous stone staircase, far wider than any staircase needs to be, descending in a straight line down into mud and dark. It runs from the foreground away and down until the steps are too small to resolve. At the limit of vision, a shimmering wall of Aetheric distortion across the whole width, bending the light. Lanterns abandoned on the steps at intervals, marking how far people got.

### 7.17 — Obsidian Pillars
> "Black, magnetically charged spires rising from the mud near a former Tartarian observatory. Disrupt all technology."

**Prompt:** Jagged black glassy spires jutting from grey mud at irregular angles. Loose iron debris — nails, tools, buckles, a broken compass — visibly **hanging in the air**, pulled and suspended between the pillars by magnetic force. A ruined domed observatory in the background. No colour except black, grey, and the dull shine of suspended metal.

### 7.18 — The Giant Vault
> "Ancient vault rumored to hold the last resting place of the Tartarian Giants. Are they sleeping, or imprisoned?"

**Prompt:** A colossal sealed vault door set into a mountainside, sized for something ten times human height. **The key ambiguity must be visible:** heavy locking mechanisms and bracing on the *outside*, arranged as if to keep something in rather than out. Devotional offerings and burnt candles piled at the base by the Servants of the Giants. Utterly still.

### 7.19 — Mud Flood Nexus
> "The subterranean control center believed to have regulated the disaster itself. Touching it might mean rebirth — or a second flood."

**Prompt:** A vast subterranean control chamber. Tiered galleries of Tartarian machinery, brass and Aetherstone, curving around a central console platform. Most of it dark and dead; a handful of indicators still lit blue-violet, waiting. Mud has poured in through a breach in the ceiling and frozen mid-flow across half the floor. The single most consequential room in the game — it should feel like a held breath.

### 7.20 — The Parley Ground
> "A weathered ring of standing stones on contested flats where rival factions meet under truce. No faction holds it; banners change with the season. A place for envoys, brokers, and uneasy bargains."

**Prompt:** A ring of weathered standing stones on an open windswept flat. Faction banners of several different colours planted around the perimeter, all of them faded, frayed and clearly replaced many times. A cold fire pit in the centre. Small groups of figures standing well apart from each other. Grey overcast light, wind, nothing growing.

---
---

# GROUP 8 — WEATHER STATES (9)

**What these are for:** the world header — a small state indicator that tells you what you are travelling through.

> **FORMAT BLOCK — weather icons.** Generate at **1024 × 1024, square, fully transparent background.**
>
> These sit in the world header at roughly **64 pixels**, over a dark panel. A single evocative motif, **not a scene** — one idea, strong silhouette, high contrast, legible when tiny. Nothing essential outside a **circle of ⌀ 820 px centred in the frame**; at least **100 px of clear transparency on all four sides**. No text, no hairline detail, no line thinner than about 8 px, **no drop shadow and no outer glow** (a shadow on the background is what makes a clean cut-out impossible). Identical framing and visual weight across all nine so they read as one designed set.
>
> **If transparency fails:** flat pure black (#000000) background, no shadow, no glow reaching the frame edge. That keys cleanly.
>
> **File:** `art/08-weather/<weather_id>.png` · **alpha required** · PNG.

| # | State | In-game description (verbatim) | Effect | Prompt |
|---|---|---|---|---|
| 8.1 | **Aetheric Storm** | "Blue and violet lightning crackles across the horizon, flashing through the sky in unnatural colors — the Etheric fields the Overload buried still discharging where the old grid shorts against itself. Electronics fail. The air tastes like copper." | −3 visibility, +4 travel cost, high corruption | Jagged blue-violet forked lightning across a black horizon line, branching in unnatural geometric angles rather than natural forks. Copper tint at the edges. |
| 8.2 | **Aether Lightning** | "Bolts of blue-purple energy strike without thunder — trapped Etherium venting a charge it has held since the calcification. Each flash leaves an afterimage burned onto the eye." | −2 visibility, +2 travel | A single vertical blue-purple bolt striking ground, with a **visible ghost afterimage** offset beside it. Total silence implied — no clouds, no rain, no motion. |
| 8.3 | **Ash Storm** | "A wall of grey ash rolls across the plain. Breathing burns. Skin gathers a film of dead world." | −3 visibility, +4 travel | A rolling wall of dense grey ash advancing from one side, everything behind it erased. Fine particulate texture throughout. Monochrome grey. |
| 8.4 | **Black Rain** | "Rain the color of old oil. It pools on Aetherstone and refuses to soak in." | −1 visibility, +2 travel | Heavy oil-black rain falling in streaks, **beading and pooling on a stone surface without soaking in** — the beading is the identifying detail. Faint rainbow oil-sheen on the pools. |
| 8.5 | **Iron Fog** | "A dense rust-colored fog that smells of forge and old blood. Compasses spin." | −4 visibility, +3 travel | Thick rust-orange-brown fog. A **compass needle spinning** faintly visible within it. Warm and wrong, not cold and grey. |
| 8.6 | **Glass Hail** | "Crystalline shards rain down like a windowpane shattering in slow motion. Aetherstone hums where they strike." | −2 visibility, +3 travel | Sharp transparent crystalline shards falling in slow motion, catching light, each one edged and dangerous. Small blue sparks where they land. Beautiful and lethal. |
| 8.7 | **Whisper Fog** | "A low-hanging mist that murmurs in old Tartarian. Step too far in and you forget which century you came from." | −3 visibility, +2 travel, high corruption | A low pale mist with **faint suggestions of faces and old Tartarian lettering** dissolving in and out of it — never fully resolved, always about to be readable. Unsettling. |
| 8.8 | **Silent Blizzard** | "Snow that absorbs all sound. Your footsteps make no noise. Your screams make less." | −4 visibility, +4 travel | Heavy falling snow rendered in near-total flat white with almost no contrast — visually muffled, dead, absorbing. The least detailed icon in the set, deliberately. |
| 8.9 | **Eerie Calm** | "Not even wind. The kind of stillness that means something is watching." | no penalty | A perfectly flat, still, mirror-smooth surface of water or mud under a blank sky. **Absolutely no motion anywhere.** The stillness is the threat. |

---
---

# GROUP 9 — HAZARDS (11)

**What these are for:** the hazard indicator when an environmental danger is active in a room or on a tile.

> **FORMAT BLOCK — hazard icons.** Generate at **1024 × 1024, square, fully transparent background.** Every rule from the weather block applies unchanged — same size, same ⌀ 820 px safe circle, same 100 px margin, same no-shadow / no-glow / no-text rule, same set consistency.
>
> **The one difference:** hazards carry a **warning-red or hot-orange accent** where weather carries cold blue and grey, so the two categories are told apart at a glance in the header without reading anything.
>
> **File:** `art/09-hazards/<hazard_id>.png` · **alpha required** · PNG.

| # | Hazard | In-game description (verbatim) | Prompt |
|---|---|---|---|
| 9.1 | **Temporal Loop** | "You walk the same corridor and find yourself walking it again. The Aetheric field has caught the moment in a fold." | A corridor whose far end **connects back to its own near end** — an impossible closed loop of architecture, drawn so the eye can't find the exit. |
| 9.2 | **Spatial Distortion** | "Distance unspools. A chamber thirty paces wide becomes thirty paces deep, then thirty paces tall. The geometry refuses to settle." | A stone chamber drawn with **three incompatible perspectives at once**, edges disagreeing about which way is up. |
| 9.3 | **Aetheric Storm Burst** | "A localized burst of pure Aether discharge. Reality buckles for a moment." | A tight spherical detonation of blue-violet energy with the surrounding space **visibly warping and bending** around its edge. |
| 9.4 | **Tartarian Trap** | "A pressure plate older than recorded history triggers. Walls shift, floor opens, energy lances strike." | A depressed stone **pressure plate** with a hairline seam around it, and blue energy lances firing from wall slots in the background. |
| 9.5 | **Aetherstone Seal** | "Hardened Aether-mud, stronger than stone. No standard tool will pierce it." | A smooth impenetrable grey Aetherstone wall with a **broken chisel and snapped pick** lying at its base — the failure is the icon. |
| 9.6 | **Magnetic Distortion** | "Compasses spin. Iron-cored gear stops working. The ground tugs at every buckle and bracket." | Small iron objects — buckles, nails, a knife — **pulled and suspended in mid-air**, all leaning toward one point. |
| 9.7 | **Flooded Tunnel** | "Standing water laced with Aether residue. Things move beneath the surface." | A half-submerged tunnel mouth with black water to the arch, faint blue shimmer on the surface, and **one indistinct shape moving below it**. |
| 9.8 | **Corrupted Spores** | "A cloud of pale spores released from a fungal bloom on Aetherstone." | A drifting cloud of pale luminous spores rising from a **sickly fungal bloom** growing on grey Aetherstone. Pale yellow-green, faintly glowing. |
| 9.9 | **Reality Fracture** | "A jagged seam in the air where the world simply ends. Something is visible on the other side." | A jagged vertical tear hanging in empty air, and **through it, a completely different place** — different light, different colour, unexplained. |
| 9.10 | **Aether Mist** | "A glowing low mist that pulses with each heartbeat — yours, or something else's." | A low luminous blue mist rendered mid-**pulse**, brightest at the centre, radiating outward in a ring — the pulse must be visible as motion. |
| 9.11 | **Awakening Defenses** | "Dormant Tartarian sentinels register your heat signature. Old gears begin to grind." | A **stone sentinel's eye opening**, blue light kindling in a face that has been dark for centuries. Grinding gears visible at the neck joint. |

---
---

# GROUP 10 — EQUIPMENT SLOT SILHOUETTES (11)

**What these are for:** the paper-doll equipment screen. These are **empty-slot placeholders**, not item art — the game has 293 armour pieces and 79 gear items, so per-item art will never be worth it. Eleven silhouettes make the equipment screen read as gear instead of as a list.

> **FORMAT BLOCK — equipment slot silhouettes.** Generate at **1024 × 1024, square, fully transparent background.**
>
> **A flat, single-colour silhouette — one solid shape, no interior detail, no shading, no gradient, no highlights, no outline, no colour.** These sit *behind* the item name in an empty slot and must never compete with it. Shown at roughly **96 pixels**.
>
> Object centred inside a **780 × 780 box** in the middle of the frame, leaving clear transparency all round. **Consistent visual mass across all eleven** — the boot and the ring must occupy a similar amount of ink, or the equipment screen looks lopsided. No drop shadow, no glow, no text.
>
> **If transparency fails:** solid white shape on flat pure black. That inverts and keys in one pass.
>
> **File:** `art/10-slots/<slot>.png` · **alpha required** · PNG.

| # | Slot | Silhouette |
|---|---|---|
| 10.1 | **Main hand** | A single sword or axe, blade down, vertical, centred. |
| 10.2 | **Off hand** | A round shield seen face-on, or a parrying dagger — mirror-weighted against the main hand. |
| 10.3 | **Head** | An open-faced Tartarian helm seen in profile. |
| 10.4 | **Chest** | A cuirass / breastplate front, symmetrical. |
| 10.5 | **Hands** | A single gauntlet, fingers slightly spread. |
| 10.6 | **Legs** | Greaves or armoured leg plates, paired. |
| 10.7 | **Feet** | A heavy boot in profile. |
| 10.8 | **Cloak** | A hanging cloak from behind, shoulders at the top, hem irregular. |
| 10.9 | **Amulet** | A pendant on a broken-open chain loop. |
| 10.10 | **Ring** | A single band, seen at a slight angle so it reads as a ring and not a circle. *(Three ring slots share this one silhouette.)* |
| 10.11 | **Lens** | A single monocle or goggle lens in a bracket — the Aetheric Vision Lens slot. |

---
---

# GROUP 11 — THE DEATH SCREEN (1)

### 11.1 — Death / Permadeath

**What this is for:** the emotional peak of the entire game, currently rendered as plain text. Tartaria has **permadeath** — when a character dies, that character is gone, and the game keeps a ledger of the fallen. This image is the last thing a player sees of a character they may have spent many hours with.

> **FORMAT BLOCK — death screen.** Generate at **1536 × 1024, landscape**.
>
> **Full bleed:** the painting runs off all four edges — no border, no frame, no matte, no letterbox bar, no flat colour band along any side, and no vignette that hardens into a visible edge. Real painted content in all four corners.
>
> **Safe area:** everything essential sits inside the **centred 70%**. The app scales this to fill containers of different shapes and **crops from the centre**, so the outer 15% on every side will be cut away by an unknown amount. Compose so it still reads with the left and right thirds gone, and still reads with the top and bottom gone.
> ⚠ **Text safe zone:** the **bottom third must stay visually quiet** — low contrast, no detail, no bright point — because a line of text is drawn over it. Keep the lantern and every other point of interest in the **upper two-thirds** of the centred safe area.
>
> **File:** `art/11-death/death.png` · no alpha · PNG.

**Prompt:** Not gore, not a corpse, not a monster. **Absence.** A wide, quiet, cold shot of the mud closing over something — a single dropped lantern lying on its side in shallow grey water, still burning, its light already going out. Around it: the last few objects of a life, half-sunk and being taken by the mud. A boot print filling in. Faint ripples spreading from something that has just gone under, off-centre and out of reach. No figure. No blood. **Total stillness.** Steel-grey and cold blue with one small failing point of warm lantern gold at the centre — the last warm thing in the frame, and it is going out. Composed with dead space in the lower third for text. This image should be quiet and it should hurt.

---
---

## SUMMARY — 78 IMAGES

| Group | Count | Priority | Notes |
|---|---|---|---|
| Race portraits | 7 | ★★★ | Character creation. Highest impact — first sixty seconds. |
| Faction crests | 9 | ★★★ | Appear on every screen. Best value per asset. |
| The Arbiter | 1 | ★★★ | Most screen time of any character; currently faceless. |
| Dog companions | 5 | ★★ | Companion card. |
| Golem companions | 4 | ★★ | Companion card + summoning screen. |
| Boss plates | 8 | ★★ | Fight openings. |
| Location plates | 20 | ★★ | 12 priority + 8 second wave. |
| Weather | 9 | ★ | World header icons. |
| Hazards | 11 | ★ | Hazard indicator icons. |
| Equipment slots | 11 | ★ | Empty-slot silhouettes, one set. |
| Death screen | 1 | ★★ | The emotional peak of the game. |

**Suggested order:** Races (7) → Crests (9) → Arbiter (1) → Death screen (1) → Companions (9) → Bosses (8) → Locations (12 priority) → the three icon sets last, since those are the most mechanical and the least sensitive to style drift.
