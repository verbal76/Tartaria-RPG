// P4 — PlayerView: a pure function of ONLY information a real player could
// see, or legitimately derive from what's on screen, at a given moment.
//
// This module IS the firewall boundary. policy.ts may import ONLY this
// file's exported types/functions — never the game store, telemetry, the
// raw RNG ledger, or any hidden-source table. Nothing here reaches into
// gameStore.ts beyond the plain `player` / `currentScene` / `worldMemory`
// snapshot the caller hands in; buildPlayerView() never calls a store
// action and never mutates its input.
//
// Every field is traced to a concrete production render site (Phase 3
// research pass, golem-line @ f25aee76):
//   - StatsPanel.tsx / CharacterScreen.tsx  -> player's own sheet
//   - ExplorationScreen.tsx                 -> weather, D{n} threat word
//   - EnemyPanel.tsx                        -> enemy power/AC/HP/traits
//   - VendorScreen.tsx (via vendorPricing)  -> final displayed prices
//
// Deliberately EXCLUDED even though reachable on the store (see research
// report for the exact trace proving each is hidden/internal-only):
//   - next RNG value / drawSeq / raw RNG ledger
//   - guardianPlayerPower / guardianOverLevel / monotoneTierHp / the
//     GuardianTier number itself (spawn-time scaling machinery)
//   - enemy.stageKey / .unscripted / .eliteReplaced / .factionNeutralFight
//   - raw per-NPC-vendor `regard` scores (npcMemory.ts) — only the Arbiter's
//     own regard is ever shown as a number, via arbiterSheetLines()
//   - mapX/mapY (re-centered DISPLAY coords) as the canonical position —
//     gridX/gridY is the real, player-legible absolute position
//   - the hidden title id 'skyreacher' before its lore is discovered
//   - getItemPreview() (its Qwen-fallback path can mutate store state) —
//     item display goes through findCatalogItem() + the item's own stored
//     card fields instead
//   - threatWord's internal .ratio/.party/.reference (computation detail
//     feeding the visible word, never separately rendered as numbers)
//   - raw vendorPricing BuyPriceParts multipliers (regardMult/tideMult/
//     pressureTideMult) — only the already-computed final price is used

import type { PlayerCharacter, Enemy, WorldMemory, InventoryItem, CombatRange } from '../../app/engine/types';
import type { CurrentScene } from '../../app/state/gameStore';
import { playerPowerScore, enemyPowerScore, powerMatchup, type PowerMatchup } from '../../app/engine/powerRating';
import { threatReadout, participationFromScene, type ThreatWord } from '../../app/engine/threatWord';
import { arbiterSheetLines } from '../../app/engine/arbiterPersona';
import { ARBITER_TITLES } from '../../app/engine/canonFacts';
import { TITLE_PASSIVE_PERK, isHiddenTitle } from '../../app/engine/titles';
import { portraitTraitChips } from '../../app/engine/enemyTraits';
import { enemyAC } from '../../app/engine/combatRules';
import { enemyDamageType } from '../../app/engine/damageTypes';
import { greatClimbLoreDiscovered } from '../../app/engine/greatClimbs';
import { findCatalogItem, itemIsShield } from '../../app/engine/crafting';
// Phase 11 — the SAME resolvers the attack-reach gate (gameStore.ts
// case 'attack':) and the real EnemyPanel (ExplorationScreen.tsx
// enemyViews, OTA-1006/1502/1506) use. Not a re-derivation — the exact
// per-enemy band and per-hand reach a real player already sees as the
// range chip and the reach-color glow on the enemy card.
import { enemyBandOf, playerWeaponReach } from '../../app/state/combatResolution';
import { RANGE_LABELS } from '../../app/engine/types';

export interface PlayerViewItem {
  instanceId: string;
  name: string;
  kind: InventoryItem['kind'];
  rarity?: InventoryItem['rarity'];
  quantity: number;
  tags: string[];
  durability?: InventoryItem['durability'];
  /** Player-visible catalog card text (findCatalogItem — never getItemPreview). */
  card: { kind: string; rarity?: string; tags: string[]; baseDurability?: number } | null;
}

export interface PlayerViewEnemy {
  name: string;
  type: string;
  rarity?: string;
  currentHp: number;
  hpMax: number;
  ac: number;
  power: number;
  matchup: PowerMatchup;
  dealsType: string;
  /** Same filter EnemyCard applies — resist:/vulnerable:/profiled dropped,
   *  inured: only if the player has proven it. core_guardian/tier:N strings
   *  are NOT filtered by production's own portraitTraitChips (a known
   *  leak, per research) and are left as-is here to match what a real
   *  player actually sees on screen, not what the UI ought to show. */
  traits: string[];
  /** Phase 11 — this enemy's current range band, exactly as ExplorationScreen's
   *  EnemyPanel labels it ('out of range' when past ring 4 — present, closing,
   *  unable to act or be acted on). PLAYER_DERIVABLE: this is the range chip
   *  already on screen, not a new fact. */
  rangeLabel: string;
  /** Phase 11 — whether the player's currently equipped MAIN-hand attack can
   *  legally reach this enemy's current band right now, per the exact same
   *  resolver (playerWeaponReach) the production attack-reach gate rolls
   *  with (gameStore.ts case 'attack', OTA-954/1006). This is the reach-color
   *  glow on the enemy card, not a new computation — and only 'main' is
   *  exposed because that's the hand a plain "attack" resolves against; an
   *  explicit off-hand swing is a distinct, less common production door this
   *  view does not need to predict. */
  mainHandReach: { label: string; inRange: boolean };
}

export interface PlayerViewTitle {
  id: string;
  earned: boolean;
  title: string;
  requirement: string;
  perk: string;
}

export interface PlayerView {
  hp: number;
  hpMax: number;
  /** Phase 7 — the settled change in HP since the caller's last observation
   *  (null on the first observation). PLAYER_DERIVABLE: any player watching
   *  their own HP bar across a round sees this; it is NOT re-derived from
   *  telemetry — the caller (the walker/driver) supplies its own prior HP,
   *  and this function does nothing but subtract. Lets the policy react to
   *  "I just lost 17 HP in one round" rather than only a static ratio. */
  hpDelta: number | null;
  stamina: number;
  staminaMax: number;
  /** Same PLAYER_DERIVABLE pattern as hpDelta. */
  staminaDelta: number | null;
  /** Phase 7 — whether BLOCK is a real constructible action right now: a
   *  player-visible fact (a shield sits in the off-hand slot, or it
   *  doesn't) traced to the same gate production's own `case 'block':`
   *  enforces (gameStore.ts:18339-18354, itemIsShield on player.equipped.off).
   *  Never invents the option; only reports whether production would honor it. */
  canBlock: boolean;
  stats: PlayerCharacter['stats'];
  statProgress: PlayerCharacter['statProgress'];
  statusEffects: PlayerCharacter['statusEffects'];
  power: number;
  ac: number;
  tc: number;
  corruption: number;
  menace?: number;
  inventory: PlayerViewItem[];
  equipped: PlayerCharacter['equipped'];
  factionStanding: PlayerCharacter['factionStanding'];
  earnedTitles: PlayerViewTitle[];
  dog: PlayerCharacter['dog'];
  golem: PlayerCharacter['golem'];
  dead: boolean;
  position: { gridX?: number; gridY?: number; currentLocationId: string };
  mainQuest: PlayerCharacter['mainQuest'];
  arbiter: ReturnType<typeof arbiterSheetLines>;
  scene: {
    weather: CurrentScene['weather'];
    dangerRating: number;
    threatWord: ThreatWord;
    enemies: PlayerViewEnemy[];
  } | null;
}

export interface PlayerViewHash {
  hp: number;
  inventoryCount: number;
  locationId: string;
  sceneEnemyCount: number;
}

function buildViewItem(item: InventoryItem): PlayerViewItem {
  const card = findCatalogItem(item.name);
  return {
    instanceId: item.id,
    name: item.name,
    kind: item.kind,
    rarity: item.rarity,
    quantity: item.quantity,
    tags: item.tags,
    durability: item.durability,
    card: card ? { kind: card.kind, rarity: card.rarity, tags: card.tags, baseDurability: card.baseDurability } : null,
  };
}

function buildViewEnemy(
  enemy: Enemy,
  currentHp: number,
  playerPower: number,
  canReadDefenses: boolean,
  band: CombatRange | null,
  mainReach: { bands: CombatRange[]; label: string },
): PlayerViewEnemy {
  const power = enemyPowerScore(enemy);
  return {
    name: enemy.name,
    type: enemy.type,
    rarity: enemy.rarity,
    currentHp,
    hpMax: enemy.hp,
    ac: enemyAC(enemy),
    power,
    matchup: powerMatchup(playerPower, power),
    dealsType: enemyDamageType(enemy),
    traits: portraitTraitChips(enemy.traits, Boolean(enemy.boss) || canReadDefenses),
    rangeLabel: band === null ? 'out of range' : RANGE_LABELS[band],
    mainHandReach: { label: mainReach.label, inRange: band !== null && mainReach.bands.includes(band) },
  };
}

function buildTitles(player: PlayerCharacter, worldMemory: WorldMemory): PlayerViewTitle[] {
  const earned = new Set(player.earnedTitles ?? []);
  const out: PlayerViewTitle[] = [];
  for (const t of ARBITER_TITLES) {
    if (isHiddenTitle(t.id) && !earned.has(t.id) && !greatClimbLoreDiscovered(worldMemory)) continue;
    out.push({
      id: t.id,
      earned: earned.has(t.id),
      title: t.title,
      requirement: t.requirement,
      perk: TITLE_PASSIVE_PERK[t.id] ?? t.perk,
    });
  }
  return out;
}

/**
 * Build a PlayerView from a plain state snapshot. Pure: no store access, no
 * mutation, no RNG consumption. `canReadDefenses` mirrors the Wisdom-gated
 * "strike to learn" mechanic (portraitTraitChips' second argument) — pass
 * false unless the caller has already legitimately proven that read.
 */
export function buildPlayerView(
  state: { player: PlayerCharacter | null; currentScene: CurrentScene | null; worldMemory: WorldMemory },
  opts: { canReadDefenses?: boolean; previousHp?: number; previousStamina?: number } = {},
): PlayerView | null {
  const { player, currentScene, worldMemory } = state;
  if (!player) return null;

  const power = playerPowerScore(player);
  const offInst = player.equipped?.offId
    ? player.inventory.find((i) => i.id === player.equipped?.offId)
    : player.equipped?.off
      ? player.inventory.find((i) => i.name === player.equipped?.off)
      : undefined;
  const canBlock = Boolean(offInst && itemIsShield(offInst));
  // Phase 11 — the exact resolver the attack-reach gate and EnemyPanel use.
  // Computed once here (main-hand only, matching what a plain "attack"
  // resolves against) and applied per-enemy below via enemyBandOf, the same
  // per-enemy band the gate and the UI both read off `scene.enemies[i].pos`.
  const mainReach = currentScene ? playerWeaponReach(player, 'main') : null;
  const scene = currentScene
    ? {
        weather: currentScene.weather,
        dangerRating: currentScene.location.danger,
        threatWord: threatReadout(player, currentScene.location.danger, participationFromScene(currentScene)).word,
        enemies: currentScene.enemies.map((e: Enemy, i: number) =>
          buildViewEnemy(
            e,
            currentScene.enemyHps[i] ?? e.hp,
            power,
            Boolean(opts.canReadDefenses),
            enemyBandOf(currentScene, i),
            mainReach!,
          ),
        ),
      }
    : null;

  return {
    hp: player.hp,
    hpMax: player.hpMax,
    hpDelta: typeof opts.previousHp === 'number' ? player.hp - opts.previousHp : null,
    stamina: player.stamina,
    staminaMax: player.staminaMax,
    staminaDelta: typeof opts.previousStamina === 'number' ? player.stamina - opts.previousStamina : null,
    canBlock,
    stats: player.stats,
    statProgress: player.statProgress,
    statusEffects: player.statusEffects,
    power,
    ac: player.ac,
    tc: player.tc,
    corruption: player.corruption,
    menace: player.menace,
    inventory: (player.inventory ?? []).map(buildViewItem),
    equipped: player.equipped,
    factionStanding: player.factionStanding,
    earnedTitles: buildTitles(player, worldMemory),
    dog: player.dog,
    golem: player.golem,
    dead: Boolean(player.dead),
    position: { gridX: player.gridX, gridY: player.gridY, currentLocationId: player.currentLocationId },
    mainQuest: player.mainQuest,
    arbiter: arbiterSheetLines(player, worldMemory),
    scene,
  };
}

/** A small, stable digest for the decision journal — not a security hash,
 *  just enough to eyeball "did the view actually change between decisions". */
export function hashPlayerView(view: PlayerView | null): PlayerViewHash {
  if (!view) return { hp: -1, inventoryCount: 0, locationId: '', sceneEnemyCount: 0 };
  return {
    hp: view.hp,
    inventoryCount: view.inventory.length,
    locationId: view.position.currentLocationId,
    sceneEnemyCount: view.scene?.enemies.length ?? 0,
  };
}
