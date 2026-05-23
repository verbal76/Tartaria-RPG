import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';
import conceptsData from '../data/lore/concepts.json';
import { RECIPES, WEAPONS, ARMOR, AMULETS, RINGS, GEAR, MATERIALS } from '../engine/crafting';

function recipeDescription(name: string): string | null {
  const w = WEAPONS.find((x) => x.name === name);
  if (w) return w.description;
  const a = ARMOR.find((x) => x.name === name);
  if (a) return a.description;
  const g = GEAR.find((x) => x.name === name);
  if (g) return g.description;
  const am = AMULETS.find((x) => x.name === name);
  if (am) return am.description;
  const r = RINGS.find((x) => x.name === name);
  if (r) return r.description;
  const m = MATERIALS.find((x) => x.name === name);
  if (m) return m.description;
  return null;
}

interface Concept {
  id: string;
  title: string;
  answer: string;
  keywords: string[];
}

const concepts = (conceptsData.concepts as Concept[]);

// OTA 462 — Recipes tab. Three Aethercraft disciplines (hand-defined
// because they're not in recipes.json — they're spell-equivalents that
// burn Aether-tagged fuel) plus every craft recipe grouped by output
// category. Tapping a recipe card queues "craft <result>" exactly the
// way the existing action cards queue their example phrase.
type RecipeMode = 'actions' | 'recipes';

interface AethercraftDiscipline {
  id: string;
  title: string;
  body: string;
  fuels: string[];
  examples: string[];
}

const AETHERCRAFT_DISCIPLINES: AethercraftDiscipline[] = [
  {
    id: 'aether_shape',
    title: 'Aetherstone Manipulation (shape)',
    body:
      'INT check, DC 12. In combat: +4 AC for one round (shaped-stone ward). Out of combat: ' +
      'binds an Aetheric Shard to a Small Rock, producing a throwable Shaped Aetheric Shard. ' +
      'Mud Dwellers and Aetherborn cast at the base DC; every other race rolls +4 harder.',
    fuels: ['Aetheric Shard', 'Aether Crystal', 'Aether Mud', 'Aether Residue', 'Golem Core', 'Aetheric Locket'],
    examples: ['shape stone', 'mold the aetherstone', 'manipulate stone'],
  },
  {
    id: 'aether_summon',
    title: 'Aether Golem Constructor (summon)',
    body:
      'INT check, DC 15 (harder than the other two — golems take stronger anchors). Summons ' +
      'an Aether Golem ally that fights for you for the rest of the scene. ' +
      'Mud Dwellers and Aetherborn cast at the base DC; every other race rolls +4 harder.',
    fuels: ['Aetheric Shard', 'Aether Crystal', 'Golem Core'],
    examples: ['summon golem', 'summon an aether golem', 'call a golem'],
  },
  {
    id: 'aether_mend',
    title: 'Aetheric Healing (mend)',
    body:
      'WIS check, DC 12. Restores HP to you or an ally. Aetherborn pay HP instead of corruption ' +
      'when they cast this — racial trait. Mud Dwellers and Aetherborn cast at the base DC; ' +
      'every other race rolls +4 harder.',
    fuels: ['Aetheric Shard', 'Aether Crystal'],
    examples: ['mend wounds', 'heal me', 'mend self', 'aetheric healing'],
  },
];

// Hard-grouped recipe partition. We classify by output catalog row;
// items absent from any catalog fall into MISC. The order is
// gameplay-priority (weapons first, then armor, then utility, then
// food/potions at the bottom).
const RECIPE_GROUPS: { title: string; names: string[] }[] = [
  {
    title: 'Weapons',
    names: [
      'Club', 'Cudgel', 'Stone Spear', 'Iron Spear', 'Aether-Shard Spear',
      'Aetheric Crystal Blade', 'Storm Rod',
      'Sentinel Cleaver', 'Founder\'s Edge',
      'Wyrm-Fang Blade', 'Mud-Iron Greatblade',
      'Voidspawn Bolt',
    ],
  },
  {
    title: 'Armor',
    names: [
      'Aetheric Vest', 'Sludge-Forged Vest', 'Aether-Wing Cloak', 'Mudstone Bulwark',
    ],
  },
  {
    title: 'Amulets & Rings',
    names: [
      'Mud Gem Amulet', 'Aether-Shard Ring', 'Lich-Heart Pendant',
      'Hollow Crown Circlet', 'Behemoth-Heart Talisman',
    ],
  },
  {
    title: 'Utility & Tools',
    names: [
      'Aetheric Torch', 'First Aid Kit', 'Aetheric Compass', 'Resonant Song Phial',
      'Iron-Worm Engine',
    ],
  },
  {
    title: 'Food',
    names: ['Forager\'s Stew', 'Hearty Stew', 'Mushroom Stew'],
  },
  {
    title: 'Potions & Tinctures',
    names: [
      'Red Cap Tincture', 'Blue Cap Draught', 'Violet Cap Distillate',
      'Orange Sporecap Brew', 'Many-Colored Tonic',
    ],
  },
];

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

// Sample inputs the parser will route to each action. 2-3 examples
// per action — kept distinct so new players see the full shape of the
// verb (with / without a target, with / without a noun) without
// repetition. Surfaced under every card in reward-green.
const EXAMPLES: Record<string, string[]> = {
  // Movement — every example here passes the
  // __tests__/actionReferenceExamples.test contract: each phrase
  // resolves to the parent card's intent.
  move_action: ['walk', 'go north', 'head onward'],
  sprint_action: ['sprint', 'dash west', 'sprint to the wall'],
  take_cover_action: ['take cover', 'hide behind the rubble', 'duck behind the wall'],
  perform_action: ['perform', 'sing', 'play a tune'],
  assist_action_combat: ['help', 'assist the reclaimer'],
  hold_action: ['ready', 'wait for an opening'],
  flee_action: ['flee', 'run away', 'retreat'],
  classic_move: ['walk', 'walk forward', 'move closer'],
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
  fight_back: ['fight back', 'riposte', 'counter'],
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

// Short, action-screen-specific explanations. The full lore answers in
// concepts.json are used by the Arbiter's "ask about X" lookups and
// stay verbose by design; here we want a one-line "what it does" so
// the player can scan the reference quickly. Fallback: original answer.
const SHORT: Record<string, string> = {
  // Movement
  move_action: 'Walk a short distance — one square, one cardinal direction.',
  sprint_action: 'Move up to 5× a normal step. Attacks this round take a penalty die.',
  take_cover_action: 'Get behind cover. Partial = +4 AC vs ranged; full = ranged auto-miss.',
  perform_action: 'Sing / play / perform for an audience or distraction. CHA-based.',
  assist_action_combat: 'Aid an ally. They get a bonus die on their next roll.',
  hold_action: "Ready an action — trigger fires on the condition you name.",
  flee_action: 'Leave the fight. Provokes opportunity attacks if enemies are adjacent.',
  classic_move: 'Default movement — one square in one direction.',
  difficult_terrain: 'Mud, rubble, water. Each square costs double movement.',
  crawl: 'Move while prone. Half speed, harder to hit at range.',
  climb: 'Go up. 1 climb square = 2 movement. STR/DEX check on bad surfaces.',
  swim: 'Through water. 1 swim square = 2 movement. STR check in heavy armor.',
  standing_long_jump: 'Jump from stand. STR × 2 feet, or DEX check to clear obstacles.',
  running_long_jump: 'Jump after a sprint. STR × 4 feet. Costs the sprint penalty.',

  // Combat
  attack_action: "d20 + weapon stat vs target's AC. Hit → roll damage.",
  brawl_action: 'Unarmed strike — punch, kick, grapple. STR-based, low damage.',
  use_weapon_action: 'Attack with a specific weapon. Use the weapon name.',
  fighting_maneuver: 'Disarm, trip, grapple, shove, pin, sweep, hook — opposed STR/DEX.',
  overwhelm_action: 'Press the attack — gain advantage but enemy fights back next round.',
  throw_action: 'Hurl a weapon / object. DEX-based; damage scales with item weight.',
  dash_action: 'Double your movement this round at the cost of your attack.',
  disengage_action: 'Step back without provoking an opportunity attack.',
  dodge_action: 'Defensive stance — +4 AC and advantage on DEX saves this round.',
  help_action: "Aid an ally's next roll. They roll with advantage.",
  use_object_action: 'Apply an item to a target. "use X on Y".',
  hide_action: 'Slip into cover / shadow. Opposed DEX vs the area\'s spotters.',
  ready_action: 'Hold for a trigger. Fires when the condition you stated occurs.',
  search_action: 'Look closer. Reveals hidden things, traps, items.',
  mount_action: 'Get on a mount. Adjusts speed and reach for combat.',

  // Firearms
  fire_weapon_action: "Shoot a ranged weapon. d20 + DEX vs target's AC.",
  quick_fire_action: 'Fire first — +50 initiative but only the shot. No moves.',
  aim_action: 'Spend a turn aiming. Next shot rolls advantage. Lost if you move/take damage.',
  point_blank_range: 'Fire at arm\'s reach. +2 attack, but provokes a melee response.',
  multiple_shot: 'Fire 2-3 rounds at once. Penalty die per extra shot.',
  fire_automatic: 'Full-auto burst. Damage to all in cone; ammo cost is steep.',
  reload_action: 'Reload a ranged weapon. Magazine = 1 action; loose rounds = 2/action.',
  single_bullet_reload: 'Slow reload for revolver / shotgun shells. 2 per action.',
  bolt_caster: 'Tartaria\'s firearm equivalent — magnetic bolt accelerator. INT or DEX.',

  // Evasive
  dodge_melee: 'Side-step a melee swing. Opposed DEX. Success negates damage.',
  fight_back: 'Counter the attacker with your own Fighting check. Risky.',
  dive_for_cover: 'Hit the ground behind cover. Free movement, but you\'re prone.',

  // Skills
  pick_a_lock: 'DEX check vs lock difficulty. Tools matter.',
  track_an_enemy: 'Follow a trail. WIS check; terrain modifies.',
  set_traps: 'Place a trap. DEX check, opposed by the target\'s perception.',
  translate_tome: 'Read a foreign / ancient text. INT check vs complexity.',
  learn_spell: 'Study a rune or text. INT check; success teaches you the spell.',

  // Social / info / planning
  gathering_information: 'Ask around. CHA check vs the locals\' suspicion.',
  social_interactions: 'Talk, persuade, intimidate, lie. CHA-based.',
  preparation_and_planning: 'Rest, plan, gather kit before a push.',
  psychological_actions: 'Steady yourself against fear / shock. WIS check.',

  // Modifiers — short rules-of-thumb so the reference page reads at a glance.
  mod_impaling_strike: 'Roll max damage on a critical hit with a piercing weapon.',
  mod_attacker_range: 'Out of weapon range = -5 to hit (blind swing) plus auto-advance.',
  mod_surprise_attack: 'First hit of the encounter from hiding: +2 attack, target rolls disadvantage.',
  mod_player_size: 'Smaller targets are harder to hit (+2 AC for Small / -2 for Large).',
  mod_sprinting: 'Attacks the round you sprint take a -2 penalty die.',
  mod_fast_moving_target: 'Ranged shots vs a sprinting / fleeing target: -2 to hit.',
  mod_target_dive: 'Target dove for cover this round: ranged attacks against them disadvantage.',
  mod_in_cover: 'Partial cover +4 AC vs ranged; full cover blocks ranged entirely.',
  mod_weapon_malfunction: 'Roll a natural 1 on a firearm: jam. Spend an action to clear.',
  mod_player_armour: 'Armor adds AC + damage resistance by type (see armor description).',
  mod_fire_into_melee: 'Shooting into a melee crowd: -2 + 25% chance to hit an ally.',
  mod_overwhelmed: 'Two+ enemies adjacent: -2 to defensive rolls.',
  mod_action_fumble: 'Natural 1 on an action roll: something goes wrong (dropped weapon, slip, etc.).',
};

function explanationFor(c: Concept): string {
  return SHORT[c.id] ?? c.answer;
}

export function ActionReferenceScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const queueInputDraft = useGameStore((s) => s.queueInputDraft);
  const [mode, setMode] = useState<RecipeMode>('actions');

  // Per-card cycle index. Tapping a card cycles its example list:
  // tap once → example[0] queues to input + clipboard; tap again →
  // example[1]; wraps back to [0] after the last. Visual feedback is
  // the "→ queued: '<phrase>'" line that appears under the card.
  // Index defaults to -1 so the first tap shows example[0] cleanly
  // (we increment THEN render).
  const [cycleIdx, setCycleIdx] = useState<Record<string, number>>({});

  // Same flag for the inline "✓ queued" pulse — keyed by card id with
  // a timestamp so the pulse hides itself after ~1.4s without forcing
  // a re-render dance.
  const [pulseAt, setPulseAt] = useState<Record<string, number>>({});

  const handleCardTap = (id: string, examples: string[]) => {
    if (examples.length === 0) return;
    const nextIdx = ((cycleIdx[id] ?? -1) + 1) % examples.length;
    setCycleIdx((prev) => ({ ...prev, [id]: nextIdx }));
    const phrase = examples[nextIdx]!;
    queueInputDraft(phrase);
    // Belt-and-suspenders — also drop on the clipboard so power-
    // users can paste anywhere if they wanted (Google search, a
    // note app, etc.). Fire-and-forget; we don't await.
    void Clipboard.setStringAsync(phrase).catch(() => { /* ignore */ });
    setPulseAt((prev) => ({ ...prev, [id]: Date.now() }));
  };

  const isQueued = (id: string) => {
    const t = pulseAt[id];
    return t !== undefined && Date.now() - t < 1400;
  };

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
        <Text style={styles.title}>{mode === 'actions' ? 'ACTIONS' : 'RECIPES'}</Text>
        <View style={{ width: 80 }} />
      </View>
      <View style={styles.modeTabs}>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'actions' && styles.modeTabActive]}
          onPress={() => setMode('actions')}
          activeOpacity={0.7}
        >
          <Text style={[styles.modeTabText, mode === 'actions' && styles.modeTabTextActive]}>
            ACTIONS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mode === 'recipes' && styles.modeTabActive]}
          onPress={() => setMode('recipes')}
          activeOpacity={0.7}
        >
          <Text style={[styles.modeTabText, mode === 'recipes' && styles.modeTabTextActive]}>
            RECIPES
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {mode === 'actions' ? (
          <>
            <Text style={styles.intro}>
              What every action does, with the exact mechanics. Tap any card to
              drop its first example into the input box — tap again to cycle
              through alternate phrasings. Hit BACK and finish the sentence.
            </Text>
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.ids.map((id) => {
                  const c = lookup(id);
                  if (!c) return null;
                  const examples = EXAMPLES[id] ?? [];
                  const queuedIdx = cycleIdx[id];
                  const queuedPhrase = queuedIdx !== undefined ? examples[queuedIdx] : null;
                  const queued = isQueued(id);
                  return (
                    <Pressable
                      key={id}
                      style={({ pressed }) => [
                        styles.card,
                        pressed && styles.cardPressed,
                        queued && styles.cardQueued,
                      ]}
                      onPress={() => handleCardTap(id, examples)}
                    >
                      <Text style={styles.cardTitle}>{c.title}</Text>
                      <Text style={styles.cardBody}>{explanationFor(c)}</Text>
                      {examples.length > 0 && (
                        <Text style={styles.cardExamples}>
                          <Text style={styles.cardExamplesLabel}>Tap to queue: </Text>
                          {examples.map((ex, i) =>
                            i === queuedIdx ? `[${ex}]` : `"${ex}"`,
                          ).join(' · ')}
                        </Text>
                      )}
                      {queued && queuedPhrase && (
                        <Text style={styles.queuedHint}>
                          ✓ &quot;{queuedPhrase}&quot; staged for the input box
                          {examples.length > 1 ? ` (${(queuedIdx ?? 0) + 1}/${examples.length} — tap again to cycle)` : ''}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={styles.intro}>
              Every craftable item — weapons, armor, accessories, food, potions —
              plus the three Aethercraft disciplines (shape stone, summon golem,
              mend wounds). Tap any card to drop its phrase into the input box.
            </Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Aethercraft Disciplines</Text>
              {AETHERCRAFT_DISCIPLINES.map((d) => {
                const queuedIdx = cycleIdx[d.id];
                const queuedPhrase = queuedIdx !== undefined ? d.examples[queuedIdx] : null;
                const queued = isQueued(d.id);
                return (
                  <Pressable
                    key={d.id}
                    style={({ pressed }) => [
                      styles.card,
                      pressed && styles.cardPressed,
                      queued && styles.cardQueued,
                    ]}
                    onPress={() => handleCardTap(d.id, d.examples)}
                  >
                    <Text style={styles.cardTitle}>{d.title}</Text>
                    <Text style={styles.cardBody}>{d.body}</Text>
                    <Text style={styles.recipeIngredients}>
                      <Text style={styles.recipeIngredientsLabel}>Fuel (any one): </Text>
                      {d.fuels.join(', ')}
                    </Text>
                    <Text style={styles.cardExamples}>
                      <Text style={styles.cardExamplesLabel}>Tap to queue: </Text>
                      {d.examples.map((ex, i) =>
                        i === queuedIdx ? `[${ex}]` : `"${ex}"`,
                      ).join(' · ')}
                    </Text>
                    {queued && queuedPhrase && (
                      <Text style={styles.queuedHint}>
                        ✓ &quot;{queuedPhrase}&quot; staged for the input box
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {RECIPE_GROUPS.map((group) => (
              <View key={group.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{group.title}</Text>
                {group.names.map((name) => {
                  const recipe = RECIPES.find((r) => r.result === name);
                  if (!recipe) return null;
                  const description = recipeDescription(name);
                  const cardId = `recipe:${name}`;
                  const phrase = `craft ${name}`;
                  const examples = [phrase];
                  const queued = isQueued(cardId);
                  return (
                    <Pressable
                      key={cardId}
                      style={({ pressed }) => [
                        styles.card,
                        pressed && styles.cardPressed,
                        queued && styles.cardQueued,
                      ]}
                      onPress={() => handleCardTap(cardId, examples)}
                    >
                      <Text style={styles.cardTitle}>{name}</Text>
                      {description ? (
                        <Text style={styles.cardBody}>{description}</Text>
                      ) : null}
                      <Text style={styles.recipeIngredients}>
                        <Text style={styles.recipeIngredientsLabel}>Needs: </Text>
                        {recipe.ingredients.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                      </Text>
                      <Text style={styles.cardExamples}>
                        <Text style={styles.cardExamplesLabel}>Tap to queue: </Text>
                        &quot;{phrase}&quot;
                      </Text>
                      {queued && (
                        <Text style={styles.queuedHint}>
                          ✓ &quot;{phrase}&quot; staged for the input box
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        )}
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
  cardPressed: {
    backgroundColor: '#1a1714',
    borderColor: '#9ec96a',
  },
  cardQueued: {
    borderColor: '#9ec96a',
  },
  queuedHint: {
    color: '#9ec96a',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '700',
    letterSpacing: 1,
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
  // OTA 462 — Recipes tab additions.
  modeTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 4,
    borderColor: '#3a342c',
    borderWidth: 1,
    backgroundColor: '#1a1612',
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: '#c9a86a',
    borderColor: '#c9a86a',
  },
  modeTabText: {
    color: '#cdbf99',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  modeTabTextActive: {
    color: '#13110f',
  },
  recipeIngredients: {
    color: '#a89a78',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
    fontStyle: 'italic',
  },
  recipeIngredientsLabel: {
    color: '#c9a86a',
    fontWeight: '700',
    fontStyle: 'normal',
    letterSpacing: 1,
  },
});
