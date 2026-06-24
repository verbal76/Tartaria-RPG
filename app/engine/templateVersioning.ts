// templateVersioning — engine_Dev. Detects when an author's UPLOADED content was built
// against an OLDER version of a section's TEMPLATE than the engine now ships ("stale upload").
//
// Each authorable section has a TEMPLATE (the schema + sample the dev console hands the author).
// We hash that template's current output → a per-section "template version". The content-pack
// store records, per uploaded section, the template version its CURRENT override was built
// against (refreshed whenever the override content changes, i.e. on re-upload). When the engine
// later changes a template (new fields, renamed ids, reworked sample), its hash moves and the
// recorded version no longer matches → the dev panel flags that section YELLOW so the author
// knows to re-download the template and refresh their upload. No false alarm on re-upload: the
// store refreshes the stamp the moment the override content changes.

import {
  getTableTemplate,
  getLoreTemplate,
  buildMissionsTemplate,
  buildHooksTemplate,
  buildWhispersTemplate,
  buildWastelandTemplate,
  buildInteractionTagsTemplate,
  buildStartingAreasTemplate,
  buildTitlesTemplate,
  buildCollectablesTemplate,
  buildSummonsTemplate,
  buildMainQuestTemplate,
  buildBossesTemplate,
  buildDiggingTemplate,
  buildScrapTemplate,
  buildSalvageTemplate,
  buildOverlaysTemplate,
  buildDogScenariosTemplate,
  buildScenePropsTemplate,
  buildVendorsTemplate,
  buildRoadsideTradersTemplate,
} from './contentTemplates';
import { CONTENT_TABLES, LORE_BLOCKS, type ContentTableId, type LoreBlockId } from './contentPack';

/** djb2 — small, stable, dependency-free. Same shape used elsewhere in the engine. */
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Stable hash of any override payload, for "did the upload change" detection. */
export function hashContent(value: unknown): string {
  try {
    return hashStr(JSON.stringify(value) ?? '');
  } catch {
    return hashStr(String(value));
  }
}

/** Section key → its current template text. Prefixed keys keep tables/lore namespaced
 *  (`table:<id>`, `lore:<block>`); everything else is a plain section key matching the
 *  content-pack store field it overrides. */
function buildTemplateFor(key: string): string | null {
  if (key.startsWith('table:')) return getTableTemplate(key.slice(6) as ContentTableId);
  if (key.startsWith('lore:')) return getLoreTemplate(key.slice(5) as LoreBlockId);
  switch (key) {
    case 'missions': return buildMissionsTemplate();
    case 'hooks': return buildHooksTemplate();
    case 'whispers': return buildWhispersTemplate();
    case 'wasteland': return buildWastelandTemplate();
    case 'interactionTags': return buildInteractionTagsTemplate();
    case 'startingAreas': return buildStartingAreasTemplate();
    case 'titles': return buildTitlesTemplate();
    case 'collectables': return buildCollectablesTemplate();
    case 'summons': return buildSummonsTemplate();
    case 'mainQuest': return buildMainQuestTemplate();
    case 'bosses': return buildBossesTemplate();
    case 'digging': return buildDiggingTemplate();
    case 'scrap': return buildScrapTemplate();
    case 'salvage': return buildSalvageTemplate();
    case 'overlays': return buildOverlaysTemplate();
    case 'dogScenarios': return buildDogScenariosTemplate();
    case 'sceneProps': return buildScenePropsTemplate();
    case 'vendors': return buildVendorsTemplate();
    case 'roadsideTraders': return buildRoadsideTradersTemplate();
    default: return null;
  }
}

const _versionCache = new Map<string, string>();

/** The current template version (content hash) for a section key. Cached — templates are
 *  pure functions of the engine build, so the version is constant within a run. Returns ''
 *  for keys with no template (callers treat '' as "no versioning / never stale"). */
export function templateVersionFor(key: string): string {
  const cached = _versionCache.get(key);
  if (cached !== undefined) return cached;
  const tmpl = buildTemplateFor(key);
  const v = tmpl == null ? '' : hashStr(tmpl);
  _versionCache.set(key, v);
  return v;
}

/** Every versioned section key (tables + lore blocks + the standalone sections). */
export function allTemplateKeys(): string[] {
  return [
    ...CONTENT_TABLES.map((t) => `table:${t.id}`),
    ...LORE_BLOCKS.map((b) => `lore:${b.id}`),
    'missions', 'hooks', 'whispers', 'wasteland', 'interactionTags', 'startingAreas',
    'titles', 'collectables', 'summons', 'mainQuest', 'bosses', 'digging', 'scrap',
    'salvage', 'overlays', 'dogScenarios', 'sceneProps', 'vendors', 'roadsideTraders',
  ];
}

/** A recorded stamp: the override content hash + the template version it was built against. */
export interface TemplateStamp {
  /** Hash of the override payload when last stamped (refresh trigger). */
  content: string;
  /** Template version the override was built against. */
  tmpl: string;
}
export type TemplateStamps = Record<string, TemplateStamp>;

/** Reconcile stamps against the live overrides. For each section with an override present,
 *  refresh its stamp when the override CONTENT changed (a fresh upload), else keep the
 *  recorded template version. Drop stamps for sections no longer overridden. Returns the next
 *  stamps map, or the SAME reference when nothing changed (so callers can skip a write). */
export function reconcileStamps(
  prev: TemplateStamps,
  overrides: Record<string, unknown>,
): TemplateStamps {
  const next: TemplateStamps = {};
  let changed = false;
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) continue;
    const content = hashContent(value);
    const existing = prev[key];
    if (existing && existing.content === content) {
      next[key] = existing; // unchanged upload — keep its recorded template version
    } else {
      next[key] = { content, tmpl: templateVersionFor(key) }; // new/changed upload — restamp
      changed = true;
    }
  }
  // any previously-stamped key that is no longer overridden has been dropped
  if (!changed) {
    for (const key of Object.keys(prev)) {
      if (!(key in next)) { changed = true; break; }
    }
  }
  return changed ? next : prev;
}

/** Section keys whose recorded template version no longer matches the current one. */
export function staleKeys(stamps: TemplateStamps): Set<string> {
  const out = new Set<string>();
  for (const [key, stamp] of Object.entries(stamps)) {
    const cur = templateVersionFor(key);
    if (cur && stamp.tmpl && stamp.tmpl !== cur) out.add(key);
  }
  return out;
}

/** Test-only: drop the version cache (templates are otherwise constant for a run). */
export function _resetTemplateVersionCache(): void {
  _versionCache.clear();
}
