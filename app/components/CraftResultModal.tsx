import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from 'react-native';
import type { InventoryDelta } from './inventoryDelta';

// OTA-264 — Post-craft confirmation popup. Player feedback: "every
// time I craft something, a popup should show up saying that I
// crafted whatever it was and that it is in my inventory, but the
// crafting menu shouldn't close it should stay open for me to craft
// something else. the popup should ask if I want to continue crafting
// or close the menu."
//
// Pre-OTA-264 the Crafting screen's Craft + Recipes tabs auto-closed
// to exploration after every craft (CraftingScreen.tsx passed
// `onAfterCraft={() => setScreen('exploration')}` to RecipesView).
// Friction for any player crafting more than one item at a time, and
// no visible confirmation that the craft actually landed.
//
// New flow: RecipesView snapshots inventory before craft, diffs
// after, and hands the delta to CraftingScreen. If the delta is
// non-empty CraftingScreen renders this modal; CONTINUE CRAFTING
// closes the popup but keeps the Crafting screen on the active tab
// so the player can chain another craft; CLOSE MENU closes both.
// Empty delta (failed craft / no-op) bypasses the modal entirely —
// the engine's error narration in the world feed is the player's
// signal there.
//
// Pattern mirrors SalvageModal's results phase (rarity-coded ✦ rows)
// and HookContinueModal's button layout (primary action left, neutral
// right) for consistent feel.

interface Props {
  visible: boolean;
  /** Inventory delta from this craft — typically a single item with
   *  qty 1, but some recipes might produce more. We render every
   *  entry so multi-output recipes display cleanly. */
  items: InventoryDelta[];
  /** Dismiss the popup, keep the crafting menu open. */
  onContinue: () => void;
  /** Dismiss the popup AND close the crafting menu. */
  onClose: () => void;
}

const ITEM_SCROLL_MAX_HEIGHT = Math.max(
  120,
  Math.floor(Dimensions.get('window').height - 380),
);

export function CraftResultModal({ visible, items, onContinue, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onContinue}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onContinue}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>✓ CRAFTED</Text>
              <View style={styles.rule} />
              <Text style={styles.lead}>Added to your inventory:</Text>

              <ScrollView
                style={[styles.itemScroll, { maxHeight: ITEM_SCROLL_MAX_HEIGHT }]}
                contentContainerStyle={styles.itemList}
              >
                {items.map((it) => (
                  <View key={it.name} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      ✦ {it.name}{it.quantity > 1 ? ` × ${it.quantity}` : ''}
                    </Text>
                    {it.rarity ? (
                      <Text style={styles.itemRarity}>{it.rarity}</Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                  onPress={onContinue}
                >
                  <Text style={styles.btnTextPrimary}>CONTINUE CRAFTING</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onClose}
                >
                  <Text style={styles.btnTextNeutral}>CLOSE MENU</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
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
    maxWidth: 400,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  lead: { color: '#cdbf99', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  itemScroll: { },
  itemList: { gap: 6, paddingVertical: 2 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1714',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  itemName: { color: '#e6d8b3', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  itemRarity: { color: '#9ec96a', fontSize: 10, letterSpacing: 1.5, marginLeft: 8 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 96,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 1.5, fontSize: 11 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 1.5, fontSize: 11 },
});
