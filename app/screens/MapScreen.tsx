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
// Marker model (v2.4.1 overhaul):
//   Procedural map regenerates on every travelTo, with the new
//   location at grid center. So mapX/mapY is local to the current
//   location, not Outpost-relative. Marker snaps to the current
//   location's canonical atlas anchor on arrival, then drifts in
//   the player's direction of travel as they wander. Procedural
//   placement now respects canonical bearing (see worldMap.ts), so
//   walking east on the map moves the marker east and you'll
//   eventually reach the canonically-east named location.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  PanResponder,
  ScrollView,
  type GestureResponderEvent,
} from 'react-native';
import { useGameStore } from '../state/gameStore';
// OTA-171 — Location + locationsData are already imported below for
// the existing LOCATIONS const; reused here for the Places list
// panel so a player can tap any known location and start travel
// without digging through Lore.
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../engine/worldMap';
import {
  atlasCoordForLocation,
  cardinalOffsetFromAnchor,
  hubRoomMinimapCoord,
  OUTPOST_ATLAS_COORD,
  LOCATION_ATLAS_COORDS,
} from '../engine/atlasCoords';
import { LOCATION_TO_MACRO } from '../engine/worldLadder';
import { isHubLocation, hubRoomFor, hubNameForFaction } from '../engine/hub';
import { FACTION_STARTING_LOCATION } from '../engine/character';
// OTA 051 — locations.json carries the human-readable name we want
// to surface in the "You are here: <name>" chip when the player is
// on a depicted tile.
import locationsData from '../data/locations/locations.json';
import type { Location } from '../engine/types';

const LOCATIONS = locationsData as Location[];

// arb105 — map each faction's outpost macro-tile to that faction's
// outpost display name ("Reclaimers' Outpost", "Monarch Court", …). The
// travel list shows the geographic tile name (e.g. "Reclaimer's Stake"),
// which doesn't read as an outpost; this lets the row tag the tile with
// its outpost identity in parens so the player can spot the 9 faction
// outposts at a glance.
const OUTPOST_NAME_BY_LOCATION: Record<string, string> = Object.fromEntries(
  Object.entries(FACTION_STARTING_LOCATION).map(
    ([factionId, locId]) => [locId, hubNameForFaction(factionId)],
  ),
);

// arb98 — descriptive (text-only) whereabouts for the map footer. The map is
// a reference image with NO player marker; instead the footer tells the player
// IN WORDS roughly where they are relative to the drawn landmarks/regions, so
// they can find themselves on the picture. Reads the canon grid coords; does
// NOT modify them.
const REGION_DISPLAY: Record<string, string> = {
  borderlands: 'the Borderlands',
  silt_wastes: 'the Silt Wastes',
  subterranean_empire: 'the Subterranean Empire',
  lost_capitals: 'the Lost Capitals',
  aetherstone_deep: 'the Aetherstone Deep',
};
function cardinalBetween(from: { fx: number; fy: number }, to: { fx: number; fy: number }): string {
  const ns = to.fy < from.fy - 0.04 ? 'north' : to.fy > from.fy + 0.04 ? 'south' : '';
  const ew = to.fx > from.fx + 0.04 ? 'east' : to.fx < from.fx - 0.04 ? 'west' : '';
  return (ns + ew) || 'close by';
}
/** A verbal "you are near …" line built from the canon atlas layout. */
function describeWhereabouts(locId: string, locs: Location[]): string {
  const here = LOCATION_ATLAS_COORDS[locId] ?? atlasCoordForLocation(locId);
  if (!here) return '';
  const region = REGION_DISPLAY[LOCATION_TO_MACRO[locId] ?? ''] ?? '';
  const near = locs
    .filter((l) => l.id !== locId && l.discoverable !== false && LOCATION_ATLAS_COORDS[l.id])
    .map((l) => {
      const c = LOCATION_ATLAS_COORDS[l.id]!;
      return { name: l.name, d: Math.hypot(c.fx - here.fx, c.fy - here.fy), dir: cardinalBetween(here, c) };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  const nearStr = near.map((n) => `${n.name} (${n.dir})`).join(', ');
  const regionPart = region ? `In ${region}.` : '';
  const nearPart = nearStr ? ` Near ${nearStr}.` : '';
  return (regionPart + nearPart).trim();
}

// Atlas asset's pixel dimensions — used to compute the letterboxed
// image rect inside the flex-filled imageBox.
// arb97 — new commissioned atlas art (assets/world-atlas.png) is 1774×887
// (2.0:1), replacing the old 1408×768 (1.83:1) hand-drawn map. The dot math
// is aspect-driven, so these MUST match the live asset's real dimensions.
const ATLAS_W = 1774;
const ATLAS_H = 887;

// arb99 — the world atlas, plus per-faction outpost INTERIOR maps. When the
// player is inside their outpost the Map screen shows that faction's interior;
// out in the world it shows the world atlas. Outpost maps are 1254×1254 (1:1).
// arb106 — all 9 faction outpost interior maps have now landed. The Servants
// of the Giants map ("Tomb Vigil") was the last one; its room names already
// matched the artist's labels (hub_faction_variants.json), so wiring the PNG
// completes the set.
const WORLD_ATLAS = require('../../assets/world-atlas.png');
const OUTPOST_MAPS: Record<string, number> = {
  mud_monarchs: require('../../assets/outposts/mud_monarchs.png'),
  eternal_dynasty: require('../../assets/outposts/eternal_dynasty.png'),
  forgotten_order: require('../../assets/outposts/forgotten_order.png'),
  reclaimers_guild: require('../../assets/outposts/reclaimers_guild.png'),
  true_tartarians: require('../../assets/outposts/true_tartarians.png'),
  tartarian_revivalists: require('../../assets/outposts/tartarian_revivalists.png'),
  conspiracy_architects: require('../../assets/outposts/conspiracy_architects.png'),
  stone_builders: require('../../assets/outposts/stone_builders.png'),
  servants_of_giants: require('../../assets/outposts/servants_of_giants.png'),
};

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
  // OTA-171 — direct push-to-route from the MapScreen places list.
  // No confirm modal (player ask: "I don't want to copy the text I
  // want to be able to push to route automatically"). Tapping a
  // place row calls setTravelCourse + bounces to exploration.
  const setTravelCourse = useGameStore((s) => s.setTravelCourse);
  const appendLog = useGameStore((s) => s.appendLog);
  // OTA-171 — Places list sorted with the current location pinned at
  // the top so the player can see where they are at a glance, then
  // by danger ascending (safer trips first) so the easiest
  // destinations are visible without scrolling.
  const placesView = useMemo(() => {
    const all = LOCATIONS;
    const here = player?.currentLocationId;
    return [...all].sort((a, b) => {
      if (a.id === here && b.id !== here) return -1;
      if (b.id === here && a.id !== here) return 1;
      if (a.danger !== b.danger) return a.danger - b.danger;
      return a.name.localeCompare(b.name);
    });
  }, [player?.currentLocationId]);

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

  // Marker positioning — v2.4.1 overhaul (OTA 2026-05-23-019).
  //
  // The procedural map regenerates on every travelTo with the
  // destination at grid center (worldMap.ts:7221). So mapX/mapY is
  // LOCAL to the current named location, not Outpost-relative.
  //
  // Two cases:
  //   1) Player just arrived (mapX/mapY === center): snap to the
  //      current location's canonical atlas anchor. No drift yet.
  //   2) Player has stepped off the named tile (mapX/mapY !== center):
  //      drift from the current anchor by aspect-corrected per-tile
  //      fractions. East steps push fx right, south push fy down.
  //      The marker flows in the direction of travel on the canonical
  //      atlas — even if the procedural map placed the destination
  //      elsewhere, walking east on the map still moves the marker
  //      east. Procedural placement now respects canonical bearing
  //      (worldMap.ts), so the marker generally heads toward the
  //      next canonical anchor in the direction of travel.
  //
  // The prior code snapped to the named anchor whenever
  // currentLocationId matched an atlas-depicted location — but
  // currentLocationId only changes on travelTo (crossing into a NEW
  // named tile), so the marker stayed glued to the last anchor
  // through unlimited cardinal stepping. That was the visible bug.
  const safeMapX = typeof player?.mapX === 'number' ? player.mapX : WORLD_MAP_CENTER_X;
  const safeMapY = typeof player?.mapY === 'number' ? player.mapY : WORLD_MAP_CENTER_Y;
  // v2.4.1 (OTA 032) — hub-aware marker positioning.
  // When the player is inside any faction's hub (shared Outpost
  // layout), the marker renders on the bottom-left minimap inset
  // at per-room coords from HUB_ROOM_MINIMAP_COORDS — discrete
  // per-room positions (no cardinal drift inside the hub since
  // travel is room-graph, not tile-step). Outside the hub, falls
  // through to the world-map cardinal-offset logic.
  const inHub = isHubLocation(player?.currentLocationId) && !!player?.hubRoomId;
  const hubMinimapPos = inHub ? hubRoomMinimapCoord(player?.hubRoomId) : null;
  // arb99 — pick the map for where you are. Inside an outpost whose interior
  // art exists → that faction's outpost map (square); otherwise the world
  // atlas (2:1). mapAspect drives the fill/letterbox math below.
  const outpostMapSource = inHub && player?.factionId ? OUTPOST_MAPS[player.factionId] : undefined;
  const showingOutpost = !!outpostMapSource;
  const mapSource = outpostMapSource ?? WORLD_ATLAS;
  const mapAspect = showingOutpost ? 1 : ATLAS_W / ATLAS_H;
  const currentAnchor =
    atlasCoordForLocation(player?.currentLocationId) ?? OUTPOST_ATLAS_COORD;
  const atCenter =
    safeMapX === WORLD_MAP_CENTER_X && safeMapY === WORLD_MAP_CENTER_Y;
  const safeAtlasPos = hubMinimapPos ?? (atCenter
    ? currentAnchor
    : cardinalOffsetFromAnchor(currentAnchor, safeMapX, safeMapY, {
        x: WORLD_MAP_CENTER_X,
        y: WORLD_MAP_CENTER_Y,
      }));

  // OTA 23-003 — auto-centering on the player marker removed at
  // playtest request: it interfered with the zoom-in/zoom-out
  // gesture (the centering useEffect re-fired on imgBox changes
  // and yanked the user's pinch back). The marker stays visible
  // wherever the player is via the OTA 23-002 visual upgrade
  // (warm-gold halo + larger 56x40 silhouette). Player pans
  // manually to find their marker if they wander far from it.
  //
  // 2026-05-25 OTA-035 — exception: when the player is INSIDE an
  // outpost, the bottom-left minimap inset is far from the screen
  // center and the marker would otherwise sit off-screen at the
  // default fill-scale. Auto-focus the outpost section on first
  // layout so opening the map shows the player's room without
  // panning. didAutoFocusHub guards against re-firing on subsequent
  // imgBox layouts so user-driven pinch/pan isn't yanked back —
  // matches the pattern the original auto-center was missing.
  const didAutoFocusHub = useRef(false);
  useEffect(() => {
    if (!imgBox) return;
    const imgAspect = mapAspect;
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

  useEffect(() => {
    // arb99 — when showing the actual outpost interior map, skip the old
    // world-map "center on the hub inset" focus; the interior fills the screen.
    if (!imgBox || !inHub || showingOutpost || didAutoFocusHub.current) return;
    if (!hubMinimapPos) return;
    // Compute the marker's position in unscaled imgBox coordinates
    // using the same letterbox-aware math as the dotStyle below.
    const imgAspect = mapAspect;
    const boxAspect = imgBox.width / imgBox.height;
    let renderedW: number;
    let renderedH: number;
    let offsetX: number;
    let offsetY: number;
    if (boxAspect > imgAspect) {
      renderedH = imgBox.height;
      renderedW = imgBox.height * imgAspect;
      offsetX = (imgBox.width - renderedW) / 2;
      offsetY = 0;
    } else {
      renderedW = imgBox.width;
      renderedH = imgBox.width / imgAspect;
      offsetX = 0;
      offsetY = (imgBox.height - renderedH) / 2;
    }
    const markerX = offsetX + renderedW * hubMinimapPos.fx;
    const markerY = offsetY + renderedH * hubMinimapPos.fy;
    // Zoom in beyond baseline so the room is readable, then pan
    // so the marker lands at the center of the visible window.
    const target = Math.max(baselineScale.current * 2.5, 2.5);
    const tx = (imgBox.width / 2 - markerX) * target;
    const ty = (imgBox.height / 2 - markerY) * target;
    const clamped = clampTranslate(tx, ty, target, imgBox);
    didAutoFocusHub.current = true;
    Animated.parallel([
      Animated.spring(scale, { toValue: target, useNativeDriver: true, friction: 8, tension: 60 }),
      Animated.spring(translateX, { toValue: clamped.tx, useNativeDriver: true, friction: 8, tension: 60 }),
      Animated.spring(translateY, { toValue: clamped.ty, useNativeDriver: true, friction: 8, tension: 60 }),
    ]).start(() => {
      scaleRef.current = target;
      txRef.current = clamped.tx;
      tyRef.current = clamped.ty;
    });
  }, [imgBox, inHub, showingOutpost, hubMinimapPos, scale, translateX, translateY]);

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

  // 'player' is non-null past the early-return guard above, so the
  // hoisted safe* values are stable.
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
    const imgAspect = mapAspect;
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

  // Footer prose — at the named tile, name it. Otherwise report the
  // cardinal direction + tile count from the CURRENT location (mapX/Y
  // is local to the current location's procedural map, not the
  // Outpost; the prior "of the Outpost" text was incorrect after any
  // travelTo).
  const fromName = currentLocation?.name ?? 'the Outpost';
  // v2.4.1 (OTA 032) — hub-aware footer. When inside the hub, show
  // the faction's hub title + the current room name from the
  // variant overlay (so a Forgotten Order character reads
  // "Order Cloister — The Threshold" instead of "Tartarian Outskirts").
  const hubRoomDisplay = inHub
    ? hubRoomFor(player?.hubRoomId, player?.factionId)
    : null;
  const hubLabel = inHub
    ? `${hubNameForFaction(player?.factionId)} — ${hubRoomDisplay?.name ?? 'Hub'}`
    : null;
  const whereLine = hubLabel
    ?? (atCenter && currentLocation
      ? currentLocation.name
      : Math.abs(dx) >= Math.abs(dy)
        ? `${Math.abs(dx)} tile${Math.abs(dx) === 1 ? '' : 's'} ${dx >= 0 ? 'east' : 'west'} of ${fromName}`
        : `${Math.abs(dy)} tile${Math.abs(dy) === 1 ? '' : 's'} ${dy >= 0 ? 'south' : 'north'} of ${fromName}`);

  // arb98 — verbal whereabouts (no marker on the art; this is the player's
  // orientation cue). Inside a hub we just name the outpost; out in the world
  // we describe the region + the nearest drawn landmarks.
  const whereaboutsLine = inHub
    ? `Inside the ${hubNameForFaction(player?.factionId)} — a fixed outpost interior.`
    : describeWhereabouts(player.currentLocationId, LOCATIONS);

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
            source={mapSource}
            style={styles.atlas}
            resizeMode="contain"
          />
          {/* OTA-182 — player marker (silhouette + halo) removed.
              Player ask: "let's take the player marker off of the
              map, we were never able to make it accurate so let's
              let the map just be a map." Procedural marker
              placement drifted from the atlas's hand-painted city
              positions enough that the player wasn't a reliable
              cue. Map now renders as art-only. The "you are here"
              text + bearings still live in the footer below for
              location context. */}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHere}>WHERE YOU ARE</Text>
        <Text style={styles.footerWhere}>{whereLine}</Text>
        {whereaboutsLine ? (
          <Text style={styles.footerNear}>{whereaboutsLine}</Text>
        ) : null}
        <Text style={styles.footerDist}>
          {inHub
            ? `Inside the ${hubNameForFaction(player?.factionId)}.`
            : tiles === 0
              ? `At ${fromName}.`
              : `${tiles} day${tiles === 1 ? '' : 's'} of travel from ${fromName}.`}
        </Text>
        <Text style={styles.footerCaveat}>
          {/* arb97 — the map is a hand-illustrated REFERENCE only; no player
              marker is drawn on it (removed OTA-182). The footer text above
              carries your location/bearings; this line is just the gesture
              hint. */}
          Drag to pan · pinch to zoom · double-tap to reset. {showingOutpost ? 'Your outpost interior.' : 'A reference map of the buried world.'}
        </Text>
      </View>

      {/* OTA-171 — TRAVEL TO panel. One-tap routing from the MAP
          screen: tap any place row → setTravelCourse fires + screen
          flips to exploration + travel starts. No confirm modal
          (player explicitly asked: "I don't want to copy the text
          I want to be able to push to route automatically"). Hub
          gate handled inline — if the player is inside an outpost
          room (player.hubRoomId set), setTravelCourse would refuse
          mid-stride, so we surface a brief Arbiter hint and skip
          the screen swap. The Lore→Places tab still works as the
          info / confirm path; this just gives a fast alternative
          one tap from the home screen's MAP button. */}
      <View style={styles.placesPanel}>
        <Text style={styles.placesPanelTitle}>TRAVEL TO ▸ tap a place</Text>
        <ScrollView
          style={styles.placesScroll}
          contentContainerStyle={styles.placesContent}
        >
          {placesView.map((p) => {
            const isHere = player?.currentLocationId === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.placeRow, isHere && styles.placeRowHere]}
                activeOpacity={isHere ? 1 : 0.7}
                disabled={isHere}
                onPress={() => {
                  if (!player) return;
                  if (player.hubRoomId) {
                    appendLog(
                      'arbiter',
                      `The Arbiter steadies you. "Leave the outpost first — tap LEAVE OUTPOST or type 'leave outpost'. Then we can set course for ${p.name}."`,
                    );
                    return;
                  }
                  setTravelCourse(p.id);
                  setScreen('exploration');
                }}
              >
                <View style={styles.placeRowLeft}>
                  <Text style={[styles.placeName, isHere && styles.placeNameHere]}>
                    {p.name}
                    {OUTPOST_NAME_BY_LOCATION[p.id]
                      ? `  (${OUTPOST_NAME_BY_LOCATION[p.id]})`
                      : ''}
                  </Text>
                  <Text style={styles.placeType}>
                    {OUTPOST_NAME_BY_LOCATION[p.id] ? 'faction outpost' : p.type}
                  </Text>
                </View>
                <View style={styles.placeRowRight}>
                  {isHere ? (
                    <Text style={styles.placeHereTag}>YOU ARE HERE</Text>
                  ) : (
                    <Text style={styles.placeDanger}>
                      Danger {p.danger}/5
                    </Text>
                  )}
                  {!isHere && (
                    <Text style={styles.placeArrow}>▸</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
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
  footerNear: { color: '#cdbf99', fontSize: 11, marginTop: 2, lineHeight: 15 },
  footerDist: { color: '#cdbf99', fontSize: 11, marginTop: 4 },
  footerCaveat: { color: '#c9a86a', fontSize: 9, fontStyle: 'italic', marginTop: 8, lineHeight: 13 },
  // OTA-171 — Places panel at the bottom of MapScreen. Scrollable
  // capped height so the panel doesn't push the atlas image off-
  // screen on smaller phones.
  placesPanel: {
    marginTop: 8,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingTop: 8,
    paddingBottom: 4,
    maxHeight: 280,
  },
  placesPanelTitle: {
    color: '#c9a86a',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  placesScroll: { flexGrow: 0 },
  placesContent: { paddingHorizontal: 6, paddingBottom: 6 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  placeRowHere: { borderColor: '#e07a5f', backgroundColor: '#241612' },
  placeRowLeft: { flex: 1, minWidth: 0 },
  placeRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  placeName: { color: '#e6d8b3', fontSize: 13, fontWeight: '600' },
  placeNameHere: { color: '#e07a5f' },
  placeType: { color: '#7a705c', fontSize: 10, marginTop: 1 },
  placeDanger: { color: '#cdbf99', fontSize: 10, letterSpacing: 0.5 },
  placeHereTag: { color: '#e07a5f', fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  placeArrow: { color: '#c9a86a', fontSize: 16, fontWeight: '700' },
});
