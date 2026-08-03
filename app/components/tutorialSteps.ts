// Tutorial step definitions. Tungsten Spire APK rewrite: replaces the
// 3-step welcome-overlay tutorial (OTA-229) with a diegetic in-feed
// sequence where the Arbiter narrates from the world log and a TAKE /
// INPUT / etc. button pulses to guide the player. The player meets the
// Arbiter inside their faction's outpost, gives a name in-game, learns
// the verbs by handling concrete props (cudgel, rope, chest plate,
// locked door, note), then plots a course to a Capital.
//
// Each step carries:
//   - id        — string the gameStore matches on for advancement
//   - area      — which screen region pulses (TutorialTarget)
//   - pulse     — true to animate the highlight (off = static glow)
//   - inputPulse — true to pulse the text input + run a pre-typed draft
//   - draftText — text seeded into the input box for typed-input demos
//   - arbiter   — line the Arbiter speaks when the step opens
//   - screen    — for legacy compatibility; defaults to 'exploration'
//
// TUTORIAL_DOCS_FULL stays in place as read-only copy for the future
// Settings → Tutorial Replay panel — a trimmed screen-orientation
// reference (stats, panels, scene bar, feed, travel, quick actions,
// typed input, Core Guardians, Resurrection Gems). It is intentionally
// NOT a full systems manual: the old per-system pages (crafting, golems,
// dogs, trading, contracts, inventory) were dropped in the Tungsten Spire
// rewrite — those systems teach themselves at their trigger sites via
// FirstTimeHint. This is just a doc, not the play loop.

import type { ScreenName } from '../engine/types';

export type HighlightArea =
  // World screen regions (the main exploration view — the player's
  // whole world lives on this one screen, per the project's framing).
  | 'top-left-stats'
  | 'top-right-enemy'
  | 'scene-bar'
  // The "MAIN QUEST · …" objective chip directly below the scene bar (the
  // entry to Contracts / Capital selection). Distinct from 'scene-bar',
  // which is the area/weather/time strip ABOVE it.
  | 'objective-chip'
  | 'feed'
  | 'travel-row'
  | 'quick-row'
  | 'input-row'
  // Full-screen — no highlight, just a centered info card.
  | 'fullscreen';

export interface TutorialStep {
  /** Stable identifier used by the state machine to match actions to
   *  the current beat. Compared via tutorialStep index → STEP.id. */
  id?: string;
  /** Which screen this step takes place on. The overlay dispatches setScreen
   *  on entry if it doesn't match. Defaults to 'exploration' for in-world
   *  tutorial beats. */
  screen: ScreenName;
  area: HighlightArea;
  /** Card title for the legacy overlay layout. Tungsten Spire renders
   *  in-feed and uses arbiter instead — title stays for the Tutorial
   *  Replay panel's prose. */
  title: string;
  /** Long-form body for legacy / replay use. */
  body: string;
  /** True for the first step — historically the welcome screen. Kept
   *  optional for the new in-feed sequence (none of which are welcome
   *  cards). */
  welcome?: boolean;
  /** When true, TutorialTarget animates the glow on the area. */
  pulse?: boolean;
  /** When true, the input row pulses + the placeholder switches to
   *  prompt mode. Paired with draftText to demo typed input. */
  inputPulse?: boolean;
  /** Text to seed into the InputBox via pendingInputDraft. Triggers on
   *  step entry; the player can edit or submit as-is. */
  draftText?: string;
  /** Line the Arbiter speaks when this step opens. Routed through
   *  appendLog('arbiter', ...). Falls back to body if not set. */
  arbiter?: string;
  /** Short imperative the Arbiter restates when the tutorial lockdown
   *  refuses an off-script command. The refusal used to say only "do what
   *  I've asked of you" — unusable once the instruction has scrolled off
   *  the feed, because it tells the player they are wrong without telling
   *  them what right looks like. Lowercase, no trailing period: it is
   *  interpolated mid-sentence. */
  remind?: string;
}

/** OTA-1040 — verbs the tutorial lockdown always lets through while an
 *  enemy is live. Self-defence, disengagement, and consumables: everything
 *  a cornered player needs. Deliberately NOT world verbs (travel, craft,
 *  fuse, rest) — the lockdown still holds for those, so the tutorial can't
 *  be walked out of sideways. */
export const TUTORIAL_SELF_DEFENCE =
  /\b(attack|strike|hit|swing|shoot|fire|stab|slash|punch|kick|throw|flee|run|escape|retreat|dodge|block|sneak|hide|use|drink|eat|equip|wield|talk|parley)\b/i;

// Tungsten Spire — the new 10-beat in-feed sequence. Each beat is
// driven by a specific player action; the state machine in gameStore
// advances when the action matches.
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'name',
    remind: 'type your name, then tap ACT',
    screen: 'exploration',
    area: 'input-row',
    inputPulse: true,
    title: 'Your Name',
    body: 'Speak your name. Type it below, then tap ACT — or hit Enter on the keyboard.',
    arbiter:
      'The Arbiter looks up. "Your name, traveler. Type it, then tap ACT."',
  },
  {
    // The orientation tool — taught FIRST, before the player picks anything up,
    // because it's the "where am I / re-read the room" button. Tapping LOOK
    // AROUND YOU calls maybeAdvanceTutorial('look') and InputBox lights this
    // chip green for currentBeatId === 'look', so it advances to the cudgel beat.
    // Looking around at the very start also surfaces the props (cudgel, rope,
    // plate, locked door) the next beats walk the player through.
    id: 'look',
    screen: 'exploration',
    area: 'quick-row',
    pulse: true,
    title: 'Look Around',
    body: 'Start here. Tap LOOK AROUND YOU to get your bearings — it re-reads the room: what\'s here, your exits, and any open leads you\'re chasing. Use it any time you lose the thread.',
    arbiter:
      '"First, get your bearings. Tap LOOK AROUND YOU — I\'ll read the room for you: what\'s here, your way out, and whatever you\'re still chasing. Use it any time you\'re lost."',
  },
  {
    id: 'cudgel',
    remind: 'take the cudgel at your feet',
    screen: 'exploration',
    area: 'quick-row',
    pulse: true,
    title: 'Take the Cudgel',
    body: 'Tap TAKE in the quick-action row to pick up the cudgel at your feet.',
    arbiter:
      '"A cudgel, by your boots. Tap TAKE. You\'ll want a weapon."',
  },
  {
    id: 'rope',
    remind: 'type take rope, then tap ACT',
    screen: 'exploration',
    area: 'input-row',
    inputPulse: true,
    title: 'Take the Rope',
    body: 'Tartaria takes typed input too. Type take rope into the input below yourself, then tap ACT.',
    arbiter:
      '"Now the rope, on the shelf. This time, type it yourself — take rope — then tap ACT. Most of Tartaria answers to plain words like that."',
  },
  {
    id: 'scrap',
    remind: 'salvage the broken chest plate',
    screen: 'exploration',
    area: 'quick-row',
    pulse: true,
    title: 'Salvage the Broken Plate',
    body: 'That broken chest plate has nothing left in it. Tap SALVAGE to break it down for parts.',
    arbiter:
      '"That broken plate is worth more in pieces. Tap SALVAGE."',
  },
  {
    id: 'climb',
    remind: 'finish the climb — climb again to go higher, or climb down to come back',
    screen: 'exploration',
    area: 'quick-row',
    pulse: true,
    title: 'Climb',
    body: 'There\'s something here worth getting on top of. Tap CLIMB and pick what to scale — your rope makes it possible.',
    arbiter:
      '"Now the rope earns its keep. Tap CLIMB. You go up in stages, each pull burns stamina, and empty means a fall. Top out, then climb back down."',
  },
  {
    id: 'investigate',
    remind: 'investigate the north door',
    screen: 'exploration',
    area: 'quick-row',
    pulse: true,
    title: 'Investigate the Door',
    body: 'The door north is locked. Tap INVESTIGATE to look it over.',
    arbiter:
      '"The north door is locked. Tap INVESTIGATE."',
  },
  {
    // Door-open branch. Replaces the old look → move_north → read_note
    // beats: when the door opens the player chooses, via a popup, to keep
    // poking around the outpost or to head out and begin the journey.
    // 'fullscreen' area = no region glow (the popup carries the moment, and
    // nothing should pulse while the player free-roams after choosing
    // EXPLORE). Both choices converge on the main_quest beat — picking
    // LEAVE (or later typing 'leave outpost') advances; see
    // finishOutpostTutorial in gameStore.
    id: 'explore_or_leave',
    remind: 'pick this place over, or type leave outpost to set out',
    screen: 'exploration',
    area: 'fullscreen',
    title: 'The Door Is Open',
    body: 'The outpost door stands open. Explore what remains, or head out and begin your journey.',
    arbiter:
      '"The way\'s open. Pick this place over, or step out and begin. Your call."',
  },
  {
    id: 'main_quest',
    screen: 'exploration',
    area: 'objective-chip',
    pulse: true,
    title: 'Your Main Quest',
    body: 'The road leads to the Aetheric Cores the Guardians protect. Tap the MAIN QUEST objective chip to open your contracts.',
    arbiter:
      '"Nine Cores, nine Guardians, nine Lost Capitals. That\'s the road. Tap MAIN QUEST to start."',
  },
  {
    id: 'pick_city',
    screen: 'contracts',
    area: 'fullscreen',
    title: 'Choose a Capital',
    body: 'Tap the primary objective box at the top to open the list of nine Capitals, then choose one. Any works — distance varies, but the Aether marks the road.',
    arbiter:
      '"Tap the objective box up top. Pick a Capital; the Aether marks the road."',
  },
];

// Preserved long-form tutorial — Settings → Tutorial Replay surfaces
// this verbatim as scrollable copy. Don't add new steps here; new
// systems get a FirstTimeHint at the trigger site.
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
      '\n• ABOUT — build info, diagnostics, build identifier.',
  },
  {
    screen: 'exploration',
    area: 'scene-bar',
    title: 'Scene bar',
    body:
      'Where you are right now: location · weather · hazard. The line below shows in-game time ' +
      '(Day N · morning / afternoon / evening / night). ' +
      '\n\nACTIONS on the right opens a full reference of every verb the engine understands.' +
      '\n\nThe MAIN QUEST chip just below the scene bar shows the next concrete step in your ' +
      'core arc and doubles as the entry to the full Contracts screen.',
  },
  {
    screen: 'exploration',
    area: 'feed',
    title: 'The world feed',
    body:
      'Every event lands here as a colored line: world description, your actions, combat rolls, ' +
      'Arbiter remarks, rewards, system hints. Scroll to look back at anything you missed.',
  },
  {
    screen: 'exploration',
    area: 'travel-row',
    title: 'Travel — cardinal and waypoint',
    body:
      'NORTH / SOUTH / EAST / WEST — one tap = one step in that direction on the world map. ' +
      'Inside a building (outpost, hub, structure) the same row shows room-name chips for the ' +
      'rooms attached to the one you\'re in, plus an OUT chip to leave.' +
      '\n\nFor long hauls: type "travel to <city>" OR tap MAP and pick a row from the TRAVEL TO ' +
      'panel below the atlas.',
  },
  {
    screen: 'exploration',
    area: 'quick-row',
    title: 'Quick actions',
    body:
      'Tappable shortcuts for the most common actions. In peace: "look around you", rest, ' +
      'investigate, approach, take, salvage, climb, craft, inventory, ask arbiter.' +
      '\n\nIn combat the row splits into 3 lines: weapons + bare-hand, dodge / flee / companions, ' +
      'and approach / step-back / inventory.',
  },
  {
    screen: 'exploration',
    area: 'input-row',
    title: 'Type anything',
    body:
      'You don\'t have to use the buttons. Type any action — "search the rubble", ' +
      '"talk to the smith", "throw a rock". The parser handles common verbs immediately; ' +
      'novel phrasings flow through the cognitive layer.',
  },
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Core Guardians',
    body:
      'There are 9 Lost Capitals on the map. Each holds a Core — the prize the main quest is ' +
      'built around — but every Core is guarded by a Core Guardian: a one-of-nine boss from the ' +
      'Aether-Born Order, a semi-religious sub-faction that exists only to keep the buried world ' +
      'from being woken.' +
      '\n\nDefeat them to get the Core PLUS a unique signature weapon + signature armor (the ' +
      'Core Guardian Set — 18 unique pieces across the 9 Capitals).',
  },
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Resurrection Gems',
    body:
      'Death isn\'t a hard wipe. Resurrection Gems are stored install-wide — they survive across ' +
      'characters — and one Gem revives a fallen character from the title screen.' +
      '\n\nYou already have 1 (granted on first install). Boss kills and Core Guardian kills ' +
      'each grant one, plus a pity timer every 50 non-boss kills and a 0.5% drop per non-boss.',
  },
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'You\'re set.',
    body:
      'Tartaria is procedural — every move resolves something, even if it\'s just dust. ' +
      'When in doubt: tap "look around you" for full bearings, then search or approach the ' +
      'nouns in the chips. Ask the Arbiter ("ask about X"), "what city is north of me", ' +
      '"closest hub", and rest when you need to. Good hunting.',
  },
];
