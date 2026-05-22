// OTA 050 — Atlas map screen with pinch-zoom + pan gestures. Renders
// the hand-illustrated world atlas (assets/world-atlas.png) with a
// "you are here" dot anchored to the player's procedural grid position
// relative to the Reclaimers' Outpost ring at the image's center.
//
// Gesture model (built on RN's Animated + PanResponder so no extra
// native dependency):
//   - 1 finger drag    → pan the map
//   - 2 finger pinch   → zoom in/out (anchored to the pinch midpoint)
//   - double-tap       → reset to 1× scale + centered
//   - scale clamped to [0.8, 5]; translate clamped so the image
//     doesn't slide entirely off the visible area
//
// The dot lives inside the same transformed Animated.View as the
// image, so it scales + translates with the map — its anchor at
// the Outpost ring stays correct at any zoom level.
//
// Reality check on the dot:
//   The atlas image depicts a CANONICAL geography (Asgardar east,
//   Mud Seas south, Varakush southeast). The engine's per-character
//   procedural grid shuffles individual cardinal positions, so two
//   characters get two different layouts. The dot represents the
//   player's true grid offset from the Outpost (mapX-10, mapY-10).
//   Use rings for distance, named features for direction-of-travel
//   intuition only.

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  PanResponder,
  type GestureResponderEvent,
} from 'react-native';
import { useGameStore } from '../state/gameStore';
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y, generateWorldMap } from '../engine/worldMap';
import {
  atlasCoordForLocation,
  interpolateAtlasPosition,
} from '../engine/atlasCoords';
// OTA 051 — locations.json carries the human-readable name we want
// to surface in the "You are here: <name>" chip when the player is
// on a depicted tile.
import locationsData from '../data/locations/locations.json';
import type { Location } from '../engine/types';

const LOCATIONS = locationsData as Location[];

// Gesture clamps.
const MIN_SCALE = 0.8;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 280;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function touchesOf(e: GestureResponderEvent): Array<{ x: number; y: number }> {
  const touches = e.nativeEvent.touches ?? [];
  return touches.map((t) => ({ x: t.pageX, y: t.pageY }));
}

export function MapScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);

  // Rendered image-box layout, captured via onLayout.
  const [imgBox, setImgBox] = useState<{ width: number; height: number } | null>(null);

  // Animated transform values driven by the gesture handler.
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Live mirrors of the Animated values so the PanResponder can read
  // and update them without re-rendering on every frame.
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  // Gesture-start snapshots — restored each time the responder grants.
  const startScale = useRef(1);
  const startTx = useRef(0);
  const startTy = useRef(0);
  const startPinchDist = useRef(0);
  const lastTapAt = useRef(0);

  const clampTranslate = (tx: number, ty: number, currentScale: number, box: { width: number; height: number } | null) => {
    if (!box) return { tx, ty };
    // Allow the image to be panned up to half its scaled bounds out
    // of view, so the player can drag a corner to the center.
    const maxX = (box.width * (currentScale - 1)) / 2 + box.width * 0.25;
    const maxY = (box.height * (currentScale - 1)) / 2 + box.height * 0.25;
    return {
      tx: Math.max(-maxX, Math.min(maxX, tx)),
      ty: Math.max(-maxY, Math.min(maxY, ty)),
    };
  };

  const applyTransform = (s: number, tx: number, ty: number) => {
    scaleRef.current = s;
    txRef.current = tx;
    tyRef.current = ty;
    scale.setValue(s);
    translateX.setValue(tx);
    translateY.setValue(ty);
  };

  const resetTransform = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }),
    ]).start(() => {
      scaleRef.current = 1;
      txRef.current = 0;
      tyRef.current = 0;
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const ts = touchesOf(e);
        startScale.current = scaleRef.current;
        startTx.current = txRef.current;
        startTy.current = tyRef.current;
        if (ts.length >= 2) {
          startPinchDist.current = distance(ts[0]!, ts[1]!);
        } else {
          // Double-tap reset.
          const now = Date.now();
          if (now - lastTapAt.current < DOUBLE_TAP_MS) {
            resetTransform();
            lastTapAt.current = 0;
          } else {
            lastTapAt.current = now;
          }
        }
      },
      onPanResponderMove: (e, gestureState) => {
        const ts = touchesOf(e);
        if (ts.length >= 2 && startPinchDist.current > 0) {
          // Pinch — scale around the gesture midpoint.
          const newDist = distance(ts[0]!, ts[1]!);
          const ratio = newDist / startPinchDist.current;
          const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, startScale.current * ratio));
          // Pan during pinch: midpoint delta from start.
          const tx = startTx.current + gestureState.dx;
          const ty = startTy.current + gestureState.dy;
          const clamped = clampTranslate(tx, ty, nextScale, imgBox);
          applyTransform(nextScale, clamped.tx, clamped.ty);
        } else {
          // Single-finger pan.
          const tx = startTx.current + gestureState.dx;
          const ty = startTy.current + gestureState.dy;
          const clamped = clampTranslate(tx, ty, scaleRef.current, imgBox);
          applyTransform(scaleRef.current, clamped.tx, clamped.ty);
        }
      },
      onPanResponderRelease: () => {
        startPinchDist.current = 0;
      },
      onPanResponderTerminate: () => {
        startPinchDist.current = 0;
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No character loaded.</Text>
      </View>
    );
  }

  const mapX = typeof player.mapX === 'number' ? player.mapX : WORLD_MAP_CENTER_X;
  const mapY = typeof player.mapY === 'number' ? player.mapY : WORLD_MAP_CENTER_Y;
  const dx = mapX - WORLD_MAP_CENTER_X;
  const dy = mapY - WORLD_MAP_CENTER_Y;
  const tiles = Math.abs(dx) + Math.abs(dy);

  // OTA 054 — inverse-distance-weighted dot plotting.
  //
  // Regenerate the player's procedural world map (deterministic per
  // character seed) so we have the procedural grid positions of
  // every named location. Then IDW-interpolate the player's atlas
  // coord using each location's atlas coord weighted by inverse
  // procedural distance. This gives:
  //   - Snap-to-anchor when the player is on a named tile (the
  //     anchor's weight dominates the average).
  //   - Smooth glide between anchors during cardinal travel.
  //   - Per-pair scaling for free: if two anchors are 26 tiles apart
  //     procedurally and 2 inches apart visually, a halfway point
  //     procedurally lands halfway visually.
  //   - The dot is ALWAYS plotted — there's no "between locations"
  //     fallback branch.
  const seed = player.mapSeed
    ?? `${player.name}|${player.raceId}|${player.factionId}|legacy`;
  const worldMap = generateWorldMap(seed, player.currentLocationId);
  const atlasPos = interpolateAtlasPosition(mapX, mapY, worldMap.positions);

  const currentLocation = LOCATIONS.find((l) => l.id === player.currentLocationId) ?? null;
  const onDepictedTile = !!atlasCoordForLocation(player.currentLocationId);

  let dotStyle: { left: number; top: number } | null = null;
  if (imgBox) {
    dotStyle = {
      left: imgBox.width * atlasPos.fx - DOT_SIZE / 2,
      top: imgBox.height * atlasPos.fy - DOT_SIZE / 2,
    };
  }

  // Footer prose — when the player is on a depicted location, name
  // it; otherwise give the cardinal direction + tile count from the
  // Outpost so the player has both a visual and a textual reference.
  const whereLine = onDepictedTile && currentLocation
    ? currentLocation.name
    : dx === 0 && dy === 0
      ? 'at the Outpost'
      : Math.abs(dx) >= Math.abs(dy)
        ? `${Math.abs(dx)} tile${Math.abs(dx) === 1 ? '' : 's'} ${dx >= 0 ? 'east' : 'west'} of the Outpost`
        : `${Math.abs(dy)} tile${Math.abs(dy) === 1 ? '' : 's'} ${dy >= 0 ? 'south' : 'north'} of the Outpost`;

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
        <Text style={styles.title}>ATLAS</Text>
        <TouchableOpacity
          onPress={resetTransform}
          style={styles.resetBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.resetText}>RESET</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.imageBox}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setImgBox({ width, height });
        }}
        {...panResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.imageInner,
            { transform: [{ translateX }, { translateY }, { scale }] },
          ]}
        >
          <Image
            source={require('../../assets/world-atlas.png')}
            style={styles.atlas}
            resizeMode="contain"
          />
          {dotStyle && (
            <>
              <View style={[styles.pulseRing, dotStyle]} pointerEvents="none" />
              <View style={[styles.dot, dotStyle]} pointerEvents="none" />
            </>
          )}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHere}>● YOU ARE HERE</Text>
        <Text style={styles.footerWhere}>{whereLine}</Text>
        <Text style={styles.footerDist}>
          {tiles === 0 ? 'At the Outpost.' : `${tiles} day${tiles === 1 ? '' : 's'} of travel from the Outpost.`}
        </Text>
        <Text style={styles.footerCaveat}>
          Drag to pan · pinch to zoom · double-tap to reset.
          {onDepictedTile
            ? ' Dot snapped to the atlas drawing.'
            : ' Dot interpolated across the nearest named landmarks.'}
        </Text>
      </View>
    </View>
  );
}

const DOT_SIZE = 14;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  backBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  resetBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  resetText: { color: '#7a705c', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },

  imageBox: {
    // Aspect-locked to the atlas asset (1408 × 768, landscape) so
    // the dot's fractional coords land on actual image content.
    // Flex-1 would have letterboxed the image with margins, and
    // the dot would have drifted into the dead space.
    width: '100%',
    aspectRatio: 1408 / 768,
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 4,
  },
  imageInner: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  atlas: {
    width: '100%',
    height: '100%',
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#e07a5f',
    borderColor: '#fff7e0',
    borderWidth: 2,
  },
  pulseRing: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderColor: '#e07a5f',
    borderWidth: 2,
    transform: [{ scale: 2.2 }],
    opacity: 0.45,
  },

  footer: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
  },
  footerHere: { color: '#e07a5f', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  footerWhere: { color: '#e6d8b3', fontSize: 13, marginTop: 2 },
  footerDist: { color: '#cdbf99', fontSize: 11, marginTop: 4 },
  footerCaveat: { color: '#5a5246', fontSize: 9, fontStyle: 'italic', marginTop: 8, lineHeight: 13 },
});
