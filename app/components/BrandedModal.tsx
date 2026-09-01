import React from 'react';
import { rarityHexColor } from './InventoryCategorize';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import type { ItemPreview } from './itemPreview';
import { NumberStepper } from './NumberStepper';

export interface BrandedModalButton {
  label: string;
  onPress: () => void;
  /** Visual emphasis. 'primary' = filled amber, 'destructive' = red, 'neutral' = ghost. */
  tone?: 'primary' | 'destructive' | 'neutral';
}

interface Props {
  visible: boolean;
  title: string;
  /** Main body text (used when there's no item preview). */
  body?: string;
  /** When set, renders a structured item card under the title. */
  itemPreview?: ItemPreview | null;
  /** Optional extra context line shown beneath the preview. */
  contextLine?: string;
  /** OTA-239 — Optional text input rendered between the body and the
   *  buttons. Used by Ask the Arbiter (and other future query-style
   *  modals). When omitted, the modal stays a confirmation card. */
  textInput?: {
    value: string;
    onChangeText: (s: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
  };
  /** OTA-286 — Optional quantity stepper rendered between the body
   *  and the buttons. Reuses the same NumberStepper component used
   *  in About settings (Volume / Rate / Pitch). Used by the inventory
   *  Scrap path so the player can choose how many to scrap at once
   *  instead of tapping Scrap N times. `label` shows above the
   *  stepper ("Scrap how many?"). */
  quantityStepper?: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
  };
  buttons: BrandedModalButton[];
  /** arb73 — render in-tree (absolute overlay) instead of a native <Modal>.
   *  iPad/iOS can present a native <Modal> INVISIBLY (renders nothing but its
   *  backdrop still eats touches), which both hid the door popup AND blocked
   *  the EXIT/room buttons under it. An in-tree overlay always renders and is
   *  tappable. Used for the tutorial door (no text field). */
  inline?: boolean;
  onRequestClose: () => void;
}

// Branded confirmation modal — matches the game's dark + amber palette and
// optionally shows an item preview (kind / rarity / stats / description)
// so the player knows what they're committing to.
export function BrandedModal({
  visible,
  title,
  body,
  itemPreview,
  contextLine,
  textInput,
  quantityStepper,
  buttons,
  inline,
  onRequestClose,
}: Props) {
  // ⚠⚠⚠ OTA-1614 — THE CARD MUST ALWAYS BE ABLE TO GIVE THE BUTTONS BACK.
  //
  // The card had no height limit and no scrolling: the body was a plain <Text>
  // with the button row after it, so a long body simply grew the card past the
  // bottom of the screen and took its own controls with it. The owner caught it
  // live — the coating picker's "Not on the list" note printed one full sentence
  // per ineligible weapon, nine rune-casters deep ("what's all the gibberish
  // above the red writing?"), pushing the weapons he came to choose off the
  // display. A modal that cannot be answered is a softlock wearing a dialog: the
  // scrim it draws eats every tap behind it, so the game underneath is gone too.
  //
  // ⚠⚠ SO THE SHAPE IS FIXED, NOT THE ONE CALLER. Header pinned at the top so
  // you always know what is asking; the middle scrolls; the buttons pinned
  // below the scroll where they can never be pushed away. The card is capped at
  // 85% of the screen so the scrim — and the tap-outside escape — always stays
  // reachable. Every caller inherits it, including ones written later.
  const cardHeader = (
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">{title.toUpperCase()}</Text>
        <View style={styles.ruleLine} />
      </View>
  );
  const cardBody = (
    <>
      {itemPreview ? (
        <View style={styles.itemBlock}>
          <View style={styles.itemHead}>
            <Text style={styles.itemName} numberOfLines={2}>
              {itemPreview.name}
            </Text>
            {itemPreview.rarity && (
              <Text style={[styles.rarity, rarityColor(itemPreview.rarity)]}>
                {itemPreview.rarity}
              </Text>
            )}
          </View>
          <Text style={styles.itemKind}>{itemPreview.kindLabel}</Text>
          {itemPreview.stats.length > 0 && (
            <View style={styles.statsBlock}>
              {itemPreview.stats.map((s) => (
                <Text key={s} style={styles.statLine}>· {s}</Text>
              ))}
            </View>
          )}
          {itemPreview.description ? (
            <Text style={styles.itemDesc}>"{itemPreview.description}"</Text>
          ) : null}
        </View>
      ) : null}

      {body ? <Text style={styles.body}>{body}</Text> : null}
      {contextLine ? <Text style={styles.context}>{contextLine}</Text> : null}
      {textInput ? (
        <TextInput
          style={styles.input}
          value={textInput.value}
          onChangeText={textInput.onChangeText}
          placeholder={textInput.placeholder}
          placeholderTextColor="#c9a86a"
          autoFocus={textInput.autoFocus}
          selectionColor="#c9a86a"
        />
      ) : null}
      {quantityStepper ? (
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>{quantityStepper.label}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <NumberStepper
              value={quantityStepper.value}
              min={quantityStepper.min}
              max={quantityStepper.max}
              step={1}
              decimals={0}
              onChange={quantityStepper.onChange}
            />
          </View>
        </View>
      ) : null}
    </>
  );
  const cardButtons = (
      <View style={styles.buttonRow}>
        {buttons.map((b) => (
          <Pressable
            key={b.label}
            style={({ pressed }) => [
              styles.btn,
              toneStyle(b.tone),
              pressed && styles.btnPressed,
            ]}
            onPress={b.onPress}
            accessibilityRole="button"
          >
            <Text style={[styles.btnText, toneText(b.tone)]}>{b.label.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
  );
  // ⚠ The scroll view takes `flexShrink` so it yields to the pinned rows rather
  // than the other way round — without it the buttons are what gets squeezed,
  // which is the bug this OTA exists to remove.
  const cardChildren = (
    <>
      {cardHeader}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
        {cardBody}
      </ScrollView>
      {cardButtons}
    </>
  );
  // arb73 — inline overlay path: skip the native <Modal> entirely (iPad can
  // present it invisibly while still eating touches). Render nothing when
  // hidden; otherwise an absolute full-screen overlay in the normal tree.
  if (inline) {
    if (!visible) return null;
    return (
      <View style={styles.inlineScrim} pointerEvents="box-none" accessibilityViewIsModal={true}>
        <TouchableWithoutFeedback onPress={onRequestClose}>
          <KeyboardAvoidingView style={styles.scrim} behavior="padding">
            <TouchableWithoutFeedback>
              <View style={styles.card}>{cardChildren}</View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </View>
    );
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onRequestClose}>
        {/* 'padding' keeps the scrim full size and lifts the card above
            the soft keyboard so an open text field is always visible. */}
        <KeyboardAvoidingView style={styles.scrim} behavior="padding">
          <TouchableWithoutFeedback>
            <View style={styles.card} accessibilityViewIsModal={true}>{cardChildren}</View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ⚠ OTA-1312 — the style wrapper stays (callers pass it straight to a Text),
// but the hexes come from the one palette.
function rarityColor(rarity: string) {
  return { color: rarityHexColor(rarity) };
}

function toneStyle(tone: BrandedModalButton['tone']) {
  switch (tone) {
    case 'primary': return styles.btnPrimary;
    case 'destructive': return styles.btnDestructive;
    default: return styles.btnNeutral;
  }
}

function toneText(tone: BrandedModalButton['tone']) {
  switch (tone) {
    case 'primary': return styles.btnTextPrimary;
    case 'destructive': return styles.btnTextDestructive;
    default: return styles.btnTextNeutral;
  }
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  // arb73 — absolute full-screen layer for the inline (non-Modal) path. Fills
  // the parent and floats above the scene content via a high zIndex so the
  // popup renders and is tappable without relying on iOS native Modal
  // presentation (which can present invisibly on iPad).
  inlineScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    // OTA-1614 — never taller than the screen, so the scrim (and the
    // tap-outside escape) always stays reachable.
    maxHeight: '85%',
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  headerRow: { marginBottom: 8 },
  // OTA-1614 — the middle scrolls; shrink rather than push the buttons off.
  scrollArea: { flexShrink: 1, flexGrow: 0 },
  scrollInner: { paddingBottom: 2 },
  title: {
    color: '#c9a86a',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
  },
  ruleLine: {
    height: 1,
    backgroundColor: '#3a342c',
    marginTop: 6,
  },
  itemBlock: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    marginBottom: 10,
  },
  itemHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemName: { color: '#e6d8b3', fontSize: 15, fontWeight: '700', flex: 1 },
  rarity: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  itemKind: { color: '#a2977b', fontSize: 11, letterSpacing: 1, marginTop: 1 },
  statsBlock: { marginTop: 8, gap: 2 },
  statLine: { color: '#cdbf99', fontSize: 12 },
  itemDesc: { color: '#a2977b', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  // OTA-286 — quantity stepper row inside the action modal. Mirrors
  // the About screen's volume / rate / pitch row layout exactly so
  // the player recognizes the control on sight.
  stepperRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4, gap: 8 },
  stepperLabel: { color: '#cdbf99', fontSize: 12, letterSpacing: 1 },
  context: { color: '#9ec96a', fontSize: 12, marginTop: 8, letterSpacing: 1 },
  buttonRow: {
    // Buttons stack vertically so three-action modals (Equip Main Hand /
    // Equip Off Hand / Close) don't overflow the left edge of the card
    // when their combined width exceeds the container — previously the
    // row laid them out with justifyContent: 'flex-end' and the leftmost
    // button ran off the screen. Vertical stacking is also a bigger tap
    // target per button.
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 14,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 3,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnDestructive: { backgroundColor: 'transparent', borderColor: '#e07a5f' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  btnTextPrimary: { color: '#13110f' },
  btnTextDestructive: { color: '#e07a5f' },
  btnTextNeutral: { color: '#cdbf99' },
  input: {
    color: '#e6d8b3',
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    fontSize: 13,
  },
});

// Compatibility helper that turns a TouchableOpacity prop-less call site
// into a modal renderer. Convenience hook export — keeps the call site
// simple where a stateful modal would otherwise be heavyweight.
export { TouchableOpacity };
