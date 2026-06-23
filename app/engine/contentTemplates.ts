// engine_Dev — content templates. Exports the FIRST FEW rows of each built-in
// (Tartaria) table as a pretty-printed JSON sample, so a developer can see the
// shape and edit it into their own game's data — without dumping (or having to
// wade through) the entire existing game. The export format matches what the
// upload boxes expect: a JSON ARRAY of rows.

import {
  getGameTitle,
  CONTENT_TABLES,
  LORE_BLOCKS,
  resolveTable,
  type ContentTableId,
  type LoreBlockId,
} from './contentPack';
import { getInteractionTags } from './interactionTags';
import { buildFlavorTemplate } from './narrativeGenerator';
import { POWERS_TEMPLATE } from './powers';
import { TRACKABLE_VARS } from './customTitles';
import { GENERIC_TABLE_ROWS, GENERIC_MISSIONS } from './genericTemplateData';

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
  // engine_Dev — GENERIC, setting-neutral sample rows (NOT the built-in Tartaria
  // tables). Same shapes + optional fields, bland "light fantasy" flavor, so an
  // author's TEMPLATE never seeds another game's proper nouns. See genericTemplateData.ts.
  weapons: GENERIC_TABLE_ROWS.weapons,
  armor: GENERIC_TABLE_ROWS.armor,
  materials: GENERIC_TABLE_ROWS.materials,
  gear: GENERIC_TABLE_ROWS.gear,
  exploration: GENERIC_TABLE_ROWS.exploration,
  amulets: GENERIC_TABLE_ROWS.amulets,
  rings: GENERIC_TABLE_ROWS.rings,
  recipes: GENERIC_TABLE_ROWS.recipes,
  enemies: GENERIC_TABLE_ROWS.enemies,
  races: GENERIC_TABLE_ROWS.races,
  factions: GENERIC_TABLE_ROWS.factions,
  locations: GENERIC_TABLE_ROWS.locations,
  weather: GENERIC_TABLE_ROWS.weather,
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
// engine_Dev — optional-field reference notes prepended to a table template so the
// TEMPLATE button always reflects the CURRENT functionality, even for rows whose
// built-in sample doesn't happen to use the newer fields. Loaders strip // comments,
// so the template still round-trips. Only shown in the dev box (includeTokenNote),
// not the whole-game bundle (which carries its own section hint).
const TABLE_OPTION_NOTES: Partial<Record<ContentTableId, string>> = {
  races: [
    '// Optional per RACE row (perks + gear + abilities):',
    '//   racialStatBonuses: { strength?, dexterity?, intelligence?, wisdom?, charisma? }  — always-on stat bumps',
    '//   racialACBonusRules: [{ condition: underground|dark|confined|runic_gear|aether_powers|constructed_environment|relic_armor, delta }]',
    '//   startingWeapon: "Item Name"   ·   startingGear: ["Item Name", …]  (granted at creation, from your catalogs)',
    '//   resist: ["<damage type>"]  /  weak: ["<damage type>"]   — lower/raise the chance you suffer that type\'s on-hit effect',
    '//   abilities: [{ id, name, description, combatOnly?, effect: { type: heal|stat_buff|shield|repair|strike, amount?|dice?, stat?, rounds?, damageType? } }]',
  ].join('\n'),
  factions: [
    '// Optional per FACTION row:',
    '//   flavor, baseName, baseLocationId, baseDescription   (starter complex)',
    '//   startingGear: ["Item Name", …]   (granted at creation)',
    '//   factionStatBonuses: { strength?, … }   ·   factionACBonusRules: [{ condition, delta }]',
    '//   resist: ["<damage type>"]  /  weak: ["<damage type>"]',
    '//   abilities: [{ id, name, description, combatOnly?, effect: { type: heal|stat_buff|shield|repair|strike, … } }]',
  ].join('\n'),
  enemies: [
    '// DAMAGE RELATIONS per ENEMY row:',
    '//   damage carries the DELIVERED type, e.g. "2d6 frost" (any type you defined in Damage Types)',
    '//   traits: ["vulnerable:<type>"]  = WEAK to it (takes 1.5x)   ·   ["resist:<type>"] = STRONG (takes 1/2)',
  ].join('\n'),
  locations: '// Optional per LOCATION row: x / y (plot on your world map), hidden: true (colored "?" until visited), aliases: [..], interactables: [..]',
};

export function getTableTemplate(id: ContentTableId, n: number = TEMPLATE_SAMPLE_ROWS, includeTokenNote = true): string {
  const note = includeTokenNote && TABLE_OPTION_NOTES[id] ? TABLE_OPTION_NOTES[id] + '\n' : '';
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
      // engine_Dev — show the optional "hidden" flag on the last sample row so
      // authors see the shape: a colored "?" on the map until the player visits it.
      ...(i === Math.min(n, TABLE_ROWS.locations.length) - 1 ? { hidden: false } : {}),
    }));
    return note + JSON.stringify(rows, null, 2);
  }
  return note + JSON.stringify(TABLE_ROWS[id].slice(0, n), null, 2);
}

/** A lore-block starter. World shows the CURRENT defaults to edit; faction/race
 *  show the first couple of built-in rows so the shape is obvious. */
export function getLoreTemplate(id: LoreBlockId, includeTokenNote = true): string {
  if (id === 'world') {
    return JSON.stringify(
      {
        narrator: NARRATOR_PERSONA_EXAMPLE,
        // engine_Dev — a one-line example tone; replace with your world's premise.
        tone: 'A small band scavenges the ruins of a fallen age; a strange power still lingers in the old places.',
        setting: '',
        terms: [],
        vocabulary: [],
        // engine_Dev — CATCHALL term map. Any built-in narration noun the engine
        // still names gets rewritten to your word everywhere the player reads it
        // (pools, one-off lines, and dynamic text). Add a pair per residual term.
        termMap: { 'REPLACE-with-a-built-in-noun-to-swap': 'REPLACE-with-your-word' },
        // engine_Dev — rename the CORRUPTION/affliction tiers (the noun itself is the
        // top-level corruptionName / {corruption}). Built-in tier ids: tainted /
        // corrupted / hollowed — keep the ids, set your display words.
        corruptionTiers: { tainted: 'REPLACE (e.g. Touched)', corrupted: 'REPLACE (e.g. Sickened)', hollowed: 'REPLACE (e.g. Lost)' },
        // engine_Dev — the ENERGY / "magic" concept. Set yours and the whole family is
        // swapped everywhere (also the {energy} / {energy_adj} / {energy_material}
        // tokens). slang + factionTerms let each faction name the SAME force differently.
        energy: {
          name: 'REPLACE-with-your-energy (e.g. Magic, the Weave)',
          adjective: 'REPLACE (e.g. arcane / charged)',
          material: 'REPLACE (e.g. essence / raw crystal)',
          verb: 'weave',
          caster: 'Caster',
          slang: ['the Hum', 'the Glow', 'the Tide', 'the Pull', 'Drift'],
          factionTerms: { 'REPLACE-faction-id': 'REPLACE-with-that-faction-s-word-for-it' },
        },
      },
      null,
      2,
    );
  }
  if (id === 'flavor') {
    return tokenNote(JSON.stringify(buildFlavorTemplate(TEMPLATE_SAMPLE_ROWS), null, 2), includeTokenNote);
  }
  // engine_Dev — faction/race LORE is FREE-FORM story text the narrator knows, NOT
  // the playable rows (those live in the Factions/Races TABLE boxes — and the lore
  // loader rejects table-shaped arrays). Emit an object of id → a story paragraph so
  // Template → edit → Load round-trips cleanly.
  const src = (id === 'faction' ? TABLE_ROWS.factions : TABLE_ROWS.races) as Array<{ id: string; name: string; description?: string; flavor?: string; philosophy?: string; goal?: string }>;
  const out: Record<string, string> = {};
  for (const r of src.slice(0, TEMPLATE_SAMPLE_ROWS)) {
    const blurb = (r.flavor || r.description || r.philosophy || r.goal || `Story the narrator knows about ${r.name}.`).trim();
    out[r.id] = blurb;
  }
  return JSON.stringify(out, null, 2);
}

/** engine_Dev — the FULL-FEATURED main-quest template. Shows every action verb and
 *  every per-step field — including the newer faction GATES (skipForFactions /
 *  onlyForFactions) — so the TEMPLATE button always reflects the current
 *  functionality even after an author built a quest before those options existed. */
export function buildMainQuestTemplate(): string {
  return [
    '// MAIN QUEST — steps run in order; the last completes the quest. Actions:',
    '//   kill (needs bossId) · clear · reach · collect · talk_to · deliver ·',
    '//   return_to · hand_in · claim. Per step: target?, locationId, reward? (item',
    '//   collected), bossId? (kill steps), and FACTION GATES:',
    '//   skipForFactions: [..]  — players of these factions SKIP this step',
    '//   onlyForFactions: [..]  — step runs ONLY for these factions',
    JSON.stringify({
      title: 'Your campaign name',
      steps: [
        { id: 'step_1', action: 'kill', target: 'the enemy commander', bossId: 'REPLACE-with-a-boss-id', locationId: 'REPLACE-with-a-location-id', reward: 'the commander\'s dog tags', skipForFactions: ['REPLACE-with-that-commander-s-own-faction-id'] },
        { id: 'step_2', action: 'collect', target: 'the cipher key', locationId: 'REPLACE-with-a-location-id' },
        { id: 'step_3', action: 'reach', locationId: 'REPLACE-with-a-location-id' },
        { id: 'step_4', action: 'talk_to', target: 'the informant', locationId: 'REPLACE-with-a-location-id', onlyForFactions: ['REPLACE-with-a-faction-id-if-this-step-is-faction-specific'] },
        { id: 'step_5', action: 'return_to', locationId: 'REPLACE-with-your-base-location-id' },
        { id: 'step_6', action: 'hand_in', target: 'the dog tags', locationId: 'REPLACE-with-your-base-location-id' },
        { id: 'step_7', action: 'claim', locationId: 'REPLACE-with-your-base-location-id' },
      ],
    }, null, 2),
  ].join('\n');
}

/** engine_Dev — the FULL bosses template: one of every spawn mode (main_quest /
 *  location / random) so the TEMPLATE shows the complete schema + spawn options. */
export function buildBossesTemplate(): string {
  return [
    '// BOSSES — named foes a main-quest "kill" step references, or a fixed/random spawn.',
    '//   spawnCondition: "main_quest" (tied to a quest step) | "location" (always at its',
    '//     spawnLocationId) | "random" (rolls spawnChance % on travel encounters).',
    '//   questItem drops on kill (used by a quest "kill" step); drops[] are extra loot.',
    '//   damage can carry a type, e.g. "1d10 frost". factionId is optional (null = neutral).',
    JSON.stringify([
      { id: 'enemy_commander', name: 'The Enemy Commander', factionId: 'REPLACE-with-a-faction-id', hp: 120, attack: 7, damage: '2d8+4', ac: 16, abilityPoint: 7, questItem: 'Commander Dog Tags', drops: ['Field Medal'], spawnLocationId: 'REPLACE-with-a-location-id', spawnCondition: 'main_quest' },
      { id: 'fortress_warden', name: 'The Fortress Warden', hp: 90, attack: 6, damage: '2d6', ac: 15, spawnLocationId: 'REPLACE-with-a-location-id', spawnCondition: 'location' },
      { id: 'roaming_horror', name: 'A Roaming Horror', hp: 70, attack: 8, damage: '1d10 frost', ac: 14, spawnCondition: 'random', spawnChance: 8 },
    ], null, 2),
  ].join('\n');
}

/** The Missions template — one object whose keys are the mission sub-tables.
 *  Hunts/mysteries/faction-quests/storylines are the designed multi-stage
 *  missions; objectives/complications/rewards are the seeds the engine mixes into
 *  procedural "lead" quests. A few sample rows of each, from the built-ins. */
export function buildMissionsTemplate(n: number = TEMPLATE_SAMPLE_ROWS, includeTokenNote = true): string {
  // engine_Dev — GENERIC sample missions (not the built-in Tartaria quests). Same
  // shapes + the newer faction-quest fields (fetch, staged plan, reward.items).
  return tokenNote(JSON.stringify({
    hunts: GENERIC_MISSIONS.hunts.slice(0, n),
    mysteries: GENERIC_MISSIONS.mysteries.slice(0, n),
    factionQuests: GENERIC_MISSIONS.quests.slice(0, n),
    storylines: GENERIC_MISSIONS.storylines.slice(0, 1),
    objectives: GENERIC_MISSIONS.objectives.slice(0, 3),
    complications: GENERIC_MISSIONS.complications.slice(0, 3),
    rewards: GENERIC_MISSIONS.rewards.slice(0, 3),
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
    { id: 'operations', name: 'Operations', shortName: 'Ops', description: 'The nerve center — a map table, comms gear, and a duty roster pinned to the wall. The way in and out.', interactables: ['map table', 'radio', 'duty roster', 'door'], exits: { north: 'armory', south: 'supply', east: 'mess', west: 'world' }, anchorNpc: null, missionBoard: true },
    { id: 'armory', name: 'Armory', shortName: 'Armory', description: 'Racks of weapons and gear, locked behind a steel cage. The smell of oil and cold metal.', interactables: ['weapon rack', 'gun cage', 'workbench', 'ammo crate'], exits: { north: null, south: 'operations', east: null, west: null }, anchorNpc: 'Quartermaster', missionBoard: false },
    { id: 'mess', name: 'Mess Hall', shortName: 'Mess', description: 'Long tables, a steaming pot, and the low murmur of off-duty talk. Rumors trade hands here.', interactables: ['pot', 'long table', 'coffee urn', 'noticeboard'], exits: { north: null, south: null, east: null, west: 'operations' }, anchorNpc: null, missionBoard: false },
    { id: 'supply', name: 'Supply', shortName: 'Supply', description: 'Shelves of crates and footlockers — rations, spare kit, and whatever the unit hoards.', interactables: ['supply crate', 'footlocker', 'shelving', 'ledger'], exits: { north: 'operations', south: null, east: null, west: null }, anchorNpc: null, missionBoard: false },
  ];
  // missionBoard: flag exactly ONE room (here, Operations) as the board room.
  // returnable: true = a base you can come back to; false = a one-way prologue that
  //   vanishes once you leave (its missions then use remote turn-in).
  // coords: the world-map cell the area sits on — read it off the in-game map planner
  //   (tap/click a tile to see its x,y), then type it here.
  const stub = (f: { id?: string; name?: string; baseLocationId?: string }) => ({
    factionId: f.id ?? 'REPLACE-with-a-faction-id',
    name: `${f.name ?? 'Faction'} HQ`,
    locationId: f.baseLocationId ?? 'REPLACE-with-this-faction-s-location-id',
    coords: { x: 10, y: 10 },
    returnable: true,
    rooms: genericRooms(),
  });
  return JSON.stringify(list.map(stub), null, 2);
}

/** The Titles template — IMPORTABLE achievements. Each title ties a trackable
 *  variable + threshold to a display name. The leading comment lists every
 *  trackable variable id (stripped on load), so an author can pick one and set a
 *  number — the same list the dev console's TITLES box shows as checkboxes. */
export function buildTitlesTemplate(): string {
  const varList = TRACKABLE_VARS.map((v) => `//   "${v.id}"  —  ${v.label}`).join('\n');
  const body = JSON.stringify([
    { id: 'veteran', name: 'Veteran of the Fold', description: 'Hardened by too many firefights. +1 STR.', track: 'enemiesDefeated', threshold: 25, perk: { stat: 'strength', amount: 1 } },
    { id: 'wayfarer', name: 'Wayfarer', description: 'You have crossed more ground than most see in a lifetime.', track: 'travelsCompleted', threshold: 10 },
    { id: 'war_profiteer', name: 'War Profiteer', track: 'tc', threshold: 1000 },
  ], null, 2);
  return [
    '// IMPORTABLE TITLES — an array of achievements. A title is earned the moment',
    '// its TRACKABLE VARIABLE reaches the threshold. Pick a "track" from this list:',
    varList,
    '// Each title: { id, name, description?, track, threshold, perk?: { stat, amount } }.',
    '// Optional perk applies a flat attribute bonus while held; valid stats:',
    '// strength, dexterity, intelligence, wisdom, charisma, stealth.',
    body,
  ].join('\n');
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
      strange_vent: [
        { line: 'A vent in the rock breathes a slow coil of pale mist.', nouns: ['vent', 'mist', 'seam', 'grate'] },
      ],
    },
    chains: {
      strange_vent: [
        { line: 'You step closer. The air stings; something metal is wedged in the grate.', effects: [], done: false, addNouns: ['grate'] },
        { line: 'You pry the grate loose. A ticking brass device tumbles into your hand.', effects: [{ type: 'grant_item', name: 'Old Mechanism' }, { type: 'grant_tc', amount: 40 }], done: true },
      ],
    },
    weights: { strange_vent: 6 },
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
      title: 'The Buried Cache',
      plantLocations: ['REPLACE-with-a-hub-room-id-or-one-of-your-location-ids'],
      plantChance: 0.15,
      plantLines: [
        'A traveler at the corner table leans in. "Word is there’s a stash in a wreck two, three tiles south. Go after dark. Don’t ask who told you."',
      ],
      targetOffset: { dxRange: [-1, 1], dyRange: [-3, -2] },
      activeHours: [20, 4],
      meetLine: 'You find the half-sunk wreck. Wedged behind a buckled beam: a brass device, still ticking.',
      meetEffects: [
        { type: 'grant_item', name: 'Old Mechanism' },
        { type: 'grant_tc', amount: 60 },
      ],
    },
  ], null, 2), includeTokenNote);
}

/** The Collectables template — an array of CHARACTER STORIES. Each story is one
 *  named character whose tale the player pieces together by finding fragments
 *  (notes / letters / journal pages / fragments) as loot. The Contracts screen's
 *  Collectables tab renders per-character completion. A fragment drops in place of
 *  normal loot when the scene's biome tags overlap the fragment's biomeTags. The
 *  uploaded array REPLACES the built-in story set wholesale. */
export function buildCollectablesTemplate(): string {
  const body = JSON.stringify({
    stories: [
      {
        id: 'story_example_one',
        characterName: 'A. Whitcombe',
        characterBlurb: 'A field researcher who vanished chasing the anomaly. Their scattered notes trace the descent from curiosity to dread.',
        fragments: [
          {
            id: 'whitcombe_01',
            title: 'First Field Note',
            kind: 'note',
            body: 'The readings spike near the old substation every night at the same hour. Coincidence does not keep a schedule. Tomorrow I bring the better instruments.',
            discoveryHint: 'Tucked in a rusted locker near the substation ruins',
            biomeTags: ['ruin', 'urban'],
          },
          {
            id: 'whitcombe_02',
            title: 'Torn Letter Home',
            kind: 'letter',
            body: 'If you are reading this I did not come back. Do not look for me near the water. Whatever is down there, it knows my name now.',
            discoveryHint: 'Half-buried in the silt along the waterfront',
            biomeTags: ['water', 'wreck'],
          },
        ],
      },
      {
        id: 'story_example_two',
        characterName: 'Sgt. Devlin',
        characterBlurb: 'A soldier left behind when the cordon fell. His journal is a countdown.',
        fragments: [
          {
            id: 'devlin_01',
            title: 'Journal — Day 3',
            kind: 'journal',
            body: 'Rations holding. Radio dead. I keep the door barred and the lamp low. They move when the lamp is bright.',
            discoveryHint: 'Inside a barricaded room in a collapsed bunker',
            biomeTags: ['ruin', 'underground'],
          },
        ],
      },
    ],
  }, null, 2);
  return [
    '// IMPORTABLE COLLECTABLES — character stories the player reassembles from loot.',
    '// Top level: { "stories": [ ... ] } (a bare array of stories is also accepted).',
    '// Each story: { id, characterName, characterBlurb, fragments: [...] }.',
    '// Each fragment: { id, title, kind, body, discoveryHint, biomeTags: [..] }.',
    '//   kind     — "note" | "letter" | "journal" | "fragment".',
    '//   body     — the text the player reads once the fragment is found.',
    '//   hint     — shown for an undiscovered fragment; name the biome/place to look.',
    '//   biomeTags — a fragment can drop where the scene\'s location.tags overlap these.',
    '// The uploaded set REPLACES the built-in stories wholesale.',
    body,
  ].join('\n');
}

/** The Summons template — the SUMMONED-SIDEKICK pack (the engine's "golem"
 *  family, reskinnable). `noun` renames the category the player types after
 *  "summon" and reads in the summon lines ("golem" by default). Each entry in
 *  `summons` is one buildable sidekick: what it's made of (fuel), its combat
 *  profile, how hard it is to summon, and the words the player types to call it.
 *  The uploaded pack REPLACES the built-in golems wholesale. */
export function buildSummonsTemplate(): string {
  const body = JSON.stringify({
    noun: 'automaton',
    summons: [
      {
        kind: 'spark_automaton',
        name: 'Spark Automaton',
        aliases: ['spark', 'spark automaton', 'spark bot'],
        fuel: [
          { name: 'Spark Core', quantity: 2 },
          { name: 'Iron Frame', quantity: 1 },
        ],
        hpMax: 24,
        attackDie: '1d10',
        attackMod: 1,
        hitBonus: 2,
        damageType: 'piercing',
        summonDC: 14,
        resistBase: 0.20,
        resistCap: 0.40,
        elementTags: ['spark'],
        blurb: 'Nimble striker. Charged limbs hit hard but the frame is light.',
      },
      {
        kind: 'iron_automaton',
        name: 'Iron Automaton',
        aliases: ['iron', 'iron automaton', 'iron bot'],
        fuel: [
          { name: 'Heavy Cell', quantity: 2 },
          { name: 'Riveted Plating', quantity: 2 },
          { name: 'Iron Frame', quantity: 1 },
        ],
        hpMax: 44,
        attackDie: '1d8',
        attackMod: 2,
        hitBonus: 1,
        damageType: 'bludgeoning',
        summonDC: 17,
        resistBase: 0.32,
        resistCap: 0.52,
        elementTags: ['iron'],
        blurb: 'Heavy guardian. Plated armor soaks punishment; slow but relentless.',
      },
    ],
  }, null, 2);
  return [
    '// SUMMONED SIDEKICKS — the buildable companion family (replaces the built-in',
    '// "golems"). Top level: { "noun"?: "automaton", "summons": [ ... ] }.',
    '//   noun     — what the player types after "summon" and reads in the summon',
    '//              lines (default "golem"). Each summon can also be called by its',
    '//              own aliases below.',
    '// Each summon:',
    '//   kind     — a unique id (also "id" is accepted).',
    '//   name     — display name ("Phase Automaton").',
    '//   aliases  — words the player can type, e.g. "summon phase".',
    '//   fuel     — [{ name, quantity }] consumed on a successful summon. Use item',
    '//              names that EXIST in your materials/gear catalog.',
    '//   hpMax / attackDie ("1d10") / attackMod / hitBonus / damageType',
    '//              (bludgeoning|slashing|piercing|frost) — its combat profile.',
    '//   summonDC — d20 + INT must meet this to bind it (harder = stronger).',
    '//   resistBase/resistCap — innate damage resistance (0..1), grows with training.',
    '//   elementTags — raw-material tags it can mend from when its exact parts run out.',
    '// The uploaded pack REPLACES the built-in golems.',
    body,
  ].join('\n');
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
/** engine_Dev — the downloadable BUILD GUIDE: what each section is + the order to
 *  fill them so a game comes together cleanly. Saved from the dev console's top
 *  "DEV GUIDE" button. */
/** The Digging template — generic, setting-neutral dig config: which items/tags dig
 *  well, the productive-dig cap, and the dig loot table. Author edits + uploads;
 *  resolves override → generic default → built-in. */
export function buildDiggingTemplate(): string {
  return [
    '// DIGGING — what the player can scrape out of the ground with "dig".',
    '//   itemScores: per-item dig effectiveness (higher digs better; 0 = can\'t dig).',
    '//   tagScores : fallback by item tag when an item isn\'t listed.',
    '//   productiveCap: productive digs one wild tile yields before it\'s worked-out.',
    '//   loot: the dig table — { name, rarity (Common|Uncommon|Rare), baseWeight }.',
    '//         Uncommon/Rare weights scale UP with the dig tool\'s score.',
    JSON.stringify({
      itemScores: { 'Worn Sword': 3, "Hunter's Bow": 1, 'Scrap Metal': 4, 'Iron Frame': 3 },
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
    }, null, 2),
  ].join('\n');
}

export function buildDevGuide(): string {
  return `# ${getGameTitle()} — Engine Build Guide

This engine is lore-agnostic: a game is just the JSON you upload. The fastest path
is the WHOLE-GAME file (one file holds every section); the per-section boxes are for
granular edits. Recommended order:

The console is organized into collapsible sections — tap a header bar to open it.
Most sections are form builders (text boxes + checkboxes that save to JSON); each
also keeps a raw-JSON/file strip for power edits.

## 1 · Identity & World (do first — everything else reads these)
  - Game name / Tagline / Narrator name / Fusion-feature (Crucible) name + on-off
  - World name (replaces the built-in world name everywhere) · Corruption/affliction name
  - World lore: narrator persona ({narrator}/{world}/{energy} tokens work here),
    tone, setting, terms, vocabulary, and:
      • energy: name + adjective + material + slang + per-faction terms (your "magic")
      • termMap: { "any leftover noun": "your word" } — the catch-all swap

## 2 · Character creation
  - Races (playable) · Factions (playable) — what the creation screen shows.
    Each race/faction row can carry PERKS + STARTING GEAR + ABILITIES:
      • racialStatBonuses / factionStatBonuses — always-on stat bumps
      • racialACBonusRules / factionACBonusRules — conditional AC
      • startingWeapon (race) + startingGear[] (race & faction) — creation items
      • abilities[] — once-a-day powers (effect: heal/stat_buff/shield/repair/strike)
  - Race lore / Faction lore — story notes the narrator knows

## 3 · The world
  - Locations (give each x/y to plot on your map) — needed before quests/areas.
    Flag any location "hidden": true to show it as a colored "?" (still routable)
    that reveals its name only once the player travels there.
  - Weather · Enemies · Weapons / Armor / Materials / Gear / Exploration / Amulets
    / Rings · Recipes · Powers · Lore document

## 4 · Narration flavor
  - Flavor pools (opening, combat/look/noted/generic remarks, investigation, etc.)
    + starterItems. Anything you omit keeps a neutral built-in line.

## 5 · Faction bases
  - Starting areas (form): one walkable instance per faction. Pick the faction,
    name it, drop it on a map tile (+ optional grid X/Y), add 3-5 rooms and tick
    ONE as the Mission Board room. "Returnable" off = a one-way prologue that
    vanishes once you leave (its missions then turn in remotely). Room ids + exits
    are generated for you (the entry room gets the door out to the map).

## 6 · Main quest (bosses FIRST)
  - Bosses: name, faction, stats, loot, quest item, spawn mode (main_quest /
    location / random). Build these BEFORE the quest.
  - Main quest: line-by-line objective list; "kill" steps pick a main-quest boss.
    Steps can be faction-GATED (skipForFactions/onlyForFactions).

## 7 · Side content
  - Faction missions (form): contracts a faction posts on its board. Set the
    posting faction, the REP GATE (standing where it appears), the rewards
    (TC + rep + item drops), and the plan — ordered beats (each advances on a
    kill / travel / anything) or a single "gather N of an item" fetch.
  - Other missions (hunts / mysteries / storylines + procedural seeds)
  - Hooks (atmospheric leads) · Whispers (overheard tips) · Travel encounters
  - Interaction tags (which verbs each noun accepts) · Titles (achievements)
  - Collectables (character stories the player reassembles from loot fragments)
  - Summoned sidekicks (the buildable companion family — replaces "golems") +
    the dog companion on/off toggle
  - Advanced rules: add damage types, set enemy resist/weak by type, extend the
    fusion material tags, rename the weapon coatings
  - Digging: what "dig" pulls from the ground — the dig loot table, which items make
    good shovels (item → score), and the productive-dig cap

## 8 · Assets (not JSON — their own uploads)
  - World map image · Per-faction maps · Music (battle + ambient, multi-select)

Tip: EXPORT MY GAME pulls everything you've loaded back into one whole-game file —
edit it anywhere, re-upload via UPLOAD FILE. Every box shows a ● badge when loaded
and has a TEMPLATE button with an example to edit.
`;
}

/** One whole-game section: its key, reference comment, and the TEMPLATE scaffold. */
interface BundleEntry { key: string; hint: string; content: string }

/** Every whole-game section in file order, each with its template scaffold. Shared
 *  by the blank template and the annotated download so the section list can never
 *  drift between them. */
function bundleEntries(): BundleEntry[] {
  const entries: BundleEntry[] = [
    { key: 'title', hint: 'The game title shown on the start screen.', content: JSON.stringify('My Game') },
    { key: 'tagline', hint: 'One-line tagline under the title.', content: JSON.stringify('A world of your making.') },
    { key: 'narrator', hint: 'The narrator\'s display NAME (e.g. "Bob", "The Arbiter"). Persona/voice is set in the world block below.', content: JSON.stringify('Narrator') },
    { key: 'worldName', hint: 'Your world\'s proper noun. The built-in narration names a default world in dozens of lines; set yours and the engine swaps it everywhere the player reads it (also callable as the {world} token).', content: JSON.stringify('My World') },
    { key: 'corruptionName', hint: 'Your name for the build-up affliction the engine calls "Corruption" (Phase-Sickness, Chronal Decay, …). Swapped everywhere the player reads it (also the {corruption} token). Rename the tiers Tainted/Corrupted/Hollowed via the world.termMap.', content: JSON.stringify('Corruption') },
    { key: 'crucibleName', hint: 'Your name for the fusion/forge feature the engine calls the "Crucible" (also the {crucible}/{fuse}/{forge} token). Set in the GAME IDENTITY section.', content: JSON.stringify('Crucible') },
    { key: 'crucibleEnabled', hint: 'Whether the fusion/forge feature exists in this game: true (default) keeps it, false removes the Crucible entirely. Toggle it in the GAME IDENTITY section.', content: JSON.stringify(true) },
  ];
  for (const b of LORE_BLOCKS) entries.push({ key: b.id, hint: b.hint, content: getLoreTemplate(b.id, false) });
  for (const t of CONTENT_TABLES) entries.push({ key: t.id, hint: t.hint, content: getTableTemplate(t.id, TEMPLATE_SAMPLE_ROWS, false) });
  entries.push({ key: 'missions', hint: 'One object holding your missions: hunts / mysteries / factionQuests / storylines (designed multi-stage quests, accepted from vendors) plus objectives / complications / rewards (seeds the engine mixes into procedural lead quests). Build factionQuests in the dedicated FACTION MISSIONS box: each is { id, factionId (who posts it), title, objective, requirement: { rep } (the GATE where it appears on that faction\'s board), reward: { tc, rep, items?: ["name"] (item drops granted on turn-in) }, and a plan — stages[] (ordered beats) or fetch: { itemName, quantity } }. Omit any sub-table to keep its built-in default.', content: buildMissionsTemplate(TEMPLATE_SAMPLE_ROWS, false) });
  entries.push({ key: 'hooks', hint: 'Atmospheric multi-stage leads the player stumbles on while exploring. { plants: { <hookId>: [{line, nouns}] }, chains: { <hookId>: [{line, effects, done}] } }. Effect verbs: grant_tc, grant_item, spawn_enemy_tag, heal, damage, unlock_location, rep_change, advance_time, memo, spawn_vendor. Omit to keep the built-in hooks.', content: buildHooksTemplate(false) });
  entries.push({ key: 'wasteland', hint: 'Random encounters during long-distance travel between locations, keyed by archetype id. Each: { type (treasure|npc|skirmish|mini_dungeon|fusion_bench), weight, matchers: [location tags it fires in], narration, optional loot/npc_lines/lore_note/enemyPool }. A matcher of "any" / "*" makes an encounter fire at ANY location during travel (random-anywhere), alongside tag-targeted ones. Replaces the built-in travel encounters.', content: buildWastelandTemplate(false) });
  entries.push({ key: 'titles', hint: 'Importable titles/achievements (array). Each: { id, name, description?, track (a trackable variable), threshold, perk?: { stat, amount } }. Earned when the tracked variable reaches the threshold. Hit the TITLES box TEMPLATE for the list of trackable variables.', content: buildTitlesTemplate() });
  entries.push({ key: 'mainQuest', hint: 'Your win-condition objective list, built in the MAIN QUEST box: { title?, steps: [{ action (kill|clear|reach|collect|talk_to|deliver|return_to|hand_in|claim), target?, locationId, reward?, bossId?, skipForFactions?: ["factionId"] (faction GATE — players of these factions skip this step, e.g. a German isn\'t sent to kill the German boss; can also use onlyForFactions to make a step faction-specific) }] }. Steps run in order; gated steps are skipped per the player\'s faction; the last applicable step completes the quest.', content: buildMainQuestTemplate() });
  entries.push({ key: 'bosses', hint: 'Named bosses (array) that main-quest kill steps reference: { id, name, factionId?, hp, attack, damage, ac?, abilityPoint?, drops?: [items], questItem?, spawnLocationId?, spawnCondition? (main_quest | location | random), spawnChance? (% for random) }. Build them in the BOSSES box.', content: buildBossesTemplate() });
  entries.push({ key: 'startingAreas', hint: 'Per-faction starting areas (array). Each is a small instance — factionId, name, locationId (WHERE on the map to place it), optional coords {x,y} (the map cell — read it off the in-game map planner), returnable? (false = one-way prologue that vanishes once you leave; its missions then use remote turn-in), and rooms[] (a tiny graph; each exit points to another room id, null, or "world" to leave to the map; the first room is the entry). Flag exactly one room with missionBoard:true to stand the starter Mission Board there. The faction member spawns inside and walks room-to-room; an exit of "world" steps back onto the world map. Whispers can plant in a room by naming its room id in plantLocations.', content: buildStartingAreasTemplate() });
  entries.push({ key: 'interactionTags', hint: 'Which interactable nouns each verb accepts. Two forms (mix freely): the 5 tag-name keys (climbable / swimmable / breakable / searchable / salvageable) hold KEYWORD lists added to the built-in generic set; ANY other key is an EXACT noun mapped to its tags. In the dev console, the INTERACTION TAGS box builds a per-noun list from your loaded locations to tag directly.', content: interactionTagsKeywordSample() });
  entries.push({ key: 'summons', hint: 'Summoned-sidekick pack (replaces the built-in "golems"), built in the SUMMONED SIDEKICKS box: { noun?, summons: [{ kind, name, aliases?, fuel: [{name,quantity}], hpMax, attackDie, attackMod?, hitBonus?, damageType?, summonDC?, resistBase?, resistCap?, elementTags? }] }. The player summons by typing "summon <alias>". Fuel names must exist in your catalog.', content: buildSummonsTemplate() });
  entries.push({ key: 'dogEnabled', hint: 'The rescuable dog companion: true (default) keeps it, false removes it from this game (no rescue scenarios fire). Toggle it in the SUMMONED SIDEKICKS section of the dev console.', content: JSON.stringify(true) });
  entries.push({ key: 'damageTypes', hint: 'Author-ADDED damage types beyond the built-in 10. Array of { name, keywords?: [..], onHit?: [{stat,amount}] + onHitRounds (stat +/- to the victim when hit), combat?: { mode "on_hit"|"dot", dice, rounds (dot), baseChance 0..1, weakBonus, strongPenalty } }. combat = a weapon-deals-this-type effect (immediate or ticking), whose apply chance rises vs targets WEAK to it and falls vs STRONG. keywords let the engine infer the type from a bare attack string.', content: JSON.stringify([{ name: 'fire', keywords: ['fire', 'flame', 'burn'], combat: { mode: 'on_hit', dice: '1d6', baseChance: 0.8, weakBonus: 0.2, strongPenalty: 0.3 } }, { name: 'frost', keywords: ['ice', 'freeze'], onHit: [{ stat: 'dexterity', amount: -2 }], onHitRounds: 3, combat: { mode: 'dot', dice: '1d4', rounds: 3 } }], null, 2) });
  entries.push({ key: 'damageResistances', hint: 'Which damage types each ENEMY TYPE resists / is weak to. Object keyed by YOUR enemy types: { "Marsh Wyrm": { "resist": ["frost"], "weak": ["burn"] }, … }. Weak = 1.5× damage, resist = ½. Replaces the built-in map.', content: JSON.stringify({ 'REPLACE-with-your-enemy-type': { resist: ['piercing'], weak: ['frost'] } }, null, 2) });
  entries.push({ key: 'fusionTags', hint: 'EXTRA material tags that count toward the Crucible fusion diversity gate, on top of the built-in set (metal/cloth/wood/stone/bone/crystal/…). Array of tag words your items use, e.g. ["clockwork", "glass", "resin"].', content: JSON.stringify(['clockwork', 'glass'], null, 2) });
  entries.push({ key: 'coatings', hint: 'RENAME the five weapon-coating mechanics (the mechanics stay wired to combat). Object keyed by mechanic — poison / acid / corruption / electrical / burn — each: { label?, blurb?, lootLabel? }. e.g. rename "corruption" to "Searing".', content: JSON.stringify({ corruption: { label: 'Searing', blurb: 'sears the wound (damage over time + worsening stacks)', lootLabel: 'Searing' } }, null, 2) });
  entries.push({ key: 'inventory', hint: 'Inventory presentation: { labels?: { weapon|armor|accessory|consumable|tool|relic|material|loot|quest: "Your name" } (rename the category sections), toolTags?: ["tag"] (extra item tags that read as Tools), repairMaterialPct?: 200 (repair material cost as a % of an item\'s scrap yield; 200 = built-in 2x) }. Category ids + order stay fixed.', content: JSON.stringify({ labels: { loot: 'Salvage', material: 'Components' }, toolTags: ['multitool'], repairMaterialPct: 200 }, null, 2) });
  entries.push({ key: 'collectables', hint: 'Character stories the player reassembles from loot, built in the COLLECTABLES box: { stories: [{ id, characterName, characterBlurb, fragments: [{ id, title, kind (note|letter|journal|fragment), body, discoveryHint, biomeTags: [..] }] }] }. A fragment drops in place of normal loot where the scene\'s location tags overlap its biomeTags. Replaces the built-in stories wholesale.', content: buildCollectablesTemplate() });
  entries.push({ key: 'digging', hint: 'The DIGGING subsystem (what "dig" pulls from the ground): { itemScores: { "Item": score }, tagScores: { tag: score }, productiveCap: number, loot: [{ name, rarity (Common|Uncommon|Rare), baseWeight }] }. Higher dig score = finds more + better rarity. Build it in the DIGGING box; omit to keep the built-in.', content: buildDiggingTemplate() });
  entries.push({ key: 'whispers', hint: 'Overheard-tip leads (array). Each: plants at a plant location (plantLocations), points to a nearby tile (targetOffset) in a time window (activeHours), and pays off via meetLine + meetEffects (same effect verbs as hooks) when the player arrives. plantLocations may be a built-in hub-room id (e.g. "outpost_messhall") OR one of your own location ids — the chain plants when the player is in that hub room or standing at that macro location.', content: buildWhispersTemplate(false) });
  return entries;
}

const BUNDLE_HEADER = [
  '  // ============================================================',
  '  // WHOLE-GAME FILE. Edit every section, delete what you don\'t need,',
  '  // then upload under "UPLOAD FILE FROM DEVICE". // and block comments are OK.',
  '  // Any section you omit keeps the built-in default.',
  '  // ------------------------------------------------------------',
  '  // CALLABLE TOKENS — drop these in ANY text string (mission arbiter/',
  '  // narration lines, whispers, hooks, wasteland narration, flavor, lore)',
  '  // and the engine fills in the name YOU chose, so you never hard-code it:',
  '  //   {narrator} / {arbiter} / {guide}  -> your narrator name',
  '  //   {crucible} / {fuse} / {forge}     -> your fusion-feature name',
  '  //   {title} / {game}                  -> your game title',
  '  //   {world} / {setting}               -> your world name (replaces the built-in world name)',
  '  //   {corruption} / {plague}           -> your affliction name (replaces "Corruption")',
  '  // ============================================================',
].join('\n');

export function buildGameBundleTemplate(): string {
  const sections = bundleEntries().map((e, i) => {
    const sec = bundleSection(e.key, e.hint, e.content);
    return i === 0 ? `${BUNDLE_HEADER}\n${sec}` : sec;
  });
  return `{\n${sections.join(',\n\n')}\n}\n`;
}

/** The WHOLE-GAME download with a per-section status marker so the author can see
 *  at a glance what's done. A key present in `uploaded` (the export of the current
 *  game) emits the author's content under "✅ UPLOADED"; every other section emits
 *  the TEMPLATE scaffold under "⬜ TEMPLATE — default; fill in or delete". The file
 *  still parses + re-uploads cleanly (markers are // comments). */
export function buildAnnotatedGameBundle(uploaded: Record<string, unknown>): string {
  const upCount = Object.keys(uploaded).length;
  const entries = bundleEntries();
  const header = [
    BUNDLE_HEADER,
    '  // ------------------------------------------------------------',
    `  // STATUS MARKERS — ${upCount} of ${entries.length} sections uploaded so far:`,
    '  //   ✅ UPLOADED  = your content (already customized)',
    '  //   ⬜ TEMPLATE  = still the default scaffold — fill it in or delete it',
    '  // ============================================================',
  ].join('\n');
  const sections = entries.map((e, i) => {
    const isUp = Object.prototype.hasOwnProperty.call(uploaded, e.key);
    const status = isUp
      ? '  // ✅ UPLOADED — your content'
      : '  // ⬜ TEMPLATE — default; fill in or delete';
    const content = isUp ? JSON.stringify(uploaded[e.key], null, 2) : e.content;
    const sec = `${status}\n${bundleSection(e.key, e.hint, content)}`;
    return i === 0 ? `${header}\n${sec}` : sec;
  });
  return `{\n${sections.join(',\n\n')}\n}\n`;
}
