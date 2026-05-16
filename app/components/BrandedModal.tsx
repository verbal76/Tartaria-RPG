import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
} from 'react-native';
import type { ItemPreview } from './itemPreview';

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
  buttons: BrandedModalButton[];
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
  buttons,
  onRequestClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onRequestClose}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
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
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function rarityColor(rarity: string) {
  switch (rarity) {
    case 'Legendary': return { color: '#e07a5f' };
    case 'Rare': return { color: '#b88ce0' };
    case 'Uncommon': return { color: '#9ec96a' };
    default: return { color: '#c9a86a' };
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
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  headerRow: { marginBottom: 8 },
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
  itemKind: { color: '#7a705c', fontSize: 11, letterSpacing: 1, marginTop: 1 },
  statsBlock: { marginTop: 8, gap: 2 },
  statLine: { color: '#cdbf99', fontSize: 12 },
  itemDesc: { color: '#7a705c', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  context: { color: '#9ec96a', fontSize: 12, marginTop: 8, letterSpacing: 1 },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 80,
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
});

// Compatibility helper that turns a TouchableOpacity prop-less call site
// into a modal renderer. Convenience hook export — keeps the call site
// simple where a stateful modal would otherwise be heavyweight.
export { TouchableOpacity };
