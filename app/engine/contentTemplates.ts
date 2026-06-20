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
  type ContentTableId,
  type LoreBlockId,
} from './contentPack';
import { buildFlavorTemplate } from './narrativeGenerator';
import { POWERS_TEMPLATE } from './powers';

/** Example narrator persona seeded into the World-lore template — illustrative
 *  only; the author edits it. (The live default is built from the narrator's
 *  name via getNarratorPersona(); the narrator's NAME is set separately in the
 *  dev console's rename block.) */
const NARRATOR_PERSONA_EXAMPLE = 'You are the Narrator, the voice that tells this story.';

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
export function getTableTemplate(id: ContentTableId, n: number = TEMPLATE_SAMPLE_ROWS): string {
  // The Lore document + Powers ship their FULL set (not a 2-row sample) so the
  // author sees every section / power to edit.
  if (id === 'lore' || id === 'powers') return JSON.stringify(TABLE_ROWS[id], null, 2);
  return JSON.stringify(TABLE_ROWS[id].slice(0, n), null, 2);
}

/** A lore-block starter. World shows the CURRENT defaults to edit; faction/race
 *  show the first couple of built-in rows so the shape is obvious. */
export function getLoreTemplate(id: LoreBlockId): string {
  if (id === 'world') {
    return JSON.stringify(
      { narrator: NARRATOR_PERSONA_EXAMPLE, tone: DEFAULT_WORLD_TONE, setting: '', terms: [], vocabulary: [] },
      null,
      2,
    );
  }
  if (id === 'flavor') {
    return JSON.stringify(buildFlavorTemplate(TEMPLATE_SAMPLE_ROWS), null, 2);
  }
  const src = id === 'faction' ? TABLE_ROWS.factions : TABLE_ROWS.races;
  return JSON.stringify(src.slice(0, TEMPLATE_SAMPLE_ROWS), null, 2);
}

/** The Missions template — one object whose keys are the mission sub-tables.
 *  Hunts/mysteries/faction-quests/storylines are the designed multi-stage
 *  missions; objectives/complications/rewards are the seeds the engine mixes into
 *  procedural "lead" quests. A few sample rows of each, from the built-ins. */
export function buildMissionsTemplate(n: number = TEMPLATE_SAMPLE_ROWS): string {
  const arr = (data: unknown, key: string): unknown[] => {
    const v = (data as Record<string, unknown>)[key];
    return Array.isArray(v) ? v : Array.isArray(data) ? (data as unknown[]) : [];
  };
  return JSON.stringify({
    hunts: arr(huntsData, 'hunts').slice(0, n),
    mysteries: arr(mysteriesData, 'mysteries').slice(0, n),
    factionQuests: arr(factionQuestsData, 'quests').slice(0, n),
    storylines: arr(storylinesData, 'storylines').slice(0, 1),
    objectives: (objectivesData as unknown[]).slice(0, 3),
    complications: (complicationsData as unknown[]).slice(0, 3),
    rewards: (rewardsData as unknown[]).slice(0, 3),
  }, null, 2);
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
    '  // ============================================================',
  ].join('\n');

  const sections: string[] = [
    // The header sits above the first real key (comments need no comma).
    `${header}\n${bundleSection('title', 'The game title shown on the start screen.', JSON.stringify('My Game'))}`,
    bundleSection('tagline', 'One-line tagline under the title.', JSON.stringify('A world of your making.')),
    bundleSection('narrator', 'The narrator\'s display NAME (e.g. "Bob", "The Arbiter"). Persona/voice is set in the world block below.', JSON.stringify('Narrator')),
  ];

  for (const b of LORE_BLOCKS) {
    sections.push(bundleSection(b.id, b.hint, getLoreTemplate(b.id)));
  }
  for (const t of CONTENT_TABLES) {
    sections.push(bundleSection(t.id, t.hint, getTableTemplate(t.id)));
  }
  sections.push(bundleSection(
    'missions',
    'One object holding your missions: hunts / mysteries / factionQuests / storylines (designed multi-stage quests, accepted from vendors) plus objectives / complications / rewards (seeds the engine mixes into procedural lead quests). Omit any sub-table to keep its built-in default.',
    buildMissionsTemplate(),
  ));

  return `{\n${sections.join(',\n\n')}\n}\n`;
}
