import type { RollStep, PlayerCharacter, Enemy, Stats, StatusEffect, WeaponReachClass } from './types';
import { rollDie } from './rng';
import { findWeaponByName, type CatalogWeapon } from './crafting';
import { effectiveStats } from './equipment';
import { traitACBonus } from './enemyTraits';
import { barehandDamageFor } from './raceMechanics';
import { titlePerkModifiers, type TitlePerks } from './titles';

// arb-fix — passive skill bonuses from earned titles, injected into the skill
// check (was "exposed but never read"). Each title's perk now actually moves
// the relevant roll: Seeker/Scholar on investigate, the social titles on
// diplomacy, Shadow Diver on stealth.
function titleSkillBonus(intent: string, p: TitlePerks, ctx?: RaceSkillContext): { bonus: number; label: string } {
  let bonus = 0;
  const parts: string[] = [];
  const add = (v: number, name: string) => { if (v > 0) { bonus += v; parts.push(name); } };
  if (intent === 'investigate') {
    add(p.investigationBonus, 'Seeker'); add(p.loreBonus, 'Scholar');
    // arb-fix — Speaker title (machineSpeech): commune with relics/machines →
    // +2 when investigating a relic/machine target specifically.
    if (ctx?.relicTarget && p.machineSpeech) add(2, 'Speaker');
  }
  else if (intent === 'diplomacy') {
    add(p.socialBonus, 'Scion'); add(p.tradeBonus, 'Trader');
    add(p.diplomacyBonus, 'Broker'); add(p.leadershipBonus, 'Explorer');
  }
  else if (intent === 'stealth') { add(p.stealthBonus, 'Shadow Diver'); }
  return { bonus, label: parts.length ? ` + ${bonus} (title: ${parts.join('/')})` : '' };
}

// arb-fix — CONTEXT-MATCHED race conditional bonuses (the "+X when ..." traits
// that were flavor-only). The caller passes what it can detect about the
// target/scene; the bonus only fires when the context matches.
export interface RaceSkillContext {
  /** The investigated target reads as an ancient relic / artifact / machine. */
  relicTarget?: boolean;
  /** The current location is a ruin / buried capital / tomb / vault / dig. */
  inRuins?: boolean;
}
function raceSkillBonus(
  intent: string,
  player: PlayerCharacter,
  ctx?: RaceSkillContext,
): { bonus: number; label: string } {
  const r = player.raceId;
  let bonus = 0;
  const parts: string[] = [];
  const add = (v: number, name: string) => { bonus += v; parts.push(name); };
  // Ancient/relic INVESTIGATE — Giants, Aetherborn, Reclaimers each read the
  // old world better; Mud Dwellers handle the tech (Relic Savvy, DEX).
  // OTA-835 — the Unknowing Masses' "Curious Mind" line was removed here: it no
  // longer fires as a per-roll investigate bonus. It now AWAKENS a persistent
  // +2 INT / +2 WIS the first time they touch a relic/ruin (curiousMindAwakened,
  // applied in effectiveStats), which already lifts these rolls — keeping the
  // line too would double-count.
  if (intent === 'investigate' && ctx?.relicTarget) {
    if (r === 'tartarian_giant') add(1, 'Ancient Insight');
    else if (r === 'aetherborn') add(2, 'Aetheric Awakening');
    else if (r === 'reclaimer') add(1, 'Ruins Specialist');
    else if (r === 'mud_dweller') add(2, 'Relic Savvy');
  }
  // Aethercraft = the CAST discipline. Mud Dwellers (True Tartarians) trained it.
  if (intent === 'cast' && r === 'mud_dweller') add(2, 'Aethercraft Mastery');
  // Reclaimers move like ghosts through ruins.
  if (intent === 'stealth' && ctx?.inRuins && r === 'reclaimer') add(2, 'Urban Explorer');
  return { bonus, label: parts.length ? ` + ${bonus} (race: ${parts.join('/')})` : '' };
}

/**
 * Roll-modifier aggregator. Walks the player's status effects and sums
 * bonus / penalty dice for a given action class. Returns the net flat
 * modifier (each die ≈ ±2 on a d20 in our scale) plus the labels that
 * fed into it so the combat log can show what stacked.
 *
 * Phase 2: scene context (target in cover, point-blank range, etc.) and
 * enemy traits should also fold in here — for now the helper covers the
 * player-side status pool from the action-card actions.
 */
export interface RollMods {
  bonus: number;       // +N to the final roll
  penalty: number;     // -N to the final roll (positive integer)
  net: number;         // bonus - penalty
  sources: string[];   // human-readable labels for the log
  consume: StatusEffect['kind'][];  // effects to drop after this roll
}

export function rollMods(
  effects: readonly StatusEffect[] | undefined,
  action: 'attack_ranged' | 'attack_melee' | 'defense' | 'skill',
): RollMods {
  const fx = effects ?? [];
  let bonus = 0;
  let penalty = 0;
  const sources: string[] = [];
  const consume: StatusEffect['kind'][] = [];
  for (const e of fx) {
    switch (e.kind) {
      case 'aiming':
        if (action === 'attack_ranged') {
          bonus += 2;
          sources.push('aim +2');
          consume.push('aiming');
        }
        break;
      case 'sprinting':
        if (action === 'attack_ranged' || action === 'attack_melee') {
          penalty += 2;
          sources.push('sprinting -2');
        }
        break;
      case 'in_cover':
        if (action === 'defense') {
          bonus += 4;
          sources.push('cover +4');
        }
        break;
      case 'in_cover_full':
        if (action === 'defense') {
          bonus += 8;
          sources.push('full cover +8');
        }
        break;
      case 'quick_fire':
        if (action === 'attack_ranged') {
          bonus += 2;
          sources.push('quick fire +2');
          consume.push('quick_fire');
        }
        break;
      case 'fighting_back':
        // No direct attack-roll modifier; flag is read by the enemy
        // counter-attack handler in gameStore to switch defense to an
        // opposed Fighting roll.
        break;
      case 'distracted':
        // OTA-144 — dog distract bonus. OTA-121 set this status on the
        // player but no consumer ever read it (rollMods missed the
        // case, so the bonus was vapor). Now applies to the next attack
        // roll AND is consumed; the initiative +1 rides on a separate
        // consumer in buildCombatSteps that peeks at the status without
        // consuming it (so the same distract pulse covers BOTH bonuses
        // on the same swing).
        // arb160 — raised +2 → +4 (matches the dodge's +4) so a dog
        // distract is a genuinely strong setup, not a marginal nudge.
        if (action === 'attack_ranged' || action === 'attack_melee') {
          bonus += 4;
          sources.push('distract +4');
          consume.push('distracted');
        }
        break;
      // OTA-795 — perfect opening (successful dodge): no to-hit change; the
      // window is CONSUMED by this swing whether it lands or not. The damage
      // doubling itself rides on buildCombatSteps' peek of the same status.
      case 'perfect_opening':
        if (action === 'attack_ranged' || action === 'attack_melee') {
          sources.push('perfect opening (2× dice)');
          consume.push('perfect_opening');
        }
        break;
      case 'dodging':
        if (action === 'defense') {
          bonus += 4;
          sources.push((e.label === 'in cover' ? 'cover' : e.label === 'aiming' ? 'aim' : e.label === 'disengaging' ? 'disengage' : 'dodge') + ' +4');
        }
        if (action === 'attack_ranged' && e.label === 'aiming') {
          bonus += 2;
          sources.push('aim +2');
          consume.push('dodging');
        }
        break;
      // OTA-365 — 'ready' (the hold/prepare command) now DELIVERS its
      // promised held-strike bonus: +2 on the next attack, consumed on
      // use. Previously the status was stamped by the `ready` command but
      // no consumer read it, so the "+1 bonus die on the reaction" line
      // was vapor.
      case 'ready':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          bonus += 2;
          sources.push('readied +2');
          consume.push('ready');
        }
        break;
      case 'surprised':
        penalty += 2;
        sources.push('surprised -2');
        consume.push('surprised');
        break;
      // v2.4.1 (OTA 034) — Successful stealth approach grants +5 on
      // the next melee or ranged strike. Consumed on use.
      case 'stealthed':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          bonus += 5;
          sources.push('stealthed +5');
          consume.push('stealthed');
        }
        break;
      // 2026-05-24 — stamina-driven statuses. tired and exhausted are
      // auto-applied/cleared from stamina each tick; never consumed
      // here. power_attack_pending and defensive_stance are tactical.
      case 'tired':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          penalty += 1;
          sources.push('tired -1');
        }
        if (action === 'defense') {
          penalty += 1;
          sources.push('tired -1');
        }
        break;
      case 'exhausted':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          penalty += 2;
          sources.push('exhausted -2');
        }
        if (action === 'defense') {
          penalty += 2;
          sources.push('exhausted -2');
        }
        break;
      case 'power_attack_pending':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          bonus += 2;
          sources.push('power attack +2');
          consume.push('power_attack_pending');
        }
        break;
      case 'defensive_stance':
        if (action === 'defense') {
          bonus += 2;
          sources.push('defensive +2');
        }
        break;
      // OTA-364 — poison follow-through. The rulebook gives a poisoned
      // fighter disadvantage; we approximate with a flat -2 to the
      // attack roll (was computed by the orphan statusAttackPenalty,
      // which nothing ever called — so poison only ever ticked DOT and
      // never actually degraded the victim's swings). Now it bites here,
      // the one consumer the attack flow reads. Not consumed — it rides
      // until the poison DOT runs its course.
      case 'poisoned':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          penalty += 2;
          sources.push('poisoned -2');
        }
        break;
    }
  }
  return { bonus, penalty, net: bonus - penalty, sources, consume };
}

type WeaponClass = 'ranged' | 'melee' | 'runecaster' | 'barehanded';

// Did the player explicitly call for a bare-hand attack? "punch", "kick",
// "fist", etc. — these always route through bare hands regardless of what
// the player has equipped, and never wear down the equipped weapon.
export function isBareHandAttack(actionText: string): boolean {
  return /\b(punch|kick|fist|knee|headbutt|elbow|bare[- ]?hand)\b/.test(actionText.toLowerCase());
}

// Resolve the player's currently-equipped weapon to a catalog entry, if any.
// `prefer` lets the caller bias toward an off-hand strike when the player
// explicitly chooses it; defaults to the main-hand weapon.
//
// OTA-195 — checks the inventory for a fused weapon with `uniqueStats`
// BEFORE falling back to the catalog so combat reads the unique stats
// when the equipped item is one-of-a-kind. Fused weapons never appear
// in WEAPONS so the catalog lookup would otherwise miss them.
export function getEquippedWeapon(
  player: PlayerCharacter,
  prefer: 'main' | 'off' = 'main',
): CatalogWeapon | null {
  const eq = player.equipped;
  if (!eq) return null;
  const name =
    prefer === 'off'
      ? eq.off ?? eq.main ?? eq.weaponName
      : eq.main ?? eq.weaponName ?? eq.off;
  if (!name) return null;
  // Unique-fused first: scan player.inventory for an instance with
  // uniqueStats matching this name + weapon kind.
  for (const it of player.inventory) {
    if (!it.uniqueStats) continue;
    if (it.uniqueStats.kind !== 'weapon') continue;
    if (it.name.toLowerCase() !== name.toLowerCase()) continue;
    const u = it.uniqueStats;
    if (!u.damageDice || !u.damageType || !u.scalesWith) continue;
    return {
      name: it.name,
      weaponKind: 'melee',
      damageType: u.damageType as CatalogWeapon['damageType'],
      damageDice: u.damageDice,
      stat: u.scalesWith,
      rarity: u.rarity,
      baseDurability: u.durability.max,
      tags: it.tags,
      description: it.description ?? '',
    };
  }
  // OTA-208 — throwable inventory items synthesize a one-shot
  // ranged weapon. Player can equip a Shaped Aetheric Shard /
  // Aetheric Shard to main or off; the attack handler picks up
  // the synthesized weapon with the right 2d20 damage. The
  // consume-on-hit + auto-unequip is handled in gameStore's
  // attack path (look for the 'throwable' tag branch).
  for (const it of player.inventory) {
    if (!(it.tags ?? []).some((t) => /throwable/i.test(t))) continue;
    if (it.name.toLowerCase() !== name.toLowerCase()) continue;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { throwDamageNotation } = require('./itemWeight');
    return {
      name: it.name,
      weaponKind: 'ranged',
      damageType: 'aetheric' as CatalogWeapon['damageType'],
      damageDice: throwDamageNotation(it) as string,
      stat: 'dexterity',
      rarity: it.rarity ?? 'Common',
      tags: it.tags,
      description: it.description ?? 'A one-shot throwable. One throw, then gone.',
    };
  }
  return findWeaponByName(name);
}

function detectWeaponClass(text: string): WeaponClass {
  const t = text.toLowerCase();
  if (/bolt|boltcaster|bow|crossbow|pistol|shot|shoot|fire|sling|arrow|ranged/.test(t)) return 'ranged';
  if (/rune|spell|cast|aether|channel|arcane/.test(t)) return 'runecaster';
  if (/sword|blade|axe|knife|dagger|spear|hammer|mace|club|strike|slash|cut|stab|melee/.test(t)) return 'melee';
  return 'barehanded';
}

// OTA-550 — long/reach weapon detection (spears, pikes, halberds, glaives,
// lances, polearms). Matched on the weapon NAME and/or its catalog tags so a
// "Tartarian Spear" (catalog weaponKind 'melee', tag 'spear') resolves to the
// `long` reach class (mid inward) instead of plain melee (close only).
export const LONG_WEAPON_RE = /\b(spear|pike|halberd|glaive|lance|polearm|harpoon|naginata|trident|partisan|guisarme|bardiche|voulge)\b/i;
export function isLongWeapon(name: string | undefined, tags?: readonly string[]): boolean {
  if (name && LONG_WEAPON_RE.test(name)) return true;
  // Direct tag hit: 'spear' / 'pike' / 'polearm' / 'halberd' etc.
  if (tags && tags.some((t) => LONG_WEAPON_RE.test(t) || /\bpolearm\b/i.test(t))) return true;
  return false;
}

/** OTA-550 — resolve a catalog weapon (by weaponKind + tags + name + a
 *  throwable flag) to its four-band reach class. Throwable-tagged items win
 *  regardless of weaponKind (so a misc-kind Shaped Aetheric Shard still
 *  throws). Then long/reach weapons, then ranged/runecaster, else melee. */
export function reachClassFor(opts: {
  weaponKind?: 'melee' | 'ranged' | 'runecaster';
  name?: string;
  tags?: readonly string[];
  throwable?: boolean;
}): WeaponReachClass {
  const tags = opts.tags ?? [];
  const throwable = opts.throwable || tags.some((t) => /throwable/i.test(t));
  if (throwable) return 'throwable';
  if (opts.weaponKind === 'runecaster') return 'runecaster';
  if (opts.weaponKind === 'ranged') return 'ranged';
  if (isLongWeapon(opts.name, tags)) return 'long';
  if (opts.weaponKind === 'melee') return 'melee';
  return 'melee';
}

function attackStatFor(
  wc: WeaponClass,
  stats: PlayerCharacter['stats'],
): { value: number; label: string } {
  switch (wc) {
    case 'ranged': return { value: stats.dexterity, label: 'DEX' };
    case 'runecaster': return { value: stats.intelligence, label: 'INT' };
    default: return { value: stats.strength, label: 'STR' };
  }
}

/** OTA-986 — CHARISMA IS NOT A TO-HIT STAT. It is the social stat; nothing you
 *  swing, fire or throw rolls it. The weapon catalog once carried `charisma` on
 *  every single_handed row (42 weapons, 7 of them Legendary) — a silent penalty
 *  for any character whose CHA trailed their STR, and invisible because nothing
 *  outside the combat log names the stat a weapon uses. The data is fixed; this
 *  is the runtime backstop so a bad row can never quietly cost a fight again.
 *  A weapon that somehow arrives carrying charisma falls back to the class
 *  default (STR melee / DEX ranged / INT runecaster) instead of being obeyed. */
export function isValidAttackStat(stat: string | undefined): boolean {
  return stat === 'strength' || stat === 'dexterity'
    || stat === 'intelligence' || stat === 'wisdom';
}

function enemyAC(enemy: Enemy): number {
  // OTA-419 — `abilityPoint` is stored as "Strength 4" / "Dexterity 6" etc., so
  // parseInt() returned NaN and EVERY enemy collapsed to the AC-8 fallback (bosses
  // 14) — flattening all stat-based AND Core-Guardian-tier AC scaling (a T1 and a
  // T9 Guardian had identical AC). The thrown-attack / counter paths were fixed
  // long ago via gameStore's parseEnemyAP; this one was missed. Pull the first
  // number out of the string, same as parseEnemyAP.
  const apMatch = String(enemy.abilityPoint ?? '').match(/\d+/);
  const ap = apMatch ? parseInt(apMatch[0], 10) : NaN;
  const base = isNaN(ap) ? 8 : Math.max(5, Math.min(18, 5 + ap));
  // Boss tier: +6 over the standard scaling so even a power character
  // (STR 14 + 1d8 weapon) can't auto-hit. Combined with double counters
  // and bonus damage downstream, bosses become "find another way" walls.
  const bossBonus = enemy.boss ? 6 : 0;
  return Math.max(1, base + traitACBonus(enemy.traits) + bossBonus);
}

// Rulebook: Common 1d6 / Uncommon 2d6 / Rare 1d10+1d6 / Legendary 2d10
// We derive weapon tier from inventory kind+rarity — default to common 1d6.
function damageDice(wc: WeaponClass): { sides: number; count: number } {
  if (wc === 'runecaster') return { sides: 6, count: 1 }; // common runecaster
  return { sides: 6, count: 1 }; // common weapon
}

// ─── Combat sequence: Initiative → Attack → Damage ───────────────────────────

export function buildCombatSteps(
  actionText: string,
  player: PlayerCharacter,
  enemy: Enemy,
  opts?: {
    /** When set, the attack is being made out of normal weapon range.
     *  Applies a -5 to the attack roll and notes it in the bonus label
     *  so the player sees why it missed. */
    blindSwing?: boolean;
    /** Visibility / atmospheric penalty from the active weather
     *  (Iron Fog, Whisper Fog, Ash Storm, etc.). Subtracted from the
     *  attack roll on top of any blindSwing penalty. */
    visibilityPenalty?: number;
    /** Optional descriptor for the visibility penalty (e.g. "Iron Fog")
     *  so the bonus label can name the source. */
    visibilityLabel?: string;
    /** Active weather's per-stat modifiers (Iron Fog −1 DEX etc.). When
     *  passed, effectiveStats folds these into the stat used for the
     *  attack/damage roll. */
    weatherMod?: Partial<Stats>;
    /** Pre-computed roll modifier from the player's status pool — aim
     *  bonus, sprinting penalty, surprise penalty, etc. Caller computes
     *  this so the dice-prompt label can also surface the consume list
     *  (effects expire on use). */
    statusMods?: RollMods;
    /** Point-blank bonus from being at arm's reach with a ranged weapon
     *  designed for it. +2 to the attack roll. */
    pointBlankBonus?: boolean;
    /** OTA-362 — accumulated acid-coating armor shred on the target.
     *  Subtracted from the enemy's AC so the more you've hit them with
     *  an acid weapon, the easier they are to hit. */
    acReduction?: number;
  },
): RollStep[] {
  // Equipped weapon takes precedence over text-based weapon-class detection.
  // No equip = fall back to the original behavior (rusted blade / fists).
  // Off-hand attack: when the player says "off-hand" or "off hand", route
  // through the off-slot weapon instead of the main.
  // Bare-hand attack: explicit "punch" / "kick" / "fist" forces barehanded
  // regardless of what's equipped — lets the player choose to sacrifice
  // damage in exchange for the bludgeoning damage type or to spare the
  // weapon's durability.
  const prefersOff = /\boff[- ]?hand\b/.test(actionText.toLowerCase());
  // OTA-931 — a bare-hand keyword (punch/kick/FIST/knee/elbow/headbutt) lets the player
  // deliberately punch INSTEAD of using their weapon. But it must NOT fire when the keyword
  // is part of the EQUIPPED weapon's OWN name — the Tartarian Giant's starter "Mud-fist
  // Wraps" contains "fist", so "attack with the mud-fist wraps" wrongly dropped the weapon
  // and swung bare-handed. Strip the equipped weapon's name before the bare-hand check; a
  // standalone "punch it" still punches.
  const candidateWeapon = getEquippedWeapon(player, prefersOff ? 'off' : 'main');
  const normText = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  const barehandText = candidateWeapon?.name
    ? normText(actionText).split(normText(candidateWeapon.name)).join(' ')
    : normText(actionText);
  // OTA-932 — a HAND weapon (tagged 'barehanded' — the Mud-fist Wraps, the gauntlets, the
  // Giant Bone Knuckles) IS your fist, so "punch"/"kick" should swing IT, not bare skin.
  // Only force an unarmed strike when the equipped weapon is NOT a hand-weapon (e.g. you
  // deliberately punch while holding a sword, for the bludgeoning type / to spare durability).
  const wieldsHandWeapon = (candidateWeapon?.tags ?? []).some((t) => t.toLowerCase() === 'barehanded');
  const forcesBarehand = isBareHandAttack(barehandText) && !wieldsHandWeapon;
  const equipped = forcesBarehand ? null : candidateWeapon;
  const wc: WeaponClass = equipped?.weaponKind ?? detectWeaponClass(actionText);
  // Stat used for the attack roll factors in any equipped accessory bonuses
  // (rings/amulets boosting STR/DEX/INT/WIS/CHA) PLUS the active weather's
  // stat modifiers (Iron Fog −1 DEX etc.) so the world's mood is in every
  // swing.
  const stats = effectiveStats(player, opts?.weatherMod);
  // OTA-986 — trust the row only if it names a stat you can actually fight with.
  // See isValidAttackStat: charisma on a weapon is always an authoring error,
  // and obeying it costs the player the fight silently.
  const stat = equipped && isValidAttackStat(equipped.stat)
    ? { value: stats[equipped.stat], label: STAT_LABEL[equipped.stat] }
    : attackStatFor(wc, stats);
  // OTA-362 — acid armor shred lowers the target's effective AC (floored
  // at 1) so an acid-coated weapon makes a tough foe progressively easier
  // to land.
  const ac = Math.max(1, enemyAC(enemy) - Math.max(0, opts?.acReduction ?? 0));
  const enemyInit = rollDie(10);
  // Use equipped damage dice if available; parse "2d6" or "1d10+1d6".
  // OTA 038 — barehanded path now reads race.barehandDamage instead of
  // the old hardcoded 1d6. Giants land 1d6+2, Mud Dwellers 1d6-3,
  // Sentinels 1d10. The Sentinel even/odd hit-gate is enforced at the
  // attack-resolution site in gameStore.ts (OTA 041) after the damage
  // die is rolled — see the `if (barehand)` guard around the
  // BarehandSpec.hitGate check there.
  const barehandSpec = !equipped ? barehandDamageFor(player.raceId) : null;
  const dmg = equipped
    ? parseDamageDice(equipped.damageDice)
    : barehandSpec
      ? { count: barehandSpec.count, sides: barehandSpec.sides }
      : damageDice(wc);
  const damageBonus = barehandSpec?.bonus ?? 0;
  // arb-fix — Aetherborn "Destiny Unfolding": an Aetheric weapon channels the
  // wielder's awakened bloodline for an extra 1d6 on every hit. Rolled here
  // (like enemyInit above) so it's fixed for this swing and shows in the
  // damage breakdown. Gated on raceId + the weapon's aetheric damageType.
  const aetherSurge = (player.raceId === 'aetherborn' && equipped?.damageType === 'aetheric')
    ? rollDie(6)
    : 0;
  const damageTypeNote = equipped
    ? ` (${equipped.damageType})`
    : forcesBarehand ? ' (bludgeoning)' : '';

  // OTA-144 — distract gives +1 to initiative on the next combat
  // swing ("+1 for initiative and an additional attack bonus").
  // arb160 — attack bonus raised to +4 (see rollMods 'distracted' case).
  // Read-only peek; the attack-bonus consumer (rollMods in this same file)
  // is what actually strips the status. So a single distract pulse covers
  // both bonuses on the SAME swing — the player's first attack after the
  // dog distracts gets initiative +1 AND attack +4.
  const distractBonus = (player.statusEffects ?? []).some((e) => e.kind === 'distracted') ? 1 : 0;
  // OTA-795 — perfect opening (successful dodge). Peek only; rollMods consumes
  // the status on the attack step, so the window is spent by this swing whether
  // it lands or not. Doubles the damage DICE — the same treatment as a crit,
  // and they stack (a crit through a perfect opening is 4× dice).
  const perfectOpening = (player.statusEffects ?? []).some((e) => e.kind === 'perfect_opening');
  // OTA-847 (STEALTH SYSTEM) — BACKSTAB. Striking from stealth (the `stealthed`
  // buff, earned via the first-action SNEAK ATTACK opener or a mid-combat
  // re-stealth) with a FINESSE / thrown weapon (stat 'dexterity') doubles the
  // damage dice — the rogue payoff. A HEAVY weapon striking from stealth still
  // gets the +5 to-hit from `stealthed` (rollMods), but no dice-doubling — a
  // plain SNEAK STRIKE, so heavy builds can still use the button, they just
  // don't get the multiplier. Peek only; the +5 consume happens in rollMods,
  // the same peek/consume split perfect_opening uses, so one swing gets both.
  const backstab = (player.statusEffects ?? []).some((e) => e.kind === 'stealthed')
    && equipped?.stat === 'dexterity';
  // OTA-403 — manual weapon-coating damage roll. If the swinging weapon
  // instance carries a coating, append a 4th 'coating' step so the player
  // ROLLS the coating's bonus damage themselves (it was auto-rolled inside
  // concludeRolls before — "I never get a roll for the acid damage").
  // The hand picked here MUST match the one concludeRolls reads
  // (usedOffHandForDmg = same `\boff[- ]?hand\b` test → same slot id), so
  // the rolled value lands on the same instance. The step is hit-gated
  // (skipped on a miss) and the elemental type/trait modifier is still
  // applied to the rolled total in concludeRolls.
  const coatSlotId = forcesBarehand
    ? null
    : prefersOff
      ? (player.equipped?.offId ?? null)
      : (player.equipped?.mainId ?? player.equipped?.offId ?? null);
  const coatInst = coatSlotId ? (player.inventory ?? []).find((i) => i.id === coatSlotId) : null;
  const coating = coatInst?.coating ?? null;
  // OTA-873 — a Crucible-upgraded weapon carries a SECOND coating that also rolls
  // and applies on every landing hit (staged as its own 'coating2' roll step below).
  const coating2 = coatInst?.coating2 ?? null;

  const steps: RollStep[] = [
    {
      id: 'initiative',
      label: 'Roll for INITIATIVE',
      sides: 10,
      count: 1,
      bonus: distractBonus,
      bonusLabel: distractBonus > 0 ? 'distract +1' : '',
      target: enemyInit,
      targetLabel: `Enemy rolled ${enemyInit}`,
      context: `d10 — meet or beat the enemy to act first`,
    },
    (() => {
      const blindPen = opts?.blindSwing ? -5 : 0;
      const visPen = -(opts?.visibilityPenalty ?? 0);
      const statusNet = opts?.statusMods?.net ?? 0;
      const pointBlank = opts?.pointBlankBonus ? 2 : 0;
      const totalMod = blindPen + visPen + statusNet + pointBlank;
      const pieces: string[] = [`${stat.label} ${stat.value}`];
      if (blindPen) pieces.push(`− 5 (blind swing)`);
      if (visPen) pieces.push(`− ${Math.abs(visPen)} (${opts?.visibilityLabel ?? 'visibility'})`);
      if (pointBlank) pieces.push('+ 2 (point blank)');
      if (opts?.statusMods?.sources?.length) pieces.push(...opts.statusMods.sources);
      const ctxPieces: string[] = [`d20 + ${stat.label}`];
      if (blindPen) ctxPieces.push(`− 5 (out of reach)`);
      if (visPen) ctxPieces.push(`− ${Math.abs(visPen)} (${opts?.visibilityLabel ?? 'low visibility'})`);
      if (pointBlank) ctxPieces.push('+ 2 (point blank)');
      if (opts?.statusMods?.sources?.length) ctxPieces.push(...opts.statusMods.sources);
      // HANDOFF #14b — attack-side advantage / disadvantage. Mirrors the
      // defense-side logic in gameStore.applyEnemyCounter. Aiming gives
      // the player advantage on their next attack (roll 2d20, keep higher);
      // surprised gives disadvantage (keep lower). When both fire, they
      // cancel out and the roll stays normal. The flat bonuses on these
      // statuses still apply — advantage stacks on top, deliberately
      // making aim-then-fire feel decisive.
      const fx = player.statusEffects ?? [];
      const hasAiming = fx.some((e) => e.kind === 'aiming' && e.remainingRounds > 0);
      const hasSurprised = fx.some((e) => e.kind === 'surprised' && e.remainingRounds > 0);
      let rollMode: 'advantage' | 'disadvantage' | undefined;
      let rollModeLabel: string | undefined;
      if (hasAiming && !hasSurprised) {
        rollMode = 'advantage';
        rollModeLabel = 'aiming';
      } else if (hasSurprised && !hasAiming) {
        rollMode = 'disadvantage';
        rollModeLabel = 'surprised';
      }
      return {
        id: 'attack',
        label: 'Roll to ATTACK',
        sides: 20,
        count: 1,
        bonus: stat.value + totalMod,
        bonusLabel: pieces.join(' '),
        target: ac,
        targetLabel: `AC ${ac}`,
        context: `${ctxPieces.join(' ')} to hit ${enemy.name}`,
        ...(rollMode ? { rollMode, rollModeLabel } : {}),
      };
    })(),
    {
      id: 'damage',
      label: 'Roll for DAMAGE',
      sides: dmg.sides,
      count: (perfectOpening || backstab) ? dmg.count * 2 : dmg.count,
      bonus: damageBonus + aetherSurge,
      bonusLabel: [
        damageBonus !== 0 ? `${damageBonus > 0 ? '+' : ''}${damageBonus} (race)` : '',
        aetherSurge > 0 ? `+${aetherSurge} (Aetheric surge 1d6)` : '',
      ].filter(Boolean).join(' '),
      context: `damage dealt to ${enemy.name}${damageTypeNote}${perfectOpening ? ' — PERFECT OPENING (double dice)' : backstab ? ' — BACKSTAB (double dice)' : ''}`,
      // no target — always applies if the attack hit
    },
  ];

  if (coating) {
    const cd = parseDamageDice(coating.dice);
    steps.push({
      id: 'coating',
      label: `Roll for ${coating.label.toUpperCase()} COATING`,
      sides: cd.sides,
      count: cd.count,
      bonus: 0,
      bonusLabel: '',
      context: `${coating.label} coating — extra ${coating.kind} damage to ${enemy.name}`,
      // no target — bonus damage that applies whenever the strike landed
    });
  }
  // OTA-873 — the second coating on an upgraded weapon rolls its own step, so the
  // player sees (and rolls) BOTH coatings landing on the strike.
  if (coating2) {
    const cd2 = parseDamageDice(coating2.dice);
    steps.push({
      id: 'coating2',
      label: `Roll for ${coating2.label.toUpperCase()} COATING`,
      sides: cd2.sides,
      count: cd2.count,
      bonus: 0,
      bonusLabel: '',
      context: `${coating2.label} coating — extra ${coating2.kind} damage to ${enemy.name}`,
    });
  }

  return steps;
}

// Parse a damage notation string like "2d6" or "1d10+1d6" into a single
// {sides, count} we can roll. For multi-die notations we pick the larger
// die and double the count to roughly preserve the range (close enough
// for a single roll step — we don't currently animate multiple groups).
export function parseDamageDice(notation: string): { sides: number; count: number } {
  const m = /(\d+)d(\d+)/i.exec(notation);
  if (!m) return { sides: 6, count: 1 };
  // For compound like "1d10+1d6" the first match captures the larger.
  return { count: parseInt(m[1]!, 10), sides: parseInt(m[2]!, 10) };
}

// ─── Skill checks ────────────────────────────────────────────────────────────
// Rulebook DC table: Easy 6 / Moderate 9 / Hard 12 / Very Hard 15

/** OTA-455 — first-steps FLEE GRACE. True when a FAILED escape attempt should be
 *  nudged to a bare success. Conditions: the 'escape' intent, the roll actually
 *  failed, and the character is within their first 3 wasteland steps (the sliding
 *  `recentTileHistory` window only reaches length 1..3 that early and, since it
 *  grows monotonically to its cap, never returns to ≤3 — so this reliably means
 *  "brand-new character"). The flee stays a real roll everywhere else. */
export const FLEE_GRACE_STEPS = 3;
export function fleeGraceApplies(intent: string, skillSucceeded: boolean, tilesSeen: number): boolean {
  return intent === 'escape' && !skillSucceeded && tilesSeen <= FLEE_GRACE_STEPS;
}

const SKILL_DC: Record<string, number> = {
  stealth: 12,
  diplomacy: 15,
  escape: 9,
  investigate: 9,
  cast: 12,
  use_relic: 12,
};

const SKILL_STAT: Record<string, keyof PlayerCharacter['stats']> = {
  stealth: 'stealth', // OTA-348 — now governed by the dedicated Stealth attribute (was 'dexterity')
  diplomacy: 'charisma',
  escape: 'dexterity',
  investigate: 'intelligence',
  cast: 'intelligence',
  use_relic: 'wisdom',
  // Maneuver sub-types — route to the right stat for the kind of move.
  maneuver_disarm: 'dexterity',
  maneuver_trip: 'dexterity',
  maneuver_grapple: 'strength',
  maneuver_shove: 'strength',
  maneuver_pin: 'strength',
  maneuver_sweep: 'dexterity',
  maneuver_hook: 'dexterity',
};

/** Classify a player's maneuver verb to one of the sub-types so the
 *  skill check routes through the correct stat. Default = grapple
 *  (STR) when nothing matches. */
export function classifyManeuver(actionText: string): string {
  const t = actionText.toLowerCase();
  if (/disarm|knock.*weapon|strip.*weapon/.test(t)) return 'maneuver_disarm';
  if (/trip|sweep.*leg|leg.*sweep|knock down/.test(t)) return 'maneuver_trip';
  if (/grapple|wrestle|tackle|bear hug/.test(t)) return 'maneuver_grapple';
  if (/shove|push|knock back|ram/.test(t)) return 'maneuver_shove';
  if (/pin|hold down|restrain/.test(t)) return 'maneuver_pin';
  if (/sweep|sweep.*aside/.test(t)) return 'maneuver_sweep';
  if (/hook|catch|snag/.test(t)) return 'maneuver_hook';
  return 'maneuver_grapple';
}

const STAT_LABEL: Record<keyof PlayerCharacter['stats'], string> = {
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
  stealth: 'STE', // OTA-348
};

const DC_NAME: Record<number, string> = {
  6: 'Easy', 9: 'Moderate', 12: 'Hard', 15: 'Very Hard', 18: 'Difficult',
};

// Human-readable label for what the skill check is FOR — the player should
// always know "I'm rolling to STEALTH" not "Skill Check".
const INTENT_ACTION_VERB: Record<string, string> = {
  stealth: 'STEALTH',
  diplomacy: 'PERSUADE',
  escape: 'ESCAPE',
  investigate: 'INVESTIGATE',
  cast: 'CAST',
  use_relic: 'USE RELIC',
};

// OTA-613 — buildRestSteps (the only producer of a `rest_hours` roll step) was
// removed: it had no callers, and its consumer block in concludeRolls was an
// unreachable, ambush/hunger/weather-free heal. The live rest path is the
// submitPlayerAction 'rest' case.

export function buildSkillSteps(
  intent: string,
  player: PlayerCharacter,
  opts?: { weatherMod?: Partial<Stats>; companionAssist?: boolean; statusMods?: RollMods; raceCtx?: RaceSkillContext },
): RollStep[] {
  const statKey = SKILL_STAT[intent] ?? 'wisdom';
  const stats = effectiveStats(player, opts?.weatherMod);
  const statVal = stats[statKey];
  const statLabel = STAT_LABEL[statKey];
  const dc = SKILL_DC[intent] ?? 12;
  const dcName = DC_NAME[dc] ?? '';
  const verb = INTENT_ACTION_VERB[intent] ?? intent.toUpperCase();
  const label = `Roll to ${verb}`;
  // Companion assist — +2 bonus when a companion is present. Stacks
  // with weather + equipped stat bonuses. Narrative: the follower is
  // helping you.
  const assistBonus = opts?.companionAssist ? 2 : 0;
  const assistLabel = assistBonus ? ` + ${assistBonus} (companion assist)` : '';
  // Status-effect mods — e.g. maneuver's build-mismatch applies one
  // or more `surprised` stacks for -2 each. Caller passes rollMods
  // computed for 'skill' action. QA flagged that this layer existed
  // for attack rolls but never reached skill checks.
  const sMods = opts?.statusMods;
  const statusNet = sMods?.net ?? 0;
  const statusLabel = sMods && sMods.sources.length > 0 ? ` ${statusNet >= 0 ? '+' : ''}${statusNet} (${sMods.sources.join(', ')})` : '';
  // arb-fix — earned-title + context-matched race skill bonuses now apply.
  const titleSk = titleSkillBonus(intent, titlePerkModifiers(player), opts?.raceCtx);
  const raceSk = raceSkillBonus(intent, player, opts?.raceCtx);
  const perkBonus = titleSk.bonus + raceSk.bonus;
  const perkLabel = `${titleSk.label}${raceSk.label}`;

  return [{
    id: 'skill_check',
    label,
    sides: 20,
    count: 1,
    bonus: statVal + assistBonus + statusNet + perkBonus,
    bonusLabel: `${statLabel} ${statVal}${assistLabel}${perkLabel}${statusLabel}`,
    target: dc,
    targetLabel: `DC ${dc}${dcName ? ` — ${dcName}` : ''}`,
    context: `d20 + ${statLabel}${assistLabel}${perkLabel}${statusLabel} vs ${dcName || 'DC'} ${dc}`,
  }];
}
