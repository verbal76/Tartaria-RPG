// Core Guardians — the Aether-Born Order.
//
// Lore: a sub-faction (non-playable). A semi-religious order of
// Aether-born initiates dedicated to guarding the Tartarian Cores
// that keep the underground tartarian cities' grid alive. Each of
// the five Lost Capitals has a Guardian — their high priest from
// before the Mud Flood, kept living by the Core they swore to
// protect. To them, extracting a Core is sacrilege.
//
// Mechanics:
// - Performing your faction's gate verb at a Lost Capital SUMMONS
//   the Capital's Guardian instead of immediately granting the
//   Core. The Core is only granted when the Guardian falls.
// - Difficulty scales by your kill-count, NOT by the Capital. The
//   first Guardian you fight is "Tier 1" no matter which Capital
//   you hit first. So the player's choice of order is preserved
//   but the curve is fixed: T1 → T2 → T3 → T4 → T5.
// - Each Guardian drops a unique signature weapon + armor (the
//   Core Guardian set — 5 weapons, 5 armors, all hand-authored)
//   on top of the Core itself + the existing boss Res Gem.
// - Flee is allowed. The Guardian fully restores (HP + AC + any
//   gear damage) the next time the player triggers the gate. The
//   player keeps whatever damage / durability loss they took. No
//   chipping away across multiple encounters.

import type { Enemy, InventoryItem, PlayerCharacter, Stats } from './types';
import { LOST_CAPITAL_LOCATIONS } from './mainQuest';

/** Trait tag every Guardian carries. Used by gameStore to detect
 *  Guardian kills/flees without name-matching. */
export const CORE_GUARDIAN_TRAIT = 'core_guardian';

export interface CoreGuardianDef {
  capitalId: string;
  capitalName: string;
  /** Base enemy stats — scaled per-encounter by tierForKills. */
  base: Enemy;
  /** First-encounter approach line, logged when the Guardian
   *  manifests in the scene. */
  approachLine: string;
  /** Rebuke spoken when the player flees mid-fight. */
  rebukeLine: string;
  /** Final words on defeat, before the Core releases. */
  defeatLine: string;
}

/** Tier 1-9 corresponds to "this is the Nth Guardian you've
 *  fought." So tier = coresRecovered.length + 1. Capped at 9. */
export type GuardianTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export function tierForKills(coresRecovered: number): GuardianTier {
  const t = Math.min(9, Math.max(1, coresRecovered + 1));
  return t as GuardianTier;
}

/** Per-tier multipliers + ability descriptors. Stays gentle on
 *  Tier 1 so a player who never trained can still beat it; the
 *  curve ramps steadily through T5, then plateaus on raw stats
 *  while layering trait variety so T6-T9 stay challenging
 *  without becoming "ridiculously hard" (per design brief). */
interface TierProfile {
  hpMult: number;
  /** Added ON TOP of the existing boss AC bonus (+6 from
   *  combatRules). So a T9 Guardian at AC base 16 → 16 + 6 + 5 = 27. */
  acBonus: number;
  /** Damage die replacement when the base is "1d8" etc. */
  damage: string;
  /** Number of counter-attacks per round. The engine already
   *  gives bosses 2 counters; T1/T2 stay at 2, T3+ get extra
   *  traits that act like a third hit. */
  counters: number;
  /** Extra traits layered on top of the Guardian's signature
   *  trait — applied to scale-up the fight per tier. */
  extraTraits: string[];
}

// OTA-448 — [playability] the FIRST Guardian should be a straightforward (not
// easy) win for a player who arrives kitted — decent gear, a dog, and a golem —
// then ramp steadily so each later Guardian is harder than the last. Pre-OTA the
// AC curve started at +0 (AC 17 with the boss +6), which a freshly-arrived
// player can only hit ~45% of the time; the fight was a Rare-difficulty wall at
// the very first gate. The AC bonus is now re-smoothed DOWN for the early tiers
// (T1 −3 → AC 14, monotonic +1/tier) while T7–T9 keep their original hardness
// (+3/+4/+5). HP, damage, and the trait layering are unchanged, so the fight
// still has teeth and the late-game stays demanding.
const TIER_PROFILES: Record<GuardianTier, TierProfile> = {
  1: { hpMult: 1.4, acBonus: -3, damage: '1d8+3',  counters: 2, extraTraits: [] },
  2: { hpMult: 1.6, acBonus: -2, damage: '1d8+4',  counters: 2, extraTraits: ['armored'] },
  3: { hpMult: 1.8, acBonus: -1, damage: '1d10+4', counters: 2, extraTraits: ['armored', 'quick'] },
  4: { hpMult: 2.0, acBonus: 0,  damage: '1d10+4', counters: 2, extraTraits: ['armored', 'quick'] },
  5: { hpMult: 2.2, acBonus: 1,  damage: '1d10+5', counters: 2, extraTraits: ['armored', 'quick', 'regenerate'] },
  6: { hpMult: 2.4, acBonus: 2,  damage: '1d10+5', counters: 2, extraTraits: ['armored', 'quick', 'regenerate'] },
  7: { hpMult: 2.7, acBonus: 3,  damage: '2d6+4',  counters: 2, extraTraits: ['armored', 'quick', 'regenerate', 'bleeder'] },
  8: { hpMult: 2.9, acBonus: 4,  damage: '2d6+5',  counters: 2, extraTraits: ['armored', 'quick', 'regenerate', 'bleeder'] },
  9: { hpMult: 3.1, acBonus: 5,  damage: '2d6+5',  counters: 2, extraTraits: ['armored', 'quick', 'regenerate', 'bleeder', 'ambush_strike'] },
};

// OTA-815 — PLAYER-POWER SCALING. The kill-count tier sets the AUTHORED floor for
// each Guardian, but difficulty was keyed to that alone: a player who over-levels on
// side content (deep stats + a big HP pool) walked through the early Guardians
// because the fight was tuned for a fresh arrival no matter how strong they actually
// were (player: "I mashed out 2 Guardians and I'm at end-game level, all I did were
// side quests"). We layer an over-level factor ON TOP of the tier profile that only
// ADDS difficulty above the tier's expected power — never below, so a kitted fresh
// arrival still meets the authored Tier 1 (the OTA-448 promise holds). It lifts HP
// (the Guardian doesn't melt), AC and attack (an over-geared player neither
// auto-hits nor is untouchable — the same "the enemy's hit chance tracks the player
// and never floors at zero" the OTA-815 dodge fix enforces on the defensive side).
//
// Power proxy is deliberately BASE stats + HP pool (no gear) — an over-leveled
// character reads high on both; a fresh arrival reads low even in good gear. (A gear
// term could sharpen it later; base is dependency-light and deterministic for tests.)

/** A single "how strong is this character" score: best offensive stat + a slice of
 *  the HP pool (leveling and CON both read as power). Fresh arrival ≈ 11-14,
 *  fully-built end-game ≈ 33-37. */
export function guardianPlayerPower(player: PlayerCharacter): number {
  const s = player.stats;
  const bestCombat = Math.max(s.strength, s.dexterity, s.intelligence);
  return bestCombat + player.hpMax / 10;
}

/** Over-level multiplier for a Guardian at `tier`. 1.0 when the player is at/under
 *  the tier's expected power (authored fight stands); climbs above 1 for an
 *  over-leveled player, capped at 1.9 so it never becomes a "ridiculously hard"
 *  wall. Expected power runs ~17 at T1 to ~41 at T9. */
export function guardianOverLevel(player: PlayerCharacter, tier: GuardianTier): number {
  const expected = 14 + tier * 3;
  return Math.min(1.9, Math.max(1, guardianPlayerPower(player) / expected));
}

/** Returns the live-fight Enemy for the Guardian at this Capital,
 *  scaled to the player's current kill count AND actual power. Returns
 *  null when the locationId is not a Lost Capital. */
export function spawnGuardianForCapital(
  player: PlayerCharacter,
  capitalId: string,
): Enemy | null {
  if (!LOST_CAPITAL_LOCATIONS.includes(capitalId)) return null;
  const def = GUARDIANS_BY_CAPITAL[capitalId];
  if (!def) return null;
  const coresCount = player.mainQuest?.coresRecovered.length ?? 0;
  const tier = tierForKills(coresCount);
  const profile = TIER_PROFILES[tier];
  // HP scales with the tier profile AND the player's real power, so an over-leveled
  // player can't two-round an early Guardian.
  const over = guardianOverLevel(player, tier);
  const hp = Math.round(def.base.hp * profile.hpMult * over);
  // Bump the abilityPoint number — engine's enemyAC() derives base
  // AC from `5 + apNum`, so increasing the AP by the tier's
  // acBonus (+ the player-power bonus) pipes the scaling through the
  // standard combatRules formula for BOTH the Guardian's AC and its
  // attack bonus. Format stays the canonical "Stat N" string.
  const apStr = String(def.base.abilityPoint);
  const apMatch = apStr.match(/^(\w+)\s+(\d+)/);
  const statName = apMatch ? apMatch[1] : 'Strength';
  const apNum = apMatch ? parseInt(apMatch[2]!, 10) : 6;
  // +0 at/under the tier curve, up to +7 for a heavily over-leveled player.
  const powerBonus = Math.round((over - 1) * 8);
  const scaledAp = `${statName} ${apNum + profile.acBonus + powerBonus}`;
  // Merge traits: signature + tier extras. Deduped.
  const traits = Array.from(new Set([
    CORE_GUARDIAN_TRAIT,
    `tier:${tier}`,
    ...(def.base.traits ?? []),
    ...profile.extraTraits,
  ]));
  return {
    ...def.base,
    hp,
    abilityPoint: scaledAp,
    damage: profile.damage,
    traits,
    boss: true,
    // Loot fields stay empty; resolveEnemyDefeat dispenses the
    // signature gear directly so we control the per-Guardian
    // pieces deterministically.
    loot: [],
  };
}

/** Detect whether an arbitrary enemy is a Core Guardian. */
export function isCoreGuardian(enemy: Enemy | null | undefined): boolean {
  if (!enemy) return false;
  return (enemy.traits ?? []).includes(CORE_GUARDIAN_TRAIT);
}

/** Which Capital does this Guardian belong to? Returns null when
 *  the enemy is not a Core Guardian or the name doesn't resolve.
 *  Used so resolveEnemyDefeat / flee handlers can route to the
 *  right Capital's Core grant + gear drop. */
export function capitalIdFromGuardian(enemy: Enemy): string | null {
  if (!isCoreGuardian(enemy)) return null;
  for (const [capitalId, def] of Object.entries(GUARDIANS_BY_CAPITAL)) {
    if (def.base.name === enemy.name) return capitalId;
  }
  return null;
}

/** The pair of unique items a Guardian drops on defeat (in
 *  addition to the Core and the Res Gem). Each Capital has its
 *  own hand-authored weapon + armor — collecting all 10 gives
 *  the player the full Core Guardian set. */
export interface GuardianDrop {
  weapon: InventoryItem;
  armor: InventoryItem;
}

/** Helper — clones the catalog row so every defeat gets a fresh
 *  durability stamp + unique inventory id. */
function freshDrop(template: InventoryItem): InventoryItem {
  return {
    ...template,
    id: `${template.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    quantity: 1,
    durability: template.durability
      ? { current: template.durability.max, max: template.durability.max }
      : undefined,
  };
}

export function dropsForCapital(capitalId: string): GuardianDrop | null {
  const set = GUARDIAN_GEAR_BY_CAPITAL[capitalId];
  if (!set) return null;
  return { weapon: freshDrop(set.weapon), armor: freshDrop(set.armor) };
}

// ----- Guardian definitions ----------------------------------------------
//
// OTA-798 — every Guardian carries an authored `vulnerable:<type>` +
// `resist:<type>` trait so the weakness/resistance system engages in combat AND
// the EnemyPanel surfaces their defenses. Previously the Guardians' snake_case
// `type` (aether_construct / mud_revenant) wasn't in crafting.ts TYPE_RESISTANCE_MAP
// and their signature traits weren't resist:/vulnerable: tags, so every hit read
// as 'normal' — no "Weakness exposed" line ever fired (players asked why). Each
// weakness is thematic (crack the plate → bludgeoning, dry the silt → burn, water
// conducts → electrical, cut the seal → slashing, …); the aether-born broadly
// resist aetheric. Traits flow through spawnGuardianForCapital's trait merge.

/** Asgardar — Sentinel-Priest Vaelka, the sky-priest of the
 *  Asgardar spire. Living plate, silver-veined; first Guardian
 *  most players meet because Asgardar is the most-walked capital. */
const VAELKA: CoreGuardianDef = {
  capitalId: 'asgardar',
  capitalName: 'Asgardar',
  base: {
    name: 'Sentinel-Priest Vaelka',
    type: 'aether_construct',
    abilityPoint: 'Strength 6',
    attack: 'Halberd Sweep',
    damage: '1d8+3',
    hp: 30,
    rarity: 'Legendary',
    loot: [],
    aliases: ['vaelka', 'sentinel', 'priest', 'guardian', 'sentinel-priest'],
    traits: ['aether_pulse', 'vulnerable:bludgeoning', 'resist:aetheric'],
    boss: true,
  },
  approachLine:
    'The chamber breathes inward. Silver veins crawl up the Core\'s housing and fold themselves into a man-shape — armor and bone and Aether stitched together. "You have come for what is not yours," says Sentinel-Priest Vaelka, his voice the sound of a struck bell. "The Order does not bargain. Step away, or be unmade."',
  rebukeLine:
    'Vaelka watches you go without moving. "Walk, then. But carry this with you: what you tried is sacrilege against the Aether-born. The Order does not forget. Return, and the only mercy I will offer is a clean death." The Core\'s glow steadies. Whatever ground you took back here is yours to keep — but Vaelka himself is whole again, the way only the faithful can be whole.',
  defeatLine:
    'Vaelka kneels, plate hissing as Aether bleeds from the seams. "You... do not understand what you have done." The Core\'s housing splits along an old seam. The light inside steps free into your hand.',
};

/** Samarran — Heir Atalan-Drowned, who held Samarran's seat when
 *  the Mud Flood took the capital. Drowned in the silt-wave and
 *  bound to the Core by the Order's last rites. */
const ATALAN: CoreGuardianDef = {
  capitalId: 'samarran',
  capitalName: 'Samarran',
  base: {
    name: 'Heir Atalan-Drowned',
    type: 'mud_revenant',
    abilityPoint: 'Constitution 7',
    attack: 'Trident Thrust',
    damage: '1d8+4',
    hp: 35,
    rarity: 'Legendary',
    loot: [],
    aliases: ['atalan', 'heir', 'drowned', 'guardian', 'atalan-drowned'],
    traits: ['silt_grip', 'vulnerable:burn', 'resist:piercing'],
    boss: true,
  },
  approachLine:
    'Mud rises around the Core in a column and settles into a man. Or what was a man — bloated, silt-blackened, robes still half-dissolved from the Flood that took him. "I held this seat before the silt came," Heir Atalan-Drowned says, water pooling at his feet. "I hold it still. Withdraw, defiler, or join me in the wet."',
  rebukeLine:
    'Atalan does not pursue. "Run. Tell your god you tried to take what the Aether gave. Tell them the silt remembers." The mud retreats into the Core\'s seat. Whatever silt has stained your boots, whatever weight is on your pack — it stays with you. Atalan, however, is whole as the Flood made him.',
  defeatLine:
    'Atalan kneels in his own outflow, the silt slipping out of him faster than he can hold it. "Samarran... forgive me." The Core slides out of the seat in a wet rush. It is warm in your hand.',
};

/** Nimari — Brother Konrad of the Iron Litany cell at Nimari. A
 *  martial order within the Aether-Born; chants while he swings. */
const KONRAD: CoreGuardianDef = {
  capitalId: 'nimari',
  capitalName: 'Nimari',
  base: {
    name: 'Iron Litany Brother Konrad',
    type: 'aether_construct',
    abilityPoint: 'Strength 8',
    attack: 'Litany Hammer-Down',
    damage: '1d10+4',
    hp: 40,
    rarity: 'Legendary',
    loot: [],
    aliases: ['konrad', 'brother', 'litany', 'guardian', 'brother-konrad'],
    traits: ['litany_chant', 'vulnerable:electrical', 'resist:slashing'],
    boss: true,
  },
  approachLine:
    'A low chant rises out of nowhere — three voices, then six, then one. The Core\'s housing opens and Brother Konrad steps from it in full plate, hammer in both hands, the Iron Litany on his tongue. "Aether-born, defend this seat. Aether-born, end this hand." He fixes you. "End it, brother, before we end you."',
  rebukeLine:
    'Konrad lowers the maul but does not stop the chant. "Walk. We have buried better men for less. The Litany has your face now — return, and the cell will know you before you see us." The chamber dims; the chant fades into the stone. The hammer\'s dents in your gear stay where they are. Konrad\'s hammer is whole.',
  defeatLine:
    'Konrad slumps against the Core\'s housing, breath rattling out the last line of the Litany. "...Aether... keep... the seat..." The chant goes quiet. The Core comes free in your hand without resistance.',
};

/** Drakova — Mother Drakovna, matriarch of the Drakova housing,
 *  wields a cold-iron rosary that curses what it touches. */
const DRAKOVNA: CoreGuardianDef = {
  capitalId: 'drakova',
  capitalName: 'Drakova',
  base: {
    name: 'Mother Drakovna',
    type: 'aether_construct',
    abilityPoint: 'Wisdom 8',
    attack: 'Rosary Curse',
    damage: '1d10+5',
    hp: 45,
    rarity: 'Legendary',
    loot: [],
    aliases: ['drakovna', 'mother', 'matriarch', 'guardian'],
    traits: ['rosary_curse', 'vulnerable:radiation', 'resist:aetheric'],
    boss: true,
  },
  approachLine:
    'A cold draft moves through the Core chamber and an old woman stands where it passes — black robes, a rosary of cold-iron beads in one hand, the other raised. "Child," says Mother Drakovna, and the word strips the warmth out of you. "Put down what you carry. Walk out. This is the only kindness the Order owes you."',
  rebukeLine:
    'Drakovna lowers the rosary. "Go. And carry the curse you earned today. The Aether-born do not forget a thief\'s face." The cold lifts. Whatever the rosary touched in you, you keep — Drakovna is undamaged, her beads cold and whole.',
  defeatLine:
    'Drakovna folds slowly, robes settling around her like ash. "...the seat is open... may the Aether... forgive you..." The rosary clatters to the stone. The Core lifts free in your hand.',
};

/** Voronov — the High Cantor, oldest Aether-born initiate, the
 *  Order's chief living voice. The hardest fight in the run. */
const CANTOR: CoreGuardianDef = {
  capitalId: 'voronov',
  capitalName: 'Voronov',
  base: {
    name: 'Voronov-Beneath High Cantor',
    type: 'aether_construct',
    abilityPoint: 'Intelligence 9',
    attack: 'Tuning Fork Chord',
    damage: '2d6+5',
    hp: 50,
    rarity: 'Legendary',
    loot: [],
    aliases: ['cantor', 'high cantor', 'voronov cantor', 'guardian', 'voronov-beneath'],
    traits: ['chord_break', 'vulnerable:cold', 'resist:aetheric'],
    boss: true,
  },
  approachLine:
    'A pure tone fills the chamber — one chord, held, the kind of sound that re-arranges the dust in your lungs. The Voronov-Beneath High Cantor steps from the Core\'s housing in robes the colour of old gold, a tuning-fork the length of your forearm in one hand. "The Order has watched five Capitals fall to you," he says, voice both unhurried and very close. "This one does not fall. Stand and prove me wrong, or turn and live another hour."',
  rebukeLine:
    'The Cantor does not raise his voice. "Turn, then. The Order has its answer." The chord drops. Your ears are still ringing as you cross the threshold — and they will keep ringing. The Cantor, in the silence behind you, is unmarked. Whole. Waiting.',
  defeatLine:
    'The chord cracks once and dies. The Cantor settles to one knee, the tuning-fork ringing flat against the stone. "...so. The last seat. The Order... is done." The Core lifts itself out of the housing and into your hand. The silence afterwards is the loudest sound in Tartaria.',
};

/** Karok-Sa — Sealwarden Tobiel, master of the Forgotten Order's
 *  sealing-craft, kept living by the seal-chain bound around his
 *  ribs. Speaks rarely; when he does, the chamber listens. */
const TOBIEL: CoreGuardianDef = {
  capitalId: 'karok_sa',
  capitalName: 'Karok-Sa',
  base: {
    name: 'Sealwarden Tobiel',
    type: 'aether_construct',
    abilityPoint: 'Wisdom 7',
    attack: 'Seal-Chain Whip',
    damage: '1d8+4',
    hp: 36,
    rarity: 'Legendary',
    loot: [],
    aliases: ['tobiel', 'sealwarden', 'warden', 'guardian'],
    traits: ['sealcraft', 'vulnerable:slashing', 'resist:aetheric'],
    boss: true,
  },
  approachLine:
    'The seal-sigils carved around the Karok-Sa housing flare once and go still. A man-shape walks out of them — robes the colour of dried ink, a chain of binding-rings wrapped around his ribs in place of bone. "I sealed this seat with my own hand," says Sealwarden Tobiel, and the sigils on the walls answer him in a low harmonic. "You will not unseal it with yours."',
  rebukeLine:
    'Tobiel does not move. The sigils dim. "Walk. The seal-chain on my ribs has your name in it now — a soft mark, not yet bound. Cross this threshold again and the binding completes. The Order will see you wherever you stand." Whatever the seal-chain caught of you, you keep. Tobiel\'s chain is intact.',
  defeatLine:
    'Tobiel goes to one knee, the seal-chain unwinding from his ribs in a slow spiral. "...the seat is open... may the Forgotten remember kindly..." The Core lifts free as the last sigil dies on the wall.',
};

/** Yuldra-Tul — Hierophant Mara-of-Yuldra, last high priest of
 *  the Servants of Giants, sat the tomb-vigil for sixty years
 *  before the Mud Flood. Cold as the mountain that birthed her. */
const MARA_HIEROPHANT: CoreGuardianDef = {
  capitalId: 'yuldra_tul',
  capitalName: 'Yuldra-Tul',
  base: {
    name: 'Hierophant Mara-of-Yuldra',
    type: 'aether_construct',
    abilityPoint: 'Wisdom 8',
    attack: 'Frost Staff Strike',
    damage: '1d10+4',
    hp: 42,
    rarity: 'Legendary',
    loot: [],
    aliases: ['mara', 'hierophant', 'yuldra', 'guardian', 'mara-of-yuldra'],
    traits: ['giant_vigil', 'vulnerable:burn', 'resist:cold'],
    boss: true,
  },
  approachLine:
    'Frost moves across the Yuldra-Tul housing in a slow ring and a tall woman steps through it — ice-blue robes, hair white from the vigil, eyes the colour of a tomb\'s deep. "Sixty years I sat the watch for the Giant who keeps this Core warm," says Hierophant Mara. "You will give me a sixty-first. Or I will give you a tomb to sit yours in."',
  rebukeLine:
    'Mara watches you go. The frost does not follow. "The mountain remembers a face once. The Order remembers it twice. Do not come back unprepared, Aether-thief — the Giant beneath this seat is older than the Order and slower to forgive." Whatever cold settled in your bones, you carry. Mara is whole, the vigil unbroken.',
  defeatLine:
    'Mara falls slowly, robes folding around her like a snowdrift. "...the Giant will sleep colder... for the seat you have opened..." The frost lifts; the Core comes free in a wreath of vapour that smells of pine and stone.',
};

/** Ostragar — Riverbinder Ostros, the Eternal Dynasty's water-
 *  cantor at Ostragar's drowned palace. Speaks in cadence; the
 *  current obeys him. */
const OSTROS: CoreGuardianDef = {
  capitalId: 'ostragar',
  capitalName: 'Ostragar',
  base: {
    name: 'Riverbinder Ostros',
    type: 'mud_revenant',
    abilityPoint: 'Charisma 8',
    attack: 'River Cadence',
    damage: '1d10+4',
    hp: 44,
    rarity: 'Legendary',
    loot: [],
    aliases: ['ostros', 'riverbinder', 'binder', 'guardian'],
    traits: ['river_bind', 'vulnerable:electrical', 'resist:slashing'],
    boss: true,
  },
  approachLine:
    'The river-current threading the Ostragar housing reverses direction once and a tall man rises from the floodline, wet to the chest, beard braided with silt. "I bound this river to the Core when the Dynasty still had a king to call me by name," says Riverbinder Ostros, voice in a slow river-cadence. "You will not unbind it. Walk back, or I will fold the current closed around your knees."',
  rebukeLine:
    'Ostros lowers the cadence. "Go, then. The river marks what it has touched. You will find slow water in your wake from now on, and you will know it was today." The current settles. Whatever soaked through your boots, you take with you. The river is whole. Ostros is whole.',
  defeatLine:
    'Ostros goes down in a long sigh, the river-cadence breaking into white-water for a heartbeat before it stills. "...the king\'s name... was Ostragar..." The Core lifts free in a column of clear water that does not fall.',
};

/** Iskan-Veil — Veilkeeper Inarra, the Conspiracy Architects'
 *  first scout-priest, kept living by the false-door labyrinth
 *  she walks behind. The hardest to FIND, not the hardest to
 *  beat. */
const INARRA: CoreGuardianDef = {
  capitalId: 'iskan_veil',
  capitalName: 'Iskan-Veil',
  base: {
    name: 'Veilkeeper Inarra',
    type: 'aether_construct',
    abilityPoint: 'Dexterity 9',
    attack: 'Veil-Step Cuts',
    damage: '1d10+5',
    rarity: 'Legendary',
    hp: 46,
    loot: [],
    aliases: ['inarra', 'veilkeeper', 'keeper', 'guardian'],
    traits: ['veil_step', 'vulnerable:radiation', 'resist:piercing'],
    boss: true,
  },
  approachLine:
    'A door that was not in the Iskan-Veil housing yesterday opens, and a woman in grey leather steps through. The door closes behind her and is gone. "I have watched you walk every false door in this Capital and pick the wrong one twice," says Veilkeeper Inarra, almost amused. "You found this seat anyway. The Order respects that. The Order will still kill you for it."',
  rebukeLine:
    'Inarra does not chase. She does not need to. "Run, Aether-thief. The Veil knows you now. Every door between here and the next Capital will think twice about opening for you." The corridor behind you flickers. Whatever you lost finding this seat, you do not get back. Inarra\'s blades are unscored.',
  defeatLine:
    'Inarra slides down the wall, grey leather darkening at the ribs. "...the Veil... will open one more time... for what you have earned..." The Core slips out of the false housing — the real seat was behind her all along — and lands in your palm.',
};

export const GUARDIANS_BY_CAPITAL: Record<string, CoreGuardianDef> = {
  asgardar: VAELKA,
  samarran: ATALAN,
  nimari: KONRAD,
  drakova: DRAKOVNA,
  voronov: CANTOR,
  karok_sa: TOBIEL,
  yuldra_tul: MARA_HIEROPHANT,
  ostragar: OSTROS,
  iskan_veil: INARRA,
};

// ----- Signature gear ----------------------------------------------------
//
// Five weapons + five armors, each tied to a Capital. Designed as
// a coherent set: collecting the matched pair from a Capital gives
// no formal bonus, but the player can build a full Core Guardian
// loadout by the end of the run. Stats are mildly above-curve at
// the player's expected level for each tier — better than a
// Legendary roll but not so good that the player skips other gear.

// OTA-828 — derive a Guardian weapon's damage TYPE + scaling stat from its flavor
// tags. Pre-fix the weapon() helper stored NONE of this (the `damage` param was
// dropped on the floor), and Guardian gear carries no catalog row + no uniqueStats,
// so getEquippedWeapon/aggregateArmor couldn't resolve it — every Core Guardian
// reward (9 weapons + 9 armor) was cosmetic-only and "couldn't be used as a weapon".
const GUARDIAN_WEAPON_TYPE_TAGS: ReadonlyArray<readonly [string, string]> = [
  ['cold_damage', 'cold'], ['corruption_damage', 'aetheric'], ['sonic', 'aetheric'],
  ['slashing', 'slashing'], ['piercing', 'piercing'], ['blunt', 'bludgeoning'],
  ['burn', 'burn'], ['electrical', 'electrical'], ['poison', 'poison'],
  ['radiation', 'radiation'], ['aetheric', 'aetheric'],
];
function guardianWeaponDamageType(tags: string[]): string {
  const lower = tags.map((t) => t.toLowerCase());
  for (const [tag, dt] of GUARDIAN_WEAPON_TYPE_TAGS) if (lower.includes(tag)) return dt;
  return 'bludgeoning';
}
function guardianWeaponStat(tags: string[]): 'strength' | 'dexterity' | 'intelligence' {
  const lower = tags.map((t) => t.toLowerCase());
  if (lower.includes('finesse')) return 'dexterity';
  // The exotic/caster Guardian arms (Cold-Iron Rosary, Tuning Fork) channel rather
  // than swing — they scale INT.
  if (lower.includes('corruption_damage') || lower.includes('sonic')) return 'intelligence';
  return 'strength';
}
function guardianArmorSlot(tags: string[]): 'head' | 'chest' | 'legs' | 'feet' {
  const lower = tags.map((t) => t.toLowerCase());
  for (const s of ['head', 'chest', 'legs', 'feet'] as const) if (lower.includes(s)) return s;
  return 'chest';
}
function guardianArmorResist(tags: string[]): string | undefined {
  const lower = tags.map((t) => t.toLowerCase());
  if (lower.includes('cold_resist')) return 'cold';
  if (lower.includes('aether_resist')) return 'aetheric';
  if (lower.includes('corruption_resist')) return 'aetheric';
  if (lower.includes('burn_resist')) return 'burn';
  if (lower.includes('poison_resist')) return 'poison';
  return undefined;
}

function weapon(
  id: string,
  name: string,
  description: string,
  damage: string,
  durabilityMax: number,
  tags: string[],
): InventoryItem {
  // OTA-828 — attach uniqueStats so getEquippedWeapon (combatRules) resolves this
  // non-catalog Legendary as a real weapon: the `damage` dice + a tag-derived type
  // and scaling stat now actually reach combat.
  return {
    id,
    name,
    kind: 'weapon',
    rarity: 'Legendary',
    description,
    quantity: 1,
    tags: ['core_guardian_set', 'aether_born', ...tags],
    durability: { current: durabilityMax, max: durabilityMax },
    uniqueStats: {
      kind: 'weapon',
      rarity: 'Legendary',
      durability: { current: durabilityMax, max: durabilityMax },
      damageDice: damage,
      damageType: guardianWeaponDamageType(tags),
      scalesWith: guardianWeaponStat(tags),
    },
  };
}

function armor(
  id: string,
  name: string,
  description: string,
  ac: number,
  durabilityMax: number,
  tags: string[],
): InventoryItem {
  // OTA-828 — attach uniqueStats so aggregateArmor credits this non-catalog
  // Legendary its AC + resistance (pre-fix it gave 0 AC — the `ac:N` tag was never
  // read by the armor aggregator).
  return {
    id,
    name,
    kind: 'armor',
    rarity: 'Legendary',
    description: `${description} (AC +${ac})`,
    quantity: 1,
    tags: ['core_guardian_set', 'aether_born', `ac:${ac}`, ...tags],
    durability: { current: durabilityMax, max: durabilityMax },
    uniqueStats: {
      kind: 'armor',
      rarity: 'Legendary',
      durability: { current: durabilityMax, max: durabilityMax },
      acBonus: ac,
      armorSlot: guardianArmorSlot(tags),
      resistance: guardianArmorResist(tags),
    },
  };
}

export const GUARDIAN_GEAR_BY_CAPITAL: Record<string, GuardianDrop> = {
  asgardar: {
    weapon: weapon(
      'cg_weapon_vaelka_halberd',
      "Vaelka's Halberd",
      'Long silver-veined haft, Aether-bright crescent head. Slashing reach — opens bleed wounds that close slow.',
      '1d10+2',
      60,
      ['slashing', 'reach', 'bleed_chance'],
    ),
    armor: armor(
      'cg_armor_sentinel_plate',
      'Sentinel Plate',
      "Sky-priest's plate, silver veins still warm against the chest. Heavy, but the Aether in the seams takes some weight off the shoulders.",
      4,
      90,
      ['chest', 'heavy', 'aether_resist'],
    ),
  },
  samarran: {
    weapon: weapon(
      'cg_weapon_atalan_trident',
      "Atalan's Trident",
      'Drowned-iron trident, three tines hooked. Pierces deep; the silt-touched edge slows what it cuts.',
      '1d10+2',
      55,
      ['piercing', 'reach', 'slow_chance'],
    ),
    armor: armor(
      'cg_armor_drowned_mantle',
      'Drowned Mantle',
      "Heir's mantle, woven of silt-stained cord and a single sheet of mud-glass. Light. Shrugs water and wet-air corruption.",
      3,
      70,
      ['chest', 'light', 'water_resist', 'corruption_resist'],
    ),
  },
  nimari: {
    weapon: weapon(
      'cg_weapon_litany_maul',
      'Litany Maul',
      'Two-handed maul, head etched with the Iron Litany. Crushes; stagger on solid hits.',
      '1d12+2',
      75,
      ['blunt', 'two_handed', 'stagger_chance'],
    ),
    armor: armor(
      'cg_armor_litany_greaves',
      'Litany Greaves',
      "Brother Konrad's plate greaves, the Litany cut into the steel down the shins. Heavy below the knee — the wearer does not move fast, but does not fall easily either.",
      3,
      85,
      ['legs', 'heavy'],
    ),
  },
  drakova: {
    weapon: weapon(
      'cg_weapon_rosary',
      'Cold-Iron Rosary',
      "Mother Drakovna's rosary. Each bead a curse the wearer can spend — touches what it strikes with a chill that bleeds Aether out of the wound.",
      '1d8+3',
      45,
      ['exotic', 'corruption_damage', 'aether_drain'],
    ),
    armor: armor(
      'cg_armor_matriarch_aegis',
      "Matriarch's Aegis",
      "Drakovna's headpiece, black-iron circlet with a single chip of unbroken Core in the brow. Steadies the will against fear and Aether-touch.",
      2,
      60,
      ['head', 'will_save', 'aether_resist'],
    ),
  },
  voronov: {
    weapon: weapon(
      'cg_weapon_tuning_fork',
      "Cantor's Tuning Fork",
      "Forearm-long, gold-cast. Strikes a chord on impact that rings through armor instead of off it. Sonic damage type — ignores most physical resists.",
      '2d6+2',
      50,
      ['exotic', 'sonic', 'armor_ignore_partial'],
    ),
    armor: armor(
      'cg_armor_cantor_robe',
      "Cantor's Robe",
      "Old-gold cloth woven with Aether-thread. Light as silk, hard as scale where it counts. The Order's highest robe.",
      4,
      55,
      ['chest', 'light', 'aether_resist', 'sonic_resist'],
    ),
  },
  karok_sa: {
    weapon: weapon(
      'cg_weapon_seal_chain',
      'Sealwarden Chain',
      "Tobiel's binding-chain, ring-by-ring etched with Forgotten Order seals. A whip-flail with reach; seals bind what it strikes for a moment.",
      '1d8+3',
      60,
      ['exotic', 'reach', 'bind_chance'],
    ),
    armor: armor(
      'cg_armor_sealwarden_vest',
      'Sealwarden Vest',
      "Ink-dyed cuirass lined with binding-cord. Light enough to move in; the cords drink Aether-touch where they cross the chest.",
      3,
      70,
      ['chest', 'light', 'aether_resist'],
    ),
  },
  yuldra_tul: {
    weapon: weapon(
      'cg_weapon_giant_staff',
      "Hierophant's Staff",
      "Mara's two-handed staff, head crowned with a Giant-tomb cold-stone. Strikes carry a frost bite that slows fast attackers.",
      '1d10+3',
      65,
      ['blunt', 'two_handed', 'slow_chance', 'cold_damage'],
    ),
    armor: armor(
      'cg_armor_vigil_mantle',
      'Vigil Mantle',
      "White-fur mantle of the Yuldra vigil. Heavy across the shoulders, warm against any cold that isn't Aether-born.",
      3,
      80,
      ['chest', 'heavy', 'cold_resist'],
    ),
  },
  ostragar: {
    weapon: weapon(
      'cg_weapon_river_glaive',
      'Riverbinder Glaive',
      "Ostragar-iron glaive, edge etched with current-runes. Cuts wet; on a clean hit the wound does not close fast.",
      '1d10+3',
      60,
      ['slashing', 'reach', 'bleed_chance', 'water_imbued'],
    ),
    armor: armor(
      'cg_armor_tidebound_brigandine',
      'Tide-Bound Brigandine',
      "Brigandine of river-bound leather plates. Light, supple, the plates hum slightly when the wearer moves — current-memory keeps them from settling.",
      3,
      75,
      ['chest', 'light', 'water_resist', 'corruption_resist'],
    ),
  },
  iskan_veil: {
    weapon: weapon(
      'cg_weapon_veil_blades',
      'Veilkeeper Blades',
      "Inarra's paired short-blades. Off-hand pair; the matched grip turns dodge-counters into a guaranteed second cut.",
      '1d8+3',
      55,
      ['piercing', 'paired', 'parry_bonus', 'finesse'],
    ),
    armor: armor(
      'cg_armor_grey_leather',
      'Grey Leather of Iskan-Veil',
      "Lacquered grey leather, false-door pattern stitched between the layers. Light, silent, takes a hit better than it has any right to.",
      3,
      65,
      ['chest', 'light', 'stealth_bonus'],
    ),
  },
};

// ----- Faction-flavored Order rebuke -------------------------------------
//
// When the player flees a Guardian fight, the Order's view of
// what the player just attempted varies slightly by faction. The
// core rebuke from the Guardian above stays the same; this is an
// additional line giving the player's *own* faction's spin.

const FACTION_FLEE_AFTERMATH: Record<string, string> = {
  reclaimers_guild:
    'The Reclaimers in your head whisper that fleeing was sense — the Cores were meant to be lifted carefully, by hands that knew the housing. You will return; you will be those hands.',
  forgotten_order:
    'You feel the Forgotten Order watching from the silence. They do not approve of the retreat. They expect the Core in your hand the next time you walk this chamber.',
  mud_monarchs:
    'The Monarchs in their high seats would not have called this a defeat. They would have called it a strategic withdrawal. You decide to call it the same thing.',
  true_tartarians:
    'Something in the True Tartarian thread of you flinches — fleeing felt like turning your back on the buried world. You will not turn your back the next time.',
  eternal_dynasty:
    'The Dynasty in your bones is patient. Patience is the long answer. You will speak to the keepers again, and you will not stop this time.',
  conspiracy_architects:
    'The Architect part of you is already mapping the next approach — quieter, blinder, faster. Vaelka will not see you the way he saw you today.',
  servants_of_giants:
    'The Servants in your heart sit the watch as you walk out. The Giant\'s tomb-mark you missed today will keep. The vigil is long; the Order\'s is longer; you will outlast both.',
  stone_builders:
    'The Builder in your hands is already shaping the next attempt — the housing, the seat, the seam. You will Aethercraft the Core free the next time. You will.',
  tartarian_revivalists:
    'The Revivalist in you records the retreat the same way it would record any other beat — clean, honest, without judgment. The cell\'s archive has the page. The next one will have the Core.',
};

export function fleeAftermathLine(factionId: string): string | null {
  return FACTION_FLEE_AFTERMATH[factionId] ?? null;
}

// ----- Utility ----------------------------------------------------------

/** True when the player has a Guardian to fight at this Capital
 *  (i.e. they're at a Lost Capital they haven't yet cleared). */
export function hasUndefeatedGuardian(player: PlayerCharacter, capitalId: string): boolean {
  if (!LOST_CAPITAL_LOCATIONS.includes(capitalId)) return false;
  const mq = player.mainQuest;
  if (!mq) return true;
  // coresRecovered acts as the source of truth — if the Core is
  // in inventory, the Guardian was beaten. (Saves predating the
  // Guardian system get a "free" Core on their existing Capital;
  // any uncleared Capital still triggers the Guardian.)
  return !mq.coresRecovered.includes(capitalId);
}

/** Lightweight ref for tests + tooling. Always 5 in production. */
export function totalGuardiansCount(): number {
  return Object.keys(GUARDIANS_BY_CAPITAL).length;
}

// Re-export the player + stats types so consumers of this module
// don't need to also import from types.ts when wiring helpers.
export type { PlayerCharacter, Stats };
