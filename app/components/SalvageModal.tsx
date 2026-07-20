import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { useGameStore } from '../state/gameStore';
import type { InventoryItem } from '../engine/types';
import { computeInventoryDelta, type InventoryDelta } from './inventoryDelta';
import type { InteractableChip } from './InteractableChip';

interface Props {
  visible: boolean;
  /** Scene-noun pool from buildChipPool. We filter for things that
   *  look salvageable (constructs, drones, wreckage, machinery, etc.)
   *  and surface those as the chip row.
   *  Legacy string[] form kept for back-compat callers; the OTA 191
   *  callers pass `chips: InteractableChip[]` so consumed nouns can
   *  be dropped from the list (matches Search / Take behaviour). */
  hints?: string[];
  /** Per-room interactable chips with consumed flags. When passed,
   *  takes precedence over `hints`. Consumed chips are removed from
   *  the list entirely (no alwaysShow use case in salvage). */
  chips?: InteractableChip[];
  onSubmit: (target: string) => void;
  onCancel: () => void;
  /** 2026-05-25 [UI-3] — bulk salvage button mirroring TAKE ALL.
   *  Fires once per visible salvageable scene chip. Parent handler
   *  iterates and closes the modal. Skipped when only 0-1 salvage
   *  targets are present (button hidden). */
  onSalvageAll?: (nouns: string[]) => void;
  /** engine_Dev — when true, the supplied chips are shown AS-IS without the
   *  isSalvageable() name filter. Used by the tutorial scrap beat, whose injected
   *  demo armor prop is resolved from the author's own table and may not match the
   *  Tartaria-tuned salvage pattern (otherwise the picker opened empty). */
  bypassFilter?: boolean;
}

// Salvage chip filter — matches nouns the engine will actually salvage
// or break-open for material. Three groups:
//
//   1. Constructs / machinery — original OTA 140 list. Routes via
//      investigate → wreck_construct / fallen_sentinel hooks or
//      generic salvage narration.
//   2. Containers — match the keys in app/data/world/container_loot.json
//      (lockbox / crate / wreckage / tomb / observatory / spire /
//      relic_console / trap matchers). Player typing "break open
//      crate" already worked via containerLoot; OTA 019 surfaces
//      those nouns as chips too so the tap-to-act flow doesn't
//      miss them. Playtester: "I have interacted in text to break
//      open crates ... scene items must be real fungable items ...
//      do not take it so I cannot break open crates ... just
//      improve it."
//   3. Bone / wagon / floor furniture that material-classifier
//      (sceneNounMaterial.ts) handles via break-open. Crate / chest
//      already covered above; this adds the remaining sturdy nouns.
const SALVAGE_PATTERN = new RegExp(
  [
    // 1. Constructs / machinery
    'construct', 'automaton', 'drone', 'sentinel', 'wreck', 'husk',
    'machinery', 'machine', 'scrap', 'circuit', 'gear', 'plating',
    'core', 'relic', 'robot', 'rust', 'broken', 'fallen', 'toppled',
    'cog', 'rig', 'engine', 'hull', 'chassis', 'frame',
    // 2. Container matchers (mirrors container_loot.json keys)
    'lockbox', 'strongbox', 'coffer', 'safe', 'vault',
    'crate', 'chest', 'box', 'cache', 'stash', 'barrel',
    'wreckage', 'wagon', 'axle', 'boat', 'vessel',
    'sarcophagus', 'tomb', 'crypt', 'grave', 'ossuary', 'burial',
    'console', 'panel', 'conduit', 'terminal', 'altar',
    'observatory', 'scope', 'lens', 'telescope', 'array', 'dish', 'antenna',
    'spire', 'obelisk', 'pylon', 'pillar', 'monolith',
    'trap', 'snare', 'tripwire', 'deadfall', 'defenses', 'defense',
    'golem',
    // 3. Other break-open targets
    'bench', 'shelf', 'rack', 'table', 'door', 'gate',
    'skeleton', 'skull', 'rib', 'corpse', 'body', 'remains',
    'banner', 'shroud', 'curtain', 'tarp',
    'jar', 'bottle', 'jewelry box', 'jewel box', 'lock box', 'casket', 'reliquary',
    // 2026-05-25 OTA-041 — hook-noun additions. preserved_corpse plants
    // "body" + "satchel" + "robes" as resolvers; a playtester investigated
    // the sign, a body appeared via hook plant, and they expected to
    // also salvage it. Adding these to the chip filter so hook-revealed
    // nouns ALSO surface as salvage chips.
    'satchel', 'robes', 'pack', 'pouch',
  ].join('|'),
  'i',
);

// OTA-262 — SALVAGE_CHIP_CAP retired. Pre-OTA-262 the chip row was
// hard-capped at 8 items, so a scene with 9+ salvageables had the
// excess dropped before the chip row was built — and worse, SALVAGE
// ALL only saw those 8 (the player had to re-open the modal to deal
// with the rest, which is the exact symptom the player flagged:
// "salvage all should salvage everything even what is off screen,
// I shouldn't have to salvage again for the one item or didn't show").
// The chip list now stays uncapped; the ScrollView's height-aware
// maxHeight (see CHIP_SCROLL_MAX_HEIGHT below) lets the modal expand
// to fit as many items as the device screen permits, and SALVAGE ALL
// operates on the full filtered list, not a slice. Constant retained
// for legacy reference / search hits.
const SALVAGE_CHIP_CAP = Number.POSITIVE_INFINITY;

// OTA-262 — height-aware chip scroll. Computed from the current
// window height minus the modal chrome (title + body text + input +
// label + buttons + padding ≈ 380px). Floors at 280px (the prior
// hard maxHeight) so tiny screens don't shrink the list below
// what they already showed; otherwise grows to use the available
// vertical space, so a scene with many salvageables shows all of
// them at once on phones with the room. Captured once at module-
// load time — the modal isn't a long-lived screen where orientation
// changes mid-render are common, and re-reading Dimensions on every
// render would be needless overhead.
const CHIP_SCROLL_MAX_HEIGHT = Math.max(
  280,
  Math.floor(Dimensions.get('window').height - 380),
);

/** 2026-05-25 — exported so ExplorationScreen's salvageableCount
 *  predicate can mirror this modal's chip filter exactly. The
 *  interactionTags.isSalvageable + curated check was diverging
 *  from this combined predicate in both directions, lighting the
 *  SALVAGE button green when the modal would open empty and
 *  graying it when the modal had chips. */
export function isSalvageable(noun: string): boolean {
  // 2026-05-24 — curated salvageable spawns carry nouns like
  // "rusted exoframe" / "library archive console" that don't all
  // overlap the substring pattern. Check the curated pool too.
  if (SALVAGE_PATTERN.test(noun)) return true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isCuratedSalvageable } = require('../engine/salvageableSpawns');
  return isCuratedSalvageable(noun);
}

// 2026-05-24 — prefer curated salvageables; cap common-stock matches
// (table/gate/bench/etc.) at 1 per chip row so the new variety actually
// shows. Same shape as the climbable throttle in scene generation.
function prioritizeSalvageChips(matches: readonly string[]): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isCommonStockSalvageable, isCuratedSalvageable } = require('../engine/salvageableSpawns');
  const curated: string[] = [];
  const stock: string[] = [];
  const other: string[] = [];
  for (const n of matches) {
    if (isCuratedSalvageable(n)) curated.push(n);
    else if (isCommonStockSalvageable(n)) stock.push(n);
    else other.push(n);
  }
  // Keep all curated, at most 1 stock, plus all other matches.
  return [...curated, ...stock.slice(0, 1), ...other];
}

export function SalvageModal({ visible, hints, chips, onSubmit, onCancel, onSalvageAll, bypassFilter }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  // Modal phase. 'select' shows the input + chip row; 'results' shows
  // what landed in the pack from the action that just ran.
  const [phase, setPhase] = useState<'select' | 'results'>('select');
  const [results, setResults] = useState<InventoryDelta[]>([]);
  // Live inventory selector. We snapshot it on submit (preInv ref)
  // and diff the next change against it to surface the delta.
  const inventory = useGameStore((s) => s.player?.inventory ?? []);
  const preInvRef = useRef<InventoryItem[]>([]);
  const tcRef = useRef<number>(useGameStore.getState().player?.tc ?? 0);
  const currentTc = useGameStore((s) => s.player?.tc ?? 0);

  useEffect(() => {
    // Reset to select-mode whenever the modal re-opens.
    if (visible) {
      setText('');
      setPhase('select');
      setResults([]);
    }
    return undefined;
  }, [visible]);

  // Submit handler — captures pre-state, runs the action, diffs the
  // resulting inventory + TC. The store action for salvage's
  // material/TC outcomes lands the grant synchronously, so by the
  // time we re-read useGameStore.getState() the mutation has
  // already happened.
  const runSubmit = (target: string) => {
    Keyboard.dismiss();
    preInvRef.current = inventory.map((i) => ({ ...i }));
    tcRef.current = currentTc;
    onSubmit(target);
    // Compute delta against the current (post-action) store state.
    // Re-read directly off the store so we don't rely on this
    // component's re-render cadence.
    const liveInv = useGameStore.getState().player?.inventory ?? [];
    const liveTc = useGameStore.getState().player?.tc ?? 0;
    const delta = computeInventoryDelta(preInvRef.current, liveInv);
    if (liveTc > tcRef.current) {
      delta.unshift({ name: 'TC', quantity: liveTc - tcRef.current });
    }
    setResults(delta);
    setPhase('results');
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    runSubmit(trimmed);
  };

  const tapToSalvage = (target: string) => {
    runSubmit(target);
  };

  // Prefer the new chips form (with consumed flags) when caller
  // passes it; fall back to the legacy hints list. Either way the
  // result is filtered to salvage-pattern matches and capped at 5.
  const rawSceneHints = chips
    ? chips
        .filter((c) => !c.consumed) // hide consumed scene nouns entirely
        .filter((c) => bypassFilter || isSalvageable(c.noun))
        .map((c) => c.noun)
    : (hints ?? []).filter((h) => bypassFilter || isSalvageable(h));
  // OTA-262 — no slice. The full list passes through, so SALVAGE ALL
  // operates on every salvageable noun in the scene (not just the
  // first 8) and the modal's chip row shows everything up to the
  // screen-aware ScrollView maxHeight, after which the list scrolls
  // but the SALVAGE ALL count still reflects every item.
  // SALVAGE_CHIP_CAP is now POSITIVE_INFINITY; the .slice() here is
  // kept as a no-op guard against a future regression that re-adds
  // a finite cap somewhere upstream.
  const sceneHints = prioritizeSalvageChips(rawSceneHints).slice(0, SALVAGE_CHIP_CAP);
  // 2026-05-25 [UI-1] — commonHints suggestion array removed (was
  // rendered as browned-out chips that the user identified as
  // clutter). Player relies on scene hints + free-text input.

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
        <KeyboardAvoidingView style={styles.scrim} behavior="padding" accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {phase === 'results' ? (
                <>
                  <Text style={styles.title} accessibilityRole="header">SALVAGE — RESULT</Text>
                  <View style={styles.rule} />
                  {results.length > 0 ? (
                    <>
                      <Text style={styles.resultsLead}>Added to your pack:</Text>
                      <View style={styles.resultList}>
                        {results.map((r) => (
                          <View key={r.name} style={styles.resultRow}>
                            <Text style={styles.resultName}>
                              ✦ {r.name}{r.quantity > 1 ? ` × ${r.quantity}` : ''}
                            </Text>
                            {r.rarity && r.name !== 'TC' && (
                              <Text style={styles.resultRarity}>{r.rarity}</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Text style={styles.resultsLead}>
                      Nothing concrete this time — the wreck gave up no parts. (See the world log for what happened: maybe a hook landed, maybe the silt was just silt.)
                    </Text>
                  )}
                  <View style={styles.btnRow}>
                    <Pressable
                      style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                      onPress={onCancel}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnTextPrimary}>CLOSE</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.title} accessibilityRole="header">SALVAGE</Text>
                  <View style={styles.rule} />
                  <Text style={styles.body}>
                    Pull a core, strip the plating, pry the circuits — name the
                    wreck, construct, automaton, drone, or piece of pre-flood
                    machinery you want to break down. Active mechanical hooks
                    (toppled constructs, fallen sentinels) advance on tap.
                  </Text>

                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    value={text}
                    onChangeText={setText}
                    placeholder='e.g. "the construct", "the drone", "the wreck"'
                    placeholderTextColor="#6ab0c9"
                    onSubmitEditing={handleSubmit}
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />

                  {sceneHints.length > 0 && (
                    <>
                      <Text style={styles.chipLabel}>In this scene</Text>
                      {/* 2026-05-25 — stacked vertical layout matching
                          TakeModal / ClimbModal / SearchModal so all
                          four ambient-noun modals read the same.
                          Bounded by maxHeight so long lists scroll
                          while short lists collapse to fit. */}
                      <ScrollView
                        style={[styles.chipScroll, { maxHeight: CHIP_SCROLL_MAX_HEIGHT }]}
                        contentContainerStyle={styles.chipList}
                      >
                        {sceneHints.map((h) => (
                          <Pressable
                            key={`scene-${h}`}
                            style={({ pressed }) => [styles.chipFull, styles.chipFullScene, pressed && styles.btnPressed]}
                            onPress={() => tapToSalvage(h)}
                            accessibilityRole="button"
                          >
                            <Text style={styles.chipFullText} numberOfLines={1}>{h}</Text>
                            <Text style={styles.chipFullArrow}>→ salvage</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </>
                  )}
                  {/* 2026-05-25 [UI-1] — "Common" generic-suggestion
                      chips removed. They rendered as dimmed/browned-
                      out boxes that the user identified as clutter.
                      Players have the scene-hints row above + the
                      text input; the canned "the wreck" / "the drone"
                      hints were redundant and visually noisy. */}

                  {/* 2026-05-25 [UI-3] — SALVAGE ALL button. Surfaces
                      when 2+ scene chips are visible and the parent
                      provides an onSalvageAll handler. Mirrors the
                      TAKE ALL pattern in TakeModal:149. */}
                  {onSalvageAll && sceneHints.length >= 2 && (
                    <Pressable
                      style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed, { marginTop: 8 }]}
                      onPress={() => onSalvageAll(sceneHints)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnTextPrimary}>SALVAGE ALL ({sceneHints.length})</Text>
                    </Pressable>
                  )}

                  {/* 2026-05-25 [UI-1] — CANCEL moved to bottom-right
                      per modal-button placement standard. Action
                      (SALVAGE) on the left, dismissal (CANCEL) on the
                      right matches the project-wide convention so the
                      player's thumb learns one location for "back
                      out."
                      2026-05-25 OTA-042 — disabled state mirrors the
                      InvestigateModal fix (OTA-038): when text is
                      empty the SALVAGE button flips to the ghost /
                      neutral style instead of a washed-out tan
                      rectangle. Reads as "not yet ready" instead of
                      "broken button". */}
                  <View style={styles.btnRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.btn,
                        text.trim() ? styles.btnPrimary : styles.btnNeutral,
                        pressed && styles.btnPressed,
                      ]}
                      onPress={handleSubmit}
                      disabled={!text.trim()}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !text.trim() }}
                    >
                      <Text style={text.trim() ? styles.btnTextPrimary : styles.btnTextNeutral}>
                        SALVAGE
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                      onPress={onCancel}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnTextNeutral}>CANCEL</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0e1618',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  title: { color: '#6ab0c9', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#2b3a3e', marginTop: 6, marginBottom: 10 },
  body: { color: '#d6e4e8', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  input: {
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    color: '#d6e4e8',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 3,
    fontSize: 14,
  },
  // 2026-05-25 — removed dead style keys after the chip layout
  // migrated to the stacked chipFull pattern: chipRow, chipScrollRow,
  // chip, chipScene, chipText, chipTextScene — all unreferenced.
  chipLabel: { color: '#6c8088', fontSize: 10, letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  // 2026-05-25 — stacked-list styles matching TakeModal so the
  // four ambient-noun modals share one visual pattern.
  chipScroll: { maxHeight: 280 },
  chipList: { gap: 6, paddingVertical: 4 },
  chipFull: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131c1f',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipFullScene: { borderColor: '#9ec96a' },
  chipFullText: { color: '#d6e4e8', fontSize: 14, fontWeight: '600' },
  chipFullArrow: { color: '#9ec96a', fontSize: 11, letterSpacing: 1 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.3 },
  btnPrimary: { backgroundColor: '#6ab0c9', borderColor: '#6ab0c9' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#2b3a3e' },
  btnTextPrimary: { color: '#0e1618', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#bcd2db', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  // Result-phase rows. ✦ marker + rarity badge on the right.
  resultsLead: { color: '#bcd2db', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  resultList: { gap: 6, marginBottom: 8 },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131c1f',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resultName: { color: '#d6e4e8', fontSize: 14, fontWeight: '600' },
  resultRarity: { color: '#9ec96a', fontSize: 10, letterSpacing: 1.5 },
});
