/**
 * app/state/combatResolution.ts — WHAT A BLOW DOES.
 *
 * OTA-1404 (slice 10 of the gameStore split). Every rule that turns an attack
 * into a number and a number into a consequence: the enemy counter-swing, the
 * group volley, armour and AC, stagger, damage-type procs and their DOT ticks,
 * enemy techniques, the dog taking a swing meant for its handler, escort
 * collateral, and — at the end of all of it — the player's death. ~2,200 lines.
 *
 * ⚠⚠ THIS IS A LEAF, NOT A SLICE, AND THE DIFFERENCE IS THE WHOLE POINT.
 *
 * Slices 1-9 moved STORE ACTIONS: `useGameStore` kept the same object, the same
 * keys and the same 473 importers, and the risk lived in the store's shape. This
 * moves module-level FUNCTIONS instead. There is no store surgery, no interface
 * change and nothing for an importer to notice — gameStore imports these names
 * back and calls them exactly as before.
 *
 * ⚠⚠ WHICH MAKES ONE RULE ABSOLUTE HERE: NO VALUE IMPORT FROM gameStore. Only
 * `import type`, which is erased at compile time. A value import from a leaf
 * back into the store compiles, passes a one-sided unit test, and resolves to
 * `undefined` at module-init on a device — the failure this series has now
 * avoided ten times by writing the rule down each time.
 *
 * ⚠ THREE THINGS HAD TO MOVE DOWN BEFORE THIS COULD MOVE, and each for the same
 * reason: gameStore and this file BOTH call them, so neither can own them.
 *
 *   • `statNowClause`     → `engine/equipment.ts` (it reads `effectiveStats`)
 *   • `arbiterAddress`    → `ai/narration.ts`     (it is the Arbiter's voice)
 *   • `wearEquippedItem`  → `state/gearWear.ts`   (combat AND digging wear gear)
 *
 * That is the same rule slice 7 wrote down and the fourth time measuring has
 * chosen the boundary instead of the plan: SHARED THINGS MOVE DOWN, SINGLE-OWNER
 * THINGS MOVE WITH THEIR OWNER. `_lastEffectiveAc` — the AC ledger's memory — is
 * the single-owner case: both its reads and its only write are inside
 * `applyEnemyCounter`, so it travelled with it and stayed private.
 *
 * ⚠ WHAT MEASURING SAID, since planning has been wrong about this before. The
 * family is 43 pieces and referenced 12 things outside itself; nine of those
 * turned out to be combat's own constants and helpers that had simply been left
 * upstairs (`AIRBORNE_RE`, `BRACED_ROUNDS`, `RANGE_LABEL`, the damage-type
 * tables, `DOG_TARGET_CHANCE`, `MELEE_PACK_SWINGS_PER_ROUND`), and travelled
 * with it. Two more — `narrateWanderingJourney` and `tickDogStatus` — were named
 * only in COMMENTS and were never dependencies at all. That left the three above.
 *
 * ⚠ ONE COMMENT WAS REPAIRED ON THE WAY, not rewritten. The OTA-838 note
 * explaining enemy intel had been split in half by an unrelated block, so its
 * first four lines sat seventy lines above the function and its last two sat
 * directly on it. Both halves are here, joined, above `recordEnemyIntel`.
 *
 * ⚠ NOT ONE RULE, THRESHOLD, ROLL, MULTIPLIER OR LOG STRING CHANGED. The proof
 * is the suites that covered this code before the move and cover it unchanged
 * after — ota796, ota800, ota836, ota838, ota842, ota1006, ota1088, ota1089,
 * ota1110, ota1120, ota1133, ota1135, ota1137, ota1195, ota1202 and the dog
 * combat family.
 */
import type { PlayerCharacter, Enemy, CombatRange, StatusEffect } from '../engine/types';
import { applyDogPronouns, trainDogStat, dogHpGainClause, itemIsDogArmor } from '../engine/dogCompanion';
import { profileOf, scaledSwingCap } from '../engine/pressure';
import { addResurrectionGems, recordFallen, recordFallenSeed, characterSeedOf } from '../engine/saveSystem';
import { buildDeathScene, daysBelow } from '../engine/deathScene';
import { rollDie, rollFromNotation, pick } from '../engine/rng';
import { findArmorByName, findWeaponByName, findDogGearByName, applyDamageTypeModifier, applyArmorResistance, armorResistances, fusedArmorResistances, type ArmorSlotResist } from '../engine/crafting';
import { reachClassFor, bossSwingsTwice, enemyAttackBonus } from '../engine/combatRules';
import { parseWeaponEffect, applyRangeNote, shieldAcVersus } from '../engine/weaponEffects';
import { reachBandsFor, RANGE_ORDER, RANGE_LABELS } from '../engine/types';
// ⚠ OTA-1506 — the bullseye (per-enemy bearing + distance). See the FIELD
// helpers below activeEnemy for how the legacy shared band is derived from it.
import {
  bandOf, CONTACT_MIN, distanceForBand, enemyCloses, staggerSpawn, stepAwayFrom, stepToward,
  type EnemyPosition,
} from '../engine/combatGeometry';
import { ACID_SHRED_DECAY_PER_ROUND, COATING_DOT_TURNS } from '../engine/weaponCoating';
import { effectiveAC } from '../engine/raceMechanics';
import { trainStat } from '../engine/statTraining';
import { ARMOR_SLOTS, effectiveStats, aggregateEquippedStatBonuses, resolveEquippedItem, trimStandingAc, equippedGearAc, heldShieldAc, RING_SLOTS } from '../engine/equipment';
import { equippedAccessoryPowers } from '../engine/accessoryEffects';
// OTA-1650 — the dog's vest is durable now; this knows where it lives.
import { dogVestInstance, COMPANION_FRAY_AT } from '../engine/companionGear';
import { wearItemById } from '../engine/durability';
import { itemIsThrowable } from '../engine/bandolierEligibility';
import { findFactionQuestById } from '../engine/factionQuests';
import { weatherRepositionCost } from '../engine/weatherEffects';
import { traitAttackBonus, traitAmbushBonus, traitDamageMultiplier, traitOnHitStatus, traitRegen, combineDamageTypeMatch, enemyIntelKey } from '../engine/enemyTraits';
import { incomingHitCue, soakCueLine, leakCueLine } from '../engine/combatCues';
import { rollIncomingStatusEffect, applyEffect, statusAcAdjustment, hasFullCover, aethericVulnerabilityMultiplier } from '../engine/statusEffects';
import { isSkipControl, controlLabel, tickControl } from '../engine/enemyControl';
import type { EnemyControlState } from '../engine/enemyControl';
import { enemyDamageType as resolveEnemyDamageType, parseDamageTypeKeyword } from '../engine/damageTypes';
// ⚠ TYPE-ONLY, and that is load-bearing: an `import type` is erased at compile
// time, so this file never appears in gameStore's runtime module graph.
import type { GameStore, CurrentScene } from './gameStore';

/** One damage type's proc behaviour. ⚠ OTA-1404 — moved here with the tables
 *  it describes; after the move gameStore had no remaining use for it. */
type DTProc = { mode: 'on_hit' | 'dot'; rounds?: number; baseChance: number; weakBonus: number; strongPenalty: number; debuffStat?: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma'; debuffAmt?: number; debuffRounds?: number };
// ⚠ THE THREE THAT HAD TO MOVE DOWN FIRST. See the header.
import { statNowClause } from '../engine/equipment';
import { arbiterAddress } from '../ai/narration';
import { wearEquippedItem } from './gearWear';

// arb89 — dev character names that get the Resurrection-Gem perk: a gem
// granted once at new-character creation (the name beat) AND another on every death.
// Case-insensitive, trimmed. Shared by loadSlotIntoGame + handlePlayerDeath.
export const DEV_REVIVE_NAMES = ['verbal', 'sasmooch'];

// Helper: which enemy is the player currently targeting? Returns null
// when no enemies are present.
// OTA 037 — explicit runtime clamp on activeEnemyIdx. The existing
// `?? scene.enemies[0]` fallback caught out-of-bounds reads via
// undefined, but the clamp makes the intent obvious and protects
// against an idx that's been left stale by rapid kills (AoE, traps).
export function activeEnemy(scene: CurrentScene | null): Enemy | null {
  if (!scene || scene.enemies.length === 0) return null;
  const idx = Math.max(0, Math.min(scene.activeEnemyIdx, scene.enemies.length - 1));
  return scene.enemies[idx] ?? null;
}

// ---------------------------------------------------------------------------
// ⚠⚠⚠ OTA-1506 — THE FIELD GOES LIVE. The owner's bullseye (combatGeometry,
// proven at OTA-1503) becomes the source of truth for where everybody stands:
// each enemy carries its own `pos` (bearing + distance), and the old shared
// `scene.range` survives only as a DERIVED compatibility field — the band to
// the ACTIVE target — so the dozens of narration/UI readers keep working while
// the attack gate, counters, movement and pursuit all go per-enemy.
// ---------------------------------------------------------------------------

/** ⚠ LAZY MIGRATION for saves written before positions existed. A fight loaded
 *  from an old save has enemies with no `pos` and a shared `scene.range`; each
 *  one is synthesized mid-ring in that band (distanceForBand), bearings spread
 *  by the golden angle so a lineup never stacks on one heading — DETERMINISTIC
 *  on purpose: two reads of the same save must agree, so no rng here. */
export function enemyPosOf(scene: CurrentScene, idx: number): EnemyPosition {
  const e = scene.enemies[idx];
  if (e?.pos && Number.isFinite(e.pos.bearing) && Number.isFinite(e.pos.distance)) return e.pos;
  return {
    bearing: (idx * 137.5) % 360,
    distance: distanceForBand(scene.range ?? 'mid'),
  };
}

/** The band THIS enemy stands in — null past ring 4 (present, walking in,
 *  unable to act or be acted on). This is the per-enemy read every gate uses. */
export function enemyBandOf(scene: CurrentScene, idx: number): CombatRange | null {
  return bandOf(enemyPosOf(scene, idx).distance);
}

/** The legacy shared field, derived: the band to the ACTIVE target, clamped to
 *  'distant' for a ring-5 walker so old readers never see a null mid-fight. */
export function derivedSceneRange(scene: CurrentScene): CombatRange | null {
  if (scene.enemies.length === 0) return null;
  const idx = Math.max(0, Math.min(scene.activeEnemyIdx, scene.enemies.length - 1));
  return enemyBandOf(scene, idx) ?? 'distant';
}

/** Where one NEWCOMER stands when he joins a scene mid-fiction (a provoked
 *  apex, a rest ambush, a summoned Guardian): mid-ring of the band the spawn
 *  site's fiction names, at a fresh bearing. Keeps every add-one site's
 *  shipped opening distance exactly. */
export function arrivalPos(band: CombatRange, rng: () => number = Math.random): { bearing: number; distance: number } {
  return { bearing: rng() * 360, distance: distanceForBand(band) };
}

/** Stamp a fresh lineup onto the bullseye. `shape` is the fiction: an AMBUSH
 *  chose the ground and rings the player; a PATROL (or any met-on-the-road
 *  lineup) clusters in a narrow arc ahead. Either way the distances stagger one
 *  man per ring (nearest-first by index — which IS the pager order, so a swipe
 *  walks the line outward with no separate sort).
 *
 *  ⚠ A LONE BODY KEEPS THE SHIPPED OPENING DISTANCE (mid). The stagger is what
 *  makes "hit the closest first so I don't walk into anyone else's reach" a
 *  decision — a duel has no such decision, and opening it at contact would
 *  delete the approach/step-back game instead of making it functional. */
export function placeEnemies(enemies: Enemy[], shape: 'ambush' | 'patrol', rng: () => number = Math.random): Enemy[] {
  if (enemies.length === 1) return enemies.map((e) => ({ ...e, pos: arrivalPos('mid', rng) }));
  const spots = staggerSpawn(enemies.length, shape, rng);
  return enemies.map((e, i) => ({ ...e, pos: spots[i] ?? { bearing: (i * 137.5) % 360, distance: 0.5 } }));
}

/** The legacy `range` literal a FRESH spawn site writes, computed from where
 *  the lineup actually stands: the leader's band (index 0 is nearest by
 *  construction — the pager's opening target). */
export function openingRange(placed: Enemy[]): CombatRange {
  const d = placed[0]?.pos?.distance;
  return (d !== undefined ? bandOf(d) : null) ?? 'mid';
}

/** OTA-1089 — anti-stun-lock. When a stun/paralyze takes hold, the player is
 *  `braced` for this many rounds (the incapacitated round plus the recovery
 *  rounds it protects): further incapacitations cannot land while it runs.
 *  One clean lockdown per window is drama; a 5-member concussive pack
 *  re-rolling 20% per landed blow was a slot machine that ate the player's
 *  turns (sim: 844 stuns per 20k-action run, every stalled matchup a pack). */
const BRACED_ROUNDS = 3;

/** OTA-1089 — pack action economy. At most this many non-boss MELEE pack
 *  members can land swings on the player in one volley; the rest crowd in
 *  behind, waiting for an opening (one narrated line). Ranged enemies and
 *  bosses are exempt. A 5-blade wall was five attack rolls + five stun rolls
 *  a round — more dice than drama, and the sim's whole stall tail. */
const MELEE_PACK_SWINGS_PER_ROUND = 3;

// OTA 228 — Arbiter low-HP warning latch. Fires the moment HP
// transitions from ≥5% to <5% of max; clears the latch the moment
// HP returns to ≥5%. Playtester: "if your health is lower than 5%
// the arbiter should say maybe you should eat something or look at
// a first aid kit. but it shouldn't say it over and over... first
// time you dropped below 5%, say it, then not again until your
// health goes above 5% and then drops below again."
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function checkLowHpWarning(
  prevHp: number,
  newHp: number,
  hpMax: number,
  get: () => GameStore,
  set: any,
): void {
  if (hpMax <= 0) return;
  const threshold = hpMax * 0.05;
  const prevBelow = prevHp < threshold;
  const newBelow = newHp < threshold;
  const wasWarned = get().lowHpWarned;
  if (newBelow && !prevBelow && !wasWarned) {
    // OTA-184 — low-HP warning line rewritten. "Nearly out of body"
    // read as a translation glitch to the playtester. New line is
    // plainer + actionable: "you're badly injured, take some time
    // to heal." Same skipDedup + same one-shot lowHpWarned gate.
    // The Arbiter also occasionally drops the player's first name
    // here (~1/3 of warnings) so the personal moment lands harder.
    const lowHpAddr = arbiterAddress(get().player, '');
    const lowHpOpener = lowHpAddr
      ? `${lowHpAddr}, you're badly injured.`
      : `You're badly injured.`;
    get().appendLog(
      'arbiter',
      `The Arbiter holds your gaze. "${lowHpOpener} Take a moment — eat what you have, open the first-aid kit, or rest somewhere safe. The Outskirts do not return what they take."`,
      { skipDedup: true },
    );
    set({ lowHpWarned: true });
  } else if (!newBelow && wasWarned) {
    set({ lowHpWarned: false });
  }
}

// OTA-962 — ESCORT collateral (engine_Dev model). Every enemy swing that CONNECTS on
// the player also bleeds the shared escort pool: a fixed fraction of the FINAL
// post-mitigation damage, EXTRA (never absorbed off the player), so a clean
// parry that zeroes the hit spares the party too. Pool at 0 = the escort FAILS
// on the spot. Parked (deactivated) parties are out of the fight.
export function applyEscortDamage(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  baseDmg: number,
  enemyName: string,
): void {
  const player = get().player;
  if (!player || baseDmg <= 0) return;
  const active = player.activeFactionQuests ?? [];
  if (!active.some((q) => q.escort && q.escort.hp > 0 && q.tracked !== false)) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ESCORT_COLLATERAL_FRACTION } = require('../engine/escort') as typeof import('../engine/escort');
  const collateral = Math.max(1, Math.round(baseDmg * ESCORT_COLLATERAL_FRACTION));
  const hurt: { label: string; dmg: number; hp: number; hpMax: number }[] = [];
  const failed: string[] = [];
  const next = active.map((q) => {
    if (!q.escort || q.tracked === false || q.escort.hp <= 0) return q;
    const hp = Math.max(0, q.escort.hp - collateral);
    if (hp <= 0) failed.push(q.id);
    else hurt.push({ label: q.escort.label, dmg: collateral, hp, hpMax: q.escort.hpMax });
    return { ...q, escort: { ...q.escort, hp } };
  });
  if (hurt.length === 0 && failed.length === 0) return;
  set((s) => (s.player ? { player: { ...s.player, activeFactionQuests: next } } : s));
  for (const h of hurt) {
    void Promise.resolve().then(() =>
      get().appendLog('combat', `${enemyName} catches your ${h.label} — ${h.dmg} damage (${h.hp}/${h.hpMax} HP).`),
    );
  }
  if (failed.length > 0) failEscortQuests(get, set, failed);
}

// Drop one or more failed escort contracts: pulled from the active lists (NOT
// marked completed), and announce who fell. The party is gone with the quest
// record, so the HUD clears automatically.
export function failEscortQuests(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  failedIds: string[],
  // OTA-1081 — narrate:false lets a caller with its OWN failure story (caught
  // robbing the leader) skip the "cut down" line, which would be a lie there.
  opts?: { narrate?: boolean },
): void {
  const ids = new Set(failedIds);
  set((s) => {
    if (!s.player) return {};
    return {
      player: {
        ...s.player,
        activeFactionQuests: (s.player.activeFactionQuests ?? []).filter((q) => !ids.has(q.id)),
        activeFactionQuestIds: (s.player.activeFactionQuestIds ?? []).filter((id) => !ids.has(id)),
      },
    };
  });
  if (opts?.narrate === false) return;
  for (const id of failedIds) {
    const def = findFactionQuestById(id);
    const title = def?.title ?? id;
    const label = def?.escort?.label ?? 'escort party';
    const isAre = def?.escort?.count === 1 ? 'is' : 'are';
    void Promise.resolve().then(() =>
      get().appendLog('combat', `Your ${label} ${isAre} cut down. The escort "${title}" has failed — you couldn't keep them alive.`),
    );
  }
}

// Human-readable label for the combat range bands. OTA-550 — sourced from
// the shared RANGE_LABELS map (distant / far / mid-range / close-arm's-reach).
export const RANGE_LABEL: Record<CombatRange, string> = RANGE_LABELS;

// Step the combat range one band toward the enemy (advance) or away
// (retreat). Extracted so non-combat verbs can route here — e.g. a player
// typing "go to him" or "approach the reclaimer" mid-combat should close
// distance the same way "advance" does, instead of falling through to
// narrateWanderingJourney.
export function runMoveCombatRange(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  player: PlayerCharacter,
  scene: CurrentScene,
  direction: 'advance' | 'retreat',
): void {
  const cost = weatherRepositionCost(scene.weather, playerArmorResistKinds(player));
  get().appendLog(
    'debug',
    `move: ${direction} from range=${scene.range ?? '-'} enemies=${scene.enemies.length} weather=${scene.weather?.name ?? '-'} cost=${cost} partial=${scene.repositionPartial ?? 0}`,
  );
  const moveEnemy = activeEnemy(scene);
  if (!moveEnemy) {
    get().appendLog('debug', 'move: bail — no active enemy');
    get().appendLog('arbiter', `The Arbiter shrugs. "Nothing to ${direction === 'advance' ? 'advance on' : 'pull back from'}. The ground here is quiet."`);
    return;
  }
  // ⚠⚠⚠ OTA-1506 — ONE STEP MOVES THE WHOLE FIELD. The owner's model: "if I
  // step closer to the guy directly north of me, I get one ring closer, but
  // the guy south of me, he's now one ring further away … every time I move we
  // need to recalculate that." The step is a real vector (stepToward /
  // stepAwayFrom), every enemy's position is recomputed, and the legacy shared
  // band is re-derived from the ACTIVE target for the old readers.
  const activeIdx = Math.max(0, Math.min(scene.activeEnemyIdx, scene.enemies.length - 1));
  const field = scene.enemies.map((_, i) => enemyPosOf(scene, i));
  const curPos = field[activeIdx]!;
  const curBand = bandOf(curPos.distance);
  // OTA-146 — pluralization grammar fix. Pre-fix this always did
  // "the N {moveEnemy.name}s" — when the scene held two DIFFERENT
  // enemies (e.g. Silt Thief + Voronov-Beneath High Cantor), the
  // line became "the 2 Voronov-Beneath High Cantors" which is both
  // a lie and reads broken. Now: check if all enemies share the
  // same name; if so pluralize; if not, list them.
  const groupLabel = (() => {
    if (scene.enemies.length <= 1) return moveEnemy.name;
    const sameType = scene.enemies.every((e) => e.name === moveEnemy.name);
    if (sameType) return `the ${scene.enemies.length} ${moveEnemy.name}s`;
    if (scene.enemies.length === 2) {
      const other = scene.enemies.find((e) => e.name !== moveEnemy.name);
      return `the ${moveEnemy.name} and ${other?.name ?? 'the other one'}`;
    }
    return `the ${moveEnemy.name} and ${scene.enemies.length - 1} others`;
  })();
  // ⚠ The guards speak in the field's terms: advance ends at CONTACT (toe to
  // toe with the target), retreat ends once the target is already out past
  // ring 4 — he is absent from the fight and closing; more backing up buys
  // nothing but ground the pursuit reclaims.
  if (direction === 'advance' && curPos.distance <= CONTACT_MIN + 1e-6) {
    get().appendLog('world', `You are already at close / arm's reach with ${groupLabel}.`);
    return;
  }
  if (direction === 'retreat' && curBand === null) {
    get().appendLog('world', `You cannot put more ground between you and ${groupLabel}.`);
    return;
  }

  // Slow-weather progression. Each advance/retreat under Iron Fog or
  // Silent Blizzard counts as one tick toward `cost`. Once accumulated
  // ticks reach cost, range actually changes and progress resets.
  // Direction change resets progress so you don't carry "advance" credit
  // into a later "retreat".
  const lastDir = scene.repositionDir;
  const carriedPartial = lastDir === direction ? (scene.repositionPartial ?? 0) : 0;
  const partial = carriedPartial + 1;

  if (cost > 1 && partial < cost) {
    set((s) => (s.currentScene
      ? { currentScene: { ...s.currentScene, repositionPartial: partial, repositionDir: direction } }
      : s));
    const weatherName = scene.weather?.name ?? 'the haze';
    get().appendLog(
      'world',
      direction === 'advance'
        ? `${weatherName} slows you down. You push toward ${groupLabel} but the compass spins and your footing drags. (${partial}/${cost} — type 'advance' again to close)`
        : `${weatherName} slows you down. You strain to pull back from ${groupLabel}, but every step costs double. (${partial}/${cost} — type 'step back' again to break contact)`,
    );
    get().appendLog('debug', `move: slow weather progress ${partial}/${cost}`);
    // Partial moves under bad weather used to grant a FULL enemy counter
    // round per tick — which compounded with the auto-close-to-attack
    // enemy round to turn weather penalties into death spirals (playtest
    // log Observer @ Zharak's Teeth: 4 Gutter Rats took 31 HP off a fresh
    // L1 character in three rounds, two of which were partial movement
    // ticks where the player couldn't act). Now: only the FULL move
    // (range actually changes) provokes the counter round. Partial moves
    // still cost a beat of in-fiction time, but enemies hold their swing
    // until the player commits — same way real combat in tabletop RPGs
    // grants reactions on movement INTO threatened squares, not on
    // half-steps that fail to close.
    return;
  }

  // Full move — the step lands. The whole field translates; positions write
  // back onto the enemies, and the legacy `range` is re-derived from the
  // active target so every old reader keeps a truthful band.
  const after = direction === 'advance' ? stepToward(field, activeIdx) : stepAwayFrom(field, activeIdx);
  const movedEnemies = scene.enemies.map((e, i) => ({ ...e, pos: after[i] ?? enemyPosOf(scene, i) }));
  const nextBand = bandOf(after[activeIdx]!.distance);
  set((s) => (s.currentScene
    ? {
      currentScene: {
        ...s.currentScene,
        enemies: movedEnemies,
        range: nextBand ?? 'distant',
        repositionPartial: 0,
        repositionDir: undefined,
      },
    }
    : s));
  get().appendLog('debug',
    `move: field ${direction} target=${moveEnemy.name} d ${curPos.distance.toFixed(2)}->${after[activeIdx]!.distance.toFixed(2)} band ${curBand ?? 'out'}->${nextBand ?? 'out'}`);
  get().appendLog(
    'world',
    direction === 'advance'
      ? `You close the gap with ${groupLabel}. (range: ${RANGE_LABEL[nextBand ?? 'close']})`
      : nextBand === null
        ? `You pull back from ${groupLabel} — ${moveEnemy.name} drops out of the fight, left to close the ground.`
        : `You pull back from ${groupLabel}. (range: ${RANGE_LABEL[nextBand]})`,
  );
  // ⚠ THE OWNER'S SENTENCE, NARRATED: everybody else moved too. One compact
  // line, only when somebody's band actually flipped — the geometry is felt,
  // not spammed.
  const shifted = movedEnemies
    .map((e, i) => ({ e, from: bandOf(field[i]!.distance), to: bandOf(after[i]!.distance), i }))
    .filter((x) => x.i !== activeIdx && x.from !== x.to && (scene.enemyHps[x.i] ?? 0) > 0);
  if (shifted.length > 0) {
    const bits = shifted.map((x) => `${x.e.name} now ${x.to === null ? 'out of range' : RANGE_LABEL[x.to]}`);
    get().appendLog('world', `The field shifts around you — ${bits.join('; ')}.`);
  }
  // Movement takes a beat — let any enemy still in ITS OWN effective range
  // counter-attack. Group: every reaching enemy fires.
  const sceneNow = get().currentScene;
  const reachers = sceneNow
    ? sceneNow.enemies.filter((e, i) =>
      enemyCanReach(e, enemyBandOf(sceneNow, i)) && (sceneNow.enemyHps[i] ?? 0) > 0)
    : [];
  if (reachers.length > 0) {
    runEnemyGroupCounters(get, set, get().player ?? player);
  }
}

// OTA-796 — ONE ranged-enemy classifier, shared by the reach gate and the
// full-cover auto-miss. The two sites used to carry DIFFERENT regexes: the
// reach gate only knew bow-words, so 14 bestiary entries with Laser / Breath /
// Venom / Burst attacks (Bog Dragon, Architectural Sentinel, Aetheric
// Cyclops, …) were classified melee and could NEVER counter at far range —
// the exploit sweep's "kite the hardest non-boss monsters risk-free" finding.
// OTA-960 — an AIRBORNE enemy ignores the ground: it reaches an elevated player
// (and can be met with ANY weapon) as if you stood level. Matched on name /
// type / traits, same spirit as isRangedEnemy below.
const AIRBORNE_RE = /\b(wing|winged|fly|flying|flier|aerial|airborne|drone|wasp|hornet|bat|bird|raptor|harpy|wyvern|drake|moth|swarm|gull|vulture|hawk|owl)\b/i;

export function enemyIsAirborne(enemy: Enemy): boolean {
  return AIRBORNE_RE.test(`${enemy.name} ${enemy.type ?? ''} ${(enemy.traits ?? []).join(' ')}`);
}

function isRangedEnemy(enemy: Enemy): boolean {
  const sig = `${enemy.attack ?? ''} ${enemy.damage ?? ''} ${enemy.abilityPoint ?? ''}`.toLowerCase();
  return /(bow|arrow|crossbow|ranged|projectile|firearm|sling|dart|laser|beam|breath|burst|venom|bolt|blast|aetheric|pulse|spit|spine|quill)/.test(sig);
}

// ---------------------------------------------------------------------------
// ⚠⚠⚠ OTA-1508 — THE ENEMIES HAVE RANGES TOO. The owner, designing the
// bullseye: *"remember range should limit my weapons ability and theirs
// depending on what they have so the enemies have to have a range too."*
// One resolver answers it — the enemy-side mirror of playerWeaponReach:
//
//   1. A humanoid that CARRIES weapons (OTA-361 kit) fights with them: each
//      carried name resolves through the real catalog → reachClassFor →
//      reachBandsFor, the same chain the player's hands use.
//   2. The authored `attack` text always contributes a class too (the Bog
//      Dragon's Breath is ranged whatever it carries): the OTA-796 ranged
//      regex, a long-arm regex (spear/pike/whip/tail…), else melee.
//
// Each class reaches some bands FULL and its outermost band WEAK — the weak
// band is where the owner's YELLOW dot lives ("they can reach me, but it'd
// be weak damage"), and a blow landed from it arrives HALVED:
//
//   melee      → full [close]            weak [mid]      (⚠ mid stays reachable
//                — the OTA-550 conservatism kept deliberately, but the lunge
//                from a ring out now lands at half; the reach itself is
//                unchanged so no fight becomes safe that wasn't)
//   long       → full [close, mid]       weak []         (a spear AT mid is
//                its whole job — never weak there)
//   throwable  → full [close, mid]       weak [far]
//   ranged /
//   runecaster → full [close, mid, far]  weak [distant]  (the extreme-range
//                arc harasses; it no longer hits like a mid-range shot)
// ---------------------------------------------------------------------------

const LONG_ARM_RE = /\b(spear|pike|lance|halberd|glaive|polearm|whip|tail|tendril|tentacle|lash)\b/i;

type EnemyReachClass = 'melee' | 'long' | 'throwable' | 'ranged';

const REACH_CLASS_BANDS: Record<EnemyReachClass, { full: CombatRange[]; weak: CombatRange[] }> = {
  melee: { full: ['close'], weak: ['mid'] },
  long: { full: ['close', 'mid'], weak: [] },
  throwable: { full: ['close', 'mid'], weak: ['far'] },
  ranged: { full: ['close', 'mid', 'far'], weak: ['distant'] },
};

function enemyReachClasses(enemy: Enemy): EnemyReachClass[] {
  const classes = new Set<EnemyReachClass>();
  // The authored attack is always a source — it is what the bestiary says
  // this thing DOES.
  if (isRangedEnemy(enemy)) classes.add('ranged');
  else if (LONG_ARM_RE.test(`${enemy.attack ?? ''} ${enemy.name ?? ''}`)) classes.add('long');
  else classes.add('melee');
  // A carried kit widens it: the raider with a crossbow on his back shoots.
  for (const name of enemy.carries?.weapons ?? []) {
    const w = findWeaponByName(name);
    if (!w) continue;
    const cls = reachClassFor({ weaponKind: w.weaponKind, name: w.name, tags: w.tags });
    if (cls === 'ranged' || cls === 'runecaster') classes.add('ranged');
    else if (cls === 'throwable') classes.add('throwable');
    else if (cls === 'long') classes.add('long');
    else classes.add('melee');
  }
  return [...classes];
}

/** The enemy's whole reach: every band it can strike from, and which of those
 *  are its WEAK edge (a band is weak only if NO class covers it full). */
export function enemyReach(enemy: Enemy): { bands: CombatRange[]; weakBands: CombatRange[] } {
  const full = new Set<CombatRange>();
  const weak = new Set<CombatRange>();
  for (const cls of enemyReachClasses(enemy)) {
    const spec = REACH_CLASS_BANDS[cls];
    for (const b of spec.full) full.add(b);
    for (const b of spec.weak) weak.add(b);
  }
  for (const b of full) weak.delete(b);
  return { bands: [...full, ...weak], weakBands: [...weak] };
}

/** ⚠ THE OWNER'S DOT, verbatim: *"a small circle in one of the bottom
 *  corners … red means they can hit me, yellow is they can reach me but it'd
 *  be weak damage, green means they can't touch me."* Judged at the enemy's
 *  own band; null (ring 5 walker) is green — he is absent and closing. */
export function enemyThreatAt(enemy: Enemy, band: CombatRange | null): 'red' | 'yellow' | 'green' {
  if (band === null) return 'green';
  const reach = enemyReach(enemy);
  if (!reach.bands.includes(band)) return 'green';
  return reach.weakBands.includes(band) ? 'yellow' : 'red';
}

// Whether an enemy can still strike the player at the given range.
// ⚠ OTA-1506 — the range passed here is THAT ENEMY'S OWN band (enemyBandOf),
// and null means ring 5: present, walking in, unable to act.
// ⚠ OTA-1508 — now answered by the reach resolver above. For text-classified
// enemies this is band-for-band what OTA-550 shipped (melee close+mid, ranged
// all four); what changed is that a carried kit can WIDEN it, and the weak
// edge halves the blow (see applyEnemyCounter).
function enemyCanReach(enemy: Enemy, range: CombatRange | null): boolean {
  if (range === null) return false;
  return enemyReach(enemy).bands.includes(range);
}

export function parseEnemyAP(enemy: { abilityPoint?: string } | null | undefined, fallback = 3): number {
  if (!enemy) return fallback;
  const match = String(enemy.abilityPoint ?? '').match(/\d+/);
  return match ? parseInt(match[0], 10) : fallback;
}

export function playerBuildScore(player: PlayerCharacter): number {
  const stats = effectiveStats(player);
  let build = Math.max(1, Math.round(stats.strength * 0.7));
  if (player.raceId === 'tartarian_giants') build += 2;
  if (player.raceId === 'mud_dweller') build -= 1;
  return Math.max(1, Math.min(10, build));
}

/** Enemy build derived from their abilityPoint string and HP cap. The
 *  data file format is "Strength 4" / "Dexterity 6"; we read the
 *  number plus a small HP-tier bonus. Large legendaries like Mud Titan
 *  end up at 9-10; rats and wasps at 2-3. */
export function enemyBuildScore(enemy: Enemy): number {
  // 2026-05-25 — was `parseInt(String(enemy.abilityPoint), 10) || 3`
  // which fell back to 3 for every "Strength N" / "Dexterity N"
  // string because parseInt of a leading word returns NaN.
  const ap = parseEnemyAP(enemy);
  const hpTier = enemy.hp >= 200 ? 3 : enemy.hp >= 100 ? 2 : enemy.hp >= 40 ? 1 : 0;
  return Math.max(1, Math.min(10, ap + hpTier));
}

// OTA-1006 — EXPORTED: the weapon quick-button tone (InputBox) and the enemy
// panel's in-range flag (ExplorationScreen) now read reach from THIS resolver
// — the same one the attack gate rolls with — instead of keeping local
// re-derivations. The copies missed the forge stamp (uniqueStats.reachClass),
// so a close-only fused weapon glowed green at mid range while the gate
// refused every swing.
export function playerWeaponReach(
  player: PlayerCharacter,
  // OTA 027 — optional slot override. When the player typed
  // "attack with the off-hand X", the caller passes 'off' so the
  // reach band + label come from the off-hand weapon, not main.
  // Default 'main' preserves all existing call sites.
  slot: 'main' | 'off' = 'main',
): { bands: CombatRange[]; label: string } {
  const eq = player.equipped ?? {};
  const wpName = slot === 'off' ? eq.off : (eq.main ?? eq.weaponName);
  if (!wpName) return { bands: reachBandsFor('barehanded'), label: 'Bare hands' };
  const w = findWeaponByName(wpName);
  // ⚠⚠⚠ OTA-1562 — THE WEAPON'S OWN SENTENCE GETS A VOTE. Nine catalog rows say
  // "short range" / "long range" / "at any range" in the effect column and the
  // reach classifier never read a word of it, so a Throwing Knife billed as
  // SHORT RANGE threw exactly as far as a Bone War Javelin billed as LONG. The
  // note is resolved HERE, above every branch, because the classifier has four
  // exits (throwable instance, forge stamp, catalog row, low-INT caster) and a
  // note applied at only some of them is the OTA-1006 bug again — a second
  // authority on reach that disagrees with the gate.
  const rangeNote = parseWeaponEffect(w?.effect)?.rangeNote ?? null;
  // OTA-550 — a throwable inventory item (Shaped Aetheric Shard, etc.) equipped
  // to a hand throws from 'far' inward even though it's not in the weapon
  // catalog. Detect it off the inventory tags before the catalog lookup.
  const throwInst = (player.inventory ?? []).find(
    (it) => it.name.toLowerCase() === wpName.toLowerCase() && itemIsThrowable(it),
  );
  if (throwInst) {
    return { bands: applyRangeNote(reachBandsFor('throwable'), rangeNote), label: throwInst.name };
  }
  if (!w) {
    // OTA-955 — a weapon with no catalog row (Crucible forges) reads reach from
    // its OWN identity: the forge-stamped uniqueStats.reachClass first, then
    // name/tag classification, then the old melee fallback. This is what let
    // the "Resonant Spike" era happen — every fused weapon silently collapsed
    // to close-only regardless of what the forge said it was.
    const inst = (player.inventory ?? []).find((it) => it.name.toLowerCase() === wpName.toLowerCase());
    const stamped = inst?.uniqueStats?.reachClass;
    const cls = stamped ?? reachClassFor({ name: wpName, tags: inst?.tags });
    return { bands: applyRangeNote(reachBandsFor(cls), rangeNote), label: wpName };
  }
  const cls = reachClassFor({ weaponKind: w.weaponKind, name: w.name, tags: w.tags });
  // OTA-550 — preserve the legacy runecaster INT gate: a low-INT caster
  // (Common/Uncommon, INT < 9) can't reach the outermost 'distant' band;
  // it tops out at 'far' inward. INT ≥ 9 (Rare/Legendary access) reaches all.
  // ⚠ OTA-1562 — the note is NOT applied here. This branch is a PENALTY the
  // character has earned by being under-statted, and a note that promoted the
  // bands back would let a weapon's flavour text overrule a stat gate.
  if (cls === 'runecaster' && (player.stats.intelligence ?? 0) < 9) {
    return { bands: reachBandsFor('throwable'), label: w.name }; // far/mid/close
  }
  return { bands: applyRangeNote(reachBandsFor(cls), rangeNote), label: w.name };
}

// OTA-934 — a frost/cold coating on armour (-> a 'cold' entry in the piece's addedResists)
// or any cold-resistant armour lets the player shrug off COLD weather (Silent Blizzard):
// coatings counter weather. Exported so the character sheet can mirror the negation.
export function playerColdResist(player: PlayerCharacter | null): boolean {
  if (!player) return false;
  return aggregateArmor(player).resistances.some((r) => r.toLowerCase() === 'cold');
}

// OTA-923 — the player's full armour resist kinds (lowercased). tickWeather uses this to
// cancel a weather whose element the player's coatings resist (cold, electrical, burn …),
// generalising playerColdResist beyond cold only.
export function playerArmorResistKinds(player: PlayerCharacter | null): string[] {
  if (!player) return [];
  const kinds = aggregateArmor(player).resistances.map((r) => r.toLowerCase());
  // ⚠⚠ OTA-1184 — THE GIANT'S WATCH grants cold resistance, and it is injected HERE
  // because this one function feeds ~16 call sites: weather ticks, weather stat
  // modifiers, attack penalties, visibility. Adding the kind at the source means the
  // perk works everywhere resistance already matters, with no new plumbing and no site
  // silently missed. (Five inscriptions carved into the Ural cliffs by someone who stood
  // in that cold long enough to finish them.)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { storyPerkModifiers } = require('../engine/collectables') as typeof import('../engine/collectables');
    if (storyPerkModifiers(player.collectables ?? []).grantsColdResist && !kinds.includes('cold')) {
      kinds.push('cold');
    }
  } catch { /* a perk lookup must never break the resist read */ }
  return kinds;
}

/** OTA-1124 — the AC ledger's memory. Session-scoped and combat-local: it only
 *  ever compares one swing to the previous one, so a fresh session starting
 *  from null simply prints nothing until there is something to compare. */
let _lastEffectiveAc: number | null = null;

/** OTA-1124 — what is actually worn, slot by slot, for the AC ledger line.
 *  Names the EMPTY slots too: "AC dropped and the chest slot is empty" is the
 *  finding, and a list that silently omits what is missing cannot show it. */
function describeWornForAcLedger(player: PlayerCharacter): string {
  const eq = player.equipped ?? {};
  const parts: string[] = [];
  for (const slot of ARMOR_SLOTS) {
    const name = eq[slot];
    parts.push(`${slot}=${name ?? '—'}`);
  }
  return parts.join(' ');
}

/** ⚠ OTA-1137 — THE WEAKNESS HAS TO BE WORTH BRINGING, and until now it was not.
 *
 *  The owner threw a Searing Paste at a Guardian carrying `vulnerable:burn` —
 *  her authored weakness, hit with a crafted consumable he had to spend — and
 *  the device log priced the whole exchange:
 *
 *    You hurl the Searing Paste … 9 burn (2/turn × 3, vulnerable). (16 HP left)
 *    Hierophant Mara-of-Yuldra deals 4 cold damage. You fall.
 *
 *  The system worked exactly as designed: base 6, ×1.5 for the vulnerability,
 *  9 dealt. ⚠ AND THAT IS THE PROBLEM. Correctly identifying a boss's weakness
 *  and spending a consumable on it bought THREE POINTS of extra damage, in a
 *  round where she hit for 23. *"the coatings I threw on it were its weaknesses
 *  but it took no damage."* It did take damage. It did not take NOTICE.
 *
 *  ⚠ THE FIX IS NOT A BIGGER MULTIPLIER. Raising ×1.5 to ×2 would have turned
 *  his 9 into 12 — still noise against a boss doing 23 a round, and it would
 *  have inflated every ordinary weakness hit in the game to fix one that
 *  mattered. The problem was never the damage number; it was that the RIGHT
 *  ANSWER CHANGED NOTHING ABOUT WHAT HAPPENED NEXT.
 *
 *  So a weakness hit STAGGERS. A staggered boss forfeits the second swing that
 *  OTA-1136 measured at half its output. In the owner's own round that is 13
 *  damage he does not take — larger than the 9 the vial dealt, and it arrives
 *  as a thing he can SEE working rather than a multiplier he has to compute.
 *
 *  ⚠ DELIBERATELY NOT A LOCK. One round, consumed by the swing it prevents, and
 *  it never stops the FIRST swing — so a boss always answers, and a player who
 *  keeps hitting the weakness trades a ~half-damage round for the cost of
 *  carrying the right tool. That is the trade this OTA is buying. */
export function staggerEnemy(
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  idx: number,
): void {
  set((s) => {
    if (!s.currentScene) return s;
    const n = s.currentScene.enemies.length;
    if (idx < 0 || idx >= n) return s;
    const next = [...(s.currentScene.enemyStaggered ?? s.currentScene.enemies.map(() => 0))];
    while (next.length < n) next.push(0);
    next[idx] = 1;
    return { currentScene: { ...s.currentScene, enemyStaggered: next } };
  });
}

/** Is `idx` staggered right now, and CONSUME it if so. Consuming here rather
 *  than on a round tick is what keeps the effect honest: it is spent by the
 *  swing it prevents, so it can never silently persist into a later round. */
function takeStagger(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  idx: number,
): boolean {
  const cur = get().currentScene?.enemyStaggered?.[idx] ?? 0;
  if (cur <= 0) return false;
  set((s) => {
    if (!s.currentScene) return s;
    const next = [...(s.currentScene.enemyStaggered ?? [])];
    next[idx] = 0;
    return { currentScene: { ...s.currentScene, enemyStaggered: next } };
  });
  return true;
}

// ⚠ OTA-1135 — THE AC HALF OF THIS NOW LIVES IN equipment.ts. What is left here
// is the RESISTANCE walk, which genuinely belongs to the store: combat weights a
// resist by the slot it came from, and that per-slot tagging has no other home.
// The AC sum moved out because it had silently become the second implementation
// of "what is my gear worth" — this one counted an amulet and three rings,
// `standingAc` did not, and the owner read 15 on the panel while being defended
// at 18. One implementation, called from both places, is the only shape that
// cannot drift again.
export function aggregateArmor(player: PlayerCharacter): { acBonus: number; resistances: string[]; resistSlots: ArmorSlotResist[] } {
  const gearAc = equippedGearAc(player);
  // ⚠ OTA-1645 — the held shield's flat AC joins the stack HERE, which is the
  // resolver's source, at the same moment `standingAc` picks it up for the
  // sheet. One addition in `equippedGearAc`, two readers, no drift.
  const acBonus = gearAc.worn + gearAc.accessories + gearAc.shield;
  const resistances: string[] = [];
  // arb119 — keep each resistance tagged with the SLOT it came from, so combat
  // can weight the diminishing stack (chest counts most, cloak least). The flat
  // `resistances` list is preserved for the item-preview / stats display.
  const resistSlots: ArmorSlotResist[] = [];
  const eq = player.equipped ?? {};
  for (const slot of ARMOR_SLOTS) {
    const name = eq[slot];
    if (!name) continue;
    // OTA-195 — check player inventory for a fused armor piece with
    // uniqueStats matching this slot+name BEFORE falling back to the
    // catalog. Fused items are unique to the save and never appear in
    // ARMOR / EXPLORATION; without this check their AC would be lost.
    const unique = player.inventory.find((it) =>
      it.uniqueStats
      && it.uniqueStats.kind === 'armor'
      && it.uniqueStats.armorSlot === slot
      && it.name.toLowerCase() === name.toLowerCase(),
    );
    if (unique?.uniqueStats) {
      // arb117 — ladder fused armor resistances by rarity too (Rare 2 / Legendary 3),
      // seeded from the synth's single resistance.
      for (const r of fusedArmorResistances(unique.name, unique.uniqueStats.rarity, unique.uniqueStats.resistance)) {
        resistances.push(r);
        resistSlots.push({ type: r, slot });
      }
      // engine_Dev — coating-vial resists worked into this fused armor instance.
      for (const r of unique.addedResists ?? []) { resistances.push(r); resistSlots.push({ type: r, slot }); }
      continue;
    }
    const piece = findArmorByName(name);
    if (!piece) continue;
    // Per-instance rolled AC (stampDurability) takes precedence over the
    // catalog acBonus so two copies of the same piece differ. Resistances
    // still come from the catalog (not part of the instance roll).
    const inst = resolveEquippedItem(player, slot);
    // arb116 — rarity/material resistance ladder (not just the ~20 authored pieces).
    for (const r of armorResistances(piece)) {
      resistances.push(r);
      resistSlots.push({ type: r, slot });
    }
    // engine_Dev — coating-vial resists worked into this armor instance.
    for (const r of inst?.addedResists ?? []) { resistances.push(r); resistSlots.push({ type: r, slot }); }
  }
  // OTA-730's amulet + three-ring AC moved into `equippedGearAc` with the rest
  // of the gear stack (OTA-1135). It was the piece the panel could not see.
  //
  // ⚠⚠⚠ OTA-1649 — AND THE JEWELLERY'S RESISTS JOIN HERE, WHICH THEY NEVER DID.
  // Fifteen accessories have shipped carrying a `resistances` list; the item
  // card printed it as "Resists: aetheric"; this walk covered ARMOR_SLOTS only,
  // so every one of them arrived at the damage math as an empty list and
  // mitigated exactly nothing. Probed before the fix and pinned in ota1649: a
  // Legendary aetheric amulet read `fraction(aetheric) = 0`.
  //
  // ⚠ THEY JOIN THE EXISTING STACK rather than getting a parallel one. Same
  // multiplicative diminishing returns, same MAX_ARMOR_RESIST ceiling — so a
  // full jewellery build never reaches immunity, and a resist ring is worth
  // less on top of a resistant breastplate than it is worn alone, exactly like
  // a second piece of armour. The per-entry `weight` is what makes that work: a
  // ring's worth is its RARITY, not which finger it happens to sit on.
  const jewels = equippedAccessoryPowers(player);
  for (const r of jewels.resistances) resistances.push(r);
  for (const s of jewels.resistSlots) resistSlots.push(s);
  return { acBonus, resistances, resistSlots };
}

// OTA-836 — TAP-TO-EXPLAIN AC. The Character sheet used to show only
// effectiveAC() (race base + scene context), silently DROPPING the equipped
// armor / accessory AC, the ruins-defense title bonus, and any active
// stance/cover status — so a plate-armored player read the SAME "Armor Class"
// as a naked one. This returns the same total the enemy-attack resolver stands
// on (racialAC + armor + title + status; the dodge gamble is a per-swing AC
// BYPASS, not standing AC, so it's excluded), decomposed into labelled sources
// so the sheet can show WHY the number is what it is — matching the core-stat
// chips. Lives here (not equipment.ts) because aggregateArmor — with its fused /
// per-instance / accessory handling — is module-private, and keeping the display
// on the same helper the combat math uses stops the two from drifting.
export function effectiveACBreakdown(
  player: PlayerCharacter,
  scene: Parameters<typeof effectiveAC>[1],
): { total: number; base: number; sources: Array<{ label: string; delta: number }> } {
  const base = player.ac ?? 10;
  const racialAC = effectiveAC(player, scene); // base + race-conditional context delta
  const raceCtxDelta = racialAC - base;
  // ⚠ OTA-1135 — SPLIT, so the card can say WHICH gear. A single "armor +8" chip
  // over a panel reading 15 is what made this take three reports to find; "armor
  // +5 · accessories +3" answers it on sight.
  const gearAc = equippedGearAc(player);
  const armor = gearAc.worn;
  const accessories = gearAc.accessories;
  // OTA-1645 — named on its own chip, for the same reason armour and jewellery
  // are: a player reading "shield +4" can check the card against the number.
  const shield = gearAc.shield;
  // ruins-defense title (Protector / Warden): +AC inside a constructed environment.
  let titleRuinsAc = 0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tPerks = require('../engine/titles').titlePerkModifiers(player);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { detectACContexts } = require('../engine/raceMechanics');
  if (tPerks.ruinsDefenseBonus > 0 && detectACContexts(player, scene).has('constructed_environment')) {
    titleRuinsAc = tPerks.ruinsDefenseBonus;
  }
  const statusAdj = statusAcAdjustment(player.statusEffects);
  const sources: Array<{ label: string; delta: number }> = [];
  if (raceCtxDelta !== 0) sources.push({ label: 'race context', delta: raceCtxDelta });
  if (armor !== 0) sources.push({ label: 'armor', delta: armor });
  if (accessories !== 0) sources.push({ label: 'accessories', delta: accessories });
  if (shield !== 0) sources.push({ label: 'shield', delta: shield });
  if (titleRuinsAc !== 0) sources.push({ label: 'title (ruins)', delta: titleRuinsAc });
  if (statusAdj !== 0) sources.push({ label: 'stance/cover', delta: statusAdj });
  // ⚠ OTA-1140 (pressure test) — THE TRIM, WHICH THIS BREAKDOWN SKIPPED. The
  // resolver trims the standing subtotal (OTA-947) and adds status mods on top
  // at full value; this function claimed to be "the authority" while omitting
  // the trim entirely, so a raw-27 build read 27 on the expanded DEFENSE card,
  // 24 on the panel, and was defended at 24 — the 1156/1158 shape, on the
  // surface OTA-836 built specifically to explain the number. The trim is now
  // applied identically and NAMED as a source when it bites, so the chips
  // still sum to the total the player reads.
  const standingRaw = base + raceCtxDelta + armor + accessories + shield + titleRuinsAc;
  const trimDelta = trimStandingAc(standingRaw) - standingRaw;
  if (trimDelta !== 0) sources.push({ label: 'bulk trim', delta: trimDelta });
  const total = Math.max(1, trimStandingAc(standingRaw) + statusAdj);
  return { total, base, sources };
}

// Arbiter rolls enemy counter-attack — transparent to player per rulebook
// Run a counter-attack from every living enemy in the current scene. The
// player's single action provoked the whole group. Bail early if the
// player dies mid-volley so the rest of the group don't pile damage on a
// corpse.
// OTA-685 — per-enemy chance to swing at the DOG instead of the commander on a
// group volley. arb169 had (correctly) closed the "command the dog to dodge the
// group's retaliation" exploit by routing the WHOLE volley to the player - but it
// removed the dog from ALL retaliation, so the dog became invulnerable and the
// entire downed -> benched -> bleed-out system (and the vest's acBonus) went dead.
// This restores dog vulnerability WITHOUT reopening the exploit: the redirect
// fires on EVERY volley regardless of what the player did, so commanding the dog
// gives no defensive edge. ~1-in-4 of each enemy's swings goes to the dog; the
// vest's AC helps it dodge; a hit that drops it to 0 benches it (waiting_at_base)
// and starts the existing bleed-out clock.
const DOG_TARGET_CHANCE = 0.25;

/** AC bonus the dog's equipped vest confers. Catalog vests carry it directly;
 *  a Crucible-fused vest carries it on the matching inventory item's
 *  uniqueStats. Returns 0 when no vest / unknown. */
export function dogVestAcBonus(player: PlayerCharacter): number {
  const eq = player.dog?.equipped;
  const name = eq?.vest;
  if (!name) return 0;
  const catalog = findDogGearByName(name);
  if (catalog) return catalog.acBonus ?? 0;
  // OTA-696 — a fused vest carries its AC on the instance's uniqueStats. Resolve the
  // EXACT worn instance by id (so the right fused copy's bonus applies when you own
  // two same-named vests), falling back to first-by-name for legacy saves.
  const inst = (eq?.vestId ? player.inventory.find((i) => i.id === eq.vestId) : undefined)
    // OTA-1603 — the one predicate, not raw kind: a legacy vest whose stored
    // kind drifted still pays its AC on the dog.
    ?? player.inventory.find((i) => itemIsDogArmor(i) && i.name === name);
  return inst?.uniqueStats?.acBonus ?? 0;
}

// ⚠⚠⚠ OTA-1640 — THE VEST DOES WHAT ITS CARD SAYS. Owner: *"there's no use of
// having a legendary if it's got the same stats as a common or a rare."*
// Measured: dogGear.json ladders AC 1/2/3/4 and the AC was paid (above) — but
// the Rare vest's `reflectsCorruption` and the Legendary's `statBonus` (+1 STR)
// were data with NO reader anywhere in the engine: the dog's bite read
// `dog.stats.strength` raw, and nothing bit back. Two of four rungs on the
// ladder were decoration. These are their readers; the item card prints from
// the same fields, so it can never promise what combat will not pay.

/** The worn vest's bonus to one of the dog's three stats (catalog vests only;
 *  a fused vest carries AC, not a stat). 0 when none. */
export function dogVestStatBonus(
  player: PlayerCharacter,
  stat: 'strength' | 'dexterity' | 'intelligence',
): number {
  const name = player.dog?.equipped?.vest;
  if (!name) return 0;
  const catalog = findDogGearByName(name);
  return catalog?.statBonus?.stat === stat ? catalog.statBonus.amount : 0;
}

/** Aetheric damage the worn vest returns to whatever lands a hit on the dog.
 *  0 when the vest has no bite. */
export function dogVestReflect(player: PlayerCharacter): number {
  const name = player.dog?.equipped?.vest;
  if (!name) return 0;
  return findDogGearByName(name)?.reflectsCorruption ?? 0;
}

/** One enemy spends its swing on the dog. Mirrors applyEnemyCounter's roll but
 *  against the dog's own AC (10 + DEX mod + vest), with the enemy's damage
 *  notation. A hit to 0 benches the dog and stamps downedAtHour so tickDogStatus
 *  runs the 24h bleed-out. No player-only machinery (titles/race/resist) applies. */
export function applyEnemyCounterToDog(
  enemy: Enemy,
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): void {
  const player = get().player;
  const dog = player?.dog;
  if (!player || !dog || dog.status !== 'with_player' || dog.hp <= 0) return;
  const atkBonus = enemyAttackBonus(enemy); // OTA-1608 — one derivation, card included
  const atkRoll = rollDie(20);
  const atkTotal = atkRoll + atkBonus;
  const dexMod = Math.floor((dog.stats.dexterity - 10) / 2);
  const vestAc = dogVestAcBonus(player);
  const dogAc = Math.max(6, 10 + dexMod + vestAc);
  const crit = atkRoll === 20;
  const fumble = atkRoll === 1;
  const hit = fumble ? false : crit ? true : atkTotal >= dogAc;
  get().appendLog(
    'combat',
    `${enemy.name} turns on ${dog.name} — d20 ${atkRoll} + ATK ${atkBonus} = ${atkTotal} vs ${dog.name}'s AC ${dogAc}${vestAc ? ` (vest +${vestAc})` : ''} — ${fumble ? '✗ FUMBLE' : crit ? '✓ CRIT' : hit ? '✓ HIT' : '✗ MISS'}`,
    hit ? undefined : { combatOutcome: 'enemy_miss' },
  );
  if (!hit) return;
  let dmg = rollFromNotation(String(enemy.damage)) || rollDie(6);
  if (crit) dmg += rollFromNotation(String(enemy.damage)) || rollDie(6);
  const newHp = Math.max(0, dog.hp - dmg);
  const downed = newHp <= 0;
  const now = player.hoursElapsed ?? 0;
  // ⚠⚠ OTA-1412 — SURVIVING A HIT TRAINS DEX. The other half of the loop the
  // golem got at OTA-467 and the dog never did. Until now this function — the
  // ONE place in the game where the dog takes a hit and lives — trained nothing,
  // so the dog only ever grew by attacking. DEX is the right stat because it is
  // what the dog's AC is built from three lines above (10 + dexMod + vest), which
  // makes this the same "learn to take fewer hits" curve resilience gives the
  // golem — and under OTA-1412 every level-up also adds +3 max HP.
  //
  // ⚠ Only on a HIT THAT WAS SURVIVED, mirroring the golem's `else` branch: a
  // miss teaches nothing (the code already returned above) and being dropped is
  // not a lesson. Downed dogs bench with a 24h bleed-out; see below.
  const trained = downed ? null : trainDogStat({ ...dog, hp: newHp }, 'dexterity', true);
  set((s) => {
    if (!s.player?.dog) return s;
    const dd = s.player.dog;
    return {
      player: {
        ...s.player,
        dog: {
          ...dd,
          hp: trained ? trained.dog.hp : newHp,
          // ⚠ Spread the trained FIELDS onto the live record rather than
          // replacing it with `trained.dog`: the training was computed off the
          // dog captured at the top of this function, and only these four fields
          // are this call's to write.
          ...(trained
            ? {
                stats: trained.dog.stats,
                statProgress: trained.dog.statProgress,
                hpMax: trained.dog.hpMax,
              }
            : {}),
          ...(downed ? { status: 'waiting_at_base' as const, downedAtHour: now, bleedWarned: false } : {}),
        },
      },
    };
  });
  get().appendLog(
    'combat',
    `${dog.name} takes ${dmg}. (${trained ? trained.dog.hp : newHp}/${trained ? trained.dog.hpMax : dog.hpMax} HP left)`,
  );
  // ⚠⚠⚠ OTA-1650 — THE VEST TAKES THE HIT IT JUST SOFTENED. It has added its AC
  // to the dog's dodge since OTA-120 and has never cost a point for it, because
  // `lookupBaseDurability` never walked the dog-gear catalog — so no vest was
  // ever durable and there was nothing to wear. It is durable now, so it wears
  // here: one point per LANDED blow, the same rate the player's own armour pays,
  // on the same event (a hit that connects — a miss chips nothing).
  //
  // ⚠ IT WEARS AS AN ORDINARY INVENTORY ITEM, by its bound id. The vest lives in
  // the pack with `vestId` pointing at it, so `wearItemById` and the whole
  // break/repair machinery apply unchanged. What does NOT apply is
  // `wearEquippedItem`: that walks the PLAYER's slots to find the bound
  // instance, and the dog is not a player slot.
  const vestInst = dogVestInstance(player);
  if (vestInst?.durability) {
    const wear = wearItemById(player.inventory, vestInst.id);
    set((s) => (s.player ? { player: { ...s.player, inventory: wear.inventory } } : s));
    if (wear.broken) {
      // ⚠ The vest is gone, so the dog is not wearing it any more. Clearing both
      // the name AND the id matters: a later pickup of the same-named vest must
      // not resurrect the slot through a stale mapping (OTA-696's rule).
      set((s) => (s.player?.dog
        ? { player: { ...s.player, dog: { ...s.player.dog, equipped: { vest: null, vestId: null } } } }
        : s));
      get().appendLog('world', `${vestInst.name} comes apart on ${dog.name}'s back and falls away. ${dog.name} is unarmoured.`);
    } else {
      const now = wear.inventory.find((i) => i.id === vestInst.id);
      if (now?.durability && now.durability.current === COMPANION_FRAY_AT) {
        // The same warning the player's own gear got in OTA-959, and for the
        // same reason: the first thing you should hear about a piece of armour
        // is not that it is already gone.
        get().appendLog('system', `⚠ ${dog.name}'s ${now.name} is coming apart — a few more hits will finish it. Mend it at the bench or lose it.`);
      }
    }
  }
  // ⚠ OTA-1640 — THE VEST BITES BACK. The Aetheric Padded Vest's
  // `reflectsCorruption` was a "future hook" that never fired; now every hit
  // that lands on the dog returns that much aetheric to the attacker, and a
  // kill by it goes through resolveEnemyDefeat exactly as the dog's own bite does.
  const reflect = dogVestReflect(player);
  if (reflect > 0) {
    const scene = get().currentScene;
    const idx = scene ? scene.enemies.findIndex((e) => e === enemy) : -1;
    const at = idx >= 0 ? idx : (scene ? scene.enemies.findIndex((e, i) => e.name === enemy.name && (scene.enemyHps[i] ?? 0) > 0) : -1);
    if (scene && at >= 0) {
      const before = scene.enemyHps[at] ?? 0;
      const after = Math.max(0, before - reflect);
      set((s) => (s.currentScene
        ? { currentScene: { ...s.currentScene, enemyHps: s.currentScene.enemyHps.map((hp, i) => (i === at ? after : hp)) } }
        : s));
      get().appendLog('reward', `${dog.name}'s vest hums and gives it back — ${enemy.name} takes ${reflect} aetheric. (${after} HP left)`);
      if (before > 0 && after <= 0) {
        get().appendLog('world', `${enemy.name} drops, undone by what it took from ${dog.name}.`);
        set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, activeEnemyIdx: at } } : s));
        get().resolveEnemyDefeat();
      }
    }
  }
  if (trained?.leveled) {
    get().appendLog(
      'reward',
      `✦ ${dog.name}'s DEX rises to ${trained.leveled.to}.${dogHpGainClause(trained.dog, trained.leveled)}`,
    );
  }
  if (downed) {
    get().appendLog(
      'arbiter',
      applyDogPronouns(
        `${dog.name} drops under the ${enemy.name} and drags {reflexive} clear of the fight. {Pronoun} {isOrAre} down — tend {object} within a day or {pronoun} won't get back up.`,
        dog.sex.pronoun,
      ),
    );
  }
}

// OTA-800 — enemy DOT statuses (infection / poison / acid / corruption /
// electrical / burn / typed) must tick once per COMBAT ROUND, not only on the
// player's `attack`. Pre-fix the tick lived inline at the top of case 'attack',
// so a round spent on dodge / advance / retreat / flee-fail / golem / dog /
// throw froze every DOT — a poisoned enemy stopped taking poison the instant
// the player stopped swinging (playtest: coating a boss then kiting it did
// nothing). Extracted here and driven from runEnemyGroupCounters (the one call
// every combat round routes through), so every round ticks exactly once. The
// attack path still ticks at its own top — BEFORE the player's swing, so a
// swing that would kill still gets the loot before the DOT races it — and passes
// skipDotTick so the counter phase doesn't double-tick.
// Returns true if the tick ended the fight (all enemies dead → swept through
// resolveEnemyDefeat); the caller must then bail (no valid target left).
export function tickEnemyDotsAndMaybeEndFight(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): boolean {
  {
    const sceneNow = get().currentScene;
    if (sceneNow && sceneNow.enemyStatuses) {
      const newHps = [...sceneNow.enemyHps];
      const newStatuses = sceneNow.enemyStatuses.map((arr) => [...arr]);
      for (let i = 0; i < sceneNow.enemies.length; i++) {
        const hp = newHps[i];
        if (hp === undefined || hp <= 0) continue;
        const list = newStatuses[i] ?? [];
        const remaining: typeof list = [];
        for (const st of list) {
          // OTA-362 — coating DOTs (poison/acid/corruption) tick the
          // same way as the OTA-210 infection: dmgPerTurn off the HP,
          // decrement turns, expire with a kind-flavored line.
          const isDot = st.kind === 'infected'
            || st.kind === 'poison_coat'
            || st.kind === 'acid_coat'
            || st.kind === 'corruption_coat'
            || st.kind === 'electrical_coat'
            || st.kind === 'burn_coat'
            || st.kind === 'typed_dot';
          if (isDot && st.turnsRemaining > 0) {
            const dmg = st.dmgPerTurn;
            const updatedHp = Math.max(0, (newHps[i] ?? 0) - dmg);
            newHps[i] = updatedHp;
            const enemyName = sceneNow.enemies[i]!.name;
            const tickLine = st.kind === 'poison_coat'
              ? `${enemyName} shudders — poison eats ${dmg}.`
              : st.kind === 'acid_coat'
                ? `${enemyName} smokes — acid eats ${dmg}.`
                : st.kind === 'corruption_coat'
                  ? `${enemyName} blackens — corruption eats ${dmg}.`
                  : st.kind === 'electrical_coat'
                    ? `${enemyName} convulses — arcing current bites ${dmg}.`
                    : st.kind === 'burn_coat'
                      ? `${enemyName} blisters — clinging fire sears ${dmg}.`
                      : st.kind === 'typed_dot'
                        ? `${enemyName} suffers — ${st.sourceName} eats ${dmg}.`
                        : `${enemyName} convulses — infection bleeds ${dmg}.`;
            get().appendLog(
              'combat',
              `${tickLine} (${updatedHp}/${sceneNow.enemies[i]!.hp} HP, ${st.turnsRemaining - 1} turn${st.turnsRemaining - 1 === 1 ? '' : 's'} left)`,
            );
            if (st.turnsRemaining - 1 > 0) {
              remaining.push({ ...st, turnsRemaining: st.turnsRemaining - 1 });
            } else {
              // ⚠ OTA-1155 — SAY WHICH COATING. `sourceName` is the WEAPON, and one
              // weapon can carry two coatings: the owner's "acid-etched smoldering
              // foundry-born slinger" runs acid AND fire. Both lapsed on the same
              // tick at 2026-08-07T03:23:50 and printed the SAME sentence twice,
              // which is indistinguishable from a double-emit — it was reported as
              // one. The tick lines a few lines above already name the element;
              // this one threw that away at the last moment.
              const coatWord = st.kind === 'acid_coat' ? 'acid'
                : st.kind === 'burn_coat' ? 'fire'
                : st.kind === 'poison_coat' ? 'poison'
                : st.kind === 'corruption_coat' ? 'corruption'
                : st.kind === 'electrical_coat' ? 'current'
                : 'coating';
              get().appendLog(
                'combat',
                `${enemyName}${st.kind === 'infected' ? "'s fever breaks" : ` shakes off the last of the ${coatWord}`} — the ${st.sourceName} has run its course.`,
              );
            }
          } else {
            remaining.push(st);
          }
        }
        newStatuses[i] = remaining;
      }
      // ⚠ OTA-1150 (owner tuning) — ACID SHRED CLOSES BACK UP. It used to be
      // permanent for the fight: one flask in round one carried you to the last
      // blow, which is most of why acid outclassed every other coating.
      //
      // ⚠ THE GATE IS "NO LIVE ACID COAT", NOT "EVERY ROUND". A flat per-round
      // decay would cancel the +1 ACID_SHRED_PER_HIT exactly, shred would never
      // accumulate at all, and the mechanic would be deleted rather than tuned.
      // While the coating is still burning, the shred HOLDS and keeps climbing to
      // the cap; the round the DOT lapses, the guard starts knitting back at
      // ACID_SHRED_DECAY_PER_ROUND. Keep it up and you keep the opening.
      //
      // Read off `newStatuses` (post-tick), not the pre-tick scene, so the coat
      // that expired on THIS tick starts decaying on the NEXT round rather than
      // getting one free round of grace.
      let newShred = sceneNow.enemyArmorShred;
      if (newShred?.some((v) => (v ?? 0) > 0)) {
        const decayed = [...newShred];
        for (let i = 0; i < sceneNow.enemies.length; i++) {
          if ((decayed[i] ?? 0) <= 0) continue;
          if ((newHps[i] ?? 0) <= 0) continue;
          if ((newStatuses[i] ?? []).some((st) => st.kind === 'acid_coat')) continue;
          decayed[i] = Math.max(0, (decayed[i] ?? 0) - ACID_SHRED_DECAY_PER_ROUND);
        }
        newShred = decayed;
      }
      set((s) => s.currentScene
        ? {
          currentScene: {
            ...s.currentScene,
            enemyHps: newHps,
            enemyStatuses: newStatuses,
            ...(newShred ? { enemyArmorShred: newShred } : {}),
          },
        }
        : s);
    }
  }
  // OTA-957 — (was: last-enemy-only) a DOT tick that drops ANY enemy to 0 kills it
  // NOW. The old sweep only fired when EVERY enemy was dead; in a MIXED fight
  // the corpse was left standing at 0 HP "for the next attack to clean up" —
  // owner's log shows a raider at 0/28 hanging around until a whole extra swing
  // formally killed it, while a solo-fight Aetherkin died instantly from the
  // same tick. Every dead index now routes through resolveEnemyDefeat (loot,
  // kill bookkeeping, bounty credit), and the player's living TARGET is
  // re-pointed afterward so the sweep never silently retargets them.
  return sweepDeadEnemies(get, set);
}

/** ⚠ OTA-1195 — EXTRACTED VERBATIM FROM `tickEnemyDotsAndMaybeEndFight`, WHICH IS THE
 *  POINT. Resonance Cascade (PUNCHLIST P16) is the second thing in the game that can drop
 *  several enemies at once, and the DOT tick is the first — so it needed exactly this
 *  block. Copying it would have put two spellings of "who died, in what order, and who is
 *  the player still aiming at" in one file, which is how the two drift.
 *
 *  Returns TRUE if the sweep ended the fight (no enemies left).
 *
 *  Original comment, unchanged, because the reasoning is still the reasoning:
 *
 *  OTA-980 — (was: last-enemy-only) a DOT tick that drops ANY enemy to 0 kills it
 *  NOW. The old sweep only fired when EVERY enemy was dead; in a MIXED fight
 *  the corpse was left standing at 0 HP "for the next attack to clean up" —
 *  owner's log shows a raider at 0/28 hanging around until a whole extra swing
 *  formally killed it, while a solo-fight Aetherkin died instantly from the
 *  same tick. Every dead index now routes through resolveEnemyDefeat (loot,
 *  kill bookkeeping, bounty credit), and the player's living TARGET is
 *  re-pointed afterward so the sweep never silently retargets them. */
export function sweepDeadEnemies(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): boolean {
  const swept = get().currentScene;
  if (swept && swept.enemies.length > 0 && swept.enemyHps.some((h) => (h ?? 0) <= 0)) {
    const targetBefore = swept.enemies[swept.activeEnemyIdx] ?? null;
    let guard = 0;
    while (++guard <= 16) {
      const sc = get().currentScene;
      if (!sc || sc.enemies.length === 0) break;
      const deadIdx = sc.enemyHps.findIndex((h) => (h ?? 0) <= 0);
      if (deadIdx < 0) break;
      set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, activeEnemyIdx: deadIdx } } : s));
      get().resolveEnemyDefeat();
    }
    const scEnd = get().currentScene;
    if (!scEnd || scEnd.enemies.length === 0) return true;
    if (targetBefore) {
      const keep = scEnd.enemies.indexOf(targetBefore);
      if (keep >= 0 && keep !== scEnd.activeEnemyIdx) {
        set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, activeEnemyIdx: keep } } : s));
      }
    }
    // ⚠ OTA-1507 — however the sweep left the sights, the legacy band follows
    // them: bodies were spliced and the target may have been re-pointed, so
    // the compat `range` re-derives from whoever is actually on the card now.
    set((s) => (s.currentScene && s.currentScene.enemies.length > 0
      ? { currentScene: { ...s.currentScene, range: derivedSceneRange(s.currentScene) ?? s.currentScene.range } }
      : s));
  }
  return false;
}

/** ⚠ OTA-1120 — THE VOLLEY AFTER A KILL. Owner's log: *"Bog Hound sat out a
 *  fight after the Silt Thief died."* It did, and so does every packmate of
 *  anything you drop.
 *
 *  Four combat paths were written as `if (kill) resolveEnemyDefeat(); else {
 *  …volley }` — an else that reads as "the enemy is dead, there is nothing to
 *  counter with", which is true in the SOLO fight those paths were first
 *  written for and false the moment a pack is involved. A killing blow bought
 *  the player the whole group's round: kill one raider of five and the other
 *  four never swung. Chain it — one kill per round — and a pack fight costs
 *  nothing at all.
 *
 *  The bug is the SHAPE, not any one site, so the guard gets a name and every
 *  killing blow routes through it. The check is on SURVIVORS, not on whether a
 *  kill happened: `resolveEnemyDefeat` clears the scene when the last enemy
 *  falls, so a fight you just ended correctly runs nothing, while a fight that
 *  still has bodies in it swings back. `runEnemyGroupCounters` already skips
 *  the dead, the KO'd, and the out-of-reach, so this only has to answer "is
 *  anyone left".
 *
 *  ⚠ The item-throw path (OTA-825) already did this correctly and is the
 *  model — it closed the identical hole for throws and the reasoning is in its
 *  comment. This finishes the job for the other four. */
export function runSurvivorVolley(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  player: PlayerCharacter,
  opts?: { forceDogEnemyIdx?: number; skipDotTick?: boolean },
): void {
  const scene = get().currentScene;
  if (!scene || scene.enemies.length === 0) return;
  runEnemyGroupCounters(get, set, get().player ?? player, opts);
}

/** OTA-1202 — swap one trait for another on a live enemy, by index. The technique
 *  lifecycle lives entirely in TRAITS (technique: → field:/slip_held/veiled_strike →
 *  technique_spent:) so it persists with the scene and shows in the portrait at every
 *  stage, exactly as the resists do. */
function swapEnemyTrait(
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  idx: number,
  drop: (t: string) => boolean,
  add: string[],
): void {
  set((s) => {
    if (!s.currentScene) return s;
    const enemies = s.currentScene.enemies.map((e, i) => (
      i === idx
        ? { ...e, traits: [...(e.traits ?? []).filter((t) => !drop(t)), ...add] }
        : e
    ));
    return { currentScene: { ...s.currentScene, enemies } };
  });
}

/** OTA-1202 — an enemy with an unspent technique CHANNELS instead of swinging (the cost
 *  mirror, owner: "agree" — exactly the player's turn cost, reflected). Returns true if
 *  the enemy spent its action here. Cascade holders WAIT until cornered (hp < 35%) —
 *  burning the burst on round one would waste the drama and the tactic. */
function enemyChannelsTechnique(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  enemy: Enemy,
  idx: number,
): boolean {
  const traits = enemy.traits ?? [];
  const tech = traits.find((t) => t.startsWith('technique:'));
  if (!tech) return false;
  const id = tech.slice('technique:'.length);
  const scene = get().currentScene;
  if (!scene) return false;

  if (id === 'resonance_cascade') {
    const hp = scene.enemyHps[idx] ?? 0;
    const max = scene.enemies[idx]?.hp ?? 1;
    if (hp / max >= 0.35) return false;   // not cornered yet — it fights on, holding it
    // ⚠ THE BURST. 5d10 at the player — halved by carried aetheric resistance, the same
    // read the weather uses — and 1d10 back through the thing itself, the kickback the
    // player's own Cascade pays. Once, ever: the trait goes to spent before damage lands
    // so no re-entry can double-fire it.
    swapEnemyTrait(set, idx, (t) => t === tech, [`technique_spent:${id}`]);
    let out = 0; for (let d = 0; d < 5; d++) out += rollDie(10);
    const resists = playerArmorResistKinds(get().player!).includes('aetheric');
    const dmg = Math.max(1, resists ? Math.ceil(out / 2) : out);
    const kick = rollDie(10);
    get().appendLog('combat',
      `${enemy.name} is cornered — and LETS IT RUN. Resonance Cascade: 5d10 → ${out}${resists ? ` (aetheric resist halves it to ${dmg})` : ''} slams into you, and 1d10 → ${kick} tears back through it.`);
    set((s) => (s.player ? { player: { ...s.player, hp: Math.max(0, s.player.hp - dmg) } } : s));
    set((s) => {
      if (!s.currentScene) return s;
      const hps = [...s.currentScene.enemyHps];
      hps[idx] = Math.max(0, (hps[idx] ?? 0) - kick);
      return { currentScene: { ...s.currentScene, enemyHps: hps } };
    });
    checkLowHpWarning((get().player?.hp ?? 0) + dmg, get().player?.hp ?? 0, get().player?.hpMax ?? 1, get, set);
    sweepDeadEnemies(get, set);
    return true;
  }

  // The three held fields: channel now (this IS the swing), effect lands as a trait.
  if (id === 'aether_shield') {
    swapEnemyTrait(set, idx, (t) => t === tech, ['field:aether_shield', `technique_spent:${id}`]);
    get().appendLog('combat',
      `${enemy.name} stops — and the air in front of it thickens, faintly bright. An AETHER SHIELD stands where its swing should have been (+3 AC).`,
      { combatOutcome: 'enemy_miss' });
    return true;
  }
  if (id === 'temporal_slip') {
    swapEnemyTrait(set, idx, (t) => t === tech, ['slip_held', `technique_spent:${id}`]);
    get().appendLog('combat',
      `${enemy.name} goes still, half a beat out of step with the room. It holds a TEMPORAL SLIP instead of swinging — your next clean hit may find nothing.`,
      { combatOutcome: 'enemy_miss' });
    return true;
  }
  if (id === 'veil_of_ether') {
    swapEnemyTrait(set, idx, (t) => t === tech, ['veiled_strike', `technique_spent:${id}`]);
    get().appendLog('combat',
      `The light around ${enemy.name} bends and declines to leave. It spends the beat VEILED — the next strike will come from somewhere you are not watching.`,
      { combatOutcome: 'enemy_miss' });
    return true;
  }
  return false;
}

export function runEnemyGroupCounters(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  fallbackPlayer: PlayerCharacter,
  // OTA-795 — a failed dog distract redirects THAT enemy's counter onto the
  // dog (it rounds on the feint) instead of rolling the usual soak chance.
  // OTA-800 — skipDotTick is set by the attack path, which already ticked its
  // DOTs at the top of case 'attack' (before the swing); every other combat
  // round leaves it unset so DOTs tick here, once, as the enemy group acts.
  opts?: { forceDogEnemyIdx?: number; skipDotTick?: boolean },
): void {
  const scene = get().currentScene;
  if (!scene || scene.enemies.length === 0) return;
  // Tick enemy DOTs as the enemy group takes its turn (unless the caller — the
  // attack path — already ticked). If the tick ends the fight, there's no group
  // left to counter.
  if (!opts?.skipDotTick && tickEnemyDotsAndMaybeEndFight(get, set)) return;
  const scenePostDot = get().currentScene;
  if (!scenePostDot || scenePostDot.enemies.length === 0) return;
  // Snapshot the enemies up-front so a death mid-volley (player killing
  // one by reaction, etc) doesn't reshape the iteration.
  const attackers = [...scene.enemies];
  // OTA-1089 — rotate who leads the volley so the melee swing cap below
  // doesn't bench the same tail members every round; the pack takes turns
  // pressing in.
  const volleyLead = attackers.length > 1 ? Math.floor(Math.random() * attackers.length) : 0;
  const volleyOrder = [...attackers.slice(volleyLead), ...attackers.slice(0, volleyLead)];
  const benchedBelow: string[] = [];
  const crowdedOut: string[] = [];
  let meleeSwings = 0;
  // ⚠ OTA-1140 (pressure test) — THE PACK PURSUES. The exploit sweep rated
  // step-back kiting CRITICAL: nothing in the codebase ever closed the range
  // toward the player — the only mid-combat writer of scene.range was the
  // player's own advance/retreat, the mid→far retreat drew no counter and cost
  // no stamina, and a ranged weapon reaches all four bands. One free "retreat"
  // therefore turned every melee enemy in the game, Core Guardians included
  // ("Frost Staff Strike" matches no projectile word), into a target that
  // never fights back. Now: when a living, conscious enemy spent its turn out
  // of reach, the pack closes ONE band at the end of the volley — kiting still
  // buys the round it always bought, it just stops buying the whole fight.
  const outOfReach: string[] = [];
  // ⚠ OTA-1506 — the pursuit is per-BODY, and names collide ("2 Gutter Rats"),
  // so the indices of the benched are tracked alongside the narration names.
  const outOfReachIdx: number[] = [];
  // OTA-1572 — bodies that lost the round to a stun / paralyze / restraint.
  const heldByControl: string[] = [];
  for (let i = 0; i < volleyOrder.length; i++) {
    const enemy = volleyOrder[i]!;
    // Skip enemies that died earlier this round (HP <= 0 in the live
    // scene array).
    const liveScene = get().currentScene;
    if (!liveScene) return;
    const liveIdx = liveScene.enemies.findIndex((e) => e === enemy);
    if (liveIdx < 0) continue;
    const hpAtCounter = liveScene.enemyHps[liveIdx];
    if (hpAtCounter === undefined || hpAtCounter <= 0) continue;
    // OTA-361 — a knocked-out enemy is unconscious: it never counters.
    if (liveScene.enemyKnockedOut?.[liveIdx]) continue;
    // ⚠⚠⚠ OTA-1572 — AND A STUNNED, PARALYZED OR RESTRAINED ENEMY FORFEITS ITS
    // SWING. This is the line that makes thirty-three weapon cards true: before
    // it, Sparkstrike's "1-round stun on a hit" cost the enemy nothing at all.
    // Placed beside the knocked-out skip because it is the same claim at a
    // smaller scale — this body is not acting this round. The HINDER kinds
    // deliberately do NOT land here: a prone or blinded enemy still swings, it
    // just swings worse (see controlAttackPenalty).
    const ctrlNow = liveScene.enemyControl?.[liveIdx];
    if (isSkipControl(ctrlNow)) {
      heldByControl.push(`${enemy.name} (${controlLabel(ctrlNow!.kind)})`);
      continue;
    }
    // Range gate — melee enemies can't counter when THEY stand at 'far';
    // ranged enemies (matched on attack/damage flavor) reach from far too.
    // ⚠ OTA-1506 — judged at THIS enemy's own band, not a shared one: the
    // spear-length man in your face swings while his distant packmates walk.
    const liveRange = enemyBandOf(liveScene, liveIdx);
    if (!enemyCanReach(enemy, liveRange)) {
      outOfReach.push(enemy.name);
      outOfReachIdx.push(liveIdx);
      continue;
    }
    // Bail if the player is dead.
    const livePlayer = get().player;
    if (!livePlayer || livePlayer.hp <= 0 || livePlayer.dead) return;
    // OTA-685 - chance this enemy swings at the dog instead of the commander.
    // Only when the dog is actually at the player's side and up; the swing is
    // then SPENT on the dog (the player is spared it), so the dog genuinely
    // soaks. Fires on every volley regardless of the player's action, so it
    // can't be gamed by commanding the dog (the arb169 exploit stays closed).
    const dogNow = livePlayer.dog;
    const dogUp = !!dogNow && dogNow.status === 'with_player' && dogNow.hp > 0;
    // OTA-795 — failed-distract redirect wins over the random soak roll.
    const forcedOnDog = dogUp && opts?.forceDogEnemyIdx === liveIdx;
    // ⚠ OTA-1142 (owner tuning) — BOSSES FIGHT THE PERSON IN FRONT OF THEM.
    // The random soak silently collapsed 25% of boss rounds to one under-rolled
    // swing at the dog (the redirect skips the second-swing block AND
    // applyEnemyCounterToDog rolls no boss +1d6) — an invisible difficulty
    // coin-flip every boss round, and dog HP fed into hits far above its
    // weight. Ordinary enemies keep the soak: that is the dog doing its job.
    // A FAILED DISTRACT still redirects even on a boss — commanding the dog at
    // a boss and blowing the roll is a consequence the player chose (OTA-795).
    if (dogUp && (forcedOnDog || (!enemy.boss && Math.random() < DOG_TARGET_CHANCE))) {
      applyEnemyCounterToDog(enemy, get, set);
      continue;
    }
    // OTA-960 — ELEVATION: a grounded melee enemy massed at the BASE cannot swing
    // at a player who is up the climb. Airborne enemies fight you level;
    // grounded RANGED enemies still shoot up from below. (Owner: "you can be
    // attacked by airborn creatures and with shots from below.") Summit/wall
    // fights (enemiesAtBase unset) are untouched.
    if (liveScene.elevatedOn && liveScene.enemiesAtBase
        && !enemyIsAirborne(enemy) && !isRangedEnemy(enemy)) {
      benchedBelow.push(enemy.name);
      continue;
    }
    // OTA-1089 — PACK ACTION ECONOMY: only MELEE_PACK_SWINGS_PER_ROUND melee
    // blades fit around one person at a time. A 5-raider wall was five attack
    // rolls and five stun rolls a round — more dice than drama (and the sim's
    // whole stall tail). The overflow presses in behind, one line, dedup-quiet.
    //
    // ⚠ OTA-1093 — THE EXEMPTION IS NOW RANGE-AWARE. 1112 exempted every ranged
    // enemy outright, reasoning that "a shooter needs no elbow room". True at
    // far; false in a scrum. The owner's five-raider fight was MIXED — two
    // crossbow bodies, three cudgel — so only the cudgels counted, the cap never
    // engaged, and he still ate four attacks a round at arm's reach. A shooter
    // standing INSIDE the ring is jostling for the same space as everyone else,
    // so at close range it takes a slot like any other body. Bosses stay exempt
    // at every band; ranged enemies keep their exemption at mid and beyond,
    // which is the case the reasoning was actually about.
    // ⚠ OTA-1506 — the scrum is per-body now: a shooter is jostling for space
    // only when HE is standing in it, not when the active target happens to be.
    const inTheScrum = liveRange === 'close';
    const meleeAttacker = !enemy.boss && (inTheScrum || !isRangedEnemy(enemy));
    // ⚠ OTA-1113 — THE CAP MOVES WITH THE PACK, AND BY LESS. A tier that grows
    // parties without growing this cap does not make the fight harder, it makes
    // it LONGER: the extra bodies queue behind a cap that never lets them act,
    // and the combatStress stall tail OTA-1089 was written to kill comes
    // straight back. scaledSwingCap grows at the square root of `pack` and
    // floors at the shipped value, so 'bury_me' presses harder without becoming
    // a shredder and no tier ever swings less than the game does today.
    const swingCap = scaledSwingCap(MELEE_PACK_SWINGS_PER_ROUND, profileOf(get().player).pack);
    if (meleeAttacker && meleeSwings >= swingCap) {
      crowdedOut.push(enemy.name);
      continue;
    }
    // ⚠ OTA-1141 (owner tuning) — A STAGGER DENIES ONE SWING, WHICHEVER SWING
    // THAT IS. OTA-1137's stagger cancelled the SECOND swing; the owner's tier
    // gate below removes that swing from tier 1-2 Guardians, which would have
    // made the Searing Paste worthless exactly where he fights. So on a gated
    // single-swing boss the stagger denies the ONLY swing this round. That is
    // the same absolute value it has against a big boss (one swing per round),
    // and the fight stays real: the boss swings on every round the player does
    // NOT land a fresh weakness hit. (1160's "first swing always lands" note
    // is deliberately revised for the gated tiers — the trade the owner chose.)
    if (enemy.boss && !bossSwingsTwice(enemy) && takeStagger(get, set, liveIdx)) {
      get().appendLog('combat', `${enemy.name} reels — STAGGERED: no swing this round.`, { combatOutcome: 'enemy_miss' });
      continue;
    }
    // ⚠ OTA-1202 — an unspent technique is channelled HERE, consuming the swing (the
    // cost mirror). Placed after every skip/bench check so a benched or staggered enemy
    // does not get a free channel the player never saw.
    if (enemyChannelsTechnique(get, set, enemy, liveIdx)) {
      if (meleeAttacker) meleeSwings++;
      continue;
    }
    // Pass live index so applyEnemyCounter can resolve ambush_strike
    // (one-shot +2 to the first counter for enemies with the trait).
    applyEnemyCounter(enemy, livePlayer ?? fallbackPlayer, get, set, liveIdx);
    if (meleeAttacker) meleeSwings++;
    // Boss tier: a second counter swing after the first lands. Skipped
    // if the first counter killed the player, or if the enemy itself
    // dropped (riposte / fight-back path).
    if (enemy.boss && bossSwingsTwice(enemy)) {
      const liveAfter = get().player;
      const sceneAfter = get().currentScene;
      if (!liveAfter || liveAfter.hp <= 0 || liveAfter.dead) return;
      const enemyStillAlive = sceneAfter
        && (sceneAfter.enemyHps[liveIdx] ?? 0) > 0
        && sceneAfter.enemies[liveIdx] === enemy;
      if (enemyStillAlive) {
        // ⚠ OTA-1137 — AND THIS IS WHAT THE WEAKNESS BUYS. A staggered boss
        // forfeits the second swing OTA-1136 measured at half its round output.
        // Checked here rather than at the top of the volley on purpose: the
        // FIRST swing always lands, so hitting a weakness never makes a boss
        // harmless — it halves the round and gives the player something they
        // can watch work.
        if (takeStagger(get, set, liveIdx)) {
          get().appendLog('combat', `${enemy.name} gathers for the second strike — and the wound tells. STAGGERED: no second swing this round.`, { combatOutcome: 'enemy_miss' });
        } else {
          get().appendLog('combat', `${enemy.name} presses the second strike — bosses do not yield the tempo.`);
          applyEnemyCounter(enemy, liveAfter, get, set, liveIdx, true);
        }
      }
    }
  }
  // OTA-1140 — the pursuit itself. ⚠ OTA-1506 — PER BODY now: each enemy that
  // spent its turn out of reach walks ONE step straight down its own line
  // (enemyCloses keeps the bearing — he is coming at you, not circling), while
  // packmates already in reach hold their ground. Kiting still buys the round
  // it always bought; it just stops buying the whole fight — and it no longer
  // teleports the whole pack when one straggler closes.
  if (outOfReach.length > 0 && (get().player?.hp ?? 0) > 0) {
    const sceneAtClose = get().currentScene;
    if (sceneAtClose) {
      const pursuers = new Set(outOfReachIdx);
      const closedEnemies = sceneAtClose.enemies.map((e, i) => {
        if (!pursuers.has(i) || (sceneAtClose.enemyHps[i] ?? 0) <= 0) return e;
        return { ...e, pos: enemyCloses(enemyPosOf(sceneAtClose, i)) };
      });
      const withPositions: CurrentScene = { ...sceneAtClose, enemies: closedEnemies };
      set((s) => (s.currentScene
        ? { currentScene: { ...s.currentScene, enemies: closedEnemies, range: derivedSceneRange(withPositions) } }
        : s));
      const first = outOfReach[0]!;
      const rest = outOfReach.length - 1;
      get().appendLog(
        'combat',
        rest > 0
          ? `${first} and ${rest} other${rest > 1 ? 's' : ''} close the distance.`
          : `${first} closes the distance.`,
      );
    }
  }
  // OTA-960 — the grounded melee pack that can't reach an elevated player gets ONE
  // line, not silence (and not five). Standard dedup keeps repeats quiet.
  if (benchedBelow.length > 0 && (get().player?.hp ?? 0) > 0) {
    const first = benchedBelow[0]!;
    const rest = benchedBelow.length - 1;
    get().appendLog(
      'world',
      rest > 0
        ? `Below, ${first} and ${rest} other${rest > 1 ? 's' : ''} circle the base — nothing down there can reach you.`
        : `Below, ${first} circles the base — it cannot reach you up here.`,
    );
  }
  // OTA-1089 — the swing-capped overflow gets ONE line, not silence (and not
  // one line per benched raider). Standard dedup keeps round-over-round
  // repeats quiet.
  if (crowdedOut.length > 0 && (get().player?.hp ?? 0) > 0) {
    const first = crowdedOut[0]!;
    const rest = crowdedOut.length - 1;
    get().appendLog(
      'combat',
      rest > 0
        ? `${first} and ${rest} other${rest > 1 ? 's' : ''} press in behind their own pack, waiting for an opening.`
        : `${first} presses in behind the others, waiting for an opening.`,
    );
  }
  // ⚠⚠ OTA-1572 — AND THE PLAYER IS TOLD THE CONTROL WORKED. A skipped swing
  // with no line is indistinguishable from an enemy that simply missed, which
  // is the same defect as a weapon card that promises what the engine ignores:
  // the effect exists and the player cannot tell. One line for the whole group,
  // like every other bench above it.
  if (heldByControl.length > 0 && (get().player?.hp ?? 0) > 0) {
    const first = heldByControl[0]!;
    const rest = heldByControl.length - 1;
    get().appendLog(
      'combat',
      rest > 0
        ? `${first} and ${rest} other${rest > 1 ? 's' : ''} cannot act — your last blow is still holding them.`
        : `${first} — held by your last blow, and it loses the round.`,
    );
  }
  // ⚠⚠ OTA-1572 — AND THE CLOCK RUNS, once per volley, AFTER the skips above
  // have been taken. Ticking any earlier would spend a 1-round stun before it
  // cost anybody a swing, which is the same as not having it at all.
  tickEnemyControls(get, set);
}

/**
 * OTA-1572 — one round off every enemy's control and its brace.
 *
 * ⚠⚠ THE BRACE TICKS INDEPENDENTLY of the control that granted it, and that is
 * the entire anti-lock mechanism. If they shared a clock, a 1-round stun and its
 * immunity would expire together and the very next swing would re-stun — the
 * 844-stuns/run shape OTA-1089 measured on the player side, pointed the other
 * way. Exported because a lock is a multi-round property that cannot be proved
 * from a single call.
 */
export function tickEnemyControls(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): void {
  const sc = get().currentScene;
  if (!sc || (!sc.enemyControl && !sc.enemyBraced)) return;
  set((s) => {
    const cur = s.currentScene;
    if (!cur) return {};
    const n = cur.enemies.length;
    const ctrls = cur.enemyControl ?? [];
    const braces = cur.enemyBraced ?? [];
    const nextC: Array<EnemyControlState | null> = [];
    const nextB: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = tickControl(ctrls[i] ?? null, braces[i] ?? 0);
      nextC.push(r.control);
      nextB.push(r.braceRounds);
    }
    return { currentScene: { ...cur, enemyControl: nextC, enemyBraced: nextB } };
  });
}

// arb119 — damage-type parsing/inference moved to engine/damageTypes.ts
// (parseDamageTypeKeyword + enemyDamageType), shared with the EnemyPanel.
export const BUILTIN_DT_COMBAT: Record<string, DTProc> = {
  piercing:    { mode: 'on_hit', baseChance: 0.5, weakBonus: 0.2, strongPenalty: 0.2 },
  slashing:    { mode: 'on_hit', baseChance: 0.5, weakBonus: 0.2, strongPenalty: 0.2 },
  degradation: { mode: 'on_hit', baseChance: 0.5, weakBonus: 0.2, strongPenalty: 0.2 },
  bludgeoning: { mode: 'on_hit', baseChance: 0.5, weakBonus: 0.2, strongPenalty: 0.2, debuffStat: 'dexterity', debuffAmt: -1, debuffRounds: 2 },
  electrical:  { mode: 'on_hit', baseChance: 0.45, weakBonus: 0.3, strongPenalty: 0.3, debuffStat: 'strength', debuffAmt: -1, debuffRounds: 2 },
  aetheric:    { mode: 'on_hit', baseChance: 0.45, weakBonus: 0.3, strongPenalty: 0.3, debuffStat: 'dexterity', debuffAmt: -2, debuffRounds: 1 },
  stun:        { mode: 'on_hit', baseChance: 0.4, weakBonus: 0.2, strongPenalty: 0.2, debuffStat: 'dexterity', debuffAmt: -2, debuffRounds: 2 },
  cold:        { mode: 'on_hit', baseChance: 0.45, weakBonus: 0.3, strongPenalty: 0.3, debuffStat: 'dexterity', debuffAmt: -1, debuffRounds: 2 }, // chill slows → exposed
  burn:        { mode: 'dot', rounds: 2, baseChance: 0.45, weakBonus: 0.2, strongPenalty: 0.3 },
  poison:      { mode: 'dot', rounds: 2, baseChance: 0.45, weakBonus: 0.2, strongPenalty: 0.3 },
  radiation:   { mode: 'dot', rounds: 3, baseChance: 0.45, weakBonus: 0.2, strongPenalty: 0.4 },
};

// Damage-type synonyms → canonical proc key. NOTE every alias TARGET must exist in BUILTIN_DT_COMBAT
// above (e.g. frost→cold requires a `cold` entry) or the proc silently never fires for that type.
const DT_ALIAS_G: Record<string, string> = { force: 'aetheric', psychic: 'aetheric', frost: 'cold', shock: 'electrical' };

export function canonDT(name: string | null | undefined): string { const lc = (name ?? '').toLowerCase(); return DT_ALIAS_G[lc] ?? lc; }

export function dtProcChance(p: DTProc, match: 'weak' | 'resist' | 'normal'): number {
  return Math.max(0, Math.min(1, p.baseChance + (match === 'weak' ? p.weakBonus : match === 'resist' ? -p.strongPenalty : 0)));
}

function applyEnemyCounter(
  enemy: Enemy,
  player: PlayerCharacter,
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  enemyIdx?: number,
  // OTA-796 — set on a boss's SECOND swing of the volley so the end-of-round
  // regen doesn't fire twice per round (fast_regen is tuned to 2 HP/round but
  // bosses got 4/round, out-healing coating DOTs — exploit-sweep balance bug).
  secondSwing?: boolean,
) {
  // Full cover vs ranged enemies auto-misses. OTA-796 — uses the shared
  // isRangedEnemy classifier (was a second, different regex).
  const enemyIsRanged = isRangedEnemy(enemy);
  if (hasFullCover(player.statusEffects) && enemyIsRanged) {
    get().appendLog(
      'combat',
      `${enemy.name} fires, but full cover blocks the line — ✗ AUTO-MISS.`,
    );
    return;
  }

  // ⚠⚠⚠ OTA-1510 — THE SHIELD'S PROMISE, KEPT HERE: a raised BLOCK absorbs
  // the FIRST incoming attack, whole — no roll, no partials — and is spent on
  // the spot. Owner: "if you're using it as a defense, it only absorbs the
  // first incoming attack." The second attacker of the same volley finds the
  // shield already ringing and resolves normally, which is exactly the cost
  // of holding position while everybody gets a shot.
  if ((player.statusEffects ?? []).some((e) => e.kind === 'shield_block' && e.remainingRounds > 0)) {
    set((s) => (s.player
      ? { player: { ...s.player, statusEffects: (s.player.statusEffects ?? []).filter((e) => e.kind !== 'shield_block') } }
      : s));
    get().appendLog(
      'combat',
      `${enemy.name} strikes — and the blow breaks WHOLE on your raised shield. ✓ BLOCKED (absorbed; the block is spent).`,
      { combatOutcome: 'enemy_miss' },
    );
    return;
  }

  // Fight Back — if the player declared fight_back this round, the
  // enemy attack resolves as an opposed Fighting roll instead of a
  // flat AC check. Both roll d20 + their fighting stat; higher wins.
  // Critical strikes / impaling do NOT apply on fight-back per the
  // action card.
  const fb = (player.statusEffects ?? []).find((e) => e.kind === 'fighting_back');
  if (fb) {
    const stats = effectiveStats(player);
    const playerRoll = rollDie(20);
    const playerTotal = playerRoll + stats.strength;
    const enemyRoll = rollDie(20);
    // 2026-05-25 — `enemy.attack` is the attack name ("Tusk Charge",
    // "Pulse Strike") not a number. parseInt always returned NaN → 3
    // default. Derive the bonus from the abilityPoint string instead.
    const enemyTotal = enemyRoll + parseEnemyAP(enemy) + traitAttackBonus(enemy.traits);
    const playerWins = playerTotal > enemyTotal;
    const tie = playerTotal === enemyTotal;
    get().appendLog(
      'combat',
      `Fight Back — You d20 ${playerRoll} + STR ${stats.strength} = ${playerTotal} vs ${enemy.name} d20 ${enemyRoll} + ATK ${enemy.attack} = ${enemyTotal} — ${playerWins ? '✓ YOU LAND' : tie ? '⟂ TIE (attacker wins)' : '✗ THEY LAND'}`,
    );
    // Consume the fighting_back status either way.
    set((s) =>
      s.player
        ? { player: { ...s.player, statusEffects: (s.player.statusEffects ?? []).filter((e) => e.kind !== 'fighting_back') } }
        : s,
    );
    if (playerWins) {
      // OTA 058 — Fight Back is a STR contest; winning trains STR.
      {
        const liveFighter = get().player;
        if (liveFighter) {
          const tr = trainStat(liveFighter, 'strength', true);
          set((s) => (s.player ? { player: tr.player } : s));
          if (tr.leveled) {
            get().appendLog(
              'reward',
              `✦ Strength remembers itself. +1 STR (${statNowClause(get().player, 'strength', tr.leveled.to)}).`,
            );
          }
        }
      }
      // Player lands a hit on enemy as part of trading.
      const equipped = player.equipped?.main ? findWeaponByName(player.equipped.main) : null;
      // OTA-806 [Group-K audit] — the fight-back trade dealt untyped damage,
      // bypassing the weakness system on this counter path. Apply the equipped
      // weapon's type (bare-hand = bludgeoning, matching the primary attack) so a
      // trade against a weak/resistant foe scales like a normal swing.
      const rawFb = equipped ? rollDie(6) + 1 : rollDie(4);
      const fbType = equipped ? (equipped.damageType ?? null) : 'bludgeoning';
      const fbMod = combineDamageTypeMatch(
        applyDamageTypeModifier(rawFb, fbType, enemy.type).match,
        traitDamageMultiplier(enemy.traits, fbType).match,
      );
      const dmg = Math.max(1, Math.round(rawFb * fbMod.multiplier));
      const live = get().currentScene;
      if (live) {
        const idx = live.enemies.findIndex((e) => e === enemy);
        if (idx >= 0) {
          const hp = Math.max(0, (live.enemyHps[idx] ?? enemy.hp) - dmg);
          set((s) => {
            if (!s.currentScene) return {};
            const hps = [...s.currentScene.enemyHps];
            hps[idx] = hp;
            return { currentScene: { ...s.currentScene, enemyHps: hps } };
          });
          get().appendLog('combat', `Your fight-back strike for ${dmg} damage. ${enemy.name} HP ${hp}/${enemy.hp}.`, { combatOutcome: 'player_dmg' });
          if (hp <= 0) {
            set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, activeEnemyIdx: idx } } : s));
            void Promise.resolve().then(() => get().resolveEnemyDefeat());
          }
        }
      }
      return; // tie/player-win: enemy's strike doesn't land.
    }
    // Tie or enemy-win: fall through and apply enemy damage as normal.
  }

  // 2026-05-25 — same fix as enemyTotal above. attack is a name, not
  // a number; derive bonus from abilityPoint.
  // OTA-1608 — one derivation (the portrait card reads the same function);
  // trait bonus is folded in.
  const baseAtk = enemyAttackBonus(enemy);
  // Ambush bonus — one-shot +2 on the FIRST counter this enemy makes
  // in the scene (~16 enemies in data/enemies/enemies.json declare
  // 'ambush_strike'; previously the trait was exported but never
  // referenced, so it did nothing). enemyIdx is set by the caller;
  // when present and the slot's flag is false, apply the bonus and
  // mark the slot true so subsequent counters get the base value.
  const liveScene = get().currentScene;
  const ambushBonus = (() => {
    if (enemyIdx == null || !liveScene) return 0;
    const used = liveScene.enemyAmbushUsed?.[enemyIdx] ?? true;
    if (used) return 0;
    const bonus = traitAmbushBonus(enemy.traits);
    if (bonus > 0) {
      set((s) => {
        if (!s.currentScene) return s;
        const used = [...(s.currentScene.enemyAmbushUsed ?? s.currentScene.enemies.map(() => false))];
        used[enemyIdx] = true;
        return { currentScene: { ...s.currentScene, enemyAmbushUsed: used } };
      });
    }
    return bonus;
  })();
  // ⚠ OTA-1202 — the VEILED strike lands. The Veil channel spent last round's swing; the
  // payoff is +5 on THIS one — the same +5 the player's `stealthed` grants — consumed on
  // use, exactly like ambush_strike above it.
  const veiledBonus = (() => {
    if (enemyIdx == null || !(enemy.traits ?? []).includes('veiled_strike')) return 0;
    set((s) => {
      if (!s.currentScene) return s;
      const enemies = s.currentScene.enemies.map((e, i) => (
        i === enemyIdx ? { ...e, traits: (e.traits ?? []).filter((t) => t !== 'veiled_strike') } : e
      ));
      return { currentScene: { ...s.currentScene, enemies } };
    });
    get().appendLog('combat', `${enemy.name} strikes OUT OF THE VEIL — the blow comes from nowhere you were watching (+5).`);
    return 5;
  })();
  const atkBonus = baseAtk + ambushBonus + veiledBonus;
  // HANDOFF #14 — true advantage/disadvantage for defensive status
  // effects. When the player has cover/dodge/block active, the enemy's
  // attack rolls 2d20 and takes the LOWER (disadvantage on attacker).
  // When the player has 'surprised' active, the enemy rolls 2d20 and
  // takes the HIGHER (advantage on attacker). One-die path stays for
  // the neutral case so the log reads cleanly.
  const fx = player.statusEffects ?? [];
  // 'dodging' deliberately NOT in this list as of 2026-05-21 — the
  // dodge rework moved its effect from a passive 2d20-keep-lower defender
  // advantage into an active post-hit parry roll (see below). ('blocking'
  // was retired entirely in OTA-365.) Cover statuses still apply normally.
  const defenderAdvantage = fx.some((e) => ['in_cover', 'in_cover_full'].includes(e.kind) && e.remainingRounds > 0);
  const attackerAdvantage = fx.some((e) => e.kind === 'surprised' && e.remainingRounds > 0);
  let atkRoll = rollDie(20);
  let shadowRoll: number | null = null;
  let advLabel = '';
  if (defenderAdvantage && !attackerAdvantage) {
    shadowRoll = rollDie(20);
    const used = Math.min(atkRoll, shadowRoll);
    advLabel = ` [adv defense: ${atkRoll}/${shadowRoll} → ${used}]`;
    atkRoll = used;
  } else if (attackerAdvantage && !defenderAdvantage) {
    shadowRoll = rollDie(20);
    const used = Math.max(atkRoll, shadowRoll);
    advLabel = ` [surprise: ${atkRoll}/${shadowRoll} → ${used}]`;
    atkRoll = used;
  }
  const atkTotal = atkRoll + atkBonus;
  // Effective AC = race base + summed armor bonus from head/chest/legs/feet
  // + race-conditional bonus (OTA 038 — Mud Dweller +1 underground,
  // Tartarian Giant -4 confined, Aetherborn +1 with aether gear, etc.)
  // + status modifier (e.g. -2 from armor_severed, +4 partial cover,
  // +8 full cover, +4 dodging/blocking). Status floor at 1 so a player
  // isn't completely impossible to defend.
  const armorPieces = aggregateArmor(player);
  const racialAC = effectiveAC(player, get().currentScene);
  // arb-fix — ruinsDefenseBonus title (Protector / Warden): +AC while in a
  // ruin / constructed environment. Reuses the race AC context detector.
  let titleRuinsAc = 0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tPerksAc = require('../engine/titles').titlePerkModifiers(player);
  if (tPerksAc.ruinsDefenseBonus > 0) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { detectACContexts } = require('../engine/raceMechanics');
    if (detectACContexts(player, get().currentScene).has('constructed_environment')) {
      titleRuinsAc = tPerksAc.ruinsDefenseBonus;
    }
  }
  // racialAC already includes player.ac; add the gear stack on top.
  // OTA-924 — LIGHT AC TAIL-TRIM (see equipment.trimStandingAc). Trim the standing gear AC
  // so a fully-fused build is strong but not untouchable; tactical status/cover mods (dodge,
  // cover, ward) apply on top of the trimmed base at full value.
  const acFromGear = trimStandingAc(racialAC + armorPieces.acBonus + titleRuinsAc);
  // ⚠⚠ OTA-1645 — THE SHIELD'S CONDITIONAL HALF, SPENT WHERE IT CAN BE. Two
  // shields scope their cover to a damage type — the Mud Heater Shield's "+2 AC
  // vs fire damage" and the Aetheric Shield's "+2 AC vs energy damage" — and the
  // gear stack cannot hold either, because `equippedGearAc` has no enemy in
  // view. This is the first line in the game that does, so it is spent here.
  //
  // ⚠ It lands OUTSIDE `trimStandingAc`, deliberately, and the reason is the
  // same one status and cover mods are outside it: the trim exists to stop a
  // fully-fused STANDING build becoming untouchable, and a bonus that applies to
  // one damage type in a fight the player did not choose is not standing AC. A
  // fire-turning shield should be worth its full 2 in the one fight it was
  // bought for.
  const held = heldShieldAc(player);
  const shieldVs = shieldAcVersus(
    held.vs ? { vs: held.vs } : null,
    resolveEnemyDamageType(enemy),
  );
  const effectiveAc = Math.max(1, acFromGear + shieldVs + statusAcAdjustment(player.statusEffects));
  // ⚠ OTA-1124 — THE AC LEDGER. Two device logs in a row show the owner's AC
  // dropping from 16 to 10 with no line saying why — the second time with a
  // ~2m40s inventory gap in the middle, which is enough room for anything. The
  // suspect is the group unequip bar (OTA-1114), but a suspect is not a cause,
  // and "AC 16" → "AC 10" four minutes apart is not evidence of anything.
  //
  // Rather than guess a third time, MEASURE. This is the one place the number
  // the player actually sees is computed, so a shift of 2 or more prints its
  // whole derivation: which component moved, and what is worn now. The next
  // log answers the question outright instead of narrowing it.
  //
  // Threshold 2 because ±1 is ordinary (a status ticking on or off), and this
  // must not become noise in a combat log the owner reads by eye. Debug channel
  // only; no behaviour change, and deliberately no attempt to FIX anything —
  // OTA-1109 is the precedent: instrument first, and let the log name the
  // culprit before writing a line of remedy.
  {
    const prev = _lastEffectiveAc;
    _lastEffectiveAc = effectiveAc;
    if (prev !== null && Math.abs(effectiveAc - prev) >= 2) {
      const worn = describeWornForAcLedger(player);
      get().appendLog('debug',
        `ac-shift ${prev}→${effectiveAc}: race/base ${racialAC} + gear ${armorPieces.acBonus}`
        + ` + title ${titleRuinsAc} → trimmed ${acFromGear}`
        + ` + status ${statusAcAdjustment(player.statusEffects)} | worn: ${worn}`);
    }
  }
  // Natural 1 / natural 20 rule — same floor and ceiling that applies
  // to the player. A nat-1 forces a miss regardless of bonuses; a nat-20
  // forces a hit AND doubles the damage roll below.
  const enemyCrit = atkRoll === 20;
  const enemyFumble = atkRoll === 1;
  // OTA-795 — DODGE is an AC-BYPASS GAMBLE (player design call; replaces the
  // old landed-hit-only parry + instant no-roll riposte, incl. the OTA-260
  // boxing exception and the 2-durability stance cost). While the stance is
  // up, this swing resolves as an OPPOSED CONTEST — d20 + DEX vs the enemy's
  // attack total — instead of vs your AC:
  //   • WIN  → you take nothing (even a swing that beats your AC) and gain a
  //     PERFECT OPENING: your next attack deals double damage dice; the
  //     window is consumed by that swing, hit or miss (see combatRules).
  //   • LOSE → you dodged INTO it: the blow lands regardless of AC and deals
  //     2× rolled damage (out of position).
  // The stance is spent either way. An enemy FUMBLE is a free win (it
  // overcommits past you); nat-20 auto-wins / nat-1 auto-loses the contest.
  const dodgingActive = (player.statusEffects ?? []).some((e) => e.kind === 'dodging');
  let dodgeWin: boolean | null = null;
  let dodgeLine: string | null = null;
  if (dodgingActive) {
    const dexStats = effectiveStats(player);
    if (enemyCrit) {
      // OTA-815 — a NATURAL 20 is a perfect strike: it lands through a dodge, the
      // same 5% floor the AC path already honors (a nat-20 is always an auto-hit
      // there). Without this a high-DEX dodger wins the opposed contest even vs a
      // 20 and becomes literally untouchable — the invulnerability the design
      // forbids ("never invulnerable, a high miss rate is fine"). It resolves as a
      // dodge LOSS: 2× out-of-position damage, with the crit dice-doubling still
      // suppressed (dodgeWin != null below) so a pierced dodge is 2×, not 4×
      // (preserves the OTA-796 balance). So no matter how much DEX/AC you stack,
      // an enemy still lands ~1 swing in 20.
      dodgeWin = false;
      dodgeLine = `Dodge — ${enemy.name} rolls a NAT 20. No read beats a perfect strike; it lands through your dodge.`;
    } else if (enemyFumble) {
      dodgeWin = true;
      dodgeLine = `Dodge — ${enemy.name} overcommits past you. ✓ Free opening (next strike ×2 dice).`;
    } else {
      const dRoll = rollDie(20);
      const dTotal = dRoll + dexStats.dexterity;
      dodgeWin = dRoll === 20 ? true : dRoll === 1 ? false : dTotal >= atkTotal;
      dodgeLine = dodgeWin
        ? `Dodge — d20 → ${dRoll} + DEX ${dexStats.dexterity} = ${dTotal} vs ATK ${atkTotal}. ✓ You slip the arc — PERFECT OPENING (next strike ×2 dice).`
        : `Dodge — d20 → ${dRoll} + DEX ${dexStats.dexterity} = ${dTotal} vs ATK ${atkTotal}. ✗ You misread it — no opening, and the blow lands as it normally would (armor still counts).`;
    }
    // The stance is spent by this swing, win or lose.
    set((s) => (s.player ? {
      player: {
        ...s.player,
        statusEffects: (s.player.statusEffects ?? []).filter((e) => e.kind !== 'dodging'),
      },
    } : s));
  }
  // OTA-913 — a WON dodge negates the hit; a LOST dodge is now just a NORMAL to-hit
  // (armor counts again, no auto-land) instead of the old AC-bypass. Only the perfect
  // OPENING is at stake on the read, not double damage.
  // OTA-924 — NOTHING IS UNTOUCHABLE. Cap the natural d20 an enemy needs to land, so an
  // arbitrarily high AC can never buy literal immunity. Below the cap this is the identical
  // AC math (atkTotal >= effectiveAc); it only bites a maxed-out defensive build, floating
  // its hit chance up to ~P(d20 >= ENEMY_HIT_NEEDED_CAP). AC still matters — it pushes the
  // needed roll UP toward the cap (fewer hits), it just can't push it past. Adjustable knob.
  // ⚠ OTA-1141 (owner tuning) — 13 → 16. The pressure-test sim showed every
  // point of armor past raw 18 bought NOTHING against an ordinary ATK-5 enemy:
  // the cap floored their hit chance at ~40% long before the knee-22 trim ever
  // engaged, so a Legendary set landed the "I upgraded and nothing changed"
  // feeling. At 16 the floor is ~25% — a maxed tank still gets hit one swing
  // in four (never unhittable, fights still end), but armor keeps paying until
  // raw ~21, and the excess past the cap now converts to plate (below).
  const ENEMY_HIT_NEEDED_CAP = 16; // d20>=16 -> ~25% floor hit chance vs any AC
  const acHitNat = Math.max(2, Math.min(ENEMY_HIT_NEEDED_CAP, effectiveAc - (atkTotal - atkRoll)));
  // ⚠ OTA-1140 (pressure test) — SAY SO WHEN THE CAP DECIDED. At high AC the
  // resolver needs only a natural ENEMY_HIT_NEEDED_CAP, so the log's
  // "= 17 vs your AC 25 — ✓ HIT" read as a contradiction with no explanation:
  // every tank build saw hits its own log said should have missed.
  const acCapEngaged = effectiveAc - (atkTotal - atkRoll) > ENEMY_HIT_NEEDED_CAP;
  const wouldHit = dodgeWin === true
    ? false
    : enemyFumble ? false : enemyCrit ? true : atkRoll >= acHitNat;
  // ⚠ OTA-1195 — TEMPORAL SLIP (PUNCHLIST P16). A held slip eats one blow that would
  // otherwise have landed, then is spent. It sits HERE, at the to-hit verdict, rather than
  // in the damage stack, because the technique's claim is that the blow did not arrive —
  // not that it arrived softened. Nothing downstream (armor, resists, wards) runs.
  //
  // ⚠⚠ IT DOES NOT STOP A NATURAL 20, and that exclusion is the whole reason this is safe.
  // OTA-815 established the rule when the dodge rework threatened the same thing: no
  // defensive stack may buy literal immunity, so an enemy always lands ~1 swing in 20. A
  // slip that beat a crit, re-channelled every three rounds, would be exactly the
  // untouchable build that rule forbids — and it would cost only fuel and corruption.
  const slipHeld = (player.statusEffects ?? []).some((e) => e.kind === 'temporal_slip');
  const slipped = wouldHit && !enemyCrit && slipHeld;
  const hit = wouldHit && !slipped;
  if (slipped) {
    set((s) => (s.player ? {
      player: {
        ...s.player,
        statusEffects: (s.player.statusEffects ?? []).filter((e) => e.kind !== 'temporal_slip'),
      },
    } : s));
  }
  const outcomeTag = slipped
    ? '✗ SLIPPED'
    : dodgeWin === true
    ? '✗ EVADED'
    : enemyCrit
      ? '✓ CRITICAL HIT'
      : enemyFumble
        ? '✗ FUMBLE'
        : hit ? '✓ HIT' : '✗ MISS';

  // OTA 221 — tag enemy whiffs so AdventureFeed can color the
  // outcome marker (MISS / FUMBLE) green at the end of the line.
  // Playtester wanted at-a-glance confirmation that an enemy attack
  // didn't land without scanning the whole red roll line.
  get().appendLog(
    'combat',
    `${enemy.name} — d20 → ${atkRoll}${advLabel} + ATK ${atkBonus} = ${atkTotal} vs your AC ${effectiveAc}${acCapEngaged ? ` (needs nat ${acHitNat}+ — AC capped)` : ''} — ${outcomeTag}`,
    hit ? undefined : { combatOutcome: 'enemy_miss' },
  );
  if (slipped) {
    // OTA-1195 — say it in the world, not only in the roll line. A blow that connects on
    // the maths and then does not arrive reads as a bug unless something names the reason.
    get().appendLog(
      'world',
      `The blow arrives and you are already a half-second past it. The Temporal Slip closes behind you, spent.`,
      { combatOutcome: 'enemy_miss' },
    );
  }
  if (dodgeLine) {
    get().appendLog('combat', dodgeLine, dodgeWin ? { combatOutcome: 'enemy_miss' } : undefined);
  }
  // OTA-908 — dodge-outcome CLARITY (playtest: "it looked like I lost a few and
  // took damage, there should be something saying dodge failed"). The mechanics
  // are right; the feedback was buried in the [combat] roll line.
  //   (a) A MISREAD dodge now gets a visceral world beat — you stumbled into it —
  //       instead of only the terse roll line. (Skips the nat-20 pierce, which
  //       already has its own "perfect strike lands through" line.)
  //   (b) A SUCCESSFUL dodge only reads ONE attacker; in a crowd the others still
  //       swing, so "I dodged but took damage" read like a failure. Name it.
  if (dodgeWin === false && !enemyCrit) {
    // OTA-913 — a misread no longer pitches you INTO the blow for 2×; the read just fails
    // and the swing resolves normally (it can still miss on its own).
    get().appendLog('world', hit
      ? 'Your read is a beat off — you fail to make the opening, and the swing lands the way it always meant to.'
      : 'Your read is a beat off — no opening this time — but the swing goes wide on its own.');
  } else if (dodgeWin === true) {
    const sc = get().currentScene;
    const otherLive = (sc?.enemies ?? []).filter(
      (e, i) => e !== enemy && (sc?.enemyHps?.[i] ?? e.hp) > 0,
    ).length;
    if (otherLive >= 1) {
      // OTA-913 — a good read no longer leaves you flat-footed to the pack: while you're
      // still moving off the dodge, the OTHER attackers this volley swing at +3 to your AC
      // (evasive, one volley). Fixes "I dodged but got mobbed at full anyway."
      set((s) => (s.player ? {
        player: {
          ...s.player,
          statusEffects: applyEffect(s.player.statusEffects ?? [], {
            kind: 'evasive' as const,
            remainingRounds: 1,
            label: 'evasive — harder to hit',
          }),
        },
      } : s));
      get().appendLog('world', `You slip ${enemy.name}'s arc clean and stay light on your feet — the rest of the pack still swings, but you're a harder mark for the moment.`);
    }
  }
  if (dodgeWin === true) {
    // The read paid off — train DEX (and STEALTH when stealth gear is worn;
    // both carried over from the old parry's training rules). OTA-796 — capped
    // at 3 trains per scene visit (exploit sweep: unbounded dodge-farming).
    const dodgeTrains = get().currentScene?.dodgeTrainsUsed ?? 0;
    const mayTrain = dodgeTrains < 3;
    if (mayTrain) {
      set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, dodgeTrainsUsed: dodgeTrains + 1 } } : s));
    }
    const liveParrier = mayTrain ? get().player : null;
    if (liveParrier) {
      const tr = trainStat(liveParrier, 'dexterity', true);
      set((s) => (s.player ? { player: tr.player } : s));
      if (tr.leveled) {
        get().appendLog('reward', `✦ Reflex like water. +1 DEX (${statNowClause(get().player, 'dexterity', tr.leveled.to)}).`);
      }
    }
    const liveSte = mayTrain ? get().player : null;
    if (liveSte && (aggregateEquippedStatBonuses(liveSte).stealth ?? 0) > 0) {
      const trS = trainStat(liveSte, 'stealth', true);
      set((s) => (s.player ? { player: trS.player } : s));
      if (trS.leveled) {
        get().appendLog('reward', `✦ The shadows move with you. +1 STE (${statNowClause(get().player, 'stealth', trS.leveled.to)}).`);
      }
    }
    // Grant the opening. remainingRounds 2 so the round tick at the end of
    // THIS action can't expire it before the player's next swing; the swing
    // itself consumes it (rollMods), so 2 is a ceiling, not a duration.
    set((s) => (s.player ? {
      player: {
        ...s.player,
        statusEffects: applyEffect(s.player.statusEffects ?? [], {
          kind: 'perfect_opening' as const,
          remainingRounds: 2,
          label: 'perfect opening',
        }),
      },
    } : s));
  }

  if (hit) {
    let rawDmg = rollFromNotation(String(enemy.damage)) || rollDie(6);
    // ⚠⚠ OTA-1508 — A BLOW FROM THE WEAK EDGE OF ITS REACH ARRIVES HALVED.
    // The owner's yellow dot made a promise ("they can reach me but it'd be
    // weak damage"); this is the promise kept. Judged at THIS enemy's own
    // band; callers that pass no index keep the full-damage shipped behavior.
    const edgeScene = get().currentScene;
    const edgeBand = edgeScene && enemyIdx !== undefined ? enemyBandOf(edgeScene, enemyIdx) : null;
    const edgeWeak = edgeBand !== null && enemyReach(enemy).weakBands.includes(edgeBand);
    // Critical: roll damage twice and sum, mirroring the player's
    // double-dice crit treatment so the bite hurts. OTA-796 — skipped when a
    // dodge contest resolved this swing: the contest replaced the to-hit roll,
    // and stacking the crit reroll under the failed-dodge ×2 made dodging vs a
    // nat-20 FOUR times as deadly as standing still (exploit-sweep finding).
    // OTA-913 — a nat-20 that pierces a dodge is a NORMAL crit now (2× dice), the same as
    // a nat-20 vs a standing player. (The failed-dodge flat 2× this guard balanced against
    // is retired, so crit-doubling no longer needs suppressing on a pierced dodge.)
    if (enemyCrit && dodgeWin !== true) {
      rawDmg += rollFromNotation(String(enemy.damage)) || rollDie(6);
    }
    // Boss-tier bonus damage — +1d6 on every connecting swing on top
    // of the enemy's declared damage notation. Stacks with crits.
    if (enemy.boss) {
      rawDmg += rollDie(6);
    }
    // ⚠ OTA-1508 — applied AFTER crit/boss dice so the halving covers the
    // whole blow, not just the base notation.
    if (edgeWeak) rawDmg = Math.max(1, Math.ceil(rawDmg / 2));
    // arb119 — concrete damage type for EVERY enemy (explicit word in the
    // damage string, else inferred from the attack/name verb, else physical).
    // Drives the resistance check + the player-facing display so the OTA-529
    // armor ladder engages against the ~half of the bestiary that authored bare
    // dice. Status-effect rolls below stay gated to EXPLICITLY-typed enemies
    // (`explicitDamageType`) so inferring a type doesn't silently add bleed /
    // armor-sever procs to creatures that never had them.
    const enemyDamageType = resolveEnemyDamageType(enemy);
    const explicitDamageType = parseDamageTypeKeyword(String(enemy.damage));

    // Burn scars (aetheric vulnerability) amplify incoming aetheric damage.
    if (enemyDamageType === 'aetheric') {
      const mul = aethericVulnerabilityMultiplier(player.statusEffects);
      if (mul > 1) rawDmg = Math.ceil(rawDmg * mul);
    }

    const resisted = applyArmorResistance(rawDmg, enemyDamageType, armorPieces.resistSlots);
    let dmg = resisted.damage;
    // arb-fix — title perks now bite in COMBAT, not just against Etheric
    // weather. Aetheric Attuned / Stormcaller passively halve incoming
    // AETHERIC damage (the "Aetheric resistance / shield" the titles promise);
    // Etherbound Survivor shaves a flat chunk off ANY environmental/elemental
    // hit (its "survive the hazard" perk). Both are passive — no activation.
    let titleAethericHalved = false;
    let titleHazardShaved = 0;
    if (dmg > 0) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tPerksHit = require('../engine/titles').titlePerkModifiers(player);
      if (enemyDamageType === 'aetheric' && (tPerksHit.ethericDamageResist || tPerksHit.ethericShield)) {
        dmg = Math.max(1, Math.ceil(dmg / 2));
        titleAethericHalved = true;
      }
      // OTA-835 — Stormcaller (ethericShield) is now STORM-HARDENED: it also halves
      // incoming ELECTRICAL, giving the title a defensive niche distinct from Aetheric
      // Attuned (ethericDamageResist, aetheric-only). One storm-warded body, two lines.
      if (enemyDamageType === 'electrical' && tPerksHit.ethericShield) {
        dmg = Math.max(1, Math.ceil(dmg / 2));
        titleAethericHalved = true;
      }
      // Etherbound Survivor — environmental/elemental damage types (burn /
      // cold / electrical / poison / aetheric) get the save-bonus shaved off.
      if (tPerksHit.envHazardSaveBonus > 0
          && !!enemyDamageType
          && /aetheric|burn|cold|electrical|poison|radiation/.test(enemyDamageType)) {
        const shave = Math.min(dmg - 1, tPerksHit.envHazardSaveBonus);
        if (shave > 0) { dmg = Math.max(1, dmg - shave); titleHazardShaved = shave; }
      }
    }
    // arb-fix — passive RACE damage resistances (Mud Dweller / Sentinel ½ of
    // their type; Mud Golem 25% off non-aetheric). Was flavor-only text.
    let raceResistTag = '';
    if (dmg > 0) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { raceDamageMultiplier, raceResistLabel } = require('../engine/raceMechanics');
      const raceMult = raceDamageMultiplier(player.raceId, enemyDamageType);
      // OTA-835 — apply BOTH directions (was `< 1` = resist-only). A race authored as
      // VULNERABLE (mult > 1, e.g. Mud Golem vs aetheric) now takes extra damage.
      if (raceMult !== 1) {
        const before = dmg;
        dmg = Math.max(1, Math.round(dmg * raceMult));
        if (dmg !== before) raceResistTag = raceResistLabel(player.raceId, raceMult);
      }
    }
    // arb-fix — Sentinel "Defensive Protocols" ability: an active shield halves
    // ALL incoming damage while it lasts.
    let shieldTag = '';
    if (dmg > 1 && (player.statusEffects ?? []).some((e) => e.kind === 'shielded')) {
      dmg = Math.max(1, Math.ceil(dmg / 2));
      shieldTag = ' (Defensive Protocols shield)';
    }
    // OTA-924 — GLOBAL MITIGATION FLOOR. The resist/halving layers (armor <=80%, title 1/2,
    // race 1/2, shield 1/2) multiply with only a per-step floor of 1, so a focused build
    // stacked them to ~1 damage and switched the defensive half of combat off. Clamp the
    // post-stack number so a LANDED hit always delivers at least MITIGATION_FLOOR of its raw
    // roll: resists still soak MOST of a matched hit, but a MISMATCHED one visibly leaks
    // damage. The stone ward below is a spent absorb pool (not a passive resist), so it still
    // runs after this and may legitimately zero a hit. Adjustable knob.
    // ⚠ OTA-1141 (owner tuning) — PLATE: the armor the cap wasted now soaks.
    // Past ENEMY_HIT_NEEDED_CAP, extra AC used to buy literally nothing. Now
    // every 2 points of capped-off AC shave 1 damage from a landed hit (max
    // −4), so heavy armor stops making you unhittable and starts making hits
    // weaker — which is what plate is FOR. Runs before the mitigation floor,
    // so the 30%-of-raw minimum still holds: a maxed tank is hurt less, never
    // immune.
    const plateDr = acCapEngaged
      ? Math.min(4, Math.floor(((effectiveAc - (atkTotal - atkRoll)) - ENEMY_HIT_NEEDED_CAP) / 2))
      : 0;
    if (plateDr > 0 && dmg > 1) dmg = Math.max(1, dmg - plateDr);
    const MITIGATION_FLOOR = 0.30;
    // ⚠ OTA-1140 (pressure test) — when the floor overrides the stack, SAY SO.
    // The bracket clause printed the layer percentages ("[armor −72%, title ½]")
    // computed pre-clamp, so a player auditing their resist stack against the
    // printed numbers could never reconcile them with the damage taken.
    let mitFloorEngaged = false;
    if (dmg > 0) {
      const mitFloor = Math.round(rawDmg * MITIGATION_FLOOR);
      if (mitFloor > dmg) { dmg = mitFloor; mitFloorEngaged = true; }
    }
    // engine_Dev (Combat-Parity II) — enemy TYPED on-hit proc on the player. Only EXPLICITLY-typed
    // enemies proc at full chance; an inferred (bare-dice) type procs at 0.4× — so the ~95 enemies
    // that authored no type word don't silently tax the player. Folds a small bonus into this hit
    // (parryable below); no player stat-debuff/DOT (kept conservative per the balancing pass). The
    // bonus is 1d3 vs the player's own 1d4 offense — a deliberate player-favoring asymmetry: the
    // balance probe showed symmetric 1d4 both ways converted stalls into deaths at the Uncommon tier
    // (the tier a real early-game player fights), because a weak character's procs roll off a low base
    // while enemy procs land reliably. 1d3 keeps typed combat decisive without over-taxing the player.
    {
      const ep = BUILTIN_DT_COMBAT[canonDT(enemyDamageType)];
      if (ep) {
        const epMatch: 'weak' | 'resist' | 'normal' = (resisted.blocked || raceResistTag) ? 'resist' : 'normal';
        if (Math.random() < dtProcChance(ep, epMatch) * (explicitDamageType ? 1 : 0.4)) {
          dmg += rollDie(3);
        }
      }
    }

    // OTA-913 — the failed-dodge flat 2× (out-of-position) is retired: a misread dodge is
    // now just a normal hit resolved against AC above. Only the perfect OPENING is at stake
    // on the read — so a low-DEX dodger is no longer punished DOUBLE for a bad gamble.

    // OTA-835 — Elemental Control WARD (Mud Golem defensive half): a shaped-stone
    // ward soaks a flat pool of damage before it reaches HP. Runs LAST, on the
    // final incoming number (after every resist/shield and the dodge double), so
    // it soaks what you'd actually take. Records the remaining pool so the set()
    // below can decrement the ward and drop it when spent.
    let wardTag = '';
    let wardRemain: number | null = null;
    {
      const wardFx = (player.statusEffects ?? []).find((e) => e.kind === 'stone_ward' && (e.absorb ?? 0) > 0);
      if (wardFx && dmg > 0) {
        const soak = Math.min(wardFx.absorb ?? 0, dmg);
        dmg -= soak;
        wardRemain = (wardFx.absorb ?? 0) - soak;
        wardTag = ` (stone ward soaks ${soak})`;
      }
    }

    // Roll for a status effect to apply based on the damage type.
    const newEffect = rollIncomingStatusEffect(explicitDamageType, player.statusEffects ?? []);
    // Per-enemy trait effects on a successful hit (bleeder / corrupting /
    // concussive). Independent of the damage-type roll so a trait can
    // stack with a type-based status.
    const traitHit = traitOnHitStatus(enemy.traits);
    // OTA-1089 — ANTI-STUN-LOCK. While `braced` runs (granted below when an
    // incapacitation takes hold), further stun/paralyze procs cannot land.
    // Non-incapacitating statuses (bleed, poison, chill…) pass through.
    const isIncapKind = (k: string) => k === 'stun' || k === 'paralyzed';
    const bracedNow = (player.statusEffects ?? []).some((e) => e.kind === 'braced');
    const landedEffect = newEffect && !(bracedNow && isIncapKind(newEffect.effect.kind)) ? newEffect : null;
    const landedTraitHit = traitHit && !(bracedNow && isIncapKind(traitHit.kind)) ? traitHit : null;
    const incapSuppressed = (newEffect !== null && landedEffect === null)
      || (traitHit !== null && landedTraitHit === null);

    // ⚠⚠⚠ OTA-1513 — THE ENEMY'S COATING, AND WHERE IT LANDED. Owner: *"my
    // stacked AC makes me a little overpowered mid game… enemies should have
    // weapon coatings as well… we need to take damage from it like they do, it
    // will have to factor in resists from my armor, so it will have to roll on
    // each attack what piece of armor their attack lands on. that way we can
    // see if my coatings have any effect."*
    //
    // ⚠⚠ THIS RIDES **AFTER** THE TO-HIT ROLL, WHICH IS THE WHOLE DESIGN. AC is
    // a miss-chance stat, so every point he stacks deletes enemy attacks before
    // anything downstream runs — a coating can only reach him on the blows that
    // already landed, so it restores a floor of pressure without touching the
    // number he spent the mid-game earning.
    //
    // ⚠ ONE PIECE ANSWERS IT, not the aggregate. The arb119 weighted resist
    // stack still governs ORDINARY damage above; for a coating the question is
    // "which piece caught it", so a single weighted location roll picks the
    // slot and THAT piece's resist decides. That is what makes a poison-proof
    // pair of tassets visibly worth its slot instead of vanishing into a total.
    // A roll onto a bare slot is a real outcome and says so — full coverage is
    // supposed to be worth something.
    //
    // ⚠ The OTA-959 wear roll below is deliberately left alone: it is a
    // separate, tuned distribution (uniform over WORN slots so wear always
    // lands), and folding the two would silently re-weight armour durability.
    // ⚠⚠⚠ OTA-1646 — WHERE THE BLOW LANDS IS ASKED ONCE, AND THE SHIELD ANSWERS
    // FIRST. Owner: "we need all incoming hits to hit the shield first, that is
    // its intended use." One roll now serves BOTH consumers below — the coating
    // splash and the durability wear — because they are the same question, and
    // asking twice let a blow splash the chest while chipping the boots.
    const heldShield = heldShieldAc(player);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ecLanding = require('../engine/enemyCoating') as typeof import('../engine/enemyCoating');
    const landing = ecLanding.rollBlowLanding(
      { hasShield: !!heldShield.name, traits: enemy.traits },
      Math.random,
    );
    let coatingClause = '';
    let coatingAilment: string | null = null;
    let coatingCorruption = 0;
    if (enemy.coating) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ec = require('../engine/enemyCoating') as typeof import('../engine/enemyCoating');
      const struck = landing.slot;
      const wornName = struck ? player.equipped?.[struck] : undefined;
      const raw = Math.max(1, rollFromNotation(enemy.coating.dice) || 1);
      // The struck piece's OWN resists — read from the same resistSlots the
      // aggregate is built from, filtered to the one slot that took the blow.
      const pieceResists = struck
        ? armorPieces.resistSlots
          .filter((r) => r.slot === struck)
          .map((r) => String(r.type).toLowerCase())
        : [];
      const resistedHere = pieceResists.includes(String(enemy.coating.kind).toLowerCase());
      let coatDmg = 0;
      if (landing.on === 'shield') {
        // ⚠⚠ OTA-1646 — THE SHIELD KEEPS IT OFF YOUR SKIN. A coating that lands
        // on a slab of mud-iron is halved: it is on the shield, not in you.
        // And a shield whose card names that very damage type turns it away
        // outright — the Mud Heater Shield ("+2 AC vs fire") really does answer
        // a burning blade, which is the first time either typed shield has been
        // worth its clause against a coating.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const wev = require('../engine/weaponEffects') as typeof import('../engine/weaponEffects');
        const turned = wev.shieldAcVersus(
          heldShield.vs ? { vs: heldShield.vs } : null,
          String(enemy.coating.kind),
        ) > 0;
        coatDmg = turned ? 0 : Math.max(1, Math.ceil(raw / 2));
        dmg += coatDmg;
        coatingClause = turned
          ? ` [${heldShield.name} turns the ${enemy.coating.kind} aside]`
          : ` +${coatDmg} ${enemy.coating.kind} [${heldShield.name} took it, halved]`;
      } else {
      coatDmg = resistedHere ? Math.max(1, Math.ceil(raw / 2)) : raw;
      dmg += coatDmg;
      coatingClause = wornName
        ? ` +${coatDmg} ${enemy.coating.kind} [${wornName} took it${resistedHere ? `, ${enemy.coating.kind}-resistant, halved` : ''}${landing.wentAround ? ', around the shield' : ''}]`
        : ` +${coatDmg} ${enemy.coating.kind} [caught you where you wear nothing${landing.wentAround ? ', around the shield' : ''}]`;
      }
      coatingAilment = ec.ailmentForCoating(enemy.coating.kind);
      // ⚠⚠ A corruption-coated blade raises the METER, so the corruption vial
      // he drinks subtracts from the same number. Symmetry is the whole point
      // of the three-uses loop: the right answer has to answer.
      coatingCorruption = ec.corruptionFromCoating(enemy.coating.kind, coatDmg);
    }
    // OTA-959 — armor wear: a landed blow chips ONE worn piece, not the whole
    // set. The old loop wore EVERY slot per hit, so a 5-piece set spent 5
    // durability per blow and a 5-raider pack ate a freshly crafted set inside
    // one fight (owner's log: cap, gloves, trousers, wraps, brow guard all
    // shattered in ~10 minutes, AC 24 -> 17). One blow lands somewhere; that
    // piece takes the wear — so MORE armor now means the set lasts LONGER,
    // instead of dying faster the better-equipped you are.
    // ⚠⚠⚠ OTA-1646 — AND THE SHIELD TAKES THE WEAR IT JUST TOOK THE BLOW FOR.
    // This is the half that makes "the shield goes first" mean something to a
    // player rather than only to the log: while a shield is up, your ARMOUR
    // stops chipping. The shield spends itself instead, which is what a shield
    // is for, and it is why the 15 shield rows are authored with real
    // baseDurability in this same OTA — at the default 25 a shield eating every
    // blow would shatter six times faster than the set it is protecting, which
    // is precisely the OTA-959 failure ("a 5-piece set spent 5 durability per
    // blow") re-made on one item.
    //
    // ⚠⚠ THE LADDER, DERIVED RATHER THAN GUESSED — owner: "maybe 150 durability?
    // use mathematical reasoning. make it a useful piece of equipment but can
    // still be broken." Measured off his own 2026-09-02/03 bundles: 1402 blows
    // landed on the player across 92 fight segments — median 11 a fight, mean
    // 15.2. Before this OTA wear spread uniformly over ~6 worn slots, so a
    // 25-durability piece survived 25 x 6 = 150 BLOWS OF EXPOSURE. That is the
    // parity point, and it is his number: a Common shield at 150 is exactly as
    // durable in practice as a piece of his armour used to be. Bypass returns
    // ~11% of blows to the body across his enemy mix, so D durability absorbs
    // D / 0.89 blows: Common 150 -> ~169 blows (~15 fights), Uncommon 200 ->
    // ~225 (~20), Rare 265 -> ~298 (~27), Legendary 350 -> ~393 (~36). Useful,
    // repairable, and still breakable — a Legendary is an heirloom you maintain,
    // not an infinite one.
    //
    // ⚠ AND THE SHIELD DOES NOT TOUCH BASE DAMAGE — owner: "base damage always
    // hit." It never enters this arithmetic: `dmg` is already resolved above by
    // AC, resists and the type table. What the shield changes is WHERE the blow
    // lands, which is the coating splash and the wear. Stopping the hit outright
    // is what AC (OTA-1645) and the BLOCK action (OTA-1510) are for.
    //
    // ⚠ `landing` is the SAME roll the coating splash read. One blow lands in
    // one place; asking twice let a blade splash the chest and chip the boots.
    const wornSlots = ARMOR_SLOTS.filter((s) => !!player.equipped?.[s]);
    const shieldTookIt = landing.on === 'shield' ? heldShield.name : null;
    const wornSlotHit = shieldTookIt
      ? null
      : wornSlots.length > 0
        ? wornSlots[Math.floor(Math.random() * wornSlots.length)]!
        : null;

    let killed = false;
    set((s) => {
      if (!s.player) return {};
      let nextPlayer = s.player;
      if (shieldTookIt) {
        // The shield is held, not worn, so it is named directly rather than
        // resolved through an armour slot — `wearEquippedItem` matches the
        // bound instance across every slot including the hands.
        nextPlayer = wearEquippedItem(nextPlayer, shieldTookIt, get);
      } else if (wornSlotHit) {
        const name = nextPlayer.equipped?.[wornSlotHit];
        if (name) nextPlayer = wearEquippedItem(nextPlayer, name, get);
      }
      const newHp = Math.max(0, nextPlayer.hp - dmg);
      killed = newHp <= 0;
      // OTA-842 [combat-log restructure] — the incoming hit's modifiers used to be
      // appended as run-on parentheticals ("…damage (armor turns 40% of the cold)(your
      // title turns aside half the cold)(Aetherstone Vulnerability — +50% dmg)(stone
      // ward soaks 3)"). When two or more fired it read as a wall of parens. Collect
      // them into ONE terse, comma-separated clause instead: "…damage [armor −40%,
      // title ½, ward soaks 3]." Order = armor → title → race → shield → ward, the
      // order they applied. (A race VULNERABILITY reads "+N%" here — the bracket lists
      // every modifier, not only reductions.)
      const modClause = damageModClause({
        armorFraction: resisted.blocked ? resisted.fraction : 0,
        titleHalved: titleAethericHalved,
        titleShaved: titleHazardShaved,
        raceTag: raceResistTag,
        shield: !!shieldTag,
        wardTag,
        floorEngaged: mitFloorEngaged, // OTA-1140 — the clause admits the clamp
        plate: plateDr,                // OTA-1141 — capped-off AC soaks instead
      });
      const msg = killed
        ? `${enemy.name} deals ${dmg} ${enemyDamageType} damage${modClause}${edgeWeak ? ' [edge of reach — halved]' : ''}${coatingClause}. You fall.`
        : `${enemy.name} deals ${dmg} ${enemyDamageType} damage${modClause}${edgeWeak ? ' [edge of reach — halved]' : ''}${coatingClause}. You have ${newHp} HP remaining.`;
      const prevHpForWarn = nextPlayer.hp;
      const hpMaxForWarn = nextPlayer.hpMax ?? 1;
      void Promise.resolve().then(() => {
        get().appendLog('combat', msg);
        // OTA 228 — low-HP latch fires AFTER the combat line so the
        // narrative reads "X damage. 1 HP." then "Arbiter: eat /
        // first-aid kit." Skip when killed — falling already speaks
        // for itself.
        if (!killed) checkLowHpWarning(prevHpForWarn, newHp, hpMaxForWarn, get, set);
      });
      let effects = landedEffect
        ? applyEffect(nextPlayer.statusEffects ?? [], landedEffect.effect)
        : nextPlayer.statusEffects;
      if (landedTraitHit) {
        effects = applyEffect(effects ?? [], {
          kind: landedTraitHit.kind,
          remainingRounds: landedTraitHit.rounds,
          label: landedTraitHit.label,
        });
      }
      // OTA-1089 — the incapacitation that just took hold opens the braced
      // window: the stunned round plus the recovery rounds it protects.
      // ⚠⚠ OTA-1513 — the coating's mark, seeded through the SAME applyEffect
      // path as every other on-hit status so it stacks, expires and displays
      // by the existing rules. `chilled` is the precedent OTA-831 set from the
      // other side of the vial; this gives the rest of the kinds the same
      // shape. Elemental kinds that leave no scar seed nothing — their damage
      // above was the whole effect.
      if (coatingAilment) {
        effects = applyEffect(effects ?? [], {
          kind: coatingAilment as StatusEffect['kind'],
          remainingRounds: COATING_DOT_TURNS,
          label: `${enemy.coating?.kind ?? 'coating'} (from ${enemy.name})`,
        });
      }
      if ((landedEffect && isIncapKind(landedEffect.effect.kind))
          || (landedTraitHit && isIncapKind(landedTraitHit.kind))) {
        effects = applyEffect(effects ?? [], {
          kind: 'braced', remainingRounds: BRACED_ROUNDS, label: 'braced — will not go down again',
        });
      }
      // OTA-835 — decrement (or drop) the Elemental Control ward now that it has
      // soaked its share of this hit.
      if (wardRemain !== null) {
        effects = (effects ?? [])
          .map((e) => (e.kind === 'stone_ward' ? { ...e, absorb: wardRemain! } : e))
          .filter((e) => e.kind !== 'stone_ward' || (e.absorb ?? 0) > 0);
      }
      return {
        player: {
          ...nextPlayer,
          hp: newHp,
          statusEffects: effects,
          // ⚠ OTA-1513 — corruption from a coated blade, on the same meter the
          // corruption vial clears (coatingRemedy's own branch).
          ...(coatingCorruption > 0
            ? { corruption: (nextPlayer.corruption ?? 0) + coatingCorruption }
            : {}),
        },
      };
    });

    // OTA-962 — the same connecting swing can catch the escort party the player is
    // protecting. Uses the final post-mitigation damage, so a clean parry
    // (dmg 0) shields them too.
    applyEscortDamage(get, set, dmg, enemy.name);

    // OTA-936 — LEGIBILITY CUES (once per encounter, after the damage line). A matched
    // resist that soaked >=40% earns one plain-language callout; an elemental hit that
    // NOTHING in the loadout touched earns one "that's a hole" warning. The bracket
    // clause on every hit stays the terse record — these are the legible sentence.
    if (!killed) {
      const cueKey = `${player.currentLocationId}|${player.mapX},${player.mapY}|${player.hubRoomId ?? ''}`;
      const prevCues = get().combatCues;
      const cues = prevCues && prevCues.key === cueKey
        ? prevCues
        : { key: cueKey, soak: false, leak: false };
      const cue = incomingHitCue({
        rawDmg,
        dmg,
        armorBlocked: resisted.blocked,
        armorFraction: resisted.fraction,
        otherLayerFired: titleAethericHalved || titleHazardShaved > 0 || !!raceResistTag || !!shieldTag || !!wardTag,
        damageType: enemyDamageType,
      });
      if (cue === 'soak' && !cues.soak) {
        set(() => ({ combatCues: { ...cues, soak: true } }));
        void Promise.resolve().then(() => get().appendLog('combat', soakCueLine(enemyDamageType, rawDmg, dmg)));
      } else if (cue === 'leak' && !cues.leak) {
        set(() => ({ combatCues: { ...cues, leak: true } }));
        void Promise.resolve().then(() => get().appendLog('combat', leakCueLine(enemyDamageType)));
      } else if (!prevCues || prevCues.key !== cueKey) {
        set(() => ({ combatCues: cues }));
      }
    }

    if (landedEffect) {
      const verb = landedEffect.isNew ? 'inflicts' : 'refreshes';
      void Promise.resolve().then(() =>
        get().appendLog('combat', `The ${enemyDamageType} ${verb} ${landedEffect.effect.label}.`),
      );
    }

    if (landedTraitHit) {
      void Promise.resolve().then(() =>
        get().appendLog('combat', `${enemy.name}'s strike leaves you ${landedTraitHit.label}.`),
      );
    }

    // OTA-1089 — say when the braced window turned an incapacitation away, so
    // the mechanic is legible instead of a silently missing status line.
    if (incapSuppressed && !killed) {
      void Promise.resolve().then(() =>
        get().appendLog('combat', `${enemy.name}'s blow rings off you — braced; you keep your feet.`),
      );
    }

    if (killed) {
      void Promise.resolve().then(() => handlePlayerDeath(get, set));
    }
  }
  // End-of-round regen for the attacking enemy. Caps at its starting HP
  // so a player can't out-wait a regenerator past its base. OTA-796 — skip on a
  // boss's second swing so it regens once per round, not per swing.
  const regen = secondSwing ? 0 : traitRegen(enemy.traits);
  if (regen > 0) {
    const live = get().currentScene;
    if (live) {
      const idx = live.enemies.findIndex((e) => e === enemy);
      if (idx >= 0) {
        const cur = live.enemyHps[idx] ?? 0;
        if (cur > 0 && cur < enemy.hp) {
          const next = Math.min(enemy.hp, cur + regen);
          set((s) => {
            if (!s.currentScene) return {};
            const hps = [...s.currentScene.enemyHps];
            hps[idx] = next;
            return { currentScene: { ...s.currentScene, enemyHps: hps } };
          });
          void Promise.resolve().then(() =>
            get().appendLog('combat', `${enemy.name} regenerates ${regen} HP (${next}/${enemy.hp}).`),
          );
        }
      }
    }
  }
}

// OTA-842 [combat-log restructure] — build the incoming-hit modifier clause. The old
// line appended each mitigation as its own parenthetical, so a hit that armor + title +
// race + ward all touched read as a wall of "(…)(…)(…)(…)". This collects them into one
// terse comma-separated bracket: " [armor −40%, title ½, ward soaks 3]". Order mirrors
// the order they applied. Race VULNERABILITY appears as "+N%" — the bracket lists every
// modifier, not only reductions. Empty modifiers → empty clause (no bracket). Exported
// for the OTA-842 format test.
export function damageModClause(opts: {
  armorFraction?: number; // >0 when armor turned part of the hit
  titleHalved?: boolean;  // a title halved this type
  titleShaved?: number;   // Etherbound Survivor flat shave
  raceTag?: string;       // raceResistLabel output — raw " (…)" or ''
  shield?: boolean;       // Defensive Protocols shield active
  wardTag?: string;       // stone-ward soak — raw " (…)" or ''
  /** OTA-1140 — the MITIGATION_FLOOR clamp overrode the stack: the layers above
   *  are printed as authored, but the delivered damage is raw×0.30, not their
   *  product. Without this marker a player auditing the percentages against
   *  the damage taken can never make them reconcile. */
  floorEngaged?: boolean;
  /** OTA-1141 — flat soak from AC past the hit-floor cap (2 excess AC = −1
   *  damage, max −4). Named so a tank can SEE the wasted armor working. */
  plate?: number;
}): string {
  const strip = (t: string) => t.replace(/^\s*\(/, '').replace(/\)\s*$/, '').trim();
  const mods: string[] = [];
  if (opts.armorFraction && opts.armorFraction > 0) mods.push(`armor −${Math.round(opts.armorFraction * 100)}%`);
  if (opts.titleHalved) mods.push('title ½');
  else if (opts.titleShaved && opts.titleShaved > 0) mods.push(`Aetherbound −${opts.titleShaved}`);
  if (opts.raceTag) mods.push(strip(opts.raceTag));
  if (opts.shield) mods.push('shield ½');
  if (opts.wardTag) mods.push(strip(opts.wardTag));
  if (opts.plate && opts.plate > 0) mods.push(`plate −${opts.plate}`);
  if (opts.floorEngaged) mods.push('floor 30%');
  return mods.length ? ` [${mods.join(', ')}]` : '';
}

// OTA-838 — record an OBSERVED damage-type match against an enemy so the panel and
// bestiary can reveal what you've learned by fighting (the panel's "strike to learn"
// promise, made real + persistent). A type lives in weak OR resist, and a fresh
// contradicting observation MOVES it. No-op for 'normal'.
// Exported for unit testing the dedup/move logic (OTA-838).
//
// ⚠⚠⚠ OTA-1528 — KEYED ON THE DEFENCE PROFILE, NOT THE DISPLAY NAME.
//
// This was `enemyName.toLowerCase()`, and OTA-838's own note above admitted the
// hazard while mis-sizing it: *"per-spawn randomization can flip a type, so the
// latest hit is the truth."* Moving the type on a contradiction is the right rule
// INSIDE one fight. Across fights it is not a fix, it is the bug: the ordinal in
// "Eternal Dynasty Raider 1" is reused by every encounter, so each new spawn
// overwrote the last one's answer and the panel described whichever raider had
// been hit most recently — under a name the player reads as one creature.
//
// The owner's log, three raiders in one corpus, two different answers:
//   Raider 1 flinches (burn ×1.5) · Raider 2 flinches (piercing ×2.25)
//   Raider 3 flinches (piercing ×2.25)
// His portrait then told him `WEAK Burn` about a raider whose own chips read
// `Vuln Piercing`, and he fought it with a burn weapon. Stale intel that the
// player ACTS on is worse than no intel; "strike to learn" has to teach the
// thing in front of you, not the thing that stood there last time.
//
// enemyIntelKey drops the ordinal and appends the defence-bearing traits, so a
// lesson carries to a genuinely identical spawn and stops at a differently-rolled
// one. See enemyTraits.enemyIntelKey for why only those traits count.
export function recordEnemyIntel(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  enemyName: string,
  damageType: string | null | undefined,
  match: 'weak' | 'resist' | 'normal',
  enemyTraits?: readonly string[],
): void {
  if (match === 'normal') return;
  const dt = (damageType ?? '').toLowerCase();
  if (!dt || !enemyName) return;
  const key = enemyIntelKey(enemyName, enemyTraits);
  set((s) => {
    const wm = s.worldMemory;
    if (!wm) return {};
    const cur = wm.enemyIntel?.[key] ?? { weak: [], resist: [] };
    const weak = cur.weak.filter((t) => t !== dt);
    const resist = cur.resist.filter((t) => t !== dt);
    if (match === 'weak') weak.push(dt); else resist.push(dt);
    // Nothing changed → skip the write (avoids a needless re-render/persist).
    if (weak.length === cur.weak.length && resist.length === cur.resist.length
        && weak.every((t, i) => t === cur.weak[i]) && resist.every((t, i) => t === cur.resist[i])) {
      return {};
    }
    return { worldMemory: { ...wm, enemyIntel: { ...(wm.enemyIntel ?? {}), [key]: { weak, resist } } } };
  });
}

/** ⚠ OTA-1110 — THE ONE QUESTION EVERY DAMAGE SITE SHOULD ASK. True when the
 *  player is at or below zero HP and has NOT yet been resolved as dead — i.e.
 *  the exact window in which the game must stop and nothing else may run.
 *  Deliberately reads LIVE state rather than a snapshot: the whole class of bug
 *  this closes is code acting on a player it captured before the killing blow. */
export function playerIsDownNotDead(get: () => GameStore): boolean {
  const p = get().player;
  return !!p && p.hp <= 0 && !p.dead;
}

// Death is no longer permanent erasure. The character is marked dead and
// remains on the title slot list (with a DEAD badge) so the player can
// resurrect them with a Resurrection Gem.
export function handlePlayerDeath(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): void {
  const state = get();
  const player = state.player;
  if (!player || player.dead) return; // already handled

  const locName = state.currentScene?.location.name ?? 'Tartaria';
  const epitaph = pick([
    `${player.name} falls in ${locName}. The Aetherstone grows dim and does not lift.`,
    `The buried world claims ${player.name}. Tartaria keeps the body count.`,
    `${player.name}'s breath leaves. The dust settles back into its old patterns.`,
    `An end at ${locName}. The Arbiter watches and says nothing.`,
    `${player.name} does not rise. The ruins remember another.`,
  ]);
  state.appendLog('combat', epitaph);
  state.appendLog(
    'system',
    `${player.name} has fallen. A Resurrection Gem from the title screen can bring them back.`,
  );

  // OTA-845 [The Fallen] — a death is never wiped clean. Append this character to the
  // install-wide roll of the Fallen so later characters inherit a graveyard of
  // predecessors (readable in the Lore Codex, cross-character). Losing is fun: the run
  // ends, the legend persists. Fire-and-forget; when it lands, name the beat.
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const races = require('../data/races/races.json') as Array<{ id: string; name: string }>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { corruptionTierOf, tierLabel } = require('../engine/corruption');
    const hero = {
      name: player.name,
      raceName: races.find((r) => r.id === player.raceId)?.name ?? player.raceId ?? 'wanderer',
      epitaph,
      locationName: locName,
      kills: player.milestones?.enemiesDefeated ?? 0,
      corruption: tierLabel(corruptionTierOf(player.corruption ?? 0)),
      hours: Math.floor(player.hoursElapsed ?? 0),
      // OTA-975 — the kit they died in, for the Hollowed revenant they may yet
      // become (slot display names; the *Id fields are instance ids, skipped).
      gearNames: (() => {
        const slotPrio = ['main', 'off', 'chest', 'head', 'legs', 'feet', 'amulet', ...RING_SLOTS];
        return Array.from(new Set(Object.entries((player.equipped ?? {}) as Record<string, string | undefined>)
          .filter(([k, v]) => !!v && !k.endsWith('Id'))
          .sort(([a], [b]) => {
            const ia = slotPrio.indexOf(a); const ib = slotPrio.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          })
          .map(([, v]) => String(v)))).slice(0, 10);
      })(),
      // ⚠⚠ OTA-1366 — THE CLONE. The character themself, recorded so the
      // Hollowed can fight as they fought instead of as a kill-count formula.
      // Ten slots, not six: rings and an amulet are part of a kit, and the old
      // slice quietly dropped them.
      snapshot: {
        stats: {
          strength: Math.round(player.stats?.strength ?? 0),
          dexterity: Math.round(player.stats?.dexterity ?? 0),
          intelligence: Math.round(player.stats?.intelligence ?? 0),
          wisdom: Math.round(player.stats?.wisdom ?? 0),
          charisma: Math.round(player.stats?.charisma ?? 0),
          stealth: Math.round(player.stats?.stealth ?? 0),
        },
        hpMax: Math.round(player.hpMax ?? 0),
        ac: Math.round(player.ac ?? 0),
        raceId: player.raceId,
        factionId: player.factionId,
      },
      // OTA-994 — THE RECLAIM: full item copies too, so the revenant can give the
      // REAL gear back (fused stats intact), not a look-alike or a trophy.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      gear: (require('../engine/fallenRevenants') as typeof import('../engine/fallenRevenants')).buildFallenGearSnapshot(player),
      ts: Date.now(),
    };
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const revCache = require('../engine/fallenRevenants') as typeof import('../engine/fallenRevenants');
      revCache.appendFallenToCache(hero);
    }
    // ⚠⚠ OTA-1311 — and the SEED goes on the permanent register, which is what
    // the restore gate actually reads. `recordFallen` above writes the memorial,
    // and that list is capped at 25 — a permission check cannot live on a list
    // that forgets. Awaited by nothing, like the memorial, but it is the record
    // that stops a backup from undoing a death.
    void recordFallenSeed(characterSeedOf(player))
      .catch(() => { /* best-effort; the roster gate below still catches the common case */ });
    void recordFallen(hero).then((total) => {
      if (total > 1) {
        get().appendLog('system', `You join the Fallen of Tartaria — ${total} names the buried world keeps now. Read the roll from the Lore Codex.`);
      }
    }).catch(() => { /* the graveyard is a keepsake, never block death on it */ });
  }

  // OTA-067 — dev cheat for the project owner. If the fallen
  // character is named one of the dev names (case-insensitive,
  // trimmed), grant a Resurrection Gem on death so they can
  // immediately revive that same character from the title screen.
  // No effect for any other name; everyone else dies on the normal
  // rules (gem comes from boss kills / pity timer / rare drops).
  // arb89 — DEV_REVIVE_NAMES hoisted to module scope (shared with the
  // proactive on-load grant in loadSlotIntoGame).
  if (DEV_REVIVE_NAMES.includes(player.name.trim().toLowerCase())) {
    void addResurrectionGems(1).then((total) => {
      set(() => ({ resurrectionGems: total }));
      get().appendLog(
        'reward',
        `✦ A Resurrection Gem pulses in ${player.name}'s pack — the buried world owes you one. (${total} held)`,
      );
    });
  }

  // Mark the character dead in-place. Persist immediately so the slot
  // summary on the title list reflects the new state.
  // 2026-05-25 [MECHANIC-1b] — clear golem sidekick on player death.
  // The Aetheric tether dies with the caster.
  // OTA-124 — wire combat-death for the dog so the Phase 6 puppy-
  // vendor / rubble-puppy safety net can actually engage. If the dog
  // was downed in this fight (hp <= 0 from retaliation), mark them
  // 'dead' and queue puppyVendorOwed. Sleeping/idle dogs with hp > 0
  // survive the player's death (they wander off the abandoned save).
  set((s) => {
    if (!s.player) return { pendingRolls: null, pendingHookContinue: null };
    const dog = s.player.dog;
    const dogDiedInFight = !!dog && dog.hp <= 0;
    const wm = s.worldMemory;
    return {
      player: {
        ...s.player,
        dead: true,
        hp: 0,
        golem: null,
        dog: dogDiedInFight && dog ? { ...dog, status: 'dead' as const } : dog,
      },
      worldMemory: dogDiedInFight && !wm.puppyVendorUsed
        ? { ...wm, puppyVendorOwed: true }
        : wm,
      pendingRolls: null,
  pendingHookContinue: null,
    };
  });
  void get().persist();
  if (get().player?.dog?.status === 'dead') {
    const dogName = get().player?.dog?.name ?? 'Your dog';
    get().appendLog(
      'combat',
      `${dogName} falls beside you. The buried world claims them too.`,
    );
  }

  // ⚠ OTA-1110 — THE DEATH SCREEN, instead of a 3.5-second stare at the feed.
  // Owner: "there should be a crossfade between the game screen and a new
  // screen like the intro screen that gives a brief description of my death
  // lore style and how it ties to my reason for entering the mud world."
  //
  // The opening crawl asks why you came down. Nothing ever answered it: the
  // old ending was three log lines, a silent 3.5s hold on the exploration
  // screen, and an abrupt cut to the slot list — the run stopped, but the
  // story of it never closed. Now the same MOTIVE that wrote the opening
  // writes the ending, so an exile's death reads differently from a scholar's.
  //
  // Raised AFTER the save is written, so the overlay is pure presentation and
  // nothing on screen can be lost by leaving it. DeathOverlay owns the dwell
  // and calls dismissDeath() when the reading time is up (or on a tap), which
  // is what performs the handover to the character collection.
  {
    const dead = get().player;
    const scene = buildDeathScene(
      {
        name: dead?.name ?? player.name,
        placeName: locName,
        storyMotive: dead?.storyMotive ?? player.storyMotive,
        days: daysBelow(dead?.hoursElapsed ?? player.hoursElapsed),
        kills: dead?.milestones?.enemiesDefeated ?? player.milestones?.enemiesDefeated ?? 0,
      },
      // Seeds which variant is drawn. Stamped once here rather than inside the
      // builder so a re-render of the overlay can never reshuffle the words
      // the player is halfway through reading.
      `${player.name}|${Date.now()}`,
    );
    set(() => ({ pendingDeath: scene }));
  }
}
