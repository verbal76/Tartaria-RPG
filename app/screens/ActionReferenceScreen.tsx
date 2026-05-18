import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import conceptsData from '../data/lore/concepts.json';

interface Concept {
  id: string;
  title: string;
  answer: string;
  keywords: string[];
}

const concepts = (conceptsData.concepts as Concept[]);

// Group concepts by the action card they came from. Each section title
// matches the card the player was asked about. Concept ids are stable
// keys we can pull directly.
const SECTIONS: { title: string; ids: string[] }[] = [
  {
    title: 'Movement Actions',
    ids: ['move_action', 'sprint_action', 'take_cover_action', 'perform_action', 'assist_action_combat', 'hold_action', 'flee_action'],
  },
  {
    title: 'Move Types',
    ids: ['classic_move', 'difficult_terrain', 'crawl', 'climb', 'swim', 'standing_long_jump', 'running_long_jump'],
  },
  {
    title: 'Combat Actions',
    ids: ['attack_action', 'brawl_action', 'use_weapon_action', 'fighting_maneuver', 'overwhelm_action', 'throw_action', 'dash_action', 'disengage_action', 'dodge_action', 'help_action', 'use_object_action', 'hide_action', 'ready_action', 'search_action', 'mount_action'],
  },
  {
    title: 'Firearms Actions',
    ids: ['fire_weapon_action', 'quick_fire_action', 'aim_action', 'point_blank_range', 'multiple_shot', 'fire_automatic', 'reload_action', 'single_bullet_reload', 'bolt_caster'],
  },
  {
    title: 'Evasive Actions',
    ids: ['dodge_melee', 'fight_back', 'dive_for_cover'],
  },
  {
    title: 'Possible Modifiers',
    ids: ['mod_impaling_strike', 'mod_attacker_range', 'mod_surprise_attack', 'mod_player_size', 'mod_sprinting', 'mod_fast_moving_target', 'mod_target_dive', 'mod_in_cover', 'mod_weapon_malfunction', 'mod_player_armour', 'mod_fire_into_melee', 'mod_overwhelmed', 'mod_action_fumble'],
  },
  {
    title: 'Gathering Information',
    ids: ['gathering_information'],
  },
  {
    title: 'Social Interactions',
    ids: ['social_interactions'],
  },
  {
    title: 'Preparation and Planning',
    ids: ['preparation_and_planning'],
  },
  {
    title: 'Psychological Actions',
    ids: ['psychological_actions'],
  },
  {
    title: 'Skill-Based Actions',
    ids: ['skill_based_actions', 'pick_a_lock', 'track_an_enemy', 'set_traps', 'translate_tome'],
  },
  {
    title: 'Aetheric-Related Actions',
    ids: ['aetheric_related_actions', 'learn_spell'],
  },
];

function lookup(id: string): Concept | null {
  return concepts.find((c) => c.id === id) ?? null;
}

// Sample inputs the parser will route to each action. Surfaced under
// every card in green so new players can see EXACTLY what to type for
// the verb / intent the card describes. Pulled from the parser's
// synonym pool (app/engine/parser.ts) — adding a new synonym there
// without updating this map is fine, but adding the example here makes
// it discoverable from the reference screen.
const EXAMPLES: Record<string, string[]> = {
  // Movement
  move_action: ['walk', 'go north', 'head east', 'continue'],
  sprint_action: ['sprint', 'dash west', 'run to the wall'],
  take_cover_action: ['take cover', 'hide behind the rubble', 'duck for cover'],
  perform_action: ['perform', 'sing', 'play a tune'],
  assist_action_combat: ['help', 'assist the reclaimer', 'back them up'],
  hold_action: ['ready', 'hold my action', 'wait for an opening'],
  flee_action: ['flee', 'run away', 'retreat'],
  classic_move: ['walk', 'step forward', 'move closer'],
  difficult_terrain: ['cross the mud', 'wade through the silt'],
  crawl: ['crawl', 'crawl forward', 'crawl under'],
  climb: ['climb', 'climb the ladder', 'climb the wall'],
  swim: ['swim', 'swim across', 'wade through the water'],
  standing_long_jump: ['jump', 'jump the gap', 'leap across'],
  running_long_jump: ['jump while sprinting', 'leap the chasm at a run'],

  // Combat
  attack_action: ['attack the goblin', 'swing at the worm', 'strike the sentinel'],
  brawl_action: ['punch', 'kick', 'grapple the goblin'],
  use_weapon_action: ['attack with the rust rifle', 'use the bone maul'],
  fighting_maneuver: ['disarm', 'trip the goblin', 'shove', 'grapple', 'pin', 'sweep', 'hook'],
  overwhelm_action: ['overwhelm', 'press the attack'],
  throw_action: ['throw the knife', 'hurl the rock at the goblin'],
  dash_action: ['dash', 'sprint at them', 'rush forward'],
  disengage_action: ['disengage', 'back away safely', 'step back'],
  dodge_action: ['dodge', 'duck'],
  help_action: ['help', 'assist'],
  use_object_action: ['use torch on the door', 'use rope on the gap'],
  hide_action: ['hide', 'sneak', 'slip into shadow'],
  ready_action: ['ready', 'hold for opening', 'wait to react'],
  search_action: ['search', 'search the room', 'look around'],
  mount_action: ['mount', 'mount the horse'],

  // Firearms
  fire_weapon_action: ['fire', 'shoot the goblin', 'shoot the sentinel'],
  quick_fire_action: ['quick fire', 'snap shot', 'fire fast'],
  aim_action: ['aim', 'aim at the goblin', 'take aim'],
  point_blank_range: ['fire point blank', 'shoot at point-blank'],
  multiple_shot: ['fire two shots', 'shoot three times'],
  fire_automatic: ['full auto', 'spray', 'open up with the rifle'],
  reload_action: ['reload', 'reload my rifle'],
  single_bullet_reload: ['load two shells', 'load a bullet'],
  bolt_caster: ['fire the bolt caster', 'shoot the bolt caster'],

  // Evasive
  dodge_melee: ['dodge the swing', 'duck the blow'],
  fight_back: ['fight back', 'parry', 'counter'],
  dive_for_cover: ['dive for cover', 'dive behind the wall'],

  // Skills
  pick_a_lock: ['pick the lock', 'pick the chest lock'],
  track_an_enemy: ['track', 'follow the tracks', 'track the goblin'],
  set_traps: ['set a trap', 'lay a trap'],
  translate_tome: ['translate the tome', 'translate the inscription'],

  // Aetheric
  learn_spell: ['study the spell', 'learn the rune'],

  // Social / info
  gathering_information: ['ask about the merchant', 'gather information'],
  social_interactions: ['talk to Halem', 'persuade the guard', 'intimidate the thug'],
  preparation_and_planning: ['rest', 'plan ahead', 'prepare for travel'],
  psychological_actions: ['steady myself', 'calm down'],
};

export function ActionReferenceScreen() {
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ACTIONS REFERENCE</Text>
        <View style={{ width: 80 }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          What every action does, with the exact mechanics. Type the verb in
          the input box and the engine routes it — or just tap any quick
          button you see.
        </Text>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.ids.map((id) => {
              const c = lookup(id);
              if (!c) return null;
              const examples = EXAMPLES[id] ?? [];
              return (
                <View key={id} style={styles.card}>
                  <Text style={styles.cardTitle}>{c.title}</Text>
                  <Text style={styles.cardBody}>{c.answer}</Text>
                  {examples.length > 0 && (
                    <Text style={styles.cardExamples}>
                      <Text style={styles.cardExamplesLabel}>Type: </Text>
                      {examples.map((ex) => `"${ex}"`).join(' · ')}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backBtn: {
    backgroundColor: '#1a1714',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    width: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#e6d8b3', letterSpacing: 4, fontSize: 14 },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  intro: {
    color: '#7a705c',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#c9a86a',
    fontSize: 13,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomColor: '#3a342c',
    borderBottomWidth: 1,
  },
  card: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  cardTitle: {
    color: '#e6d8b3',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardBody: {
    color: '#cdbf99',
    fontSize: 12,
    lineHeight: 18,
  },
  // Examples appear under the answer in the reward-green tint so new
  // players can see exactly what to type. The leading "Type:" label is
  // the same green but bolder so the eye lands on it first.
  cardExamples: {
    color: '#9ec96a',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    fontStyle: 'italic',
  },
  cardExamplesLabel: {
    color: '#9ec96a',
    fontWeight: '700',
    fontStyle: 'normal',
    letterSpacing: 1,
  },
});
