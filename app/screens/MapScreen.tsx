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

import React, { useEffect, useRef, useState } from 'react';
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
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../engine/worldMap';
import {
  atlasCoordForLocation,
  cardinalOffsetFromOutpost,
} from '../engine/atlasCoords';
// OTA 051 — locations.json carries the human-readable name we want
// to surface in the "You are here: <name>" chip when the player is
// on a depicted tile.
import locationsData from '../data/locations/locations.json';
import type { Location } from '../engine/types';

const LOCATIONS = locationsData as Location[];

// Atlas asset's pixel dimensions — used to compute the letterboxed
// image rect inside the flex-filled imageBox.
const ATLAS_W = 1408;
const ATLAS_H = 768;

// Gesture clamps.
const MIN_SCALE = 0.8;
// OTA 060 — no zoom-in cap. Player explicitly asked for unrestricted
// pinch-in so they can read fine atlas details (timeline ribbon
// labels, outpost interior diagram, etc.). MIN_SCALE remains so the
// map can't be shrunk to invisibility.
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

  // OTA 056/060 — fill-height-by-default + auto-center on the
  // marker. The atlas asset is landscape (1408 × 768) but the
  // available window is portrait on phones. resizeMode='contain'
  // alone leaves half the box empty above/below; the baseline
  // scale fills the height. Then OTA 060 also auto-pans so the
  // marker (the player's current location) sits in the box
  // center on open — without it, a player anywhere except the
  // image's geometric center would have their marker pushed
  // off-screen by the baseline scale.
  const baselineScale = useRef(1);

  // OTA 23-010 — cardinal-direction-preserving dot positioning.
  // Replaces the OTA 054 IDW interpolation. IDW interpolated the
  // dot via weights inverse to procedural grid distance, but the
  // engine's procedural grid is RANDOM per character — so a
  // location placed procedurally east of Outpost might be drawn at
  // the atlas's LEFT side, which meant walking east in-game pulled
  // the dot leftward visually. Player intuition is east = right,
  // so we revert to the simpler pre-054 model:
  //
  //   1) If the player is at a named-on-atlas location, snap the
  //      dot to that location's canonical drawn position.
  //   2) Otherwise, compute the dot's atlas position by cardinal
  //      offset from the Outpost anchor:
  //        fx = outpost.fx + (mapX - center) * tileFrac
  //        fy = outpost.fy + (mapY - center) * tileFrac
  //      east increases fx (dot moves right), south increases fy
  //      (dot moves down). clampToMapArea keeps the dot inside the
  //      painted world.
  //
  // Loss vs IDW: smooth glide between anchors. Gain: every cardinal
  // step is a predictable visual move in the same direction. The
  // user explicitly chose direction-preservation over IDW snap.
  const safeMapX = typeof player?.mapX === 'number' ? player.mapX : WORLD_MAP_CENTER_X;
  const safeMapY = typeof player?.mapY === 'number' ? player.mapY : WORLD_MAP_CENTER_Y;
  const namedAnchor = atlasCoordForLocation(player?.currentLocationId);
  const safeAtlasPos = namedAnchor ?? cardinalOffsetFromOutpost(
    safeMapX,
    safeMapY,
    { x: WORLD_MAP_CENTER_X, y: WORLD_MAP_CENTER_Y },
  );

  // OTA 23-003 — auto-centering on the player marker removed at
  // playtest request: it interfered with the zoom-in/zoom-out
  // gesture (the centering useEffect re-fired on imgBox changes
  // and yanked the user's pinch back). The marker stays visible
  // wherever the player is via the OTA 23-002 visual upgrade
  // (warm-gold halo + larger 56x40 silhouette). Player pans
  // manually to find their marker if they wander far from it.
  useEffect(() => {
    if (!imgBox) return;
    const imgAspect = ATLAS_W / ATLAS_H;
    const boxAspect = imgBox.width / imgBox.height;
    const fill = boxAspect < imgAspect ? imgAspect / boxAspect : 1;
    baselineScale.current = fill;
    // First-layout: snap to the fill-height baseline so the image
    // claims the full window instead of letterboxing. Only fires
    // when transform is still at defaults so user-driven pinch/pan
    // isn't yanked back.
    if (scaleRef.current === 1 && txRef.current === 0 && tyRef.current === 0) {
      scaleRef.current = fill;
      scale.setValue(fill);
    }
  }, [imgBox, scale]);

  const resetTransform = () => {
    const target = baselineScale.current;
    Animated.parallel([
      Animated.spring(scale, { toValue: target, useNativeDriver: true, friction: 7, tension: 80 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }),
    ]).start(() => {
      scaleRef.current = target;
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
        // OTA 056 — handle pinch that started mid-gesture. The
        // previous build only captured startPinchDist in
        // onPanResponderGrant (first finger). When the second finger
        // landed AFTER the first, pinch never initialized and the
        // player got pan-only behavior. Now we re-capture the
        // baseline as soon as we see two touches.
        if (ts.length >= 2 && startPinchDist.current === 0) {
          startPinchDist.current = distance(ts[0]!, ts[1]!);
          startScale.current = scaleRef.current;
          startTx.current = txRef.current;
          startTy.current = tyRef.current;
          return;
        }
        // Conversely, if we drop from 2 touches back to 1, re-capture
        // the single-finger pan baseline so the next pan doesn't
        // teleport based on the old pinch start delta.
        if (ts.length === 1 && startPinchDist.current > 0) {
          startPinchDist.current = 0;
          startScale.current = scaleRef.current;
          startTx.current = txRef.current;
          startTy.current = tyRef.current;
          return;
        }
        if (ts.length >= 2 && startPinchDist.current > 0) {
          // Pinch — scale ratio drives zoom, midpoint drives pan.
          const newDist = distance(ts[0]!, ts[1]!);
          const ratio = newDist / startPinchDist.current;
          // OTA 060 — no upper bound. Pinch in as far as the player
          // wants. MIN_SCALE preserved so they can't shrink to zero.
          const nextScale = Math.max(MIN_SCALE, startScale.current * ratio);
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

  // Reuse the hoisted safeMapX/safeMapY (computed before the
  // useEffect for the auto-centering). 'player' is non-null past
  // the early-return above.
  const mapX = safeMapX;
  const mapY = safeMapY;
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
  // Reuse the hoisted safe* values computed before the useEffect.
  // Both branches arrive at the same numbers since 'player' is non-
  // null past the early-return guard below.
  const atlasPos = safeAtlasPos;

  const currentLocation = LOCATIONS.find((l) => l.id === player.currentLocationId) ?? null;
  const onDepictedTile = !!atlasCoordForLocation(player.currentLocationId);

  let dotStyle: { left: number; top: number } | null = null;
  if (imgBox) {
    // OTA 055 — letterbox-aware dot positioning. The imageBox is
    // now flex-filled (fills the available height between header
    // and footer); the image inside uses resizeMode='contain' so it
    // letterboxes within that larger window. Compute the actual
    // image-rendered rect inside the box so the dot lands on real
    // pixels, not the empty letterbox margins.
    const imgAspect = ATLAS_W / ATLAS_H;
    const boxAspect = imgBox.width / imgBox.height;
    let renderedW: number;
    let renderedH: number;
    let offsetX: number;
    let offsetY: number;
    if (boxAspect > imgAspect) {
      // Box wider than image — letterbox on left and right.
      renderedH = imgBox.height;
      renderedW = imgBox.height * imgAspect;
      offsetX = (imgBox.width - renderedW) / 2;
      offsetY = 0;
    } else {
      // Box narrower than image — letterbox on top and bottom.
      renderedW = imgBox.width;
      renderedH = imgBox.width / imgAspect;
      offsetX = 0;
      offsetY = (imgBox.height - renderedH) / 2;
    }
    // OTA 057 — marker is offset by HALF its constant screen-size
    // (not its scaled size — the inverse-scale on markerWrapper
    // cancels the parent's transform). Anchoring on the marker's
    // center keeps the figure visually 'standing on' the location.
    dotStyle = {
      left: offsetX + renderedW * atlasPos.fx - MARKER_W / 2,
      top: offsetY + renderedH * atlasPos.fy - MARKER_H / 2,
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
            // OTA 057 — player marker. Inverse-scale via Animated.divide
            // keeps the marker at a constant 32 × 22 px on screen
            // regardless of the parent Animated.View's zoom (baseline
            // ~3.3x on portrait phones, up to 5x on pinch). Without
            // this, the marker would scale with the map and dominate.
            // The marker silhouette anchors at its center on the
            // atlas position.
            <Animated.View
              style={[
                styles.markerWrapper,
                dotStyle,
                { transform: [{ scale: Animated.divide(1, scale) }] },
              ]}
              pointerEvents="none"
            >
              {/* Warm gold halo — the silhouette is solid black on
                  transparent, so against dark atlas regions it would
                  blend in. The halo gives it constant visibility. */}
              <View style={styles.markerHalo} pointerEvents="none" />
              <Image
                source={require('../../assets/player-marker.png')}
                style={styles.markerImage}
                resizeMode="contain"
              />
            </Animated.View>
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

// OTA 23-002 — bumped from 32×22 to 56×40 so the silhouette is
// readable on a phone screen at any zoom. Pair'd with a warm-gold
// halo backdrop (see markerHalo style) so the figure pops against
// any region of the atlas — including the dark deep-frontier band
// where the OTA 057 silhouette could blend into the background.
const MARKER_W = 56;
const MARKER_H = 40;
const HALO_SIZE = 48;

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
    // OTA 055 — flex-filled. The previous aspect-locked sizing
    // produced a thin landscape band on portrait phones with most
    // of the vertical space empty. Now the box claims everything
    // between header and footer; the image inside letterboxes via
    // resizeMode='contain' and the dot computation accounts for the
    // letterbox margins so dots still land on real image pixels.
    flex: 1,
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
  // OTA 057 — silhouette player marker. The wrapper handles the
  // inverse-scale; the image inside fills the wrapper. Marker size
  // is its screen footprint (constant regardless of map zoom).
  markerWrapper: {
    position: 'absolute',
    width: MARKER_W,
    height: MARKER_H,
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
  // OTA 23-002 — circular halo behind the silhouette so it stays
  // visible against any atlas region. Warm gold with soft alpha
  // matches the atlas's parchment palette.
  markerHalo: {
    position: 'absolute',
    left: (MARKER_W - HALO_SIZE) / 2,
    top: (MARKER_H - HALO_SIZE) / 2,
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: 'rgba(224, 122, 95, 0.55)', // warm orange-red, 55% opacity
    borderColor: '#fff7e0',
    borderWidth: 2,
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
