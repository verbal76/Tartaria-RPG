// validateGame — engine_Dev. A pre-export "does this game actually hold together" pass. It scans
// the LOADED content (author overrides + generic defaults) for the failure modes that bake into a
// broken release: dangling references (a recipe/quest/vendor/boss/starting-area that points at an
// item / faction / boss / location / room that doesn't exist) and duplicate ids. Errors are things
// that WILL break play (a recipe result that crafts to a blank "misc", a main-quest step whose boss
// can't spawn); warnings are softer (a faction with no quest, a reward item that won't resolve).
// Pure reads through the content-pack resolvers, so it validates the EFFECTIVE game that will ship.

import { CONTENT_TABLES, resolveTable, resolveMissions, getCustomBosses, getCustomMainQuest, getStartingAreas, getVendorsOverride, getRoadsideOverride } from './contentPack';
import { getFactions } from './character';
import { findCatalogItem } from './crafting';
import locationsBuiltin from '../data/locations/locations.json';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  section: string;
  message: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : [];
const itemExists = (name: unknown): boolean => {
  const n = str(name);
  return !!n && !!findCatalogItem(n);
};

export function validateGame(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (section: string, message: string) => issues.push({ severity: 'error', section, message });
  const warn = (section: string, message: string) => issues.push({ severity: 'warning', section, message });

  // Reference sets (EFFECTIVE: override → generic → built-in).
  const factionIds = new Set(getFactions().map((f) => f.id));
  const bossIds = new Set(rows(getCustomBosses()).map((b) => str(b.id)).filter(Boolean) as string[]);
  const locationIds = new Set(
    rows(resolveTable('locations', locationsBuiltin as unknown[])).map((l) => str(l.id)).filter(Boolean) as string[],
  );

  // 1) Duplicate ids/names within each uploaded table (resolveTable(id, []) = author/generic only,
  //    so a clean built-in never trips this).
  for (const t of CONTENT_TABLES) {
    const list = rows(resolveTable(t.id, []));
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const r of list) {
      const key = (str(r.id) ?? str(r.name) ?? '').toLowerCase();
      if (!key) continue;
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    }
    for (const d of dupes) err(t.label, `Duplicate id/name "${d}" — two rows share it, so one will shadow the other.`);
  }

  // 2) Recipes: result must be a defined catalog item; every ingredient must exist.
  for (const r of rows(resolveTable('recipes', []))) {
    const result = str(r.result);
    if (result && !findCatalogItem(result)) err('Crafting recipes', `Recipe result "${result}" isn't in any item table — it will craft to a blank "misc".`);
    for (const ing of rows(r.ingredients)) {
      if (!itemExists(ing.name)) err('Crafting recipes', `Recipe "${result ?? '?'}" needs ingredient "${str(ing.name) ?? '?'}", which isn't a known item/material.`);
    }
  }

  // 3) Vendors + roadside traders: offered items must exist; declared faction must be real.
  const checkOffers = (label: string, list: unknown[] | null) => {
    for (const v of rows(list)) {
      const fac = str(v.faction);
      if (fac && !factionIds.has(fac)) warn(label, `"${str(v.name) ?? '?'}" lists faction "${fac}", which isn't a defined faction.`);
      const offers = rows(v.offers).length ? rows(v.offers) : rows(v.pool);
      for (const o of offers) {
        if (!itemExists(o.itemName)) err(label, `"${str(v.name) ?? '?'}" sells "${str(o.itemName) ?? '?'}", which isn't a known item.`);
      }
    }
  };
  checkOffers('Vendors', getVendorsOverride());
  checkOffers('Roadside traders', getRoadsideOverride());

  // 4) Faction quests: factionId real; fetch item + reward items must exist.
  for (const q of rows(resolveMissions('factionQuests', []))) {
    const fac = str(q.factionId);
    if (fac && !factionIds.has(fac)) err('Faction missions', `Quest "${str(q.title) ?? str(q.id) ?? '?'}" posts for faction "${fac}", which isn't defined.`);
    const fetch = q.fetch && typeof q.fetch === 'object' ? (q.fetch as Record<string, unknown>) : null;
    if (fetch && !itemExists(fetch.itemName)) err('Faction missions', `Fetch quest "${str(q.title) ?? '?'}" wants "${str(fetch.itemName) ?? '?'}", which isn't a known item.`);
    const reward = q.reward && typeof q.reward === 'object' ? (q.reward as Record<string, unknown>) : null;
    for (const it of (Array.isArray(reward?.items) ? reward!.items : [])) {
      if (!itemExists(it)) warn('Faction missions', `Quest "${str(q.title) ?? '?'}" rewards "${str(it) ?? '?'}", which isn't a known item — it won't be granted.`);
    }
  }

  // 5) Main quest: each step's boss must exist; a referenced location should exist.
  const steps = rows(getCustomMainQuest()?.steps);
  for (const s of steps) {
    const bossId = str(s.bossId);
    if (bossId && !bossIds.has(bossId)) err('Main quest', `A step references boss "${bossId}", which isn't in your Bosses table — that step can't complete.`);
    const loc = str(s.locationId);
    if (loc && locationIds.size > 0 && !locationIds.has(loc)) warn('Main quest', `A step targets location "${loc}", which isn't a known location.`);
  }

  // 6) Bosses: drops + spawn location.
  for (const b of rows(getCustomBosses())) {
    for (const d of (Array.isArray(b.drops) ? b.drops : [])) {
      if (!itemExists(d)) warn('Bosses', `Boss "${str(b.name) ?? str(b.id) ?? '?'}" drops "${str(d) ?? '?'}", which isn't a known item.`);
    }
    const sp = str(b.spawnLocationId);
    if (sp && locationIds.size > 0 && !locationIds.has(sp)) warn('Bosses', `Boss "${str(b.name) ?? '?'}" spawns at "${sp}", which isn't a known location.`);
  }

  // 7) Starting areas: faction real; placement location; room exits must resolve.
  for (const a of rows(getStartingAreas() as unknown[])) {
    const fac = str(a.factionId);
    if (fac && !factionIds.has(fac)) err('Starting areas', `A starting area is for faction "${fac}", which isn't defined.`);
    const loc = str(a.locationId);
    if (loc && locationIds.size > 0 && !locationIds.has(loc)) warn('Starting areas', `Starting area "${str(a.name) ?? '?'}" is placed at "${loc}", which isn't a known location.`);
    const areaRooms = rows(a.rooms);
    const roomIds = new Set(areaRooms.map((r) => str(r.id)).filter(Boolean) as string[]);
    for (const room of areaRooms) {
      const exits = room.exits && typeof room.exits === 'object' ? (room.exits as Record<string, unknown>) : {};
      for (const [dir, target] of Object.entries(exits)) {
        const t = str(target);
        if (t && t !== 'world' && !roomIds.has(t)) {
          err('Starting areas', `Room "${str(room.id) ?? '?'}" has an exit (${dir}) to "${t}", which isn't a room in this area (use a room id, "world", or null).`);
        }
      }
    }
  }

  // 8) Completeness nudges (warnings only).
  if (rows(resolveTable('races', [])).length === 0) warn('Tables', 'No Races uploaded — character creation will use the bland generic races.');
  if (rows(resolveTable('factions', [])).length === 0) warn('Tables', 'No Factions uploaded — character creation will use the bland generic factions.');

  return issues;
}

/** Summarize for the dev panel: counts + the first lines, errors before warnings. */
export function summarizeValidation(issues: ValidationIssue[]): { errors: number; warnings: number; lines: string[] } {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const lines = [...errors, ...warnings].map((i) => `${i.severity === 'error' ? '✗' : '⚠'} [${i.section}] ${i.message}`);
  return { errors: errors.length, warnings: warnings.length, lines };
}
