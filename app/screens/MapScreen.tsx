// OTA 049 — Atlas map screen. Renders the hand-illustrated world
// atlas (assets/world-atlas.png) with a "you are here" dot anchored
// to the player's procedural grid position relative to the
// Reclaimers' Outpost ring at the image's center.
//
// Reality check on the dot:
//   The atlas image depicts a CANONICAL geography (Asgardar to the
//   east, Mud Seas to the south, Varakush to the southeast). The
//   engine's per-character procedural grid SHUFFLES the cardinal
//   positions of individual locations — two characters get two
//   different layouts. The dot therefore represents the player's
//   true grid offset from the Outpost (mapX-10, mapY-10), NOT
//   "the player is on Asgardar tile." Use the rings for distance,
//   the named features for direction-of-travel intuition.
//
// Calibration:
//   Image is laid out with resizeMode='contain'. The Outpost ring
//   sits at approximately (50%, 38%) of the image's pixel area
//   (measured visually from the rendered atlas). One grid tile is
//   roughly 2.6% of the image's narrower dimension — calibrated so
//   the Danger 4 ring (8-16 tile radius) falls inside the "Middle
//   Rim" band drawn on the atlas. Tweak DOT_TILE_FRAC if a
//   playtester says the dot is off.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../engine/worldMap';

// Atlas anchor points, as fractions of the rendered image box.
// Outpost ring center sits a bit above middle on the portrait image.
const OUTPOST_FRAC_X = 0.50;
const OUTPOST_FRAC_Y = 0.385;
// One grid tile as a fraction of the image's height (the rings span
// vertically ~38% from outpost center to Deep Frontier edge, covering
// 19 tiles of max radius, so each tile is ~2% of image height).
const DOT_TILE_FRAC = 0.02;

export function MapScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);

  const [imgBox, setImgBox] = React.useState<{ width: number; height: number } | null>(null);

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No character loaded.</Text>
      </View>
    );
  }

  const mapX = typeof player.mapX === 'number' ? player.mapX : WORLD_MAP_CENTER_X;
  const mapY = typeof player.mapY === 'number' ? player.mapY : WORLD_MAP_CENTER_Y;
  // dx/dy in tiles from the Outpost (center of grid).
  const dx = mapX - WORLD_MAP_CENTER_X;
  const dy = mapY - WORLD_MAP_CENTER_Y;
  const tiles = Math.abs(dx) + Math.abs(dy);
  // Cardinal hint for the chip below the map.
  const cardinal =
    dx === 0 && dy === 0 ? 'at the Outpost' :
    Math.abs(dx) >= Math.abs(dy)
      ? `${Math.abs(dx)} tile${Math.abs(dx) === 1 ? '' : 's'} ${dx >= 0 ? 'east' : 'west'} of the Outpost`
      : `${Math.abs(dy)} tile${Math.abs(dy) === 1 ? '' : 's'} ${dy >= 0 ? 'south' : 'north'} of the Outpost`;

  // Translate dx/dy into an absolute pixel offset over the rendered image box.
  // The image box dimensions arrive via onLayout; until then, hide the dot.
  let dotStyle: { left: number; top: number } | null = null;
  if (imgBox) {
    const cx = imgBox.width * OUTPOST_FRAC_X;
    const cy = imgBox.height * OUTPOST_FRAC_Y;
    // Tile spacing is keyed off the image height (portrait), so the
    // dot doesn't get squashed sideways when the image is letterboxed
    // by resizeMode='contain'.
    const tile = imgBox.height * DOT_TILE_FRAC;
    dotStyle = {
      left: cx + dx * tile - DOT_SIZE / 2,
      top: cy + dy * tile - DOT_SIZE / 2,
    };
  }

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
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        maximumZoomScale={3}
        minimumZoomScale={1}
        bouncesZoom
      >
        <View
          style={styles.imageBox}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setImgBox({ width, height });
          }}
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
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerHere}>● YOU ARE HERE</Text>
        <Text style={styles.footerWhere}>{cardinal}</Text>
        <Text style={styles.footerDist}>
          {tiles === 0 ? 'At the Outpost.' : `${tiles} day${tiles === 1 ? '' : 's'} of travel from the Outpost.`}
        </Text>
        <Text style={styles.footerCaveat}>
          Terrain rotates per character. The dot tracks your true grid offset; named features show canon directions, not your save's.
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
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },

  imageBox: {
    width: '100%',
    aspectRatio: 1536 / 2752, // matches assets/world-atlas.png (1536 × 2752)
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
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
    marginTop: 10,
    paddingHorizontal: 4,
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
