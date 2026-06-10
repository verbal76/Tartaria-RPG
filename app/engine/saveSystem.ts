import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SaveState } from './types';
import { capDiskLog } from './diskLogCap';

// v2 schema: multi-slot. Each character is its own keyed save with its
// own log; an index file lists summaries for the title screen.
const SLOTS_INDEX_KEY = 'tartaria.slots.index.v2';
// OTA-343 — exported so the crash-save capture (app/diagnostics/crashSave.ts)
// can read the active slot's on-disk bytes at crash time WITHOUT importing the
// game store. Read-only consumers only; writes still go through saveSlot.
export const ACTIVE_SLOT_KEY = 'tartaria.activeSlot.v2';
export const slotSaveKey = (slotId: string) => `tartaria.slot.${slotId}.v2`;
// OTA-344 — atomic-write keys. The live save is written via temp → verify →
// swap, with the previous good save kept as a `.bak` so an interrupted write
// (crash / OS kill / OTA reload mid-write — the OTA-338 brick) can never leave
// the only copy truncated. Worst case loadSlot falls back to .bak (the previous
// save), never to nothing.
const slotSaveTmpKey = (slotId: string) => `tartaria.slot.${slotId}.v2.tmp`;
const slotSaveBakKey = (slotId: string) => `tartaria.slot.${slotId}.v2.bak`;
const slotLogKey = (slotId: string) => `tartaria.gamelog.${slotId}.v2`;

// Legacy single-slot keys. Migrated to a v2 slot on first hydrate.
const LEGACY_SAVE_KEY = 'tartaria.save.v1';
const LEGACY_LOG_KEY = 'tartaria.gamelog.v1';

export interface SlotSummary {
  slotId: string;
  playerName: string;
  raceId: string;
  locationId: string;
  hp: number;
  hpMax: number;
  /** Mirrors player.dead — set true when the character has fallen and needs a Resurrection Gem. */
  dead?: boolean;
  savedAt: number;
  createdAt: number;
  // v2.4.1 (OTA 036) — main-quest snapshot for the TitleScreen
  // RESUME OBJECTIVE card. All optional; older summaries lack
  // these fields and the UI falls back to omitting the card.
  factionId?: string;
  mainQuestPhase?: string;
  mainQuestCoresRecovered?: number;
  /** OTA-120 Phase 5 — dog snapshot for the TitleScreen slot tile.
   *  Lets the player pick the right save at a glance when multiple
   *  characters carry different companions. Only populated when the
   *  save has an active dog (status with_player / waiting_at_base);
   *  abandoned / dead dogs leave these fields undefined. */
  dogName?: string;
  dogBreed?: string;
}

// Install-wide stash (not per-character). Stores resources that persist
// across character deaths — Resurrection Gems primarily.
const GLOBAL_STASH_KEY = 'tartaria.global.v2';

export interface GlobalStash {
  resurrectionGems: number;
  // v2.4.1 (OTA 043 — Phase 7) — completion badges. Records every
  // (faction, ending) combo the player has finished across all
  // characters. Up to 27 unique badges (9 factions × 3 endings).
  // Used by TitleScreen to display the completion grid.
  endingBadges?: string[]; // ids of the form "faction:ending"
  // OTA 454 — first-install seed marker. Prevents re-seeding the
  // free starter gem on every hydrate. Set to true the moment we
  // grant the install gem; never cleared afterwards.
  installSeeded?: boolean;
  // arb89 — dev-name proactive gem grant. Slot keys ("<slotId>:<name>")
  // that have already received their one free Resurrection Gem for being
  // a dev character (Verbal / Sasmooch). Idempotent so a load doesn't
  // re-grant on every resume.
  devGemGrantedSlots?: string[];
}

export async function loadGlobalStash(): Promise<GlobalStash> {
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_STASH_KEY);
    if (!raw) return { resurrectionGems: 0, endingBadges: [], installSeeded: false };
    const parsed = JSON.parse(raw) as Partial<GlobalStash>;
    return {
      resurrectionGems: parsed.resurrectionGems ?? 0,
      endingBadges: parsed.endingBadges ?? [],
      installSeeded: parsed.installSeeded ?? false,
      devGemGrantedSlots: parsed.devGemGrantedSlots ?? [],
    };
  } catch {
    return { resurrectionGems: 0, endingBadges: [], installSeeded: false, devGemGrantedSlots: [] };
  }
}

export async function saveGlobalStash(stash: GlobalStash): Promise<void> {
  await AsyncStorage.setItem(GLOBAL_STASH_KEY, JSON.stringify(stash));
}

export async function addResurrectionGems(n: number): Promise<number> {
  const stash = await loadGlobalStash();
  stash.resurrectionGems = Math.max(0, stash.resurrectionGems + n);
  await saveGlobalStash(stash);
  return stash.resurrectionGems;
}

/** OTA 454 — first-install Resurrection Gem seed. Idempotent: if the
 *  global stash has never been seeded, grants 1 gem and flips the
 *  installSeeded marker. Returns { seeded: true } only on the
 *  one-shot grant so the caller can surface a welcome line; on every
 *  subsequent boot it returns { seeded: false }. */
export async function ensureFirstInstallSeed(): Promise<{ seeded: boolean; gems: number }> {
  const stash = await loadGlobalStash();
  if (stash.installSeeded) {
    return { seeded: false, gems: stash.resurrectionGems };
  }
  stash.installSeeded = true;
  stash.resurrectionGems = (stash.resurrectionGems ?? 0) + 1;
  await saveGlobalStash(stash);
  return { seeded: true, gems: stash.resurrectionGems };
}

/** arb89 — one-time proactive Resurrection Gem for a dev character
 *  (Verbal / Sasmooch). Grants a gem the first time that specific slot
 *  is recognized as a dev name, so the dev (or the dev's spouse playing
 *  Sasmooch) has a gem in hand WITHOUT dying first and WITHOUT restarting
 *  the character. Idempotent per slot key — re-loading the same save
 *  never re-grants. */
export async function grantDevGemOnce(slotKey: string): Promise<{ granted: boolean; gems: number }> {
  const stash = await loadGlobalStash();
  const already = stash.devGemGrantedSlots ?? [];
  if (already.includes(slotKey)) {
    return { granted: false, gems: stash.resurrectionGems };
  }
  stash.devGemGrantedSlots = [...already, slotKey];
  stash.resurrectionGems = (stash.resurrectionGems ?? 0) + 1;
  await saveGlobalStash(stash);
  return { granted: true, gems: stash.resurrectionGems };
}

/** v2.4.1 (OTA 043) — record a completed (faction, ending) combo.
 *  Idempotent: re-recording an existing badge is a no-op. Returns
 *  the updated badge list. */
export async function recordEndingBadge(factionId: string, ending: string): Promise<string[]> {
  const stash = await loadGlobalStash();
  const id = `${factionId}:${ending}`;
  const set = new Set(stash.endingBadges ?? []);
  if (set.has(id)) return Array.from(set);
  set.add(id);
  stash.endingBadges = Array.from(set);
  await saveGlobalStash(stash);
  return stash.endingBadges;
}

let activeSlotId: string | null = null;

export function getActiveSlotId(): string | null {
  return activeSlotId;
}

export async function setActiveSlot(slotId: string | null): Promise<void> {
  activeSlotId = slotId;
  if (slotId) {
    await AsyncStorage.setItem(ACTIVE_SLOT_KEY, slotId);
  } else {
    await AsyncStorage.removeItem(ACTIVE_SLOT_KEY);
  }
}

export async function loadActiveSlotId(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(ACTIVE_SLOT_KEY);
    activeSlotId = v;
    return v;
  } catch {
    return null;
  }
}

export function newSlotId(): string {
  return `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listSlots(): Promise<SlotSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(SLOTS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SlotSummary[];
    return parsed.sort((a, b) => b.savedAt - a.savedAt);
  } catch (e) {
    console.warn('listSlots failed', e);
    return [];
  }
}

async function writeIndex(slots: SlotSummary[]): Promise<void> {
  await AsyncStorage.setItem(SLOTS_INDEX_KEY, JSON.stringify(slots));
}

async function upsertIndexEntry(entry: SlotSummary): Promise<void> {
  const all = await listSlots();
  const filtered = all.filter((s) => s.slotId !== entry.slotId);
  filtered.unshift(entry);
  await writeIndex(filtered);
}

async function readParseKey(key: string): Promise<SaveState | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SaveState;
  } catch {
    return null;
  }
}

export async function loadSlot(slotId: string): Promise<SaveState | null> {
  // OTA-344 — atomic-save fallback chain. Read the live key first; if it's
  // missing or corrupt (a swap interrupted mid-write — the 338 class), fall
  // back to the last-good `.bak` and HEAL the live key from it so subsequent
  // reads (and the title-screen index) see a valid save again.
  const primary = await readParseKey(slotSaveKey(slotId));
  if (primary) return primary;
  const backup = await readParseKey(slotSaveBakKey(slotId));
  if (backup) {
    try {
      const raw = await AsyncStorage.getItem(slotSaveBakKey(slotId));
      if (raw) await AsyncStorage.setItem(slotSaveKey(slotId), raw);
    } catch { /* best-effort heal — the in-memory return below still recovers play */ }
    console.warn(`loadSlot: live save for ${slotId} was missing/corrupt — recovered from .bak (previous save)`);
    return backup;
  }
  return null;
}

// OTA-344 — surface a failed atomic save (storage full / interrupted verify)
// the same way getLastLogWriteError surfaces a failed log write. saveSlot never
// rejects (its callers `void persist()` fire-and-forget, so a throw would be an
// unhandled rejection); instead it stamps the failure here, having left the live
// save + backup intact ("as if the save never started").
let lastSaveWriteError: string | null = null;
export function getLastSaveWriteError(): string | null {
  return lastSaveWriteError;
}
export function clearLastSaveWriteError(): void {
  lastSaveWriteError = null;
}

// OTA-406 — set true for one persist cycle when saveSlot had to emergency-purge
// the on-disk copy-log to free space before a save could land. persist() reads +
// clears it so the world feed can tell the player their progress was rescued.
let lastSaveReclaimedSpace = false;
export function consumeSaveReclaimedFlag(): boolean {
  const v = lastSaveReclaimedSpace;
  lastSaveReclaimedSpace = false;
  return v;
}

// OTA-406 — emergency storage reclaim. The on-disk COPY-LOG (slotLogKey) is the
// largest REGENERABLE key we own: on a pre-OTA-398 build it grew unbounded and
// can fill AsyncStorage's ~6 MB SQLite DB, after which EVERY setItem — including
// the tiny slot save — fails with "storage full" and the player silently stops
// saving. capDiskLog (398) only self-heals if an overwrite-with-smaller setItem
// can still squeeze in, which a fully-stuffed DB may refuse. A removeItem, by
// contrast, RELIABLY frees space (a DELETE doesn't need new pages). So when a
// save can't stage, we sacrifice the debug copy-log — never the player's actual
// progress — to get the save to land, and self-heal a DB the old bug had bricked.
async function emergencyReclaimDiskSpace(slotId: string): Promise<void> {
  try { await AsyncStorage.removeItem(slotLogKey(slotId)); } catch { /* ignore */ }
  // Drop any stale temp key from a prior interrupted write, too.
  try { await AsyncStorage.removeItem(slotSaveTmpKey(slotId)); } catch { /* ignore */ }
}

export async function saveSlot(slotId: string, state: SaveState): Promise<void> {
  const toSave: SaveState = { ...state, savedAt: Date.now(), version: 1 };
  const payload = JSON.stringify(toSave);
  const tmpKey = slotSaveTmpKey(slotId);
  const bakKey = slotSaveBakKey(slotId);
  const liveKey = slotSaveKey(slotId);

  // Stage the payload to the temp key and verify it round-trips byte-for-byte
  // (catches a truncated / quota-capped write BEFORE we touch the live slot).
  // setItem can THROW on a full DB, so guard it — a thrown write is a failed
  // stage, same as a mismatched readback.
  const tryStage = async (): Promise<boolean> => {
    try {
      await AsyncStorage.setItem(tmpKey, payload);
      const staged = await AsyncStorage.getItem(tmpKey);
      return staged === payload;
    } catch {
      return false;
    }
  };

  // OTA-344 — atomic write: temp → verify → snapshot last-good → swap → cleanup.
  // Never throws (see lastSaveWriteError note above): on any failure the live
  // save and the .bak are left exactly as they were.
  try {
    // 1-2. Stage + verify. OTA-406 — if it fails (storage full), reclaim the
    //      regenerable copy-log and retry ONCE; that frees space a stuffed DB
    //      wouldn't give an overwrite, so a save can finally land.
    if (!(await tryStage())) {
      await emergencyReclaimDiskSpace(slotId);
      if (!(await tryStage())) {
        throw new Error('staged save did not verify (truncated or storage full)');
      }
      lastSaveReclaimedSpace = true;
    }
    // 3. Snapshot the current live save → backup (last-good), but ONLY if it
    //    parses — never promote already-corrupt bytes to the backup.
    try {
      const currentLive = await AsyncStorage.getItem(liveKey);
      if (currentLive) {
        JSON.parse(currentLive);
        await AsyncStorage.setItem(bakKey, currentLive);
      }
    } catch { /* current live is garbage or absent — keep the prior last-good */ }
    // 4. Swap: commit the verified payload to the live key. If a reload
    //    interrupts THIS write, .bak still holds the previous good save and
    //    loadSlot recovers it.
    await AsyncStorage.setItem(liveKey, payload);
    // 5. Cleanup the temp.
    await AsyncStorage.removeItem(tmpKey).catch(() => { /* harmless leftover */ });
    lastSaveWriteError = null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastSaveWriteError = msg.slice(0, 200);
    // eslint-disable-next-line no-console
    console.warn('saveSlot: atomic write failed; live save + backup left intact:', msg);
    await AsyncStorage.removeItem(tmpKey).catch(() => { /* ignore */ });
    return; // do NOT update the index against a save that didn't land
  }

  if (state.player) {
    const summary: SlotSummary = {
      slotId,
      playerName: state.player.name,
      raceId: state.player.raceId,
      locationId: state.player.currentLocationId,
      hp: state.player.hp,
      hpMax: state.player.hpMax,
      dead: state.player.dead === true,
      savedAt: toSave.savedAt,
      createdAt: (await readCreatedAt(slotId)) ?? toSave.savedAt,
      factionId: state.player.factionId,
      mainQuestPhase: state.player.mainQuest?.phase,
      mainQuestCoresRecovered: state.player.mainQuest?.coresRecovered?.length ?? 0,
      // OTA-120 Phase 5 — dog snapshot. Only populate when the dog is
      // actively with the player (not abandoned / dead) so the slot tile
      // doesn't dangle a name the player has already lost.
      dogName: state.player.dog && state.player.dog.status !== 'abandoned' && state.player.dog.status !== 'dead'
        ? state.player.dog.name
        : undefined,
      dogBreed: state.player.dog && state.player.dog.status !== 'abandoned' && state.player.dog.status !== 'dead'
        ? state.player.dog.breed
        : undefined,
    };
    await upsertIndexEntry(summary);
  }
}

async function readCreatedAt(slotId: string): Promise<number | null> {
  const all = await listSlots();
  const found = all.find((s) => s.slotId === slotId);
  return found?.createdAt ?? null;
}

export async function deleteSlot(slotId: string): Promise<void> {
  // OTA-344 — also clear the atomic-write temp + backup keys so a deleted
  // character leaves no recoverable bytes behind.
  await AsyncStorage.multiRemove([
    slotSaveKey(slotId),
    slotSaveTmpKey(slotId),
    slotSaveBakKey(slotId),
    slotLogKey(slotId),
  ]);
  const all = await listSlots();
  await writeIndex(all.filter((s) => s.slotId !== slotId));
  if (activeSlotId === slotId) {
    await setActiveSlot(null);
  }
}

// Serialize writes through a single promise chain. The previous version
// did read-modify-write per call non-awaited, which raced under burst
// load — many entries would silently disappear when several persistEntry
// calls landed within the same JS tick. Now every appendLogToDisk
// chains onto the previous one, so the disk log keeps the whole
// sequence.
let logWriteChain: Promise<void> = Promise.resolve();

// OTA 017 — surface write failures so the player isn't surprised when
// a long feedback note silently fails to land on disk. AsyncStorage
// on Android has a default ~6MB per-key cap; a long enough log can
// hit it. We track the last failure here and let callers report it.
let lastLogWriteError: string | null = null;
export function getLastLogWriteError(): string | null {
  return lastLogWriteError;
}
export function clearLastLogWriteError(): void {
  lastLogWriteError = null;
}

export function appendLogToDisk(line: string): Promise<void> {
  if (!activeSlotId) return Promise.resolve();
  logWriteChain = logWriteChain.then(async () => {
    if (!activeSlotId) return;
    try {
      const key = slotLogKey(activeSlotId);
      const existing = (await AsyncStorage.getItem(key)) ?? '';
      await AsyncStorage.setItem(key, capDiskLog(existing + line + '\n'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('appendLogToDisk failed', e);
      // Stamp the latest failure for the COPY LOG button to surface.
      lastLogWriteError = msg.slice(0, 200);
    }
  });
  return logWriteChain;
}

// Block until every queued log write has flushed to disk. Called by
// LogScreen before reading so COPY ALL captures the entire history,
// not whatever snapshot won the race at unmount time.
export async function flushLogWrites(): Promise<void> {
  await logWriteChain;
}

export async function readFullLog(): Promise<string> {
  if (!activeSlotId) return '';
  // Drain any in-flight writes before reading so the snapshot includes
  // everything that fired up to this moment.
  await logWriteChain;
  try {
    return (await AsyncStorage.getItem(slotLogKey(activeSlotId))) ?? '';
  } catch {
    return '';
  }
}

// Wipe the on-disk log for the active slot. Used by the CLEAR LOG
// button on the exploration screen so the player can submit fresh
// playtest deltas instead of re-sending the same accumulated history
// on every troubleshooting round.
//
// OTA 014 — chain the clear as a NEW step onto logWriteChain so it
// runs FIFO with any concurrent appendLogToDisk calls. The previous
// version awaited the chain then ran removeItem, which left a race:
// an append that queued AFTER the drain await but BEFORE the
// removeItem would land first, leaving a one-line leftover that the
// removeItem then wiped — but a subsequent append would see an empty
// key and start fresh, so the player saw line 1 of the new session
// followed by silence. By chaining the clear, we guarantee atomic
// ordering: every write before the clear is flushed; the clear runs;
// every write after is appended to a fresh (empty) key.
export async function clearActiveSlotLog(): Promise<void> {
  if (!activeSlotId) return;
  logWriteChain = logWriteChain.then(async () => {
    if (!activeSlotId) return;
    try {
      await AsyncStorage.removeItem(slotLogKey(activeSlotId));
    } catch {
      /* ignore — the log will repopulate from the next append */
    }
  });
  await logWriteChain;
}

// Read any slot's log directly without activating it. Used by the title
// screen so a player can copy out a fallen character's history without
// loading the save (dead characters can't be selected). Drains pending
// writes so the snapshot reflects the moment of death.
export async function readSlotLog(slotId: string): Promise<string> {
  await logWriteChain;
  try {
    return (await AsyncStorage.getItem(slotLogKey(slotId))) ?? '';
  } catch {
    return '';
  }
}

// One-shot migration: if a legacy single-slot save exists, fold it into the
// new multi-slot system as a new slot and remove the legacy keys. Returns
// the new slot id if migration ran, null otherwise.
export async function migrateLegacySlotIfPresent(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as SaveState;
    if (!state.player) {
      await AsyncStorage.multiRemove([LEGACY_SAVE_KEY, LEGACY_LOG_KEY]);
      return null;
    }
    const slotId = newSlotId();
    await saveSlot(slotId, state);
    // Move legacy log to the new slot's log key, if any.
    const legacyLog = await AsyncStorage.getItem(LEGACY_LOG_KEY);
    if (legacyLog) {
      await AsyncStorage.setItem(slotLogKey(slotId), legacyLog);
    }
    await AsyncStorage.multiRemove([LEGACY_SAVE_KEY, LEGACY_LOG_KEY]);
    return slotId;
  } catch (e) {
    console.warn('legacy migration failed', e);
    return null;
  }
}

// Compatibility shims so existing call sites that did `loadSave()` /
// `saveGame(state)` against the singleton API still work during the
// transition. They route through the active slot.
export async function loadSave(): Promise<SaveState | null> {
  if (!activeSlotId) return null;
  return loadSlot(activeSlotId);
}

export async function saveGame(state: SaveState): Promise<void> {
  if (!activeSlotId) return;
  await saveSlot(activeSlotId, state);
}

export async function clearSave(): Promise<void> {
  if (!activeSlotId) return;
  await deleteSlot(activeSlotId);
}
