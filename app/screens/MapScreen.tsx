// The Atlas screen. Renders the commissioned world artwork (assets/world-atlas.png,
// 1619×971 — dimensions owned by engine/atlasCoords) with pinch-zoom + pan gestures, and
// draws every overlay the map has: 37 solved place-name labels (engine/atlasLabels), the
// Hidden Market's reveal-gated "?", the "?"/"✕" grid-event glyphs, and the "◆" contract
// pins. Below the art: a verbal "where you are" footer (the map deliberately has NO player
// marker — OTA-182, owner: "let the map just be a map") and the tap-to-travel places list.
//
// Gesture model (RN Animated + PanResponder, no extra native dependency):
//   - 1 finger drag → pan · 2 finger pinch → zoom · double-tap → reset
//   - MIN_SCALE floors shrink; no zoom-in cap (player request, OTA 060)
//
// ⚠ OTA-1334 SCRUB — this file used to carry the player-dot positioning chain
// (cardinalOffsetFromAnchor drift, hub-minimap inset coords, a dotStyle computed every
// render). The dot was removed at OTA-182; the chain kept computing into nothing for
// fifty more OTAs and died with the old-map scrub. See engine/atlasCoords for the note.

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
import { FirstTimeHint } from '../components/FirstTimeHint';
// OTA-171 — Location + locationsData are already imported below for
// the existing LOCATIONS const; reused here for the Places list
// panel so a player can tap any known location and start travel
// without digging through Lore.
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y, cellToAtlasFraction, canonicalCellFor } from '../engine/worldMap';
import {
  atlasCoordForLocation,
  LOCATION_ATLAS_COORDS,
  ATLAS_PIXEL_W,
  ATLAS_PIXEL_H,
} from '../engine/atlasCoords';
import {
  atlasLabelLayout, atlasVisualFraction,
  LABEL_FONT_PX, LABEL_LINE_PX, LABEL_BOX_SAFETY,
} from '../engine/atlasLabels';
import { revealedLocationName, isLocationRevealed, isHiddenLocation, HIDDEN_LOCATIONS } from '../engine/hiddenLocations';
import { questionMarkerNumbers } from '../engine/questionMarkers';
import { openContractMarkers, type ContractFamily } from '../engine/contractMarkers';
import { LOCATION_TO_MACRO } from '../engine/worldLadder';
import { isHubLocation, hubRoomFor, hubNameForFaction, hubSkinFactionFor } from '../engine/hub';
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

// arb139 — human "what is this" label for a contract pin's family, shown under the
// contract's name in the TRAVEL TO list so a "◆N" route row reads what it routes to.
const CONTRACT_FAMILY_LABEL: Record<ContractFamily, string> = {
  hunt: 'active hunt',
  mystery: 'mystery',
  storyline: 'faction storyline',
  faction: 'faction quest',
  lead: 'lead',
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

// Atlas asset's pixel dimensions — used to compute the letterboxed image rect inside the
// flex-filled imageBox.
//
// ⚠⚠ OTA-1335 — THESE ARE NO LONGER TYPED OUT HERE. They used to be two local literals with
// a comment saying they "MUST match the live asset's real dimensions" — a rule with nothing
// enforcing it, on an asset that has now been replaced twice (1408×768 → 1774×887 →
// 1619×971). A stale ratio does not throw; it silently slides every marker off the landmark
// it is meant to be standing on. One exported number now, owned by the module that owns the
// coordinate system.
const ATLAS_W = ATLAS_PIXEL_W;
const ATLAS_H = ATLAS_PIXEL_H;

// Solved once at module load — the catalogue cannot change at runtime, so re-running the
// placement solver on every render would be pure waste.
const ATLAS_LABELS = atlasLabelLayout();

// ⚠⚠ PINS MUST MOVE WITH THE NAMES. The overlay nudges a place's DRAWN position onto its
// painted silhouette (see atlasLabels.ts for why the artwork and the data disagree). If the
// "?" and "◆" markers kept using the raw grid position, a contract pin would sit up to a
// tile away from the very name it belongs to — two marks for one place, in two places.
//
// Event and contract markers are keyed by CELL, not by location id, so this reverses the
// mapping once at module load: canonical cell → the location that owns it. A cell with no
// owner (a whisper target born at an arbitrary spot) simply falls through to the grid
// position, which is correct — there is no silhouette for it to sit on.
const CELL_TO_LOCATION: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const id of Object.keys(LOCATION_ATLAS_COORDS)) {
    const c = canonicalCellFor(id);
    m[`${c.x},${c.y}`] = id;
  }
  return m;
})();

/** Where a marker at this cell should be DRAWN. Never used for distance or routing. */
function markerFraction(x: number, y: number): { fx: number; fy: number } {
  const id = CELL_TO_LOCATION[`${x},${y}`];
  if (id) {
    const a = LOCATION_ATLAS_COORDS[id]!;
    return atlasVisualFraction(id, a.fx, a.fy);
  }
  return cellToAtlasFraction(x, y);
}

// ⚠⚠ THE LEGEND INSET IS GONE, AND DELETING IT WAS MANDATORY — NOT A TIDY-UP.
//
// arb102 added `ATLAS_LEGEND_FRAC = 10/92`, which squeezed every overlay marker rightwards
// so no pin landed on the "TARTARIA" title cartouche painted down the left edge of the
// previous artwork. Correct then. The redrawn atlas has no cartouche — the spec that
// commissioned it says so in as many words: no legend, no title, no text of any kind
// anywhere in the image. Leaving the inset in would have shifted every marker on the map
// EAST by 10.9% of the map width — 176 px on a 1619-wide canvas, roughly four grid tiles.
//
// Nothing would have thrown. Every pin would simply have been in the wrong place, on the one
// screen whose entire job is telling the player where things are: the kind of defect that
// ships, gets reported as "the map feels off", and takes a week to trace. Marker fractions
// are now used raw, exactly as `cellToAtlasFraction` computes them.

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
  // OTA-616 — turn a contract in directly from the map when you're standing on
  // its anchor (the route row would otherwise just grey out).
  const completeContractFromUI = useGameStore((s) => s.completeContractFromUI);
  // OTA-498 — discovered-location set drives the Hidden Market "?" reveal: the
  // travel-list row + the map overlay both show "?" until the id is in here.
  const discoveredIds = useGameStore((s) => s.worldMemory?.discoveredLocationIds);
  // OTA-502 — dynamically-canonized places (whisper/contract/mission mentions) are
  // routable too: fold them into the travel list as ordinary rows.
  const canonLocations = useGameStore((s) => s.worldMemory?.canonLocations);
  // OTA-171 — Places list sorted with the current location pinned at
  // the top so the player can see where they are at a glance, then
  // by danger ascending (safer trips first) so the easiest
  // destinations are visible without scrolling.
  const placesView = useMemo(() => {
    const known = new Set(LOCATIONS.map((l) => l.id));
    const extras = (canonLocations ?? [])
      .filter((c) => !known.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, type: c.type ?? 'site', danger: c.danger ?? 2 } as typeof LOCATIONS[number]));
    const all = [...LOCATIONS, ...extras];
    const here = player?.currentLocationId;
    return [...all].sort((a, b) => {
      if (a.id === here && b.id !== here) return -1;
      if (b.id === here && a.id !== here) return 1;
      if (a.danger !== b.danger) return a.danger - b.danger;
      return a.name.localeCompare(b.name);
    });
  }, [player?.currentLocationId, canonLocations]);

  // arb99 — ascending numbers for the "?" places (unrevealed hidden locations +
  // pending grid events). Only assigned when more than one "?" exists, so a single
  // unknown stays a plain "?". The map overlay AND the travel rows read this map,
  // so a mark like "2?" and its route row carry the same number.
  const questionNumbers = useMemo(
    () => questionMarkerNumbers({ discoveredLocationIds: discoveredIds, canonLocations }),
    [discoveredIds, canonLocations],
  );
  // arb100 — open contracts plotted as distinct numbered "◆" pins (derived live
  // from the player's open-contract lists, so they back-populate + clear on their
  // own). Numbered in Contracts-screen order; the cards carry the same number.
  const contractMarkers = useMemo(() => openContractMarkers(player), [player]);

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

  // OTA 056/060 — fill-height-by-default. The atlas art is landscape but the available
  // window is portrait on phones; resizeMode='contain' alone leaves half the box empty
  // above/below, so the baseline scale fills the height. (This comment used to also
  // describe auto-centering on the player marker — the marker is gone, OTA-182.)
  const baselineScale = useRef(1);

  // The footer's "N tiles east of X" line needs the player's local grid offset; that is
  // ALL mapX/mapY feeds on this screen since the marker's removal (OTA-182).
  const safeMapX = typeof player?.mapX === 'number' ? player.mapX : WORLD_MAP_CENTER_X;
  const safeMapY = typeof player?.mapY === 'number' ? player.mapY : WORLD_MAP_CENTER_Y;
  const inHub = isHubLocation(player?.currentLocationId) && !!player?.hubRoomId;
  // arb99 — pick the map for where you are. Inside an outpost whose interior
  // art exists → that faction's outpost map (square); otherwise the world atlas.
  // mapAspect drives the fill/letterbox math below.
  const outpostMapSource = inHub && player?.factionId ? OUTPOST_MAPS[player.factionId] : undefined;
  const showingOutpost = !!outpostMapSource;
  const mapSource = outpostMapSource ?? WORLD_ATLAS;
  const mapAspect = showingOutpost ? 1 : ATLAS_W / ATLAS_H;
  const atCenter =
    safeMapX === WORLD_MAP_CENTER_X && safeMapY === WORLD_MAP_CENTER_Y;

  // ⚠ OTA-1334 SCRUB — two blocks died here: the OTA 23-003/035 auto-focus-the-hub-inset
  // effect (it panned to a bottom-left minimap inset that exists only on the ORIGINAL
  // hand-drawn art; every faction has had a full-screen interior map since arb106, so its
  // guard could only pass for a hub player with no factionId — and then it would zoom into
  // blank terrain), and the dotStyle the removed player marker used to need.
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

  // ⚠⚠ OTA-1340 — THE PLAYER MARKER RETURNS, AND THE REASON IT CAN. OTA-182 removed
  // the old dot at the owner's request ("we were never able to make it accurate so
  // let's let the map just be a map") — that dot walked a per-tile drift model that
  // disagreed with the hand-painted art. The map makeover ended the disagreement:
  // there is ONE coordinate system now (canonicalCellFor derives cells FROM the
  // atlas fractions, and markerFraction re-applies the by-eye visual nudges), so
  // the marker lands on the same silhouette the label and the pins do. Owner, from
  // live testing at Iskan-Veil: *"where is the you are here explorer icon? it
  // should be pulsating between white and green. there should also be a center on
  // character button next to reset."* Both here.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const pulseInv = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  /** The rendered (letterboxed) image rect inside the box — same contain-fit math
   *  the overlay block uses; shared so CENTER and the marker can never disagree. */
  const renderedRectFor = (box: { width: number; height: number }) => {
    const boxAspect = box.width / box.height;
    if (boxAspect > mapAspect) {
      const h = box.height; const w = box.height * mapAspect;
      return { renderedW: w, renderedH: h, offsetX: (box.width - w) / 2, offsetY: 0 };
    }
    const w = box.width; const h = box.width / mapAspect;
    return { renderedW: w, renderedH: h, offsetX: 0, offsetY: (box.height - h) / 2 };
  };

  const centerOnPlayer = (frac: { fx: number; fy: number } | null) => {
    if (!imgBox || !frac) return;
    const r = renderedRectFor(imgBox);
    // Keep the player's zoom if they are already in close; from the full view,
    // come in far enough that "centered" visibly means something.
    const s = Math.max(scaleRef.current, baselineScale.current * 2.2);
    // The scaled layer transforms about the box center: screen = center + t + s·(p − center),
    // so putting the marker AT the center solves to t = −s·(p − center).
    const mx = r.offsetX + r.renderedW * frac.fx;
    const my = r.offsetY + r.renderedH * frac.fy;
    const target = clampTranslate(
      -s * (mx - imgBox.width / 2),
      -s * (my - imgBox.height / 2),
      s,
      imgBox,
    );
    Animated.parallel([
      Animated.spring(scale, { toValue: s, useNativeDriver: true, friction: 7, tension: 80 }),
      Animated.spring(translateX, { toValue: target.tx, useNativeDriver: true, friction: 7, tension: 80 }),
      Animated.spring(translateY, { toValue: target.ty, useNativeDriver: true, friction: 7, tension: 80 }),
    ]).start(() => {
      scaleRef.current = s;
      txRef.current = target.tx;
      tyRef.current = target.ty;
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

  const currentLocation = LOCATIONS.find((l) => l.id === player.currentLocationId) ?? null;
  const onDepictedTile = !!atlasCoordForLocation(player.currentLocationId);

  // OTA-498 — Hidden Market overlay position (a static "?" / name pinned to its
  // fixed atlas coord; unlike the removed player marker this never drifts).
  let hiddenMarketStyle: { left: number; top: number } | null = null;
  const hiddenMarketRevealed = isLocationRevealed('hidden_market', discoveredIds);
  // OTA-505 — grid-event markers: a yellow "?" at every PENDING event cell, a red
  // "X" at every DONE one. Positioned by converting each event's canonical cell
  // back to its atlas fraction (cellToAtlasFraction), same letterbox math as above.
  const eventMarkerStyles: { id: string; left: number; top: number; kind: 'pending' | 'done' }[] = [];
  // arb100 — open-contract pins (distinct teal "◆" glyph). AGGREGATED per cell:
  // contracts that share an anchor (faction quests on a home outpost, hunts on a
  // biome anchor) collapse into ONE pin showing a count ("◆×4"); a lone contract
  // shows its number ("3◆"). Keeps the map uncluttered — the per-contract numbers
  // live on the Contracts cards.
  const contractMarkerStyles: { key: string; label: string; left: number; top: number }[] = [];
  // OTA-1335 — resolved place-name labels for the new (lettering-free) atlas art.
  const nameLabelStyles: { id: string; lines: string[]; left: number; top: number; width: number }[] = [];
  // OTA-1340 — the "you are here" marker: the current location's cell through the
  // SAME markerFraction every pin uses, so it stands on the nudged silhouette.
  let playerMarkerBox: { left: number; top: number; size: number } | null = null;
  let playerFrac: { fx: number; fy: number } | null = null;
  // arb101 — overlay-label scale. The atlas's own painted labels shrink with the
  // contain-fit; a constant-size overlay would dwarf them. labelScale = rendered
  // width ÷ atlas natural width keeps overlay text proportional to the art at the
  // base zoom (and it still scales with pinch since it lives in the scaled layer).
  let labelScale = 1;
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
    // arb101 — how much the atlas art was shrunk to fit; overlay labels multiply
    // their base size by this so they read at the same scale as the painted text.
    labelScale = renderedW / ATLAS_W;
    // OTA-498 — pin the Hidden Market overlay to its fixed atlas fraction (world
    // atlas only). Centered on the point via the fixed wrap size.
    const hm = showingOutpost ? null : HIDDEN_LOCATIONS.hidden_market;
    if (hm) {
      hiddenMarketStyle = {
        left: offsetX + renderedW * hm.fx - HM_LABEL_W / 2,
        top: offsetY + renderedH * hm.fy - HM_LABEL_H / 2,
      };
    }
    // ⚠⚠ OTA-1335 — THE NAME OVERLAY. The redrawn atlas carries NO lettering: every place
    // name a player used to read on this screen was painted into the previous artwork, and
    // the only name the game itself has ever drawn is the Hidden Market's, just above. So
    // without this loop the new map is a beautiful anonymous ruin-field.
    //
    // ⚠ Positions come from `atlasLabelLayout()`, which solves all 37 at once in atlas-pixel
    // space and returns fractions — so a name never lands on another name or on another
    // landmark's pin, and the same layout holds at every zoom on every screen. The Hidden
    // Market is deliberately NOT in that set: it keeps its own reveal-gated "?" → name
    // behaviour, which is a different rule (you have to find it first).
    if (!showingOutpost) {
      for (const l of ATLAS_LABELS) {
        nameLabelStyles.push({
          id: l.id,
          lines: l.lines,
          // ⚠⚠ THE BOX IS DRAWN WIDER THAN THE SOLVED TEXT WIDTH ON PURPOSE. It was drawn at
          // exactly the solved width in the first cut, and because that width came from an
          // UNDER-estimate of the font's real advance, React Native re-wrapped the
          // already-wrapped lines to fit — snapping words in half ("Giant-Wat / ch /
          // Shrine") and turning two-line names into three, which then collided with
          // neighbours the solver believed it had cleared. The slack is transparent and
          // non-interactive; only the solved width governs spacing.
          left: offsetX + renderedW * l.lx - (l.wFrac * LABEL_BOX_SAFETY * renderedW) / 2,
          top: offsetY + renderedH * l.ly - (l.hFrac * renderedH) / 2,
          width: l.wFrac * LABEL_BOX_SAFETY * renderedW,
        });
      }
    }
    if (!showingOutpost) {
      for (const ev of canonLocations ?? []) {
        if (ev.marker !== 'pending' && ev.marker !== 'done') continue;
        const cell = (typeof ev.gx === 'number' && typeof ev.gy === 'number')
          ? { x: ev.gx, y: ev.gy }
          : canonicalCellFor(ev.id);
        const f = markerFraction(cell.x, cell.y);
        eventMarkerStyles.push({
          id: ev.id,
          kind: ev.marker,
          left: offsetX + renderedW * f.fx - HM_LABEL_W / 2,
          top: offsetY + renderedH * f.fy - HM_LABEL_H / 2,
        });
      }
      // arb100 — AGGREGATE contracts by cell into one pin (count when >1, else the
      // lone contract's number). One mark per place keeps the atlas readable.
      const byCell: Record<string, { x: number; y: number; count: number; sole: number }> = {};
      for (const cm of contractMarkers) {
        const cellKey = `${cm.x},${cm.y}`;
        const e = byCell[cellKey];
        if (e) e.count += 1;
        else byCell[cellKey] = { x: cm.x, y: cm.y, count: 1, sole: cm.number };
      }
      for (const [cellKey, v] of Object.entries(byCell)) {
        const f = markerFraction(v.x, v.y);
        contractMarkerStyles.push({
          key: cellKey,
          label: v.count > 1 ? `◆×${v.count}` : `${v.sole}◆`,
          left: offsetX + renderedW * f.fx - HM_LABEL_W / 2,
          top: offsetY + renderedH * f.fy - HM_LABEL_H / 2,
        });
      }
      // ⚠ OTA-1340 — the player marker, LAST so it draws over every other glyph.
      // Anchored to the current location's canonical cell → markerFraction, which
      // is exactly where that location's pin and label sit — the accuracy problem
      // that killed the OTA-182 dot cannot recur, because there is nothing left to
      // disagree: one coordinate system serves label, pin, and marker alike.
      if (player?.currentLocationId) {
        const cell = canonicalCellFor(player.currentLocationId);
        const f = markerFraction(cell.x, cell.y);
        const size = Math.max(9, 40 * labelScale);
        playerFrac = f;
        playerMarkerBox = {
          left: offsetX + renderedW * f.fx - size / 2,
          top: offsetY + renderedH * f.fy - size / 2,
          size,
        };
      }
    }
  }
  // arb102 — every overlay glyph (the "?"/"✕" events, the "◆" contract pins) now
  // scales to the atlas art exactly like the Hidden Market name, so they all read
  // at that same (player-approved) size instead of dwarfing the painted labels.
  const markerFont = { fontSize: Math.max(5, 30 * labelScale), lineHeight: Math.max(6, 33 * labelScale) };

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
    ? hubRoomFor(player?.hubRoomId, hubSkinFactionFor(player?.currentLocationId, player?.factionId))
    : null;
  const hubLabel = inHub
    ? `${hubNameForFaction(hubSkinFactionFor(player?.currentLocationId, player?.factionId))} — ${hubRoomDisplay?.name ?? 'Hub'}`
    : null;
  const whereLine = hubLabel
    ?? (atCenter && currentLocation
      ? currentLocation.name
      : Math.abs(dx) >= Math.abs(dy)
        ? `${Math.abs(dx)} tile${Math.abs(dx) === 1 ? '' : 's'} ${dx >= 0 ? 'east' : 'west'} of ${fromName}`
        : `${Math.abs(dy)} tile${Math.abs(dy) === 1 ? '' : 's'} ${dy >= 0 ? 'south' : 'north'} of ${fromName}`);

  // arb98 — verbal whereabouts. Written when the art carried no marker (OTA-182 →
  // OTA-1340); it stays now the marker is back, because a sentence that names the
  // neighbours is orientation the pulsing dot cannot give. Inside a hub we just
  // name the outpost; out in the world we describe the region + nearest landmarks.
  const whereaboutsLine = inHub
    ? `Inside the ${hubNameForFaction(hubSkinFactionFor(player?.currentLocationId, player?.factionId))} — a fixed outpost interior.`
    : describeWhereabouts(player.currentLocationId, LOCATIONS);

  return (
    <View style={styles.container}>
      <FirstTimeHint
        id="map_first_open"
        title="The map"
        body="Tap a known place to set a course; travel burns stamina and time. Your dot shows where you stand."
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">ATLAS</Text>
        {/* OTA-1340 — jump the view to the pulsing "you are here" marker. Only on
            the world atlas: outpost interiors are single-screen and have no marker. */}
        {!showingOutpost && (
          <TouchableOpacity
            onPress={() => centerOnPlayer(playerFrac)}
            style={styles.resetBtn}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Center the map on your position"
            testID="center-on-player"
          >
            <Text style={styles.resetText}>⌖ ME</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={resetTransform}
          style={styles.resetBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Reset map zoom and position"
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
            accessibilityRole="image"
            accessibilityLabel={showingOutpost ? 'Outpost interior map' : 'World atlas map'}
          />
          {/* ⚠⚠ OTA-1335 — PLACE NAMES. Drawn UNDER every pin and glyph below, on purpose:
              a name is context, a marker is information, and when the two land close
              together the marker has to win. Positions are solved in atlasLabels.ts. */}
          {nameLabelStyles.map((l) => (
            <View
              key={`name_${l.id}`}
              pointerEvents="none"
              style={[styles.nameLabelWrap, { left: l.left, top: l.top, width: l.width }]}
            >
              <Text
                style={[
                  styles.nameLabel,
                  {
                    fontSize: Math.max(3, LABEL_FONT_PX * labelScale),
                    lineHeight: Math.max(3.5, LABEL_LINE_PX * labelScale),
                  },
                ]}
              >
                {l.lines.join('\n')}
              </Text>
            </View>
          ))}
          {/* OTA-498 — the Hidden Market. It has no icon painted into the atlas
              art, so this overlay both marks it and explains the blank: a
              stylized "?" pinned to its fixed coord (right of the frontier camps,
              on the Sunken Middens ring) until the player travels there, then it
              flips to the location's name. A static atlas-anchored label — not the
              drifting player marker that OTA-182 removed. */}
          {hiddenMarketStyle && (
            <View pointerEvents="none" style={[styles.hiddenMarketWrap, hiddenMarketStyle]}>
              {hiddenMarketRevealed ? (
                // arb101 — the resolved NAME is scaled to the atlas art (was a fixed
                // 10px overlay that dwarfed the painted labels + ate a map quadrant).
                <Text
                  style={[
                    styles.hiddenMarketName,
                    // arb104 shrank this to 25.5 on player request, back when it was the ONLY
                    // name the game drew and every other name was painted into the art.
                    // ⚠ OTA-1335 — it now sits among 37 sibling labels, so keeping it at its
                    // old size would leave one name towering over every other place on the
                    // map. It takes the shared type size; only its reveal behaviour is special.
                    { fontSize: Math.max(3, LABEL_FONT_PX * labelScale), lineHeight: Math.max(3.5, LABEL_LINE_PX * labelScale) },
                  ]}
                >
                  The Hidden{'\n'}Market
                </Text>
              ) : (
                <Text style={[styles.hiddenMarketQ, markerFont]}>
                  {questionNumbers.hidden_market ? `${questionNumbers.hidden_market}?` : '?'}
                </Text>
              )}
            </View>
          )}
          {/* OTA-505 — grid-event markers: yellow "?" for a pending whisper/contract
              objective at its cell, red "X" once resolved. No name — travel is the
              list button below. Same atlas-anchored overlay as the Hidden Market. */}
          {eventMarkerStyles.map((m) => (
            <View key={m.id} pointerEvents="none" style={[styles.hiddenMarketWrap, { left: m.left, top: m.top }]}>
              <Text style={[m.kind === 'done' ? styles.eventDoneX : styles.eventPendingQ, markerFont]}>
                {m.kind === 'done' ? '✕' : (questionNumbers[m.id] ? `${questionNumbers[m.id]}?` : '?')}
              </Text>
            </View>
          ))}
          {/* arb100 — open-contract pins: a distinct "◆N" glyph at each contract's
              anchor cell (faction home / biome / lead location), numbered to match
              the matching card + route button in the Contracts screen. */}
          {contractMarkerStyles.map((m) => (
            <View key={m.key} pointerEvents="none" style={[styles.hiddenMarketWrap, { left: m.left, top: m.top }]}>
              <Text style={[styles.contractPin, markerFont]}>{m.label}</Text>
            </View>
          ))}
          {/* ⚠⚠ OTA-1340 — THE "YOU ARE HERE" MARKER, BACK BY OWNER ORDER. OTA-182
              removed the old dot ("we were never able to make it accurate so let's
              let the map just be a map") because its drift model disagreed with the
              painted art. The disagreement is structurally gone — one coordinate
              system serves labels, pins, and this marker (see playerMarkerBox above)
              — and the owner asked for it back from live testing at Iskan-Veil:
              "pulsating between white and green." Two stacked ring-and-dot glyphs
              cross-fade on counterphased opacity (native-driver-safe; RN cannot
              animate borderColor natively). Drawn LAST so it wins every overlap. */}
          {playerMarkerBox && (() => {
            const m = playerMarkerBox;
            const ring = {
              position: 'absolute' as const, left: 0, top: 0, width: m.size, height: m.size,
              borderRadius: m.size / 2, borderWidth: Math.max(1.5, m.size * 0.11),
            };
            const core = {
              position: 'absolute' as const,
              left: m.size * 0.33, top: m.size * 0.33,
              width: m.size * 0.34, height: m.size * 0.34, borderRadius: m.size * 0.17,
            };
            return (
              <View
                pointerEvents="none"
                testID="player-marker"
                style={{ position: 'absolute', left: m.left, top: m.top, width: m.size, height: m.size }}
              >
                <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: m.size, height: m.size, opacity: pulseInv }}>
                  <View style={[ring, styles.playerMarkerWhiteRing]} />
                  <View style={[core, styles.playerMarkerWhiteCore]} />
                </Animated.View>
                <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: m.size, height: m.size, opacity: pulse }}>
                  <View style={[ring, styles.playerMarkerGreenRing]} />
                  <View style={[core, styles.playerMarkerGreenCore]} />
                </Animated.View>
              </View>
            );
          })()}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHere} accessibilityRole="header">WHERE YOU ARE</Text>
        <Text style={styles.footerWhere}>{whereLine}</Text>
        {whereaboutsLine ? (
          <Text style={styles.footerNear}>{whereaboutsLine}</Text>
        ) : null}
        <Text style={styles.footerDist}>
          {inHub
            ? `Inside the ${hubNameForFaction(hubSkinFactionFor(player?.currentLocationId, player?.factionId))}.`
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
        <Text style={styles.placesPanelTitle} accessibilityRole="header">TRAVEL TO ▸ tap a place</Text>
        <ScrollView
          style={styles.placesScroll}
          contentContainerStyle={styles.placesContent}
        >
          {/* arb139 — OPEN-CONTRACT route rows. The atlas plots each open contract as
              a numbered "◆N" pin, but the player had no way to route to one from the
              list ("the diamond markers don't have boxes below to autoroute to them").
              These rows mirror the pins one-for-one — same number, the contract's name,
              and what it is — and route to the contract's anchor on tap. They're DERIVED
              live from openContractMarkers, so a row appears when its pin does and clears
              the instant the contract closes (the "remove it when the complete tag was
              tripped" behavior). Listed individually (not cell-aggregated like the pins)
              so each contract carries its own name + type. */}
          {contractMarkers.length > 0 && (
            <>
              <Text style={styles.contractSectionTitle} accessibilityRole="header">◆ OPEN CONTRACTS</Text>
              {contractMarkers.map((cm) => {
                const info = placesView.find((p) => p.id === cm.anchorId);
                const isHere = player?.currentLocationId === cm.anchorId;
                const anchorName = info?.name ?? cm.label;
                return (
                  <TouchableOpacity
                    key={cm.key}
                    style={[styles.placeRow, styles.contractRow, isHere && styles.placeRowHere]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    onPress={() => {
                      if (!player) return;
                      // OTA-616 — standing on the contract's anchor (its turn-in
                      // counter): tapping turns it in if ready. completeContractFromUI
                      // self-gates — it pays out when complete, or tells you exactly
                      // what's left (stage / items) when not. Leads have no manual
                      // turn-in (they close on the kill out in the world), so hint.
                      if (isHere) {
                        const TURN_IN_KIND: Record<string, 'hunt' | 'mystery' | 'storyline' | 'faction_quest' | undefined> = {
                          hunt: 'hunt',
                          mystery: 'mystery',
                          storyline: 'storyline',
                          faction: 'faction_quest',
                        };
                        const kind = TURN_IN_KIND[cm.family];
                        if (kind) {
                          const contractId = cm.key.slice(cm.family.length + 1);
                          completeContractFromUI(kind, contractId);
                          // Flip to exploration so the reward — or the "not ready,
                          // here's what's left" line — is visible in the feed.
                          setScreen('exploration');
                        } else {
                          appendLog(
                            'arbiter',
                            `The Arbiter nods at the lead. "This one closes when the work is done out there — not at a counter."`,
                          );
                        }
                        return;
                      }
                      if (player.hubRoomId) {
                        appendLog(
                          'arbiter',
                          `The Arbiter steadies you. "Leave the outpost first — tap LEAVE OUTPOST or type 'leave outpost'. Then we can set course for ${anchorName}."`,
                        );
                        return;
                      }
                      setTravelCourse(cm.anchorId);
                      setScreen('exploration');
                    }}
                  >
                    <View style={styles.placeRowLeft}>
                      <Text style={[styles.placeName, isHere && styles.placeNameHere]}>
                        <Text style={styles.contractRowNum}>{cm.number}◆  </Text>
                        {cm.label}
                      </Text>
                      <Text style={styles.placeType}>
                        {CONTRACT_FAMILY_LABEL[cm.family]}
                        {info && info.name !== cm.label ? ` · ${anchorName}` : ''}
                      </Text>
                    </View>
                    <View style={styles.placeRowRight}>
                      {isHere ? (
                        // OTA-616 — on the anchor: leads close in the field (no
                        // counter turn-in), everything else can be turned in here.
                        <Text style={styles.placeHereTag}>
                          {cm.family === 'lead' ? 'YOU ARE HERE' : 'TURN IN ▸'}
                        </Text>
                      ) : (
                        <Text style={styles.placeDanger}>Danger {info?.danger ?? 2}/5</Text>
                      )}
                      {!isHere && <Text style={styles.placeArrow}>▸</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.contractSectionTitle} accessibilityRole="header">ALL PLACES</Text>
            </>
          )}
          {placesView.map((p) => {
            const isHere = player?.currentLocationId === p.id;
            // OTA-498 — a hidden location reads as "?" (routable) until visited.
            const hidden = isHiddenLocation(p.id) && !isLocationRevealed(p.id, discoveredIds);
            const rowName = revealedLocationName(p.id, p.name, discoveredIds);
            // arb99 — if this row is one of the numbered "?" places, lead with the
            // matching number so the route block reads the same mark as the atlas
            // ("2?" on the map → "2?" / "2?  Label" in the list).
            const qNum = questionNumbers[p.id];
            const numberedName = qNum
              ? (rowName === '?' ? `${qNum}?` : `${qNum}?  ${rowName}`)
              : rowName;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.placeRow, isHere && styles.placeRowHere]}
                activeOpacity={isHere ? 1 : 0.7}
                disabled={isHere}
                accessibilityRole="button"
                accessibilityState={{ disabled: isHere }}
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
                    {numberedName}
                    {!hidden && OUTPOST_NAME_BY_LOCATION[p.id]
                      ? `  (${OUTPOST_NAME_BY_LOCATION[p.id]})`
                      : ''}
                  </Text>
                  <Text style={styles.placeType}>
                    {hidden ? 'unknown — travel to reveal' : OUTPOST_NAME_BY_LOCATION[p.id] ? 'faction outpost' : p.type}
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

// OTA-498 — Hidden Market overlay wrap size (centers the "?" / name on the coord).
const HM_LABEL_W = 96;
const HM_LABEL_H = 34;

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
  // OTA-1340 — the marker's two cross-fading liveries. Colors only — geometry is
  // computed inline from the zoom-scaled marker size.
  playerMarkerWhiteRing: { borderColor: '#f2f5ee' },
  playerMarkerWhiteCore: { backgroundColor: '#f2f5ee' },
  playerMarkerGreenRing: { borderColor: '#6fd680' },
  playerMarkerGreenCore: { backgroundColor: '#6fd680' },
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
  resetText: { color: '#a2977b', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80 },

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
  // OTA-1335 — place-name label. Height is intentionally unset: the box is sized by its own
  // text so a two-line name is not clipped, and the solver already reserved room for it.
  nameLabelWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameLabel: {
    // ⚠ Matches the Hidden Market label's palette and weight exactly. That label's size was
    // tuned twice by the owner on the old art, so it is the settled house style for text on
    // this screen — the overlay should read as one set of names, not two.
    color: '#f0d27a',
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    // The art beneath runs from pale silt to near-black, so the shadow is doing real work
    // here: it is what keeps a name legible over both the green north and the molten south.
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // OTA-498 — Hidden Market "?" / name overlay (pinned to its atlas coord).
  hiddenMarketWrap: {
    position: 'absolute',
    width: HM_LABEL_W,
    height: HM_LABEL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenMarketQ: {
    color: '#f0d27a',
    fontSize: 18, // OTA-501 — shrunk ~30% from 26 (player: "?" was too big)
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hiddenMarketName: {
    // arb101 — fontSize/lineHeight are set inline (scaled to the atlas art). Lighter
    // weight + tighter shadow so the label blends with the painted names instead of
    // overpowering them.
    color: '#f0d27a',
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // OTA-505 — grid-event markers. Pending = bright yellow "?"; done = red "✕".
  eventPendingQ: {
    color: '#f7e04a',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  eventDoneX: {
    color: '#e0584a',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // arb100 — open-contract pin: a distinct teal "◆" + number (NOT "?", which means
  // "unknown place"). Sits on an already-named location, so it reads as a marker.
  contractPin: {
    color: '#54d6c4',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  markerImage: {
    width: '100%',
    height: '100%',
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
  placeType: { color: '#a2977b', fontSize: 10, marginTop: 1 },
  placeDanger: { color: '#cdbf99', fontSize: 10, letterSpacing: 0.5 },
  placeHereTag: { color: '#e07a5f', fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  placeArrow: { color: '#c9a86a', fontSize: 16, fontWeight: '700' },
  // arb139 — open-contract route rows: a teal accent to tie them to the "◆" map pins,
  // plus a small section divider above the regular places list.
  contractSectionTitle: {
    color: '#54d6c4',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    paddingHorizontal: 4,
    marginTop: 2,
    marginBottom: 6,
  },
  contractRow: { borderColor: '#2f5a55', backgroundColor: '#15201e' },
  contractRowNum: { color: '#54d6c4', fontWeight: '900' },
});
