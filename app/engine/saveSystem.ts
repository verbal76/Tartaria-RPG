import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FallenGearPiece, SaveState } from './types';
import { capDiskLog } from './diskLogCap';
// OTA-1178 — import path trims like the store's persist path does; saveSlot does not.
import { trimSaveStateToFit } from './saveTrim';

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
  /** ⚠⚠ OTA-1311 — the character's stable identity (`player.mapSeed`), minted
   *  once at creation as `name|raceId|factionId|<created-at>`. Carried in the
   *  index so the roster can be checked WITHOUT loading every slot, and carried
   *  inside the save itself so it survives a backup round-trip. Absent on slots
   *  written before this OTA; readers fall back to name+race. */
  characterSeed?: string;
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
  /** OTA-707 — golem companion snapshot, mirroring the dog fields. Only
   *  populated when the save carries a living golem (hp > 0), so the slot tile
   *  shows the whole party at a glance and never dangles a crumbled golem. */
  golemName?: string;
  golemKind?: string;
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
  // OTA-461 — one-time test-supply gift for the dev character "Verbal".
  // Slot keys that have already received the playtest kit (first aid /
  // rations / dog jerky / fungus / water). Idempotent per slot so a
  // resume never restacks it.
  testGiftGrantedSlots?: string[];
  // OTA-845 [The Fallen] — install-wide roll of dead characters. Every character
  // who falls is appended here (capped, newest last), so a death is never wiped
  // clean: later characters inherit a graveyard of predecessors to remember (and,
  // in future, to encounter in the world). "Losing is fun" — the run ends, the
  // legend persists.
  fallen?: FallenHero[];
  /** ⚠⚠ OTA-1311 — every character seed that has ever died on this install.
   *  Uncapped on purpose: `fallen` above is a capped memorial, and a permission
   *  check that forgets is a permission check that can be waited out. */
  fallenSeeds?: string[];
}

/** OTA-845 — a character who died. Persisted install-wide in the GlobalStash. */
export interface FallenHero {
  name: string;
  raceName: string;
  /** The death-screen epitaph line. */
  epitaph: string;
  /** Where they fell (location name). */
  locationName: string;
  /** Lifetime foes bested. */
  kills: number;
  /** Corruption tier at death (label). */
  corruption: string;
  /** In-game hours survived. */
  hours: number;
  /** Wall-clock death time (for ordering / recency). */
  ts: number;
  /** OTA-975 — display names of the gear they died wearing: the Hollowed
   *  revenant's kit + drop pool. Absent on pre-998 records — the revenant
   *  builder synthesizes a seeded kit instead. */
  gearNames?: string[];
  /** OTA-994 — full copies of the died-in kit (instance stats and all), so the
   *  revenant hands back the REAL gear. Absent on records that predate it. */
  gear?: FallenGearPiece[];
  /** OTA-975 — set once their Hollowed revenant is put to rest. */
  avengedBy?: string;
  avengedTs?: number;
}

const FALLEN_CAP = 25;

/** ⚠⚠ OTA-1311 — A CHARACTER'S STABLE IDENTITY, in one place.
 *
 *  `mapSeed` is minted once at creation (`name|raceId|factionId|<timestamp>`)
 *  and never changes, which makes it the only field that can tell "this is the
 *  same Francis" from "this is another character called Francis". The legacy
 *  fallback matches the one the world-map readers already use, so a save written
 *  before mapSeed existed still resolves to a consistent key. */
export function characterSeedOf(
  p: { mapSeed?: string; name: string; raceId: string; factionId: string },
): string {
  return p.mapSeed ?? `${p.name}|${p.raceId}|${p.factionId}|legacy`;
}

/** ⚠⚠ OTA-1311 — THE ROLL OF THE FALLEN, THE PART THAT MUST NEVER FORGET.
 *
 *  `stash.fallen` is the memorial and it is CAPPED at 25 — by design, it is a
 *  graveyard to read, and old names age out of it. That makes it useless as a
 *  permission check: a character who died twenty-six deaths ago would quietly
 *  fall off the list and become restorable again. So the seeds get their own
 *  uncapped record. They are short strings; a lifetime of them costs nothing
 *  next to one save. */
export async function recordFallenSeed(seed: string): Promise<void> {
  const stash = await loadGlobalStash();
  const have = stash.fallenSeeds ?? [];
  if (have.includes(seed)) return;
  await saveGlobalStash({ ...stash, fallenSeeds: [...have, seed] });
}

/** True when this exact character has died on this install — ever. */
export async function hasFallenSeed(seed: string): Promise<boolean> {
  return ((await loadGlobalStash()).fallenSeeds ?? []).includes(seed);
}

/** ⚠ A RESURRECTION GEM PAYS THE REGISTER OFF. The seed register exists so a
 *  backup cannot undo a death for free; a Gem is the sanctioned, scarce way to
 *  undo one. Leaving the seed registered after a Gem revival meant a resurrected
 *  character who LATER genuinely disappeared could never be restored — the
 *  register still called them fallen. The Gem clears its entry: that death has
 *  been paid for. A later death re-registers it. */
export async function clearFallenSeed(seed: string): Promise<void> {
  const stash = await loadGlobalStash();
  const have = stash.fallenSeeds ?? [];
  if (!have.includes(seed)) return;
  await saveGlobalStash({ ...stash, fallenSeeds: have.filter((x) => x !== seed) });
}

/** OTA-845 — append a fallen character to the install-wide roll (capped). Returns the
 *  new total number of fallen ever recorded within the cap window. */
export async function recordFallen(hero: FallenHero): Promise<number> {
  const stash = await loadGlobalStash();
  const next = [...(stash.fallen ?? []), hero].slice(-FALLEN_CAP);
  await saveGlobalStash({ ...stash, fallen: next });
  return next.length;
}

/** OTA-975 — mark a fallen entry (matched by death ts) put to rest. Install-wide. */
export async function markFallenAvenged(ts: number, by: string): Promise<void> {
  const stash = await loadGlobalStash();
  const next = (stash.fallen ?? []).map((f) => (f.ts === ts ? { ...f, avengedBy: by, avengedTs: Date.now() } : f));
  await saveGlobalStash({ ...stash, fallen: next });
}

/** OTA-994 — pin a SYNTHESIZED (pre-snapshot) revenant kit onto its record the
 *  first time it is generated, so a later catalog edit can never reshuffle the
 *  gear a named fallen wears. Never overwrites a real recorded kit. */
export async function pinFallenGearNames(ts: number, gearNames: string[]): Promise<void> {
  const stash = await loadGlobalStash();
  const next = (stash.fallen ?? []).map((f) =>
    (f.ts === ts && !(f.gearNames && f.gearNames.length > 0) ? { ...f, gearNames } : f));
  await saveGlobalStash({ ...stash, fallen: next });
}

/** OTA-845 — read the roll of the Fallen (newest last). */
export async function loadFallen(): Promise<FallenHero[]> {
  return (await loadGlobalStash()).fallen ?? [];
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
      testGiftGrantedSlots: parsed.testGiftGrantedSlots ?? [],
      fallen: parsed.fallen ?? [],
      fallenSeeds: parsed.fallenSeeds ?? [],
    };
  } catch {
    return { resurrectionGems: 0, endingBadges: [], installSeeded: false, devGemGrantedSlots: [], testGiftGrantedSlots: [] };
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

// OTA-935 — arb89 grantDevGemOnce + OTA-461 grantTestSupplyGiftOnce are RETIRED. The
// OTA-948/949 dev-grant cleanup moved the dev gem + supply kit to the tutorial
// name-commit (creation-only) and removed every load-path grant, which left these
// once-per-slot latch functions with zero callers. The devGemGrantedSlots /
// testGiftGrantedSlots stash FIELDS stay declared for save back-compat — an old
// stash carrying them still loads; nothing writes them anymore.

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
// Exported for the OTA-490 reclaim test (must purge regenerable keys but never a
// live save / .bak / index / active-slot / stash).
export async function emergencyReclaimDiskSpace(slotId: string, currentTmpKey?: string): Promise<void> {
  try { await AsyncStorage.removeItem(slotLogKey(slotId)); } catch { /* ignore */ }
  // Drop THIS write's temp + any legacy single-temp leftover from a prior crash.
  if (currentTmpKey) { try { await AsyncStorage.removeItem(currentTmpKey); } catch { /* ignore */ } }
  try { await AsyncStorage.removeItem(slotSaveTmpKey(slotId)); } catch { /* ignore */ }
  // OTA-490 — DEEP SWEEP. The active slot's copy-log alone often isn't enough:
  // a DB stuffed by OTHER slots' copy-logs, orphaned save temps, the regenerable
  // Qwen synth cache, or the ~190 KB crash-save snapshot will still refuse the
  // stage (the daughter's S26 hit exactly this — FAILED at only 193 KB total).
  // Purge every REGENERABLE key in one pass — NEVER a live save, its `.bak`, the
  // slot index, the active-slot pointer, the `tartaria.global.v2` stash, or any
  // settings. A removeItem reliably frees SQLite pages even when a full DB is
  // refusing every setItem.
  try {
    const keys = await AsyncStorage.getAllKeys();
    const purge = keys.filter((k) => {
      if (k === currentTmpKey) return false;               // we re-stage into it next
      if (k.startsWith('tartaria.gamelog.')) return true;  // every slot's debug copy-log
      if (k.includes('.v2.tmp')) return true;              // orphaned save temps (any slot)
      if (k === 'tartaria.itemSynthCache.v1') return true; // Qwen synth cache — regenerates
      if (k === '@tartaria/lastCrashSave') return true;    // ~190 KB crash snapshot (recovery copy)
      if (k === '@tartaria/lastCrash') return true;        // small crash stage tag
      return false;
    });
    if (purge.length > 0) await AsyncStorage.multiRemove(purge);
  } catch { /* getAllKeys / multiRemove are best-effort */ }
}

// OTA-421 — [audit fix #3] bounded rotating temp-key counter. The old single
// `${slot}.tmp` key meant two concurrent saves to the SAME slot collided: save A
// staged payloadA, save B overwrote the tmp with payloadB, then A's verify read
// payloadB ≠ payloadA → A wrongly concluded "storage full" → emergency-purged the
// copy-log AND logged a phantom `persist FAILED`. Because `void persist()` fires
// back-to-back during fast play, ORDINARY rapid play tripped this. Rotating the
// temp key over a small window (`& 7` = 8 keys) means concurrent writes never share
// one, so each verifies its own bytes — while orphaned temps (from a crash
// mid-stage) stay bounded to ≤8/slot and get reused as the counter cycles. The
// counter resets per process launch, so cross-launch orphans are reused too.
let saveTmpCounter = 0;

export async function saveSlot(slotId: string, state: SaveState): Promise<void> {
  const toSave: SaveState = { ...state, savedAt: Date.now(), version: 1 };
  const payload = JSON.stringify(toSave);
  const tmpKey = `${slotSaveKey(slotId)}.tmp.${(saveTmpCounter++) & 7}`;
  const bakKey = slotSaveBakKey(slotId);
  const liveKey = slotSaveKey(slotId);

  // Stage the payload to the temp key and verify it round-trips byte-for-byte
  // (catches a truncated / quota-capped write BEFORE we touch the live slot).
  // setItem can THROW on a full DB, so guard it — a thrown write is a failed
  // stage, same as a mismatched readback.
  // OTA-490 — capture WHY a stage fails so the device log disambiguates the two
  // very different causes that the old catch-all "(truncated or storage full)"
  // conflated: a setItem THROW = a full SQLite DB (storage full); a readback
  // MISMATCH with a short length = a CursorWindow truncation (the value didn't
  // round-trip). The next failure log now names which, with byte counts.
  let stageReason = '';
  const tryStage = async (): Promise<boolean> => {
    try {
      await AsyncStorage.setItem(tmpKey, payload);
    } catch (e) {
      stageReason = `setItem threw (${e instanceof Error ? e.message : String(e)})`;
      return false;
    }
    let staged: string | null = null;
    try {
      staged = await AsyncStorage.getItem(tmpKey);
    } catch (e) {
      stageReason = `getItem threw (${e instanceof Error ? e.message : String(e)})`;
      return false;
    }
    if (staged === payload) { stageReason = ''; return true; }
    stageReason = `readback mismatch (got ${staged === null ? 'null' : `${staged.length} chars`} vs ${payload.length})`;
    return false;
  };

  // OTA-344 — atomic write: temp → verify → snapshot last-good → swap → cleanup.
  // Never throws (see lastSaveWriteError note above): on any failure the live
  // save and the .bak are left exactly as they were.
  try {
    // 1-2. Stage + verify. OTA-406 — if it fails (storage full), reclaim the
    //      regenerable copy-log and retry ONCE; that frees space a stuffed DB
    //      wouldn't give an overwrite, so a save can finally land.
    if (!(await tryStage())) {
      const preReclaimReason = stageReason;
      await emergencyReclaimDiskSpace(slotId, tmpKey);
      if (!(await tryStage())) {
        throw new Error(
          `staged save did not verify — ${stageReason} [pre-reclaim: ${preReclaimReason}; payload ${Math.round(payload.length / 1024)}KB]`,
        );
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
      characterSeed: characterSeedOf(state.player),
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
      // OTA-707 — golem snapshot. Only when a living golem is bound (hp > 0).
      golemName: state.player.golem && state.player.golem.hp > 0 ? state.player.golem.name : undefined,
      golemKind: state.player.golem && state.player.golem.hp > 0
        ? state.player.golem.kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
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

/** OTA-1178 — restore an exported character. ⚠⚠ ALWAYS A NEW SLOT, NEVER AN
 *  OVERWRITE, and this is the property the whole feature is built around: a
 *  player restoring a backup has already lost something once, and no confirm
 *  dialog is a good enough guard against a mis-tap that would cost them a second
 *  character. There is no overwrite path here, not even opt-in.
 *
 *  ⚠ AND IT VERIFIES INSTEAD OF ASSUMING. `saveSlot` deliberately NEVER THROWS —
 *  its callers `void persist()` fire-and-forget, so it stamps `lastSaveWriteError`
 *  and returns quietly on a failed write. An importer that just awaited it would
 *  report "restored!" over a slot that does not exist, which is precisely the
 *  class of bug this codebase has hunted before: a writer claiming success
 *  without checking. So this reads the character back off disk before it says a
 *  word. */
export async function importSaveAsNewSlot(
  state: SaveState,
): Promise<{ ok: true; slotId: string; trimmed: boolean } | { ok: false; reason: string }> {
  // ⚠⚠ OTA-1311 — RESTORE IS FOR A CHARACTER THAT DISAPPEARED. NOTHING ELSE.
  //
  // Owner, after a mis-tap: *"I accidentally hit restore character when Francis
  // died, and it gave me an alive full health copy of Francis underneath dead
  // Francis. so it's an infinite life glitch."* Exactly so. This function mints
  // a NEW slot and never overwrites — deliberate, OTA-1178, because a player
  // restoring a backup has already lost a character once and a mis-tap must not
  // cost them a second. But nothing ever asked whether the character was LOST or
  // merely DEAD, so a backup taken while alive was a free, repeatable revival —
  // and it bypassed the Resurrection Gem entirely, which is the one sanctioned
  // way back and is scarce on purpose.
  //
  // Owner's rule: *"we should gate restore character behind having an alive one
  // and behind having one on the role of the fallen. it should only be for when
  // a character 'disappears'."* Both gates, in that order:
  //
  //   (1) ALREADY ON THE ROSTER — alive or dead, they are right there. Nothing
  //       disappeared, so there is nothing to restore. This also catches a death
  //       recorded before the seed register existed.
  //   (2) ON THE ROLL OF THE FALLEN — they died here. The way back is a
  //       Resurrection Gem, and a clipboard is not one.
  //
  // ⚠ Checked against the SEED, not the name, so "another character I also
  // called Francis" is unaffected — and checked against the uncapped register
  // rather than the 25-entry memorial, so an old death cannot be waited out.
  const incoming = state.player;
  if (incoming) {
    const seed = characterSeedOf(incoming);
    const roster = await listSlots();
    const onRoster = roster.some((slot) => (
      slot.characterSeed
        ? slot.characterSeed === seed
        // Legacy slots predate the seed; fall back to the pair that identified a
        // character before it existed.
        : slot.playerName === incoming.name && slot.raceId === incoming.raceId
    ));
    if (onRoster) {
      return { ok: false, reason: `${incoming.name} is already among your characters. Restore is for a character that has disappeared — nothing was changed.` };
    }
    if (await hasFallenSeed(seed)) {
      return { ok: false, reason: `${incoming.name} has fallen. A Resurrection Gem brings a fallen Tartarian back; a backup does not. Nothing was changed.` };
    }
  }
  const slotId = newSlotId();
  clearLastSaveWriteError();

  // ⚠ Trim on the way in. `saveSlot` does NOT trim — the store's persist path
  // does (OTA-395/396), so a save arriving through this door would skip it
  // entirely and fail the readback verify on an oversized blob. An import from a
  // device with a bigger storage window is exactly how that happens.
  const trim = trimSaveStateToFit({ ...state, version: 1, savedAt: Date.now() });

  await saveSlot(slotId, trim.state);

  const writeErr = getLastSaveWriteError();
  if (writeErr) {
    clearLastSaveWriteError();
    return { ok: false, reason: `The restored character could not be written to storage — ${writeErr}` };
  }

  // Read it back. Cheap, and it is the difference between reporting what we did
  // and reporting what we hoped.
  const back = await loadSlot(slotId);
  if (!back || !back.player) {
    return { ok: false, reason: 'The restored character did not survive the write. Nothing was changed.' };
  }
  const listed = (await listSlots()).some((s) => s.slotId === slotId);
  if (!listed) {
    // The save landed but the title screen would never show it — worse than a
    // clean failure, because the player would think it worked.
    return { ok: false, reason: 'The character was saved but did not appear in the character list. Nothing was changed.' };
  }

  return { ok: true, slotId, trimmed: trim.trimmed };
}

export async function deleteSlot(slotId: string): Promise<void> {
  // OTA-344 — also clear the atomic-write temp + backup keys so a deleted
  // character leaves no recoverable bytes behind.
  await AsyncStorage.multiRemove([
    slotSaveKey(slotId),
    slotSaveTmpKey(slotId), // legacy single-temp
    // OTA-421 — the rotating temp keys (`.tmp.0`..`.tmp.7`) too.
    ...Array.from({ length: 8 }, (_, i) => `${slotSaveKey(slotId)}.tmp.${i}`),
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

// OTA-1012 — BATCHED. The per-line version did a FULL read-modify-write of the
// capped ~400 KB disk log for EVERY line — and one player action emits
// several lines, so a full log cost megabytes of AsyncStorage bridge traffic
// per action on device. Lines now land in a pending buffer; ONE chain link
// drains the whole buffer per flush (one read + one write per burst). Order
// is preserved (the buffer is drained FIFO into a single join), the cap and
// error stamping are unchanged, and flushLogWrites() still waits out the
// chain — the flush link is scheduled synchronously with the first pending
// line, so the chain always covers every appended line.
let pendingLogLines: string[] = [];
export function appendLogToDisk(line: string): Promise<void> {
  if (!activeSlotId) return Promise.resolve();
  pendingLogLines.push(line);
  // A flush link is already queued and hasn't drained yet — ride along.
  if (pendingLogLines.length > 1) return logWriteChain;
  logWriteChain = logWriteChain.then(async () => {
    const lines = pendingLogLines;
    pendingLogLines = [];
    if (!activeSlotId || lines.length === 0) return;
    try {
      const key = slotLogKey(activeSlotId);
      const existing = (await AsyncStorage.getItem(key)) ?? '';
      await AsyncStorage.setItem(key, capDiskLog(existing + lines.join('\n') + '\n'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('appendLogToDisk failed', e);
      // Stamp the latest failure for the COPY LOG button to surface.
      lastLogWriteError = msg.slice(0, 200);
    }
  });
  return logWriteChain;
}

// ⚠⚠ OTA-1276 — THE LIVE BREADCRUMB, AND WHY IT CANNOT USE THE CHAIN ABOVE.
//
// The owner froze mid-game twice and both times the disk log simply STOPPED —
// and I read those cutoffs as the freeze point. They are not. `appendLogToDisk`
// batches into `pendingLogLines` and drains on a PROMISE CHAIN, and promises are
// serviced by the JS thread. **A wedged JS thread never drains the buffer**, so
// the final lines before a freeze die in memory and never reach disk. The log
// ends at the last successful FLUSH, which can be many actions earlier.
//
// His freeze #2 is what proved the wedge: buttons dead, feed still scrollable.
// In React Native scrolling is native and survives; onPress needs JS. So the JS
// thread is stuck in a loop — which also stops the batch drain, the setTimeout
// freeze sampler AND requestAnimationFrame (a JS timer in RN, JSTimers.js:257),
// which is why "Freeze watch: no stalls seen" printed straight through a freeze.
//
// So this breadcrumb is deliberately NOT batched and NOT chained: one tiny
// single-key write, issued the moment an action starts, with no read-modify-write
// of the 400KB log. It races ahead of the wedge instead of queueing behind it.
// Next boot reads it and can say what the app was ACTUALLY doing last.
const LAST_BREADCRUMB_KEY = '@tartaria/lastBreadcrumb';

export interface LiveBreadcrumb {
  at: number;
  what: string;
  screen?: string;
  room?: string;
  /** ⚠ OTA-1352 — the last checkpoint this activity reached (see
   *  stampBreadcrumbPhase). Absent on crumbs written before the phase system. */
  phase?: string;
  phaseAt?: number;
  phaseDetail?: string;
}

/** Fire-and-forget. Never awaited by callers — a breadcrumb that could block an
 *  action would be a worse bug than the one it documents. */
export function stampLiveBreadcrumb(crumb: LiveBreadcrumb): void {
  try {
    _lastLiveCrumb = crumb;
    void AsyncStorage.setItem(LAST_BREADCRUMB_KEY, JSON.stringify(crumb)).catch(() => { /* ignore */ });
  } catch { /* never let instrumentation break the game */ }
}

// ⚠⚠ OTA-1352 — THE DYING BREATH LEARNS PHASES. The 2026-08-17 freeze receipt
// proved this crumb's limit: it said `action "go west"` and nothing more, which
// cannot tell "died processing that action" from "died half a minute later in
// background work" — the disk log's tail was already dead either way. Each
// checkpoint an action (or a background model job) passes now overwrites the
// SAME crumb with a phase, so the survivor names the last checkpoint reached:
//   received → parsed:<intent> → engine-done → rendered    (an action's life)
//   homework:<job> → homework-done                         (background model work)
// A crumb that survives at `engine-done` but never `rendered` indicts the
// render side; one stuck at `homework:<job>` indicts the background writer; one
// at `parsed` indicts the engine — three different halves of the codebase the
// old crumb could not tell apart. Kept in a module mirror so a phase stamp
// never needs an async read, written through the same unbatched key the boot
// report already trusts.
let _lastLiveCrumb: LiveBreadcrumb | null = null;
let _lastPhaseWriteAt = 0;
export function stampBreadcrumbPhase(phase: string, detail?: string): void {
  try {
    const base: LiveBreadcrumb = _lastLiveCrumb ?? { at: Date.now(), what: '(no action yet)' };
    const now = Date.now();
    // The render phase fires once per React commit; collapse bursts so the
    // instrumentation costs at most a couple of tiny writes per second.
    if (phase === 'rendered' && base.phase === 'rendered' && now - _lastPhaseWriteAt < 500) return;
    _lastLiveCrumb = { ...base, phase, phaseAt: now, phaseDetail: detail };
    _lastPhaseWriteAt = now;
    void AsyncStorage.setItem(LAST_BREADCRUMB_KEY, JSON.stringify(_lastLiveCrumb)).catch(() => { /* ignore */ });
  } catch { /* never let instrumentation break the game */ }
}

export async function readLiveBreadcrumb(): Promise<LiveBreadcrumb | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_BREADCRUMB_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LiveBreadcrumb;
    return typeof p?.at === 'number' && typeof p?.what === 'string' ? p : null;
  } catch { return null; }
}

/** Cleared on an ORDERLY exit (background / save-and-quit). A breadcrumb that
 *  SURVIVES to the next boot therefore means the process died while it was
 *  still live — the signature of the hard freeze + swipe-kill the owner keeps
 *  having to do. Same discipline as arb126's in-flight crash breadcrumbs. */
export async function clearLiveBreadcrumb(): Promise<void> {
  try { await AsyncStorage.removeItem(LAST_BREADCRUMB_KEY); } catch { /* ignore */ }
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
