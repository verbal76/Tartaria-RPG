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
import recipesData from '../data/items/recipes.json';
import enemiesData from '../data/enemies/enemies.json';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';
import locationsData from '../data/locations/locations.json';
import {
  DEFAULT_WORLD_TONE,
  type ContentTableId,
  type LoreBlockId,
} from './contentPack';
import { buildFlavorTemplate } from './narrativeGenerator';

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

const TABLE_ROWS: Record<ContentTableId, unknown[]> = {
  weapons: rows(weaponsData, 'weapons'),
  armor: rows(armorData, 'armor'),
  materials: rows(materialsData, 'materials'),
  gear: rows(gearData, 'gear'),
  exploration: rows(explorationData),
  recipes: rows(recipesData, 'recipes'),
  enemies: rows(enemiesData),
  races: rows(racesData),
  factions: rows(factionsData),
  locations: rows(locationsData),
};

/** How many sample rows to export per table — enough to show the shape, not the
 *  whole game. */
export const TEMPLATE_SAMPLE_ROWS = 2;

/** First `n` rows of a built-in table as a pretty JSON string (a starter schema). */
export function getTableTemplate(id: ContentTableId, n: number = TEMPLATE_SAMPLE_ROWS): string {
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
