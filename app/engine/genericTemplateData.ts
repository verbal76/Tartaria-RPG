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
