// OTA-267 — Build codename obfuscation layer.
//
// Player-facing context: the user is opening Android playtest to a
// large public group (~hundred testers off Facebook Gaming Dads) and
// wants the About screen + bug report output to NOT leak the
// `OTA-NNN` numbering pattern that matches commit messages /
// HANDOFF.md entries on the GitHub repo. The repo flips back to
// private after the build cycle, but historical commit messages
// indexed by Google during the public window could still surface in
// a curious tester's search.
//
// This module is the abstraction layer: every user-visible reference
// to the build pulls the codename instead of the raw OTA_BUILD_ID
// string. The mapping is maintained here AND in
// docs/build-codenames.md (the dev's cross-reference when reading
// bug reports). Each new OTA adds one entry; old entries are kept
// so an existing playtester whose save was last updated on an
// older OTA still shows a stable codename in their "OTA applied"
// dialog and bug reports.
//
// Codename scheme (from OTA-406): `<Element> <Chemical-Process>` — periodic
// table by atomic number, one element per OTA, until all 118 are gone. Anchor:
// element # = OTA-NNN − 405 (OTA-406 = #1 Hydrogen … OTA-523 = #118 Oganesson);
// the process word is flavor. See HANDOFF.md §P "Codename scheme" +
// docs/build-codenames.md. PRIOR scheme (through OTA-405): `<word> Anvil` tree
// names (ended at OTA-405 Tanbark Anvil); before that, `<Gem> Vault` /
// noun-noun pairs. Old entries are kept so an existing tester's "OTA applied"
// dialog + bug reports still resolve to a stable codename.

import { OTA_BUILD_ID } from './buildInfo';

const CODENAMES: Record<string, string> = {
  '2026-05-31-255': 'Iron Drift',
  '2026-05-31-256': 'Mud Mantle',
  '2026-05-31-257': 'Ash Tine',
  '2026-05-31-258': 'Hollow Anvil',
  '2026-05-31-259': 'Salt Vault',
  '2026-05-31-260': 'Bone Helm',
  '2026-05-31-261': 'Coal Coil',
  '2026-05-31-262': 'Glass Fence',
  '2026-05-31-263': 'Crystal Spire',
  '2026-05-31-264': 'Rust Vault',
  '2026-05-31-265': 'Stone Mantle',
  '2026-05-31-266': 'Cinder Drift',
  '2026-05-31-267': 'Smoke Anvil',
  '2026-06-01-268': 'Tin Tine',
  '2026-06-01-269': 'Brass Coil',
  '2026-06-01-270': 'Lead Helm',
  '2026-06-01-271': 'Copper Fence',
  '2026-06-01-272': 'Slate Spire',
  '2026-06-01-273': 'Pewter Vault',
  '2026-06-01-274': 'Bronze Mantle',
  '2026-06-01-275': 'Granite Drift',
  '2026-06-02-276': 'Marble Anvil',
  '2026-06-02-277': 'Chalk Tine',
  '2026-06-02-278': 'Soot Helm',
  '2026-06-02-279': 'Ember Coil',
  '2026-06-02-280': 'Ash Fence',
  '2026-06-02-281': 'Pitch Spire',
  '2026-06-02-282': 'Tar Vault',
  '2026-06-02-283': 'Wax Mantle',
  '2026-06-02-284': 'Resin Drift',
  '2026-06-02-285': 'Lacquer Anvil',
  '2026-06-02-286': 'Gilt Tine',
  '2026-06-02-290': 'Reed Spire',
  '2026-06-02-292': 'Briar Mantle',
  '2026-06-02-293': 'Husk Drift',
  '2026-06-02-294': 'Lichen Anvil',
  '2026-06-02-295': 'Moss Tine',
  '2026-06-02-296': 'Loam Helm',
  '2026-06-02-297': 'Quartz Coil',
  '2026-06-02-298': 'Cobalt Drift',
  '2026-06-02-299': 'Nickel Tine',
  '2026-06-02-300': 'Zinc Anvil',
  // OTA-302 — production promotion of the arbiters-line working build (arb70)
  // onto the HaL2001 conduit. Native AAB + iOS IPA + hal2001 OTA.
  '2026-06-05-302': 'Ember Anvil',
  // iOS tutorial keyboard fixes (door popup / climb modal / ghost bar) +
  // iOS OTA route fix (publish preview→ios so the iOS build receives OTAs).
  '2026-06-05-303': 'Onyx Anvil',
  // iOS door-popup fix pt.2 — decouple the native <Modal> present from the
  // beat transition (dismiss keyboard, then present on a clean frame ~450ms).
  '2026-06-06-304': 'Slate Anvil',
  // iOS door popup THE fix — native <Modal> presents invisibly on iPad; render
  // the door popup as an in-tree overlay (BrandedModal inline mode) on iOS.
  '2026-06-06-305': 'Basalt Anvil',
  // Investigate chip cap 10→5 + bug report on Settings screen (bundles
  // voice+device+log into one report).
  '2026-06-06-306': 'Flint Anvil',
  // "Aged artifact" background Phase-1 prototype (Exploration): umber base +
  // parchment(5%) + vignette at AppShell root.
  '2026-06-06-307': 'Umber Anvil',
  // Aesthetic tune: lighten umber base, soften vignette, iPad top-clip floor.
  '2026-06-06-308': 'Clay Anvil',
  // Player-tunable background: Settings → DISPLAY tab (brightness/hue/richness/
  // paper-texture/edge-shadow sliders), persisted + live.
  '2026-06-06-309': 'Sienna Anvil',
  // Fix: parchment rendered near-full on iOS → switched to <Image> style
  // opacity. Margins were light tan; now dark umber + faint grain.
  '2026-06-06-310': 'Ochre Anvil',
  // Settings tabs uncrowded (DISPLAY made 6 tabs wrap): smaller/tighter
  // labels + auto-fit one line.
  '2026-06-06-311': 'Loam Anvil',
  // Title screen container → transparent: kills the top color-split where the
  // shell bg peeked above the opaque title card. First Phase-2 screen.
  '2026-06-06-312': 'Peat Anvil',
  // Phase-2 rollout: ALL screen container roots → transparent so the shell
  // artifact bg is continuous everywhere (no hard seams on any screen).
  '2026-06-06-313': 'Marsh Anvil',
  // Vignette → continuous smooth gradient (was flat-center + ramp = hard
  // border/band). Dithered. No hard color border in the bg gradient.
  '2026-06-06-314': 'Silt Anvil',
  // THE split fix: parchment was a plain <Image resizeMode="repeat"> which
  // does NOT tile — drew ONE 256px corner copy = the lighter top-left
  // rectangle the player kept pointing at. Back to <ImageBackground> (tiles)
  // with opacity on the container style (dims reliably; iOS ignored imageStyle).
  '2026-06-06-315': 'Mire Anvil',
  // Color picker WHEEL replaces the Hue + Color-richness sliders (DISPLAY tab).
  // Procedural disc PNG (angle=hue, radius=saturation) + PanResponder; pure-JS,
  // OTA-safe (no native color-picker lib installed).
  '2026-06-06-316': 'Fen Anvil',
  // Action-bar chips stayed solid on any tuned background — quickReady was a
  // ~6%-alpha fill, quickDisabled used opacity:0.4, so a bright tuned hue
  // flooded through. Now opaque fills + dimmed disabled label. Plus Sasmooch
  // added to the dev revive-gem-on-death names.
  '2026-06-06-317': 'Bog Anvil',
  // Batch push: inventory per-item stat lines + slot-taken red ✗; hub gate
  // "Antechamber"→"Atrium" (chip too long); ACTIONS screen → contextual +
  // searchable; proactive dev-name Resurrection Gem on load (Sasmooch gets a
  // gem without restarting). [arb87+arb88+arb89]
  '2026-06-06-318': 'Reed Anvil',
  // Batch: inventory TOOLS category + tool classification; Pry Bar tool +
  // chance-based "use pry bar on X" mechanic (STR-leaned roll → cracks a
  // sealed container for loot, retryable); traders stock multiples of food
  // (≤5) / materials (≤10) and you can buy in quantity. [arb90+arb91]
  '2026-06-06-319': 'Sedge Anvil',
  // Batch: all 9 factions moved out of Lost Capitals onto their own danger-2
  // frontier outposts (8 new locations); pry-bar loot-farm exploit + pry-pool
  // catalog gap + vendor NaN guard fixed; Arbiter suggests fleeing when
  // outmatched (no enemy cap); scene-bar shows area danger tier. [arb92-95]
  '2026-06-06-320': 'Rush Anvil',
  // Batch: completed region-to-macro mapping (4 capitals + enclave + parley);
  // new commissioned world map art (1774×887); descriptive "you are near…"
  // map footer; ACTIONS button removed from the location bar and MAP moved
  // there; location-aware Map screen — your outpost INTERIOR map inside the
  // outpost (7 factions wired), world atlas outside. [arb96–99]
  // OTA-322 — promotion of arbiters-line arb100–arb107: golem scaling +
  // Stone Builders names; unified tool definition (Strap→wardrobe/cloak);
  // Crucible in every outpost + 25-TC vendor Crucible; inventory legend
  // auto-contrast; faction outpost economy (named gear + standing missions
  // + map routing); travel-return loot restock; faction-item fusion catalyst
  // (one-tier rarity bump); Tomb Vigil outpost map (9/9); + a red-team
  // exploit sweep (fused items unsellable, rest/investigate/dog farms
  // tightened). [arb100–107]
  // OTA-323 — promotion of dev arb108: outpost tutorial lockdown (only the
  // instructed control works until the stay/leave choice; SKIP is the one
  // exit), no Crucible in the spawn outpost (fuse gated on having left &
  // returned), fuse banner repositioned full-width under the main-quest box.
  // OTA-324 — promotion of dev arb109: tutorial wrong-control feedback
  // (double-pulse "error" haptic + a deduped Arbiter nudge naming the current
  // step) on every locked control — quick buttons, travel/room chips, MAP.
  // OTA-325 — Echoing Steps Boots reclassified exploration-tool → feet armor;
  // inventory shows a green ✓ on the equipped item (twin of the red ✗); and
  // the dev/Vault two-codename split is retired (ship everything from HaL2001).
  // OTA-326 — removed the Titan's Bone Marker scene noun (climb/investigate
  // problem); reclassified 9 worn exploration-tools → armor (boots/gloves/
  // gauntlets + Aether masks/cloaks/hood w/ aether resist + breathe_toxic gate);
  // race-starter grant now resolves armor + weapons (fixes Mud-Rend Blade);
  // new docs/armor-catalog.md balance reference.
  // OTA-327 — player's armor rebalance applied to all 279 entries + a new
  // max-HP-on-armor mechanic (76 pieces; baked into hpMax on equip/unequip).
  // OTA-328 — all base-stat bonuses on multi-stat armor now apply (was
  // primary-only); new docs/weapon-catalog.md (every weapon + stats).
  // OTA-329 — MELEE weapon rebalance (all 145) + max-HP-on-weapons mechanic
  // (34 melee carry "Grants +X HP"; weaponHpBonus/gearHpBonus → hpMax).
  // OTA-330 — RANGED (64) + RUNECASTER (54) rebalance applied; all 263 weapons
  // now balanced. Runecaster "Temp HP" is cast-time temporary, not max HP.
  // OTA-331 — "Grants +X Temp HP" stripped from the 5 runecaster shield-spell
  // effects entirely (not wired, not flavor).
  // OTA-332 — title-screen secondary text now uses the inventory legend's
  // auto-contrast tone (shared useReadableMuted hook) so it stays readable on
  // any tuned background.
  // OTA-333 — removed the translucent fill from the active tutorial highlight
  // (the "2-tone box behind the buttons"); border + glow still spotlight.
  // OTA-334 — batch of 10: climbing-strap→armor, equipped-hand label, scrap
  // auto-close, dog-in-arsenal vs climb/aerial + anti-air weapons, apostrophe
  // clear-fix, vendor stock/owned stack, FUSABLE tab, dog food heal, runecaster
  // casing drops, fuzzy investigate/salvage clears.
  // OTA-335 — inventory: rows show the slot they fill; default SLOT sort on
  // open; locked-chip scanner-requirement text uses the EQUIPPED amber.
  // OTA-336 — fusion catalyst counts toward gate + equipped-catalyst confirm
  // prompt + one-time make-good grant; 2 craftable corruption-cleanse tonics.
  // OTA-350 — stealth mechanics + Arbiter: 3 titles grant +Stealth (Shadow
  // Diver / Wayfarer / Etherbound Survivor); using stealth gear in combat
  // (clean parry/dodge while geared) trains STE; the Arbiter suggests stealth
  // in fitting encounters (throttled).
  // OTA-351 — Qwen completion-crash guard: breadcrumb each completion; after 3
  // native SIGSEGVs mid-generation, disable ONLY Qwen (classifier/Kokoro stay).
  // OTA-352 — Tier-1 verification logging: [debug] skill-check breakdown +
  // loadout/stat snapshot (equip + skill-check) + training-progress line.
  // OTA-353 — three log-review fixes: strip the re-firing fusion-comp grant;
  // honest title earn-message (passive, not "once/day"); empty-name opening.
  // OTA-354 — Tier-2 flow logging: [debug] enemy-spawn stats, vitals@fall,
  // persist-failure line.
  // OTA-355 — weather-hazard visibility: weather ticks that bite (aether
  // lightning etc.) now show the HP loss instead of reading as a near-miss.
  // OTA-356 — no ground, no fall: a 0-stamina climb attempt on the ground
  // refuses instead of dealing fall damage; mid-climb shortfall still falls.
  // OTA-357 — status-duration display honesty: "rounds"→"turns"; Tired/
  // Exhausted show "until you rest" (stamina-gated, no real countdown).
  // OTA-358 — combat-only status ticking: tactical buffs/stances only tick
  // when enemies are present (don't evaporate during exploration).
  // OTA-359 — combat effects are per-encounter (corrects 358): combat-only
  // statuses tick in the fight and CLEAR when no enemies, not carry forward.
  // OTA-360 — weapon coatings (phase 1: data + apply + UI): poison / acid /
  // corruption consumables (3 gear rows + 3 recipes) paint onto a bladed or
  // projectile weapon instance (coating field), shown as "Corrupted Battle
  // Axe" + a damage chip; permanent for the weapon's life (survives repair,
  // lost on break). Combat on-hit wiring lands in a follow-up OTA.
  // OTA-361 — knockout + loot humanoids: a single non-lethal blow whose
  // CUMULATIVE damage (weapon + coating + bonuses) is strictly more than half a
  // Human enemy's max HP knocks them out (enemyKnockedOut flag; they stop
  // countering); a combat "loot" button strips their authored carries kit
  // (damaged) + full loot + TC and clears them. 6 Human enemies gained kits.
  // OTA-362 — weapon coatings phase 2 (combat wiring): a coated weapon's on-hit
  // roll folds into the cumulative blow (immediate damage + counts toward KO) and
  // seeds an enemy DOT; poison = pure DOT, acid = DOT + AC shred, corruption =
  // DOT + stacks that tick harder. New enemyArmorShred / enemyCorruptionStacks.
  // OTA-363 — weapon coatings phase 3 (occasional loot): a looted coatable
  // weapon (KO'd humanoid's kit, defeated enemy's weapon drop) has an 18% shot
  // at arriving pre-coated. grantItem never merges a coated weapon (unique).
  // OTA-364 — poison follow-through: the poisoned -2 attack penalty (orphaned in
  // an uncalled statusAttackPenalty) now rides in rollMods, so poison degrades
  // the victim's swings instead of only ticking DOT.
  // OTA-365 — dead-status cleanup: removed 'well_fed' / 'blocking' /
  // 'overwhelmed' / 'helping' (no apply or no consumer); WIRED 'ready' (a live
  // command) to deliver its promised +2 next-attack instead of being inert.
  // OTA-366 — the Black Cloak Agent reframed as a Forgotten Order enforcer; his
  // signature Hollow Edge (corrupted, razor-gripped) is NEVER lootable (new
  // Enemy.signatureWeapon + reason line on kill/knockout); 2 lore concepts seed
  // the Order's enforcer line as a future antagonist arc.
  // OTA-367 — OTA updates apply AUTOMATICALLY at the front of boot (before
  // mind/voice), replacing the tap-to-apply banner whose mid-load reload crashed
  // to home and could corrupt the save. New skipTeardown / checkTimeoutMs opts.
  // OTA-368 — save durability: 90s + on-background autosave; persist() refuses
  // to overwrite a slot with a player missing core identity; backfillPlayer (the
  // save-upgrade step) wrapped to never throw out of a load.
  // OTA-369 — big-jump-tolerant OTA download: bundle fetch budget 60s → 240s
  // (new fetchTimeoutMs opt) + auto-retry up to 3× that RESUMES via EAS's asset
  // cache, so a device far behind catches up instead of timing out / "failing".
  // OTA-370 — Disease Sample becomes a crafting material (still a throwable):
  // Plague Tonic (premium 1d6 corruption coating), Plague Vial (premium 1d6
  // poison coating), and Inoculant Draught (a corruption cure you drink).
  // OTA-371 — rag-based first-aid ladder (RE1-style): Field Dressing → First Aid
  // Kit → Trauma Kit, all built on a rag (Patched Cloth), each tier adding an
  // ingredient for more healing.
  // OTA-372 — a failed flee is no longer free: losing the escape (flee) roll
  // hands every living enemy an automatic attack of opportunity
  // (runEnemyGroupCounters). A successful flee still breaks contact cleanly.
  // OTA-373 — SAVE-LOSS FIX: cap the game log at 500 (was Infinity). The
  // unbounded log was embedded in the slot save blob, which grew past
  // AsyncStorage's ~2 MB readback window so the atomic save's verify failed and
  // progress stopped persisting. COPY LOG (dedicated on-disk key) unaffected.
  // OTA-374 — accessible stamina items (the exhaustion fix; no combat pause —
  // there are none in a fight): Trail Rations now restore stamina (+3), Water
  // Bottle sip 3 → 10, and every character starts with a Water Bottle.
  // OTA-375 — water sources to refill the Water Bottle: ~55% of outdoor tiles
  // surface a water source (rain pool / puddle / spring / pond …) in look-around,
  // seeded per room key, recognised by the 'fill bottle' handler.
  // OTA-376 — armor regen: worn armor can carry a mild per-action staminaRegen
  // or (more limited) hpRegen, summed + capped across the 6 armor slots, on top
  // of its other bonuses; 93 pieces marked across all slots/rarities, faction
  // pieces grant a little more. + DISPLAY_VERSION 3.0.0 → 3.4.11 (cosmetic).
  // OTA-377 — title-footer clarity: the "2148" after the version is the in-world
  // YEAR (Tartaria's Present Day), not a build number; relabelled "· Year 2148".
  // OTA-378 — Tired/Exhausted "(99r)" no longer leaks to the compact HUD: these
  // stamina-gated statuses use a sentinel remainingRounds:99 (they clear when
  // stamina recovers), so formatEffectSummary now hides the fake count for them.
  // OTA-379 — derived titles award once + their passive applies: moved the
  // title catch-all to before submitPlayerAction's player snapshot so stale
  // writebacks stop clobbering the earnedTitles append (was re-announcing every
  // action + dropping the passive perk).
  // OTA-380 — per-instance gear variety: stampDurability rolls a `temper` that
  // scales durability up while scaling the perk budget down (inverse tradeoff);
  // perks stored on InventoryItem.instanceStats, read before the catalog by the
  // stat/AC aggregators. Two copies of the same item now differ.
  // OTA-381 — "Buy & Equip" at vendors: a second buy-modal button that wears the
  // ware immediately; single-slot gear auto-equips, a weapon prompts main vs off
  // hand. Reuses validSlotsForItem + equipItem.
  // OTA-382 — enemy panel fits the top-right column (portrait, onLayout-measured)
  // instead of a full-screen landscape card that scrolled left/right; now lists
  // the enemy's RESIST / WEAK damage types (type map + resist:/vulnerable: traits).
  // OTA-383 — Viper Venom becomes a real material feeding two poison recipes: a
  // weapon coating (Viper Venom Vial, 1d6) and a poison cure (Antivenom, new
  // curePoison effect that strips the poisoned status).
  // OTA-384 — stall sale-price variation: tc-less items (armor, materials) were
  // pinned to a ~5 TC rarity floor; buildStallVendor now grounds price in the
  // item's worth (armor: AC/stat/durability) + a wider rarity band & spread.
  // OTA-385 — rope is no longer a tool-pouch item: it works from the pack (the
  // climb_steep gate checks inventory, not the pouch), so isPouchEligible now
  // refuses rope-tagged items (Reclaimer's / Climbing Rope). Scanners still qualify.
  // OTA-386 — etheric (electrical) weapon coatings: aether-dust pastes that arc
  // electrical damage (weakness-aware vs constructs/automatons); flavored variants
  // (Galvanic +1 STE, Resonant +1 CHA) also grant a passive stat bonus when held.
  // OTA-387 — burn weapon coatings (parallel family): aether-dust pastes run hot
  // that sear burn damage (weakness-aware, now via type map AND traits); variants
  // Incendiary, Searing (+1 STR), Smoldering (+1 INT).
  // OTA-388 — clearer MAIN QUEST chip subtitle: it's the only entry to Contracts
  // (main storyline + side quests + collectibles); relabelled "tap to open — Main
  // Storyline · Contracts · Collectibles".
  // OTA-389 — repair keeps a coated weapon's name: the coating survives a repair,
  // but the repair-confirmation lines logged the base name; both the Arbiter
  // repair handler and the vendor mend now use coatedDisplayName.
  // OTA-390 — clearer Crucible "first-timer" refusal: the fusion gate needs you to
  // venture out to a named location and return (before the TC cost); Irma's + the
  // foreman's cryptic line now say plainly to leave the outpost and see the world.
  // OTA-391 — combat narration shows the coated weapon name: the attack lines used
  // the base parsed noun, so a coated weapon read as its old name mid-fight; new
  // coatedWeaponNoun helper prefers coatedDisplayName (pairs with the OTA-389 repair fix).
  // OTA-392 — climb middle-tier label fix: a true middle tier on a 4+ tier climb
  // leaked the raw "tier 2/4" into narration ("You reach the tier 2/4 of the …");
  // middle tiers now read "next hold".
  // OTA-393 — Water Bottle fixes: drinking via the `use` path destroyed it (no
  // Empty Water Bottle left to refill); a shared leaveEmptyWaterBottle helper now
  // runs on every consume path. Plus a shared consumeVerb so the button/narration
  // say "drink" (not "eat") for the bottle.
  // OTA-394 — manual SAVE button (Session tab) alongside SAVE & EXIT; persist()
  // returns a boolean so the button reports a real "✓ SAVED" / "✗ SAVE FAILED".
  // OTA-395 — SAVE-LOSS ROOT CAUSE: the slot blob crossed AsyncStorage's ~2MB
  // readback window (unbounded worldMemory.visitedRooms + heavy regenerable
  // roomInvestigationTables), so the staged save failed to verify. trimSaveState-
  // ToFit bounds the saved blob when over budget (sheds lore tables, then oldest
  // rooms); in-memory untouched, normal saves unchanged.
  // OTA-396 — save-loss fix take 2: 395's trim engaged on a char budget but the
  // save failed under it (byte vs char). Tighter budget + progressive shedding
  // (tables → rooms → memos → scene) + a per-part byte breakdown logged on failure.
  // OTA-397 — save-size telemetry: persist() logs the per-part byte breakdown on
  // failure, on a trim, AND every 10th persist as a heartbeat, so the blob size is
  // visible as it grows (measure, don't guess).
  // OTA-398 — THE ACTUAL save-loss fix. 397's telemetry showed the save blob at
  // ~123KB (never a size issue); the real cause is "storage full" — appendLogToDisk
  // appends every log line to an unbounded on-disk COPY-LOG key that grew to fill
  // AsyncStorage's ~6MB DB, after which every write (incl. the tiny save) fails.
  // capDiskLog bounds it to ~400KB; self-heals on the next write.
  // OTA-399 — fix doubled coating label in the acid/coating on-hit line ("Acid-
  // Etched Acid-Etched Rusty Shortbow"): OTA-391 made weaponName the coated name
  // (already has the label) but the proc line still prepended proc.label.
  // OTA-482 — [feature] GOLEM ARMAMENTS completes to FOUR forms, one per damage type (player's spec): added
  // Golem Pike (piercing) + Golem Aether-Lance (aetheric) to the Sledge (bludgeoning) / Greatsword
  // (slashing). Any golem wields any; all coatable; pick the type to match the guardian's weakness. Element #77: Iridium.
  '2026-06-11-482': 'Iridium Crucible',
  // OTA-481 — [feature] GOLEM ARMAMENTS revised to the player's design: two UNIVERSAL craftable forms any
  // golem can wield — a Golem Sledge (2H bludgeoning) or Golem Greatsword (2H slashing), Rare 2d8, coatable.
  // Added craft recipes; dropped the OTA-478 kind-matching (form is the player's choice). Element #76: Osmium.
  '2026-06-11-481': 'Osmium Casting',
  // OTA-480 — [balance] armor-shred scales: the flat −5 acid cap couldn't strip a guardian's +6 boss-AC
  // bonus; now per-enemy (normal foes cap at 5, bosses at 5+6=11 via acidShredCap), so a coated weapon —
  // especially a coated golem weapon — wears a high-tier guardian's guard down. Element #75: Rhenium.
  '2026-06-11-480': 'Rhenium Etch',
  // OTA-479 — [feature] GOLEM ARMAMENTS pt.2: COATINGS carry through. A coated golem weapon applies its
  // on-hit effect (acid shred / corruption / DOT) like a player's coated strike — the late-game
  // armor-breaker. Shared applyWeaponCoatingProc helper (player+golem); golem weapons coatable regardless
  // of damage type. Element #74: Tungsten.
  '2026-06-11-479': 'Tungsten Coating',
  // OTA-478 — [feature] GOLEM ARMAMENTS pt.1: the golem can WIELD a crafted melee weapon (4 kind-matched
  // Rare weapons; arm/disarm verb + "Arm <golem>" button; wielded dice replace innate + durability wear;
  // shown on the Character screen). Coatings + Core-4 unlock follow. (OTA-477 was a test-only commit, no
  // build.) Element #73: Tantalum.
  '2026-06-10-478': 'Tantalum Forging',
  // OTA-476 — [UX] splash scale nudge 0.92 → 0.97 ("just a touch more"), top-left anchored. Element #71: Lutetium.
  '2026-06-10-476': 'Lutetium Smelting',
  // OTA-475 — [UX] splash scale nudge 0.85 → 0.92 ("getting there"), top-left anchored. Element #70: Ytterbium.
  '2026-06-10-475': 'Ytterbium Reduction',
  // OTA-474 — [UX] splash scale tune: 2/3 was "too far" (small), full was "too big" → top-left-anchored
  // scale set to 0.85 of screen width (named SPLASH_SCALE constant). Element #69: Thulium.
  '2026-06-10-474': 'Thulium Roasting',
  // OTA-473 — [UX] splash sizing per request: TOP-LEFT anchored, scaled to 2/3 (drop 1/3 off the right +
  // proportionally off the bottom). Explicit Dimensions-derived pixel width/height pinned at top:0/left:0
  // over the dark overlay — deterministic, no aspectRatio guesswork. Element #68: Erbium.
  '2026-06-10-473': 'Erbium Implant',
  // OTA-472 — [UX] splash "too big" fix: OTA-471's full-width + aspectRatio image still overran the screen
  // height (cropping golem + dog). Switched to a full-screen absoluteFill + resizeMode "contain" so the
  // WHOLE composition scales to fit, never cropped, with a thin dark letterbox. Element #67: Holmium.
  '2026-06-10-472': 'Holmium Quench',
  // OTA-471 — [UX] splash render fix: OTA-470's splash sat inside the AppShell's safe-area padding (green
  // margins) AND its UI scale transform, distorting the aspectRatio so the art rendered oversized + cropped
  // to the top (golem/dog below the fold). Moved it to a new <SplashOverlay/> at the AppShell ROOT —
  // full-bleed, no scale, full-width top-anchored so the whole image + title show. Element #66: Dysprosium.
  '2026-06-10-471': 'Dysprosium Reduction',
  // OTA-470 — [UX] taller splash art + full-width top-anchored layout. Swapped in a phone-shaped 941×1672
  // image; it now fills the full width (no side-crop, title intact), anchored top, with only a small dark
  // strip at the bottom for the loading bar — far less empty space than OTA-469's centered contain. Element #65: Terbium.
  '2026-06-10-470': 'Terbium Anneal',
  // OTA-469 — [UX] splash-art fit fix: OTA-468's "cover" cropped the sides on tall phones (cut off the
  // TARTARIA REALMS title); switched to "contain" so the whole image shows, letterboxed on the dark bg. Element #64: Gadolinium.
  '2026-06-10-469': 'Gadolinium Doping',
  // OTA-468 — [UX] opening SPLASH ART + thin loading bar. Title opens on the cover image (wanderer + dog +
  // crystal golem) for ~2s while the voice warms, then reveals the menu (once per launch, hard-capped 6s).
  // The verbose MIND/VOICE banner is retired for a single thin progress bar (splash bottom + compact menu
  // bar). New asset assets/splash-art.jpg (218KB JPEG). Element #63: Europium.
  '2026-06-10-468': 'Europium Phosphor',
  // OTA-467 — [feature] GOLEMS gain stats through combat, mirroring the dog — incentive to repair + keep
  // one alive vs re-summon a base one. POWER (trains on a landed strike → +to-hit/+damage) and RESILIENCE
  // (trains on surviving a hit → soaks retaliation) use the dog's exact progression curve. Character screen
  // gets a GOLEM panel (HP + POW/RES progress bars) under the dog. Element #62: Samarium.
  '2026-06-10-467': 'Samarium Anneal',
  // OTA-466 — [feature] GOLEM repair + naming, like the dog. Mend a surviving golem by feeding it the
  // PARTS it's made of (its own summon fuel: Iron ← Scrap Metal/Golem Core, etc.) via `feed/repair golem
  // <item>` + a "Repair <golem>" inventory button; only constituent parts work (heal = round(hpMax/4)). On
  // summon the Arbiter prompts for a name and the next input names it ("skip" keeps the type). Element #61: Promethium.
  '2026-06-10-466': 'Promethium Decay',
  // OTA-465 — [feature] tap-to-set-course for WHISPERS/leads (finishes the OTA-458 route button, which
  // only covered faction quests). Whisper objectives live on map TILES, not named locations, so the
  // location travel system couldn't reach them — players kept losing Yulka's discs. New intra-area
  // whisperCourse + setWhisperCourse/continue/stop walks the player cardinally to the tile via the same
  // travel-row UX; whisperRouteTarget picks the stage-correct tile; Contracts whisper cards get a SET
  // COURSE button. Element #60: Neodymium.
  '2026-06-10-465': 'Neodymium Sinter',
  // OTA-464 — [regression fix] REVERT the OTA-463 voice auto-disable. Its breadcrumb detection couldn't
  // tell a real Kokoro crash from a benign app termination (OTA reload mid-utterance / backgrounding), so
  // it false-tripped on reload churn and dropped a healthy Kokoro to the system voice. Bundled neural
  // voice is always used again; voice crashes stay detection-only; stale disable flags self-heal. Element #59: Praseodymium.
  '2026-06-10-464': 'Praseodymium Calcination',
  // OTA-463 — [CRASH — the real one] a tester's diagnostic named the culprit: "Voice (TTS) guard: ⚠ VOICE
  // CRASH … last voice: kokoro:am_michael". The bundled NEURAL TTS (Kokoro) was dropping the app mid-
  // narration, not Qwen. Wired the voice auto-disable (1 crash → fall back to the system device voice via
  // expo-speech, which doesn't SIGSEGV). New shouldAttemptBundledTTS() gate. Element #58: Cerium.
  '2026-06-10-463': 'Cerium Polish',
  // OTA-462 — [bug] climb "already crested" fired mid-climb: the CLIMB UP (n/m) button reads live
  // elevatedOn while the verb recomputed progress from cumulative, substring-matched `climbed:` markers,
  // so a t3 marker from a different climb ("climbed:scaffold:t3") fuzzy-matched "broken scaffold" and read
  // as fully crested. Fix: on an active climb, elevatedOn.tier/.totalTiers is authoritative. Element #57: Lanthanum.
  '2026-06-10-462': 'Lanthanum Exchange',
  // OTA-461 — [dev] one-time playtest-supply gift for the character "Verbal" (10 First Aid Kit, 20 Trail
  // Rations, 20 Smoke-Cured Jerky Strip, 20 Bioluminescent Fungus, 1 Water Bottle) so crash-testing
  // doesn't burn the player's own consumables. Idempotent per slot (testGiftGrantedSlots). Element #56: Barium.
  '2026-06-10-461': 'Barium Flash',
  // OTA-460 — [crash mitigation, cont.] make the AI re-enable actually testable: the device showed
  // "clean/not disabled" yet boot still read qwen:skipped, so the OTA-459 batch fix couldn't be exercised.
  // Upgraded the reset button to "RESET AI NARRATION & RELOAD" — clears breadcrumbs AND force-loads Qwen
  // in-session via bootQwen() (bypasses the boot skip gate; resets store status to 'idle' first), with a
  // live load-progress label. Force-loaded context uses the OTA-459 shrunken batch. Element #55: Cesium.
  '2026-06-10-460': 'Cesium Getter',
  // OTA-459 — [crash mitigation] root-cause attempt at the Tensor-G5 Qwen completion SIGSEGV: shrink the
  // llama.rn compute batch (n_batch 2048→512, n_ubatch 512→128) to shrink the faulting compute buffer, +
  // wire a "RESET AI NARRATION" button (resetMLHealth) so a self-disabled device can re-attempt Qwen and
  // test the fix. flash_attn plumbed but default-off (next on-device lever). Element #54: Xenon.
  '2026-06-10-459': 'Xenon Sputtering',
  // OTA-458 — [bug/UX] quest turn-in correctness + findability: Silt-Thief disc grant no longer
  // clobbered by the loot set() (functional set in resolveEnemyDefeat) + stuck-whisper recovery; the
  // Contracts COMPLETE button now respects the fetch gate (verify + consume); faction-quest cards gain
  // a ROUTE TO TURN-IN button to the faction home outpost. Element #53: Iodine.
  '2026-06-10-458': 'Iodine Sublimation',
  // OTA-457 — [crash] feed-the-dog game-drop was a Qwen completion SIGSEGV on the Pixel 10 Pro XL /
  // Tensor G5; lowered the completion-crash self-protect threshold 3→1 so one app-drop flips the Arbiter
  // to template narration (OTA-414 auto-retry self-heals). Element #52: Tellurium.
  '2026-06-10-457': 'Tellurium Refining',
  // OTA-456 — [playability] hybrid remote turn-in: deed quests (hunts/mysteries/storylines/non-fetch
  // faction quests) can "send word" from anywhere for a 15% TC cut; FETCH quests must deliver in person. Element #51: Antimony.
  '2026-06-10-456': 'Antimony Liquation',
  // OTA-455 — [playability] first-steps flee grace: a brand-new character's failed escape is fudged to
  // a bare win-by-one for the first 3 steps (with a "barely escaped" Arbiter line), so no green-player
  // death-trap on step one; the flee stays a real roll after that. Element #50: Tin.
  '2026-06-10-455': 'Tin Cry',
  // OTA-454 — [playability] balance starter-fetch quantities to item availability (Scrap Metal 5→3,
  // Aether Mud 5→4, Patched Cloth 6→4) so all nine complete in a comparable early window. Element #49: Indium.
  '2026-06-10-454': 'Indium Reflow',
  // OTA-453 — [bug] fused weapons (catalog-absent, uniqueStats) can now be coated — new instance-aware
  // isCoatableItem; they were invisible to the name-only isCoatableWeapon. Element #48: Cadmium.
  '2026-06-10-453': 'Cadmium Plating',
  // OTA-452 — [playability] early-tile roadside-trader boost: 0.50 spawn decaying to the 0.25 baseline
  // over a new character's first ~24 tiles, warming the opening's trade/quest contact. Element #47: Silver.
  '2026-06-10-452': 'Silver Cupellation',
  // OTA-451 — [playability] a Mission Board in every Outpost's central square (vendor-free room) posts
  // the faction's contracts; tappable chip + readMissionBoard; accept/turn-in work at the board. Element #46: Palladium.
  '2026-06-10-451': 'Palladium Sponge',
  // OTA-450 — [playability] nine rep-0 per-faction STARTER fetch quests (gather N forageable commons →
  // reward), a real early quest on-ramp; new `fetch` requirement consumed on turn-in. Element #45: Rhodium.
  '2026-06-10-450': 'Rhodium Refining',
  // OTA-449 — [playability/bug] companion (golem/dog) killing blows route through resolveEnemyDefeat,
  // so loot/TC/Core-Guardian Core+gear+gem+quest-advance fire no matter who lands the last hit. Element #44: Ruthenium.
  '2026-06-10-449': 'Ruthenium Plating',
  // OTA-448 — [playability] first Core Guardian eased to a straightforward (not easy) win for a
  // kitted player (AC 17→14, T1 hp eased); AC ramps monotonically, T7–T9 hardness preserved. Element #43: Technetium.
  '2026-06-10-448': 'Technetium Eluting',
  // OTA-447 — [playability] close two Mud-Golem fuel gaps a sim found: Mudstone now low-weight
  // forageable, and the scrap mud-tag path (dead inside the stone branch) yields Mudstone again. Element #42: Molybdenum.
  '2026-06-10-447': 'Molybdenum Sintering',
  // OTA-446 — [playability] richer found-gear: Uncommon gear weights up + two low-weight Rare drops
  // in the investigate pool, so a lucky wanderer can actually upgrade toward the Guardians. Element #41: Niobium.
  '2026-06-10-446': 'Niobium Anodizing',
  // OTA-445 — [playability] fusion output is above-rare: Legendary at 4+ tags, fused weapons 2d6/2d8,
  // armor AC+3/+5, durability 35/45, + a guaranteed scaling-stat perk. Element #40: Zirconium.
  '2026-06-10-445': 'Zirconium Crystal-Bar',
  // OTA-444 — [playability] crafting-material drop weights: Aether Dust now forageable, golem-fuel
  // aether mats bumped, Mudstone added to common mud enemies; food/rocks untouched. Element #39: Yttrium.
  '2026-06-10-444': 'Yttrium Garnet-Growth',
  // OTA-443 — [playability] scrap overhaul: 2–3+ representative, rarity-scaled mats geared to
  // crafting/golem fuel (metal→Scrap Metal+Golem Core, aether→Crystal+Dust, mud→Mudstone). Element #38: Strontium.
  '2026-06-10-443': 'Strontium Pyrotechny',
  // OTA-442 — [audit #22] each of the 9 Lost Capitals plays a distinct one-time arrival signature
  // on first entry, so the set no longer feels samey while exploring. Element #37: Rubidium.
  '2026-06-10-442': 'Rubidium Photoemission',
  // OTA-441 — [audit #26 pt1] generous caps on flood-prone junk (Small/Big Rock, Stick) bound the
  // unbounded forage hoard; per-action O(n²) clone refactor deferred (see notes). Element #36: Krypton.
  '2026-06-10-441': 'Krypton Fractionation',
  // OTA-440 — [audit #25] one-time in-feed warning when the save blob crosses 70% of budget,
  // before the silent auto-trim starts shedding rooms/scene. Element #35: Bromine.
  '2026-06-10-440': 'Bromine Debromination',
  // OTA-439 — [audit #23] a craft that would consume material substitutes now asks first (modal),
  // instead of silently stripping a synthesized piece standing in for a named ingredient. Element #34: Selenium.
  '2026-06-10-439': 'Selenium Rectifying',
  // OTA-438 — [audit #21] wasteland encounters only roll on a NOVEL tile, so oscillating between
  // two tiles can't farm encounters/loot; intended wild-tile loot re-roll is untouched. Element #33: Arsenic.
  '2026-06-10-438': 'Arsenic Sublimation',
  // OTA-437 — [audit #17] bound the "nothing" forage re-roll: 2 grace retries per noun, then
  // it's consumed — foraging is a gamble again, not a guaranteed payout via infinite retries. Element #32: Germanium.
  '2026-06-10-437': 'Germanium Zone-Leveling',
  // OTA-436 — [audit #20] Resurrection-Gem economy tightened: organic drop halved + pity
  // interval doubled (50→100) so gems don't pile up and drain death of stakes. Element #31: Gallium.
  '2026-06-10-436': 'Gallium Zone-Refining',
  // OTA-435 — [audit #24] a Cores X/9 badge on the play HUD (StatsPanel), shown during the
  // revelation→cores→descent arc — no more tabbing to Contracts to check progress. Element #30: Zinc.
  '2026-06-10-435': 'Zinc Galvanizing',
  // OTA-434 — [audit #18] inventory item ids get a monotonic suffix, so two same-ms grants no
  // longer share an id and break equip/repair/wear/temper keyed on instance id. Element #29: Copper.
  '2026-06-10-434': 'Copper Cementation',
  // OTA-433 — [audit #19] enemy retaliation vs a golem rolls the enemy's real damage notation,
  // not a flat 1d6+1 — golems no longer immortally tank bosses. Element #28: Nickel.
  '2026-06-10-433': 'Nickel Carbonyl',
  // OTA-432 — [audit #15] hook-noun matching is word-boundary aware, so a tiny fragment no
  // longer snags the wrong hook (indoor "candle" can't route to an outdoor "ridgeline"). Element #27: Cobalt.
  '2026-06-10-432': 'Cobalt Roasting',
  // OTA-431 — [audit #16] vendor "repair <name>" mends the equipped instance first, then the
  // most-damaged copy — no longer tops off a spare while the worn equipped piece stays broken. Element #26: Iron.
  '2026-06-10-431': 'Iron Bloomery',
  // OTA-430 — [audit #13] main-quest hints: 'hook' lists all 9 Capitals (was 5), 'descent'
  // points to the Mud Flood Nexus (the reached_nexus trigger) not the Endless Stair. Element #25: Manganese.
  '2026-06-10-430': 'Manganese Nodulizing',
  // OTA-429 — [audit #11] a DOT tick that kills the LAST enemy now ends the fight (loot +
  // victory + range clear) instead of hanging with no target to swing at. Element #24: Chromium.
  '2026-06-10-429': 'Chromium Sensitization',
  // OTA-428 — [audit #10] Resurrection-Gem revival: spend gem only after the save lands,
  // wake at backfilled hpMax, and wrap rehydrate in a load-crash breadcrumb. Element #23: Vanadium.
  '2026-06-10-428': 'Vanadium Aluminothermy',
  // OTA-427 — [audit #9] per-instance gear (instanceStats / fused uniqueStats) never stacks,
  // so a rolled copy no longer drops its temper-driven durability+perks. Element #22: Titanium.
  '2026-06-10-427': 'Titanium Sponging',
  // OTA-426 — [audit #8] multi-boss hunts complete only at the LAST boss stage, not a mid
  // boss — killing the mid boss no longer skips the apex fight + reward. Element #21: Scandium.
  '2026-06-10-426': 'Scandium Fluorination',
  // OTA-425 — [audit #7] companion (golem/dog) kills splice all 6 per-enemy arrays, so
  // DOT/shred/corruption/KO no longer land on the wrong surviving foe. Element #20: Calcium.
  '2026-06-10-425': 'Calcium Slaking',
  // OTA-424 — [audit #6] bought weapons/armor (stored kind:'misc') no longer eaten as a
  // craft/repair substitute; isSubstitutable excludes name-resolved gear. Element #19: Potassium.
  '2026-06-10-424': 'Potassium Saponification',
  // OTA-423 — [audit #5] close the craft→scrap TC/material pump (improvised weapons give
  // no Scrap Metal; Scrap Metal re-raritied Uncommon→Common). Element #18: Argon.
  '2026-06-10-423': 'Argon Welding',
  // OTA-422 — [audit #4] author vendors for the 4 vendorless factions so their faction
  // quests are reachable (audit reachability 8→0). Element #17: Chlorine.
  '2026-06-10-422': 'Chlorine Bleaching',
  // OTA-421 — [audit #3] rotating save temp key: concurrent same-slot saves no longer
  // false-trip the self-heal (copy-log wipe + phantom persist FAILED). Element #16: Sulfur.
  '2026-06-10-421': 'Sulfur Vulcanization',
  // OTA-420 — [audit #2] typed enemy damage ("2D6 Psychic") no longer collapses to 1d6;
  // dice parser ignores the trailing type word. Element #15: Phosphorus.
  '2026-06-10-420': 'Phosphorus Oxidation',
  // OTA-419 — [audit #1] fix enemy AC flattening (parseInt("Strength 4")→NaN→8); all
  // stat + Core-Guardian-tier AC scaling restored. Element #14: Silicon.
  '2026-06-10-419': 'Silicon Doping',
  // OTA-418 — 15 INTERIOR hooks + indoor/outdoor partitioned pickers, so indoors
  // surface interior leads instead of empty / outdoor sightings. Element #13: Aluminum.
  '2026-06-10-418': 'Aluminum Anodizing',
  // OTA-417 — outdoor wandering-lead hooks never plant indoors (candle-in-a-house
  // no longer surfaces "a giant on the ridgeline"); gates all 7 plant sites. Element #12: Magnesium.
  '2026-06-10-417': 'Magnesium Sublimation',
  // OTA-416 — never revive at 0 HP: backfillPlayer restores HP on an alive-but-
  // zeroed load (interrupted-death from a crash) + resume drops the lost combat
  // scene and narrates a revival. Element #11: Sodium.
  '2026-06-10-416': 'Sodium Amalgamation',
  // OTA-415 — move the save self-heal recovery line off the player-facing feed to
  // the debug channel (was dev-speak in the world feed). Element #10: Neon.
  '2026-06-10-415': 'Neon Liquefaction',
  // OTA-414 — Qwen auto-retry with backoff (refire after the crash-guard disables
  // it; recover on a clean run, grow the cooldown on a relapse). Element #9: Fluorine.
  '2026-06-10-414': 'Fluorine Etching',
  // OTA-413 — proactive room-lore prune (bound the save blob) + voice (TTS) crash
  // breadcrumb (name voice vs Qwen on the next native crash). Element #8: Oxygen.
  '2026-06-10-413': 'Oxygen Combustion',
  // OTA-412 — SUMMON chip only shows while stationed on the capital anchor tile
  // (not after stepping off into the wilderness). Element #7: Nitrogen.
  '2026-06-10-412': 'Nitrogen Fixation',
  // OTA-411 — capital vendor ALWAYS fires (excluded from the roadside roll) + pin
  // the "core" mission noun into the visible take/salvage menu. Element #6: Carbon.
  '2026-06-10-411': 'Carbon Pyrolysis',
  // OTA-410 — a core/lost capital always greets the player with a NAMED vendor
  // (RNG-rolled) on arrival, when the SUMMON chip draws. Element #5: Boron.
  '2026-06-10-410': 'Boron Crystallization',
  // OTA-409 — raise roadside-trader spawn during travel (0.08 → 0.20); spawn path
  // verified healthy, just throttled. Element #4: Beryllium.
  '2026-06-10-409': 'Beryllium Reduction',
  // OTA-408 — more enterable structures on planned routes (BUILDING_TILE_CHANCE
  // 12 → 22%). Element #3: Lithium.
  '2026-06-10-408': 'Lithium Calcination',
  // OTA-407 — coated weapon name on the combat quick-buttons + equipped summary
  // (resolved by equipped slot id, not ambiguous name). Element #2: Helium.
  '2026-06-10-407': 'Helium Distillation',
  // OTA-406 — bulletproof "storage full" save self-heal: purge the regenerable
  // on-disk copy-log (removeItem) + retry, so saves land even on a stuffed DB.
  // First periodic-table codename (element #1 = OTA−405): Hydrogen + Electrolysis.
  '2026-06-10-406': 'Hydrogen Electrolysis',
  // OTA-405 — boot gate (Gate A: OTA resolved; Gate B: classifier settled/capped)
  // locks character entry; reverts 404's mid-session auto-apply (next-open apply).
  '2026-06-10-405': 'Tanbark Anvil',
  // OTA-404 — OTA updates auto-apply: TitleScreen fires the safe teardown+reload
  // once Qwen settles, instead of waiting for a "tap to apply" banner tap.
  // (SUPERSEDED by OTA-405 — the mid-session auto-reload was reverted.)
  '2026-06-10-404': 'Possumhaw Anvil',
  // OTA-403 — manual weapon-coating damage roll (4th 'coating' RollStep), hit-gated;
  // was auto-rolled inside concludeRolls before ("I never get a roll for the acid").
  '2026-06-10-403': 'Devilwood Anvil',
  // OTA-402 — enemy panel shows active coating/DOT statuses + turns of combat left.
  '2026-06-10-402': 'Fringetree Anvil',
  // OTA-401 — green "ready" highlighting for craftable recipes + affordable repairs
  // (incl. the Aetheric tab fuels); availability checks now substitute-aware.
  '2026-06-10-401': 'Spicebush Anvil',
  // OTA-400 — backfilled the missing 381/386/387 rows below (Boxelder, Manzanita,
  // Madrone) that had dropped out of the map.
  '2026-06-09-400': 'Tanoak Anvil',
  '2026-06-09-399': 'Shagbark Anvil',
  '2026-06-09-398': 'Sumacberry Anvil',
  '2026-06-09-397': 'Catkin Anvil',
  '2026-06-09-396': 'Serviceash Anvil',
  '2026-06-09-395': 'Inkberry Anvil',
  '2026-06-09-394': 'Sourgum Anvil',
  '2026-06-09-393': 'Chokecherry Anvil',
  '2026-06-09-392': 'Silverbell Anvil',
  '2026-06-09-391': 'Hophornbeam Anvil',
  '2026-06-09-390': 'Witchhazel Anvil',
  '2026-06-09-389': 'Bristlecone Anvil',
  '2026-06-09-388': 'Hackmatack Anvil',
  '2026-06-09-387': 'Madrone Anvil',
  '2026-06-09-386': 'Manzanita Anvil',
  '2026-06-09-385': 'Sweetbay Anvil',
  '2026-06-09-384': 'Basswood Anvil',
  '2026-06-09-383': 'Yaupon Anvil',
  '2026-06-09-382': 'Loblolly Anvil',
  '2026-06-09-381': 'Boxelder Anvil',
  '2026-06-09-380': 'Pawpaw Anvil',
  '2026-06-09-379': 'Mesquite Anvil',
  '2026-06-09-378': 'Chinquapin Anvil',
  '2026-06-09-377': 'Serviceberry Anvil',
  '2026-06-09-376': 'Sourwood Anvil',
  '2026-06-09-375': 'Sweetgum Anvil',
  '2026-06-09-374': 'Hackberry Anvil',
  '2026-06-09-373': 'Sumac Anvil',
  '2026-06-09-372': 'Buckthorn Anvil',
  '2026-06-09-371': 'Hornbeam Anvil',
  '2026-06-09-370': 'Ironwood Anvil',
  '2026-06-08-369': 'Catalpa Anvil',
  '2026-06-08-368': 'Locust Anvil',
  '2026-06-08-367': 'Oak Anvil',
  '2026-06-08-366': 'Pine Anvil',
  '2026-06-08-365': 'Fir Anvil',
  '2026-06-08-364': 'Larch Anvil',
  '2026-06-08-363': 'Cedar Anvil',
  '2026-06-08-362': 'Spruce Anvil',
  '2026-06-08-361': 'Aspen Anvil',
  '2026-06-08-360': 'Chestnut Anvil',
  '2026-06-08-359': 'Sassafras Anvil',
  '2026-06-08-358': 'Persimmon Anvil',
  '2026-06-08-357': 'Tupelo Anvil',
  '2026-06-08-356': 'Sequoia Anvil',
  '2026-06-08-355': 'Buckeye Anvil',
  '2026-06-08-354': 'Cottonwood Anvil',
  '2026-06-08-353': 'Mulberry Anvil',
  '2026-06-08-352': 'Holly Anvil',
  '2026-06-08-351': 'Magnolia Anvil',
  '2026-06-08-350': 'Dogwood Anvil',
  // OTA-349 — stealth gear pass: stealth statBonus on fitting weapons (daggers/
  // bow/throwing knife) + light armor (cloaks/boots); equipment applies weapon +
  // fused-item stealth; fusion inherits stealth from stealthy inputs; inferred-
  // stats grants stealth for shadow/silent/muffled names; tag-backfill propagates.
  '2026-06-08-349': 'Yew Anvil',
  // OTA-348 — Stealth as a first-class attribute: race-proportional starting
  // roll (Giants 0 … Reclaimer 1d12), governs the stealth/steal checks (off
  // DEX), trains up, shows as STE, and equipped stealth gear now feeds it.
  '2026-06-08-348': 'Walnut Anvil',
  // OTA-347 — Display "Paper texture" ceiling 20% → 50% (stepper max + the
  // textureOpacity clamp in both displaySettings paths).
  '2026-06-08-347': 'Hickory Anvil',
  // OTA-346 — clear-the-slot status-based (338 hardening #3): a dead/abandoned
  // dog keeps its record but no longer counts as an ACTIVE dog (hasActiveDog),
  // so the puppy-vendor replacement arc (gated on "no active dog") can fire.
  '2026-06-08-346': 'Sycamore Anvil',
  // OTA-345 — boot-resilience guard (338 hardening #2): beginScene wraps the
  // real builder in a try/catch that bails to title (recoverable error + crash-
  // save capture) instead of crashing/graying out when a scene build throws.
  '2026-06-07-345': 'Juniper Anvil',
  // OTA-344 — atomic save writes (338 hardening #1): saveSlot stages to a temp
  // key, verifies, snapshots the prior good save to .bak, then swaps; loadSlot
  // falls back to .bak (previous save) + heals when the live copy is corrupt.
  '2026-06-07-344': 'Hazel Anvil',
  // OTA-343 — MULTI-FIX BUNDLE: (1) crash-save capture — on a crash, stash
  // the offending slot's on-disk save bytes so the next launch offers COPY
  // CRASHED SAVE (reaches a corrupt save that can't be loaded; extends
  // OTA-341); (2) Settings hint copy — About→Session RUN CONTROLS hint now
  // names all four exports (log / pack / save).
  '2026-06-07-343': 'Birch Anvil',
  // OTA-342 — the safe pair from the 338 batch, re-shipped independently:
  // one-shot thrown weapons (10 throwable tags) + Trail-Rations restore
  // preview. Data + UI only; no dog code. Rides on top of 340/341.
  '2026-06-07-342': 'Linden Anvil',
  // OTA-341 — COPY SAVE diagnostic (export loadable save state for brick
  // repro) on top of 340's dog test. Read-only; doesn't disturb the dog test.
  '2026-06-07-341': 'Hawthorn Anvil',
  // OTA-340 — RE-SHIP of the dog-mortality feature ALONE (bleed-out +
  // abandonment + the tickDogStatus microtask) on a clean baseline, to test
  // whether it bricks a FRESH save (the 338 crash turned out to be save-data,
  // not the OTA runtime — 339=337 still crashed the old save; a new save boots
  // fine). One-shot weapons + rations preview deliberately NOT included.
  '2026-06-07-340': 'Beech Anvil',
  // OTA-339 — ROLLBACK of 338. 338's old save crashed ~90% of cold opens;
  // 339 republished 337's exact runtime. Root cause = save data, not runtime.
  '2026-06-07-339': 'Elm Anvil',
  // OTA-338 — dog bleed-out timer + loyalty abandonment + one-shot thrown
  // weapons + Trail-Rations preview. ROLLED BACK by 339 (boot crash).
  '2026-06-07-338': 'Poplar Anvil',
  '2026-06-07-337': 'Maple Anvil',
  '2026-06-07-336': 'Rowan Anvil',
  '2026-06-07-327': 'Hemlock Anvil',
  '2026-06-07-326': 'Tamarack Anvil',
  '2026-06-07-325': 'Cypress Anvil',
  '2026-06-07-324': 'Willow Anvil',
  '2026-06-07-323': 'Alder Anvil',
  '2026-06-07-322': 'Cattail Anvil',
  '2026-06-06-321': 'Tule Anvil',
  '2026-06-03-301': 'Tungsten Spire',
  // Isolated arbiters-line test build — NOT a production OTA. Fresh-minted
  // pair (the reserved metallic-noun pool was exhausted at Tungsten Spire).
  // Sits on the dead 'arbiters-line' channel; never published OTA-side.
  '2026-06-03-arb1': 'Flint Coil',
  // First real OTA on the arbiters-line channel (tutorial keyboard +
  // name-prompt copy). The test line keeps the '<noun> Coil' suffix so
  // these read as the arbiters-line lineage at a glance: Flint Coil →
  // Cinder Coil → …
  '2026-06-03-arb2': 'Cinder Coil',
  // Tutorial picker-confusion fix + Arbiter pacing acks + LOOK highlight.
  '2026-06-03-arb3': 'Slag Coil',
  // Door-open branch: explore-vs-leave choice popup replaces the old
  // look/go-north/read-note beats; 'leave outpost' advances the tutorial.
  '2026-06-03-arb4': 'Forge Coil',
  // Travel-row "continue" wording → "tap → CITY"; arbiter queue capped
  // (no more cut-off lines); em/en dashes spoken as comma pauses.
  '2026-06-03-arb5': 'Quench Coil',
  // Keyboard hygiene: no auto-pop (only on tap), Enter dismisses, modals
  // keyboard-avoided so the text box rides above the keyboard.
  '2026-06-03-arb6': 'Anvil Coil',
  // Kokoro prosody: bundle short sentences before inference, trim
  // head/tail silence, bundle streamed narration (fast first sentence).
  '2026-06-03-arb7': 'Bellows Coil',
  // Kokoro crossfade: adjacent ready chunks concatenated into one
  // waveform with an equal-power crossfade at each join.
  '2026-06-03-arb8': 'Temper Coil',
  // Model-loading banner reworded + recolored amber/orange so it reads as
  // a calm "this is normal" notice rather than a red error alert.
  '2026-06-03-arb9': 'Kindle Coil',
  // Loading banner shows real per-engine download % (Qwen + Kokoro),
  // "finishing…" for the no-progress compile step, "initial install is
  // longest" copy; Kokoro %-gate lowered 4s→2s for a truer ramp.
  '2026-06-03-arb10': 'Glow Coil',
  // Kokoro robustness: normalize native audio to a real Float32Array so the
  // trim/crossfade post-processing can't throw "undefined is not a function";
  // error status now names the failing step ([warmup]/[speak]).
  '2026-06-03-arb11': 'Spark Coil',
  // Tutorial: name prompt is the first Arbiter line (danger/ask/hub hints
  // suppressed during tutorial); em-dashes removed from spoken tutorial +
  // entry lines; cleanForSpeech also converts spaced hyphens to commas.
  '2026-06-03-arb12': 'Flare Coil',
  // Voice latency: ship first sentence as a small chunk (fast start),
  // crossfade only within a line; tutorial action buttons go amber once
  // their item is taken (green only for the current beat's action).
  '2026-06-03-arb13': 'Surge Coil',
  // Actually suppress the pre-name Arbiter hints: arm the tutorial BEFORE
  // beginScene so the tutorialStep===null guards take effect on a new game.
  '2026-06-03-arb14': 'Volt Coil',
  // Serialize Kokoro inference (fixes "[speak] [object Object]" + skipped
  // sentences from concurrent forward()); default rate 1.35; faster poll +
  // tighter queue; new CLIMB tutorial beat; tutorial CLIMB button gated.
  '2026-06-03-arb15': 'Plasma Coil',
  // Music ducking: live track drops to 85% (15% dip) while the Arbiter
  // speaks, restores to full when the speech queue empties.
  '2026-06-03-arb16': 'Echo Coil',
  // Ducking amount is now a player setting (Settings → SFX → Music → "Duck
  // under voice", 0–50%, default 15%).
  '2026-06-03-arb17': 'Chord Coil',
  // Rope beat: disable the TAKE shortcut so the typed-input lesson (pre-fill
  // + ACT) can't be bypassed; re-enables once ACT advances the beat.
  '2026-06-03-arb18': 'Latch Coil',
  // Climb beat advances only at the top (full climb taught); terser Arbiter
  // lines; only the instructed quick-action works per beat, wrong taps buzz.
  '2026-06-03-arb19': 'Buzz Coil',
  // Climb beat now completes on the way DOWN (back at ground level), not at
  // the top; line points at the full up-and-down loop.
  '2026-06-03-arb20': 'Tide Coil',
  // Stop the title "Choose your character" line on character-select/new-game
  // so the welcome-back / name prompt isn't queued behind it (the ~4s delay).
  '2026-06-03-arb21': 'Cue Coil',
  // Indoors: drop the world MAP button (meaningless by room), rename OUT to
  // EXIT — travel row is now up to 4 room buttons + EXIT.
  '2026-06-03-arb22': 'Gate Coil',
  // Nav-row fit for long room names: lower letterSpacing + minimumFontScale
  // so "GRAND HALL"/"LIVING ROOM" stay readable in the equal-width slots.
  '2026-06-03-arb23': 'Span Coil',
  // Enterable-building template pool (data + module): flooded house, generic
  // outpost, shack, shed (+secret cellar), market (4 stalls). Foundation only
  // — entry/exit + scene wiring is the next step.
  '2026-06-03-arb24': 'Hearth Coil',
  // Enterable buildings WIRED: enter/exit + room nav row + secret-room
  // reveal. Dev trigger "enter <building>" to walk them on-device.
  '2026-06-03-arb25': 'Door Coil',
  // Market stalls spawn a fresh category trader (random stock) on entry;
  // building entry blocked during combat (fixes the "cycling rooms" weirdness).
  '2026-06-03-arb26': 'Stall Coil',
  // Buildings are a side-pocket off the tile: snapshot the wild scene on
  // enter, restore it on EXIT — same spot, weather, and plotted distance
  // (entering a building is never a travel step).
  '2026-06-03-arb27': 'Pocket Coil',
  // Plotted distance is now position-derived (|target − you| on the current
  // map), so cardinal detours off the course re-plot honestly (18 → 23).
  '2026-06-03-arb28': 'Plot Coil',
  // Canonical world: 82x41 grid, every named location at a FIXED atlas-derived
  // position (seed-independent, same for everyone). Saves snap to new center.
  '2026-06-03-arb29': 'Atlas Coil',
  // Travel pacing rolled back to theme-park: wasteland-encounter chance
  // 0.82/0.92 → 0.45/0.55, vendor 15%→8%, step trinket 10%→7%.
  '2026-06-03-arb30': 'Tempo Coil',
  // Codename theme shift — the '<noun> Coil' run was reading EDM/dancehall;
  // switching to gritty two-word survival handles (Rust Hollow, Ash Gulley,
  // Bone Ladder, ...) for all FUTURE OTAs. Shipped ids are NEVER renamed —
  // bug reports map to whatever handle was live, so the Coil run stays as-is.
  // CLIMB button drops to neutral when nothing's climbable (was stuck amber);
  // out-of-range combat weapons (punch/kick/equipped) now BUZZ "can't do it"
  // instead of auto-approaching — APPROACH is the player's job again.
  '2026-06-03-arb31': 'Rust Hollow',
  // Weather swing-penalty ("−1 to the swing") now narrates ONCE per fight
  // instead of on every single attack — it doesn't change round-to-round,
  // so the repeat was just log clutter. Re-fires only if the weather shifts.
  '2026-06-03-arb32': 'Ash Gulley',
  // Boot-banner cleanup. "Waking up the Arbiter" was wired to the VOICE
  // (Kokoro) engine, not the narration brain, and duplicated the dual-engine
  // status box. Now the orange box IS the single "WAKING THE ARBITER" status
  // (rows: MIND = narration, VOICE = Kokoro); the voice banner is demoted to
  // the ready-flash + a clear voice-failed fallback notice. Dead modelsReady
  // removed; VOICE row reads "system voice" on error instead of stalling.
  '2026-06-03-arb33': 'Bone Ladder',
  // INVESTIGATE de-grind. The per-scene ambient prop pool (Search /
  // Approach / Salvage / Investigate chips + look-around) is capped at 5
  // instead of 8 — a room shouldn't surface 8-10 pokeable nouns when there's
  // no "investigate all" to clear them. Per-noun find chance is unchanged,
  // so the odds a room shows the player something hold up with fewer taps.
  '2026-06-03-arb34': 'Salt Wake',
  // Core Guardian stationing gate. currentLocationId lingers as the
  // departure capital all through travel (and while wandering off its
  // anchor tile), so a faction gate-intent action in the wilderness —
  // a Monarch's `attack` on a roadside enemy, a Reclaimer's `investigate`
  // — was summoning that capital's Core Guardian miles from the city.
  // Now the Core gate + summon only fire when actually standing IN the
  // capital (on the map anchor / in a hub room, not mid-journey).
  '2026-06-03-arb35': 'Tar Sump',
  // Organic building discovery. Structures (flooded house / outpost / shack /
  // shed / market) now appear deterministically on ~12% of wild tiles via
  // buildingForTile, narrate on first sight, and surface an ENTER button +
  // presence-gated "enter / go inside" verb. The dev "enter <name>" teleport
  // into any template is retired — buildings are found by exploring now.
  '2026-06-03-arb36': 'Drift Maw',
  // Food/rest split. Rest restores STAMINA only — it no longer heals HP.
  // HP is recovered by EATING (food → health), so the health bar is topped
  // by eating (spammable to full), not sleeping. Makes food markets and
  // food lore carry real weight. The "already rested" gate keys on stamina
  // + corruption now; a wounded-but-rested player is pointed at food.
  '2026-06-03-arb37': 'Salt Larder',
  // Save-load crash guard. Detects a character that closed the app on
  // load last session (stale cross-version save → native abort) via a
  // boot breadcrumb, and offers Retry / Delete on the title screen
  // instead of an involuntary re-crash. Additive safety net.
  '2026-06-04-arb38': 'Ash Cradle',
  // Persistent-room emptiness. Interactables taken/salvaged in a hub room
  // or enterable building no longer respawn on re-entry — closes the
  // re-enter-to-farm-skills/supplies exploit (tutorial outpost + any
  // building). Wild tiles keep their intentional re-roll.
  '2026-06-04-arb39': 'Hollow Pantry',
  // Interior outpost movement is free (0 stamina / 0 time per room — only
  // overland travel draws stamina now), and a 0-stamina overland move
  // reads as a hard "no stamina — can't travel" stop instead of the old
  // misleading "you take one step and stop". Fresh-minted (OTA reserved
  // pool exhausted). Requested haptic buzz deferred to a native AAB.
  '2026-06-04-arb40': 'Brass Cellar',
  // Haptic buzz on refused-movement blocks — shipped as an OTA (not a
  // native AAB as arb40 thought): RN core Vibration is already used by
  // InputBox, so the 0-stamina move now buzzes (30ms) alongside the clear
  // "no stamina" line. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb41': 'Iron Larder',
  // Playtester-tuned default SFX/voice starting values (fresh installs):
  // music duck 15%→40%, bundled-voice rate 1.35×→1.20×, voice volume
  // 100%→90%. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb42': 'Copper Cask',
  // Ask the Arbiter overhaul: fixed the crashing player-introspection
  // branches (array misread), added a Qwen persona fallback so personal/open
  // questions get an in-voice answer instead of the silent line, and added
  // deterministic world-knowledge answers (list factions/capitals/races,
  // current course) with count-correction + forgiving parsing. Fresh-minted
  // (OTA reserved pool exhausted).
  '2026-06-04-arb43': 'Pewter Ledger',
  // Lore fix: tagged the 3 questline capitals (Samarran, Nimari, Voronov)
  // as lost_capital so the Arbiter's world-knowledge counts all 9 guardian
  // Lost Capitals, not 6. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb44': 'Silver Atlas',
  // Arbiter titles become earnable: a title-award engine (engine/titles.ts)
  // wires the 14 Tier-A/B titles to real mechanics + announces them in voice,
  // with several passive perks live. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb45': 'Bronze Sigil',
  // Tier-C title challenges plotted + wired, shipped OFF behind a master
  // kill-switch (locationChallenges.TIER_C_ENABLED) pending hand-drawn
  // layouts + review. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb46': 'Nickel Coffer',
  // Labyrinth of Shadows layout plotted from user-supplied coords (Tier-C,
  // still OFF). app/data/maze/labyrinth-of-shadows.json + map image.
  // Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb47': 'Zinc Vault',
  // Labyrinth of Shadows built + turned ON (Wayfarer = 15th earnable title).
  // engine/labyrinth.ts + gameStore handler; TIER_C_ENABLED flipped true with
  // only the labyrinth enabled. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb48': 'Cobalt Reliquary',
  // Readability: retire the too-dark #5a5246 everywhere (locked title names +
  // descriptions on the Character page were unreadable); all 20 uses -> the
  // Explore-screen amber #c9a86a. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb49': 'Lead Casket',
  // Speaker + Warden Tier-C trials built + ON (titles 16 & 17). New
  // engine/titleChallenges.ts + gameStore handler; one-shot attempts, free
  // scouting. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb50': 'Tin Strongbox',
  // Character-screen readability pass 2: dim #7a705c + #9b8e74 → Explore amber.
  // Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb51': 'Steel Flask',
  // Ask-the-Arbiter: "how many sites can I visit" now answers a visitable-site
  // count + discovery progress (was a garbled echo). Fresh-minted (pool gone).
  '2026-06-04-arb52': 'Brass Phial',
  // Guild Broker built + ON (title 18); coveted chart → 9 canon relics; all 15
  // canon relics added to the lore. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb53': 'Copper Tankard',
  // Silent-narration fix (system-voice fallback when bundled download failed)
  // + voice diagnostics to the game log. Fresh-minted (OTA reserved pool gone).
  '2026-06-04-arb54': 'Iron Cistern',
  // Fix the bundled-voice download: retry + resume on connection abort
  // (was a single no-retry attempt). Fresh-minted (OTA reserved pool gone).
  '2026-06-04-arb55': 'Bronze Ewer',
  // Stop re-downloading the voice every launch: reuse gated on a completion
  // marker, not a 50 MB size guess. Fresh-minted (OTA reserved pool gone).
  '2026-06-04-arb56': 'Silver Flagon',
  // Batch sell (quantity stepper + Sell All) + Scrap All button. Fresh-minted
  // (OTA reserved pool exhausted).
  '2026-06-04-arb57': 'Pewter Chalice',
  // "[tool pouch]" tag next to pouched items in the inventory list.
  // Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb58': 'Brass Goblet',
  // Combat takes precedence over scene hooks (no peaceful story-thread
  // resolution mid-fight). Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb59': 'Cobalt Goblet',
  // REGRESSION-1 Piece A: `take` spawns common catalog gear again (revives the
  // dead take loop). Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb60': 'Zinc Goblet',
  // Loot-loop Pieces B+C: salvage → materials only; investigate → clues/hooks
  // norm + rare gear/material find. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb61': 'Gold Chalice',
  // Split-on-equip: equipping from a stack peels one copy into the slot; the
  // rest stay free. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb62': 'Silver Goblet',
  // Hands (gauntlets/gloves) + cloak armor slots — ~71 stranded armor pieces
  // become equippable. Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb63': 'Bronze Chalice',
  // Stress-test fix pass: split-on-equip id invariant, hands/cloak coverage
  // (contextInjector + drop-guard), gear-farm filter, investigate test bound.
  // Fresh-minted (OTA reserved pool exhausted).
  '2026-06-04-arb64': 'Iron Goblet',
  // Voice start/end clip fix: padSilence re-adds a controlled silent lead/
  // tail so expo-av's AudioTrack warm-up eats zeros, not the first phonemes
  // ("Choose your character" → "aracter"). Fresh-minted (pool exhausted).
  '2026-06-05-arb65': 'Tin Goblet',
  // Voice clip fix pt.2 — the real cause was a cold audio-HAL on the FIRST
  // Audio.Sound of the session, not AudioTrack warm-up. warmAudioOutput()
  // plays a silent primer during prewarm so the title line outputs from
  // sample zero. Fresh-minted (pool exhausted).
  '2026-06-05-arb66': 'Copper Goblet',
  // Voice clip fix pt.3 — a separate silent primer didn't hold (re-idle gap +
  // fired too early). The first utterance now carries its own 1300ms silent
  // lead so the cold HAL routes into silence, not speech. Fresh-minted.
  '2026-06-05-arb67': 'Bronze Goblet',
  // Voice clip, actual fix: the loss is upstream of playback (buffer arrives
  // truncated), so the title line gets a disposable lead-in clause + a
  // TTS-route diagnostic in COPY VOICE INFO. Removed the dead 1300ms lead.
  '2026-06-05-arb68': 'Nickel Goblet',
  // Voice clip polish: arb68's lead-in confirmed the real phrase survives;
  // arb69 splits the greeting into a short "Welcome." primer (eaten by the
  // ~0.8s clip) + a clean, separate "Choose your character." second playback.
  '2026-06-05-arb69': 'Zinc Chalice',
  // Voice clip ROOT CAUSE: Kokoro warm-up ran at hardcoded rate 1.0 but the
  // default rate was raised to 1.2 → warm-up stopped covering the real line →
  // first 1.2 forward (title line) lost its head. Fix: warm at configured
  // rate; reverted the "Welcome." primer.
  '2026-06-05-arb70': 'Gold Goblet',
  // OTA-496 — codename layer maintenance was dropped after OTA-327; backfilled the
  // 2026-06-11 element run (OTA-483→496) so the About screen + bug reports resolve
  // a stable codename instead of leaking the raw `(2026-06-11-NNN)` id. (Element #
  // = OTA-NNN − 405.) The 328→482 gap is still un-backfilled — separate cleanup.
  '2026-06-11-483': 'Platinum Leaf',
  '2026-06-11-484': 'Gold Inlay',
  '2026-06-11-485': 'Mercury Gilding',
  '2026-06-11-486': 'Thallium Anneal',
  '2026-06-11-487': 'Lead Bonding',
  '2026-06-11-488': 'Bismuth Sieve',
  '2026-06-11-489': 'Polonium Tint',
  '2026-06-11-490': 'Astatine Purge',
  '2026-06-11-491': 'Radon Sorting',
  '2026-06-11-492': 'Francium Wash',
  '2026-06-11-493': 'Radium Vault',
  '2026-06-11-494': 'Actinium Sieve',
  '2026-06-11-495': 'Thorium Forge',
  '2026-06-11-496': 'Protactinium Glaze',
  '2026-06-11-497': 'Uranium Band',
  '2026-06-11-498': 'Neptunium Veil',
  '2026-06-11-499': 'Plutonium Lattice',
  '2026-06-11-500': 'Americium Plot',
  '2026-06-11-501': 'Curium Nudge',
  '2026-06-11-502': 'Berkelium Survey',
  '2026-06-11-503': 'Californium Cipher',
  '2026-06-11-504': 'Einsteinium Tell',
  '2026-06-11-505': 'Fermium Mark',
  '2026-06-11-506': 'Mendelevium Pact',
  '2026-06-11-507': 'Nobelium Veil',
  '2026-06-11-508': 'Lawrencium Bazaar',
  '2026-06-11-509': 'Rutherfordium Lattice',
  '2026-06-11-510': 'Dubnium Waypoint',
  '2026-06-11-511': 'Seaborgium Tally',
  '2026-06-11-512': 'Bohrium Ledger',
  '2026-06-11-513': 'Hassium Docket',
  '2026-06-11-514': 'Meitnerium Cluster',
  '2026-06-11-515': 'Darmstadtium Inset',
  '2026-06-11-516': 'Roentgenium Return',
  '2026-06-11-517': 'Copernicium Cairn',
  '2026-06-11-518': 'Nihonium Stow',
  '2026-06-11-519': 'Flerovium Vitals',
  '2026-06-11-520': 'Moscovium Split',
  '2026-06-11-521': 'Livermorium Fold',
  '2026-06-11-522': 'Tennessine Twin',
  '2026-06-11-523': 'Oganesson Sling',
  // Past Oganesson (118) — element 119+ uses the IUPAC systematic placeholder names.
  '2026-06-11-524': 'Ununennium Readout',
  '2026-06-11-525': 'Unbinilium Reagent',
  '2026-06-11-526': 'Unbiunium Sort',
  '2026-06-11-527': 'Unbibium Lexicon',
  '2026-06-11-528': 'Unbitrium Gilt',
  '2026-06-11-529': 'Unbiquadium Bulwark',
  '2026-06-11-530': 'Unbipentium Aegis',
  '2026-06-11-531': 'Unbihexium Seal',
  '2026-06-12-532': 'Unbiseptium Ledger',
  '2026-06-12-533': 'Unbioctium Tether',
  '2026-06-12-534': 'Unbiennium Caliber',
  '2026-06-12-535': 'Untrinilium Plot',
  '2026-06-12-536': 'Untriunium Silt',
  '2026-06-12-537': 'Untribium Bulwark',
  '2026-06-12-538': 'Untritrium Fold',
  '2026-06-12-539': 'Untriquadium Sieve',
  '2026-06-12-540': 'Untripentium Clip',
  '2026-06-12-541': 'Untrihexium Gild',
  '2026-06-12-542': 'Untriseptium Closure',
  '2026-06-12-543': 'Untrioctium Recall',
  '2026-06-12-544': 'Untriennium Waypoint',
  '2026-06-12-545': 'Unquadnilium Tally',
  '2026-06-12-546': 'Unquadunium Roster',
  '2026-06-12-547': 'Unquadbium Safeguard',
  '2026-06-12-548': 'Unquadtrium Inquiry',
  '2026-06-12-549': 'Unquadquadium Clarity',
  '2026-06-12-550': 'Unquadpentium Stride',
  '2026-06-12-551': 'Unquadhexium Mend',
  '2026-06-12-552': 'Unquadseptium Assay',
  '2026-06-12-553': 'Unquadoctium Substitute',
  '2026-06-12-554': 'Unquadennium Grade',
  '2026-06-12-555': 'Unpentnilium Marker',
  '2026-06-12-556': 'Unpentunium Spent',
};

// OTA-274 — separate codename pool for native AAB builds. The OTA
// codename above tells the dev which JS bundle is running; this map
// tells the dev which native APK binary is installed. They drift
// out of sync naturally — an OTA bundle is one beat (Pewter Vault,
// Bronze Mantle, etc.), an AAB is a bigger event that may persist
// across dozens of OTAs.
//
// Keyed by Android `versionCode`, which the workflow stamps from
// GitHub Actions `run_number` at build time. Add a new entry here
// every time an AAB is uploaded to Play Console internal testing
// AND `MINIMUM_RECOMMENDED_APK_BUILD` is bumped to match. The
// banner + About screen pull the codename for the build number
// they see in `Application.nativeBuildVersion`.
const APK_CODENAMES: Record<number, string> = {
  263: 'Slate Keep',
  // OTA-297 — Stone Castle AAB shipped; versionCode = GitHub Actions
  // run_number for that build (pending follow-up).
  // OTA-298 — Granite Hold AAB layered on top of Stone Castle with
  // the JSON lazy-load pass. versionCode same TBD pattern. Both AAB
  // codename entries get filled in via a small follow-up OTA once
  // the actual run_numbers land — for now the About screen shows
  // "(build N)" fallback for both, but the lookup table is ready.
};

/**
 * Codename for the given OTA build id (defaults to the live OTA).
 * Returns a fallback "(<raw id>)" wrapped in parens if the id isn't
 * in the map — preserves diagnostic info for super-old saves whose
 * last-seen OTA predates this codename layer. The parens make it
 * obvious to the dev that the codename map needs an entry.
 */
export function getBuildCodename(otaId: string = OTA_BUILD_ID): string {
  return CODENAMES[otaId] ?? `(${otaId})`;
}

/**
 * Same as getBuildCodename but returns null if the id is unmapped.
 * Used by call sites that want to render fallback text differently
 * (e.g., the OTA-applied dialog, which falls back to "an older
 * build" rather than exposing the raw OTA id).
 */
export function getBuildCodenameOrNull(otaId: string = OTA_BUILD_ID): string | null {
  return CODENAMES[otaId] ?? null;
}

/**
 * Codename for the given AAB versionCode. Returns "(build N)" wrapped
 * in parens if the build number isn't in the map — pre-Slate-Keep
 * AABs that predate this codename layer fall back to the raw number.
 */
export function getApkCodename(versionCode: number | string | null | undefined): string {
  const n = typeof versionCode === 'string' ? parseInt(versionCode, 10) : versionCode;
  if (n == null || Number.isNaN(n)) return '(unknown build)';
  return APK_CODENAMES[n] ?? `(build ${n})`;
}

/**
 * Same as getApkCodename but returns null if the build is unmapped.
 */
export function getApkCodenameOrNull(versionCode: number | string | null | undefined): string | null {
  const n = typeof versionCode === 'string' ? parseInt(versionCode, 10) : versionCode;
  if (n == null || Number.isNaN(n)) return null;
  return APK_CODENAMES[n] ?? null;
}
