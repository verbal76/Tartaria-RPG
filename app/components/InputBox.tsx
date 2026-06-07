import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Pressable,
  Keyboard,
  Platform,
  Animated,
  Vibration,
} from 'react-native';
import { TutorialTarget } from './TutorialTarget';
import { visibleBuildingRooms } from '../engine/buildings';
import { TUTORIAL_STEPS } from './tutorialSteps';
import { useGameStore } from '../state/gameStore';
import { hubRoomFor, isLeaveHubCommand } from '../engine/hub';
import { resolveDisplayWeaponByName } from '../engine/itemResolution';
import type { InventoryItem } from '../engine/types';

/** OTA 207 — does the equipped weapon reach the current combat range? */
function weaponTone(
  weaponName: string | null | undefined,
  range: 'arm' | 'close' | 'far' | null | undefined,
  intelligence: number,
  inventory: ReadonlyArray<InventoryItem>,
): 'ready' | 'needs-approach' | undefined {
  if (!range) return undefined;
  if (!weaponName) return range === 'arm' ? 'ready' : 'needs-approach';
  const w = resolveDisplayWeaponByName(weaponName, inventory);
  if (!w) return range === 'arm' ? 'ready' : 'needs-approach';
  let bands: Array<'arm' | 'close' | 'far'>;
  switch (w.weaponKind) {
    case 'melee':
      bands = ['arm'];
      break;
    case 'ranged':
      bands = ['arm', 'close', 'far'];
      break;
    case 'runecaster':
      bands = intelligence >= 9 ? ['arm', 'close', 'far'] : ['arm', 'close'];
      break;
    default:
      bands = ['arm'];
  }
  return bands.includes(range) ? 'ready' : 'needs-approach';
}

interface Props {
  onSubmit: (text: string) => void;
  onOpenInventory: () => void;
  onOpenSearch: () => void;
  onOpenCrafting: () => void;
  onOpenApproach: () => void;
  onOpenAskArbiter: () => void;
  onOpenSalvage: () => void;
  onOpenTake: () => void;
  onOpenClimb: () => void;
  onClimbUp: () => void;
  onClimbDown: () => void;
  elevatedOn?: { noun: string; tier: number; totalTiers: number } | null;
  onOpenMap: () => void;
  inCombat: boolean;
  equippedMain: string | null;
  equippedOff: string | null;
  inventory: ReadonlyArray<InventoryItem>;
  range?: 'arm' | 'close' | 'far' | null;
  travelTargetName?: string | null;
  onContinueTravel?: () => void;
  onStopTravel?: () => void;
  movesLeft?: number | null;
  takeableCount?: number;
  salvageableCount?: number;
  climbableCount?: number;
  playerHasRope?: boolean;
  investigateCount?: number;
  golem?: { name: string; hp: number; hpMax: number } | null;
  dog?: { name: string; hp: number; hpMax: number } | null;
}

const PEACE_QUICK_DIRECT: Array<{ label: string; submit: string }> = [
  { label: 'look around you', submit: 'look' },
  { label: 'rest', submit: 'rest' },
];

function shortWeaponLabel(name: string): string {
  const tokens = name.split(/\s+/);
  if (tokens.length <= 2) return name;
  return tokens.slice(-2).join(' ');
}

export function InputBox({ onSubmit, onOpenInventory, onOpenSearch, onOpenCrafting, onOpenApproach, onOpenAskArbiter, onOpenSalvage, onOpenTake, onOpenClimb, onClimbUp, onClimbDown, elevatedOn, onOpenMap, inCombat, equippedMain, equippedOff, inventory, range, travelTargetName, onContinueTravel, onStopTravel, movesLeft, takeableCount, salvageableCount, climbableCount, investigateCount, golem, dog, playerHasRope }: Props) {
  const [dogPickerOpen, setDogPickerOpen] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const consumeDraft = useGameStore((s) => s.consumeInputDraft);
  const pendingDraft = useGameStore((s) => s.pendingInputDraft);
  const playerInt = useGameStore((s) => s.player?.stats.intelligence ?? 0);
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const awaitingTutorialName = useGameStore((s) => s.awaitingTutorialName);
  const hubRoomId = useGameStore((s) => s.player?.hubRoomId ?? null);
  const factionId = useGameStore((s) => s.player?.factionId ?? null);
  // arb25 — enterable buildings: when inside one, the travel row shows the
  // building's rooms + EXIT instead of cardinals / faction-hub exits.
  const activeBuildingId = useGameStore((s) => s.activeBuildingId);
  const activeBuildingRoomId = useGameStore((s) => s.activeBuildingRoomId);
  const buildingRevealed = useGameStore((s) => s.buildingRevealed);
  // arb36 — enterable structure discovered on the current wild tile.
  const sceneBuilding = useGameStore((s) => s.currentScene?.sceneBuilding ?? null);
  const enterBuilding = useGameStore((s) => s.enterBuilding);
  const goBuildingRoom = useGameStore((s) => s.goBuildingRoom);
  const exitBuilding = useGameStore((s) => s.exitBuilding);
  const buildingRooms = useMemo(
    () => (activeBuildingId
      ? visibleBuildingRooms(activeBuildingId, new Set(buildingRevealed))
      : []),
    [activeBuildingId, buildingRevealed],
  );

  const currentTutStep = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep] ?? null : null;
  const currentBeatId = currentTutStep?.id ?? null;

  // Pre-fill input from pendingInputDraft (the rope beat queues "take
  // rope"). We pre-fill the text as a VISIBLE hint but deliberately do
  // NOT call .focus() here — auto-focusing raised the soft keyboard on
  // its own (e.g. the instant the rope beat became active after the
  // player took the cudgel), which the player reported as the keyboard
  // popping up unbidden. Rule now: the keyboard only ever appears when
  // the player taps the text field themselves. The pre-filled command
  // sits in the field ready to send via the TAKE chip or a tap+enter.
  useEffect(() => {
    if (pendingDraft !== null) {
      const draft = consumeDraft();
      if (draft) setText(draft);
    }
  }, [pendingDraft, consumeDraft]);

  // Tungsten Spire — input row pulses when the current tutorial step
  // has `inputPulse: true` (name beat + rope beat). Pulses a border
  // colour animation; same Animated pattern as TutorialTarget.
  const inputPulse = currentTutStep?.inputPulse === true;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!inputPulse) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); };
  }, [inputPulse, pulse]);
  const inputBorderColor = inputPulse
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: ['#c9a86a', '#ffe28a'] })
    : '#3a342c';

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
    inputRef.current?.clear();
    // Hitting enter/send always dismisses the keyboard now (player ask:
    // "when you hit enter it should go away"). Previously this only fired
    // on the name beat, so the keyboard lingered after every typed
    // command and could reappear over later UI.
    Keyboard.dismiss();
  };

  // Tungsten Spire — hub-room named exits. When the player is inside
  // a hub (player.hubRoomId is set), the travel row swaps cardinal
  // chips for chips named after the rooms reachable from this one,
  // plus an OUT chip that fires the leave-hub verb. The chip's
  // onPress still submits 'go <direction>' so resolveHubTravel does
  // its existing thing; only the chip LABEL changes. Outside a hub
  // the row renders cardinals as before.
  const hubRoom = useMemo(() => (hubRoomId ? hubRoomFor(hubRoomId, factionId) : null), [hubRoomId, factionId]);
  const hubExitChips: Array<{ label: string; submit: string }> = useMemo(() => {
    if (!hubRoom) return [];
    const out: Array<{ label: string; submit: string }> = [];
    for (const dir of ['north', 'south', 'east', 'west'] as const) {
      const targetId = hubRoom.exits[dir];
      if (!targetId) continue;
      const targetRoom = hubRoomFor(targetId, factionId);
      const label = targetRoom?.shortName?.toUpperCase() ?? dir.toUpperCase();
      out.push({ label, submit: `go ${dir}` });
    }
    return out;
  }, [hubRoom, factionId]);

  // TAKE / SALVAGE / INVESTIGATE during their tutorial beats now OPEN the
  // real picker menu so the player learns the actual interaction — the demo
  // prop (cudgel / broken chest plate / door) is injected into the matching
  // modal by ExplorationScreen for that beat, and its chip lights via the
  // count. Picking the prop submits the verb, which the submitPlayerAction
  // tutorial intercept grants + advances on.
  //
  // Only the typed-input demos keep a direct submit: the rope beat is
  // teaching TYPED input (the input row pulses with a pre-filled "take
  // rope"), and the note is taken straight from the feed.
  const takeOverride: (() => void) | null = currentBeatId === 'rope'
    ? () => onSubmit('take rope')
    : currentBeatId === 'read_note'
    ? () => onSubmit('take note')
    : null;
  const salvageOverride: (() => void) | null = null;
  const investigateOverride: (() => void) | null = null;

  // During the guided action beats (cudgel / rope / scrap / investigate),
  // drive the TAKE / SALVAGE / INVESTIGATE green "ready" glow off the CURRENT
  // BEAT rather than the room's real interactable counts. Otherwise TAKE
  // stayed green after the tutorial items were already taken (the room still
  // had real nouns), and SALVAGE stayed green into the investigate beat.
  // green = the one thing to do now; the completed buttons drop to amber.
  const tutActionBeat =
    currentBeatId === 'cudgel' || currentBeatId === 'rope'
      || currentBeatId === 'scrap' || currentBeatId === 'climb'
      || currentBeatId === 'investigate'
      ? currentBeatId : null;
  const takeTone: 'ready' | undefined = tutActionBeat
    ? (tutActionBeat === 'cudgel' || tutActionBeat === 'rope' ? 'ready' : undefined)
    : (takeOverride || (takeableCount && takeableCount > 0) ? 'ready' : undefined);
  const salvageTone: 'ready' | undefined = tutActionBeat
    ? (tutActionBeat === 'scrap' ? 'ready' : undefined)
    : (salvageOverride || (salvageableCount && salvageableCount > 0) ? 'ready' : undefined);
  const investigateTone: 'ready' | undefined = tutActionBeat
    ? (tutActionBeat === 'investigate' ? 'ready' : undefined)
    : (investigateOverride || (investigateCount && investigateCount > 0) ? 'ready' : undefined);
  // CLIMB is green whenever the room has climbables, which during the
  // tutorial meant it glowed through every beat. Gate it to the climb beat
  // so green points only at the current action; normal count/rope logic
  // applies outside the tutorial.
  // CLIMB only carries a colour when there's actually something to climb:
  //   • has rope + climbable here  → 'ready'   (green)
  //   • no rope + climbable here   → 'unavailable' (red — go find a rope)
  //   • nothing climbable here     → undefined (neutral, same as the rest)
  // The old code left a 'needs-approach' (amber) fallback for the
  // nothing-climbable case, so the button stayed amber after you'd climbed
  // everything / when there was nothing to climb at all.
  const climbTone: 'ready' | 'needs-approach' | 'unavailable' | undefined = tutActionBeat
    ? (tutActionBeat === 'climb' ? 'ready' : undefined)
    : (climbableCount && climbableCount > 0 ? (playerHasRope ? 'ready' : 'unavailable') : undefined);
  // During a guided action beat, every quick-action EXCEPT the instructed
  // one is blocked (dimmed + buzzes on tap). The rope beat blocks TAKE too,
  // since its lesson is typed input (pre-fill + ACT). Approach is never a
  // tutorial step, so it's blocked through all action beats.
  const inTutAction = tutActionBeat !== null;
  const takeBlocked = inTutAction && tutActionBeat !== 'cudgel';
  const salvageBlocked = inTutAction && tutActionBeat !== 'scrap';
  const investigateBlocked = inTutAction && tutActionBeat !== 'investigate';
  const climbBlocked = inTutAction && tutActionBeat !== 'climb';
  const approachBlocked = inTutAction;

  return (
    <View style={styles.container}>
      {!inCombat && (
        <TutorialTarget area="travel-row" style={styles.travelRow}>
          {activeBuildingId ? (
            // Inside a building: up to 4 room buttons + EXIT (no MAP).
            <>
              {buildingRooms.slice(0, 4).map((r) => (
                <TravelBtn
                  key={r.id}
                  label={r.shortName}
                  onPress={() => goBuildingRoom(r.id)}
                />
              ))}
              <TravelBtn label="EXIT" onPress={() => exitBuilding()} />
            </>
          ) : travelTargetName ? (
            <>
              <TravelBtn label={`→ ${travelTargetName.toUpperCase()}`} onPress={onContinueTravel ?? (() => {})} />
              <TravelBtn label="STOP TRAVEL" onPress={onStopTravel ?? (() => {})} />
              {typeof movesLeft === 'number' && movesLeft >= 0 ? (
                <View style={styles.movesBadge}>
                  <Text style={styles.movesBadgeText} numberOfLines={1}>{movesLeft}</Text>
                  <Text style={styles.movesBadgeSub} numberOfLines={1}>{movesLeft === 1 ? 'move' : 'moves'}</Text>
                </View>
              ) : null}            </>
          ) : hubRoom ? (
            // Tungsten Spire — hub-named exits. ROOM SHORT-NAMES instead of
            // N/S/E/W when the player is inside a building. arb22 — the world
            // MAP is meaningless indoors (you navigate by room, not tile), so
            // it's dropped here; the freed slot keeps the row at "up to 4
            // rooms + EXIT". EXIT (was OUT) leaves the building to the wilds.
            <>
              {hubExitChips.slice(0, 4).map((c) => (
                <TravelBtn key={c.submit} label={c.label} onPress={() => onSubmit(c.submit)} />
              ))}
              <TravelBtn label="EXIT" onPress={() => onSubmit('leave outpost')} />
            </>
          ) : sceneBuilding ? (
            // arb36 — a structure stands on this tile: offer ENTER alongside
            // the cardinals so the player can step inside what they found.
            <>
              <TravelBtn label="ENTER" onPress={() => enterBuilding(sceneBuilding)} />
              <TravelBtn label="NORTH" onPress={() => onSubmit('go north')} />
              <TravelBtn label="SOUTH" onPress={() => onSubmit('go south')} />
              <TravelBtn label="EAST" onPress={() => onSubmit('go east')} />
              <TravelBtn label="WEST" onPress={() => onSubmit('go west')} />
            </>
          ) : (
            <>
              <TravelBtn label="NORTH" onPress={() => onSubmit('go north')} />
              <TravelBtn label="SOUTH" onPress={() => onSubmit('go south')} />
              <TravelBtn label="EAST" onPress={() => onSubmit('go east')} />
              <TravelBtn label="WEST" onPress={() => onSubmit('go west')} />            </>
          )}
        </TutorialTarget>
      )}
      <TutorialTarget area="quick-row" style={inCombat ? styles.quickRowColumn : styles.quickRow}>
        {inCombat ? (
          <>
            <View style={styles.quickRowLine}>
              {(() => {
                const punchT = weaponTone(null, range, playerInt, inventory);
                return <QuickBtn label="punch" onPress={() => onSubmit('punch')} tone={punchT} outOfRange={punchT === 'needs-approach'} />;
              })()}
              {(() => {
                const kickT = weaponTone(null, range, playerInt, inventory);
                return <QuickBtn label="kick" onPress={() => onSubmit('kick')} tone={kickT} outOfRange={kickT === 'needs-approach'} />;
              })()}
              {equippedMain ? (() => {
                const mainT = weaponTone(equippedMain, range, playerInt, inventory);
                return <QuickBtn label={shortWeaponLabel(equippedMain).toLowerCase()} onPress={() => onSubmit(`attack with the ${equippedMain.toLowerCase()}`)} tone={mainT} outOfRange={mainT === 'needs-approach'} />;
              })() : null}
              {equippedOff ? (() => {
                const offT = weaponTone(equippedOff, range, playerInt, inventory);
                return <QuickBtn label={`off: ${shortWeaponLabel(equippedOff).toLowerCase()}`} onPress={() => onSubmit(`attack with the off-hand ${equippedOff.toLowerCase()}`)} tone={offT} outOfRange={offT === 'needs-approach'} />;
              })() : null}
            </View>

            <View style={styles.quickRowLine}>
              {golem && golem.hp > 0 ? (
                <QuickBtn label={`golem (${golem.hp}/${golem.hpMax})`} onPress={() => onSubmit('use golem')} tone="ready" />
              ) : null}
              {dog && dog.hp > 0 ? (
                <QuickBtn label={`${dog.name.toLowerCase()} (${dog.hp}/${dog.hpMax})`} onPress={() => setDogPickerOpen((v) => !v)} tone="ready" />
              ) : null}
              <QuickBtn label="dodge" defensive onPress={() => onSubmit('dodge')} />
              <QuickBtn label="flee" defensive onPress={() => onSubmit('flee')} />
            </View>

            <View style={styles.quickRowLine}>
              <QuickBtn label="approach" onPress={onOpenApproach} tone={range === 'far' ? 'needs-approach' : undefined} />
              {range && range !== 'far' && (
                <QuickBtn label="step back" onPress={() => onSubmit('step back')} />
              )}
              <QuickBtn label="inventory" onPress={onOpenInventory} />
            </View>
          </>
        ) : (
          <>
            {PEACE_QUICK_DIRECT.map((qa) => (
              <QuickBtn
                key={qa.submit}
                label={qa.label}
                onPress={() => onSubmit(qa.submit)}
                // Light "look around you" green during the look beat. It was
                // a static, unlit button with nothing drawing the player to
                // it (playtest: "nothing's drawing you to that button").
                tone={currentBeatId === 'look' && qa.submit === 'look' ? 'ready' : undefined}
              />
            ))}
            <QuickBtn
              label="investigate"
              onPress={investigateOverride ?? onOpenSearch}
              tone={investigateTone}
              blocked={investigateBlocked}
            />
            <QuickBtn label="approach" onPress={onOpenApproach} blocked={approachBlocked} />
            <QuickBtn
              label="take"
              onPress={takeOverride ?? onOpenTake}
              tone={takeTone}
              blocked={takeBlocked}
            />
            <QuickBtn
              label="salvage"
              onPress={salvageOverride ?? onOpenSalvage}
              tone={salvageTone}
              blocked={salvageBlocked}
            />
            {!elevatedOn ? (
              <QuickBtn
                label="climb"
                onPress={onOpenClimb}
                tone={climbTone}
                blocked={climbBlocked}
              />
            ) : (
              <>
                {elevatedOn.tier < elevatedOn.totalTiers && (
                  <QuickBtn label={`climb up (${elevatedOn.tier}/${elevatedOn.totalTiers})`} onPress={onClimbUp} defensive />
                )}
                <QuickBtn label="climb down" onPress={onClimbDown} defensive />
              </>
            )}
            <QuickBtn label="craft" onPress={onOpenCrafting} />
            <QuickBtn label="inventory" onPress={onOpenInventory} />
            <QuickBtn label="ask arbiter" onPress={onOpenAskArbiter} />
          </>
        )}
      </TutorialTarget>
      {dog && dog.hp > 0 && dogPickerOpen ? (
        <View style={styles.dogPicker}>
          <Pressable onPress={() => { setDogPickerOpen(false); onSubmit('bite'); }} style={styles.dogPickerBtn}>
            <Text style={styles.dogPickerLabel}>BITE</Text>
            <Text style={styles.dogPickerHint}>{dog.name} lunges in</Text>
          </Pressable>
          <Pressable onPress={() => { setDogPickerOpen(false); onSubmit('distract'); }} style={styles.dogPickerBtn}>
            <Text style={styles.dogPickerLabel}>DISTRACT</Text>
            <Text style={styles.dogPickerHint}>pounces + barks · +1 init, +2 atk next swing</Text>
          </Pressable>
        </View>
      ) : null}
      <TutorialTarget area="input-row" style={styles.inputRow}>
        <Animated.View style={[styles.inputWrap, { borderColor: inputBorderColor }]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={
              awaitingTutorialName
                ? 'Speak your name…'
                : inCombat
                ? 'What do you do? (or use quick buttons)'
                : 'What do you do?'
            }
            placeholderTextColor="#c9a86a"
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
            autoCorrect={false}
            autoCapitalize={awaitingTutorialName ? 'words' : 'none'}
            autoComplete="off"
            textContentType="none"
          />
        </Animated.View>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.kbDismiss}
            onPress={() => Keyboard.dismiss()}
            accessibilityLabel="Hide keyboard"
          >
            <Text style={styles.kbDismissText}>▼</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.send} onPress={handleSubmit}>
          <Text style={styles.sendText}>Act</Text>
        </TouchableOpacity>
      </TutorialTarget>
    </View>
  );
}

type QuickBtnTone = 'ready' | 'needs-approach' | 'defensive' | 'unavailable';

function QuickBtn({
  label,
  onPress,
  defensive,
  tone,
  blocked,
  outOfRange,
}: {
  label: string;
  onPress: () => void;
  defensive?: boolean;
  tone?: QuickBtnTone;
  /** Tutorial gating: render neutral + dimmed, and a tap buzzes (haptic)
   *  instead of firing the action — so only the beat's instructed button
   *  actually does anything. */
  blocked?: boolean;
  /** Combat range gating: the weapon can't reach the target from here.
   *  KEEP the amber 'needs-approach' tone (so the player sees WHY), but a
   *  tap buzzes ("can't do it") instead of firing the attack — the engine
   *  used to treat an out-of-range attack as a free approach, which let
   *  PUNCH double as APPROACH. Now you must hit APPROACH yourself. */
  outOfRange?: boolean;
}) {
  const resolvedTone: QuickBtnTone | undefined = blocked
    ? undefined
    : tone ?? (defensive ? 'defensive' : undefined);
  const containerStyle = [
    styles.quick,
    resolvedTone === 'defensive' && styles.quickDefensive,
    resolvedTone === 'ready' && styles.quickReady,
    resolvedTone === 'needs-approach' && styles.quickNeedsApproach,
    resolvedTone === 'unavailable' && styles.quickUnavailable,
    blocked && styles.quickDisabled,
  ];
  const textStyle = [
    styles.quickText,
    resolvedTone === 'defensive' && styles.quickDefensiveText,
    resolvedTone === 'ready' && styles.quickReadyText,
    resolvedTone === 'needs-approach' && styles.quickNeedsApproachText,
    resolvedTone === 'unavailable' && styles.quickUnavailableText,
    // arb86 — dim the LABEL on disabled chips (replaces the old whole-chip
    // opacity:0.4 so the fill stays opaque against any tuned background).
    blocked && styles.quickDisabledText,
  ];
  const handlePress = () => {
    if (blocked || outOfRange) {
      // Wrong action for this tutorial beat, or weapon out of range — buzz
      // ("can't do it") instead of acting. APPROACH is the player's job.
      try { Vibration.vibrate(30); } catch { /* ignore */ }
      return;
    }
    onPress();
  };
  return (
    <TouchableOpacity style={containerStyle} onPress={handlePress}>
      <Text style={textStyle}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

function TravelBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const isDestination = label.startsWith('→');
  return (
    <TouchableOpacity
      style={[styles.travelBtn, isDestination && styles.travelBtnDest]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[styles.travelBtnText, isDestination && styles.travelBtnTextDest]}
        numberOfLines={isDestination ? 2 : 1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit={!isDestination}
        minimumFontScale={0.55}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  quickRowColumn: { flexDirection: 'column', gap: 6 },
  quickRowLine: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dogPicker: { flexDirection: 'row', gap: 8, marginTop: 6 },
  dogPickerBtn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#5a4f3e',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  dogPickerLabel: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  dogPickerHint: { color: '#8a7e66', fontSize: 10, marginTop: 4, textAlign: 'center' },
  travelRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  travelBtn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#5a4a2e',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  // letterSpacing kept low (1) so longer room names ("GRAND HALL",
  // "LIVING ROOM") fit the equal-width slots without shrinking/ellipsizing
  // as hard. Short labels (NORTH / EXIT) still read fine with it.
  travelBtnText: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 2 },
  travelBtnDest: { paddingVertical: 8 },
  travelBtnTextDest: { fontSize: 14, lineHeight: 17, letterSpacing: 1.5, textAlign: 'center' },
  movesBadge: {
    backgroundColor: '#13110f',
    borderColor: '#9ec96a',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  movesBadgeText: { color: '#9ec96a', fontSize: 16, fontWeight: '800', letterSpacing: 1, lineHeight: 18 },
  movesBadgeSub: { color: '#7a705c', fontSize: 8, letterSpacing: 1, marginTop: 1 },
  quick: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  quickDefensive: { borderColor: '#6a9bbf' },
  // arb86 — was backgroundColor '#1a201410' (alpha ~6% → near-transparent).
  // Against the old near-black bg it read as a faint green tint, but with the
  // player-tunable background a bright hue FLOODED through the chip ("weird
  // coloring"). Now a fully OPAQUE dark green-tinted fill so the chip keeps a
  // solid background on any tuned hue; the green border still marks "ready".
  quickReady: { borderColor: '#9ec96a', backgroundColor: '#1b2417' },
  quickNeedsApproach: { borderColor: '#c9a86a' },
  quickUnavailable: { borderColor: '#e07a5f' },
  // Disabled (e.g. TAKE during the typed-input rope beat) — muted so it reads
  // as "not now" without the red 'unavailable' alarm color. arb86 — was
  // opacity 0.4, which made the whole chip (fill included) translucent so the
  // tuned background bled through ("weird fading"). Now an opaque darker fill +
  // dimmer border + dimmed text instead, so the chip stays solid on any hue.
  quickDisabled: { borderColor: '#2a2620', backgroundColor: '#141210' },
  quickText: { color: '#cdbf99', fontSize: 12 },
  quickDisabledText: { color: '#6a6253' },
  quickDefensiveText: { color: '#6a9bbf' },
  quickReadyText: { color: '#9ec96a' },
  quickNeedsApproachText: { color: '#c9a86a' },
  quickUnavailableText: { color: '#e07a5f' },
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  // Tungsten Spire — Animated.View wrapper so the input border can
  // pulse during the name + rope beats. Border lives on the wrapper;
  // TextInput inside is borderless so the pulse is the only frame.
  inputWrap: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#1a1714',
  },
  input: {
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  send: {
    backgroundColor: '#3a342c',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 4,
  },
  sendText: { color: '#e6d8b3', fontWeight: '700' },
  kbDismiss: {
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
  },
  kbDismissText: { color: '#c9a86a', fontSize: 14, fontWeight: '700' },
});
