import type { SaveState, VisitedRoom, WorldMemory } from './types';

// OTA-395/396 — slot-blob size guard (the save-loss root cause).
//
// AsyncStorage on Android reads a value back through a SQLite cursor window; a
// slot blob larger than that comes back TRUNCATED, so saveSlot's verify step
// (`staged !== payload`) fails and the save silently never lands ("staged save
// did not verify (truncated or storage full)").
//
// OTA-395 trimmed visitedRooms but engaged on a too-loose CHARACTER budget — the
// real limit is BYTES, and the narration is full of multi-byte glyphs (— ' ✦),
// so a blob under the char budget can still be over the byte window. OTA-396:
//  - engage on a tighter budget;
//  - shed PROGRESSIVELY (cheapest-to-lose first): regenerable per-room lore
//    tables → oldest rooms → old narrative memos → the saved live scene (load
//    falls back to beginScene) — until it fits;
//  - and `saveSizeBreakdown` reports per-part byte sizes so a failure log names
//    the culprit instead of us guessing.
//
// Only kicks in when over budget, so a normal-size save is unchanged, and only
// the SAVED blob is trimmed — in-memory/session state is untouched.

/** Budget for the saved blob (characters). Deliberately conservative so the
 *  UTF-8 byte size stays well under the readback window even with heavy
 *  multi-byte text. */
export const SAFE_BLOB_CHARS = 800_000;

/** Accurate UTF-8 byte length (for diagnostics). Prefers native TextEncoder;
 *  falls back to a manual counter. */
export function utf8ByteLength(s: string): number {
  const TE = (globalThis as { TextEncoder?: new () => { encode: (x: string) => { length: number } } }).TextEncoder;
  if (TE) {
    try { return new TE().encode(s).length; } catch { /* fall through */ }
  }
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

export interface TrimResult {
  state: SaveState;
  trimmed: boolean;
  charsBefore: number;
  charsAfter: number;
  tablesStripped: number;
  roomsDropped: number;
  memosCapped: boolean;
  sceneDropped: boolean;
}

export function trimSaveStateToFit(state: SaveState, maxChars = SAFE_BLOB_CHARS): TrimResult {
  const charsBefore = JSON.stringify(state).length;
  if (charsBefore <= maxChars) {
    return {
      state, trimmed: false, charsBefore, charsAfter: charsBefore,
      tablesStripped: 0, roomsDropped: 0, memosCapped: false, sceneDropped: false,
    };
  }

  const wm: WorldMemory = state.worldMemory ?? ({} as WorldMemory);
  const rooms: Record<string, VisitedRoom> = { ...(wm.visitedRooms ?? {}) };
  let next: SaveState = { ...state, worldMemory: { ...wm, visitedRooms: rooms } };
  const size = () => JSON.stringify(next).length;

  const oldestFirst = Object.keys(rooms).sort(
    (a, b) => (rooms[a]?.lastVisitAt ?? rooms[a]?.firstVisitAt ?? 0)
      - (rooms[b]?.lastVisitAt ?? rooms[b]?.firstVisitAt ?? 0),
  );

  let tablesStripped = 0;
  let roomsDropped = 0;
  let memosCapped = false;
  let sceneDropped = false;
  const result = (): TrimResult => ({
    state: next, trimmed: true, charsBefore, charsAfter: size(),
    tablesStripped, roomsDropped, memosCapped, sceneDropped,
  });

  // Pass 1 — strip regenerable investigation tables, oldest first (re-seed on
  // re-entry). Keeps all lightweight per-room memory intact.
  for (const k of oldestFirst) {
    if (size() <= maxChars) return result();
    if (rooms[k]?.roomInvestigationTable) {
      const { roomInvestigationTable: _drop, ...rest } = rooms[k]!;
      rooms[k] = rest;
      tablesStripped++;
    }
  }
  if (size() <= maxChars) return result();

  // Pass 2 — drop the oldest rooms outright (re-roll fresh on re-entry), never
  // one that holds player-dropped items.
  for (const k of oldestFirst) {
    if (size() <= maxChars) return result();
    const r = rooms[k];
    if (!r || (r.droppedItems?.length ?? 0) > 0) continue;
    delete rooms[k];
    roomsDropped++;
  }
  if (size() <= maxChars) return result();

  // Pass 3 — cap old narrative memos (the Arbiter only references recent ones).
  next = {
    ...next,
    worldMemory: {
      ...next.worldMemory,
      memorableEvents: (next.worldMemory.memorableEvents ?? []).slice(-40),
      chainMemos: (next.worldMemory.chainMemos ?? []).slice(-40),
    },
  };
  memosCapped = true;
  if (size() <= maxChars) return result();

  // Pass 4 (last resort) — drop the saved live scene. On load this falls back to
  // beginScene(), so the player resumes at their location with a fresh scene
  // rather than losing the whole save.
  if (next.currentScene != null) {
    next = { ...next, currentScene: undefined };
    sceneDropped = true;
  }
  return result();
}

/** Per-part byte breakdown for a failure log — names exactly what's oversized. */
export function saveSizeBreakdown(state: SaveState): string {
  const kb = (o: unknown) => Math.round(utf8ByteLength(JSON.stringify(o ?? null)) / 1024);
  const wm = (state.worldMemory ?? {}) as WorldMemory;
  return `persist sizes(KB): total=${kb(state)} player=${kb(state.player)} `
    + `wm=${kb(wm)}[rooms=${kb(wm.visitedRooms)} events=${kb(wm.memorableEvents)} `
    + `memos=${kb(wm.chainMemos)} npcs=${kb(wm.npcsMet)} defeated=${kb(wm.defeatedEnemies)} `
    + `tags=${kb(wm.tagCounts)} discovered=${kb(wm.discoveredLocationIds)}] `
    + `log=${kb(state.gameLog)} scene=${kb(state.currentScene)}`;
}
