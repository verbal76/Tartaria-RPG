// validateGame — engine_Dev. A pre-export "does this game actually hold together" pass. It scans
// the LOADED content (author overrides + generic defaults) for the failure modes that bake into a
// broken release: dangling references (a recipe/quest/vendor/boss/starting-area/hook/whisper/summon
// that points at an item / faction / boss / location / room / enemy that doesn't exist), unknown
// effect verbs, and duplicate ids. Errors = will break play; warnings = soft; info = FYI. Pure reads
// through the content-pack resolvers, so it validates the EFFECTIVE game that will ship.

import { CONTENT_TABLES, resolveTable, resolveMissions, getCustomBosses, getCustomMainQuest, getStartingAreas, getVendorsOverride, getRoadsideOverride, getHooksOverride, resolveWhispers, getSummonsOverride, getWastelandOverride, getDogScenariosOverride, getCustomTitles, getExtraDamageTypes, getDamageResistancesOverride, getCollectablesOverride, getDiggingOverride, getSalvageOverride, resolveFlavor } from './contentPack';
import { getFactions } from './character';
import { findCatalogItem, getDogGear } from './crafting';
import locationsBuiltin from '../data/locations/locations.json';
import enemiesBuiltin from '../data/enemies/enemies.json';

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: Severity;
  /** Stable machine code for grouping / jump-to (e.g. 'recipe.result.missing'). */
  code: string;
  section: string;
  message: string;
  /** The offending id/name, when known. */
  id?: string;
  /** Optional fix hint. */
  suggestion?: string;
}

export interface ValidationReport {
  ok: boolean; // no hard errors
  errorCount: number;
  warningCount: number;
  infoCount: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : [];
// dogGear (dog vests/collars, kind 'dog_armor') lives in its own table that findCatalogItem
// doesn't scan — but lookupCraftedItem (the real craft path) DOES resolve it (OTA-603). Mirror
// that here so dog-armor items aren't false-flagged as "isn't in any item table".
const dogGearNames = (): Set<string> => {
  const s = new Set<string>();
  for (const g of getDogGear()) {
    const n = str((g as { name?: unknown }).name);
    if (n) s.add(n.toLowerCase());
  }
  return s;
};
const itemExists = (name: unknown): boolean => {
  const n = str(name);
  if (!n) return false;
  if (findCatalogItem(n)) return true;
  return dogGearNames().has(n.toLowerCase());
};

// Engine-known effect verbs (hooks / whispers). An effect with any other `type` won't run.
const EFFECT_VERBS = new Set([
  'grant_tc', 'grant_item', 'spawn_enemy_tag', 'heal', 'damage', 'unlock_location',
  'rep_change', 'advance_time', 'memo', 'spawn_vendor',
]);

/** Flat list of every issue (errors + warnings + info). Kept for callers that just want the list;
 *  runValidation() returns the structured report. */
export function validateGame(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, section: string, message: string, extra?: Partial<ValidationIssue>) => issues.push({ severity: 'error', code, section, message, ...extra });
  const warn = (code: string, section: string, message: string, extra?: Partial<ValidationIssue>) => issues.push({ severity: 'warning', code, section, message, ...extra });
  const info = (code: string, section: string, message: string, extra?: Partial<ValidationIssue>) => issues.push({ severity: 'info', code, section, message, ...extra });

  // Reference sets (EFFECTIVE: override → generic → built-in).
  const factionIds = new Set(getFactions().map((f) => f.id));
  const bossIds = new Set(rows(getCustomBosses()).map((b) => str(b.id)).filter(Boolean) as string[]);
  const locationIds = new Set(
    rows(resolveTable('locations', locationsBuiltin as unknown[])).map((l) => str(l.id)).filter(Boolean) as string[],
  );
  const enemyNames = new Set(
    rows(resolveTable('enemies', enemiesBuiltin as unknown[])).map((e) => str(e.name)?.toLowerCase()).filter(Boolean) as string[],
  );

  // 1) Duplicate ids/names within each uploaded table (resolveTable(id, []) = author/generic only).
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
    for (const d of dupes) err('table.duplicate-id', t.label, `Duplicate id/name "${d}" — two rows share it, so one will shadow the other.`, { id: d });
  }

  // engine_Dev — OBTAINABLE-ITEM INDEX. Every item NAME the game can put in a player's
  // pack from any source (so a recipe ingredient that's a loot drop isn't falsely called
  // "doesn't exist" — it's real, it just may need a Materials row for stats). Lowercased.
  const lootNames = new Set<string>();
  const addLoot = (n: unknown) => { const s = str(n)?.toLowerCase(); if (s) lootNames.add(s); };
  const addLootList = (v: unknown) => { for (const x of (Array.isArray(v) ? v : [])) addLoot(typeof x === 'string' ? x : (x && typeof x === 'object' ? (x as Record<string, unknown>).name : undefined)); };
  for (const e of rows(resolveTable('enemies', enemiesBuiltin as unknown[]))) addLootList(e.loot);     // enemy drops
  for (const b of rows(getCustomBosses())) { addLootList(b.drops); addLoot(b.questItem); }              // boss drops + quest item
  { const dig = getDiggingOverride() as { loot?: unknown[] } | null; if (dig) for (const l of rows(dig.loot)) addLoot(l.name); } // digging
  { const sal = getSalvageOverride() as { pools?: { items?: unknown[] }[]; junkPool?: unknown[] } | null; // salvage pools + junk
    if (sal) { for (const p of (Array.isArray(sal.pools) ? sal.pools : [])) for (const it of rows(p?.items)) addLoot(it.name); for (const it of rows(sal.junkPool)) addLoot(it.name); } }
  { const waste = getWastelandOverride() as Record<string, { loot?: unknown }> | null;                 // travel-encounter loot (string[] or {name}[])
    if (waste) for (const arch of Object.values(waste)) addLootList(arch?.loot); }
  { const hk = getHooksOverride(); if (hk?.chains) for (const stages of Object.values(hk.chains)) for (const st of rows(stages)) for (const ef of rows(st.effects)) if (str(ef.type) === 'grant_item') addLoot(ef.name); } // hook grants
  for (const w of rows(resolveWhispers([]))) { for (const ef of rows(w.meetEffects)) if (str(ef.type) === 'grant_item') addLoot(ef.name); for (const st of rows(w.stages)) for (const ef of rows(st.effects)) if (str(ef.type) === 'grant_item') addLoot(ef.name); } // whisper grants
  for (const v of rows(getVendorsOverride())) for (const o of rows(v.offers)) addLoot(o.itemName);      // vendor offers (buyable)
  for (const v of rows(getRoadsideOverride())) for (const o of rows(v.pool)) addLoot(o.itemName);       // roadside stall
  for (const d of rows(getDogScenariosOverride())) addLootList(d.captorLoot);                            // dog-captor loot
  for (const q of rows(resolveMissions('factionQuests', []))) { const rw = q.reward as { items?: unknown } | undefined; addLootList(rw?.items); } // quest rewards
  for (const k of ['hunts', 'mysteries', 'storylines'] as const) for (const m of rows(resolveMissions(k, []))) addLoot(m.rewardItem);
  for (const s of rows(getCustomMainQuest()?.steps)) addLoot(s.reward);                                  // main-quest step rewards
  for (const r of rows(resolveTable('races', []))) { addLoot(r.startingWeapon); addLootList(r.startingGear); } // starting gear
  for (const f of rows(resolveTable('factions', []))) addLootList(f.startingGear);
  for (const it of rows(resolveFlavor('starterItems', []))) addLoot(it.name);                            // starter inventory

  // 2) Recipes: result must be a defined catalog item; ingredients must exist — cross-checked
  // against BOTH the item tables and every loot/drop source so a loot-only ingredient is named
  // as "define it in Materials", not "doesn't exist". Aggregated lists at the end say exactly
  // what to add to the Materials table.
  const ingMissing = new Set<string>();   // referenced by a recipe, defined NOWHERE + not obtainable
  const ingLootOnly = new Set<string>();  // obtainable as loot/drop but in no item table (→ blank misc)
  for (const r of rows(resolveTable('recipes', []))) {
    const result = str(r.result);
    if (result && !itemExists(result)) err('recipe.result.missing', 'Crafting recipes', `Recipe result "${result}" isn't in any item table — it will craft to a blank "misc".`, { id: result, suggestion: 'Add it to Weapons/Armor/Gear/Exploration/Amulets/Rings/DogGear.' });
    for (const ing of rows(r.ingredients)) {
      const name = str(ing.name);
      if (!name) continue;
      if (itemExists(name)) continue; // in a catalog table → fine
      if (lootNames.has(name.toLowerCase())) {
        ingLootOnly.add(name);
        warn('recipe.ingredient.lootonly', 'Crafting recipes', `Recipe "${result ?? '?'}" uses "${name}", which is obtainable as loot but isn't in any item table — add a Materials row so it has stats (otherwise it grants/crafts as a blank "misc").`, { id: name });
      } else {
        ingMissing.add(name);
        err('recipe.ingredient.missing', 'Crafting recipes', `Recipe "${result ?? '?'}" needs ingredient "${name}", which isn't a known item/material and isn't dropped or obtainable anywhere — add it to your Materials table.`, { id: name });
      }
    }
  }
  if (ingMissing.size > 0) info('recipe.materials.add', 'Crafting recipes', `Materials to ADD (recipe ingredients defined nowhere): ${[...ingMissing].sort().join(', ')}.`);
  if (ingLootOnly.size > 0) info('recipe.materials.define', 'Crafting recipes', `Loot-only recipe ingredients to DEFINE in Materials (currently blank "misc"): ${[...ingLootOnly].sort().join(', ')}.`);

  // 3) Vendors + roadside traders: offered items must exist; declared faction must be real.
  const checkOffers = (label: string, list: unknown[] | null) => {
    for (const v of rows(list)) {
      const fac = str(v.faction);
      if (fac && !factionIds.has(fac)) warn('vendor.faction.missing', label, `"${str(v.name) ?? '?'}" lists faction "${fac}", which isn't a defined faction.`, { id: fac });
      const offers = rows(v.offers).length ? rows(v.offers) : rows(v.pool);
      for (const o of offers) {
        if (!itemExists(o.itemName)) err('vendor.item.missing', label, `"${str(v.name) ?? '?'}" sells "${str(o.itemName) ?? '?'}", which isn't a known item.`, { id: str(o.itemName) ?? undefined });
      }
    }
  };
  checkOffers('Vendors', getVendorsOverride());
  checkOffers('Roadside traders', getRoadsideOverride());

  // 4) Faction quests: factionId real; fetch item + reward items must exist.
  for (const q of rows(resolveMissions('factionQuests', []))) {
    const fac = str(q.factionId);
    if (fac && !factionIds.has(fac)) err('quest.faction.missing', 'Faction missions', `Quest "${str(q.title) ?? str(q.id) ?? '?'}" posts for faction "${fac}", which isn't defined.`, { id: fac });
    const fetch = q.fetch && typeof q.fetch === 'object' ? (q.fetch as Record<string, unknown>) : null;
    if (fetch && !itemExists(fetch.itemName)) err('quest.fetch.missing', 'Faction missions', `Fetch quest "${str(q.title) ?? '?'}" wants "${str(fetch.itemName) ?? '?'}", which isn't a known item.`, { id: str(fetch.itemName) ?? undefined });
    const reward = q.reward && typeof q.reward === 'object' ? (q.reward as Record<string, unknown>) : null;
    for (const it of (Array.isArray(reward?.items) ? reward!.items : [])) {
      if (!itemExists(it)) warn('quest.reward.missing', 'Faction missions', `Quest "${str(q.title) ?? '?'}" rewards "${str(it) ?? '?'}", which isn't a known item — it won't be granted.`, { id: str(it) ?? undefined });
    }
  }

  // 5) Main quest: each step's boss must exist; a referenced location should exist.
  const steps = rows(getCustomMainQuest()?.steps);
  if (getCustomMainQuest() && steps.length === 0) info('mainquest.empty', 'Main quest', 'Main quest is defined but has no steps — the win condition can never trigger.');
  for (const s of steps) {
    const bossId = str(s.bossId);
    if (bossId && !bossIds.has(bossId)) err('mainquest.boss.missing', 'Main quest', `A step references boss "${bossId}", which isn't in your Bosses table — that step can't complete.`, { id: bossId });
    const loc = str(s.locationId);
    if (loc && locationIds.size > 0 && !locationIds.has(loc)) warn('mainquest.location.missing', 'Main quest', `A step targets location "${loc}", which isn't a known location.`, { id: loc });
  }

  // 6) Bosses: drops + spawn location.
  for (const b of rows(getCustomBosses())) {
    for (const d of (Array.isArray(b.drops) ? b.drops : [])) {
      if (!itemExists(d)) warn('boss.drop.missing', 'Bosses', `Boss "${str(b.name) ?? str(b.id) ?? '?'}" drops "${str(d) ?? '?'}", which isn't a known item.`, { id: str(d) ?? undefined });
    }
    const sp = str(b.spawnLocationId);
    if (sp && locationIds.size > 0 && !locationIds.has(sp)) warn('boss.spawn.missing', 'Bosses', `Boss "${str(b.name) ?? '?'}" spawns at "${sp}", which isn't a known location.`, { id: sp });
  }

  // 7) Starting areas: faction real; placement location; room exits must resolve; one mission board.
  for (const a of rows(getStartingAreas() as unknown[])) {
    const fac = str(a.factionId);
    if (fac && !factionIds.has(fac)) err('area.faction.missing', 'Starting areas', `A starting area is for faction "${fac}", which isn't defined.`, { id: fac });
    const loc = str(a.locationId);
    if (loc && locationIds.size > 0 && !locationIds.has(loc)) warn('area.location.missing', 'Starting areas', `Starting area "${str(a.name) ?? '?'}" is placed at "${loc}", which isn't a known location.`, { id: loc });
    const areaRooms = rows(a.rooms);
    const roomIds = new Set(areaRooms.map((r) => str(r.id)).filter(Boolean) as string[]);
    for (const room of areaRooms) {
      const exits = room.exits && typeof room.exits === 'object' ? (room.exits as Record<string, unknown>) : {};
      for (const [dir, target] of Object.entries(exits)) {
        const t = str(target);
        if (t && t !== 'world' && !roomIds.has(t)) {
          err('area.exit.dangling', 'Starting areas', `Room "${str(room.id) ?? '?'}" has an exit (${dir}) to "${t}", which isn't a room in this area (use a room id, "world", or null).`, { id: t });
        }
      }
    }
    const boards = areaRooms.filter((r) => r.missionBoard === true).length;
    if (areaRooms.length > 0 && boards === 0) warn('area.noboard', 'Starting areas', `Starting area "${str(a.name) ?? '?'}" has no missionBoard room — players there can't pick up faction work.`);
  }

  // 8) Hooks + whispers: effect verbs known; granted items / unlocked locations / rep factions real.
  const checkEffects = (section: string, who: string, effects: unknown) => {
    for (const e of rows(effects)) {
      const type = str(e.type);
      if (type && !EFFECT_VERBS.has(type)) { err('effect.verb.unknown', section, `${who} uses unknown effect "${type}" — it will do nothing. Valid verbs: ${[...EFFECT_VERBS].join(', ')}.`, { id: type }); continue; }
      if (type === 'grant_item' && !itemExists(e.name)) err('effect.item.missing', section, `${who} grants "${str(e.name) ?? '?'}", which isn't a known item.`, { id: str(e.name) ?? undefined });
      if (type === 'unlock_location' && locationIds.size > 0 && !locationIds.has(str(e.locationId) ?? '')) warn('effect.location.missing', section, `${who} unlocks "${str(e.locationId) ?? '?'}", which isn't a known location.`, { id: str(e.locationId) ?? undefined });
      if (type === 'rep_change' && !factionIds.has(str(e.factionId) ?? '')) warn('effect.faction.missing', section, `${who} changes rep with "${str(e.factionId) ?? '?'}", which isn't a defined faction.`, { id: str(e.factionId) ?? undefined });
    }
  };
  const hooks = getHooksOverride();
  if (hooks?.chains) {
    for (const [hookId, stages] of Object.entries(hooks.chains)) {
      for (const stage of rows(stages)) checkEffects('Hooks', `Hook "${hookId}"`, stage.effects);
    }
  }
  for (const w of rows(resolveWhispers([]))) {
    const wname = str(w.title) ?? str(w.id) ?? 'a whisper';
    checkEffects('Whispers', `Whisper "${wname}"`, w.meetEffects);
    for (const stage of rows(w.stages)) checkEffects('Whispers', `Whisper "${wname}"`, stage.effects);
  }

  // 9) Summoned sidekicks: fuel must be real items.
  const summons = getSummonsOverride();
  for (const def of rows(summons?.defs)) {
    for (const f of rows(def.fuel)) {
      if (!itemExists(f.name)) err('summon.fuel.missing', 'Summoned sidekicks', `Sidekick "${str(def.name) ?? '?'}" needs fuel "${str(f.name) ?? '?'}", which isn't a known item.`, { id: str(f.name) ?? undefined });
    }
  }

  // 10) Wasteland encounters: enemyPool names must exist in the Enemies table.
  const wasteland = getWastelandOverride();
  if (wasteland) {
    for (const [archId, arch] of Object.entries(wasteland)) {
      const pool = arch && typeof arch === 'object' ? (arch as Record<string, unknown>).enemyPool : null;
      for (const name of (Array.isArray(pool) ? pool : [])) {
        const n = str(name)?.toLowerCase();
        if (n && enemyNames.size > 0 && !enemyNames.has(n)) err('encounter.enemy.missing', 'Travel encounters', `Encounter "${archId}" lists enemy "${str(name)}", which isn't in your Enemies table.`, { id: str(name) ?? undefined });
      }
    }
  }

  // engine_Dev — the silent-no-op classes. The engine drops unrecognized enum values
  // and keeps going, so these never crash but the authored feature does NOTHING at
  // runtime, with no error. Surface them HERE so the author sees them before bake.

  // 12) Armor slot must be an equip slot, or the item can NEVER be equipped (validSlotsForItem
  // returns [] for any armor whose `slot` is outside the EquipSlot set — equipment.ts).
  const VALID_SLOTS = new Set(['main', 'off', 'head', 'chest', 'hands', 'legs', 'feet', 'cloak', 'amulet', 'ring']);
  for (const a of rows(resolveTable('armor', []))) {
    const slot = str(a.slot);
    if (slot && !VALID_SLOTS.has(slot)) err('armor.slot.invalid', 'Armor', `Armor "${str(a.name) ?? '?'}" has slot "${slot}", which isn't an equip slot — it can never be worn. Use one of head/chest/legs/feet/hands/cloak/amulet/ring (or move accessories to the Amulets/Rings table).`, { id: slot });
  }

  // 13) Stat names. The engine tracks exactly STR/DEX/INT/WIS/CHA/STE (+ hp / staminaMax as gear
  // bonuses). Any other stat on a race/faction/item/title bonus is silently dropped (does nothing).
  const VALID_STATS = new Set(['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth', 'hp', 'staminamax']);
  const checkStat = (section: string, who: string, statName: unknown) => {
    const s = str(statName)?.toLowerCase();
    if (s && !VALID_STATS.has(s)) warn('stat.unknown', section, `${who} grants stat "${str(statName)}", which the engine doesn't track (only STR/DEX/INT/WIS/CHA/STE, plus hp/staminaMax on gear) — the bonus does nothing.`, { id: str(statName) ?? undefined });
  };
  const checkStatBonuses = (section: string, who: string, row: Record<string, unknown>) => {
    const single = row.statBonus && typeof row.statBonus === 'object' ? (row.statBonus as Record<string, unknown>) : null;
    if (single) checkStat(section, who, single.stat);
    for (const b of rows(row.statBonuses)) checkStat(section, who, b.stat);
  };
  for (const t of ['armor', 'amulets', 'rings'] as const) {
    for (const r of rows(resolveTable(t, []))) checkStatBonuses(t, `"${str(r.name) ?? '?'}"`, r);
  }
  for (const r of rows(resolveTable('races', []))) {
    const b = r.racialStatBonuses && typeof r.racialStatBonuses === 'object' ? r.racialStatBonuses as Record<string, unknown> : {};
    for (const k of Object.keys(b)) checkStat('Races', `Race "${str(r.name) ?? '?'}"`, k);
  }
  for (const r of rows(resolveTable('factions', []))) {
    const b = r.factionStatBonuses && typeof r.factionStatBonuses === 'object' ? r.factionStatBonuses as Record<string, unknown> : {};
    for (const k of Object.keys(b)) checkStat('Factions', `Faction "${str(r.name) ?? '?'}"`, k);
  }
  for (const r of rows(getCustomTitles())) {
    const perk = r.perk && typeof r.perk === 'object' ? (r.perk as Record<string, unknown>) : null;
    if (perk) checkStat('Titles', `Title "${str(r.name) ?? str(r.id) ?? '?'}"`, perk.stat);
  }

  // 14) Boss spawnCondition must be one the engine acts on, or the boss never appears.
  const VALID_SPAWN = new Set(['main_quest', 'location', 'random']);
  for (const b of rows(getCustomBosses())) {
    const sc = str(b.spawnCondition);
    if (sc && !VALID_SPAWN.has(sc)) err('boss.spawncondition.invalid', 'Bosses', `Boss "${str(b.name) ?? '?'}" has spawnCondition "${sc}" — only main_quest, location, random are recognized, so it will never spawn. (A fixed-tile boss = "location"; a main-quest kill target = "main_quest".)`, { id: sc });
  }

  // 15) Faction-quest stage advanceOn must be a real trigger, or that stage can't complete.
  const VALID_ADVANCE = new Set(['kill', 'travel', 'any']);
  for (const q of rows(resolveMissions('factionQuests', []))) {
    for (const stg of rows(q.stages)) {
      const adv = str(stg.advanceOn);
      if (adv && !VALID_ADVANCE.has(adv)) err('quest.advanceon.invalid', 'Faction missions', `Quest "${str(q.title) ?? str(q.id) ?? '?'}" has a stage advanceOn "${adv}" — only kill, travel, any advance a faction quest, so that stage can never complete.`, { id: adv });
    }
  }

  // 16) Dog-rescue scenarios: captorFactionId must be a real faction id (or null = unaligned).
  for (const d of rows(getDogScenariosOverride())) {
    const cf = d.captorFactionId;
    if (cf != null && !(typeof cf === 'string' && factionIds.has(cf))) err('dog.faction.invalid', 'Dog scenarios', `Dog scenario "${str(d.id) ?? '?'}" has captorFactionId "${String(cf)}", which isn't a defined faction id — the "never fight your own faction" protection won't work. Use a real faction id, or null for the one unaligned fallback.`, { id: typeof cf === 'string' ? cf : undefined });
  }

  // 17) Damage types. Combat matches a weapon's damageType against an enemy's resist/weak
  // lists by EXACT name, and on-hit effects come from the damageTypes registry by name. A
  // name that's neither a built-in type nor a defined author damageType silently misfires
  // (no on-hit effect; resist/weak never lines up unless spelled identically everywhere).
  const BUILTIN_DMG = ['degradation', 'bludgeoning', 'burn', 'aetheric', 'electrical', 'piercing', 'poison', 'radiation', 'slashing', 'stun'];
  const definedDmg = new Set<string>([...BUILTIN_DMG, ...getExtraDamageTypes().map((d) => str(d.name)?.toLowerCase()).filter(Boolean) as string[]]);
  for (const wpn of rows(resolveTable('weapons', []))) {
    const dt = str(wpn.damageType)?.toLowerCase();
    if (dt && !definedDmg.has(dt)) warn('damage.type.undefined', 'Weapons', `Weapon "${str(wpn.name) ?? '?'}" deals damage type "${str(wpn.damageType)}", which isn't a built-in type or a defined Damage Types entry — its on-hit effect won't fire and resist/weak won't line up. Add it to Damage Types or use a defined one.`, { id: str(wpn.damageType) ?? undefined });
  }
  const resMap = getDamageResistancesOverride();
  if (resMap) {
    for (const [enemy, e] of Object.entries(resMap)) {
      const row = e && typeof e === 'object' ? (e as Record<string, unknown>) : {};
      for (const side of ['resist', 'weak'] as const) {
        for (const t of (Array.isArray(row[side]) ? row[side] as unknown[] : [])) {
          const lc = str(t)?.toLowerCase();
          if (lc && !definedDmg.has(lc)) warn('damage.resist.undefined', 'Damage resistances', `"${enemy}" lists ${side} "${str(t)}", which isn't a defined damage type — it can never match (e.g. use "cold" not "frost", "electrical" not "shock").`, { id: str(t) ?? undefined });
        }
      }
    }
  }

  // 18) Power coat_enemies coatings must be a real DOT kind, or the coat never ticks/expires.
  const VALID_COAT = new Set(['poison_coat', 'acid_coat', 'corruption_coat', 'electrical_coat', 'burn_coat']);
  for (const p of rows(resolveTable('powers', []))) {
    const eff = p.effect && typeof p.effect === 'object' ? (p.effect as Record<string, unknown>) : null;
    if (eff && str(eff.kind) === 'coat_enemies') {
      const c = str(eff.coating);
      if (c && !VALID_COAT.has(c)) err('power.coating.invalid', 'Powers', `Power "${str(p.name) ?? '?'}" coats enemies with "${c}", which isn't a damage-over-time kind — it never ticks or expires (the cast log claims damage it never deals). Use one of: ${[...VALID_COAT].join(', ')}.`, { id: c });
    }
  }

  // 19) Collectable fragments only drop where a location's tags overlap the fragment's
  // biomeTags. A fragment whose biomeTags match NO location can never drop → its story
  // is uncompletable.
  const locTags = new Set<string>();
  for (const l of rows(resolveTable('locations', locationsBuiltin as unknown[]))) {
    for (const t of (Array.isArray(l.tags) ? l.tags : [])) { const s = str(t)?.toLowerCase(); if (s) locTags.add(s); }
  }
  if (locTags.size > 0) {
    for (const story of rows(getCollectablesOverride())) {
      for (const f of rows(story.fragments)) {
        const tags = (Array.isArray(f.biomeTags) ? f.biomeTags : []).map((t) => str(t)?.toLowerCase()).filter(Boolean) as string[];
        if (tags.length > 0 && !tags.some((t) => locTags.has(t))) warn('collectable.unreachable', 'Collectables', `Collectable fragment "${str(f.id) ?? str(f.title) ?? '?'}" has biomeTags ${JSON.stringify(tags)}, none of which appear on any location — it can never drop, so its story can't be completed.`, { id: str(f.id) ?? undefined });
      }
    }
  }

  // 11) Completeness nudges.
  if (rows(resolveTable('races', [])).length === 0) warn('tables.races.empty', 'Tables', 'No Races uploaded — character creation will use the bland generic races.');
  if (rows(resolveTable('factions', [])).length === 0) warn('tables.factions.empty', 'Tables', 'No Factions uploaded — character creation will use the bland generic factions.');

  // Dedupe identical issues. A few checks can surface the SAME finding twice — e.g. an item that
  // carries a perk in both `statBonus` (singular) and `statBonuses` (plural) gets the same
  // stat.unknown warning from each — which reads as two separate problems. Collapse on the fields
  // the reader sees (severity + code + section + message + id) so each distinct finding lists once.
  const seenIssue = new Set<string>();
  const deduped = issues.filter((i) => {
    const k = `${i.severity}|${i.code}|${i.section}|${i.message}|${i.id ?? ''}`;
    if (seenIssue.has(k)) return false;
    seenIssue.add(k);
    return true;
  });
  return deduped;
}

/** Structured pre-export report: errors block, warnings/info don't. */
export function runValidation(): ValidationReport {
  const all = validateGame();
  const errors = all.filter((i) => i.severity === 'error');
  const warnings = all.filter((i) => i.severity === 'warning');
  const info = all.filter((i) => i.severity === 'info');
  return { ok: errors.length === 0, errorCount: errors.length, warningCount: warnings.length, infoCount: info.length, errors, warnings, info };
}

/** Summarize for the dev panel: counts + the first lines, errors → warnings → info. */
export function summarizeValidation(issues: ValidationIssue[]): { errors: number; warnings: number; info: number; lines: string[] } {
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  const glyph: Record<Severity, string> = { error: '✗', warning: '⚠', info: 'ℹ' };
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
    lines: sorted.map((i) => `${glyph[i.severity]} [${i.section}] ${i.message}`),
  };
}
