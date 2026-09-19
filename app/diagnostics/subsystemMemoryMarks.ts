/* ⚠⚠⚠ OTA-1853 — THE RING KNEW *WHEN*. IT DID NOT KNOW *WHO*.
 *
 * Baker #3's owner-device capture (iPhone SE, 2026-09-19) measured a real
 * memory ratchet — baseline 951 MB, peak 1903 MB, seven retained steps,
 * +675 MB that never came back — and the forensic pass returned OUTCOME C:
 * HOLDER NOT PROVEN. Not for want of samples. The recorder took 504 of them
 * with `evicted 0`, and 98.3% of the footprint sat in the default malloc zone
 * across 4.42–4.45M live blocks. What the capture could not say was which
 * subsystem asked for those blocks, because MEM_KIND had names only for Qwen,
 * MiniLM, voice, touches and persistence — and the 49-second window that
 * carried every step contained THIRTEEN ROOM TRANSITIONS and seven
 * `roster=new` events, none of which the vocabulary could spell.
 *
 * This module is the vocabulary's mouth. It is the ONLY new caller of
 * `annotateMemory` for the room / route / scene / roster family, and it is
 * deliberately an OBSERVER: it subscribes to the store and reports what
 * changed. It does not mount in the React tree, does not run on render, does
 * not touch asset loading, model lifecycle, cache policy, navigation, image
 * formats or memory-pressure handling, and frees nothing. If it were deleted
 * the game would behave identically — which is the property that makes its
 * output admissible as evidence about the game rather than about itself.
 *
 * ⚠ WHY AN OBSERVER AND NOT A CALL INSIDE THE STORE. The natural seam is
 * gameStore's own arrival line (`scene: loc=… hub=…`, the boundary crossed
 * thirteen times inside the ratchet window). gameStore.ts stands at exactly
 * 36815 of its 36815-line ceiling — a ratchet that exists to stop the store
 * absorbing responsibilities — and raising it to seat a diagnostic would spend
 * a permanent allowance on a temporary instrument. The store publishes every
 * fact this needs, so the instrument reads them from outside and the ceiling
 * is never touched.
 *
 * ⚠ WHAT IT CANNOT SEE, SAID PLAINLY. A subscriber sees STATE, not allocation.
 * It proves a room boundary was crossed at a sample sequence; it does not prove
 * the room allocated anything. That is exactly the join the report performs —
 * a step's samples against the events inside it — and it is CORRELATION.
 * Nothing downstream may promote a co-located event to a proven holder.
 */

import {
  MEM_KIND, annotateMemory, memCodeForId,
} from './nativeMemoryRecorder';

type Unsub = () => void;

let unsub: Unsub | null = null;

/* ⚠ THE INSTRUMENT'S OWN MEMORY IS A FIXED NUMBER OF SCALARS. An instrument
 * installed to find a holder must not become one: no set of visited rooms, no
 * map of ids, no history. `memCodeForId` is a pure 16-bit checksum for exactly
 * this reason, and the counters below are integers that never grow in size. */
/* ⚠ THE KEY IS THE TRANSITION TEST; THE CODE IS ONLY WHAT GETS REPORTED.
 * Two reasons, and the second is the important one.
 *
 * 1. COST. The store publishes on every setState — every log line, every HP
 *    change — and the overwhelming majority of those leave the player in the
 *    same room on the same screen. Measured under jest, re-hashing both keys
 *    on every publish cost ~760 ns; comparing the strings first drops the
 *    unchanged path, which is nearly all of them, to two string compares.
 *
 * 2. A 16-BIT CHECKSUM CAN COLLIDE, AND A COLLISION MUST NEVER SWALLOW A
 *    CROSSING. If two room ids hashed alike and the code decided the
 *    transition, walking between exactly those two rooms would report nothing
 *    at all — the instrument would go quiet precisely where it was needed.
 *    Deciding on the id and reporting the code means a collision costs an
 *    ambiguous label in the report, never a missing event.
 *
 * Two short strings is a fixed bound, not a growing map.
 *
 * ⚠ MEASURED, NOT ASSERTED (under jest, so the figures are a ratio rather than
 * a device timing — Hermes on hardware will differ in absolute terms):
 *
 *     unchanged publish, re-hashing both keys      760 ns
 *     unchanged publish, comparing keys first      374 ns   ← this
 *     a real room crossing (emits 2–3 events)    1,062 ns
 *
 * and 200,000 unchanged publishes emitted ZERO events, which is the property
 * that matters: the 64-slot event ring must never be filled by an instrument
 * reporting that nothing happened. */
let lastRoomKey = '';
let lastRoomCode = -1;
let lastScreenKey = '';
let lastScreenCode = -1;
let lastSceneToken: unknown = undefined;
let lastRosterToken: unknown = undefined;
let roomsEntered = 0;
let entitiesCreated = 0;

/** Rooms are reported every crossing; the running totals only every Nth, so a
 *  long session cannot fill the 64-slot event ring with bookkeeping. */
const RETAINED_COUNT_EVERY = 8;

function clamp16(n: number): number {
  return Math.max(0, Math.min(65535, Math.round(Number(n) || 0)));
}

/**
 * Report where the player currently stands as a single 16-bit code.
 *
 * ⚠ THE HUB ROOM WINS WHEN THERE IS ONE. A settlement's interior rooms are the
 * boundary the capture crossed thirteen times; the tile id alone would have
 * reported ONE transition for all thirteen and hidden the pattern under it.
 */
function placeKey(locationId: unknown, hubRoomId: unknown): string {
  const hub = hubRoomId == null ? '' : String(hubRoomId);
  if (hub) return `hub:${hub}`;
  return `loc:${locationId == null ? '' : String(locationId)}`;
}

/**
 * Begin observing. Idempotent — calling it twice leaves one subscription.
 *
 * ⚠ ARMED BESIDE THE OTHER INSTRUMENTS AND STOPPED BESIDE THEM (OTA-1798's
 * rule: started forever, stopped never is a defect, and jest measured it as
 * ~11,000 post-teardown firings per surface). This one holds no timer at all —
 * it is a store subscription and nothing else — but it still stops.
 */
export function startSubsystemMemoryMarks(): void {
  if (unsub) return;
  try {
    // ⚠ REQUIRED, NOT IMPORTED. gameStore pulls several modules out of this
    // directory; a static import back into the store would close a cycle and
    // the failure mode is a silently `undefined` binding at module-eval time,
    // which OTA-1796 already paid for once. The store is resolved lazily, at
    // the moment the app asks for the instrument.
    const store = require('../state/gameStore').useGameStore as {
      subscribe: (fn: (s: unknown) => void) => Unsub;
      getState: () => unknown;
    };
    if (!store?.subscribe) return;
    unsub = store.subscribe((s) => { try { onStoreChange(s); } catch { /* never breaks its host */ } });
  } catch {
    // An instrument never breaks its host. If the store cannot be reached the
    // capture is simply blind to these kinds, and the report says so.
    unsub = null;
  }
}

/** Stop observing and forget the last-seen values, so a later start is clean. */
export function stopSubsystemMemoryMarks(): void {
  try { unsub?.(); } catch { /* never breaks its host */ }
  unsub = null;
  lastRoomKey = '';
  lastRoomCode = -1;
  lastScreenKey = '';
  lastScreenCode = -1;
  lastSceneToken = undefined;
  lastRosterToken = undefined;
  roomsEntered = 0;
  entitiesCreated = 0;
}

/**
 * The whole instrument. Pure decision, four annotations at most per call.
 *
 * ⚠ EXPORTED FOR THE SUITE. The subscription is untestable under jest without
 * booting a store; the decision it makes is not, so the decision is the thing
 * the tests drive.
 */
export function onStoreChange(state: unknown): void {
  const s = (state ?? {}) as {
    player?: { currentLocationId?: unknown; hubRoomId?: unknown } | null;
    currentScreen?: unknown;
    currentScene?: { location?: { id?: unknown } | null; enemies?: unknown[] } | null;
  };

  // ── Room / place boundary ────────────────────────────────────────────────
  const roomKey = placeKey(s.player?.currentLocationId, s.player?.hubRoomId);
  if (roomKey !== lastRoomKey) {
    // ⚠ THE EXIT CARRIES THE ROOM BEING LEFT, NOT THE ONE BEING ENTERED. A
    // pair of events with the same code would be unreadable in the ring, and
    // the question the ratchet asks is "did leaving that one give anything
    // back" — which needs the departed room named.
    if (lastRoomCode >= 0) annotateMemory(MEM_KIND.ROOM_EXIT, lastRoomCode);
    lastRoomKey = roomKey;
    lastRoomCode = memCodeForId(roomKey);
    annotateMemory(MEM_KIND.ROOM_ENTER, lastRoomCode);
    roomsEntered += 1;
    if (roomsEntered % RETAINED_COUNT_EVERY === 0) {
      annotateMemory(MEM_KIND.ROOM_RETAINED_COUNT, clamp16(roomsEntered));
    }
  }
  const room = lastRoomCode < 0 ? 0 : lastRoomCode;

  // ── Route / screen boundary ──────────────────────────────────────────────
  const screenKey = s.currentScreen == null ? '' : `screen:${String(s.currentScreen)}`;
  if (screenKey !== lastScreenKey) {
    if (lastScreenCode >= 0) annotateMemory(MEM_KIND.ROUTE_UNMOUNT, lastScreenCode);
    lastScreenKey = screenKey;
    lastScreenCode = screenKey ? memCodeForId(screenKey) : 0;
    annotateMemory(MEM_KIND.ROUTE_MOUNT, lastScreenCode);
  }

  // ── Scene object lifetime ────────────────────────────────────────────────
  // ⚠ IDENTITY, NOT EQUALITY. A scene that is re-created with the same contents
  // is a new allocation and that is precisely the question being asked.
  const scene = s.currentScene ?? null;
  if (scene !== lastSceneToken) {
    if (lastSceneToken) annotateMemory(MEM_KIND.SCENE_DISPOSE, lastRoomCode < 0 ? 0 : lastRoomCode);
    if (scene) annotateMemory(MEM_KIND.SCENE_CREATE, room);
    lastSceneToken = scene;
  }

  // ── Roster (the `roster=new` the capture logged seven times) ─────────────
  const roster = scene?.enemies ?? null;
  if (roster !== lastRosterToken) {
    if (Array.isArray(lastRosterToken)) {
      annotateMemory(MEM_KIND.ROSTER_DISPOSE, clamp16((lastRosterToken as unknown[]).length));
    }
    if (Array.isArray(roster)) {
      const n = roster.length;
      annotateMemory(MEM_KIND.ROSTER_CREATE, clamp16(n));
      entitiesCreated += n;
      if (n > 0) annotateMemory(MEM_KIND.ENTITY_RETAINED_COUNT, clamp16(entitiesCreated));
    }
    lastRosterToken = roster;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * SEAM MARKS — called from the subsystems the observer cannot see from state.
 *
 * Artwork mounts and audio players are React/native lifetimes; nothing about
 * them reaches the store, so the store observer above is blind to both. These
 * are thin, throw-free, and each is a single call at a lifecycle edge that
 * already exists. None of them changes what is loaded, when, or for how long.
 * ══════════════════════════════════════════════════════════════════════════ */

/** An image began being displayed. `id` is the asset's own key, not a path. */
export function markArtworkMount(id: string, mountedCount?: number): void {
  annotateMemory(MEM_KIND.ARTWORK_MOUNT, memCodeForId(id));
  if (typeof mountedCount === 'number') {
    annotateMemory(MEM_KIND.ARTWORK_MOUNTED_COUNT, clamp16(mountedCount));
  }
}

/** An image stopped being displayed. ⚠ Says nothing about whether it was freed
 *  — that is the open question, and this event is what lets the report ask it. */
export function markArtworkUnmount(id: string, mountedCount?: number): void {
  annotateMemory(MEM_KIND.ARTWORK_UNMOUNT, memCodeForId(id));
  if (typeof mountedCount === 'number') {
    annotateMemory(MEM_KIND.ARTWORK_MOUNTED_COUNT, clamp16(mountedCount));
  }
}

/** The same slot swapped one image for another without unmounting. */
export function markArtworkReplace(id: string): void {
  annotateMemory(MEM_KIND.ARTWORK_REPLACE, memCodeForId(id));
}

export function markAudioPlayerCreate(id: string): void {
  annotateMemory(MEM_KIND.AUDIO_PLAYER_CREATE, memCodeForId(id));
}

export function markAudioPlayerDispose(id: string): void {
  annotateMemory(MEM_KIND.AUDIO_PLAYER_DISPOSE, memCodeForId(id));
}

/** Depth of the speech queue at the moment something joined it. */
export function markSpeechQueue(depth: number): void {
  annotateMemory(MEM_KIND.SPEECH_QUEUE_ADD, clamp16(depth));
}

/** The speech queue emptied. */
export function markSpeechQueueDrain(spoken: number): void {
  annotateMemory(MEM_KIND.SPEECH_QUEUE_DRAIN, clamp16(spoken));
}

/* ══════════════════════════════════════════════════════════════════════════
 * HOW TO TAKE THE NEXT CAPTURE — and what it will and will not answer.
 *
 * The 2026-09-19 capture was improvised and still produced the best memory
 * evidence this project has. It also lost seven steps to a 48-row cutoff and
 * could not name a subsystem. This is the recipe that makes the next one
 * answer the question, written down BEFORE the phone is in hand.
 *
 *   1. Take the OTA. Confirm the About screen reads the 1853 stamp — the
 *      instrument is only present on a bundle carrying it.
 *   2. Boot cold. Do not open the AI. The ratchet in the SE capture ran with
 *      Qwen idle and that is the case to reproduce.
 *   3. WALK ROOMS. The window that carried every step was 49 seconds holding
 *      thirteen room transitions. Cross between settlement interior rooms
 *      steadily for two to three minutes — the ring holds 512 samples and the
 *      sampler runs at 250 ms, so roughly two minutes fills it once.
 *   4. Trigger art. Let full-screen art flashes land; they are the single
 *      biggest decoded images in the app and now announce themselves.
 *   5. Push the report while the app is STILL RUNNING. A process killed for
 *      memory gets no unwind — the PREVIOUS LIFE line is a one-line
 *      checkpoint, not a capture.
 *
 * WHAT THE REPORT WILL THEN ANSWER: which retained steps occurred, when each
 * began and settled, how much each kept, and which room / route / scene /
 * roster / artwork / audio events were live inside each one.
 *
 * ⚠ WHAT IT STILL WILL NOT ANSWER, and nobody may claim otherwise from it:
 * whether a co-located subsystem ALLOCATED the step. See the NATIVE REMAINDER
 * block in nativeMemoryRecorder.ts — attribution of a malloc block to a
 * subsystem needs the Swift binary, and this pass does not touch it.
 * ══════════════════════════════════════════════════════════════════════════ */
