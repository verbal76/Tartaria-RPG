// ⚠⚠⚠ OTA-1718 — A CARD THAT STAYS ACTIONABLE WITH THE KEYBOARD OPEN.
//
// Reported on an iPhone 14: on REPORT A BUG the keyboard covers the SEND button
// and the form cannot be scrolled far enough to expose it. The owner's framing
// is the one this file is built on — *"the user shouldn't have to know how to
// dismiss the keyboard just to submit the report"* — so DONE and tap-to-dismiss
// are courtesies layered on top, never the fix. The fix is that the card is laid
// out inside the space the keyboard leaves.
//
// ⚠⚠ THE SHAPE, which is the whole thing: HEADER (fixed) · BODY (scrolls,
// flexShrink) · FOOTER (fixed, pinned). BrandedModal already does exactly this —
// OTA-1614 built it there after the buttons got squeezed off — but it was never
// generalised, so every other card with a text field grew its own layout and
// each one had to be reported separately before anyone looked at it. This is that
// shape with the one piece OTA-1614 did not have: a MEASURED keyboard, so the
// card's ceiling is the keyboard's top edge rather than a percentage of a screen
// that does not know the keyboard exists.
//
// ⚠ WHY MEASURED AND NOT `KeyboardAvoidingView behavior="padding"`. That view
// shrinks its own content box, which only helps if the child shrinks with it. A
// card whose height is its natural content height simply overflows and the
// footer lands under the keyboard — which is exactly what REPORT A BUG did. It
// also reads the window frame, which is unreliable inside a native <Modal> with
// `statusBarTranslucent`. `endCoordinates.screenY` is the keyboard's real top
// edge and already includes the predictive bar and the home indicator, which is
// the "respect keyboard insets rather than a fixed bottom offset" the report
// asked for.
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type ScrollView as ScrollViewType,
} from 'react-native';
import {
  cardMaxHeight,
  keyboardInset,
  type CardViewport,
} from '../engine/keyboardSafeCard';

/** The live viewport: the window, and where the keyboard's top edge is in it.
 *  `keyboardTop === windowHeight` means no keyboard. */
export function useCardViewport(): CardViewport {
  const [vp, setVp] = useState<CardViewport>(() => {
    const h = Dimensions.get('window').height;
    return { windowHeight: h, keyboardTop: h };
  });

  useEffect(() => {
    const windowNow = () => Dimensions.get('window').height;
    // ⚠ `screenY` when the OS gives it, height as the fallback. Android's Fabric
    // path drops `screenY` often enough that deriving the top edge from the
    // height is the reliable read there (the same quirk keyboardPoll.ts exists
    // for); iOS reports screenY correctly and it is the better number, because
    // it is the actual edge rather than a subtraction.
    const apply = (e: { endCoordinates?: { screenY?: number; height?: number } }) => {
      const h = windowNow();
      const c = e?.endCoordinates;
      const top = typeof c?.screenY === 'number' && c.screenY > 0 && c.screenY <= h
        ? c.screenY
        : typeof c?.height === 'number' && c.height > 0
          ? h - c.height
          : h;
      setVp({ windowHeight: h, keyboardTop: top });
    };
    const clear = () => {
      const h = windowNow();
      setVp({ windowHeight: h, keyboardTop: h });
    };

    const subs = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', apply),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', clear),
    ];
    let frameSub: { remove: () => void } | null = null;
    try {
      frameSub = Keyboard.addListener(
        'keyboardDidChangeFrame' as Parameters<typeof Keyboard.addListener>[0],
        apply,
      );
    } catch { /* older RN — the two above are enough */ }
    // Rotation, split view, a bigger text size: the window itself moved.
    const dimSub = Dimensions.addEventListener('change', () => {
      setVp((prev) => {
        const h = windowNow();
        const wasOpen = prev.keyboardTop < prev.windowHeight;
        return { windowHeight: h, keyboardTop: wasOpen ? Math.min(prev.keyboardTop, h) : h };
      });
    });

    // If the keyboard is ALREADY up when this mounts — a field autofocused, or a
    // second modal opened over a first — no event is coming. Ask.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const k = Keyboard as any;
      if (typeof k.isVisible === 'function' && k.isVisible() && typeof k.metrics === 'function') {
        const m = k.metrics();
        if (m) apply({ endCoordinates: m });
      }
    } catch { /* metrics unavailable on this RN — fine */ }

    return () => {
      subs.forEach((s) => s.remove());
      frameSub?.remove();
      dimSub.remove();
    };
  }, []);

  return vp;
}

interface Props {
  visible: boolean;
  /** Fixed, above the scrolling body. */
  header?: React.ReactNode;
  /** The scrolling middle. Text fields live here. */
  children: React.ReactNode;
  /** Fixed, pinned to the bottom of the card. The primary action lives here, and
   *  pinning it is the point: it is reachable without scrolling at all. */
  footer?: React.ReactNode;
  /** ⚠⚠ Tapping the scrim. With the keyboard OPEN this dismisses the keyboard and
   *  does NOT close the card — on a bug report that had taken a paragraph to
   *  write, a tap-outside that discarded it would be a worse defect than the one
   *  being fixed. A second tap, with the keyboard down, closes. */
  onRequestClose: () => void;
  maxWidth?: number;
  /** Escape hatch for a card that must not be dismissed by tapping away. */
  dismissOnScrim?: boolean;
  testID?: string;
}

export function KeyboardSafeCard({
  visible,
  header,
  children,
  footer,
  onRequestClose,
  maxWidth = 420,
  dismissOnScrim = true,
  testID,
}: Props) {
  const vp = useCardViewport();
  const scrollRef = useRef<ScrollViewType>(null);
  const inset = keyboardInset(vp);

  const onScrim = () => {
    if (!dismissOnScrim) return;
    // The keyboard first. Only an already-quiet screen closes.
    if (inset > 0) { Keyboard.dismiss(); return; }
    onRequestClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onScrim} accessible={false}>
        <View style={[styles.scrim, { paddingBottom: inset }]} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback accessible={false}>
            <View
              testID={testID}
              style={[styles.card, { maxWidth, maxHeight: cardMaxHeight(vp) }]}
            >
              {header}
              {/* ⚠ `flexShrink: 1` is what makes the footer survive: the BODY
                  gives up its height, never the buttons. `handled` on taps means
                  a control inside the body works on the FIRST tap while the
                  keyboard is open, instead of the first tap only closing it. */}
              <ScrollView
                ref={scrollRef}
                style={styles.body}
                contentContainerStyle={styles.bodyInner}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                showsVerticalScrollIndicator
              >
                {children}
              </ScrollView>
              {footer}
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
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  // OTA-1718 — the middle shrinks; the header and the footer do not.
  body: { flexShrink: 1, flexGrow: 0 },
  bodyInner: { paddingBottom: 4 },
});
