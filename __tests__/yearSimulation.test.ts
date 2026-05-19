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
  jest.setTimeout(300000);

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

    // Inspect a single log entry and credit any mechanisms whose
    // narration patterns appear in it. Only world / arbiter / combat /
    // reward channels — debug / cognitive / system lines contain raw
    // parser dumps and location descriptions that produce false
    // positives ("on to the Square" should not credit "jump").
    const PATTERNS: Array<[RegExp, string]> = [
      [/\battacks? the\b|\bswing(?:s|ing)? at\b|\bstrike(?:s)? the\b|punches the|kicks the|cleaves the|bashes the|smashes the/i, 'attack'],
      [/dodging stance|drop into a dodging/i, 'dodge'],
      [/raise the .* into a block|defensive stance/i, 'block'],
      [/set your stance.*fight back|Fight Back —/i, 'fight_back'],
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
      [/You equip/i, 'equip'],
      [/You unequip|removed.*from your/i, 'unequip'],
      [/You use the|relic activates|invoked/i, 'use_relic'],
      [/You craft|crafted the|forged the/i, 'craft_named'],
      [/✦.*max|milestone|reached/i, 'milestone'],
      [/Whisper Fog|Etheric Storm|Iron Fog|Ash Storm|Silent Blizzard|Glass Hail/i, 'weather_effect'],
      [/hook resolved|chain advances|the thread continues/i, 'hook_resolve'],
    ];

    const inspectLog = (entry: { text: string; channel: string }) => {
      bump(channelCounts, entry.channel);
      // Skip debug / cognitive / system — those contain raw parser
      // dumps + state diagnostics that match unrelated patterns.
      if (entry.channel === 'debug' || entry.channel === 'cognitive' || entry.channel === 'system') return;
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

    const submit = (text: string) => {
      actionsAttempted++;
      try {
        store.getState().submitPlayerAction(text);
      } catch (e: any) {
        crashes.push(`submitPlayerAction("${text}"): ${e?.message ?? e}`);
      }
      resolveAnyPendingRoll();
    };

    // Known location names to round-robin through for named travel,
    // so encounters fire across many distinct scenes instead of the
    // sim looping the same two map tiles.
    const NAMED_LOCATIONS = [
      'Drakova', 'Varakush', 'Asgardar', 'Tartarian Outskirts',
      'Mud Seas', 'Cradle', 'Aetherstone Spire', 'Silt Wastes',
      'Reclaimers Outpost', 'Borderlands',
    ];
    let locIdx = 0;
    let leftHub = false;

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
      // The Reclaimers Outpost is peaceful — staying inside its room
      // graph forever means we never roll combat / hooks. Issue
      // 'leave outpost' once to drop into the open world.
      if (p.hubRoomId && !leftHub) {
        leftHub = true;
        return 'leave outpost';
      }

      // ─── Combat ─────────────────────────────────────────────────
      if (enemy) {
        const ename = enemy.name;
        // Survival first
        if (hpFrac < 0.18) {
          mark('flee', 'survival flee');
          return 'flee';
        }
        if (hpFrac < 0.4) {
          // Cycle defensive verbs to exercise them
          if (!exercised.has('dodge')) return 'dodge';
          if (!exercised.has('block')) return 'block';
          if (!exercised.has('fight_back')) return 'fight back';
          return Math.random() < 0.5 ? 'dodge' : 'block';
        }
        // Try uncovered combat mechanisms first
        if (!exercised.has('maneuver')) return `grapple ${ename}`;
        if (!exercised.has('aim')) return 'aim';
        if (!exercised.has('reload')) return 'reload';
        if (!exercised.has('quick_fire')) return `snap shot at ${ename}`;
        if (!exercised.has('multi_fire')) return `double tap ${ename}`;
        if (!exercised.has('take_cover')) return 'take cover';
        if (!exercised.has('advance') && scene?.range !== 'arm') return 'advance';
        if (!exercised.has('retreat') && scene?.range !== 'far') return 'step back';
        if (!exercised.has('throw') && p.inventory.length > 0) {
          const it = p.inventory.find((i) => i.kind === 'misc') ?? p.inventory[0]!;
          return `throw ${it.name} at ${ename}`;
        }
        if (!exercised.has('ready')) return 'ready';
        if (!exercised.has('help') && p.companion) return 'help';
        if (!exercised.has('disengage')) return 'disengage';
        if (!exercised.has('dash')) return 'dash forward';
        return `attack ${ename}`;
      }

      // ─── Stamina / HP critical ──────────────────────────────────
      if (p.stamina <= 1) {
        const ration = p.inventory.find((it) =>
          /ration|bread|food|jerky|fruit|meat|fish|stew|berry|mushroom/i.test(it.name),
        );
        if (ration) return `eat ${ration.name}`;
        return 'rest';
      }
      if (hpFrac < 0.55) return 'rest';

      // ─── Vendor present ─────────────────────────────────────────
      if (scene?.vendor) {
        const v = scene.vendor;
        // First: accept a quest if available and not yet tried
        if (!exercised.has('accept_quest') && v.faction) {
          // Try a generic "accept" — handler lists available titles
          // and we can name one next loop; or directly accept a
          // known quest title from the JSON if we know any.
          return 'accept';
        }
        // Buy something — pick the cheapest offer
        if (!exercised.has('buy') && v.offers && v.offers.length > 0 && p.tc >= 10) {
          const cheap = [...v.offers].sort((a: any, b: any) => a.price - b.price)[0];
          if (cheap) return `buy ${cheap.itemName}`;
        }
        // Sell something — pick anything in inventory
        if (!exercised.has('sell') && p.inventory.length > 1) {
          const sellable = p.inventory.find((it) => it.kind !== 'relic') ?? p.inventory[0]!;
          return `sell ${sellable.name}`;
        }
        // Gift for rep
        if (!exercised.has('gift') && p.inventory.length > 0) {
          return `gift ${p.inventory[0]!.name}`;
        }
        // Steal
        if (!exercised.has('steal') && v.offers && v.offers.length > 0) {
          return `steal ${(v.offers[0] as any).itemName}`;
        }
        // Repair (only if anything is damaged)
        if (!exercised.has('repair') && p.tc > 5) {
          return 'repair';
        }
        // Recruit
        if (!exercised.has('recruit') && !p.companion) {
          return `recruit ${v.name}`;
        }
      }

      // ─── Quest turn-in ──────────────────────────────────────────
      if (!exercised.has('turn_in_quest') && (p.activeFactionQuests?.length ?? 0) > 0) {
        const q = p.activeFactionQuests![0]!;
        return `turn in ${q.id}`;
      }

      // ─── Join faction ───────────────────────────────────────────
      if (!exercised.has('join_faction')) {
        // try to join the faction we have highest rep with that we
        // aren't already in
        const standings = p.factionStanding ?? [];
        const eligible = standings.find((st) => st.standing >= 20 && st.factionId !== p.factionId);
        if (eligible) return `join ${eligible.factionId}`;
      }

      // ─── Inventory ──────────────────────────────────────────────
      if (!exercised.has('equip')) {
        const eq = p.inventory.find((it) => it.kind === 'weapon' || it.kind === 'armor');
        if (eq) return `equip ${eq.name}`;
      }
      if (!exercised.has('unequip') && (p.equipped?.main || p.equipped?.off)) {
        return `unequip ${p.equipped.main ?? p.equipped.off}`;
      }
      if (!exercised.has('use_relic')) {
        const relic = p.inventory.find((it) => it.kind === 'relic');
        if (relic) return `use ${relic.name}`;
      }

      // ─── Crafting ───────────────────────────────────────────────
      if (!exercised.has('craft_named')) {
        // Try common starter recipes
        const tries = ['Club', 'Cudgel', 'Stone Spear', 'Patched Cloth'];
        return `craft ${tries[Math.floor(Math.random() * tries.length)]!}`;
      }

      // ─── Hooks ──────────────────────────────────────────────────
      if (scene?.hooks?.length && !exercised.has('hook_resolve')) {
        const hook = scene.hooks[0]!;
        const target = (hook as any).target || (hook as any).name || '';
        if (target) return `investigate ${target}`;
      }

      // ─── Exploration leftovers ──────────────────────────────────
      if (!exercised.has('dig')) return 'dig';
      if (!exercised.has('ask')) return 'where am I';
      if (!exercised.has('investigate') && scene?.ambientNouns?.length) {
        return `inspect ${scene.ambientNouns[0]!}`;
      }
      if (!exercised.has('climb')) return 'climb';
      if (!exercised.has('swim')) return 'swim';
      if (!exercised.has('jump')) return 'jump';
      if (!exercised.has('search_area')) return 'search the rubble';

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
    const MAX_ACTIONS = 16000;
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
      if (lastEnemyName && (!enemyNow || enemyNow.name !== lastEnemyName)) {
        if ((prevEnemyHp ?? 1) <= 0) {
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
    } catch { /* ignore — best-effort artifact */ }

    expect(actionsAttempted).toBeGreaterThan(0);
  });
});
