/**
 * OTA-1394 — SLICE 3 OF THE gameStore SPLIT: slot management.
 *
 * Everything the player does to a SAVED CHARACTER that is not writing one:
 * list them, load one, delete one, resurrect one, import one from another
 * install, abandon the current run, and exit to title.
 *
 * ⚠⚠ WHY THIS SUBSET, AND NOT "THE SAVE CLUSTER".
 *
 * The plan said slice 3 was the rest of the save/system cluster — ten actions,
 * ~1,280 lines. Measuring it first said otherwise. Those ten split into two
 * groups whose dependency sets do not overlap AT ALL:
 *
 *   • these eight (642 lines) reach into the welcome-back beat, patrol
 *     simulation and the memorable-event ledger;
 *   • `hydrate` and `startNewGame` (636 lines) reach into the tutorial, the
 *     scene-intro bank and the narrator.
 *
 * Zero shared unexported dependencies between them. That is not a coincidence of
 * layout — it is two different jobs that happened to be typed next to each other,
 * and moving them as one lump would have produced a slice that needed both sets
 * and therefore explained neither.
 *
 * ⚠⚠ AND THE MEASUREMENT CORRECTED AN EARLIER ONE OF MINE. Slice 1 reported this
 * cluster as carrying EIGHT mutable `let`s. That count came from reading generous
 * line ranges around each action, which swept in neighbouring code. Extracted
 * method by method, the real answer is ONE — `lastWelcomeBackAt` — and its only
 * reads and writes are inside these eight actions, so it moves with them exactly
 * as persist's guard state did. `WELCOME_BACK_MIN_MS` and `WHILE_AWAY_LINES`
 * are the same: declared in gameStore, used nowhere but here.
 *
 * ⚠ THE DEPS OBJECT IS A MEASUREMENT, NOT AN IDEAL. Seven functions are handed
 * in. Some of them — `backfillPlayer`, `migrateLoadedWorldMemory` — arguably
 * belong in a leaf of their own, and may end up there. They are injected rather
 * than moved because moving them is a second refactor, and mixing a move with a
 * move is how a reviewer loses the thread. The size of this object is an honest
 * readout of how coupled this cluster still is; later slices can shrink it.
 *
 * ⚠ WHAT DID NOT CHANGE: eight bodies, same code, same order, same comments.
 */
import { OTA_BUILD_ID } from '../../buildInfo';
import { clearSlotCrash, markSlotLoadDone, markSlotLoadStart } from '../../diagnostics/saveLoadHealth';
import { pick } from '../../engine/rng';
import {
  addResurrectionGems,
  characterSeedOf,
  clearFallenSeed,
  deleteSlot,
  getActiveSlotId,
  listSlots,
  loadSlot,
  newSlotId,
  readFullLog,
  saveSlot,
  setActiveSlot,
} from '../../engine/saveSystem';
import { seamBanner, lastEntryTime } from '../../engine/logSeam'; // OTA-1494
import { findMicroMicroAnywhere } from '../../engine/worldLadder';
import { discoverLocation, emptyMemory, spireMoveNoticeLine, dogRescueAmnesty } from '../../engine/worldMemory';
import { extractAmbientNouns } from '../../engine/ambientNouns';
import { hubRoomFor, hubSkinFactionFor } from '../../engine/hub';
import { findCatalogItem } from '../../engine/crafting';
import { setCanonExtraLocations } from '../../engine/worldMap';
import type { PlayerCharacter, WorldMemory } from '../../engine/types';

/**
 * ⚠ `import type * as` is fully erased at compile time, so this is NOT a runtime
 * cycle — the same reason slices 1 and 2 could name `GameStore`. Using it lets
 * the deps below be typed as `typeof Store.fn`, which means their signatures
 * cannot drift from the real functions: change one in gameStore and this file
 * stops compiling, rather than silently accepting the wrong shape.
 */
import type * as Store from '../gameStore';

type GameStore = Store.GameStore;
type CurrentScene = Store.CurrentScene;
type SetState = (
  partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>),
) => void;

/** The slice's public surface — exactly the store keys this file owns. */
export interface SlotSlice {
  refreshSlots: () => Promise<void>;
  loadSlotIntoGame: (slotId: string) => Promise<void>;
  resurrectSlot: (slotId: string) => Promise<boolean>;
  deleteSlotById: (slotId: string) => Promise<void>;
  importSaveFromText: (text: string) => Promise<{ ok: boolean; error?: string; name?: string }>;
  abandonGame: () => Promise<void>;
  clearSlotLoadError: () => void;
  saveAndExitToTitle: () => Promise<void>;
}

/**
 * ⚠⚠ SEVEN FUNCTIONS HANDED IN, NOT IMPORTED — the rule from slice 1, at the
 * scale where it starts to cost something.
 *
 * All seven are defined in `gameStore.ts`; three of them are even exported. That
 * makes importing them look reasonable and it is still wrong: gameStore imports
 * this file to build the store, so a value import back is a cycle, and a cycle
 * resolves to `undefined` for whichever module the bundler reaches second. The
 * failure would land on `loadSlotIntoGame` — a player tapping their own
 * character — and it would not appear in any test that imports one side.
 */
export interface SlotSliceDeps {
  // ⚠ `arbiterAddress` is NOT here, though the dependency scan flagged it. Its
  // only appearance in these 642 lines is inside a COMMENT explaining that the
  // welcome-back greeting deliberately does NOT use it. An injected dependency
  // nothing calls is a lie about coupling, so it was dropped once the compiler
  // confirmed nothing referenced it.
  backfillPlayer: typeof Store.backfillPlayer;
  maintainPatrols: typeof Store.maintainPatrols;
  migrateLoadedWorldMemory: typeof Store.migrateLoadedWorldMemory;
  recordMemorableEvent: typeof Store.recordMemorableEvent;
  simulatePatrols: typeof Store.simulatePatrols;
  welcomeBackLine: typeof Store.welcomeBackLine;
  // OTA-1558 — "is there a LIVING dog with this player". A raw `player.dog` is
  // truthy for a dead or abandoned one, which is what sealed the rescue quest.
  hasActiveDog: typeof Store.hasActiveDog;
}


/**
 * ⚠ MOVED WITH THE SLICE. All three of these were declared in `gameStore.ts` and
 * read or written ONLY by the eight actions below — checked reference by
 * reference, not assumed. `lastWelcomeBackAt` is a mutable `let`, so it had no
 * choice: you cannot assign to an imported binding, and leaving it behind would
 * have made this file fail to compile rather than fail quietly. That is the
 * property that makes this whole segmentation safe to keep doing.
 */

// OTA 008 — Arbiter welcome-back debounce. Skip the line when the
// player navigates away + back faster than this; first cold-load
// per session always fires (lastWelcomeBackAt is null at boot).
// v2.4.1 (OTA 053) — confirmed by playtester: the "Welcome back,
// friend" line IS the intended save-file re-entry greeting.
// loadSlotIntoGame is the only call site, so a fire here means the
// player deliberately loaded a save. Keep the 60s debounce as the
// OTA 008 safety against accidental double-loads inside the same
// app session.
const WELCOME_BACK_MIN_MS = 60_000;
let lastWelcomeBackAt: number | null = null;

// 2026-05-25 OTA-046 — "while you were away" pool. On slot-load,
// if the elapsed real-time since the last persist is ≥6 hours, one
// of these beats fires between the world / arbiter welcome-back
// lines. Establishes the rhythm that the world breathes when the
// player isn't there. Pool mix:
//   - 4 arbiter recall lines ("I chewed on something...")
//   - 4 world-evolution lines (vendor word-of-mouth, faction drift,
//     whisper aging — narration-only for OTA-046)
//   - 4 vendor-restock teases (generic, since we don't track specific
//     visited vendors yet — surfaces the rhythm)
const WHILE_AWAY_LINES: ReadonlyArray<{ channel: 'arbiter' | 'world'; line: string }> = [
  { channel: 'arbiter', line: `"While you were elsewhere, I kept thinking on something. We'll talk when the road quiets."` },
  { channel: 'arbiter', line: `"A name came back to me in the night-of-your-absence. I'll know it when we meet whoever wears it."` },
  { channel: 'arbiter', line: `"I'm glad you're back. The buried country was patient, but it wasn't quiet."` },
  { channel: 'arbiter', line: `"Word travelled while you were gone. People know you've done what you've done."` },
  { channel: 'world', line: `The wind has shifted while you were away. The Aetheric haze sits a little thicker on the horizon now.` },
  { channel: 'world', line: `Reclaimers have passed through this stretch since you last stood here. Their wheel-marks are fresh in the silt.` },
  { channel: 'world', line: `Mud Monarch heralds left a sigil-mark on a stone you don't remember being marked. The faction is paying attention.` },
  { channel: 'world', line: `Whispers carried while you slept off the world. Something that was rumour the last time you walked here is closer to fact now.` },
  { channel: 'world', line: `Word reaches you: a roadside trader changed routes while you were elsewhere. The next time you cross the right tile, look for a stall you didn't see before.` },
  { channel: 'world', line: `A Forgotten Order pilgrim is said to have asked after you in your absence. They left without saying where they were headed.` },
  { channel: 'world', line: `The Reclaimers' Guild updated its standing-board while you were gone. Your name is on it.` },
  { channel: 'world', line: `The Aetheric grid hum is louder than you remember. Something below has woken or shifted while you were elsewhere.` },
];

export const createSlotSlice = (
  set: SetState,
  get: () => GameStore,
  deps: SlotSliceDeps,
): SlotSlice => ({
  async refreshSlots() {
    const slots = await listSlots();
    set({ slots });
  },

  async loadSlotIntoGame(slotId) {
    set({ slotLoadError: null });
    // Cut the title screen's "Choose your character" line the moment a
    // character is picked. Otherwise it keeps inferring + playing in Kokoro
    // and the "Welcome back" line queues behind it (inference is serialized),
    // which is the multi-second gap before the greeting is spoken.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      void require('../../voice/TTSManager').stopAndClear();
    } catch { /* TTS not loaded yet — fine */ }
    let saved;
    try {
      saved = await loadSlot(slotId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ slotLoadError: `Failed to read save: ${msg}` });
      return;
    }
    if (!saved) {
      set({ slotLoadError: 'No save data found for this character. The slot index may be out of sync with storage.' });
      return;
    }
    if (!saved.player) {
      set({ slotLoadError: 'Save file is missing the character record. Try a refresh, or delete the slot to clear it.' });
      return;
    }
    if (saved.player.dead === true) return; // Dead characters need a Resurrection Gem first.
    // arb38 — drop a "loading this slot" breadcrumb (durably flushed)
    // BEFORE the hydration below. If hydrating a stale cross-version
    // save drives native code into a SIGSEGV/SIGABRT, the process dies
    // before any catch runs and this breadcrumb survives — the next
    // boot reads it and flags this slot so the player gets Retry/Delete
    // instead of an instant re-crash. Cleared on success and in the
    // catch below; only a true native abort leaves it behind.
    await markSlotLoadStart(slotId);
    try {
      await setActiveSlot(slotId);
      const player = deps.backfillPlayer(saved.player);
      // If the save captured the live scene (v1+ saves do, older saves
      // may not), drop the player back into it exactly as it was — no
      // Arbiter rehash, no fresh weather roll, no re-spawned enemies.
      // Resume is player-first: they take the next action.
      let restoredScene = (saved.currentScene ?? null) as CurrentScene | null;
      // OTA-416 — interrupted-death recovery. A crash DURING the death sequence
      // (hp zeroed, but `dead=true` not yet committed) loads an "alive" character
      // at 0 HP. backfillPlayer's guard already restored their HP; here we ALSO
      // drop the scene they died in — e.g. an active Core Guardian fight — so they
      // don't resume one tick from re-death, and we narrate it below as the
      // revival it is rather than a casual "welcome back" (the mismatch the
      // player flagged: a killing blow, then "Welcome back" in the same fight).
      // (`dead === true` is already returned out above, so an alive 0-HP save
      // here is the interrupted-death state.)
      const wasInterruptedDeath = (saved.player.hp ?? 0) <= 0;
      if (wasInterruptedDeath) restoredScene = null;
      // ⚠⚠ OTA-1320 — BACKFILL tileGearNouns ON LEGACY SCENES, OR THE DUPE
      // SURVIVES THE FIX. OTA-1301 makes the cardinal step drop the tile's gear
      // by reading the scene's OWN record — and a save written before that OTA
      // has gear sitting in pinnedAmbientNouns with NO record at all, so the
      // drop filters nothing and the legacy pin rides every step, granting a
      // copy per tile exactly as before. Measured in audit: a pre-1301 save
      // minted 4 copies in 4 steps ON the fixed build. The owner's own live
      // save was in this state when the fix shipped.
      //
      // The step path stays record-driven (its comment forbids catalog-guessing
      // for good reason — a prop that later gains a catalog entry would be
      // mis-sorted forever). HERE the record is genuinely absent and this runs
      // ONCE per legacy save, so deriving it is the only honest option: a pin
      // that resolves to a catalog item is tile gear; water sources and rescue
      // props do not resolve, and keep their pins.
      if (restoredScene && (restoredScene as { tileGearNouns?: string[] }).tileGearNouns === undefined) {
        const pins = restoredScene.pinnedAmbientNouns ?? [];
        (restoredScene as { tileGearNouns?: string[] }).tileGearNouns =
          pins.filter((n) => !!findCatalogItem(n, { aliases: true }));
      }
      // Refresh ambientNouns from the canonical source. Prefer the
      // authored location.interactables list when present; fall back
      // to extractAmbientNouns(description) otherwise. Older saves
      // captured polluted noun lists that would otherwise resurface
      // as Search / Approach chips until beginScene fired again.
      if (restoredScene?.location) {
        const loc = restoredScene.location;
        // Rebuild ambientNouns from the FULL noun stack at this scene:
        // location.interactables + hub-room.interactables (when the
        // player is inside a hub like The Gate / Armory) + the
        // active Micro-Micro room's interactables. Previously this
        // path only restored location.interactables and silently
        // dropped hub-room nouns (rope / lantern / table / etc.).
        // Look-around's cached subset still showed them — but
        // matchAmbientNoun in pickup / approach / salvage missed them
        // because the full pool didn't contain them after load.
        // Playtest log caught this: 'approach rope' bailed and
        // 'take the rope' said the ground was bare.
        const baseNouns = (loc.interactables && loc.interactables.length > 0)
          ? [...loc.interactables]
          : extractAmbientNouns(loc.description);
        const hubRoom = hubRoomFor(player.hubRoomId, hubSkinFactionFor(player.currentLocationId, player.factionId));
        const hubNouns = (hubRoom?.interactables ?? []);
        // Micro-Micro nouns: the scene already carries microMicroId; we
        // resolve via the worldLadder lookup so we mirror beginScene
        // exactly. If the ladder lookup misses, fall through to no
        // micro-micro nouns (older saves before the ladder shipped).
        const ladderTriple = restoredScene.microMicroId
          ? findMicroMicroAnywhere(restoredScene.microMicroId)
          : null;
        const microMicroNouns = ladderTriple?.microMicro
          ? (ladderTriple.microMicro.interactables && ladderTriple.microMicro.interactables.length > 0
              ? [...ladderTriple.microMicro.interactables]
              : extractAmbientNouns(ladderTriple.microMicro.environmental_description))
          : [];
        // OTA 009 — see beginScene comment. Hub interior wins when
        // it has authored interactables; wasteland nouns return when
        // the player leaves the outpost.
        const hubRoomActive = !!player.hubRoomId && hubNouns.length > 0;
        restoredScene.ambientNouns = hubRoomActive
          ? Array.from(new Set([...hubNouns, ...microMicroNouns]))
          : Array.from(new Set([...baseNouns, ...hubNouns, ...microMicroNouns]));
        // 2026-05-25 — union with displayedAmbientNouns so every
        // visible chip stays resolvable after save-restore. The
        // curated climbables/salvageables injected by beginScene's
        // REGRESSION-1 bucket allocation aren't in the base/hub/
        // micro-micro pools we just rebuilt, so without this union
        // a player who taps "tilted forgotten order reliquary" or
        // "half-buried engine chamber scaffolding" — chips that are
        // STILL on screen from the original scene — gets refused by
        // matchAmbientNoun. The chips were persisted in
        // displayedAmbientNouns; we just need ambientNouns to
        // remain a superset of them so the resolver lookup hits.
        if (restoredScene.displayedAmbientNouns && restoredScene.displayedAmbientNouns.length > 0) {
          restoredScene.ambientNouns = Array.from(new Set([
            ...restoredScene.ambientNouns,
            ...restoredScene.displayedAmbientNouns,
          ]));
        }
      }
      // 2026-05-27 OTA-099 → OTA-100 — capture the OTA-applied
      // source build BEFORE the set() so we can log the marker
      // below. OTA-099 read justUpdatedFromBuild but that flag
      // is cleared by the TitleScreen popup dismiss BEFORE the
      // player taps LOAD SLOT, so the capture was always null
      // in practice. OTA-100 added a parallel pendingOtaApplied
      // From flag that the popup doesn't touch; we read THAT
      // one here and clear it in the set below.
      const ota099UpdatedFrom = get().pendingOtaAppliedFrom;
      // OTA-120 — Dog Companion world-memory flag migration. Both
      // default to false on legacy saves so the safety net only
      // engages once the player actually loses a dog in combat.
      const migratedWorldMemory = deps.migrateLoadedWorldMemory(saved.worldMemory);
      set({
        player: { ...player, hasSeenIntro: true },
        worldMemory: migratedWorldMemory,
        gameLog: saved.gameLog,
        currentScreen: 'exploration',
        // OTA-623 — a resumed save is past first-run onboarding. saveAndExitToTitle
        // doesn't clear the tutorial state, and this resume path never restored it,
        // so a save exited MID-tutorial came back with a STALE tutorialStep — which
        // re-showed the SKIP TUTORIAL pill + input locks in a broken post-resume
        // context (the skip button mis-routed to the character screen). Clear the
        // tutorial state on every resume; hasSeenIntro:true above also blocks any
        // re-arm. (A save is only writable after the name beat, so the character
        // always has a name here.)
        tutorialStep: null,
        awaitingTutorialName: false,
        tutorialExploreChosen: false,
        activeSlotId: slotId,
        // arb25 — never resume "inside a building" (building state is transient).
        activeBuildingId: null,
        activeBuildingRoomId: null,
        buildingRevealed: [],
        currentScene: restoredScene,
        pendingRolls: null,
  pendingHookContinue: null,
        // OTA-1018 — a loaded save never reopens the crawl mid-game.
        storyIntro: null,
        chapterCard: null, // OTA-1020 — nor a stale chapter card
        dedicationCard: null,
        pendingFork: null, // OTA-1065 — nor an open question from another run
        // OTA-1022 — a save whose motive was DEALT (backfill guess, never
        // chosen) is owed the one-time picker, right here on load.
        motivePickerPending: player.storyMotiveChosen !== true,

        pendingGolemNaming: false,
        justUpdatedFromBuild: null,
        // OTA-100 — clear pendingOtaAppliedFrom in the same set
        // that fires the debug log below. One marker per
        // upgrade per resume; never refires within a session.
        pendingOtaAppliedFrom: null,
        // 2026-05-25 — preserve wastelandStepsSinceEncounter on
        // restore so a save-load round-trip can't game the encounter
        // gate (was: reset to 0, letting a player save-load to delay
        // a roll by `threshold` steps). The counter is persisted
        // alongside player + worldMemory in the save payload.
        wastelandStepsSinceEncounter: saved.wastelandStepsSinceEncounter ?? 0,
        // OTA 014 — transient flags always reset on slot load. A player
        // who saved at 1 HP with the latch set then re-loaded wouldn't
        // get a fresh warning otherwise.
        lowHpWarned: false,
      });
      // OTA-500 — re-sync the install's canonized locations into the world-map
      // module on load so dynamically-mentioned places stay plotted + routable
      // (the module state is per-JS-process; the registry is the persisted truth).
      setCanonExtraLocations(migratedWorldMemory.canonLocations ?? []);
      // 2026-05-27 OTA-099 — OTA-applied + session-start markers
      // in the log. User asked: "when you update via OTA can a
      // record of that be in the log, but not visible to the
      // player, that way you can tell if I am up to date, and
      // can kind of have a timestamp of the progression."
      // Done via the debug channel so the entry shows up in
      // shared log captures but doesn't surface as world /
      // arbiter narration. Always emit a session-start marker
      // on load (so any log dump can be traced to a build ID);
      // additionally emit an "applied from" marker the first
      // time a slot is loaded after an OTA upgrade.
      try {
        if (ota099UpdatedFrom) {
          get().appendLog(
            'debug',
            `OTA applied: ${ota099UpdatedFrom} → ${OTA_BUILD_ID}.`,
          );
        }
        get().appendLog('debug', `OTA session start: ${OTA_BUILD_ID}.`);
        // ⚠⚠ OTA-1494 — AND SAY WHICH ERA THE LINES BELOW BELONG TO. The
        // owner's iPhone bundle was 987 entries from Aug 9, 22 from Aug 23 and
        // 18 from Aug 24 with no visible seam — which produced a wrong
        // diagnosis within the hour (two-week-old lines read as live
        // behaviour). The banner states the build, the wall clock, and the gap
        // since the previous entry, so no reader can make that mistake again.
        // Async and fire-and-forget: the log read must never delay a slot load.
        void readFullLog()
          .then((existing) => {
            get().appendLog('debug', seamBanner({
              build: OTA_BUILD_ID,
              now: Date.now(),
              previousEntryAt: lastEntryTime(existing),
              appliedFrom: ota099UpdatedFrom ?? null,
            }));
          })
          .catch(() => { /* a missing banner must never cost a load */ });
      } catch { /* hardened: never block slot load on a debug log failure */ }
      // ⚠⚠ OTA-1505 — owner: "make it so my characters and sasmooches
      // characters push the full bundle." If the ledger holds a crash newer
      // than the last one bundled AND this device passes the SEND LOG unlock
      // (verbal/sasmooch names, or the OTA-1490 sticky device flag), the full
      // four-attachment bundle goes out through the OTA-1504 durable pipeline
      // automatically. Players' devices never pass the gate — they keep the
      // privacy-page promise (slim crash records only). Fire-and-forget: the
      // gate checks are two cheap reads on the common path.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ab = require('../../diagnostics/autoBundle') as typeof import('../../diagnostics/autoBundle');
        void ab.maybeAutoQueueCrashBundle(get().player, get().worldMemory)
          .then((line) => { if (line) get().appendLog('debug', line); })
          .catch(() => { /* never a slot-load hazard */ });
      } catch { /* never a slot-load hazard */ }
      // OTA-353 — REMOVED: the one-time faction-catalyst fusion-compensation
      // make-good ("Eternal Dynasty Heir's Aegis"). It was a dev-name-only
      // repayment for the pre-OTA-336 fusion-gate bug; the devs have theirs
      // (worldMemory.fusionCompensationGranted is set on their saves), and the
      // bug it compensated for has been fixed since OTA-336. It was re-firing on
      // any FUTURE dev-named save (observed in a live bug-report load), so per
      // the HANDOFF open issue it's stripped. The dev-name Resurrection-Gem grant
      // (now at new-character creation) + the on-death revive are separate, kept features.
      // Only fall back to beginScene when the save predates scene
      // capture. New saves restore the exact scene above and skip this.
      if (!restoredScene) {
        get().beginScene();
        // OTA-416 — narrate the interrupted-death case as a revival, not silence.
        if (wasInterruptedDeath) {
          const here = get().currentScene?.location?.name ?? 'Tartaria';
          get().appendLog(
            'reward',
            `✦ You claw back from the brink — the Aetherstone hauls the breath back into you. Restored, you stand again in ${here}.`,
            { skipDedup: true },
          );
        }
      } else {
        // Drop a small "back to the world" cue so the player can orient
        // without a fresh narration block dominating the feed. Just the
        // location name and a hint that they're resuming.
        //
        // OTA 008 — same WELCOME_BACK_MIN_MS debounce as the Arbiter
        // line below. The world cue duplicates the same way under
        // rapid screen flips.
        const nowStep = Date.now();
        if (!lastWelcomeBackAt || nowStep - lastWelcomeBackAt > WELCOME_BACK_MIN_MS) {
          get().appendLog(
            'world',
            `You step back into ${restoredScene.location.name}. The world waits for your move.`,
          );
        }
      }
      // 2026-05-25 OTA-046 — "while you were away" beat. If the
      // player's lastSessionEndedAt is ≥6 hours old (real time),
      // surface one line from the WHILE_AWAY_LINES pool between the
      // world cue and the Arbiter welcome. Establishes the rhythm
      // that the world doesn't pause for the player — it has been
      // running while they were gone.
      // ⚠ OTA-1143 — WELCOME BACK ALWAYS WINS. The load beat used to let three
      // arbiter lines stack (this beat when it drew an arbiter line, the OTA-849
      // recap, then the greeting) and the voice read the whole pile (owner: "the
      // arbiter fired 3 lines when I started back in the save file"). The Arbiter
      // now speaks EXACTLY ONCE at load — the named greeting — so this beat draws
      // from the WORLD-channel lines only; the arbiter-channel entries stay in the
      // pool as authored but no longer fire here.
      {
        const livePlayer = get().player;
        const lastEnd = livePlayer?.lastSessionEndedAt;
        const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
        if (lastEnd && Date.now() - lastEnd >= SIX_HOURS_MS) {
          const worldBeats = WHILE_AWAY_LINES.filter((l) => l.channel === 'world');
          const beat = worldBeats[Math.floor(Math.random() * worldBeats.length)]!;
          get().appendLog(beat.channel, beat.line, { skipDedup: true });
        }
      }
      // OTA-1143 — set by the offline-recap block below, consumed by the welcome
      // greeting: the recap rides INSIDE the "Welcome back" quote as a second
      // sentence instead of being its own arbiter line.
      let offlineRecapPending = false;
      // OTA-849 [living world] — the world actually MOVED while you were away. Real
      // time offline is converted into world pulses (bounded, so a month gone isn't
      // chaos); the faction tides + rumours advance for that gap and the Arbiter
      // recaps what shifted. This is what makes "offline" real: come back after a few
      // days and the balance of power has changed without you lifting a finger.
      {
        const livePlayer = get().player;
        const lastEnd = livePlayer?.lastSessionEndedAt;
        const OFFLINE_MS_PER_PULSE = 4 * 60 * 60 * 1000; // one pulse per 4 real hours away
        const OFFLINE_PULSE_CAP = 6;                     // bounded drift
        if (lastEnd && livePlayer) {
          const pulses = Math.min(OFFLINE_PULSE_CAP, Math.floor((Date.now() - lastEnd) / OFFLINE_MS_PER_PULSE));
          if (pulses >= 1) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const factions = require('../../data/factions/factions.json') as import('../../engine/worldPulse').FactionMeta[];
            // OTA-851 — offline advance runs the same VARIED event engine, so a return
            // after days away reads a mix of skirmishes / musters / caravans, not a row
            // of identical surges.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const WE = require('../../engine/worldEvents') as typeof import('../../engine/worldEvents');
            let tides = { ...(get().worldMemory.factionTides ?? {}) };
            const rumors: { text: string; hour: number }[] = [];
            const eventRows: { text: string; hour: number; kind: string }[] = [];
            const seed = Math.floor((get().worldMemory.lastWorldTickHour ?? 0) / 24);
            const nowH = livePlayer.hoursElapsed ?? 0;
            for (let i = 0; i < pulses; i++) {
              const ev = WE.pickWorldEvent({ factions, tides, standings: livePlayer.factionStanding }, seed + i + 1);
              if (!ev) continue;
              tides = WE.applyTideDelta(tides, ev.effect.tideDelta);
              rumors.push({ text: ev.rumor, hour: nowH });
              eventRows.push({ text: ev.rumor, hour: nowH, kind: ev.kind });
            }
            if (rumors.length > 0) {
              set((st) => ({ worldMemory: {
                ...st.worldMemory,
                factionTides: tides,
                worldEvents: [...(st.worldMemory.worldEvents ?? []), ...eventRows].slice(-50),
              } }));
            }
            // OTA-853 — the wars ran too. Advance the roaming-patrol sim for the gap so
            // the World board fills with the clashes / outpost sackings you "missed."
            for (let i = 0; i < pulses; i++) {
              deps.maintainPatrols(get, set, factions, seed + i + 1);
              deps.simulatePatrols(get, set, factions, nowH, seed + i + 1);
            }
            if (rumors.length > 0 || (get().worldMemory.patrols ?? []).length > 0) {
              // ⚠ OTA-1143 — no standalone recap line anymore. The recap is folded
              // into the welcome greeting below (welcome back always wins), so the
              // Arbiter's return beat is ONE spoken line, not a stack.
              offlineRecapPending = true;
            }
          }
        }
      }
      // OTA 007 — Welcome-back from the Arbiter on every save load.
      // Playtester: "very simple welcome back from kokoro as soon
      // as you log in. welcome back friend." Lands AFTER the world
      // "you step back into..." line so the Arbiter is responding
      // to the player's return, not pre-announcing the scene.
      //
      // OTA 008 had a 60s debounce so rapid screen-flips didn't re-greet.
      // arb164 — player override: the named welcome is the companion's standing
      // hello and must fire EVERY time they load in ("and always fire"), so the
      // time-debounce is gone. We still skip it on an interrupted-death revival
      // (OTA-416) — that path already greeted the player and "welcome back"
      // reads wrong right after a death; a revival isn't a load. We still stamp
      // lastWelcomeBackAt so the separate world-cue debounce above is unchanged.
      const now = Date.now();
      if (!wasInterruptedDeath) {
        // arb164 — ALWAYS greet by name now (player's non-negotiable). This is
        // the first beat after character select / on every load — a warm, named
        // companion hello, not the 1/3 arbiterAddress roll.
        // OTA-635 — speakFront: the named welcome is the first thing the player
        // should HEAR on entering the world; it jumps to the front of the voice
        // queue (clears any backlog) instead of waiting behind it.
        get().appendLog(
          'arbiter',
          // OTA-1143 — the offline recap (when the world moved) is folded into
          // this one greeting; see welcomeBackLine. Welcome back always wins.
          deps.welcomeBackLine(get().player, { offlineRecap: offlineRecapPending }),
          { skipDedup: true, speakFront: true },
        );
        lastWelcomeBackAt = now;
        // ⚠ OTA-1339 — the one-time "the Spire moved" notice for LEGACY saves that
        // charted the Asgardar climb before the map makeover gave the tower its own
        // outskirts tile. Rides the same load beat as the greeting (OTA-1143: the
        // Arbiter speaks at load, once) on the world channel, and flips its flag
        // immediately so it can never fire twice.
        const spireNotice = spireMoveNoticeLine(get().worldMemory);
        if (spireNotice) {
          get().appendLog('world', spireNotice, { skipDedup: true });
          set((s2) => ({ worldMemory: { ...s2.worldMemory, spireMoveNoticeShown: true } }));
        }
      }
      // ⚠⚠⚠ OTA-1558 — THE ONE-OFF DOG AMNESTY, AND IT SAYS NOTHING.
      //
      // Four gates asked `!player.dog` when they meant "no LIVING dog", and
      // `player.dog` survives a death or an abandonment by design — so any save
      // that lost a dog had the rescue quest sealed shut for good. The gates are
      // fixed now, but a save can also be wedged by state those broken gates
      // already WROTE, and correcting a predicate cannot clear a flag that is
      // already on disk. This sits OUTSIDE the greeting block on purpose: it has
      // to reach every load, not only the ones where the Arbiter speaks.
      //
      // ⚠ SILENT, on the owner's instruction — *"remember silently, we don't want
      // to advertise a fix broke the dog system."* No world line, no arbiter
      // line. The only trace is this debug entry, which lands in the on-disk log
      // where a support question can find it and a player never will.
      {
        const amnesty = dogRescueAmnesty(deps.hasActiveDog(get().player), get().worldMemory);
        if (amnesty) {
          set((s2) => ({ worldMemory: { ...s2.worldMemory, ...amnesty } }));
          get().appendLog('debug', 'dog: rescue amnesty applied at load — no active companion, quest gates reopened');
        }
      }
      // arb38 — hydration completed cleanly. Clear the in-progress
      // breadcrumb so this load isn't mistaken for a crash, and clear
      // any prior crash flag on this slot (it loads fine now). Refresh
      // crashedSlotIds so a previously-flagged tile un-flags live.
      await markSlotLoadDone();
      try {
        const remaining = await clearSlotCrash(slotId);
        set({ crashedSlotIds: remaining });
      } catch { /* best-effort — flag clears on next boot regardless */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // arb38 — a JS-caught error is NOT a native crash; clear the
      // breadcrumb so it isn't counted as one on the next boot. (The
      // slot's existing crash flag, if any, is left intact — only a
      // clean load clears that.)
      await markSlotLoadDone();
      // Roll the active slot back so we don't leave a half-set state.
      // CRITICAL: also clear the in-memory activeSlotId — otherwise the
      // next persist() will write player=null over the slot's storage
      // and corrupt the save we were trying to recover.
      try { await setActiveSlot(null); } catch { /* ignore */ }
      set({
        player: null,
        currentScreen: 'title',
        activeSlotId: null,
        slotLoadError: `Failed to restore character: ${msg}`,
      });
    }
  },

  async resurrectSlot(slotId) {
    if (get().resurrectionGems <= 0) return false;
    const saved = await loadSlot(slotId);
    if (!saved || !saved.player || saved.player.dead !== true) return false;

    // OTA-428 — backfill the saved player FIRST and revive to the BACKFILLED
    // hpMax, not the raw saved one. A cross-version or interrupted-death save
    // can carry a stale/missing hpMax (older saves, or gear-HP not yet baked
    // into the stored number); backfillPlayer is the canonical normalization
    // the regular load path runs, so the revived character wakes at the max the
    // rest of the engine agrees on rather than whatever sat in the dead save.
    const backfilled = deps.backfillPlayer(saved.player);
    const revived: PlayerCharacter = {
      ...backfilled,
      dead: false,
      hp: backfilled.hpMax,
      stamina: backfilled.staminaMax ?? backfilled.stamina,
    };

    // OTA-428 — drop the load-crash breadcrumb BEFORE touching the live scene.
    // Resurrection rehydrates a (possibly stale cross-version) save and runs
    // beginScene exactly like loadSlotIntoGame; if that drives native code into
    // a SIGSEGV/SIGABRT the breadcrumb survives so the next boot offers
    // Retry/Delete instead of an instant re-crash. Cleared on clean completion.
    await markSlotLoadStart(slotId);
    try {
      // OTA-428 — persist the revived character, THEN consume the gem. Ordered
      // so a failed/half-written save never costs the player their gem while
      // still leaving them dead: no save lands, no gem spent. (Pre-OTA the gem
      // was decremented first, so a save failure burned the gem AND the run.)
      await saveSlot(slotId, { ...saved, player: revived });
      const remainingGems = await addResurrectionGems(-1);
      // ⚠ OTA-1320 — the Gem also clears this character's entry on the fallen-seed
      // register (see clearFallenSeed). Without this, a Gem-revived character who
      // later genuinely vanished could never be restored from a backup: the
      // OTA-1311 gate would still call them fallen. Ordered after the gem spend so
      // a failed save (which returns above) never touches the register.
      try { await clearFallenSeed(characterSeedOf(revived)); } catch { /* best-effort */ }
      await setActiveSlot(slotId);
      // OTA-998 — resurrection goes through the SAME load migrations as a normal
      // slot load (it read raw memory before; see migrateLoadedWorldMemory).
      const revivedWorldMemory = deps.migrateLoadedWorldMemory(saved.worldMemory);
      setCanonExtraLocations(revivedWorldMemory.canonLocations ?? []);
      set({
        player: revived,
        worldMemory: revivedWorldMemory,
        gameLog: saved.gameLog,
        currentScreen: 'exploration',
        activeSlotId: slotId,
        resurrectionGems: remainingGems,
        currentScene: null,
        pendingRolls: null,
        pendingHookContinue: null,
        // OTA-1022 — resurrection is a load path too: a dealt-motive save
        // gets its one-time picker here as well.
        motivePickerPending: revived.storyMotiveChosen !== true,
        wastelandStepsSinceEncounter: 0,
        stepsSinceCombat: 0,
      });
      get().beginScene();
      get().appendLog(
        'reward',
        `✦ Resurrection. ${revived.name} returns to Tartaria, restored. The Aetherstone hums in recognition.`,
      );
      deps.recordMemorableEvent(get, set, {
        kind: 'death_revive',
        text: `returned from death by a Resurrection Gem`,
      });
      // Clean completion — drop the breadcrumb and clear any prior crash flag
      // on this slot (it loads fine now).
      await markSlotLoadDone();
      try {
        const remaining = await clearSlotCrash(slotId);
        set({ crashedSlotIds: remaining });
      } catch { /* best-effort — flag clears on next boot regardless */ }
      await get().refreshSlots();
      return true;
    } catch (err) {
      // A JS-caught error is NOT a native crash — clear the breadcrumb so it
      // isn't counted as one next boot. The gem is only spent after the save
      // lands, so an early throw here has not charged the player.
      await markSlotLoadDone();
      const msg = err instanceof Error ? err.message : String(err);
      set({ slotLoadError: `Failed to resurrect character: ${msg}` });
      return false;
    }
  },

  async deleteSlotById(slotId) {
    await deleteSlot(slotId);
    // arb38 — the slot is gone; drop any load-crash flag it carried so
    // a fresh character reusing logic doesn't inherit a stale warning.
    let crashedSlotIds = get().crashedSlotIds;
    try {
      crashedSlotIds = await clearSlotCrash(slotId);
    } catch { /* best-effort */ }
    const slots = await listSlots();
    const activeId = getActiveSlotId();
    set({
      slots,
      activeSlotId: activeId,
      crashedSlotIds,
      // If we just deleted the currently-loaded character, drop player state too.
      ...(get().activeSlotId === slotId
        ? { player: null, gameLog: [], currentScene: null, pendingRolls: null, pendingHookContinue: null, storyIntro: null, chapterCard: null, dedicationCard: null, pendingFork: null, motivePickerPending: false }
        : {}),
    });
  },

  async importSaveFromText(text) {
    // Pull the {player, worldMemory} JSON out of a COPY SAVE export — tolerant of
    // the === markers + the highlights preamble around it, or just the bare JSON.
    const extractJson = (raw: string): string | null => {
      const start = raw.indexOf('{"player"');
      const from = start >= 0 ? start : raw.indexOf('{');
      if (from < 0) return null;
      let depth = 0; let inStr = false; let esc = false;
      for (let i = from; i < raw.length; i++) {
        const ch = raw[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return raw.slice(from, i + 1); }
      }
      return null;
    };
    let parsed: { player?: PlayerCharacter | null; worldMemory?: unknown };
    try {
      const jsonStr = extractJson(text ?? '');
      if (!jsonStr) return { ok: false, error: 'No save data found in the pasted text. Copy a full COPY SAVE export first, then tap Import.' };
      parsed = JSON.parse(jsonStr) as { player?: PlayerCharacter | null; worldMemory?: unknown };
    } catch (e) {
      return { ok: false, error: `Could not parse the save (${e instanceof Error ? e.message : 'invalid JSON'}).` };
    }
    if (!parsed.player) return { ok: false, error: 'That save has no character record.' };
    let player: PlayerCharacter;
    try { player = deps.backfillPlayer(parsed.player); }
    catch (e) { return { ok: false, error: `Save couldn't be loaded (${e instanceof Error ? e.message : 'backfill failed'}).` }; }
    if (player.dead === true) {
      return { ok: false, error: `${player.name || 'That character'} is dead — revive them on the original install first.` };
    }
    const worldMemory = (parsed.worldMemory && typeof parsed.worldMemory === 'object')
      ? (parsed.worldMemory as WorldMemory)
      : discoverLocation(emptyMemory(), player.currentLocationId);
    // Write it to a NEW slot, mirroring the new-character path so it registers in
    // the slot picker and persists.
    const slotId = newSlotId();
    try { await setActiveSlot(slotId); } catch { /* best effort */ }
    set({
      player,
      worldMemory,
      gameLog: [],
      currentScreen: 'exploration',
      currentScene: null,
      pendingRolls: null,
      pendingHookContinue: null,
      pendingGolemNaming: false,
      activeSlotId: slotId,
      slotLoadError: null,
      // Imported mid-game saves have already seen the intro — never re-arm the
      // tutorial for them.
      tutorialStep: null,
      awaitingTutorialName: false,
      tutorialExploreChosen: false,
      activeBuildingId: null,
      activeBuildingRoomId: null,
      buildingRevealed: [],
      callDogModalOpen: false,
    });
    try { get().beginScene({}); } catch { /* scene paints on the next action if this throws */ }
    try { await get().persist(); } catch { /* best effort — state is live regardless */ }
    return { ok: true, name: player.name };
  },

  async abandonGame() {
    // "Abandon" deletes the active slot entirely — keeps the slot list
    // clean. Use saveAndExitToTitle() if you want to keep the character.
    const activeId = get().activeSlotId;
    if (activeId) {
      await deleteSlot(activeId);
    }
    const slots = await listSlots();
    set({
      player: null,
      worldMemory: emptyMemory(),
      gameLog: [],
      currentScene: null,
      pendingRolls: null,
  pendingHookContinue: null,
      storyIntro: null, // OTA-1018
      chapterCard: null, // OTA-1020
      dedicationCard: null,
  pendingFork: null, // OTA-1065
      motivePickerPending: false, // OTA-1022
      currentScreen: 'title',
      activeSlotId: null,
      slots,
    });
  },

  clearSlotLoadError() {
    set({ slotLoadError: null });
  },

  async saveAndExitToTitle() {
    // 2026-05-26 OTA-052 — silence the Arbiter the instant the player
    // taps Save & Exit. Was: the world screen exited to the title
    // while a mid-stream Arbiter line kept reading aloud from the
    // background. stopAndClear() stops BOTH engines (system TTS via
    // Speech.stop() AND Kokoro via piperStopAndClear()) and drains
    // the queue, so any queued sentences also stop instead of
    // bleeding over onto the title screen. Wrapped in try/catch so a
    // platform that hasn't loaded the TTS module (tests, server-side)
    // doesn't crash the exit path.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { stopAndClear } = require('../../voice/TTSManager');
      stopAndClear();
    } catch { /* TTSManager not loaded (e.g. in tests) — non-fatal */ }
    await get().persist();
    // Keep the active slot pointer set so resume can pick it back up, but
    // refresh the slot index so the title list reflects the latest summary.
    const slots = await listSlots();
    // OTA-623 — also drop any in-progress tutorial state on the way out, so the
    // title screen (and the next resume) never inherit a stale mid-tutorial step.
    set({ slots, currentScreen: 'title', tutorialStep: null, awaitingTutorialName: false, tutorialExploreChosen: false });
    // OTA 014 — reset the welcome-back debounce latch on exit so the
    // next resume gets a fresh Arbiter greeting. Without this, a
    // player who quickly saved-and-exited then resumed wouldn't hear
    // the welcome because the 60s debounce was still locked.
    lastWelcomeBackAt = null;
  },
});
