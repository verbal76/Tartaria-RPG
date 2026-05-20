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
      '\n\nACTIONS opens a full reference of every verb the engine understands. New: tap any ' +
      'card and its first example phrase drops into the input box, ready to finish typing — ' +
      'tap the same card again to cycle through alternate phrasings. ' +
      '\n\nCONTRACTS opens your active hunts, mysteries, storylines, and faction contracts ' +
      '(vendor pitches now point at this screen for the full text instead of reading every ' +
      'line out loud).',
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
      '\n\nIn combat: punch, kick, your equipped weapons, dodge, block, advance / step back, ' +
      'pack (open inventory mid-fight).',
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
  {
    screen: 'exploration',
    area: 'bottom-menu',
    title: 'Save & log',
    body:
      'SAVE & EXIT writes the slot and returns you to the title screen. ' +
      'FULL LOG shows the entire history of this character\'s play session. ' +
      'The ⚙ gear on the right opens Settings (music, voice, diagnostics).',
  },
  {
    screen: 'exploration',
    area: 'bottom-menu',
    title: 'Optional: voice mode',
    body:
      'Tartaria can read out loud and listen for your speech. Open Settings (⚙ gear) → VOICE. ' +
      '\n\nRead aloud (TTS) — the Arbiter and every NPC speak their lines. Voice is character-' +
      'specific now: the Arbiter sounds like AM_MICHAEL (you can change it), and every vendor ' +
      'has their own assigned voice — Irma in af_sarah, Halem in am_adam, Naha in af_river, ' +
      'and so on. They take turns like a real conversation, not all at once. World narration is ' +
      'silent — only character dialogue is voiced. ' +
      '\n\nSpeak input (STT) — a 🎙 mic button appears next to Act. Tap, speak, and the game ' +
      'parses your speech the same way as typing. While the Arbiter is speaking the mic becomes ' +
      'a 🛑 SILENCE button — tap to cut narration short. ' +
      '\n\nBoth default OFF. Engine: BUNDLED downloads ~100 MB of neural voice once + loads ' +
      'one vendor voice on demand (200 MB peak) for the premium quality path; SYSTEM uses ' +
      'Android\'s built-in TTS — lighter, supports every voice simultaneously.',
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
      '\n\nIf an item is from new content the catalog hasn\'t formally tracked yet, the engine ' +
      'will infer reasonable stats from the name (a blade gets 1d8 slashing, boots get +1 AC ' +
      'to feet, etc.) so you never see a blank record. Inferred items are flagged in the log.',
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
      'When in doubt: tap "look around you" for full bearings, then search or approach the ' +
      'nouns in the chips. Ask the Arbiter ("ask about X"), "what city is north of me", ' +
      '"closest hub", and rest when you need to. ' +
      '\n\nOpening containers (lockboxes, traps, crates, defenses, sarcophagi, spires, ' +
      'observatories) rolls a small loot drop — type "open the X" or "dismantle the X". ' +
      'Good hunting.',
  },
];
