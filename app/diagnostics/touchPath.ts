// ⚠⚠⚠ OTA-1813 — WHERE DOES THE TOUCH STOP? THIS IS AN INSTRUMENT, NOT A REPAIR.
//
// Build 189 froze twice in gameplay on physical iOS: the last frame stayed
// drawn, JS timers kept firing (`homework: intro-fill` every ~45s through the
// whole dead window), background→foreground did not restore touch, and a
// force-close did. The record CANNOT say where the finger stopped being heard,
// because the only touch evidence the app keeps is `ui: tap`, which is stamped
// when the JS handler RUNS. A touch that never reached a handler leaves no
// trace at all — so "the screen stopped taking touches" and "the touch arrived
// and the work hung" look identical in every log we have.
//
// ⚠⚠ THIS FILE CHANGES NO GAMEPLAY. It observes. Every function here is
// synchronous bounded in-memory work; nothing it does can admit, reject, delay,
// serialise or reorder a player action, and nothing it does claims a responder.
//
// ⚠⚠⚠ AND IT DELIBERATELY DOES NOT REUSE `tapClock`'s SLOT. tapClock keeps ONE
// mutable `lastTouch`, consumed by whoever asks first — exactly the ambiguity
// that makes two rapid taps indistinguishable. That slot is perfect for its own
// job (the `⏱+Nms` suffix) and useless for this one, so tapClock is left
// untouched and this file keeps a small BOUNDED QUEUE of interaction ids
// instead. A handler that finds no fresh touch says `orphan` rather than
// inheriting a stranger's id.
//
// THE CHAIN, and what each stage can prove when the next one is missing:
//   root     the RN root saw the touch          → below this, iOS never delivered it
//   modal    a native-Modal content root saw it → the modal, not the screen, has it
//   in       the control's own press-in ran     → Pressability is alive
//   enter    the completed handler was entered  → JS ran the control's code
//   admit    the app accepted the operation     → with a bounded reason
//   reject   the app refused it, truthfully     → a refusal is NOT deadness
//   dispatch the admitted operation went out    → named by kind
//   done     the authoritative sync part returned
//
// ⚠ `reject` IS ONLY WRITTEN WHERE SOURCE PROVES A REAL HANDLER REFUSAL. A
// disabled control whose handler never runs is not a rejection — it is an
// absence, and recording a fabricated refusal there would put a lie in the one
// instrument built to find the truth.
//
// PERSISTENCE, and why it is shaped like this. The decisive evidence has to
// survive freeze → force-close → cold relaunch. It must NEVER make the freeze
// worse, so: appends are memory-only; the first append of an idle burst fires
// ONE snapshot and does not await it; while a write is in flight further
// appends only mark the ring dirty; at settlement a single coalesced trailing
// snapshot is scheduled once. No write-per-stage, no parallel writes, no
// recurring timer, no retry loop, and every storage failure is swallowed.

import AsyncStorage from '@react-native-async-storage/async-storage';
// ⚠ PURE READ ONLY. `touchLateMs` computes a number and mutates nothing, so
// borrowing it here cannot disturb tapClock's own slot or its `⏱+Nms` suffix.
import { touchLateMs } from './tapClock';

/** Bump when the entry shape changes; a reader that does not know the version
 *  should say so rather than mis-read old bytes. */
export const TOUCH_PATH_SCHEMA = 1;

/** Ring size. Two dozen stages is several deliberate taps' worth of chain —
 *  enough to show the last complete interaction plus the ones that followed it
 *  into silence, and small enough that serialising it is trivial. */
export const TOUCH_PATH_MAX_ENTRIES = 24;

/** A touch older than this cannot be claimed by a handler. Long enough to cover
 *  a badly stalled frame, short enough that a handler running after a real
 *  freeze is honestly marked `orphan` instead of adopting a dead id. */
export const TOUCH_CLAIM_MAX_AGE_MS = 1_500;

/** Outstanding unclaimed touches. Rapid multi-touch stays distinct up to this
 *  many; beyond it the OLDEST is dropped, because the newest finger is the one
 *  whose fate we are trying to learn. */
export const TOUCH_PENDING_MAX = 4;

/** One coalesced trailing snapshot this long after a write settles, if dirty. */
export const TOUCH_PATH_COALESCE_MS = 400;

/** Bounded string fields. Anything longer is clipped rather than rejected — a
 *  clipped control id still identifies the control; an unbounded one could put
 *  player text in a diagnostic that must never carry any. */
export const TOUCH_PATH_MAX_FIELD = 24;

const STORAGE_KEY = '@tartaria/touchPath';

/** The stages, short on the wire because they are written far more often than
 *  they are read. See the chain in the header for what each one proves. */
export type TouchStage =
  | 'root' | 'modal' | 'in' | 'enter' | 'admit' | 'reject' | 'dispatch' | 'done'
  /** ⚠⚠⚠ OTA-1814 — A PRESENTATION CHANGED STATE, and it is ONE new word rather
   *  than four because the phase already has a home: the bounded `reason` field
   *  carries 'requested' | 'shown' | 'dismiss-requested' | 'dismissed'.
   *
   *  ⚠⚠ WHY IT EXISTS AT ALL. The other eight stages describe a touch travelling
   *  toward an action. This one describes the app answering back, and the two
   *  Build 189 report freezes died exactly there: the receipt was REQUESTED and
   *  the screen stopped taking touch. `requested` without `shown` means React
   *  never committed the receipt; `shown` without `dismissed` means it committed
   *  and the way out never completed. Those are different faults with different
   *  repairs, and no existing stage can tell them apart. */
  | 'pres';

export interface TouchPathEntry {
  /** Monotonic per-boot sequence — proves ordering even if two wall times tie. */
  s: number;
  /** Interaction id. Shared by every stage of one physical touch. */
  i: number;
  st: TouchStage;
  /** Bounded control identity, e.g. 'quick:DODGE', 'gather:take'. */
  c?: string;
  /** Bounded reason (reject) or operation kind (admit/dispatch/done). */
  r?: string;
  /** Presentation token, e.g. 'none', 'G', 'S+story'. */
  p?: string;
  /** Screen name. */
  sc?: string;
  /** AppState at the time. */
  a?: string;
  /** tapClock's native→JS delay in ms, when this stage had one. */
  d?: number;
  /** Present and true only when the handler found no fresh touch to claim. */
  o?: true;
  /** Wall clock — readable in a report. */
  t: number;
  /** Monotonic clock — survives a wall-clock jump. */
  m: number;
}

interface Pending { id: number; at: number; claimed: boolean }

let ring: TouchPathEntry[] = [];
let pending: Pending[] = [];
let seq = 0;
let nextId = 1;

// Persistence state. `writing` is the single in-flight slot; `dirty` says the
// ring changed while it was in flight; `trailing` is the one-shot coalesce.
let writing = false;
let dirty = false;
let trailing: ReturnType<typeof setTimeout> | null = null;

/** Context the stages ride along with. Set by the screen; never read from a
 *  store on the touch path, because waking a store subscriber from a touch
 *  observer is precisely the kind of cost this instrument must not add. */
let ctx: { screen?: string; presentation?: string; appState?: string } = {};

/** The PREVIOUS boot's trace, hydrated once at start. See `priorTouchPath`. */
let priorBoot: readonly TouchPathEntry[] | null = null;

/** T1's claim, held for the handler that follows it. */
let heldPressIn: { id: number; at: number } | null = null;

/** ⚠⚠ THE HANDLER A DEFERRED STAGE BELONGS TO. Code BELOW a control's handler
 *  — a screen's deferred-submit helper, for instance — records stages for a
 *  touch it did not itself claim. It must NOT call `noteHandlerEnter` to get an
 *  id: the root touch was already consumed by T1, so a second claim would come
 *  back `orphan` and put a fabricated "no root touch behind this handler" into
 *  the evidence. This slot is how such code borrows the id instead of minting
 *  a false one. */
let lastEntered: { id: number; at: number } | null = null;

const mono = (): number =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? Math.round(performance.now())
    : 0;

const clip = (v: string | undefined): string | undefined =>
  v == null ? undefined : (v.length > TOUCH_PATH_MAX_FIELD ? v.slice(0, TOUCH_PATH_MAX_FIELD) : v);

/** ⚠ The screen owns the context, and sets it from render — NOT from the touch
 *  path. Cheap, bounded, and it means a stage append never reads a store. */
export function setTouchPathContext(c: {
  screen?: string; presentation?: string; appState?: string;
}): void {
  ctx = {
    screen: clip(c.screen),
    presentation: clip(c.presentation),
    appState: clip(c.appState),
  };
}

export function touchPathContext(): Readonly<typeof ctx> { return ctx; }

/**
 * The earliest app-owned evidence: the RN root (or a native-Modal content root)
 * saw a touch begin. Mints an interaction id and parks it for the handler that
 * follows.
 *
 * ⚠ CALLERS MUST RETURN FALSE from `onStartShouldSetResponderCapture`. This
 * function never claims anything; claiming would steal the gesture from the
 * control the player actually pressed.
 */
export function noteRootTouch(kind: 'root' | 'modal' = 'root', at: number = Date.now()): number {
  const id = nextId++;
  pending.push({ id, at, claimed: false });
  // Bounded: drop the OLDEST, keep the newest fingers.
  while (pending.length > TOUCH_PENDING_MAX) pending.shift();
  append({ i: id, st: kind });
  return id;
}

/**
 * A handler claims the touch that caused it. Returns the shared id, or a fresh
 * id with `orphan` when there is no fresh unclaimed touch — which is itself
 * evidence: a handler that ran with no root touch behind it means the root
 * observer never saw the finger.
 *
 * ⚠ NEWEST-FIRST, AND CLAIMED ONCE. A stale touch (older than the claim age)
 * can never be inherited, so a handler running after a stall does not silently
 * adopt the id of a touch from before it.
 */
export function claimTouch(now: number = Date.now()): { id: number; orphan: boolean } {
  for (let k = pending.length - 1; k >= 0; k--) {
    const p = pending[k]!;
    if (p.claimed) continue;
    if (now - p.at > TOUCH_CLAIM_MAX_AGE_MS) continue;
    p.claimed = true;
    return { id: p.id, orphan: false };
  }
  return { id: nextId++, orphan: true };
}

/**
 * T1 — the control's own press-in. Pairs with the EXISTING `noteTouchDown`; it
 * does not replace it, and tapClock's slot and suffix are untouched.
 *
 * ⚠ IT CLAIMS THE ROOT TOUCH AND HOLDS IT FOR THE HANDLER, so T0→T1→T2 share
 * one id. Without this hand-off the handler's own `claimTouch` would find the
 * touch already consumed here and wrongly call itself an orphan.
 */
export function notePressIn(
  control: string,
  e?: { nativeEvent?: { timestamp?: unknown } } | null,
  now: number = Date.now(),
): number {
  const { id, orphan } = claimTouch(now);
  let delayMs: number | undefined;
  try {
    const late = touchLateMs(e?.nativeEvent?.timestamp);
    if (late !== null) delayMs = late;
  } catch { /* ignore */ }
  noteStage(id, 'in', { control, delayMs, orphan });
  heldPressIn = { id, at: now };
  return id;
}

/**
 * T2 — the completed handler was entered. Reuses the id T1 held when that
 * press-in is still fresh; otherwise claims a root touch; otherwise says
 * `orphan`, which is itself the finding.
 */
export function noteHandlerEnter(control: string, now: number = Date.now()): number {
  const held = heldPressIn;
  if (held && now - held.at <= TOUCH_CLAIM_MAX_AGE_MS) {
    heldPressIn = null;
    lastEntered = { id: held.id, at: now };
    noteStage(held.id, 'enter', { control });
    return held.id;
  }
  heldPressIn = null;
  const { id, orphan } = claimTouch(now);
  lastEntered = { id, at: now };
  noteStage(id, 'enter', { control, orphan });
  return id;
}

/**
 * The interaction a handler is currently inside, for code BELOW that handler
 * which must record a stage without minting a second interaction for the same
 * finger. Null when no handler ran recently enough to own the stage — and a
 * null is the honest answer, not a reason to invent an id.
 */
export function currentTouchId(now: number = Date.now()): number | null {
  if (lastEntered && now - lastEntered.at <= TOUCH_CLAIM_MAX_AGE_MS) return lastEntered.id;
  return null;
}

/** One stage of one interaction. Synchronous, bounded, allocation-light. */
export function noteStage(
  id: number,
  st: TouchStage,
  opts?: { control?: string; reason?: string; delayMs?: number; orphan?: boolean },
): void {
  append({
    i: id,
    st,
    c: clip(opts?.control),
    r: clip(opts?.reason),
    d: typeof opts?.delayMs === 'number' && Number.isFinite(opts.delayMs) ? opts.delayMs : undefined,
    o: opts?.orphan ? true : undefined,
  });
}

function append(partial: { i: number; st: TouchStage; c?: string; r?: string; d?: number; o?: true }): void {
  try {
    const e: TouchPathEntry = {
      s: ++seq,
      i: partial.i,
      st: partial.st,
      t: Date.now(),
      m: mono(),
    };
    if (partial.c) e.c = partial.c;
    if (partial.r) e.r = partial.r;
    if (partial.d !== undefined) e.d = partial.d;
    if (partial.o) e.o = true;
    if (ctx.presentation) e.p = ctx.presentation;
    if (ctx.screen) e.sc = ctx.screen;
    if (ctx.appState) e.a = ctx.appState;
    ring.push(e);
    if (ring.length > TOUCH_PATH_MAX_ENTRIES) ring.shift();
    schedulePersist();
  } catch { /* an instrument may never throw into the thing it measures */ }
}

/** ⚠⚠ ONE WRITE IN FLIGHT, EVER. Leading snapshot for an idle burst; while it
 *  is in flight everything else only marks dirty; at settlement ONE coalesced
 *  trailing snapshot is scheduled. No per-stage writes, no parallel writes, no
 *  recurring timer. */
function schedulePersist(): void {
  if (writing) { dirty = true; return; }
  void writeNow();
}

function writeNow(): Promise<void> {
  writing = true;
  dirty = false;
  let body: string;
  try {
    body = JSON.stringify({ v: TOUCH_PATH_SCHEMA, e: ring });
  } catch { writing = false; return Promise.resolve(); }
  return AsyncStorage.setItem(STORAGE_KEY, body)
    .catch(() => { /* a diagnostic write may never block or fail gameplay */ })
    .then(() => {
      writing = false;
      if (dirty && trailing === null) {
        trailing = setTimeout(() => {
          trailing = null;
          if (dirty && !writing) void writeNow();
        }, TOUCH_PATH_COALESCE_MS);
      }
    });
}

/** The lifecycle seam: AppState leaving active asks for the trailing snapshot
 *  now rather than waiting out the coalesce window. Still fire-and-forget. */
export function flushTouchPath(): void {
  try {
    if (trailing !== null) { clearTimeout(trailing); trailing = null; }
    if (!writing) void writeNow(); else dirty = true;
  } catch { /* ignore */ }
}

/** Screen lifecycle / background: outstanding touches are no longer claimable.
 *  The RING IS KEPT — it is the evidence — only the correlation is cleared. */
export function resetTouchCorrelation(): void {
  pending = []; heldPressIn = null; lastEntered = null;
}

/** This boot's entries. */
export function peekTouchPath(): readonly TouchPathEntry[] { return ring; }

/** The trace the PREVIOUS boot left behind, loaded once at start so a report
 *  written after a force-close can show the last boundary the dead touch
 *  reached. Null when absent or unreadable. */
export async function loadPriorTouchPath(): Promise<readonly TouchPathEntry[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as { v?: unknown; e?: unknown };
    if (p.v !== TOUCH_PATH_SCHEMA || !Array.isArray(p.e)) return null;
    priorBoot = (p.e as TouchPathEntry[]).slice(0, TOUCH_PATH_MAX_ENTRIES);
    return priorBoot;
  } catch { return null; }
}

/** ⚠⚠⚠ THE WHOLE REASON THE TRACE IS PERSISTED. The freeze under investigation
 *  ends in a FORCE-CLOSE, so the boot that can report it is never the boot that
 *  recorded it. This is the last boot's tail, hydrated once at start by
 *  `loadPriorTouchPath` — synchronous afterwards, because the bug-report header
 *  is assembled synchronously and an instrument does not get to make that path
 *  async. Null until the hydration lands (or when there was nothing to load),
 *  and null is printed as "no prior trace", never as an empty one. */
export function priorTouchPath(): readonly TouchPathEntry[] | null { return priorBoot; }

/** One compact line per stage for the bug report. Bounded by construction. */
export function touchPathLines(entries: readonly TouchPathEntry[]): string[] {
  return entries.map((e) => {
    const bits = [`#${e.i}`, e.st];
    if (e.c) bits.push(e.c);
    if (e.r) bits.push(`(${e.r})`);
    if (e.d !== undefined) bits.push(`⏱+${e.d}ms`);
    if (e.o) bits.push('orphan');
    if (e.p) bits.push(`p=${e.p}`);
    if (e.sc) bits.push(e.sc);
    if (e.a) bits.push(e.a);
    return `  ${new Date(e.t).toISOString()} ${bits.join(' ')}`;
  });
}

/** Tests only. */
export function _resetTouchPathForTest(): void {
  ring = [];
  pending = [];
  heldPressIn = null;
  lastEntered = null;
  priorBoot = null;
  seq = 0;
  nextId = 1;
  writing = false;
  dirty = false;
  if (trailing !== null) { clearTimeout(trailing); trailing = null; }
  ctx = {};
}

/** Tests only — the persistence state machine, so a suite can prove there is
 *  never more than one write in flight without reaching into the module. */
export function _touchPathWriteState(): { writing: boolean; dirty: boolean; trailingArmed: boolean } {
  return { writing, dirty, trailingArmed: trailing !== null };
}
