// engine_Dev — GENERIC template data. The dev-console TEMPLATE buttons used to emit
// slices of the real built-in (Tartaria) tables, which leaked setting-specific proper
// nouns (Aether, Mud Monarchs, Tartary…) into an author's blank scaffold — confusing,
// because it reads like a finished game from a different setting. These rows carry the
// SAME shapes and the SAME optional fields (so every feature still shows), but the
// flavor is deliberately generic "light fantasy" with no named setting. They are
// TEMPLATE-ONLY: the engine's runtime defaults are unchanged (still the built-in game).
//
// Keep this list FAITHFUL to the real row shapes — if a table gains a field, add it
// here too so the template keeps reflecting current functionality.

export const GENERIC_TABLE_ROWS = {
  weapons: [
    { name: 'Worn Sword', weaponKind: 'melee', damageType: 'slashing', damageDice: '1d6', stat: 'strength', rarity: 'Common', defense: 3, tags: ['weapon', 'blade', 'melee'], description: 'A plain blade, nicked but serviceable.', statRequirement: null, tc: 20 },
    { name: "Hunter's Bow", weaponKind: 'ranged', damageType: 'piercing', damageDice: '1d8', stat: 'dexterity', rarity: 'Uncommon', baseDurability: 18, tc: 95, tags: ['weapon', 'bow', 'ranged'], description: 'A smooth-drawing bow, worn pale at the grip.', statRequirement: 'Dexterity 2' },
  ],
  armor: [
    { name: "Traveler's Hood", slot: 'head', acBonus: 1, resistances: [], statBonus: { stat: 'wisdom', amount: 1 }, statBonuses: [{ stat: 'wisdom', amount: 1 }], rarity: 'Common', dexReq: 1, tcBuy: 8, tcSell: 3, baseDurability: 20, tags: ['armor', 'head', 'cloth', 'helmet'], description: 'A simple hood that keeps the rain off.' },
    { name: 'Banded Cuirass', slot: 'chest', acBonus: 3, resistances: ['slashing'], statBonus: { stat: 'strength', amount: 1 }, statBonuses: [{ stat: 'strength', amount: 1 }], rarity: 'Uncommon', dexReq: 2, tcBuy: 60, tcSell: 24, baseDurability: 40, tags: ['armor', 'chest', 'metal'], description: 'Overlapping iron bands on a leather backing. Heavy, honest protection.' },
  ],
  materials: [
    { name: 'Common Residue', rarity: 'Common', tags: ['essence'], description: 'A faint film left where power has passed. Smells of ozone and damp stone.' },
    { name: 'Raw Crystal', rarity: 'Common', tags: ['essence', 'crystal'], description: 'A small clouded shard. Hums when held against the ear.' },
    { name: 'Scrap Metal', rarity: 'Common', tags: ['metal'], description: 'Mixed metal from old ruins. Reforges into weapon stock.' },
    { name: 'Tough Fiber', rarity: 'Common', tags: ['organic', 'fiber'], description: 'Strong silken thread — enough to bind metal.' },
    { name: 'Worked Crystal', rarity: 'Rare', tags: ['essence', 'crystal'], description: 'A single clean shard of high-grade crystal. Cores rare-tier relic work.' },
  ],
  gear: [
    { name: 'Trail Rations', kind: 'consumable', rarity: 'Common', tags: ['food'], effect: { kind: 'consumable', healHP: 6, restoreStamina: 3 }, description: 'Hardtack and dried meat. Mends the body and puts wind back in your lungs — +6 HP, +3 stamina.' },
    { name: 'Wild Root', kind: 'consumable', rarity: 'Common', tags: ['food', 'foraged', 'vegetable'], effect: { kind: 'consumable', healHP: 3, restoreStamina: 1, buffStat: 'wisdom', buffBonus: 1, buffDuration: 4 }, description: 'Pulled from the soil by its papery tops. Sharpens the eye in the half-dark for a while.' },
    { name: 'Wild Game', kind: 'consumable', rarity: 'Rare', tags: ['food', 'foraged', 'meat'], effect: { kind: 'consumable', healHP: 6, restoreStamina: 2, buffStat: 'strength', buffBonus: 1, buffDuration: 6 }, description: 'A scrawny ground-bird, freshly killed. Real food — the kind that pays you back.' },
  ],
  exploration: [
    { name: 'Bright Torch', abilityReq: 'Dexterity Level 5', kind: 'exploration', rarity: 'Uncommon', faction: 'REPLACE-with-a-faction-id', tcBuy: 18, tags: ['exploration', 'gear', 'uncommon'], description: 'Burns 36 hours and shrugs off storms.', effect: { kind: 'consumable', extendLight: 36 } },
    { name: 'Endless Lantern', abilityReq: 'Wisdom Level 9', kind: 'exploration', rarity: 'Rare', faction: 'REPLACE-with-a-faction-id', tcBuy: 60, tags: ['exploration', 'gear', 'rare'], description: 'A sealed lantern that never seems to gutter out.', effect: { kind: 'consumable', extendLight: 96 } },
  ],
  amulets: [
    { name: 'Minor Charm', rarity: 'Common', statBonus: { stat: 'wisdom', amount: 1 }, resistances: ['frost'], baseDurability: 30, tags: ['amulet'], description: 'A small shard wrapped in copper wire. Wards off the worst of the cold.' },
    { name: "Seeker's Locket", rarity: 'Common', statBonus: { stat: 'wisdom', amount: 1 }, resistances: [], baseDurability: 30, tcBuy: 28, tcSell: 11, tags: ['amulet', 'detection', 'relic'], description: 'An old pendant that hums near a relic — the warmer the hum, the closer the find. The bearer reads the world a half-beat clearer.' },
    { name: 'Warden Talisman', rarity: 'Legendary', statBonus: { stat: 'strength', amount: 2 }, resistances: ['bludgeoning', 'piercing'], baseDurability: 50, tcBuy: 380, tcSell: 152, tags: ['amulet', 'boss', 'legendary', 'crafted'], description: 'A fist-sized heart, dried and lacquered. Steadies the bearer’s swing, slows their breath.' },
  ],
  rings: [
    { name: "Engineer's Band", rarity: 'Uncommon', statBonus: { stat: 'intelligence', amount: 1 }, resistances: [], baseDurability: 35, tags: ['ring', 'construct'], description: 'A ring used to issue commands to constructs. Prized by tinkerers and collectors.' },
    { name: 'Guild Signet', rarity: 'Rare', statBonus: { stat: 'charisma', amount: 2 }, resistances: [], baseDurability: 40, tags: ['ring', 'seal'], description: 'An old seal that opens doors money usually cannot.' },
    { name: 'Order Band', rarity: 'Uncommon', statBonus: { stat: 'intelligence', amount: 2 }, resistances: [], baseDurability: 35, faction: 'REPLACE-with-a-faction-id', tc: 90, tags: ['ring', 'faction_gear', 'scholarly'], description: 'Order issue. Etched edge-to-edge with proofs only the initiated can read; wearing it keeps them close. (+2 Intelligence)' },
  ],
  dogGear: [
    { name: 'Burlap Dog Vest', kind: 'dog_armor', rarity: 'Common', acBonus: 1, baseDurability: 18, tags: ['dog_armor', 'vest', 'cloth'], description: 'A scrap of stitched cloth belted across the dog’s chest. Cheap, but it turns a claw.' },
    { name: 'Plated Dog Harness', kind: 'dog_armor', rarity: 'Uncommon', acBonus: 3, baseDurability: 35, statBonus: { stat: 'strength', amount: 1 }, tags: ['dog_armor', 'harness', 'metal'], description: 'Riveted plates over a heavy harness. Heavier, but the dog walks into trouble now.' },
  ],
  recipes: [
    { result: 'Cleansing Tonic', ingredients: [{ name: 'Common Residue', quantity: 1 }, { name: 'Red Cap Mushroom', quantity: 1 }] },
    { result: 'Strong Tonic', ingredients: [{ name: 'Worked Crystal', quantity: 1 }, { name: 'Tough Fiber', quantity: 2 }] },
  ],
  enemies: [
    { name: 'Wild Boar', type: 'Animal', abilityPoint: 'Strength 4', attack: 'Tusk Charge', damage: '2d6', hp: 20, rarity: 'Common', loot: ['Boar Hide', 'Tough Fiber'], aliases: ['boar', 'pig', 'hog', 'the boar'], traits: ['savage', 'ambush_strike'] },
    { name: 'Road Bandit', type: 'Humanoid', abilityPoint: 'Dexterity 3', attack: 'Quick Stab', damage: '1d8 piercing', hp: 16, rarity: 'Common', loot: ['Scrap Metal'], aliases: ['bandit', 'thug', 'raider', 'the bandit'], traits: ['resist:frost', 'vulnerable:burn'] },
  ],
  races: [
    { id: 'REPLACE-with-a-race-id', name: 'Tall Folk', baseAC: 12, racialACBonus: '+2 AC due to size and reach; -4 in confined spaces (low caves, tight ruins)', racialACBonusRules: [{ condition: 'confined', delta: -4 }], racialStatBonuses: { strength: 2 }, startingTCFormula: '4d6 x 10', startingHPBonus: 15, barehandDamage: '1d6 +2', tags: ['large', 'strength', 'relic_savvy'], traits: ['Towering Strength: +2 Strength.', 'Ancient Insight: +1 Intelligence when investigating old structures or artifacts.', 'Legacy of Power: Once per day, channel power into a relic (repair, power-up, or unexpected effect).'], description: 'Tall, broad descendants of the old builders. The strongest hand-to-hand fighters.', flavor: 'You stand a head taller than any doorway down here. The old halls remember your bloodline. Whatever you reclaim, you do not bow to take it.' },
    { id: 'REPLACE-with-a-race-id-2', name: 'Lowland Folk', baseAC: 10, racialACBonus: '+1 AC in underground areas', racialACBonusRules: [{ condition: 'underground', delta: 1 }], racialStatBonuses: { dexterity: 1 }, startingTCFormula: '3d6 x 10', startingHPBonus: 8, barehandDamage: '1d4', tags: ['small', 'dexterity'], traits: ['Sure-Footed: +1 Dexterity in tight or broken ground.'], description: 'Quick, wiry folk at home in close quarters and low light.', flavor: 'Low ceilings never bothered you. You go where the big ones cannot follow, and you are gone before they think to look.' },
  ],
  factions: [
    { id: 'REPLACE-with-a-faction-id', name: 'The Old Order', subtitle: 'Keepers of What Was', alignment: 'Authoritarian / Suppressive', goal: 'Keep the old secrets buried to preserve a crumbling rule.', philosophy: 'If the people ever learn what lies beneath them, the order collapses. Better the past stay forgotten.', structure: 'Descended from the old nobility. Work through elites, spies, assassins, and aging machines.', rivals: ['REPLACE-with-a-faction-id-2'], allies: [], joinRequirements: 'Bloodline ties, proven loyalty, willingness to silence those who dig too deep.', tags: ['suppressive', 'elite', 'fading_power'], startingStanding: -10, flavor: 'You keep what your ancestors took. The world will not remember, if you have anything to say about it — and you have everything to say.' },
    { id: 'REPLACE-with-a-faction-id-2', name: 'The Seekers', subtitle: 'Finders of the Lost', alignment: 'Idealist / Reformist', goal: 'Recover the old knowledge and rebuild the world with it.', philosophy: 'Knowledge was meant to be lit, not buried. Hidden it festers; revealed and mastered, it saves us.', structure: 'Descendants of the old scholars and engineers. Work from hidden enclaves, mounting quiet expeditions.', rivals: ['REPLACE-with-a-faction-id'], allies: [], joinRequirements: 'Demonstrated scholarship, recovery of an artifact, or a member’s referral.', tags: ['scholarly', 'exploratory', 'covert', 'idealistic'], startingStanding: 0, flavor: 'You dig because the world above is dying of forgetting, and the only cure is in the ground. You have a notebook, a lamp, and a long way to walk.' },
  ],
  locations: [
    { id: 'REPLACE-with-a-location-id', name: 'The Old Plains', type: 'region', description: 'A vast open expanse of broken ground. Strange weather, old markers, sightlines to the horizon.', danger: 4, tags: ['region', 'open'], discoverable: true, aliases: ['plains', 'the plains', 'wastes'], interactables: ['horizon', 'marker', 'pillar', 'crater', 'mud', 'flat'] },
    { id: 'REPLACE-with-a-location-id-2', name: 'Crossroads', type: 'settlement', description: 'A waystation where the roads meet. Traders, rumors, and a place to resupply before the next stretch.', danger: 1, tags: ['settlement', 'safe', 'market'], discoverable: true, aliases: ['the crossroads', 'town', 'waystation'], interactables: ['well', 'notice board', 'stall', 'gate', 'lantern'] },
  ],
  weather: [
    { id: 'REPLACE-with-a-weather-id', name: 'Lightning Storm', description: 'Lightning crackles across the horizon in unnatural colors. The air tastes like copper, and small mechanisms fail.', visibility: -3, travelPenalty: 4, corruptionChance: 3, tags: ['lightning', 'tech_disruption'], source: 'manual' },
    { id: 'REPLACE-with-a-weather-id-2', name: 'Ash Wind', description: 'A wall of grey ash rolls across the open ground. Breathing burns; the skin gathers a film of dead land.', visibility: -3, travelPenalty: 4, corruptionChance: 2, tags: ['ash', 'respiratory'], source: 'manual' },
  ],
} satisfies Record<string, unknown[]>;

// engine_Dev — GENERIC missions for the Missions template. Mirrors the real
// faction-quest / hunt / mystery / storyline shapes (and shows the newer fields —
// faction-quest fetch, staged plans, reward.items) with neutral light-fantasy flavor.
// TEMPLATE-ONLY; the engine's built-in quests are unchanged.
export const GENERIC_MISSIONS = {
  hunts: [
    {
      id: 'hunt_marsh_wyrm', title: 'The Great Beast of the Old Marsh',
      posterText: 'A village reeve seeks proof of death — a long shadow has crossed the marsh at dawn, a wing-mark longer than a barn. 800 coin on a confirmed kill.',
      targetEnemyName: 'Marsh Wyrm', biomeTag: 'marsh', targetLocationName: 'the Old Marsh (the ruined steeple roost)',
      templateKind: 'standard_7', difficultyTier: 3, difficultyLabel: 'Veteran', recommendedHp: 50, recommendedWeaponRarity: 'Rare',
      minRep: 0, factionId: null, rewardTc: 800, rewardItem: 'Worked Crystal', rewardRep: null, trophyName: 'Wyrm Scale',
      stages: [
        { stageType: 'inciting_hook', narration: 'The reeve closes the bounty book. "I don\'t know where it roosts. Old Mira does — out on the marsh edge. Bring her this token, she\'ll talk."', arbiter: '"Posters mean someone is desperate or someone has died," the narrator says. "Read the room before you sign."', checkKind: null },
        { stageType: 'first_friction', narration: 'Half a day on, a wing-shadow crosses you. Over the next rise: a goat torn open, three dark scales steaming in the silt. The beast knows there are eyes here now.', arbiter: null, checkKind: 'investigate' },
        { stageType: 'toll', narration: 'Mira reads the token and waves you to sit. "I\'ll mark its roost. But my boy went into the flooded shrine after the first attack. Bring me his locket. Then we talk."', arbiter: null, checkKind: 'diplomacy' },
        { stageType: 'favor', narration: 'The flooded shrine is still water and old prayer. You find the boy where he fell and free the locket from his hand. It is still warm.', arbiter: null, checkKind: 'boss' },
        { stageType: 'approach', narration: 'Mira marks the roost. You make the long climb to the steeple where the beast sleeps off its kill.', arbiter: null, checkKind: 'travel' },
        { stageType: 'confrontation', narration: 'The beast wakes as your shadow crosses it. No more stalking now — only the fight.', arbiter: null, checkKind: 'boss' },
        { stageType: 'resolution', narration: 'It falls. You take a scale for proof and start the long walk back to the reeve.', arbiter: null, checkKind: null },
      ],
    },
    {
      id: 'hunt_pit_stalker', title: 'Something in the Pit',
      posterText: 'A mine foreman wants the killings stopped — three crews gone in a week. Pays fast and asks no questions. 450 coin.',
      targetEnemyName: 'Pit Stalker', biomeTag: 'underground', targetLocationName: 'the lower shafts',
      templateKind: 'bait_switch_5', difficultyTier: 2, difficultyLabel: 'Seasoned', recommendedHp: 35, recommendedWeaponRarity: 'Uncommon',
      minRep: 0, factionId: 'REPLACE-with-a-faction-id', rewardTc: 450, rewardItem: null, rewardRep: 4, trophyName: 'Stalker Fang',
      stages: [
        { stageType: 'inciting_hook', narration: 'The foreman keeps his voice low. "It doesn\'t come up. We go down. Whatever it is, it learned the shafts before we did."', arbiter: null, checkKind: null },
        { stageType: 'descent', narration: 'The lamps gutter the deeper you go. Drag-marks in the dust lead off the mapped tunnels entirely.', arbiter: null, checkKind: 'investigate' },
        { stageType: 'reversal', narration: 'The marks loop back. It is not fleeing into the dark — it has been circling you the whole way down.', arbiter: '"You were the one being tracked," the narrator says.', checkKind: 'stealth' },
        { stageType: 'confrontation', narration: 'It drops from the shaft ceiling between you and the way out. Nowhere to run but through it.', arbiter: null, checkKind: 'boss' },
        { stageType: 'resolution', narration: 'You climb back into daylight with a fang and a story the foreman would rather not hear.', arbiter: null, checkKind: null },
      ],
    },
  ],
  mysteries: [
    {
      id: 'mystery_cipher_casing', title: 'The Cipher Casing',
      posterText: 'A scholar will pay handsomely for an intact Cipher Casing — the cursed core\'s outer shell, never recovered whole. 400 coin.',
      trophyName: 'Cipher Casing', minRep: 0, factionId: 'REPLACE-with-a-faction-id', rewardTc: 400, rewardItem: 'Worked Crystal', rewardRep: 8,
      stages: [
        { narration: 'The scholar slides a sketch across the table — a hexagonal ironwork with a maker\'s seal on one face. "The casing shed pieces when it cooled. They turn up. Find one."', arbiter: null, checkKind: null },
        { narration: 'You think back through old salvage notes. The pieces roll downhill — anywhere loose ground collects, eventually one ends up. Crystal-rich soil is the place to look.', arbiter: '"You know the where," the narrator says. "Now do the work."', checkKind: 'investigate' },
        { narration: 'You dig along a vein where the silt has built a lip. After an hour, a piece catches your blade — hexagonal, faintly warm.', arbiter: null, checkKind: 'investigate' },
        { narration: 'You wipe it clean. The seal is intact. This will satisfy the scholar.', arbiter: null, checkKind: 'boss' },
      ],
    },
    {
      id: 'mystery_steady_compass', title: 'The Steady Compass',
      posterText: 'A trader offers 300 coin for a working Steady Compass — one of the few instruments that holds true through a lightning storm.',
      trophyName: 'Steady Compass', minRep: 0, factionId: null, rewardTc: 300, rewardItem: null, rewardRep: null,
      stages: [
        { narration: 'The trader taps a dead compass on the counter. "Find me one that doesn\'t spin. They were made before the storms. Somebody still has one."', arbiter: null, checkKind: null },
        { narration: 'Asking around points you to a wreck on the high ground where a surveyor died with his kit still strapped on.', arbiter: null, checkKind: 'investigate' },
        { narration: 'You pry the compass from the surveyor\'s pack. The needle holds dead steady, even as the air hums.', arbiter: null, checkKind: 'boss' },
      ],
    },
  ],
  quests: [
    {
      id: 'fq_relay', factionId: 'REPLACE-with-a-faction-id', title: 'Silence the Relay',
      description: 'Knock out the forward relay before the next supply drop. Staged contract — comes with a small reward kit.',
      objective: 'Cross the line, find the relay, and put it down.',
      requirement: { rep: 15 }, reward: { tc: 120, rep: 8, items: ['Bright Torch'] },
      stages: [
        { narration: 'Cross the line and find the relay mast on the high ground.', advanceOn: 'travel' },
        { narration: 'Put the relay down, and its guards with it.', advanceOn: 'kill' },
      ],
    },
    {
      id: 'fq_scrap_run', factionId: 'REPLACE-with-a-faction-id', title: 'Scrap Run',
      description: 'The board\'s standing bounty: the order always needs reforging stock. Bring in 3 Scrap Metal.',
      objective: 'Gather 3 Scrap Metal, then turn the quest in at the board or any agent.',
      requirement: { rep: 0 }, reward: { tc: 35, rep: 6 },
      fetch: { itemName: 'Scrap Metal', quantity: 3 },
    },
  ],
  storylines: [
    {
      id: 'story_gather_casings', title: 'The Scattered Casings',
      posterText: 'A scholar wants you to gather every Cipher Casing you can find and bring them in. Multi-step contract. 1500 coin and standing on completion.',
      factionId: 'REPLACE-with-a-faction-id', minRep: 5, rewardTc: 1500, rewardItem: 'Banded Cuirass', rewardRep: 25,
      stages: [
        { narration: 'The scholar spreads a map. "We need every Casing we can put hands on. At least seven, scattered across the silt belt. Find them. Bring them. We pay for each."', arbiter: '"They\'re rebuilding something," the narrator says.', checkKind: null },
        { narration: 'The first Casing shows up where the scholar promised — a hexagonal piece of cooled iron, still warm. You pocket it.', arbiter: null, checkKind: 'investigate' },
        { narration: 'A second turns up in an old caravan-wreck. You haggle with the survivor over the price of taking it.', arbiter: null, checkKind: 'diplomacy' },
        { narration: 'A rival courier is also hunting the Casings — you pass on the road and stay clear of their notice.', arbiter: null, checkKind: 'stealth' },
        { narration: 'You assemble what you have and study them. They fit together — partially. The scholar was right. You carry the bundle back.', arbiter: null, checkKind: 'boss' },
      ],
    },
  ],
  objectives: [
    { id: 'recover_core', verb: 'Recover', target: 'a power core', tags: ['relic', 'high_value', 'core'] },
    { id: 'map_chamber', verb: 'Map', target: 'the unexplored chamber beneath', tags: ['exploration', 'map'] },
    { id: 'escort_scholar', verb: 'Escort', target: 'a wandering scholar', tags: ['escort'] },
    { id: 'raid_vault', verb: 'Raid', target: 'a rival supply vault', tags: ['theft'] },
  ],
  complications: [
    { id: 'rival_patrol', text: 'before a rival patrol arrives', severity: 3, tags: ['faction:REPLACE-with-a-faction-id', 'time_pressure'] },
    { id: 'approaching_storm', text: 'before the storm rolls in', severity: 3, tags: ['weather', 'time_pressure'] },
    { id: 'before_collapse', text: 'before the chamber collapses on itself', severity: 4, tags: ['structural', 'time_pressure'] },
    { id: 'tracked', text: 'while something unseen tracks you through the dark', severity: 3, tags: ['psychological', 'stalker'] },
  ],
  rewards: [
    { id: 'tc_small', type: 'currency', label: '30 Coin', amount: 30, tags: ['currency', 'small'] },
    { id: 'tc_medium', type: 'currency', label: '120 Coin', amount: 120, tags: ['currency', 'medium'] },
    { id: 'faction_favor', type: 'standing', label: 'a faction\'s favor (+5)', faction: 'REPLACE-with-a-faction-id', amount: 5, tags: ['faction'] },
    { id: 'common_relic', type: 'relic', label: 'a common relic', tier: 'common', tags: ['relic'] },
  ],
} satisfies Record<string, unknown[]>;
