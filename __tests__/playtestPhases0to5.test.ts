jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * ⚠ THE PLAYTEST HARNESS — PHASES 0-5, DRIVEN THROUGH THE REAL STORE.
 *
 * Owner: "lets do active play testing on phases 0-5."
 *
 * Every other suite in this repo tests a UNIT: is the content authored, is the
 * gate correct, does the function return the right thing. OTA-1064's audit is
 * the standing proof that this is not enough — most of what Phase 2 authored
 * was UNREACHABLE and 621 green suites said otherwise, because every one of
 * them asked "is it authored and gated" and none asked "does a route in the
 * shipped game reach it."
 *
 * So this file does not test a unit. It PLAYS THE GAME: starts a character,
 * walks a long run through `travelTo` and `submitPlayerAction` — the same two
 * entry points a thumb drives — and then reads the FEED and asks, of each
 * phase, "did the player actually see this?"
 *
 * ⚠ SEEDED. Math.random is replaced with a deterministic PRNG for the whole
 * run, so a red here is a real regression rather than an unlucky afternoon.
 * The seed is a constant; changing it is changing the playtest.
 *
 * ⚠ AND IT IS DELIBERATELY LOOSE about WHICH lines appear. Asserting exact
 * prose would turn every rewrite red. What it asserts is CHANNELS AND SHAPES:
 * that the story spoke, that somebody remembered the player, that the pressure
 * announced itself, that the Arbiter has an opinion. A phase falling silent is
 * the failure this is built to catch.
 */
jest.setTimeout(180_000);

import { useGameStore } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';
import { dueFork } from '../app/engine/storyForks';
import { stanceOf, regardOf, regardScore, arbiterMemory, dueArbiterBeat } from '../app/engine/arbiterPersona';
import { tideStage, profileOf } from '../app/engine/pressure';
import { isPlayerVisibleChannel } from '../app/engine/gameLog';
import type { LogChannel } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

/** mulberry32 — small, fast, and stable across Node versions. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALK = [
  'tartarian_outskirts', 'mud_seas', 'great_tartary_plains', 'buried_cities',
  'asgardar', 'obsidian_pillars', 'karok_sa', 'endless_stair',
  'yuldra_tul', 'zharaks_teeth', 'ostragar', 'cradle_of_dusk',
  'iskan_veil', 'mud_seas', 'varakush', 'drakova',
];

const ACTIONS = ['look', 'search', 'rest', 'listen', 'look around', 'wait'];

interface Report {
  lines: { channel: string; text: string }[];
  forksAnswered: string[];
  hours: number;
  cores: number;
}

/** ⚠ ONE RUN, shared by every assertion below, because building it is the
 *  expensive part and because every phase should be visible in the SAME
 *  playthrough. A phase that only surfaces in a run tailored to it is a phase
 *  the player will not meet. */
let report: Report;

beforeAll(async () => {
  const realRandom = Math.random;
  Math.random = seeded(20260803);
  try {
    const store = useGameStore.getState();
    await store.startNewGame({
      name: 'Playtest', raceId: 'reclaimer', factionId: 'reclaimers_guild',
      motiveId: 'debt', pressure: 'let_it_come',
    } as never);

    // Clear the tutorial/intro holds — a playtest of the phases is not a
    // playtest of the onboarding, and those three overlays gate everything.
    useGameStore.setState({ tutorialStep: null, storyIntro: null, chapterCard: null });

    const forksAnswered: string[] = [];

    for (let step = 0; step < WALK.length * 4; step++) {
      const s = useGameStore.getState();

      // Answer any open question the way a player would: take the first
      // option. Phase 3's whole point is that the run cannot proceed past it.
      if (s.pendingFork) {
        const opt = s.pendingFork.options[0]!;
        forksAnswered.push(`${s.pendingFork.id}:${opt.id}`);
        s.answerFork(opt.id);
        continue;
      }
      if (s.chapterCard) { useGameStore.setState({ chapterCard: null }); continue; }

      // Walk. Every fourth step moves; the rest are ordinary actions on the
      // tile, which is roughly the real ratio of travel to poking about.
      const p = useGameStore.getState().player!;
      if (step % 4 === 0) {
        useGameStore.getState().travelTo(WALK[(step / 4) % WALK.length]!);
      } else {
        useGameStore.getState().submitPlayerAction(ACTIONS[step % ACTIONS.length]!);
      }

      // Time passes, Cores accumulate, and the world turns against you — the
      // three substrates Phases 3-5 read. Driven directly rather than through
      // combat, because this is a content playtest and a boss fight is a dice
      // roll with a hundred ways to go sideways.
      const now = useGameStore.getState().player!;
      const cores = now.mainQuest?.coresRecovered ?? [];
      useGameStore.setState({
        player: {
          ...now,
          hoursElapsed: (now.hoursElapsed ?? 0) + 14,
          corruption: Math.min(70, (now.corruption ?? 0) + 1),
          mainQuest: now.mainQuest && step > 0 && step % 6 === 0 && cores.length < 9
            ? { ...now.mainQuest, coresRecovered: [...cores, `core_${cores.length}`] }
            : now.mainQuest,
        } as PlayerCharacter,
      });
      void p;
    }

    const st = useGameStore.getState();
    report = {
      lines: st.gameLog.map((e) => ({ channel: String(e.channel), text: String(e.text) })),
      forksAnswered,
      hours: st.player!.hoursElapsed ?? 0,
      cores: st.player!.mainQuest?.coresRecovered?.length ?? 0,
    };
  } finally {
    Math.random = realRandom;
  }
});

const feed = () => report.lines.map((l) => l.text).join('\n');
const onChannel = (ch: string) => report.lines.filter((l) => l.channel === ch);

/** ⚠ WHAT THE PLAYER ACTUALLY READS.
 *
 *  The harness's first run failed twice — prose ratio and repetition — and BOTH
 *  were it grading `arbiter: template (reason=qwen-not-ready)`, a `debug` line
 *  emitted 21 times that no player has ever seen. Instrumentation is not
 *  writing, and a playtest that marks the game down for its own telemetry is
 *  measuring the wrong thing. Routed through the SAME rule AdventureFeed
 *  renders by (engine/gameLog HIDDEN_LOG_CHANNELS) rather than a second copy,
 *  because a second copy drifts the first time either changes. */
const visible = () => report.lines.filter((l) => isPlayerVisibleChannel(l.channel as LogChannel));

describe('playtest — the run itself happened', () => {
  it('the walk produced a real feed, not three lines and a crash', () => {
    expect(report.lines.length).toBeGreaterThan(80);
    expect(report.hours).toBeGreaterThan(400);
  });

  it('nothing in the feed leaks a template slot or an undefined', () => {
    // The single most common way authored content ships broken.
    const bad = visible().filter((l) =>
      /\{[a-zA-Z]+\}/.test(l.text) || /undefined|NaN|\[object Object\]/.test(l.text));
    expect(bad.map((b) => `${b.channel}: ${b.text.slice(0, 90)}`)).toEqual([]);
  });

  it('the Arbiter is not the only voice, and not silent either', () => {
    expect(onChannel('arbiter').length).toBeGreaterThan(0);
    expect(onChannel('world').length + onChannel('system').length).toBeGreaterThan(0);
  });
});

describe('playtest — PHASE 3: the story asked a question', () => {
  it('a fork was actually RAISED during ordinary play', () => {
    // Not "a fork exists and its gate is correct" — that is ota1065's job.
    // This is: walking the world put the card in front of the player.
    expect(report.forksAnswered.length).toBeGreaterThan(0);
  });

  it('...and the answer stuck, so the same question is not asked twice', () => {
    const p = useGameStore.getState().player!;
    const choices = p.storyChoices ?? {};
    expect(Object.keys(choices).length).toBe(report.forksAnswered.length);
    for (const key of report.forksAnswered) {
      const [f, o] = key.split(':') as [string, string];
      expect(choices[f]).toBe(o);
    }
  });

  it('⚠ and no fork the run already answered is still pending', () => {
    const p = useGameStore.getState().player!;
    const due = dueFork(p);
    if (due) expect(Object.keys(p.storyChoices ?? {})).not.toContain(due.id);
  });
});

describe('playtest — PHASE 4: the pressure announced itself', () => {
  it('the tide actually advanced over the run', () => {
    const p = useGameStore.getState().player!;
    expect(tideStage(p.hoursElapsed ?? 0, profileOf(p))).toBeGreaterThan(0);
  });

  it('⚠ and the player was TOLD — pressure they cannot see is the failure mode', () => {
    // The plan's warning about Phase 4 is overtuning; the quieter half is
    // pressure with no line attached, which just reads as the game getting
    // worse for no nameable reason.
    expect(p_tideStageSeen()).toBeGreaterThan(0);
  });

  it('the tier the character was created on is the tier they are playing', () => {
    expect(useGameStore.getState().player!.pressure).toBe('let_it_come');
  });
});

function p_tideStageSeen(): number {
  return useGameStore.getState().player!.tideStageSeen ?? 0;
}

describe('playtest — PHASE 5: the Arbiter became someone', () => {
  it('his arc moved with the Cores over the run', () => {
    const p = useGameStore.getState().player!;
    expect(report.cores).toBeGreaterThan(0);
    expect(stanceOf(p)).not.toBe('witness');
  });

  it('⚠ he SPOKE about it — beats reached the feed, not just the state', () => {
    const p = useGameStore.getState().player!;
    expect((p.arbiterBeatsSeen ?? []).length).toBeGreaterThan(0);
    // ...and every recorded beat corresponds to a line the player saw.
    expect(onChannel('arbiter').length).toBeGreaterThanOrEqual((p.arbiterBeatsSeen ?? []).length);
  });

  it('...one at a time, never two in the same breath', () => {
    // dueArbiterBeat caps itself, but the store is what enforces it in play.
    const p = useGameStore.getState().player!;
    const seen = p.arbiterBeatsSeen ?? [];
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('he has an opinion, and something concrete to name', () => {
    const p = useGameStore.getState().player!;
    const wm = useGameStore.getState().worldMemory;
    expect(typeof regardScore(p, wm)).toBe('number');
    expect(['cold', 'wary', 'even', 'warm', 'kin']).toContain(regardOf(p, wm));
    // The run banked Cores and corruption, so there IS a memory to name.
    expect(arbiterMemory(p, wm).length).toBeGreaterThan(0);
  });

  it('⚠ and he does not run out — a beat is still due or all of them fired', () => {
    // Either shape is healthy; what would be broken is a beat stuck forever
    // because something upstream swallowed it.
    const p = useGameStore.getState().player!;
    const beat = dueArbiterBeat(p, useGameStore.getState().worldMemory);
    const spoken = (p.arbiterBeatsSeen ?? []).length;
    expect(beat !== null || spoken >= 2).toBe(true);
  });
});

describe('playtest — PHASES 0-2: the world remembered the run', () => {
  it('the walk discovered places, and the ledger recorded it', () => {
    const wm = useGameStore.getState().worldMemory;
    expect((wm?.discoveredLocationIds ?? []).length).toBeGreaterThan(3);
  });

  it('the feed reads as prose, not as a debug dump', () => {
    // A cheap but real proxy for "would a player enjoy this": most lines are
    // sentences, and the run is not one system shouting over the others.
    const texts = visible().map((l) => l.text).filter((t) => t.length > 0);
    const sentences = texts.filter((t) => /[.!?]"?$/.test(t.trim()));
    expect(sentences.length / texts.length).toBeGreaterThan(0.5);
  });

  it('⚠ no single line is repeated to death', () => {
    // The failure OTA-1051 and the 500ms debounce exist for. A line the player
    // sees ten times in one walk is a bug regardless of which system emits it.
    const counts = new Map<string, number>();
    for (const l of visible()) counts.set(l.text, (counts.get(l.text) ?? 0) + 1);
    const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(`${worst?.[1]} × ${String(worst?.[0]).slice(0, 70)}`)
      .toBe(`${Math.min(worst?.[1] ?? 0, 12)} × ${String(worst?.[0]).slice(0, 70)}`);
  });

  it('the feed is not dominated by one channel', () => {
    const total = visible().length;
    for (const ch of ['arbiter', 'world', 'system', 'combat']) {
      expect(onChannel(ch).length / total).toBeLessThan(0.85);
    }
  });

  it('the run left a readable trace for the owner', () => {
    // Not an assertion so much as the playtest's actual OUTPUT: a compact
    // digest the owner can eyeball. Printed via process.stdout because
    // console.log is muted for the suite.
    const byCh = new Map<string, number>();
    for (const l of report.lines) byCh.set(l.channel, (byCh.get(l.channel) ?? 0) + 1);
    const p = useGameStore.getState().player!;
    const digest = [
      '',
      '── PLAYTEST DIGEST — phases 0-5 ────────────────────────────',
      `  lines            ${report.lines.length} (${visible().length} the player sees)`,
      `  channels         ${[...byCh.entries()].map(([c, n]) => `${c}:${n}`).join('  ')}`,
      `  hours elapsed    ${report.hours}`,
      `  places found     ${(useGameStore.getState().worldMemory?.discoveredLocationIds ?? []).length}`,
      `  cores            ${report.cores}`,
      `  pressure tier    ${p.pressure}   tide stage told: ${p.tideStageSeen ?? 0}`,
      `  forks answered   ${report.forksAnswered.join(', ') || '(none)'}`,
      `  arbiter stance   ${stanceOf(p)}   regard: ${regardOf(p, useGameStore.getState().worldMemory)} (${regardScore(p, useGameStore.getState().worldMemory)})`,
      `  arbiter beats    ${(p.arbiterBeatsSeen ?? []).join(', ') || '(none)'}`,
      `  he could name    ${arbiterMemory(p, useGameStore.getState().worldMemory).map((m) => m.kind).join(', ') || '(nothing)'}`,
      '────────────────────────────────────────────────────────────',
      '',
    ].join('\n');
    process.stdout.write(digest);
    expect(digest).toContain('PLAYTEST DIGEST');
    void feed;
  });
});
