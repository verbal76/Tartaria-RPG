// ⚠⚠⚠ OTA-1738 — THE TEACHING REGISTRY: every first-use card's copy, in one place.
//
// The 11B4DF audit found the cards' copy scattered across eight screens, three
// of them stating rules the engine no longer runs (the Repair tab "spends TC",
// a torch that "burns down", a courier that takes a hunt's trophy), and no
// place a player could reread a dismissed card. This module is the one body of
// copy: the screens render `TEACH.<id>` through FirstTimeHint exactly as
// before, and the Guidance screen (Settings → GUIDANCE → REPLAY TEACHING)
// lists the same entries with their seen state.
//
// ⚠ RULES ARE QUOTED FROM THE CONSTANTS THAT RUN THEM. Where a card names a
// number the engine owns — the reinforcement cap, the dog price, the flee
// cost, the pity interval, the scrap odds — the card reads the constant, so the
// copy cannot drift the way the pity claim did (50 in the doc, 100 in the game
// for the whole of OTA-436's life).
//
// ⚠ IDS ARE STABLE AND NEVER REUSED. A card whose rule changed carries a new
// id (…_v2), because dismissals are per install and a corrected body under the
// old id would never be seen by anyone who dismissed the wrong one.
//
// ⚠ TEACH RULES, NOT CONTENT. Nothing here names a recipe location, a weakness,
// a climb's prize or a story answer.

import { REINFORCE_MAX_LEVEL } from '../engine/durability';
import { REPLACEMENT_DOG_PRICE, FACTION_DOG_PRICE } from '../engine/dogMarket';
import { scrapSuccessChance } from '../engine/scrapEngine';
import { COATING_DOT_TURNS } from '../engine/weaponCoating';
import { LOYALTY_DECAY_HOURS, DOG_LOYALTY_BANDS } from '../engine/dogCompanion';
import { STAMINA_COSTS } from '../engine/staminaCosts';

export type TeachingGroup = 'exploration' | 'combat' | 'inventory' | 'trade' | 'crafting' | 'companions' | 'screens';

export interface Teaching {
  /** Stable per-install key (FirstTimeHint id). */
  id: string;
  title: string;
  body: string;
  group: TeachingGroup;
  /** One line for the replay screen: when this card fires. */
  when: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const SCRAP_BASE = pct(scrapSuccessChance(10, 10));

export const TEACHINGS = {
  // ── exploration ──────────────────────────────────────────────────────────
  picker_colour_lanes: {
    id: 'picker_colour_lanes', group: 'exploration', when: 'the first room picker with two or more colour lanes',
    title: 'The room, by colour',
    body: 'TAKE / SALVAGE opens the whole room grouped by colour — orange gear, green items, yellow salvage. Sweep a colour with its button, or tap one line.',
  },
  climb_first: {
    id: 'climb_first', group: 'exploration', when: 'the first climb picker outside the tutorial',
    title: 'Going up',
    body: 'A climb goes in tiers, and each one costs stamina — the taller the thing, the more it takes to reach the top, and coming down costs again. What is up there is usually worth it, but check your stamina before the last tier: running out partway is how a fall happens. Rope is required, and a better rope makes every tier cheaper.',
  },
  torch_first_v2: {
    id: 'torch_first_v2', group: 'exploration', when: 'the first lead you charge with the Aetheric Torch',
    title: 'Charging a lead',
    body: 'The Aetheric Torch is not a lamp that burns while lit — each USE spends one torch outright. Aim it at an open lead to charge it: a charged lead pays better when you investigate it, and Wisdom sharpens the odds. In a room with no lead, sweep it to mark ✦ what actually repays a closer look. When more than one lead could take the charge, the game asks which. Traders stock more.',
  },
  pickpocket_first: {
    id: 'pickpocket_first', group: 'exploration', when: 'the first PICKPOCKET picker',
    title: 'Lifting a pocket',
    body: 'PICKPOCKET goes for what someone is carrying, not what they have laid out to sell — their table is a TAKE or a trade. It is a check against them, and failing it is not free: get caught and the mark turns on you, and the whole faction hears about it. Standing you spent hours earning can go in one bad roll.',
  },
  parley_first: {
    id: 'parley_first', group: 'exploration', when: 'the first parley card',
    title: 'Talking instead of swinging',
    body: 'Not every fight has to be one. A parley opens two ways out — leaning on them or winning them over — and which one works depends on who they are and what you have already done to their people. You can skip the choice entirely by typing the verb you want: intimidate, persuade, calm. A parley that fails still costs you the beat, and they act.',
  },
  gift_first: {
    id: 'gift_first', group: 'exploration', when: 'the first GIVE',
    title: 'Giving something away',
    body: 'GIVE hands an item over for nothing and buys standing instead. What it is worth to them depends on who they are — a Mud Monarch cares about different things than a Tomekeep — and giving to one faction can cool another that hates them. The item is gone either way, so give what you can spare, not what you might need.',
  },
  race_ability_first: {
    id: 'race_ability_first', group: 'exploration', when: 'the first time ✦ ABILITY lights',
    title: 'Your race’s gift',
    body: '✦ ABILITY lights when one of your race’s gifts is ready. Tap it and pick one. Each is spent for the day once used and comes back when the in-game day turns; some only work with a fight in front of you.',
  },
  procedure_text_first: {
    id: 'procedure_text_first', group: 'crafting', when: 'the first Procedure Text in your pack',
    title: 'A procedure text',
    body: 'You’re carrying a Procedure Text — an aether technique, written down. READ it to learn the technique: tap it in your pack, or type read and its name. If it’s beyond you today, it keeps — nothing is wasted.',
  },
  // ── combat ───────────────────────────────────────────────────────────────
  combat_primer_v1: {
    id: 'combat_primer_v1', group: 'combat', when: 'your first fight on this install',
    title: 'Your first fight',
    body: 'Healing is free mid-fight. DODGE reads a swing for double damage back. STEALTH before contact is a free opening. APPROACH closes the range. Power colours the matchup. FLEE is always there and costs stamina. The row grows with your kit. (The full card is the fight primer.)',
  },
  combat_readout: {
    id: 'combat_readout', group: 'combat', when: 'the fight after your first, once the primer has been seen',
    title: 'Reading the fight',
    body: 'Every swing shows its arithmetic. `d20 → 14 + ATK 8 = 22 vs your AC 28` is their roll against your armour. `needs nat 16+ — AC capped` means your armour is high enough that only the die itself can beat you — a high enough raw roll lands regardless of the total, so no armour makes you untouchable. On damage, `[plate −2]` is flat armour soak, `35% resisted` is your resistance to that damage type, and `[edge of reach — halved]` means they were barely close enough. Coatings tick on their own line — burn and acid keep eating for a set number of turns after the hit that started them.',
  },
  combat_shield_block: {
    id: 'combat_shield_block', group: 'combat', when: 'a shield on your off arm in a fight',
    title: 'The shield on your arm',
    body: 'A shield on the off arm adds two buttons. BLOCK sets you behind it — the first blow that comes breaks on it — but you hold position for the round, so everything else in reach gets a swing. SHIELD BASH is the same shield turned offensive: it goes through the normal attack, and a solid hit staggers them. BLOCK wants a shield; bare-armed, DODGE is the read.',
  },
  combat_throw_spear_v2: {
    id: 'combat_throw_spear_v2', group: 'combat', when: 'a spare throwing spear in the pack during a fight',
    title: 'Throwing a spear',
    body: 'Carry a spare long shaft and THROW SPEAR appears in a fight. It hurls the spare at its own throwing range — much further than you can stab with it. One spear is spent on every throw, hit or miss, and whatever was in your off hand comes back afterward. Keep one back if you want it twice.',
  },
  elevation_first_fight: {
    id: 'elevation_first_fight', group: 'combat', when: 'the first fight from a climb',
    title: 'Fighting from up here',
    body: 'Height cuts both ways. Nothing on the ground can reach you — but most of what you carry cannot reach DOWN either, and a weapon that cannot will just refuse when you tap it. Bows, slings and thrown weapons work from up here; a blade needs you back on the ground. Your golem cannot climb, so it waits at the base. Climb down to close, or fight with something that carries.',
  },
  // ── inventory ────────────────────────────────────────────────────────────
  inventory_first_open: {
    id: 'inventory_first_open', group: 'inventory', when: 'the first time you open your pack',
    title: 'Your pack',
    body: 'Tap any item to equip, use, salvage, or drop. The green line shows damage; the diamond means engine-named.',
  },
  scrap_first: {
    id: 'scrap_first', group: 'inventory', when: 'the first salvageable piece in your pack, after the tutorial',
    title: 'Breaking things down',
    body: `Salvaging a pack item is a roll — ${SCRAP_BASE} to start, better with INT and DEX — and the item is gone either way: a failed roll leaves you one unit of its first material. Mission items and raw stock refuse. What comes out is repair and crafting stock, not coin.`,
  },
  throwables_first: {
    id: 'throwables_first', group: 'inventory', when: 'the first throwable or coating in your pack',
    title: 'Throwables and coatings',
    body: `Throwables ride the BANDOLIER — stow them from the pack and they fly at their own range in a fight. A coating paints a weapon so its hits carry burn, acid or the like for ${COATING_DOT_TURNS} turns after the strike that started it. One coat at a time: a new coat scrubs the old.`,
  },
  // ── trade ────────────────────────────────────────────────────────────────
  vendor_first_open_v2: {
    id: 'vendor_first_open_v2', group: 'trade', when: 'the first trader',
    title: 'The trader',
    body: 'Buy and sell here. Prices swing with the seller’s faction power and your standing — a favored trader deals kinder. At a faction’s own site, the armory only racks faction gear for people the host trusts.',
  },
  reinforce_first: {
    id: 'reinforce_first', group: 'trade', when: 'the first counter with REINFORCE YOUR GEAR rows',
    title: 'Reinforcing a weapon',
    body: `Reinforcing raises a weapon’s maximum durability for good — up to +${REINFORCE_MAX_LEVEL} — for materials and TC that climb with each rung. It raises the ceiling only: a worn blade stays worn until it is mended. Each row shows the rung, the cost and the blade it belongs to.`,
  },
  workings_first: {
    id: 'workings_first', group: 'trade', when: 'the first counter offering a working you could afford',
    title: 'Workings to learn',
    body: 'A working is a recipe learned for good: pay once and it is yours at every bench. ✓ KNOWN rows are ones you already hold and cannot be bought twice. Workings also turn up as found texts and story rewards, so a price here is one road, not the only one.',
  },
  repair_vendor_first: {
    id: 'repair_vendor_first', group: 'trade', when: 'the first trader while something you carry is worn',
    title: 'Two ways to mend',
    body: 'A trader mends for TC — the bill climbs with the points missing. Your own bench (CRAFT → REPAIR) mends the same piece for materials instead: twice what it would salvage into. Either way it is back to full.',
  },
  dog_replacement_first: {
    id: 'dog_replacement_first', group: 'companions', when: 'the first trader offering a dog after yours is gone',
    title: 'A dog for sale',
    body: `With your dog gone, a trader can sell you a grown one for ${REPLACEMENT_DOG_PRICE} TC — one at a time, named on the spot. A faction’s own breed costs ${FACTION_DOG_PRICE} and needs their trust first.`,
  },
  // ── companions ───────────────────────────────────────────────────────────
  golem_first_v2: {
    id: 'golem_first_v2', group: 'companions', when: 'the first golem you raise',
    title: 'Your golem',
    body: 'A golem fights beside you and takes hits meant for you, but it is not a second you: it cannot climb, so it waits at the base of anything you go up. Kits do not heal it — feed it its own parts from your pack, or a trader will patch it. Name it when you raise it — the name sticks, and it is what the log will call it when it goes down for you.',
  },
  // ── screens ──────────────────────────────────────────────────────────────
  map_first_open: {
    id: 'map_first_open', group: 'screens', when: 'the first atlas',
    title: 'The map',
    body: 'Tap a known place to set a course; travel burns stamina and time. Your dot shows where you stand.',
  },
  world_first_open: {
    id: 'world_first_open', group: 'screens', when: 'the first World board',
    title: 'The living world',
    body: 'This board is alive — factions fight, gain, and lose ground on their own. Take bounties here; tap a header to unfold the standings.',
  },
  character_first_open: {
    id: 'character_first_open', group: 'screens', when: 'the first character sheet',
    title: 'Your character',
    body: 'Tap any stat or number to see exactly what feeds it. Scroll down for your Chronicle — the legend of what you’ve done.',
  },
  lore_first_open: {
    id: 'lore_first_open', group: 'screens', when: 'the first codex',
    title: 'The codex',
    body: 'Your reference for Tartaria’s factions, races, and history. New entries unlock here as you discover them in play.',
  },
  contracts_first_open_v3: {
    id: 'contracts_first_open_v3', group: 'screens', when: 'the first Contracts screen',
    title: 'Your missions',
    body: 'Everything you’ve taken on lives here — hunts, faction work, and bounties. Tap one to set a course or check your progress. Hand-ins answer to whoever owns the ground you stand on; faction work and mysteries can also go by broker or courier for a cut, but a hunt’s trophy is shown in person.',
  },
  crafting_tab_craft: {
    id: 'crafting_tab_craft', group: 'crafting', when: 'the CRAFT tab',
    title: 'Craft tab',
    body: 'Every gear / relic blueprint. Ready-to-craft ones are highlighted; the rest list what you’re missing.',
  },
  crafting_tab_repair_v2: {
    id: 'crafting_tab_repair_v2', group: 'crafting', when: 'the REPAIR tab',
    title: 'Repair tab',
    body: 'Damaged weapons, armor, and relics. Mending here costs MATERIALS — twice what the piece would salvage into — and restores it fully. A trader mends the same piece for TC instead.',
  },
  crafting_tab_recipes: {
    id: 'crafting_tab_recipes', group: 'crafting', when: 'the RECIPES tab',
    title: 'Recipes tab',
    body: 'Food, tonics, elixirs. Tap a recipe with materials in hand to fire it. Same craftable-highlight rule as Craft.',
  },
  crafting_tab_aetheric_v2: {
    id: 'crafting_tab_aetheric_v2', group: 'crafting', when: 'the AETHERIC tab',
    title: 'Aetheric tab',
    body: 'Your aether techniques live here — tap Channel to raise one; each channel costs a dose of corruption, and practice raises your rank. Techniques are learned from Procedure Texts: bought from a faction that trusts you, found at aether-heavy ruins, or earned in stories. Below them, the three disciplines — shape stone, summon golem, mend wounds.',
  },
  fusion_first: {
    id: 'fusion_first', group: 'crafting', when: 'the first Fusing Crucible',
    title: 'The Fusing Crucible',
    body: 'The Crucible pushes one item into another and keeps the result. It consumes both — there is no undoing it and no separating them again afterwards — so fuse the spare into the keeper, never the other way round. If a pairing is refused, the Crucible says why rather than wasting the pair.',
  },
} as const satisfies Record<string, Teaching>;

export type TeachingId = keyof typeof TEACHINGS;

/** Every card, in display order for the replay screen. */
export const ALL_TEACHINGS: readonly Teaching[] = Object.values(TEACHINGS);

/** The dog onboarding card's feeding line — quoted from the clock it runs on. */
export const DOG_FEEDING_LINE =
  `Feed them: every ${LOYALTY_DECAY_HOURS} hours without a meal costs one loyalty. ` +
  `The Arbiter warns you at ${DOG_LOYALTY_BANDS.join(', ')}; at zero they walk, and they do not come back.`;

/** The tutorial's one movement-cost sentence, from the same table the store charges. */
export const MOVEMENT_COST_LINE =
  `Out there every step costs ${STAMINA_COSTS.wander} stamina and a little time; REST brings it back.`;
