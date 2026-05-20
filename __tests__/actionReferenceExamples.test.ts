// Regression: every example phrase in ActionReferenceScreen.EXAMPLES
// must actually route to the intent its parent card promises. If a
// card titled "Take Cover" lists "take cover" as a Type: example,
// the parser MUST resolve that string to intent=take_cover — or the
// reference is lying to the player.
//
// Playtest log caught the original break: "take cover" was in the
// take_cover synonym list as 'takecover' (already-collapsed), so
// player input matched verb='take' (pickup) first and never reached
// the take_cover branch. The fix went into OTA 129; this test locks
// it in so the EXAMPLES table can never silently drift out of sync
// with the parser dictionary again.

import { parseInput } from '../app/engine/parser';
import type { Intent } from '../app/engine/types';

// Mirror the EXAMPLES map from ActionReferenceScreen. Kept in sync
// by hand — the screen's list is the canonical source, this is a
// snapshot for the assertion harness.
const EXAMPLES: Record<string, string[]> = {
  // Movement
  move_action: ['walk', 'go north', 'continue'],
  sprint_action: ['sprint', 'dash west', 'run to the wall'],
  take_cover_action: ['take cover', 'hide behind the rubble', 'duck for cover'],
  perform_action: ['perform', 'sing', 'play a tune'],
  assist_action_combat: ['help', 'assist the reclaimer'],
  hold_action: ['ready', 'wait for an opening'],
  flee_action: ['flee', 'run away', 'retreat'],
  classic_move: ['walk', 'step forward', 'move closer'],
  difficult_terrain: ['cross the mud', 'wade through the silt'],
  crawl: ['crawl', 'crawl forward'],
  climb: ['climb', 'climb the ladder', 'climb the wall'],
  swim: ['swim', 'swim across'],
  standing_long_jump: ['jump', 'jump the gap'],
  running_long_jump: ['jump while sprinting', 'leap the chasm at a run'],
  // Combat
  attack_action: ['attack the goblin', 'strike the sentinel', 'swing at it'],
  brawl_action: ['punch', 'kick', 'grapple the goblin'],
  use_weapon_action: ['attack with the rust rifle', 'use the bone maul'],
  fighting_maneuver: ['disarm', 'trip the goblin', 'shove'],
  overwhelm_action: ['overwhelm', 'press the attack'],
  throw_action: ['throw the knife', 'hurl the rock at the goblin'],
  dash_action: ['dash', 'rush forward'],
  disengage_action: ['disengage', 'step back', 'back away safely'],
  dodge_action: ['dodge', 'duck'],
  help_action: ['help', 'assist'],
  use_object_action: ['use torch on the door', 'use rope on the gap'],
  hide_action: ['hide', 'sneak'],
  ready_action: ['ready', 'wait to react'],
  search_action: ['search', 'search the room', 'look around'],
  mount_action: ['mount', 'mount the horse'],
  // Firearms
  fire_weapon_action: ['fire', 'shoot the goblin'],
  quick_fire_action: ['quick fire', 'snap shot'],
  aim_action: ['aim', 'aim at the goblin'],
  point_blank_range: ['fire point blank'],
  multiple_shot: ['fire two shots', 'shoot three times'],
  fire_automatic: ['full auto', 'spray'],
  reload_action: ['reload', 'reload my rifle'],
  single_bullet_reload: ['load two shells'],
  bolt_caster: ['fire the bolt caster'],
  // Evasive
  dodge_melee: ['dodge the swing', 'duck the blow'],
  fight_back: ['fight back', 'parry', 'counter'],
  dive_for_cover: ['dive for cover', 'dive behind the wall'],
  // Skills
  pick_a_lock: ['pick the lock'],
  track_an_enemy: ['track', 'follow the tracks'],
  set_traps: ['set a trap'],
  translate_tome: ['translate the tome'],
  // Aetheric
  learn_spell: ['study the spell', 'learn the rune'],
  // Social / info
  gathering_information: ['ask about the merchant', 'gather information'],
  social_interactions: ['talk to Halem', 'persuade the guard', 'intimidate the thug'],
  preparation_and_planning: ['rest', 'plan ahead'],
  psychological_actions: ['steady myself', 'calm down'],
};

// Each card maps to the SET of intents its examples are allowed to
// resolve to. Most cards point at one intent; some action cards
// legitimately span multiple intents (e.g. brawl examples mix into
// the attack intent, dive_for_cover into take_cover, etc.). The
// test only fires when an example resolves to something OUTSIDE
// the allowed set — that's the contract-violation case.
const CARD_TO_INTENTS: Record<string, Intent[]> = {
  // Movement
  move_action: ['travel'],
  sprint_action: ['dash', 'travel'],
  take_cover_action: ['take_cover'],
  perform_action: ['diplomacy'],
  assist_action_combat: ['help'],
  hold_action: ['ready', 'wait'],
  flee_action: ['escape'],
  classic_move: ['travel'],
  difficult_terrain: ['travel', 'swim'],
  crawl: ['stealth', 'travel'],
  climb: ['climb'],
  swim: ['swim'],
  standing_long_jump: ['jump'],
  running_long_jump: ['jump', 'dash'],
  // Combat
  attack_action: ['attack'],
  brawl_action: ['attack'],
  use_weapon_action: ['attack', 'use_relic'],
  fighting_maneuver: ['maneuver', 'open'],
  overwhelm_action: ['attack'],
  throw_action: ['throw'],
  dash_action: ['dash'],
  disengage_action: ['disengage', 'retreat'],
  dodge_action: ['dodge'],
  help_action: ['help'],
  use_object_action: ['use_relic'],
  hide_action: ['stealth'],
  ready_action: ['ready', 'wait'],
  search_action: ['investigate'],
  mount_action: ['mount'],
  // Firearms
  fire_weapon_action: ['attack'],
  quick_fire_action: ['quick_fire'],
  aim_action: ['aim'],
  point_blank_range: ['attack'],
  multiple_shot: ['multi_fire', 'attack'],
  fire_automatic: ['multi_fire', 'attack'],
  reload_action: ['reload'],
  single_bullet_reload: ['reload'],
  bolt_caster: ['attack'],
  // Evasive
  dodge_melee: ['dodge'],
  fight_back: ['fight_back'],
  dive_for_cover: ['take_cover', 'dodge'],
  // Skills
  pick_a_lock: ['open'],
  track_an_enemy: ['investigate'],
  set_traps: ['craft', 'maneuver'],
  translate_tome: ['investigate'],
  // Aetheric
  learn_spell: ['investigate', 'ask'],
  // Social / info
  gathering_information: ['ask', 'diplomacy', 'investigate'],
  social_interactions: ['diplomacy'],
  preparation_and_planning: ['rest', 'ready', 'wait'],
  psychological_actions: ['ready', 'wait', 'rest'],
};

describe('Actions Reference — every example resolves to its parent intent', () => {
  for (const [cardId, examples] of Object.entries(EXAMPLES)) {
    const allowed = CARD_TO_INTENTS[cardId];
    if (!allowed) {
      throw new Error(`CARD_TO_INTENTS missing entry for "${cardId}"`);
    }
    for (const phrase of examples) {
      it(`"${phrase}" → one of [${allowed.join('|')}] (card: ${cardId})`, () => {
        const parsed = parseInput(phrase);
        expect(allowed).toContain(parsed.intent);
      });
    }
  }
});
