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
