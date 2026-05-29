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

/** Insert / update a synthesized stat row + persist. LRU eviction
 *  drops the oldest entry by `synthesizedAt` when the cache exceeds
 *  MAX_ENTRIES. Persistence is fire-and-forget — we don't await the
 *  AsyncStorage write so synthesis can return immediately. */
export function setCachedSynth(name: string, stats: SynthesizedItem): void {
  const k = name.toLowerCase();
  STATE.entries.set(k, { ...stats, name: k });
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

/** Test/diagnostic hook — reset the in-memory cache. The persisted
 *  store on disk is left alone. */
export function _resetCacheForTests(): void {
  STATE.entries.clear();
  STATE.loaded = false;
}

/** Test/diagnostic hook — snapshot of the current cache. */
export function _snapshotCacheForTests(): SynthesizedItem[] {
  return Array.from(STATE.entries.values());
}
