import type { InvestigationEntry } from './investigationTable';

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
  /** OTA-1060 — RESTORED. Removed in OTA-803 because gift-for-rep undercut the
   *  standing economy; see GIFT_STANDING_FACTION_CAP for how that door is kept
   *  shut this time. */
  | 'gift'
  | 'steal'
  | 'join'
  | 'dodge'
  | 'block'
  | 'advance'
  | 'retreat'
  | 'repair'
  | 'accept'
  | 'turn_in'
  | 'dig'
  | 'throw'
  | 'climb'
  | 'swim'
  | 'jump'
  | 'dash'
  | 'disengage'
  | 'help'
  | 'ready'
  | 'mount'
  | 'take_cover'
  | 'aim'
  | 'reload'
  | 'maneuver'
  | 'quick_fire'
  | 'multi_fire'
  | 'fight_back'
  | 'recruit'
  | 'drop'
  | 'pickup'
  | 'open'
  /** OTA-239 — Tool Pouch. `stow <item>` adds an inventory item to
   *  the 3-slot tool pouch; `unpouch <item>` (parsed via the same
   *  intent + an `unpouch` flag in the verb resolution) removes. */
  | 'stow_pouch'
  | 'unpouch'
  // OTA 004 — Phase 3 water bottles. Fill an empty bottle from a
  // water source in the current scene (puddle / lake / waterfall /
  // crevice / stream / well).
  | 'fill'
  // OTA-125 — drink. Was previously a `rest` synonym, which produced
  // an absurd 8-hour-rest outcome for "drink water" (playtester
  // surfaced this on Day 32). Now its own intent: routes "drink
  // <consumable>" through the existing consumable-eat flow, "drink
  // water" with a scene water source to a small stamina restore.
  | 'drink'
  // OTA-129 — hook-puzzle verbs. These route through the puzzle
  // resolver in engine/hookPuzzles.ts when an active hook in the
  // scene has a puzzle definition. The classic case: sealed vault
  // door narration ("three rotations, in the right order") + player
  // types "rotate the ring left." Pre-OTA-129 these all parsed as
  // intent=unknown and fell to the generic inventory-chatter line
  // even though the narrative had asked for the action.
  | 'rotate'
  | 'knock'
  | 'turn'
  | 'twist'
  | 'press'
  | 'push'
  | 'pull'
  // OTA-693 — call-to-action gestures. Evocative verbs a scene's prose
  // invites ("knock on the steeple", "ring the bells", "touch the pillar",
  // "pray at the altar") that aren't mechanical puzzle inputs. They route
  // through the hook resolver when an active hook matches; otherwise they
  // emit a thematic backstory-fill flavor line instead of dead-ending.
  | 'gesture'
  // OTA-120 — Dog Companion combat verbs. Both intents require an
  // active dog in combat (player.dog.status === 'with_player' AND
  // currentScene.enemies.length > 0). Bite is a direct attack;
  // distract applies a 'distracted' status to one enemy for the
  // player's next action. See engine/dogCompanion.ts for the
  // mechanics and handleDogCombat in gameStore.ts for the dispatch.
  | 'dog_bite'
  | 'dog_distract'
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
  /** OTA 204 — predicate-argument structure. Each entry is one
   *  argument the verb takes (direct object, instrument, recipient,
   *  etc.) along with its resolution (catalog item / scene noun /
   *  enemy). Populated alongside the legacy `target` / `resolvedNoun`
   *  / `resolvedItemId` fields, which now mirror `args[0]` for back-
   *  compat with the 25+ gameStore handlers that already read them.
   *
   *  Role names map to linguistic conventions (J&M Ch.12 §12.7
   *  dependency labels / Universal Dependencies):
   *    direct      ≈ obj  (patient/theme)
   *    instrument  ≈ obl:instr
   *    recipient   ≈ iobj / obl:to (goal)
   *    destination ≈ obl:to  (locative goal)
   *    source      ≈ obl:from
   *    manner      ≈ advmod  (adverbial) */
  args?: ParsedArg[];
  /** OTA 204 — non-empty when the parser rejected this input for
   *  validation reasons (meta-talk feedback, frame-required arg
   *  missing, junk nouns in a required slot). Sibling to `intent:
   *  'unknown'` returns. Lets the engine surface useful feedback
   *  instead of silently rewriting state. */
  validationIssues?: string[];
  /** ⚠ OTA-1684 — THE NEAR MISS, NAMED. Set only when no verb matched and the
   *  first token sits ONE edit from a table verb the fuzzy matcher deliberately
   *  refuses to auto-correct (4–5 letter words are exact-only since OTA-094, or
   *  "leave" becomes "cleave"). The parser does not ACT on it — the owner's
   *  "srink" is not run as "drink" — it offers it: the engine says "did you
   *  mean drink?" and puts the corrected line first on the chip row, instead
   *  of a five-second Qwen round trip that answered about a rope. */
  didYouMean?: { typed: string; meant: string; command: string };
}

/** OTA 204 — argument role taxonomy. See ParsedInput.args for the
 *  mapping to linguistic conventions (Jurafsky & Martin Ch.12 §12.7,
 *  Universal Dependencies labels). */
export type ArgRole =
  | 'direct'       // patient/theme — "attack the DRONE"
  | 'instrument'   // tool / means — "with the BOLT-CASTER"
  | 'recipient'    // give-to / for-whom — "to YULKA"
  | 'destination'  // movement goal — "into the HALL"
  | 'source'       // origin — "from the CRATE"
  | 'manner';      // adverbial — "CAREFULLY"

export interface ParsedArg {
  role: ArgRole;
  /** Raw segment text (joined tokens after stopword strip). */
  text: string;
  /** Set when the segment resolved to a catalog item in the player's
   *  inventory. */
  resolvedItemId?: string;
  /** Set when the segment resolved to a scene noun / enemy / ambient
   *  noun / hook. */
  resolvedNoun?: string;
  /** The preposition that introduced this segment, if any
   *  ('with' / 'to' / 'from' / 'into'). Undefined for the direct
   *  object and for manner adverbs. */
  preposition?: string;
}

export interface Stats {
  strength: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  // OTA-348 — Stealth is a first-class attribute. Unlike the other five
  // (uniform 1d10 at creation) its starting value is a race-proportional roll
  // (Giants 0, constructs ~1d4-1d6, Mud Dwellers/Reclaimers high). It governs
  // the stealth skill check (the APPROACH "use stealth" toggle) + pickpocket /
  // vendor-steal rolls, grows via trainStat, and equipped stealth gear (e.g.
  // the Salvager's Trench Coat) now feeds it.
  stealth: number;
}

export interface Race {
  id: string;
  name: string;
  baseAC: number;
  /** Free-form description shown in lore screens. Author-prose. */
  racialACBonus: string;
  /** OTA 038 — structured AC bonus rules applied at runtime in
   *  effectiveAC(player, scene). Empty array = no conditional bonus. */
  racialACBonusRules?: Array<{
    condition: 'underground' | 'dark' | 'confined' | 'runic_gear' | 'aether_powers' | 'constructed_environment' | 'relic_armor';
    delta: number;
  }>;
  /** OTA 038 — always-on racial stat bumps applied at every
   *  effectiveStats read. Context-conditional bonuses stay in
   *  `traits` strings for now. */
  racialStatBonuses?: {
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
  };
  startingTCFormula: string;
  startingHPBonus: number;
  barehandDamage: string;
  tags: string[];
  traits: string[];
  description: string;
  /** Short second-person flavor blurb shown on the character-creation
   *  screen under the mechanical description. 2-3 sentences max. Voice:
   *  what it feels like to wake up as this race. */
  flavor?: string;
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
  /** Short second-person flavor blurb shown on the character-creation
   *  screen under the faction goal. 2-3 sentences max. Voice: what it
   *  feels like to wear this colors. */
  flavor?: string;
}

export interface Enemy {
  name: string;
  type: string;
  /** ⚠ OTA-1506 — where this body stands on the owner's bullseye (see
   *  engine/combatGeometry): compass bearing from the player + distance in
   *  ring-widths. Runtime combat state that RIDES ON THE ENEMY deliberately —
   *  splices, kills, saves and loads all carry it with no parallel-array
   *  bookkeeping. Absent on spawn DEFINITIONS and on saves from before this
   *  OTA; readers synthesize it from the legacy shared `scene.range` via
   *  combatResolution.enemyPosOf. */
  pos?: { bearing: number; distance: number };
  /** ⚠⚠⚠ OTA-1513 — the coating this enemy came to the fight carrying, rolled
   *  ONCE at birth (enemyCoating.rollEnemyCoating) and never re-rolled: a blade
   *  is filthy or it is clean, and re-deciding per swing would make the same
   *  weapon both in one fight. Owner: "we need a roll when the enemy is born to
   *  see if it will have a coating, and what it will be if it does."
   *  Rides ON the enemy object exactly like `pos` above, so scene splices,
   *  saves and the pager carry it for free. Absent = a clean weapon, which is
   *  most of them. */
  coating?: { kind: 'poison' | 'acid' | 'corruption' | 'electrical' | 'burn' | 'cold'; dice: string };
  abilityPoint: string;
  attack: string;
  damage: string;
  hp: number;
  rarity: Rarity;
  loot: string[];
  /** OTA-120 — set true on captors spawned by a dog-rescue scenario.
   *  The kill-handling site short-circuits the faction-standing
   *  delta and the witness-cascade hostility logic when this flag
   *  is set, so the captor's faction doesn't punish the player for
   *  freeing a chained dog. Combat XP, loot, kill counters, stat
   *  training all still fire normally — only the rep + cascade
   *  paths are skipped. See engine/dogCompanion.ts for the spawn
   *  site and the framework spec entry in HANDOFF.md §0.A. */
  factionNeutralFight?: boolean;
  /** OTA-849 [living world] — the faction this enemy fights for, when it's a
   *  faction combatant (a raid party member, a patrol). Killing it shifts the
   *  player's standing with this faction (down) and its strongest rival (up). Unset
   *  on wild beasts / automata / freelance foes, which carry no allegiance. */
  factionId?: string;
  /** arb-fix — the victim's OWN faction, when it differs from factionId. An outpost
   *  anchor vendor's factionId is the HOST faction (whose peace you break by fighting
   *  in their outpost); nativeFactionId is who the vendor actually IS (e.g. Irma is a
   *  hosted True Tartarian). Killing them angers the host (peace) AND their own faction
   *  (their member was harmed). Unset for enemies whose allegiance == their host. */
  nativeFactionId?: string;
  /** Synonyms the parser accepts for this enemy. "Architectural Sentinel"
   *  might list ["sentinel", "guardian", "statue"] so `attack the sentinel`
   *  resolves to the canonical entity. Lowercase, no punctuation. */
  aliases?: string[];
  /** OTA-1116 — this body arrived INSTEAD of a party of N (the `elite`
   *  difficulty dial). Carries the count so the defeat path can pay the
   *  party's worth in loot rather than one corpse's: spoils are rolled per
   *  body, and paying less for a harder fight is the fake-difficulty trap the
   *  dial exists to avoid. Absent on every ordinary enemy. */
  eliteReplaced?: number;
  /** ⚠⚠ OTA-1703 — THE STAGE COUNTS ITS OWN BODIES. The encounter key
   *  (`family:id:stage`) of the mission stage that stood this body up, written
   *  by spawnStageEscort. The escort clear credits a death ONLY when the body
   *  carries the stage's key — a corruption apparition that happened to be an
   *  Aetheric Raven closed the harpy hunt's four-raven stage before the ravens
   *  existed. Absent on every wanderer, and on bodies saved mid-fight before
   *  this OTA (those no longer close a stage; once they fall the arrival door
   *  stands the stage's own pack up, so nothing is left unfinishable). */
  stageKey?: string;
  /** OTA-897 (SA-5) — one-line codex "voice": a short, evocative field
   *  description shown in the bestiary (once the foe is recorded) and, briefly,
   *  on the combat enemy panel. Pure flavor — never read by combat logic. */
  flavor?: string;
  /** Per-enemy perks layered on top of the macro type-resistance map.
   *  Supported ids live in engine/enemyTraits.ts; examples:
   *  - "armored"            (+2 AC)
   *  - "quick"              (+1 attack roll)
   *  - "slow"               (−1 attack roll)
   *  - "regenerate"         (+1 HP per round, capped at starting HP)
   *  - "bleeder"            (50% chance to apply bleed on hit)
   *  - "resist:slashing"    (halve incoming slashing damage)
   *  - "vulnerable:burn"    (1.5× incoming burn damage)
   *  - "ambush_strike"      (+2 to the first hit on a target)
   *  Unknown ids are ignored — safe to extend the catalog. */
  traits?: string[];
  /** Boss tier — a named, story-class threat. Engine treats boss
   *  enemies as: AC +6, +1d6 bonus damage per swing, TWO counter-attacks
   *  per round, arrival narration warns the player ("not a fight you
   *  can win head-on — find another way, or run"), and the kill always
   *  drops a Resurrection Gem. Bosses are absent from the random
   *  encounter pools — they only spawn from explicit story triggers
   *  or the boss-spawn gate (~1% on wasteland encounters once the
   *  player has cleared 3+ Legendaries). */
  boss?: boolean;
  /** OTA-361 — concrete gear a HUMANOID (type 'Human') enemy carries.
   *  When the player KNOCKS THEM OUT — a single non-lethal blow that
   *  deals ≥ half the enemy's max HP — a Loot action transfers this
   *  whole kit to the pack, DAMAGED (durability scaled to how hurt the
   *  enemy was), plus the enemy's `loot` drops and a little `tc`. Weapon
   *  / armor names resolve through findWeaponByName / findArmorByName.
   *  Absent on non-humanoids (beasts, automata) — they can't be subdued
   *  and carry no kit. */
  carries?: { weapons?: string[]; armor?: string[]; tc?: number };
  /** OTA-366 — a signature weapon the enemy fights with that CANNOT be
   *  looted (kill or knockout). `reason` is the flavor line shown when
   *  the player eyes it on the body and leaves it. Used for the Forgotten
   *  Order's Black Cloak enforcers, whose Hollow Edge blades are honed
   *  along the grip so only a trained Order hand can take one up without
   *  flaying their own palm. Never enters the loot grant. */
  signatureWeapon?: { name: string; reason: string };
  /** OTA-808 — parley temperament (the "lock" the player reads). Animals are
   *  'skittish' (yield to CALM) or 'aggressive' (yield to INTIMIDATE); a HUMANOID
   *  ('Human') enemy is 'reasonable' (PERSUADE) or 'greedy' (INTIMIDATE). When
   *  absent, engine/parley.deriveAnimalTemperament() infers it from the name/traits
   *  so every foe has a stable read. Bosses are unparley-able regardless. */
  temperament?: import('./parley').Temperament;
  /** ⚠⚠ OTA-1678 — THIS BODY WAS ROLLED BY THE WORLD, not placed by a mission.
   *  Stamped by the four world rolls only (beginScene's encounter, the climb
   *  encounter, the rest ambush, the patrol crossing — see engine/fleeEscalation)
   *  and read by the flee contest: a lineup where every live body carries it is
   *  a "random" in the owner's sense and the escape bar escalates; any body
   *  without it (hunt stages, guardians, chain marks, captors, summit bosses,
   *  hostile traders, and every save from before this OTA) keeps the OTA-1009
   *  contract. Rides on the enemy like `pos` and `coating`. */
  unscripted?: boolean;
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
  /** Synonyms the parser will accept when the player references this
   *  location. "tartarian arch" might list ["arch", "workroom", "hollow"]
   *  so `search workroom` resolves correctly even when the canonical name
   *  is verbose. Lowercase, no punctuation. */
  aliases?: string[];
  /** Author-declared interactable nouns surfaced as Search / Approach
   *  chips and as parser target candidates. Replaces the heuristic
   *  noun-extraction pass for hand-authored content (the extractor
   *  stays as a fallback when this field is missing). Every entry
   *  should be something the player could plausibly point at — concrete
   *  nouns, no verbs / abstractions / measurements. Lowercase,
   *  no punctuation, singular preferred. */
  interactables?: string[];
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
  /** `false` = the player has DEACTIVATED (paused) this lead: it stays on the
   *  slate but won't auto-complete on a matching kill until re-activated.
   *  Absent/true = active. */
  tracked?: boolean;
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

/** OTA-994 — the actual kit a fallen character died in: full item copies (minus
 *  instance id / stack count, slot kept) so a Hollowed revenant can give back
 *  the REAL gear — fused stats and all — instead of a look-alike or trophy. */
export type FallenGearPiece = Omit<InventoryItem, 'id' | 'quantity'> & { slot: string };

export interface InventoryItem {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'relic' | 'consumable' | 'misc' | 'runecaster' | 'dog_armor';
  /** arb170 — Inert Golem Core. Dropped when a trained golem crumbles; carries
   *  HALF its trained levels. Feeding it to a freshly-summoned golem grafts those
   *  levels on, so a death costs ~half the investment, never the whole thing. */
  golemCore?: { power: number; resilience: number; bonusHp: number };
  rarity?: Rarity;
  description?: string;
  quantity: number;
  tags: string[];
  /** Per-instance durability for wear-prone gear. Absent for stackable/consumable items. */
  durability?: { current: number; max: number };
  /** OTA 23-009 — set on items obtained via stealFromVendor. The
   *  sellToVendor path refuses to buy this specific instance back
   *  (it's recognisably the vendor's own). The player can still
   *  USE the item or SCRAP it; the scrap outputs are clean. */
  stolen?: boolean;
  /** arb119 — set on items the player CRAFTED themselves (the parser
   *  `craft` chokepoint stamps it). Scrapping a self-crafted item yields
   *  only token fallback materials, never the premium golem/aether stock —
   *  this enforces the OTA-443 author's stated intent that "crafting the
   *  scrappables costs more than scrapping returns, so the money pump stays
   *  closed." By SELL value the loop was actually net-positive (craft a
   *  Sentinel Cleaver → scrap → Golem Core + Scrap Metal worth ~2× the
   *  ingredients → sell). LOOTED gear carries no flag and scraps in full, so
   *  the intended loot→scrap→golem-feed loop is untouched. */
  selfCrafted?: boolean;
  /** OTA-631 — a Crucible fusion forges stats INSTANTLY but the Aether "settles
   *  its name" a beat later (a background Qwen call). While true, this item is a
   *  fully-real, equippable weapon carrying a placeholder name; settleFusion
   *  clears the flag and stamps the final name/description when it forms. */
  materializing?: boolean;
  /** OTA-631 — deterministic fallback name/description stashed on a materializing
   *  fused item, so a reload mid-forge (the live background namer is gone after a
   *  process restart, and the fusion inputs are already consumed) can still settle
   *  it to a proper name instead of leaving it as "Cooling Crucible-Work". */
  formingName?: string;
  formingDesc?: string;
  /** OTA-194 — player-tapped heart marker that locks an inferred
   *  item out of OTA-193's auto-substitute crafting drain. Only
   *  inferred items (no hand-authored catalog row) can carry this
   *  flag; the inventory UI gates the heart-tap on that predicate.
   *  Reserved items are saved for the fusion bench. */
  reservedForFusion?: boolean;
  /** OTA-872 — player-tapped "Save for quest" earmark on an ordinary
   *  item (food, materials, loot) the player was told to bring for a
   *  quest turn-in. Unlike a hand-authored quest-locked item (quest /
   *  contract / broker / whisper tag, which is fully view-only), a
   *  reservedForQuest item can still be used or dropped — the flag only
   *  moves it into the Quest Items section and hides it from the vendor
   *  sell tab so it isn't sold by accident. Mutually exclusive with
   *  reservedForFusion. */
  reservedForQuest?: boolean;
  /** OTA-195 — per-instance unique stats stamped on a fused item.
   *  When present, combat / preview / equip resolvers read these
   *  BEFORE falling back to catalog or inference. A fused item is
   *  one-of-a-kind for this save and will not appear in any vendor /
   *  loot / catalog lookup elsewhere. */
  uniqueStats?: UniqueItemStats;
  /** Per-instance rolled variation for AUTHORED (non-fused) gear. Stamped
   *  once at item creation (stampDurability) so two copies of the same
   *  catalog weapon/armor differ: durability and perks vary with an inverse
   *  tradeoff — a sturdier roll carries fewer/weaker perks, a fragile roll
   *  carries more/stronger ones. The equip/aggregate/preview resolvers read
   *  these BEFORE the catalog. Absent on legacy saves and on non-gear →
   *  catalog fallback (behaviour unchanged). HP perks stay catalog-driven
   *  (baked into hpMax on equip via gearHpBonus), so instanceStats never
   *  carries an `hp` entry. `uniqueStats` (fused items) takes precedence. */
  instanceStats?: {
    /** Overrides the armor catalog acBonus for THIS instance (armor only). */
    acBonus?: number;
    /** Overrides the catalog attribute statBonuses for THIS instance.
     *  Base stats only (strength/dexterity/intelligence/wisdom/charisma/
     *  stealth) — never `hp`. */
    statBonuses?: { stat: string; amount: number }[];
  };
  /** OTA-360 — weapon-coating applied to THIS weapon instance. A
   *  consumable coating (poison / acid / corruption) painted onto a
   *  bladed or ranged weapon. Permanent for the weapon's life: it
   *  survives repair and is only lost when the weapon breaks (the
   *  instance is removed at durability 0). The display name is
   *  derived ("Corrupted Battle Axe") via coatedDisplayName — the
   *  underlying `name` is NOT renamed so weapon stat lookup
   *  (findWeaponByName) still resolves the base weapon. On a landing
   *  hit the coating rolls `dice` and applies a differentiated enemy
   *  status: poison = pure DOT, acid = DOT + armor shred (−AC),
   *  corruption = DOT + corruption stacks. */
  coating?: WeaponCoating;
  /** OTA-873 — SECOND coating slot, unlocked by the Fusing Crucible's "Upgrade
   *  weapon" mode (spend 5 reserved pieces + pick a weapon → coatingSlots = 2). A
   *  dual-coat weapon carries two coatings at once and BOTH fire on every landing
   *  hit — two on-hit rolls, two DOTs (poison + acid, or even poison + poison; the
   *  design allows same-element). Only ever set when coatingSlots >= 2. The upgrade
   *  adds a coating slot only — it does NOT change AC / damage / durability. */
  coating2?: WeaponCoating;
  /** OTA-873 — coating capacity for THIS weapon instance. Absent / 1 = the normal
   *  single slot; 2 = upgraded (can hold `coating2`). Set by the Crucible upgrade. */
  coatingSlots?: number;
  /** ⚠⚠ OTA-1561 — how many PASSIVES the Crucible has worked into this RUNE-CASTER
   *  instance. Owner: *"a runecaster is a power weapon so it can only use the
   *  power it can generate, so you cannot apply coatings, but they can be
   *  upgraded at the crucible, but it adds passive stats instead that improve
   *  with character stats."*
   *
   *  A count, not a list, and deliberately so: WHICH stat a passive scales on is
   *  a property of the WEAPON, not of the slot (see
   *  engine/runecasterPassives.runecasterPassiveStat), so two passives on one
   *  caster can only ever key off the same stat. Storing the stat per slot would
   *  be storing the same answer twice and inviting the two copies to disagree.
   *  Absent / 0 = un-upgraded. Cap is 2, or 3 at Legendary. */
  runePassives?: number;
  /** engine_Dev — damage-type resists worked into THIS ARMOR instance from a
   *  coating vial (the "apply to armor" use). Permanent for the piece's life;
   *  aggregateArmor adds these to the slot's resistances while it's worn, so the
   *  existing applyArmorResistance combat path reduces incoming damage of that
   *  type. Lower-cased damage-type strings (e.g. ['poison', 'cold']). */
  addedResists?: string[];
  /** OTA-873 — extra resist-coating capacity granted by the Fusing Crucible's
   *  "Upgrade" mode on an ARMOR / DOG-VEST instance (the armor parallel to a
   *  weapon's second coating slot). The effective worked-in-resist cap is
   *  ADDED_RESIST_CAP + resistCapBonus, so an upgraded piece can hold one more
   *  resist type than a stock one. Adds a coating channel only — no AC change. */
  resistCapBonus?: number;
}

/** OTA-360 — a weapon coating stamped on a single weapon instance. */
export interface WeaponCoating {
  /** Coating family — drives the on-hit enemy status that lands. OTA-831 adds
   *  `cold` (the anti-machine element from OTA-827): frost coatings deal a cold
   *  DOT that earns a Construct/Automation's cold weakness. */
  kind: 'poison' | 'acid' | 'corruption' | 'electrical' | 'burn' | 'cold';
  /** Damage dice rolled on a landing hit ("1d4"). */
  dice: string;
  /** Display adjective used by coatedDisplayName ("Corrupted"). */
  label: string;
  /** OTA-386 — an etheric (electrical) coating can also grant a passive stat
   *  bonus while the coated weapon is wielded (the "flavored" paste variants:
   *  +1 stealth, +1 charisma, …). Read by aggregateEquippedStatBonuses. Base
   *  stats only. */
  statBonus?: { stat: string; amount: number };
}

/** OTA-195 — fused item identity. Stamped on the InventoryItem
 *  rather than tracked in a global catalog because each fusion
 *  result is one-of-a-kind for the save that produced it. The
 *  fields mirror the relevant subset of CatalogWeapon /
 *  CatalogArmor / CatalogDogGear so combat and preview can read
 *  them with the same shape. */
export interface UniqueItemStats {
  /** What this fused item IS. Drives equip slot routing and which
   *  combat resolver reads it. */
  kind: 'weapon' | 'armor' | 'dog_armor';
  /** Rarity floor - fusion never produces Common items. OTA-1536 widened this
   *  from 'Rare' | 'Legendary' to the full ladder: the tier a fusion reaches is
   *  now bounded by the best rarity among its inputs, so a scrap pack forges an
   *  Uncommon instead of tying the best armor in the catalog. */
  rarity: Rarity;
  /** Per-instance durability. Always present on fused items so
   *  scrap / repair routing works the same way as authored gear. */
  durability: { current: number; max: number };
  /** Weapon damage dice ("2d6", "1d8"). Set when kind === 'weapon'. */
  damageDice?: string;
  /** Weapon damage type ("slashing", "piercing", "aether", etc.). */
  damageType?: string;
  /** Weapon scaling stat. */
  scalesWith?: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma';
  /** Armor / dog_armor AC bonus. Set when kind === 'armor' or
   *  kind === 'dog_armor'. */
  acBonus?: number;
  /** Armor slot for kind === 'armor'. */
  armorSlot?: 'head' | 'chest' | 'legs' | 'feet';
  /** Up to ONE resistance type (burn / cold / poison / aetheric /
   *  electrical / degradation). */
  resistance?: string;
  /** Short flavor describing the unique effect. Narrative today;
   *  hook into mechanics in a future OTA. */
  special?: string;
  /** OTA-349 — a base-stat bonus the fused item grants while equipped
   *  (applied by aggregateEquippedStatBonuses' fused-item pass). Fusion
   *  inherits a stealth bonus when the inputs include stealthy gear. */
  statBonus?: { stat: keyof Stats; amount: number };
  /** OTA-955 — weapon reach identity, chosen at forge time (the form noun is
   *  picked to MATCH it: Spike/Maul = melee, Spear/Pike = long, Bow/Caster =
   *  ranged). melee = close only; long = mid+close; ranged = every band.
   *  Older forges are back-stamped on load from their name. */
  reachClass?: 'melee' | 'long' | 'ranged';
}

// OTA-550 — four-band combat range model. Ordered farthest → closest.
//   distant — only ranged weapons (bows/casters/pistols/slings/energy) reach
//   far     — throwables (thrown items) reach from here inward
//   mid     — long/reach weapons (spears/pikes/halberds/glaives/lances) reach
//   close   — arm's reach; melee + barehanded only strike here
// A combat opens at the farthest applicable band; "approach"/"advance" steps
// one band CLOSER (distant→far→mid→close). The legacy 3-band names map:
//   old 'arm'   → new 'close'  (arm's reach)
//   old 'close' → new 'mid'    (the old middle band)
//   old 'far'   → new 'far'    (unchanged); 'distant' is the new outermost band
export type CombatRange = 'distant' | 'far' | 'mid' | 'close';

// Ordered farthest → closest. rangeIndex grows as you close the gap.
export const RANGE_ORDER = ['distant', 'far', 'mid', 'close'] as const;

/** Index of a band in RANGE_ORDER (0 = distant/farthest, 3 = close). */
export function rangeIndex(r: CombatRange): number {
  return RANGE_ORDER.indexOf(r);
}

/** True when `a` is at least as close as `b` (a's index ≥ b's index). */
export function isCloserOrEqual(a: CombatRange, b: CombatRange): boolean {
  return rangeIndex(a) >= rangeIndex(b);
}

/** Weapon reach classes. `long` = spears/pikes/polearms (mid inward);
 *  `throwable` = thrown items (far inward); `ranged` = bows/casters/etc
 *  (distant inward); `melee`/`barehanded` = close only; `runecaster`
 *  reaches distant inward (kept ranged-like). */
export type WeaponReachClass =
  | 'ranged'
  | 'throwable'
  | 'long'
  | 'melee'
  | 'barehanded'
  | 'runecaster';

/** The range bands a weapon class can strike from: its band AND every
 *  band closer. Returned outermost → closest, matching RANGE_ORDER. */
/**
 * ⚠⚠⚠ OTA-1517 — DOES THIS WEAPON SHOOT DOWN? The one question the elevation
 * gate asks, in ONE place, because asking it in two is the bug it fixes.
 *
 * OTA-960 gave the store a refusal for swinging a melee weapon at something
 * standing at the base of a climb. It never gave the BUTTON the same question.
 * So the weapon lit its ready green — `weaponTone` asked only "is the target in
 * a band this weapon covers", and the raider WAS at close band — and then the
 * tap was refused. The owner hit it four times in a row on the tower relay:
 *
 *     22:46:07  tap "searing tuning fork"
 *     22:46:07  "…Cantor's Tuning Fork won't reach from up here."
 *     22:46:09  tap "searing tuning fork"   (same refusal)
 *     22:46:10  tap "searing tuning fork"   (same refusal)
 *     22:46:13  tap "searing tuning fork"   (same refusal)
 *
 * ⚠⚠ THE ERROR CLASS, NOT JUST THE INSTANCE: a control's LOOK and a control's
 * GATE were computing eligibility from two different predicates. Any fix that
 * copies the far/distant test into the component would leave the same class
 * alive — the next change to one side silently desyncs them again. So the test
 * becomes a named export both sides import, and the suite pins that neither
 * side hand-rolls it.
 *
 * ⚠ WHY far/distant AND NOT A REACH CLASS: throwables reach 'far', and the
 * refusal itself already blesses them ("Use something that SHOOTS (or a
 * throwable)"). Asking the BANDS keeps that promise exactly, and keeps working
 * if a weapon's class is ever re-tuned.
 */
export function reachFiresDown(bands: readonly CombatRange[]): boolean {
  return bands.includes('far') || bands.includes('distant');
}

export function reachBandsFor(cls: WeaponReachClass): CombatRange[] {
  switch (cls) {
    case 'ranged':
    case 'runecaster':
      return ['distant', 'far', 'mid', 'close'];
    case 'throwable':
      return ['far', 'mid', 'close'];
    case 'long':
      return ['mid', 'close'];
    case 'melee':
    case 'barehanded':
    default:
      return ['close'];
  }
}

/** Human-readable band labels for combat-log / range-display lines. */
export const RANGE_LABELS: Record<CombatRange, string> = {
  distant: 'distant',
  far: 'far',
  mid: 'mid-range',
  close: "close / arm's reach",
};

export interface FactionStanding { factionId: string; standing: number; }

/** A Whisper — a tip the player overheard from a non-vendor NPC,
 *  tracked per-character. Distinct from posted Contracts: no faction
 *  signs you up, no rep changes, the source might be lying. Each
 *  whisper has a target (where to go), an optional time window
 *  (when to go), and a stage that advances as the player follows it.
 *  Expire on their own after `expiresAtHour` so the Whispers panel
 *  doesn't pile up forever. */
/** A SHARED-POOL escort party (engine_Dev model). All-or-nothing: one health bar
 *  for the whole group; it bleeds collateral in fights and the escort fails when
 *  it hits 0. `label` is the one-word cargo name shown in the HUD. */
export interface EscortPool {
  /** OTA-1057 — the one walking at the front, and the only member of the party
   *  with an identity. An escort was a pool of hit points with a label; when
   *  ledger coverage came to escorts there was nobody in it to remember. Absent
   *  on saves written before this OTA. */
  leaderName?: string;
  label: string;
  hp: number;
  hpMax: number;
  /** Party size — drives singular/plural verb agreement in escort log lines. */
  count?: number;
}

/** OTA-1547 — one exchange in a whisper encounter's conversation sheet.
 *  'them' = the whisper NPC speaking, 'you' = the player's choice restated,
 *  'note' = out-of-voice instructions (the task block shown after accepting). */
export interface WhisperTalkTurn {
  who: 'them' | 'you' | 'note';
  text: string;
}

export interface WhisperRecord {
  /** Unique chain id (e.g. 'yulka_discs'). Each whisper has authored
   *  text + spawn rules in the engine; this field is the lookup key. */
  id: string;
  /** Where the player is in the chain. Values are chain-specific —
   *  the engine looks up the chain definition by id and consults
   *  its stage table to know what 'met_yulka' should do. */
  stage: string;
  /** In-game hour the whisper was planted. Used for expiry math and
   *  the Whispers-panel "heard 3 hours ago" line. */
  plantedAtHour: number;
  /** Vestigial — Whispers no longer expire as of 2026-05-21 per
   *  playtester request ("I don't think the quest expiration is a
   *  good idea, keep them open"). Kept on the type so old saves
   *  with the field deserialize cleanly; the reaping pass in
   *  whispers.ts is a no-op. */
  expiresAtHour?: number;
  /** Map tile the player should travel to. The chain's planting
   *  step resolves the offset against the player's location at
   *  plant-time so each character gets its own randomised location
   *  (a different patron in a different visit might point at a
   *  different patch of silt). */
  targetMapX: number;
  targetMapY: number;
  /** OTA-1542 — the target's ABSOLUTE canon-grid cell, the coordinates that
   *  actually mean a place. targetMapX/Y above are frame coordinates on a map
   *  travelToLocation recenters at every named arrival, so on their own they
   *  denote different dirt after every trip (the owner hunted Yulka on ground
   *  she had silently moved off). New plants write these outright; readers fall
   *  back for old saves via canonCell(targetLocationId) + (targetMap − CENTER),
   *  which is exact because targetLocationId names the plant-time frame. */
  targetGridX?: number;
  targetGridY?: number;
  /** OTA-1542 — who handed the player this whisper ("Nix", or absent for one
   *  overheard at an outpost Mess). Owner: "I'm still trying to figure out if
   *  this was the whisper promised by Nix" — the record never said. */
  source?: string;
  /** Macro location id the target tile is in (usually the player's
   *  current location when planted; the chain doesn't currently
   *  cross macro boundaries). */
  targetLocationId: string;
  /** Active hour window for the rendezvous, [from, to] inclusive.
   *  When to is < from, the window wraps midnight (e.g. [20, 4] =
   *  8pm to 4am). Both inclusive in 0-23 hour-of-day terms. Null
   *  on both = no time gating. */
  activeFromHour?: number;
  activeToHour?: number;
  /** Chain-specific extra state — e.g. for the Yulka fetch, this
   *  carries the thief's tile coords so the chain knows where to
   *  spawn the combat encounter. */
  ctx?: Record<string, number | string>;
  /** OTA-1547 — the encounter's conversation, persisted ON the record so it
   *  lives exactly as long as this instance of the chain: reopen the sheet
   *  mid-fetch and re-read what was said, and when the record resolves the
   *  memory goes with it. Owner: "the memory of that instance is persistent,
   *  but only for that instance." */
  talk?: WhisperTalkTurn[];
  /** `false` = the player has DEACTIVATED (paused) this whisper: it stays on
   *  the slate but is dropped from the standing look-around / mission reminders
   *  and won't advance until re-activated. Absent/true = active. */
  tracked?: boolean;
}

export interface PlayerMilestones {
  enemiesDefeated: number;
  travelsCompleted: number;
  checksSucceeded: number;
  /** Number of accepted quests / hunts / mysteries / storylines / faction
   *  quests. Used to fire a one-time "first contract" Arbiter callback. */
  questsAccepted?: number;
  /** Latched once when the player first crosses out of a hub into open
   *  silt. The next scene-rebuild surfaces a one-shot tip about
   *  digging for rocks / sticks / scraps so the player learns the
   *  basic crafting-stock loop without having to read the wiki. */
  firstSiltCrossed?: boolean;
  /** Latched once when the player sees the "ask me what X is" Arbiter
   *  affordance. Opens the door to the 158-entry concepts.json layer
   *  for players who would never otherwise discover the Q&A path. */
  firstQAHintShown?: boolean;
  /** ⚠⚠ OTA-1321 — latched the first time the player is in a scene with a live
   *  enemy, when the combat primer card is shown. Owner: a first-time popup for
   *  the first fight explaining how to heal, what Dodge and Stealth do, where to
   *  change armor and weapons, and the Approach button. One character, one card. */
  firstCombatPrimerShown?: boolean;
  /** Latched once when the player sees the "you're inside an outpost,
   *  leave it before traveling to another city" Arbiter hint. Fires
   *  on first hub entry so a new player understands the inside-building
   *  state. */
  firstOutpostHintShown?: boolean;
}

export type EquipSlot =
  | 'main'
  | 'off'
  | 'head'
  | 'chest'
  | 'hands'
  | 'legs'
  | 'feet'
  | 'cloak'
  | 'amulet'
  | 'ring'
  | 'lens';

export interface PlayerEquipped {
  /** Catalog name of the weapon in the main (dominant) hand.
   *  Kept as the canonical display + catalog-lookup key. */
  main?: string;
  /** Catalog name of the weapon in the off-hand. */
  off?: string;
  head?: string;
  chest?: string;
  /** arb63 — hands (gauntlets/gloves) + cloak (back) armor slots. */
  hands?: string;
  legs?: string;
  feet?: string;
  cloak?: string;
  /** OTA-927 — the Aetheric Vision Lens (and sibling aether-sight gadgets)
   *  equip here. Equip-gated: the detect_aether passive is active only while
   *  one is worn in this dedicated slot (was: active merely by being carried). */
  lens?: string;
  amulet?: string;
  /** OTA-239 — concurrent ring slots. `ring` is the legacy first slot (kept
   *  for back-compat); the numbered ones are additions. Equip flow fills the
   *  first empty slot in order.
   *
   *  ⚠⚠ OTA-1648 — A FOURTH, and the slot list moved to `RING_SLOTS` in
   *  equipment.ts. Owner: *"we need to be able to wear up to four rings at a
   *  time."* Adding `ring4` here was one line; the other THIRTY were the
   *  problem — the list `['ring', 'ring2', 'ring3']` was written out by hand in
   *  13 files (stat sums, HP breakdown, the fallen ledger, two fuse-protection
   *  id lists, the drop guard, the inventory screen…). Every one of them had to
   *  agree or a ring would be worn and not counted, or counted and not
   *  droppable. They now all read the constant, so a fifth ring is one edit. */
  ring?: string;
  ring2?: string;
  ring3?: string;
  ring4?: string;

  /** Per-slot instance id (matches InventoryItem.id). When set, the
   *  durability-wear path and InventoryScreen dedupe shim use this
   *  to identify exactly WHICH copy of a same-named item is equipped.
   *  Set alongside the name field by equipItem; populated for legacy
   *  saves by backfillPlayer. */
  mainId?: string;
  offId?: string;
  headId?: string;
  chestId?: string;
  handsId?: string;
  legsId?: string;
  feetId?: string;
  cloakId?: string;
  lensId?: string;
  amuletId?: string;
  ringId?: string;
  ring2Id?: string;
  ring3Id?: string;
  ring4Id?: string;

  /** OTA-239 — Tool Pouch. Carries up to 3 ready-to-use tool items
   *  (Aetheric Torch, Aetheric Vision Lens, etc.) outside the
   *  backpack. Pouched items are still in player.inventory; this
   *  array tracks WHICH inventory items are pouched (by instance
   *  id). The `use <item>` verb resolves from pouch first so a
   *  pouched torch fires faster than digging through the pack.
   *  Cap enforced in stowItem (gameStore action). */
  toolPouchIds?: string[];
  /** arb110 — the BANDOLIER: up to 5 one-shot THROWABLES (items tagged
   *  `throwable` — Shaped Aetheric Shard, Disease Sample, …) loaded for fast use.
   *  Like toolPouchIds, the items stay in player.inventory; this tracks WHICH ones
   *  (by instance id) are racked. In combat a Bandolier button opens a popup and
   *  tapping an item throws it (full attack + status), decrementing the stack and
   *  clearing the slot when it empties. Cap enforced in stowInBandolier. */
  bandolierIds?: string[];
  /** ⚠⚠ OTA-1657 — THE HEALING POUCH: up to 3 STACKS of anything that mends.
   *  Owner: *"battle gets slowed down when you have to heal… we can load it with
   *  any three healing items they want… 5 trauma kits, say 3 trail rations and
   *  maybe 10 blueberries."* Same storage contract as `bandolierIds` and
   *  `toolPouchIds` — the items stay in `player.inventory` and this records only
   *  WHICH STACKS are within reach, so one slot is "10 Blueberries", not one
   *  berry. Tapping one routes through `useInventoryItem`, the very action the
   *  pack's USE button calls, which is his other requirement: *"when you use it,
   *  it acts like they do when being used from inventory."* Cap enforced in
   *  stowInMedkit; eligibility in engine/medkitEligibility.ts. */
  medkitIds?: string[];

  // Legacy fields kept on the type so existing saves still deserialize
  // cleanly. backfillPlayer migrates them to the new slot shape.
  weaponName?: string;
  armorName?: string;
  armor?: string;
}

export type DamageType =
  | 'degradation'
  | 'bludgeoning'
  | 'burn'
  | 'cold'
  | 'aetheric'
  | 'electrical'
  | 'piercing'
  | 'poison'
  | 'radiation'
  | 'slashing'
  | 'stun'
  // OTA-827 [Group-K] — `force` is a first-class alias of aetheric (see
  // canonicalDamageType); the 2 runecaster force weapons are aetheric-flavored.
  | 'force';

export type StatusEffectKind =
  | 'bleed'
  | 'stun'
  | 'burn_scar'
  | 'armor_severed'
  | 'paralyzed'
  | 'poisoned'
  // OTA-831 — a cold hit can leave you `chilled`: a timed −DEX slow (a shiver in the
  // hands). Cleared by drinking a cold coating (the warming counter) or by waiting it
  // out. Gives the new cold coating a real player-side ailment so it's drinkable.
  | 'chilled'
  // OTA-1089 — anti-stun-lock. Granted automatically the moment a stun or
  // paralyze takes hold: while braced runs, further incapacitations cannot
  // land, so a pack of concussive hitters re-rolling 20% per landed blow
  // can't chain the player's turns away (sim: 844 stuns/run before this).
  | 'braced'
  // ⚠⚠⚠ OTA-1575 — THE STONE'S MARK. Granted by the obelisk story beat, which
  // until now paid you in DAMAGE: 2 HP off, +2 rep, a memo, and nothing else for
  // the climb. Owner: "let's have the mark give the character a buff for 3
  // rounds, so the climb was worth it."
  //
  // ⚠⚠ AND IT NEEDED A SEMANTIC THAT DID NOT EXIST. A `food_buff` ticks EVERY
  // ACTION regardless of combat (tickEffects), so three rounds granted at a
  // standing stone in the wild would burn off over three steps of walking and be
  // gone before any fight — worthless, and worse than no buff because the card
  // would say otherwise. `COMBAT_ONLY_STATUSES` is the opposite failure: those
  // EXPIRE the moment you are out of a fight, so the mark would be wiped
  // instantly. This kind WAITS: it does not tick and does not expire until
  // combat starts, then runs its three rounds. See WAITS_FOR_COMBAT_STATUSES.
  | 'stone_marked'
  | 'dodging'
  // OTA-365 — 'blocking' removed (retired: no engine path ever applied
  // it; the dodge rework folded block into dodge).
  // ⚠⚠ OTA-1510 — BLOCK is back, as the SHIELD's defense (owner: "the shield
  // has a block function … if you're using it as a defense, it only absorbs
  // the first incoming attack"). Set by the BLOCK action when a shield rides
  // the off arm; the FIRST enemy blow that round breaks on the shield
  // (consumed in applyEnemyCounter), the rest land normally. Distinct from
  // the retired 'blocking' so no legacy cached effect resurrects into it.
  | 'shield_block'
  // ⚠⚠⚠ OTA-1564 — THE WEAPON IS OUT OF ACTION. Four firearms say a natural 1
  // costs them rounds ("overheat, useless 2 rounds", "overload: 1d6 self damage",
  // "may jam"), and ActionReferenceScreen has told players the rule the whole
  // time — "Roll a natural 1 on a firearm: jam. Spend an action to clear." — with
  // no code anywhere applying it. One kind serves overheat, overload, jam AND a
  // repeater's reload, because they are the same shape: this weapon cannot be
  // swung for N rounds. `label` carries the weapon's NAME, so a jammed sidearm
  // never locks the blade in the other hand.
  | 'weapon_overheated'
  // Action-card status effects. Each one is a one-round die modifier
  // routed through rollMods() in combatRules.ts.
  | 'aiming'         // +2 on next ranged attack vs the same target
  | 'sprinting'      // -2 on attack rolls this turn (post-sprint penalty)
  | 'in_cover'       // +4 AC vs ranged (partial cover)
  | 'in_cover_full'  // ranged attacks against you auto-miss (full cover)
  | 'ready'          // +2 on the next attack (held/prepared strike); consumed on use
  // OTA-365 — 'helping' (single-player narrative no-op) and 'overwhelmed'
  // (never applied) removed.
  | 'surprised'      // -2 on first reaction; consumed once
  | 'fighting_back'  // next enemy counter resolves as opposed Fighting roll
  | 'quick_fire'    // +2 on the next ranged attack THIS turn (initiative bonus surrogate)
  // v2.4.1 (OTA 034) — successful stealth approach in combat grants
  // the player advantage on the next attack roll. Consumed on use.
  | 'stealthed'      // +5 to the next melee or ranged attack; consumed once
  // OTA 003 — timed stat boost from eating a food / drinking a
  // potion. buffStat + buffBonus carry the actual modifier;
  // effectiveStats sums every active food_buff matching the stat.
  | 'food_buff'
  // arb-fix — Sentinel "Defensive Protocols" race ability: halves incoming
  // damage while active (checked at the combat damage site). N rounds.
  | 'shielded'
  // OTA 039 — Aethercraft shape outcome. shaped_stone_ward grants a
  // one-round +4 AC. The companion-style 'golem_companion' kind was
  // retired 2026-05-25 (MECHANIC-1b OTA-011) — replaced by
  // player.golem + handleGolemCommand. Removed from the union now
  // that the unreachable handler block was deleted.
  | 'shaped_stone_ward'
  // OTA-835 — Mud Golem "Elemental Control" DEFENSIVE half: shaped Aetherstone
  // held as a ward that ABSORBS a fixed pool of incoming damage (the rolled 1d6)
  // before it reaches HP, then falls away. Distinct from shaped_stone_ward (a
  // one-round +4 AC to-be-hit bonus); this soaks damage on a hit that lands.
  | 'stone_ward'
  // 2026-05-24 — stamina-driven combat statuses. tired and exhausted
  // are auto-applied/cleared by tickPlayerStaminaStatuses based on
  // current stamina (no persistence drift). power_attack_pending and
  // defensive_stance are player-chosen tactical statuses.
  // (OTA-365 — 'well_fed' removed: it was declared but never applied or
  // read; the live food buff is 'food_buff'.)
  | 'tired'                  // stamina < 25% → -1 atk, -1 AC
  | 'exhausted'              // stamina === 0 → -2 atk, ½ damage, no active dodge/parry
  | 'power_attack_pending'   // next attack +2 to hit, +1 damage die (consumed)
  | 'defensive_stance'       // +2 AC per round; 2 stamina per round drain
  // OTA-120 — dog distract success applies this to one enemy for
  // the player's NEXT action. The next attack hit roll, dodge
  // parry, or flee from THAT enemy gets +2. Consumed when applied.
  | 'distracted'
  // OTA-795 — successful dodge payoff: the player's NEXT attack deals double
  // damage dice (buildCombatSteps peeks it; rollMods consumes it on the swing,
  // hit or miss — the window closes either way).
  | 'perfect_opening'
  // OTA-913 — successful-dodge GROUP defense: while you're still moving off a read, the
  // OTHER attackers this volley swing at +3 to your AC. Lasts one volley, then clears.
  | 'evasive'
  // OTA-1195 — AETHER TECHNIQUES (PUNCHLIST P16). Two of the four techniques need a
  // status to live in; the other two ride machinery that already exists (Veil of Ether
  // applies 'stealthed', Resonance Cascade is ordinary damage).
  //
  // ⚠ Both are deliberately shaped like statuses the game already carries, not new
  // subsystems: aether_shield is read by statusAcAdjustment exactly as
  // shaped_stone_ward is, and temporal_slip is consumed at the damage site exactly as
  // 'shielded' (the Sentinel's Defensive Protocols) is.
  | 'aether_shield'  // +3 AC while the field is held (3 rounds)
  | 'temporal_slip'  // negates ONE incoming blow entirely, then is consumed
  // ⚠ OTA-1676 (slice 4c) — a weapon's timed AC for its own wielder: the
  // Shield-Hammer's "+2 AC for 1 round after a hit", the Lightfoot Dash Wand's
  // "+3 AC for 2 rounds". Read by statusAcAdjustment through `acBonus`, so one
  // kind serves every amount the catalog prints. Combat-only, like a stance.
  | 'guard_up';

export interface StatusEffect {
  kind: StatusEffectKind;
  remainingRounds: number;
  /** Per-round damage for DOT effects (bleed, etc.). */
  perRoundDamage?: number;
  /** Display label, defaulted from kind. */
  label?: string;
  /** OTA 003 — food_buff payload. Which stat is boosted and by
   *  how much. effectiveStats reads these when summing buffs. */
  buffStat?: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma';
  buffBonus?: number;
  /** OTA-835 — remaining damage this ward can still soak (stone_ward). Each hit
   *  subtracts from it; the ward is dropped when it reaches 0. */
  absorb?: number;
  /** OTA-1676 — the AC a `guard_up` adds while it holds. */
  acBonus?: number;
}

// v2.4.1 (OTA 033) — Mud Flood Nexus main quest arc.
//
// Universal spine: every character eventually pursues the same
// end-game (recover 5 Aetheric Cores → descend the Endless Stair →
// reach the Mud Flood Nexus → choose Seal / Unleash / Preserve).
// The player's faction colors HOW they pursue each Core (route
// flavor) but the bones are shared.
//
// Phase machine:
//   hook        Arbiter has mentioned the Nexus once; no objective yet
//   revelation  Player learned about the 5 Cores (triggered on first
//               Lost Capital visit)
//   cores       Actively recovering Cores (5 to collect)
//   descent     All 5 recovered; Endless Stair is now passable
//   nexus       Player has arrived at the Mud Flood Nexus
//   choice      Awaiting the ending decision
//   ended       Player has made The Choice
export type MainQuestPhase =
  | 'hook'
  | 'revelation'
  | 'cores'
  | 'descent'
  | 'nexus'
  | 'choice'
  | 'ended';

/** ⚠⚠ OTA-1225 — 'stay' is the EARNED fourth ending. It is never offered by
 *  default and it never replaces one of the three: the base doors stay open to
 *  every character forever, so nothing is ever taken away from a player who
 *  cannot see why. See `canStayAtTheNexus` — the gate is the Arbiter's regard
 *  at its top band, which is conduct-earned and impossible to grind. */
export type MainQuestEnding = 'seal' | 'unleash' | 'preserve' | 'stay';

export interface MainQuestState {
  phase: MainQuestPhase;
  /** Lost Capital location ids of Cores already recovered. */
  coresRecovered: string[];
  ending?: MainQuestEnding;
  /** v2.4.1 (OTA 042) — fired-once flags for mid-arc twist beats. */
  twistsFired?: string[];
  /** v2.4.1 (OTA 052) — Capitals whose Core Guardian has been
   *  beaten. Distinct from coresRecovered for one purpose: a
   *  Guardian can be killed AT the moment the Core is granted in
   *  the same step, but the spawn-vs-grant decision needs a
   *  pre-kill flag. Optional — saves predating the Guardian
   *  system act as if every Capital they've already recovered
   *  also defeated the (then-nonexistent) Guardian, so legacy
   *  saves don't see fresh Guardian fights on already-cleared
   *  Capitals. */
  guardiansDefeated?: string[];
  /** ⚠ OTA-1471 — `hoursElapsed` at the moment the most recent Core was granted.
   *  Drives the settle window that stops two Capitals the atlas placed 2 tiles
   *  apart (drakova / voronov, against a 16.55-tile median across all 36 pairs)
   *  from being fought back to back on a curve keyed to kill-count. Optional,
   *  and absent means READY: a player who has taken no Core has nothing to
   *  settle from, and a save predating this OTA must never wake up newly
   *  blocked. */
  lastCoreAtHours?: number;
}

export interface PlayerCharacter {
  /** ⚠⚠ OTA-1564 — weapon NAMES whose "permanent, once" max-roll payout has
   *  already been collected. Two Legendaries in the catalog grant a permanent
   *  stat point on a perfect strike; without this the same weapon would pay out
   *  on every max roll for the rest of the character's life. Keyed by name (not
   *  instance id) so a second copy of the same weapon cannot claim it twice. */
  permanentStatWeapons?: string[];
  /** ⚠⚠ OTA-1566 — weapon NAMES that have landed their first max damage roll and
   *  UNLOCKED a permanent bypass ("Bypasses shields permanently on your first max
   *  damage roll"). After this the weapon's pierce is unconditional: it stops
   *  being an event and becomes part of what the weapon is. */
  permanentPierceWeapons?: string[];
  /** ⚠⚠ OTA-1566 — overheats banked per weapon name, for the Plasma Repeater
   *  Rifle's fuse. The owner asked for the count to be SHOWN — "add a counter
   *  number in the text after you use it" — which is what makes a bomb on your
   *  hip a decision each round instead of an ambush. */
  overheatCounts?: Record<string, number>;
  name: string;
  raceId: string;
  factionId: string;
  /** ⚠ OTA-1439 — the sex picked at creation (♂/♀ on the race step). FLAVOR
   *  ONLY: it feeds npcAddress's honorific ("sir"/"miss" from an NPC who does
   *  not know your name yet) and nothing mechanical. Optional — saves predating
   *  the pick simply keep hearing "traveler", which is what they always heard. */
  sex?: 'male' | 'female';
  /** OTA-1018 — THE REASON YOU CAME DOWN. One of engine/story's five motive
   *  ids (debt / missing / exile / calling / record). Picked at character
   *  creation; saves that predate the feature are dealt one deterministically
   *  in backfillPlayer so phase-2/3 story beats stay stable per character. */
  storyMotive?: string;
  /** OTA-1018 — the opening crawl was seen (or skipped). Old saves are
   *  backfilled to true so the intro never ambushes an existing character. */
  storyIntroSeen?: boolean;
  /** OTA-1022 — TRUE when the player themselves picked this character's
   *  motive (creation step 3, or the one-time veteran picker). FALSE/absent
   *  = the motive was dealt by backfill and the load path owes the player
   *  one "why did you come down?" ask. */
  storyMotiveChosen?: boolean;
  /** OTA-1021 — motive-drip beat ids already delivered to the feed (strict
   *  order, one-shot each; see engine/storyDrip.ts). Absent = none yet. */
  storyBeatsSeen?: string[];
  /** OTA-1163 — Jakar Nine-Halls has already explained how bounties work. One-shot,
   *  set on the first accepted contract.
   *  ⚠ DELIBERATELY NOT BACKFILLED TO TRUE ON OLD SAVES, which is the opposite of what
   *  `storyIntroSeen` does. That flag hides a cutscene an existing character has already
   *  effectively lived through; this one gates RULES THAT HAVE NEVER BEEN SHOWN TO
   *  ANYBODY — that kills count anywhere, that there is no turn-in, that accepting makes
   *  the quarry hunt you. A veteran save needs them MORE than a fresh one, not less: the
   *  owner ran a 23-tile contract on the wrong model of all three. Absent reads as false,
   *  so every existing character gets it once on their next accept. */
  bountyPrimerSeen?: boolean;
  /** ⚠ OTA-1170 — rounds until DODGE can be set again. Counts DOWN by one per action
   *  taken; 0/absent = ready. Absent on every existing save, which reads as READY — a
   *  migration must never lock a player out of a move they had yesterday.
   *  Rounds, not seconds: see engine/dodgeCooldown for why the owner's "10-15 seconds"
   *  was deliberately translated into turns. */
  dodgeCooldown?: number;
  /** ⚠ OTA-1066 — PHASE 4 DIFFICULTY, chosen on the last step of character
   *  creation and LOWERABLE MID-RUN BUT NEVER RAISABLE (engine/pressure.ts
   *  canChangeTo). Absent = DEFAULT_PRESSURE ('owed'), which is what every
   *  save written before this OTA reads as: the game exactly as it has always
   *  played, plus the two new pressure systems at their gentlest. Anybody who
   *  finds that too much can drop a tier from Settings without abandoning the
   *  character, which is the escape hatch that makes an honest default safe. */
  pressure?: string;
  /** ⚠ OTA-1113 — the CUSTOM difficulty payload: `{ intensity, systems[] }`.
   *  Present only when `pressure === 'custom'`; every preset run leaves it
   *  absent. See engine/pressure.ts normalizeCustom — it is read tolerantly,
   *  so a hand-edited or newer save cannot throw here. */
  pressureCustom?: { intensity: string; systems: string[] };
  /** OTA-1066 — the highest TIDE stage this character has been told about, so
   *  the crossing line fires once per stage rather than on every step inside
   *  it. Derived state would be wrong here: the stage is a function of hours,
   *  and "have you been told" is not. */
  tideStageSeen?: number;
  /** ⚠ OTA-1065 — PHASE 3 BRANCH STATE. forkId → optionId, one entry per
   *  question this character has answered. This is the ONLY thing the fork
   *  system persists: which fork is due, whether a card should be showing, and
   *  every downstream consequence are all DERIVED from this map plus state the
   *  run already carries (see engine/storyForks.ts dueFork).
   *
   *  That is deliberate and it is the whole migration story. The build plan
   *  flagged Phase 3 as "the one place a save-migration bug would be
   *  unrecoverable for a player mid-arc" — a pending-fork queue can be dropped
   *  by a crash or a bad backfill, and a dropped fork is a chapter of the
   *  player's story that silently never happens. A map of answers cannot be
   *  dropped that way: absent means unanswered means ask again.
   *
   *  Absent on every save older than OTA-1065, which reads correctly as "has
   *  not answered anything yet" — those characters get their questions at the
   *  next phase they qualify for. Unknown ids from a newer build are ignored
   *  rather than crashing. */
  storyChoices?: Record<string, string>;
  /** ⚠ OTA-1067 — PHASE 5. The one-shot Arbiter beats already SPOKEN
   *  ('stance:invested', 'regard:warm'), and the only thing the persona system
   *  persists.
   *
   *  His arc and his opinion of you are both PURE FUNCTIONS of the save
   *  (engine/arbiterPersona.ts) — nothing accumulates a hidden score that a bad
   *  backfill could drop or a re-entrant world tick could double-count. But
   *  "has he already said this" is genuinely not derivable from anything else,
   *  so it is recorded, exactly like tideStageSeen.
   *
   *  Absent on every save older than OTA-1067, which reads correctly as "he has
   *  not said any of it yet" — a long-running character hears the beats they
   *  have already earned, one per arrival, rather than silently missing the
   *  whole arc. Unknown keys from a newer build are inert. */
  arbiterBeatsSeen?: string[];
  /** ⚠ OTA-1068 — the weather whose stat line the player has ALREADY been
   *  told about, so the same conditions are not re-announced on every scene.
   *
   *  Found by the phases 0-5 playtest harness, which walks a run and reads the
   *  feed the player actually sees: "Weather effect — Eerie Calm: +1 WIS"
   *  appeared SIXTEEN times in one walk, because the line fired on every
   *  beginScene and OTA-994 persists weather per location for six game-hours
   *  — so an unchanged sky repeats itself at every arrival.
   *
   *  Keyed on the WEATHER, not the location: walking calm → storm → calm should
   *  say all three, and walking through four calm tiles should say it once.
   *  Absent on older saves, which reads as "not told yet" and costs one
   *  redundant line after the update rather than a silence. */
  weatherEffectSeen?: string;
  /** OTA-1021 — how The Missing side-thread ended for this character
   *  ('grave' | 'lie' | 'walker'), set when the resolution fires. Also keys
   *  the EndingScreen epilogue override. Absent = trail still open. */
  missingResolved?: string;
  /** ⚠ OTA-1223 — how THIS character's motive answered itself, for all five
   *  reasons ('settled'/'collector'/'pardon'/'choir'/'censor'/…). Set when the
   *  resolution fires; keys the EndingScreen epilogue override. Absent = the
   *  question is still open, and the open-question epilogue still reads true.
   *  `missingResolved` above stays authoritative for the Missing motive so a
   *  save that finished that trail before this OTA needs no migration. */
  motiveResolved?: string;
  stats: Stats;
  hp: number;
  hpMax: number;
  stamina: number;
  staminaMax: number;
  /** ⚠ OTA-1118 — SAVE FOSSIL. DO NOT WIRE ANYTHING TO THIS.
   *  Hunger was a real mechanic once: +1 every 8 in-game hours unfed, capped
   *  at 5, shrinking the usable stamina ceiling, reset by eating. It was
   *  REMOVED — "a hidden, unexplained mechanic whose ONLY effect was shrinking
   *  this cap; food already tops off HP and water already tops off stamina, so
   *  it just added invisible friction."
   *  Nothing writes it and nothing reads it. It survives only so a save written
   *  before the removal still parses, and `backfillPlayer` forces it to 0 on
   *  load so an old mid-hunger character comes back uncapped. In the game as it
   *  stands, EATING IS FOR HP AND STAMINA — there is no hunger to lower. */
  hungerStaminaPenalty?: number;
  /** OTA-625 — weather-damage cooldown. After a damaging weather tick this is
   *  set to WEATHER_TICK_GAP and counts down one per action; while > 0 the
   *  per-action weather roll is skipped, so hostile weather can't chip the
   *  player on back-to-back steps (it reads as periodic pressure, not an
   *  un-escapable per-step drip). Absent for legacy saves → treated as 0. */
  weatherTickCooldown?: number;
  /** OTA-801 — game-hours mark until which arrival encounters are suppressed after
   *  a boss kill (post-boss grace window). Set to hoursElapsed + POST_BOSS_GRACE_HOURS
   *  when a boss falls; beginScene suppresses the arrival roll while it exceeds the
   *  current clock, so stepping out of a just-cleared outpost doesn't drop a fresh
   *  ambush mid-loot. Absent for legacy saves → treated as 0 (no grace). */
  bossDefeatGraceUntilHours?: number;
  /** ⚠⚠ OTA-1272 — free-passage counter after walking out of an outpost. Owner,
   *  after 4 Mud Wasps killed a fresh character ON the exit tile: "a pack of
   *  enemies right outside the door is rough get at least 2 free tile moves,
   *  then whatever." Set to SAFE_EXIT_FREE_SCENES (3 = the exit scene + 2 tile
   *  moves) at every outpost-exit path; each wilderness beginScene under grace
   *  suppresses the encounter roll and decrements. Absent → 0 (no grace). */
  safeExitMovesLeft?: number;
  /** OTA-804 — unbanked "honest custom" credit toward faction standing from
   *  BUYING. Buying accrues standing as a slow afterthought: TC spent banks here
   *  and grants +1 standing per BUY_REP_TC_PER_STANDING TC, remainder carried.
   *  Absent for legacy saves → treated as 0. */
  buyRepProgress?: number;
  /** OTA-808 — MENACE: a reputation for ruling by fear, built by intimidation. Rises
   *  on every intimidate attempt (people more than animals); raises your own
   *  intimidate DC (self-blunting), draws readier encounters, and decays slowly over
   *  game-time. Shown on the character portrait. Absent for legacy saves → 0. */
  menace?: number;
  /** OTA-808 — the game-hour at which `menace` was last raised, so decay can be
   *  applied lazily (menace bleeds off MENACE_DECAY_PER_HOUR per hour since). */
  menaceUpdatedHour?: number;
  /** OTA-809 — a LOCATION LEAD talked out of a wandering NPC (persuade reward). Paid
   *  out the next time the player reaches fresh ground (beginScene on a novel tile):
   *  they follow the lead to the cache and claim it. Cleared on payout. One at a
   *  time — a fresh lead overwrites an unclaimed one. */
  /** ⚠⚠ OTA-1532 — `stepsLeft` is the DISTANCE still owed on this lead. The owner:
   *  *"the payout from nix type missions should be from a tile move, like we need
   *  to make some distance to keep them safe."* Counted down one per overland tile
   *  step; the cache turns up at zero. Absent on leads granted before 1532 —
   *  those pay on the first step, rather than being stranded by a field they
   *  never got. */
  pendingLead?: { hint: string; rewardTc: number; rewardItem?: string; stepsLeft?: number } | null;
  ac: number;
  tc: number;
  corruption: number;
  inventory: InventoryItem[];
  factionStanding: FactionStanding[];
  currentLocationId: string;
  activeQuests: Quest[];
  /** Set when HP hits 0; the character is barred from play until a Resurrection Gem revives them. */
  dead?: boolean;
  /** OTA-236 — Arbiter-assigned titles the player has earned. Each
   *  entry is an `id` from `app/data/lore/arbiter-titles.json`.
   *  Surfaced on the Character Screen's TITLES section. Phase 1 is
   *  display-only with no auto-unlock triggers; future OTAs wire
   *  the titles' requirement strings (e.g. "Discover three Tartarian
   *  relics") to runtime trackers. arb45 wires the Tier-A/B titles. */
  earnedTitles?: string[];
  /** OTA-848 — provenance for earned titles: WHEN each was awarded, so the
   *  Character screen can show "Earned: Day N" on tap. `atHours` is in-game
   *  time (hoursElapsed at award); `atMs` is the real wall-clock stamp. Titles
   *  earned before this shipped have no entry — the UI shows an honest "before
   *  this was recorded" fallback rather than a fake date. Parallel to
   *  earnedTitles (which stays the source of truth for WHICH are earned). */
  titleLog?: Array<{ id: string; atHours: number; atMs: number }>;
  /** arb45 — running counters the title-earning engine reads to award
   *  Arbiter titles (relics found, sentinels defeated, storms survived,
   *  etc.). See engine/titles.ts. Absent on legacy saves → treated as all
   *  zero. */
  titleProgress?: import('./titles').TitleProgress;
  /** arb48 — active run through the Labyrinth of Shadows (Iskan-Veil). Set
   *  while the player is inside the maze; cleared on finish or LEAVE. Absent
   *  except during a run. See engine/labyrinth.ts + the Wayfarer challenge. */
  labyrinthRun?: import('./labyrinth').LabyrinthRun;
  /** arb50 — one-shot outcomes for the content-review Tier-C title trials
   *  (Speaker @ Red Tower, Warden @ Sinking Cathedral). Keyed by challenge id.
   *  Present once the player has COMMITTED an attempt — scouting never writes
   *  here. A 'failed' entry permanently locks that trial (you get one chance).
   *  See engine/titleChallenges.ts. */
  challengeAttempts?: Record<string, 'failed' | 'succeeded'>;
  /** arb53 — active Guild Broker mission (Parley Ground): the two factions
   *  being brokered. Set when the player ACCEPTS the parley offer; `done` once
   *  the alliance is sealed. See engine/broker.ts. */
  brokerMission?: import('./broker').BrokerMission;
  /** OTA-656 — set when the player DECLINES the stumbled-onto parley offer, so
   *  approaching the leaders again doesn't re-pop the accept/decline prompt on
   *  every ambient action. Cleared by an explicit PARLEY (re-opens the offer) or
   *  by accepting. Transient nudge state. */
  brokerOfferDeclined?: boolean;
  /** OTA-195 — one-shot fusion permit granted by a Fusing Crucible
   *  travel encounter. Cleared when the player runs the fuse action.
   *  Without this gate, the fuse verb would be usable anywhere; the
   *  encounter is the discovery moment that earns the right. */
  fusionPending?: boolean;
  /** OTA-695 — a live provocable NPC travel encounter (e.g. the Aetherkin
   *  mourner) is offering its temptation ("reach for a coin and you will
   *  not reach it twice"). Set from the encounter's data-driven `provoke`
   *  block when it lands; cleared on the next travel step OR when the player
   *  provokes it — which spawns the named enemy + applies the corruption
   *  and narration the CONTENT authored. Fully data-driven: the engine
   *  holds no encounter-specific enemy name or prose. */
  pendingProvoke?: {
    enemy: string;
    corruption?: number;
    nouns: string[];
    line: string;
    system_line?: string;
  };
  /** OTA-718 — recipes the player has LEARNED. Only the "cool" rare/legendary-
   *  result recipes are gated by this (isDiscoverableRecipe); basic recipes are
   *  always craftable. Discovered by reading recipe/blueprint notes and from
   *  rare loot. undefined on a pre-feature save → grandfathered on load from
   *  owned results so nothing already-earned is ever taken away. */
  knownRecipes?: string[];
  /** OTA-211 — Aether Dust food additive. Eating a food laced with
   *  Aether Dust grants a +3 buff to the player's chosen stat for
   *  5 real-world minutes. Stored as a wall-clock expiry (Date.now()
   *  ms) so it survives save/load + scene transitions without
   *  needing to convert in-game hours back to wall time.
   *  effectiveStats reads the buff and applies the bonus IF
   *  Date.now() < expiresAtMs. */
  aetherBuff?: { stat: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma'; bonus: number; expiresAtMs: number };
  /** OTA-216 — directional-find promise. Investigate occasionally
   *  hints at a specific thing in a cardinal direction ("two
   *  stretches east, a Reclaimer caravan in the silt"). The
   *  stepDirection handler watches for the matching direction and
   *  spawns the named archetype + hint noun the next time the
   *  player travels that way. Cleared after firing or if the
   *  player travels in a non-matching direction first (the hint
   *  expires — investigate something new). */
  pendingDirectionalFind?: { direction: 'N' | 'E' | 'S' | 'W'; archetype: string; hintNoun: string };
  /** Lifetime counters; thresholds trigger stat growth. */
  milestones?: PlayerMilestones;
  /** OTA 058 — Skyrim-style use-based stat progression. Each stat
   *  accumulates "progress" from every action that uses it (combat
   *  attack with that stat, skill check, climb, cast, etc.). When
   *  progress hits 100, the base stat increments by 1 and progress
   *  rolls over the overshoot. Default threshold 50 per +1 — see
   *  engine/statTraining.ts STAT_TRAIN_THRESHOLD. */
  statProgress?: Partial<Record<keyof Stats, number>>;
  /** v2.4.1 (OTA 033) — Mud Flood Nexus main quest progress. Optional
   *  because legacy saves predate the arc; backfilled on hydrate. */
  mainQuest?: MainQuestState;
  /** HANDOFF #13 — first-cut companion system. A single NPC follower
   *  the player recruits from a vendor scene. Persists across scenes.
   *  Currently narrative-only; mechanical effects (advantage dice on
   *  skill checks, combat assist) are a follow-on session. Keep
   *  optional so old saves keep loading. */
  companion?: {
    name: string;
    title?: string;
    factionId?: string | null;
    recruitedAt: number;  // hoursElapsed snapshot
  } | null;
  /** HANDOFF #15b — current hub room id when the player is at the
   *  hand-authored hub location. Null/undefined when wandering the
   *  procedural world. Set on first hub entry (defaults to entry
   *  room), cleared on "leave outpost". */
  hubRoomId?: string | null;
  /** OTA 039 — Hollowed corruption-tier forced-Purifier counter.
   *  Increments on every outdoor cardinal step while Hollowed; when
   *  it hits 5, the engine spawns a Mud Monarch Purifier and resets
   *  to 0. Defaults to 0; legacy saves load as undefined and the
   *  step handler treats undefined as 0. */
  stepsSinceLastPurifier?: number;
  /** Currently-equipped weapon and armor (by catalog name). */
  equipped?: PlayerEquipped;
  /** Active combat status effects; tick down each player action. */
  statusEffects?: StatusEffect[];
  /** arb-fix — race ability cooldowns: ability id → the in-game DAY it was
   *  last used. A daily ability is ready again when that day < the current
   *  day (Math.floor(hoursElapsed/24)+1). */
  abilityCooldowns?: Record<string, number>;
  /** OTA-835 — Unknowing Masses "Beginner's Luck": a one-shot reroll token set
   *  by the daily race ability and burned the next time a difficulty roll FAILS
   *  (resolveRollStep). A plain flag (not a status) so it survives scene changes
   *  and never ticks down — the daily cooldown is what gates re-arming it. */
  luckyRerollReady?: boolean;
  /** OTA-835 — Unknowing Masses "Curious Mind": flips true the first time the
   *  character is exposed to Tartaria's secrets (a relic/ancient target or a
   *  ruin). Once awakened it grants a persistent +2 INT / +2 WIS via
   *  effectiveStats — the flavor's "after first exposure" stat awakening. */
  curiousMindAwakened?: boolean;
  /** Hours elapsed since the character entered Tartaria. Day = 24 hours. */
  hoursElapsed?: number;
  /** OTA-612 — persistent vendor-theft "heat". Each steal attempt (success or
   *  caught) raises it; it adds +2 per point to the steal DC and decays ~1 per
   *  in-game hour. Unlike the per-vendor stealAttempts it survives scene
   *  re-entry, so leave→return→steal can't reset the difficulty. */
  stealHeat?: number;
  /** In-game hour the steal-heat was last stamped (for decay). */
  stealHeatHours?: number;
  /** arb107 — monotonic counter bumped each time the player's macro
   *  location changes between scenes (i.e. an actual named-location
   *  travel, not room-to-room movement inside an outpost). Outpost rooms
   *  stamp this at loot-clear time and restock only when it has advanced
   *  (player left to another named location and came back). */
  macroVisitSeq?: number;
  /** arb107 — the macro location id observed at the previous beginScene,
   *  used to detect a location change and bump `macroVisitSeq`. */
  lastBeganLocationId?: string;
  /** OTA-739 — the armor slots most recently produced by the Crucible (newest
   *  first, capped at 2). The deterministic fusion slot picker steps past these
   *  so consecutive forges rotate through slots instead of repeating one. */
  recentFusedArmorSlots?: string[];
  /** arb107 — in-game hour at which `rest` last paid out its WIS-train +
   *  trinket reward. Gates those rewards behind a per-day cooldown so the
   *  player can't farm WIS / free trinkets by spamming short rests. */
  lastRestRewardAtHours?: number;
  /** 2026-05-25 OTA-046 — unix ms when this player's last persist
   *  fired. Approximates "session ended at" because persist runs on
   *  every meaningful action. Used on slot-load to compute real-time
   *  elapsed since last play — if ≥6 hours, the loadSlot path fires
   *  one "while you were away" beat so the world feels like it has
   *  breathed without the player. */
  lastSessionEndedAt?: number;
  /** 2026-05-26 OTA-057 — sliding window of recent tile keys
   *  (`${locationId}:${mapX}:${mapY}`), capped at 20 entries.
   *  stepDirection gates the WIS train + the STR-passive train on
   *  tile novelty against this window: a step landing on a tile
   *  already in history doesn't train. Kills the pacing-between-
   *  two-screens WIS exploit (both tiles always in the window, no
   *  train) while leaving genuine long-traverse exploration to
   *  still train. Optional — older saves default to empty so the
   *  first 20 steps after load are all novel by construction. */
  recentTileHistory?: string[];
  /** IDs of faction quests the player has accepted but not finished.
   *  LEGACY: pre-refactor saves used this flat string array. New saves
   *  populate `activeFactionQuests` (with stage tracking) instead.
   *  backfillPlayer migrates the legacy list into the new shape on
   *  load. The flat array is kept here so old serialized state still
   *  deserializes cleanly. */
  activeFactionQuestIds?: string[];
  /** Active faction quests with per-stage progress. Mirrors activeHunts
   *  / activeMysteries / activeStorylines so all four contract types
   *  share the same accept / advance / turn-in flow. */
  activeFactionQuests?: { id: string; stage: number; postedByFaction: string; acceptedAt: number; acceptedAtCell?: { x: number; y: number }; escort?: EscortPool; tracked?: boolean }[];
  /** Mission ROUTE CHAIN in progress (set by ROUTE TO on a contract). The engine
   *  courses to the objective, then auto-courses to the turn-in once the work is
   *  done. Cleared on turn-in, abandon, deactivate, or a manual divert. */
  routedMission?: { id: string; phase: 'to_objective' | 'to_turnin' } | null;
  /** ⚠ OTA-1304 — the Great Climb the player has set course for, so the tower
   *  reads as "the mission you're on" the way every other routed kind does. */
  routedClimbId?: string | null;
  /** IDs of faction quests the player has turned in. */
  completedFactionQuestIds?: string[];
  /** Active monster hunts with per-stage progress. `tracked === false` = the
   *  player has DEACTIVATED (paused) this hunt: it stays on the slate but its
   *  stages don't auto-advance until re-activated (per-contract, independent of
   *  other hunts). Absent/true = active. */
  activeHunts?: { id: string; stage: number; postedByFaction: string | null; acceptedAt: number; acceptedAtCell?: { x: number; y: number }; tracked?: boolean }[];
  /** IDs of hunts that have been turned in. */
  completedHuntIds?: string[];
  /** OTA-850 [faction bounty] — LEGACY single active kill-bounty. Superseded by
   *  activeBounties (OTA-859); still read on load and migrated into the array so old
   *  saves don't lose an in-progress contract. New writes go to activeBounties. */
  activeBounty?: import('./factionBounty').FactionBounty;
  /** OTA-859 [bounty board] — every kill-bounty the player currently carries (up to a
   *  small cap). A favored faction pays to hunt N of a rival's members at the rival's
   *  outpost. Accepting routes the player there; each kill of a targetFactionId
   *  combatant ticks EVERY matching bounty's progress; a bounty that completes pays out
   *  and drops off the slate. Holding several lets the player grind faction standing. */
  activeBounties?: import('./factionBounty').FactionBounty[];
  /** Active mystery-object quests. `tracked === false` = paused (see activeHunts). */
  activeMysteries?: { id: string; stage: number; postedByFaction: string | null; acceptedAt: number; acceptedAtCell?: { x: number; y: number }; tracked?: boolean }[];
  /** IDs of mystery quests turned in. */
  completedMysteryIds?: string[];
  /** Active long-form faction storylines (5-10 step). `tracked === false` = paused. */
  activeStorylines?: { id: string; stage: number; postedByFaction: string | null; acceptedAt: number; acceptedAtCell?: { x: number; y: number }; tracked?: boolean }[];
  /** IDs of storylines completed. */
  completedStorylineIds?: string[];
  /** Active Whispers — informal NPC-to-NPC tips the player has
   *  overheard, not posted contracts. Time-of-day + tile-targeted,
   *  expire after a window (default ~48 in-game hours). The
   *  Pittsburgh loop: bar-patron drops a tip, player follows it to
   *  a rendezvous, finds a fetch quest, returns, gets paid, walks
   *  home, gets jumped. Tracked per-character, separate from
   *  Contracts so a Whisper feels like rumour, not employment. */
  activeWhispers?: WhisperRecord[];
  /** IDs of Whispers the player has resolved (any terminal stage:
   *  completed, expired, declined). Prevents re-planting the same
   *  whisper twice on the same character. */
  completedWhisperIds?: string[];
  /** ⚠⚠ OTA-1581 — THE MISSION CONVERSATION CARDS IN FLIGHT, keyed
   *  `family:missionId:stageIndex`. One entry per stage the player has actually
   *  stood in front of; absent means "never opened", which is the correct
   *  reading of every save written before this OTA.
   *
   *  ⚠ It carries `persuadeSpent`, and that is the point. Owner: *"you only get
   *  one chance at persuade — after that it's always the fight. even if you flee
   *  and come back."* A flag on the card instance would reset on every re-entry,
   *  which is precisely the rule he ruled out. */
  missionEncounters?: Record<
    string,
    {
      key: string;
      phase: 'opening' | 'fighting' | 'aftermath' | 'resolved' | 'fled';
      persuadeSpent: boolean;
      mocked: boolean;
    }
  >;
  /** ⚠⚠⚠ OTA-1581 — THE BODY COUNT PER POST, AND IT OUTLIVES THE MISSION.
   *  Keyed by the ROLE ("the Dynasty enforcer"), never by the person, and never
   *  cleared. The owner's rules 3 and 7 pull against each other — the people
   *  exist only while their mission is live, yet a successor in a LATER mission
   *  has to know what you did in an earlier one. This map is the resolution: the
   *  person is per-mission, the post's history is permanent, and it prices every
   *  future conversation with whoever holds that post. */
  roleKills?: Record<string, number>;
  /** ⚠ OTA-1190 (PUNCHLIST P13) — the heart of the Labyrinth has been reached ONCE.
   *  The maze is fully re-enterable (`enterLabyrinth` carries no attempt gate), so the
   *  lore ending and its keepsake are gated on this rather than paid per run — a
   *  repeatable loop with a repeatable reward is a farm, which is the one thing the
   *  fix for an ends-in-nothing must not become. Absent on an old save reads as
   *  "not yet seen", so a character who already walked it gets the ending next time. */
  labyrinthHeartSeen?: boolean;

  /** ⚠ OTA-1191 — AETHER TECHNIQUES the character has learned. Ids from
   *  `engine/aetherTechniques.ts`. Absent on an old save reads as "knows none", which is
   *  correct: they are acquired, never granted at creation. */
  /** ⚠ OTA-1198 (PUNCHLIST P17) — the lore concepts this character has actually had
   *  answered, by id. `titleProgress.loreRead` counts DISTINCT entries here rather than
   *  every ask, so Scholar of Forgotten Lore means three different things read, not one
   *  thing read three times. Absent on older saves; `?? []` covers them. */
  loreConceptsRead?: string[];
  knownTechniques?: string[];
  /** ⚠ OTA-1191 — per-technique practice count, keyed by technique id (owner: growth is
   *  per-technique, not one global aether skill, so a character specialises into what they
   *  actually practise). Only MEANINGFUL uses increment it — see `practiceCounts`. */
  techniqueProficiency?: Record<string, number>;
  /** Deterministic seed used to generate this character's procedural world map. */
  mapSeed?: string;
  /** Last spot key the player dug at (`locationId:x:y`). Must move away
   *  before digging again — prevents stand-still spam farming. */
  lastDugSpot?: string;
  /** True after the player has finished (or skipped) the new-player intro
   *  tutorial. Set once, never reset; ensures the walkthrough only runs
   *  on the first session of a fresh character. */
  hasSeenIntro?: boolean;
  /** Story-fragment ids the player has collected. Each fragment id maps
   *  to an entry in app/data/collectables/character_stories.json under
   *  one of the 10 character stories. The Collectables tab in
   *  ContractsScreen reads this list to compute per-character progress
   *  and reveal which fragments are still in the field. */
  collectables?: string[];
  /** Current (x, y) on the procedural grid. Defaults to map center.
   *  arb47 — mapX/mapY are the player's coordinate on the RE-CENTERED VISUAL
   *  map (current location at CENTER). They are now a DERIVED display value,
   *  kept in sync with the authoritative absolute position below. Surveys and
   *  the thematic map still read them; real movement + distance do not. */
  mapX?: number;
  mapY?: number;
  /** arb47 — the player's PERSISTENT ABSOLUTE cell on the install-fixed canon
   *  grid (worldMap canonicalPositions). This is the single source of truth for
   *  where the player is: cardinal steps move it by exactly ±1, routing walks it
   *  toward a target's fixed canon cell, and travelTo snaps it to a location's
   *  canon cell — it NEVER warps or re-anchors when a named tile is crossed. So
   *  distance to any location is always |grid − canonCell| and 5 paces south then
   *  5 north returns to the exact same cell. Optional so legacy saves backfill it
   *  (from their current location's canon cell) on load. */
  gridX?: number;
  gridY?: number;
  /** OTA-510 — one-shot dev placement marker. When absent, backfillPlayer snaps
   *  the player to the cell ONE tile west of the Hidden Market (so the next
   *  auto-route to it reads exactly 1) and sets this true so it fires only once
   *  and never yanks the player back on later loads. */
  _placedWestOfHiddenMarket510?: boolean;
  /** OTA-784's `_freshMarketEntry784` / `_skipMarketAutoEnterOnce` repair flags
   *  were removed in OTA-774 (the failed-OTA save reset they served is done);
   *  old saves may still carry the keys — they're ignored. */
  /** Last cardinal direction the player traveled. Lets "continue" /
   *  "keep going" / "onward" repeat the previous step without forcing the
   *  player to retype the direction. Cleared on travelTo() to a named
   *  destination since the player has explicitly broken the cardinal flow.
   *  String-typed (not Direction) to avoid pulling in worldMap.ts here. */
  lastTravelDirection?: 'north' | 'east' | 'south' | 'west';
  /** v2.4.1 (OTA 049) — multi-step travel to a named location.
   *  Set when the player issues `travel to <city>` and replaces the
   *  cardinal-direction buttons with CONTINUE TRAVEL / STOP TRAVEL.
   *  Each CONTINUE tap steps ONE tile toward the target on the
   *  procedural grid. Cleared when the player either arrives (the
   *  step lands on the target tile and travelTo fires) or taps
   *  STOP TRAVEL. */
  // OTA-126 — `distanceRemaining` snapshots the tile count at
  // travel-start and decrements once per step (continueTravel and
  // the first setTravelCourse step). The badge reads this directly
  // instead of recomputing Manhattan distance from coords — the
  // worldMap regenerates with `currentLocationId` at center on
  // every step, so the destination's coords (and therefore the
  // Manhattan distance) shift when the player crosses a location
  // boundary. Playtester report: "23 spaces → counted down to 2,
  // crossed into the mud flats, jumped back to 26 spaces."
  // Optional so older saves don't crash; missing field falls back
  // to the legacy Manhattan calc in the ExplorationScreen badge.
  travelTarget?: { locationId: string; distanceRemaining?: number };
  /** OTA-465 — intra-area "set course" to a whisper/lead objective TILE
   *  (mapX/mapY), distinct from travelTarget (which routes to a named
   *  location). Drives the same travel-row continue/stop UX, but steps
   *  cardinally within the current area toward the coordinate. */
  /** OTA-1542 — courses aim at ABSOLUTE cells now (gridX/gridY); the legacy
   *  mapX/mapY pair survives so a save captured mid-course still resumes (it is
   *  read once, in the current frame — exactly what it meant before). */
  whisperCourse?: { gridX?: number; gridY?: number; mapX?: number; mapY?: number; label: string } | null;
  /** 2026-05-25 [MECHANIC-1b] — active golem sidekick. Persists on
   *  the player so it survives cardinal moves + scene transitions
   *  (the "follows until needed again" requirement). null when no
   *  golem is summoned or after dismissal / death. Named 'golem'
   *  to avoid colliding with the existing optional 'companion'
   *  NPC follower field above. */
  golem?: Companion | null;
  /** OTA-120 — Dog Companion. One per save, acquired via a rescue
   *  scenario (or the puppy-vendor / rubble-puppy safety net). null
   *  on character creation and on legacy saves (backfilled to null
   *  in loadSlotIntoGame). See DogCompanion interface above and the
   *  framework spec in HANDOFF.md §0.A. */
  dog?: DogCompanion | null;
  /** OTA-915 — latches the one-time dead/abandoned-dog revive migration so it fires exactly
   *  once ever. A dog lost AFTER this OTA stays lost (death mechanic intact going forward). */
  /** @deprecated OTA-926 — the one-time dog-revive migration was retired; this flag is now
   *  inert (kept for save/test back-compat only; nothing reads it). */
  /** ⚠⚠ OTA-1383 — BOTH NAMES ARE DECLARED, ON EVERY LINE, and that is the
   *  point. This one latch was written into player saves under TWO keys:
   *  `dogRevivedOta915` on the golem and steam lines, `dogRevivedOta938` on
   *  HAL and html. The split was deliberate — HAL's ledger records it was
   *  *"caught and NOT copied: a PERSISTED field"* — because renaming a key
   *  already on disk orphans it.
   *
   *  So the fix is not to pick one. Declaring both converges the TYPE across
   *  all four products while leaving every existing save readable, and any
   *  future reader must accept either. Inert today: the dog loads as saved
   *  since OTA-938 and nothing reads these. */
  dogRevivedOta915?: boolean;
  dogRevivedOta938?: boolean;
  /** OTA-918 — latches the one-time owner Mud Siren rematch (refund + re-stage) so it fires once. */
  /** @deprecated OTA-925 — the rematch was reverted and its load-path wiring removed; this
   *  flag is inert (kept for save back-compat only; nothing reads or writes it). */
  mudSirenRematchOta941?: boolean;
  /** OTA-919 — latches the one-time owner clean-slate prep (full HP/stamina, gear repaired,
   *  throwables/consumables topped up) that pairs with the OTA-941 rematch. */
  /** @deprecated OTA-925 — the rematch was reverted and its load-path wiring removed; this
   *  flag is inert (kept for save back-compat only; nothing reads or writes it). */
  mudSirenRematchOta942?: boolean;
}

/** OTA-120 — Dog Companion. A one-at-a-time canine sidekick the player
 *  rescues early-game (one of 4 scenarios: smelter / wagon / cellar /
 *  snare). Lives on player.dog. Survives across scenes, takes a slice
 *  of enemy retaliation in combat, follows on cardinal moves + travel,
 *  decouples on climbs, sniffs out hidden investigation nouns on scene
 *  entry, eats food (raises loyalty), abandons at loyalty 0, and dies
 *  in combat if HP hits 0 mid-fight-lost. Coexists with golems
 *  side-by-side (the earlier mutex rule was overridden). See HANDOFF.md
 *  §0.A "Dog Companion system" for the full design framework. */
export type DogStartingProfile = 'mongrel' | 'shepherd' | 'hound' | 'mutt' | 'puppy';
export type DogStatus = 'with_player' | 'waiting_at_base' | 'abandoned' | 'dead';
export interface DogCompanion {
  id: string;
  /** Player free-text, capped at 16 chars. */
  name: string;
  /** Player free-text, capped at 24 chars. Pure flavor — no mechanical effect. */
  breed: string;
  /** 3-token answer + derived pronoun. The raw input is preserved for
   *  any flavor narration that wants to echo what the player typed
   *  ("whatever Marrow is, he's down"). */
  sex: {
    raw: string;
    pronoun: 'he' | 'she' | 'they';
  };
  /** Starting profile from the rescue scenario; drives baseline stats.
   *  mongrel = balanced (10/10/10), shepherd = +STR, hound = +DEX,
   *  mutt = +INT, puppy = lower across the board (8/9/9). */
  startingProfile: DogStartingProfile;
  hp: number;
  hpMax: number;
  stats: { strength: number; dexterity: number; intelligence: number };
  statProgress: { strength: number; dexterity: number; intelligence: number };
  /** 0-100; decays without feeding. Thresholds 50/30/15/0 fire
   *  escalating Arbiter beats; 0 = abandoned permanently. */
  loyalty: number;
  /** Game-clock hour of the last feed. lastFedAtHour and the player's
   *  hoursElapsed drive the -1-per-4-hour decay. */
  lastFedAtHour: number;
  /** Poplar Anvil — game-clock hour the dog was knocked down to 0 HP and
   *  benched (waiting_at_base, hp 0). A downed dog that isn't healed
   *  above 0 within DOG_BLEED_OUT_HOURS bleeds out and dies for real
   *  (status → dead, puppyVendorOwed flips). Cleared once it's healed
   *  back up so a later knockdown restarts the clock. undefined = not
   *  currently bleeding out. */
  downedAtHour?: number;
  /** Poplar Anvil — latches the mid-window "he's fading, feed him now"
   *  Arbiter reminder so it fires once per down-event, not every tick.
   *  Cleared alongside downedAtHour when the dog is healed back up. */
  bleedWarned?: boolean;
  /** OTA-915 — how many escalating bleed-out beats have fired this down-event (0..3, at
   *  1/4, 1/2, 3/4 of the window). Latches so each fires once. Cleared when healed back up. */
  bleedWarnStage?: number;
  /** Poplar Anvil — lowest loyalty band already warned about (50/30/15).
   *  Latches so each escalating "your dog is drifting" Arbiter beat
   *  fires once per crossing, not every tick. undefined = none warned
   *  yet (treated as 101). */
  loyaltyBeatFloor?: number;
  /** The dog's worn vest. `vest` is the display/catalog name (AC comes from the
   *  catalog by name); `vestId` (OTA-696) is the exact inventory instance so a
   *  FUSED vest's uniqueStats resolve to the right copy and the inventory badge
   *  marks the piece actually worn when you own two same-named vests. Optional —
   *  legacy saves have only the name and fall back to first-by-name. */
  equipped: { vest: string | null; vestId?: string | null };
  /** with_player follows; waiting_at_base = at the climb origin or
   *  in 24h auto-heal recovery; abandoned = walked off at loyalty 0;
   *  dead = combat-death (puppyVendorOwed flag flips true). */
  status: DogStatus;
  /** Latched true once after the dog co-activates with a golem the
   *  first time, so the "wide arc" flavor only fires once per save. */
  coexistedWithGolem?: boolean;
}

/** OTA-120 — three-step Arbiter onboarding state machine. ALL player
 *  input routes through the onboarding handler when this is non-null
 *  (the normal verb parser is skipped). Each stage fills one field,
 *  advances, and finalizes after the sex stage. Once finalized, ALL
 *  four rescue hooks die globally — the player can't re-roll. */
export type DogOnboardingStage = 'breed' | 'name' | 'sex';
export interface PendingDogOnboarding {
  stage: DogOnboardingStage;
  rescueData: {
    scenario: 'smelter' | 'wagon' | 'cellar' | 'snare' | 'puppy_vendor' | 'puppy_rubble';
    startingProfile: DogStartingProfile;
  };
  breed?: string;
  name?: string;
}

/** 2026-05-25 [MECHANIC-1b] — Golem sidekick companion. Summoned
 *  via the Aethercraft `summon <type> golem` path, commanded via a
 *  golem QuickBtn in combat. Survives until HP ≤ 0 or until the
 *  player dismisses. */
export type GolemKind = 'mud_golem' | 'iron_golem' | 'aether_golem' | 'crystal_golem';
/** OTA-467 — trainable golem stats, mirroring the dog's progression. POWER
 *  boosts the golem's to-hit (full) and damage (half); RESILIENCE reduces the
 *  damage it takes from retaliation. */
export type GolemStatKey = 'power' | 'resilience';
export interface Companion {
  kind: GolemKind;
  /** Display label. "Mud Golem" / "Iron Golem" / etc. (or a player-given name). */
  name: string;
  hp: number;
  hpMax: number;
  /** Damage dice — parsed by rollDie / inline. "1d8", "1d6", "1d10". */
  attackDie: string;
  /** Flat damage modifier added on top of the die roll. */
  attackMod: number;
  damageType: 'bludgeoning' | 'slashing' | 'piercing' | 'aetheric';
  /** Flat bonus added to the d20 attack roll (Crystal Golem has +2). */
  hitBonus: number;
  /** ISO ms — diagnostic only. */
  summonedAt: number;
  /** OTA-467 — trained stats. Optional for backward-compat with golems summoned
   *  before this OTA (absent → treated as 0). A kept-alive golem grows these. */
  stats?: { power: number; resilience: number };
  statProgress?: { power: number; resilience: number };
  /** OTA-478 "Golem Armaments" — a melee weapon the golem wields (one craftable
   *  type per golem kind). Its dice replace the innate attackDie; a coated weapon
   *  lets the golem apply the coating on hit. Carries its own coating + durability
   *  like any weapon instance. Absent → the golem fights with its innate attack. */
  weapon?: InventoryItem | null;
}

export type LogChannel = 'player' | 'arbiter' | 'system' | 'world' | 'combat' | 'reward' | 'cognitive' | 'debug' | 'feedback' | 'dog_quest' | 'mission';

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
  /** HANDOFF #14b — when set, the dice prompt rolls 2 dice on this
   *  step instead of `count` and keeps the higher ('advantage') or
   *  lower ('disadvantage') one. Used for player attack rolls when
   *  the player is aiming (advantage) or surprised (disadvantage).
   *  Mirrors the defense-side handling in applyEnemyCounter. The
   *  bonus / target arithmetic still applies to the kept die. */
  rollMode?: 'advantage' | 'disadvantage';
  /** Optional source-of-truth label so the dice card can name WHY
   *  the player has advantage/disadvantage on this swing. Surfaces
   *  next to the kept die in the post-roll readout. */
  rollModeLabel?: string;
  /** Set true when the attack step rolled a natural 20 — the
   *  attack hits regardless of bonuses, and the follow-up damage
   *  step doubles its dice (classic crit). Also set on natural-1
   *  to force a miss; the damage step is skipped. */
  critical?: boolean;
  /** ⚠ OTA-1649 — set on the DAMAGE step when this swing was launched from
   *  `stealthed`. It has to be CARRIED rather than re-read at damage time: the
   *  status is a one-shot, stripped by `consumeOnResolve` the instant the
   *  ATTACK step resolves, and `pendingRolls` (which holds that list) is nulled
   *  before `concludeRolls` ever runs — so by the time damage is added up there
   *  is nothing left on the player to read. Stamped at build time, while the
   *  truth is still there. Read by the thief's-ring multiplier; the +5 to-hit
   *  and the dice-doubling backstab are untouched by it. */
  fromStealth?: boolean;
}

export interface PendingRollState {
  actionText: string;
  steps: RollStep[];
  currentStep: number;
  // OTA-125 — snapshot of player.hoursElapsed + stamina BEFORE the
  // skill-check time/stamina charge was applied. Set when the roll
  // is created so cancelPendingRolls can refund the cost — players
  // who back out of a flee / cast / stealth / etc. modal shouldn't
  // lose 15 minutes and stamina for nothing.
  refundOnCancel?: { hoursElapsed: number; stamina: number };
  /** OTA-796 — one-shot statuses to strip when the ATTACK step actually
   *  resolves (perfect_opening / stealthed / ready / distracted / aiming /
   *  quick_fire / surprised / power_attack_pending). They used to be stripped
   *  at prompt-BUILD time, so tapping CANCEL on the dice modal silently
   *  destroyed earned buffs — and let a player shed the 'surprised' penalty
   *  by cancel + re-attack without ever rolling. */
  consumeOnResolve?: string[];
  /** OTA-1694 — Date.now() when THIS step was put in front of the player
   *  (set on creation and re-stamped on every step advance). Read by the dice
   *  clock (diagnostics/rollTiming) against the modal's shown/tapped stamps. */
  openedAt?: number;
}

/**
 * OTA-263 — One stage's worth of in-modal narration for the
 * HookContinueModal. Mirrors the same content the world feed gets
 * (label + narration line + optional arbiter quote + optional ✦
 * reward summary), so the player has the full thread arc in the
 * popup without having to read past the dimmed scrim behind it.
 */
export interface HookContinueStage {
  /** "★ STORY THREAD (step 2)" or "★★ STORY THREAD COMPLETE" */
  label: string;
  /** The stage's narration text (outcome.line). */
  line: string;
  /** Optional Arbiter quote attached to this stage. */
  arbiterLine?: string;
  /** Optional "✦ <summary>." string for inline reward effects fired
   *  this stage (item grant, faction shift, etc). */
  reward?: string;
}

export interface GameLogEntry {
  id: string;
  ts: number;
  channel: LogChannel;
  text: string;
  meta?: Record<string, unknown>;
}

/** OTA-1151 — one exchange with one NPC: what you asked and what they said.
 *  Stored rather than derived, because the log window that used to carry it
 *  closes with the conversation and the log itself is capped. */
export interface TalkTurn {
  /** The topic's authored label — the words on the button the player tapped. */
  q: string;
  /** Their reply, exactly as it went to the feed. */
  a: string;
  ts: number;
}

/** OTA-1688 — one fact about what the player did on a piece of ground. */
export type DeedKind = 'visited' | 'walked_out' | 'fled';
export interface Deed {
  kind: DeedKind;
  /** Wall clock, for pruning. */
  ts: number;
  /** In-game hour it happened (player.hoursElapsed). */
  hour: number;
  missionId?: string;
  stage?: number;
  /** The mission's title, for the readers that phrase it. */
  title?: string;
  /** The person walked out on, or the body fled from. */
  who?: string;
  /** Bodies of the stage's spawn still standing when the player fled. */
  n?: number;
  /** The apex's hit points when the player fled, and its full pool. */
  hpLeft?: number;
  hpMax?: number;
}

export interface MemorableEvent {
  id: string;
  kind:
    | 'faction_join'
    | 'death_revive'
    | 'rare_kill'
    | 'theft_caught'
    | 'first_travel'
    | 'first_kill'
    | 'first_quest'
    // v2.4.1 (OTA 052) — main-quest milestones for the Contracts
    // Milestones tab. Recorded by the gameStore's main-quest
    // pipeline so the player can review the arc in one place.
    | 'mq_capital_first_visit'
    | 'mq_guardian_spawned'
    | 'mq_guardian_defeated'
    | 'mq_guardian_fled'
    | 'mq_core_recovered'
    | 'mq_descent_unlocked'
    | 'mq_nexus_reached'
    | 'mq_ending_chosen'
    // OTA-843 [Chronicle] — the character first crossed INTO a worse corruption tier
    // (Tainted / Corrupted / Hollowed). Records the aether's arc on the soul so the
    // Chronicle can show how far they've fallen, not just the current number.
    | 'corruption_tier'
    // ⚠ OTA-1190 (PUNCHLIST P13) — the player stood at the heart of the Labyrinth of
    // Shadows and learned what Iskan-Veil's masking Core actually does. Recorded so
    // the Arbiter can reference it and the Chronicle can show it; a lore beat this
    // size should leave a mark on the character, not just scroll past in the feed.
    | 'labyrinth_heart';
  text: string;
  timestamp: number;
  factionId?: string;
  enemyName?: string;
  /** v2.4.1 (OTA 052) — optional structured fields for the
   *  Milestones tab to render an expanded row. None of the legacy
   *  kinds populate these; only the new mq_* kinds do. */
  locationId?: string;
  locationName?: string;
  hoursElapsed?: number;
  detail?: string;
}

/** OTA-500 — a location CANONIZED for this install from a dynamic mention (a
 *  whisper / contract / mission / narration). Once registered it gets a permanent
 *  grid cell (canonicalCellFor(id)) and is plotted + routable like a static one. */
export interface CanonLocation {
  id: string;
  name: string;
  type?: string;
  danger?: number;
  /** What first named it ("whisper" | "contract" | "mission" | …). */
  source?: string;
  /** OTA-502 — explicit canonical grid cell, when the place is born at a known
   *  spot (e.g. a whisper target tile). Omitted → the cell is derived
   *  deterministically from the id (canonicalCellFor). */
  gx?: number;
  gy?: number;
  /** OTA-503 — event lifecycle for a place born from a whisper/contract objective:
   *  'pending' = discovered, not yet resolved (yellow "?" on the map); 'done' =
   *  resolved on arrival (red "X"). Omitted → a plain canon place, not an event.
   *  Many events can share one cell; the route the player tapped carries THIS id,
   *  so arriving resolves exactly the event you set out for, not its neighbours. */
  marker?: 'pending' | 'done';
}

export interface WorldMemory {
  tagCounts: Record<string, number>;
  /** ⚠⚠⚠ OTA-1722 — the names of the roadside traders most recently met, newest
   *  first, capped at ROADSIDE_NAME_MEMORY. Owner: *"the stores and crucibles
   *  don't seem anchored to a tile anymore, when I go into the next tile they
   *  are still there."* The anchoring was fine — a 118-tile probe found ZERO
   *  vendors surviving a step — but the roadside name pool is twelve names per
   *  archetype, so the same NAME lands on the next tile often enough to be
   *  indistinguishable from a store that followed you. This ring is what the
   *  picker avoids. Absent on a pre-feature save, which reads as "nothing to
   *  avoid" and costs nothing. */
  recentRoadsideNames?: string[];
  /** OTA-991 — #122: the CURRENT local sky. Weather persists per location visit —
   *  a scene rebuild at the same spot inside ~6 game-hours reuses this instead
   *  of re-rolling, so conditions read as weather, not a slot machine. */
  sceneWeather?: { id: string; locationId: string; rolledAtHours: number };
  /** OTA-994 — #122 completed: the sky is remembered PER LOCATION (the single slot
   *  above is legacy — read once as migration, no longer written). Entries
   *  self-prune once stale (>= 6 game-hours old). */
  sceneWeatherByLoc?: Record<string, { id: string; rolledAtHours: number }>;
  discoveredLocationIds: string[];
  /** OTA-500 — install-canon locations registered from dynamic mentions. */
  canonLocations?: CanonLocation[];
  defeatedEnemies: string[];
  /** OTA-838 — enemy INTEL learned by fighting. Keyed by lowercased enemy name →
   *  the damage types you've SEEN bite deep (weak) or wash off (resist) against it.
   *  Landing a weak/resist hit records it here; the EnemyPanel then reveals those
   *  specific types even below the Wisdom read-threshold ("strike to learn" made
   *  real + persistent), and the bestiary shows them on that enemy's entry. */
  enemyIntel?: Record<string, { weak: string[]; resist: string[] }>;
  /** OTA-844 [world pulse] / OTA-853 [war scoreboard] — per-faction POWER (−5..+5):
   *  who's winning the world's wars. OTA-853 made this EARNED — it rises when a
   *  faction's patrols win clashes and sack outposts, falls when they're crushed
   *  (was an abstract pulse). Drives patrol count, vendor prices, and raid strength. */
  factionTides?: Record<string, number>;
  /** OTA-853 [emergent grudges] — faction-vs-faction STANDING (−100..+100), the same
   *  concept the player has with factions. Seeded from lore, then earned through actual
   *  patrol clashes; decides who fights whom. Two neutrals can grudge into war from zero. */
  factionRelations?: import('./factionRelations').RelationsMatrix;
  /** ⚠ OTA-1165 — where the player last CLOSED a bounty. The anti-camp rule refuses a new
   *  contract from that same board until one has been cleared somewhere else, so a player
   *  cannot park at one outpost farming its board forever. Absent on every existing save,
   *  which reads as "no camp in progress" — the permissive direction, deliberately: a
   *  migration must never retroactively lock a player out of work they could take
   *  yesterday. */
  lastBountyClearedOutpostId?: string;
  /** ⚠ OTA-1168 — THE ROAD ODOMETER. Tiles walked that were not already in the recent-cell
   *  ring below; every `ODOMETER_STEP` of them is +1 max stamina, forever. Distinct from
   *  the `MILESTONE_TRAVEL_STEP` track, which counts DISTINCT DESTINATIONS and therefore
   *  stops paying out once the 36 locations are seen. Absent = 0 on every existing save,
   *  so nobody is retroactively granted stamina they never walked for. */
  travelOdometer?: number;
  /** ⚠ The last few grid cells walked, newest last. A step only advances the odometer if
   *  its cell is NOT in here — which is what stops a player pacing east-west from farming
   *  permanent max stamina, the exact hole arb118 had to close on the other track. */
  recentCells?: string[];
  /** In-game hour of the last world pulse (gates the next one). */
  lastWorldTickHour?: number;
  /** Recent world rumours (newest last), capped. The world moving, in the player's ear. */
  worldRumors?: { text: string; hour: number }[];
  /** OTA-849 [tides get teeth] — in-game hour of the last faction raid (gates the
   *  next one so raids stay periodic, not constant). */
  lastRaidHour?: number;
  /** OTA-851 [variety] — recent world events for the WORLD board's event feed
   *  (newest last, capped). Distinct from worldRumors (the rumour line) by kind. */
  worldEvents?: { text: string; hour: number; kind: string }[];
  /** OTA-851 — roaming faction patrols on the world grid: war-parties that wander
   *  loops near their outposts and intercept the player on proximity, anywhere. */
  patrols?: import('./worldEvents').Patrol[];
  /** In-game hour the patrols last advanced (throttles their movement). */
  lastPatrolTickHour?: number;
  /** OTA-857 — monotonic counter for the WALL-CLOCK world heartbeat (App.tsx
   *  timer). Seeds the real-time patrol sim and survives reload so the war
   *  continues from where it stood, independent of in-game hours. */
  worldRealtimeTicks?: number;
  completedQuestIds: string[];
  /** OTA-244 — location ids for which the danger-vs-tier warning has
   *  fired. Prevents the Arbiter from repeating the "you're light
   *  for this place" line on every scene entry. One fire per
   *  location per character. */
  dangerWarnedLocations?: string[];
  /** OTA-442 — Lost Capital ids whose one-time ARRIVAL SIGNATURE (a distinct
   *  sensory beat that gives each Capital its own identity on first entry) has
   *  already played. One fire per Capital per character. */
  capitalArrivalSeen?: string[];
  memorableEvents?: MemorableEvent[];
  /** ⚠ OTA-1688 — THE DEED LEDGER, keyed by location id: what the player did
   *  on that ground (a mission ground stood on, a card walked out on, a mission
   *  fight fled and the state the bodies were left in). Written by the store at
   *  the moments it already handles; read by the arrival line, the people on
   *  the ground and the narrator's fact sheet. See engine/deeds.ts. */
  deeds?: Record<string, Deed[]>;
  /** ⚠ OTA-1701 — who did it, for the Arbiter's word on the way back (the
   *  resurrection clears it once spoken). */
  lastDeath?: { enemyName: string; locationId: string | null; hour: number; guardian: boolean };
  /** OTA-1701 — deaths a Core Guardian handed out, for the "not the first time" count. */
  guardianDeaths?: number;
  /** Active multi-scene hook chains — a hook resolution may queue a follow-up
   *  hook kind to plant in a future wander. plantedAtHour lets beginScene
   *  expire chains that have sat unused too long (combat-heavy biomes
   *  used to strand them forever, since chains only fire on peaceful
   *  scenes). */
  pendingChains?: { kind: string; chainId: string; plantedInLocationId?: string; plantedAtHour?: number }[];
  /** Short narrative memos surfaced during chain resolutions. The Arbiter can
   *  reference these in remarks, and they help the player keep narrative thread. */
  chainMemos?: { text: string; ts: number }[];
  /** Scenes since the player last fought. Used to enforce a peaceful cooldown
   *  after combat — gives the player room to wander, dig, search, inspect
   *  without immediately rolling another encounter. */
  scenesSinceCombat?: number;
  /** HANDOFF #15 — first cut MapGraph. Tracks every room the player has
   *  set foot in, keyed by `locationId@microMicroId@mapX,mapY`. First
   *  use is "you've been here before" narration on look + scene entry.
   *  Future: persist enemiesCleared, lootGrabbed, hooksResolved so a
   *  re-entry doesn't re-roll a fresh scene. Optional + defaulted so
   *  legacy saves load cleanly. */
  visitedRooms?: Record<string, VisitedRoom>;
  /** OTA-800 — per-water-source use timestamps (game-hours, i.e. player.
   *  hoursElapsed) so a wild drink / bottle refill re-arms on GAME TIME, not on
   *  scene reset. Keyed by the composite room key (makeRoomKey — includes the
   *  outdoor mapX/mapY), so two adjacent outdoor water tiles can no longer be
   *  bounced A→B→A to reset the old per-scene one-shot flags. Pruned to only
   *  still-cooling sources on write, so it stays tiny. */
  waterUsedAt?: Record<string, { drink?: number; fill?: number }>;
  /** OTA-807 — outdoor tiles that have already ROLLED for a wandering NPC (see
   *  gameStore beginScene). Each peaceful outdoor tile gets exactly ONE spawn roll
   *  ever; the tile key is banked here so leaving and returning can't re-roll it
   *  (no farming a person off one square). Bounded to a sliding window so it never
   *  bloats the save — a tile older than the window can roll again, which requires
   *  crossing that many fresh tiles first, so it's still not a practical farm. */
  wandererRolledTiles?: string[];
  /** OTA-965 — outdoor tiles that already rolled for a stranded-traveler escort
   *  hook. Same one-roll-per-tile, sliding-window anti-farm as
   *  wandererRolledTiles. */
  strandedEscortRolledTiles?: string[];
  /** OTA-994 — ground already diced for a Hollowed door never re-rolls (mirrors the
   *  stranded-escort tile bank; tileIsNovel alone re-arms after 50 tiles). */
  revenantRolledTiles?: string[];
  /** OTA-975 — the Hollowed revenant currently standing in the scene (the fallen
   *  record it was built from); cleared when put to rest. */
  activeRevenant?: { name: string; ts: number; raceName: string; epitaph: string; locationName: string; kills: number; corruption: string; hours: number; gearNames?: string[]; gear?: FallenGearPiece[]; avengedBy?: string; avengedTs?: number };
  /** Hub rooms walked during the CURRENT visit to the CURRENT outpost — the ✓
   *  marks on the outpost map and on the room chips.
   *
   *  ⚠⚠ OTA-1410 — RE-SCOPED, and the old comment is left below as the record of
   *  why it broke. It read: *"Used by hub fast-travel to gate 'jump to the
   *  workshop' against rooms the player actually knows. Stored separately from
   *  visitedRooms because hub rooms have stable string ids, not the composite map
   *  key."* Two things were wrong with it by the time the owner hit this:
   *
   *    · The fast-travel consumer does not exist. Grepping every reader turns up
   *      the map's ✓ and the chips' ✓ and nothing else, so the sentence justified
   *      a global lifetime for a set that only ever drew per-place marks.
   *    · "Stable string ids" stopped meaning "unique" at OTA-1279, which made the
   *      outpost graph UNIVERSAL. Every outpost now has an `outpost_gate` and a
   *      `buried_landing_one`, so one global set marked them all.
   *
   *  Now owned by `hubVisitedFor` and emptied on each fresh arrival. */
  hubVisited?: string[];
  /** ⚠ OTA-1410 — which outpost `hubVisited` belongs to. A set whose owner is
   *  not the outpost you are standing in is another place's marks and is
   *  discarded rather than shown; that is also what heals saves written before
   *  this OTA, on the next outpost entry. */
  hubVisitedFor?: string;
  /** OTA 454 — every named NPC the player has met at least once.
   *  Populated by vendor encounters, Core Guardian first-sight,
   *  faction-quest givers, and any other named-NPC interaction. The
   *  Contracts → Milestones tab lists this so the player can see
   *  who they've actually spoken with. Optional + defaulted so
   *  legacy saves load cleanly. */
  npcsMet?: NpcMet[];
  /** OTA-1049 — per-NPC relationship state, keyed by the same id as npcsMet.
   *  Absent on saves written before that OTA; seedRelationsFromMet() migrates
   *  them on first touch rather than in a save-load pass. */
  npcRelations?: Record<string, NpcRelation>;
  /** OTA-1054 — recent outpost assaults, newest last, capped. Feeds the "your
   *  outpost was hit while I was away" beat in a greeting. */
  recentRaids?: OutpostRaid[];
  /** OTA-1086 — archetype ids of the last few wasteland encounters, newest
   *  first, capped at RECENT_ENCOUNTER_MEMORY. The travel picker excludes
   *  these so an authored set-piece (the Phoenix-Feather scam vendor) can't
   *  replay back-to-back. */
  recentEncounterArchetypes?: string[];
  /** OTA-1058 — how many times each authored talk topic has been raised, keyed
   *  `<npcId>:<topicId>`. Drives "I have told you that one" rather than
   *  replaying a line as though neither of you remembers the last two minutes.
   *  Bounded by the authored topic count, so it cannot grow with play. */
  talkedTopics?: Record<string, number>;
  /** ⚠ OTA-1151 — THE CONVERSATION REMEMBERS. Owner: *"I would like the talk
   *  screens to remember the conversations and type the question on an
   *  off-white so later we know what we asked. with so many conversations it
   *  will get confusing without a history."*
   *
   *  Keyed by npcId, oldest turn first. TalkSheet's live transcript is a WINDOW
   *  on gameLog (see its header) and that window closes when the conversation
   *  does — so before this, walking away from a vendor erased any record of
   *  what you had asked them. gameLog is also `.slice(-MAX_LOG_IN_MEMORY)`d, so
   *  even the exploration feed forgets it in a long session. This is the only
   *  durable record of an exchange, which is why it is a STORE rather than
   *  another view.
   *
   *  ⚠ BOUNDED, because worldMemory is persisted on every action. Authored
   *  topics per NPC are finite (14-16 since OTA-1091), so the natural ceiling
   *  is low — but re-asks and secondary cast pools are not, hence the hard cap
   *  in recordTalkTurn. */
  npcTranscripts?: Record<string, TalkTurn[]>;
  /** OTA-1060 — LIFETIME standing each faction has been granted via gifts.
   *  Metered against GIFT_STANDING_FACTION_CAP so the verb OTA-803 deleted
   *  cannot come back as the side door it was deleted for. */
  giftStandingGranted?: Record<string, number>;
  /** ⚠ OTA-1159 — LIFETIME standing each faction has been granted as SPILLOVER from
   *  a hostile act against one of their rivals. Any standing loss cascades the
   *  inverse to rivals, so a caught theft pays +5 and an extortion +3 to everyone
   *  who hates the victim — uncapped, where a GIFT has been budgeted since OTA-803.
   *  Metered against SPITE_STANDING_FACTION_CAP. ⚠ Gains only: being hated stays
   *  uncapped, because a capped consequence is a consequence you can spend past. */
  spiteStandingGranted?: Record<string, number>;
  /** OTA-120 — dog acquisition state machine, lives on world memory
   *  so it survives across screens. ALL player input routes through
   *  the onboarding handler when this is non-null. Cleared on
   *  finalize (after the sex stage). */
  pendingDogOnboarding?: PendingDogOnboarding | null;
  /** OTA-120 — set true ONLY when player.dog.status transitions to
   *  'dead' via the combat-death path (HP 0 + fight lost; gem-revive
   *  skips). Drives the Phase 6 puppy-vendor safety net trigger.
   *  Hunger-abandonment does NOT set this flag. */
  puppyVendorOwed?: boolean;
  /** OTA-120 — set true on EITHER outcome of the puppy-vendor encounter
   *  (accept OR decline) AND on rubble-puppy resolution. Permanently
   *  locks the safety-net path so the player can never get a third dog
   *  via this mechanic. */
  puppyVendorUsed?: boolean;
  /** OTA-613 — names of bosses that have already paid out their GUARANTEED
   *  Resurrection Gem. A boss kill normally guarantees a gem; if a boss can be
   *  re-fought (respawn / re-rolled encounter), the guarantee would mint a gem
   *  every kill and drain death of its stakes. The guarantee fires once per
   *  distinct boss name; re-kills fall back to the rare organic drop rate. */
  gemBossDefeatedKeys?: string[];
  /** OTA-120 — set true when the puppy vendor has been queued for the
   *  player's next outdoor scene entry after a Core Guardian victory.
   *  The next outdoor scene-entry consumes this flag and spawns the
   *  vendor; clearing prevents double-spawning. */
  puppyVendorQueued?: boolean;
  /** OTA-120 — set true on the first co-activation of a dog and a
   *  golem in combat, so the "wide arc" flavor only fires once. */
  dogGolemCoActivated?: boolean;
  /** arb-fix — enemy names the player has already been told the dog
   *  can't reach (aerial / flying targets). The Arbiter's "{dog} can't
   *  jump that high" line fires once per enemy name; afterwards tapping
   *  the dog just buzzes. */
  dogAerialNoticeShown?: string[];
  /** arb-fix — set when the "{dog} hasn't learned to climb" joke has
   *  fired for the current climb (the dog is benched at the base while
   *  the player is elevated). Cleared when the dog rejoins on descent,
   *  so each climb gets the joke once; taps still buzz. */
  dogClimbNoticeShown?: boolean;
  /** OTA-1339 — one-time "the Spire moved" notice. The Grand Spire of Asgardar
   *  became its own atlas tile on the city's outskirts (the map makeover); a
   *  LEGACY save that already charted that climb learns this once, at load,
   *  from the Arbiter. Fresh characters chart the tower where it now stands and
   *  never need telling — emptyMemory() stamps this true so only migrated saves
   *  (where the ?? false default leaves it unset→false) ever see the line. */
  spireMoveNoticeShown?: boolean;
  /** OTA-877 — one-time faction-standing explainer. Set true after the first time
   *  any standing change is logged, so the brief "what is faction standing" note
   *  (appended by logRepChanges) fires exactly once per save. */
  factionRepIntroShown?: boolean;
  /** OTA-1343 — one-time acid-lore beat: the first acid coat a character paints,
   *  the Arbiter says where battery bile comes from (owner: "we could work acid
   *  somehow into the lore"). Absent = not yet told — legacy and fresh saves are
   *  both eligible exactly once, so no migrate default is needed. */
  acidLoreIntroShown?: boolean;
  /** arb-fix — announce-once ledger for earned titles. Storm titles are awarded
   *  mid-action (weather tick); later stale-`player` writebacks in the same
   *  action revert earnedTitles, so the "You have earned a name to carry" banner
   *  re-fired on every fog tick and the perk never stuck. This lives on
   *  worldMemory (which player writebacks don't clobber): awardNewTitles announces
   *  a title only once and re-folds any ledgered title back into earnedTitles. */
  earnedTitleAnnounced?: string[];
  /** OTA-910 — distinct great-climb ids the player has crested. Drives the
   *  one-time Skyreacher armor grant (no re-award on re-cresting) and the
   *  Skyreacher title (greatClimbsCompleted = this set's size; earned at 5). */
  greatClimbsCrested?: string[];
  /** OTA-912 — Skyreacher Chart ids sold by roadside vendors, ever (sell-once
   *  ledger; each of the 5 charts can be sold a single time across the game). */
  soldMapIds?: string[];
  /** OTA-912 — great-climb ids UNLOCKED by using their chart. The climbable prop
   *  only spawns at a landmark once its id is in here (access is gated on maps). */
  unlockedGreatClimbs?: string[];
  /** OTA-991 — #119a: last ~10 ambient takeable gear names rolled into scenes,
   *  newest last. Fed back into pickTakeableGearForScene as an exclude window
   *  so adjacent tiles stop offering the same Rail Saber three times in a
   *  ninety-second walk. */
  recentTakeableGearNames?: string[];
  /** OTA-991 — location:noun keys of faction sigils already pried. PERMANENT — the
   *  arb105 restock deliberately does not clear it; a faction's mark comes off
   *  a place once, then the noun yields rubble coin. Closes the round-trip
   *  sigil farm the OTA-1000 guaranteed-yield branch opened. */
  salvagedSigilKeys?: string[];
  /** OTA-993 — how many times an agent has actually PITCHED offers. Keys the
   *  category rotation; travel-count keying phase-locked circuit routes. */
  offerPitchSeq?: number;
  /** OTA-912 — distinct great-climb ids whose SUMMIT BOSS has been defeated.
   *  Gates the one-time Skyreacher armor + Aether Collection Beacon grant, and at
   *  size 5, using a beacon builds the Beacon Rifle (OTA-913). */
  summitBossesDefeated?: string[];
  /** OTA-912/913 — one-time flag: the Beacon Rifle (+ materials) has been built
   *  from the five beacons. Prevents a re-build. (Legacy field name retained for
   *  save compatibility.) */
  skyreacherBoltcasterGranted?: boolean;
  /** OTA-916 — building-tile keys ("loc:x:y") whose Aetherkin spawn roll has
   *  already been resolved. enter/exit is free and doesn't move you, so without
   *  this a home/shed re-rolls its 28% Aetherkin every entry — a faction-standing
   *  + loot farm. One roll per structure; banked whether or not one spawned. */
  aetherkinRolledBuildings?: string[];
  /** arb-fix — one-time make-good: a faction fused item the player should
   *  have received but didn't (the pre-fix faction catalyst never counted
   *  toward the gate). Granted once per save on load for dev names; this
   *  flag makes it idempotent. */
  fusionCompensationGranted?: boolean;
  /** OTA-139 — rumor-of-trapped-dog Arbiter hint. Set true after
   *  the hint fires once. Discoverability nudge for players who
   *  pass day 5 without ever tapping a rescue-hook noun (smelter /
   *  cage / wagon / cellar / snare / trap / pit). The Arbiter
   *  drops one rumor line pointing the player toward the genre of
   *  scene where a captor + dog encounter could be found. Single-
   *  shot per save so the hint doesn't become noise. */
  dogRescueTipFired?: boolean;
  /** ⚠⚠ OTA-1558 — the one-off dog amnesty has already run on this save. See
   *  worldMemory.dogRescueAmnesty: four gates read a raw `player.dog`, which
   *  stays truthy for a DEAD or ABANDONED dog, so any save that lost one had the
   *  rescue quest sealed shut. The gates are fixed now, but a save can also be
   *  wedged by state those broken gates already WROTE — a stale
   *  `pendingDogOnboarding`, a spent `dogRescueTipFired` — and correcting a
   *  predicate cannot clear a flag already on disk. This latch makes the cleanup
   *  happen once per save instead of re-arming the Arbiter's rumour every load. */
  dogRescueAmnestyDone?: boolean;
}

/** OTA 454 — record of a single named NPC encounter. */
export interface NpcMet {
  /** Stable id when available (vendor id, guardian id, etc.); otherwise
   *  a lowercase-slug of the name. Used to dedupe re-encounters. */
  id: string;
  /** Display name as the player saw it. */
  name: string;
  /** Optional short label ("Asgardar vendor", "Core Guardian", "quest-giver"). */
  role?: string;
  /** Optional faction id if the NPC is faction-aligned. */
  factionId?: string;
  /** Location id where the meeting happened. */
  locationId?: string;
  /** hoursElapsed at first meeting. */
  hoursElapsed?: number;
  /** Unix ms timestamp of first meeting. */
  firstMetAt?: number;
}

/** OTA-1049 — the per-person ledger behind NpcMet. NpcMet answers "have you
 *  ever stood in a room with this NPC"; this answers "what has passed between
 *  you". Keyed by the same id. See app/engine/npcMemory.ts. */
export interface NpcRelation {
  id: string;
  name: string;
  role?: string;
  factionId?: string;
  /** Unix ms of the first sighting. */
  firstMetAt: number;
  /** Unix ms of the most recent sighting. */
  lastSeenAt: number;
  /** player.hoursElapsed at the most recent sighting. */
  lastSeenHours: number;
  /** OTA-1052 — player.hoursElapsed at the sighting BEFORE the most recent one.
   *  This is what an absence line actually needs. `lastSeenHours` is overwritten
   *  with "now" the moment the player walks in, and the greeting is composed
   *  after that, so measuring the gap against it always yielded zero — the
   *  absence line was unreachable in play. Undefined on a first meeting and on
   *  relations migrated from a pre-OTA-1049 save. */
  prevSeenHours?: number;
  /** Scene arrivals in front of this NPC. NOT deduped; repetition is signal. */
  meetings: number;
  /** Completed buy/sell transactions. ⚠ ONE PER VISIT — see recordNpcDealing's
   *  `atHours`. Counting line items let three junk sales in one breath make a
   *  stranger a regular (OTA-1438). */
  trades: number;
  /** OTA-1438 — in-game hour of the last trade credited here, so a second
   *  transaction in the same visit does not count as a second piece of
   *  business. Absent on relations from before OTA-1438; an absent stamp
   *  credits, which is the safe direction (it can only under-count, never
   *  retro-promote). */
  lastTradeHours?: number;
  /** TC moved across their table, either direction. */
  tcTraded: number;
  contractsTaken: number;
  contractsTurnedIn: number;
  /** Thefts, attacks — anything that makes them watch your hands. */
  wrongs: number;
  /** OTA-1081 — CLEAN pockets lifted off this person (they never caught you).
   *  Feeds the delayed "always losing things" mumble: on a later meeting they
   *  notice the loss out loud WITHOUT suspecting you — the player learns the
   *  theft registered and that they got away with it. A caught lift records a
   *  `wrong` instead, never this. */
  pocketsLifted?: number;
  /** How many of those losses they have mumbled about. The mumble fires while
   *  pocketsLifted > pocketsMumbled, once per later meeting — deterministic,
   *  no roll, and it can never repeat past what was actually taken. */
  pocketsMumbled?: number;
  /** OTA-1086 — game-hour stamp of the newest raid this person has told the
   *  player about. raidNewsFor only surfaces raids NEWER than this, so the
   *  same sacking is news exactly once (Tarek repeated "the Conspiracy
   *  Architects raided our outpost" verbatim on four consecutive visits —
   *  the old gate keyed on prevSeenHours, which quick room-hops inside the
   *  same hour never advanced). */
  raidHeardAtHours?: number;
  /** OTA-1083 — tastes the player has WITNESSED through gift reactions:
   *  entries like 'loves:metal', 'loves:Aether Mud', 'cold:food'. The gift
   *  picker shows these — what you've learned, never the authored list. */
  giftTastes?: string[];
  /** Gifts that landed LOVED — the proof you honored who they are. Gates the
   *  return gift alongside trusted regard. */
  lovedGifts?: number;
  /** OTA-1083 — the one-time return gift at trusted has been handed over. */
  returnGiftGiven?: boolean;
  /** OTA-1053 — TC of honest custom banked toward buying back a caught theft.
   *  Only coin spent AFTER the wrong counts; see AMENDS_TC_PER_WRONG. */
  amendsTc?: number;
  /** How many wrongs have been paid off. Kept so the Chronicle can say a debt
   *  was settled rather than silently erasing that it ever happened. */
  amendsCleared?: number;
  /** OTA-1060 — WHAT YOU GAVE THEM, by name. The owner's requirement in as many
   *  words: they remember that you gave them that particular item. A warmth
   *  number would not have been this; the object is the point. Bounded in
   *  practice by GIFT_BOONS_PER_PERSON plus the repeat decay — there is no
   *  reason to keep gifting past the cap, and nothing rewards it. */
  gifts?: {
    name: string;
    atHours: number;
    /** ⚠ OTA-1161 — HOW THEY TOOK IT. Owner: the ledger should show "what you gave
     *  to whom and how they received it." The reaction was computed by `resolveGift`
     *  at the moment of giving and then thrown away, so a gift that INSULTED
     *  somebody looked identical on the record to one they loved.
     *  ⚠ Optional, and it stays optional: every gift on an existing save predates
     *  this field, and the ledger must render those as "reaction not recorded"
     *  rather than inventing one. Do not backfill it — a guessed reaction on a
     *  historical gift is worse than an honest blank, because tastes have changed
     *  since (OTA-1153 rewrote the whole preference table). */
    reaction?: 'loved' | 'liked' | 'polite' | 'disliked' | 'insulted';
    /** The standing that actually moved, as reported at the time. */
    standingDelta?: number;
  }[];
  /** ⚠ OTA-1064 — THE LARGEST FACTION-STANDING HIT ALREADY TAKEN FOR BEING
   *  HOSTILE TO THIS PERSON, as a magnitude. Load-bearing anti-exploit state.
   *
   *  applyRepChange propagates HALF of any delta to the target faction's rivals
   *  with the sign flipped, so a standing LOSS is simultaneously a standing GAIN
   *  somewhere else. That is fine for a one-off. It is not fine for anything the
   *  player can repeat at will — and two Phase 1/2 acts were exactly that:
   *    - a refused gift (-2, and the item is NOT consumed, so it is free);
   *    - beating a vendor into submission (-12, and they are back next visit).
   *  Both were unbounded rival-standing farms costing nothing but taps.
   *
   *  Recording the MAGNITUDE rather than a boolean is what closes the downgrade
   *  hole: insulting somebody for -2 must not buy immunity from the -12 for
   *  putting them on their knees. A later, heavier act tops up the difference; a
   *  repeat of the same or a lighter one costs nothing, because you have already
   *  paid for what you are to them. */
  standingDocked?: number;
  /** OTA-1060 — how many gifts have actually MOVED this relationship. Capped,
   *  so warmth stays something you mostly earn by doing rather than shopping. */
  giftBoons?: number;
}

/** OTA-1054 — an outpost assault the offscreen war sim actually carried out.
 *  The sim (OTA-844/864/867) has raided outposts since it shipped, but the
 *  events it emitted named only FACTIONS and went only to the World board. This
 *  record keeps the same event joined to the LOCATION and the clock, so the
 *  people who live there can mention it. */
export interface OutpostRaid {
  /** Faction whose outpost was hit. */
  defenderId: string;
  defenderName: string;
  attackerId: string;
  attackerName: string;
  /** The defender's home location — FACTION_STARTING_LOCATION[defenderId]. */
  locationId: string;
  /** OTA-1055 — the AUTHORED name of that place, resolved at write time.
   *  The line is spoken by somebody who lives there, and de-slugging the id
   *  handed them "reclaimer stake" and "pilgrim waycamp" for grounds the game
   *  calls Reclaimer's Stake and the Tartarian Pilgrim Camp. npcMemory has no
   *  location catalog and should not grow one, so the store — which already has
   *  safeLocName — stamps the display name onto the record. Optional: raids
   *  written before this OTA fall back to the humanised id. */
  locationName?: string;
  /** player.hoursElapsed when it happened, so a greeting can ask "since I last
   *  saw you?" against NpcRelation.prevSeenHours. */
  atHours: number;
}

export interface VisitedRoom {
  /** Unix ms of first visit. */
  firstVisitAt: number;
  /** Unix ms of most recent visit. */
  lastVisitAt: number;
  /** How many distinct visits — useful for "you've been here many times". */
  visitCount: number;
  /** Names of enemies the player has defeated in this room on prior
   *  visits. The next scene roll can use this to suppress respawns
   *  feel rather than re-spawning fresh waves. */
  enemiesCleared?: string[];
  /** HANDOFF #15c — keys identifying loot the player has already
   *  collected from this room. Used to suppress re-grants of the same
   *  rare drop on re-entry (the dagger you dug up shouldn't keep being
   *  diggable). Each key is the lowercased item name; cheap to compare
   *  without changing the catalog. */
  lootGrabbed?: string[];
  /** ⚠⚠ OTA-1533 — HOW MANY TIMES THIS PATCH HAS GIVEN TO A DIG. The commodity
   *  exemption on the picked-clean guard had no floor, so a mud patch was an
   *  unbounded fountain (the owner: *"how many times can I investigate this
   *  mud"* — the answer was forever). Counted per room, checked against
   *  MUD_DIG_YIELDS_PER_PATCH. Absent on rooms dug before 1533, which read as
   *  zero and get a fresh allowance rather than being sealed retroactively. */
  digYields?: number;
  /** Items the player dropped on the floor of this room (via the
   *  drop verb). Each item is a full InventoryItem so quantity / kind
   *  / rarity round-trip cleanly back into player.inventory when the
   *  player picks them up. Persists across re-entry so the Tourist
   *  and Vandal stress test can validate object state serialization. */
  droppedItems?: InventoryItem[];
  /** Names of containers / props the player has explicitly opened or
   *  disarmed in this room (chest, crate, trap, etc.). The
   *  area-search / open / disarm handlers consult this to keep
   *  containers from re-closing themselves on re-entry. */
  containersOpened?: string[];
  /** Ambient nouns the player has already area-searched in this
   *  room. The investigate handler checks this BEFORE rolling fresh
   *  area-search dice — a repeat search hits a hard "already
   *  searched, nothing more to do" line instead of looping the
   *  player on the same prop. */
  searchedAmbientNouns?: string[];
  /** OTA-437 — per-noun count of consecutive "nothing" area-search rolls in
   *  this room. A null search deliberately does NOT consume the noun (so one
   *  unlucky roll doesn't waste it), but leaving it unbounded let a player
   *  retry through every "nothing" until each noun guaranteed a payout —
   *  removing the gamble. Once a noun's count reaches NOTHING_SEARCH_CAP it is
   *  added to searchedAmbientNouns (consumed), so a search is a real risk again
   *  after a couple of grace retries. */
  searchNothingCounts?: Record<string, number>;
  /** arb119 — number of PRODUCTIVE digs (a real item landed in the pack)
   *  the player has pulled from this wild tile's ground via `digHere`.
   *  Wild-tile digs intentionally re-roll stackable commodities so a
   *  player can gather crafting stock in place, but that left the dig
   *  loop totally uncapped — 200 digs on one tile minted 100+ items
   *  (including rares). Once this count reaches DIG_SPOT_PRODUCTIVE_CAP
   *  the patch reads as worked-out and refuses further productive digs
   *  until the player moves on. The cap is generous (enough to build a
   *  Stone Spear or Cudgel without walking) but kills the in-place farm. */
  groundDigCount?: number;
  /** 2026-05-25 [POLISH-3] — ambient nouns whose investigate
   *  outcome was pure flavor (no item / no XP / no hook produced).
   *  Kept SEPARATE from searchedAmbientNouns so other verbs
   *  (take, salvage, break) can still act on these nouns — only
   *  the investigate verb consults this list to refuse a repeat
   *  flavor-only outcome, and the Search modal reads it to render
   *  the chip greyed + ✓ at the right side of the row. The
   *  long-standing "investigate the bench → break the bench"
   *  cross-verb flow is preserved because break never touches
   *  this list. */
  flavorExhaustedNouns?: string[];
  /** 2026-05-25 OTA-039 — latched once the player runs their first
   *  investigate in this room. The investigate handler uses it to
   *  force a substantive outcome on the very first investigate per
   *  room visit (hook plant > hidden text > trinket > lore beat),
   *  so a new room never reads as "nothing here to find". Subsequent
   *  investigates fall back to the normal RNG rates. */
  firstInvestigateDone?: boolean;
  /** Audit fix — in-game hours elapsed at the most recent visit.
   *  Used by respawn-quiet calculation so idling for 6 real hours
   *  doesn't accidentally trigger respawn even when no in-game time
   *  passed. Wall-clock fallback (lastVisitAt) remains for legacy
   *  saves that don't carry this field. */
  hoursElapsedAtVisit?: number;
  /** ⚠⚠ OTA-1529 — THE IN-GAME HOUR THIS ROOM'S LOOT WAS CLEARED, stamped
   *  beside `clearedAtMacroSeq` and read with it. A restock now needs BOTH a
   *  real round-trip AND real elapsed time; see the constant's own note in
   *  gameStore for why one without the other restocks the world at travel
   *  speed. Absent on saves written before 1529 — those restock on the
   *  round-trip alone, exactly as they did, rather than being frozen by a
   *  stamp they never got. */
  clearedAtHour?: number;
  /** arb105/arb107 — outpost loot restock marker. Originally an in-game
   *  hour stamp (arb105); arb107 changed the restock trigger from a raw
   *  48h timer (which `rest` could skip for free) to "the player traveled
   *  to a DIFFERENT named location and returned." This now records the
   *  player's `macroVisitSeq` at the moment this hub room's loot was
   *  cleared. On re-entry, if the player's current `macroVisitSeq` has
   *  advanced past this value (they left to another named location and
   *  came back), the room's consumed record resets and the loot restocks.
   *  Walking between outpost rooms or resting in place does NOT advance the
   *  seq, so the building can't be farmed in place. Lazily stamped on the
   *  first re-entry observing a non-empty consumed set. */
  clearedAtMacroSeq?: number;
  /** ⚠⚠ OTA-1378 — THE GEAR THIS ROOM HOLDS, DECIDED ONCE.
   *
   *  `pickTakeableGearForScene` draws a room's gear from a stream seeded by the
   *  room key, then post-filters it against `recentTakeableGearNames` — a
   *  10-deep ROLLING window whose job is stopping adjacent rooms from offering
   *  identical loot. OTA-991 wrote the rule down: *"the window can hide a pick,
   *  never substitute one."* Hiding is right on first sight. The defect is that
   *  hiding was TEMPORARY and taking is PERMANENT, so a piece the window masked
   *  on arrival was never consumed, and surfaced alone the next time the player
   *  walked back in — the "I cleared this room and one item came back" report.
   *
   *  Stamping the post-window list here makes the mask permanent: what the room
   *  offered on first sight is what the room holds, forever. Reads apply the
   *  consumed filter on top, so a cleared room stays cleared, and the roster is
   *  deliberately NOT wiped by the macro-visit restock — a restocked room puts
   *  its own goods back out rather than rolling a fresh lottery. */
  gearRoster?: string[];
  /** 2026-05-26 OTA-071 — per-room investigation table. Seeded
   *  on first scene generation from ambientNouns. Each entry
   *  has a category, curated/Qwen lore, optional yield, hook
   *  potential, consumed flag, and recorded result. The
   *  investigate handler consults this BEFORE the existing
   *  alreadySearched / requirement / catalog paths, so any
   *  noun in the table gets a specific outcome on first tap
   *  and a specific callback on repeat. Pinned ground
   *  surfaces (ground/floor/mud) are intentionally excluded —
   *  the dig-here path owns those. See
   *  app/engine/investigationTable.ts. */
  roomInvestigationTable?: Record<string, InvestigationEntry>;
  /** OTA-120 — true once the dog has run its smell-find roll in this
   *  room. Prevents the player from farming dog INT by walking in and
   *  out of the same room. Cleared back to false when all visible
   *  nouns in the room's investigation table have been consumed
   *  (a fresh sniff is plausible once the player has cleared the
   *  room's visible content). */
  dogSmelledHere?: boolean;
}

export type ScreenName =
  | 'title'
  | 'character_creation'
  | 'exploration'
  | 'log'
  | 'lore'
  | 'about'
  | 'inventory'
  | 'character'
  | 'map'
  | 'crafting'
  | 'vendor'
  | 'actions'
  | 'contracts'
  | 'world'
  | 'ending';

export interface SaveState {
  version: 1;
  savedAt: number;
  player: PlayerCharacter | null;
  worldMemory: WorldMemory;
  gameLog: GameLogEntry[];
  currentScreen: ScreenName;
  /** Scene the player was in when they saved. Optional for back-compat
   *  with older saves that did not capture it — those still fall back to
   *  beginScene() on load. When present, loadSlotIntoGame restores it
   *  as-is so the player resumes exactly where they left off without a
   *  fresh Arbiter narration or a re-rolled scene. Typed `unknown` here
   *  because the CurrentScene shape lives in the game store; the load
   *  flow casts it back at boundary. */
  currentScene?: unknown;
  /** 2026-05-25 — persisted step counter since the last wasteland
   *  encounter. Optional for back-compat with older saves (load
   *  defaults to 0). Persisting prevents a save-load cheese that
   *  reset the counter and delayed the next encounter by `threshold`
   *  cardinal steps. */
  wastelandStepsSinceEncounter?: number;
}
