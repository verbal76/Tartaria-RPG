// 2026-05-27 OTA-095 — Recipes mode removed. The Aethercraft
// disciplines + the recipe groupings (Weapons/Armor/Food/etc.)
// that lived here all moved to CraftingScreen. Aethercraft
// disciplines are now the new "AETHERIC" tab; recipe groupings
// are already covered by the existing CRAFT and RECIPES tabs
// on that same screen. ActionReferenceScreen is now ACTIONS
// ONLY — actions reference + concept cards.
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, TextInput } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';
import conceptsData from '../data/lore/concepts.json';

interface Concept {
  id: string;
  title: string;
  answer: string;
  keywords: string[];
}

const concepts = (conceptsData.concepts as Concept[]);

// OTA 462 → superseded by OTA-095. The Aethercraft disciplines
// + recipe groupings (Weapons/Armor/Food/Potions/etc.) that
// lived here moved to CraftingScreen — Aethercraft is now the
// new "AETHERIC" tab; recipe groupings are covered by the
// existing CRAFT (non-consumable) + RECIPES (consumable food
// /tonics) tabs. ActionReferenceScreen is now ACTIONS ONLY.

// Group concepts by the action card they came from. Each section title
// matches the card the player was asked about. Concept ids are stable
// keys we can pull directly.
const SECTIONS: { title: string; ids: string[] }[] = [
  {
    title: 'Movement Actions',
    // ⚠⚠ OTA-1713 — `advance_action` / `retreat_action` ADDED. Every other
    // combat manoeuvre the parser knows is taught on this screen — dash,
    // disengage, take cover, aim, reload, maneuver, quick fire, burst fire,
    // fight back — and these two, which share one handler, were the only pair
    // that fell out. They have no button either (none of the manoeuvres do;
    // that is the design), so nothing anywhere told a player they exist.
    ids: ['move_action', 'advance_action', 'retreat_action', 'sprint_action', 'take_cover_action', 'perform_action', 'assist_action_combat', 'hold_action', 'flee_action'],
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
  fighting_maneuver: ['disarm', 'trip the goblin', 'grapple'],
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
  sprint_action: 'Move up to 5× a normal step. Attacks this turn take a penalty die.',
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
  overwhelm_action: 'Press the attack — gain advantage but enemy fights back next turn.',
  throw_action: 'Hurl a weapon / object. DEX-based; damage scales with item weight.',
  dash_action: 'Double your movement this turn at the cost of your attack.',
  disengage_action: 'Step back without provoking an opportunity attack.',
  dodge_action: 'The dodge gamble — opposed DEX vs the swing, ignoring armor both ways. Win: take nothing, next strike deals double dice. Lose: the blow lands past any armor for 2× damage.',
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
  dodge_melee: 'Side-step a swing — opposed DEX vs its attack total. Win: untouched + a perfect opening (next strike ×2 dice). Lose: you dodge into it (2× damage, armor bypassed).',
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
  mod_sprinting: 'Attacks the turn you sprint take a -2 penalty die.',
  mod_fast_moving_target: 'Ranged shots vs a sprinting / fleeing target: -2 to hit.',
  mod_target_dive: 'Target dove for cover this turn: ranged attacks against them disadvantage.',
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

// arb88 — flat index of every card for the search box.
const ALL_CARDS: { section: string; id: string }[] = SECTIONS.flatMap((s) =>
  s.ids.map((id) => ({ section: s.title, id })),
);

// arb88 — which sections matter "right now". When the player is mid-fight we
// float the combat-side sections to the top; otherwise the exploration-side
// ones lead. Everything stays in the list — only the order changes.
const COMBAT_SECTIONS = new Set([
  'Combat Actions', 'Firearms Actions', 'Evasive Actions', 'Possible Modifiers',
]);
const EXPLORE_SECTIONS = new Set([
  'Movement Actions', 'Move Types', 'Gathering Information',
  'Social Interactions', 'Skill-Based Actions', 'Preparation and Planning',
]);

export function ActionReferenceScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const queueInputDraft = useGameStore((s) => s.queueInputDraft);
  // arb88 — drives the context-first ordering of the reference.
  const inCombat = useGameStore((s) => (s.currentScene?.enemies?.length ?? 0) > 0);
  // arb88 — free-text filter across title / explanation / examples / keywords.
  const [query, setQuery] = useState('');
  // OTA-095 — mode-toggle removed. Screen is actions-only now.

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

  // arb88 — single card renderer, shared by the sectioned view and the
  // flat search-results view.
  const renderCard = (id: string) => {
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
        accessibilityRole="button"
      >
        <Text style={styles.cardTitle}>{c.title}</Text>
        <Text style={styles.cardBody}>{explanationFor(c)}</Text>
        {examples.length > 0 && (
          <Text style={styles.cardExamples}>
            <Text style={styles.cardExamplesLabel}>Tap to queue: </Text>
            {examples.map((ex, i) => (i === queuedIdx ? `[${ex}]` : `"${ex}"`)).join(' · ')}
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
  };

  // arb88 — search results (flat) when the box has text; else the sections
  // reordered so the context-relevant ones lead.
  const q = query.trim().toLowerCase();
  const searchResults = q.length > 0
    ? ALL_CARDS.filter(({ id }) => {
        const c = lookup(id);
        if (!c) return false;
        const hay = [c.title, explanationFor(c), ...(EXAMPLES[id] ?? []), ...(c.keywords ?? [])]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
    : [];
  const priority = inCombat ? COMBAT_SECTIONS : EXPLORE_SECTIONS;
  const orderedSections = [...SECTIONS].sort(
    (a, b) => (priority.has(b.title) ? 1 : 0) - (priority.has(a.title) ? 1 : 0),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">ACTIONS</Text>
        <View style={{ width: 80 }} />
      </View>
      {/* arb88 — search box. Filters every card by name / what-it-does /
          example phrasing / concept keywords. */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search actions (e.g. dodge, reload, climb)…"
          placeholderTextColor="#6a6253"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} style={styles.searchClear} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={styles.searchClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* ⚠ OTA-1718 — a SCREEN-level ScrollView can use iOS's own keyboard
          inset, which is the correct mechanism here and needs no measurement.
          (It is unreliable inside a native <Modal>, which is why the cards
          measure instead.) Without it the bottom of the reference list is
          unreachable while the search field is focused. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {q.length > 0 ? (
          // Flat search results.
          searchResults.length === 0 ? (
            <Text style={styles.intro}>No action matches “{query.trim()}”.</Text>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{searchResults.length} MATCH{searchResults.length === 1 ? '' : 'ES'}</Text>
              {searchResults.map(({ id }) => renderCard(id))}
            </View>
          )
        ) : (
          <>
            <Text style={styles.intro}>
              {inCombat
                ? 'You’re in a fight — combat actions are first. '
                : 'Exploring — movement, search and social actions are first. '}
              Tap any card to drop an example into the input box (tap again to cycle
              phrasings), then hit BACK and finish the sentence. Or search above.
            </Text>
            {orderedSections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
                {section.ids.map((id) => renderCard(id))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
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
  // arb88 — search box.
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: '#e6d8b3',
    fontSize: 13,
    paddingVertical: 8,
  },
  searchClear: { paddingLeft: 8, paddingVertical: 4 },
  searchClearText: { color: '#a2977b', fontSize: 14, fontWeight: '700' },
  intro: {
    color: '#a2977b',
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
