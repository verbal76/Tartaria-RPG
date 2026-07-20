# Tartaria — Design-Doc vs Shipped-Game Drift Audit (2026-07-20)

**Purpose.** The game has drifted significantly from the original TTRPG outline
(`docs/tartaria-hack-v2.5.txt`, canonical; `docs/tartaria-ttrpg-bible-LEGACY.txt`,
deprecated-but-kept-for-lore). This is a systematic, section-by-section audit of
that drift, produced so the docs can be brought up to date with what the game
actually is — **updating** what's changed, **expanding** for what the game added,
and **preserving** (never deleting) what's designed but not yet shipped.

**Method.** Five parallel domain audits compared each doc section against the
shipped implementation (engine + data under `app/`). Shipped code is the source
of truth. Every finding is filed in one of three buckets:

- **[C] CHANGED** — the doc says X; the game now does Y.
- **[D] IN DOC, NOT IN GAME** — designed but unimplemented → **preserve, mark `[PLANNED]`, never delete.**
- **[G] IN GAME, NOT IN DOC** — a shipped system the doc never describes → **add to the doc.**

**Precedence** (from the LEGACY header, still correct): shipped code > hack-v2.5 >
legacy bible. Where the doc's own prose contradicts its own tables (it does, twice),
the game follows the **tables** — the rewrite should drop the contradictory prose.

---

## Executive summary — the sharpest deviations

The game kept the **world and lore almost entirely** (races, factions, bestiary,
Aether cosmology, locations, timeline, artifacts are all carried as data/flavor),
but **re-mechanized most of the rules layer** and **added a dozen whole systems**:

1. **Parry → Dodge.** The doc's entire parry ruleset (style dice, damage
   subtraction, odd/even-d20 weapon-breakage) was replaced by an opposed
   `d20+DEX` **dodge gamble** (win = zero damage + a ×2 opening; lose = ×2 hit).
2. **Rest heals stamina, never HP.** HP now comes only from **eating food**.
3. **Advantage/Disadvantage** changed from `D20+D6 / D10+D6` to **2d20 keep
   higher/lower**; **Initiative** is now purely cosmetic; **nat-20 auto-crits +
   doubles**.
4. **Distances:** 3 named bands (Arm's Reach/Close/Far, in feet) → **4 bands
   (distant/far/mid/close, no feet)** with weapon reach-classes.
5. **Damage types 10 → 13** (added cold/acid/corruption/psychic); only 6 of the
   doc's 10 status effects are implemented (Degradation/Bludgeoning/Aetheric/
   Radiation proc nothing).
6. **Factions 5 → 9**; **Faction Points + multi-gate join requirements → a single
   `standing ≥ 20` gate**; an entire **±100 reputation engine** was invented
   (kill/buy/theft/parley shifts, ally-rival cascades, a grudge matrix, CHA
   rapport pricing).
7. **Five parallel quest systems** the doc never had: 36 faction quests, **403
   hunts**, 18 mysteries, 14 storylines, faction bounties — plus a Mission Board,
   courier turn-in, live off-screen patrols, and offline "while you were away" recap.
8. **Whole game-only subsystems:** the **Corruption ladder** (4 tiers), the
   **Aethercraft** discipline (shape/summon/mend), item **Fusion** + fused-weapon
   naming, weapon **Coatings**, **dog + golem companions** (feed/repair/stat
   growth), **Core Guardians** (9 named boss high-priests gating the Cores), the
   **world map + travel**, the **8-type weather engine**, the **discovery
   codex/bestiary**, the **Character Chronicle**, and **world-pulse** faction drift.
9. **The Arbiter** went from a *human-DM coaching guide* to the **on-device LLM
   narrator persona** itself.
10. **Character creation** silently added a 6th stat (**Stealth**), starting
    **stamina**, a universal starter kit, per-faction knives, and per-faction spawn
    tiles; and the doc's **7-slot starter wardrobe is designed but never granted at
    creation** (the single largest doc→game gap).

**Preserve list (planned canon, shipped-but-off or lore-only)** is consolidated at
the end — the most important being the **6 Tier-C titles + their location
challenges**, fully authored but gated off behind `TIER_C_ENABLED`.

---

## 1. Combat & Core Mechanics

**[C] Core dice.** D20 + attribute vs target, roll-over — matches. But the game
adds a **6th core stat `stealth`** (STE), and live checks use a **fixed `SKILL_DC`
map** (stealth 12, diplomacy 15, escape 9, investigate 9, cast 12, use_relic 12)
rather than the Arbiter picking a difficulty tier.

**[C] Action-Difficulty ladder** (10 tiers, Very Easy 3+ → Legendary 30+, DC=level×3)
survives **as lore data only** (`dc_table.json` / `canon-action-difficulty.json`);
it does not drive resolution.

**[C] Advantage / Disadvantage.** Doc: Adv = D20+D6, Disadv = D10+D6. Game: **2d20
keep higher/lower**, and only from specific statuses (aiming→adv, surprised→disadv,
cover→defender adv). **[G]** A large flat-modifier status pool (aim +2, cover +4/+8,
stealthed +5, exhausted −2, power_attack +2, …) the doc never lists.

**[C] Damage types 10 → 13.** Added cold, acid, corruption, psychic (psychic→aetheric;
acid/corruption are coating-only). Implemented status procs (with game-invented
proc %): piercing→bleed, slashing→armor_severed, burn→burn_scar, electrical→
paralyzed, stun→stun, poison→poisoned, cold→chilled. **[D]** **Degradation,
Bludgeoning, Aetheric, Radiation** have their doc effects but **no proc
implementation** (resistance/display only). **[G]** damage-type aliases, per-enemy
weakness randomization (×1.5/×0.5/×0.25), racial damage multipliers, typed on-hit +1d3.

**[C] Combat order** matches structurally (declare → d20 vs AC → damage → counter),
but **nat-20 = auto-hit + double dice** (doc said don't auto-double), nat-1 =
auto-miss. **[G]** enemy dodge trait, boss +6 AC/+1d6, multi-enemy pack scaling.

**[D] Instants** (free reaction abilities any time) — **not implemented** (planned).

**[C] Initiative** is rolled per-swing but is **purely cosmetic** (prints a line;
never gates turn order). **[D]** group initiative + the "Quick Events" challenge.

**[C] Distances:** 3 bands in feet → **4 bands distant/far/mid/close, no feet**.
**[G]** weapon reach-classes tied to bands; combat opens at farthest applicable band;
approach steps one band; out-of-reach swing −5, point-blank ranged +2.

**[C] Parry → Dodge (wholesale replacement).** parry/block/deflect/shield all route
to `dodge`: opposed **d20+DEX vs enemy attack total** — win = 0 damage + `perfect_
opening` (×2 next strike); lose = "dodge into it" (×2 hit). Costs 1 stamina + 6 min,
trains DEX/STE (cap 3/scene). **[D]** the entire doc parry ruleset: style dice
(1h 1d10 / ranged 1d6 / dual+runecaster 1d6 twice), damage **subtraction**, the
best-of-3 odd/even-d20 **weapon-breakage** roll, runecaster-breaks-permanently, the
disadvantage-vs-ranged rule.

**[C] AC formula** (Base + Armor + Shield + Racial/Env) matches. **[G]** enemies now
use a **computed AC** (`clamp(5+abilityPoint,5,18) + traitBonus + boss?6`) rather
than authored flat AC; status-based AC deltas (armor_severed −2, cover +4/+8, ward +4).

**[C] Base AC by race** inflated/compressed — only Mud Golem (8) matches; doc's 5–9
spread became 8–12 (Aetherborn 7→11, Giant 9→12, Unknowing 5→10, Mud Dweller 7→10,
Reclaimer 7→10, Sentinel 6→10). Sentinel runic bonus +1→**+2**.

**[C]/matches Barehanded** — game follows the doc **table** exactly (Sentinel 1d10
even/odd gate, Aetherborn 1d6−2, Giant 1d6+2, Mud Dweller 1d6−3, others 1d6), not
the doc's contradictory prose. **[D]** "barehanded = disadvantaged" not implemented.

**[C] Rest — wholesale redesign. Rest restores STAMINA ONLY, never HP** ("arb37 —
rest grants NO HP"). Parser rest = 8h; store `rest()` = 4–7h. Ambush is a
probability (8% safe / 22% wild × time-of-day) that fires **after** recovery (doc:
d6 odd/even, fight at pre-rest HP). **[D]** 2h/24h rest choice, 2d6 heal, full-HP
long rest, group rest. **[G]** clean rest sheds 1 corruption; rest blocked when
nothing to recover; per-hour weather damage during rest; rest-ambush rarity-capped
by player HP.

---

## 2. Character Creation, Races & Starting Gear

**Race roster — [MATCHES 7/7]:** tartarian_giant, mud_dweller, reclaimer,
architectural_sentinel, mud_golem, unknowing_mass, aetherborn. (Doc conflates "True
Tartarians/Mud Dwellers"; game splits `mud_dweller` = race, `true_tartarians` =
faction.)

**[C] Base AC:** mud_dweller 9→10, mud_golem 6→8 (Golem absent from the doc's
canonical table); rest match the canonical table. **[G]** the structured
`racialACBonusRules` `{condition,delta}` system.

**[MATCHES] Starting TC** (`Nd6×10` per race, 7/7) and **Starting HP** (5d10 +15
Giant / +10 Golem).

**[G] Sixth core stat `stealth`** rolled with **per-race dice** (Giant 0, golem 1d4,
sentinel/unknowing 1d6, aetherborn 1d8, mud_dweller 1d10, reclaimer 1d12) — in the
doc Stealth is a DEX **skill**, not an attribute. **[G] starting stamina**
(`12 + STR/2`). **[D]** the doc's full **~20-skill list** (Prowess, Acrobatics,
Chicanery, Aetheria, Investigation, First Aid, …) — the game has no per-skill scores;
race traits map to ad-hoc per-action bonuses instead. **[D]** "+10 HP per STR
increase" growth rule.

**[C] Barehand damage** — game diverges from the doc's uniform 1d6 (see Combat §12;
game follows its own table).

**[C] Race traits substantially re-mechanized** — names kept, mechanics changed:
Sentinel "Immunity to Time" weakened (still eats half stamina, not immune); Mud
Golem resilience ½→¼ off non-Aetheric **plus a new +50% aetheric weakness**;
Aetherborn "Destiny Unfolding" → flat +1d6 on aetheric hits (self-damage drawback
dropped); "+X Intelligence" abilities became "+X investigation". **[D]** dropped
abilities: Reclaimer "Rogue's Ingenuity", literal "sense relics within 30ft", the
Acrobatics/Woodsman halves of two Reclaimer traits, literal Dark Vision. **[G]**
flat always-on racial stat bonuses (mud_dweller +2 DEX, reclaimer +1 DEX, aetherborn
+1 CHA), aethercraft cast modifiers, coded loot-luck bias.

**[G] Universal starter kit** (Aetheric Torch, Trail Rations ×3, Water Bottle,
Aetheric Locket for everyone) — doc gear is race-assigned only. **[G] per-faction
knife.** **[C] per-race auto-equipped primary weapon** — doc makes weapon a
**player-chosen** step; game auto-grants one per race. **[MATCHES]** the 2-per-race
exploration starter items (all drawn from the doc chart).

**[D] The 7-slot starter wardrobe** (Headgear/Mask/Torso/Leg/Outerwear/Footwear/
Gloves, each +1 stat) — **item definitions exist in `armor.json` but nothing grants
them at creation.** The single largest doc→game gap. **[D]** the enforced 10-slot
"Player's Backpack" cap (concept honored, no hard cap in creation code). Plus the
~2 remaining doc starter items per race deferred to vendors/loot (planned, not
missing).

**[G] Factions at creation** — 9 not 5 (see §4); chosen faction seeded to
`max(10, startingStanding+10)`; per-faction spawn tiles.

---

## 3. Weapons, Runecasters, Magic & Crafting

**[C] Weapon styles** — doc's 4 (Dual/Single/Two-Handed/Ranged, stat-tied) → **8
inconsistent `style` values** across 275 weapons (adds shield/runecaster/one_handed/
heavy; 34 weapons have no style). **[C] `statRequirement` is dead data** — no equip
gating enforces it (doc says stat hard-locks weapons).

**[C] Rarity→dice scaling stubbed.** Doc (Common 1d6 / Uncommon 2d6 or 1d10 / Rare
1d10+1d6 / Legendary 2d10) is quoted as a **comment above a stub that ignores rarity
and returns 1d6**; real damage is hardcoded per weapon. Data only loosely tracks the
doc (Uncommon mostly 1d8/2d6, Rare mostly 2d8; the doc's `1d10+1d6` notation is used
by zero weapons and would be truncated); outliers exceed 2d10 (2d20, 3d10).

**[D] Skilled-Weapon-Usage** (stat = 2× requirement → upgrade one dice tier) — **not
implemented.** **[D] weapon/runecaster exclusivity + one-turn switching penalty** —
not implemented. **[D] runecaster-into-weapon engraving/slotting** (Rune Engraving
Kit) — not implemented (the game's weapon-mod path is Coatings instead).

**[C] Spell tiers by INT** — doc 1–4/5–8/9–10/11–12 → data uses 6/9/12–14/16–18, but
**neither is wired**: the tiered spells file is **orphaned**; casting is a **flat
DC-12 INT check**. **[C] Runecaster crafting** — shipped recipes = casing + 2
ordinary reagents (not the doc's relic + transmutative structure, which survives
only in the **orphaned `runecasters.json`**); **INT-11 craft gate MATCHES**.

**[C] Repair cost** — doc "half the weapon's cost" → game uses **1 TC per missing
durability point** (−5%/rank Architect's Eye) or **2× scrap** (material repair);
neither is half-cost. **[G]** a full per-instance **durability + `temper` roll**
model (0=fragile/1=sturdy, scales max durability ×0.4–1.8 and inversely a perk
budget); breakage yields a salvage drop.

**[G] The big crafting-layer additions the doc never specifies as mechanics**
(several reuse doc *vocabulary* that was lore-only):
- **Corruption ladder** — 4 tiers (Clean 0-10 / Tainted 11-30 / Corrupted 31-60 /
  Hollowed 61+) with escalating stat penalties, +encounters, +vendor prices, and a
  forced Purifier hunt at Hollowed. Doc has no corruption meter (one narrative
  mention).
- **Aethercraft discipline** — shape (INT DC12) / summon (INT DC13-19) / mend (WIS
  DC12, costs corruption), race DC modifiers. In the doc "Aethercraft" is
  True-Tartarian **lore**, never a player subsystem.
- **Item Fusion** (Reclaimer's Fusing Crucible) + hash-indexed **fused-weapon
  naming** (theme-word + suffix from a 20-noun pool; LLM names quality-gated);
  fused items `selfCrafted`, unsellable.
- **Weapon Coatings** — 6 kinds (poison/acid/corruption/electrical/burn/cold), DOT +
  riders, 1-2 slots, name-prefixing, also drinkable as cures. Loot pre-coats at 18%.
- **Golem-armament crafting** gated by `coresRequired` (1/2/4 Tartarian Cores);
  "Golem Core" as a craftable material. Doc: Golem Core is only an enemy drop.
- **Crafting category/tab system** (`kind` enum + 4 UI tabs craft/repair/recipes/
  aetheric; ~130 recipes; Rare/Legendary discovery-gated).
- **Self-crafted / anti-arbitrage sale pricing** (40% of ref × durability; self-
  crafted capped at ingredient value so craft-to-sell is break-even; fused
  unsellable).

**Dead-data to flag:** `data/items/runecasters.json` (49 entries — the structure the
doc actually describes) and `data/spells/runecasters.json` (10 tiered spells) are
**both imported nowhere**.

---

## 4. Factions, Reputation, Economy, Vendors & Quests

**[C] Roster 5 → 9.** Doc's five (mud_monarchs, forgotten_order, reclaimers_guild,
true_tartarians, eternal_dynasty) + four promoted from lore-only to joinable:
**conspiracy_architects, servants_of_giants, stone_builders, tartarian_revivalists**
(the last led by Sasha Ironheart, consistent with doc lore). **[C]** faction
**mottos dropped** (JSON stores subtitle/philosophy/flavor instead).

**[C] Join requirements collapsed.** Doc's per-faction multi-gates (10,000 TC assets
+ N Faction Points + a functioning relic + an earned title + skill minimums) →
**a single `standing ≥ 20` gate**; no TC/relic/title/skill check. **[D] Faction
Points** — the doc's core loyalty currency — **has no implementation** (replaced by
standing). **[D]** faction **titles as join gates** (Shadow Envoy, Arcanist, …) not
wired.

**[G] The entire ±100 reputation engine** (no doc basis): bounded standing per
faction, ally/rival cascade (±½ delta), kill→standing (−3 faction / +1 rival),
buy-for-rep grind (500 TC per +1), theft/vendor-kill penalty (−10 + −10 cascading),
parley-extortion penalty, an inter-faction grudge matrix (`factionRelations.ts`
LORE_RELATIONS, HOSTILE_AT −20/FRIENDLY_AT 20), and CHA-scaled vendor **rapport
pricing** (2%/pt over CHA 10, cap 20%). Note the JSON rivals/allies arrays diverge
from the doc's rivalry prose; the reconciled truth is the LORE_RELATIONS matrix.

**[MATCHES] Starting-TC economy** (`Nd6×10` per race). **[G]** sell-fraction 0.4
(undocumented). **[D]** the doc's black-market "Relic Trade Economy" (rarity-scaling
relic prices) not distinctly modeled.

**[C] Vendors 20 → 30** (doc names carried; +faction/race-tagged vendors added).
**[D] Persuasion & Hidden Inventory** (1d20+CHA to make a vendor "look in the back")
— **not implemented** (replaced by theft + rapport discount). **[D]** the one-time
ephemeral **Camp Vendor** rule not modeled. **[G]** wandering NPCs / roadside traders
(talk-to-able, gated on novel ground).

**[G] Five quest systems the doc never had** (its quest surface is one sentence about
"FP tasks"): **Faction Quests** (36; staged, fetch turn-in, rep-gated), **Hunts**
(403; multi-stage + boss, difficulty tiers), **Mysteries** (18; artifact chains),
**Storylines** (14; 5–10 stage, rep-gated), **Faction Bounties** (kill a rival's
members; distance-aware deadlines; inversely scaled to your standing). Plus the
**Mission Board** (per-outpost contract screen), **remote courier turn-in** (½ cut;
fetch quests refused — "you can't mail the goods"), **rival raids / roaming patrols**
(~45 roaming, clash off-screen, move a war tide), and **offline catch-up + Arbiter
recap**.

---

## 5. World, Lore, Creatures & The Arbiter

**Headline: the doc's world/lore is almost entirely preserved** as data/flavor;
what changed is the roster size, the Guardians, and the Arbiter's nature.

**[C] Bestiary ~63 → ~120.** The doc's ~63 creatures are carried **exactly and in
order**; the game then appends a high tier (Mud Drake … Mud Monarch, Aetherkin,
Black Cloak Agent, Hollow King, Voidspawn Matriarch, Mud Monarch Purifier, …).

**[C] The Guardians of the Ether** — doc = ambient automated defenses + Mud Golems +
traps (no named individuals). Game = **the Aether-Born Order**: 9 hand-authored
**boss high-priests** (Vaelka, Atalan-Drowned, Konrad, Drakovna, …) each gating a
Lost-Capital **Core**, scaling by kill-count tiers T1–T9, dropping unique gear. (The
doc's ambient constructs still exist as the Sentinel/Aether Golem/Mud Golem enemies.)

**[C] Aether cosmology elaborated** — doc canon (Aether = fifth force, Aetherons,
Elior Zalmar, the Etheric Engine at Thametan's Tower, the Aetheric Overload → Mud
Flood → Aetherstone) is kept **and extended** with new named canon: the **Zalmar
Overload**, the **Zalmar Texts / Hwang Radiative Principles / Soldani Crystalline
Theorems**, the radiative-cooling-failure mechanism, and Aetherstone as "crystallized
Aether with pockets of raw Etherium" (the 2026-07-20 Aetherstone-Thesis lore).

**[C] The Arbiter** — doc = a human **DM coaching guide** (how to roleplay a cryptic
companion). Game = **the on-device LLM narrator persona itself** (first-person codex
voice + system-prompt persona + askArbiter/arbiterKnowledge). The DM-coaching role is
gone; the *tone* guidance became the narrator's voice.

**[C] Titles** — canon in `arbiter-titles.json` + LEGACY bible (20 titles, tabletop
"once per day" perks) → **14 auto-earned titles with always-on passive perks**,
requirements remapped to shipped mechanics. (So Titles are CHANGED, not net-new.)

**[G] Whole game-only systems:** **dog + golem companions** (rescue/recruit, feed +
loyalty, repair/stat-growth, combat actions); **world map + travel** (procedural 9×9,
cardinal travel); the **8-type weather engine** (per-id probability + HP/stamina/
corruption ticks + movement penalties); the **discovery codex/bestiary**
(`worldMemory` records defeats + locations); the **Character Chronicle** (per-hero
legends log); **world-pulse** (off-screen faction tide drift → rumours) + offline
recap; **corruption-as-content / "losing is fun"**.

---

## PRESERVE — planned canon, do **not** delete (mark `[PLANNED]`)

These are designed/authored in the doc (or in shipped-but-off scaffolding) with no
live implementation. The owner explicitly wants them kept.

- **6 Tier-C titles** (`speaker_of_forgotten_tongues, wayfarer_of_the_lost_paths,
  guild_broker, protector_of_the_forgotten, shadow_diver, warden_of_the_old_world`)
  **and their Tier-C location challenges** (Labyrinth of Shadows clean run, learning
  the Tartarian language, defending a True Tartarian settlement, trap-free ruin
  dives) — fully authored, gated off behind `TIER_C_ENABLED`.
- **Instants** — the free-reaction ability system.
- **Faction Points** as the loyalty currency, and the **multi-gate join requirements**
  (TC assets, relic ownership, join-titles, skill minimums) they denominate.
- **The full ~20-skill list** (Prowess, Acrobatics, Chicanery, Aetheria, First Aid,
  Investigation, Woodsman, Whisperer, Insight, …) — no per-skill character scores exist.
- **The 7-slot starter wardrobe** at creation, and the enforced 10-slot backpack cap.
- **Skilled-Weapon-Usage** dice-tier upgrade; **weapon/spell exclusivity** + switching
  penalty; **runecaster-into-weapon engraving/slotting**.
- **Persuasion & Hidden Inventory** vendor mechanic; the one-time **Camp Vendor** rule.
- **The Entombed** reburial ritual (lore only); the **dated 1280–2023 timeline** (lore
  only, no event mechanic); discrete **terraforming/city-leveling war-relics**
  (abstracted into the Cores).
- **The doc parry ruleset** (style dice, damage subtraction, odd/even-d20 breakage) —
  superseded by Dodge but retained as design history if desired.
- **Dropped race traits** (Reclaimer "Rogue's Ingenuity" / 30-ft relic sense; literal
  Dark Vision; the Acrobatics/Woodsman trait halves).
- **The four not-yet-proc'd damage-type effects** (Degradation, Bludgeoning, Aetheric,
  Radiation).

---

## Suggested rewrite priorities (for the doc update)

1. **Rules layer, highest drift:** Parry→Dodge, Rest→stamina-only, Adv/Disadv dice,
   cosmetic Initiative, 4-band Distances, nat-20 auto-crit, Base-AC values, the fixed
   `SKILL_DC` map. Delete the two contradictory table-vs-prose passages.
2. **Add the game-only mechanical chapters:** Corruption, Aethercraft, Fusion,
   Coatings, Durability/Temper, Companions (dog+golem), Titles-as-earned, Core
   Guardians, World Map/Travel, Weather, Contracts (quests/hunts/mysteries/storylines/
   bounties + Mission Board + courier), Reputation/Standing, World-Pulse/Offline.
3. **Reconcile catalogs:** factions 5→9, vendors 20→30, bestiary ~63→~120, weapon
   styles, spell/craft gates.
4. **Reframe the Arbiter chapter** from DM-guide to narrator persona.
5. **Fold in** the character-creation additions (Stealth stat, stamina, universal kit,
   faction knife/spawn tiles) and fix the AC/barehand tables.
6. Throughout: **mark every Preserve-list item `[PLANNED]`**, never delete.
