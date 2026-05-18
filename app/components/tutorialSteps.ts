// Tutorial step definitions. Each step describes ONE moment of the
// walkthrough: which screen to be on, which area of that screen the
// overlay should highlight, and the explanatory text shown in the
// info card. Steps run in order; "skip" exits at any time.

import type { ScreenName } from '../engine/types';

export type HighlightArea =
  // Exploration screen regions (percentages of the viewport).
  | 'top-left-stats'
  | 'top-right-enemy'
  | 'scene-bar'
  | 'feed'
  | 'quick-row'
  | 'input-row'
  | 'bottom-menu'
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
    screen: 'exploration',
    area: 'top-right-enemy',
    title: 'Enemy panel / Crest',
    body:
      'Out of combat this shows the Tartaria crest. In combat the panel becomes one card per enemy ' +
      '(swipe or tap to cycle targets) with their HP, AC, attack bonus, damage dice, and whether ' +
      'they\'re in range of your equipped weapon.',
  },
  {
    screen: 'exploration',
    area: 'scene-bar',
    title: 'Scene bar',
    body:
      'Where you are right now: location · weather · hazard. The line below shows in-game time ' +
      '(Day N · morning / afternoon / evening / night). ' +
      'The ACTIONS chip on the right opens a full reference of every verb the parser knows — what ' +
      'each action does and exactly what to type. QUESTS opens your active hunts, mysteries, ' +
      'storylines, and faction contracts.',
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
    area: 'quick-row',
    title: 'Quick actions',
    body:
      'Tappable shortcuts for the most common actions. In peace: look, rest, search, craft, ' +
      'inventory. (Searching the mud / silt / ground digs — your best tool decides what comes up.) ' +
      'In combat: punch, kick, your equipped weapons, dodge, block, advance / step back, ' +
      'pack (open inventory mid-fight).',
  },
  {
    screen: 'exploration',
    area: 'input-row',
    title: 'Type anything',
    body:
      'You don\'t have to use the buttons. Type any action — "search the rubble", "talk to the smith", ' +
      '"throw a rock". The Arbiter parses your intent and resolves it. Misspellings and ' +
      'paraphrased item names are handled by the cognitive layer.',
  },
  {
    screen: 'exploration',
    area: 'bottom-menu',
    title: 'Save & log',
    body:
      'SAVE & EXIT writes the slot and returns you to the title screen. ' +
      'FULL LOG shows the entire history of this character\'s play session. ' +
      'The ⚙ gear on the right opens settings (music, OTA update, diagnostics).',
  },
  {
    screen: 'inventory',
    area: 'fullscreen',
    title: 'Your pack',
    body:
      'This is your pack — already stocked with your starter kit. Tap any item to see its ' +
      'description, stats, and equip / unequip buttons. Items are grouped by category ' +
      '(weapons, armor, amulets & rings, consumables, relics, materials, loot). Durability ' +
      'is shown next to gear that wears.',
  },
  {
    screen: 'vendor',
    area: 'fullscreen',
    title: 'Trading',
    body:
      'Traders behave like your pack — same layout, same tap-for-details flow, plus a price ' +
      'next to each offer and a "you have N" tag when you already own one. ' +
      '\n\nHow you get here: when a vendor is in the scene, an orange banner appears at the ' +
      'top of the world text feed showing the trader\'s name. Tap that banner to enter the shop.',
  },
  {
    screen: 'exploration',
    area: 'fullscreen',
    title: 'You\'re set.',
    body:
      'Tartaria is procedural — every move resolves something, even if it\'s just dust. ' +
      'When in doubt: search the area around you, ask the Arbiter ("ask about X"), and rest ' +
      'when you need to. Good hunting.',
  },
];
