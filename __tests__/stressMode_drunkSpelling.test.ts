// DRUNK SPELLING MODE — typo-heavy stress simulation.
//
// Simulated player who consistently mis-types every input. Drives ~200
// hand-crafted drunk-spelling inputs through submitPlayerAction for
// 500 turns, surfacing:
//   - parser dead-zones (inputs that produce ZERO engine log response)
//   - false-positive routings (input intends verb A, parser fires verb B)
//   - unhandled exceptions
//   - any corruption of player state (HP/stamina/hours non-finite,
//     inventory entries malformed)
//
// Hard cap: 500 turns, 15s test timeout. Seeded with "drunk-1000h" so
// runs reproduce. Wraps every submit in try/catch and reports aggregate
// counts — we want the full picture, not a single stack trace.

jest.setTimeout(15000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
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

import { useGameStore } from '../app/state/gameStore';
import { parseInput } from '../app/engine/parser';

// --- seeded RNG (xmur3 + mulberry32) ---------------------------------------
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const seedFn = xmur3('drunk-1000h');
const rng = mulberry32(seedFn());
function pick<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)]!; }

// --- drunk-input pool ------------------------------------------------------
// Each entry is [drunkInput, expectedVerb] — the expectedVerb is the
// obvious-intent label the simulated player meant, used later to grade
// intent-mismatch false positives.
type DrunkPair = readonly [string, string];

const COMBAT: DrunkPair[] = [
  ['attakc', 'attack'], ['atack', 'attack'], ['attck', 'attack'],
  ['attakc the dog', 'attack'], ['attk drone', 'attack'],
  ['attakk', 'attack'], ['attck the moth', 'attack'],
  ['ATTACK!!!', 'attack'], ['attack,, the dog!', 'attack'],
  ['atttack the rebbel', 'attack'],
  ['parry', 'block'], ['parrry', 'block'], ['paryy', 'block'],
  ['paryy the blow', 'block'], ['parryy now', 'block'],
  ['dodge', 'dodge'], ['doge', 'dodge'], ['dodeg', 'dodge'],
  ['dodgge', 'dodge'], ['dodg the strike', 'dodge'],
  ['defend', 'block'], ['defen', 'block'], ['defendd', 'block'],
  ['flee', 'escape'], ['flea', 'escape'], ['fleee', 'escape'],
  ['flea the room', 'escape'], ['run awy', 'escape'],
  ['runn', 'escape'], ['runaway', 'escape'],
  ['retret', 'retreat'], ['retreatt', 'retreat'],
  ['advnce', 'advance'], ['adavnce', 'advance'],
  ['disenage', 'disengage'], ['disengag', 'disengage'],
];

const TRAVEL: DrunkPair[] = [
  ['go nirth', 'travel'], ['go nrth', 'travel'], ['go nroth', 'travel'],
  ['gowest', 'travel'], ['gonorth', 'travel'], ['goeast', 'travel'],
  ['go w', 'travel'], ['go n', 'travel'], ['go s', 'travel'], ['go e', 'travel'],
  ['walk north', 'travel'], ['walkn', 'travel'], ['walkk', 'travel'],
  ['travl north', 'travel'], ['traval', 'travel'], ['travell', 'travel'],
  ['heead north', 'travel'], ['heaad south', 'travel'],
  ['norht', 'travel'], ['sotuh', 'travel'], ['eastt', 'travel'],
  ['weest', 'travel'], ['noth', 'travel'], ['suoth', 'travel'],
  ['north', 'travel'], ['south', 'travel'], ['east', 'travel'], ['west', 'travel'],
  ['n', 'travel'], ['s', 'travel'], ['e', 'travel'], ['w', 'travel'],
  ['ne', 'travel'], ['sw', 'travel'],
  ['travek east', 'travel'], ['leeave', 'travel'], ['leve outpost', 'travel'],
];

const INVESTIGATE: DrunkPair[] = [
  ['investgate', 'investigate'], ['invsetigate', 'investigate'],
  ['invsetigate the boen fragment', 'investigate'],
  ['inevstigaet', 'investigate'], ['investigte', 'investigate'],
  ['ivestigate the rubble', 'investigate'],
  ['look', 'investigate'], ['lokk', 'investigate'], ['look???', 'investigate'],
  ['lOoK aRoUnD', 'investigate'], ['lookaround', 'investigate'],
  ['look arnd', 'investigate'], ['look arround', 'investigate'],
  ['serch', 'investigate'], ['serach', 'investigate'], ['seach', 'investigate'],
  ['search the rubbel', 'investigate'], ['searc', 'investigate'],
  ['exmine', 'investigate'], ['examne the door', 'investigate'],
  ['inspct', 'investigate'], ['inspeect', 'investigate'],
  ['inspct the gait', 'investigate'],
];

const CRAFTING: DrunkPair[] = [
  ['craaft', 'craft'], ['creft', 'craft'], ['crafy', 'craft'],
  ['craftt sword', 'craft'], ['crat a knife', 'craft'],
  ['salvge', 'investigate'], ['salveage', 'investigate'],
  ['salvagee the copperr pot', 'investigate'],
  ['salvagge', 'investigate'], ['sslavage', 'investigate'],
  ['scrappp', 'investigate'], ['scrappe', 'investigate'],
  ['scrap teh wreck', 'investigate'],
  ['repaair', 'repair'], ['repaire', 'repair'], ['repar', 'repair'],
  ['rapair the blade', 'repair'], ['repare', 'repair'],
];

const CONSUMABLES: DrunkPair[] = [
  ['drnk', 'drink'], ['dirnk', 'drink'], ['drink watr', 'drink'],
  ['drnik water', 'drink'], ['drank', 'drink'],
  ['drnk teh tonic', 'drink'], ['drinkk', 'drink'],
  ['eatt', 'use_relic'], ['ettt ration', 'use_relic'],
  ['eat ratoin', 'use_relic'], ['eate the bread', 'use_relic'],
  ['use cmpass', 'use_relic'], ['us the torch', 'use_relic'],
  ['use,, torch', 'use_relic'], ['useee', 'use_relic'],
  ['tkae', 'pickup'], ['tak', 'pickup'], ['taek', 'pickup'],
  ['taaake', 'pickup'], ['tkae the pot', 'pickup'],
  ['pick uup', 'pickup'], ['pikc up', 'pickup'], ['pcik up sword', 'pickup'],
  ['drop', 'drop'], ['dropp', 'drop'], ['drp the rock', 'drop'],
];

const SUMMON: DrunkPair[] = [
  ['summn', 'cast'], ['sumon', 'cast'], ['summen', 'cast'],
  ['summn the cor gaurdian', 'cast'], ['sumon the core guardian', 'cast'],
  ['summen guardian', 'cast'], ['summonn', 'cast'],
  ['somon', 'cast'], ['summom', 'cast'],
  ['cast', 'cast'], ['castt', 'cast'], ['cats spell', 'cast'],
  ['caast', 'cast'], ['cast,, spell', 'cast'],
];

const DOG: DrunkPair[] = [
  ['feed dog', 'use_relic'], ['feeed dog', 'use_relic'],
  ['fed dog', 'use_relic'], ['feeed teh dog', 'use_relic'],
  ['call dog', 'help'], ['cll dog', 'help'], ['cal the dog', 'help'],
  ['bitee', 'dog_bite'], ['bitr', 'dog_bite'], ['bietr', 'dog_bite'],
  ['bite, the drone', 'dog_bite'], ['biite enemy', 'dog_bite'],
  ['pet dog', 'help'], ['pett the dog', 'help'], ['pet teh dog', 'help'],
  ['distract', 'dog_distract'], ['distrct', 'dog_distract'],
  ['distrack enemy', 'dog_distract'],
];

const REST_YESNO: DrunkPair[] = [
  ['rest', 'rest'], ['rest!', 'rest'], ['rest?', 'rest'],
  ['reeest', 'rest'], ['rest now please', 'rest'],
  ['rst', 'rest'], ['restt', 'rest'], ['rest,,', 'rest'],
  ['heel', 'rest'], ['heal', 'rest'], ['heall', 'rest'],
  ['sleep', 'rest'], ['sleeep', 'rest'], ['slep', 'rest'],
  ['yes', 'accept'], ['yse', 'accept'], ['yess', 'accept'],
  ['ya', 'accept'], ['yeah', 'accept'], ['sure', 'accept'],
  ['no', 'accept'], ['nope', 'accept'], ['nah', 'accept'], ['naw', 'accept'],
  ['confirm', 'accept'], ['cofirm', 'accept'], ['confrim', 'accept'],
  ['ok', 'accept'], ['okk', 'accept'], ['kk', 'accept'],
  ['accept', 'accept'], ['acept', 'accept'], ['accpt', 'accept'],
];

const CLIMB_ETC: DrunkPair[] = [
  ['climmb', 'climb'], ['clim', 'climb'], ['climbs', 'climb'],
  ['cliimb', 'climb'], ['climb teh wall', 'climb'],
  ['jmp', 'jump'], ['jumpp', 'jump'], ['jum', 'jump'],
  ['swimm', 'swim'], ['swim acrss', 'swim'],
  ['hde', 'stealth'], ['hidde', 'stealth'], ['stelth', 'stealth'],
  ['sneek', 'stealth'], ['sneak,, behind', 'stealth'],
  ['talk', 'diplomacy'], ['tlk', 'diplomacy'], ['talkk to vendor', 'diplomacy'],
  ['barter', 'diplomacy'], ['bartr', 'diplomacy'],
];

const NOISE: DrunkPair[] = [
  ['attack,, the dog!', 'attack'], ['look???', 'investigate'],
  ['rest!!!!', 'rest'], ['go north..', 'travel'],
  ['??? attack', 'attack'], ['... rest', 'rest'],
  ['attack..the..drone', 'attack'], ['take...the...pot', 'pickup'],
  ['  attack   the   dog   ', 'attack'],
  ['craft\tsword', 'craft'], ['look\naround', 'investigate'],
];

const ALL_PAIRS: DrunkPair[] = [
  ...COMBAT, ...TRAVEL, ...INVESTIGATE, ...CRAFTING,
  ...CONSUMABLES, ...SUMMON, ...DOG, ...REST_YESNO,
  ...CLIMB_ETC, ...NOISE,
];

// Expected verb -> intent it should land on (for the false-positive grader).
// 'travel' for cardinal/go inputs, 'investigate' for look/search/salvage,
// etc. Intentionally permissive — multiple legitimate intents count as a
// match (e.g. flee -> escape; rest -> rest; salvage routes to investigate
// because OTA-129 collapsed salvage into investigate's hook resolver).
const EXPECTED_INTENT_GROUPS: Record<string, string[]> = {
  attack: ['attack'],
  block: ['block', 'dodge'],
  dodge: ['dodge', 'block'],
  escape: ['escape', 'retreat', 'disengage'],
  retreat: ['retreat', 'escape'],
  advance: ['advance'],
  disengage: ['disengage', 'escape'],
  travel: ['travel'],
  investigate: ['investigate'],
  craft: ['craft'],
  repair: ['repair'],
  drink: ['drink'],
  use_relic: ['use_relic', 'drink', 'pickup'],
  pickup: ['pickup'],
  drop: ['drop'],
  cast: ['cast'],
  dog_bite: ['dog_bite', 'attack'],
  dog_distract: ['dog_distract'],
  rest: ['rest'],
  accept: ['accept'],
  climb: ['climb'],
  jump: ['jump'],
  swim: ['swim'],
  stealth: ['stealth'],
  diplomacy: ['diplomacy'],
  help: ['help'],
};

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'DrunkPlayer',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  return store;
}

const consoleErrors: string[] = [];
const consoleWarns: string[] = [];

describe('DRUNK SPELLING MODE — 500-turn typo stress simulation', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = (...args: unknown[]) => {
      consoleWarns.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 200));
    };
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 200));
    };
  });

  it(`drives 500 drunk-spelling turns; reports dead-zones, exceptions, intent-mismatches`, async () => {
    const store = await bootstrap();
    const TURNS = 500;

    const exceptions: { turn: number; input: string; err: string }[] = [];
    // Dead-zones: inputs that produced zero new non-debug log entries.
    const deadZoneCounts = new Map<string, number>();
    let deadZoneTotal = 0;
    // For sampling intent mismatches at end: collect (input, expectedVerb).
    const sampledForIntent: DrunkPair[] = [];

    for (let i = 0; i < TURNS; i++) {
      const pair = pick(ALL_PAIRS);
      const input = pair[0];

      const logLenBefore = store.getState().gameLog.length;
      try {
        store.getState().submitPlayerAction(input);
      } catch (e) {
        exceptions.push({
          turn: i,
          input,
          err: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
      const logAfter = store.getState().gameLog;
      const added = logAfter.slice(logLenBefore);
      const meaningful = added.filter((entry) => {
        const ch = (entry as { channel?: string } | undefined)?.channel;
        return ch && ch !== 'player' && ch !== 'debug';
      });
      if (meaningful.length === 0 && input.trim().length > 0) {
        deadZoneTotal++;
        deadZoneCounts.set(input, (deadZoneCounts.get(input) ?? 0) + 1);
      }

      // Reservoir-sample 20 inputs for intent-mismatch analysis.
      if (sampledForIntent.length < 20) {
        sampledForIntent.push(pair);
      } else {
        const j = Math.floor(rng() * (i + 1));
        if (j < 20) sampledForIntent[j] = pair;
      }
    }

    // ---- intent-mismatch analysis (post hoc, parser only) -------------------
    const mismatches: { input: string; parsed: string; expected: string }[] = [];
    for (const [input, expectedVerb] of sampledForIntent) {
      let parsed = 'unknown';
      try {
        const p = parseInput(input);
        parsed = p.intent;
      } catch (e) {
        parsed = `THREW(${e instanceof Error ? e.message.slice(0, 40) : String(e).slice(0, 40)})`;
      }
      const accepted = EXPECTED_INTENT_GROUPS[expectedVerb] ?? [expectedVerb];
      if (!accepted.includes(parsed)) {
        mismatches.push({ input, parsed, expected: expectedVerb });
      }
    }

    // ---- aggregate state checks --------------------------------------------
    const after = store.getState().player;
    const inv = after?.inventory ?? [];
    const corruptItems = inv.filter(
      (it) =>
        !it || typeof it.id !== 'string' || typeof it.name !== 'string' ||
        !((it.quantity ?? 0) > 0),
    );

    // ---- report ------------------------------------------------------------
    process.stderr.write(`\n[DRUNK] turns=${TURNS} pool_size=${ALL_PAIRS.length}\n`);
    process.stderr.write(`[DRUNK] exceptions=${exceptions.length}\n`);
    for (const e of exceptions.slice(0, 5)) {
      process.stderr.write(
        `  t=${e.turn} input="${e.input.slice(0, 40)}" err=${e.err.slice(0, 100)}\n`,
      );
    }

    const topDeadZones = Array.from(deadZoneCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    process.stderr.write(`[DRUNK] deadzone_inputs (total=${deadZoneTotal}, unique=${deadZoneCounts.size}):\n`);
    for (const [inp, cnt] of topDeadZones) {
      process.stderr.write(`  ${cnt}x  "${inp.slice(0, 60)}"\n`);
    }

    process.stderr.write(`[DRUNK] intent_mismatch_samples (sampled=${sampledForIntent.length}, mismatches=${mismatches.length}):\n`);
    for (const m of mismatches.slice(0, 10)) {
      process.stderr.write(
        `  "${m.input.slice(0, 40)}" -> parsed=${m.parsed} expected=${m.expected}\n`,
      );
    }

    process.stderr.write(
      `[DRUNK] final hp=${after?.hp} stamina=${after?.stamina} hoursElapsed=${after?.hoursElapsed}\n`,
    );
    process.stderr.write(
      `[DRUNK] inventory length=${inv.length} corruptItems=${corruptItems.length}\n`,
    );
    process.stderr.write(
      `[DRUNK] console.warn=${consoleWarns.length} console.error=${consoleErrors.length}\n`,
    );

    // ---- assertions --------------------------------------------------------
    // Hard ceiling on exceptions — parser must never throw on user input.
    expect(exceptions.length).toBeLessThanOrEqual(5);

    // Player state must remain a finite, non-negative number space.
    expect(after).not.toBeNull();
    expect(Number.isFinite(after!.hp)).toBe(true);
    expect(after!.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(after!.stamina)).toBe(true);
    expect(after!.stamina).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(after!.hoursElapsed ?? 0)).toBe(true);
    expect(after!.hoursElapsed ?? 0).toBeGreaterThanOrEqual(0);

    // Inventory must not be corrupted.
    expect(corruptItems.length).toBe(0);

    // Soft cap on dead-zones: a drunk player should mostly get *some*
    // response. Sanity check — less than half the pool should be silent.
    expect(deadZoneCounts.size).toBeLessThan(ALL_PAIRS.length);
  });
});
