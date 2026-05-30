// OTA-066 — first-use nudges for features that don't live on the
// main exploration screen. The sequential tutorial covers the
// exploration view only; everything else introduces itself the
// first time the player touches it. Triggered via
// gameStore.triggerFirstUseNudge(id), rendered by
// FirstUseNudgeOverlay.

export interface FirstUseNudge {
  id: string;
  title: string;
  body: string;
}

export const FIRST_USE_NUDGES: Record<string, FirstUseNudge> = {
  character_sheet_intro: {
    id: 'character_sheet_intro',
    title: 'The Player Sheet',
    body:
      'Every number you see here breaks down into its sources — base race, ' +
      'equipped gear, food buffs, weather modifiers, racial traits, ' +
      'corruption tier. If a stat surprised you in a fight, this is where ' +
      'you find out why. ' +
      '\n\nRACE — your race is a real mechanical layer, not just flavor: ' +
      'barehand damage, conditional AC, always-on stat bumps, and a trait ' +
      'list (Tartarian Giants land 1d6+2 punches; Mud Dwellers get +1 AC ' +
      'underground; Aetherborn pay HP instead of corruption when casting ' +
      'healing; etc). The exact rules for your race are on this sheet. ' +
      '\n\nSTATS GROW — every successful action that uses a stat trains it. ' +
      'Failures don\'t count — the system rewards effective use, not ' +
      'flailing. The bar under each stat is your progress to the next +1. ' +
      'Tap a stat to see what trains it. The ramp gets steeper as stats ' +
      'climb. ' +
      '\n\nRead-only — equip / unequip / use lives on the Inventory screen. ' +
      'This sheet is for understanding what you are right now.',
  },

  inventory_intro: {
    id: 'inventory_intro',
    title: 'Your pack',
    body:
      'Tap any item to see its description, stats, equip / unequip / use / ' +
      'drop / scrap / repair buttons. Items are grouped by category (weapons, ' +
      'armor, amulets & rings, consumables, relics, materials, loot). ' +
      '\n\nDurability shows next to gear that wears. Items outlined in red ' +
      'need repair — tap the item, then Repair, and the modal shows what ' +
      'materials are required (green if you have them, red if not). ' +
      '\n\nSALVAGE ALL on a scene\'s chip list runs every breakdown narration ' +
      'first, then prints the combined haul as a single block — easier to ' +
      'read what you actually got. Salvage never yields zero materials thanks ' +
      'to a junk-pool fallback.',
  },

  vendor_intro: {
    id: 'vendor_intro',
    title: 'Trading',
    body:
      'Traders behave like your pack — same layout, same tap-for-details ' +
      'flow, plus a price next to each offer and a "you have N" tag when ' +
      'you already own one. SELL flips to your pack with sell prices ' +
      'alongside. ' +
      '\n\nVendors stay at the tile where they spawned — if you walk away, ' +
      'you\'ll have to walk back to trade with them again. Roadside traders ' +
      'appear while you walk (~15% per cardinal step outdoors); they have ' +
      'a STEAL button next to BUY with the DC stamped on it — skip the ' +
      'price by risking a fight. ' +
      '\n\nMany vendors also offer faction quests: tap ACCEPT next to a ' +
      'contract to take it on, and TURN IN when you\'ve completed the ' +
      'objective.',
  },

  contracts_intro: {
    id: 'contracts_intro',
    title: 'Contracts',
    body:
      'Your active work, all in one place: faction quests (with stages), ' +
      'hunts, mysteries, storylines, collectibles. Tap a contract to expand ' +
      'it. ' +
      '\n\nThe PRIMARY OBJECTIVE card at the top is your main-quest tracker. ' +
      'Tap it to see all 9 Lost Capitals with Guardian status and Core ' +
      'recovery progress per city. ' +
      '\n\nThe MILESTONES row at the bottom has four tap-to-expand cells: ' +
      '\n• Enemies — every unique kill, lifetime ' +
      '\n• Travels — every location discovered ' +
      '\n• Checks — lifetime skill-check successes ' +
      '\n• NPCs Met — vendors, Core Guardians, named contacts you\'ve ' +
      'actually spoken with',
  },

  actions_intro: {
    id: 'actions_intro',
    title: 'Actions & Recipes',
    body:
      'Two tabs at the top: ACTIONS and RECIPES. ' +
      '\n\nACTIONS — every verb the engine understands, grouped by category ' +
      '(movement, combat, social, skill-based, Aetheric). Tap any card and ' +
      'its first example phrase drops into the input box; tap again to ' +
      'cycle alternate phrasings. Great for "take cover", "set a trap", ' +
      'any verb you forget the wording for. ' +
      '\n\nRECIPES — every craftable item with its ingredient list PLUS the ' +
      'three Aethercraft disciplines: Aetherstone Manipulation, Aether ' +
      'Golem Constructor, Aetheric Healing. Each Aethercraft card shows ' +
      'which Aether fuels it will burn.',
  },

  settings_intro: {
    id: 'settings_intro',
    title: 'Settings',
    body:
      'Five tabs across the top: ' +
      '\n\nSESSION — save & exit, COPY LOG (chunked for long sessions), ' +
      'CLEAR LOG. ' +
      '\n\nSFX — music track toggle, volume, plus read-aloud (TTS) and ' +
      'speak-input (STT). Voice is character-specific: the Arbiter has ' +
      'their own voice, each vendor speaks in their own. BUNDLED downloads ' +
      '~100 MB of neural voice once; SYSTEM uses Android\'s built-in TTS. ' +
      'Both default OFF. ' +
      '\n\nLORE — the full codex: races, factions, places (tap any Place to ' +
      'plan a travel route straight there), timeline. ' +
      '\n\nABOUT — build info, diagnostics, OTA build ID. ' +
      '\n\nNOTICES — open-source license texts for every AI model and ' +
      'native runtime shipped with the game.',
  },

  golem_intro: {
    id: 'golem_intro',
    title: 'Your golem',
    body:
      'You\'ve summoned a golem — a real companion that follows you across ' +
      'cardinal moves and persists until it dies or you dismiss it. ' +
      '\n\nIn combat a GOLEM button (with live HP) appears in the quick row ' +
      '— tap to send it at your current target. Enemy retaliation hits the ' +
      'golem, not you. When it falls it dissolves back into its fuel ' +
      'material. ' +
      '\n\nGolem kinds: Mud (1d8 bludgeoning, 18 HP tank) · Iron (1d6 ' +
      'slashing, 24 HP heavy tank) · Aether (1d10 aetheric, 14 HP striker) ' +
      '· Crystal (1d6 piercing, +2 hit, 12 HP precision). ' +
      '\n\nType `dismiss golem` to release it any time. One golem at a time.',
  },

  core_guardians_intro: {
    id: 'core_guardians_intro',
    title: 'Core Guardians',
    body:
      'You\'ve reached one of the 9 Lost Capitals. Each one holds a Core — ' +
      'the prize the main quest is built around — but every Core is guarded ' +
      'by a Core Guardian: a one-of-nine boss from the Aether-Born Order, ' +
      'a semi-religious sub-faction that exists only to keep the buried ' +
      'world from being woken. ' +
      '\n\nWhen you trigger the recovery action at a Capital, the Guardian ' +
      'appears in the scene. Defeat them to get the Core PLUS a unique ' +
      'signature weapon + signature armor (the Core Guardian Set — 18 ' +
      'unique pieces across the 9 Capitals). ' +
      '\n\nYou can FLEE the fight freely — no further damage — but the ' +
      'Guardian fully heals. They scale with how many Cores you\'ve already ' +
      'taken: tier 1 at your first Capital, tier 9 by your last. Plan your ' +
      'loadout before each one.',
  },

  resurrection_gems_intro: {
    id: 'resurrection_gems_intro',
    title: 'Resurrection Gems',
    body:
      'Death isn\'t a hard wipe. Resurrection Gems are stored install-wide ' +
      '— they survive across characters — and one Gem revives a fallen ' +
      'character from the title screen. ' +
      '\n\nYou already have 1 (granted on first install). More land from: ' +
      '\n• Every boss kill — 100% drop ' +
      '\n• Every Core Guardian — 100% drop ' +
      '\n• Every 50 non-boss kills — pity timer, guaranteed ' +
      '\n• A rare 0.5% per non-boss kill — the lucky ones ' +
      '\n\nThe count shows on the title screen ("✦ N Resurrection Gems ' +
      'held"). Use them when you want to keep playing the same character; ' +
      'let them ride if you want to start fresh with a different faction.',
  },
};
