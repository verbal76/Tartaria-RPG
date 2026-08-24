// itemSynthesisCache — install-lifetime store of Qwen-synthesized
// item stats keyed by lowercased item name. Once Qwen "balances" an
// inferred item (e.g., "Whisperer's Marrow Charm" → { kind: 'misc',
// effect: { kind: 'passive', stat: 'charisma', bonus: 1 }, tags:
// ['organic', 'charm'] }), the result lands here so future references
// to the same name skip the ~300ms LLM call.
//
// Persisted to AsyncStorage so the cache survives app restarts and
// OTA updates. Capped at 500 entries with LRU eviction; each entry
// is <500 bytes, so even at the cap the cache is <250 KB.
//
// The cache is the SOURCE OF TRUTH for Qwen-synthesized rows once
// populated — the engine's static inference (`itemDefaults.ts`)
// stays the fast path for cache misses + items the keyword
// classifier already handles confidently.

// AsyncStorage is loaded lazily — `require()` inside the persistence
// functions instead of an import at module scope. The synchronous
// import would crash the test runner on any file that transitively
// imports `itemDefaults.ts` (and therefore this cache) without a
// jest.mock for AsyncStorage. The cache only touches the native
// module from loadSynthCache() and persistCache(); the synchronous
// getCachedSynth / setCachedSynth paths stay in-memory.
import type { ItemEffect } from './itemEffect';

const STORAGE_KEY = 'tartaria.itemSynthCache.v1';
const MAX_ENTRIES = 500;

interface AsyncStorageShim {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function loadAsyncStorageOrNull(): AsyncStorageShim | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    return (mod?.default ?? mod) as AsyncStorageShim;
  } catch {
    return null;
  }
}

/** Subset of catalog fields the Qwen synthesis path can fill in. The
 *  static inference (itemDefaults.ts) always runs first; this overlay
 *  is merged on top to enrich the row. Optional fields stay optional
 *  so a Qwen response missing a key doesn't blank out the static
 *  inference. */
export interface SynthesizedItem {
  /** Lowercased item name. Used as the cache key + as a sanity check
   *  on read-back (don't apply a cached row to a different name). */
  name: string;
  /** When the synthesis happened — drives LRU eviction. */
  synthesizedAt: number;
  /** Override or extend the static-inference effect. */
  effect?: ItemEffect;
  /** Material tags to merge into the static-inference tag set. Lets
   *  Qwen tell us "this is a charm AND an organic" so scrap routing
   *  picks both materials. */
  extraTags?: string[];
  /** Short flavor description (one line). Replaces the static
   *  "Field-inferred from the name. ..." string. */
  description?: string;
}

interface CacheState {
  entries: Map<string, SynthesizedItem>;
  loaded: boolean;
}

const STATE: CacheState = {
  entries: new Map<string, SynthesizedItem>(),
  loaded: false,
};

/** Load the cache from AsyncStorage. Called once during
 *  gameStore.hydrate; subsequent calls are no-ops. Tolerant — any
 *  parse failure resets to an empty cache. */
export async function loadSynthCache(): Promise<void> {
  if (STATE.loaded) return;
  const storage = loadAsyncStorageOrNull();
  if (!storage) {
    STATE.loaded = true;
    return;
  }
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as SynthesizedItem[];
      if (Array.isArray(arr)) {
        STATE.entries.clear();
        for (const e of arr) {
          if (e && typeof e.name === 'string') {
            STATE.entries.set(e.name.toLowerCase(), e);
          }
        }
      }
    }
  } catch {
    // ignore — start empty
  }
  STATE.loaded = true;
}

export function getCachedSynth(name: string): SynthesizedItem | null {
  const k = name.toLowerCase();
  return STATE.entries.get(k) ?? null;
}

// OTA-192 — listener registry so callers (gameStore) can react when a
// Qwen synthesis lands and live-restamp matching inventory entries.
// Without this, a player who picks up an unrecognized item has to
// reload the save to see Qwen's enriched tags + description take
// effect. The listener fires synchronously after setCachedSynth
// writes; persistence to AsyncStorage stays fire-and-forget.
type SynthListener = (name: string, entry: SynthesizedItem) => void;
const LISTENERS = new Set<SynthListener>();
export function onSynthLanded(fn: SynthListener): () => void {
  LISTENERS.add(fn);
  return () => LISTENERS.delete(fn);
}

/** Insert / update a synthesized stat row + persist. LRU eviction
 *  drops the oldest entry by `synthesizedAt` when the cache exceeds
 *  MAX_ENTRIES. Persistence is fire-and-forget — we don't await the
 *  AsyncStorage write so synthesis can return immediately. */
export function setCachedSynth(name: string, stats: SynthesizedItem): void {
  const k = name.toLowerCase();
  const entry = { ...stats, name: k };
  STATE.entries.set(k, entry);
  if (STATE.entries.size > MAX_ENTRIES) {
    // LRU eviction by synthesizedAt — oldest goes first.
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, value] of STATE.entries) {
      if (value.synthesizedAt < oldestAt) {
        oldestAt = value.synthesizedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) STATE.entries.delete(oldestKey);
  }
  void persistCache();
  // Notify listeners last so they see the canonical entry from the
  // cache. Failures in one listener don't block the others.
  for (const fn of LISTENERS) {
    try { fn(k, entry); } catch { /* swallow */ }
  }
}

async function persistCache(): Promise<void> {
  const storage = loadAsyncStorageOrNull();
  if (!storage) return;
  try {
    const arr = Array.from(STATE.entries.values());
    await storage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore — cache still works in-memory
  }
}

// ⚠⚠⚠ OTA-1465 — THE REFUSAL LEDGER. Names this job has already tried and been
// rejected on.
//
// This cache only ever remembered SUCCESS. A rejected name was written nowhere,
// so `nextHomeworkItem` — which returns the FIRST inventory entry that is
// neither pending nor cached — picked the same one again on every tick, forever.
// The owner's 2026-08-24 log, one session:
//
//   00:02:02  item_synthesis_hw 6045ms ✂ DISCARDED — rejected-by-clamp bad-kind="junk"
//   00:10:01  item_synthesis_hw 4596ms ✂ DISCARDED — rejected-by-clamp bad-kind="junk"
//   00:11:00  item_synthesis_hw 4359ms ✂ DISCARDED — rejected-by-clamp bad-kind="junk"
//                                        …all three "Smooth Stone"
//
// ⚠⚠ AND THE WASTE IS THE SMALL HALF. Because the scan takes the FIRST eligible
// item, one permanently-failing name STARVES EVERY ITEM BEHIND IT. From the
// moment Smooth Stone entered his pack, no other item in the pack could ever be
// described — the queue was not slow, it was blocked. That is why this is a
// cache fix and not a fifth rewrite of the prompt.
//
// ⚠ NOT PERSISTED, ON PURPOSE. A refusal is a fact about THIS BUILD's prompt and
// validator, both of which change under the player between sessions; carrying it
// to disk would make a fixed item stay broken until someone cleared storage. In
// memory it costs one retry per launch and self-heals the moment a build lands
// that can describe the thing.
const REFUSED = new Set<string>();

/** ⚠ Bounded like the positive cache, and for the same reason: a player who
 *  hoards 400 distinct junk names should not grow this without limit. Oldest-in
 *  wins eviction because Set preserves insertion order. */
const MAX_REFUSED = 256;

/** Record that synthesis for this name was rejected and should not be retried
 *  this session. */
export function noteSynthRefused(name: string): void {
  const k = name.toLowerCase();
  if (REFUSED.has(k)) return;
  REFUSED.add(k);
  if (REFUSED.size > MAX_REFUSED) {
    const oldest = REFUSED.values().next().value as string | undefined;
    if (oldest !== undefined) REFUSED.delete(oldest);
  }
}

/** Has this name already been tried and rejected this session? */
export function wasSynthRefused(name: string): boolean {
  return REFUSED.has(name.toLowerCase());
}

/** ⚠ A LATER SUCCESS CLEARS THE REFUSAL. Nothing in the shipped game re-tries a
 *  refused name today, but a future caller that forces one (a manual "describe
 *  this", a prompt change behind a flag) must not leave the ledger claiming a
 *  name is hopeless when the cache holds a good row for it. Two records of the
 *  same fact are how they come to disagree. */
export function clearSynthRefusal(name: string): void {
  REFUSED.delete(name.toLowerCase());
}

/** Test/diagnostic hook — reset the in-memory cache. The persisted
 *  store on disk is left alone. */
export function _resetCacheForTests(): void {
  STATE.entries.clear();
  STATE.loaded = false;
  REFUSED.clear();
}

/** Test/diagnostic hook — how many names are on the refusal ledger. */
export function _refusedCountForTests(): number { return REFUSED.size; }

/** Test/diagnostic hook — snapshot of the current cache. */
export function _snapshotCacheForTests(): SynthesizedItem[] {
  return Array.from(STATE.entries.values());
}
