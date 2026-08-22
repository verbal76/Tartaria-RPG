# The nine faction emblems — what each one actually depicts

⚠ **Six of these files were renamed after they were generated.** The artwork is unchanged; only the filenames moved. This file records *what each emblem shows* and *why it belongs to the faction it is now named for*, so nobody has to re-derive the reasoning from the pictures a second time.

The nine arrived with names that did not match their content — a generated emblem is only ever as well-labelled as the prompt that produced it, and the devices drifted. Rather than regenerate nine good images, they were re-matched: every emblem was read for what it actually shows, then assigned to the faction whose lore it fits. It came out as a clean six-way rotation with three staying put — **every image used exactly once, every faction covered exactly once.**

Faction lore quoted below is verbatim from `app/data/factions/factions.json`.

---

## The nine

### `forgotten_order.png` — *renamed, was `conspiracy_architects.png`*
**Shows:** a laurel-crowned classical face, half flesh and half machine with a glowing blue eye; an orrery above; an open book, quills, wax-sealed scrolls, a gear ring, dividers, Aether lightning.

> "Descendants of Tartaria's **engineers and scholars**." · "Aether is humanity's birthright." · "You have a notebook, a lamp, and a long way to walk."

The book and the gear in one device is the faction in one image — scholarship fused to Aetheric machinery, which is precisely what the Order is for. The half-machine face is what the fusion costs.

---

### `conspiracy_architects.png` — *renamed, was `eternal_dynasty.png`*
**Shows:** a hooded, raven-beaked masked figure; black feathered wings; purple banners; a crescent moon; **blank scrolls**; daggers; a dark spired city under a night sky.

> "A **covert cabal** embedded in global media, academia, and intelligence networks." · "The lie is a kindness. The silence is a service."

A mask is the whole identity of a faction that exists to not be seen, and the scrolls are **blank** — the record they keep is the one nobody gets to read. The daggers are the part of the job the philosophy does not mention.

---

### `reclaimers_guild.png` — *renamed, was `forgotten_order.png`*
**Shows:** a hooded, helmeted figure; ragged grey wings; **two crossed long rifles**; a warm-lit lantern; a compass rose; chains. The most weathered of the nine and the **only one lit warm rather than blue**.

> "Loose coalition of **scavengers, mercenaries, and treasure hunters**." · "Ideology is a tax other people pay."

Rifles, a lantern and a compass are the kit of someone who goes into dangerous places and comes back carrying something. It is also the only emblem in the set with no gold and no glory, which is right for the one faction that does not claim to be doing this for a reason.

---

### `mud_monarchs.png` — *unchanged*
**Shows:** a great gear ring around a tall tower structure, a sword driven down the centre, chains, tattered blue banners, cold Aether glow.

> "Operate through global elites, intelligence networks, assassins, and **aging Aetheric machines**." · "Better that history forget Tartaria entirely." · "The throne is crumbling, but it is still a throne."

An old machine kept running, bound in chains, with a blade down the middle of it. The chains are the suppression and the sword is the assassins — this is rule maintained by holding something shut.

---

### `servants_of_giants.png` — *renamed, was `reclaimers_guild.png`*
**Shows:** a horned skull with a red sigil daubed on the brow; bloodied axes; a fur ruff; fang and claw charms on cords; a red banner bearing a pale paw print. Bone-white and blood-red — **the only emblem with no blue in it at all.**

> "A **religious faction conducting rituals and pilgrimages** at Tartarian ruins." · "More **fervent** and less political." · "Every ritual you walk, every ruin you visit, you are telling them you remember."

The one emblem that is not manufactured. It is daubed, tied and hung — a devotional object made by hand by believers, which is exactly the register the Servants are written in. Nothing about it was authorised by anybody.

---

### `true_tartarians.png` — *renamed, was `servants_of_giants.png`*
**Shows:** a hooded, faceless robed figure; **two armoured gauntlets gripping a balance beam**; scale pans on chains holding glowing Aetherstone crystals; lanterns; a crescent moon; a spired city in the roundel behind.

> "We are the **rightful heirs**. The surface forgot; we remembered." · "Subterranean enclaves beneath buried cities. **Aethercraft adepts**." · "Every relic you find is a stone returned to its rightful wall."

Enormous hands holding the balance, weighing Aetherstone, with the buried city behind them. A faction that believes it is owed the surface would keep the accounts — and the scale is not justice here, it is a **reckoning still being counted**.

---

### `eternal_dynasty.png` — *renamed, was `true_tartarians.png`*
**Shows:** heraldic winged griffins flanking a great domed city beneath a golden sun; blue-and-white banners; scrolls; lanterns; heavy gold filigree; a blue orb at the centre. The most ornate and most expensive-looking of the nine.

> "Secretive **aristocracy** of Aetherborn descendants." · "The fall of Tartaria was a cleansing test. **Only the pure deserve to inherit**." · "The next empire is yours by blood."

Griffins and gold are the vocabulary of inherited rank, and this is the only emblem in the set that looks like it was commissioned rather than made. A faction whose claim is bloodline would announce it in exactly this register.

---

### `stone_builders.png` — *unchanged*
**Shows:** a domed city between columns; hammers, chisel, dividers and set square; cut stone blocks; unrolled building plans; eagles; blue banners bearing a plumb-bob device.

> "Understand and replicate **Architectural Sorcery**." · "Tartaria's buildings were **scripture in stone**." · "Every Tartarian wall is a sentence and you can almost read them."

The closest match of all nine, and it needed no reassignment. Tools, plans, stone and a building, arranged the way a lodge arranges its own mark.

---

### `tartarian_revivalists.png` — *unchanged*
**Shows:** a phoenix rising with burning wings; a blazing sunburst core; orange and red flame throughout; a city in the roundel; chains; lit braziers. **The only warm-palette emblem, and the only one that looks like it is on fire.**

> "Reactivate Tartaria's Aetheric Power systems and fully restore the empire, **even at the risk of a Second Mud Flood**." · "Half measures are how empires die."

Rebirth through fire, with no acknowledgement of the cost. The faction that intends to turn the engine back on and accepts what that might do would not choose a careful symbol.

---

## Technical notes

All nine carry **genuine alpha** — real cut-outs, 40–59% transparent, fully transparent corners, no drop shadow and no halo. No keying pass is needed.

They are **not square and carry no clear margin** — the artwork runs to the frame edge on all nine, and sizes vary from 1145×1374 to 1254×1254. That was a deliberate call by the owner: these are used as a corner overlay on a character portrait and as a full-screen flash when a faction is chosen, never shrunk to a chip, so the margin and circular-mask rules in the original brief do not apply to them. **Do not "fix" the geometry** — cropping and padding to square would shrink the artwork for a use case the game does not have.

File sizes are ~1.8–2.6 MB each, ~19 MB for the set. Fine at overlay and full-screen sizes. If they are ever wanted small, downscale on ingest rather than regenerating.
