// Tutorial step definitions. Each step describes ONE moment of the
// walkthrough: which screen to be on, which area of that screen the
// overlay should highlight, and the explanatory text shown in the
// info card. Steps run in order; "skip" exits at any time.
//
// OTA-229 — tutorial overhaul phase 1. The upfront walkthrough used
// to be 28 steps / ~1,700 words; players read a dictionary before
// playing. New shape: 3 essential steps at character creation
// (movement, quick actions, the gear icon) then just-in-time hints
// (via FirstTimeHint / useFirstTimeHint) pop up the first time the
// player taps a system. The TUTORIAL_DOCS_FULL export below preserves
// the original 28 steps verbatim for a future Tutorial Replay screen
// (Phase 2) — they're the canonical long-form copy for any player
// who wants the full reference. Phase 2+ migrates each entry into a
// contextual FirstTimeHint at the corresponding trigger site.

import type { ScreenName } from '../engine/types';

export type HighlightArea =
  // World screen regions (the main exploration view — the player's
  // whole world lives on this one screen, per the project's framing).
  | 'top-left-stats'
  | 'top-right-enemy'
  | 'scene-bar'
  | 'feed'
  | 'travel-row'
  | 'quick-row'
  | 'input-row'
  // OTA 457 — `bottom-menu` retired (the run-control row was removed
  // in OTA 048; gear icon now sits in the top-right corner of the
  // right column, which we highlight via `top-right-enemy`).
  // Full-screen — no highlight, just a centered info card.
  | 'fullscreen';

export interface TutorialStep {
  /** Which screen this step takes place on. The overlay dispatches setScreen
   *  on entry if it doesn't match. */
  screen: ScreenName;
  area: HighlightArea;
  title: string;
  body: string;
  /** True for the first step — we use it to render the Skip/Continue
   *  choice instead of the standard Next/Skip buttons. */
  welcome?: boolean;
}

// OTA-229 — slim 3-step upfront tutorial. Anything not here lives as
// a FirstTimeHint at the trigger site, or in TUTORIAL_DOCS_FULL for
// a player who wants the full read via Tutorial Replay.
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Welcome to Tartaria',
    body:
      'Tap a cardinal direction to travel, or type what you want to do. ' +
      'Most things take 30 seconds to learn — hints will pop up the first time you tap a new system.',
    welcome: true,
  },
  {
    screen: 'exploration',
    area: 'quick-row',
    title: 'Quick actions',
    body:
      'LOOK / SEARCH / INVENTORY are below the log. ' +
      'Combat and craft buttons appear when they\'re relevant. That\'s the main loop.',
  },
  {
    screen: 'exploration',
    area: 'top-right-enemy',
    title: 'The gear icon',
    body:
      'Settings, Lore Codex, and the full system reference live behind the ⚙ in the bottom-right. Come back any time.',
  },
];

// OTA-229 — preserved long-form tutorial for the future Tutorial
// Replay screen (Phase 2). Originally the 28-step upfront wall;
// kept here verbatim so the copy isn't lost and so a player who
// wants the full reference can read every system in one place. Do
// NOT add new steps here — new systems get a FirstTimeHint at the
// trigger site instead.
export const TUTORIAL_DOCS_FULL: TutorialStep[] = [
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Welcome to Tartaria',
    body:
      'Your character is set. Before you dive in — would you like a quick tour of the screens? ' +
      'Two minutes; you can skip any time.',
    welcome: true,
  },
  {
    screen: 'exploration',
    area: 'top-left-stats',
    title: 'Your stats',
    body:
      'HP, stamina, AC, currency (TC), corruption, and your five stats. ' +
      'Equipped gear is listed underneath, along with any active contracts. ' +
      'Stat bonuses from rings, amulets, and armor show as "(+N)" next to the base value.',
  },
  // OTA 040 — new step: Player Sheet screen.
  {
    screen: 'character',
    area: 'fullscreen',
    title: 'Tap for the full sheet',
    body:
      'Tap your stats panel any time to open the full Player Sheet (this screen). ' +
      'Every number here breaks down into its sources — base race, equipped gear, food ' +
      'buffs, weather modifiers, racial traits, corruption tier. If a stat surprised you ' +
      'in a fight, this is where you find out why. ' +
      '\n\nRead-only — equip / unequip / use lives on the Inventory screen. This sheet ' +
      'is for understanding what you are right now.',
  },
  {
    screen: 'exploration',
    area: 'top-right-enemy',
    title: 'Enemy panel / Crest',
    body:
      'Out of combat this shows the Tartaria crest. In combat the panel becomes one card per enemy ' +
      '(swipe or tap to cycle targets) with their HP, AC, attack bonus, damage dice, and whether ' +
      'they\'re in range of your equipped weapon. ' +
      '\n\nThe ⚙ gear in the bottom-right corner is your settings/lore/session hub — we\'ll see it.',
  },
  // OTA 457 — replaces the dead "Save & log" / bottom-menu step.
  // The gear icon is the single entry point for settings + Lore
  // Codex + session controls (save & exit, copy/clear log). Stays
  // anchored to `top-right-enemy` so the overlay highlights the
  // same column the gear sits inside.
  // OTA-174 — gear moved from top-right to bottom-right corner;
  // tutorial copy updated to match. Overlay area name kept as
  // `top-right-enemy` since it highlights the whole right column,
  // not specifically the top edge.
  {
    screen: 'exploration',
    area: 'top-right-enemy',
    title: 'The gear corner',
    body:
      'Tap the ⚙ in the bottom-right corner — it\'s your one hub for everything outside the world. ' +
      'Four tabs inside: ' +
      '\n\n• SESSION — save & exit, copy / clear the log, slot management. ' +
      '\n• SFX — music + voice toggles. ' +
      '\n• LORE — the full codex (races, factions, places, timeline). Tap any Place to plan ' +
      'a travel route straight there. ' +
      '\n• ABOUT — build info, diagnostics, OTA build ID.',
  },
  {
    screen: 'exploration',
    area: 'scene-bar',
    title: 'Scene bar',
    body:
      'Where you are right now: location · weather · hazard. The line below shows in-game time ' +
      '(Day N · morning / afternoon / evening / night). ' +
      '\n\nACTIONS on the right opens a full reference of every verb the engine understands — ' +
      'we\'ll visit it in a moment. ' +
      '\n\nThe MAIN QUEST chip just below the scene bar shows the next concrete step in your ' +
      'core arc and doubles as the entry to the full Contracts screen (side quests, hunts, ' +
      'mysteries, collectibles, milestones). Tap it any time.',
  },
  {
    screen: 'exploration',
    area: 'feed',
    title: 'The world feed',
    body:
      'Every event lands here as a colored line: world description, your actions, combat rolls, ' +
      'Arbiter remarks, rewards, system hints. Scroll to look back at anything you missed. ' +
      '\n\nLong travel doesn\'t just count steps — every few cardinal moves the engine rolls a ' +
      'wasteland encounter: an abandoned caravan with a note, a wandering drifter with a tip, ' +
      'a fungal patch you can harvest, an old bus with a duffel, etc. Watch the feed.',
  },
  // 2026-05-25 OTA-030 — day/night cycle now has real mechanical
  // teeth: stealth ±1, encounter rate 1.3×/0.85×, rest always rolls.
  {
    screen: 'exploration',
    area: 'scene-bar',
    title: 'Day, night, and risk',
    body:
      'The scene bar tells you which part of the day you\'re in (morning / afternoon / evening / ' +
      'night). That period shapes every roll: ' +
      '\n\n• Stealth — +1 at night (evening through dawn), -1 during the day. The silt eats ' +
      'sound after dusk; daytime sneaks read louder. ' +
      '\n• Wasteland encounters — 1.3× rate at night, 0.85× by day. Things that hunt prefer ' +
      'the dark; travelers who push after sunset eat the risk. ' +
      '\n• Rest — every rest rolls for an ambush even at full HP. You\'re vulnerable, watch the ' +
      'fire. Night rests roll harder than day rests. ' +
      '\n\nTime is shown on the line under the scene bar as "Day N · period". Plan loadout and ' +
      'route accordingly.',
  },
  {
    screen: 'exploration',
    area: 'travel-row',
    title: 'Travel — cardinal and waypoint',
    body:
      'NORTH / SOUTH / EAST / WEST — one tap = one step in that direction on the world map. ' +
      'These hide during combat (you can\'t walk away from a fight that\'s already on you). ' +
      'MAP sits on the right and stays visible on every screen — tap to see the world layout. ' +
      '\n\nFor long hauls: type "travel to <city>" OR tap MAP and pick a row from the TRAVEL TO ' +
      'panel below the atlas (one-tap routing, no confirm). Either way the row flips to → ' +
      '<CITY> [N moves left] / STOP TRAVEL. The badge counts remaining cardinal steps to the ' +
      'target. Each → tap takes one step — same stamina, same time, same encounter rolls. ' +
      'STOP hands the cardinals back. ' +
      '\n\nTravel ignores hubs you\'re passing through (you won\'t get dropped into the reception ' +
      'of every roadside structure you cross). It only auto-enters when the target IS the hub. ' +
      '\n\nAsk the Arbiter "what\'s north of me" or "closest hub" any time.',
  },
  {
    screen: 'exploration',
    area: 'quick-row',
    title: 'Quick actions',
    body:
      'Tappable shortcuts for the most common actions. In peace: "look around you", rest, ' +
      'search, approach, craft, inventory. ' +
      '\n\nSearch and Approach open one-tap modals: each scene\'s authored nouns (anvil, ' +
      'map-stone, wagon, rubble, trap, …) appear as chips at the top — the same nouns you see ' +
      'in the "look around you" bearings line, so it all stays consistent. Approach has a ' +
      'USE STEALTH toggle for sneak-up routing. ' +
      '\n\nFour affordance buttons — TAKE / SALVAGE / CLIMB / INVESTIGATE — glow green when ' +
      'their modal has something actionable in the current scene, and grey out when there\'s ' +
      'nothing left to do. Tap to see the chip list. Each noun is consumed once per room: ' +
      'salvaging or investigating a chip removes it from every modal in that room (no ' +
      'double-acting), but the same noun in a different room still shows green. ' +
      '\n\nIn combat the quick actions split into THREE rows so nothing crowds:' +
      '\n  • Row 1 — punch, kick, your equipped weapons (color-coded by reach: green = can ' +
      'hit at current range, yellow = need to approach, blue = defensive).' +
      '\n  • Row 2 — companions + safe options: GOLEM (hp/max) when one is summoned, your ' +
      'dog by name (hp/max) when alive, then DODGE (folds in block / parry / deflect — one ' +
      'defensive stance) and FLEE.' +
      '\n  • Row 3 — APPROACH (picks a specific enemy or routes via stealth), STEP BACK ' +
      '(when not at far range), INVENTORY (swap weapons / use a kit mid-fight).' +
      '\n\nThe ⚙ gear stays in the bottom-right of the enemy panel during combat too — one ' +
      'tap out to settings without leaving the fight.',
  },
  // OTA 040 — new step: recent additions to the quick row + verbs.
  // OTA-113 — refreshed for elevated-overlay system + Aetheric tab
  // routing through Crafting.
  {
    screen: 'exploration',
    area: 'quick-row',
    title: 'New verbs and buttons',
    body:
      'A few things have layered onto the quick row since the early builds: ' +
      '\n\n• CLIMB opens a noun picker for every climbable thing in the scene. Once you\'re ' +
      'partway up, the button flips to CLIMB UP (n/total) + CLIMB DOWN — tier by tier, with ' +
      'rope auto-passing every tier and chance-based loot at the top. Tall objects (2+ tiers) ' +
      'sometimes open into a mini-area at the top: a roadside-style trader (4+ tiers only, ' +
      'with a funny reason for hiding up there), a lookout vantage, or a small encounter. ' +
      'CLIMB DOWN restores the base scene exactly as you left it. ' +
      '\n\n• 0-stamina climbs are still allowed — you just fall and take damage. The engine ' +
      'won\'t refuse the attempt; the choice (and the consequence) is yours. ' +
      '\n\n• Roadside trader stalls appear while you walk (~15% per cardinal step outdoors) — ' +
      'a one-line announcement in the feed and a vendor banner at the top. Vendors have a ' +
      'STEAL button next to BUY with the DC stamped on it; skip the price by risking a fight. ' +
      '\n\n• Aethercraft verbs are real. Type "shape stone", "summon golem" (mud / iron / ' +
      'aether / crystal — see the Golem Sidekick step), or "mend wounds" with an Aether-tagged ' +
      'consumable (Aether Crystal / Mud / Shard / Locket) burning as fuel. The Crafting → ' +
      'AETHERIC tab is the easier way in: every discipline laid out with stats, fuel costs, ' +
      'and a tap-to-stage hint. Mud Dwellers cast at base DC (+2 INT); Aetherborn +2 DC; ' +
      'other races +3 DC.',
  },
  {
    screen: 'exploration',
    area: 'input-row',
    title: 'Type anything',
    body:
      'You don\'t have to use the buttons. Type any action — "search the rubble", ' +
      '"talk to the smith", "throw a rock", "take the trap apart and keep the materials". ' +
      'The fast dictionary parser handles common verbs in milliseconds. Novel phrasings ' +
      'flow to Qwen on-device, which figures out what you meant and re-dispatches it — ' +
      'you\'ll see "The Arbiter considers your words…" while it thinks. ' +
      '\n\nMisspellings and paraphrased item names are handled by the cognitive layer.',
  },
  // OTA 040 — new step: race mechanical layer.
  {
    screen: 'character',
    area: 'fullscreen',
    title: 'Race mechanics',
    body:
      'Your race is a real mechanical layer, not just flavor. ' +
      '\n\n• Tartarian Giants land 1d6+2 barehand and take −4 AC in confined spaces. +2 STR always. ' +
      '\n• Mud Dwellers get +1 AC underground and +2 INT when using Aethercraft. +2 DEX always. ' +
      '\n• Aetherborn pay HP instead of corruption when they cast Aetheric Healing. +1 CHA always. ' +
      '\n• Reclaimers gain +1 AC in ruins and cities. +1 DEX always. ' +
      '\n• Architectural Sentinels punch with 1d10 (even/odd to land), +2 AC in runic gear. +2 STR / +1 INT. ' +
      '\n• Mud Golems carry +1 AC with relic armor. +2 STR always. ' +
      '\n• Unknowing Masses get no inherent bonuses — pure adaptability. ' +
      '\n\nAll of this — barehand, conditional AC, always-on stat bumps, the trait list — is ' +
      'visible on your Player Sheet (above). Tap the top-left stats panel any time to recheck.',
  },
  {
    screen: 'actions',
    area: 'fullscreen',
    title: 'Actions reference',
    body:
      'Every verb the engine understands, grouped by category (movement, combat, social, ' +
      'skill-based, Aetheric). Tap any card and its first example phrase drops into the ' +
      'input box; tap again to cycle alternate phrasings. Great for "take cover", "set a ' +
      'trap", any verb you forget the wording for. ' +
      '\n\nCrafting recipes used to live on this screen as a second tab; they\'ve moved to ' +
      'the Crafting screen (which we\'ll see next) so the action reference stays focused on ' +
      'verbs, and crafting becomes the one place to plan a build.',
  },
  // OTA-113 — new step. The Crafting screen has its own dedicated walk-
  // through now that OTA-091 brought the Aetheric tab in as a 4th tab,
  // OTA-095 stripped recipes from the Actions screen, and OTA-111
  // surfaced damage dice / restore numbers / golem stats inline on the
  // cards so the player can plan a build without leaving the screen.
  {
    screen: 'crafting',
    area: 'fullscreen',
    title: 'Crafting — four tabs',
    body:
      'Everything you can make lives here. Four tabs across the top: ' +
      '\n\nCRAFT — your fuel-aware crafting bench. Only recipes whose ingredients you can ' +
      'actually cover show by default; toggle to see locked recipes too. ' +
      '\n\nREPAIR — patch durability on equipped or stashed gear. Material cost scales with ' +
      'damage taken. ' +
      '\n\nRECIPES — full catalog of every craftable item, with ingredient lists. Tap a ' +
      'recipe to drop "craft <name>" into the world input. Weapon cards show their damage ' +
      'dice (e.g. "1d8 piercing · Scales with DEX"); consumable cards show their restore ' +
      'numbers ("Restores: +5 HP / +2 stamina") and any buff or cure they apply. Plan a ' +
      'build before you spend the mats. ' +
      '\n\nAETHERIC — the three Aethercraft disciplines (Aetherstone Manipulation / Aether ' +
      'Golem Constructor / Aetheric Healing) plus per-golem variant cards under the SUMMON ' +
      'discipline. Each golem (Mud / Iron / Aether / Crystal) shows HP, damage dice, blurb, ' +
      'fuel cost, and a "tap → summon <kind> golem" hint that stages the correct phrase. ' +
      'The footer documents the d20 + INT vs DC roll and race modifiers (Mud Dwellers cast ' +
      'at base DC and gain +2 INT; Aetherborn +2 DC; other races +3 DC). ' +
      '\n\nThe search bar at the top and the sort buttons match the same component used on ' +
      'the Inventory screen — same gestures, same filters everywhere.',
  },
  // 2026-05-25 OTA-011 (MECHANIC-1b) — golem sidekick is a real
  // companion now. Players need to know it persists across tiles
  // and that the COMMAND GOLEM button appears in combat.
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Golem sidekicks',
    body:
      'Summon a golem with `summon mud golem` / `summon iron golem` / `summon aether golem` / ' +
      '`summon crystal golem`. Each burns its own Aether fuel and produces a companion with its ' +
      'own HP, attack die, and damage type: ' +
      '\n• Mud — slow heavy bruiser (1d8, bludgeoning, 18 HP) ' +
      '\n• Iron — tank build (1d6, slashing, 24 HP) ' +
      '\n• Aether — energy striker (1d10, aetheric, 14 HP) ' +
      '\n• Crystal — precision (1d6, piercing, +2 hit, 12 HP) ' +
      '\n\nThe golem follows you across cardinal moves and persists until it dies or you dismiss ' +
      'it. In combat a GOLEM button (with live HP) appears in the quick row — tap to send it at ' +
      'your current target. Enemy retaliation hits the golem, not you. When it falls it dissolves ' +
      'back into its fuel material. Type `dismiss golem` any time. One golem at a time.',
  },
  // OTA-120 Phase 4 — Dog Companion walkthrough step.
  // OTA-176 — split into TWO screens (rescue/combat vs living-with-
  // the-dog) per player ask: "split this giant wall of tutorial
  // into 2 screens. while we are at it, let's make sure the
  // tutorial is up to date." Currency updates: dog combat buttons
  // now sit on row 2 of the action menu (OTA-172); typo tolerance
  // for fed/cll/helll/feeed lands the right intent (OTA-158); dog
  // rescue + onboarding narration prints in PURPLE on the DOG QUEST
  // channel (OTA-176) so the player can spot the arc at a glance.
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Your dog — the rescue and the fight',
    body:
      'Tartaria offers ONE canine companion per save. Find them by investigating a "cage" at a ' +
      'forge ruin, a "wagon wheel" at a roadside camp, a "cellar door" at a buried structure, or ' +
      'a "snare pit" in the wilderness — each hooks a captor fight, faction-neutral (no rep ' +
      'penalty). The rescue arc (captor confrontation through naming) prints in PURPLE on the ' +
      'DOG QUEST channel so it stands apart from the regular Arbiter beats.' +
      '\n\nDefeat the captor and the Arbiter walks you through three questions: what kind of ' +
      'dog is that (free text — your answer IS the breed), what will you name them (free text), ' +
      'and boy/girl (free text — drives narration pronouns).' +
      '\n\nCombat. Your dog sits on ROW 2 of the action menu (next to golem / dodge / flee), ' +
      'labeled with their name. Tap to BITE (d20 + STR vs AC, 1d6 + ½STR piercing) or DISTRACT ' +
      '(d20 + DEX/INT vs DC 12 — your next attack on that enemy gets +2). Bite trains STR; ' +
      'distract trains DEX or INT. Enemy retaliation splits between you, the dog, and any ' +
      'active golem.' +
      '\n\nDog + golem. They coexist — both fight together. The first co-activation prints a ' +
      'one-line flavor beat then it\'s mechanical from there.' +
      '\n\nDeath. Combat-death is recoverable: Resurrection Gems revive dogs the same as ' +
      'players. If you have none, the engine queues a one-shot puppy-vendor encounter that ' +
      'fires after your next Core Guardian victory. Late-game (all 9 Guardians cleared) the ' +
      'fallback becomes a "rubble puppy" hook on wasteland scenes. Either path runs the same ' +
      'Arbiter onboarding.',
  },
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Your dog — living with them',
    body:
      'Smell-find. On scene entry the dog rolls d20 + INT vs DC 12. Success surfaces ONE ' +
      'hidden investigation noun the visible scene was missing — a buried bone, a faint scent ' +
      'trail, a tossed bottle. Trains INT. One sniff per room.' +
      '\n\nClimbing. Dogs can\'t climb. The moment you start a climb the dog drops to ' +
      'waiting_at_base; on `climb down` they rejoin you. No stamina hit, no rep hit.' +
      '\n\nHunger. The dog loses 1 loyalty per 4 in-game hours WITHOUT a feed. Threshold beats ' +
      'fire at 50 / 30 / 15. At 0, the dog ABANDONS — permanent. No safety net for abandonment.' +
      '\n\nFeeding. `feed dog <item>` consumes 1 of any consumable for +20 loyalty (+40 if the ' +
      'item is a [treat] — Smoke-Cured Jerky Strip / Marrow Bone / Honey-Glazed Knuckle / Ash-' +
      'Cured Tongue). `heal dog <item>` and `use <item> on dog` also work — same flow, picks ' +
      'up healHP from the consumable\'s effect block. Typos forgiven: `fed dog`, `feeed dog`, ' +
      '`helll dog`, `cll dog` all route correctly.' +
      '\n\nCall. Type `call dog` or `call <name>` to open the Call Modal — scratch their ear ' +
      '(+2 loyalty), give a treat (opens a picker; +20/+40), or speak softly (+1 loyalty).' +
      '\n\nGear. Dog vests live in the [fits dog] inventory tag — Burlap (+1 AC), Riveted ' +
      'Leather (+2), Aetheric Padded (+3, reflects 1 corruption per hit), Reclaimer Pattern ' +
      '(+4, +1 STR, faction drop). Equip via the Character screen Companion panel.' +
      '\n\nThe dog\'s name + HP shows on your StatsPanel under your own name (warm-gold, right- ' +
      'aligned). Abandoned / dead dogs hide from the panel so it doesn\'t lie about who\'s ' +
      'still with you.',
  },
  // OTA-129/130 — Hook-puzzle walkthrough step. The longest-open
  // dead-hook issue closed: narration that asks the player to do
  // something (rotate, knock, etc.) now has a real verb + state
  // machine behind it. Player needs to know puzzles exist and what
  // to type.
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'When the narrative gives you a sequence',
    body:
      'Some hooks ask you to DO something specific. A sealed vault door narrates: "Three rotations, ' +
      'in the right order. The faint markings tell you which." A submerged steeple\'s buried child-' +
      'note reads: "knock on the steeple if you find us." Type the obvious thing and the engine ' +
      'will honor it.' +
      '\n\nKnown puzzle verbs: ROTATE, KNOCK, TURN, TWIST, PRESS, PUSH, PULL. Each takes a noun and ' +
      'optionally a direction. Examples that work:' +
      '\n  • `rotate the ring left`' +
      '\n  • `rotate ring counterclockwise`' +
      '\n  • `turn left` (when only one active puzzle hook accepts it)' +
      '\n  • `knock on the steeple` × 3' +
      '\n  • `knock` × 3 (no noun needed if only one knock-puzzle is live)' +
      '\n\nWrong attempts reset the sequence (you have to start the steps over) but they don\'t ' +
      'lock you out — three failures surface a softer hint, five surface a stronger one, and at ' +
      'enough failures (anti-stuck mercy) the engine yields and lets you through. So you can\'t ' +
      'permanently brick a puzzle.' +
      '\n\nForgot how many steps you\'ve completed? Type `investigate the ring` (or whatever the ' +
      'puzzle noun is) and the engine will read out your current attempt state: "2 of 3 steps held. ' +
      '1 wrong attempt so far." Save/load preserves puzzle progress, so coming back later picks ' +
      'up where you left off.' +
      '\n\nThe rest of the world\'s hooks (smoke, footprints, glints, etc.) work the way they ' +
      'always have — investigate the noun and the hook chain advances. Puzzles only gate the ' +
      'specific hooks whose narration asks for a specific action.',
  },
  // 2026-05-25 OTA-031 — skill growth is now a real player-facing
  // system (use-based progression, progressively harder), surfaced
  // on the Character Screen with a 20-segment bar.
  {
    screen: 'character',
    area: 'fullscreen',
    title: 'Stats grow with use',
    body:
      'Every successful action that uses a stat trains it. Failures don\'t count — the system ' +
      'rewards effective use, not flailing. The bar under each stat is your progress to the ' +
      'next +1; tap the stat to see what trains it. ' +
      '\n\nThe ramp gets steeper as stats climb: 1-5 advances fast (~33 uses), 6-10 fast-ish ' +
      '(~50), 11-14 normal (~100), 15-18 slow (~200), 19-22 grindy (~400), 23+ a real commitment ' +
      '(~1000). Master a stat and you\'ve earned it. ' +
      '\n\nSome highlights: STR — landed melee hits with non-finesse weapons, climb tiers, ' +
      'opposed strength contests, 20+ items in your pouch. DEX — finesse-weapon hits, ' +
      'successful parries, climb tiers, jumps, disengaging from combat, stealth checks, ' +
      'stealing. INT — substantive investigates, scrapping, successful skill checks, every ' +
      'Aethercraft cast (shape / summon). WIS — cardinal travel into novel tiles, NPC ' +
      'interactions, hearing a whisper, finishing a quest, the 8-hour rest, mend casts. ' +
      'CHA — NPC trades, accepting / completing storyline chapters, walking with named gear ' +
      'equipped, diplomacy skill checks.',
  },
  {
    screen: 'contracts',
    area: 'fullscreen',
    title: 'Contracts — quests + milestones',
    body:
      'Your active work, all in one place: faction quests (with stages), hunts, mysteries, ' +
      'storylines, collectibles. Tap a contract to expand it. ' +
      '\n\nThe PRIMARY OBJECTIVE card at the top is your main-quest tracker. Tap it to see ' +
      'all 9 Lost Capitals with Guardian status and Core recovery progress per city. ' +
      '\n\nThe MILESTONES row at the bottom has four tap-to-expand cells: ' +
      '\n• Enemies — every unique kill, lifetime ' +
      '\n• Travels — every location discovered ' +
      '\n• Checks — lifetime skill-check successes ' +
      '\n• NPCs Met — vendors, Core Guardians, named contacts you\'ve actually spoken with',
  },
  // OTA 457 — Core Guardians are the main-quest gate at every Capital.
  // Players need to know what to expect before they walk into Asgardar
  // and get a wall of Vaelka narration with no context.
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Core Guardians',
    body:
      'There are 9 Lost Capitals on the map. Each holds a Core — the prize the main quest is ' +
      'built around — but every Core is guarded by a Core Guardian: a one-of-nine boss from the ' +
      'Aether-Born Order, a semi-religious sub-faction that exists only to keep the buried world ' +
      'from being woken. ' +
      '\n\nWhen you trigger the recovery action at a Capital, the Guardian appears in the scene. ' +
      'Two ways to summon them deliberately: tap the ★ SUMMON chip that lights up on the MAIN ' +
      'QUEST row (and inside Contracts) when you reach an unrecovered Capital, OR type `summon ' +
      'guardian` (typos forgiven — `summon the guardian`, `summon core guardian` all work). The ' +
      'old way (take your faction\'s recovery verb — salvage for Reclaimers, attack for Monarchs, ' +
      'etc.) still works as a third path. Pick the moment YOU\'RE ready: full HP, golem standing, ' +
      'dog at heel. ' +
      '\n\nDefeat them to get the Core PLUS a unique signature weapon + signature armor (the Core ' +
      'Guardian Set — 18 unique pieces across the 9 Capitals). ' +
      '\n\nYou can FLEE the fight freely — no further damage — but the Guardian fully heals. ' +
      'They scale with how many Cores you\'ve already taken: tier 1 at your first Capital, tier ' +
      '9 by your last. Plan your loadout before each one.',
  },
  // OTA 457 — Resurrection Gems are the install-wide save-from-death
  // economy. New players need to know they exist + that they have one
  // already.
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Resurrection Gems',
    body:
      'Death isn\'t a hard wipe. Resurrection Gems are stored install-wide — they survive across ' +
      'characters — and one Gem revives a fallen character from the title screen. ' +
      '\n\nYou already have 1 (granted on first install). More land from: ' +
      '\n• Every boss kill — 100% drop ' +
      '\n• Every Core Guardian — 100% drop ' +
      '\n• Every 50 non-boss kills — pity timer, guaranteed ' +
      '\n• A rare 0.5% per non-boss kill — the lucky ones ' +
      '\n\nThe count is shown on the title screen ("✦ N Resurrection Gems held"). Use them ' +
      'when you want to keep playing the same character; let them ride if you want to start fresh ' +
      'with a different faction.',
  },
  {
    screen: 'inventory',
    area: 'fullscreen',
    title: 'Your pack',
    body:
      'This is your pack — already stocked with your starter kit. Tap any item to see its ' +
      'description, stats, equip / unequip / use / drop / scrap buttons. Items are grouped by ' +
      'category (weapons, armor, amulets & rings, consumables, relics, materials, loot). ' +
      'Durability shows next to gear that wears. ' +
      '\n\nThe search bar at the top filters as you type; the sort buttons re-rank by name, ' +
      'rarity, or kind. Same component shows up on the Crafting screen (CRAFT / REPAIR / ' +
      'RECIPES / AETHERIC tabs) — same gestures everywhere. ' +
      '\n\nIf an item is from new content the catalog hasn\'t formally tracked yet, the engine ' +
      'will infer reasonable stats from the name (a blade gets 1d8 slashing, boots get +1 AC ' +
      'to feet, etc.) so you never see a blank record. Inferred items are flagged in the log. ' +
      '\n\nSALVAGE ALL on a scene\'s chip list runs every breakdown narration first, then prints ' +
      'the combined haul as a single block at the end — easier to read what you actually got. ' +
      'Salvage never yields zero materials thanks to a junk-pool fallback, and scrapping or ' +
      'salvaging an equipped item auto-unequips it first.',
  },
  {
    screen: 'vendor',
    area: 'fullscreen',
    title: 'Trading — meet Irma',
    body:
      'Here\'s Irma Ironhand, a Tartarian Giant heavy armorer, dropped in just for the tour. ' +
      'Traders behave like your pack — same layout, same tap-for-details flow, plus a price ' +
      'next to each offer and a "you have N" tag when you already own one. SELL flips to your ' +
      'pack with sell prices alongside. ' +
      '\n\nTour mode disables buy / sell / contract-accept so you can poke around without ' +
      'cheesing the game before play starts. In-game, when a vendor is in the scene, an orange ' +
      'banner appears at the top of the world feed on the world screen with the trader\'s name. ' +
      'Tap that banner to enter the shop. Vendors stay at the tile where they spawned — if you ' +
      'walk away, you\'ll have to walk back to trade with them again. Irma will vanish when this ' +
      'tour ends.',
  },
  {
    screen: 'about',
    area: 'fullscreen',
    title: 'Settings — four tabs',
    body:
      'The ⚙ gear (top-right of the world screen, same spot on the title screen) opens this ' +
      'screen. Four tabs across the top: ' +
      '\n\nSESSION — save & exit, COPY LOG (chunked for long sessions), CLEAR LOG, slot tools. ' +
      '\n\nSFX — music track toggle, volume, per-mood selection, plus read-aloud (TTS) and ' +
      'speak-input (STT). Voice is character-specific: the Arbiter has their own voice ' +
      '(AM_MICHAEL by default), each vendor speaks in their own. BUNDLED downloads ~100 MB ' +
      'of neural voice once; SYSTEM uses Android\'s built-in TTS. Both default OFF. ' +
      '\n\nLORE — the full codex: races, factions, places (tap any Place to plan a travel ' +
      'route straight there), timeline. ' +
      '\n\nABOUT — build info, diagnostics, OTA build ID, plus a CHECK FOR OTA UPDATE button ' +
      'that fails quietly if the network is slow (10-second timeout, no hang). The title ' +
      'screen also carries an EXIT GAME button that saves before quitting.',
  },
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'You\'re set.',
    body:
      'Tartaria is procedural — every move resolves something, even if it\'s just dust. ' +
      'When in doubt: tap "look around you" for full bearings, then search or approach the ' +
      'nouns in the chips. Ask the Arbiter ("ask about X"), "what city is north of me", ' +
      '"closest hub", and rest when you need to. ' +
      '\n\nOpening containers (lockboxes, traps, crates, defenses, sarcophagi, spires, ' +
      'observatories) rolls a small loot drop — type "open the X" or "dismantle the X". ' +
      'Good hunting.',
  },
];
