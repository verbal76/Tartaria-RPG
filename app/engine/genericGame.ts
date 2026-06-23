// engine_Dev — THE GENERIC GAME. A complete, deliberately bland "mad-libs" game that
// the engine falls back to when a section has no author override (skipped or RESET).
// Installed once at boot via installGenericDefaults(GENERIC_GAME); until then the
// fallback stays the built-in Tartaria data (so unit tests are unaffected).
//
// Everything cross-references REAL ids (factions ↔ locations ↔ quests ↔ bosses ↔
// starting areas) so it actually plays end-to-end — just boringly. No setting: "the
// Reaches", a generic power called "magic", three plain factions, two plain races, a
// small map, a short fetch-the-relic main quest, and a boss in a ruined keep.

import { GENERIC_TABLE_ROWS, GENERIC_MISSIONS } from './genericTemplateData';
import { genericFlavorPools } from './narrativeGenerator';

// Reuse the generic mission scaffolds as DEFAULT content by swapping their REPLACE
// id placeholders for the real ids defined below. (Free-text fields never contain
// these tokens, so this only rewrites the id references.)
function realIds<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj)
      .replace(/REPLACE-with-a-faction-id-2/g, 'seekers')
      .replace(/REPLACE-with-a-faction-id/g, 'wardens')
      .replace(/REPLACE-with-a-race-id-2/g, 'lowfolk')
      .replace(/REPLACE-with-a-race-id/g, 'tallfolk')
      .replace(/REPLACE-with-a-location-id-2/g, 'seeker_camp')
      .replace(/REPLACE-with-a-location-id/g, 'crossroads'),
  ) as T;
}

// ── world skeleton (real ids everything else points at) ──────────────────────────
const FACTIONS = [
  { id: 'wardens', name: 'The Wardens', subtitle: 'Keepers of the Old Roads', alignment: 'Order / Protective', goal: 'Hold the roads and ruins against what wanders them.', philosophy: 'Someone has to keep the lamps lit. It may as well be us.', structure: 'A standing order of road-keepers and ruin-wardens.', rivals: ['seekers'], allies: ['freeholders'], joinRequirements: 'A clean record and a strong back.', tags: ['order', 'martial'], startingStanding: 0, flavor: 'You hold the line so others can sleep. It is thankless, and you do it anyway.', baseName: 'Warden Hold', baseLocationId: 'warden_hold' },
  { id: 'seekers', name: 'The Seekers', subtitle: 'Finders of the Lost', alignment: 'Idealist / Curious', goal: 'Recover what the old world left buried.', philosophy: 'Knowledge was meant to be lit, not buried.', structure: 'Loose circles of scholars and diggers.', rivals: ['wardens'], allies: ['freeholders'], joinRequirements: 'Curiosity and a willingness to walk a long way.', tags: ['scholarly', 'exploratory'], startingStanding: 0, flavor: 'You dig because the world above is dying of forgetting, and the cure is in the ground.', baseName: 'Seeker Camp', baseLocationId: 'seeker_camp' },
  { id: 'freeholders', name: 'The Freeholders', subtitle: 'The Unaligned', alignment: 'Independent', goal: 'Keep the crossroads open and trading.', philosophy: 'Take no side; take a fair cut.', structure: 'Traders, guides, and whoever keeps the gate.', rivals: [], allies: ['wardens', 'seekers'], joinRequirements: 'Coin, or a useful skill.', tags: ['neutral', 'market'], startingStanding: 0, flavor: 'You owe nothing to anyone but the road, and the road always collects.', baseName: 'The Crossroads', baseLocationId: 'crossroads' },
];

const RACES = [
  { id: 'tallfolk', name: 'Tall Folk', baseAC: 12, racialACBonus: '+2 AC due to size and reach; -4 in confined spaces', racialACBonusRules: [{ condition: 'confined', delta: -4 }], racialStatBonuses: { strength: 2 }, startingTCFormula: '4d6 x 10', startingHPBonus: 15, barehandDamage: '1d6 +2', tags: ['large', 'strength'], traits: ['Towering Strength: +2 Strength.', 'Long Reach: +1 to hit in the open.'], description: 'Broad, long-limbed folk — the strongest hand-to-hand fighters.', flavor: 'You stand a head taller than any doorway. Whatever you take, you do not bow to take it.', abilities: [{ id: 'brace', name: 'Brace', description: 'Once a day, shrug off a blow (+4 AC for a turn).', combatOnly: true, effect: { type: 'shield', amount: 4, rounds: 1 } }] },
  { id: 'lowfolk', name: 'Low Folk', baseAC: 10, racialACBonus: '+1 AC in underground or broken ground', racialACBonusRules: [{ condition: 'underground', delta: 1 }], racialStatBonuses: { dexterity: 1 }, startingTCFormula: '3d6 x 10', startingHPBonus: 8, barehandDamage: '1d4', tags: ['small', 'dexterity'], traits: ['Sure-Footed: +1 Dexterity in tight or broken ground.'], description: 'Quick, wiry folk at home in close quarters and low light.', flavor: 'Low ceilings never bothered you. You go where the big ones cannot follow.', abilities: [{ id: 'patch', name: 'Patch Up', description: 'Once a day, bind your wounds (heal 2d6).', effect: { type: 'heal', dice: '2d6' } }] },
];

// Small map (x/y on a 21x21 grid). crossroads is the safe hub at the center.
const LOCATIONS = [
  { id: 'crossroads', name: 'The Crossroads', type: 'settlement', description: 'A waystation where the roads meet — traders, rumors, and a place to resupply.', danger: 1, tags: ['settlement', 'safe', 'market'], discoverable: true, aliases: ['crossroads', 'town', 'the gate'], interactables: ['well', 'notice board', 'stall', 'gate', 'lantern'], x: 10, y: 10 },
  { id: 'warden_hold', name: 'Warden Hold', type: 'settlement', description: 'A squat stone keep the Wardens hold against the dark. Drilled, watchful, plain.', danger: 1, tags: ['settlement', 'safe', 'faction'], discoverable: true, aliases: ['hold', 'the hold'], interactables: ['gate', 'armory door', 'watch fire', 'duty roster'], x: 7, y: 8 },
  { id: 'seeker_camp', name: 'Seeker Camp', type: 'settlement', description: 'A camp of tents and dig-pits where the Seekers sort what they pull from the ground.', danger: 1, tags: ['settlement', 'safe', 'faction'], discoverable: true, aliases: ['camp', 'the camp'], interactables: ['dig pit', 'sorting table', 'lantern', 'crate'], x: 13, y: 8 },
  { id: 'old_plains', name: 'The Old Plains', type: 'region', description: 'A wide open expanse of broken ground, old markers, and long sightlines.', danger: 3, tags: ['region', 'open'], discoverable: true, aliases: ['plains', 'the plains'], interactables: ['marker', 'pillar', 'crater', 'mud'], x: 10, y: 14 },
  { id: 'dark_wood', name: 'The Dark Wood', type: 'forest', description: 'A close, lightless wood where the paths fold back on themselves.', danger: 3, tags: ['forest', 'dark'], discoverable: true, aliases: ['wood', 'the wood', 'forest'], interactables: ['root', 'hollow', 'cairn', 'briar'], x: 6, y: 13 },
  { id: 'still_lake', name: 'The Still Lake', type: 'water', description: 'A black, motionless lake. Things have sunk here that did not want to.', danger: 2, tags: ['water', 'wreck'], discoverable: true, aliases: ['lake', 'the lake'], interactables: ['shore', 'wreck', 'reed', 'jetty'], x: 14, y: 13 },
  { id: 'ruined_keep', name: 'The Ruined Keep', type: 'ruin', description: 'A toppled keep on the far ridge. Something still keeps its gate.', danger: 4, tags: ['ruin', 'hostile', 'dungeon'], discoverable: true, aliases: ['keep', 'the keep', 'ruin'], interactables: ['broken gate', 'rubble', 'stair', 'banner'], x: 10, y: 17 },
];

const ENEMIES = [
  ...GENERIC_TABLE_ROWS.enemies, // Wild Boar, Road Bandit
  { name: 'Wood Lurker', type: 'Beast', abilityPoint: 'Dexterity 4', attack: 'Ambush Bite', damage: '2d6', hp: 26, rarity: 'Uncommon', loot: ['Tough Fiber', 'Raw Crystal'], aliases: ['lurker', 'the lurker'], traits: ['ambush_strike', 'resist:frost'] },
  { name: 'Bog Thing', type: 'Beast', abilityPoint: 'Strength 5', attack: 'Drowning Grip', damage: '2d8', hp: 34, rarity: 'Uncommon', loot: ['Common Residue'], aliases: ['thing', 'the bog thing'], traits: ['vulnerable:burn'] },
  { name: 'Grave Wight', type: 'Undead', abilityPoint: 'Wisdom 5', attack: 'Cold Touch', damage: '2d6 frost', hp: 30, rarity: 'Rare', loot: ['Worked Crystal'], aliases: ['wight', 'the wight'], traits: ['resist:frost', 'vulnerable:burn'] },
  { name: 'Stone Sentinel', type: 'Construct', abilityPoint: 'Strength 6', attack: 'Slam', damage: '3d6', hp: 48, rarity: 'Rare', loot: ['Scrap Metal', 'Worked Crystal'], aliases: ['sentinel', 'the sentinel'], traits: ['resist:piercing', 'vulnerable:bludgeoning'] },
];

const BOSSES = [
  { id: 'keep_warden', name: 'The Keep Warden', factionId: null, hp: 90, attack: 6, damage: '2d8+2', ac: 15, abilityPoint: 6, questItem: 'The Old Key', drops: ['Worked Crystal', 'Banded Cuirass'], spawnLocationId: 'ruined_keep', spawnCondition: 'main_quest' },
];

const MAIN_QUEST = {
  title: 'The Old Key',
  steps: [
    { id: 'step_1', action: 'reach', locationId: 'old_plains' },
    { id: 'step_2', action: 'collect', target: 'a worn map', locationId: 'dark_wood' },
    { id: 'step_3', action: 'kill', target: 'the keep warden', bossId: 'keep_warden', locationId: 'ruined_keep', reward: 'The Old Key' },
    { id: 'step_4', action: 'return_to', locationId: 'crossroads' },
    { id: 'step_5', action: 'claim', locationId: 'crossroads' },
  ],
};

const FACTION_QUESTS = [
  { id: 'wardens_scrap', factionId: 'wardens', title: 'Forge Stock', description: 'The Wardens always need reforging stock. Bring in 3 Scrap Metal.', objective: 'Gather 3 Scrap Metal and turn it in at the Hold or any Warden.', requirement: { rep: 0 }, reward: { tc: 35, rep: 6 }, fetch: { itemName: 'Scrap Metal', quantity: 3 } },
  { id: 'seekers_dig', factionId: 'seekers', title: 'The Sunken Dig', description: 'The Seekers want the lake wreck searched before the water rises. Staged contract.', objective: 'Reach the Still Lake and clear what guards the wreck.', requirement: { rep: 5 }, reward: { tc: 120, rep: 8, items: ['Seeker\'s Locket'] }, stages: [{ narration: 'Make your way to the Still Lake and find the half-sunk wreck.', advanceOn: 'travel' }, { narration: 'Drive off whatever has made the wreck its nest.', advanceOn: 'kill' }] },
];

// A small walkable base per faction, placed at its location, with one mission-board room.
const room = (id: string, name: string, desc: string, exits: Record<string, string | null>, board = false, npc: string | null = null) => ({ id, name, shortName: name, description: desc, exits, anchorNpc: npc, ...(board ? { missionBoard: true } : {}) });
const baseRooms = (areaName: string) => [
  room('yard', 'Yard', `The open yard of ${areaName}. The way in and out, and the board where work is posted.`, { north: 'hall', east: 'store', west: 'world' }, true),
  room('hall', 'Hall', 'A long common hall — a fire, a table, low talk.', { south: 'yard' }, false, 'Keeper'),
  room('store', 'Store', 'Shelves of crates and spare kit.', { west: 'yard' }, false),
];
const STARTING_AREAS = [
  { factionId: 'wardens', name: 'Warden Hold', locationId: 'warden_hold', coords: { x: 7, y: 8 }, returnable: true, rooms: baseRooms('Warden Hold') },
  { factionId: 'seekers', name: 'Seeker Camp', locationId: 'seeker_camp', coords: { x: 13, y: 8 }, returnable: true, rooms: baseRooms('Seeker Camp') },
  { factionId: 'freeholders', name: 'The Crossroads', locationId: 'crossroads', coords: { x: 10, y: 10 }, returnable: true, rooms: baseRooms('the Crossroads') },
];

const COLLECTABLES = [
  { id: 'story_wanderer', characterName: 'A Wanderer', characterBlurb: 'Someone who walked these roads before you, and left pieces of a story behind.', fragments: [
    { id: 'wanderer_01', title: 'A Torn Page', kind: 'note', body: 'The roads all lead to the keep eventually. I am not going to the keep. I have seen what keeps its gate.', discoveryHint: 'Tucked in a marker on the Old Plains', biomeTags: ['region', 'open'] },
    { id: 'wanderer_02', title: 'A Last Letter', kind: 'letter', body: 'If you found this, you got further than I did. Take the key. Do not look back at the lake.', discoveryHint: 'On the shore of the Still Lake', biomeTags: ['water', 'wreck'] },
  ] },
];

// race/faction remarks keyed to the REAL ids so they actually fire; the rest of the
// flavor is the shared generic pool.
const FLAVOR = {
  ...genericFlavorPools(),
  raceRemarks: {
    tallfolk: ['"Mind the low ceilings," the Narrator says. "They were not built for the likes of you."'],
    lowfolk: ['"You go where the big ones cannot," the Narrator notes. "Use it."'],
  },
  factionRemarks: {
    wardens: ['"The Wardens would have you hold the line here," the Narrator says.'],
    seekers: ['"The Seekers would tell you to dig," the Narrator says. "There is always something under the dirt."'],
    freeholders: ['"The Freeholders owe no one," the Narrator says. "Keep it that way and keep moving."'],
  },
};

// Fix the two item tables that carry a faction reference (use a real faction id).
const withFaction = (rows: readonly unknown[], factionId: string) =>
  rows.map((r) => ({ ...(r as Record<string, unknown>), ...((r as { faction?: unknown }).faction ? { faction: factionId } : {}) }));

export const GENERIC_GAME = {
  identity: { worldName: 'the Reaches', corruptionName: 'the Blight', narratorName: 'the Narrator', gameTitle: 'The Reaches' },
  tables: {
    weapons: GENERIC_TABLE_ROWS.weapons,
    armor: GENERIC_TABLE_ROWS.armor,
    materials: GENERIC_TABLE_ROWS.materials,
    gear: GENERIC_TABLE_ROWS.gear,
    exploration: withFaction(GENERIC_TABLE_ROWS.exploration, 'wardens'),
    amulets: GENERIC_TABLE_ROWS.amulets,
    rings: withFaction(GENERIC_TABLE_ROWS.rings, 'wardens'),
    recipes: GENERIC_TABLE_ROWS.recipes,
    weather: GENERIC_TABLE_ROWS.weather,
    enemies: ENEMIES,
    races: RACES,
    factions: FACTIONS,
    locations: LOCATIONS,
  },
  missions: {
    factionQuests: FACTION_QUESTS,
    hunts: realIds(GENERIC_MISSIONS.hunts),
    mysteries: realIds(GENERIC_MISSIONS.mysteries),
    storylines: realIds(GENERIC_MISSIONS.storylines),
    objectives: realIds(GENERIC_MISSIONS.objectives),
    complications: realIds(GENERIC_MISSIONS.complications),
    rewards: realIds(GENERIC_MISSIONS.rewards),
  },
  flavor: FLAVOR,
  startingAreas: STARTING_AREAS,
  mainQuest: MAIN_QUEST,
  bosses: BOSSES,
  collectables: COLLECTABLES,
  digging: {
    itemScores: { 'Worn Sword': 3, "Hunter's Bow": 1, 'Scrap Metal': 4, 'Banded Cuirass': 2 },
    tagScores: { weapon: 2, melee: 3, metal: 4, food: 0, ring: 0, amulet: 0 },
    productiveCap: 16,
    loot: [
      { name: 'Small Rock', rarity: 'Common', baseWeight: 55 },
      { name: 'Stick', rarity: 'Common', baseWeight: 50 },
      { name: 'Common Residue', rarity: 'Common', baseWeight: 14 },
      { name: 'Scrap Metal', rarity: 'Common', baseWeight: 8 },
      { name: 'Tough Fiber', rarity: 'Common', baseWeight: 8 },
      { name: 'Trail Rations', rarity: 'Common', baseWeight: 6 },
      { name: 'Raw Crystal', rarity: 'Uncommon', baseWeight: 5 },
      { name: 'Worked Crystal', rarity: 'Rare', baseWeight: 1 },
    ],
  },
  scrap: {
    roles: { metalBulk: 'Scrap Metal', metalPremium: 'Worked Crystal', essencePrimary: 'Raw Crystal', essenceSecondary: 'Common Residue', essenceBonus: 'Common Residue', stone: 'Small Rock', mud: 'Common Residue', cloth: 'Tough Fiber', organic: 'Tough Fiber', wood: 'Stick' },
    rawGuard: ['Scrap Metal', 'Stick', 'Small Rock', 'Tough Fiber', 'Raw Crystal', 'Worked Crystal', 'Common Residue'],
    premiumMats: ['Worked Crystal', 'Raw Crystal'],
    failureLines: [
      'You work the {item} apart, but the pieces crumble in your hands. Nothing salvageable.',
      'The {item} comes apart — but the bits are warped past use.',
      'Too far gone. You open the {item} and find only rot inside.',
    ],
  },
};
