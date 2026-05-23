// Year-long (or two-year) playthrough simulation. Drives the gameStore
// through ~365–730 in-game days picking rational actions every loop,
// and reports the final stats block. The action picker is coverage-
// driven: it tracks which gameplay mechanisms have actually fired
// (via log inspection) and biases toward unexercised mechanisms when
// the scene context allows it, so a single run exercises as much of
// the engine as possible.
//
// Defensive: every call to submitPlayerAction is wrapped in try/catch,
// every pendingRoll is resolved, and stuck-action detection switches
// verbs after two no-progress turns.

// AsyncStorage is a native module. Mock it before anything else loads.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Native ML runtimes won't load in Jest. Stub them all out.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

type Counter = Record<string, number>;
function bump(c: Counter, key: string, n = 1) {
  c[key] = (c[key] ?? 0) + n;
}
function topN(c: Counter, n: number): Array<[string, number]> {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// The full menu of mechanisms we want a "complete" run to exercise.
// Anything not in this list isn't surfaced in the coverage report;
// anything in it that ends the run untouched flags a gap.
const MECHANISMS = [
  // Combat
  'attack', 'dodge', 'block', 'fight_back', 'flee',
  'advance', 'retreat', 'take_cover', 'aim', 'reload',
  'quick_fire', 'multi_fire', 'maneuver', 'throw',
  // Movement / utility
  'climb', 'swim', 'jump', 'dash', 'disengage',
  'help', 'ready', 'mount',
  // Exploration
  'look', 'search_area', 'investigate', 'dig', 'travel', 'go_dir',
  'rest', 'eat', 'inspect', 'ask',
  // Vendor / social
  'accept_quest', 'turn_in_quest', 'buy', 'sell',
  'gift', 'steal', 'repair', 'recruit', 'join_faction',
  // Inventory
  'equip', 'unequip', 'use_relic', 'craft_named',
  // World systems we want to confirm fire
  'corruption_tick', 'corruption_decay', 'milestone',
  'hook_resolve', 'weather_effect', 'faction_rep_change',
] as const;

describe('Year-long Tartaria Realms playthrough simulation', () => {
  // v2.4.1 (OTA 020) — bumped 300s -> 480s for the 41x41 grid.
  jest.setTimeout(480000);

  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
  });

  it('simulates a year (or two) and reports mechanism coverage', async () => {
    const store = useGameStore;
    await store.getState().hydrate();

    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;

    await store.getState().startNewGame({
      name: 'Yearling',
      raceId: race.id,
      factionId: fac.id,
    });
    store.getState().skipTutorial?.();

    // Telemetry --------------------------------------------------------
    const crashes: string[] = [];
    const slotLoadErrors: string[] = [];
    const channelCounts: Counter = {};
    const killCounts: Counter = {};
    const craftedItems: Counter = {};
    const questsAccepted = new Set<string>();
    const questsCompleted = new Set<string>();
    const exercised = new Set<string>();
    const exerciseSamples: Record<string, string> = {};
    let lastEnemyName: string | null = null;
    let prevEnemyHp: number | null = null;
    /** Last seen milestones.enemiesDefeated — when it ticks, credit
     *  the active enemy. The name-tracking approach in earlier sims
     *  missed kills when the enemy died mid-volley before the next
     *  loop's snapshot. */
    let prevEnemiesDefeated = 0;
    let deaths = 0;
    let resurrections = 0;
    let tcEarned = 0;
    let tcSpent = 0;
    let prevTc = store.getState().player?.tc ?? 0;
    let prevCorruption = 0;
    let prevHoursElapsed = 0;
    let prevLogLen = 0;
    let prevLocationId: string | null = null;
    let prevFactionRep: Record<string, number> = {};
    let stuckCount = 0;
    let actionsAttempted = 0;
    let pendingResolves = 0;
    let dirIdx = 0;
    // ─── Cartographer / Scavenger telemetry ──────────────────────
    /** Unique macro-region locationIds the sim has set foot in.
     *  Counted via player.currentLocationId after each action. */
    const uniqueLocations = new Set<string>();
    /** Sequence of (locationId, dirIssued) pairs we walked. If the
     *  sim later issues the opposite cardinal and lands somewhere
     *  OTHER than the earlier origin, that's a bidirectional break
     *  and gets recorded. */
    const travelSequence: Array<{ from: string; dir: string; to: string }> = [];
    /** Times the sim attempted to interact with an ambient noun the
     *  scene paragraph mentioned. Two counters: attempted (we
     *  issued the verb) vs succeeded (the response was anything
     *  other than the parser's generic refusal lines). */
    let interactionsAttempted = 0;
    let interactionsSucceeded = 0;
    /** Ambient nouns the scene mentioned that we attempted to
     *  interact with and were silently refused — "ghost objects",
     *  text the engine generated but never wired to a verb. */
    const ghostObjects = new Set<string>();
    /** Scenes the Scavenger has already swept (to avoid re-sweeping
     *  the same scene every loop). Keyed by `${locationId}@${microMicroId|''}@${enemiesCount}`. */
    const sweptScenes = new Set<string>();
    /** Pending Scavenger sweep — when set, the picker will pop the
     *  next interact-verb from this list instead of running the
     *  normal mechanism rotation. */
    let scavengerQueue: string[] = [];
    /** Narrative-dissonance flags — current locationId vs. a
     *  keyword in the last world-channel narration that contradicts
     *  it (e.g. location says "Whispering Woods" but text says
     *  "cobblestone streets"). Best-effort heuristic. */
    const narrativeDissonance: string[] = [];
    const directions = ['north', 'east', 'south', 'west'];
    // Fallback rotation when every mechanism has been exercised at
    // least once and there's no in-context priority pick.
    const tacticCycle: string[] = [
      'look',
      'search the ground',
      'inventory',
      'go north',
      'go east',
      'rest',
      'go south',
      'go west',
      'search',
      'look around',
    ];
    let tacticIdx = 0;

    const mark = (mech: string, sample: string) => {
      if (!exercised.has(mech)) {
        exercised.add(mech);
        exerciseSamples[mech] = sample.slice(0, 140);
      }
    };

    // Attempt-count throttling — the picker prioritizes unexercised
    // mechanisms, but if a mechanism's coverage pattern fails to
    // match its actual narration, the picker will retry that
    // mechanism on every loop forever (sim #5 was stuck on
    // `use Aetheric Torch` for thousands of actions). Cap each
    // priority attempt at 3 tries; treat as "tried, move on" past
    // the cap.
    const attempts: Counter = {};
    const tryOnce = (mech: string): boolean => {
      if (exercised.has(mech)) return false;
      if ((attempts[mech] ?? 0) >= 3) return false;
      bump(attempts, mech);
      return true;
    };

    // Inspect a single log entry and credit any mechanisms whose
    // narration patterns appear in it. Only world / arbiter / combat /
    // reward channels — debug / cognitive / system lines contain raw
    // parser dumps and location descriptions that produce false
    // positives ("on to the Square" should not credit "jump").
    const PATTERNS: Array<[RegExp, string]> = [
      [/✓ HIT.*for \d+ damage|hits .* for \d+|deals \d+ damage|drops .* dead|✗ MISS/i, 'attack'],
      [/dodging stance|drop into a dodging|shift your weight, ready to evade/i, 'dodge'],
      [/raise the .* into a block|take a defensive stance|defense [+]\d/i, 'block'],
      [/set your stance|fight back against|Fight Back —|opposed Fighting roll/i, 'fight_back'],
      [/You flee|You break and run|escape attempt|✓ ESCAPE/i, 'flee'],
      [/You advance|You close the gap|moved closer/i, 'advance'],
      [/You step back|opened distance|fell back|backed off/i, 'retreat'],
      [/take cover|You hunker|crouch behind/i, 'take_cover'],
      [/You aim|sight in on|line up your/i, 'aim'],
      [/You reload|fresh magazine|rerack|refill/i, 'reload'],
      [/quick.*fire|snap shot|panic shot/i, 'quick_fire'],
      [/burst fire|double tap|multi shot|rapid fire/i, 'multi_fire'],
      [/\bgrapple\b|\bdisarm\b|\btrip\b|\bshove\b|\bpin\b/i, 'maneuver'],
      [/You throw|You hurl|tossed at|lobbed/i, 'throw'],
      [/You climb|scale the|clamber/i, 'climb'],
      [/You swim|wade into|paddle/i, 'swim'],
      [/You jump|leap toward|hop over|vault over/i, 'jump'],
      [/You dash|sprint forward|hustle|bolt forward/i, 'dash'],
      [/You disengage|peel off|break off|fade back/i, 'disengage'],
      [/You assist|come to help|reinforce/i, 'help'],
      [/You ready|prepare to act|cock the/i, 'ready'],
      [/You mount|saddle/i, 'mount'],
      [/You look around|You glance|scan the/i, 'look'],
      [/area search|You search the/i, 'search_area'],
      [/You investigate|You examine|You inspect/i, 'investigate'],
      [/You dig|excavate|unearth/i, 'dig'],
      [/You make your way to|You travel to/i, 'travel'],
      [/You head .*|step back into|walk out into/i, 'go_dir'],
      [/You rest for|HP recovered|stamina recovered|corruption recovered/i, 'rest'],
      [/You consume|You eat|2d6 → \d+ HP/i, 'eat'],
      [/Arbiter points|Arbiter taps|Arbiter scans|Arbiter gestures/i, 'ask'],
      [/New faction contract/i, 'accept_quest'],
      [/Contract complete|turn in.*delivered|reported back/i, 'turn_in_quest'],
      [/You buy|purchased.*for \d+|paid \d+ TC/i, 'buy'],
      [/You sell|sold .* for|earned \d+ TC/i, 'sell'],
      [/You gift|gave .* to|presented .* to/i, 'gift'],
      [/✓ HIT.*Stealth|✗ CAUGHT|You pocket|You pilfer/i, 'steal'],
      [/You repair|repaired the/i, 'repair'],
      [/joins you|follows you|recruited/i, 'recruit'],
      [/sworn to|pledged to|joined the/i, 'join_faction'],
      [/You equip|equipped to (?:main|off|head|chest|legs|feet|amulet|ring)/i, 'equip'],
      [/You unequip|removed.*from your|set aside what was in your/i, 'unequip'],
      [/You use the|relic activates|invoked|ash burns your throat|breath you spend on this action/i, 'use_relic'],
      [/You craft|crafted the|forged the/i, 'craft_named'],
      [/✦.*max|milestone|reached/i, 'milestone'],
      [/Whisper Fog|Etheric Storm|Iron Fog|Ash Storm|Silent Blizzard|Glass Hail/i, 'weather_effect'],
      [/hook resolved|chain advances|the thread continues/i, 'hook_resolve'],
    ];

    const inspectLog = (entry: { text: string; channel: string }) => {
      bump(channelCounts, entry.channel);
      // Skip debug / cognitive / system / player — those contain raw
      // parser dumps, state diagnostics, AND the player-input echo
      // (which would credit "snap shot" coverage just because the
      // sim TYPED that text, not because the engine narrated it).
      if (entry.channel === 'debug' || entry.channel === 'cognitive'
        || entry.channel === 'system' || entry.channel === 'player') return;
      for (const [re, mech] of PATTERNS) {
        if (re.test(entry.text)) mark(mech, entry.text);
      }
      // Crafted item name capture for the report.
      const m = /(?:You craft|crafted|forged|brewed)\s+(?:an?|the)?\s*([A-Z][a-zA-Z\s]+)/.exec(entry.text);
      if (m) bump(craftedItems, m[1]!.trim());
    };

    const resolveAnyPendingRoll = () => {
      let safety = 0;
      while (store.getState().pendingRolls && safety < 50) {
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep];
        if (!step) {
          store.getState().cancelPendingRolls();
          break;
        }
        const values: number[] = [];
        const count = step.count ?? 1;
        const sides = step.sides ?? 6;
        for (let i = 0; i < count; i++) {
          values.push(1 + Math.floor(Math.random() * sides));
        }
        try {
          store.getState().resolveRollStep(values);
          pendingResolves++;
        } catch (e: any) {
          crashes.push(`resolveRollStep: ${e?.message ?? e}`);
          try { store.getState().cancelPendingRolls(); } catch {}
          break;
        }
        safety++;
      }
      if (safety >= 50) {
        try { store.getState().cancelPendingRolls(); } catch {}
      }
    };

    // Refusal heuristics — if the response matches any of these,
    // count the interaction as "attempted but failed" (the engine
    // refused to route the verb to a real handler).
    const REFUSAL_PATTERNS: RegExp[] = [
      /Arbiter (raises a brow|shrugs|shakes their head|tilts|considers)/i,
      /Nothing in arm's reach/i,
      /I cannot place|I do not have a clean answer/i,
      /you (can't|cannot)\b/i,
      /does not (open|respond|move|answer)/i,
      /no .* on the field|no enemy/i,
    ];

    const submit = (text: string) => {
      actionsAttempted++;
      const sBefore = store.getState();
      const logLenBefore = sBefore.gameLog.length;
      const stamBefore = sBefore.player?.stamina ?? 0;
      const hubBefore = sBefore.player?.hubRoomId ?? null;
      const locBefore = sBefore.player?.currentLocationId ?? null;
      // Detect Scavenger interactions so we can track Attempted vs
      // Succeeded. Match the verbs we use in SCAVENGER_VERBS.
      const isScavengerInteract = /^(inspect|search)\s+\S+/.test(text);
      const interactNoun = isScavengerInteract ? text.split(/\s+/).slice(1).join(' ') : '';

      try {
        store.getState().submitPlayerAction(text);
      } catch (e: any) {
        crashes.push(`submitPlayerAction("${text}"): ${e?.message ?? e}`);
      }
      resolveAnyPendingRoll();
      const sAfter = store.getState();
      const hubAfter = sAfter.player?.hubRoomId ?? null;
      const locAfter = sAfter.player?.currentLocationId ?? null;

      // ─── Cartographer: location set + sequence ────────────────
      if (locAfter) uniqueLocations.add(locAfter);
      if (locBefore && locAfter && locBefore !== locAfter) {
        const dirMatch = /\bgo\s+(north|south|east|west)\b|\btravel\s+(?:to\s+)?(\S+)/i.exec(text);
        const dir = dirMatch?.[1]?.toLowerCase()
          ?? (dirMatch?.[2] ? `to:${dirMatch[2].toLowerCase()}` : 'other');
        travelSequence.push({ from: locBefore, dir, to: locAfter });
      }

      // ─── Scavenger: success vs ghost-object ────────────────────
      if (isScavengerInteract) {
        interactionsAttempted++;
        const newLogs = sAfter.gameLog.slice(logLenBefore);
        const response = newLogs.find((l) => l.channel !== 'player' && l.channel !== 'debug');
        const respText = response?.text ?? '';
        const refused = REFUSAL_PATTERNS.some((r) => r.test(respText));
        if (!refused && respText.length > 0) interactionsSucceeded++;
        else ghostObjects.add(interactNoun);
      }

      // ─── Narrative dissonance check (heuristic) ────────────────
      // If a world-channel line mentions a locale keyword that
      // contradicts the current location's name family, flag it.
      const newWorldLines = sAfter.gameLog.slice(logLenBefore)
        .filter((l) => l.channel === 'world');
      for (const l of newWorldLines) {
        const loc = sAfter.currentScene?.location.name?.toLowerCase() ?? '';
        const txt = l.text.toLowerCase();
        // Cobblestone streets in a Mud Seas / Silt Wastes scene? etc.
        if (/cobblestone street|dungeon wall|throne room|grand stair/i.test(txt)
            && !/cradle|spire|tower|outpost|asgardar|drakova/i.test(loc)) {
          if (narrativeDissonance.length < 20) {
            narrativeDissonance.push(`@${loc}: "${l.text.slice(0, 80)}"`);
          }
        }
      }

      if (actionTrace.length < TRACE_LIMIT) {
        const newLogs = sAfter.gameLog.slice(logLenBefore);
        const response = newLogs.find((l) =>
          l.channel !== 'player' && l.channel !== 'debug',
        );
        const respText = response?.text.slice(0, 100) ?? '(no response)';
        const respChan = response?.channel ?? '-';
        actionTrace.push(
          `[${actionsAttempted}] hub=${hubBefore?.slice(0, 12) ?? '-'}→${hubAfter?.slice(0, 12) ?? '-'} loc=${locBefore?.slice(0, 18) ?? '-'} stam=${stamBefore} "${text}" → [${respChan}] ${respText}`,
        );
      }
    };

    // Known location names to round-robin through for named travel,
    // so encounters fire across many distinct scenes instead of the
    // sim looping the same two map tiles. Reclaimers Outpost is the
    // starting hub — listing it would re-enter hub mode and lock us
    // out of the open world again.
    const NAMED_LOCATIONS = [
      'Drakova', 'Varakush', 'Asgardar', 'Mud Seas',
      'Tartarian Outskirts', 'Cradle', 'Silt Wastes',
      'Borderlands', 'Iron Wastes', 'Glass Hills',
    ];
    let locIdx = 0;
    let leftHub = false;
    // Trace the first N actions to a file so we can debug what the
    // sim is actually doing if coverage stays low.
    const actionTrace: string[] = [];
    const TRACE_LIMIT = 200;

    // Interact verbs the Scavenger sweep tries against each ambient
    // noun. Two verbs per noun per visit — enough to catch ghost
    // objects without hammering the parser.
    const SCAVENGER_VERBS = ['inspect', 'search'];
    // Hard cap on queue length and on total Scavenger interactions
    // per run — sim #7 burned ~3000 actions on Scavenger sweeps
    // alone (174 interactions × pending-roll resolutions), which
    // ate most of the time budget and capped us at Day 10. The
    // ghost-object detection signal is mostly captured in the
    // first ~20 sweeps; beyond that we just want the simulator
    // to keep playing the game.
    const SCAVENGER_MAX_PER_SCENE = 6;
    const SCAVENGER_TOTAL_LIMIT = 80;
    let scavengerTotal = 0;

    // Prime the Scavenger queue when the player has just walked into
    // a peaceful scene with ambient nouns we haven't swept yet.
    const primeScavengerQueue = (scene: any, p: any): void => {
      if (!scene || scene.enemies?.length > 0) return; // combat first
      if (scavengerTotal >= SCAVENGER_TOTAL_LIMIT) return;
      const key = `${scene.location?.id ?? '?'}@${scene.microMicroId ?? ''}@${(scene.ambientNouns ?? []).join('|')}`;
      if (sweptScenes.has(key)) return;
      sweptScenes.add(key);
      const nouns = (scene.ambientNouns ?? []) as string[];
      if (nouns.length === 0) return;
      const q: string[] = [];
      for (const n of nouns.slice(0, 3)) {
        for (const v of SCAVENGER_VERBS) q.push(`${v} ${n}`);
        if (q.length >= SCAVENGER_MAX_PER_SCENE) break;
      }
      scavengerQueue = q.slice(0, SCAVENGER_MAX_PER_SCENE);
    };

    // Action picker: bias toward unexercised mechanisms when context
    // makes them legal; fall back to a balanced rotation otherwise.
    const pickAction = (): string => {
      const s = store.getState();
      const p = s.player;
      const scene = s.currentScene;
      if (!p) return 'look';
      const hpFrac = p.hp / Math.max(1, p.hpMax);
      const enemy = scene && scene.enemies.length > 0
        ? scene.enemies[scene.activeEnemyIdx] ?? scene.enemies[0]
        : null;

      // ─── Exit the hub once so encounters can fire ───────────────
      if (p.hubRoomId && !leftHub) {
        leftHub = true;
        return 'leave outpost';
      }

      // ─── Context-priority: vendor / hook exhaustion (BEFORE scavenger) ───
      // Brief F: when a vendor or unresolved hook is in the scene,
      // halt all other mechanism rotation and exhaust this context
      // before moving on. Vendors and hooks are RARE — when the sim
      // walks past one, it must engage or the run never exercises
      // accept_quest / buy / sell / gift / steal / hook_resolve.
      if (scene?.vendor && !enemy && p.stamina > 2) {
        const v = scene.vendor;
        if (v.faction && tryOnce('accept_quest')) return 'accept';
        if (v.offers && v.offers.length > 0 && p.tc >= 10 && tryOnce('buy')) {
          const cheap = [...v.offers].sort((a: any, b: any) => a.price - b.price)[0];
          if (cheap) return `buy ${cheap.itemName}`;
        }
        if (p.inventory.length > 1 && tryOnce('sell')) {
          const sellable = p.inventory.find((it) => it.kind !== 'relic') ?? p.inventory[0]!;
          return `sell ${sellable.name}`;
        }
        if (p.inventory.length > 0 && tryOnce('gift')) {
          return `gift ${p.inventory[0]!.name}`;
        }
        if (v.offers && v.offers.length > 0 && tryOnce('steal')) {
          return `steal ${(v.offers[0] as any).itemName}`;
        }
        if (p.tc > 5 && tryOnce('repair')) return 'repair';
        if (!p.companion && tryOnce('recruit')) return `recruit ${v.name}`;
        // Vendor exhausted — also try turn-in if the player picked up
        // a quest from this vendor.
        if ((p.activeFactionQuests?.length ?? 0) > 0 && tryOnce('turn_in_quest')) {
          const q = p.activeFactionQuests![0]!;
          return `turn in ${q.id}`;
        }
      }
      if (scene?.hooks?.length && !enemy && p.stamina > 2 && tryOnce('hook_resolve')) {
        const hook = scene.hooks[0]!;
        const target = (hook as any).target || (hook as any).name || (hook as any).kind || '';
        if (target) return `investigate ${target}`;
      }

      // ─── Scavenger sweep: exhaust ambient nouns next ───────────
      // Brief: "Upon entering any new room … the sim must halt
      // travel and execute an exhaustive sweep before moving on."
      // Vendors and hooks already got their turn above; the sweep
      // now picks up the ambient noun pool.
      primeScavengerQueue(scene, p);
      if (scavengerQueue.length > 0 && !enemy && p.stamina > 2) {
        scavengerTotal++;
        return scavengerQueue.shift()!;
      }

      // ─── Combat ─────────────────────────────────────────────────
      if (enemy) {
        const ename = enemy.name;
        // Survival first — flee if HP critical OR if stamina ran
        // out (a 0-stamina player can't attack effectively and was
        // getting stuck in combat indefinitely without flee).
        if (hpFrac < 0.18 || p.stamina <= 0) {
          mark('flee', 'survival flee');
          return 'flee';
        }
        if (hpFrac < 0.4) {
          if (tryOnce('dodge')) return 'dodge';
          if (tryOnce('block')) return 'block';
          if (tryOnce('fight_back')) return 'fight back';
          return Math.random() < 0.5 ? 'dodge' : 'block';
        }
        if (tryOnce('maneuver')) return `grapple ${ename}`;
        if (tryOnce('aim')) return 'aim';
        if (tryOnce('reload')) return 'reload';
        if (tryOnce('quick_fire')) return `snap shot at ${ename}`;
        if (tryOnce('multi_fire')) return `double tap ${ename}`;
        if (tryOnce('take_cover')) return 'take cover';
        if (scene?.range !== 'arm' && tryOnce('advance')) return 'advance';
        if (scene?.range !== 'far' && tryOnce('retreat')) return 'step back';
        if (p.inventory.length > 0 && tryOnce('throw')) {
          const it = p.inventory.find((i) => i.kind === 'misc') ?? p.inventory[0]!;
          return `throw ${it.name} at ${ename}`;
        }
        if (tryOnce('ready')) return 'ready';
        if (p.companion && tryOnce('help')) return 'help';
        if (tryOnce('disengage')) return 'disengage';
        if (tryOnce('dash')) return 'dash forward';
        return `attack ${ename}`;
      }

      // ─── Stamina / HP critical ──────────────────────────────────
      // Rest aggressively — if stamina is below half we can't reliably
      // travel (TRAVEL_MIN_STAMINA = 2), so the sim was getting stuck
      // running out of stamina and never hitting macro travel.
      const stamFrac = p.stamina / Math.max(1, p.staminaMax);
      if (p.stamina <= 2) {
        const ration = p.inventory.find((it) =>
          /ration|bread|food|jerky|fruit|meat|fish|stew|berry|mushroom/i.test(it.name),
        );
        if (ration) return `eat ${ration.name}`;
        return 'rest';
      }
      if (hpFrac < 0.55 || stamFrac < 0.5) return 'rest';

      // (Vendor + hook + quest turn-in moved to context-priority
      // block above so they fire before the Scavenger sweep when
      // available. The exhaustion-by-tryOnce pattern preserves the
      // 3-attempt cap.)

      // ─── Join faction ───────────────────────────────────────────
      if (tryOnce('join_faction')) {
        const standings = p.factionStanding ?? [];
        const eligible = standings.find((st) => st.standing >= 20 && st.factionId !== p.factionId);
        if (eligible) return `join ${eligible.factionId}`;
      }

      // ─── Inventory ──────────────────────────────────────────────
      if (tryOnce('equip')) {
        const eq = p.inventory.find((it) => it.kind === 'weapon' || it.kind === 'armor');
        if (eq) return `equip ${eq.name}`;
      }
      if ((p.equipped?.main || p.equipped?.off) && tryOnce('unequip')) {
        return `unequip ${p.equipped.main ?? p.equipped.off}`;
      }
      if (tryOnce('use_relic')) {
        const relic = p.inventory.find((it) => it.kind === 'relic');
        if (relic) return `use ${relic.name}`;
      }

      // ─── Crafting ───────────────────────────────────────────────
      if (tryOnce('craft_named')) {
        const tries = ['Club', 'Cudgel', 'Stone Spear', 'Patched Cloth'];
        return `craft ${tries[Math.floor(Math.random() * tries.length)]!}`;
      }

      // (Hooks moved to context-priority block above.)

      // ─── Exploration leftovers ──────────────────────────────────
      if (tryOnce('dig')) return 'dig';
      if (tryOnce('ask')) return 'where am I';
      if (scene?.ambientNouns?.length && tryOnce('investigate')) {
        return `inspect ${scene.ambientNouns[0]!}`;
      }
      if (tryOnce('climb')) return 'climb';
      if (tryOnce('swim')) return 'swim';
      if (tryOnce('jump')) return 'jump';
      if (tryOnce('search_area')) return 'search the rubble';

      // Default rotation — bias HEAVILY toward named travel so the
      // sim moves between Locations (each move beginScene rolls
      // weather, hooks, possibly an encounter). Cardinal direction
      // travel only walks the procedural 21x21 grid and doesn't
      // spawn macro-Location-level events.
      const roll = Math.random();
      if (roll < 0.4) {
        const loc = NAMED_LOCATIONS[locIdx % NAMED_LOCATIONS.length]!;
        locIdx++;
        return `travel to ${loc}`;
      }
      if (roll < 0.6) {
        const dir = directions[dirIdx % directions.length]!;
        dirIdx++;
        return `go ${dir}`;
      }
      if (roll < 0.72) return 'rest';
      if (roll < 0.82) return 'search the ground';
      if (roll < 0.9) return 'look';
      return tacticCycle[tacticIdx++ % tacticCycle.length]!;
    };

    // Main loop ---------------------------------------------------------
    // 1 year baseline; extend to 2 if mechanism coverage is incomplete.
    const TARGET_DAY = 365;
    const EXTENDED_DAY = 730;
    const MAX_ACTIONS = 32000;
    let actions = 0;
    let endReason = 'max_actions';
    let targetDay = TARGET_DAY;
    while (actions < MAX_ACTIONS) {
      if (actions % 50 === 0) {
        await new Promise<void>((r) => setImmediate(r));
      }
      actions++;
      const sBefore = store.getState();
      const pBefore = sBefore.player;
      if (!pBefore) {
        endReason = 'no_player';
        break;
      }

      const hoursElapsed = pBefore.hoursElapsed ?? 0;
      const day = Math.floor(hoursElapsed / 24) + 1;
      if (day >= targetDay) {
        // If we hit year 1 with gaps, extend to year 2 to keep trying.
        if (targetDay === TARGET_DAY && exercised.size < MECHANISMS.length) {
          targetDay = EXTENDED_DAY;
        } else {
          endReason = day >= EXTENDED_DAY ? 'reached_730_days' : 'reached_365_days';
          break;
        }
      }

      if (pBefore.dead) {
        deaths++;
        if (sBefore.resurrectionGems > 0) {
          const slotId = sBefore.activeSlotId;
          if (slotId) {
            const ok = await store.getState().resurrectSlot(slotId);
            if (ok) {
              resurrections++;
              await store.getState().loadSlotIntoGame(slotId);
              continue;
            }
          }
        }
        endReason = 'died_no_gems';
        break;
      }

      // Enemy kill detection
      const enemyNow = sBefore.currentScene && sBefore.currentScene.enemies.length > 0
        ? sBefore.currentScene.enemies[sBefore.currentScene.activeEnemyIdx] ?? sBefore.currentScene.enemies[0]
        : null;
      const enemyHpNow = sBefore.currentScene && sBefore.currentScene.enemyHps.length > 0
        ? sBefore.currentScene.enemyHps[sBefore.currentScene.activeEnemyIdx] ?? sBefore.currentScene.enemyHps[0]
        : null;
      // Kill credit — milestones.enemiesDefeated is the canonical
      // source. When it ticks up, credit the enemy that was active
      // when the credit landed. Name-tracking alone missed kills
      // where the enemy died mid-volley and the scene already
      // shifted before the next loop snapshot.
      const curEnemiesDefeated = pBefore.milestones?.enemiesDefeated ?? 0;
      if (curEnemiesDefeated > prevEnemiesDefeated) {
        const credit = lastEnemyName ?? enemyNow?.name ?? 'unknown';
        bump(killCounts, credit);
        prevEnemiesDefeated = curEnemiesDefeated;
      }
      if (lastEnemyName && (!enemyNow || enemyNow.name !== lastEnemyName)) {
        if ((prevEnemyHp ?? 1) <= 0) {
          // Backup credit path — only fires if enemy went to 0 HP
          // and disappeared without the milestone catching it.
          bump(killCounts, lastEnemyName);
        }
      }
      lastEnemyName = enemyNow?.name ?? null;
      prevEnemyHp = enemyHpNow ?? null;

      // Track quests
      for (const id of pBefore.completedFactionQuestIds ?? []) {
        if (!questsCompleted.has(id)) mark('turn_in_quest', id);
        questsCompleted.add(id);
      }
      for (const id of pBefore.activeFactionQuestIds ?? []) {
        if (!questsAccepted.has(id)) mark('accept_quest', id);
        questsAccepted.add(id);
      }
      for (const q of pBefore.activeFactionQuests ?? []) {
        if (!questsAccepted.has(q.id)) mark('accept_quest', q.id);
        questsAccepted.add(q.id);
      }
      for (const id of pBefore.completedHuntIds ?? []) questsCompleted.add(id);
      for (const id of pBefore.completedMysteryIds ?? []) questsCompleted.add(id);
      for (const id of pBefore.completedStorylineIds ?? []) questsCompleted.add(id);

      // TC delta
      if (pBefore.tc > prevTc) tcEarned += pBefore.tc - prevTc;
      else if (pBefore.tc < prevTc) tcSpent += prevTc - pBefore.tc;
      prevTc = pBefore.tc;

      // Corruption delta — mark tick / decay
      const corrNow = pBefore.corruption ?? 0;
      if (corrNow > prevCorruption) mark('corruption_tick', `+${corrNow - prevCorruption}`);
      if (corrNow < prevCorruption) mark('corruption_decay', `-${prevCorruption - corrNow}`);
      prevCorruption = corrNow;

      // Faction rep delta
      for (const st of pBefore.factionStanding ?? []) {
        const prev = prevFactionRep[st.factionId] ?? 0;
        if (st.standing !== prev) {
          mark('faction_rep_change', `${st.factionId}: ${prev}→${st.standing}`);
          prevFactionRep[st.factionId] = st.standing;
        }
      }

      // Milestones — bumped via player.milestones counters
      const ms = pBefore.milestones;
      if (ms && (ms.enemiesDefeated > 0 || ms.travelsCompleted > 0 || ms.checksSucceeded > 0)) {
        mark('milestone', `e${ms.enemiesDefeated}/t${ms.travelsCompleted}/c${ms.checksSucceeded}`);
      }

      // slotLoadError
      if (sBefore.slotLoadError) {
        slotLoadErrors.push(sBefore.slotLoadError);
        store.getState().clearSlotLoadError();
      }

      // Log inspection (mechanism patterns)
      const newLogs = sBefore.gameLog.slice(prevLogLen);
      for (const entry of newLogs) inspectLog(entry);
      prevLogLen = sBefore.gameLog.length;

      // Action selection & stuck detection
      let action = pickAction();
      const sameScene = sBefore.currentScene?.location.id === prevLocationId;
      const sameLog = sBefore.gameLog.length === prevLogLen && actions > 1;
      const sameClock = hoursElapsed === prevHoursElapsed;
      if (sameScene && sameClock && sameLog && !enemyNow) {
        stuckCount++;
        if (stuckCount >= 2) {
          action = tacticCycle[tacticIdx++ % tacticCycle.length]!;
          stuckCount = 0;
        }
      } else {
        stuckCount = 0;
      }
      prevLocationId = sBefore.currentScene?.location.id ?? null;
      prevHoursElapsed = hoursElapsed;

      submit(action);
    }

    // Final stats -------------------------------------------------------
    const sFinal = store.getState();
    const pFinal = sFinal.player;
    const finalHours = pFinal?.hoursElapsed ?? 0;
    const finalDay = Math.floor(finalHours / 24) + 1;

    const tailLogs = sFinal.gameLog.slice(prevLogLen);
    for (const entry of tailLogs) inspectLog(entry);
    for (const id of pFinal?.completedFactionQuestIds ?? []) questsCompleted.add(id);
    for (const id of pFinal?.completedHuntIds ?? []) questsCompleted.add(id);
    for (const id of pFinal?.completedMysteryIds ?? []) questsCompleted.add(id);
    for (const id of pFinal?.completedStorylineIds ?? []) questsCompleted.add(id);

    const factionRep = (pFinal?.factionStanding ?? [])
      .filter((s) => s.standing !== 0)
      .map((s) => `${s.factionId}=${s.standing}`)
      .join(', ');

    const notableItems = (pFinal?.inventory ?? [])
      .slice(0, 10)
      .map((it) => `${it.name}${it.quantity > 1 ? ` x${it.quantity}` : ''}`);

    const exercisedList = MECHANISMS
      .filter((m) => exercised.has(m))
      .map((m) => `  ✓ ${m}: ${exerciseSamples[m] ?? ''}`)
      .join('\n');
    const missingList = MECHANISMS
      .filter((m) => !exercised.has(m))
      .map((m) => `  ✗ ${m}`)
      .join('\n');

    console.log = _origLog;

    // Build the report (also dumped to disk so the full block survives
    // Jest's console truncation).
    const report = `
================ YEAR SIMULATION REPORT ================
End reason:         ${endReason}
Actions attempted:  ${actionsAttempted}
Pending rolls done: ${pendingResolves}
Crashes captured:   ${crashes.length}
slotLoadErrors:     ${slotLoadErrors.length}

Survived:           Day ${finalDay} (${finalHours.toFixed(1)} in-game hours)
Status:             ${pFinal?.dead ? 'DEAD (permadeath)' : 'ALIVE'}
HP:                 ${pFinal?.hp}/${pFinal?.hpMax}
Stamina:            ${pFinal?.stamina}/${pFinal?.staminaMax}
TC current:         ${pFinal?.tc}
TC earned (gross):  ${tcEarned}
TC spent (gross):   ${tcSpent}
Corruption:         ${pFinal?.corruption ?? 0}
Stats:              STR ${pFinal?.stats.strength} DEX ${pFinal?.stats.dexterity} INT ${pFinal?.stats.intelligence} WIS ${pFinal?.stats.wisdom} CHA ${pFinal?.stats.charisma}
Race / Faction:     ${pFinal?.raceId} / ${pFinal?.factionId}
Location:           ${sFinal.currentScene?.location.name ?? pFinal?.currentLocationId ?? '?'}
Deaths/resurrects:  ${deaths} / ${resurrections}

Milestones:         enemies=${pFinal?.milestones?.enemiesDefeated ?? 0}, travels=${pFinal?.milestones?.travelsCompleted ?? 0}, checks=${pFinal?.milestones?.checksSucceeded ?? 0}

Inventory size:     ${pFinal?.inventory.length}
Notable items:      ${notableItems.join(', ') || '(none)'}

Kills (top 5):      ${topN(killCounts, 5).map(([k, v]) => `${k}×${v}`).join(', ') || '(none)'}
Quests accepted:    ${questsAccepted.size}
Quests completed:   ${questsCompleted.size}
Completed list:     ${[...questsCompleted].join(', ') || '(none)'}
Factions joined+rep:${factionRep || '(none)'}

Crafted items:      ${Object.keys(craftedItems).length} unique
                    ${topN(craftedItems, 5).map(([k, v]) => `${k}×${v}`).join(', ') || '(none)'}

Top log channels:   ${topN(channelCounts, 5).map(([k, v]) => `${k}=${v}`).join(', ')}

─── Cartographer ─────────────────────────────────────
Unique macro-regions: ${uniqueLocations.size}
  ${[...uniqueLocations].join(', ') || '(none)'}
Travel transitions:   ${travelSequence.length}
First 6 travels:      ${travelSequence.slice(0, 6).map((t) => `${t.from}→${t.to}(${t.dir})`).join(' | ') || '(none)'}

─── Scavenger ────────────────────────────────────────
Interactions attempted: ${interactionsAttempted}
Interactions succeeded: ${interactionsSucceeded} (${interactionsAttempted ? Math.round(interactionsSucceeded / interactionsAttempted * 100) : 0}%)
Ghost objects:          ${ghostObjects.size}
  ${[...ghostObjects].slice(0, 8).join(', ') || '(none)'}

─── Narrative dissonance flags ────────────────────────
${narrativeDissonance.length > 0 ? narrativeDissonance.slice(0, 5).join('\n') : '(none detected)'}

─── Mechanism coverage: ${exercised.size}/${MECHANISMS.length} ───
${exercisedList}
${missingList ? `\nMissing:\n${missingList}` : ''}

First 5 crashes:    ${crashes.slice(0, 5).join(' | ') || '(none)'}
First 3 slotErrs:   ${slotLoadErrors.slice(0, 3).join(' | ') || '(none)'}
========================================================
`.trim();
    console.log(report);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      fs.writeFileSync('/tmp/tartaria-year-sim-report.txt', report);
      // Trace of the first 200 actions — what the sim issued, the
      // player's stamina + hub + location before each, and the first
      // log line that followed. Critical for diagnosing why coverage
      // gaps exist.
      fs.writeFileSync(
        '/tmp/tartaria-year-sim-trace.txt',
        actionTrace.join('\n'),
      );
    } catch { /* ignore — best-effort artifact */ }

    expect(actionsAttempted).toBeGreaterThan(0);
  });
});
