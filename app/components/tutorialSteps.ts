// Tutorial step definitions. Each step describes ONE moment of the
// walkthrough: which screen to be on, which area of that screen the
// overlay should highlight, and the explanatory text shown in the
// info card. Steps run in order; "skip" exits at any time.
//
// Scope rule (OTA-066): the sequential tour ONLY covers regions of
// the main exploration screen (welcome / on-screen-region tour /
// closing). Anything that lives on a different screen (character
// sheet, actions, contracts, inventory, vendor, settings) or that
// introduces a deep mechanic (race, golems, stats growth, core
// guardians, resurrection gems) is now a separate one-time popup
// fired when the player first touches the feature — see
// app/data/firstUseNudges.ts and FirstUseNudgeOverlay.

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

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'Welcome to Tartaria',
    body:
      'Your character is set. Before you dive in — would you like a quick tour of the main screen? ' +
      'About a minute; you can skip any time. Other screens (pack, contracts, vendors, settings) ' +
      'will introduce themselves the first time you open them.',
    welcome: true,
  },
  {
    screen: 'exploration',
    area: 'top-left-stats',
    title: 'Your stats',
    body:
      'HP, stamina, AC, currency (TC), corruption, and your five stats. ' +
      'Equipped gear is listed underneath, along with any active contracts. ' +
      'Stat bonuses from rings, amulets, and armor show as "(+N)" next to the base value. ' +
      '\n\nTap this panel any time to open your full Player Sheet — every number breaks down ' +
      'into its sources there.',
  },
  {
    screen: 'exploration',
    area: 'top-right-enemy',
    title: 'Enemy panel / Crest',
    body:
      'Out of combat this shows the Tartaria crest. In combat the panel becomes one card per enemy ' +
      '(swipe or tap to cycle targets) with their HP, AC, attack bonus, damage dice, and whether ' +
      'they\'re in range of your equipped weapon. ' +
      '\n\nThe ⚙ gear in the top-right corner is your settings/lore/session hub.',
  },
  {
    screen: 'exploration',
    area: 'scene-bar',
    title: 'Scene bar',
    body:
      'Where you are right now: location · weather · hazard. The line below shows in-game time ' +
      '(Day N · morning / afternoon / evening / night) — and day-period shapes stealth, encounter ' +
      'rate, and rest ambush rolls. ' +
      '\n\nACTIONS on the right opens the full verb reference. The MAIN QUEST chip below the scene ' +
      'bar shows your current core-arc step and doubles as the entry to the Contracts screen.',
  },
  {
    screen: 'exploration',
    area: 'feed',
    title: 'The world feed',
    body:
      'Every event lands here as a colored line: world description, your actions, combat rolls, ' +
      'Arbiter remarks, rewards, system hints. Scroll to look back at anything you missed. ' +
      '\n\nLong travel rolls wasteland encounters every few cardinal moves: caravans, drifters, ' +
      'fungal patches, salvageable wrecks. Watch the feed.',
  },
  {
    screen: 'exploration',
    area: 'travel-row',
    title: 'Travel',
    body:
      'NORTH / SOUTH / EAST / WEST — one tap = one step in that direction. The row hides during ' +
      'combat. MAP on the right opens the world layout. ' +
      '\n\nFor long hauls, type "travel to <city>" (or tap a Place in the Lore tab) and the row ' +
      'flips to → <CITY> [N moves left] / STOP TRAVEL. Each → tap takes one cardinal step.',
  },
  {
    screen: 'exploration',
    area: 'quick-row',
    title: 'Quick actions',
    body:
      'Tappable shortcuts for the most common actions. In peace: look-around, rest, search, ' +
      'approach, craft, inventory, climb. In combat: punch, kick, your equipped weapons, ' +
      'dodge, block, advance / step back. ' +
      '\n\nTAKE / SALVAGE / CLIMB / INVESTIGATE glow green when their modal has something ' +
      'actionable in this scene and grey when there\'s nothing left to do.',
  },
  {
    screen: 'exploration',
    area: 'input-row',
    title: 'Type anything',
    body:
      'You don\'t have to use the buttons. Type any action — "search the rubble", "talk to the ' +
      'smith", "throw a rock", "take the trap apart and keep the materials". The fast parser ' +
      'handles common verbs in milliseconds; novel phrasings flow to Qwen on-device, which ' +
      'figures out what you meant. Misspellings and paraphrased item names are handled.',
  },
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'You\'re set.',
    body:
      'Tartaria is procedural — every move resolves something, even if it\'s just dust. ' +
      'When in doubt: tap "look around you" for full bearings, then search or approach the ' +
      'nouns in the chips. Ask the Arbiter ("ask about X"), and rest when you need to. ' +
      '\n\nOther screens will introduce themselves the first time you open them — pack, ' +
      'contracts, vendors, the Player Sheet, settings. Good hunting.',
  },
];
