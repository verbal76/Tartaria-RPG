// engine_Dev — content templates. Exports the FIRST FEW rows of each built-in
// (Tartaria) table as a pretty-printed JSON sample, so a developer can see the
// shape and edit it into their own game's data — without dumping (or having to
// wade through) the entire existing game. The export format matches what the
// upload boxes expect: a JSON ARRAY of rows.

import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import materialsData from '../data/items/materials.json';
import gearData from '../data/items/gear.json';
import explorationData from '../data/items/exploration.json';
import amuletsData from '../data/items/amulets.json';
import ringsData from '../data/items/rings.json';
import recipesData from '../data/items/recipes.json';
import enemiesData from '../data/enemies/enemies.json';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';
import locationsData from '../data/locations/locations.json';
import weatherData from '../data/weather/weather.json';
import huntsData from '../data/quests/hunts.json';
import mysteriesData from '../data/quests/mysteries.json';
import factionQuestsData from '../data/quests/faction-quests.json';
import storylinesData from '../data/quests/faction-storylines.json';
import objectivesData from '../data/quests/objectives.json';
import complicationsData from '../data/quests/complications.json';
import rewardsData from '../data/quests/rewards.json';
import {
  DEFAULT_WORLD_TONE,
  CONTENT_TABLES,
  LORE_BLOCKS,
  resolveTable,
  type ContentTableId,
  type LoreBlockId,
} from './contentPack';
import { getInteractionTags } from './interactionTags';
import { buildFlavorTemplate } from './narrativeGenerator';
import { POWERS_TEMPLATE } from './powers';

/** Example narrator persona seeded into the World-lore template — illustrative
 *  only; the author edits it. (The live default is built from the narrator's
 *  name via getNarratorPersona(); the narrator's NAME is set separately in the
 *  dev console's rename block.) */
const NARRATOR_PERSONA_EXAMPLE = 'You are the Narrator, the voice that tells this story.';

/** engine_Dev — the rename-token reference, prepended to every prose template so
 *  authors know they can drop the chosen names into ANY text. Every per-section
 *  loader (and the whole-game loader) runs stripJsonComments, so these `//` lines
 *  are removed on upload. The whole-game template documents the same tokens in its
 *  header, so bundle sections pass `includeTokenNote = false` to avoid repetition. */
const TOKEN_NOTE = [
  '// TOKENS — usable in ANY text string below; the engine fills in the name you set:',
  '//   {narrator} / {arbiter} / {guide}  -> your narrator name',
  '//   {crucible} / {fuse} / {forge}     -> your fusion-feature name',
  '//   {title} / {game}                  -> your game title',
].join('\n');

/** Prepend the token note to a template body unless suppressed (bundle sections). */
function tokenNote(json: string, include: boolean): string {
  return include ? `${TOKEN_NOTE}\n${json}` : json;
}

/** Normalize a data file to its row array — some are top-level arrays, others are
 *  wrapped (e.g. { "weapons": [...] }). */
function rows(data: unknown, key?: string): unknown[] {
  if (Array.isArray(data)) return data;
  if (key && data && typeof data === 'object') {
    const v = (data as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

// engine_Dev — generic, section-organized starter for the Lore document box.
// No specific setting: the author replaces each REPLACE and fills sections out as
// they build a world. `section` = a human label (engine ignores it). `tags` =
// the scene words that make a passage fire (place/faction/race names from your
// other tables). `["always"]` = the default passage when nothing else matches.
const LORE_DOCUMENT_SCAFFOLD: unknown[] = [
  {
    section: 'READ ME — how this works (delete before you publish)',
    tags: [],
    text: 'Each block below is one lore passage. The narrator pulls in the block whose "tags" appear in the current scene — its location name, biome, and surroundings — so tag every block with the place / faction / race words it should fire near (use the same names as your Locations, Factions, and Races tables). "section" is just a label for you; the engine ignores it. Tag a block "always" to use it as the baseline when nothing scene-specific matches. Empty tags (like this block) never fire. Keep each block a few sentences; add as many as you want.',
  },
  {
    section: 'World overview — the baseline the narrator always leans on',
    tags: ['always'],
    text: 'REPLACE: one short paragraph on your world — where and when it is, the central conflict, and the overall mood. This is the catch-all the narrator falls back on when no scene-specific lore matches.',
  },
  {
    section: 'History — a defining past event',
    tags: ['REPLACE-with-an-event-keyword'],
    text: 'REPLACE: a pivotal event in your world’s past and why it still matters. Tag it with words that appear where its weight is felt (a place name, a faction).',
  },
  {
    section: 'Environment — a region or biome',
    tags: ['REPLACE-with-a-region-or-biome-name'],
    text: 'REPLACE: describe a key region/biome — what it looks, sounds, and feels like. Tag it with the region/biome name you used in your Locations so it surfaces when the player is there.',
  },
  {
    section: 'Faction — who they are',
    tags: ['REPLACE-with-a-faction-id-or-name'],
    text: 'REPLACE: who this faction is, what they want, and how they treat outsiders. Tag with the faction’s id/name from your Factions table.',
  },
  {
    section: 'Race / people — culture and traits',
    tags: ['REPLACE-with-a-race-id-or-name'],
    text: 'REPLACE: who these people are — their culture, strengths, and how others regard them. Tag with the race id/name from your Races table.',
  },
  {
    section: 'Location — a place’s deeper story',
    tags: ['REPLACE-with-a-location-name'],
    text: 'REPLACE: the story behind a specific place — what happened here, what’s hidden, who holds it. Tag with the location name from your Locations table.',
  },
  {
    section: 'Key figure — a leader or legend',
    tags: ['REPLACE-with-a-character-name'],
    text: 'REPLACE: an important person, leader, or legend — who they are and why they matter. Tag with their name so it fires near their home or when they’re referenced.',
  },
  {
    section: 'Artifact — the lore of a notable item',
    tags: ['REPLACE-with-an-item-name'],
    text: 'REPLACE: the story behind a notable item or relic. Tag with the item’s name (match your Weapons/Gear tables).',
  },
];

const TABLE_ROWS: Record<ContentTableId, unknown[]> = {
  weapons: rows(weaponsData, 'weapons'),
  armor: rows(armorData, 'armor'),
  materials: rows(materialsData, 'materials'),
  gear: rows(gearData, 'gear'),
  exploration: rows(explorationData),
  amulets: rows(amuletsData, 'amulets'),
  rings: rows(ringsData, 'rings'),
  recipes: rows(recipesData, 'recipes'),
  enemies: rows(enemiesData),
  races: rows(racesData),
  factions: rows(factionsData),
  locations: rows(locationsData),
  weather: rows(weatherData),
  // engine_Dev — the Lore document has no built-in file of its own shape; this is
  // a GENERIC, section-organized scaffold (no Tartaria / no specific setting) the
  // author fills in for any game. Each block is one passage; the narrator injects
  // the block whose `tags` match the scene. `section` is a human label the engine
  // ignores; the `always` tag marks the default block used when nothing else
  // matches. Replace every REPLACE and add as many blocks as you want.
  lore: LORE_DOCUMENT_SCAFFOLD,
  // The built-in power set + custom-effect examples (fog / heal) — edit/replace.
  powers: POWERS_TEMPLATE as unknown[],
};

/** How many sample rows to export per table — enough to show the shape, not the
 *  whole game. */
export const TEMPLATE_SAMPLE_ROWS = 2;

/** First `n` rows of a built-in table as a pretty JSON string (a starter schema). */
export function getTableTemplate(id: ContentTableId, n: number = TEMPLATE_SAMPLE_ROWS, includeTokenNote = true): string {
  // The Lore document + Powers ship their FULL set (not a 2-row sample) so the
  // author sees every section / power to edit. Both carry author prose, so they
  // get the rename-token note.
  if (id === 'lore' || id === 'powers') return tokenNote(JSON.stringify(TABLE_ROWS[id], null, 2), includeTokenNote);
  // engine_Dev — the Locations sample shows the optional map x / y (grid column /
  // row) so authors know they can plot each place on the uploaded world map.
  if (id === 'locations') {
    const rows = TABLE_ROWS.locations.slice(0, n).map((row, i) => ({
      ...(row as Record<string, unknown>),
      x: (row as { x?: number }).x ?? (i + 1) * 3,
      y: (row as { y?: number }).y ?? (i + 1) * 2,
    }));
    return JSON.stringify(rows, null, 2);
  }
  return JSON.stringify(TABLE_ROWS[id].slice(0, n), null, 2);
}

/** A lore-block starter. World shows the CURRENT defaults to edit; faction/race
 *  show the first couple of built-in rows so the shape is obvious. */
export function getLoreTemplate(id: LoreBlockId, includeTokenNote = true): string {
  if (id === 'world') {
    return JSON.stringify(
      {
        narrator: NARRATOR_PERSONA_EXAMPLE,
        tone: DEFAULT_WORLD_TONE,
        setting: '',
        terms: [],
        vocabulary: [],
        // engine_Dev — CATCHALL term map. Any built-in narration noun the engine
        // still names gets rewritten to your word everywhere the player reads it
        // (pools, one-off lines, and dynamic text). Add a pair per residual term.
        termMap: { 'Reclaimers': 'REPLACE-with-your-faction-noun', 'Aetherstone': 'REPLACE-with-your-material' },
      },
      null,
      2,
    );
  }
  if (id === 'flavor') {
    return tokenNote(JSON.stringify(buildFlavorTemplate(TEMPLATE_SAMPLE_ROWS), null, 2), includeTokenNote);
  }
  const src = id === 'faction' ? TABLE_ROWS.factions : TABLE_ROWS.races;
  return JSON.stringify(src.slice(0, TEMPLATE_SAMPLE_ROWS), null, 2);
}

/** The Missions template — one object whose keys are the mission sub-tables.
 *  Hunts/mysteries/faction-quests/storylines are the designed multi-stage
 *  missions; objectives/complications/rewards are the seeds the engine mixes into
 *  procedural "lead" quests. A few sample rows of each, from the built-ins. */
export function buildMissionsTemplate(n: number = TEMPLATE_SAMPLE_ROWS, includeTokenNote = true): string {
  const arr = (data: unknown, key: string): unknown[] => {
    const v = (data as Record<string, unknown>)[key];
    return Array.isArray(v) ? v : Array.isArray(data) ? (data as unknown[]) : [];
  };
  return tokenNote(JSON.stringify({
    hunts: arr(huntsData, 'hunts').slice(0, n),
    mysteries: arr(mysteriesData, 'mysteries').slice(0, n),
    factionQuests: arr(factionQuestsData, 'quests').slice(0, n),
    storylines: arr(storylinesData, 'storylines').slice(0, 1),
    objectives: (objectivesData as unknown[]).slice(0, 3),
    complications: (complicationsData as unknown[]).slice(0, 3),
    rewards: (rewardsData as unknown[]).slice(0, 3),
  }, null, 2), includeTokenNote);
}

/** The Wasteland-encounters template — between-locations travel encounters keyed by
 *  archetype id. A neutral, representative example (NOT the built-in Tartaria set):
 *  a treasure with statted loot (a consumable, a weapon with statBonuses +
 *  baseDurability, a material), an npc, and a skirmish. Loot fields rarity /
 *  description / statBonuses / baseDurability give encounter-ONLY items real stats
 *  inline. Replace the matchers with YOUR location tags and the enemy with a name
 *  from your Enemies table. */
export function buildWastelandTemplate(includeTokenNote = true): string {
  return tokenNote(JSON.stringify({
    _comment: "Travel encounters. This is a GROWABLE LIST: each top-level key is ONE encounter — add as many as you want (copy a block, give it a new key). type: treasure|npc|skirmish|mini_dungeon|fusion_bench. matchers = location tags it can fire in (it fires at ANY location whose tags include one of these). weight = how often it's picked vs the others. WILDCARD: a matcher of \"any\" (or \"*\") makes the encounter eligible at EVERY location during travel — use it for encounters that can hit anywhere, alongside ones targeted to specific tags. loot kind: consumable|misc|relic|weapon|armor|currency (currency grants TC = the rolled min..max). statBonuses use ONLY these stats: strength, dexterity, intelligence, wisdom, charisma, stealth. Replace the REPLACE-... placeholders.",

    roadside_cache: {
      type: 'treasure',
      weight: 12,
      matchers: ['REPLACE-with-your-location-tags', 'open', 'ruin'],
      narration: "Something's been left behind {direction} of here — a pack, a body, a story that ended badly.",
      loot: [
        { name: 'Field Rations', weight: 35, min: 1, max: 2, kind: 'consumable', tags: ['food'], rarity: 'Common', description: 'Enough to keep you walking another day.' },
        { name: 'Scavenged Blade', weight: 12, min: 1, max: 1, kind: 'weapon', tags: ['weapon', 'melee'], rarity: 'Uncommon', description: "Worn, but it'll fight.", statBonuses: [{ stat: 'strength', amount: 2 }], baseDurability: 35 },
        { name: 'Salvage Scrap', weight: 30, min: 1, max: 3, kind: 'misc', tags: ['metal', 'scrap'], rarity: 'Common', description: 'Worth something to the right buyer, or a crafting input.' },
        { name: 'Loose Coins', weight: 20, min: 10, max: 40, kind: 'currency', tags: ['currency'], description: 'kind:"currency" grants TC (the rolled min..max), NOT an item.' },
      ],
      lore_note: 'A note, half-legible: a direction, a warning, a name.',
    },

    "_comment_2": "↑ encounter #1.  ↓ a SECOND encounter — same type is fine, just a different key, matchers, and loot.",

    sunken_cache: {
      type: 'treasure',
      weight: 8,
      matchers: ['REPLACE-with-a-different-region-tag', 'water', 'wreck'],
      narration: 'A half-submerged wreck breaks the surface {direction} of you, cargo still strapped to the deck.',
      loot: [
        { name: 'Sealed Field Kit', weight: 30, min: 1, max: 1, kind: 'consumable', tags: ['medical', 'heal'], rarity: 'Uncommon', description: 'A watertight medical kit. Closes wounds the hard way.' },
        { name: 'Pressure Plate', weight: 12, min: 1, max: 1, kind: 'armor', tags: ['armor'], rarity: 'Uncommon', description: 'A salvaged hull plate, barnacled but sound. Bracing it builds the shoulders.', statBonuses: [{ stat: 'strength', amount: 2 }], baseDurability: 40 },
        { name: 'Tangled Wiring', weight: 28, min: 1, max: 3, kind: 'misc', tags: ['scrap'], rarity: 'Common', description: 'Copper worth pulling for the forge.' },
      ],
      lore_note: 'The water here refuses to lie flat.',
    },

    wandering_stranger: {
      type: 'npc',
      weight: 10,
      matchers: ['REPLACE-with-your-location-tags', 'open', 'road'],
      narration: 'A figure crosses toward you {direction}, hands kept where you can see them.',
      npc_lines: [
        '"Don\'t go where it\'s loud. I wouldn\'t."',
        '"You\'re newer than the last one I passed. They didn\'t make it either."',
      ],
      lore_note: "They won't say where they're headed.",
    },

    ambush: {
      type: 'skirmish',
      weight: 8,
      matchers: ['REPLACE-with-your-location-tags', 'ruin', 'hostile'],
      narration: 'A {enemy} rises from the wreck {direction} of here with your name on it.',
      enemyPool: ['REPLACE-with-an-enemy-name-from-your-Enemies-table'],
      lore_note: 'Out here, loyalty lasts as long as the ammunition.',
    },

    "_comment_3": "↓ a WILDCARD encounter — matchers: [\"any\"] means it can fire at ANY location during travel, not just tagged ones. Keep a few of these so travel anywhere stays alive.",

    lone_drifter: {
      type: 'npc',
      weight: 6,
      matchers: ['any'],
      narration: 'Somewhere {direction} of the path, a drifter falls into step beside you for a while.',
      npc_lines: [
        '"Everyone out here is going somewhere. Few of them arrive."',
        '"Heard {narrator} talks to folks like you. Lucky you."',
      ],
      lore_note: 'They leave the road as quietly as they joined it.',
    },
  }, null, 2), includeTokenNote);
}

/** A small keyword-form example of interaction tags, used inside the whole-game
 *  template (so the bundle doesn't dump every noun). */
export function interactionTagsKeywordSample(): string {
  return JSON.stringify({
    climbable: ['tower', 'wall', 'ladder', 'scaffolding', 'tank', 'u-boat', 'fuselage', 'pillbox', 'statue'],
    swimmable: ['water', 'pool', 'sea', 'flood'],
    breakable: ['window', 'door', 'crate', 'glass'],
    searchable: ['desk', 'cabinet', 'body', 'logbook'],
    salvageable: ['wreck', 'engine', 'generator', 'machine'],
  }, null, 2);
}

/** The Interaction-tags template — built from the LIVE locations' interactables.
 *  Lists every unique interactable noun mapped to its tags, so the author tags
 *  exactly the items in their world. Each noun is pre-filled with the engine's
 *  current best guess (from the keyword matcher); the author edits the arrays.
 *  Pass `current` (a prior per-noun map) to PRESERVE the author's edits while
 *  pulling in any newly-added nouns — that's the "refresh" path. */
export function buildInteractionTagsTemplate(current?: Record<string, string[]>): string {
  const locs = resolveTable('locations', TABLE_ROWS.locations as unknown[]) as Array<{ interactables?: unknown }>;
  const nouns = new Set<string>();
  for (const l of locs) {
    const list = (l as { interactables?: unknown }).interactables;
    if (Array.isArray(list)) for (const n of list) if (typeof n === 'string' && n.trim()) nouns.add(n.trim());
  }
  const out: Record<string, string[]> = {};
  for (const noun of [...nouns].sort((a, b) => a.localeCompare(b))) {
    // Preserve the author's prior tags for this noun; else the engine's guess.
    const prior = current?.[noun];
    out[noun] = Array.isArray(prior) ? prior : [...getInteractionTags(noun)];
  }
  return JSON.stringify(out, null, 2);
}

/** The Starting-areas template — a SEPARATE list of per-faction 4-room instances,
 *  each PLACED at a location on the map (locationId). The faction's member spawns
 *  inside it. Every starting area is the SAME generic 4-room layout — armory,
 *  mess hall, operations, supply — so any faction (any name, any number) gets a
 *  consistent base. Rooms are a tiny graph: each exit points to another room's id
 *  (or null). The first room (operations) is the entry. Edit room copy to taste;
 *  the layout is intentionally faction-neutral. */
export function buildStartingAreasTemplate(): string {
  // engine_Dev — one stub per LIVE faction (uploaded factions win over built-in),
  // each placed at the faction's baseLocationId when set. The four rooms are
  // GENERIC and identical across every faction so the template scales to any
  // faction list of any length; only factionId / name / locationId differ.
  const factions = resolveTable('factions', TABLE_ROWS.factions as unknown[]) as Array<{ id?: string; name?: string; baseLocationId?: string }>;
  const list = factions.length > 0 ? factions : [{ id: 'REPLACE-with-a-faction-id', name: 'Faction' }];
  // The shared generic layout. Entry is "operations"; the four rooms form a small
  // connected graph (operations ↔ armory, operations ↔ mess, operations ↔ supply).
  // The entry room's free exit uses the sentinel "world" — that exit leaves the
  // instance and drops the player back onto the world map at `locationId`.
  const genericRooms = () => [
    { id: 'operations', name: 'Operations', shortName: 'Ops', description: 'The nerve center — a map table, comms gear, and a duty roster pinned to the wall. The way in and out.', interactables: ['map table', 'radio', 'duty roster', 'door'], exits: { north: 'armory', south: 'supply', east: 'mess', west: 'world' }, anchorNpc: null },
    { id: 'armory', name: 'Armory', shortName: 'Armory', description: 'Racks of weapons and gear, locked behind a steel cage. The smell of oil and cold metal.', interactables: ['weapon rack', 'gun cage', 'workbench', 'ammo crate'], exits: { north: null, south: 'operations', east: null, west: null }, anchorNpc: 'Quartermaster' },
    { id: 'mess', name: 'Mess Hall', shortName: 'Mess', description: 'Long tables, a steaming pot, and the low murmur of off-duty talk. Rumors trade hands here.', interactables: ['pot', 'long table', 'coffee urn', 'noticeboard'], exits: { north: null, south: null, east: null, west: 'operations' }, anchorNpc: null },
    { id: 'supply', name: 'Supply', shortName: 'Supply', description: 'Shelves of crates and footlockers — rations, spare kit, and whatever the unit hoards.', interactables: ['supply crate', 'footlocker', 'shelving', 'ledger'], exits: { north: 'operations', south: null, east: null, west: null }, anchorNpc: null },
  ];
  const stub = (f: { id?: string; name?: string; baseLocationId?: string }) => ({
    factionId: f.id ?? 'REPLACE-with-a-faction-id',
    name: `${f.name ?? 'Faction'} HQ`,
    locationId: f.baseLocationId ?? 'REPLACE-with-this-faction-s-location-id',
    rooms: genericRooms(),
  });
  return JSON.stringify(list.map(stub), null, 2);
}

/** The Hooks template — an illustrative example of the atmospheric-lead format.
 *  `plants` are the discovery line(s) + matchable nouns per hook id; `chains` are
 *  the staged outcomes, each stage carrying a list of effect verbs. The example is
 *  kept small (the built-in set is ~50 hooks); the author replaces it wholesale.
 *  Effect verbs: grant_tc {amount} · grant_item {name} · spawn_enemy_tag {tag} ·
 *  heal {amount} · damage {amount,cause} · unlock_location {locationId} ·
 *  rep_change {factionId,amount} · advance_time {hours} · memo {text} ·
 *  spawn_vendor {vendor} . */
export function buildHooksTemplate(includeTokenNote = true): string {
  return tokenNote(JSON.stringify({
    plants: {
      green_fog_vent: [
        { line: 'A vent in the seam breathes a slow coil of green fog.', nouns: ['vent', 'fog', 'seam', 'grate'] },
      ],
    },
    chains: {
      green_fog_vent: [
        { line: 'You step closer. The ozone stings; something metallic is wedged in the grate.', effects: [], done: false, addNouns: ['grate'] },
        { line: 'You pry the grate loose. A ticking brass device tumbles into your hand.', effects: [{ type: 'grant_item', name: 'Doomsday Chronometer' }, { type: 'grant_tc', amount: 40 }], done: true },
      ],
    },
    weights: { green_fog_vent: 6 },
    indoor: [],
  }, null, 2), includeTokenNote);
}

/** The Whispers template — an array of overheard-tip chains. An authored chain
 *  plants at a plant location (plantLocations), points to a nearby tile in a time
 *  window, and pays off in one hop via meetLine + meetEffects (the same effect
 *  verbs hooks use). plantLocations may be a built-in hub-room id (e.g.
 *  "outpost_messhall") OR one of YOUR location ids — engine_Dev plants the chain
 *  when the player is in the hub room OR standing at that macro location. */
export function buildWhispersTemplate(includeTokenNote = true): string {
  return tokenNote(JSON.stringify([
    {
      id: 'cache_rumor',
      title: 'The Ace’s Cache',
      plantLocations: ['outpost_messhall', 'REPLACE-with-one-of-your-location-ids'],
      plantChance: 0.15,
      plantLines: [
        'A sailor at the corner table leans in. "Word is there’s a stash in a wreck two, three tiles south. Go after dark. Don’t ask who told you."',
      ],
      targetOffset: { dxRange: [-1, 1], dyRange: [-3, -2] },
      activeHours: [20, 4],
      meetLine: 'You find the half-sunk wreck. Wedged behind a buckled bulkhead: a brass device, still ticking.',
      meetEffects: [
        { type: 'grant_item', name: 'Doomsday Chronometer' },
        { type: 'grant_tc', amount: 60 },
      ],
    },
  ], null, 2), includeTokenNote);
}

/** Wrap a hint string into `//` comment lines, soft-wrapped at ~90 chars so the
 *  template stays readable. */
function commentBlock(hint: string, width = 90): string {
  const words = hint.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > width) { lines.push(cur); cur = w; }
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.map((l) => `  // ${l}`).join('\n');
}

/** One `"key": <content>` block, nested one level (2-space indent) and prefixed
 *  with its reference comment. */
function bundleSection(key: string, hint: string, content: string): string {
  const indented = content.split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');
  return `${commentBlock(hint)}\n  "${key}": ${indented}`;
}

/** The WHOLE-GAME template: a single JSONC object holding every section (title /
 *  tagline / narrator, the four lore blocks, then every content table), each with
 *  an inline `//` reference comment describing what it needs. Comments are legal
 *  here because loadGameBundle strips them before parsing. Upload this one file to
 *  build the entire game at once; the per-section boxes then show what loaded. */
export function buildGameBundleTemplate(): string {
  // Each entry is a complete `"key": value` block (with its own reference
  // comment). They're joined with commas, so every section is comma-separated and
  // the file parses as JSON once the comments are stripped.
  const header = [
    '  // ============================================================',
    '  // WHOLE-GAME FILE. Edit every section, delete what you don\'t need,',
    '  // then upload under "UPLOAD ENTIRE GAME". // and block comments are OK.',
    '  // Any section you omit keeps the built-in (Tartaria) default.',
    '  // ------------------------------------------------------------',
    '  // CALLABLE TOKENS — drop these in ANY text string (mission arbiter/',
    '  // narration lines, whispers, hooks, wasteland narration, flavor, lore)',
    '  // and the engine fills in the name YOU chose, so you never hard-code it:',
    '  //   {narrator} / {arbiter} / {guide}  -> your narrator name',
    '  //   {crucible} / {fuse} / {forge}     -> your fusion-feature name',
    '  //   {title} / {game}                  -> your game title',
    '  //   {world} / {setting}               -> your world name (replaces "Tartaria")',
    '  // ============================================================',
  ].join('\n');

  const sections: string[] = [
    // The header sits above the first real key (comments need no comma).
    `${header}\n${bundleSection('title', 'The game title shown on the start screen.', JSON.stringify('My Game'))}`,
    bundleSection('tagline', 'One-line tagline under the title.', JSON.stringify('A world of your making.')),
    bundleSection('narrator', 'The narrator\'s display NAME (e.g. "Bob", "The Arbiter"). Persona/voice is set in the world block below.', JSON.stringify('Narrator')),
    bundleSection('worldName', 'Your world\'s proper noun. The built-in narration uses "Tartaria" in dozens of lines; set this and the engine swaps it everywhere the player reads it (also callable as the {world} token).', JSON.stringify('My World')),
  ];

  for (const b of LORE_BLOCKS) {
    sections.push(bundleSection(b.id, b.hint, getLoreTemplate(b.id, false)));
  }
  for (const t of CONTENT_TABLES) {
    sections.push(bundleSection(t.id, t.hint, getTableTemplate(t.id, TEMPLATE_SAMPLE_ROWS, false)));
  }
  sections.push(bundleSection(
    'missions',
    'One object holding your missions: hunts / mysteries / factionQuests / storylines (designed multi-stage quests, accepted from vendors) plus objectives / complications / rewards (seeds the engine mixes into procedural lead quests). Omit any sub-table to keep its built-in default.',
    buildMissionsTemplate(TEMPLATE_SAMPLE_ROWS, false),
  ));
  sections.push(bundleSection(
    'hooks',
    'Atmospheric multi-stage leads the player stumbles on while exploring. { plants: { <hookId>: [{line, nouns}] }, chains: { <hookId>: [{line, effects, done}] } }. Effect verbs: grant_tc, grant_item, spawn_enemy_tag, heal, damage, unlock_location, rep_change, advance_time, memo, spawn_vendor. Omit to keep the built-in hooks.',
    buildHooksTemplate(false),
  ));
  sections.push(bundleSection(
    'wasteland',
    'Random encounters during long-distance travel between locations, keyed by archetype id. Each: { type (treasure|npc|skirmish|mini_dungeon|fusion_bench), weight, matchers: [location tags it fires in], narration, optional loot/npc_lines/lore_note/enemyPool }. A matcher of "any" / "*" makes an encounter fire at ANY location during travel (random-anywhere), alongside tag-targeted ones. Replaces the built-in travel encounters.',
    buildWastelandTemplate(false),
  ));
  sections.push(bundleSection(
    'startingAreas',
    'Per-faction starting areas (array). Each is a small instance — factionId, name, locationId (WHERE on the map to place it), and rooms[] (a tiny graph; each exit points to another room id, null, or "world" to leave to the map; the first room is the entry). The faction member spawns inside it and can walk room-to-room; an exit of "world" steps back out onto the world map. Whispers can plant in a room by naming its room id in plantLocations.',
    buildStartingAreasTemplate(),
  ));
  sections.push(bundleSection(
    'interactionTags',
    'Which interactable nouns each verb accepts. Two forms (mix freely): the 5 tag-name keys (climbable / swimmable / breakable / searchable / salvageable) hold KEYWORD lists added to the built-in generic set; ANY other key is an EXACT noun mapped to its tags. In the dev console, the INTERACTION TAGS box builds a per-noun list from your loaded locations to tag directly.',
    interactionTagsKeywordSample(),
  ));
  sections.push(bundleSection(
    'whispers',
    'Overheard-tip leads (array). Each: plants at a plant location (plantLocations), points to a nearby tile (targetOffset) in a time window (activeHours), and pays off via meetLine + meetEffects (same effect verbs as hooks) when the player arrives. plantLocations may be a built-in hub-room id (e.g. "outpost_messhall") OR one of your own location ids — the chain plants when the player is in that hub room or standing at that macro location.',
    buildWhispersTemplate(false),
  ));

  return `{\n${sections.join(',\n\n')}\n}\n`;
}
