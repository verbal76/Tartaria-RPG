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
  | 'travel-row'
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
      '\n\nACTIONS opens a full reference of every verb the engine understands — we\'ll visit ' +
      'it in a moment. QUESTS opens your active hunts, mysteries, storylines, and faction ' +
      'contracts; we\'ll see that one too.',
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
    area: 'travel-row',
    title: 'Cardinal travel',
    body:
      'NORTH / SOUTH / EAST / WEST — one tap = one step in that direction on the world map. ' +
      'These hide during combat (you can\'t walk away from a fight that\'s already on you). ' +
      '\n\nEvery few cardinal moves can trigger a wasteland encounter — caravans, drifters, ' +
      'fungal patches, derelict buses, faction patrols. Cardinal travel is also how you reach ' +
      'cities and hubs; ask the Arbiter "what\'s north of me" any time.',
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
      'The ⚙ gear on the right opens Settings — we\'ll see that screen in a moment.',
  },
  {
    screen: 'actions',
    area: 'fullscreen',
    title: 'Action reference',
    body:
      'This is the full list of every verb the engine understands, grouped by category — ' +
      'movement, combat, social, crafting, world. ' +
      '\n\nTap any card and its first example phrase drops straight into the input box, ' +
      'ready for you to finish typing. Tap the same card again to cycle through alternate ' +
      'phrasings. Great when you forget the exact wording for "take cover" or "set a trap".',
  },
  {
    screen: 'contracts',
    area: 'fullscreen',
    title: 'Quests & contracts',
    body:
      'Your active work, all in one place: faction quests (with stages and rewards), hunts, ' +
      'mysteries, and storylines. The board shows objective, progress, and the vendor / NPC ' +
      'to turn each one in to. ' +
      '\n\nVendor pitches now point at this screen for the full text instead of reading ' +
      'every contract aloud. Tap a contract to expand it.',
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
    title: 'Trading — meet Irma',
    body:
      'Here\'s Irma Ironhand, a Tartarian Giant heavy armorer, dropped in just for the tour. ' +
      'Traders behave like your pack — same layout, same tap-for-details flow, plus a price ' +
      'next to each offer and a "you have N" tag when you already own one. SELL flips to your ' +
      'pack with sell prices alongside. ' +
      '\n\nIn-game: when a vendor is in the scene, an orange banner appears at the top of the ' +
      'world feed with the trader\'s name. Tap that banner to enter the shop. Irma will vanish ' +
      'when this tour ends.',
  },
  {
    screen: 'about',
    area: 'fullscreen',
    title: 'Settings — three tabs',
    body:
      'The ⚙ gear opens this screen. Three tabs across the top: ' +
      '\n\nMUSIC — track toggle, volume, per-mood selection. ' +
      '\n\nVOICE — read-aloud (TTS) and speak-input (STT). Voice is character-specific: the ' +
      'Arbiter has their own voice (AM_MICHAEL by default), and each vendor — Irma, Halem, ' +
      'Naha — speaks in their own. Engine choice: BUNDLED downloads ~100 MB of neural voice ' +
      'once for premium quality; SYSTEM uses Android\'s built-in TTS, lighter. Both default OFF. ' +
      '\n\nABOUT — build info, diagnostics, OTA build ID, full COPY ALL for bug reports.',
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
