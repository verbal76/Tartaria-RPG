// ⚠⚠ OTA-1370 — THE CORNER MINI-MAP. Owner: *"while we are in one of the
// outposts, how hard would it be to replace the tartarian emblem in the top
// right corner with a map view that is like the centered on player map view on
// the map screen, and during regular gameplay do the same thing with the world
// map?"*
//
// It replaces the CREST TILE ONLY. The ⚑ WORLD and ◈ LORE buttons stay
// bracketing it, and combat still flips the whole right column to the
// EnemyPanel exactly as before — the owner asked for both explicitly. So this
// component never has to think about combat: it is simply not mounted then.
//
// ⚠⚠ THE SQUARE IS A VIEWPORT, NOT A CANVAS. Owner: *"do we just have to use
// the square as a viewport to a map rendered underneath?"* — yes, and that is
// what this is. The tile is drawn LARGER than the box and slid so the player's
// fraction sits at the centre; `overflow: hidden` does the rest. Nothing is
// shrunk to fit, which is why a room is legible in a 130pt box at all.
//
// ⚠ React Native cannot punch a hole through the UI onto a surface rendered
// somewhere else — there is no portal-to-a-hole compositing — so the art lives
// inside this component's own subtree, which is the only thing RN clips
// cheaply. Functionally identical to a shared map underneath; do not try to
// build the other one.
//
// ⚠⚠ AND IT DRAWS THE DOWNSCALED TILES, NOT THE REAL ART. See
// scripts/make-minimap-assets.mjs. The Atlas loads 1254×1254 originals and can
// afford to: it is a screen you open, read and leave. This is on the screen the
// player never leaves, so whatever it holds is resident all session — and the
// freeze this game has been chasing (B9) was an out-of-memory kill. Clipping
// saves nothing (the whole decoded bitmap is resident however little shows), so
// the saving has to come from the source: ~1.0MB decoded instead of ~6.0MB.

import React, { useMemo } from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useGameStore, playerGridCell } from '../state/gameStore';
import { hubRoomFor, hubSkinFactionFor } from '../engine/hub';
import { getBuildingRoom } from '../engine/buildings';
import { buildingMap } from '../engine/buildingMaps';
import { outpostRoomMark } from '../engine/outpostRoomMarks';
import { worldMarkerFraction, viewportOffset, type MapFrac } from '../engine/mapFraction';

/** ⚠ The downscaled tiles — NOT assets/outposts/ and NOT assets/world-atlas.png.
 *  Regenerate with `node scripts/make-minimap-assets.mjs` after any art change. */
const WORLD_TILE = require('../../assets/minimap/world.png');
const OUTPOST_TILES: Record<string, number> = {
  mud_monarchs: require('../../assets/minimap/mud_monarchs.png'),
  eternal_dynasty: require('../../assets/minimap/eternal_dynasty.png'),
  forgotten_order: require('../../assets/minimap/forgotten_order.png'),
  reclaimers_guild: require('../../assets/minimap/reclaimers_guild.png'),
  true_tartarians: require('../../assets/minimap/true_tartarians.png'),
  tartarian_revivalists: require('../../assets/minimap/tartarian_revivalists.png'),
  conspiracy_architects: require('../../assets/minimap/conspiracy_architects.png'),
  stone_builders: require('../../assets/minimap/stone_builders.png'),
  servants_of_giants: require('../../assets/minimap/servants_of_giants.png'),
};

/** Natural proportions of each tile, so the viewport maths uses the real shape.
 *  The outpost art is square; the world atlas is 1619×971 and would put the
 *  marker in the wrong place if it were treated as one. */
const OUTPOST_ASPECT = 1;
const WORLD_ASPECT = 1619 / 971;

/** ⚠ How far in. Not a look-and-feel number — it decides whether the thing is
 *  useful at all.
 *    · INSIDE: 2.5× puts the current room and the ones adjacent to it in frame,
 *      which is exactly what the direction arrows on the travel chips point at.
 *      Showing the whole floor plan in a 130pt box makes every room ~9pt and
 *      tells the player nothing.
 *    · OUTSIDE: 4×, because the atlas is far denser and the useful question out
 *      there is "what is near me", not "where is the coastline". */
const OUTPOST_ZOOM = 2.5;
const WORLD_ZOOM = 4;

export function MiniMap({ onPress }: { onPress?: () => void }) {
  const player = useGameStore((s) => s.player);
  const buildingId = useGameStore((s) => s.activeBuildingId);
  const buildingRoomId = useGameStore((s) => s.activeBuildingRoomId);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);

  const view = useMemo((): {
    src: number; frac: MapFrac; aspect: number; zoom: number; label: string;
  } | null => {
    if (!player) return null;
    // ── inside an outpost ────────────────────────────────────────────────────
    if (player.hubRoomId) {
      const skin = hubSkinFactionFor(player.currentLocationId, player.factionId);
      const room = hubRoomFor(player.hubRoomId, skin);
      // ⚠ The ART is keyed by the player's OWN faction (that is how the Atlas
      // picks it too — see MapScreen's `artFactionId`), while the room NAMES
      // come from the skin the location wears. Keeping those two apart is why
      // a guest in someone else's outpost still sees their own map art.
      const art = (player.factionId && OUTPOST_TILES[player.factionId]) || OUTPOST_TILES.reclaimers_guild!;
      if (room?.structuralId) {
        return {
          src: art,
          frac: outpostRoomMark(player.factionId, room.structuralId),
          aspect: OUTPOST_ASPECT,
          zoom: OUTPOST_ZOOM,
          label: room.name,
        };
      }
    }
    // ── inside the found hall ────────────────────────────────────────────────
    // ⚠⚠ OTA-1428 — the owner asked for this building to use its painting "for
    // both the mini-map like we do the Outpost and for the atlas". It reads the
    // STORE, not the player: building state lives on the store (activeBuildingId
    // / activeBuildingRoomId), unlike hubRoomId which is on the player. Reading
    // it off `player` is the mistake gameStore's own OTA-4452 comment records —
    // "every one of these read 'outdoors' while the player was inside".
    const bmap = buildingMap(buildingId);
    if (bmap && buildingRoomId) {
      const mark = bmap.marks[buildingRoomId];
      const room = getBuildingRoom(buildingId!, buildingRoomId);
      if (mark) {
        return {
          // ⚠ The full-size painting, same asset the atlas uses — there are no
          // downscaled building tiles. If a third gets art this wants the same
          // tiles/ treatment the outposts have.
          src: bmap.art,
          frac: mark,
          aspect: bmap.aspect,
          zoom: OUTPOST_ZOOM,
          label: room?.name ?? 'inside',
        };
      }
    }
    // ── out in the world ─────────────────────────────────────────────────────
    if (!player.currentLocationId) return null;
    const cell = playerGridCell(player);
    return {
      src: WORLD_TILE,
      frac: worldMarkerFraction(cell.x, cell.y),
      aspect: WORLD_ASPECT,
      zoom: WORLD_ZOOM,
      label: 'the wilds',
    };
  }, [player, buildingId, buildingRoomId]);

  const geom = useMemo(() => {
    if (!box || !view) return null;
    // Cover the window at the requested zoom, whichever edge is binding, so the
    // art never leaves a gutter even before the clamp gets involved.
    const coverW = Math.max(box.w, box.h * view.aspect);
    const renderedW = coverW * view.zoom;
    const renderedH = renderedW / view.aspect;
    const { left, top } = viewportOffset(view.frac, renderedW, renderedH, box.w, box.h);
    // ⚠⚠ OTA-1371 — THE MARKER FOLLOWS THE MAP, IT DOES NOT SIT AT THE CENTRE.
    // Owner: *"the mini map doesn't quite line up — when you look at it on the
    // regular map you're centered on the room; when you look in the mini map
    // you're not centered under the room all the time."* Exactly right, and it
    // was mine. The viewport CLAMPS at the edges of the art so a room near the
    // rim does not drag empty space into frame — that part is correct and
    // deliberate — but the dot was drawn at the box centre unconditionally, so
    // the moment the clamp bit, the map stopped moving and the dot stayed put
    // and the two came apart. A marker that is not on your room is worse than
    // no marker: it is a confident wrong answer.
    //
    // The dot's position is the SAME arithmetic that placed the art, read back
    // out: wherever the room's fraction actually landed after clamping. When
    // nothing is clamped this is the exact centre, so the common case is
    // unchanged; at the edges the dot walks off-centre and stays on the room,
    // which is what the Atlas does and what the owner is comparing against.
    return {
      renderedW,
      renderedH,
      left,
      top,
      markerX: left + view.frac.fx * renderedW,
      markerY: top + view.frac.fy * renderedH,
    };
  }, [box, view]);

  const body = (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        // Re-measuring on every frame of a keyboard animation would rebuild the
        // geometry for nothing; only a real size change matters.
        setBox((p) => (p && Math.abs(p.w - width) < 1 && Math.abs(p.h - height) < 1
          ? p : { w: width, h: height }));
      }}
    >
      {view && geom ? (
        <>
          <Image
            source={view.src}
            style={{
              position: 'absolute',
              width: geom.renderedW,
              height: geom.renderedH,
              left: geom.left,
              top: geom.top,
            }}
            // The tile is already the size we want it near; stretching it to the
            // computed box is the whole point, so no contain/cover here.
            resizeMode="stretch"
            fadeDuration={0}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          {/* ⚠ The marker is DRAWN, not an image. assets/player-marker.png is
              2MB, and at 9pt across a bordered dot is indistinguishable from it
              — the same reasoning that downscaled the maps, applied to the one
              thing small enough to skip an asset for entirely.
              ⚠⚠ Positioned from geom, NOT centred — see the note above geom. */}
          <View
            style={[styles.markerRing, {
              left: geom.markerX - RING / 2,
              top: geom.markerY - RING / 2,
            }]}
            pointerEvents="none"
          />
          <View
            style={[styles.markerDot, {
              left: geom.markerX - DOT / 2,
              top: geom.markerY - DOT / 2,
            }]}
            pointerEvents="none"
          />
        </>
      ) : (
        <Text style={styles.blank}>◈</Text>
      )}
    </View>
  );

  if (!onPress) return body;
  return (
    <TouchableOpacity
      style={styles.press}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={view ? `Map. You are at ${view.label}. Opens the atlas.` : 'Map'}
    >
      {body}
    </TouchableOpacity>
  );
}

const DOT = 9;
const RING = 19;

const styles = StyleSheet.create({
  press: { flex: 1 },
  wrap: {
    flex: 1,
    backgroundColor: '#0d0b09',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    // ⚠ THE VIEWPORT. Without this the art spills over the whole screen.
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A ring under the dot so the marker reads against both the pale stone of an
  // outpost floor and the dark silt of the atlas.
  markerRing: {
    position: 'absolute',
    width: RING, height: RING, borderRadius: RING / 2,
    borderWidth: 1, borderColor: 'rgba(201,168,106,0.55)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  markerDot: {
    position: 'absolute',
    width: DOT, height: DOT, borderRadius: DOT / 2,
    backgroundColor: '#e8dcc0',
    borderWidth: 1, borderColor: '#4a3f2f',
  },
  blank: { color: '#3a342c', fontSize: 22 },
});
