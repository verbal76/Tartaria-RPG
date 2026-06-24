import React from 'react';
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
  // Card content shared by the native-Modal path and the inline-overlay path.
  const cardChildren = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title.toUpperCase()}</Text>
        <View style={styles.ruleLine} />
      </View>

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
          placeholderTextColor="#6ab0c9"
          autoFocus={textInput.autoFocus}
          selectionColor="#6ab0c9"
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
          >
            <Text style={[styles.btnText, toneText(b.tone)]}>{b.label.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
  // arb73 — inline overlay path: skip the native <Modal> entirely (iPad can
  // present it invisibly while still eating touches). Render nothing when
  // hidden; otherwise an absolute full-screen overlay in the normal tree.
  if (inline) {
    if (!visible) return null;
    return (
      <View style={styles.inlineScrim} pointerEvents="box-none">
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
            <View style={styles.card}>{cardChildren}</View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function rarityColor(rarity: string) {
  switch (rarity) {
    case 'Legendary': return { color: '#e07a5f' };
    case 'Rare': return { color: '#b88ce0' };
    case 'Uncommon': return { color: '#9ec96a' };
    default: return { color: '#6ab0c9' };
  }
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
    backgroundColor: '#0e1618',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  headerRow: { marginBottom: 8 },
  title: {
    color: '#6ab0c9',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
  },
  ruleLine: {
    height: 1,
    backgroundColor: '#2b3a3e',
    marginTop: 6,
  },
  itemBlock: {
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
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
  itemName: { color: '#d6e4e8', fontSize: 15, fontWeight: '700', flex: 1 },
  rarity: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  itemKind: { color: '#6c8088', fontSize: 11, letterSpacing: 1, marginTop: 1 },
  statsBlock: { marginTop: 8, gap: 2 },
  statLine: { color: '#bcd2db', fontSize: 12 },
  itemDesc: { color: '#6c8088', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  body: { color: '#d6e4e8', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  // OTA-286 — quantity stepper row inside the action modal. Mirrors
  // the About screen's volume / rate / pitch row layout exactly so
  // the player recognizes the control on sight.
  stepperRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4, gap: 8 },
  stepperLabel: { color: '#bcd2db', fontSize: 12, letterSpacing: 1 },
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
  btnPrimary: { backgroundColor: '#6ab0c9', borderColor: '#6ab0c9' },
  btnDestructive: { backgroundColor: 'transparent', borderColor: '#e07a5f' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#2b3a3e' },
  btnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  btnTextPrimary: { color: '#0e1618' },
  btnTextDestructive: { color: '#e07a5f' },
  btnTextNeutral: { color: '#bcd2db' },
  input: {
    color: '#d6e4e8',
    backgroundColor: '#131c1f',
    borderColor: '#6ab0c9',
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
