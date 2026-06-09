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
// Codename scheme: noun-noun pairs evocative of Tartaria but generic
// enough to not be obvious as game-specific search hits. ~40
// curated pairs in reserve; we burn them sequentially per OTA.

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
