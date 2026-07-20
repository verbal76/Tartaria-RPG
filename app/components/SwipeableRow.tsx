import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onDelete: () => void;
  children: React.ReactNode;
  deleteLabel?: string;
}

const DELETE_WIDTH = 90;
const SWIPE_THRESHOLD = -DELETE_WIDTH / 2;
const SWIPE_DISMISS_THRESHOLD = -DELETE_WIDTH * 1.6;

export function SwipeableRow({ onDelete, children, deleteLabel = 'Delete' }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  // Tracks the resting open/closed position so a pan starts from where the
  // row currently sits rather than from 0.
  const restValue = useRef(0);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        translateX.stopAnimation((v) => {
          restValue.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        const next = Math.min(0, restValue.current + g.dx);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const final = restValue.current + g.dx;
        if (final < SWIPE_DISMISS_THRESHOLD) {
          onDelete();
          return;
        }
        const open = final < SWIPE_THRESHOLD;
        Animated.spring(translateX, {
          toValue: open ? -DELETE_WIDTH : 0,
          useNativeDriver: true,
          friction: 7,
          tension: 80,
        }).start(() => {
          restValue.current = open ? -DELETE_WIDTH : 0;
        });
      },
    }),
  ).current;

  function close() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }).start(
      () => {
        restValue.current = 0;
      },
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.deleteLayer}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            close();
            onDelete();
          }}
          style={styles.deleteBtn}
        >
          <Text style={styles.deleteText}>{deleteLabel}</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.surface, { transform: [{ translateX }] }]}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden', marginBottom: 8 },
  deleteLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: DELETE_WIDTH,
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: '#5a2a26',
    borderRadius: 4,
  },
  deleteBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#e6d8b3', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  surface: { backgroundColor: '#0a0908' },
});
