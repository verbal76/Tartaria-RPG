/**
 * app/state/playerGrid.ts — WHERE THE PLAYER IS, once.
 *
 * OTA-1398 (slice 7 of the gameStore split). The player's authoritative absolute
 * cell on the canon grid. Every movement and distance path funnels through it so
 * there is ONE source of truth for "where the player is" — which is exactly why
 * it could not stay in a file the narration path is forbidden to import.
 *
 * ⚠ MOVED DOWN, LIKE THE SPRINT DETECTOR. `introPrefetchCandidates` (narration)
 * needs it to decide which neighbouring locations are worth pre-generating a
 * scene intro for, and twenty-four call sites in gameStore need it too. A leaf
 * both import is the only arrangement where neither has to reach into the other.
 *
 * ⚠ It was already pure — a read of the player record plus two map helpers that
 * were themselves already leaf imports — so this is a relocation with nothing
 * to decide. The alternative (leaving it and keeping `introPrefetchCandidates`
 * behind in the store) would have split the intro bank from the code that fills
 * it, for no reason but the address of one helper.
 */
import type { PlayerCharacter } from '../engine/types';
import { canonicalCellOf, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../engine/worldMap';

// arb47 — the player's authoritative ABSOLUTE cell on the canon grid. Reads the
// persistent gridX/gridY when present; falls back (legacy saves / first load
// before backfill) to the current location's canon cell plus the re-centered
// in-transit offset so old behaviour still resolves. Every movement/distance path
// funnels through this so there is ONE source of truth for "where the player is".
// OTA-1347 — exported: the map marker anchors to THIS read now (owner log: walked
// six tiles east and the marker stayed on Iskan-Veil — it was anchored to the
// LOCATION's cell, not the player's).
export function playerGridCell(player: PlayerCharacter): { x: number; y: number } {
  if (typeof player.gridX === 'number' && typeof player.gridY === 'number') {
    return { x: player.gridX, y: player.gridY };
  }
  const cur = canonicalCellOf(player.currentLocationId);
  return {
    x: cur.x + ((player.mapX ?? WORLD_MAP_CENTER_X) - WORLD_MAP_CENTER_X),
    y: cur.y + ((player.mapY ?? WORLD_MAP_CENTER_Y) - WORLD_MAP_CENTER_Y),
  };
}
