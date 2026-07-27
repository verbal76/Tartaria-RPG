import type { Enemy, WeatherEntry, Hazard, Location, WorldMemory, Rarity } from './types';
import { pick, pickWeighted, chance } from './rng';
import { enemyTypeDefenses } from './crafting';
import enemiesData from '../data/enemies/enemies.json';
import weatherData from '../data/weather/weather.json';
import hazardsData from '../data/hazards/hazards.json';
import locationsData from '../data/locations/locations.json';
import lootData from '../data/relics/loot_tables.json';
import type { LadderTriple } from './worldLadder';

const enemies = enemiesData as Enemy[];
const weather = weatherData as WeatherEntry[];
const hazards = hazardsData as Hazard[];
const locations = locationsData as Location[];

/** Lookup an enemy by name. Used by the wasteland-encounter skirmish
 *  spawner to convert a name in the encounter pool into a real Enemy
 *  the combat system can use. Returns a fresh copy so trait state
 *  doesn't bleed between scenes. */
export function findEnemyByName(name: string): Enemy | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  const match = enemies.find((e) => e.name.toLowerCase() === t);
  if (!match) return null;
  return JSON.parse(JSON.stringify(match)) as Enemy;
}

interface LootEntry { name: string; rarity: Rarity }
const loot = lootData as LootEntry[];

const rarityWeights: Record<Rarity, number> = {
  Common: 10,
  Uncommon: 5,
  Rare: 2,
  Legendary: 1,
};

// OTA-980 — #122: LOCALE BIAS. Weather reads the ground it falls on: Aetheric
// country draws its own lightning, mud country its black rain, ash country its
// storms, the frozen reaches their blizzards. Keyword match over the
// location's id + name; biased ids get their novelty weight multiplied, so
// local color dominates without ever locking the sky to one entry.
const WEATHER_LOCALE_BIAS: Array<{ re: RegExp; bias: Record<string, number> }> = [
  { re: /aether|etheric|spire|monolith|grid/i, bias: { aether_lightning: 3, etheric_storm: 3 } },
  { re: /mud|silt|marsh|bog|sunken|drowned/i, bias: { black_rain: 3, whisper_fog: 2 } },
  { re: /\b(ash|ashfall|cinder|burnt?|ember)\b/i, bias: { ash_storm: 3 } },
  { re: /\b(frost|frozen|ice|icebound|blizzard|glacier|tundra)\b/i, bias: { silent_blizzard: 3 } },
];

/** Resolve a weather table entry by id (used to rehydrate persisted scene
 *  weather without re-rolling). */
export function weatherById(id: string): WeatherEntry | null {
  return weather.find((w) => w.id === id) ?? null;
}

export function pickWeather(
  memory: WorldMemory,
  location?: { id: string; name: string; tags?: readonly string[] } | null,
): WeatherEntry {
  // OTA-993 — the location's TAGS carry its climate (yuldra_tul's frost, the ten
  // borderlands outposts' mud, the spires' aetheric cores). Matching id+name
  // alone left 31 of 36 locations with an unbiased sky and the frost/ash rows
  // matching nothing at all.
  const key = location
    ? `${location.id} ${location.name} ${(location.tags ?? []).join(' ')}`.toLowerCase()
    : '';
  const bias: Record<string, number> = {};
  if (key) {
    for (const row of WEATHER_LOCALE_BIAS) {
      if (!row.re.test(key)) continue;
      for (const id of Object.keys(row.bias)) {
        bias[id] = Math.max(bias[id] ?? 1, row.bias[id]!);
      }
    }
  }
  return pickWeighted(weather, (w) => {
    const seen = memory.tagCounts[w.id] ?? 0;
    return Math.max(1, 5 - seen) * (bias[w.id] ?? 1);
  });
}

export function pickHazardForLocation(location: Location, dangerBoost = 0): Hazard | null {
  if (!chance(30 + (location.danger + dangerBoost) * 8)) return null;
  return pick(hazards);
}

// OTA-816 — REGULAR-ENEMY SCALING. Base enemy stats come straight from
// enemies.json, so an over-leveled character farmed low-HP trash (a 15-HP Aetherbat
// stayed 15 HP forever — free XP/loot) while the danger tiers only ever changed WHICH
// rarity could spawn, never the numbers. This lifts a NON-BOSS enemy's HP (and lightly
// its attack/AC) by two axes:
//   • player power  — a strong character stops farming trivial mobs
//   • area danger    — a deep zone bites harder than the frontier
// It is deliberately GENTLER than the Guardian curve: bosses/Guardians are SKIPPED
// (they carry their own scaling), the HP the multiplier can ADD is capped flat so a
// big Legendary doesn't explode, and a fresh arrival in a danger-0 zone is left
// EXACTLY as authored — "low level is still low level". Knobs are all here.

/** How strong is this character. Best offensive stat + a slice of the HP pool — the
 *  same proxy the Guardian scaler uses, kept in sync deliberately. */
export function enemyScalePower(bestCombatStat: number, hpMax: number): number {
  return bestCombatStat + hpMax / 10;
}

function bumpAbilityPointNumber(ap: string | number | undefined, bonus: number): string {
  const s = String(ap ?? 'Strength 3');
  if (bonus <= 0) return s;
  const m = s.match(/^(\w+)\s+(\d+)/);
  if (!m) return s;
  return `${m[1]} ${parseInt(m[2]!, 10) + bonus}`;
}

/** Over-level term: 0 at a fresh arrival → 1 at end-game. Shared by solo + pack. */
function overLevelT(power: number): number {
  return Math.max(0, Math.min(1, (power - 14) / 18));
}

// OTA-799 — THEMATIC (Pokémon-route) weakness. OTA-818 rolled a fully RANDOM weakness,
// which killed the "1-kit-fits-all" staleness but read as nonsense (a mud creature weak
// to cold) and broke immersion. This keeps the VARIETY but makes it BELIEVABLE: each
// creature TYPE has a small pool of thematically-plausible weaknesses, and a spawn rolls
// ONE from it — so a mud thing is always weak to something mud-appropriate (dries in
// fire / conducts a shock / rots in radiation), but WHICH varies fight to fight. You
// bring a small toolkit and read the enemy, never memorize one answer.
//
// Hardness = MEDIUM (player's call): the rolled weakness is super-effective (×1.5) and
// everything else stays NORMAL and still works — you're never hard-locked. Each spawn
// also takes ONE soft resist (×0.5) from its type's resist pool, and ~35% of spawns get
// a REAL WALL (×0.25) on a type its kind is already armored against — achieved for free
// by STACKING a `resist:` trait onto a type the TYPE-MAP already resists (combine
// multiplies 0.5×0.5). Weakness/soft-resist ride the trait resolver exactly like 818.
// Bosses/Guardians keep their authored thematic defenses.
interface DefensePool { weak: string[]; resist: string[] }
const THEMATIC_DEFENSE_POOLS: Record<string, DefensePool> = {
  // waterlogged earth — fire dries it, shock conducts, radiation rots; shrugs blades/cold.
  'mud creature':      { weak: ['burn', 'radiation', 'electrical'], resist: ['cold', 'bludgeoning'] },
  // unstable energy-flesh — radiation destabilizes it, fire, blunt trauma disrupts.
  'aetheric mutation': { weak: ['radiation', 'burn', 'bludgeoning'], resist: ['poison', 'cold'] },
  // a being of pure aether — break the FORM: blunt, cold-dampen, or cut it.
  'aetheric creature': { weak: ['bludgeoning', 'cold', 'slashing'], resist: ['poison', 'radiation'] },
  // machines — fry the circuits, dent the casing, or disrupt with aether.
  'automation':        { weak: ['electrical', 'bludgeoning', 'aetheric'], resist: ['poison', 'cold'] },
  'mechanism':         { weak: ['electrical', 'bludgeoning', 'aetheric'], resist: ['poison', 'cold'] },
  'mech-construct':    { weak: ['electrical', 'bludgeoning', 'aetheric'], resist: ['poison', 'cold'] },
  // flesh — pierce it, poison it, cut it, burn it; unmoved by aether tricks.
  'animal':            { weak: ['piercing', 'poison', 'cold', 'slashing'], resist: ['aetheric'] },
  'human':             { weak: ['piercing', 'poison', 'burn', 'slashing'], resist: ['aetheric'] },
  // an unbound husk — burn it, irradiate it, or unmake it with aether; poison/cold do little.
  'aetheric undead':   { weak: ['burn', 'radiation', 'aetheric'], resist: ['poison', 'cold'] },
};
const FALLBACK_DEFENSE_POOL: DefensePool = { weak: ['slashing', 'piercing', 'burn', 'bludgeoning'], resist: ['aetheric'] };

function thematicPoolFor(enemyType: string | null | undefined): DefensePool {
  return THEMATIC_DEFENSE_POOLS[(enemyType ?? '').toLowerCase()] ?? FALLBACK_DEFENSE_POOL;
}

/** Read a type's THEMATIC weakness pool (for tooling/tests). */
export function thematicWeaknessPool(enemyType: string | null | undefined): string[] {
  return thematicPoolFor(enemyType).weak;
}

/** Stamp a thematically-plausible, per-spawn weakness (+ a soft resist, and ~35% a
 *  hard wall) onto a NON-boss enemy. Idempotent via `profiled`. Pure; `rng` injectable. */
export function randomizeEnemyDefense(enemy: Enemy, rng: () => number = Math.random): Enemy {
  if (enemy.boss) return enemy;
  const traits = [...(enemy.traits ?? [])];
  if (traits.includes('profiled')) return enemy;                 // already rolled — don't re-roll
  const pool = thematicPoolFor(enemy.type);
  const pick = (arr: readonly string[]) => arr[Math.floor(rng() * arr.length)];
  const newWeak = pick(pool.weak) ?? 'slashing';
  const softResist = pool.resist.length ? pick(pool.resist.filter((r) => r !== newWeak)) : undefined;
  // Neutralize the type-map's DEFAULT weaknesses (bar the rolled one) so the old fixed
  // answer doesn't still work — a resist trait wins the discord vs a type weak.
  const map = enemyTypeDefenses(enemy.type);
  for (const w of map.weak) {
    if (w !== newWeak && !traits.includes(`resist:${w}`)) traits.push(`resist:${w}`);
  }
  if (!traits.includes(`vulnerable:${newWeak}`)) traits.push(`vulnerable:${newWeak}`);
  if (softResist && softResist !== newWeak && !traits.includes(`resist:${softResist}`)) traits.push(`resist:${softResist}`);
  // MEDIUM hardness — ~35% of spawns get a real ×0.25 WALL on a type their kind is
  // already armored against (stacking a trait resist onto a type-map resist). Believable
  // (extra-plated construct, silt-caked mud) and occasional, not every fight.
  if (rng() < 0.35 && map.resist.length) {
    const wall = pick(map.resist.filter((r) => r !== newWeak));
    if (wall && !traits.includes(`resist:${wall}`)) traits.push(`resist:${wall}`);
  }
  traits.push('profiled');
  return { ...enemy, traits };
}

/** The HP a SINGLE enemy of `baseHp` scales to on this tile — floor (anti-farm) +
 *  a flat-capped multiplier (so a big Legendary is nudged, not exploded). */
function soloScaledHp(baseHp: number, d: number, t: number): number {
  const areaFactor = 1 + d * 0.12;                               // 1.0 (frontier) .. 1.6 (deep)
  const floor = Math.round((34 + d * 6) * t);                    // maxed: ~34 (d0) .. ~64 (d5)
  const addCap = 22 + d * 8;
  const added = Math.min(baseHp * 0.5 * t * areaFactor, addCap);
  return Math.round(Math.max(baseHp + added, floor));
}

/** Scale one rolled enemy to the player's power and the tile's danger. Pure; returns
 *  a fresh object (never mutates). Bosses pass through untouched. Use for SOLO spawns
 *  (rest-ambush, hook spawns); packs go through scaleEncounterForContext. */
export function scaledEnemyForContext(enemy: Enemy, danger: number, power: number, rng: () => number = Math.random): Enemy {
  if (enemy.boss) {
    // OTA-896 (SA-4) — Core Guardians own their curve (spawnGuardianForCapital);
    // every other boss-flagged story boss was left FIXED here ("tuned elsewhere"
    // — it never was), a flat 458-700 HP slog. Route it through the two-sided
    // static-boss scaler so it tracks the player like the Legendaries already do.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { scaleStaticBoss } = require('./coreGuardians') as typeof import('./coreGuardians');
    return scaleStaticBoss(power, enemy);
  }
  const d = Math.max(0, danger);
  const t = overLevelT(power);
  // HP/attack scale with power+danger (a no-op for a fresh player on a frontier tile),
  // but the WEAKNESS is randomized either way — engagement at every level.
  const hp = (t <= 0 && d <= 0) ? enemy.hp : soloScaledHp(enemy.hp, d, t);
  // Attack/AC: a small bump (abilityPoint drives both, per combatRules) so a scaled
  // enemy can still land on a geared player — modest, +1 (d0) .. +4 (d5) at max power.
  const bonus = Math.round(t * (1 + d * 0.5));
  return randomizeEnemyDefense({ ...enemy, hp, abilityPoint: bumpAbilityPointNumber(enemy.abilityPoint, bonus) }, rng);
}

// OTA-797 — PACK-AWARE scaling. A pack must be scaled as a PACKAGE, not per-body: if
// you floored each of 3 foes to a solo target (3 × ~34-64) and stood them together,
// the trio would out-HP a boss — and with 3 attacks/round it would be brutal (player's
// call: "scale multiples as a package not individually"). So a multi-enemy encounter
// SHARES one budget: it anchors on what a SINGLE enemy (of the pack's mean base HP)
// would scale to, adds a SMALL premium per extra body (action economy already makes N
// foes harder per-HP, so the HP premium stays modest), hard-caps the pack total UNDER
// a boss's HP, then distributes that total across the members by base-HP weight (so a
// brute in the pack still out-bulks a rat). Attack/AC bumps are also softened for pack
// members (they're many). Bosses in the mix pass through untouched and don't share the
// pack budget.

/** Pack-total HP ceiling — a pack never out-HPs a boss for the same player/tile. */
function packHpCeiling(d: number): number {
  return 70 + d * 10;                                            // d0 70 .. d5 120 (bosses run higher)
}

/** Scale a rolled encounter to player power + tile danger. A single non-boss enemy
 *  scales solo; a multi-foe pack is scaled as one shared, boss-capped budget. */
export function scaleEncounterForContext(enemies: readonly Enemy[], danger: number, power: number): Enemy[] {
  const d = Math.max(0, danger);
  const t = overLevelT(power);
  const nonBossIdx = enemies.map((e, i) => (e.boss ? -1 : i)).filter((i) => i >= 0);
  // OTA-896 (SA-4) — boss members (story bosses) now scale to the player via the
  // static-boss scaler instead of passing through fixed. scaledEnemyForContext
  // already routes bosses through it, so the solo path is covered; the frontier
  // and pack paths below scale their boss members explicitly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scaleStaticBoss } = require('./coreGuardians') as typeof import('./coreGuardians');
  // Solo (0/1 non-boss foe) → per-enemy scaling, unchanged.
  if (nonBossIdx.length <= 1) return enemies.map((e) => scaledEnemyForContext(e, d, power));
  // Fresh player on a frontier tile → HP as authored, but still randomize weakness.
  if (t <= 0 && d <= 0) return enemies.map((e) => (e.boss ? scaleStaticBoss(power, e) : randomizeEnemyDefense({ ...e })));

  const pack = nonBossIdx.map((i) => enemies[i]!);
  const totalBase = pack.reduce((s, e) => s + Math.max(1, e.hp), 0);
  const meanBase = totalBase / pack.length;
  // Anchor on one solo-equivalent (of the mean body) + a small premium per extra body.
  const soloAnchor = soloScaledHp(meanBase, d, t);
  const premium = 1 + 0.22 * (pack.length - 1);                  // 2→1.22, 3→1.44
  const packTotal = Math.min(Math.round(soloAnchor * premium), packHpCeiling(d));
  // Softer attack/AC bump than a solo foe (there are several of them).
  const bonus = Math.round(t * (1 + d * 0.5) * 0.6);
  const out = enemies.map((e) => (e.boss ? scaleStaticBoss(power, e) : { ...e }));
  for (const i of nonBossIdx) {
    const e = enemies[i]!;
    const share = Math.max(6, Math.round((packTotal * Math.max(1, e.hp)) / totalBase));
    // Each pack member ALSO gets an independent randomized weakness (a pack of a
    // drone/bandit/rat then carries three different answers in one fight).
    out[i] = randomizeEnemyDefense({ ...e, hp: share, abilityPoint: bumpAbilityPointNumber(e.abilityPoint, bonus) });
  }
  return out;
}

export function pickEnemyForLocation(location: Location): Enemy | null {
  // OTA-187 — base scene-arrival enemy chance bumped from 40 to 50
  // (10pp) per playtester: "the game is a little shy on combat."
  // At danger 0 outskirts this lifts from 40% → 50% per scene
  // arrival; danger 3 capitals from 64% → 74%; danger 5 deep zones
  // already capped at 80% before, now 90%.
  if (!chance(50 + location.danger * 8)) return null;
  const dangerCap: Rarity = location.danger >= 4 ? 'Legendary' : location.danger >= 3 ? 'Rare' : location.danger >= 2 ? 'Uncommon' : 'Common';
  const allowed = enemies.filter((e) => rarityRank(e.rarity) <= rarityRank(dangerCap));
  if (allowed.length === 0) return null;
  return pickWeighted(allowed, (e) => rarityWeights[e.rarity]);
}

export function pickEnemyForLocationGuaranteed(location: Location, playerHpMax?: number): Enemy | null {
  const dangerCap: Rarity = location.danger >= 4 ? 'Legendary' : location.danger >= 3 ? 'Rare' : location.danger >= 2 ? 'Uncommon' : 'Common';
  // OTA-243 — player-tier cap. Playtest report: Day 16 player with
  // 48 HP got a Mud Giant (Legendary, 360 HP, 4d6 damage) rest-
  // ambush in Asgardar (danger 5). The legendary roll was correct
  // for the location but disastrous for the player. Cap the picker
  // by player.hpMax so a starter never eats a legendary on a rest:
  //   hpMax < 60   → Common only
  //   hpMax < 100  → Common + Uncommon
  //   hpMax < 140  → + Rare
  //   hpMax ≥ 140  → all rarities (location-cap rules)
  // When playerHpMax is undefined the caller didn't opt in — keep
  // the legacy location-only behavior for back-compat.
  let effectiveCap: Rarity = dangerCap;
  if (typeof playerHpMax === 'number') {
    const playerCap: Rarity = playerHpMax < 60 ? 'Common'
      : playerHpMax < 100 ? 'Uncommon'
      : playerHpMax < 140 ? 'Rare'
      : 'Legendary';
    effectiveCap = rarityRank(playerCap) < rarityRank(dangerCap) ? playerCap : dangerCap;
  }
  const allowed = enemies.filter((e) => rarityRank(e.rarity) <= rarityRank(effectiveCap));
  if (allowed.length === 0) return null;
  return pickWeighted(allowed, (e) => rarityWeights[e.rarity]);
}

// Group encounter templates. Each entry produces a list of enemies — the
// engine spawns copies of the named enemy with a per-instance HP roll so a
// pack of three Bog Hounds aren't identical. Filtered by danger so a
// fresh character isn't ambushed by a Sentinel cohort at danger 1.
interface GroupTemplate {
  enemyName: string;
  count: number;
  /** Minimum location.danger required to roll this group. */
  minDanger: number;
  /** Relative weight when multiple groups match. */
  weight: number;
}

const GROUP_TEMPLATES: GroupTemplate[] = [
  { enemyName: 'Bog Hound', count: 3, minDanger: 1, weight: 5 }, // pack
  { enemyName: 'Mud Wasp', count: 4, minDanger: 1, weight: 4 },  // swarm
  { enemyName: 'Mud Spider', count: 2, minDanger: 1, weight: 5 },
  { enemyName: 'Mudling', count: 3, minDanger: 1, weight: 4 },
  { enemyName: 'Gutter Rat', count: 4, minDanger: 1, weight: 3 },
  { enemyName: 'Reclaimer Ambusher', count: 3, minDanger: 2, weight: 4 }, // ambush
  { enemyName: 'Mud Golem', count: 2, minDanger: 3, weight: 2 }, // cluster
  { enemyName: 'Mud Strider', count: 2, minDanger: 2, weight: 3 },
  { enemyName: 'Aetheric Ooze', count: 3, minDanger: 2, weight: 3 },
  { enemyName: 'Black Cloak Agent', count: 2, minDanger: 3, weight: 2 },
];

/** The rarity ceiling a tile's danger allows (shared by the pickers). */
function rarityCapForDanger(danger: number): Rarity {
  return danger >= 4 ? 'Legendary' : danger >= 3 ? 'Rare' : danger >= 2 ? 'Uncommon' : 'Common';
}

// OTA-797 — MIXED-ROLE PACKS. The scene-arrival path lets a single "curated" ladder
// enemy pre-empt the group roll, so in any explored (laddered) area you almost never
// faced more than one foe — the multi-enemy target-swipe UI and the companions it
// demands hadn't been seen in weeks. This ADDS role-diverse pack members to a rolled
// single enemy (a drone + a bandit + a rat), so you can't be in-range of everything at
// once and actually need the dog to pin the rusher / the golem to soak the shooter.
// Frequency scales with danger — a frontier tile still skews single ("low level is
// still low level"), a deep tile brings packs. Never packs onto a boss/Guardian.
// Diversity is by enemy TYPE, which also means MIXED WEAKNESSES in one fight (a pack
// of three types can't be answered by one coating) — the first half of the
// "no 1-kit-fits-all" ask, before per-instance weakness randomization lands.

/** Roll 0-2 additional, role-diverse foes to append to an existing single/small
 *  encounter. Pure; `rng` injectable for tests. */
export function rollExtraPackMembers(
  location: Location,
  existing: readonly Enemy[],
  opts?: { rng?: () => number },
): Enemy[] {
  const rng = opts?.rng ?? Math.random;
  const danger = Math.max(0, location.danger);
  if (existing.length === 0 || existing.length >= 3) return [];
  if (existing.some((e) => e.boss)) return [];            // never gang up onto a boss/Guardian
  // Pack chance climbs with danger: frontier ~10%, deep zone ~75%.
  const packChance = 0.10 + danger * 0.13;
  if (rng() >= packChance) return [];
  const cap = rarityCapForDanger(danger);
  const pool = enemies.filter((e) => !e.boss && rarityRank(e.rarity) <= rarityRank(cap));
  if (pool.length === 0) return [];
  const usedTypes = new Set(existing.map((e) => (e.type ?? '').toLowerCase()));
  const usedNames = new Set(existing.map((e) => e.name.toLowerCase()));
  const maxExtra = Math.min(3 - existing.length, danger >= 3 ? 2 : 1);
  const out: Enemy[] = [];
  for (let n = 0; n < maxExtra; n++) {
    // Prefer a DIFFERENT type than anything already in the pack (role/weakness
    // diversity); fall back to any not-yet-present name if the pool is thin.
    const diverse = pool.filter((e) => !usedTypes.has((e.type ?? '').toLowerCase()) && !usedNames.has(e.name.toLowerCase()));
    const choose = diverse.length ? diverse : pool.filter((e) => !usedNames.has(e.name.toLowerCase()));
    if (choose.length === 0) break;
    const picked = pickWeighted(choose, (e) => rarityWeights[e.rarity]);
    const inst = JSON.parse(JSON.stringify(picked)) as Enemy;
    usedTypes.add((inst.type ?? '').toLowerCase());
    usedNames.add(inst.name.toLowerCase());
    out.push(inst);
    // Taper: a second extra foe only ~45% of the time even when danger allows it.
    if (rng() > 0.45) break;
  }
  return out;
}

// Roll a group encounter for this location. ~22% chance overall, gated by
// the location's danger. Returns null when no group spawns — the caller
// should fall back to pickEnemyForLocation for a single-enemy roll.
export function pickGroupForLocation(location: Location): Enemy[] | null {
  if (!chance(22)) return null;
  const eligible = GROUP_TEMPLATES.filter((g) => g.minDanger <= location.danger);
  if (eligible.length === 0) return null;
  const tpl = pickWeighted(eligible, (g) => g.weight);
  const proto = enemies.find((e) => e.name === tpl.enemyName);
  if (!proto) return null;
  // Spawn `count` copies, each with a small HP wobble so they feel
  // individual rather than cloned. ±20% HP variance.
  const out: Enemy[] = [];
  for (let i = 0; i < tpl.count; i++) {
    const variance = 0.8 + Math.random() * 0.4;
    out.push({ ...proto, hp: Math.max(1, Math.round(proto.hp * variance)) });
  }
  return out;
}

// Unified encounter resolver: rolls a group first (rare), else falls back
// to a single enemy (common), else null (peaceful scene).
export function rollEncounter(location: Location): Enemy[] {
  const group = pickGroupForLocation(location);
  if (group && group.length > 0) return group;
  const single = pickEnemyForLocation(location);
  return single ? [single] : [];
}

function rarityRank(r: Rarity): number {
  return r === 'Common' ? 0 : r === 'Uncommon' ? 1 : r === 'Rare' ? 2 : 3;
}

export function getLocationById(id: string): Location {
  const stat = locations.find((l) => l.id === id);
  if (stat) return stat;
  // OTA-502 — resolve install-canonized locations (whisper/contract/mission
  // mentions) too, so they get their real name + a minimal scene instead of
  // silently falling back to locations[0].
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { allKnownLocations } = require('./worldMap') as typeof import('./worldMap');
  return allKnownLocations().find((l) => l.id === id) ?? locations[0]!;
}

// ---------------------------------------------------------------------------
// World-ladder pool pickers — Phase 4 §4.3
// ---------------------------------------------------------------------------
//
// The Micro-Micro nodes in worldLadder.json carry `possibleEncounters` and
// `lootTable` arrays curated per room (Buried Skyscraper Upper has Aetherbat,
// Aetheric Raven, Reclaimer Ambusher, Black Cloak Agent — not Mud Lich).
// Until this commit the engine ignored both arrays for actual gameplay and
// only fed them to the LLM as context. These pickers wire them through so
// the scene the player walks into matches its hand-authored biome curation.
//
// Rarity weighting is preserved inside the curated pool — Common enemies
// still spawn more often than Legendary ones, but everything that DOES
// spawn comes from the room's allowed list. Same for loot.

const enemiesByName = new Map<string, Enemy>();
for (const e of enemies) enemiesByName.set(e.name, e);
const lootByName = new Map<string, LootEntry>();
for (const l of loot) lootByName.set(l.name, l);

/**
 * Picks one enemy from the Micro-Micro's `possibleEncounters` pool,
 * weighted by rarity (Common 10 / Uncommon 5 / Rare 2 / Legendary 1).
 * Returns null when the pool is empty or every name fails to resolve to
 * a real enemy in enemies.json — caller should fall back to
 * `pickEnemyForLocation` in that case.
 */
export function pickEncounterFromLadder(triple: LadderTriple | null | undefined): Enemy | null {
  if (!triple) return null;
  const pool = triple.microMicro.possibleEncounters
    .map((name) => enemiesByName.get(name))
    .filter((e): e is Enemy => !!e);
  if (pool.length === 0) return null;
  return pickWeighted(pool, (e) => rarityWeights[e.rarity]);
}

/**
 * Picks one loot item NAME from the Micro-Micro's `lootTable` pool,
 * weighted by rarity. Returns null when the pool is empty or all names
 * fail to resolve. The caller (area-search, dig, etc.) builds the actual
 * InventoryItem from the name via lookupCraftedItem.
 */
export function pickLootFromLadder(triple: LadderTriple | null | undefined): string | null {
  if (!triple) return null;
  const pool = triple.microMicro.lootTable
    .map((name) => lootByName.get(name))
    .filter((l): l is LootEntry => !!l);
  if (pool.length === 0) return null;
  return pickWeighted(pool, (l) => rarityWeights[l.rarity]).name;
}
