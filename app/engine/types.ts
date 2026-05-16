export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary';

export type Intent =
  | 'stealth'
  | 'attack'
  | 'diplomacy'
  | 'escape'
  | 'investigate'
  | 'rest'
  | 'inventory'
  | 'travel'
  | 'use_relic'
  | 'cast'
  | 'wait'
  | 'ask'
  | 'craft'
  | 'equip'
  | 'unknown';

export interface ParsedInput {
  intent: Intent;
  raw: string;
  normalized: string;
  target?: string;
  resolvedItemId?: string;
  resolvedNoun?: string;
  matchedVerb?: string;
  confidence: number;
  suggestions: string[];
}

export interface Stats {
  strength: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface Race {
  id: string;
  name: string;
  baseAC: number;
  racialACBonus: string;
  startingTCFormula: string;
  startingHPBonus: number;
  barehandDamage: string;
  tags: string[];
  traits: string[];
  description: string;
}

export interface Faction {
  id: string;
  name: string;
  subtitle: string;
  alignment: string;
  goal: string;
  philosophy: string;
  structure: string;
  rivals: string[];
  allies: string[];
  joinRequirements: string;
  tags: string[];
  startingStanding: number;
}

export interface Enemy {
  name: string;
  type: string;
  abilityPoint: string;
  attack: string;
  damage: string;
  hp: number;
  rarity: Rarity;
  loot: string[];
}

export interface WeatherEntry {
  id: string;
  name: string;
  description: string;
  visibility: number;
  travelPenalty: number;
  corruptionChance: number;
  tags: string[];
  source?: string;
}

export interface Hazard {
  id: string;
  name: string;
  description: string;
  severity: number;
  effect: string;
  tags: string[];
  source?: string;
}

export interface Relic {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  effect: string;
  tags: string[];
  source?: string;
}

export interface Location {
  id: string;
  name: string;
  type: string;
  description: string;
  danger: number;
  tags: string[];
  discoverable: boolean;
  parent?: string;
  controlledBy?: string;
}

export interface QuestObjective { id: string; verb: string; target: string; tags: string[]; }
export interface QuestComplication { id: string; text: string; severity: number; tags: string[]; }
export interface QuestReward {
  id: string;
  type: 'currency' | 'standing' | 'relic' | 'knowledge';
  label: string;
  amount?: number;
  faction?: string;
  tier?: string;
  tags: string[];
}

export interface Quest {
  id: string;
  objective: QuestObjective;
  location: Location;
  complication: QuestComplication;
  reward: QuestReward;
  generatedAt: number;
  state: 'open' | 'in_progress' | 'completed' | 'failed';
}

export interface Runecaster {
  id: string;
  name: string;
  tier: Rarity;
  intelligenceRequired: number;
  description: string;
  damage: string | null;
  effect: string;
  tags: string[];
  source?: string;
}

export interface NPC {
  id: string;
  name: string;
  title: string;
  affiliation: string;
  status: string;
  role: string;
  summary: string;
  tags: string[];
}

export interface TimelineEvent {
  year: number;
  name: string;
  location: string;
  factions: string[];
  outcome: string;
  summary: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'relic' | 'consumable' | 'misc' | 'runecaster';
  rarity?: Rarity;
  description?: string;
  quantity: number;
  tags: string[];
}

export interface FactionStanding { factionId: string; standing: number; }

export interface PlayerMilestones {
  enemiesDefeated: number;
  travelsCompleted: number;
  checksSucceeded: number;
}

export interface PlayerEquipped {
  weaponName?: string;
  armorName?: string;
}

export type DamageType =
  | 'degradation'
  | 'bludgeoning'
  | 'burn'
  | 'aetheric'
  | 'electrical'
  | 'piercing'
  | 'poison'
  | 'radiation'
  | 'slashing'
  | 'stun';

export interface PlayerCharacter {
  name: string;
  raceId: string;
  factionId: string;
  stats: Stats;
  hp: number;
  hpMax: number;
  stamina: number;
  staminaMax: number;
  ac: number;
  tc: number;
  corruption: number;
  inventory: InventoryItem[];
  factionStanding: FactionStanding[];
  currentLocationId: string;
  activeQuests: Quest[];
  /** Set when HP hits 0; the character is barred from play until a Resurrection Gem revives them. */
  dead?: boolean;
  /** Lifetime counters; thresholds trigger stat growth. */
  milestones?: PlayerMilestones;
  /** Currently-equipped weapon and armor (by catalog name). */
  equipped?: PlayerEquipped;
}

export type LogChannel = 'player' | 'arbiter' | 'system' | 'world' | 'combat' | 'reward' | 'cognitive';

export interface RollStep {
  id: string;
  label: string;
  sides: number;
  count: number;
  bonus: number;
  bonusLabel: string;
  target?: number;
  targetLabel?: string;
  context: string;
  values?: number[];
  total?: number;
  success?: boolean;
}

export interface PendingRollState {
  actionText: string;
  steps: RollStep[];
  currentStep: number;
}

export interface GameLogEntry {
  id: string;
  ts: number;
  channel: LogChannel;
  text: string;
  meta?: Record<string, unknown>;
}

export interface WorldMemory {
  tagCounts: Record<string, number>;
  discoveredLocationIds: string[];
  defeatedEnemies: string[];
  completedQuestIds: string[];
}

export type ScreenName =
  | 'title'
  | 'character_creation'
  | 'exploration'
  | 'log'
  | 'lore'
  | 'about';

export interface SaveState {
  version: 1;
  savedAt: number;
  player: PlayerCharacter | null;
  worldMemory: WorldMemory;
  gameLog: GameLogEntry[];
  currentScreen: ScreenName;
}
