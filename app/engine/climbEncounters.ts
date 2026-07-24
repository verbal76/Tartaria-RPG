// climbEncounters — OTA-911. The great climbs are the Aether-collector towers
// of the old planetary grid — the sky-antennas that drew Aether from the sun and
// the cold night and fed it into the cities, the same grid whose resonance
// cascade at Thametan's Tower drowned the world. Their automated defenders never
// stood down. Per the canon (etheric_guardians): "Automated constructs ranging
// from shoulder-height drones to war-scale machines... defend the Tartarian
// sites they were built into. They have been at it since before the Flood."
//
// So a great climb is fought as much as it is climbed: winged sentinels and
// collector drones peel off the tower to drive you back, more of them the higher
// you go (closer to the still-live resonance apparatus at the crown). These
// encounters fire mid-climb — which is only survivable with the Hardened
// Climbing Strap anchoring you (you can't fight on a bare rope face). The store
// scales the base templates below to the player via scaleEncounterForContext.

import type { Enemy } from './types';

/** Base guardian templates, banded by how high up the climb they appear. HP is
 *  authored low so the shared scaler lifts them to the player; the higher bands
 *  are tougher constructs (war-scale, not shoulder-height). */
const LOW_GUARDIANS: readonly Enemy[] = [
  {
    name: 'Collector Drone',
    type: 'Automation',
    abilityPoint: 'Dexterity 3',
    attack: 'Harvest Lash',
    damage: '2D6',
    hp: 16,
    rarity: 'Common',
    traits: ['armored', 'aerial', 'resist:piercing', 'vulnerable:burn'],
    loot: ['Drone Processor', 'Aetheric Cog'],
  },
  {
    name: 'Tower Skimmer',
    type: 'Automation',
    abilityPoint: 'Dexterity 4',
    attack: 'Wing Rake',
    damage: '2D6',
    hp: 20,
    rarity: 'Common',
    traits: ['aerial', 'quick', 'vulnerable:bludgeoning'],
    loot: ['Drone Processor', 'Energy Fragment'],
  },
];

const MID_GUARDIANS: readonly Enemy[] = [
  {
    name: 'Winged Sentinel',
    type: 'Automation',
    abilityPoint: 'Dexterity 5',
    attack: 'Dive Talon',
    damage: '2D8',
    hp: 40,
    rarity: 'Uncommon',
    traits: ['armored', 'aerial', 'quick', 'resist:slashing', 'vulnerable:burn'],
    loot: ['Drone Core', 'Energy Fragment', 'Aetheric Cog'],
  },
  {
    name: 'Aether-Wing Drone',
    type: 'Automation',
    abilityPoint: 'Dexterity 5',
    attack: 'Resonance Beam',
    damage: '2D8',
    hp: 46,
    rarity: 'Uncommon',
    traits: ['armored', 'aerial', 'resist:piercing', 'resist:slashing', 'vulnerable:burn'],
    loot: ['Drone Core', 'Aetheric Shard'],
  },
];

const HIGH_GUARDIANS: readonly Enemy[] = [
  {
    name: 'Resonance Sentinel',
    type: 'Automation',
    abilityPoint: 'Strength 7',
    attack: 'Antenna Lance',
    damage: '3D8',
    hp: 78,
    rarity: 'Rare',
    traits: ['armored', 'aerial', 'savage', 'resist:slashing', 'resist:piercing', 'vulnerable:burn'],
    // OTA-943 — was 'Sentinel Core' (a Legendary material since the trophy promotion):
    // a Rare climb guardian paying Legendary was the audit's mid-tier windfall.
    loot: ['Crystal Core', 'Aetheric Shard', 'Relic Shard'],
  },
  {
    name: 'Sky-Warden of the Antenna',
    type: 'Automation',
    abilityPoint: 'Strength 8',
    attack: 'Grid Discharge',
    damage: '3D8',
    hp: 88,
    rarity: 'Rare',
    traits: ['armored', 'aerial', 'savage', 'concussive', 'resist:slashing', 'vulnerable:burn'],
    // OTA-943 — was two LEGENDARY cores (Sentinel + Guardian) on a Rare enemy — the
    // audit's worst windfall (215 EV at power 45). Both swapped to Rare machine cores.
    loot: ['Steam Core', 'Clockwork Core', 'Relic Shard'],
  },
];

/** Which tiers of a great climb spawn a guardian encounter. At least a couple,
 *  more the taller the climb: ~floor(tiers/3), spread across the middle pitches
 *  (never the very first hold or the summit). Deterministic on `totalTiers`. */
export function climbEncounterTiers(totalTiers: number): number[] {
  if (totalTiers < 2) return [];
  const k = Math.max(2, Math.floor(totalTiers / 3)); // 11→3, 12–14→4, 15→5
  const out = new Set<number>();
  for (let i = 1; i <= k; i++) {
    const raw = Math.round((i * totalTiers) / (k + 1));
    out.add(Math.min(totalTiers - 1, Math.max(2, raw)));
  }
  return [...out].sort((a, b) => a - b);
}

/** True when clearing `tier` of a `totalTiers` great climb triggers a fight. */
export function climbEncounterAtTier(tier: number, totalTiers: number): boolean {
  return climbEncounterTiers(totalTiers).includes(tier);
}

export interface ClimbEncounter {
  /** Unscaled base enemies — the caller runs them through scaleEncounterForContext. */
  enemies: Enemy[];
  /** Heavy-lore intro beat for the ambush. */
  intro: string;
}

/** Build the guardian ambush for a given tier. Higher up the climb → tougher
 *  band and, near the crown, a second body. Deterministic on (tier, totalTiers)
 *  so a given climb reads the same each attempt (tests stay stable). */
export function buildClimbEncounter(tier: number, totalTiers: number): ClimbEncounter {
  const frac = tier / Math.max(1, totalTiers);
  const band = frac >= 0.72 ? HIGH_GUARDIANS : frac >= 0.4 ? MID_GUARDIANS : LOW_GUARDIANS;
  // Deterministic pick within the band + whether a second body joins.
  const pick = band[tier % band.length]!;
  const pairUp = frac >= 0.55 && (tier % 2 === 0); // upper pitches can come in twos
  const enemies: Enemy[] = pairUp
    ? [
        { ...pick, name: `${pick.name} α`, aliases: [pick.name.toLowerCase(), 'guardian', 'drone', 'sentinel'] },
        { ...pick, name: `${pick.name} β`, aliases: [pick.name.toLowerCase(), 'guardian', 'drone', 'sentinel'] },
      ]
    : [{ ...pick, aliases: [pick.name.toLowerCase(), 'guardian', 'drone', 'sentinel'] }];
  const intro =
    frac >= 0.72
      ? `Near the crown the tower is still awake. ${pairUp ? 'War-scale sentinels unfold' : 'A war-scale sentinel unfolds'} from a socket in the antenna-mast and ${pairUp ? 'drop' : 'drops'} toward you on humming wings — the grid still defends its own.`
      : frac >= 0.4
        ? `Something peels off the tower above you. ${pairUp ? 'Winged sentinels bank' : 'A winged sentinel banks'} out of the wind and ${pairUp ? 'come' : 'comes'} in hard — an old guardian that never got the order to stand down.`
        : `A collector drone lifts off a lower gantry, running lights waking amber, and swings out to meet you. The tower does not want to be climbed.`;
  return { enemies, intro };
}
